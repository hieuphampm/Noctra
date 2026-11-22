use serde::{Deserialize, Serialize};

pub const MCP_PROTOCOL_VERSION: &str = "2025-03-26";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: serde_json::Value,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcNotification {
    pub jsonrpc: String,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: Option<serde_json::Value>,
    pub result: Option<serde_json::Value>,
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i64,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

pub fn initialize_params() -> serde_json::Value {
    serde_json::json!({
        "protocolVersion": MCP_PROTOCOL_VERSION,
        "capabilities": {
            "roots": { "listChanged": false },
            "sampling": {}
        },
        "clientInfo": {
            "name": "NOCTRA STUDIO",
            "version": "0.1.3"
        }
    })
}

/// Infers coarse permission categories from an MCP tool's name and schema metadata
/// so the UI and permission manager can surface risk indicators accurately.
pub fn infer_tool_permissions(name: &str, description: &str) -> Vec<String> {
    let combined = format!("{name} {description}").to_ascii_lowercase();
    let mut perms = vec!["mcp_tools".to_string()];

    if combined.contains("write")
        || combined.contains("create")
        || combined.contains("save")
        || combined.contains("edit")
        || combined.contains("update")
    {
        perms.push("write_files".into());
    }
    if combined.contains("delete") || combined.contains("remove") || combined.contains("rm") {
        perms.push("delete_files".into());
    }
    if combined.contains("read") || combined.contains("list") || combined.contains("file") || combined.contains("dir") {
        perms.push("read_files".into());
    }
    if combined.contains("exec")
        || combined.contains("shell")
        || combined.contains("command")
        || combined.contains("run")
        || combined.contains("terminal")
    {
        perms.push("execute_commands".into());
    }
    if combined.contains("fetch")
        || combined.contains("http")
        || combined.contains("web")
        || combined.contains("search")
        || combined.contains("browse")
    {
        perms.push("internet_access".into());
    }
    perms.sort();
    perms.dedup();
    perms
}
