use crate::error::{AppError, AppResult};
use crate::security::credentials::CredentialStore;
use crate::security::redaction::SecretRedactor;
use crate::storage::models::{SshExecResult, SshServer, SshTestResult};
use crate::storage::Database;
use base64::Engine;
use chrono::Utc;
use russh::client::{self, KeyboardInteractiveAuthResponse};
use russh::keys::{
    decode_secret_key, load_secret_key, HashAlg, PrivateKeyWithHashAlg, PublicKeyOrCertificate,
};
use russh::{ChannelMsg, Disconnect};
use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

const MAX_OUTPUT_BYTES: usize = 65_536;
const DEFAULT_EXEC_TIMEOUT_SECS: u64 = 30;
const MAX_EXEC_TIMEOUT_SECS: u64 = 300;
const CONNECT_TIMEOUT_SECS: u64 = 15;

pub fn ssh_password_key(id: &str) -> String {
    format!("ssh:{id}:password")
}

pub fn ssh_private_key_key(id: &str) -> String {
    format!("ssh:{id}:private_key")
}

pub fn ssh_passphrase_key(id: &str) -> String {
    format!("ssh:{id}:passphrase")
}

#[derive(Debug, Clone)]
struct RuntimeStatus {
    status: String,
    last_error: Option<String>,
}

struct ActiveSshSession {
    handle: client::Handle<SshClientHandler>,
    fingerprint: Option<String>,
}

struct SshClientHandler {
    expected_fingerprint: Option<String>,
    trust_new_host_key: bool,
    observed_fingerprint: Arc<StdMutex<Option<String>>>,
    fingerprint_mismatch: Arc<StdMutex<Option<String>>>,
}

impl client::Handler for SshClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let fp = server_public_key
            .public_key()
            .fingerprint(HashAlg::Sha256)
            .to_string();

        if let Ok(mut guard) = self.observed_fingerprint.lock() {
            *guard = Some(fp.clone());
        }

        if let Some(ref expected) = self.expected_fingerprint {
            if !self.trust_new_host_key && expected != &fp {
                if let Ok(mut mismatch) = self.fingerprint_mismatch.lock() {
                    *mismatch = Some(format!(
                        "Host key fingerprint changed! Expected '{expected}', got '{fp}'. Reset the saved fingerprint if the server was intentionally rebuilt."
                    ));
                }
                return Ok(false);
            }
        }

        Ok(true)
    }
}

pub struct SshManager {
    db: Arc<Database>,
    creds: Arc<CredentialStore>,
    redactor: Arc<SecretRedactor>,
    sessions: Mutex<HashMap<String, Arc<Mutex<ActiveSshSession>>>>,
    session_passwords: Mutex<HashMap<String, String>>,
    statuses: Mutex<HashMap<String, RuntimeStatus>>,
}

impl SshManager {
    pub fn new(
        db: Arc<Database>,
        creds: Arc<CredentialStore>,
        redactor: Arc<SecretRedactor>,
    ) -> Self {
        Self {
            db,
            creds,
            redactor,
            sessions: Mutex::new(HashMap::new()),
            session_passwords: Mutex::new(HashMap::new()),
            statuses: Mutex::new(HashMap::new()),
        }
    }

    pub async fn set_session_password(&self, server_id: &str, password: String) {
        if !password.is_empty() {
            self.redactor.register_secret(&password);
            self.session_passwords
                .lock()
                .await
                .insert(server_id.to_string(), password);
        }
    }

    pub async fn clear_session_password(&self, server_id: &str) {
        if let Some(old) = self.session_passwords.lock().await.remove(server_id) {
            self.redactor.unregister_secret(&old);
        }
    }

    pub async fn has_any_password(&self, server_id: &str) -> bool {
        if self.creds.has_secret(&ssh_password_key(server_id)) {
            return true;
        }
        self.session_passwords
            .lock()
            .await
            .get(server_id)
            .map(|p| !p.is_empty())
            .unwrap_or(false)
    }

    pub async fn enrich_server(&self, mut server: SshServer) -> SshServer {
        server.has_password = self.has_any_password(&server.id).await;
        server.has_private_key = self.creds.has_secret(&ssh_private_key_key(&server.id))
            || server
                .private_key_path
                .as_deref()
                .map(|p| !p.trim().is_empty())
                .unwrap_or(false);

        let is_live = self.sessions.lock().await.contains_key(&server.id);
        let status_entry = self.statuses.lock().await.get(&server.id).cloned();

        if let Some(st) = status_entry {
            server.status = if st.status == "connected" && !is_live {
                "disconnected".into()
            } else {
                st.status
            };
            server.last_error = st.last_error;
        } else if is_live {
            server.status = "connected".into();
            server.last_error = None;
        } else {
            server.status = "disconnected".into();
            server.last_error = None;
        }

        server
    }

    pub async fn list_servers_with_status(&self) -> AppResult<Vec<SshServer>> {
        let servers = self.db.list_ssh_servers()?;
        let mut out = Vec::with_capacity(servers.len());
        for s in servers {
            out.push(self.enrich_server(s).await);
        }
        Ok(out)
    }

