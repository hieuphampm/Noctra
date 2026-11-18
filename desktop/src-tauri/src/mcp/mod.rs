pub mod protocol;
pub mod stdio;
pub mod streamable_http;

use crate::error::{AppError, AppResult};
use crate::mcp::protocol::{infer_tool_permissions, initialize_params};
use crate::mcp::stdio::StdioTransport;
use crate::mcp::streamable_http::StreamableHttpTransport;
use crate::security::credentials::CredentialStore;
use crate::security::redaction::SecretRedactor;
use crate::storage::models::{McpPrompt, McpResource, McpServer, McpTool};
use crate::storage::Database;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

enum ActiveTransport {
    Stdio(StdioTransport),
    StreamableHttp(StreamableHttpTransport),
}

impl ActiveTransport {
    async fn request(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> AppResult<serde_json::Value> {
        match self {
            ActiveTransport::Stdio(t) => t.request(method, params).await,
            ActiveTransport::StreamableHttp(t) => t.request(method, params).await,
        }
    }

    async fn notify(&self, method: &str, params: Option<serde_json::Value>) -> AppResult<()> {
        match self {
            ActiveTransport::Stdio(t) => t.notify(method, params).await,
            ActiveTransport::StreamableHttp(t) => t.notify(method, params).await,
        }
    }

    async fn is_alive(&self) -> bool {
        match self {
            ActiveTransport::Stdio(t) => t.is_alive().await,
            ActiveTransport::StreamableHttp(_) => true,
        }
    }

    async fn close(&self) {
        match self {
            ActiveTransport::Stdio(t) => t.close().await,
            ActiveTransport::StreamableHttp(t) => t.close().await,
        }
    }
}

pub struct McpHubManager {
    db: Arc<Database>,
    creds: Arc<CredentialStore>,
    redactor: Arc<SecretRedactor>,
    connections: RwLock<HashMap<String, Arc<ActiveTransport>>>,
}

impl McpHubManager {
    pub fn new(
        db: Arc<Database>,
        creds: Arc<CredentialStore>,
        redactor: Arc<SecretRedactor>,
    ) -> Self {
        Self {
            db,
            creds,
            redactor,
            connections: RwLock::new(HashMap::new()),
        }
    }

    pub async fn connect_server(&self, server_id: &str) -> AppResult<McpServer> {
        let server = self
            .db
            .get_mcp_server(server_id)?
            .ok_or_else(|| AppError::NotFound(format!("MCP server '{server_id}' not found")))?;

        self.disconnect_server(server_id).await?;
        self.db
            .update_mcp_server_status(server_id, "connecting", None, None)?;

        let settings = self.db.get_settings()?;
        let transport_res = self.open_transport(&server, &settings.mcp).await;

        let transport = match transport_res {
            Ok(t) => Arc::new(t),
            Err(e) => {
                let err_msg = self.redactor.redact(&e.to_string());
                self.db
                    .update_mcp_server_status(server_id, "error", Some(&err_msg), None)?;
                self.db.log_event("mcp", "error", &format!("Failed connecting to {}", server.name), Some(&err_msg));
                return Err(AppError::Mcp(err_msg));
            }
        };

        // Official MCP initialization handshake
        let init_res = transport.request("initialize", Some(initialize_params())).await;
        let init_val = match init_res {
            Ok(v) => v,
            Err(e) => {
                transport.close().await;
                let err_msg = self.redactor.redact(&e.to_string());
                self.db
                    .update_mcp_server_status(server_id, "error", Some(&err_msg), None)?;
                return Err(AppError::Mcp(err_msg));
            }
        };

        let _ = transport
            .notify("notifications/initialized", Some(serde_json::json!({})))
            .await;

        let server_info = init_val.get("serverInfo").cloned().unwrap_or(init_val.clone());

        // Discover tools, resources, prompts
        let (tools, resources, prompts) = self.discover_capabilities(&server, &transport).await;

        self.db
            .replace_mcp_discovery(server_id, &tools, &resources, &prompts)?;
        self.db.update_mcp_server_status(
            server_id,
            "connected",
            None,
            Some(&server_info),
        )?;
        self.db.log_event(
            "mcp",
            "info",
            &format!(
                "Connected MCP server '{}' ({} tools, {} resources, {} prompts)",
                server.name,
                tools.len(),
                resources.len(),
                prompts.len()
            ),
            None,
        );

        self.connections
            .write()
            .await
            .insert(server_id.to_string(), transport);

        self.db
            .get_mcp_server(server_id)?
            .ok_or_else(|| AppError::NotFound("Server vanished".into()))
    }

