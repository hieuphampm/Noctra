use crate::ai::{
    build_openai_messages, complete_chat, OpenAiFunctionDef, OpenAiToolDef,
};
use crate::error::{AppError, AppResult};
use crate::mcp::McpHubManager;
use crate::permissions::{ApprovalDecision, PermissionManager};
use crate::project_fs::{
    compute_unified_diff, create_project_dir, get_project_tree, inspect_project_metadata,
    rename_project_entry, resolve_project_path, search_project_files,
};
use crate::security::credentials::CredentialStore;
use crate::security::redaction::SecretRedactor;
use crate::security::sandbox::verify_path_within_roots;
use crate::storage::models::{
    AgentConfig, AiProvider, ApprovalRequest, ChatAttachment, ChatMessage, McpTool, ToolCallRecord,
};
use crate::storage::Database;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatStreamEvent {
    pub run_id: String,
    pub conversation_id: String,
    pub kind: String, // "delta" | "tool_call" | "tool_result" | "project_changed" | "status" | "done" | "error"
    pub text: Option<String>,
    pub tool_call: Option<ToolCallRecord>,
    pub message: Option<ChatMessage>,
    #[serde(default)]
    pub changed_paths: Option<Vec<String>>,
}

#[derive(Debug, Clone)]
enum ResolvedToolTarget {
    Mcp(McpTool),
    BuiltinProject {
        name: String,
        category: String,
        is_mutating: bool,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiAgentStepSpec {
    pub agent_id: String,
    pub label: String,
    pub task_template: String,
    pub parallel_group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiAgentStepResult {
    pub agent_id: String,
    pub agent_name: String,
    pub label: String,
    pub output: String,
    pub tool_calls_used: usize,
    pub duration_ms: u64,
}

pub struct AgentRuntime {
    pub db: Arc<Database>,
    pub creds: Arc<CredentialStore>,
    pub redactor: Arc<SecretRedactor>,
    pub mcp: Arc<McpHubManager>,
    pub permissions: Arc<PermissionManager>,
    active_runs: Mutex<HashMap<String, CancellationToken>>,
}

impl AgentRuntime {
    pub fn new(
        db: Arc<Database>,
        creds: Arc<CredentialStore>,
        redactor: Arc<SecretRedactor>,
        mcp: Arc<McpHubManager>,
        permissions: Arc<PermissionManager>,
    ) -> Self {
        Self {
            db,
            creds,
            redactor,
            mcp,
            permissions,
            active_runs: Mutex::new(HashMap::new()),
        }
    }

    pub async fn register_run(&self, run_id: &str) -> CancellationToken {
        let token = CancellationToken::new();
        self.active_runs
            .lock()
            .await
            .insert(run_id.to_string(), token.clone());
        token
    }

    pub async fn cancel_run(&self, run_id: &str) -> bool {
        if let Some(token) = self.active_runs.lock().await.get(run_id) {
            token.cancel();
            true
        } else {
            false
        }
    }

    pub async fn unregister_run(&self, run_id: &str) {
        self.active_runs.lock().await.remove(run_id);
    }

    pub fn build_agent_system_prompt(
        &self,
        agent: &AgentConfig,
        project_id: Option<&str>,
    ) -> AppResult<String> {
        let mut sections = Vec::new();
        sections.push(format!(
            "You are {}, acting as {}.\nPersonality: {}\n{}",
            agent.name, agent.role, agent.personality, agent.system_instructions
        ));

        if let Some(pid) = project_id {
            if let Some(project) = self.db.get_project(pid)? {
                let root_path = Path::new(&project.root_path);
                let meta = inspect_project_metadata(root_path);
                let top_entries = get_project_tree(root_path, false, 1)
                    .unwrap_or_default()
                    .into_iter()
                    .take(40)
                    .map(|n| if n.is_dir { format!("{}/", n.name) } else { n.name })
                    .collect::<Vec<_>>();
                let stack_line = if meta.tech_stack.is_empty() {
                    "Unknown".to_string()
                } else {
                    meta.tech_stack.join(", ")
                };
                let branch_line = meta
                    .git_branch
                    .as_deref()
                    .map(|b| format!(" | Git branch: {b}"))
                    .unwrap_or_default();
                let tree_preview = if top_entries.is_empty() {
                    "(empty directory)".to_string()
                } else {
                    top_entries.join(", ")
                };
                sections.push(format!(
                    "## Active Project Workspace: {}\nRoot: {}\nStack: {}{} | Files: {}, Dirs: {}\nTop-level entries: {}\nWorkspace Tool Rules: Use relative paths (e.g. 'src/main.ts') with project_* tools. All edits stay strictly sandboxed inside the project root.\nProject Instructions:\n{}",
                    project.name,
                    project.root_path,
                    stack_line,
                    branch_line,
                    meta.file_count,
                    meta.dir_count,
                    tree_preview,
                    project.instructions
                ));
            }
        }

        // Load assigned and globally enabled skills (treated purely as instructions, never executed)
        if !agent.assigned_skill_ids.is_empty() {
            let skills = self.db.list_skills()?;
            let assigned: HashSet<&String> = agent.assigned_skill_ids.iter().collect();
            for sk in skills.into_iter().filter(|s| s.enabled && assigned.contains(&s.id)) {
                sections.push(format!(
                    "## Assigned Skill: {} (source: {}, trust: {})\n{}",
                    sk.name, sk.source_type, sk.trust_level, sk.instructions_md
                ));
            }
        }

        // Load agent/project memories when enabled
        if agent.memory_config.agent_local_memory || agent.memory_config.project_memory {
            let memories = self.db.list_agent_memories(&agent.id, project_id)?;
            let filtered: Vec<String> = memories
                .into_iter()
                .filter(|m| {
                    (m.scope == "agent" && agent.memory_config.agent_local_memory)
                        || (m.scope == "project" && agent.memory_config.project_memory)
                })
                .take(15)
                .map(|m| format!("- [{}] {}: {}", m.scope, m.key, m.content))
                .collect();
            if !filtered.is_empty() {
                sections.push(format!("## Persistent Memory\n{}", filtered.join("\n")));
            }
        }

        Ok(sections.join("\n\n"))
    }

    /// Resolves permitted MCP tools AND built-in sandboxed project workspace tools (when a project is attached).
    pub fn resolve_permitted_tools_for_agent(
        &self,
        agent: &AgentConfig,
        project_id: Option<&str>,
    ) -> AppResult<(Vec<OpenAiToolDef>, HashMap<String, McpTool>)> {
        let all_tools = self.db.list_mcp_tools()?;
        let allowed_servers: HashSet<&String> = agent.assigned_mcp_server_ids.iter().collect();
        let allowed_tools: HashSet<&String> = agent.enabled_tool_ids.iter().collect();

        let project_allowed: Option<HashSet<String>> = if let Some(pid) = project_id {
            self.db
                .get_project(pid)?
                .filter(|p| !p.allowed_tool_ids.is_empty())
                .map(|p| p.allowed_tool_ids.into_iter().collect())
        } else {
            None
        };

        let mut defs = Vec::new();
        let mut map = HashMap::new();

        for tool in all_tools {
            if !tool.enabled || !tool.available {
                continue;
            }
            let server_ok = allowed_servers.is_empty() || allowed_servers.contains(&tool.server_id);
            let tool_ok = allowed_tools.contains(&tool.id) || allowed_tools.contains(&tool.name);
            let proj_ok = project_allowed
                .as_ref()
                .map(|set| set.contains(&tool.id) || set.contains(&tool.name))
                .unwrap_or(true);

            if server_ok && tool_ok && proj_ok {
                let fn_name = sanitize_tool_fn_name(&tool.server_id, &tool.name, &map);
                defs.push(OpenAiToolDef {
                    kind: "function".into(),
                    function: OpenAiFunctionDef {
                        name: fn_name.clone(),
                        description: format!("[{}] {}", tool.server_name, tool.description),
                        parameters: tool.input_schema.clone(),
                    },
                });
                map.insert(fn_name, tool);
            }
        }

        Ok((defs, map))
    }

    fn resolve_runtime_tools(
        &self,
        agent: &AgentConfig,
        project_id: Option<&str>,
    ) -> AppResult<(Vec<OpenAiToolDef>, HashMap<String, ResolvedToolTarget>)> {
        let (mut defs, mcp_map) = self.resolve_permitted_tools_for_agent(agent, project_id)?;
        let mut targets: HashMap<String, ResolvedToolTarget> = mcp_map
            .into_iter()
            .map(|(k, v)| (k, ResolvedToolTarget::Mcp(v)))
            .collect();

        if let Some(pid) = project_id {
            if agent.file_access_mode != "none" && self.db.get_project(pid)?.is_some() {
                for spec in builtin_project_tool_specs() {
                    if !targets.contains_key(&spec.name) {
                        defs.push(OpenAiToolDef {
                            kind: "function".into(),
                            function: OpenAiFunctionDef {
                                name: spec.name.clone(),
                                description: spec.description,
                                parameters: spec.parameters,
                            },
                        });
                        targets.insert(
                            spec.name.clone(),
                            ResolvedToolTarget::BuiltinProject {
                                name: spec.name,
                                category: spec.category,
                                is_mutating: spec.is_mutating,
                            },
                        );
                    }
                }
            }
        }

        Ok((defs, targets))
    }

    pub async fn execute_chat_turn<FEmit, FApprove>(
        &self,
        run_id: String,
        conversation_id: String,
        user_text: String,
        attachments: Vec<ChatAttachment>,
        explicit_provider_id: Option<String>,
        explicit_model: Option<String>,
        cancel: CancellationToken,
        emit_event: FEmit,
        emit_approval: FApprove,
    ) -> AppResult<ChatMessage>
    where
        FEmit: Fn(ChatStreamEvent) + Send + Sync + 'static,
        FApprove: Fn(ApprovalRequest) + Send + Sync + 'static,
    {
        let conv = self
            .db
            .get_conversation(&conversation_id)?
            .ok_or_else(|| AppError::NotFound(format!("Conversation '{conversation_id}' not found")))?;

        let now = Utc::now().to_rfc3339();
        let user_msg = ChatMessage {
            id: Uuid::new_v4().to_string(),
            conversation_id: conversation_id.clone(),
            role: "user".into(),
            content: user_text,
            attachments,
            tool_calls: vec![],
            tool_call_id: None,
            token_usage: None,
            created_at: now,
        };
        self.db.upsert_message(&user_msg)?;

        let agent = if conv.mode == "agent" {
            if let Some(aid) = &conv.active_agent_id {
                self.db.get_agent(aid)?
            } else if conv.project_id.is_some() {
                match self.db.get_agent("tpl-coding")? {
                    Some(a) => Some(a),
                    None => self.db.list_agents()?.into_iter().next(),
                }
            } else {
                None
            }
        } else {
            None
        };

        let settings = self.db.get_settings()?;
        let non_empty = |opt: Option<String>| opt.filter(|s| !s.trim().is_empty());
        let candidates = [
            non_empty(explicit_provider_id),
            non_empty(agent.as_ref().and_then(|a| a.provider_id.clone())),
            non_empty(conv.active_provider_id.clone()),
            non_empty(settings.ai.default_provider_id.clone()),
        ];

        let mut resolved_provider: Option<AiProvider> = None;
        for candidate_id in candidates.into_iter().flatten() {
            if let Some(found) = self.db.get_provider(&candidate_id)? {
                resolved_provider = Some(found);
                break;
            }
        }

        let mut provider: AiProvider = match resolved_provider {
            Some(p) => p,
            None => {
                let mut available = self.db.list_providers()?;
                if available.is_empty() {
                    return Err(AppError::Provider(
                        "No AI provider selected or configured".into(),
                    ));
                }
                available.remove(0)
            }
        };

        let conv_model = if conv.active_provider_id.is_none()
            || conv.active_provider_id.as_deref() == Some(provider.id.as_str())
        {
            non_empty(conv.active_model.clone())
        } else {
            None
        };
        let model_override = non_empty(explicit_model)
            .or_else(|| non_empty(agent.as_ref().and_then(|a| a.model_id.clone())))
            .or(conv_model);

        if let Some(ag) = &agent {
            provider.temperature = ag.temperature;
            provider.max_tokens = ag.max_tokens;
        }

        let system_prompt = if let Some(ag) = &agent {
            self.build_agent_system_prompt(ag, conv.project_id.as_deref())?
        } else {
            conv.system_prompt_override
                .clone()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| provider.default_system_prompt.clone())
        };

        let (tool_defs, tool_map) = if let Some(ag) = &agent {
            self.resolve_runtime_tools(ag, conv.project_id.as_deref())?
        } else {
            (vec![], HashMap::new())
        };
        let is_turbo = conv.execution_mode.eq_ignore_ascii_case("turbo");

        let max_steps = agent
            .as_ref()
            .map(|a| a.max_steps)
            .unwrap_or(1)
            .max(1);
        let max_tool_calls = agent.as_ref().map(|a| a.max_tool_calls).unwrap_or(0);
        let max_runtime_secs = agent
            .as_ref()
            .map(|a| a.max_runtime_secs)
            .unwrap_or(120)
            .max(10);

        let started = Instant::now();
        let mut total_tool_calls: u32 = 0;

        for _step in 0..max_steps {
            if cancel.is_cancelled() {
                return Err(AppError::Cancelled);
            }
            if started.elapsed().as_secs() > max_runtime_secs {
                return Err(AppError::Provider(format!(
                    "Agent execution exceeded maximum runtime ({max_runtime_secs}s)"
                )));
            }

            let history = self.db.list_messages(&conversation_id)?;
            let context_limit = agent
                .as_ref()
                .map(|a| a.memory_config.retention_messages)
                .unwrap_or(settings.ai.context_message_limit);
            let slice_start = history.len().saturating_sub(context_limit.max(4));
            let openai_msgs = build_openai_messages(Some(&system_prompt), &history[slice_start..]);

            let emit_clone = &emit_event;
            let run_clone = &run_id;
            let conv_clone = &conversation_id;

            let completion = complete_chat(
                &provider,
                model_override.as_deref(),
                openai_msgs,
                if tool_defs.is_empty() { None } else { Some(&tool_defs) },
                &self.creds,
                &self.redactor,
                cancel.clone(),
                |delta| {
                    emit_clone(ChatStreamEvent {
                        run_id: run_clone.clone(),
                        conversation_id: conv_clone.clone(),
                        kind: "delta".into(),
                        text: Some(delta.to_string()),
                        tool_call: None,
                        message: None,
                        changed_paths: None,
                    });
                },
            )
            .await?;

            if completion.tool_calls.is_empty() || agent.is_none() {
                let final_msg = ChatMessage {
                    id: Uuid::new_v4().to_string(),
                    conversation_id: conversation_id.clone(),
                    role: "assistant".into(),
                    content: completion.content,
                    attachments: vec![],
                    tool_calls: vec![],
                    tool_call_id: None,
                    token_usage: completion.token_usage,
                    created_at: Utc::now().to_rfc3339(),
                };
                self.db.upsert_message(&final_msg)?;
                emit_event(ChatStreamEvent {
                    run_id,
                    conversation_id,
                    kind: "done".into(),
                    text: None,
                    tool_call: None,
                    message: Some(final_msg.clone()),
                    changed_paths: None,
                });
                return Ok(final_msg);
            }

            // Agent requested tool calls: enforce permission pipeline deterministically
            let assistant_ts = Utc::now();
            let ag = agent.as_ref().unwrap();
            let mut recorded_calls = Vec::new();
            let mut tool_result_msgs = Vec::new();

            for tc in completion.tool_calls {
                if total_tool_calls >= max_tool_calls {
                    return Err(AppError::PermissionDenied(format!(
                        "Agent reached maximum tool call limit ({max_tool_calls})"
                    )));
                }
                total_tool_calls += 1;

                let call_started = Instant::now();
                let mut record = ToolCallRecord {
                    id: tc.id.clone(),
                    server_id: None,
                    name: tc.name.clone(),
                    arguments: tc.arguments.clone(),
                    status: "running".into(),
                    result: None,
                    error: None,
                    duration_ms: None,
                };

                let Some(target) = tool_map.get(&tc.name) else {
                    record.status = "error".into();
                    record.error = Some(format!(
                        "Permission denied: tool '{}' is not assigned or enabled for agent '{}'",
                        tc.name, ag.name
                    ));
                    recorded_calls.push(record.clone());
                    tool_result_msgs.push(make_tool_error_msg(&conversation_id, tc.id, record.error.as_deref()));
                    continue;
                };

                let (server_label, tool_display_name, resource_key, primary_cat, is_builtin, is_mutating) =
                    match target {
                        ResolvedToolTarget::Mcp(mcp_tool) => {
                            record.server_id = Some(mcp_tool.server_id.clone());
                            let cat = mcp_tool
                                .required_permissions
                                .iter()
                                .find(|p| *p != "mcp_tools")
                                .cloned()
                                .unwrap_or_else(|| "mcp_tools".into());
                            (
                                mcp_tool.server_name.clone(),
                                mcp_tool.name.clone(),
                                format!("{}:{}", mcp_tool.server_name, mcp_tool.name),
                                cat,
                                false,
                                true,
                            )
                        }
                        ResolvedToolTarget::BuiltinProject {
                            name,
                            category,
                            is_mutating,
                        } => {
                            record.server_id = Some("builtin:project".into());
                            (
                                "Project Workspace".to_string(),
                                name.clone(),
                                format!("project:{name}"),
                                category.clone(),
                                true,
                                *is_mutating,
                            )
                        }
                    };

                // Enforce file directory scope if arguments specify a path
                if let Err(scope_err) = enforce_agent_file_scope(
                    &self.db,
                    ag,
                    conv.project_id.as_deref(),
                    &tc.arguments,
                ) {
                    record.status = "denied".into();
                    record.error = Some(scope_err.to_string());
                    recorded_calls.push(record.clone());
                    tool_result_msgs.push(make_tool_error_msg(&conversation_id, tc.id, record.error.as_deref()));
                    continue;
                }

                // Evaluate permission mode + Review vs Turbo execution mode
                let mode = self.permissions.evaluate_mode(
                    Some(&ag.id),
                    conv.project_id.as_deref(),
                    &primary_cat,
                    &resource_key,
                )?;

                if mode == "deny" {
                    record.status = "denied".into();
                    record.error = Some(format!(
                        "Tool '{resource_key}' is denied by permission rules"
                    ));
                    recorded_calls.push(record.clone());
                    tool_result_msgs.push(make_tool_error_msg(&conversation_id, tc.id, record.error.as_deref()));
                    continue;
                }

                let needs_approval = if is_turbo {
                    false
                } else if mode == "always" || mode == "session" {
                    false
                } else if is_builtin {
                    // In Review mode, read-only project exploration runs smoothly; mutating edits always ask user.
                    is_mutating
                } else {
                    ag.require_approval_sensitive || !ag.autonomous_execution || mode == "ask"
                };

                if needs_approval {
                    record.status = "pending_approval".into();
                    emit_event(ChatStreamEvent {
                        run_id: run_id.clone(),
                        conversation_id: conversation_id.clone(),
                        kind: "tool_call".into(),
                        text: None,
                        tool_call: Some(record.clone()),
                        message: None,
                        changed_paths: None,
                    });

                    let diff_preview = if is_builtin {
                        build_project_diff_preview(
                            &self.db,
                            conv.project_id.as_deref(),
                            &tool_display_name,
                            &tc.arguments,
                        )
                    } else {
                        None
                    };

                    let action_summary = if is_builtin {
                        describe_project_action(&tool_display_name, &tc.arguments)
                    } else {
                        format!("Execute MCP tool '{tool_display_name}'")
                    };

                    let (req, rx) = self.permissions.create_approval_ticket(
                        Some(ag.id.clone()),
                        Some(ag.name.clone()),
                        primary_cat.clone(),
                        action_summary,
                        format!(
                            "Agent '{}' requested '{}' via {} (Review Mode)",
                            ag.name, tool_display_name, server_label
                        ),
                        tool_display_name.clone(),
                        extract_affected_resources(&tc.arguments, &resource_key),
                        tc.arguments.clone(),
                        diff_preview,
                    );
                    emit_approval(req);

                    let decision = tokio::select! {
                        _ = cancel.cancelled() => return Err(AppError::Cancelled),
                        res = rx => res.unwrap_or(ApprovalDecision::Deny),
                    };

                    if decision == ApprovalDecision::Deny {
                        record.status = "denied".into();
                        record.error = Some("User denied tool execution".into());
                        recorded_calls.push(record.clone());
                        emit_event(ChatStreamEvent {
                            run_id: run_id.clone(),
                            conversation_id: conversation_id.clone(),
                            kind: "tool_result".into(),
                            text: None,
                            tool_call: Some(record),
                            message: None,
                            changed_paths: None,
                        });
                        tool_result_msgs.push(make_tool_error_msg(
                            &conversation_id,
                            tc.id,
                            Some("User denied permission for this tool call"),
                        ));
                        continue;
                    }
                }

                record.status = "running".into();
                emit_event(ChatStreamEvent {
                    run_id: run_id.clone(),
                    conversation_id: conversation_id.clone(),
                    kind: "tool_call".into(),
                    text: None,
                    tool_call: Some(record.clone()),
                    message: None,
                    changed_paths: None,
                });

                let exec_res: AppResult<(serde_json::Value, Vec<String>)> = match target {
                    ResolvedToolTarget::Mcp(mcp_tool) => self
                        .mcp
                        .call_tool(&mcp_tool.server_id, &mcp_tool.name, tc.arguments.clone())
                        .await
                        .map(|v| (v, vec![])),
                    ResolvedToolTarget::BuiltinProject { name, .. } => execute_builtin_project_tool(
                        &self.db,
                        conv.project_id.as_deref(),
                        name,
                        &tc.arguments,
                    ),
                };

                match exec_res {
                    Ok((res, changed_paths)) => {
                        record.status = "completed".into();
                        record.result = Some(res.clone());
                        record.duration_ms = Some(call_started.elapsed().as_millis() as u64);
                        emit_event(ChatStreamEvent {
                            run_id: run_id.clone(),
                            conversation_id: conversation_id.clone(),
                            kind: "tool_result".into(),
                            text: None,
                            tool_call: Some(record.clone()),
                            message: None,
                            changed_paths: None,
                        });
                        if !changed_paths.is_empty() {
                            self.db.log_event(
                                "project",
                                "info",
                                &format!(
                                    "Agent '{}' updated {} file(s) via {}",
                                    ag.name,
                                    changed_paths.len(),
                                    tool_display_name
                                ),
                                Some(&changed_paths.join(", ")),
                            );
                            emit_event(ChatStreamEvent {
                                run_id: run_id.clone(),
                                conversation_id: conversation_id.clone(),
                                kind: "project_changed".into(),
                                text: None,
                                tool_call: None,
                                message: None,
                                changed_paths: Some(changed_paths),
                            });
                        }
                        recorded_calls.push(record);
                        tool_result_msgs.push(ChatMessage {
                            id: Uuid::new_v4().to_string(),
                            conversation_id: conversation_id.clone(),
                            role: "tool".into(),
                            content: res.to_string(),
                            attachments: vec![],
                            tool_calls: vec![],
                            tool_call_id: Some(tc.id),
                            token_usage: None,
                            created_at: Utc::now().to_rfc3339(),
                        });
                    }
                    Err(e) => {
                        record.status = "error".into();
                        record.error = Some(self.redactor.redact(&e.to_string()));
                        record.duration_ms = Some(call_started.elapsed().as_millis() as u64);
                        emit_event(ChatStreamEvent {
                            run_id: run_id.clone(),
                            conversation_id: conversation_id.clone(),
                            kind: "tool_result".into(),
                            text: None,
                            tool_call: Some(record.clone()),
                            message: None,
                            changed_paths: None,
                        });
                        recorded_calls.push(record.clone());
                        tool_result_msgs.push(make_tool_error_msg(&conversation_id, tc.id, record.error.as_deref()));
                    }
                }
            }

            // Persist assistant tool-calling turn + tool results
            let assistant_tc_msg = ChatMessage {
                id: Uuid::new_v4().to_string(),
                conversation_id: conversation_id.clone(),
                role: "assistant".into(),
                content: completion.content,
                attachments: vec![],
                tool_calls: recorded_calls,
                tool_call_id: None,
                token_usage: completion.token_usage,
                created_at: assistant_ts.to_rfc3339(),
            };
            self.db.upsert_message(&assistant_tc_msg)?;
            for (idx, mut tr) in tool_result_msgs.into_iter().enumerate() {
                let min_ts = assistant_ts + chrono::Duration::milliseconds(idx as i64 + 1);
                tr.created_at = Utc::now().max(min_ts).to_rfc3339();
                self.db.upsert_message(&tr)?;
            }
        }

        Err(AppError::Provider(format!(
            "Agent reached maximum execution steps ({max_steps}) without a final response"
        )))
    }

    /// Executes a single stateless or handoff agent prompt with full skill/tool/permission support.
    /// Enforces `current_depth <= max_agent_depth` so agent-to-agent recursion is bounded.
    pub async fn run_agent_task<FApprove>(
        &self,
        agent_id: &str,
        prompt: &str,
        project_id: Option<&str>,
        current_depth: u32,
        max_agent_depth: u32,
        cancel: CancellationToken,
        emit_approval: FApprove,
    ) -> AppResult<(String, usize)>
    where
        FApprove: Fn(ApprovalRequest) + Send + Sync + 'static,
    {
        if current_depth > max_agent_depth {
            return Err(AppError::Workflow(format!(
                "Agent delegation depth ({current_depth}) exceeded maximum allowed depth ({max_agent_depth})"
            )));
        }

        let conv_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let ag = self
            .db
            .get_agent(agent_id)?
            .ok_or_else(|| AppError::NotFound(format!("Agent '{agent_id}' not found")))?;

        let settings = self.db.get_settings().unwrap_or_default();
        self.db.upsert_conversation(&crate::storage::models::Conversation {
            id: conv_id.clone(),
            title: format!("Run: {}", ag.name),
            mode: "agent".into(),
            execution_mode: settings.agents.default_execution_mode,
            active_provider_id: ag.provider_id.clone(),
            active_model: ag.model_id.clone(),
            active_agent_id: Some(ag.id.clone()),
            project_id: project_id.map(String::from),
            system_prompt_override: None,
            created_at: now.clone(),
            updated_at: now,
        })?;

        let msg = self
            .execute_chat_turn(
                Uuid::new_v4().to_string(),
                conv_id.clone(),
                prompt.to_string(),
                vec![],
                None,
                None,
                cancel,
                |_| {},
                emit_approval,
            )
            .await?;

        let all_msgs = self.db.list_messages(&conv_id)?;
        let tools_used: usize = all_msgs.iter().map(|m| m.tool_calls.len()).sum();
        Ok((msg.content, tools_used))
    }
}

fn make_tool_error_msg(conversation_id: &str, tool_call_id: String, error: Option<&str>) -> ChatMessage {
    ChatMessage {
        id: Uuid::new_v4().to_string(),
        conversation_id: conversation_id.to_string(),
        role: "tool".into(),
        content: serde_json::json!({ "error": error.unwrap_or("Unknown error") }).to_string(),
        attachments: vec![],
        tool_calls: vec![],
        tool_call_id: Some(tool_call_id),
        token_usage: None,
        created_at: Utc::now().to_rfc3339(),
    }
}

struct BuiltinToolSpec {
    name: String,
    description: String,
    parameters: serde_json::Value,
    category: String,
    is_mutating: bool,
}

fn builtin_project_tool_specs() -> Vec<BuiltinToolSpec> {
    vec![
        BuiltinToolSpec {
            name: "project_list_files".into(),
            description: "List files and folders inside the active imported project workspace.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "directory": { "type": "string", "description": "Optional relative subfolder path (default: project root)" },
                    "recursive": { "type": "boolean", "description": "Return recursive file tree when true (default: false)" }
                }
            }),
            category: "read_files".into(),
            is_mutating: false,
        },
        BuiltinToolSpec {
            name: "project_read_file".into(),
            description: "Read UTF-8 text contents of a file inside the active project workspace (with optional 1-based line range).".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative path to file inside the project" },
                    "start_line": { "type": "integer", "description": "Optional 1-based start line" },
                    "end_line": { "type": "integer", "description": "Optional 1-based end line" }
                },
                "required": ["path"]
            }),
            category: "read_files".into(),
            is_mutating: false,
        },
        BuiltinToolSpec {
            name: "project_search_files".into(),
            description: "Search for text across files in the active project workspace.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Text snippet to search for" },
                    "case_sensitive": { "type": "boolean", "description": "Case-sensitive match (default: false)" }
                },
                "required": ["query"]
            }),
            category: "read_files".into(),
            is_mutating: false,
        },
        BuiltinToolSpec {
            name: "project_write_file".into(),
            description: "Create a new file or overwrite an existing file inside the active project workspace.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative file path inside the project" },
                    "content": { "type": "string", "description": "Full text content to write" }
                },
                "required": ["path", "content"]
            }),
            category: "write_files".into(),
            is_mutating: true,
        },
        BuiltinToolSpec {
            name: "project_edit_file".into(),
            description: "Apply a targeted replacement inside an existing file in the active project workspace.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative file path inside the project" },
                    "old_text": { "type": "string", "description": "Exact existing text to replace" },
                    "new_text": { "type": "string", "description": "Replacement text" }
                },
                "required": ["path", "old_text", "new_text"]
            }),
            category: "write_files".into(),
            is_mutating: true,
        },
        BuiltinToolSpec {
            name: "project_create_dir".into(),
            description: "Create a directory (and missing parents) inside the active project workspace.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative directory path inside the project" }
                },
                "required": ["path"]
            }),
            category: "write_files".into(),
            is_mutating: true,
        },
        BuiltinToolSpec {
            name: "project_rename_path".into(),
            description: "Rename or move a file or folder inside the active project workspace.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "from_path": { "type": "string", "description": "Existing relative path" },
                    "to_path": { "type": "string", "description": "New relative path" }
                },
                "required": ["from_path", "to_path"]
            }),
            category: "write_files".into(),
            is_mutating: true,
        },
        BuiltinToolSpec {
            name: "project_delete_path".into(),
            description: "Delete a file or directory inside the active project workspace.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative path inside the project" }
                },
                "required": ["path"]
            }),
            category: "delete_files".into(),
            is_mutating: true,
        },
    ]
}

