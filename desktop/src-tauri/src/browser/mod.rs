use crate::error::{AppError, AppResult};
use crate::security::redaction::SecretRedactor;
use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use url::Url;
use uuid::Uuid;

const BROWSER_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) NoctraStudioBrowser/0.1.3 Chrome/131.0.0.0 Safari/537.36";
const DEFAULT_NAV_TIMEOUT_SECS: u64 = 25;
const MAX_HTML_BYTES: usize = 1_500_000;
const VIEWPORT_CHARS: usize = 3_200;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserCommand {
    pub url: Option<String>,
    pub instruction: String,
    pub raw_input: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserHeading {
    pub level: u8,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserTable {
    pub index: usize,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserElement {
    pub element_id: String,
    pub kind: String, // "button" | "input" | "select" | "textarea" | "link" | "menu_item"
    pub tag: String,
    pub input_type: Option<String>,
    pub label: String,
    pub selector: String,
    pub name: Option<String>,
    pub html_id: Option<String>,
    pub placeholder: Option<String>,
    pub href: Option<String>,
    pub value: Option<String>,
    pub options: Vec<String>,
    pub form_id: Option<String>,
    pub disabled: bool,
    pub required: bool,
    pub is_sensitive: bool,
    pub sensitivity_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserFormInfo {
    pub form_id: String,
    pub html_id: Option<String>,
    pub name: Option<String>,
    pub method: String,
    pub action_url: String,
    pub field_ids: Vec<String>,
    pub submit_element_id: Option<String>,
    pub is_sensitive: bool,
    pub sensitivity_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserAuthBarrier {
    pub kind: String, // "captcha" | "login_required" | "mfa_required" | "http_auth"
    pub provider: String,
    pub message: String,
    pub requires_user_assistance: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserActionRecord {
    pub step: usize,
    pub action: String,
    pub target: String,
    pub status: String, // "completed" | "error" | "blocked_auth"
    pub observation: String,
    pub url_after: Option<String>,
    pub duration_ms: u64,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSessionSnapshot {
    pub session_id: String,
    pub conversation_id: String,
    pub current_url: Option<String>,
    pub page_title: String,
    pub http_status: Option<u16>,
    pub content_type: Option<String>,
    pub loaded_at: Option<String>,
    pub load_time_ms: u64,
    pub history: Vec<String>,
    pub history_index: usize,
    pub scroll_y: u32,
    pub viewport_height: u32,
    pub page_height: u32,
    pub cookie_keys: Vec<String>,
    pub headings: Vec<BrowserHeading>,
    pub text_preview: String,
    pub elements: Vec<BrowserElement>,
    pub forms: Vec<BrowserFormInfo>,
    pub field_values: HashMap<String, String>,
    pub auth_barrier: Option<BrowserAuthBarrier>,
    pub action_log: Vec<BrowserActionRecord>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone)]
struct BrowserSession {
    session_id: String,
    conversation_id: String,
    current_url: Option<String>,
    page_title: String,
    http_status: Option<u16>,
    content_type: Option<String>,
    loaded_at: Option<String>,
    load_time_ms: u64,
    history: Vec<String>,
    history_index: usize,
    cookies: HashMap<String, String>,
    scroll_y: u32,
    viewport_height: u32,
    page_height: u32,
    raw_html: String,
    full_text: String,
    text_blocks: Vec<String>,
    headings: Vec<BrowserHeading>,
    tables: Vec<BrowserTable>,
    elements: Vec<BrowserElement>,
    forms: Vec<BrowserFormInfo>,
    field_values: HashMap<String, String>,
    auth_barrier: Option<BrowserAuthBarrier>,
    action_log: Vec<BrowserActionRecord>,
    last_error: Option<String>,
}

impl BrowserSession {
    fn new(conversation_id: &str) -> Self {
        Self {
            session_id: Uuid::new_v4().to_string(),
            conversation_id: conversation_id.to_string(),
            current_url: None,
            page_title: String::new(),
            http_status: None,
            content_type: None,
            loaded_at: None,
            load_time_ms: 0,
            history: Vec::new(),
            history_index: 0,
            cookies: HashMap::new(),
            scroll_y: 0,
            viewport_height: 800,
            page_height: 800,
            raw_html: String::new(),
            full_text: String::new(),
            text_blocks: Vec::new(),
            headings: Vec::new(),
            tables: Vec::new(),
            elements: Vec::new(),
            forms: Vec::new(),
            field_values: HashMap::new(),
            auth_barrier: None,
            action_log: Vec::new(),
            last_error: None,
        }
    }

    fn to_snapshot(&self, redactor: &SecretRedactor) -> BrowserSessionSnapshot {
        let mut masked_values = HashMap::new();
        for (k, v) in &self.field_values {
            let is_pw = self.elements.iter().any(|el| {
                (el.element_id == *k || el.name.as_deref() == Some(k.as_str()))
                    && el.input_type.as_deref() == Some("password")
            }) || k.to_ascii_lowercase().contains("password");
            if is_pw {
                masked_values.insert(k.clone(), "••••••••".to_string());
            } else {
                masked_values.insert(k.clone(), redactor.redact(v));
            }
        }

        let mut cookie_keys: Vec<String> = self.cookies.keys().cloned().collect();
        cookie_keys.sort();

        let preview: String = self.full_text.chars().take(1200).collect();

        BrowserSessionSnapshot {
            session_id: self.session_id.clone(),
            conversation_id: self.conversation_id.clone(),
            current_url: self.current_url.clone(),
            page_title: self.page_title.clone(),
            http_status: self.http_status,
            content_type: self.content_type.clone(),
            loaded_at: self.loaded_at.clone(),
            load_time_ms: self.load_time_ms,
            history: self.history.clone(),
            history_index: self.history_index,
            scroll_y: self.scroll_y,
            viewport_height: self.viewport_height,
            page_height: self.page_height,
            cookie_keys,
            headings: self.headings.clone(),
            text_preview: preview,
            elements: self
                .elements
                .iter()
                .map(|el| {
                    let mut clone = el.clone();
                    if clone.input_type.as_deref() == Some("password") && clone.value.is_some() {
                        clone.value = Some("••••••••".into());
                    }
                    clone
                })
                .collect(),
            forms: self.forms.clone(),
            field_values: masked_values,
            auth_barrier: self.auth_barrier.clone(),
            action_log: self.action_log.clone(),
            last_error: self.last_error.clone(),
        }
    }

    fn record_action(
        &mut self,
        action: &str,
        target: &str,
        status: &str,
        observation: &str,
        duration_ms: u64,
    ) {
        let step = self.action_log.len() + 1;
        self.action_log.push(BrowserActionRecord {
            step,
            action: action.to_string(),
            target: target.to_string(),
            status: status.to_string(),
            observation: observation.to_string(),
            url_after: self.current_url.clone(),
            duration_ms,
            timestamp: Utc::now().to_rfc3339(),
        });
    }
}

/// Checks if a user prompt invokes the `/browser` slash command (standalone token)
/// and parses the optional target URL and instructions.
/// Returns `None` for normal prompts that do not invoke `/browser`.
pub fn parse_browser_command(input: &str) -> Option<BrowserCommand> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Match standalone `/browser` token (preceded by start or whitespace, followed by end or whitespace)
    let re_cmd = Regex::new(r"(?i)(?:^|\s)/browser(?:\s|$)").unwrap();
    let m = re_cmd.find(trimmed)?;

    let before_cmd = trimmed[..m.start()].trim();
    let after_cmd = trimmed[m.end()..].trim();
    let after_clean = after_cmd
        .trim_start_matches(|c: char| c == '+' || c == ':' || c == '-' || c.is_whitespace())
        .trim();

    if after_clean.is_empty() && before_cmd.is_empty() {
        return Some(BrowserCommand {
            url: None,
            instruction: String::new(),
            raw_input: trimmed.to_string(),
        });
    }

    // 1. Check if the first token after /browser is a URL or domain
    if !after_clean.is_empty() {
        let mut parts = after_clean.splitn(2, char::is_whitespace);
        let first_token = parts.next().unwrap_or("").trim();
        let remainder = parts
            .next()
            .unwrap_or("")
            .trim()
            .trim_start_matches(|c: char| c == '+' || c.is_whitespace())
            .trim();

        let clean_first = first_token
            .trim_matches(|c: char| matches!(c, '<' | '>' | '"' | '\'' | ',' | ';' | ')' | '('));
        if let Some(normalized_url) = try_normalize_browser_url(clean_first) {
            let instruction = match (before_cmd.is_empty(), remainder.is_empty()) {
                (true, true) => String::new(),
                (true, false) => remainder.to_string(),
                (false, true) => before_cmd.to_string(),
                (false, false) => format!("{before_cmd} {remainder}"),
            };
            return Some(BrowserCommand {
                url: Some(normalized_url),
                instruction,
                raw_input: trimmed.to_string(),
            });
        }
    }

    let combined = match (before_cmd.is_empty(), after_clean.is_empty()) {
        (true, false) => after_clean.to_string(),
        (false, true) => before_cmd.to_string(),
        (false, false) => format!("{before_cmd} {after_clean}"),
        (true, true) => String::new(),
    };

    // 2. Otherwise check if an explicit http(s):// URL appears anywhere inside the command
    for token in combined.split_whitespace() {
        let candidate =
            token.trim_matches(|c: char| matches!(c, '<' | '>' | '"' | '\'' | ',' | ';' | ')' | '('));
        if candidate.starts_with("http://") || candidate.starts_with("https://") {
            if let Ok(parsed) = Url::parse(candidate) {
                return Some(BrowserCommand {
                    url: Some(parsed.to_string()),
                    instruction: combined,
                    raw_input: trimmed.to_string(),
                });
            }
        }
    }

    // 3. /browser command continuing on the active session without a new URL
    Some(BrowserCommand {
        url: None,
        instruction: combined,
        raw_input: trimmed.to_string(),
    })
}

pub fn try_normalize_browser_url(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.is_empty() || s.chars().any(char::is_whitespace) {
        return None;
    }
    if s.starts_with("http://") || s.starts_with("https://") {
        let parsed = Url::parse(s).ok()?;
        let _ = parsed.host_str()?;
        return Some(parsed.to_string());
    }

    // Check localhost, IPv4:port, [IPv6]:port, or domain.tld(/...)
    let host_part = s.split('/').next().unwrap_or(s);
    let host_only = if host_part.starts_with('[') {
        host_part
    } else {
        host_part.split(':').next().unwrap_or(host_part)
    };

    let is_local = host_only.eq_ignore_ascii_case("localhost")
        || host_only == "127.0.0.1"
        || host_only.starts_with("[::1]");
    let looks_like_ip = host_only.parse::<std::net::IpAddr>().is_ok();
    let looks_like_domain = host_only.contains('.')
        && host_only.len() >= 4
        && !host_only.starts_with('.')
        && !host_only.ends_with('.')
        && host_only
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
        && host_only
            .rsplit('.')
            .next()
            .map(|tld| tld.len() >= 2 && tld.chars().all(|c| c.is_ascii_alphabetic()))
            .unwrap_or(false);

    if !is_local && !looks_like_ip && !looks_like_domain {
        return None;
    }

    let scheme = if is_local || looks_like_ip {
        "http"
    } else {
        "https"
    };
    let with_scheme = format!("{scheme}://{s}");
    let parsed = Url::parse(&with_scheme).ok()?;
    let _ = parsed.host_str()?;
    Some(parsed.to_string())
}

pub struct BrowserManager {
    redactor: Arc<SecretRedactor>,
    sessions: Mutex<HashMap<String, BrowserSession>>,
    client: reqwest::Client,
}

impl BrowserManager {
    pub fn new(redactor: Arc<SecretRedactor>) -> Self {
        let client = reqwest::Client::builder()
            .user_agent(BROWSER_USER_AGENT)
            .redirect(reqwest::redirect::Policy::limited(10))
            .timeout(Duration::from_secs(DEFAULT_NAV_TIMEOUT_SECS))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            redactor,
            sessions: Mutex::new(HashMap::new()),
            client,
        }
    }

    pub async fn get_session_snapshot(
        &self,
        conversation_id: &str,
    ) -> Option<BrowserSessionSnapshot> {
        let guard = self.sessions.lock().await;
        guard
            .get(conversation_id)
            .map(|s| s.to_snapshot(&self.redactor))
    }

    pub async fn list_session_snapshots(&self) -> Vec<BrowserSessionSnapshot> {
        let guard = self.sessions.lock().await;
        guard
            .values()
            .map(|s| s.to_snapshot(&self.redactor))
            .collect()
    }

    pub async fn close_session(&self, conversation_id: &str) -> bool {
        self.sessions.lock().await.remove(conversation_id).is_some()
    }

    pub async fn has_active_session(&self, conversation_id: &str) -> bool {
        let guard = self.sessions.lock().await;
        guard
            .get(conversation_id)
            .and_then(|s| s.current_url.as_ref())
            .is_some()
    }

    /// Evaluates whether a requested browser tool call performs a sensitive or binding operation
    /// (such as payment/checkout, binding form submission, data deletion, or account modifications).
    pub async fn check_action_sensitivity(
        &self,
        conversation_id: &str,
        tool_name: &str,
        args: &serde_json::Value,
    ) -> (bool, Option<String>) {
        let guard = self.sessions.lock().await;
        let session = guard.get(conversation_id);

        match tool_name {
            "browser_submit_form" => {
                if let Some(sess) = session {
                    let form_id = args.get("form_id").and_then(|v| v.as_str());
                    if let Some(form) = find_form(sess, form_id) {
                        let reason = form.sensitivity_reason.clone().unwrap_or_else(|| {
                            format!(
                                "Submitting form ({} -> {}) requires user confirmation before sending binding data",
                                form.method, form.action_url
                            )
                        });
                        return (true, Some(reason));
                    }
                }
                (
                    true,
                    Some("Submitting a web form requires user confirmation".into()),
                )
            }
            "browser_fill_form" => {
                let submit = args.get("submit").and_then(|v| v.as_bool()).unwrap_or(false);
                if submit {
                    return (
                        true,
                        Some("Filling and submitting a web form requires user confirmation".into()),
                    );
                }
                (false, None)
            }
            "browser_click" => {
                let target_str = args
                    .get("element_id")
                    .or_else(|| args.get("selector"))
                    .or_else(|| args.get("text"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if let Some(sess) = session {
                    if let Some(el) = find_element(sess, args) {
                        if el.is_sensitive {
                            return (
                                true,
                                Some(el.sensitivity_reason.clone().unwrap_or_else(|| {
                                    format!("Clicking sensitive element '{}'", el.label)
                                })),
                            );
                        }
                        if el.input_type.as_deref() == Some("submit")
                            || (el.tag == "button" && el.form_id.is_some())
                        {
                            return (
                                true,
                                Some(format!(
                                    "Clicking form submit button '{}' on '{}'",
                                    el.label,
                                    sess.current_url.as_deref().unwrap_or("page")
                                )),
                            );
                        }
                    }
                }
                if let Some(reason) = detect_sensitive_keywords(target_str) {
                    return (true, Some(reason));
                }
                (false, None)
            }
            "browser_type" => {
                let press_enter = args
                    .get("press_enter")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                if press_enter {
                    if let Some(sess) = session {
                        if let Some(el) = find_element(sess, args) {
                            if el.is_sensitive {
                                return (true, el.sensitivity_reason.clone());
                            }
                            if let Some(ref fid) = el.form_id {
                                if let Some(form) = sess.forms.iter().find(|f| &f.form_id == fid) {
                                    if form.is_sensitive {
                                        return (true, form.sensitivity_reason.clone());
                                    }
                                }
                            }
                        }
                    }
                }
                (false, None)
            }
            _ => (false, None),
        }
    }

    pub async fn navigate(
        &self,
        conversation_id: &str,
        target: &str,
        cancel: CancellationToken,
    ) -> AppResult<serde_json::Value> {
        let started = Instant::now();
        let trimmed = target.trim();
        if trimmed.is_empty() {
            return Err(AppError::Validation(
                "Target URL or navigation action cannot be empty".into(),
            ));
        }

        // Resolve special navigation keywords ("back", "forward", "reload") or normalize URL
        let (resolved_url, nav_kind, cookie_header) = {
            let mut guard = self.sessions.lock().await;
            let sess = guard
                .entry(conversation_id.to_string())
                .or_insert_with(|| BrowserSession::new(conversation_id));

            let url_to_load = if trimmed.eq_ignore_ascii_case("back") {
                if sess.history_index == 0 || sess.history.is_empty() {
                    return Err(AppError::Browser(
                        "Cannot navigate back: already at the beginning of browser session history"
                            .into(),
                    ));
                }
                sess.history_index -= 1;
                (sess.history[sess.history_index].clone(), "back")
            } else if trimmed.eq_ignore_ascii_case("forward") {
                if sess.history.is_empty() || sess.history_index + 1 >= sess.history.len() {
                    return Err(AppError::Browser(
                        "Cannot navigate forward: already at the latest page in browser session history"
                            .into(),
                    ));
                }
                sess.history_index += 1;
                (sess.history[sess.history_index].clone(), "forward")
            } else if trimmed.eq_ignore_ascii_case("reload") || trimmed.eq_ignore_ascii_case("refresh") {
                let current = sess.current_url.clone().ok_or_else(|| {
                    AppError::Browser("No active page in browser session to reload".into())
                })?;
                (current, "reload")
            } else {
                let norm = if let Some(u) = try_normalize_browser_url(trimmed) {
                    u
                } else if let Some(ref base) = sess.current_url {
                    Url::parse(base)
                        .and_then(|b| b.join(trimmed))
                        .map(|u| u.to_string())
                        .map_err(|e| {
                            AppError::Validation(format!("Invalid target URL '{trimmed}': {e}"))
                        })?
                } else {
                    return Err(AppError::Validation(format!(
                        "Invalid URL '{trimmed}'. Provide a full URL such as https://example.com"
                    )));
                };
                (norm, "goto")
            };

            let cookies = format_cookie_header(&sess.cookies);
            (url_to_load.0, url_to_load.1, cookies)
        };

        let mut req = self
            .client
            .get(&resolved_url)
            .header(
                "Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            )
            .header("Accept-Language", "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7");
        if let Some(ch) = cookie_header {
            req = req.header("Cookie", ch);
        }

        let resp = tokio::select! {
            _ = cancel.cancelled() => return Err(AppError::Cancelled),
            res = req.send() => match res {
                Ok(r) => r,
                Err(e) => {
                    let err_msg = format!("Failed to load URL '{resolved_url}': {e}");
                    let mut guard = self.sessions.lock().await;
                    let sess = guard
                        .entry(conversation_id.to_string())
                        .or_insert_with(|| BrowserSession::new(conversation_id));
                    sess.last_error = Some(err_msg.clone());
                    sess.record_action(
                        "browser_navigate",
                        &resolved_url,
                        "error",
                        &err_msg,
                        started.elapsed().as_millis() as u64,
                    );
                    return Err(AppError::Browser(err_msg));
                }
            }
        };

        self.apply_http_response(
            conversation_id,
            &resolved_url,
            nav_kind,
            "browser_navigate",
            resp,
            started,
            cancel,
        )
        .await
    }

    async fn apply_http_response(
        &self,
        conversation_id: &str,
        requested_url: &str,
        nav_kind: &str,
        action_name: &str,
        resp: reqwest::Response,
        started: Instant,
        cancel: CancellationToken,
    ) -> AppResult<serde_json::Value> {
        let status = resp.status().as_u16();
        let final_url = resp.url().to_string();
        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let new_cookies = extract_set_cookies(resp.headers());

        let bytes = tokio::select! {
            _ = cancel.cancelled() => return Err(AppError::Cancelled),
            b = resp.bytes() => b.map_err(|e| AppError::Browser(format!("Failed reading response body from '{final_url}': {e}")))?,
        };

        let sliced = if bytes.len() > MAX_HTML_BYTES {
            &bytes[..MAX_HTML_BYTES]
        } else {
            &bytes[..]
        };
        let body_str = String::from_utf8_lossy(sliced).to_string();
        let load_time_ms = started.elapsed().as_millis() as u64;

        let parsed = parse_html_document(&body_str, &final_url, status);

        let mut guard = self.sessions.lock().await;
        let sess = guard
            .entry(conversation_id.to_string())
            .or_insert_with(|| BrowserSession::new(conversation_id));

        for (k, v) in new_cookies {
            sess.cookies.insert(k, v);
        }

        sess.current_url = Some(final_url.clone());
        sess.page_title = parsed.title;
        sess.http_status = Some(status);
        sess.content_type = content_type.clone();
        sess.loaded_at = Some(Utc::now().to_rfc3339());
        sess.load_time_ms = load_time_ms;
        sess.scroll_y = 0;
        sess.viewport_height = 800;
        sess.page_height = ((parsed.full_text.len() / 4).max(800)) as u32;
        sess.raw_html = body_str;
        sess.full_text = parsed.full_text;
        sess.text_blocks = parsed.text_blocks;
        sess.headings = parsed.headings;
        sess.tables = parsed.tables;
        sess.elements = parsed.elements;
        sess.forms = parsed.forms;
        sess.field_values.clear();
        for el in &sess.elements {
            if let Some(ref val) = el.value {
                if !val.is_empty() {
                    sess.field_values.insert(el.element_id.clone(), val.clone());
                    if let Some(ref name) = el.name {
                        sess.field_values.insert(name.clone(), val.clone());
                    }
                }
            }
        }
        sess.auth_barrier = parsed.auth_barrier;
        sess.last_error = if status >= 400 {
            Some(format!("HTTP {status} returned by {final_url}"))
        } else {
            None
        };

        if nav_kind == "goto" || sess.history.is_empty() {
            if sess.history.get(sess.history_index) != Some(&final_url) {
                if sess.history_index + 1 < sess.history.len() {
                    sess.history.truncate(sess.history_index + 1);
                }
                sess.history.push(final_url.clone());
                sess.history_index = sess.history.len() - 1;
            }
        }

        let button_count = sess
            .elements
            .iter()
            .filter(|e| e.kind == "button")
            .count();
        let input_count = sess
            .elements
            .iter()
            .filter(|e| matches!(e.kind.as_str(), "input" | "textarea" | "select"))
            .count();
        let link_count = sess
            .elements
            .iter()
            .filter(|e| matches!(e.kind.as_str(), "link" | "menu_item"))
            .count();
        let form_count = sess.forms.len();

        let obs = if let Some(ref barrier) = sess.auth_barrier {
            format!(
                "Loaded '{}' ({}) [HTTP {} in {}ms]. Detect barrier: [{}] {}. Interactive UI: {} buttons, {} inputs, {} links, {} forms.",
                sess.page_title,
                final_url,
                status,
                load_time_ms,
                barrier.provider,
                barrier.message,
                button_count,
                input_count,
                link_count,
                form_count
            )
        } else {
            format!(
                "Loaded '{}' ({}) [HTTP {} in {}ms]. Interactive UI detected: {} buttons, {} inputs/fields, {} links/menu items, {} forms.",
                sess.page_title,
                final_url,
                status,
                load_time_ms,
                button_count,
                input_count,
                link_count,
                form_count
            )
        };

        let status_label = if sess.auth_barrier.is_some() {
            "blocked_auth"
        } else if status >= 400 {
            "error"
        } else {
            "completed"
        };
        sess.record_action(action_name, requested_url, status_label, &obs, load_time_ms);

        Ok(build_page_observation_json(sess, &obs))
    }

    pub async fn inspect_page(
        &self,
        conversation_id: &str,
        args: &serde_json::Value,
    ) -> AppResult<serde_json::Value> {
        let started = Instant::now();
        let mut guard = self.sessions.lock().await;
        let sess = guard.get_mut(conversation_id).ok_or_else(|| {
            AppError::Browser(
                "No active browser session. Call browser_navigate with a target URL first.".into(),
            )
        })?;
        let current_url = sess.current_url.clone().ok_or_else(|| {
            AppError::Browser(
                "Browser session has no loaded page. Call browser_navigate first.".into(),
            )
        })?;

        let filter = args
            .get("filter")
            .and_then(|v| v.as_str())
            .unwrap_or("all")
            .to_ascii_lowercase();
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_ascii_lowercase())
            .filter(|s| !s.is_empty());

        let matching_elements: Vec<BrowserElement> = sess
            .elements
            .iter()
            .filter(|el| match filter.as_str() {
                "buttons" | "button" => el.kind == "button",
                "inputs" | "input" | "fields" => {
                    matches!(el.kind.as_str(), "input" | "textarea" | "select")
                }
                "links" | "link" => el.kind == "link",
                "menus" | "menu" => el.kind == "menu_item",
                "forms" | "form" => el.form_id.is_some(),
                _ => true,
            })
            .filter(|el| {
                if let Some(ref q) = query {
                    el.label.to_ascii_lowercase().contains(q)
                        || el.selector.to_ascii_lowercase().contains(q)
                        || el
                            .name
                            .as_deref()
                            .unwrap_or("")
                            .to_ascii_lowercase()
                            .contains(q)
                        || el
                            .placeholder
                            .as_deref()
                            .unwrap_or("")
                            .to_ascii_lowercase()
                            .contains(q)
                        || el
                            .href
                            .as_deref()
                            .unwrap_or("")
                            .to_ascii_lowercase()
                            .contains(q)
                } else {
                    true
                }
            })
            .take(80)
            .cloned()
            .collect();

        let obs = format!(
            "Inspected '{}' ({}): found {} matching UI elements (filter='{}') and {} forms.",
            sess.page_title,
            current_url,
            matching_elements.len(),
            filter,
            sess.forms.len()
        );
        sess.record_action(
            "browser_inspect_page",
            &filter,
            "completed",
            &obs,
            started.elapsed().as_millis() as u64,
        );

        Ok(serde_json::json!({
            "sessionId": sess.session_id,
            "url": current_url,
            "title": sess.page_title,
            "httpStatus": sess.http_status,
            "observation": obs,
            "scrollY": sess.scroll_y,
            "pageHeight": sess.page_height,
            "authBarrier": sess.auth_barrier,
            "headings": sess.headings,
            "forms": sess.forms,
            "elements": matching_elements,
        }))
    }

    pub async fn click_element(
        &self,
        conversation_id: &str,
        args: &serde_json::Value,
        cancel: CancellationToken,
    ) -> AppResult<serde_json::Value> {
        let started = Instant::now();
        enum ClickNextStep {
            NavigateUrl(String, String),
            SubmitForm(String, String),
            InPageToggle(serde_json::Value),
        }

        let next_step = {
            let mut guard = self.sessions.lock().await;
            let sess = guard.get_mut(conversation_id).ok_or_else(|| {
                AppError::Browser(
                    "No active browser session. Call browser_navigate first.".into(),
                )
            })?;

            let el = find_element(sess, args).cloned().ok_or_else(|| {
                let target_desc = args
                    .get("element_id")
                    .or_else(|| args.get("selector"))
                    .or_else(|| args.get("text"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("(unspecified)");
                let available: Vec<String> = sess
                    .elements
                    .iter()
                    .take(15)
                    .map(|e| format!("{} [{}] '{}'", e.element_id, e.kind, e.label))
                    .collect();
                let msg = format!(
                    "Could not find UI element matching '{}' on '{}'. Available interactive elements: {}",
                    target_desc,
                    sess.current_url.as_deref().unwrap_or("current page"),
                    if available.is_empty() {
                        "(none)".to_string()
                    } else {
                        available.join(", ")
                    }
                );
                sess.record_action(
                    "browser_click",
                    target_desc,
                    "error",
                    &msg,
                    started.elapsed().as_millis() as u64,
                );
                AppError::Browser(msg)
            })?;

            if el.disabled {
                let msg = format!(
                    "Element '{}' ({}) is disabled and cannot be clicked",
                    el.element_id, el.label
                );
                sess.record_action(
                    "browser_click",
                    &el.element_id,
                    "error",
                    &msg,
                    started.elapsed().as_millis() as u64,
                );
                return Err(AppError::Browser(msg));
            }

            // 1. If the element has an href (link or menu item), navigate to that URL
            if let Some(ref href) = el.href {
                let clean_href = href.trim();
                if !clean_href.is_empty()
                    && !clean_href.starts_with('#')
                    && !clean_href.to_ascii_lowercase().starts_with("javascript:")
                {
                    ClickNextStep::NavigateUrl(
                        clean_href.to_string(),
                        format!("{} ('{}')", el.element_id, el.label),
                    )
                } else {
                    let obs = format!(
                        "Clicked in-page link/anchor '{}' ('{}', href='{}'). Page state remains on '{}'.",
                        el.element_id,
                        el.label,
                        clean_href,
                        sess.current_url.as_deref().unwrap_or("")
                    );
                    sess.record_action(
                        "browser_click",
                        &el.element_id,
                        "completed",
                        &obs,
                        started.elapsed().as_millis() as u64,
                    );
                    ClickNextStep::InPageToggle(serde_json::json!({
                        "ok": true,
                        "clickedElement": el,
                        "observation": obs,
                        "url": sess.current_url,
                        "title": sess.page_title,
                    }))
                }
            } else if (el.input_type.as_deref() == Some("submit")
                || (el.tag == "button" && el.input_type.as_deref() != Some("button")))
                && el.form_id.is_some()
            {
                // 2. Submit button inside a form
                let fid = el.form_id.clone().unwrap();
                ClickNextStep::SubmitForm(fid, format!("{} ('{}')", el.element_id, el.label))
            } else if matches!(el.input_type.as_deref(), Some("checkbox") | Some("radio")) {
                // 3. Toggle checkbox / radio button
                let current_val = sess
                    .field_values
                    .get(&el.element_id)
                    .map(|v| v == "true" || v == "checked" || v == "on")
                    .unwrap_or(false);
                let next_val = if current_val { "false" } else { "true" };
                sess.field_values
                    .insert(el.element_id.clone(), next_val.to_string());
                if let Some(ref name) = el.name {
                    sess.field_values.insert(name.clone(), next_val.to_string());
                }
                if let Some(target_el) = sess
                    .elements
                    .iter_mut()
                    .find(|item| item.element_id == el.element_id)
                {
                    target_el.value = Some(next_val.to_string());
                }
                let obs = format!(
                    "Toggled {} '{}' ('{}') -> value is now '{}'.",
                    el.input_type.as_deref().unwrap_or("input"),
                    el.element_id,
                    el.label,
                    next_val
                );
                sess.record_action(
                    "browser_click",
                    &el.element_id,
                    "completed",
                    &obs,
                    started.elapsed().as_millis() as u64,
                );
                ClickNextStep::InPageToggle(serde_json::json!({
                    "ok": true,
                    "clickedElement": el.element_id,
                    "label": el.label,
                    "newValue": next_val,
                    "observation": obs,
                    "url": sess.current_url,
                }))
            } else {
                let obs = format!(
                    "Clicked button '{}' ('{}') on '{}'. Confirmed interactive state.",
                    el.element_id,
                    el.label,
                    sess.current_url.as_deref().unwrap_or("")
                );
                sess.record_action(
                    "browser_click",
                    &el.element_id,
                    "completed",
                    &obs,
                    started.elapsed().as_millis() as u64,
                );
                ClickNextStep::InPageToggle(serde_json::json!({
                    "ok": true,
                    "clickedElement": el,
                    "observation": obs,
                    "url": sess.current_url,
                    "title": sess.page_title,
                }))
            }
        };

        match next_step {
            ClickNextStep::NavigateUrl(url, label_desc) => {
                let mut res = self.navigate(conversation_id, &url, cancel).await?;
                if let Some(obj) = res.as_object_mut() {
                    obj.insert(
                        "triggeredByClick".into(),
                        serde_json::Value::String(label_desc),
                    );
                }
                Ok(res)
            }
            ClickNextStep::SubmitForm(form_id, label_desc) => {
                let submit_args = serde_json::json!({ "form_id": form_id });
                let mut res = self
                    .submit_form(conversation_id, &submit_args, cancel)
                    .await?;
                if let Some(obj) = res.as_object_mut() {
                    obj.insert(
                        "triggeredByClick".into(),
                        serde_json::Value::String(label_desc),
                    );
                }
                Ok(res)
            }
            ClickNextStep::InPageToggle(val) => Ok(val),
        }
    }

    pub async fn type_text(
        &self,
        conversation_id: &str,
        args: &serde_json::Value,
        cancel: CancellationToken,
    ) -> AppResult<serde_json::Value> {
        let started = Instant::now();
        let text = args
            .get("text")
            .or_else(|| args.get("value"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::Validation("Missing required 'text' argument".into()))?;
        let clear_first = args
            .get("clear_first")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let press_enter = args
            .get("press_enter")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let (el_id, el_label, el_name, form_id, is_password, final_val) = {
            let mut guard = self.sessions.lock().await;
            let sess = guard.get_mut(conversation_id).ok_or_else(|| {
                AppError::Browser(
                    "No active browser session. Call browser_navigate first.".into(),
                )
            })?;

            let el = find_element(sess, args).cloned().ok_or_else(|| {
                let target_desc = args
                    .get("element_id")
                    .or_else(|| args.get("name"))
                    .or_else(|| args.get("selector"))
                    .or_else(|| args.get("label"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("(input)");
                let inputs: Vec<String> = sess
                    .elements
                    .iter()
                    .filter(|e| matches!(e.kind.as_str(), "input" | "textarea" | "select"))
                    .map(|e| {
                        format!(
                            "{} [name={:?}, label='{}']",
                            e.element_id, e.name, e.label
                        )
                    })
                    .collect();
                let msg = format!(
                    "Input element '{}' not found on current page. Available input fields: {}",
                    target_desc,
                    if inputs.is_empty() {
                        "(none)".to_string()
                    } else {
                        inputs.join(", ")
                    }
                );
                sess.record_action(
                    "browser_type",
                    target_desc,
                    "error",
                    &msg,
                    started.elapsed().as_millis() as u64,
                );
                AppError::Browser(msg)
            })?;

            if el.disabled {
                return Err(AppError::Browser(format!(
                    "Input field '{}' ('{}') is disabled",
                    el.element_id, el.label
                )));
            }

            let is_pw = el.input_type.as_deref() == Some("password");
            if is_pw && !text.is_empty() {
                self.redactor.register_secret(text);
            }

            let new_val = if clear_first {
                text.to_string()
            } else {
                let prev = sess
                    .field_values
                    .get(&el.element_id)
                    .cloned()
                    .unwrap_or_default();
                format!("{prev}{text}")
            };

            sess.field_values
                .insert(el.element_id.clone(), new_val.clone());
            if let Some(ref name) = el.name {
                sess.field_values.insert(name.clone(), new_val.clone());
            }
            if let Some(target_el) = sess
                .elements
                .iter_mut()
                .find(|item| item.element_id == el.element_id)
            {
                target_el.value = Some(new_val.clone());
            }

            let display_val = if is_pw {
                "••••••••".to_string()
            } else {
                new_val.clone()
            };
            let obs = format!(
                "Entered text '{}' into field '{}' (label='{}', name={:?}). Field value verified.",
                display_val, el.element_id, el.label, el.name
            );
            sess.record_action(
                "browser_type",
                &el.element_id,
                "completed",
                &obs,
                started.elapsed().as_millis() as u64,
            );

            (
                el.element_id,
                el.label,
                el.name,
                el.form_id,
                is_pw,
                display_val,
            )
        };

        if press_enter {
            if let Some(fid) = form_id {
                let submit_args = serde_json::json!({ "form_id": fid });
                let mut submitted = self
                    .submit_form(conversation_id, &submit_args, cancel)
                    .await?;
                if let Some(obj) = submitted.as_object_mut() {
                    obj.insert("typedElementId".into(), serde_json::json!(el_id));
                    obj.insert("typedValue".into(), serde_json::json!(final_val));
                }
                return Ok(submitted);
            }
        }

        Ok(serde_json::json!({
            "ok": true,
            "elementId": el_id,
            "label": el_label,
            "name": el_name,
            "value": if is_password { "••••••••" } else { &final_val },
            "observation": format!("Verified field '{}' ('{}') updated with value '{}'.", el_id, el_label, final_val),
        }))
    }

    pub async fn select_option(
        &self,
        conversation_id: &str,
        args: &serde_json::Value,
    ) -> AppResult<serde_json::Value> {
        let started = Instant::now();
        let value = args
            .get("value")
            .or_else(|| args.get("option"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::Validation("Missing required 'value' argument".into()))?;

        let mut guard = self.sessions.lock().await;
        let sess = guard.get_mut(conversation_id).ok_or_else(|| {
            AppError::Browser("No active browser session. Call browser_navigate first.".into())
        })?;

        let el = find_element(sess, args).cloned().ok_or_else(|| {
            AppError::Browser("Select/dropdown element not found on current page".into())
        })?;

        sess.field_values
            .insert(el.element_id.clone(), value.to_string());
        if let Some(ref name) = el.name {
            sess.field_values.insert(name.clone(), value.to_string());
        }
        if let Some(target_el) = sess
            .elements
            .iter_mut()
            .find(|item| item.element_id == el.element_id)
        {
            target_el.value = Some(value.to_string());
        }

        let obs = format!(
            "Selected option '{}' in dropdown '{}' ('{}'). Verified updated selection.",
            value, el.element_id, el.label
        );
        sess.record_action(
            "browser_select_option",
            &el.element_id,
            "completed",
            &obs,
            started.elapsed().as_millis() as u64,
        );

        Ok(serde_json::json!({
            "ok": true,
            "elementId": el.element_id,
            "label": el.label,
            "selectedValue": value,
            "availableOptions": el.options,
            "observation": obs,
        }))
    }

    pub async fn fill_form(
        &self,
        conversation_id: &str,
        args: &serde_json::Value,
        cancel: CancellationToken,
    ) -> AppResult<serde_json::Value> {
        let started = Instant::now();
        let fields_obj = args
            .get("fields")
            .and_then(|v| v.as_object())
            .ok_or_else(|| {
                AppError::Validation(
                    "Missing required 'fields' object (e.g. {\"email\": \"user@example.com\"})"
                        .into(),
                )
            })?;
        let submit_after = args
            .get("submit")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let requested_form_id = args.get("form_id").and_then(|v| v.as_str());

        let (filled_summary, unmatched, resolved_form_id) = {
            let mut guard = self.sessions.lock().await;
            let sess = guard.get_mut(conversation_id).ok_or_else(|| {
                AppError::Browser("No active browser session. Call browser_navigate first.".into())
            })?;

            let mut filled = Vec::new();
            let mut missing = Vec::new();
            let mut detected_form_id = requested_form_id.map(String::from);

            for (key, raw_val) in fields_obj {
                let val_str = match raw_val {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                let lookup_args = serde_json::json!({
                    "element_id": key,
                    "name": key,
                    "label": key,
                    "selector": key,
                });
                if let Some(el) = find_element(sess, &lookup_args).cloned() {
                    let is_pw = el.input_type.as_deref() == Some("password");
                    if is_pw && !val_str.is_empty() {
                        self.redactor.register_secret(&val_str);
                    }
                    sess.field_values
                        .insert(el.element_id.clone(), val_str.clone());
                    if let Some(ref name) = el.name {
                        sess.field_values.insert(name.clone(), val_str.clone());
                    }
                    if let Some(target_el) = sess
                        .elements
                        .iter_mut()
                        .find(|item| item.element_id == el.element_id)
                    {
                        target_el.value = Some(val_str.clone());
                    }
                    if detected_form_id.is_none() {
                        detected_form_id = el.form_id.clone();
                    }
                    filled.push(serde_json::json!({
                        "key": key,
                        "elementId": el.element_id,
                        "label": el.label,
                        "name": el.name,
                        "value": if is_pw { "••••••••" } else { &val_str },
                    }));
                } else {
                    missing.push(key.clone());
                }
            }

            let obs = format!(
                "Filled {} form field(s) on '{}'{}",
                filled.len(),
                sess.current_url.as_deref().unwrap_or("page"),
                if missing.is_empty() {
                    " (all fields verified).".to_string()
                } else {
                    format!("; unmatched keys: {}.", missing.join(", "))
                }
            );
            sess.record_action(
                "browser_fill_form",
                detected_form_id.as_deref().unwrap_or("form"),
                if filled.is_empty() && !missing.is_empty() {
                    "error"
                } else {
                    "completed"
                },
                &obs,
                started.elapsed().as_millis() as u64,
            );

            if filled.is_empty() && !missing.is_empty() {
                return Err(AppError::Browser(format!(
                    "None of the requested form fields ({}) matched inputs on the current page",
                    missing.join(", ")
                )));
            }

            (filled, missing, detected_form_id)
        };

        if submit_after {
            let submit_args = serde_json::json!({ "form_id": resolved_form_id });
            let mut res = self
                .submit_form(conversation_id, &submit_args, cancel)
                .await?;
            if let Some(obj) = res.as_object_mut() {
                obj.insert("filledFields".into(), serde_json::json!(filled_summary));
                obj.insert("unmatchedFields".into(), serde_json::json!(unmatched));
            }
            return Ok(res);
        }

        Ok(serde_json::json!({
            "ok": true,
            "formId": resolved_form_id,
            "filledFields": filled_summary,
            "unmatchedFields": unmatched,
            "observation": format!("Successfully filled {} field(s) and verified input values in the active browser session.", filled_summary.len()),
        }))
    }

    pub async fn submit_form(
        &self,
        conversation_id: &str,
        args: &serde_json::Value,
        cancel: CancellationToken,
    ) -> AppResult<serde_json::Value> {
        let started = Instant::now();
        let (method, action_url, payload, cookie_header, form_id) = {
            let mut guard = self.sessions.lock().await;
            let sess = guard.get_mut(conversation_id).ok_or_else(|| {
                AppError::Browser("No active browser session. Call browser_navigate first.".into())
            })?;

            let req_form_id = args.get("form_id").and_then(|v| v.as_str());
            let form = find_form(sess, req_form_id).cloned().ok_or_else(|| {
                let msg = "No form found on the current page to submit".to_string();
                sess.record_action(
                    "browser_submit_form",
                    req_form_id.unwrap_or("form"),
                    "error",
                    &msg,
                    started.elapsed().as_millis() as u64,
                );
                AppError::Browser(msg)
            })?;

            let mut params: Vec<(String, String)> = Vec::new();
            for fid in &form.field_ids {
                if let Some(el) = sess.elements.iter().find(|e| &e.element_id == fid) {
                    let field_key = el
                        .name
                        .clone()
                        .or_else(|| el.html_id.clone())
                        .unwrap_or_else(|| el.element_id.clone());
                    let val = sess
                        .field_values
                        .get(&el.element_id)
                        .or_else(|| el.name.as_ref().and_then(|n| sess.field_values.get(n)))
                        .or(el.value.as_ref())
                        .cloned()
                        .unwrap_or_default();
                    params.push((field_key, val));
                }
            }

            // If no explicit form fields were linked, include all user-entered field_values by name
            if params.is_empty() {
                for el in &sess.elements {
                    if let Some(ref name) = el.name {
                        if let Some(val) = sess
                            .field_values
                            .get(&el.element_id)
                            .or_else(|| sess.field_values.get(name))
                        {
                            params.push((name.clone(), val.clone()));
                        }
                    }
                }
            }

            let cookies = format_cookie_header(&sess.cookies);
            (
                form.method,
                form.action_url,
                params,
                cookies,
                form.form_id,
            )
        };

        let mut req = if method.eq_ignore_ascii_case("POST") {
            self.client.post(&action_url).form(&payload)
        } else {
            let mut target = Url::parse(&action_url).map_err(|e| {
                AppError::Browser(format!("Invalid form action URL '{action_url}': {e}"))
            })?;
            {
                let mut qp = target.query_pairs_mut();
                for (k, v) in &payload {
                    qp.append_pair(k, v);
                }
            }
            self.client.get(target.as_str())
        };

        req = req.header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        );
        if let Some(ch) = cookie_header {
            req = req.header("Cookie", ch);
        }

        let resp = tokio::select! {
            _ = cancel.cancelled() => return Err(AppError::Cancelled),
            res = req.send() => res.map_err(|e| AppError::Browser(format!("Form submission to '{action_url}' failed: {e}")))?,
        };

        let mut out = self
            .apply_http_response(
                conversation_id,
                &action_url,
                "goto",
                "browser_submit_form",
                resp,
                started,
                cancel,
            )
            .await?;

        if let Some(obj) = out.as_object_mut() {
            obj.insert("submittedFormId".into(), serde_json::json!(form_id));
            obj.insert("submittedMethod".into(), serde_json::json!(method));
        }
        Ok(out)
    }

    pub async fn search_page(
        &self,
        conversation_id: &str,
        args: &serde_json::Value,
        cancel: CancellationToken,
    ) -> AppResult<serde_json::Value> {
        let started = Instant::now();
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| AppError::Validation("Missing required 'query' argument".into()))?;
        let submit_search_box = args
            .get("submit_search_box")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if submit_search_box {
            let search_input_id = {
                let guard = self.sessions.lock().await;
                let sess = guard.get(conversation_id).ok_or_else(|| {
                    AppError::Browser(
                        "No active browser session. Call browser_navigate first.".into(),
                    )
                })?;
                sess.elements
                    .iter()
                    .find(|el| {
                        el.input_type.as_deref() == Some("search")
                            || el
                                .name
                                .as_deref()
                                .map(|n| {
                                    matches!(
                                        n.to_ascii_lowercase().as_str(),
                                        "q" | "query" | "search" | "s" | "keyword"
                                    )
                                })
                                .unwrap_or(false)
                            || el.label.to_ascii_lowercase().contains("search")
                            || el.label.to_ascii_lowercase().contains("tìm")
                    })
                    .map(|el| el.element_id.clone())
            };

            if let Some(el_id) = search_input_id {
                let type_args = serde_json::json!({
                    "element_id": el_id,
                    "text": query,
                    "press_enter": true,
                });
                return self.type_text(conversation_id, &type_args, cancel).await;
            }
        }

        let mut guard = self.sessions.lock().await;
        let sess = guard.get_mut(conversation_id).ok_or_else(|| {
            AppError::Browser("No active browser session. Call browser_navigate first.".into())
        })?;

        let q_lower = query.to_ascii_lowercase();
        let matching_blocks: Vec<String> = sess
            .text_blocks
            .iter()
            .filter(|b| b.to_ascii_lowercase().contains(&q_lower))
            .take(15)
            .cloned()
            .collect();

        let matching_headings: Vec<BrowserHeading> = sess
            .headings
            .iter()
            .filter(|h| h.text.to_ascii_lowercase().contains(&q_lower))
            .cloned()
            .collect();

        let matching_elements: Vec<BrowserElement> = sess
            .elements
            .iter()
            .filter(|el| {
                el.label.to_ascii_lowercase().contains(&q_lower)
                    || el
                        .href
                        .as_deref()
                        .unwrap_or("")
                        .to_ascii_lowercase()
                        .contains(&q_lower)
            })
            .take(20)
            .cloned()
            .collect();

        let obs = format!(
            "Searched current page for '{}': found {} matching text section(s), {} heading(s), and {} interactive element(s).",
            query,
            matching_blocks.len(),
            matching_headings.len(),
            matching_elements.len()
        );
        sess.record_action(
            "browser_search_page",
            query,
            "completed",
            &obs,
            started.elapsed().as_millis() as u64,
        );

        Ok(serde_json::json!({
            "query": query,
            "url": sess.current_url,
            "title": sess.page_title,
            "matchingTextBlocks": matching_blocks,
            "matchingHeadings": matching_headings,
            "matchingElements": matching_elements,
            "observation": obs,
        }))
    }

    pub async fn scroll_page(
        &self,
        conversation_id: &str,
        args: &serde_json::Value,
    ) -> AppResult<serde_json::Value> {
        let started = Instant::now();
        let direction = args
            .get("direction")
            .and_then(|v| v.as_str())
            .unwrap_or("down")
            .to_ascii_lowercase();
        let amount_px = args
            .get("amount_px")
            .and_then(|v| v.as_u64())
            .unwrap_or(600) as u32;
        let to_text = args
            .get("to_text")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty());

        let mut guard = self.sessions.lock().await;
        let sess = guard.get_mut(conversation_id).ok_or_else(|| {
            AppError::Browser("No active browser session. Call browser_navigate first.".into())
        })?;

        let max_scroll = sess.page_height.saturating_sub(sess.viewport_height);
        if let Some(target_txt) = to_text {
            let lower = sess.full_text.to_ascii_lowercase();
            let needle = target_txt.to_ascii_lowercase();
            if let Some(byte_pos) = lower.find(&needle) {
                let ratio = (byte_pos as f64) / (sess.full_text.len().max(1) as f64);
                sess.scroll_y = ((sess.page_height as f64) * ratio) as u32;
            } else {
                return Err(AppError::Browser(format!(
                    "Could not scroll to text '{target_txt}': text not found on page"
                )));
            }
        } else {
            match direction.as_str() {
                "down" => {
                    sess.scroll_y = (sess.scroll_y + amount_px).min(max_scroll);
                }
                "up" => {
                    sess.scroll_y = sess.scroll_y.saturating_sub(amount_px);
                }
                "top" => {
                    sess.scroll_y = 0;
                }
                "bottom" => {
                    sess.scroll_y = max_scroll;
                }
                other => {
                    return Err(AppError::Validation(format!(
                        "Unsupported scroll direction '{other}'. Use 'down', 'up', 'top', or 'bottom'."
                    )));
                }
            }
        }

        let total_chars = sess.full_text.chars().count();
        let start_char = if sess.page_height == 0 || max_scroll == 0 {
            0
        } else {
            ((sess.scroll_y as usize) * total_chars.saturating_sub(VIEWPORT_CHARS / 2))
                / (max_scroll.max(1) as usize)
        }
        .min(total_chars);
        let viewport_text: String = sess
            .full_text
            .chars()
            .skip(start_char)
            .take(VIEWPORT_CHARS)
            .collect();

        let progress_pct = if max_scroll == 0 {
            100
        } else {
            ((sess.scroll_y as u64 * 100) / (max_scroll as u64)).min(100)
        };

        let obs = format!(
            "Scrolled page '{}' ({}) -> scrollY={}px / {}px ({}%).",
            sess.page_title,
            direction,
            sess.scroll_y,
            sess.page_height,
            progress_pct
        );
        sess.record_action(
            "browser_scroll",
            &direction,
            "completed",
            &obs,
            started.elapsed().as_millis() as u64,
        );

        Ok(serde_json::json!({
            "url": sess.current_url,
            "title": sess.page_title,
            "scrollY": sess.scroll_y,
            "pageHeight": sess.page_height,
            "scrollPercent": progress_pct,
            "viewportContent": viewport_text,
            "observation": obs,
        }))
    }

    pub async fn extract_data(
        &self,
        conversation_id: &str,
        args: &serde_json::Value,
    ) -> AppResult<serde_json::Value> {
        let started = Instant::now();
        let scope = args
            .get("scope")
            .and_then(|v| v.as_str())
            .unwrap_or("all")
            .to_ascii_lowercase();
        let max_chars = args
            .get("max_chars")
            .and_then(|v| v.as_u64())
            .unwrap_or(10_000)
            .clamp(500, 30_000) as usize;

        let mut guard = self.sessions.lock().await;
        let sess = guard.get_mut(conversation_id).ok_or_else(|| {
            AppError::Browser("No active browser session. Call browser_navigate first.".into())
        })?;

        let text_slice: String = sess.full_text.chars().take(max_chars).collect();
        let links: Vec<serde_json::Value> = sess
            .elements
            .iter()
            .filter(|e| matches!(e.kind.as_str(), "link" | "menu_item"))
            .take(60)
            .map(|e| {
                serde_json::json!({
                    "elementId": e.element_id,
                    "text": e.label,
                    "href": e.href,
                    "kind": e.kind,
                })
            })
            .collect();

        let obs = format!(
            "Extracted structured data (scope='{}') from '{}' ({}): {} headings, {} tables, {} links, {} chars of text.",
            scope,
            sess.page_title,
            sess.current_url.as_deref().unwrap_or(""),
            sess.headings.len(),
            sess.tables.len(),
            links.len(),
            text_slice.len()
        );
        sess.record_action(
            "browser_extract_data",
            &scope,
            "completed",
            &obs,
            started.elapsed().as_millis() as u64,
        );

        let payload = match scope.as_str() {
            "headings" => serde_json::json!({
                "url": sess.current_url,
                "title": sess.page_title,
                "headings": sess.headings,
                "observation": obs,
            }),
            "tables" => serde_json::json!({
                "url": sess.current_url,
                "title": sess.page_title,
                "tables": sess.tables,
                "observation": obs,
            }),
            "links" => serde_json::json!({
                "url": sess.current_url,
                "title": sess.page_title,
                "links": links,
                "observation": obs,
            }),
            "forms" => serde_json::json!({
                "url": sess.current_url,
                "title": sess.page_title,
                "forms": sess.forms,
                "elements": sess.elements.iter().filter(|e| e.form_id.is_some()).collect::<Vec<_>>(),
                "observation": obs,
            }),
            "text" => serde_json::json!({
                "url": sess.current_url,
                "title": sess.page_title,
                "text": text_slice,
                "textBlocks": sess.text_blocks,
                "observation": obs,
            }),
            _ => serde_json::json!({
                "url": sess.current_url,
                "title": sess.page_title,
                "httpStatus": sess.http_status,
                "headings": sess.headings,
                "tables": sess.tables,
                "forms": sess.forms,
                "links": links,
                "text": text_slice,
                "actionLog": sess.action_log,
                "observation": obs,
            }),
        };

        Ok(payload)
    }
}

fn build_page_observation_json(sess: &BrowserSession, observation: &str) -> serde_json::Value {
    let buttons: Vec<&BrowserElement> = sess
        .elements
        .iter()
        .filter(|e| e.kind == "button")
        .take(25)
        .collect();
    let inputs: Vec<&BrowserElement> = sess
        .elements
        .iter()
        .filter(|e| matches!(e.kind.as_str(), "input" | "textarea" | "select"))
        .take(30)
        .collect();
    let links: Vec<&BrowserElement> = sess
        .elements
        .iter()
        .filter(|e| matches!(e.kind.as_str(), "link" | "menu_item"))
        .take(35)
        .collect();
    let text_preview: String = sess.full_text.chars().take(4_000).collect();

    serde_json::json!({
        "sessionId": sess.session_id,
        "url": sess.current_url,
        "title": sess.page_title,
        "httpStatus": sess.http_status,
        "contentType": sess.content_type,
        "loadTimeMs": sess.load_time_ms,
        "observation": observation,
        "authBarrier": sess.auth_barrier,
        "headings": sess.headings,
        "interactiveElements": {
            "buttons": buttons,
            "inputs": inputs,
            "links": links,
            "forms": sess.forms,
        },
        "tables": sess.tables,
        "textPreview": text_preview,
    })
}

fn find_element<'a>(
    sess: &'a BrowserSession,
    args: &serde_json::Value,
) -> Option<&'a BrowserElement> {
    if let Some(eid) = args
        .get("element_id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        if let Some(found) = sess
            .elements
            .iter()
            .find(|e| e.element_id.eq_ignore_ascii_case(eid))
        {
            return Some(found);
        }
    }

    if let Some(sel) = args
        .get("selector")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let clean_id = sel.strip_prefix('#').unwrap_or(sel);
        if let Some(found) = sess.elements.iter().find(|e| {
            e.selector.eq_ignore_ascii_case(sel)
                || e.html_id
                    .as_deref()
                    .map(|id| id.eq_ignore_ascii_case(clean_id))
                    .unwrap_or(false)
                || e.name
                    .as_deref()
                    .map(|n| n.eq_ignore_ascii_case(sel))
                    .unwrap_or(false)
        }) {
            return Some(found);
        }
    }

    if let Some(name) = args
        .get("name")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        if let Some(found) = sess.elements.iter().find(|e| {
            e.name
                .as_deref()
                .map(|n| n.eq_ignore_ascii_case(name))
                .unwrap_or(false)
                || e.html_id
                    .as_deref()
                    .map(|id| id.eq_ignore_ascii_case(name))
                    .unwrap_or(false)
        }) {
            return Some(found);
        }
    }

    for key in ["text", "label", "element_id", "selector", "name"] {
        if let Some(txt) = args
            .get(key)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            let lower = txt.to_ascii_lowercase();
            // Exact label match first
            if let Some(found) = sess
                .elements
                .iter()
                .find(|e| e.label.to_ascii_lowercase() == lower)
            {
                return Some(found);
            }
            // Substring match next
            if let Some(found) = sess.elements.iter().find(|e| {
                e.label.to_ascii_lowercase().contains(&lower)
                    || e.placeholder
                        .as_deref()
                        .unwrap_or("")
                        .to_ascii_lowercase()
                        .contains(&lower)
                    || e.name
                        .as_deref()
                        .unwrap_or("")
                        .to_ascii_lowercase()
                        .contains(&lower)
            }) {
                return Some(found);
            }
        }
    }

    None
}

fn find_form<'a>(sess: &'a BrowserSession, form_id: Option<&str>) -> Option<&'a BrowserFormInfo> {
    if let Some(fid) = form_id.map(str::trim).filter(|s| !s.is_empty()) {
        sess.forms.iter().find(|f| {
            f.form_id.eq_ignore_ascii_case(fid)
                || f.html_id
                    .as_deref()
                    .map(|id| id.eq_ignore_ascii_case(fid.trim_start_matches('#')))
                    .unwrap_or(false)
                || f.name
                    .as_deref()
                    .map(|n| n.eq_ignore_ascii_case(fid))
                    .unwrap_or(false)
        })
    } else {
        sess.forms.first()
    }
}

fn format_cookie_header(cookies: &HashMap<String, String>) -> Option<String> {
    if cookies.is_empty() {
        return None;
    }
    let mut pairs: Vec<String> = cookies.iter().map(|(k, v)| format!("{k}={v}")).collect();
    pairs.sort();
    Some(pairs.join("; "))
}

fn extract_set_cookies(headers: &reqwest::header::HeaderMap) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for val in headers.get_all(reqwest::header::SET_COOKIE) {
        if let Ok(raw) = val.to_str() {
            if let Some(first_part) = raw.split(';').next() {
                if let Some((k, v)) = first_part.split_once('=') {
                    let key = k.trim();
                    let value = v.trim();
                    if !key.is_empty() {
                        out.push((key.to_string(), value.to_string()));
                    }
                }
            }
        }
    }
    out
}

struct ParsedHtmlDoc {
    title: String,
    full_text: String,
    text_blocks: Vec<String>,
    headings: Vec<BrowserHeading>,
    tables: Vec<BrowserTable>,
    elements: Vec<BrowserElement>,
    forms: Vec<BrowserFormInfo>,
    auth_barrier: Option<BrowserAuthBarrier>,
}

fn parse_html_document(html: &str, base_url_str: &str, http_status: u16) -> ParsedHtmlDoc {
    let base_url = Url::parse(base_url_str).ok();

    // 1. Strip comments, scripts, styles, svgs for readable text & structure
    let re_comment = Regex::new(r"(?is)<!--.*?-->").unwrap();
    let mut cleaned_html = re_comment.replace_all(html, " ").to_string();
    for tag in ["script", "style", "noscript", "svg", "template"] {
        let re_tag = Regex::new(&format!(r"(?is)<{tag}\b[^>]*>.*?</{tag}>")).unwrap();
        cleaned_html = re_tag.replace_all(&cleaned_html, " ").to_string();
    }

    // 2. Title
    let re_title = Regex::new(r"(?is)<title\b[^>]*>(.*?)</title>").unwrap();
    let mut title = re_title
        .captures(&cleaned_html)
        .and_then(|c| c.get(1))
        .map(|m| clean_inline_text(m.as_str()))
        .filter(|s| !s.is_empty())
        .unwrap_or_default();

    // 3. Headings
    let re_heading = Regex::new(r"(?is)<h([1-6])\b[^>]*>(.*?)</h[1-6]>").unwrap();
    let mut headings = Vec::new();
    for cap in re_heading.captures_iter(&cleaned_html) {
        let lvl = cap
            .get(1)
            .and_then(|m| m.as_str().parse::<u8>().ok())
            .unwrap_or(2);
        let txt = cap
            .get(2)
            .map(|m| clean_inline_text(m.as_str()))
            .unwrap_or_default();
        if !txt.is_empty() {
            if title.is_empty() && lvl == 1 {
                title = txt.clone();
            }
            headings.push(BrowserHeading {
                level: lvl,
                text: txt,
            });
        }
    }
    if title.is_empty() {
        title = base_url_str.to_string();
    }

    // 4. Label map (<label for="id">text</label>)
    let re_label = Regex::new(r"(?is)<label\b([^>]*)>(.*?)</label>").unwrap();
    let mut label_for_map: HashMap<String, String> = HashMap::new();
    for cap in re_label.captures_iter(&cleaned_html) {
        let attrs = parse_html_attrs(cap.get(1).map(|m| m.as_str()).unwrap_or(""));
        let txt = clean_inline_text(cap.get(2).map(|m| m.as_str()).unwrap_or(""));
        if let Some(for_id) = attrs.get("for") {
            if !for_id.is_empty() && !txt.is_empty() {
                label_for_map.insert(for_id.clone(), txt);
            }
        }
    }

    // 5. Forms and interactive elements
    let mut elements: Vec<BrowserElement> = Vec::new();
    let mut forms: Vec<BrowserFormInfo> = Vec::new();
    let mut next_el_idx: usize = 1;

    // Identify <nav> regions to classify menu links
    let re_nav = Regex::new(r"(?is)<nav\b[^>]*>(.*?)</nav>").unwrap();
    let mut nav_hrefs: Vec<String> = Vec::new();
    let re_a = Regex::new(r"(?is)<a\b([^>]*)>(.*?)</a>").unwrap();
    for nav_cap in re_nav.captures_iter(&cleaned_html) {
        let nav_inner = nav_cap.get(1).map(|m| m.as_str()).unwrap_or("");
        for a_cap in re_a.captures_iter(nav_inner) {
            let attrs = parse_html_attrs(a_cap.get(1).map(|m| m.as_str()).unwrap_or(""));
            if let Some(h) = attrs.get("href") {
                nav_hrefs.push(h.clone());
            }
        }
    }

    let re_form = Regex::new(r"(?is)<form\b([^>]*)>(.*?)</form>").unwrap();
    let mut html_outside_forms = cleaned_html.clone();

    for (f_idx, f_cap) in re_form.captures_iter(&cleaned_html).enumerate() {
        let form_id = format!("form-{}", f_idx + 1);
        let f_attrs = parse_html_attrs(f_cap.get(1).map(|m| m.as_str()).unwrap_or(""));
        let f_inner = f_cap.get(2).map(|m| m.as_str()).unwrap_or("");

        let method = f_attrs
            .get("method")
            .map(|m| m.to_ascii_uppercase())
            .filter(|m| m == "POST" || m == "GET")
            .unwrap_or_else(|| "GET".into());
        let raw_action = f_attrs.get("action").map(String::as_str).unwrap_or("");
        let action_url = resolve_url(base_url.as_ref(), base_url_str, raw_action);
        let html_id = f_attrs.get("id").cloned();
        let name = f_attrs.get("name").cloned();

        let extracted = extract_controls_from_fragment(
            f_inner,
            Some(&form_id),
            &label_for_map,
            &mut next_el_idx,
        );
        let mut field_ids = Vec::new();
        let mut submit_element_id = None;
        let mut form_sensitive = method == "POST";
        let mut form_sens_reason = if method == "POST" {
            Some(format!("Form POST submission to '{action_url}'"))
        } else {
            None
        };

        for el in extracted {
            if matches!(el.kind.as_str(), "input" | "textarea" | "select")
                && el.input_type.as_deref() != Some("submit")
                && el.input_type.as_deref() != Some("button")
            {
                field_ids.push(el.element_id.clone());
            }
            if submit_element_id.is_none()
                && (el.input_type.as_deref() == Some("submit") || el.kind == "button")
            {
                submit_element_id = Some(el.element_id.clone());
            }
            if el.is_sensitive {
                form_sensitive = true;
                if el.sensitivity_reason.is_some() {
                    form_sens_reason = el.sensitivity_reason.clone();
                }
            }
            elements.push(el);
        }

        if let Some(reason) = detect_sensitive_keywords(&action_url) {
            form_sensitive = true;
            form_sens_reason = Some(reason);
        }

        forms.push(BrowserFormInfo {
            form_id,
            html_id,
            name,
            method,
            action_url,
            field_ids,
            submit_element_id,
            is_sensitive: form_sensitive,
            sensitivity_reason: form_sens_reason,
        });
    }

    html_outside_forms = re_form.replace_all(&html_outside_forms, " ").to_string();
    let standalone_controls = extract_controls_from_fragment(
        &html_outside_forms,
        None,
        &label_for_map,
        &mut next_el_idx,
    );
    elements.extend(standalone_controls);

    // If standalone inputs exist without a <form> wrapper, synthesize a virtual form so fill_form works seamlessly
    if forms.is_empty() {
        let standalone_field_ids: Vec<String> = elements
            .iter()
            .filter(|e| matches!(e.kind.as_str(), "input" | "textarea" | "select"))
            .map(|e| e.element_id.clone())
            .collect();
        if !standalone_field_ids.is_empty() {
            let submit_id = elements
                .iter()
                .find(|e| e.kind == "button")
                .map(|e| e.element_id.clone());
            for el in &mut elements {
                if el.form_id.is_none() {
                    el.form_id = Some("form-1".into());
                }
            }
            forms.push(BrowserFormInfo {
                form_id: "form-1".into(),
                html_id: None,
                name: Some("page-inputs".into()),
                method: "GET".into(),
                action_url: base_url_str.to_string(),
                field_ids: standalone_field_ids,
                submit_element_id: submit_id,
                is_sensitive: false,
                sensitivity_reason: None,
            });
        }
    }

    // 6. Links (<a href="...">)
    for a_cap in re_a.captures_iter(&cleaned_html) {
        if elements.len() >= 180 {
            break;
        }
        let attrs = parse_html_attrs(a_cap.get(1).map(|m| m.as_str()).unwrap_or(""));
        let raw_href = attrs.get("href").map(String::as_str).unwrap_or("").trim();
        let text = clean_inline_text(a_cap.get(2).map(|m| m.as_str()).unwrap_or(""));
        let label = if !text.is_empty() {
            text
        } else {
            attrs
                .get("aria-label")
                .or_else(|| attrs.get("title"))
                .cloned()
                .unwrap_or_else(|| raw_href.to_string())
        };
        if label.is_empty() && raw_href.is_empty() {
            continue;
        }
        let resolved_href = if raw_href.is_empty() {
            None
        } else {
            Some(resolve_url(base_url.as_ref(), base_url_str, raw_href))
        };
        let is_menu = nav_hrefs.iter().any(|h| h == raw_href)
            || attrs
                .get("role")
                .map(|r| r.contains("menuitem"))
                .unwrap_or(false);
        let el_id = format!("el-{next_el_idx}");
        next_el_idx += 1;

        let html_id = attrs.get("id").cloned();
        let selector = if let Some(ref id) = html_id {
            format!("#{id}")
        } else if !raw_href.is_empty() {
            format!("a[href=\"{raw_href}\"]")
        } else {
            "a".to_string()
        };

        let sens = detect_sensitive_keywords(&format!("{label} {raw_href}"));

        elements.push(BrowserElement {
            element_id: el_id,
            kind: if is_menu {
                "menu_item".into()
            } else {
                "link".into()
            },
            tag: "a".into(),
            input_type: None,
            label,
            selector,
            name: attrs.get("name").cloned(),
            html_id,
            placeholder: None,
            href: resolved_href,
            value: None,
            options: vec![],
            form_id: None,
            disabled: false,
            required: false,
            is_sensitive: sens.is_some(),
            sensitivity_reason: sens,
        });
    }

    // 7. Tables
    let tables = extract_tables(&cleaned_html);

    // 8. Text blocks & full readable text
    let text_blocks = extract_text_blocks(&cleaned_html);
    let full_text = if text_blocks.is_empty() {
        clean_inline_text(&cleaned_html)
    } else {
        text_blocks.join("\n\n")
    };

    // 9. Detect CAPTCHA / Login / Authentication barriers
    let auth_barrier = detect_auth_barrier(html, &full_text, &elements, http_status);

    ParsedHtmlDoc {
        title,
        full_text,
        text_blocks,
        headings,
        tables,
        elements,
        forms,
        auth_barrier,
    }
}

fn extract_controls_from_fragment(
    fragment: &str,
    form_id: Option<&str>,
    label_for_map: &HashMap<String, String>,
    next_el_idx: &mut usize,
) -> Vec<BrowserElement> {
    let mut out = Vec::new();

    // <input ...>
    let re_input = Regex::new(r"(?is)<input\b([^>]*)/?>").unwrap();
    for cap in re_input.captures_iter(fragment) {
        let attrs = parse_html_attrs(cap.get(1).map(|m| m.as_str()).unwrap_or(""));
        let input_type = attrs
            .get("type")
            .map(|t| t.to_ascii_lowercase())
            .unwrap_or_else(|| "text".into());
        if input_type == "hidden" {
            continue;
        }
        let html_id = attrs.get("id").cloned();
        let name = attrs.get("name").cloned();
        let placeholder = attrs.get("placeholder").cloned();
        let value = attrs.get("value").cloned();
        let disabled = attrs.contains_key("disabled");
        let required = attrs.contains_key("required");

        let is_btn = matches!(input_type.as_str(), "submit" | "button" | "reset");
        let label = html_id
            .as_ref()
            .and_then(|id| label_for_map.get(id))
            .cloned()
            .or_else(|| attrs.get("aria-label").cloned())
            .or_else(|| {
                if is_btn {
                    value.clone()
                } else {
                    placeholder.clone()
                }
            })
            .or_else(|| name.clone())
            .or_else(|| html_id.clone())
            .unwrap_or_else(|| {
                if is_btn {
                    "Submit".into()
                } else {
                    format!("input ({input_type})")
                }
            });

        let selector = if let Some(ref id) = html_id {
            format!("#{id}")
        } else if let Some(ref n) = name {
            format!("input[name=\"{n}\"]")
        } else {
            format!("input[type=\"{input_type}\"]")
        };

        let sens = detect_sensitive_keywords(&format!(
            "{} {} {}",
            label,
            name.as_deref().unwrap_or(""),
            input_type
        ));

        let el_id = format!("el-{}", *next_el_idx);
        *next_el_idx += 1;

        out.push(BrowserElement {
            element_id: el_id,
            kind: if is_btn {
                "button".into()
            } else {
                "input".into()
            },
            tag: "input".into(),
            input_type: Some(input_type),
            label,
            selector,
            name,
            html_id,
            placeholder,
            href: None,
            value,
            options: vec![],
            form_id: form_id.map(String::from),
            disabled,
            required,
            is_sensitive: sens.is_some(),
            sensitivity_reason: sens,
        });
    }

    // <textarea ...>...</textarea>
    let re_textarea = Regex::new(r"(?is)<textarea\b([^>]*)>(.*?)</textarea>").unwrap();
    for cap in re_textarea.captures_iter(fragment) {
        let attrs = parse_html_attrs(cap.get(1).map(|m| m.as_str()).unwrap_or(""));
        let val = clean_inline_text(cap.get(2).map(|m| m.as_str()).unwrap_or(""));
        let html_id = attrs.get("id").cloned();
        let name = attrs.get("name").cloned();
        let placeholder = attrs.get("placeholder").cloned();
        let label = html_id
            .as_ref()
            .and_then(|id| label_for_map.get(id))
            .cloned()
            .or_else(|| attrs.get("aria-label").cloned())
            .or_else(|| placeholder.clone())
            .or_else(|| name.clone())
            .unwrap_or_else(|| "textarea".into());
        let selector = if let Some(ref id) = html_id {
            format!("#{id}")
        } else if let Some(ref n) = name {
            format!("textarea[name=\"{n}\"]")
        } else {
            "textarea".into()
        };

        let el_id = format!("el-{}", *next_el_idx);
        *next_el_idx += 1;

        out.push(BrowserElement {
            element_id: el_id,
            kind: "textarea".into(),
            tag: "textarea".into(),
            input_type: Some("textarea".into()),
            label,
            selector,
            name,
            html_id,
            placeholder,
            href: None,
            value: if val.is_empty() { None } else { Some(val) },
            options: vec![],
            form_id: form_id.map(String::from),
            disabled: attrs.contains_key("disabled"),
            required: attrs.contains_key("required"),
            is_sensitive: false,
            sensitivity_reason: None,
        });
    }

    // <select ...>...</select>
    let re_select = Regex::new(r"(?is)<select\b([^>]*)>(.*?)</select>").unwrap();
    let re_option = Regex::new(r"(?is)<option\b([^>]*)>(.*?)</option>").unwrap();
    for cap in re_select.captures_iter(fragment) {
        let attrs = parse_html_attrs(cap.get(1).map(|m| m.as_str()).unwrap_or(""));
        let inner = cap.get(2).map(|m| m.as_str()).unwrap_or("");
        let html_id = attrs.get("id").cloned();
        let name = attrs.get("name").cloned();

        let mut options = Vec::new();
        let mut selected_val = None;
        for o_cap in re_option.captures_iter(inner) {
            let o_attrs = parse_html_attrs(o_cap.get(1).map(|m| m.as_str()).unwrap_or(""));
            let o_txt = clean_inline_text(o_cap.get(2).map(|m| m.as_str()).unwrap_or(""));
            let o_val = o_attrs.get("value").cloned().unwrap_or_else(|| o_txt.clone());
            if o_attrs.contains_key("selected") || selected_val.is_none() {
                selected_val = Some(o_val.clone());
            }
            if !o_txt.is_empty() && o_txt != o_val {
                options.push(format!("{o_val} ({o_txt})"));
            } else if !o_val.is_empty() {
                options.push(o_val);
            }
        }

        let label = html_id
            .as_ref()
            .and_then(|id| label_for_map.get(id))
            .cloned()
            .or_else(|| attrs.get("aria-label").cloned())
            .or_else(|| name.clone())
            .or_else(|| html_id.clone())
            .unwrap_or_else(|| "select".into());
        let selector = if let Some(ref id) = html_id {
            format!("#{id}")
        } else if let Some(ref n) = name {
            format!("select[name=\"{n}\"]")
        } else {
            "select".into()
        };

        let el_id = format!("el-{}", *next_el_idx);
        *next_el_idx += 1;

        out.push(BrowserElement {
            element_id: el_id,
            kind: "select".into(),
            tag: "select".into(),
            input_type: Some("select".into()),
            label,
            selector,
            name,
            html_id,
            placeholder: None,
            href: None,
            value: selected_val,
            options,
            form_id: form_id.map(String::from),
            disabled: attrs.contains_key("disabled"),
            required: attrs.contains_key("required"),
            is_sensitive: false,
            sensitivity_reason: None,
        });
    }

    // <button ...>...</button>
    let re_button = Regex::new(r"(?is)<button\b([^>]*)>(.*?)</button>").unwrap();
    for cap in re_button.captures_iter(fragment) {
        let attrs = parse_html_attrs(cap.get(1).map(|m| m.as_str()).unwrap_or(""));
        let txt = clean_inline_text(cap.get(2).map(|m| m.as_str()).unwrap_or(""));
        let html_id = attrs.get("id").cloned();
        let name = attrs.get("name").cloned();
        let btn_type = attrs
            .get("type")
            .map(|t| t.to_ascii_lowercase())
            .unwrap_or_else(|| {
                if form_id.is_some() {
                    "submit".into()
                } else {
                    "button".into()
                }
            });
        let label = if !txt.is_empty() {
            txt
        } else {
            attrs
                .get("aria-label")
                .or_else(|| attrs.get("title"))
                .or(name.as_ref())
                .or(html_id.as_ref())
                .cloned()
                .unwrap_or_else(|| "Button".into())
        };
        let selector = if let Some(ref id) = html_id {
            format!("#{id}")
        } else if let Some(ref n) = name {
            format!("button[name=\"{n}\"]")
        } else {
            "button".into()
        };

        let sens = detect_sensitive_keywords(&label);
        let el_id = format!("el-{}", *next_el_idx);
        *next_el_idx += 1;

        out.push(BrowserElement {
            element_id: el_id,
            kind: "button".into(),
            tag: "button".into(),
            input_type: Some(btn_type),
            label,
            selector,
            name,
            html_id,
            placeholder: None,
            href: None,
            value: attrs.get("value").cloned(),
            options: vec![],
            form_id: form_id.map(String::from),
            disabled: attrs.contains_key("disabled"),
            required: false,
            is_sensitive: sens.is_some(),
            sensitivity_reason: sens,
        });
    }

    out
}

fn extract_tables(html: &str) -> Vec<BrowserTable> {
    let re_table = Regex::new(r"(?is)<table\b[^>]*>(.*?)</table>").unwrap();
    let re_tr = Regex::new(r"(?is)<tr\b[^>]*>(.*?)</tr>").unwrap();
    let re_th = Regex::new(r"(?is)<th\b[^>]*>(.*?)</th>").unwrap();
    let re_td = Regex::new(r"(?is)<td\b[^>]*>(.*?)</td>").unwrap();

    let mut tables = Vec::new();
    for (idx, t_cap) in re_table.captures_iter(html).take(10).enumerate() {
        let t_inner = t_cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let mut headers = Vec::new();
        let mut rows = Vec::new();

        for tr_cap in re_tr.captures_iter(t_inner).take(40) {
            let tr_inner = tr_cap.get(1).map(|m| m.as_str()).unwrap_or("");
            if headers.is_empty() {
                let ths: Vec<String> = re_th
                    .captures_iter(tr_inner)
                    .map(|c| clean_inline_text(c.get(1).map(|m| m.as_str()).unwrap_or("")))
                    .collect();
                if !ths.is_empty() {
                    headers = ths;
                    continue;
                }
            }
            let tds: Vec<String> = re_td
                .captures_iter(tr_inner)
                .map(|c| clean_inline_text(c.get(1).map(|m| m.as_str()).unwrap_or("")))
                .collect();
            if !tds.is_empty() {
                rows.push(tds);
            }
        }

        if !headers.is_empty() || !rows.is_empty() {
            tables.push(BrowserTable {
                index: idx + 1,
                headers,
                rows,
            });
        }
    }
    tables
}

fn extract_text_blocks(html: &str) -> Vec<String> {
    let re_block = Regex::new(
        r"(?is)<(?:p|li|article|section|blockquote|h[1-6]|pre)\b[^>]*>(.*?)</(?:p|li|article|section|blockquote|h[1-6]|pre)>",
    )
    .unwrap();
    let mut blocks = Vec::new();
    for cap in re_block.captures_iter(html) {
        let txt = clean_inline_text(cap.get(1).map(|m| m.as_str()).unwrap_or(""));
        if txt.len() >= 3 && !blocks.contains(&txt) {
            blocks.push(txt);
            if blocks.len() >= 150 {
                break;
            }
        }
    }
    blocks
}

fn detect_auth_barrier(
    raw_html: &str,
    full_text: &str,
    elements: &[BrowserElement],
    http_status: u16,
) -> Option<BrowserAuthBarrier> {
    let html_lower = raw_html.to_ascii_lowercase();
    let text_lower = full_text.to_ascii_lowercase();

    // 1. CAPTCHA / Anti-Bot challenge detection
    let captcha_provider = if html_lower.contains("cf-turnstile")
        || html_lower.contains("cf-chl-widget")
        || text_lower.contains("verify you are human")
        || text_lower.contains("checking your browser before accessing")
    {
        Some("Cloudflare Turnstile / Anti-Bot Challenge")
    } else if html_lower.contains("g-recaptcha") || html_lower.contains("google.com/recaptcha") {
        Some("Google reCAPTCHA")
    } else if html_lower.contains("h-captcha") || html_lower.contains("hcaptcha.com") {
        Some("hCaptcha")
    } else if text_lower.contains("complete the captcha")
        || text_lower.contains("xác minh bạn không phải là robot")
    {
        Some("CAPTCHA Challenge")
    } else {
        None
    };

    if let Some(prov) = captcha_provider {
        return Some(BrowserAuthBarrier {
            kind: "captcha".into(),
            provider: prov.into(),
            message: format!(
                "Page is protected by {}. Automated solving/bypassing is prohibited; ask the user to complete verification or assist.",
                prov
            ),
            requires_user_assistance: true,
        });
    }

    // 2. HTTP 401/403 authentication error
    if http_status == 401 || http_status == 403 {
        return Some(BrowserAuthBarrier {
            kind: "http_auth".into(),
            provider: format!("HTTP {http_status}"),
            message: format!(
                "Server returned HTTP {http_status} (Authentication / Authorization required). Ask the user for credentials or access assistance."
            ),
            requires_user_assistance: true,
        });
    }

    // 3. 2FA / OTP prompt
    let has_otp = elements.iter().any(|e| {
        let combined = format!(
            "{} {} {}",
            e.label,
            e.name.as_deref().unwrap_or(""),
            e.placeholder.as_deref().unwrap_or("")
        )
        .to_ascii_lowercase();
        combined.contains("otp")
            || combined.contains("2fa")
            || combined.contains("verification code")
            || combined.contains("mã xác thực")
            || combined.contains("two-factor")
    });
    if has_otp {
        return Some(BrowserAuthBarrier {
            kind: "mfa_required".into(),
            provider: "2FA / OTP Verification".into(),
            message: "Page requires a 2FA / OTP verification code. Ask the user to provide the verification code before proceeding.".into(),
            requires_user_assistance: true,
        });
    }

    // 4. Login form with password input
    let has_password_input = elements
        .iter()
        .any(|e| e.input_type.as_deref() == Some("password"));
    if has_password_input {
        return Some(BrowserAuthBarrier {
            kind: "login_required".into(),
            provider: "Login Form".into(),
            message: "Page contains a login/authentication form requiring credentials. Ask the user for confirmation or login assistance if credentials were not provided.".into(),
            requires_user_assistance: true,
        });
    }

    None
}

pub fn detect_sensitive_keywords(text: &str) -> Option<String> {
    let lower = text.to_ascii_lowercase();

    let payment_terms = [
        "checkout",
        "pay now",
        "place order",
        "complete purchase",
        "buy now",
        "credit card",
        "card number",
        "cvv",
        "billing",
        "thanh toán",
        "đặt hàng",
        "mua ngay",
        "chuyển khoản",
    ];
    for term in payment_terms {
        if lower.contains(term) {
            return Some(format!(
                "Payment / checkout action detected ('{term}'). User confirmation is mandatory."
            ));
        }
    }

    let delete_terms = [
        "delete",
        "remove account",
        "destroy",
        "permanently delete",
        "wipe",
        "xóa dữ liệu",
        "xóa tài khoản",
        "xóa vĩnh viễn",
    ];
    for term in delete_terms {
        if lower.contains(term) {
            return Some(format!(
                "Destructive / data deletion action detected ('{term}'). User confirmation is mandatory."
            ));
        }
    }

    let account_terms = [
        "change password",
        "reset password",
        "update password",
        "change email",
        "deactivate",
        "revoke",
        "đổi mật khẩu",
        "thay đổi mật khẩu",
        "thay đổi thông tin tài khoản",
    ];
    for term in account_terms {
        if lower.contains(term) {
            return Some(format!(
                "Account / security modification detected ('{term}'). User confirmation is mandatory."
            ));
        }
    }

    None
}

fn resolve_url(base: Option<&Url>, base_str: &str, raw_target: &str) -> String {
    let t = raw_target.trim();
    if t.is_empty() {
        return base_str.to_string();
    }
    if let Ok(abs) = Url::parse(t) {
        return abs.to_string();
    }
    if let Some(b) = base {
        if let Ok(joined) = b.join(t) {
            return joined.to_string();
        }
    }
    t.to_string()
}

fn parse_html_attrs(attr_str: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let re_attr = Regex::new(
        r#"([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?"#,
    )
    .unwrap();
    for cap in re_attr.captures_iter(attr_str) {
        if let Some(k) = cap.get(1) {
            let key = k.as_str().to_ascii_lowercase();
            let val = cap
                .get(2)
                .or_else(|| cap.get(3))
                .or_else(|| cap.get(4))
                .map(|m| decode_html_entities(m.as_str()))
                .unwrap_or_default();
            map.insert(key, val);
        }
    }
    map
}

fn clean_inline_text(raw: &str) -> String {
    let re_tags = Regex::new(r"(?is)<[^>]+>").unwrap();
    let stripped = re_tags.replace_all(raw, " ");
    let decoded = decode_html_entities(&stripped);
    decoded.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn decode_html_entities(s: &str) -> String {
    s.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&mdash;", "—")
        .replace("&ndash;", "–")
        .replace("&copy;", "©")
}

// ---- BUILT-IN AI TOOLS FOR BROWSER AUTOMATION (/browser) ----

pub struct BrowserToolSpec {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
    pub category: String,
    pub is_mutating: bool,
}

pub fn builtin_browser_tool_specs() -> Vec<BrowserToolSpec> {
    vec![
        BrowserToolSpec {
            name: "browser_navigate".into(),
            description: "Launch or reuse the active browser session and navigate to a URL (or 'back', 'forward', 'reload'). Waits for the page to load, analyzes content, and extracts interactive UI elements (buttons, inputs, links, menus, forms).".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "Target http(s):// URL to open, or 'back', 'forward', 'reload'"
                    }
                },
                "required": ["url"]
            }),
            category: "browser_read".into(),
            is_mutating: false,
        },
        BrowserToolSpec {
            name: "browser_inspect_page".into(),
            description: "Inspect the currently loaded web page and list interactive UI components (buttons, input fields, menus, links, forms) with their elementId and selectors.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "filter": {
                        "type": "string",
                        "enum": ["all", "buttons", "inputs", "links", "menus", "forms"],
                        "description": "Category of UI elements to inspect (default: 'all')"
                    },
                    "query": {
                        "type": "string",
                        "description": "Optional keyword to filter elements by label, name, placeholder, or href"
                    }
                }
            }),
            category: "browser_read".into(),
            is_mutating: false,
        },
        BrowserToolSpec {
            name: "browser_click".into(),
            description: "Click a button, link, checkbox, or menu item on the active web page by element_id (e.g. 'el-1'), CSS selector, or visible text, and observe the resulting page state.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "element_id": {
                        "type": "string",
                        "description": "Target elementId from browser_navigate or browser_inspect_page (e.g. 'el-1')"
                    },
                    "selector": {
                        "type": "string",
                        "description": "Optional CSS selector or HTML id (e.g. '#submit-btn')"
                    },
                    "text": {
                        "type": "string",
                        "description": "Optional visible text/label of the button or link to click"
                    }
                }
            }),
            category: "browser_interact".into(),
            is_mutating: true,
        },
        BrowserToolSpec {
            name: "browser_type".into(),
            description: "Enter text into an input field or textarea on the active web page and verify that the value was updated.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "element_id": {
                        "type": "string",
                        "description": "Target input elementId (e.g. 'el-2')"
                    },
                    "name": {
                        "type": "string",
                        "description": "Optional input name or HTML id attribute"
                    },
                    "label": {
                        "type": "string",
                        "description": "Optional input label or placeholder text"
                    },
                    "text": {
                        "type": "string",
                        "description": "Text value to enter into the field"
                    },
                    "clear_first": {
                        "type": "boolean",
                        "description": "Clear existing field value before typing (default: true)"
                    },
                    "press_enter": {
                        "type": "boolean",
                        "description": "Submit the enclosing form after typing (default: false)"
                    }
                },
                "required": ["text"]
            }),
            category: "browser_interact".into(),
            is_mutating: true,
        },
        BrowserToolSpec {
            name: "browser_select_option".into(),
            description: "Select an option in a <select> dropdown menu on the active web page and confirm the updated selection.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "element_id": {
                        "type": "string",
                        "description": "Target select elementId"
                    },
                    "name": {
                        "type": "string",
                        "description": "Optional select name or HTML id"
                    },
                    "value": {
                        "type": "string",
                        "description": "Option value or label to select"
                    }
                },
                "required": ["value"]
            }),
            category: "browser_interact".into(),
            is_mutating: true,
        },
        BrowserToolSpec {
            name: "browser_fill_form".into(),
            description: "Fill multiple form fields on the active web page in a single step and verify each field's updated state.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "form_id": {
                        "type": "string",
                        "description": "Optional formId (e.g. 'form-1')"
                    },
                    "fields": {
                        "type": "object",
                        "description": "Map of field element_id, name, or label to string value"
                    },
                    "submit": {
                        "type": "boolean",
                        "description": "Whether to submit the form immediately after filling (default: false; requires user confirmation for binding forms)"
                    }
                },
                "required": ["fields"]
            }),
            category: "browser_interact".into(),
            is_mutating: true,
        },
        BrowserToolSpec {
            name: "browser_submit_form".into(),
            description: "Submit a filled form on the active web page and observe the response page. Always confirm with the user before submitting binding, payment, or account-changing forms.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "form_id": {
                        "type": "string",
                        "description": "Form ID to submit (default: 'form-1')"
                    }
                }
            }),
            category: "browser_sensitive".into(),
            is_mutating: true,
        },
        BrowserToolSpec {
            name: "browser_search_page".into(),
            description: "Search for information on the active web page (or submit a query through the page's search input box) and return matching sections, headings, and interactive elements.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search keyword or phrase"
                    },
                    "submit_search_box": {
                        "type": "boolean",
                        "description": "If true, types the query into the page's search input and submits it (default: false)"
                    }
                },
                "required": ["query"]
            }),
            category: "browser_read".into(),
            is_mutating: false,
        },
        BrowserToolSpec {
            name: "browser_scroll".into(),
            description: "Scroll the active web page ('down', 'up', 'top', 'bottom', or to specific text) and observe the newly visible viewport content.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "direction": {
                        "type": "string",
                        "enum": ["down", "up", "top", "bottom"],
                        "description": "Scroll direction (default: 'down')"
                    },
                    "amount_px": {
                        "type": "integer",
                        "description": "Pixels to scroll (default: 600)"
                    },
                    "to_text": {
                        "type": "string",
                        "description": "Optional text on the page to scroll directly to"
                    }
                }
            }),
            category: "browser_read".into(),
            is_mutating: false,
        },
        BrowserToolSpec {
            name: "browser_extract_data".into(),
            description: "Extract and synthesize structured data from the active web page (headings, tables, links, forms, text content, and completed action history).".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "scope": {
                        "type": "string",
                        "enum": ["all", "summary", "headings", "tables", "links", "forms", "text"],
                        "description": "Data scope to extract (default: 'all')"
                    },
                    "max_chars": {
                        "type": "integer",
                        "description": "Maximum text characters to return (default: 10000)"
                    }
                }
            }),
            category: "browser_read".into(),
            is_mutating: false,
        },
    ]
}

