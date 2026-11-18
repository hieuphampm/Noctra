use crate::error::{AppError, AppResult};
use crate::security::credentials::CredentialStore;
use crate::security::redaction::SecretRedactor;
use crate::storage::models::{AiProvider, ChatAttachment, ChatMessage, TokenUsage};
use base64::Engine;
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTestResult {
    pub ok: bool,
    pub latency_ms: u64,
    pub models_endpoint_supported: bool,
    pub models_found: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiToolDef {
    #[serde(rename = "type")]
    pub kind: String,
    pub function: OpenAiFunctionDef,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiFunctionDef {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct CompletionResponse {
    pub content: String,
    pub tool_calls: Vec<ParsedToolCall>,
    pub token_usage: Option<TokenUsage>,
    pub finish_reason: Option<String>,
}

pub fn normalize_base_url(base_url: &str) -> String {
    let mut trimmed = base_url.trim().trim_end_matches('/').to_string();
    for suffix in ["/chat/completions", "/models"] {
        if let Some(stripped) = trimmed.strip_suffix(suffix) {
            trimmed = stripped.trim_end_matches('/').to_string();
            break;
        }
    }
    trimmed
}

fn is_loopback_url(base_url: &str) -> bool {
    url::Url::parse(base_url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_ascii_lowercase()))
        .is_some_and(|host| {
            matches!(
                host.as_str(),
                "localhost" | "127.0.0.1" | "::1" | "[::1]" | "0.0.0.0"
            ) || host.ends_with(".localhost")
        })
}

fn build_http_client(base_url: &str, timeout_secs: u64) -> AppResult<reqwest::Client> {
    let mut builder = reqwest::Client::builder().timeout(Duration::from_secs(timeout_secs));
    if is_loopback_url(base_url) {
        builder = builder.no_proxy();
    }
    builder.build().map_err(|e| AppError::Provider(e.to_string()))
}

fn format_http_error(status: u16, body: &str) -> String {
    let trimmed = body.trim();
    let lower = trimmed.to_ascii_lowercase();
    let cleaned = if lower.contains("<html") || lower.contains("<!doctype") {
        let tag_re = regex::Regex::new(r"<[^>]+>").unwrap();
        let ws_re = regex::Regex::new(r"\s+").unwrap();
        let no_tags = tag_re.replace_all(trimmed, " ");
        ws_re.replace_all(no_tags.trim(), " ").into_owned()
    } else {
        trimmed.to_string()
    };

    let summary = truncate(&cleaned, 280);
    if status == 502 {
        if summary.is_empty() {
            "HTTP 502 Bad Gateway — upstream AI server is unreachable or offline. Verify the Base URL, running server, and any proxy/VPN.".into()
        } else {
            format!(
                "HTTP 502 ({summary}) — upstream AI server is unreachable or offline. Verify the Base URL, running server, and any proxy/VPN."
            )
        }
    } else if summary.is_empty() {
        format!("HTTP {status}")
    } else {
        format!("HTTP {status}: {summary}")
    }
}

pub fn provider_secret_key(provider_id: &str) -> String {
    format!("provider:{provider_id}")
}

fn build_headers(provider: &AiProvider, api_key: Option<&str>) -> AppResult<HeaderMap> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    if let Some(key) = api_key {
        let trimmed = key.trim();
        let token = trimmed
            .strip_prefix("Bearer ")
            .or_else(|| trimmed.strip_prefix("bearer "))
            .unwrap_or(trimmed)
            .trim();
        if !token.is_empty() {
            let val = HeaderValue::from_str(&format!("Bearer {token}"))
                .map_err(|e| AppError::Validation(format!("Invalid API key header characters: {e}")))?;
            headers.insert(AUTHORIZATION, val);
        }
    }

    for (k, v) in &provider.custom_headers {
        let name = HeaderName::from_bytes(k.trim().as_bytes())
            .map_err(|e| AppError::Validation(format!("Invalid custom header name '{k}': {e}")))?;
        let val = HeaderValue::from_str(v.trim())
            .map_err(|e| AppError::Validation(format!("Invalid custom header value for '{k}': {e}")))?;
        headers.insert(name, val);
    }

    Ok(headers)
}

pub async fn fetch_models(
    provider: &AiProvider,
    creds: &CredentialStore,
    redactor: &SecretRedactor,
) -> AppResult<Vec<String>> {
    let api_key = creds.get_secret(&provider_secret_key(&provider.id))?;
    let base_url = normalize_base_url(&provider.base_url);
    let client = build_http_client(&base_url, provider.timeout_secs.max(5))?;

    let headers = build_headers(provider, api_key.as_deref())?;
    let url = format!("{base_url}/models");

    let resp = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| AppError::Provider(redactor.redact(&format!("Failed to connect to {url}: {e}"))))?;

    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| AppError::Provider(redactor.redact(&e.to_string())))?;

    if !status.is_success() {
        return Err(AppError::Provider(redactor.redact(&format!(
            "GET /models returned {}",
            format_http_error(status.as_u16(), &body)
        ))));
    }

    let json: serde_json::Value = serde_json::from_str(&body).map_err(|_| {
        AppError::Provider("Provider returned non-JSON response from /models".into())
    })?;

    if let Some(arr) = json.get("data").and_then(|v| v.as_array()) {
        let mut ids: Vec<String> = arr
            .iter()
            .filter_map(|item| item.get("id").and_then(|v| v.as_str()).map(String::from))
            .collect();
        ids.sort();
        ids.dedup();
        return Ok(ids);
    }

    if let Some(arr) = json.get("models").and_then(|v| v.as_array()) {
        let mut ids: Vec<String> = arr
            .iter()
            .filter_map(|item| {
                item.get("id")
                    .or_else(|| item.get("name"))
                    .and_then(|v| v.as_str())
                    .map(String::from)
            })
            .collect();
        ids.sort();
        ids.dedup();
        return Ok(ids);
    }

    Err(AppError::Provider(
        "Endpoint responded 200 OK but payload did not follow OpenAI /models { data: [{ id }] } format".into(),
    ))
}