fn require_project_root(db: &Database, project_id: Option<&str>) -> AppResult<PathBuf> {
    let pid = project_id.ok_or_else(|| {
        AppError::PermissionDenied("No active project workspace is attached to this conversation".into())
    })?;
    let proj = db
        .get_project(pid)?
        .ok_or_else(|| AppError::NotFound("Attached project workspace not found".into()))?;
    Ok(PathBuf::from(proj.root_path))
}

fn describe_project_action(tool_name: &str, args: &serde_json::Value) -> String {
    let path = args
        .get("path")
        .or_else(|| args.get("from_path"))
        .and_then(|v| v.as_str())
        .unwrap_or("(workspace)");
    match tool_name {
        "project_write_file" => format!("Write file '{path}'"),
        "project_edit_file" => format!("Edit file '{path}'"),
        "project_create_dir" => format!("Create folder '{path}'"),
        "project_rename_path" => {
            let to = args.get("to_path").and_then(|v| v.as_str()).unwrap_or("");
            format!("Rename '{path}' -> '{to}'")
        }
        "project_delete_path" => format!("Delete '{path}'"),
        _ => format!("Run '{tool_name}' on '{path}'"),
    }
}

fn build_project_diff_preview(
    db: &Database,
    project_id: Option<&str>,
    tool_name: &str,
    args: &serde_json::Value,
) -> Option<String> {
    let root = require_project_root(db, project_id).ok()?;
    match tool_name {
        "project_write_file" => {
            let rel = args.get("path")?.as_str()?;
            let new_text = args.get("content")?.as_str()?;
            let (safe, norm_rel) = resolve_project_path(&root, rel).ok()?;
            let old_text = std::fs::read_to_string(&safe).unwrap_or_default();
            Some(compute_unified_diff(&norm_rel, &old_text, new_text))
        }
        "project_edit_file" => {
            let rel = args.get("path")?.as_str()?;
            let old_snippet = args.get("old_text")?.as_str()?;
            let new_snippet = args.get("new_text")?.as_str()?;
            let (safe, norm_rel) = resolve_project_path(&root, rel).ok()?;
            let current = std::fs::read_to_string(&safe).ok()?;
            if current.contains(old_snippet) {
                let updated = current.replacen(old_snippet, new_snippet, 1);
                Some(compute_unified_diff(&norm_rel, &current, &updated))
            } else {
                Some(format!(
                    "--- a/{norm_rel}\n+++ b/{norm_rel}\n(Note: old_text snippet not found verbatim)"
                ))
            }
        }
        "project_delete_path" => {
            let rel = args.get("path")?.as_str()?;
            let (safe, norm_rel) = resolve_project_path(&root, rel).ok()?;
            if safe.is_file() {
                let old_text = std::fs::read_to_string(&safe).unwrap_or_default();
                Some(compute_unified_diff(&norm_rel, &old_text, ""))
            } else {
                Some(format!("Delete directory: {norm_rel}/"))
            }
        }
        _ => None,
    }
}