    async fn set_status(&self, server_id: &str, status: &str, last_error: Option<String>) {
        self.statuses.lock().await.insert(
            server_id.to_string(),
            RuntimeStatus {
                status: status.to_string(),
                last_error: last_error.map(|e| self.redactor.redact(&e)),
            },
        );
    }

    async fn resolve_password(
        &self,
        server_id: &str,
        override_password: Option<String>,
    ) -> AppResult<Option<String>> {
        if let Some(pw) = override_password.filter(|p| !p.is_empty()) {
            self.redactor.register_secret(&pw);
            return Ok(Some(pw));
        }
        if let Some(pw) = self.session_passwords.lock().await.get(server_id).cloned() {
            if !pw.is_empty() {
                self.redactor.register_secret(&pw);
                return Ok(Some(pw));
            }
        }
        if let Some(pw) = self.creds.get_secret(&ssh_password_key(server_id))? {
            if !pw.is_empty() {
                return Ok(Some(pw));
            }
        }
        Ok(None)
    }

    async fn establish_session(
        &self,
        server: &SshServer,
        runtime_password: Option<String>,
        trust_new_host_key: bool,
    ) -> AppResult<ActiveSshSession> {
        validate_ssh_target(&server.host, server.port, &server.username)?;

        let observed_fp = Arc::new(StdMutex::new(None));
        let fp_mismatch = Arc::new(StdMutex::new(None));

        let handler = SshClientHandler {
            expected_fingerprint: server.host_fingerprint.clone(),
            trust_new_host_key,
            observed_fingerprint: observed_fp.clone(),
            fingerprint_mismatch: fp_mismatch.clone(),
        };

        let config = Arc::new(client::Config {
            inactivity_timeout: Some(Duration::from_secs(600)),
            keepalive_interval: Some(Duration::from_secs(20)),
            keepalive_max: 3,
            ..Default::default()
        });

        let addr = (server.host.as_str(), server.port);
        let connect_fut = client::connect(config, addr, handler);
        let mut handle = match tokio::time::timeout(
            Duration::from_secs(CONNECT_TIMEOUT_SECS),
            connect_fut,
        )
        .await
        {
            Ok(Ok(h)) => h,
            Ok(Err(e)) => {
                if let Some(msg) = fp_mismatch.lock().ok().and_then(|g| g.clone()) {
                    return Err(AppError::Ssh(msg));
                }
                return Err(AppError::Ssh(format!(
                    "Failed to connect to {}:{}: {}",
                    server.host,
                    server.port,
                    self.redactor.redact(&e.to_string())
                )));
            }
            Err(_) => {
                return Err(AppError::Ssh(format!(
                    "Connection to {}:{} timed out after {}s",
                    server.host, server.port, CONNECT_TIMEOUT_SECS
                )));
            }
        };

        let auth_ok = if server.auth_type == "private_key" {
            let passphrase = self
                .creds
                .get_secret(&ssh_passphrase_key(&server.id))?
                .filter(|s| !s.is_empty());
            let key_pair = if let Some(pem) = self
                .creds
                .get_secret(&ssh_private_key_key(&server.id))?
                .filter(|s| !s.trim().is_empty())
            {
                decode_secret_key(&pem, passphrase.as_deref())
                    .map_err(|e| AppError::Ssh(format!("Failed to decode saved private key: {e}")))?
            } else if let Some(ref path) = server
                .private_key_path
                .as_deref()
                .filter(|p| !p.trim().is_empty())
            {
                load_secret_key(path, passphrase.as_deref()).map_err(|e| {
                    AppError::Ssh(format!("Failed to load private key file '{path}': {e}"))
                })?
            } else {
                return Err(AppError::Ssh(
                    "No private key configured for this server. Provide a key file path or PEM content."
                        .into(),
                ));
            };

            let rsa_hash = handle
                .best_supported_rsa_hash()
                .await
                .map_err(|e| AppError::Ssh(format!("SSH key algorithm negotiation failed: {e}")))?
                .flatten();

            let res = handle
                .authenticate_publickey(
                    server.username.clone(),
                    PrivateKeyWithHashAlg::new(Arc::new(key_pair), rsa_hash),
                )
                .await
                .map_err(|e| AppError::Ssh(format!("Public key authentication error: {e}")))?;
            res.success()
        } else {
            let password = self
                .resolve_password(&server.id, runtime_password)
                .await?
                .ok_or_else(|| {
                    AppError::Ssh(
                        "SSH password is required. Enter the password to connect.".into(),
                    )
                })?;

            // First try standard SSH 'password' authentication
            let pw_res = handle
                .authenticate_password(server.username.clone(), password.clone())
                .await
                .map_err(|e| {
                    AppError::Ssh(format!(
                        "SSH password authentication error: {}",
                        self.redactor.redact(&e.to_string())
                    ))
                })?;

            if pw_res.success() {
                true
            } else {
                // Fallback to keyboard-interactive (common with PAM on Ubuntu/Debian/RHEL)
                authenticate_with_keyboard_interactive(&mut handle, &server.username, &password)
                    .await
                    .unwrap_or(false)
            }
        };

        if !auth_ok {
            let _ = handle
                .disconnect(Disconnect::ByApplication, "Authentication failed", "en")
                .await;
            return Err(AppError::Ssh(format!(
                "Authentication failed for {}@{}:{} (check username and password/key)",
                server.username, server.host, server.port
            )));
        }

        let fp = observed_fp.lock().ok().and_then(|g| g.clone());
        if let Some(ref fp_str) = fp {
            if server.host_fingerprint.is_none() || trust_new_host_key {
                let _ = self.db.update_ssh_server_fingerprint(&server.id, Some(fp_str));
            }
        }

        Ok(ActiveSshSession {
            handle,
            fingerprint: fp,
        })
    }

