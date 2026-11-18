use crate::agents::{AgentRuntime, MultiAgentStepResult, MultiAgentStepSpec};
use crate::ai::{
    fetch_models, load_local_attachment, provider_secret_key, test_provider_connection,
    ProviderTestResult,
};
use crate::error::{AppError, AppResult};
use crate::marketplace::{browse_marketplace_source, MarketplacePackageItem};
use crate::mcp::McpHubManager;
use crate::permissions::{ApprovalDecision, PermissionManager};
use crate::project_fs::{
    create_project_dir, get_project_tree, import_project_folder, inspect_project_metadata,
    read_project_file_rich, rename_project_entry, search_project_files, ProjectFileContent,
    ProjectImportResult, ProjectMetadata, ProjectSearchMatch, ProjectTreeNode,
};
use crate::security::credentials::CredentialStore;
use crate::security::redaction::SecretRedactor;
use crate::security::sandbox::verify_path_within_roots;
use crate::skills::{
    create_or_save_skill, import_local_skill_folder, import_zip_skill, inspect_github_skills,
    install_github_skill, parse_skill_md, read_skill_file, write_skill_file, GitHubSkillPreview,
    ParsedSkillMd,
};
use crate::storage::models::*;
use crate::storage::Database;
use crate::workflows::{validate_workflow_graph, WorkflowEngine};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

pub struct AppState {
    pub db: Arc<Database>,
    pub creds: Arc<CredentialStore>,
    pub redactor: Arc<SecretRedactor>,
    pub mcp: Arc<McpHubManager>,
    pub permissions: Arc<PermissionManager>,
    pub runtime: Arc<AgentRuntime>,
    pub workflows: Arc<WorkflowEngine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFileEntry {
    pub name: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
}

// ---- SETTINGS ----
#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppResult<AppSettings> {
    state.db.get_settings()
}

#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, settings: AppSettings) -> AppResult<()> {
    state.db.save_settings(&settings)
}

// ---- AI PROVIDERS ----
#[tauri::command]
pub fn list_providers(state: State<'_, AppState>) -> AppResult<Vec<AiProvider>> {
    let mut providers = state.db.list_providers()?;
    for p in &mut providers {
        p.has_api_key = state.creds.has_secret(&provider_secret_key(&p.id));
    }
    Ok(providers)
}

#[tauri::command]
pub fn save_provider(state: State<'_, AppState>, input: AiProviderInput) -> AppResult<AiProvider> {
    if input.name.trim().is_empty() || input.base_url.trim().is_empty() {
        return Err(AppError::Validation(
            "Provider name and API base URL are required".into(),
        ));
    }
    let id = input
        .id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing = state.db.get_provider(&id)?;
    let now = Utc::now().to_rfc3339();

    if input.clear_api_key.unwrap_or(false) {
        state.creds.delete_secret(&provider_secret_key(&id))?;
    } else if let Some(key) = input.api_key.as_ref() {
        if !key.trim().is_empty() {
            state
                .creds
                .set_secret(&provider_secret_key(&id), key.trim())?;
        }
    }

    let has_key = state.creds.has_secret(&provider_secret_key(&id));
    let provider = AiProvider {
        id,
        name: input.name.trim().to_string(),
        base_url: crate::ai::normalize_base_url(&input.base_url),
        model_id: input.model_id.trim().to_string(),
        custom_headers: input.custom_headers,
        temperature: input.temperature,
        top_p: input.top_p,
        max_tokens: input.max_tokens,
        timeout_secs: input.timeout_secs.max(5),
        streaming: input.streaming,
        default_system_prompt: input.default_system_prompt,
        has_api_key: has_key,
        created_at: existing.map(|e| e.created_at).unwrap_or_else(|| now.clone()),
        updated_at: now,
    };

    state.db.upsert_provider(&provider)?;
    state.db.log_event(
        "ai",
        "info",
        &format!("Saved AI provider '{}'", provider.name),
        None,
    );
    Ok(provider)
}

#[tauri::command]
pub fn duplicate_provider(state: State<'_, AppState>, id: String) -> AppResult<AiProvider> {
    let orig = state
        .db
        .get_provider(&id)?
        .ok_or_else(|| AppError::NotFound("Provider not found".into()))?;
    let new_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    if let Ok(Some(secret)) = state.creds.get_secret(&provider_secret_key(&id)) {
        state.creds.set_secret(&provider_secret_key(&new_id), &secret)?;
    }
    let dup = AiProvider {
        id: new_id.clone(),
        name: format!("{} (Copy)", orig.name),
        has_api_key: state.creds.has_secret(&provider_secret_key(&new_id)),
        created_at: now.clone(),
        updated_at: now,
        ..orig
    };
    state.db.upsert_provider(&dup)?;
    Ok(dup)
}