pub async fn test_provider_connection(
    provider: &AiProvider,
    creds: &CredentialStore,
    redactor: &SecretRedactor,
) -> AppResult<ProviderTestResult> {
    let start = Instant::now();
    match fetch_models(provider, creds, redactor).await {
        Ok(models) => Ok(ProviderTestResult {
            ok: true,
            latency_ms: start.elapsed().as_millis() as u64,
            models_endpoint_supported: true,
            models_found: models.len(),
            message: format!("Connected cleanly. Discovered {} model(s).", models.len()),
        }),
        Err(models_err) => {
            // Probe /chat/completions minimally if /models is unsupported
            let api_key = creds.get_secret(&provider_secret_key(&provider.id))?;
            let base_url = normalize_base_url(&provider.base_url);
            let client = build_http_client(&base_url, provider.timeout_secs.max(5))?;
            let headers = build_headers(provider, api_key.as_deref())?;
            let url = format!("{base_url}/chat/completions");
            let probe = serde_json::json!({
                "model": provider.model_id,
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 1,
                "stream": false
            });
            match client.post(&url).headers(headers).json(&probe).send().await {
                Ok(resp) if resp.status().is_success() => Ok(ProviderTestResult {
                    ok: true,
                    latency_ms: start.elapsed().as_millis() as u64,
                    models_endpoint_supported: false,
                    models_found: 0,
                    message: format!(
                        "Chat completions reachable (/models not supported: {})",
                        models_err
                    ),
                }),
                Ok(resp) => {
                    let status = resp.status();
                    let body = resp.text().await.unwrap_or_default();
                    Ok(ProviderTestResult {
                        ok: false,
                        latency_ms: start.elapsed().as_millis() as u64,
                        models_endpoint_supported: false,
                        models_found: 0,
                        message: redactor.redact(&format_http_error(status.as_u16(), &body)),
                    })
                }
                Err(e) => Ok(ProviderTestResult {
                    ok: false,
                    latency_ms: start.elapsed().as_millis() as u64,
                    models_endpoint_supported: false,
                    models_found: 0,
                    message: redactor.redact(&format!("Connection failed: {e}")),
                }),
            }
        }
    }
}