    pub async fn connect(
        &self,
        server_id: &str,
        runtime_password: Option<String>,
        save_password: bool,
        trust_new_host_key: bool,
    ) -> AppResult<SshServer> {
        let mut server = self
            .db
            .get_ssh_server(server_id)?
            .ok_or_else(|| AppError::NotFound(format!("SSH server '{server_id}' not found")))?;

        if let Some(ref pw) = runtime_password {
            if !pw.is_empty() {
                self.redactor.register_secret(pw);
                if save_password {
                    self.creds.set_secret(&ssh_password_key(server_id), pw)?;
                    server.has_password = true;
                    server.updated_at = Utc::now().to_rfc3339();
                    self.db.upsert_ssh_server(&server)?;
                } else {
                    self.set_session_password(server_id, pw.clone()).await;
                }
            }
        }

        // Close any existing session before reconnecting
        let _ = self.disconnect_session_only(server_id).await;
        self.set_status(server_id, "connecting", None).await;

        match self
            .establish_session(&server, runtime_password, trust_new_host_key)
            .await
        {
            Ok(session) => {
                let now = Utc::now().to_rfc3339();
                let _ = self.db.update_ssh_server_last_connected(server_id, &now);
                self.sessions
                    .lock()
                    .await
                    .insert(server_id.to_string(), Arc::new(Mutex::new(session)));
                self.set_status(server_id, "connected", None).await;
                self.db.log_event(
                    "ssh",
                    "info",
                    &format!(
                        "Connected SSH session '{}' ({}@{}:{})",
                        server.name, server.username, server.host, server.port
                    ),
                    None,
                );
                let refreshed = self.db.get_ssh_server(server_id)?.unwrap_or(server);
                Ok(self.enrich_server(refreshed).await)
            }
            Err(err) => {
                let clean = self.redactor.redact(&err.to_string());
                self.set_status(server_id, "error", Some(clean.clone())).await;
                self.db.log_event(
                    "ssh",
                    "warn",
                    &format!(
                        "SSH connection failed for '{}' ({}@{}:{})",
                        server.name, server.username, server.host, server.port
                    ),
                    Some(&clean),
                );
                Err(AppError::Ssh(clean))
            }
        }
    }

    async fn disconnect_session_only(&self, server_id: &str) -> AppResult<()> {
        if let Some(session_arc) = self.sessions.lock().await.remove(server_id) {
            let session = session_arc.lock().await;
            let _ = session
                .handle
                .disconnect(Disconnect::ByApplication, "User disconnected", "en")
                .await;
        }
        Ok(())
    }

    pub async fn disconnect(&self, server_id: &str) -> AppResult<()> {
        self.disconnect_session_only(server_id).await?;
        self.set_status(server_id, "disconnected", None).await;
        self.db.log_event(
            "ssh",
            "info",
            &format!("Disconnected SSH session '{server_id}'"),
            None,
        );
        Ok(())
    }

    pub async fn disconnect_all(&self) {
        let ids: Vec<String> = self.sessions.lock().await.keys().cloned().collect();
        for id in ids {
            let _ = self.disconnect(&id).await;
        }
        self.session_passwords.lock().await.clear();
    }