#[tauri::command]
pub fn delete_provider(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let _ = state.creds.delete_secret(&provider_secret_key(&id));
    state.db.delete_provider(&id)
}

#[tauri::command]
pub async fn test_provider_connection_cmd(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<ProviderTestResult> {
    let provider = state
        .db
        .get_provider(&id)?
        .ok_or_else(|| AppError::NotFound("Provider not found".into()))?;
    let res = test_provider_connection(&provider, &state.creds, &state.redactor).await?;
    state.db.log_event(
        "ai",
        if res.ok { "info" } else { "warn" },
        &format!("Tested '{}': {}", provider.name, res.message),
        None,
    );
    Ok(res)
}

#[tauri::command]
pub async fn fetch_provider_models_cmd(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Vec<String>> {
    let provider = state
        .db
        .get_provider(&id)?
        .ok_or_else(|| AppError::NotFound("Provider not found".into()))?;
    fetch_models(&provider, &state.creds, &state.redactor).await
}

// ---- CONVERSATIONS & CHAT ----
#[tauri::command]
pub fn list_conversations(state: State<'_, AppState>) -> AppResult<Vec<Conversation>> {
    state.db.list_conversations()
}

#[tauri::command]
pub fn create_conversation(
    state: State<'_, AppState>,
    title: Option<String>,
    mode: Option<String>,
    execution_mode: Option<String>,
    provider_id: Option<String>,
    model: Option<String>,
    agent_id: Option<String>,
    project_id: Option<String>,
) -> AppResult<Conversation> {
    let now = Utc::now().to_rfc3339();
    let default_exec = state
        .db
        .get_settings()
        .map(|s| s.agents.default_execution_mode)
        .unwrap_or_else(|_| "review".into());
    let conv = Conversation {
        id: Uuid::new_v4().to_string(),
        title: title.unwrap_or_else(|| "New Conversation".into()),
        mode: mode.unwrap_or_else(|| "direct".into()),
        execution_mode: normalize_execution_mode(execution_mode.as_deref().unwrap_or(&default_exec)),
        active_provider_id: provider_id.filter(|s| !s.trim().is_empty()),
        active_model: model.filter(|s| !s.trim().is_empty()),
        active_agent_id: agent_id.filter(|s| !s.trim().is_empty()),
        project_id: project_id.filter(|s| !s.trim().is_empty()),
        system_prompt_override: None,
        created_at: now.clone(),
        updated_at: now,
    };
    state.db.upsert_conversation(&conv)?;
    Ok(conv)
}

#[tauri::command]
pub fn update_conversation(
    state: State<'_, AppState>,
    conversation: Conversation,
) -> AppResult<Conversation> {
    let mut updated = conversation;
    updated.execution_mode = normalize_execution_mode(&updated.execution_mode);
    updated.active_provider_id = updated.active_provider_id.filter(|s| !s.trim().is_empty());
    updated.active_model = updated.active_model.filter(|s| !s.trim().is_empty());
    updated.active_agent_id = updated.active_agent_id.filter(|s| !s.trim().is_empty());
    updated.project_id = updated.project_id.filter(|s| !s.trim().is_empty());
    updated.updated_at = Utc::now().to_rfc3339();
    state.db.upsert_conversation(&updated)?;
    Ok(updated)
}

#[tauri::command]
pub fn delete_conversation(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.delete_conversation(&id)
}

#[tauri::command]
pub fn list_messages(
    state: State<'_, AppState>,
    conversation_id: String,
) -> AppResult<Vec<ChatMessage>> {
    state.db.list_messages(&conversation_id)
}

#[tauri::command]
pub fn delete_message(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.delete_message(&id)
}

#[tauri::command]
pub fn edit_and_truncate_message(
    state: State<'_, AppState>,
    conversation_id: String,
    message_id: String,
    new_content: String,
) -> AppResult<Vec<ChatMessage>> {
    let msgs = state.db.list_messages(&conversation_id)?;
    let target = msgs
        .into_iter()
        .find(|m| m.id == message_id)
        .ok_or_else(|| AppError::NotFound("Message not found".into()))?;
    state
        .db
        .delete_messages_after(&conversation_id, &target.created_at)?;
    let mut updated = target;
    updated.content = new_content;
    state.db.upsert_message(&updated)?;
    state.db.list_messages(&conversation_id)
}

#[tauri::command]
pub fn load_attachment_from_path(path: String) -> AppResult<ChatAttachment> {
    load_local_attachment(Path::new(&path))
}

#[tauri::command]
pub async fn send_chat_message(
    app: AppHandle,
    state: State<'_, AppState>,
    conversation_id: String,
    content: String,
    attachments: Vec<ChatAttachment>,
    provider_id: Option<String>,
    model: Option<String>,
) -> AppResult<ChatMessage> {
    let run_id = Uuid::new_v4().to_string();
    let cancel = state.runtime.register_run(&run_id).await;

    let app_stream = app.clone();
    let app_approval = app.clone();

    let res = state
        .runtime
        .execute_chat_turn(
            run_id.clone(),
            conversation_id,
            content,
            attachments,
            provider_id,
            model,
            cancel,
            move |ev| {
                let _ = app_stream.emit("chat://stream", ev);
            },
            move |req| {
                let _ = app_approval.emit("agent://approval-request", req);
            },
        )
        .await;

    state.runtime.unregister_run(&run_id).await;
    res
}

#[tauri::command]
pub async fn cancel_chat_run(state: State<'_, AppState>, run_id: String) -> AppResult<bool> {
    Ok(state.runtime.cancel_run(&run_id).await)
}

// ---- MCP HUB ----
#[tauri::command]
pub fn list_mcp_servers(state: State<'_, AppState>) -> AppResult<Vec<McpServer>> {
    state.db.list_mcp_servers()
}

#[tauri::command]
pub fn save_mcp_server(state: State<'_, AppState>, input: McpServerInput) -> AppResult<McpServer> {
    if input.name.trim().is_empty() || input.endpoint_or_command.trim().is_empty() {
        return Err(AppError::Validation(
            "MCP server name and command/endpoint are required".into(),
        ));
    }
    let id = input
        .id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing = state.db.get_mcp_server(&id)?;
    let now = Utc::now().to_rfc3339();

    let mut env_keys: Vec<String> = existing.as_ref().map(|e| e.env_keys.clone()).unwrap_or_default();
    for (k, v) in input.secret_env {
        if !k.trim().is_empty() && !v.trim().is_empty() {
            state
                .creds
                .set_secret(&format!("mcp:{id}:env:{}", k.trim()), v.trim())?;
            if !env_keys.contains(&k) {
                env_keys.push(k);
            }
        }
    }

    if let Some(secret) = input.auth_secret.as_ref() {
        if !secret.trim().is_empty() {
            state
                .creds
                .set_secret(&format!("mcp:{id}:auth"), secret.trim())?;
        }
    }
    let has_auth_secret = state.creds.has_secret(&format!("mcp:{id}:auth"));

    let srv = McpServer {
        id,
        name: input.name.trim().to_string(),
        description: input.description,
        source: input.source,
        trust_level: input.trust_level,
        transport: input.transport,
        endpoint_or_command: input.endpoint_or_command.trim().to_string(),
        args: input.args,
        env_keys,
        plain_env: input.plain_env,
        auth_type: input.auth_type,
        auth_config: input.auth_config,
        has_auth_secret,
        auto_reconnect: input.auto_reconnect,
        max_reconnects: input.max_reconnects.max(1),
        enabled: input.enabled,
        status: existing
            .as_ref()
            .map(|e| e.status.clone())
            .unwrap_or_else(|| "disconnected".into()),
        last_error: None,
        server_info: existing.as_ref().and_then(|e| e.server_info.clone()),
        created_at: existing.map(|e| e.created_at).unwrap_or_else(|| now.clone()),
        updated_at: now,
    };
    state.db.upsert_mcp_server(&srv)?;
    Ok(srv)
}

#[tauri::command]
pub async fn delete_mcp_server(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let _ = state.mcp.disconnect_server(&id).await;
    if let Ok(Some(srv)) = state.db.get_mcp_server(&id) {
        for k in srv.env_keys {
            let _ = state.creds.delete_secret(&format!("mcp:{id}:env:{k}"));
        }
    }
    let _ = state.creds.delete_secret(&format!("mcp:{id}:auth"));
    state.db.delete_mcp_server(&id)
}

#[tauri::command]
pub async fn connect_mcp_server(state: State<'_, AppState>, id: String) -> AppResult<McpServer> {
    state.mcp.connect_server(&id).await
}

#[tauri::command]
pub async fn disconnect_mcp_server(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.mcp.disconnect_server(&id).await
}

#[tauri::command]
pub fn list_mcp_tools(state: State<'_, AppState>) -> AppResult<Vec<McpTool>> {
    state.db.list_mcp_tools()
}

#[tauri::command]
pub fn set_mcp_tool_enabled(
    state: State<'_, AppState>,
    tool_id: String,
    enabled: bool,
) -> AppResult<()> {
    state.db.set_mcp_tool_enabled(&tool_id, enabled)
}

#[tauri::command]
pub async fn test_mcp_tool(
    state: State<'_, AppState>,
    server_id: String,
    tool_name: String,
    arguments: serde_json::Value,
) -> AppResult<serde_json::Value> {
    state.mcp.call_tool(&server_id, &tool_name, arguments).await
}

#[tauri::command]
pub fn list_mcp_resources(
    state: State<'_, AppState>,
    server_id: Option<String>,
) -> AppResult<Vec<McpResource>> {
    state.db.list_mcp_resources(server_id.as_deref())
}

#[tauri::command]
pub async fn read_mcp_resource(
    state: State<'_, AppState>,
    server_id: String,
    uri: String,
) -> AppResult<serde_json::Value> {
    state.mcp.read_resource(&server_id, &uri).await
}

#[tauri::command]
pub fn list_mcp_prompts(
    state: State<'_, AppState>,
    server_id: Option<String>,
) -> AppResult<Vec<McpPrompt>> {
    state.db.list_mcp_prompts(server_id.as_deref())
}

#[tauri::command]
pub async fn get_mcp_prompt(
    state: State<'_, AppState>,
    server_id: String,
    name: String,
    arguments: serde_json::Value,
) -> AppResult<serde_json::Value> {
    state.mcp.get_prompt(&server_id, &name, arguments).await
}

// ---- MARKETPLACE ----
#[tauri::command]
pub fn list_marketplace_sources(state: State<'_, AppState>) -> AppResult<Vec<MarketplaceSource>> {
    state.db.list_marketplace_sources()
}

#[tauri::command]
pub fn save_marketplace_source(
    state: State<'_, AppState>,
    source: MarketplaceSource,
) -> AppResult<MarketplaceSource> {
    let mut s = source;
    if s.id.trim().is_empty() {
        s.id = Uuid::new_v4().to_string();
    }
    if s.created_at.trim().is_empty() {
        s.created_at = Utc::now().to_rfc3339();
    }
    state.db.upsert_marketplace_source(&s)?;
    Ok(s)
}

#[tauri::command]
pub fn delete_marketplace_source(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.delete_marketplace_source(&id)
}

#[tauri::command]
pub async fn browse_marketplace(
    state: State<'_, AppState>,
    source_id: String,
    query: Option<String>,
) -> AppResult<Vec<MarketplacePackageItem>> {
    let source = state
        .db
        .list_marketplace_sources()?
        .into_iter()
        .find(|s| s.id == source_id)
        .ok_or_else(|| AppError::NotFound("Marketplace source not found".into()))?;
    browse_marketplace_source(&source, query.as_deref()).await
}

// ---- SKILLS CENTER ----
#[tauri::command]
pub fn list_skills(state: State<'_, AppState>) -> AppResult<Vec<SkillRecord>> {
    state.db.list_skills()
}

#[tauri::command]
pub fn parse_skill_preview(raw_skill_md: String) -> ParsedSkillMd {
    parse_skill_md(&raw_skill_md)
}

#[tauri::command]
pub async fn inspect_github_skills_cmd(
    state: State<'_, AppState>,
    repo_url: String,
    branch: Option<String>,
    subdirectory: Option<String>,
    commit_ref: Option<String>,
) -> AppResult<Vec<GitHubSkillPreview>> {
    let settings = state.db.get_settings()?;
    inspect_github_skills(
        &settings.skills.github_api_base,
        &repo_url,
        branch.as_deref(),
        subdirectory.as_deref(),
        commit_ref.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn install_github_skill_cmd(
    state: State<'_, AppState>,
    preview: GitHubSkillPreview,
) -> AppResult<SkillRecord> {
    install_github_skill(&state.db, &preview).await
}

#[tauri::command]
pub fn import_local_skill_cmd(state: State<'_, AppState>, path: String) -> AppResult<SkillRecord> {
    import_local_skill_folder(&state.db, Path::new(&path))
}

#[tauri::command]
pub fn import_zip_skill_cmd(state: State<'_, AppState>, path: String) -> AppResult<SkillRecord> {
    import_zip_skill(&state.db, Path::new(&path))
}

#[tauri::command]
pub fn save_skill_cmd(
    state: State<'_, AppState>,
    id: Option<String>,
    raw_skill_md: String,
) -> AppResult<SkillRecord> {
    create_or_save_skill(&state.db, id, raw_skill_md, None)
}

#[tauri::command]
pub fn toggle_skill_cmd(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> AppResult<SkillRecord> {
    let mut sk = state
        .db
        .get_skill(&id)?
        .ok_or_else(|| AppError::NotFound("Skill not found".into()))?;
    sk.enabled = enabled;
    sk.updated_at = Utc::now().to_rfc3339();
    state.db.upsert_skill(&sk)?;
    Ok(sk)
}

#[tauri::command]
pub fn delete_skill_cmd(state: State<'_, AppState>, id: String) -> AppResult<()> {
    if let Ok(Some(sk)) = state.db.get_skill(&id) {
        let p = PathBuf::from(&sk.local_path);
        if p.starts_with(state.db.skills_dir()) && p.exists() {
            let _ = std::fs::remove_dir_all(p);
        }
    }
    state.db.delete_skill(&id)
}

#[tauri::command]
pub fn read_skill_file_cmd(
    state: State<'_, AppState>,
    skill_id: String,
    relative_path: String,
) -> AppResult<String> {
    read_skill_file(&state.db, &skill_id, &relative_path)
}

#[tauri::command]
pub fn write_skill_file_cmd(
    state: State<'_, AppState>,
    skill_id: String,
    relative_path: String,
    content: String,
) -> AppResult<SkillRecord> {
    write_skill_file(&state.db, &skill_id, &relative_path, &content)
}

// ---- AGENTS & MULTI-AGENT ----
#[tauri::command]
pub fn list_agents(state: State<'_, AppState>) -> AppResult<Vec<AgentConfig>> {
    state.db.list_agents()
}

#[tauri::command]
pub fn save_agent(state: State<'_, AppState>, agent: AgentConfig) -> AppResult<AgentConfig> {
    let mut ag = agent;
    if ag.name.trim().is_empty() {
        return Err(AppError::Validation("Agent name cannot be empty".into()));
    }
    let now = Utc::now().to_rfc3339();
    if ag.id.trim().is_empty() {
        ag.id = Uuid::new_v4().to_string();
        ag.created_at = now.clone();
    }
    ag.updated_at = now;
    state.db.upsert_agent(&ag)?;
    Ok(ag)
}

#[tauri::command]
pub fn duplicate_agent(state: State<'_, AppState>, id: String) -> AppResult<AgentConfig> {
    let orig = state
        .db
        .get_agent(&id)?
        .ok_or_else(|| AppError::NotFound("Agent not found".into()))?;
    let now = Utc::now().to_rfc3339();
    let dup = AgentConfig {
        id: Uuid::new_v4().to_string(),
        name: format!("{} (Copy)", orig.name),
        is_template: false,
        created_at: now.clone(),
        updated_at: now,
        ..orig
    };
    state.db.upsert_agent(&dup)?;
    Ok(dup)
}

#[tauri::command]
pub fn delete_agent(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.delete_agent(&id)
}

#[tauri::command]
pub fn list_agent_memories(
    state: State<'_, AppState>,
    agent_id: String,
    project_id: Option<String>,
) -> AppResult<Vec<AgentMemoryEntry>> {
    state
        .db
        .list_agent_memories(&agent_id, project_id.as_deref())
}

#[tauri::command]
pub fn save_agent_memory(
    state: State<'_, AppState>,
    entry: AgentMemoryEntry,
) -> AppResult<AgentMemoryEntry> {
    let mut m = entry;
    let now = Utc::now().to_rfc3339();
    if m.id.trim().is_empty() {
        m.id = Uuid::new_v4().to_string();
        m.created_at = now.clone();
    }
    m.updated_at = now;
    state.db.upsert_agent_memory(&m)?;
    Ok(m)
}

#[tauri::command]
pub fn delete_agent_memory(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.delete_agent_memory(&id)
}

#[tauri::command]
pub async fn run_multi_agent_pipeline(
    app: AppHandle,
    state: State<'_, AppState>,
    initial_prompt: String,
    steps: Vec<MultiAgentStepSpec>,
    project_id: Option<String>,
    max_agent_depth: Option<u32>,
) -> AppResult<Vec<MultiAgentStepResult>> {
    let settings = state.db.get_settings()?;
    let depth_limit = max_agent_depth.unwrap_or(settings.agents.max_agent_depth).max(1);
    let mut results: Vec<MultiAgentStepResult> = Vec::new();
    let mut previous_output = initial_prompt.clone();

    let mut i = 0;
    while i < steps.len() {
        if let Some(group) = &steps[i].parallel_group {
            // Execute parallel batch sharing the same parallel_group tag
            let mut batch = Vec::new();
            while i < steps.len() && steps[i].parallel_group.as_ref() == Some(group) {
                batch.push(steps[i].clone());
                i += 1;
            }
            let mut handles = Vec::new();
            for step in batch {
                let rt = state.runtime.clone();
                let prompt = step
                    .task_template
                    .replace("{{input}}", &initial_prompt)
                    .replace("{{previous}}", &previous_output);
                let pid = project_id.clone();
                let app_c = app.clone();
                handles.push(tokio::spawn(async move {
                    let t0 = std::time::Instant::now();
                    let ag_name = rt
                        .db
                        .get_agent(&step.agent_id)?
                        .map(|a| a.name)
                        .unwrap_or_else(|| step.agent_id.clone());
                    let (out, tools) = rt
                        .run_agent_task(
                            &step.agent_id,
                            &prompt,
                            pid.as_deref(),
                            1,
                            depth_limit,
                            CancellationToken::new(),
                            move |req| {
                                let _ = app_c.emit("agent://approval-request", req);
                            },
                        )
                        .await?;
                    Ok::<MultiAgentStepResult, AppError>(MultiAgentStepResult {
                        agent_id: step.agent_id,
                        agent_name: ag_name,
                        label: step.label,
                        output: out,
                        tool_calls_used: tools,
                        duration_ms: t0.elapsed().as_millis() as u64,
                    })
                }));
            }
            let mut combined = Vec::new();
            for h in handles {
                let res = h
                    .await
                    .map_err(|e| AppError::Workflow(format!("Parallel step panicked: {e}")))??;
                combined.push(format!("### {}\n{}", res.label, res.output));
                results.push(res);
            }
            previous_output = combined.join("\n\n");
        } else {
            let step = &steps[i];
            let t0 = std::time::Instant::now();
            let ag_name = state
                .db
                .get_agent(&step.agent_id)?
                .map(|a| a.name)
                .unwrap_or_else(|| step.agent_id.clone());
            let prompt = step
                .task_template
                .replace("{{input}}", &initial_prompt)
                .replace("{{previous}}", &previous_output);
            let app_c = app.clone();
            let (out, tools) = state
                .runtime
                .run_agent_task(
                    &step.agent_id,
                    &prompt,
                    project_id.as_deref(),
                    1,
                    depth_limit,
                    CancellationToken::new(),
                    move |req| {
                        let _ = app_c.emit("agent://approval-request", req);
                    },
                )
                .await?;
            previous_output = out.clone();
            results.push(MultiAgentStepResult {
                agent_id: step.agent_id.clone(),
                agent_name: ag_name,
                label: step.label.clone(),
                output: out,
                tool_calls_used: tools,
                duration_ms: t0.elapsed().as_millis() as u64,
            });
            i += 1;
        }
    }
    Ok(results)
}

// ---- PROJECTS & LOCAL FILES (STRICTLY SCOPED TO PROJECT ROOT) ----
#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> AppResult<Vec<ProjectWorkspace>> {
    state.db.list_projects()
}

#[tauri::command]
pub fn save_project(
    state: State<'_, AppState>,
    project: ProjectWorkspace,
) -> AppResult<ProjectWorkspace> {
    if project.name.trim().is_empty() || project.root_path.trim().is_empty() {
        return Err(AppError::Validation(
            "Project name and root directory path are required".into(),
        ));
    }
    let mut p = project;
    let now = Utc::now().to_rfc3339();
    if p.id.trim().is_empty() {
        p.id = Uuid::new_v4().to_string();
        p.created_at = now.clone();
    }
    p.updated_at = now;
    std::fs::create_dir_all(&p.root_path)?;
    state.db.upsert_project(&p)?;
    Ok(p)
}

#[tauri::command]
pub fn delete_project(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.delete_project(&id)
}

#[tauri::command]
pub fn list_project_files(
    state: State<'_, AppState>,
    project_id: String,
    relative_dir: Option<String>,
) -> AppResult<Vec<ProjectFileEntry>> {
    let proj = state
        .db
        .get_project(&project_id)?
        .ok_or_else(|| AppError::NotFound("Project not found".into()))?;
    let root = PathBuf::from(&proj.root_path);
    let target = match relative_dir.filter(|s| !s.trim().is_empty()) {
        Some(rel) => verify_path_within_roots(&root.join(rel), &[root.clone()])?,
        None => root.clone(),
    };
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(&target)? {
        let entry = entry?;
        let path = entry.path();
        let meta = entry.metadata()?;
        let rel = path
            .strip_prefix(&root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        entries.push(ProjectFileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            relative_path: rel,
            is_dir: meta.is_dir(),
            size_bytes: meta.len(),
        });
    }
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(entries)
}

#[tauri::command]
pub fn read_project_file(
    state: State<'_, AppState>,
    project_id: String,
    relative_path: String,
) -> AppResult<String> {
    let proj = state
        .db
        .get_project(&project_id)?
        .ok_or_else(|| AppError::NotFound("Project not found".into()))?;
    let root = PathBuf::from(&proj.root_path);
    let safe = verify_path_within_roots(&root.join(relative_path), &[root])?;
    Ok(std::fs::read_to_string(safe)?)
}

#[tauri::command]
pub fn write_project_file(
    state: State<'_, AppState>,
    project_id: String,
    relative_path: String,
    content: String,
) -> AppResult<()> {
    let proj = state
        .db
        .get_project(&project_id)?
        .ok_or_else(|| AppError::NotFound("Project not found".into()))?;
    let root = PathBuf::from(&proj.root_path);
    let safe = verify_path_within_roots(&root.join(relative_path), &[root])?;
    if let Some(parent) = safe.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(safe, content)?;
    Ok(())
}

#[tauri::command]
pub fn delete_project_file(
    state: State<'_, AppState>,
    project_id: String,
    relative_path: String,
) -> AppResult<()> {
    let proj = state
        .db
        .get_project(&project_id)?
        .ok_or_else(|| AppError::NotFound("Project not found".into()))?;
    let root = PathBuf::from(&proj.root_path);
    let safe = verify_path_within_roots(&root.join(relative_path), &[root])?;
    if safe.is_dir() {
        std::fs::remove_dir_all(safe)?;
    } else {
        std::fs::remove_file(safe)?;
    }
    Ok(())
}

#[tauri::command]
pub fn import_project_folder_cmd(
    state: State<'_, AppState>,
    root_path: String,
    name: Option<String>,
) -> AppResult<ProjectImportResult> {
    import_project_folder(&state.db, Path::new(&root_path), name.as_deref())
}

#[tauri::command]
pub fn inspect_project_metadata_cmd(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<ProjectMetadata> {
    let proj = state
        .db
        .get_project(&project_id)?
        .ok_or_else(|| AppError::NotFound("Project not found".into()))?;
    Ok(inspect_project_metadata(Path::new(&proj.root_path)))
}

#[tauri::command]
pub fn get_project_tree_cmd(
    state: State<'_, AppState>,
    project_id: String,
    include_ignored: Option<bool>,
) -> AppResult<Vec<ProjectTreeNode>> {
    let proj = state
        .db
        .get_project(&project_id)?
        .ok_or_else(|| AppError::NotFound("Project not found".into()))?;
    get_project_tree(
        Path::new(&proj.root_path),
        include_ignored.unwrap_or(false),
        8,
    )
}

#[tauri::command]
pub fn read_project_file_rich_cmd(
    state: State<'_, AppState>,
    project_id: String,
    relative_path: String,
) -> AppResult<ProjectFileContent> {
    let proj = state
        .db
        .get_project(&project_id)?
        .ok_or_else(|| AppError::NotFound("Project not found".into()))?;
    read_project_file_rich(Path::new(&proj.root_path), &relative_path)
}

#[tauri::command]
pub fn create_project_dir_cmd(
    state: State<'_, AppState>,
    project_id: String,
    relative_path: String,
) -> AppResult<()> {
    let proj = state
        .db
        .get_project(&project_id)?
        .ok_or_else(|| AppError::NotFound("Project not found".into()))?;
    create_project_dir(Path::new(&proj.root_path), &relative_path)
}

#[tauri::command]
pub fn rename_project_entry_cmd(
    state: State<'_, AppState>,
    project_id: String,
    from_relative_path: String,
    to_relative_path: String,
) -> AppResult<()> {
    let proj = state
        .db
        .get_project(&project_id)?
        .ok_or_else(|| AppError::NotFound("Project not found".into()))?;
    rename_project_entry(
        Path::new(&proj.root_path),
        &from_relative_path,
        &to_relative_path,
    )
}

#[tauri::command]
pub fn search_project_files_cmd(
    state: State<'_, AppState>,
    project_id: String,
    query: String,
    case_sensitive: Option<bool>,
) -> AppResult<Vec<ProjectSearchMatch>> {
    let proj = state
        .db
        .get_project(&project_id)?
        .ok_or_else(|| AppError::NotFound("Project not found".into()))?;
    search_project_files(
        Path::new(&proj.root_path),
        &query,
        case_sensitive.unwrap_or(false),
        150,
    )
}

// ---- WORKFLOWS ----
#[tauri::command]
pub fn list_workflows(state: State<'_, AppState>) -> AppResult<Vec<WorkflowDefinition>> {
    state.db.list_workflows()
}

#[tauri::command]
pub fn save_workflow(
    state: State<'_, AppState>,
    workflow: WorkflowDefinition,
) -> AppResult<WorkflowDefinition> {
    let mut w = workflow;
    if w.name.trim().is_empty() {
        return Err(AppError::Validation("Workflow name is required".into()));
    }
    let now = Utc::now().to_rfc3339();
    if w.id.trim().is_empty() {
        w.id = Uuid::new_v4().to_string();
        w.created_at = now.clone();
    }
    w.updated_at = now;
    state.db.upsert_workflow(&w)?;
    Ok(w)
}

#[tauri::command]
pub fn delete_workflow(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.delete_workflow(&id)
}

#[tauri::command]
pub fn validate_workflow_cmd(workflow: WorkflowDefinition) -> Vec<String> {
    validate_workflow_graph(&workflow)
}

#[tauri::command]
pub async fn run_workflow_cmd(
    app: AppHandle,
    state: State<'_, AppState>,
    workflow_id: String,
    initial_input: serde_json::Value,
    project_id: Option<String>,
) -> AppResult<WorkflowRunRecord> {
    let wf = state
        .db
        .get_workflow(&workflow_id)?
        .ok_or_else(|| AppError::NotFound("Workflow not found".into()))?;
    let app_run = app.clone();
    let app_appv = app.clone();
    state
        .workflows
        .execute_workflow(
            wf,
            initial_input,
            project_id,
            move |run| {
                let _ = app_run.emit("workflow://run-update", run);
            },
            move |req| {
                let _ = app_appv.emit("agent://approval-request", req);
            },
        )
        .await
}

#[tauri::command]
pub async fn pause_workflow_run(state: State<'_, AppState>, run_id: String) -> AppResult<bool> {
    Ok(state.workflows.pause_run(&run_id).await)
}

#[tauri::command]
pub async fn resume_workflow_run(state: State<'_, AppState>, run_id: String) -> AppResult<bool> {
    Ok(state.workflows.resume_run(&run_id).await)
}

#[tauri::command]
pub async fn cancel_workflow_run(state: State<'_, AppState>, run_id: String) -> AppResult<bool> {
    Ok(state.workflows.cancel_run(&run_id).await)
}

#[tauri::command]
pub fn list_workflow_runs(
    state: State<'_, AppState>,
    workflow_id: Option<String>,
) -> AppResult<Vec<WorkflowRunRecord>> {
    state.db.list_workflow_runs(workflow_id.as_deref())
}

// ---- PERMISSIONS & APPROVALS ----
#[tauri::command]
pub fn list_permission_rules(state: State<'_, AppState>) -> AppResult<Vec<PermissionRule>> {
    state.db.list_permission_rules()
}

#[tauri::command]
pub fn save_permission_rule(
    state: State<'_, AppState>,
    rule: PermissionRule,
) -> AppResult<PermissionRule> {
    let mut r = rule;
    if r.id.trim().is_empty() {
        r.id = Uuid::new_v4().to_string();
    }
    if r.created_at.trim().is_empty() {
        r.created_at = Utc::now().to_rfc3339();
    }
    state.db.upsert_permission_rule(&r)?;
    Ok(r)
}

#[tauri::command]
pub fn delete_permission_rule(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.delete_permission_rule(&id)
}

#[tauri::command]
pub fn resolve_approval_request(
    state: State<'_, AppState>,
    request_id: String,
    decision: String,
    agent_id: Option<String>,
    category: String,
    resource: String,
) -> AppResult<()> {
    let parsed = ApprovalDecision::from_str(&decision)?;
    state.permissions.resolve_approval(
        &request_id,
        parsed,
        agent_id.as_deref(),
        &category,
        &resource,
    )
}

// ---- OBSERVABILITY, BACKUP & PRIVACY ----
#[tauri::command]
pub fn list_audit_logs(state: State<'_, AppState>, limit: Option<usize>) -> AppResult<Vec<AuditLogEntry>> {
    state.db.list_audit_logs(limit.unwrap_or(200))
}

#[tauri::command]
pub fn clear_audit_logs(state: State<'_, AppState>) -> AppResult<()> {
    state.db.clear_audit_logs()
}

#[tauri::command]
pub fn export_backup_json(state: State<'_, AppState>) -> AppResult<serde_json::Value> {
    state.db.export_portable_backup()
}

#[tauri::command]
pub fn import_backup_json(state: State<'_, AppState>, backup: serde_json::Value) -> AppResult<()> {
    state.db.import_portable_backup(&backup)
}

#[tauri::command]
pub async fn wipe_all_local_data(state: State<'_, AppState>) -> AppResult<()> {
    for p in state.db.list_providers()? {
        let _ = state.creds.delete_secret(&provider_secret_key(&p.id));
    }
    for s in state.db.list_mcp_servers()? {
        let _ = state.mcp.disconnect_server(&s.id).await;
        for k in s.env_keys {
            let _ = state.creds.delete_secret(&format!("mcp:{}:env:{k}", s.id));
        }
        let _ = state.creds.delete_secret(&format!("mcp:{}:auth", s.id));
    }
    state.permissions.clear_session_allows();
    state.redactor.clear();
    state.db.wipe_all_data()
}