fn execute_builtin_project_tool(
    db: &Database,
    project_id: Option<&str>,
    tool_name: &str,
    args: &serde_json::Value,
) -> AppResult<(serde_json::Value, Vec<String>)> {
    let root = require_project_root(db, project_id)?;

    match tool_name {
        "project_list_files" => {
            let dir_arg = args.get("directory").and_then(|v| v.as_str()).unwrap_or("");
            let recursive = args.get("recursive").and_then(|v| v.as_bool()).unwrap_or(false);
            let (target, _) = resolve_project_path(&root, dir_arg)?;
            if recursive {
                let tree = get_project_tree(&target, false, 6)?;
                Ok((serde_json::json!({ "tree": tree }), vec![]))
            } else {
                let tree = get_project_tree(&target, false, 0)?;
                let entries: Vec<_> = tree
                    .into_iter()
                    .map(|n| serde_json::json!({ "name": n.name, "relativePath": n.relative_path, "isDir": n.is_dir, "sizeBytes": n.size_bytes }))
                    .collect();
                Ok((serde_json::json!({ "entries": entries }), vec![]))
            }
        }
        "project_read_file" => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::Validation("Missing 'path' argument".into()))?;
            let (safe, rel) = resolve_project_path(&root, path)?;
            let raw = std::fs::read_to_string(&safe)
                .map_err(|e| AppError::NotFound(format!("Cannot read '{rel}': {e}")))?;
            let start = args.get("start_line").and_then(|v| v.as_u64()).map(|n| n.max(1) as usize);
            let end = args.get("end_line").and_then(|v| v.as_u64()).map(|n| n.max(1) as usize);
            let lines: Vec<&str> = raw.lines().collect();
            let total_lines = lines.len();
            let sliced = if start.is_some() || end.is_some() {
                let s = start.unwrap_or(1).saturating_sub(1).min(total_lines);
                let e = end.unwrap_or(total_lines).min(total_lines);
                lines[s..e.max(s)]
                    .iter()
                    .enumerate()
                    .map(|(i, l)| format!("{}: {}", s + i + 1, l))
                    .collect::<Vec<_>>()
                    .join("\n")
            } else if raw.len() > 80_000 {
                let truncated: String = raw.chars().take(80_000).collect();
                format!("{truncated}\n... (truncated, total {total_lines} lines)")
            } else {
                raw
            };
            Ok((
                serde_json::json!({ "path": rel, "totalLines": total_lines, "content": sliced }),
                vec![],
            ))
        }
        "project_search_files" => {
            let query = args
                .get("query")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::Validation("Missing 'query' argument".into()))?;
            let case_sensitive = args
                .get("case_sensitive")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let hits = search_project_files(&root, query, case_sensitive, 120)?;
            Ok((serde_json::json!({ "matches": hits }), vec![]))
        }
        "project_write_file" => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::Validation("Missing 'path' argument".into()))?;
            let content = args
                .get("content")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::Validation("Missing 'content' argument".into()))?;
            let (safe, rel) = resolve_project_path(&root, path)?;
            if let Some(parent) = safe.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&safe, content)?;
            Ok((
                serde_json::json!({ "ok": true, "path": rel, "bytesWritten": content.len() }),
                vec![rel],
            ))
        }
        "project_edit_file" => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::Validation("Missing 'path' argument".into()))?;
            let old_text = args
                .get("old_text")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::Validation("Missing 'old_text' argument".into()))?;
            let new_text = args
                .get("new_text")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::Validation("Missing 'new_text' argument".into()))?;
            let (safe, rel) = resolve_project_path(&root, path)?;
            let current = std::fs::read_to_string(&safe)
                .map_err(|e| AppError::NotFound(format!("Cannot read '{rel}': {e}")))?;
            if !current.contains(old_text) {
                return Err(AppError::Validation(format!(
                    "Could not find target text in '{rel}'"
                )));
            }
            let updated = current.replacen(old_text, new_text, 1);
            std::fs::write(&safe, &updated)?;
            Ok((
                serde_json::json!({ "ok": true, "path": rel }),
                vec![rel],
            ))
        }
        "project_create_dir" => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::Validation("Missing 'path' argument".into()))?;
            let (_, rel) = resolve_project_path(&root, path)?;
            create_project_dir(&root, &rel)?;
            Ok((serde_json::json!({ "ok": true, "path": rel }), vec![rel]))
        }
        "project_rename_path" => {
            let from_path = args
                .get("from_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::Validation("Missing 'from_path' argument".into()))?;
            let to_path = args
                .get("to_path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::Validation("Missing 'to_path' argument".into()))?;
            let (_, from_rel) = resolve_project_path(&root, from_path)?;
            let (_, to_rel) = resolve_project_path(&root, to_path)?;
            rename_project_entry(&root, &from_rel, &to_rel)?;
            Ok((
                serde_json::json!({ "ok": true, "from": from_rel, "to": to_rel }),
                vec![from_rel, to_rel],
            ))
        }
        "project_delete_path" => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::Validation("Missing 'path' argument".into()))?;
            let (safe, rel) = resolve_project_path(&root, path)?;
            if rel.is_empty() {
                return Err(AppError::PermissionDenied(
                    "Refusing to delete the project root directory itself".into(),
                ));
            }
            if safe.is_dir() {
                std::fs::remove_dir_all(&safe)?;
            } else {
                std::fs::remove_file(&safe)?;
            }
            Ok((serde_json::json!({ "ok": true, "deleted": rel }), vec![rel]))
        }
        other => Err(AppError::NotFound(format!("Unknown built-in tool: {other}"))),
    }
}