    pub async fn test_connection(
        &self,
        server_id: &str,
        runtime_password: Option<String>,
        trust_new_host_key: bool,
    ) -> AppResult<SshTestResult> {
        let server = self
            .db
            .get_ssh_server(server_id)?
            .ok_or_else(|| AppError::NotFound(format!("SSH server '{server_id}' not found")))?;

        let started = Instant::now();
        match self
            .establish_session(&server, runtime_password, trust_new_host_key)
            .await
        {
            Ok(session) => {
                let fp = session.fingerprint.clone();
                let probe = run_command_on_handle(
                    &session.handle,
                    "whoami && hostname && uname -sr",
                    Duration::from_secs(10),
                    CancellationToken::new(),
                )
                .await;
                let _ = session
                    .handle
                    .disconnect(Disconnect::ByApplication, "Test complete", "en")
                    .await;

                let latency_ms = started.elapsed().as_millis() as u64;
                match probe {
                    Ok((code, stdout, _stderr, _trunc)) => {
                        let lines: Vec<&str> = stdout
                            .lines()
                            .map(str::trim)
                            .filter(|l| !l.is_empty())
                            .collect();
                        let whoami = lines.first().map(|s| s.to_string());
                        let banner = if lines.len() >= 3 {
                            Some(format!("{} ({})", lines[1], lines[2]))
                        } else if lines.len() == 2 {
                            Some(lines[1].to_string())
                        } else {
                            None
                        };
                        Ok(SshTestResult {
                            ok: code == 0,
                            latency_ms,
                            host_fingerprint: fp,
                            server_banner: banner,
                            remote_whoami: whoami,
                            message: format!(
                                "SSH connection verified ({}@{}:{}, {}ms)",
                                server.username, server.host, server.port, latency_ms
                            ),
                        })
                    }
                    Err(e) => Ok(SshTestResult {
                        ok: true,
                        latency_ms,
                        host_fingerprint: fp,
                        server_banner: None,
                        remote_whoami: None,
                        message: format!(
                            "Authenticated to {}@{}:{}, probe note: {}",
                            server.username,
                            server.host,
                            server.port,
                            self.redactor.redact(&e.to_string())
                        ),
                    }),
                }
            }
            Err(e) => Ok(SshTestResult {
                ok: false,
                latency_ms: started.elapsed().as_millis() as u64,
                host_fingerprint: None,
                server_banner: None,
                remote_whoami: None,
                message: self.redactor.redact(&e.to_string()),
            }),
        }
    }

    async fn get_or_connect_session(&self, server_id: &str) -> AppResult<(SshServer, Arc<Mutex<ActiveSshSession>>)> {
        let server = self
            .db
            .get_ssh_server(server_id)?
            .ok_or_else(|| AppError::NotFound(format!("SSH server '{server_id}' not found")))?;

        if let Some(existing) = self.sessions.lock().await.get(server_id).cloned() {
            return Ok((server, existing));
        }

        let session = self.establish_session(&server, None, false).await?;
        let now = Utc::now().to_rfc3339();
        let _ = self.db.update_ssh_server_last_connected(server_id, &now);
        let arc = Arc::new(Mutex::new(session));
        self.sessions
            .lock()
            .await
            .insert(server_id.to_string(), arc.clone());
        self.set_status(server_id, "connected", None).await;
        Ok((server, arc))
    }

    pub async fn exec_command(
        &self,
        server_id: &str,
        command: &str,
        working_dir: Option<&str>,
        timeout_secs: Option<u64>,
        cancel: CancellationToken,
    ) -> AppResult<SshExecResult> {
        let trimmed_cmd = command.trim();
        if trimmed_cmd.is_empty() {
            return Err(AppError::Validation("SSH command cannot be empty".into()));
        }

        let (server, session_arc) = self.get_or_connect_session(server_id).await?;
        let effective_dir = working_dir
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .or_else(|| {
                let d = server.default_working_dir.trim();
                if d.is_empty() { None } else { Some(d) }
            });

        let full_cmd = if let Some(dir) = effective_dir {
            format!("cd {} && {}", shell_quote(dir), trimmed_cmd)
        } else {
            trimmed_cmd.to_string()
        };

        let timeout = Duration::from_secs(
            timeout_secs
                .unwrap_or(DEFAULT_EXEC_TIMEOUT_SECS)
                .clamp(1, MAX_EXEC_TIMEOUT_SECS),
        );

        let started = Instant::now();
        let first_try = {
            let guard = session_arc.lock().await;
            run_command_on_handle(&guard.handle, &full_cmd, timeout, cancel.clone()).await
        };

        let (exit_code, stdout, stderr, truncated) = match first_try {
            Ok(res) => res,
            Err(AppError::Cancelled) => return Err(AppError::Cancelled),
            Err(first_err) => {
                // If channel failed due to dropped connection, reconnect once automatically
                let err_str = first_err.to_string();
                if err_str.contains("timed out") {
                    return Err(first_err);
                }
                let _ = self.disconnect_session_only(server_id).await;
                let fresh_session = match self.establish_session(&server, None, false).await {
                    Ok(s) => s,
                    Err(reconn_err) => {
                        let msg = self.redactor.redact(&reconn_err.to_string());
                        self.set_status(server_id, "error", Some(msg.clone())).await;
                        return Err(AppError::Ssh(msg));
                    }
                };
                let fresh_arc = Arc::new(Mutex::new(fresh_session));
                self.sessions
                    .lock()
                    .await
                    .insert(server_id.to_string(), fresh_arc.clone());
                self.set_status(server_id, "connected", None).await;

                let guard = fresh_arc.lock().await;
                run_command_on_handle(&guard.handle, &full_cmd, timeout, cancel).await?
            }
        };

        let clean_stdout = self.redactor.redact(&stdout);
        let clean_stderr = self.redactor.redact(&stderr);
        let duration_ms = started.elapsed().as_millis() as u64;

        Ok(SshExecResult {
            server_id: server_id.to_string(),
            command: self.redactor.redact(trimmed_cmd),
            working_dir: effective_dir.map(String::from),
            exit_code,
            stdout: clean_stdout,
            stderr: clean_stderr,
            duration_ms,
            truncated,
        })
    }