    async fn open_transport(
        &self,
        server: &McpServer,
        mcp_settings: &crate::storage::models::McpSettings,
    ) -> AppResult<ActiveTransport> {
        match server.transport.as_str() {
            "stdio" => {
                let mut env_map = server.plain_env.clone();
                for key in &server.env_keys {
                    if let Ok(Some(val)) = self.creds.get_secret(&format!("mcp:{}:env:{key}", server.id)) {
                        self.redactor.register_secret(&val);
                        env_map.insert(key.clone(), val);
                    }
                }
                let db = self.db.clone();
                let sname = server.name.clone();
                let t = StdioTransport::spawn(
                    server.id.clone(),
                    &server.endpoint_or_command,
                    &server.args,
                    &env_map,
                    mcp_settings.allow_shell_wrappers,
                    mcp_settings.default_timeout_secs,
                    self.redactor.clone(),
                    move |lvl, line| {
                        db.log_event("mcp", lvl, &format!("{sname}: {line}"), None);
                    },
                )
                .await?;
                Ok(ActiveTransport::Stdio(t))
            }
            "streamable_http" => {
                let auth_secret = self
                    .creds
                    .get_secret(&format!("mcp:{}:auth", server.id))?;
                let t = StreamableHttpTransport::new(
                    server.endpoint_or_command.clone(),
                    &server.auth_type,
                    &server.auth_config,
                    auth_secret,
                    mcp_settings.default_timeout_secs,
                    self.redactor.clone(),
                )?;
                Ok(ActiveTransport::StreamableHttp(t))
            }
            other => Err(AppError::Mcp(format!("Unsupported MCP transport: {other}"))),
        }
    }

    async fn discover_capabilities(
        &self,
        server: &McpServer,
        transport: &ActiveTransport,
    ) -> (Vec<McpTool>, Vec<McpResource>, Vec<McpPrompt>) {
        let mut tools = Vec::new();
        if let Ok(val) = transport.request("tools/list", Some(serde_json::json!({}))).await {
            if let Some(arr) = val.get("tools").and_then(|v| v.as_array()) {
                for item in arr {
                    let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    if name.is_empty() {
                        continue;
                    }
                    let desc = item
                        .get("description")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let input_schema = item
                        .get("inputSchema")
                        .cloned()
                        .unwrap_or_else(|| serde_json::json!({"type": "object", "properties": {}}));
                    let output_schema = item.get("outputSchema").cloned();
                    let perms = infer_tool_permissions(&name, &desc);
                    tools.push(McpTool {
                        id: format!("{}:{}", server.id, name),
                        server_id: server.id.clone(),
                        server_name: server.name.clone(),
                        name,
                        description: desc,
                        input_schema,
                        output_schema,
                        required_permissions: perms,
                        enabled: true,
                        available: true,
                    });
                }
            }
        }

        let mut resources = Vec::new();
        if let Ok(val) = transport
            .request("resources/list", Some(serde_json::json!({})))
            .await
        {
            if let Some(arr) = val.get("resources").and_then(|v| v.as_array()) {
                for item in arr {
                    let uri = item.get("uri").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    if uri.is_empty() {
                        continue;
                    }
                    resources.push(McpResource {
                        id: format!("{}:{}", server.id, uri),
                        server_id: server.id.clone(),
                        uri,
                        name: item
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("resource")
                            .to_string(),
                        description: item
                            .get("description")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        mime_type: item
                            .get("mimeType")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                    });
                }
            }
        }

        let mut prompts = Vec::new();
        if let Ok(val) = transport
            .request("prompts/list", Some(serde_json::json!({})))
            .await
        {
            if let Some(arr) = val.get("prompts").and_then(|v| v.as_array()) {
                for item in arr {
                    let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    if name.is_empty() {
                        continue;
                    }
                    prompts.push(McpPrompt {
                        id: format!("{}:{}", server.id, name),
                        server_id: server.id.clone(),
                        name,
                        description: item
                            .get("description")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        arguments: item
                            .get("arguments")
                            .cloned()
                            .unwrap_or_else(|| serde_json::json!([])),
                    });
                }
            }
        }

        (tools, resources, prompts)
    }