fn sanitize_tool_fn_name(server_id: &str, tool_name: &str, existing: &HashMap<String, McpTool>) -> String {
    let clean: String = tool_name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect();
    if !existing.contains_key(&clean) {
        return clean;
    }
    let short_srv: String = server_id.chars().take(6).collect();
    format!("{short_srv}__{clean}")
}

fn extract_affected_resources(args: &serde_json::Value, fallback: &str) -> Vec<String> {
    let mut out = Vec::new();
    for key in ["path", "from_path", "to_path", "file", "file_path", "directory", "url", "command", "uri"] {
        if let Some(val) = args.get(key).and_then(|v| v.as_str()) {
            out.push(val.to_string());
        }
    }
    if out.is_empty() {
        out.push(fallback.to_string());
    }
    out
}

fn enforce_agent_file_scope(
    db: &Database,
    agent: &AgentConfig,
    project_id: Option<&str>,
    args: &serde_json::Value,
) -> AppResult<()> {
    let mut path_values = Vec::new();
    for key in ["path", "from_path", "to_path", "file", "file_path", "directory", "target_path"] {
        if let Some(p) = args.get(key).and_then(|v| v.as_str()) {
            if !p.trim().is_empty() {
                path_values.push(p);
            }
        }
    }
    if path_values.is_empty() {
        return Ok(());
    }
    if agent.file_access_mode == "none" {
        return Err(AppError::PermissionDenied(format!(
            "Agent '{}' has file access set to 'none'",
            agent.name
        )));
    }

    let mut project_root: Option<PathBuf> = None;
    let mut roots = Vec::new();
    if let Some(pid) = project_id {
        if let Some(proj) = db.get_project(pid)? {
            if !proj.root_path.trim().is_empty() {
                let pr = PathBuf::from(&proj.root_path);
                project_root = Some(pr.clone());
                roots.push(pr);
            }
        }
    }
    if agent.file_access_mode == "allowlist" {
        for dir in &agent.allowed_directories {
            if !dir.trim().is_empty() {
                roots.push(PathBuf::from(dir));
            }
        }
    }

    if roots.is_empty() {
        return Err(AppError::PermissionDenied(
            "No authorized project or allowlisted directory is configured for file operations".into(),
        ));
    }

    for p in path_values {
        let candidate = if Path::new(p).is_absolute() {
            PathBuf::from(p)
        } else if let Some(ref pr) = project_root {
            pr.join(p.trim_start_matches(['/', '\\']))
        } else {
            PathBuf::from(p)
        };
        verify_path_within_roots(&candidate, &roots)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skills::import_local_skill_folder;
    use crate::storage::models::{AgentMemoryConfig, Conversation, McpServer};
    use axum::{routing::post, Json, Router};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tempfile::TempDir;
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn full_end_to_end_provider_mcp_skill_agent_approval_workflow() {
        let dir = TempDir::new().unwrap();

        // 1. Mock OpenAI-compatible API that issues 1 tool call then produces final answer
        let call_counter = Arc::new(AtomicUsize::new(0));
        let counter_clone = call_counter.clone();
        let ai_app = Router::new().route(
            "/v1/chat/completions",
            post(move |Json(body): Json<serde_json::Value>| {
                let c = counter_clone.clone();
                async move {
                    let step = c.fetch_add(1, Ordering::SeqCst);
                    if step == 0 {
                        // Verify skill instructions & tool schema reached the model
                        let sys = body["messages"][0]["content"].as_str().unwrap_or("");
                        assert!(sys.contains("Always multiply carefully"));
                        assert_eq!(body["tools"][0]["function"]["name"], "multiply");
                        Json(serde_json::json!({
                            "choices": [{
                                "message": {
                                    "role": "assistant",
                                    "content": "",
                                    "tool_calls": [{
                                        "id": "call_1",
                                        "type": "function",
                                        "function": {
                                            "name": "multiply",
                                            "arguments": "{\"a\": 6, \"b\": 7}"
                                        }
                                    }]
                                },
                                "finish_reason": "tool_calls"
                            }]
                        }))
                    } else {
                        // Verify tool result was passed back
                        let last = body["messages"].as_array().unwrap().last().unwrap();
                        assert_eq!(last["role"], "tool");
                        assert!(last["content"].as_str().unwrap().contains("42"));
                        Json(serde_json::json!({
                            "choices": [{
                                "message": {
                                    "role": "assistant",
                                    "content": "The verified product is 42."
                                },
                                "finish_reason": "stop"
                            }],
                            "usage": { "prompt_tokens": 20, "completion_tokens": 8, "total_tokens": 28 }
                        }))
                    }
                }
            }),
        );
        let ai_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let ai_addr = ai_listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(ai_listener, ai_app).await.unwrap() });

        // 2. Mock Streamable HTTP MCP server
        let mcp_app = Router::new().route(
            "/mcp",
            post(|Json(req): Json<serde_json::Value>| async move {
                let id = req.get("id").cloned().unwrap_or(serde_json::json!(null));
                let res = match req.get("method").and_then(|v| v.as_str()).unwrap_or("") {
                    "initialize" => serde_json::json!({
                        "protocolVersion": "2025-03-26",
                        "capabilities": { "tools": {} },
                        "serverInfo": { "name": "math-mcp", "version": "1.0" }
                    }),
                    "tools/list" => serde_json::json!({
                        "tools": [{
                            "name": "multiply",
                            "description": "Multiplies two integers",
                            "inputSchema": {
                                "type": "object",
                                "properties": { "a": {"type": "number"}, "b": {"type": "number"} },
                                "required": ["a", "b"]
                            }
                        }]
                    }),
                    "tools/call" => {
                        let a = req.pointer("/params/arguments/a").and_then(|v| v.as_i64()).unwrap_or(0);
                        let b = req.pointer("/params/arguments/b").and_then(|v| v.as_i64()).unwrap_or(0);
                        serde_json::json!({ "content": [{ "type": "text", "text": format!("{}", a * b) }] })
                    }
                    _ => serde_json::json!({}),
                };
                Json(serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": res }))
            }),
        );
        let mcp_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mcp_addr = mcp_listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(mcp_listener, mcp_app).await.unwrap() });

        // 3. Setup Runtime
        let redactor = Arc::new(SecretRedactor::new());
        let db = Arc::new(Database::open_in_memory(dir.path().to_path_buf(), redactor.clone()).unwrap());
        let creds = Arc::new(CredentialStore::new_in_memory(redactor.clone()));
        let mcp = Arc::new(McpHubManager::new(db.clone(), creds.clone(), redactor.clone()));
        let perms = Arc::new(PermissionManager::new(db.clone()));
        let runtime = Arc::new(AgentRuntime::new(
            db.clone(),
            creds.clone(),
            redactor,
            mcp.clone(),
            perms.clone(),
        ));

        let now = Utc::now().to_rfc3339();
        // Add provider
        creds.set_secret("provider:p1", "sk-test-123456").unwrap();
        db.upsert_provider(&AiProvider {
            id: "p1".into(),
            name: "Mock AI".into(),
            base_url: format!("http://{ai_addr}/v1"),
            model_id: "mock-model".into(),
            custom_headers: HashMap::new(),
            temperature: 0.2,
            top_p: 1.0,
            max_tokens: 512,
            timeout_secs: 15,
            streaming: false,
            default_system_prompt: String::new(),
            has_api_key: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        })
        .unwrap();

        // Connect MCP server & discover tools
        db.upsert_mcp_server(&McpServer {
            id: "m1".into(),
            name: "Math MCP".into(),
            description: "Math".into(),
            source: "local".into(),
            trust_level: "trusted".into(),
            transport: "streamable_http".into(),
            endpoint_or_command: format!("http://{mcp_addr}/mcp"),
            args: vec![],
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
            updated_at: now.clone(),
        })
        .unwrap();
        mcp.connect_server("m1").await.unwrap();

        // Install skill & assign to agent
        let sk_dir = dir.path().join("math-skill");
        std::fs::create_dir_all(&sk_dir).unwrap();
        std::fs::write(
            sk_dir.join("SKILL.md"),
            "---\nname: math-care\ndescription: Careful math\n---\nAlways multiply carefully.",
        )
        .unwrap();
        let skill = import_local_skill_folder(&db, &sk_dir).unwrap();

        // Create agent
        db.upsert_agent(&AgentConfig {
            id: "ag-1".into(),
            name: "Math Agent".into(),
            description: "Tests math".into(),
            avatar: "sparkles".into(),
            role: "Mathematician".into(),
            personality: "Accurate".into(),
            system_instructions: "Use multiply tool.".into(),
            provider_id: Some("p1".into()),
            model_id: Some("mock-model".into()),
            temperature: 0.2,
            max_tokens: 512,
            context_window: 8192,
            assigned_mcp_server_ids: vec!["m1".into()],
            enabled_tool_ids: vec!["m1:multiply".into()],
            assigned_skill_ids: vec![skill.id.clone()],
            file_access_mode: "none".into(),
            allowed_directories: vec![],
            internet_access: false,
            external_api_access: false,
            autonomous_execution: false,
            require_approval_sensitive: true,
            max_steps: 5,
            max_tool_calls: 5,
            max_runtime_secs: 30,
            retry_policy: "none".into(),
            error_strategy: "stop".into(),
            memory_config: AgentMemoryConfig::default(),
            is_template: false,
            created_at: now.clone(),
            updated_at: now.clone(),
        })
        .unwrap();

        // Create conversation
        db.upsert_conversation(&Conversation {
            id: "conv-1".into(),
            title: "Math Test".into(),
            mode: "agent".into(),
            execution_mode: "review".into(),
            active_provider_id: Some("p1".into()),
            active_model: Some("mock-model".into()),
            active_agent_id: Some("ag-1".into()),
            project_id: None,
            system_prompt_override: None,
            created_at: now.clone(),
            updated_at: now,
        })
        .unwrap();

        // Approve the tool call asynchronously when requested
        let perms_for_approve = perms.clone();
        let result = runtime
            .execute_chat_turn(
                "run-1".into(),
                "conv-1".into(),
                "What is 6 * 7?".into(),
                vec![],
                None,
                None,
                CancellationToken::new(),
                |_| {},
                move |req| {
                    let p = perms_for_approve.clone();
                    tokio::spawn(async move {
                        p.resolve_approval(
                            &req.id,
                            ApprovalDecision::AllowOnce,
                            req.agent_id.as_deref(),
                            &req.category,
                            "Math MCP:multiply",
                        )
                        .unwrap();
                    });
                },
            )
            .await
            .unwrap();

        assert_eq!(result.content, "The verified product is 42.");
        let saved_msgs = db.list_messages("conv-1").unwrap();
        assert_eq!(saved_msgs.len(), 4); // user, assistant(tool_call), tool(42), assistant(final)
    }

    #[tokio::test]
    async fn chat_falls_back_when_provider_id_is_stale() {
        let dir = TempDir::new().unwrap();
        let ai_app = Router::new().route(
            "/v1/chat/completions",
            post(|Json(body): Json<serde_json::Value>| async move {
                assert_eq!(body["model"], "litellm-model");
                Json(serde_json::json!({
                    "choices": [{
                        "message": { "role": "assistant", "content": "Hello from LiteLLM" },
                        "finish_reason": "stop"
                    }]
                }))
            }),
        );
        let ai_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let ai_addr = ai_listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(ai_listener, ai_app).await.unwrap();
        });

        let redactor = Arc::new(SecretRedactor::new());
        let db = Arc::new(Database::open_in_memory(dir.path().to_path_buf(), redactor.clone()).unwrap());
        let creds = Arc::new(CredentialStore::new_in_memory(redactor.clone()));
        let mcp = Arc::new(McpHubManager::new(db.clone(), creds.clone(), redactor.clone()));
        let perms = Arc::new(PermissionManager::new(db.clone()));
        let runtime = AgentRuntime::new(db.clone(), creds.clone(), redactor, mcp, perms);

        let now = Utc::now().to_rfc3339();
        db.upsert_provider(&AiProvider {
            id: "litellm-1".into(),
            name: "LiteLLM".into(),
            base_url: format!("http://{ai_addr}/v1"),
            model_id: "litellm-model".into(),
            custom_headers: HashMap::new(),
            temperature: 0.2,
            top_p: 1.0,
            max_tokens: 512,
            timeout_secs: 30,
            streaming: false,
            default_system_prompt: String::new(),
            has_api_key: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        })
        .unwrap();

        let mut settings = db.get_settings().unwrap();
        settings.ai.default_provider_id = Some("dbbfcd79-119d-4880-a26a-2e02bfc6bf59".into());
        db.save_settings(&settings).unwrap();

        db.upsert_conversation(&Conversation {
            id: "conv-stale".into(),
            title: "Stale chat".into(),
            mode: "direct".into(),
            execution_mode: "review".into(),
            active_provider_id: Some("dbbfcd79-119d-4880-a26a-2e02bfc6bf59".into()),
            active_model: Some("deleted-model".into()),
            active_agent_id: None,
            project_id: None,
            system_prompt_override: None,
            created_at: now.clone(),
            updated_at: now,
        })
        .unwrap();

        let msg = runtime
            .execute_chat_turn(
                "run-stale".into(),
                "conv-stale".into(),
                "Hi".into(),
                vec![],
                Some("dbbfcd79-119d-4880-a26a-2e02bfc6bf59".into()),
                None,
                CancellationToken::new(),
                |_| {},
                |_| {},
            )
            .await
            .unwrap();

        assert_eq!(msg.content, "Hello from LiteLLM");
    }

    #[tokio::test]
    async fn project_review_mode_asks_with_diff_and_turbo_mode_auto_executes() {
        let dir = TempDir::new().unwrap();
        let proj_dir = dir.path().join("my-project");
        std::fs::create_dir_all(proj_dir.join("src")).unwrap();
        std::fs::write(proj_dir.join("src/hello.txt"), "hello world\n").unwrap();

        let step_counter = Arc::new(AtomicUsize::new(0));
        let sc = step_counter.clone();
        let ai_app = Router::new().route(
            "/v1/chat/completions",
            post(move |Json(_body): Json<serde_json::Value>| {
                let c = sc.clone();
                async move {
                    let s = c.fetch_add(1, Ordering::SeqCst);
                    match s {
                        0 => Json(serde_json::json!({
                            "choices": [{
                                "message": {
                                    "role": "assistant",
                                    "content": "",
                                    "tool_calls": [{
                                        "id": "call_read",
                                        "type": "function",
                                        "function": {
                                            "name": "project_read_file",
                                            "arguments": "{\"path\":\"src/hello.txt\"}"
                                        }
                                    }]
                                },
                                "finish_reason": "tool_calls"
                            }]
                        })),
                        1 => Json(serde_json::json!({
                            "choices": [{
                                "message": {
                                    "role": "assistant",
                                    "content": "",
                                    "tool_calls": [{
                                        "id": "call_edit",
                                        "type": "function",
                                        "function": {
                                            "name": "project_edit_file",
                                            "arguments": "{\"path\":\"src/hello.txt\",\"old_text\":\"hello world\",\"new_text\":\"hello noctra\"}"
                                        }
                                    }]
                                },
                                "finish_reason": "tool_calls"
                            }]
                        })),
                        2 => Json(serde_json::json!({
                            "choices": [{
                                "message": { "role": "assistant", "content": "Review edit done." },
                                "finish_reason": "stop"
                            }]
                        })),
                        3 => Json(serde_json::json!({
                            "choices": [{
                                "message": {
                                    "role": "assistant",
                                    "content": "",
                                    "tool_calls": [{
                                        "id": "call_turbo_write",
                                        "type": "function",
                                        "function": {
                                            "name": "project_write_file",
                                            "arguments": "{\"path\":\"src/turbo.txt\",\"content\":\"auto written\"}"
                                        }
                                    }]
                                },
                                "finish_reason": "tool_calls"
                            }]
                        })),
                        _ => Json(serde_json::json!({
                            "choices": [{
                                "message": { "role": "assistant", "content": "Turbo write done." },
                                "finish_reason": "stop"
                            }]
                        })),
                    }
                }
            }),
        );
        let ai_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let ai_addr = ai_listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(ai_listener, ai_app).await.unwrap();
        });

        let redactor = Arc::new(SecretRedactor::new());
        let db = Arc::new(Database::open_in_memory(dir.path().to_path_buf(), redactor.clone()).unwrap());
        let creds = Arc::new(CredentialStore::new_in_memory(redactor.clone()));
        let mcp = Arc::new(McpHubManager::new(db.clone(), creds.clone(), redactor.clone()));
        let perms = Arc::new(PermissionManager::new(db.clone()));
        let runtime = Arc::new(AgentRuntime::new(
            db.clone(),
            creds,
            redactor,
            mcp,
            perms.clone(),
        ));

        let now = Utc::now().to_rfc3339();
        db.upsert_provider(&AiProvider {
            id: "p1".into(),
            name: "Mock".into(),
            base_url: format!("http://{ai_addr}/v1"),
            model_id: "m1".into(),
            custom_headers: HashMap::new(),
            temperature: 0.1,
            top_p: 1.0,
            max_tokens: 512,
            timeout_secs: 15,
            streaming: false,
            default_system_prompt: String::new(),
            has_api_key: false,
            created_at: now.clone(),
            updated_at: now.clone(),
        })
        .unwrap();

        let imported = crate::project_fs::import_project_folder(&db, &proj_dir, None).unwrap();

        // 1. Review mode: read_file auto-runs, edit_file asks user with diff_preview!
        db.upsert_conversation(&Conversation {
            id: "conv-review".into(),
            title: "Review Run".into(),
            mode: "agent".into(),
            execution_mode: "review".into(),
            active_provider_id: Some("p1".into()),
            active_model: Some("m1".into()),
            active_agent_id: None, // tests fallback to tpl-coding
            project_id: Some(imported.project.id.clone()),
            system_prompt_override: None,
            created_at: now.clone(),
            updated_at: now.clone(),
        })
        .unwrap();

        let approval_count_review = Arc::new(AtomicUsize::new(0));
        let acr = approval_count_review.clone();
        let perms_c = perms.clone();
        let msg_review = runtime
            .execute_chat_turn(
                "run-rev".into(),
                "conv-review".into(),
                "Update hello.txt".into(),
                vec![],
                None,
                None,
                CancellationToken::new(),
                |_| {},
                move |req| {
                    acr.fetch_add(1, Ordering::SeqCst);
                    let diff = req.diff_preview.clone().unwrap_or_default();
                    assert!(diff.contains("-hello world"));
                    assert!(diff.contains("+hello noctra"));
                    let p = perms_c.clone();
                    tokio::spawn(async move {
                        p.resolve_approval(
                            &req.id,
                            ApprovalDecision::AllowOnce,
                            req.agent_id.as_deref(),
                            &req.category,
                            "project:project_edit_file",
                        )
                        .unwrap();
                    });
                },
            )
            .await
            .unwrap();
        assert_eq!(msg_review.content, "Review edit done.");
        assert_eq!(approval_count_review.load(Ordering::SeqCst), 1);
        assert_eq!(
            std::fs::read_to_string(proj_dir.join("src/hello.txt")).unwrap(),
            "hello noctra\n"
        );

        // 2. Turbo mode: write_file executes automatically with 0 approval prompts
        db.upsert_conversation(&Conversation {
            id: "conv-turbo".into(),
            title: "Turbo Run".into(),
            mode: "agent".into(),
            execution_mode: "turbo".into(),
            active_provider_id: Some("p1".into()),
            active_model: Some("m1".into()),
            active_agent_id: None,
            project_id: Some(imported.project.id.clone()),
            system_prompt_override: None,
            created_at: now.clone(),
            updated_at: now,
        })
        .unwrap();

        let approval_count_turbo = Arc::new(AtomicUsize::new(0));
        let act = approval_count_turbo.clone();
        let msg_turbo = runtime
            .execute_chat_turn(
                "run-turbo".into(),
                "conv-turbo".into(),
                "Create turbo.txt".into(),
                vec![],
                None,
                None,
                CancellationToken::new(),
                |_| {},
                move |_req| {
                    act.fetch_add(1, Ordering::SeqCst);
                },
            )
            .await
            .unwrap();
        assert_eq!(msg_turbo.content, "Turbo write done.");
        assert_eq!(approval_count_turbo.load(Ordering::SeqCst), 0);
        assert_eq!(
            std::fs::read_to_string(proj_dir.join("src/turbo.txt")).unwrap(),
            "auto written"
        );
    }
}