    pub async fn read_remote_file(
        &self,
        server_id: &str,
        path: &str,
        start_line: Option<usize>,
        end_line: Option<usize>,
        cancel: CancellationToken,
    ) -> AppResult<serde_json::Value> {
        let p = path.trim();
        if p.is_empty() {
            return Err(AppError::Validation("Remote file path cannot be empty".into()));
        }
        let quoted = shell_quote(p);
        let cmd = match (start_line, end_line) {
            (Some(s), Some(e)) => {
                let s = s.max(1);
                let e = e.max(s);
                format!("sed -n '{s},{e}p' -- {quoted}")
            }
            (Some(s), None) => {
                let s = s.max(1);
                format!("sed -n '{s},$p' -- {quoted}")
            }
            (None, Some(e)) => {
                let e = e.max(1);
                format!("head -n {e} -- {quoted}")
            }
            (None, None) => format!("cat -- {quoted}"),
        };

        let res = self
            .exec_command(server_id, &cmd, None, Some(20), cancel)
            .await?;
        if res.exit_code != 0 {
            return Err(AppError::Ssh(format!(
                "Failed to read remote file '{p}' (exit {}): {}",
                res.exit_code,
                if res.stderr.trim().is_empty() {
                    res.stdout.trim()
                } else {
                    res.stderr.trim()
                }
            )));
        }

        Ok(serde_json::json!({
            "path": p,
            "content": res.stdout,
            "truncated": res.truncated,
            "durationMs": res.duration_ms,
        }))
    }

    pub async fn write_remote_file(
        &self,
        server_id: &str,
        path: &str,
        content: &str,
        create_dirs: bool,
        chmod: Option<&str>,
        cancel: CancellationToken,
    ) -> AppResult<serde_json::Value> {
        let p = path.trim();
        if p.is_empty() {
            return Err(AppError::Validation("Remote file path cannot be empty".into()));
        }
        if let Some(mode) = chmod {
            let m = mode.trim();
            if !m.is_empty() && !(m.len() <= 4 && m.chars().all(|c| matches!(c, '0'..='7'))) {
                return Err(AppError::Validation(format!(
                    "Invalid chmod mode '{m}'. Use octal notation such as '644' or '755'."
                )));
            }
        }

        let b64 = base64::engine::general_purpose::STANDARD.encode(content.as_bytes());
        let quoted_path = shell_quote(p);
        let mut parts = Vec::new();
        if create_dirs {
            parts.push(format!("mkdir -p -- \"$(dirname -- {quoted_path})\""));
        }
        parts.push(format!(
            "printf '%s' {} | base64 -d > {quoted_path}",
            shell_quote(&b64)
        ));
        if let Some(mode) = chmod.map(str::trim).filter(|m| !m.is_empty()) {
            parts.push(format!("chmod {mode} -- {quoted_path}"));
        }
        let cmd = parts.join(" && ");

        let res = self
            .exec_command(server_id, &cmd, None, Some(30), cancel)
            .await?;
        if res.exit_code != 0 {
            return Err(AppError::Ssh(format!(
                "Failed to write remote file '{p}' (exit {}): {}",
                res.exit_code,
                res.stderr.trim()
            )));
        }

        Ok(serde_json::json!({
            "path": p,
            "bytesWritten": content.len(),
            "exitCode": res.exit_code,
            "durationMs": res.duration_ms,
        }))
    }

    pub async fn list_remote_dir(
        &self,
        server_id: &str,
        path: Option<&str>,
        cancel: CancellationToken,
    ) -> AppResult<serde_json::Value> {
        let target = path.map(str::trim).filter(|s| !s.is_empty()).unwrap_or(".");
        let cmd = format!("ls -la -- {}", shell_quote(target));
        let res = self
            .exec_command(server_id, &cmd, None, Some(15), cancel)
            .await?;
        if res.exit_code != 0 {
            return Err(AppError::Ssh(format!(
                "Failed to list directory '{target}' (exit {}): {}",
                res.exit_code,
                res.stderr.trim()
            )));
        }
        Ok(serde_json::json!({
            "path": target,
            "listing": res.stdout,
            "truncated": res.truncated,
            "durationMs": res.duration_ms,
        }))
    }

