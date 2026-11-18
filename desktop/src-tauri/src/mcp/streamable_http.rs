use crate::error::{AppError, AppResult};
use crate::mcp::protocol::{
    JsonRpcNotification, JsonRpcRequest, JsonRpcResponse, MCP_PROTOCOL_VERSION,
};
use crate::security::redaction::SecretRedactor;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

/// Official MCP Streamable HTTP Transport (MCP 2025-03-26 specification):
/// - POST JSON-RPC requests with `Accept: application/json, text/event-stream`
/// - Tracks `Mcp-Session-Id` response header across requests
/// - Parses either direct JSON or SSE `data:` JSON-RPC response frames
/// - Sends HTTP DELETE with `Mcp-Session-Id` on session shutdown
pub struct StreamableHttpTransport {
    endpoint: String,
    client: reqwest::Client,
    session_id: Mutex<Option<String>>,
    auth_header: Option<(HeaderName, HeaderValue)>,
    extra_headers: HashMap<String, String>,
    next_id: AtomicU64,
    redactor: Arc<SecretRedactor>,
}

impl StreamableHttpTransport {
    pub fn new(
        endpoint: String,
        auth_type: &str,
        auth_config: &serde_json::Value,
        auth_secret: Option<String>,
        timeout_secs: u64,
        redactor: Arc<SecretRedactor>,
    ) -> AppResult<Self> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(timeout_secs.max(10)))
            .build()
            .map_err(|e| AppError::Mcp(e.to_string()))?;

        let mut auth_header = None;
        if let Some(secret) = auth_secret.filter(|s| !s.trim().is_empty()) {
            redactor.register_secret(&secret);
            match auth_type {
                "bearer" | "oauth" => {
                    let hv = HeaderValue::from_str(&format!("Bearer {}", secret.trim()))
                        .map_err(|e| AppError::Validation(format!("Invalid auth token: {e}")))?;
                    auth_header = Some((AUTHORIZATION, hv));
                }
                "custom_header" => {
                    let hname = auth_config
                        .get("headerName")
                        .and_then(|v| v.as_str())
                        .unwrap_or("X-API-Key");
                    let name = HeaderName::from_bytes(hname.as_bytes())
                        .map_err(|e| AppError::Validation(format!("Invalid header name: {e}")))?;
                    let hv = HeaderValue::from_str(secret.trim())
                        .map_err(|e| AppError::Validation(format!("Invalid header value: {e}")))?;
                    auth_header = Some((name, hv));
                }
                _ => {}
            }
        }

        let mut extra_headers = HashMap::new();
        if let Some(obj) = auth_config.get("headers").and_then(|v| v.as_object()) {
            for (k, v) in obj {
                if let Some(s) = v.as_str() {
                    extra_headers.insert(k.clone(), s.to_string());
                }
            }
        }

        Ok(Self {
            endpoint,
            client,
            session_id: Mutex::new(None),
            auth_header,
            extra_headers,
            next_id: AtomicU64::new(1),
            redactor,
        })
    }

    async fn build_headers(&self) -> AppResult<HeaderMap> {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(
            ACCEPT,
            HeaderValue::from_static("application/json, text/event-stream"),
        );
        headers.insert(
            HeaderName::from_static("mcp-protocol-version"),
            HeaderValue::from_static(MCP_PROTOCOL_VERSION),
        );

        if let Some(sid) = self.session_id.lock().await.as_ref() {
            if let Ok(hv) = HeaderValue::from_str(sid) {
                headers.insert(HeaderName::from_static("mcp-session-id"), hv);
            }
        }
        if let Some((k, v)) = &self.auth_header {
            headers.insert(k.clone(), v.clone());
        }
        for (k, v) in &self.extra_headers {
            if let (Ok(hn), Ok(hv)) = (
                HeaderName::from_bytes(k.as_bytes()),
                HeaderValue::from_str(v),
            ) {
                headers.insert(hn, hv);
            }
        }
        Ok(headers)
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
        let headers = self.build_headers().await?;

        let resp = self
            .client
            .post(&self.endpoint)
            .headers(headers)
            .json(&req)
            .send()
            .await
            .map_err(|e| {
                AppError::Mcp(self.redactor.redact(&format!(
                    "Streamable HTTP request '{method}' failed: {e}"
                )))
            })?;

        if let Some(sid) = resp
            .headers()
            .get("mcp-session-id")
            .and_then(|v| v.to_str().ok())
        {
            *self.session_id.lock().await = Some(sid.to_string());
        }

        let status = resp.status();
        let content_type = resp
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_ascii_lowercase();
        let body = resp.text().await.unwrap_or_default();

        if !status.is_success() {
            return Err(AppError::Mcp(self.redactor.redact(&format!(
                "MCP Streamable HTTP {method} returned HTTP {}: {body}",
                status.as_u16()
            ))));
        }

        let rpc: JsonRpcResponse = if content_type.contains("text/event-stream") {
            parse_sse_jsonrpc(&body, id).ok_or_else(|| {
                AppError::Mcp(format!("SSE response for '{method}' contained no JSON-RPC message"))
            })?
        } else {
            serde_json::from_str(&body).map_err(|e| {
                AppError::Mcp(self.redactor.redact(&format!(
                    "Invalid JSON-RPC response from MCP server: {e}"
                )))
            })?
        };

        if let Some(err) = rpc.error {
            return Err(AppError::Mcp(self.redactor.redact(&format!(
                "MCP error {} ({method}): {}",
                err.code, err.message
            ))));
        }

        Ok(rpc.result.unwrap_or(serde_json::json!({})))
    }

    pub async fn notify(&self, method: &str, params: Option<serde_json::Value>) -> AppResult<()> {
        let notif = JsonRpcNotification {
            jsonrpc: "2.0".into(),
            method: method.into(),
            params,
        };
        let headers = self.build_headers().await?;
        let resp = self
            .client
            .post(&self.endpoint)
            .headers(headers)
            .json(&notif)
            .send()
            .await
            .map_err(|e| AppError::Mcp(self.redactor.redact(&e.to_string())))?;

        if !resp.status().is_success() && resp.status().as_u16() != 202 {
            return Err(AppError::Mcp(format!(
                "Notification '{method}' rejected with HTTP {}",
                resp.status().as_u16()
            )));
        }
        Ok(())
    }

    pub async fn close(&self) {
        if let Some(sid) = self.session_id.lock().await.take() {
            if let Ok(mut headers) = self.build_headers().await {
                if let Ok(hv) = HeaderValue::from_str(&sid) {
                    headers.insert(HeaderName::from_static("mcp-session-id"), hv);
                }
                let _ = self.client.delete(&self.endpoint).headers(headers).send().await;
            }
        }
    }
}

fn parse_sse_jsonrpc(body: &str, expected_id: u64) -> Option<JsonRpcResponse> {
    let mut fallback = None;
    for block in body.split("\n\n") {
        let mut data_lines = Vec::new();
        for line in block.lines() {
            if let Some(d) = line.strip_prefix("data:") {
                data_lines.push(d.trim());
            }
        }
        if data_lines.is_empty() {
            continue;
        }
        let joined = data_lines.join("\n");
        if let Ok(msg) = serde_json::from_str::<JsonRpcResponse>(&joined) {
            if msg.id.as_ref().and_then(|v| v.as_u64()) == Some(expected_id) {
                return Some(msg);
            }
            fallback = Some(msg);
        }
    }
    fallback
}
