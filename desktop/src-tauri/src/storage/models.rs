use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub general: GeneralSettings,
    pub ai: AiDefaults,
    pub mcp: McpSettings,
    pub agents: AgentDefaults,
    pub skills: SkillSettings,
    pub security: SecuritySettings,
    pub advanced: AdvancedSettings,
    pub shortcuts: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralSettings {
    pub language: String,
    pub theme: String,
    pub accent_color: String,
    pub font_size: u8,
    pub sidebar_collapsed: bool,
    pub inspector_visible: bool,
    pub restore_last_session: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiDefaults {
    pub default_provider_id: Option<String>,
    pub default_model: Option<String>,
    pub temperature: f32,
    pub top_p: f32,
    pub max_tokens: u32,
    pub stream_responses: bool,
    pub context_message_limit: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSettings {
    pub auto_connect_on_startup: bool,
    pub health_check_interval_secs: u64,
    pub default_timeout_secs: u64,
    pub allow_shell_wrappers: bool,
}

pub fn default_execution_mode() -> String {
    "review".into()
}

pub fn normalize_execution_mode(mode: &str) -> String {
    if mode.eq_ignore_ascii_case("turbo") {
        "turbo".into()
    } else {
        "review".into()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDefaults {
    pub default_max_steps: u32,
    pub default_max_tool_calls: u32,
    pub default_max_runtime_secs: u64,
    pub require_approval_for_sensitive: bool,
    pub max_agent_depth: u32,
    #[serde(default = "default_execution_mode")]
    pub default_execution_mode: String, // "review" | "turbo"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSettings {
    pub install_directory: String,
    pub auto_check_updates: bool,
    pub github_api_base: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecuritySettings {
    pub credential_backend: String,
    pub default_permission_mode: String,
    pub redact_logs: bool,
    pub sandbox_mode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedSettings {
    pub developer_mode: bool,
    pub log_retention_days: u32,
    pub max_log_entries: usize,
    pub experimental_features: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        let mut shortcuts = HashMap::new();
        shortcuts.insert("commandPalette".into(), "Ctrl+K".into());
        shortcuts.insert("newChat".into(), "Ctrl+N".into());
        shortcuts.insert("newAgent".into(), "Ctrl+Shift+N".into());
        shortcuts.insert("sendMessage".into(), "Ctrl+Enter".into());
        shortcuts.insert("settings".into(), "Ctrl+,".into());
        shortcuts.insert("mcpHub".into(), "Ctrl+Shift+M".into());
        shortcuts.insert("skillsCenter".into(), "Ctrl+Shift+S".into());
        shortcuts.insert("quickSearch".into(), "Ctrl+P".into());

        Self {
            general: GeneralSettings {
                language: "en".into(),
                theme: "obsidian".into(),
                accent_color: "#A78BFA".into(),
                font_size: 14,
                sidebar_collapsed: false,
                inspector_visible: true,
                restore_last_session: true,
            },
            ai: AiDefaults {
                default_provider_id: None,
                default_model: None,
                temperature: 0.7,
                top_p: 1.0,
                max_tokens: 4096,
                stream_responses: true,
                context_message_limit: 40,
            },
            mcp: McpSettings {
                auto_connect_on_startup: true,
                health_check_interval_secs: 30,
                default_timeout_secs: 30,
                allow_shell_wrappers: false,
            },
            agents: AgentDefaults {
                default_max_steps: 12,
                default_max_tool_calls: 24,
                default_max_runtime_secs: 180,
                require_approval_for_sensitive: true,
                max_agent_depth: 3,
                default_execution_mode: default_execution_mode(),
            },
            skills: SkillSettings {
                install_directory: "".into(),
                auto_check_updates: false,
                github_api_base: "https://api.github.com".into(),
            },
            security: SecuritySettings {
                credential_backend: "os-keychain".into(),
                default_permission_mode: "ask".into(),
                redact_logs: true,
                sandbox_mode: true,
            },
            advanced: AdvancedSettings {
                developer_mode: false,
                log_retention_days: 14,
                max_log_entries: 1000,
                experimental_features: false,
            },
            shortcuts,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProvider {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub model_id: String,
    pub custom_headers: HashMap<String, String>,
    pub temperature: f32,
    pub top_p: f32,
    pub max_tokens: u32,
    pub timeout_secs: u64,
    pub streaming: bool,
    pub default_system_prompt: String,
    pub has_api_key: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderInput {
    pub id: Option<String>,
    pub name: String,
    pub base_url: String,
    pub api_key: Option<String>,
    pub clear_api_key: Option<bool>,
    pub model_id: String,
    pub custom_headers: HashMap<String, String>,
    pub temperature: f32,
    pub top_p: f32,
    pub max_tokens: u32,
    pub timeout_secs: u64,
    pub streaming: bool,
    pub default_system_prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub mode: String, // "direct" | "agent"
    #[serde(default = "default_execution_mode")]
    pub execution_mode: String, // "review" | "turbo"
    pub active_provider_id: Option<String>,
    pub active_model: Option<String>,
    pub active_agent_id: Option<String>,
    pub project_id: Option<String>,
    pub system_prompt_override: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAttachment {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub size_bytes: usize,
    pub kind: String, // "image" | "text" | "pdf" | "binary"
    pub extracted_text: Option<String>,
    pub data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallRecord {
    pub id: String,
    pub server_id: Option<String>,
    pub name: String,
    pub arguments: serde_json::Value,
    pub status: String, // "pending_approval" | "running" | "completed" | "denied" | "error"
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String, // "system" | "user" | "assistant" | "tool"
    pub content: String,
    pub attachments: Vec<ChatAttachment>,
    pub tool_calls: Vec<ToolCallRecord>,
    pub tool_call_id: Option<String>,
    pub token_usage: Option<TokenUsage>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    pub id: String,
    pub name: String,
    pub description: String,
    pub source: String,
    pub trust_level: String, // "trusted" | "verified" | "unverified"
    pub transport: String,   // "stdio" | "streamable_http"
    pub endpoint_or_command: String,
    pub args: Vec<String>,
    pub env_keys: Vec<String>,
    pub plain_env: HashMap<String, String>,
    pub auth_type: String, // "none" | "bearer" | "oauth" | "custom_header"
    pub auth_config: serde_json::Value,
    pub has_auth_secret: bool,
    pub auto_reconnect: bool,
    pub max_reconnects: u32,
    pub enabled: bool,
    pub status: String, // "disconnected" | "connecting" | "connected" | "error"
    pub last_error: Option<String>,
    pub server_info: Option<serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerInput {
    pub id: Option<String>,
    pub name: String,
    pub description: String,
    pub source: String,
    pub trust_level: String,
    pub transport: String,
    pub endpoint_or_command: String,
    pub args: Vec<String>,
    pub plain_env: HashMap<String, String>,
    pub secret_env: HashMap<String, String>,
    pub auth_type: String,
    pub auth_config: serde_json::Value,
    pub auth_secret: Option<String>,
    pub auto_reconnect: bool,
    pub max_reconnects: u32,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTool {
    pub id: String,
    pub server_id: String,
    pub server_name: String,
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
    pub output_schema: Option<serde_json::Value>,
    pub required_permissions: Vec<String>,
    pub enabled: bool,
    pub available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpResource {
    pub id: String,
    pub server_id: String,
    pub uri: String,
    pub name: String,
    pub description: Option<String>,
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpPrompt {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub description: Option<String>,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSupportingFile {
    pub relative_path: String,
    pub kind: String, // "reference" | "script" | "asset" | "other"
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub source_type: String, // "local" | "github" | "git" | "marketplace" | "zip" | "custom"
    pub source_url: Option<String>,
    pub branch_or_tag: Option<String>,
    pub subdirectory: Option<String>,
    pub commit_sha: Option<String>,
    pub version: String,
    pub local_path: String,
    pub enabled: bool,
    pub trust_level: String,
    pub frontmatter: serde_json::Value,
    pub instructions_md: String,
    pub dependencies: Vec<String>,
    pub supporting_files: Vec<SkillSupportingFile>,
    pub validation_errors: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub avatar: String,
    pub role: String,
    pub personality: String,
    pub system_instructions: String,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
    pub temperature: f32,
    pub max_tokens: u32,
    pub context_window: usize,
    pub assigned_mcp_server_ids: Vec<String>,
    pub enabled_tool_ids: Vec<String>,
    pub assigned_skill_ids: Vec<String>,
    pub file_access_mode: String, // "none" | "project_only" | "allowlist"
    pub allowed_directories: Vec<String>,
    pub internet_access: bool,
    pub external_api_access: bool,
    pub autonomous_execution: bool,
    pub require_approval_sensitive: bool,
    pub max_steps: u32,
    pub max_tool_calls: u32,
    pub max_runtime_secs: u64,
    pub retry_policy: String,   // "none" | "once" | "exponential"
    pub error_strategy: String, // "stop" | "continue" | "ask_user"
    pub memory_config: AgentMemoryConfig,
    pub is_template: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMemoryConfig {
    pub conversation_memory: bool,
    pub agent_local_memory: bool,
    pub project_memory: bool,
    pub retention_messages: usize,
}

impl Default for AgentMemoryConfig {
    fn default() -> Self {
        Self {
            conversation_memory: true,
            agent_local_memory: true,
            project_memory: true,
            retention_messages: 30,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMemoryEntry {
    pub id: String,
    pub agent_id: String,
    pub project_id: Option<String>,
    pub scope: String,
    pub key: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWorkspace {
    pub id: String,
    pub name: String,
    pub description: String,
    pub root_path: String,
    pub instructions: String,
    pub assigned_agent_ids: Vec<String>,
    pub assigned_skill_ids: Vec<String>,
    pub allowed_tool_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowNode {
    pub id: String,
    pub node_type: String, // "start" | "input" | "agent" | "mcp_tool" | "skill" | "conditional" | "approval" | "delay" | "output" | "end"
    pub label: String,
    pub x: f64,
    pub y: f64,
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub condition: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowDefinition {
    pub id: String,
    pub name: String,
    pub description: String,
    pub nodes: Vec<WorkflowNode>,
    pub edges: Vec<WorkflowEdge>,
    pub max_agent_depth: u32,
    pub max_total_tool_calls: u32,
    pub max_duration_secs: u64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowEvent {
    pub timestamp: String,
    pub node_id: String,
    pub node_label: String,
    pub status: String,
    pub detail: String,
    pub output: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRunRecord {
    pub id: String,
    pub workflow_id: String,
    pub workflow_name: String,
    pub status: String, // "running" | "paused" | "completed" | "failed" | "cancelled"
    pub current_node_id: Option<String>,
    pub context: serde_json::Value,
    pub events: Vec<WorkflowEvent>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRule {
    pub id: String,
    pub scope: String, // "global" | "agent" | "project"
    pub target_id: Option<String>,
    pub category: String,
    pub resource_pattern: String,
    pub mode: String, // "ask" | "session" | "always" | "deny"
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRequest {
    pub id: String,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub category: String,
    pub action_summary: String,
    pub reason: String,
    pub tool_name: String,
    pub affected_resources: Vec<String>,
    pub exact_payload: serde_json::Value,
    #[serde(default)]
    pub diff_preview: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSource {
    pub id: String,
    pub name: String,
    pub kind: String,         // "mcp" | "skills" | "templates"
    pub adapter_type: String, // "mcp_registry" | "github_repo" | "json_catalog"
    pub url: String,
    pub enabled: bool,
    pub builtin: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogEntry {
    pub id: String,
    pub source: String, // "ai" | "mcp" | "agent" | "workflow" | "skill" | "security"
    pub level: String,  // "info" | "warn" | "error"
    pub message: String,
    pub detail: Option<String>,
    pub created_at: String,
}