    pub async fn gather_system_info(
        &self,
        server_id: &str,
        cancel: CancellationToken,
    ) -> AppResult<serde_json::Value> {
        let cmd = concat!(
            "echo '=== HOST ==='; hostname; whoami; uname -a; ",
            "echo '=== OS ==='; (cat /etc/os-release 2>/dev/null | head -n 6 || sw_vers 2>/dev/null || true); ",
            "echo '=== UPTIME ==='; uptime; ",
            "echo '=== MEMORY ==='; (free -h 2>/dev/null || vm_stat 2>/dev/null | head -n 8 || true); ",
            "echo '=== DISK ==='; df -h 2>/dev/null | head -n 15; ",
            "echo '=== PORTS ==='; (ss -tulpn 2>/dev/null | head -n 20 || netstat -tulpn 2>/dev/null | head -n 20 || true)"
        );
        let res = self
            .exec_command(server_id, cmd, None, Some(20), cancel)
            .await?;
        Ok(serde_json::json!({
            "exitCode": res.exit_code,
            "snapshot": res.stdout,
            "stderr": res.stderr,
            "durationMs": res.duration_ms,
        }))
    }
}

async fn authenticate_with_keyboard_interactive(
    handle: &mut client::Handle<SshClientHandler>,
    username: &str,
    password: &str,
) -> AppResult<bool> {
    let mut resp = handle
        .authenticate_keyboard_interactive_start(username.to_string(), None)
        .await
        .map_err(|e| AppError::Ssh(e.to_string()))?;

    for _ in 0..4 {
        match resp {
            KeyboardInteractiveAuthResponse::Success => return Ok(true),
            KeyboardInteractiveAuthResponse::Failure { .. } => return Ok(false),
            KeyboardInteractiveAuthResponse::InfoRequest { prompts, .. } => {
                let answers: Vec<String> = prompts
                    .iter()
                    .map(|_| password.to_string())
                    .collect();
                resp = handle
                    .authenticate_keyboard_interactive_respond(answers)
                    .await
                    .map_err(|e| AppError::Ssh(e.to_string()))?;
            }
        }
    }
    Ok(false)
}

async fn run_command_on_handle(
    handle: &client::Handle<SshClientHandler>,
    command: &str,
    timeout: Duration,
    cancel: CancellationToken,
) -> AppResult<(i32, String, String, bool)> {
    let mut channel = handle
        .channel_open_session()
        .await
        .map_err(|e| AppError::Ssh(format!("Failed to open SSH exec channel: {e}")))?;

    channel
        .exec(true, command)
        .await
        .map_err(|e| AppError::Ssh(format!("Failed to send SSH exec command: {e}")))?;

    let mut stdout_buf: Vec<u8> = Vec::new();
    let mut stderr_buf: Vec<u8> = Vec::new();
    let mut exit_code: Option<u32> = None;
    let mut truncated = false;

    let deadline = tokio::time::sleep(timeout);
    tokio::pin!(deadline);

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                let _ = channel.close().await;
                return Err(AppError::Cancelled);
            }
            _ = &mut deadline => {
                let _ = channel.close().await;
                return Err(AppError::Ssh(format!(
                    "SSH command timed out after {}s",
                    timeout.as_secs()
                )));
            }
            msg = channel.wait() => {
                let Some(ev) = msg else {
                    break;
                };
                match ev {
                    ChannelMsg::Data { data } => {
                        append_capped(&mut stdout_buf, &data, &mut truncated);
                    }
                    ChannelMsg::ExtendedData { data, ext } => {
                        if ext == 1 {
                            append_capped(&mut stderr_buf, &data, &mut truncated);
                        } else {
                            append_capped(&mut stdout_buf, &data, &mut truncated);
                        }
                    }
                    ChannelMsg::ExitStatus { exit_status } => {
                        exit_code = Some(exit_status);
                    }
                    ChannelMsg::Eof | ChannelMsg::Close => {
                        if exit_code.is_some() {
                            break;
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    let code = exit_code.map(|c| c as i32).unwrap_or(0);
    let stdout = String::from_utf8_lossy(&stdout_buf).to_string();
    let stderr = String::from_utf8_lossy(&stderr_buf).to_string();
    Ok((code, stdout, stderr, truncated))
}

fn append_capped(buf: &mut Vec<u8>, chunk: &[u8], truncated: &mut bool) {
    if buf.len() >= MAX_OUTPUT_BYTES {
        *truncated = true;
        return;
    }
    let remaining = MAX_OUTPUT_BYTES - buf.len();
    if chunk.len() > remaining {
        buf.extend_from_slice(&chunk[..remaining]);
        *truncated = true;
    } else {
        buf.extend_from_slice(chunk);
    }
}

pub fn shell_quote(value: &str) -> String {
    let escaped = value.replace('\'', "'\\''");
    format!("'{escaped}'")
}

pub fn validate_ssh_target(host: &str, port: u16, username: &str) -> AppResult<()> {
    let h = host.trim();
    if h.is_empty() {
        return Err(AppError::Validation("SSH host/IP cannot be empty".into()));
    }
    if h.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(AppError::Validation(
            "SSH host cannot contain whitespace or control characters".into(),
        ));
    }
    if port == 0 {
        return Err(AppError::Validation(
            "SSH port must be between 1 and 65535".into(),
        ));
    }
    let u = username.trim();
    if u.is_empty() {
        return Err(AppError::Validation("SSH username cannot be empty".into()));
    }
    if u.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(AppError::Validation(
            "SSH username cannot contain whitespace or control characters".into(),
        ));
    }
    Ok(())
}

// ---- BUILT-IN AI TOOLS FOR AUTOMATIC SSH SERVER OPERATIONS ----

pub struct SshToolSpec {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
    pub category: String,
    pub is_mutating: bool,
}

pub fn builtin_ssh_tool_specs() -> Vec<SshToolSpec> {
    vec![
        SshToolSpec {
            name: "ssh_exec".into(),
            description: "Execute a shell command on the attached remote SSH server and return stdout, stderr, and exit code. Use non-interactive flags (e.g., -y, --no-pager).".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "Shell command to execute on the remote server"
                    },
                    "working_dir": {
                        "type": "string",
                        "description": "Optional remote working directory to cd into before running the command"
                    },
                    "timeout_secs": {
                        "type": "integer",
                        "description": "Optional timeout in seconds (default: 30, max: 300)"
                    }
                },
                "required": ["command"]
            }),
            category: "ssh_exec".into(),
            is_mutating: true,
        },
        SshToolSpec {
            name: "ssh_read_file".into(),
            description: "Read UTF-8 text content from a file on the attached remote SSH server (with optional 1-based line range).".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to file on the remote server (e.g. '/etc/nginx/nginx.conf')"
                    },
                    "start_line": {
                        "type": "integer",
                        "description": "Optional 1-based start line"
                    },
                    "end_line": {
                        "type": "integer",
                        "description": "Optional 1-based end line"
                    }
                },
                "required": ["path"]
            }),
            category: "ssh_read".into(),
            is_mutating: false,
        },
        SshToolSpec {
            name: "ssh_write_file".into(),
            description: "Create or overwrite a UTF-8 text file on the attached remote SSH server safely (base64 transfer).".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Destination file path on the remote server"
                    },
                    "content": {
                        "type": "string",
                        "description": "Full text content to write to the remote file"
                    },
                    "create_dirs": {
                        "type": "boolean",
                        "description": "Create missing parent directories (default: true)"
                    },
                    "chmod": {
                        "type": "string",
                        "description": "Optional octal permissions (e.g. '644' or '755')"
                    }
                },
                "required": ["path", "content"]
            }),
            category: "ssh_write".into(),
            is_mutating: true,
        },
        SshToolSpec {
            name: "ssh_list_dir".into(),
            description: "List files and subdirectories in a folder on the attached remote SSH server.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Remote directory path (default: current/default working directory)"
                    }
                }
            }),
            category: "ssh_read".into(),
            is_mutating: false,
        },
        SshToolSpec {
            name: "ssh_system_info".into(),
            description: "Collect a quick read-only system snapshot from the attached SSH server (hostname, OS, uptime, memory, disk usage, listening ports).".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {}
            }),
            category: "ssh_read".into(),
            is_mutating: false,
        },
    ]
}

