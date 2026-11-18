pub mod migrations;
pub mod models;

use crate::error::{AppError, AppResult};
use crate::security::redaction::SecretRedactor;
use chrono::Utc;
use models::*;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

pub struct Database {
    conn: Mutex<Connection>,
    pub data_dir: PathBuf,
    redactor: Arc<SecretRedactor>,
}

impl Database {
    pub fn open(data_dir: PathBuf, redactor: Arc<SecretRedactor>) -> AppResult<Self> {
        std::fs::create_dir_all(&data_dir)?;
        let db_path = data_dir.join("noctra_studio.db");
        let conn = Connection::open(db_path)?;
        migrations::run_migrations(&conn)?;
        let db = Self {
            conn: Mutex::new(conn),
            data_dir,
            redactor,
        };
        db.cleanup_orphaned_provider_refs()?;
        Ok(db)
    }

    pub fn open_in_memory(data_dir: PathBuf, redactor: Arc<SecretRedactor>) -> AppResult<Self> {
        std::fs::create_dir_all(&data_dir)?;
        let conn = Connection::open_in_memory()?;
        migrations::run_migrations(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
            data_dir,
            redactor,
        })
    }

    pub fn skills_dir(&self) -> PathBuf {
        self.data_dir.join("skills")
    }

    pub fn log_event(&self, source: &str, level: &str, message: &str, detail: Option<&str>) {
        let clean_msg = self.redactor.redact(message);
        let clean_detail = detail.map(|d| self.redactor.redact(d));
        if let Ok(conn) = self.conn.lock() {
            let _ = conn.execute(
                "INSERT INTO audit_logs (id, source, level, message, detail, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    Uuid::new_v4().to_string(),
                    source,
                    level,
                    clean_msg,
                    clean_detail,
                    Utc::now().to_rfc3339()
                ],
            );
            let _ = conn.execute(
                "DELETE FROM audit_logs WHERE id NOT IN (SELECT id FROM audit_logs ORDER BY created_at DESC LIMIT 1000)",
                [],
            );
        }
    }

    pub fn list_audit_logs(&self, limit: usize) -> AppResult<Vec<AuditLogEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, source, level, message, detail, created_at FROM audit_logs ORDER BY created_at DESC LIMIT ?1",
        )?;
        let rows = stmt
            .query_map([limit as i64], |r| {
                Ok(AuditLogEntry {
                    id: r.get(0)?,
                    source: r.get(1)?,
                    level: r.get(2)?,
                    message: r.get(3)?,
                    detail: r.get(4)?,
                    created_at: r.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn clear_audit_logs(&self) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM audit_logs", [])?;
        Ok(())
    }

    // ---- SETTINGS ----
    pub fn get_settings(&self) -> AppResult<AppSettings> {
        let conn = self.conn.lock().unwrap();
        let raw: Option<String> = conn
            .query_row(
                "SELECT value_json FROM app_settings WHERE key = 'app_settings'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        let mut settings = match raw {
            Some(json) => serde_json::from_str::<AppSettings>(&json).unwrap_or_default(),
            None => AppSettings::default(),
        };
        if settings.skills.install_directory.is_empty() {
            settings.skills.install_directory = self.skills_dir().to_string_lossy().to_string();
        }
        Ok(settings)
    }

    pub fn save_settings(&self, settings: &AppSettings) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        let json = serde_json::to_string(settings)?;
        conn.execute(
            "INSERT INTO app_settings (key, value_json) VALUES ('app_settings', ?1) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
            [json],
        )?;
        Ok(())
    }

    // ---- PROVIDERS ----
    pub fn list_providers(&self) -> AppResult<Vec<AiProvider>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, base_url, model_id, custom_headers_json, temperature, top_p, max_tokens, timeout_secs, streaming, default_system_prompt, has_api_key, created_at, updated_at FROM ai_providers ORDER BY created_at ASC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                let headers_str: String = r.get(4)?;
                let custom_headers: HashMap<String, String> =
                    serde_json::from_str(&headers_str).unwrap_or_default();
                Ok(AiProvider {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    base_url: r.get(2)?,
                    model_id: r.get(3)?,
                    custom_headers,
                    temperature: r.get(5)?,
                    top_p: r.get(6)?,
                    max_tokens: r.get::<_, i64>(7)? as u32,
                    timeout_secs: r.get::<_, i64>(8)? as u64,
                    streaming: r.get::<_, i64>(9)? != 0,
                    default_system_prompt: r.get(10)?,
                    has_api_key: r.get::<_, i64>(11)? != 0,
                    created_at: r.get(12)?,
                    updated_at: r.get(13)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get_provider(&self, id: &str) -> AppResult<Option<AiProvider>> {
        Ok(self.list_providers()?.into_iter().find(|p| p.id == id))
    }

    pub fn upsert_provider(&self, provider: &AiProvider) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        let headers_json = serde_json::to_string(&provider.custom_headers)?;
        conn.execute(
            r#"INSERT INTO ai_providers (
                id, name, base_url, model_id, custom_headers_json, temperature, top_p,
                max_tokens, timeout_secs, streaming, default_system_prompt, has_api_key,
                created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                base_url = excluded.base_url,
                model_id = excluded.model_id,
                custom_headers_json = excluded.custom_headers_json,
                temperature = excluded.temperature,
                top_p = excluded.top_p,
                max_tokens = excluded.max_tokens,
                timeout_secs = excluded.timeout_secs,
                streaming = excluded.streaming,
                default_system_prompt = excluded.default_system_prompt,
                has_api_key = excluded.has_api_key,
                updated_at = excluded.updated_at"#,
            params![
                provider.id,
                provider.name,
                provider.base_url,
                provider.model_id,
                headers_json,
                provider.temperature,
                provider.top_p,
                provider.max_tokens as i64,
                provider.timeout_secs as i64,
                if provider.streaming { 1 } else { 0 },
                provider.default_system_prompt,
                if provider.has_api_key { 1 } else { 0 },
                provider.created_at,
                provider.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_provider(&self, id: &str) -> AppResult<()> {
        {
            let conn = self.conn.lock().unwrap();
            conn.execute("DELETE FROM ai_providers WHERE id = ?1", [id])?;
            conn.execute(
                "UPDATE conversations SET active_provider_id = NULL WHERE active_provider_id = ?1",
                [id],
            )?;
            conn.execute(
                "UPDATE agents SET provider_id = NULL WHERE provider_id = ?1",
                [id],
            )?;
        }
        let mut settings = self.get_settings()?;
        if settings.ai.default_provider_id.as_deref() == Some(id) {
            settings.ai.default_provider_id = None;
            self.save_settings(&settings)?;
        }
        Ok(())
    }

    /// Clears stale provider references left behind by deleted providers or imported backups.
    pub fn cleanup_orphaned_provider_refs(&self) -> AppResult<()> {
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "UPDATE conversations SET active_provider_id = NULL WHERE active_provider_id IS NOT NULL AND (TRIM(active_provider_id) = '' OR active_provider_id NOT IN (SELECT id FROM ai_providers))",
                [],
            )?;
            conn.execute(
                "UPDATE agents SET provider_id = NULL WHERE provider_id IS NOT NULL AND (TRIM(provider_id) = '' OR provider_id NOT IN (SELECT id FROM ai_providers))",
                [],
            )?;
        }
        let mut settings = self.get_settings()?;
        if let Some(ref def_id) = settings.ai.default_provider_id {
            if def_id.trim().is_empty() || self.get_provider(def_id)?.is_none() {
                settings.ai.default_provider_id = None;
                self.save_settings(&settings)?;
            }
        }
        Ok(())
    }

    // ---- CONVERSATIONS & MESSAGES ----
    pub fn list_conversations(&self) -> AppResult<Vec<Conversation>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, title, mode, execution_mode, active_provider_id, active_model, active_agent_id, project_id, system_prompt_override, created_at, updated_at FROM conversations ORDER BY updated_at DESC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Conversation {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    mode: r.get(2)?,
                    execution_mode: normalize_execution_mode(&r.get::<_, String>(3)?),
                    active_provider_id: r.get(4)?,
                    active_model: r.get(5)?,
                    active_agent_id: r.get(6)?,
                    project_id: r.get(7)?,
                    system_prompt_override: r.get(8)?,
                    created_at: r.get(9)?,
                    updated_at: r.get(10)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get_conversation(&self, id: &str) -> AppResult<Option<Conversation>> {
        Ok(self.list_conversations()?.into_iter().find(|c| c.id == id))
    }

    pub fn upsert_conversation(&self, conv: &Conversation) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        let exec_mode = normalize_execution_mode(&conv.execution_mode);
        conn.execute(
            r#"INSERT INTO conversations (
                id, title, mode, execution_mode, active_provider_id, active_model, active_agent_id,
                project_id, system_prompt_override, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                mode = excluded.mode,
                execution_mode = excluded.execution_mode,
                active_provider_id = excluded.active_provider_id,
                active_model = excluded.active_model,
                active_agent_id = excluded.active_agent_id,
                project_id = excluded.project_id,
                system_prompt_override = excluded.system_prompt_override,
                updated_at = excluded.updated_at"#,
            params![
                conv.id,
                conv.title,
                conv.mode,
                exec_mode,
                conv.active_provider_id,
                conv.active_model,
                conv.active_agent_id,
                conv.project_id,
                conv.system_prompt_override,
                conv.created_at,
                conv.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_conversation(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM conversations WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn list_messages(&self, conversation_id: &str) -> AppResult<Vec<ChatMessage>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, conversation_id, role, content, attachments_json, tool_calls_json, tool_call_id, token_usage_json, created_at FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC, rowid ASC",
        )?;
        let rows = stmt
            .query_map([conversation_id], |r| {
                let att_str: String = r.get(4)?;
                let tc_str: String = r.get(5)?;
                let tu_str: Option<String> = r.get(7)?;
                Ok(ChatMessage {
                    id: r.get(0)?,
                    conversation_id: r.get(1)?,
                    role: r.get(2)?,
                    content: r.get(3)?,
                    attachments: serde_json::from_str(&att_str).unwrap_or_default(),
                    tool_calls: serde_json::from_str(&tc_str).unwrap_or_default(),
                    tool_call_id: r.get(6)?,
                    token_usage: tu_str.and_then(|s| serde_json::from_str(&s).ok()),
                    created_at: r.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn upsert_message(&self, msg: &ChatMessage) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        let att_json = serde_json::to_string(&msg.attachments)?;
        let tc_json = serde_json::to_string(&msg.tool_calls)?;
        let tu_json = msg
            .token_usage
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        conn.execute(
            r#"INSERT INTO messages (
                id, conversation_id, role, content, attachments_json, tool_calls_json,
                tool_call_id, token_usage_json, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(id) DO UPDATE SET
                content = excluded.content,
                attachments_json = excluded.attachments_json,
                tool_calls_json = excluded.tool_calls_json,
                token_usage_json = excluded.token_usage_json"#,
            params![
                msg.id,
                msg.conversation_id,
                msg.role,
                msg.content,
                att_json,
                tc_json,
                msg.tool_call_id,
                tu_json,
                msg.created_at,
            ],
        )?;
        conn.execute(
            "UPDATE conversations SET updated_at = ?2 WHERE id = ?1",
            params![msg.conversation_id, Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    pub fn delete_message(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM messages WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn delete_messages_after(&self, conversation_id: &str, created_at_inclusive: &str) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM messages WHERE conversation_id = ?1 AND created_at >= ?2",
            params![conversation_id, created_at_inclusive],
        )?;
        Ok(())
    }

    // ---- MCP SERVERS, TOOLS, RESOURCES, PROMPTS ----
    pub fn list_mcp_servers(&self) -> AppResult<Vec<McpServer>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, source, trust_level, transport, endpoint_or_command, args_json, env_keys_json, plain_env_json, auth_type, auth_config_json, has_auth_secret, auto_reconnect, max_reconnects, enabled, status, last_error, server_info_json, created_at, updated_at FROM mcp_servers ORDER BY created_at ASC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                let args_str: String = r.get(7)?;
                let env_keys_str: String = r.get(8)?;
                let plain_env_str: String = r.get(9)?;
                let auth_cfg_str: String = r.get(11)?;
                let info_str: Option<String> = r.get(18)?;
                Ok(McpServer {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    description: r.get(2)?,
                    source: r.get(3)?,
                    trust_level: r.get(4)?,
                    transport: r.get(5)?,
                    endpoint_or_command: r.get(6)?,
                    args: serde_json::from_str(&args_str).unwrap_or_default(),
                    env_keys: serde_json::from_str(&env_keys_str).unwrap_or_default(),
                    plain_env: serde_json::from_str(&plain_env_str).unwrap_or_default(),
                    auth_type: r.get(10)?,
                    auth_config: serde_json::from_str(&auth_cfg_str).unwrap_or(serde_json::json!({})),
                    has_auth_secret: r.get::<_, i64>(12)? != 0,
                    auto_reconnect: r.get::<_, i64>(13)? != 0,
                    max_reconnects: r.get::<_, i64>(14)? as u32,
                    enabled: r.get::<_, i64>(15)? != 0,
                    status: r.get(16)?,
                    last_error: r.get(17)?,
                    server_info: info_str.and_then(|s| serde_json::from_str(&s).ok()),
                    created_at: r.get(19)?,
                    updated_at: r.get(20)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get_mcp_server(&self, id: &str) -> AppResult<Option<McpServer>> {
        Ok(self.list_mcp_servers()?.into_iter().find(|s| s.id == id))
    }

    pub fn upsert_mcp_server(&self, s: &McpServer) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"INSERT INTO mcp_servers (
                id, name, description, source, trust_level, transport, endpoint_or_command,
                args_json, env_keys_json, plain_env_json, auth_type, auth_config_json,
                has_auth_secret, auto_reconnect, max_reconnects, enabled, status, last_error,
                server_info_json, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                source = excluded.source,
                trust_level = excluded.trust_level,
                transport = excluded.transport,
                endpoint_or_command = excluded.endpoint_or_command,
                args_json = excluded.args_json,
                env_keys_json = excluded.env_keys_json,
                plain_env_json = excluded.plain_env_json,
                auth_type = excluded.auth_type,
                auth_config_json = excluded.auth_config_json,
                has_auth_secret = excluded.has_auth_secret,
                auto_reconnect = excluded.auto_reconnect,
                max_reconnects = excluded.max_reconnects,
                enabled = excluded.enabled,
                status = excluded.status,
                last_error = excluded.last_error,
                server_info_json = excluded.server_info_json,
                updated_at = excluded.updated_at"#,
            params![
                s.id,
                s.name,
                s.description,
                s.source,
                s.trust_level,
                s.transport,
                s.endpoint_or_command,
                serde_json::to_string(&s.args)?,
                serde_json::to_string(&s.env_keys)?,
                serde_json::to_string(&s.plain_env)?,
                s.auth_type,
                serde_json::to_string(&s.auth_config)?,
                if s.has_auth_secret { 1 } else { 0 },
                if s.auto_reconnect { 1 } else { 0 },
                s.max_reconnects as i64,
                if s.enabled { 1 } else { 0 },
                s.status,
                s.last_error,
                s.server_info.as_ref().map(serde_json::to_string).transpose()?,
                s.created_at,
                s.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn update_mcp_server_status(
        &self,
        id: &str,
        status: &str,
        last_error: Option<&str>,
        server_info: Option<&serde_json::Value>,
    ) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        let clean_err = last_error.map(|e| self.redactor.redact(e));
        let info_str = server_info.map(serde_json::to_string).transpose()?;
        conn.execute(
            "UPDATE mcp_servers SET status = ?2, last_error = ?3, server_info_json = COALESCE(?4, server_info_json), updated_at = ?5 WHERE id = ?1",
            params![id, status, clean_err, info_str, Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    pub fn delete_mcp_server(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM mcp_servers WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn replace_mcp_discovery(
        &self,
        server_id: &str,
        tools: &[McpTool],
        resources: &[McpResource],
        prompts: &[McpPrompt],
    ) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        // Preserve previous enabled flag per tool name when re-discovering
        let mut prev_enabled: HashMap<String, bool> = HashMap::new();
        {
            let mut stmt = conn.prepare("SELECT name, enabled FROM mcp_tools WHERE server_id = ?1")?;
            let rows = stmt.query_map([server_id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? != 0))
            })?;
            for row in rows.flatten() {
                prev_enabled.insert(row.0, row.1);
            }
        }

        conn.execute("DELETE FROM mcp_tools WHERE server_id = ?1", [server_id])?;
        conn.execute("DELETE FROM mcp_resources WHERE server_id = ?1", [server_id])?;
        conn.execute("DELETE FROM mcp_prompts WHERE server_id = ?1", [server_id])?;

        for t in tools {
            let enabled = prev_enabled.get(&t.name).copied().unwrap_or(t.enabled);
            conn.execute(
                "INSERT INTO mcp_tools (id, server_id, name, description, input_schema_json, output_schema_json, required_permissions_json, enabled, available) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    t.id,
                    server_id,
                    t.name,
                    t.description,
                    serde_json::to_string(&t.input_schema)?,
                    t.output_schema.as_ref().map(serde_json::to_string).transpose()?,
                    serde_json::to_string(&t.required_permissions)?,
                    if enabled { 1 } else { 0 },
                    if t.available { 1 } else { 0 },
                ],
            )?;
        }

        for r in resources {
            conn.execute(
                "INSERT INTO mcp_resources (id, server_id, uri, name, description, mime_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![r.id, server_id, r.uri, r.name, r.description, r.mime_type],
            )?;
        }

        for p in prompts {
            conn.execute(
                "INSERT INTO mcp_prompts (id, server_id, name, description, arguments_json) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![p.id, server_id, p.name, p.description, serde_json::to_string(&p.arguments)?],
            )?;
        }

        Ok(())
    }

    pub fn list_mcp_tools(&self) -> AppResult<Vec<McpTool>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT t.id, t.server_id, s.name, t.name, t.description, t.input_schema_json, t.output_schema_json, t.required_permissions_json, t.enabled, t.available FROM mcp_tools t JOIN mcp_servers s ON s.id = t.server_id ORDER BY s.name, t.name",
        )?;
        let rows = stmt
            .query_map([], |r| {
                let in_str: String = r.get(5)?;
                let out_str: Option<String> = r.get(6)?;
                let perm_str: String = r.get(7)?;
                Ok(McpTool {
                    id: r.get(0)?,
                    server_id: r.get(1)?,
                    server_name: r.get(2)?,
                    name: r.get(3)?,
                    description: r.get(4)?,
                    input_schema: serde_json::from_str(&in_str).unwrap_or(serde_json::json!({"type": "object"})),
                    output_schema: out_str.and_then(|s| serde_json::from_str(&s).ok()),
                    required_permissions: serde_json::from_str(&perm_str).unwrap_or_default(),
                    enabled: r.get::<_, i64>(8)? != 0,
                    available: r.get::<_, i64>(9)? != 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn set_mcp_tool_enabled(&self, tool_id: &str, enabled: bool) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE mcp_tools SET enabled = ?2 WHERE id = ?1",
            params![tool_id, if enabled { 1 } else { 0 }],
        )?;
        Ok(())
    }

    pub fn list_mcp_resources(&self, server_id: Option<&str>) -> AppResult<Vec<McpResource>> {
        let conn = self.conn.lock().unwrap();
        let query = if server_id.is_some() {
            "SELECT id, server_id, uri, name, description, mime_type FROM mcp_resources WHERE server_id = ?1 ORDER BY name"
        } else {
            "SELECT id, server_id, uri, name, description, mime_type FROM mcp_resources ORDER BY name"
        };
        let mut stmt = conn.prepare(query)?;
        let mapper = |r: &rusqlite::Row| {
            Ok(McpResource {
                id: r.get(0)?,
                server_id: r.get(1)?,
                uri: r.get(2)?,
                name: r.get(3)?,
                description: r.get(4)?,
                mime_type: r.get(5)?,
            })
        };
        let rows = if let Some(sid) = server_id {
            stmt.query_map([sid], mapper)?.collect::<Result<Vec<_>, _>>()?
        } else {
            stmt.query_map([], mapper)?.collect::<Result<Vec<_>, _>>()?
        };
        Ok(rows)
    }

    pub fn list_mcp_prompts(&self, server_id: Option<&str>) -> AppResult<Vec<McpPrompt>> {
        let conn = self.conn.lock().unwrap();
        let query = if server_id.is_some() {
            "SELECT id, server_id, name, description, arguments_json FROM mcp_prompts WHERE server_id = ?1 ORDER BY name"
        } else {
            "SELECT id, server_id, name, description, arguments_json FROM mcp_prompts ORDER BY name"
        };
        let mut stmt = conn.prepare(query)?;
        let mapper = |r: &rusqlite::Row| {
            let args_str: String = r.get(4)?;
            Ok(McpPrompt {
                id: r.get(0)?,
                server_id: r.get(1)?,
                name: r.get(2)?,
                description: r.get(3)?,
                arguments: serde_json::from_str(&args_str).unwrap_or(serde_json::json!([])),
            })
        };
        let rows = if let Some(sid) = server_id {
            stmt.query_map([sid], mapper)?.collect::<Result<Vec<_>, _>>()?
        } else {
            stmt.query_map([], mapper)?.collect::<Result<Vec<_>, _>>()?
        };
        Ok(rows)
    }

    // ---- SKILLS ----
    pub fn list_skills(&self) -> AppResult<Vec<SkillRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, category, source_type, source_url, branch_or_tag, subdirectory, commit_sha, version, local_path, enabled, trust_level, frontmatter_json, instructions_md, dependencies_json, supporting_files_json, validation_errors_json, created_at, updated_at FROM skills ORDER BY name ASC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(SkillRecord {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    description: r.get(2)?,
                    category: r.get(3)?,
                    source_type: r.get(4)?,
                    source_url: r.get(5)?,
                    branch_or_tag: r.get(6)?,
                    subdirectory: r.get(7)?,
                    commit_sha: r.get(8)?,
                    version: r.get(9)?,
                    local_path: r.get(10)?,
                    enabled: r.get::<_, i64>(11)? != 0,
                    trust_level: r.get(12)?,
                    frontmatter: serde_json::from_str(&r.get::<_, String>(13)?).unwrap_or(serde_json::json!({})),
                    instructions_md: r.get(14)?,
                    dependencies: serde_json::from_str(&r.get::<_, String>(15)?).unwrap_or_default(),
                    supporting_files: serde_json::from_str(&r.get::<_, String>(16)?).unwrap_or_default(),
                    validation_errors: serde_json::from_str(&r.get::<_, String>(17)?).unwrap_or_default(),
                    created_at: r.get(18)?,
                    updated_at: r.get(19)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get_skill(&self, id: &str) -> AppResult<Option<SkillRecord>> {
        Ok(self.list_skills()?.into_iter().find(|s| s.id == id))
    }

    pub fn upsert_skill(&self, s: &SkillRecord) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"INSERT INTO skills (
                id, name, description, category, source_type, source_url, branch_or_tag,
                subdirectory, commit_sha, version, local_path, enabled, trust_level,
                frontmatter_json, instructions_md, dependencies_json, supporting_files_json,
                validation_errors_json, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                category = excluded.category,
                source_type = excluded.source_type,
                source_url = excluded.source_url,
                branch_or_tag = excluded.branch_or_tag,
                subdirectory = excluded.subdirectory,
                commit_sha = excluded.commit_sha,
                version = excluded.version,
                local_path = excluded.local_path,
                enabled = excluded.enabled,
                trust_level = excluded.trust_level,
                frontmatter_json = excluded.frontmatter_json,
                instructions_md = excluded.instructions_md,
                dependencies_json = excluded.dependencies_json,
                supporting_files_json = excluded.supporting_files_json,
                validation_errors_json = excluded.validation_errors_json,
                updated_at = excluded.updated_at"#,
            params![
                s.id,
                s.name,
                s.description,
                s.category,
                s.source_type,
                s.source_url,
                s.branch_or_tag,
                s.subdirectory,
                s.commit_sha,
                s.version,
                s.local_path,
                if s.enabled { 1 } else { 0 },
                s.trust_level,
                serde_json::to_string(&s.frontmatter)?,
                s.instructions_md,
                serde_json::to_string(&s.dependencies)?,
                serde_json::to_string(&s.supporting_files)?,
                serde_json::to_string(&s.validation_errors)?,
                s.created_at,
                s.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_skill(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM skills WHERE id = ?1", [id])?;
        Ok(())
    }

    // ---- AGENTS & MEMORIES ----
    pub fn list_agents(&self) -> AppResult<Vec<AgentConfig>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, avatar, role, personality, system_instructions, provider_id, model_id, temperature, max_tokens, context_window, assigned_mcp_server_ids_json, enabled_tool_ids_json, assigned_skill_ids_json, file_access_mode, allowed_directories_json, internet_access, external_api_access, autonomous_execution, require_approval_sensitive, max_steps, max_tool_calls, max_runtime_secs, retry_policy, error_strategy, memory_config_json, is_template, created_at, updated_at FROM agents ORDER BY is_template ASC, name ASC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(AgentConfig {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    description: r.get(2)?,
                    avatar: r.get(3)?,
                    role: r.get(4)?,
                    personality: r.get(5)?,
                    system_instructions: r.get(6)?,
                    provider_id: r.get(7)?,
                    model_id: r.get(8)?,
                    temperature: r.get(9)?,
                    max_tokens: r.get::<_, i64>(10)? as u32,
                    context_window: r.get::<_, i64>(11)? as usize,
                    assigned_mcp_server_ids: serde_json::from_str(&r.get::<_, String>(12)?).unwrap_or_default(),
                    enabled_tool_ids: serde_json::from_str(&r.get::<_, String>(13)?).unwrap_or_default(),
                    assigned_skill_ids: serde_json::from_str(&r.get::<_, String>(14)?).unwrap_or_default(),
                    file_access_mode: r.get(15)?,
                    allowed_directories: serde_json::from_str(&r.get::<_, String>(16)?).unwrap_or_default(),
                    internet_access: r.get::<_, i64>(17)? != 0,
                    external_api_access: r.get::<_, i64>(18)? != 0,
                    autonomous_execution: r.get::<_, i64>(19)? != 0,
                    require_approval_sensitive: r.get::<_, i64>(20)? != 0,
                    max_steps: r.get::<_, i64>(21)? as u32,
                    max_tool_calls: r.get::<_, i64>(22)? as u32,
                    max_runtime_secs: r.get::<_, i64>(23)? as u64,
                    retry_policy: r.get(24)?,
                    error_strategy: r.get(25)?,
                    memory_config: serde_json::from_str(&r.get::<_, String>(26)?).unwrap_or_default(),
                    is_template: r.get::<_, i64>(27)? != 0,
                    created_at: r.get(28)?,
                    updated_at: r.get(29)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get_agent(&self, id: &str) -> AppResult<Option<AgentConfig>> {
        Ok(self.list_agents()?.into_iter().find(|a| a.id == id))
    }

    pub fn upsert_agent(&self, a: &AgentConfig) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"INSERT INTO agents (
                id, name, description, avatar, role, personality, system_instructions,
                provider_id, model_id, temperature, max_tokens, context_window,
                assigned_mcp_server_ids_json, enabled_tool_ids_json, assigned_skill_ids_json,
                file_access_mode, allowed_directories_json, internet_access, external_api_access,
                autonomous_execution, require_approval_sensitive, max_steps, max_tool_calls,
                max_runtime_secs, retry_policy, error_strategy, memory_config_json, is_template,
                created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                avatar = excluded.avatar,
                role = excluded.role,
                personality = excluded.personality,
                system_instructions = excluded.system_instructions,
                provider_id = excluded.provider_id,
                model_id = excluded.model_id,
                temperature = excluded.temperature,
                max_tokens = excluded.max_tokens,
                context_window = excluded.context_window,
                assigned_mcp_server_ids_json = excluded.assigned_mcp_server_ids_json,
                enabled_tool_ids_json = excluded.enabled_tool_ids_json,
                assigned_skill_ids_json = excluded.assigned_skill_ids_json,
                file_access_mode = excluded.file_access_mode,
                allowed_directories_json = excluded.allowed_directories_json,
                internet_access = excluded.internet_access,
                external_api_access = excluded.external_api_access,
                autonomous_execution = excluded.autonomous_execution,
                require_approval_sensitive = excluded.require_approval_sensitive,
                max_steps = excluded.max_steps,
                max_tool_calls = excluded.max_tool_calls,
                max_runtime_secs = excluded.max_runtime_secs,
                retry_policy = excluded.retry_policy,
                error_strategy = excluded.error_strategy,
                memory_config_json = excluded.memory_config_json,
                is_template = excluded.is_template,
                updated_at = excluded.updated_at"#,
            params![
                a.id,
                a.name,
                a.description,
                a.avatar,
                a.role,
                a.personality,
                a.system_instructions,
                a.provider_id,
                a.model_id,
                a.temperature,
                a.max_tokens as i64,
                a.context_window as i64,
                serde_json::to_string(&a.assigned_mcp_server_ids)?,
                serde_json::to_string(&a.enabled_tool_ids)?,
                serde_json::to_string(&a.assigned_skill_ids)?,
                a.file_access_mode,
                serde_json::to_string(&a.allowed_directories)?,
                if a.internet_access { 1 } else { 0 },
                if a.external_api_access { 1 } else { 0 },
                if a.autonomous_execution { 1 } else { 0 },
                if a.require_approval_sensitive { 1 } else { 0 },
                a.max_steps as i64,
                a.max_tool_calls as i64,
                a.max_runtime_secs as i64,
                a.retry_policy,
                a.error_strategy,
                serde_json::to_string(&a.memory_config)?,
                if a.is_template { 1 } else { 0 },
                a.created_at,
                a.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_agent(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM agents WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn list_agent_memories(
        &self,
        agent_id: &str,
        project_id: Option<&str>,
    ) -> AppResult<Vec<AgentMemoryEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, agent_id, project_id, scope, key, content, created_at, updated_at FROM agent_memories WHERE agent_id = ?1 OR (?2 IS NOT NULL AND project_id = ?2) ORDER BY updated_at DESC",
        )?;
        let rows = stmt
            .query_map(params![agent_id, project_id], |r| {
                Ok(AgentMemoryEntry {
                    id: r.get(0)?,
                    agent_id: r.get(1)?,
                    project_id: r.get(2)?,
                    scope: r.get(3)?,
                    key: r.get(4)?,
                    content: r.get(5)?,
                    created_at: r.get(6)?,
                    updated_at: r.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn upsert_agent_memory(&self, m: &AgentMemoryEntry) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"INSERT INTO agent_memories (id, agent_id, project_id, scope, key, content, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(id) DO UPDATE SET key = excluded.key, content = excluded.content, updated_at = excluded.updated_at"#,
            params![m.id, m.agent_id, m.project_id, m.scope, m.key, m.content, m.created_at, m.updated_at],
        )?;
        Ok(())
    }

    pub fn delete_agent_memory(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM agent_memories WHERE id = ?1", [id])?;
        Ok(())
    }

    // ---- PROJECTS ----
    pub fn list_projects(&self) -> AppResult<Vec<ProjectWorkspace>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, root_path, instructions, assigned_agent_ids_json, assigned_skill_ids_json, allowed_tool_ids_json, created_at, updated_at FROM projects ORDER BY updated_at DESC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(ProjectWorkspace {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    description: r.get(2)?,
                    root_path: r.get(3)?,
                    instructions: r.get(4)?,
                    assigned_agent_ids: serde_json::from_str(&r.get::<_, String>(5)?).unwrap_or_default(),
                    assigned_skill_ids: serde_json::from_str(&r.get::<_, String>(6)?).unwrap_or_default(),
                    allowed_tool_ids: serde_json::from_str(&r.get::<_, String>(7)?).unwrap_or_default(),
                    created_at: r.get(8)?,
                    updated_at: r.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get_project(&self, id: &str) -> AppResult<Option<ProjectWorkspace>> {
        Ok(self.list_projects()?.into_iter().find(|p| p.id == id))
    }

    pub fn upsert_project(&self, p: &ProjectWorkspace) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"INSERT INTO projects (id, name, description, root_path, instructions, assigned_agent_ids_json, assigned_skill_ids_json, allowed_tool_ids_json, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                root_path = excluded.root_path,
                instructions = excluded.instructions,
                assigned_agent_ids_json = excluded.assigned_agent_ids_json,
                assigned_skill_ids_json = excluded.assigned_skill_ids_json,
                allowed_tool_ids_json = excluded.allowed_tool_ids_json,
                updated_at = excluded.updated_at"#,
            params![
                p.id,
                p.name,
                p.description,
                p.root_path,
                p.instructions,
                serde_json::to_string(&p.assigned_agent_ids)?,
                serde_json::to_string(&p.assigned_skill_ids)?,
                serde_json::to_string(&p.allowed_tool_ids)?,
                p.created_at,
                p.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_project(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM projects WHERE id = ?1", [id])?;
        Ok(())
    }

    // ---- WORKFLOWS & RUNS ----
    pub fn list_workflows(&self) -> AppResult<Vec<WorkflowDefinition>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, nodes_json, edges_json, max_agent_depth, max_total_tool_calls, max_duration_secs, created_at, updated_at FROM workflows ORDER BY updated_at DESC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(WorkflowDefinition {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    description: r.get(2)?,
                    nodes: serde_json::from_str(&r.get::<_, String>(3)?).unwrap_or_default(),
                    edges: serde_json::from_str(&r.get::<_, String>(4)?).unwrap_or_default(),
                    max_agent_depth: r.get::<_, i64>(5)? as u32,
                    max_total_tool_calls: r.get::<_, i64>(6)? as u32,
                    max_duration_secs: r.get::<_, i64>(7)? as u64,
                    created_at: r.get(8)?,
                    updated_at: r.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get_workflow(&self, id: &str) -> AppResult<Option<WorkflowDefinition>> {
        Ok(self.list_workflows()?.into_iter().find(|w| w.id == id))
    }

    pub fn upsert_workflow(&self, w: &WorkflowDefinition) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"INSERT INTO workflows (id, name, description, nodes_json, edges_json, max_agent_depth, max_total_tool_calls, max_duration_secs, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                nodes_json = excluded.nodes_json,
                edges_json = excluded.edges_json,
                max_agent_depth = excluded.max_agent_depth,
                max_total_tool_calls = excluded.max_total_tool_calls,
                max_duration_secs = excluded.max_duration_secs,
                updated_at = excluded.updated_at"#,
            params![
                w.id,
                w.name,
                w.description,
                serde_json::to_string(&w.nodes)?,
                serde_json::to_string(&w.edges)?,
                w.max_agent_depth as i64,
                w.max_total_tool_calls as i64,
                w.max_duration_secs as i64,
                w.created_at,
                w.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_workflow(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM workflows WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn list_workflow_runs(&self, workflow_id: Option<&str>) -> AppResult<Vec<WorkflowRunRecord>> {
        let conn = self.conn.lock().unwrap();
        let query = if workflow_id.is_some() {
            "SELECT id, workflow_id, workflow_name, status, current_node_id, context_json, events_json, started_at, ended_at, error FROM workflow_runs WHERE workflow_id = ?1 ORDER BY started_at DESC LIMIT 50"
        } else {
            "SELECT id, workflow_id, workflow_name, status, current_node_id, context_json, events_json, started_at, ended_at, error FROM workflow_runs ORDER BY started_at DESC LIMIT 50"
        };
        let mut stmt = conn.prepare(query)?;
        let mapper = |r: &rusqlite::Row| {
            Ok(WorkflowRunRecord {
                id: r.get(0)?,
                workflow_id: r.get(1)?,
                workflow_name: r.get(2)?,
                status: r.get(3)?,
                current_node_id: r.get(4)?,
                context: serde_json::from_str(&r.get::<_, String>(5)?).unwrap_or(serde_json::json!({})),
                events: serde_json::from_str(&r.get::<_, String>(6)?).unwrap_or_default(),
                started_at: r.get(7)?,
                ended_at: r.get(8)?,
                error: r.get(9)?,
            })
        };
        let rows = if let Some(wid) = workflow_id {
            stmt.query_map([wid], mapper)?.collect::<Result<Vec<_>, _>>()?
        } else {
            stmt.query_map([], mapper)?.collect::<Result<Vec<_>, _>>()?
        };
        Ok(rows)
    }

    pub fn upsert_workflow_run(&self, run: &WorkflowRunRecord) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"INSERT INTO workflow_runs (id, workflow_id, workflow_name, status, current_node_id, context_json, events_json, started_at, ended_at, error)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                current_node_id = excluded.current_node_id,
                context_json = excluded.context_json,
                events_json = excluded.events_json,
                ended_at = excluded.ended_at,
                error = excluded.error"#,
            params![
                run.id,
                run.workflow_id,
                run.workflow_name,
                run.status,
                run.current_node_id,
                serde_json::to_string(&run.context)?,
                serde_json::to_string(&run.events)?,
                run.started_at,
                run.ended_at,
                run.error,
            ],
        )?;
        Ok(())
    }

    // ---- PERMISSION RULES ----
    pub fn list_permission_rules(&self) -> AppResult<Vec<PermissionRule>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, scope, target_id, category, resource_pattern, mode, created_at FROM permission_rules ORDER BY created_at DESC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(PermissionRule {
                    id: r.get(0)?,
                    scope: r.get(1)?,
                    target_id: r.get(2)?,
                    category: r.get(3)?,
                    resource_pattern: r.get(4)?,
                    mode: r.get(5)?,
                    created_at: r.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn upsert_permission_rule(&self, rule: &PermissionRule) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"INSERT INTO permission_rules (id, scope, target_id, category, resource_pattern, mode, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(id) DO UPDATE SET mode = excluded.mode, resource_pattern = excluded.resource_pattern"#,
            params![
                rule.id,
                rule.scope,
                rule.target_id,
                rule.category,
                rule.resource_pattern,
                rule.mode,
                rule.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_permission_rule(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM permission_rules WHERE id = ?1", [id])?;
        Ok(())
    }

    // ---- MARKETPLACE SOURCES ----
    pub fn list_marketplace_sources(&self) -> AppResult<Vec<MarketplaceSource>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, kind, adapter_type, url, enabled, builtin, created_at FROM marketplace_sources ORDER BY builtin DESC, name ASC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(MarketplaceSource {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    kind: r.get(2)?,
                    adapter_type: r.get(3)?,
                    url: r.get(4)?,
                    enabled: r.get::<_, i64>(5)? != 0,
                    builtin: r.get::<_, i64>(6)? != 0,
                    created_at: r.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn upsert_marketplace_source(&self, src: &MarketplaceSource) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"INSERT INTO marketplace_sources (id, name, kind, adapter_type, url, enabled, builtin, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, url = excluded.url, enabled = excluded.enabled"#,
            params![
                src.id,
                src.name,
                src.kind,
                src.adapter_type,
                src.url,
                if src.enabled { 1 } else { 0 },
                if src.builtin { 1 } else { 0 },
                src.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_marketplace_source(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM marketplace_sources WHERE id = ?1 AND builtin = 0", [id])?;
        Ok(())
    }

    // ---- LOCAL BACKUP EXPORT / IMPORT / RESET (NEVER INCLUDES API KEYS OR SECRETS) ----
    pub fn export_portable_backup(&self) -> AppResult<serde_json::Value> {
        let providers: Vec<AiProvider> = self
            .list_providers()?
            .into_iter()
            .map(|mut p| {
                p.has_api_key = false;
                p
            })
            .collect();
        let conversations = self.list_conversations()?;
        let mut all_messages = Vec::new();
        for c in &conversations {
            all_messages.extend(self.list_messages(&c.id)?);
        }
        let mcp_servers: Vec<McpServer> = self
            .list_mcp_servers()?
            .into_iter()
            .map(|mut s| {
                s.has_auth_secret = false;
                s.status = "disconnected".into();
                s
            })
            .collect();

        Ok(serde_json::json!({
            "format": "noctra-studio-backup",
            "version": 1,
            "exportedAt": Utc::now().to_rfc3339(),
            "note": "Credentials and API keys are intentionally excluded from portable exports.",
            "settings": self.get_settings()?,
            "providers": providers,
            "conversations": conversations,
            "messages": all_messages,
            "mcpServers": mcp_servers,
            "skills": self.list_skills()?,
            "agents": self.list_agents()?,
            "projects": self.list_projects()?,
            "workflows": self.list_workflows()?,
            "permissionRules": self.list_permission_rules()?,
            "marketplaceSources": self.list_marketplace_sources()?,
        }))
    }

    pub fn import_portable_backup(&self, backup: &serde_json::Value) -> AppResult<()> {
        if backup.get("format").and_then(|v| v.as_str()) != Some("noctra-studio-backup") {
            return Err(AppError::Validation("Invalid NOCTRA STUDIO backup file".into()));
        }
        if let Some(settings) = backup.get("settings") {
            if let Ok(parsed) = serde_json::from_value::<AppSettings>(settings.clone()) {
                self.save_settings(&parsed)?;
            }
        }
        if let Some(arr) = backup.get("providers").and_then(|v| v.as_array()) {
            for item in arr {
                if let Ok(mut p) = serde_json::from_value::<AiProvider>(item.clone()) {
                    p.has_api_key = false;
                    self.upsert_provider(&p)?;
                }
            }
        }
        if let Some(arr) = backup.get("conversations").and_then(|v| v.as_array()) {
            for item in arr {
                if let Ok(c) = serde_json::from_value::<Conversation>(item.clone()) {
                    self.upsert_conversation(&c)?;
                }
            }
        }
        if let Some(arr) = backup.get("messages").and_then(|v| v.as_array()) {
            for item in arr {
                if let Ok(m) = serde_json::from_value::<ChatMessage>(item.clone()) {
                    self.upsert_message(&m)?;
                }
            }
        }
        if let Some(arr) = backup.get("mcpServers").and_then(|v| v.as_array()) {
            for item in arr {
                if let Ok(mut s) = serde_json::from_value::<McpServer>(item.clone()) {
                    s.has_auth_secret = false;
                    s.status = "disconnected".into();
                    self.upsert_mcp_server(&s)?;
                }
            }
        }
        if let Some(arr) = backup.get("agents").and_then(|v| v.as_array()) {
            for item in arr {
                if let Ok(a) = serde_json::from_value::<AgentConfig>(item.clone()) {
                    self.upsert_agent(&a)?;
                }
            }
        }
        if let Some(arr) = backup.get("projects").and_then(|v| v.as_array()) {
            for item in arr {
                if let Ok(p) = serde_json::from_value::<ProjectWorkspace>(item.clone()) {
                    self.upsert_project(&p)?;
                }
            }
        }
        if let Some(arr) = backup.get("workflows").and_then(|v| v.as_array()) {
            for item in arr {
                if let Ok(w) = serde_json::from_value::<WorkflowDefinition>(item.clone()) {
                    self.upsert_workflow(&w)?;
                }
            }
        }
        if let Some(arr) = backup.get("permissionRules").and_then(|v| v.as_array()) {
            for item in arr {
                if let Ok(r) = serde_json::from_value::<PermissionRule>(item.clone()) {
                    self.upsert_permission_rule(&r)?;
                }
            }
        }
        self.cleanup_orphaned_provider_refs()?;
        Ok(())
    }

    pub fn wipe_all_data(&self) -> AppResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            r#"
            DELETE FROM messages;
            DELETE FROM conversations;
            DELETE FROM mcp_tools;
            DELETE FROM mcp_resources;
            DELETE FROM mcp_prompts;
            DELETE FROM mcp_servers;
            DELETE FROM skills;
            DELETE FROM agent_memories;
            DELETE FROM agents WHERE is_template = 0;
            DELETE FROM projects;
            DELETE FROM workflow_runs;
            DELETE FROM workflows;
            DELETE FROM permission_rules;
            DELETE FROM audit_logs;
            DELETE FROM ai_providers;
            DELETE FROM app_settings;
            "#,
        )?;
        let skills_dir = self.skills_dir();
        if Path::new(&skills_dir).exists() {
            let _ = std::fs::remove_dir_all(&skills_dir);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn seeds_templates_and_excludes_secrets_from_backup() {
        let dir = TempDir::new().unwrap();
        let redactor = Arc::new(SecretRedactor::new());
        let db = Database::open_in_memory(dir.path().to_path_buf(), redactor).unwrap();

        let agents = db.list_agents().unwrap();
        assert!(agents.len() >= 8);

        let now = Utc::now().to_rfc3339();
        db.upsert_provider(&AiProvider {
            id: "prov-1".into(),
            name: "Local Ollama".into(),
            base_url: "http://localhost:11434/v1".into(),
            model_id: "llama3.1".into(),
            custom_headers: HashMap::new(),
            temperature: 0.5,
            top_p: 1.0,
            max_tokens: 2048,
            timeout_secs: 60,
            streaming: true,
            default_system_prompt: String::new(),
            has_api_key: true,
            created_at: now.clone(),
            updated_at: now,
        })
        .unwrap();

        let backup = db.export_portable_backup().unwrap();
        assert_eq!(backup["providers"][0]["hasApiKey"], false);
    }

    #[test]
    fn delete_provider_clears_stale_references() {
        let dir = TempDir::new().unwrap();
        let redactor = Arc::new(SecretRedactor::new());
        let db = Database::open_in_memory(dir.path().to_path_buf(), redactor).unwrap();
        let now = Utc::now().to_rfc3339();

        db.upsert_provider(&AiProvider {
            id: "old-prov".into(),
            name: "Old OpenAI".into(),
            base_url: "https://api.openai.com/v1".into(),
            model_id: "gpt-4o-mini".into(),
            custom_headers: HashMap::new(),
            temperature: 0.7,
            top_p: 1.0,
            max_tokens: 4096,
            timeout_secs: 60,
            streaming: true,
            default_system_prompt: String::new(),
            has_api_key: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        })
        .unwrap();

        let mut settings = db.get_settings().unwrap();
        settings.ai.default_provider_id = Some("old-prov".into());
        db.save_settings(&settings).unwrap();

        db.upsert_conversation(&Conversation {
            id: "c1".into(),
            title: "Chat".into(),
            mode: "direct".into(),
            execution_mode: "review".into(),
            active_provider_id: Some("old-prov".into()),
            active_model: Some("gpt-4o-mini".into()),
            active_agent_id: None,
            project_id: None,
            system_prompt_override: None,
            created_at: now.clone(),
            updated_at: now.clone(),
        })
        .unwrap();

        let mut agent = db.list_agents().unwrap().into_iter().next().unwrap();
        agent.provider_id = Some("old-prov".into());
        db.upsert_agent(&agent).unwrap();

        db.delete_provider("old-prov").unwrap();

        assert!(db.get_provider("old-prov").unwrap().is_none());
        assert_eq!(
            db.get_conversation("c1").unwrap().unwrap().active_provider_id,
            None
        );
        assert_eq!(
            db.get_agent(&agent.id).unwrap().unwrap().provider_id,
            None
        );
        assert_eq!(db.get_settings().unwrap().ai.default_provider_id, None);
    }
}