pub fn build_openai_messages(
    system_prompt: Option<&str>,
    history: &[ChatMessage],
) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    if let Some(sys) = system_prompt {
        if !sys.trim().is_empty() {
            out.push(serde_json::json!({
                "role": "system",
                "content": sys
            }));
        }
    }

    for msg in history {
        if msg.role == "tool" {
            out.push(serde_json::json!({
                "role": "tool",
                "tool_call_id": msg.tool_call_id.clone().unwrap_or_default(),
                "content": msg.content
            }));
            continue;
        }

        if msg.role == "assistant" && !msg.tool_calls.is_empty() {
            let tool_calls: Vec<serde_json::Value> = msg
                .tool_calls
                .iter()
                .map(|tc| {
                    serde_json::json!({
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.name,
                            "arguments": tc.arguments.to_string()
                        }
                    })
                })
                .collect();
            out.push(serde_json::json!({
                "role": "assistant",
                "content": if msg.content.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(msg.content.clone()) },
                "tool_calls": tool_calls
            }));
            continue;
        }

        let has_images = msg
            .attachments
            .iter()
            .any(|a| a.kind == "image" && a.data_url.is_some());
        let text_attachments: Vec<String> = msg
            .attachments
            .iter()
            .filter_map(|a| {
                a.extracted_text.as_ref().map(|txt| {
                    format!("\n\n[Attached file: {}]\n{}", a.name, txt)
                })
            })
            .collect();
        let full_text = if text_attachments.is_empty() {
            msg.content.clone()
        } else {
            format!("{}{}", msg.content, text_attachments.join(""))
        };

        if has_images && msg.role == "user" {
            let mut parts = vec![serde_json::json!({
                "type": "text",
                "text": full_text
            })];
            for att in &msg.attachments {
                if att.kind == "image" {
                    if let Some(url) = &att.data_url {
                        parts.push(serde_json::json!({
                            "type": "image_url",
                            "image_url": { "url": url }
                        }));
                    }
                }
            }
            out.push(serde_json::json!({
                "role": msg.role,
                "content": parts
            }));
        } else {
            out.push(serde_json::json!({
                "role": msg.role,
                "content": full_text
            }));
        }
    }

    out
}

pub async fn complete_chat<F>(
    provider: &AiProvider,
    model_override: Option<&str>,
    messages: Vec<serde_json::Value>,
    tools: Option<&[OpenAiToolDef]>,
    creds: &CredentialStore,
    redactor: &SecretRedactor,
    cancel: CancellationToken,
    mut on_delta: F,
) -> AppResult<CompletionResponse>
where
    F: FnMut(&str) + Send,
{
    let api_key = creds.get_secret(&provider_secret_key(&provider.id))?;
    let base_url = normalize_base_url(&provider.base_url);
    let client = build_http_client(&base_url, provider.timeout_secs.max(10))?;
    let headers = build_headers(provider, api_key.as_deref())?;
    let url = format!("{base_url}/chat/completions");
    let model = model_override
        .filter(|m| !m.trim().is_empty())
        .unwrap_or(&provider.model_id);

    let mut payload = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": provider.temperature,
        "top_p": provider.top_p,
        "max_tokens": provider.max_tokens,
        "stream": provider.streaming
    });

    if let Some(tool_defs) = tools {
        if !tool_defs.is_empty() {
            payload["tools"] = serde_json::to_value(tool_defs)?;
            payload["tool_choice"] = serde_json::json!("auto");
        }
    }

    let req_fut = client.post(&url).headers(headers).json(&payload).send();
    let resp = tokio::select! {
        _ = cancel.cancelled() => return Err(AppError::Cancelled),
        res = req_fut => res.map_err(|e| AppError::Provider(redactor.redact(&format!("Request failed: {e}"))))?,
    };

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Provider(redactor.redact(&format_http_error(
            status.as_u16(),
            &body,
        ))));
    }

    let content_type = resp
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();

    if provider.streaming && content_type.contains("text/event-stream") {
        parse_sse_stream(resp, cancel, &mut on_delta).await
    } else {
        let json: serde_json::Value = resp.json().await.map_err(|e| {
            AppError::Provider(redactor.redact(&format!("Invalid JSON completion payload: {e}")))
        })?;
        parse_non_streaming_json(&json, &mut on_delta)
    }
}

