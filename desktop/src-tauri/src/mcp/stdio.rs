use crate::error::{AppError, AppResult};
use crate::mcp::protocol::{JsonRpcNotification, JsonRpcRequest, JsonRpcResponse};
use crate::security::redaction::SecretRedactor;
use crate::security::sandbox::{build_filtered_env, validate_mcp_executable};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex};

pub struct StdioTransport {
    server_id: String,
    child: Mutex<Option<Child>>,
    stdin: Mutex<ChildStdin>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<JsonRpcResponse>>>>,
    next_id: AtomicU64,
    redactor: Arc<SecretRedactor>,
    timeout: Duration,
}

impl StdioTransport {
    pub async fn spawn<F>(
        server_id: String,
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
        allow_shell_wrappers: bool,
        timeout_secs: u64,
        redactor: Arc<SecretRedactor>,
        on_log: F,
    ) -> AppResult<Self>
    where
        F: Fn(&str, &str) + Send + Sync + 'static,
    {
        validate_mcp_executable(command, allow_shell_wrappers)?;
        let filtered_env = build_filtered_env(env);

        let mut cmd = Command::new(command);
        cmd.args(args)
            .env_clear()
            .envs(filtered_env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        #[cfg(target_os = "windows")]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd.spawn().map_err(|e| {
            AppError::Mcp(redactor.redact(&format!("Failed to spawn MCP command '{command}': {e}")))
        })?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| AppError::Mcp("Failed to open MCP child stdin".into()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Mcp("Failed to open MCP child stdout".into()))?;
        let stderr = child.stderr.take();

        let pending: Arc<Mutex<HashMap<u64, oneshot::Sender<JsonRpcResponse>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let pending_clone = pending.clone();
        let redactor_stdout = redactor.clone();
        let on_log = Arc::new(on_log);
        let on_log_out = on_log.clone();
        let sid_out = server_id.clone();

        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                match serde_json::from_str::<JsonRpcResponse>(trimmed) {
                    Ok(resp) => {
                        if let Some(id_num) = resp.id.as_ref().and_then(|v| v.as_u64()) {
                            let mut map = pending_clone.lock().await;
                            if let Some(tx) = map.remove(&id_num) {
                                let _ = tx.send(resp);
                            }
                        }
                    }
                    Err(_) => {
                        on_log_out(
                            "info",
                            &redactor_stdout.redact(&format!("[{sid_out} stdout] {trimmed}")),
                        );
                    }
                }
            }
        });

        if let Some(err_stream) = stderr {
            let redactor_err = redactor.clone();
            let sid_err = server_id.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(err_stream).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let clean = redactor_err.redact(&format!("[{sid_err} stderr] {line}"));
                    on_log("warn", &clean);
                }
            });
        }

        Ok(Self {
            server_id,
            child: Mutex::new(Some(child)),
            stdin: Mutex::new(stdin),
            pending,
            next_id: AtomicU64::new(1),
            redactor,
            timeout: Duration::from_secs(timeout_secs.max(5)),
        })
    }

    pub async fn request(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> AppResult<serde_json::Value> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let req = JsonRpcRequest {
            jsonrpc: "2.0".into(),
            id: serde_json::json!(id),
            method: method.into(),
            params,
        };

        let (tx, rx) = oneshot::channel();
        {
            let mut map = self.pending.lock().await;
            map.insert(id, tx);
        }

        let payload = format!("{}\n", serde_json::to_string(&req)?);
        {
            let mut stdin = self.stdin.lock().await;
            if let Err(e) = stdin.write_all(payload.as_bytes()).await {
                self.pending.lock().await.remove(&id);
                return Err(AppError::Mcp(self.redactor.redact(&format!(
                    "Failed writing to MCP stdio '{}': {e}",
                    self.server_id
                ))));
            }
            let _ = stdin.flush().await;
        }

        let resp = match tokio::time::timeout(self.timeout, rx).await {
            Ok(Ok(r)) => r,
            Ok(Err(_)) => {
                return Err(AppError::Mcp(format!(
                    "MCP server '{}' closed connection before responding to '{method}'",
                    self.server_id
                )));
            }
            Err(_) => {
                self.pending.lock().await.remove(&id);
                return Err(AppError::Mcp(format!(
                    "MCP request '{method}' timed out after {}s",
                    self.timeout.as_secs()
                )));
            }
        };

        if let Some(err) = resp.error {
            return Err(AppError::Mcp(self.redactor.redact(&format!(
                "MCP error {} ({method}): {}",
                err.code, err.message
            ))));
        }

        Ok(resp.result.unwrap_or(serde_json::json!({})))
    }

    pub async fn notify(&self, method: &str, params: Option<serde_json::Value>) -> AppResult<()> {
        let notif = JsonRpcNotification {
            jsonrpc: "2.0".into(),
            method: method.into(),
            params,
        };
        let payload = format!("{}\n", serde_json::to_string(&notif)?);
        let mut stdin = self.stdin.lock().await;
        stdin.write_all(payload.as_bytes()).await?;
        let _ = stdin.flush().await;
        Ok(())
    }

    pub async fn is_alive(&self) -> bool {
        let mut guard = self.child.lock().await;
        if let Some(child) = guard.as_mut() {
            matches!(child.try_wait(), Ok(None))
        } else {
            false
        }
    }

    pub async fn close(&self) {
        let mut guard = self.child.lock().await;
        if let Some(mut child) = guard.take() {
            let _ = child.kill().await;
        }
    }
}