    pub async fn disconnect_server(&self, server_id: &str) -> AppResult<()> {
        if let Some(conn) = self.connections.write().await.remove(server_id) {
            conn.close().await;
        }
        let _ = self
            .db
            .update_mcp_server_status(server_id, "disconnected", None, None);
        Ok(())
    }

    pub async fn call_tool(
        &self,
        server_id: &str,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> AppResult<serde_json::Value> {
        let tools = self.db.list_mcp_tools()?;
        let tool = tools
            .into_iter()
            .find(|t| t.server_id == server_id && t.name == tool_name)
            .ok_or_else(|| {
                AppError::NotFound(format!("MCP tool '{tool_name}' on server '{server_id}' not found"))
            })?;

        if !tool.enabled {
            return Err(AppError::PermissionDenied(format!(
                "MCP tool '{tool_name}' is disabled"
            )));
        }

        // Strict JSON Schema validation of tool inputs before sending to MCP server
        validate_tool_arguments(&tool.input_schema, &arguments)?;

        let transport = self.get_or_reconnect(server_id).await?;
        let res = transport
            .request(
                "tools/call",
                Some(serde_json::json!({
                    "name": tool_name,
                    "arguments": arguments
                })),
            )
            .await?;

        self.db.log_event(
            "mcp",
            "info",
            &format!("Executed MCP tool '{tool_name}' on server '{}'", tool.server_name),
            None,
        );
        Ok(res)
    }

    pub async fn read_resource(&self, server_id: &str, uri: &str) -> AppResult<serde_json::Value> {
        let transport = self.get_or_reconnect(server_id).await?;
        transport
            .request("resources/read", Some(serde_json::json!({ "uri": uri })))
            .await
    }

    pub async fn get_prompt(
        &self,
        server_id: &str,
        name: &str,
        arguments: serde_json::Value,
    ) -> AppResult<serde_json::Value> {
        let transport = self.get_or_reconnect(server_id).await?;
        transport
            .request(
                "prompts/get",
                Some(serde_json::json!({
                    "name": name,
                    "arguments": arguments
                })),
            )
            .await
    }

    pub async fn health_check_all(&self) -> AppResult<()> {
        let servers = self.db.list_mcp_servers()?;
        for srv in servers {
            if !srv.enabled {
                continue;
            }
            let conn_opt = self.connections.read().await.get(&srv.id).cloned();
            if let Some(conn) = conn_opt {
                let alive = conn.is_alive().await;
                let ping_ok = if alive {
                    conn.request("ping", Some(serde_json::json!({}))).await.is_ok()
                        || srv.transport == "streamable_http"
                } else {
                    false
                };
                if !ping_ok && srv.auto_reconnect {
                    let _ = self.reconnect_with_limit(&srv).await;
                }
            }
        }
        Ok(())
    }

    async fn get_or_reconnect(&self, server_id: &str) -> AppResult<Arc<ActiveTransport>> {
        if let Some(conn) = self.connections.read().await.get(server_id).cloned() {
            if conn.is_alive().await {
                return Ok(conn);
            }
        }

        let srv = self
            .db
            .get_mcp_server(server_id)?
            .ok_or_else(|| AppError::NotFound(format!("MCP server '{server_id}' not found")))?;
        if !srv.auto_reconnect {
            return Err(AppError::Mcp(format!(
                "MCP server '{}' is disconnected",
                srv.name
            )));
        }
        self.reconnect_with_limit(&srv).await?;
        self.connections
            .read()
            .await
            .get(server_id)
            .cloned()
            .ok_or_else(|| AppError::Mcp(format!("Failed to reconnect '{}'", srv.name)))
    }

    async fn reconnect_with_limit(&self, srv: &McpServer) -> AppResult<()> {
        let limit = srv.max_reconnects.min(5).max(1);
        for attempt in 1..=limit {
            self.db.log_event(
                "mcp",
                "warn",
                &format!("Reconnecting '{}' (attempt {attempt}/{limit})", srv.name),
                None,
            );
            if self.connect_server(&srv.id).await.is_ok() {
                return Ok(());
            }
            tokio::time::sleep(std::time::Duration::from_millis(300 * attempt as u64)).await;
        }
        Err(AppError::Mcp(format!(
            "Exceeded max reconnect attempts ({limit}) for '{}'",
            srv.name
        )))
    }
}

pub fn validate_tool_arguments(
    schema: &serde_json::Value,
    arguments: &serde_json::Value,
) -> AppResult<()> {
    let compiled = jsonschema::JSONSchema::compile(schema)
        .map_err(|e| AppError::Validation(format!("Invalid tool JSON Schema: {e}")))?;
    if let Err(errors) = compiled.validate(arguments) {
        let msgs: Vec<String> = errors.map(|e| e.to_string()).collect();
        return Err(AppError::Validation(format!(
            "Tool input failed JSON Schema validation: {}",
            msgs.join("; ")
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{routing::post, Json, Router};
    use chrono::Utc;
    use tempfile::TempDir;
    use tokio::net::TcpListener;

    async fn start_mock_streamable_http_mcp() -> String {
        let app = Router::new().route(
            "/mcp",
            post(|Json(req): Json<serde_json::Value>| async move {
                let id = req.get("id").cloned().unwrap_or(serde_json::json!(null));
                let method = req.get("method").and_then(|v| v.as_str()).unwrap_or("");
                let result = match method {
                    "initialize" => serde_json::json!({
                        "protocolVersion": "2025-03-26",
                        "capabilities": { "tools": {} },
                        "serverInfo": { "name": "mock-http-mcp", "version": "1.0.0" }
                    }),
                    "tools/list" => serde_json::json!({
                        "tools": [{
                            "name": "echo_sum",
                            "description": "Adds two numbers",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "a": { "type": "number" },
                                    "b": { "type": "number" }
                                },
                                "required": ["a", "b"]
                            }
                        }]
                    }),
                    "tools/call" => {
                        let a = req.pointer("/params/arguments/a").and_then(|v| v.as_i64()).unwrap_or(0);
                        let b = req.pointer("/params/arguments/b").and_then(|v| v.as_i64()).unwrap_or(0);
                        serde_json::json!({
                            "content": [{ "type": "text", "text": format!("{}", a + b) }]
                        })
                    }
                    "ping" => serde_json::json!({}),
                    _ => serde_json::json!({}),
                };
                Json(serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": result
                }))
            }),
        );
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        format!("http://{addr}/mcp")
    }

    #[tokio::test]
    async fn connects_discovers_validates_and_calls_streamable_http_mcp() {
        let endpoint = start_mock_streamable_http_mcp().await;
        let dir = TempDir::new().unwrap();
        let redactor = Arc::new(SecretRedactor::new());
        let db = Arc::new(Database::open_in_memory(dir.path().to_path_buf(), redactor.clone()).unwrap());
        let creds = Arc::new(CredentialStore::new_in_memory(redactor.clone()));
        let hub = McpHubManager::new(db.clone(), creds, redactor);

        let now = Utc::now().to_rfc3339();
        db.upsert_mcp_server(&McpServer {
            id: "srv-http".into(),
            name: "Mock HTTP MCP".into(),
            description: "Test".into(),
            source: "local".into(),
            trust_level: "trusted".into(),
            transport: "streamable_http".into(),
            endpoint_or_command: endpoint,
            args: vec![],
            env_keys: vec![],
            plain_env: HashMap::new(),
            auth_type: "none".into(),
            auth_config: serde_json::json!({}),
            has_auth_secret: false,
            auto_reconnect: true,
            max_reconnects: 2,
            enabled: true,
            status: "disconnected".into(),
            last_error: None,
            server_info: None,
            created_at: now.clone(),
            updated_at: now,
        })
        .unwrap();

        let srv = hub.connect_server("srv-http").await.unwrap();
        assert_eq!(srv.status, "connected");

        let tools = db.list_mcp_tools().unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].name, "echo_sum");