fn parse_non_streaming_json<F>(
    json: &serde_json::Value,
    on_delta: &mut F,
) -> AppResult<CompletionResponse>
where
    F: FnMut(&str),
{
    let choice = json
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .ok_or_else(|| {
            AppError::Provider(
                "Response missing 'choices[0]'; provider may not be OpenAI-compatible".into(),
            )
        })?;

    let message = choice.get("message").unwrap_or(choice);
    let content = message
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if !content.is_empty() {
        on_delta(&content);
    }

    let mut tool_calls = Vec::new();
    if let Some(arr) = message.get("tool_calls").and_then(|v| v.as_array()) {
        for tc in arr {
            let id = tc
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("call_0")
                .to_string();
            let name = tc
                .pointer("/function/name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let raw_args = tc
                .pointer("/function/arguments")
                .and_then(|v| v.as_str())
                .unwrap_or("{}");
            let arguments: serde_json::Value =
                serde_json::from_str(raw_args).unwrap_or(serde_json::json!({}));
            if !name.is_empty() {
                tool_calls.push(ParsedToolCall {
                    id,
                    name,
                    arguments,
                });
            }
        }
    }

    let token_usage = parse_usage(json.get("usage"));
    let finish_reason = choice
        .get("finish_reason")
        .and_then(|v| v.as_str())
        .map(String::from);

    Ok(CompletionResponse {
        content,
        tool_calls,
        token_usage,
        finish_reason,
    })
}

async fn parse_sse_stream<F>(
    resp: reqwest::Response,
    cancel: CancellationToken,
    on_delta: &mut F,
) -> AppResult<CompletionResponse>
where
    F: FnMut(&str),
{
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    let mut full_content = String::new();
    let mut finish_reason: Option<String> = None;
    let mut token_usage: Option<TokenUsage> = None;
    // Track incremental tool_calls by index
    let mut tool_acc: HashMap<usize, (String, String, String)> = HashMap::new();

    loop {
        let chunk_opt = tokio::select! {
            _ = cancel.cancelled() => return Err(AppError::Cancelled),
            item = stream.next() => item,
        };
        let Some(chunk_res) = chunk_opt else {
            break;
        };
        let bytes = chunk_res.map_err(|e| AppError::Provider(format!("Stream error: {e}")))?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim_end_matches('\r').to_string();
            buffer.drain(..=pos);

            if line.is_empty() || line.starts_with(':') {
                continue;
            }
            if let Some(data) = line.strip_prefix("data:") {
                let data = data.trim();
                if data == "[DONE]" {
                    continue;
                }
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(usage) = parse_usage(json.get("usage")) {
                        token_usage = Some(usage);
                    }
                    if let Some(choice) = json
                        .get("choices")
                        .and_then(|c| c.as_array())
                        .and_then(|a| a.first())
                    {
                        if let Some(fr) = choice.get("finish_reason").and_then(|v| v.as_str()) {
                            finish_reason = Some(fr.to_string());
                        }
                        if let Some(delta) = choice.get("delta") {
                            if let Some(text) = delta.get("content").and_then(|v| v.as_str()) {
                                full_content.push_str(text);
                                on_delta(text);
                            }
                            if let Some(tcs) = delta.get("tool_calls").and_then(|v| v.as_array()) {
                                for tc in tcs {
                                    let idx = tc.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                                    let entry = tool_acc.entry(idx).or_insert_with(|| {
                                        (format!("call_{idx}"), String::new(), String::new())
                                    });
                                    if let Some(id) = tc.get("id").and_then(|v| v.as_str()) {
                                        if !id.is_empty() {
                                            entry.0 = id.to_string();
                                        }
                                    }
                                    if let Some(name) = tc.pointer("/function/name").and_then(|v| v.as_str()) {
                                        entry.1.push_str(name);
                                    }
                                    if let Some(args) = tc.pointer("/function/arguments").and_then(|v| v.as_str()) {
                                        entry.2.push_str(args);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut indices: Vec<usize> = tool_acc.keys().copied().collect();
    indices.sort_unstable();
    let mut tool_calls = Vec::new();
    for idx in indices {
        if let Some((id, name, raw_args)) = tool_acc.remove(&idx) {
            if !name.is_empty() {
                let arguments = serde_json::from_str(&raw_args).unwrap_or(serde_json::json!({}));
                tool_calls.push(ParsedToolCall {
                    id,
                    name,
                    arguments,
                });
            }
        }
    }

    Ok(CompletionResponse {
        content: full_content,
        tool_calls,
        token_usage,
        finish_reason,
    })
}

fn parse_usage(usage_val: Option<&serde_json::Value>) -> Option<TokenUsage> {
    let u = usage_val?;
    if u.is_null() {
        return None;
    }
    Some(TokenUsage {
        prompt_tokens: u.get("prompt_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        completion_tokens: u.get("completion_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        total_tokens: u.get("total_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
    })
}

pub fn load_local_attachment(path: &Path) -> AppResult<ChatAttachment> {
    let bytes = std::fs::read(path)?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("attachment")
        .to_string();
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let (mime_type, kind, extracted_text, data_url) = match ext.as_str() {
        "png" | "jpg" | "jpeg" | "webp" | "gif" => {
            let mime = match ext.as_str() {
                "png" => "image/png",
                "webp" => "image/webp",
                "gif" => "image/gif",
                _ => "image/jpeg",
            };
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            (
                mime.to_string(),
                "image".to_string(),
                None,
                Some(format!("data:{mime};base64,{b64}")),
            )
        }
        "pdf" => {
            let text = extract_basic_pdf_text(&bytes);
            (
                "application/pdf".to_string(),
                "pdf".to_string(),
                Some(text),
                None,
            )
        }
        "txt" | "md" | "json" | "csv" | "yaml" | "yml" | "toml" | "rs" | "ts" | "tsx" | "js"
        | "jsx" | "py" | "html" | "css" | "xml" | "sql" | "log" => {
            let text = String::from_utf8_lossy(&bytes).to_string();
            (
                "text/plain".to_string(),
                "text".to_string(),
                Some(truncate(&text, 60_000)),
                None,
            )
        }
        _ => {
            if let Ok(text) = String::from_utf8(bytes.clone()) {
                (
                    "text/plain".to_string(),
                    "text".to_string(),
                    Some(truncate(&text, 60_000)),
                    None,
                )
            } else {
                (
                    "application/octet-stream".to_string(),
                    "binary".to_string(),
                    Some(format!("[Binary file: {name}, {} bytes]", bytes.len())),
                    None,
                )
            }
        }
    };

    Ok(ChatAttachment {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        mime_type,
        size_bytes: bytes.len(),
        kind,
        extracted_text,
        data_url,
    })
}

/// Lightweight best-effort local PDF ASCII/UTF-8 text literal extractor (for uncompressed PDF text operators).
fn extract_basic_pdf_text(bytes: &[u8]) -> String {
    let raw = String::from_utf8_lossy(bytes);
    let re = regex::Regex::new(r"\(([^()\\]{2,200})\)\s*Tj").unwrap();
    let parts: Vec<String> = re
        .captures_iter(&raw)
        .filter_map(|c| c.get(1).map(|m| m.as_str().to_string()))
        .collect();
    if parts.is_empty() {
        format!(
            "[PDF attached ({} bytes). No uncompressed inline Tj text streams detected; consider extracting or pasting text if compressed.]",
            bytes.len()
        )
    } else {
        truncate(&parts.join(" "), 50_000)
    }
}

fn truncate(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(max_chars).collect();
        out.push_str("...");
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use axum::{
        response::{sse::Event, IntoResponse, Sse},
        routing::{get, post},
        Json, Router,
    };
    use futures_util::stream;
    use tokio::net::TcpListener;

    async fn start_mock_openai_server() -> String {
        let app = Router::new()
            .route(
                "/v1/models",
                get(|| async {
                    Json(serde_json::json!({
                        "data": [{"id": "mock-gpt-4o"}, {"id": "mock-coder"}]
                    }))
                }),
            )
            .route(
                "/v1/chat/completions",
                post(|Json(body): Json<serde_json::Value>| async move {
                    let is_stream = body.get("stream").and_then(|v| v.as_bool()).unwrap_or(false);
                    if is_stream {
                        let events = vec![
                            Ok::<_, std::convert::Infallible>(
                                Event::default().data(r#"{"choices":[{"delta":{"content":"Hello "}}]}"#),
                            ),
                            Ok(Event::default().data(
                                r#"{"choices":[{"delta":{"content":"world!"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}"#,
                            )),
                            Ok(Event::default().data("[DONE]")),
                        ];
                        Sse::new(stream::iter(events)).into_response()
                    } else {
                        Json(serde_json::json!({
                            "choices": [{
                                "message": {"role": "assistant", "content": "Non-streaming hello!"},
                                "finish_reason": "stop"
                            }],
                            "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8}
                        }))
                        .into_response()
                    }
                }),
            );

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        format!("http://{addr}/v1")
    }

    #[tokio::test]
    async fn fetches_models_and_streams_chat_completions() {
        let base_url = start_mock_openai_server().await;
        let redactor = Arc::new(SecretRedactor::new());
        let creds = CredentialStore::new_in_memory(redactor.clone());
        creds.set_secret("provider:p1", "sk-mock-key-123456").unwrap();

        let provider = AiProvider {
            id: "p1".into(),
            name: "Mock OpenAI".into(),
            base_url,
            model_id: "mock-gpt-4o".into(),
            custom_headers: HashMap::new(),
            temperature: 0.7,
            top_p: 1.0,
            max_tokens: 1024,
            timeout_secs: 15,
            streaming: true,
            default_system_prompt: String::new(),
            has_api_key: true,
            created_at: String::new(),
            updated_at: String::new(),
        };

        let models = fetch_models(&provider, &creds, &redactor).await.unwrap();
        assert_eq!(models, vec!["mock-coder", "mock-gpt-4o"]);

        let mut chunks = Vec::new();
        let res = complete_chat(
            &provider,
            None,
            vec![serde_json::json!({"role": "user", "content": "hi"})],
            None,
            &creds,
            &redactor,
            CancellationToken::new(),
            |delta| chunks.push(delta.to_string()),
        )
        .await
        .unwrap();

        assert_eq!(res.content, "Hello world!");
        assert_eq!(chunks.concat(), "Hello world!");
        assert_eq!(res.token_usage.unwrap().total_tokens, 12);
    }

    #[test]
    fn normalizes_urls_bearer_keys_and_html_502_errors() {
        assert_eq!(
            normalize_base_url("http://localhost:11434/v1/chat/completions/"),
            "http://localhost:11434/v1"
        );
        assert_eq!(
            normalize_base_url("https://api.example.com/v1/models"),
            "https://api.example.com/v1"
        );
        assert!(is_loopback_url("http://localhost:11434/v1"));
        assert!(is_loopback_url("http://127.0.0.1:8080/v1"));
        assert!(!is_loopback_url("https://api.openai.com/v1"));

        let provider = AiProvider {
            id: "p1".into(),
            name: "Local".into(),
            base_url: "http://localhost:11434/v1".into(),
            model_id: "llama3.1".into(),
            custom_headers: HashMap::new(),
            temperature: 0.7,
            top_p: 1.0,
            max_tokens: 1024,
            timeout_secs: 30,
            streaming: true,
            default_system_prompt: String::new(),
            has_api_key: true,
            created_at: String::new(),
            updated_at: String::new(),
        };
        let headers = build_headers(&provider, Some("Bearer sk-test-123")).unwrap();
        assert_eq!(
            headers.get(AUTHORIZATION).unwrap().to_str().unwrap(),
            "Bearer sk-test-123"
        );

        let err = format_http_error(
            502,
            "<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n<body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx</center></body></html>",
        );
        assert!(!err.contains("<html>"));
        assert!(err.contains("HTTP 502"));
        assert!(err.contains("502 Bad Gateway"));
        assert!(err.contains("nginx"));
    }
}