pub fn ssh_mode_system_prompt(server: &SshServer) -> String {
    let dir_line = if server.default_working_dir.trim().is_empty() {
        "(remote user home directory)".to_string()
    } else {
        server.default_working_dir.clone()
    };
    let notes_line = if server.notes.trim().is_empty() {
        String::new()
    } else {
        format!("\nServer Notes:\n{}", server.notes.trim())
    };
    format!(
        "## Active SSH Server Workspace: {}\n\
         Target: {}@{}:{} | Default Working Directory: {}{}\n\
         Available built-in SSH tools: `ssh_system_info`, `ssh_list_dir`, `ssh_read_file`, `ssh_write_file`, `ssh_exec`.\n\
         Rules for Automated Server Operations:\n\
         - You can operate directly on this remote server step by step using the `ssh_*` tools.\n\
         - Always use non-interactive flags for commands (e.g. `DEBIAN_FRONTEND=noninteractive apt-get -y`, `systemctl status --no-pager`, `git --no-pager`).\n\
         - Never run blocking commands that hang indefinitely (like `tail -f`, `top`, or `watch`); use bounded alternatives (`tail -n 100`, `ps aux`, `top -bn1`).\n\
         - Inspect configs or service status before making destructive changes, and verify the result after applying updates.\n\
         - Never echo or print passwords or private secrets in shell commands.",
        server.name, server.username, server.host, server.port, dir_line, notes_line
    )
}

pub fn describe_ssh_action(tool_name: &str, args: &serde_json::Value, server: &SshServer) -> String {
    let target = format!("{}@{}:{}", server.username, server.host, server.port);
    match tool_name {
        "ssh_exec" => {
            let cmd = args
                .get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("(command)");
            let preview: String = cmd.chars().take(120).collect();
            format!("Run SSH command on '{target}': {preview}")
        }
        "ssh_write_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("(file)");
            format!("Write remote file '{path}' on '{target}'")
        }
        "ssh_read_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("(file)");
            format!("Read remote file '{path}' on '{target}'")
        }
        "ssh_list_dir" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or(".");
            format!("List remote directory '{path}' on '{target}'")
        }
        "ssh_system_info" => format!("Inspect system info on '{target}'"),
        _ => format!("Execute '{tool_name}' on '{target}'"),
    }
}