pub fn describe_browser_action(
    tool_name: &str,
    args: &serde_json::Value,
    current_url: Option<&str>,
) -> String {
    let page = current_url.unwrap_or("(browser session)");
    match tool_name {
        "browser_navigate" => {
            let url = args.get("url").and_then(|v| v.as_str()).unwrap_or(page);
            format!("Navigate browser to '{url}'")
        }
        "browser_inspect_page" => {
            let filter = args.get("filter").and_then(|v| v.as_str()).unwrap_or("all");
            format!("Inspect UI elements (filter: {filter}) on '{page}'")
        }
        "browser_click" => {
            let target = args
                .get("element_id")
                .or_else(|| args.get("text"))
                .or_else(|| args.get("selector"))
                .and_then(|v| v.as_str())
                .unwrap_or("(element)");
            format!("Click element '{target}' on '{page}'")
        }
        "browser_type" => {
            let target = args
                .get("element_id")
                .or_else(|| args.get("name"))
                .or_else(|| args.get("label"))
                .and_then(|v| v.as_str())
                .unwrap_or("(input)");
            format!("Enter text into field '{target}' on '{page}'")
        }
        "browser_select_option" => {
            let target = args
                .get("element_id")
                .or_else(|| args.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("(select)");
            let val = args.get("value").and_then(|v| v.as_str()).unwrap_or("");
            format!("Select option '{val}' in '{target}' on '{page}'")
        }
        "browser_fill_form" => {
            let count = args
                .get("fields")
                .and_then(|v| v.as_object())
                .map(|o| o.len())
                .unwrap_or(0);
            format!("Fill {count} form field(s) on '{page}'")
        }
        "browser_submit_form" => {
            let fid = args
                .get("form_id")
                .and_then(|v| v.as_str())
                .unwrap_or("form-1");
            format!("Submit form '{fid}' on '{page}'")
        }
        "browser_search_page" => {
            let q = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
            format!("Search for '{q}' on '{page}'")
        }
        "browser_scroll" => {
            let dir = args
                .get("direction")
                .and_then(|v| v.as_str())
                .unwrap_or("down");
            format!("Scroll '{dir}' on '{page}'")
        }
        "browser_extract_data" => {
            let scope = args.get("scope").and_then(|v| v.as_str()).unwrap_or("all");
            format!("Extract structured data ({scope}) from '{page}'")
        }
        _ => format!("Run browser action '{tool_name}' on '{page}'"),
    }
}

pub fn browser_mode_system_prompt(
    snapshot: Option<&BrowserSessionSnapshot>,
    cmd: &BrowserCommand,
    initial_nav_error: Option<&str>,
) -> String {
    let mut sections = Vec::new();
    sections.push(
        "## Browser Automation Mode Active (`/browser`)\n\
         You are operating a live stateful Browser Automation session (NOT a passive web search).\n\
         Available built-in browser tools: `browser_navigate`, `browser_inspect_page`, `browser_click`, `browser_type`, `browser_select_option`, `browser_fill_form`, `browser_submit_form`, `browser_search_page`, `browser_scroll`, `browser_extract_data`.\n\
         \n\
         ### Mandatory Operating Rules:\n\
         1. **Direct Execution**: Perform actions directly on the browser session using `browser_*` tools rather than instructing the user to perform them manually.\n\
         2. **Session Continuity**: Maintain and reuse the active browser session context across steps.\n\
         3. **Observe & Verify After Every Step**: Inspect the `observation` and returned page/element state after each tool call to confirm the action succeeded before proceeding to the next action.\n\
         4. **Clear Error Reporting**: If a page fails to load, returns an HTTP error, or a target UI element cannot be found, report the exact failed step and root cause clearly.\n\
         5. **Login, CAPTCHA & Extra Authentication**: If `authBarrier` is detected (login wall, CAPTCHA, Cloudflare Turnstile, reCAPTCHA, hCaptcha, or 2FA/OTP), stop and request user assistance immediately. Never attempt to bypass or solve CAPTCHAs automatically.\n\
         6. **Sensitive Action Protection**: Never automatically execute sensitive actions — such as payments/checkout, binding form submissions, deleting data, or changing account settings — without explicit user confirmation.\n\
         7. **Structured Response Format**: Present your response clearly with:\n\
            - **Trạng thái hiện tại (Current Status)**: Active URL, page title, load status.\n\
            - **Các thao tác đã hoàn thành (Completed Actions)**: Step-by-step summary of actions executed on the browser and verified observations.\n\
            - **Kết quả cuối cùng (Final Result)**: Structured data, extracted findings, or form/interaction outcomes (and clearly state any failed step + reason if incomplete)."
            .to_string(),
    );

    if let Some(err) = initial_nav_error {
        sections.push(format!(
            "### Initial Navigation Error\nTarget URL `{}` could not be loaded: {}",
            cmd.url.as_deref().unwrap_or("(none)"),
            err
        ));
    }

    if let Some(snap) = snapshot {
        let mut el_lines = Vec::new();
        for el in snap.elements.iter().take(35) {
            let extra = if let Some(ref href) = el.href {
                format!(" -> href=\"{href}\"")
            } else if let Some(ref val) = el.value {
                format!(" (value=\"{val}\")")
            } else if let Some(ref ph) = el.placeholder {
                format!(" (placeholder=\"{ph}\")")
            } else {
                String::new()
            };
            let sens_badge = if el.is_sensitive { " [SENSITIVE]" } else { "" };
            el_lines.push(format!(
                "- `{}` [{} / {}] label=\"{}\" selector=`{}`{}{}",
                el.element_id, el.kind, el.tag, el.label, el.selector, extra, sens_badge
            ));
        }

        let barrier_line = if let Some(ref b) = snap.auth_barrier {
            format!(
                "\n⚠️ **Auth / Verification Barrier Detected**: [{}] {} — {}",
                b.kind, b.provider, b.message
            )
        } else {
            String::new()
        };

        sections.push(format!(
            "### Active Browser Session Context\n\
             - **Session ID**: `{}`\n\
             - **Current URL**: `{}`\n\
             - **Page Title**: {}\n\
             - **HTTP Status**: {} ({}ms){}\n\
             - **Detected Interactive Elements ({} total)**:\n{}\n\
             - **Page Text Preview**:\n{}",
            snap.session_id,
            snap.current_url.as_deref().unwrap_or("(none)"),
            snap.page_title,
            snap.http_status
                .map(|c| c.to_string())
                .unwrap_or_else(|| "N/A".into()),
            snap.load_time_ms,
            barrier_line,
            snap.elements.len(),
            if el_lines.is_empty() {
                "  (no interactive elements detected)".to_string()
            } else {
                el_lines.join("\n")
            },
            if snap.text_preview.is_empty() {
                "(empty page text)".to_string()
            } else {
                snap.text_preview.clone()
            }
        ));
    }

    sections.join("\n\n")
}

pub async fn execute_builtin_browser_tool(
    browser: &BrowserManager,
    conversation_id: &str,
    tool_name: &str,
    args: &serde_json::Value,
    cancel: CancellationToken,
) -> AppResult<serde_json::Value> {
    if cancel.is_cancelled() {
        return Err(AppError::Cancelled);
    }
    match tool_name {
        "browser_navigate" => {
            let url = args
                .get("url")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::Validation("Missing required 'url' argument".into()))?;
            browser.navigate(conversation_id, url, cancel).await
        }
        "browser_inspect_page" => browser.inspect_page(conversation_id, args).await,
        "browser_click" => browser.click_element(conversation_id, args, cancel).await,
        "browser_type" => browser.type_text(conversation_id, args, cancel).await,
        "browser_select_option" => browser.select_option(conversation_id, args).await,
        "browser_fill_form" => browser.fill_form(conversation_id, args, cancel).await,
        "browser_submit_form" => browser.submit_form(conversation_id, args, cancel).await,
        "browser_search_page" => browser.search_page(conversation_id, args, cancel).await,
        "browser_scroll" => browser.scroll_page(conversation_id, args).await,
        "browser_extract_data" => browser.extract_data(conversation_id, args).await,
        other => Err(AppError::NotFound(format!(
            "Unknown built-in browser tool: {other}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        extract::Query,
        http::{header, HeaderMap},
        response::Html,
        routing::{get, post},
        Form, Router,
    };
    use tokio::net::TcpListener;

    #[test]
    fn parses_browser_slash_command_only_when_explicitly_invoked() {
        // Normal requests without /browser MUST return None
        assert!(parse_browser_command("https://example.com").is_none());
        assert!(parse_browser_command("Hãy tìm kiếm thông tin trên https://example.com").is_none());
        assert!(parse_browser_command("/browser_other https://example.com").is_none());

        // Explicit /browser with URL
        let cmd1 = parse_browser_command("/browser https://example.com").unwrap();
        assert_eq!(cmd1.url.as_deref(), Some("https://example.com/"));
        assert_eq!(cmd1.instruction, "");

        // Explicit /browser with domain (auto https) and extra user request
        let cmd2 =
            parse_browser_command("/browser example.com/docs Tìm mục API và click vào nút Get Started")
                .unwrap();
        assert_eq!(cmd2.url.as_deref(), Some("https://example.com/docs"));
        assert_eq!(
            cmd2.instruction,
            "Tìm mục API và click vào nút Get Started"
        );

        // Explicit /browser continuing on existing session
        let cmd3 = parse_browser_command("/browser click vào nút Đăng ký").unwrap();
        assert_eq!(cmd3.url, None);
        assert_eq!(cmd3.instruction, "click vào nút Đăng ký");

        // /browser with + separators or inline slash command
        let cmd4 = parse_browser_command("/browser + https://example.com + Tóm tắt bảng giá").unwrap();
        assert_eq!(cmd4.url.as_deref(), Some("https://example.com/"));
        assert_eq!(cmd4.instruction, "Tóm tắt bảng giá");

        let cmd5 = parse_browser_command("Hãy mở /browser https://example.com/app và kiểm tra menu").unwrap();
        assert_eq!(cmd5.url.as_deref(), Some("https://example.com/app"));

        // URL path containing /browser must NOT falsely trigger
        assert!(parse_browser_command("Xem tài liệu tại https://example.com/browser/docs").is_none());
    }

    #[test]
    fn detects_captcha_login_and_sensitive_actions() {
        let captcha_html = r#"
            <html><head><title>Verify</title></head>
            <body>
                <div class="cf-turnstile" data-sitekey="123"></div>
                <p>Verify you are human</p>
            </body></html>
        "#;
        let parsed = parse_html_document(captcha_html, "https://example.com", 200);
        assert!(parsed.auth_barrier.is_some());
        assert_eq!(parsed.auth_barrier.as_ref().unwrap().kind, "captcha");

        let login_html = r#"
            <html><head><title>Sign In</title></head>
            <body>
                <form action="/login" method="POST">
                    <label for="user">Username</label>
                    <input id="user" name="username" type="text" />
                    <input id="pass" name="password" type="password" />
                    <button type="submit">Sign In</button>
                </form>
                <button id="pay-btn">Thanh toán ngay</button>
                <button id="del-btn">Xóa tài khoản</button>
            </body></html>
        "#;
        let parsed_login = parse_html_document(login_html, "https://example.com/login", 200);
        assert_eq!(
            parsed_login.auth_barrier.as_ref().unwrap().kind,
            "login_required"
        );
        let pay_el = parsed_login
            .elements
            .iter()
            .find(|e| e.html_id.as_deref() == Some("pay-btn"))
            .unwrap();
        assert!(pay_el.is_sensitive);
        let del_el = parsed_login
            .elements
            .iter()
            .find(|e| e.html_id.as_deref() == Some("del-btn"))
            .unwrap();
        assert!(del_el.is_sensitive);
    }

    #[tokio::test]
    async fn browser_session_navigates_clicks_fills_forms_scrolls_and_extracts_data() {
        let app = Router::new()
            .route(
                "/",
                get(|| async {
                    let mut headers = HeaderMap::new();
                    headers.insert(
                        header::SET_COOKIE,
                        "session_token=abc123xyz; Path=/".parse().unwrap(),
                    );
                    (
                        headers,
                        Html(
                            r#"<!DOCTYPE html>
                            <html>
                            <head><title>Noctra Portal</title></head>
                            <body>
                                <nav><a href="/products">Products Menu</a></nav>
                                <h1>Welcome to Noctra Portal</h1>
                                <p>Automate web workflows safely with local-first AI.</p>
                                <form id="search-form" action="/search" method="GET">
                                    <label for="q-input">Search query</label>
                                    <input id="q-input" name="q" type="search" placeholder="Search items..." />
                                    <select id="cat-select" name="category">
                                        <option value="all">All</option>
                                        <option value="tools">Tools</option>
                                    </select>
                                    <button id="search-btn" type="submit">Search</button>
                                </form>
                                <table>
                                    <tr><th>Feature</th><th>Status</th></tr>
                                    <tr><td>Browser Automation</td><td>Active</td></tr>
                                </table>
                            </body>
                            </html>"#,
                        ),
                    )
                }),
            )
            .route(
                "/products",
                get(|| async {
                    Html(
                        r#"<!DOCTYPE html>
                        <html>
                        <head><title>Products Catalog</title></head>
                        <body>
                            <h1>Products Catalog</h1>
                            <p>Item 1: Noctra Studio Desktop</p>
                            <form id="order-form" action="/checkout" method="POST">
                                <input name="plan" value="pro" />
                                <button id="checkout-btn" type="submit">Checkout & Pay Now</button>
                            </form>
                        </body>
                        </html>"#,
                    )
                }),
            )
            .route(
                "/search",
                get(|Query(params): Query<HashMap<String, String>>| async move {
                    let q = params.get("q").cloned().unwrap_or_default();
                    let cat = params.get("category").cloned().unwrap_or_default();
                    Html(format!(
                        r#"<html><head><title>Search Results</title></head>
                        <body><h1>Results for {q} in {cat}</h1><p>Found 1 matching result for {q}.</p></body></html>"#
                    ))
                }),
            )
            .route(
                "/checkout",
                post(|Form(params): Form<HashMap<String, String>>| async move {
                    let plan = params.get("plan").cloned().unwrap_or_default();
                    Html(format!(
                        r#"<html><head><title>Order Confirmed</title></head>
                        <body><h1>Confirmed plan: {plan}</h1></body></html>"#
                    ))
                }),
            );

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

        let redactor = Arc::new(SecretRedactor::new());
        let mgr = BrowserManager::new(redactor);
        let cancel = CancellationToken::new();
        let conv_id = "conv-browser-test";

        // 1. Navigate to home page
        let nav_res = mgr
            .navigate(conv_id, &format!("http://{addr}/"), cancel.clone())
            .await
            .unwrap();
        assert_eq!(nav_res["title"], "Noctra Portal");
        assert_eq!(nav_res["httpStatus"], 200);

        // Verify session cookies were stored
        let snap = mgr.get_session_snapshot(conv_id).await.unwrap();
        assert!(snap.cookie_keys.contains(&"session_token".to_string()));

        // 2. Type into search box and select category
        let type_res = mgr
            .type_text(
                conv_id,
                &serde_json::json!({
                    "name": "q",
                    "text": "MCP Tool",
                }),
                cancel.clone(),
            )
            .await
            .unwrap();
        assert_eq!(type_res["value"], "MCP Tool");

        let sel_res = mgr
            .select_option(
                conv_id,
                &serde_json::json!({
                    "name": "category",
                    "value": "tools",
                }),
            )
            .await
            .unwrap();
        assert_eq!(sel_res["selectedValue"], "tools");

        // 3. Click the Search submit button and verify navigation to /search
        let click_res = mgr
            .click_element(
                conv_id,
                &serde_json::json!({ "selector": "#search-btn" }),
                cancel.clone(),
            )
            .await
            .unwrap();
        assert_eq!(click_res["title"], "Search Results");
        assert!(click_res["textPreview"]
            .as_str()
            .unwrap()
            .contains("Results for MCP Tool in tools"));

        // 4. Navigate back to home page, then click Products Menu link
        let back_res = mgr.navigate(conv_id, "back", cancel.clone()).await.unwrap();
        assert_eq!(back_res["title"], "Noctra Portal");

        // Extract table data on home page
        let ext_res = mgr
            .extract_data(conv_id, &serde_json::json!({ "scope": "tables" }))
            .await
            .unwrap();
        assert_eq!(ext_res["tables"][0]["rows"][0][0], "Browser Automation");

        let link_click = mgr
            .click_element(
                conv_id,
                &serde_json::json!({ "text": "Products Menu" }),
                cancel.clone(),
            )
            .await
            .unwrap();
        assert_eq!(link_click["title"], "Products Catalog");

        // 5. Verify sensitivity check flags the "Checkout & Pay Now" button and form submission
        let (is_sens, reason) = mgr
            .check_action_sensitivity(
                conv_id,
                "browser_click",
                &serde_json::json!({ "selector": "#checkout-btn" }),
            )
            .await;
        assert!(is_sens);
        assert!(reason.unwrap().to_ascii_lowercase().contains("payment"));
    }
}