        // Invalid input rejected by JSON Schema validator
        let bad = hub
            .call_tool("srv-http", "echo_sum", serde_json::json!({ "a": "oops" }))
            .await;
        assert!(bad.is_err());

        // Valid input succeeds
        let ok = hub
            .call_tool("srv-http", "echo_sum", serde_json::json!({ "a": 7, "b": 5 }))
            .await
            .unwrap();
        assert_eq!(ok["content"][0]["text"], "12");

        hub.disconnect_server("srv-http").await.unwrap();
    }

    #[tokio::test]
    async fn connects_and_calls_real_stdio_mcp_process() {
        let dir = TempDir::new().unwrap();
        let script_path = dir.path().join("mock_mcp.py");
        std::fs::write(
            &script_path,
            r#"import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    req = json.loads(line)
    if "id" not in req: continue
    m = req.get("method")
    if m == "initialize":
        res = {"protocolVersion": "2025-03-26", "capabilities": {"tools": {}}, "serverInfo": {"name": "py-stdio", "version": "0.1"}}
    elif m == "tools/list":
        res = {"tools": [{"name": "upper", "description": "Uppercases text", "inputSchema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}}]}
    elif m == "tools/call":
        txt = req.get("params", {}).get("arguments", {}).get("text", "")
        res = {"content": [{"type": "text", "text": txt.upper()}]}
    else:
        res = {}
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": req["id"], "result": res}) + "\n")
    sys.stdout.flush()
"#,
        )
        .unwrap();

        let redactor = Arc::new(SecretRedactor::new());
        let db = Arc::new(Database::open_in_memory(dir.path().to_path_buf(), redactor.clone()).unwrap());
        let creds = Arc::new(CredentialStore::new_in_memory(redactor.clone()));
        let hub = McpHubManager::new(db.clone(), creds, redactor);
        let now = Utc::now().to_rfc3339();

        db.upsert_mcp_server(&McpServer {
            id: "srv-stdio".into(),
            name: "Python Stdio MCP".into(),
            description: "Test".into(),
            source: "local".into(),
            trust_level: "trusted".into(),
            transport: "stdio".into(),
            endpoint_or_command: "python".into(),
            args: vec![script_path.to_string_lossy().to_string()],
            env_keys: vec![],
            plain_env: HashMap::new(),
            auth_type: "none".into(),
            auth_config: serde_json::json!({}),
            has_auth_secret: false,
            auto_reconnect: false,
            max_reconnects: 1,
            enabled: true,
            status: "disconnected".into(),
            last_error: None,
            server_info: None,
            created_at: now.clone(),
            updated_at: now,
        })
        .unwrap();

        let srv = hub.connect_server("srv-stdio").await.unwrap();
        assert_eq!(srv.status, "connected");
        let out = hub
            .call_tool("srv-stdio", "upper", serde_json::json!({ "text": "noctra" }))
            .await
            .unwrap();
        assert_eq!(out["content"][0]["text"], "NOCTRA");
        hub.disconnect_server("srv-stdio").await.unwrap();
    }
}