pub async fn execute_builtin_ssh_tool(
    ssh: &SshManager,
    server_id: &str,
    tool_name: &str,
    args: &serde_json::Value,
    cancel: CancellationToken,
) -> AppResult<serde_json::Value> {
    match tool_name {
        "ssh_exec" => {
            let command = args
                .get("command")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::Validation("Missing required 'command' argument".into()))?;
            let working_dir = args.get("working_dir").and_then(|v| v.as_str());
            let timeout_secs = args.get("timeout_secs").and_then(|v| v.as_u64());
            let res = ssh
                .exec_command(server_id, command, working_dir, timeout_secs, cancel)
                .await?;
            Ok(serde_json::to_value(res)?)
        }
        "ssh_read_file" => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::Validation("Missing required 'path' argument".into()))?;
            let start_line = args
                .get("start_line")
                .and_then(|v| v.as_u64())
                .map(|n| n as usize);
            let end_line = args
                .get("end_line")
                .and_then(|v| v.as_u64())
                .map(|n| n as usize);
            ssh.read_remote_file(server_id, path, start_line, end_line, cancel)
                .await
        }
        "ssh_write_file" => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::Validation("Missing required 'path' argument".into()))?;
            let content = args
                .get("content")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::Validation("Missing required 'content' argument".into()))?;
            let create_dirs = args
                .get("create_dirs")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let chmod = args.get("chmod").and_then(|v| v.as_str());
            ssh.write_remote_file(server_id, path, content, create_dirs, chmod, cancel)
                .await
        }
        "ssh_list_dir" => {
            let path = args.get("path").and_then(|v| v.as_str());
            ssh.list_remote_dir(server_id, path, cancel).await
        }
        "ssh_system_info" => ssh.gather_system_info(server_id, cancel).await,
        other => Err(AppError::NotFound(format!(
            "Unknown built-in SSH tool: {other}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn quotes_shell_paths_safely() {
        assert_eq!(shell_quote("/var/www/app"), "'/var/www/app'");
        assert_eq!(shell_quote("a'b; rm -rf /"), "'a'\\''b; rm -rf /'");
    }

    #[test]
    fn validates_ssh_targets() {
        assert!(validate_ssh_target("192.168.1.10", 22, "root").is_ok());
        assert!(validate_ssh_target("prod.example.com", 2222, "ubuntu").is_ok());
        assert!(validate_ssh_target("", 22, "root").is_err());
        assert!(validate_ssh_target("bad host", 22, "root").is_err());
        assert!(validate_ssh_target("10.0.0.1", 0, "root").is_err());
        assert!(validate_ssh_target("10.0.0.1", 22, "").is_err());
    }

    #[test]
    fn exposes_all_builtin_ssh_tools() {
        let specs = builtin_ssh_tool_specs();
        let names: Vec<&str> = specs.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"ssh_exec"));
        assert!(names.contains(&"ssh_read_file"));
        assert!(names.contains(&"ssh_write_file"));
        assert!(names.contains(&"ssh_list_dir"));
        assert!(names.contains(&"ssh_system_info"));
    }

    #[tokio::test]
    async fn stores_session_password_in_memory_and_redacts_secrets() {
        let dir = TempDir::new().unwrap();
        let redactor = Arc::new(SecretRedactor::new());
        let db = Arc::new(Database::open_in_memory(dir.path().to_path_buf(), redactor.clone()).unwrap());
        let creds = Arc::new(CredentialStore::new_in_memory(redactor.clone()));
        let mgr = SshManager::new(db.clone(), creds.clone(), redactor.clone());

        let now = Utc::now().to_rfc3339();
        let srv = SshServer {
            id: "srv-1".into(),
            name: "Prod VPS".into(),
            host: "10.0.0.5".into(),
            port: 22,
            username: "root".into(),
            auth_type: "password".into(),
            private_key_path: None,
            default_working_dir: "/srv/app".into(),
            notes: "Ubuntu 24.04".into(),
            host_fingerprint: None,
            has_password: false,
            has_private_key: false,
            status: "disconnected".into(),
            last_error: None,
            last_connected_at: None,
            created_at: now.clone(),
            updated_at: now,
        };
        db.upsert_ssh_server(&srv).unwrap();

        assert!(!mgr.has_any_password("srv-1").await);
        mgr.set_session_password("srv-1", "SuperSecretPass!99".into())
            .await;
        assert!(mgr.has_any_password("srv-1").await);
        assert_eq!(
            redactor.redact("auth failed: SuperSecretPass!99"),
            "auth failed: [REDACTED]"
        );

        let enriched = mgr.enrich_server(srv.clone()).await;
        assert!(enriched.has_password);

        let backup = db.export_portable_backup().unwrap();
        assert_eq!(backup["sshServers"][0]["hasPassword"], false);

        mgr.clear_session_password("srv-1").await;
        assert!(!mgr.has_any_password("srv-1").await);
    }
}
