use crate::agents::AgentRuntime;
use crate::error::{AppError, AppResult};
use crate::permissions::ApprovalDecision;
use crate::storage::models::{
    ApprovalRequest, WorkflowDefinition, WorkflowEvent, WorkflowNode, WorkflowRunRecord,
};
use chrono::Utc;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::{Mutex, Notify};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

pub struct WorkflowControlHandle {
    pub cancel: CancellationToken,
    pub paused: std::sync::atomic::AtomicBool,
    pub resume_notify: Notify,
}

impl WorkflowControlHandle {
    pub fn new() -> Self {
        Self {
            cancel: CancellationToken::new(),
            paused: std::sync::atomic::AtomicBool::new(false),
            resume_notify: Notify::new(),
        }
    }
}

pub struct WorkflowEngine {
    runtime: Arc<AgentRuntime>,
    controllers: Mutex<HashMap<String, Arc<WorkflowControlHandle>>>,
}

impl WorkflowEngine {
    pub fn new(runtime: Arc<AgentRuntime>) -> Self {
        Self {
            runtime,
            controllers: Mutex::new(HashMap::new()),
        }
    }

    pub async fn pause_run(&self, run_id: &str) -> bool {
        if let Some(ctrl) = self.controllers.lock().await.get(run_id) {
            ctrl.paused.store(true, std::sync::atomic::Ordering::SeqCst);
            true
        } else {
            false
        }
    }

    pub async fn resume_run(&self, run_id: &str) -> bool {
        if let Some(ctrl) = self.controllers.lock().await.get(run_id) {
            ctrl.paused.store(false, std::sync::atomic::Ordering::SeqCst);
            ctrl.resume_notify.notify_waiters();
            true
        } else {
            false
        }
    }

    pub async fn cancel_run(&self, run_id: &str) -> bool {
        if let Some(ctrl) = self.controllers.lock().await.get(run_id) {
            ctrl.cancel.cancel();
            ctrl.resume_notify.notify_waiters();
            true
        } else {
            false
        }
    }

    pub async fn execute_workflow<FEmit, FApprove>(
        &self,
        workflow: WorkflowDefinition,
        initial_input: serde_json::Value,
        project_id: Option<String>,
        emit_run_update: FEmit,
        emit_approval: FApprove,
    ) -> AppResult<WorkflowRunRecord>
    where
        FEmit: Fn(WorkflowRunRecord) + Send + Sync + 'static,
        FApprove: Fn(ApprovalRequest) + Send + Sync + Clone + 'static,
    {
        let run_id = Uuid::new_v4().to_string();
        let ctrl = Arc::new(WorkflowControlHandle::new());
        self.controllers
            .lock()
            .await
            .insert(run_id.clone(), ctrl.clone());

        let res = self
            .run_inner(
                run_id.clone(),
                workflow,
                initial_input,
                project_id,
                ctrl,
                emit_run_update,
                emit_approval,
            )
            .await;

        self.controllers.lock().await.remove(&run_id);
        res
    }

    async fn run_inner<FEmit, FApprove>(
        &self,
        run_id: String,
        workflow: WorkflowDefinition,
        initial_input: serde_json::Value,
        project_id: Option<String>,
        ctrl: Arc<WorkflowControlHandle>,
        emit_run_update: FEmit,
        emit_approval: FApprove,
    ) -> AppResult<WorkflowRunRecord>
    where
        FEmit: Fn(WorkflowRunRecord) + Send + Sync + 'static,
        FApprove: Fn(ApprovalRequest) + Send + Sync + Clone + 'static,
    {
        let start_node = workflow
            .nodes
            .iter()
            .find(|n| n.node_type == "start")
            .or_else(|| workflow.nodes.first())
            .ok_or_else(|| AppError::Workflow("Workflow has no nodes".into()))?
            .clone();

        let node_map: HashMap<String, WorkflowNode> = workflow
            .nodes
            .iter()
            .map(|n| (n.id.clone(), n.clone()))
            .collect();

        let mut context = serde_json::json!({
            "input": initial_input,
            "steps": {},
            "lastOutput": serde_json::Value::Null
        });

        let mut run = WorkflowRunRecord {
            id: run_id.clone(),
            workflow_id: workflow.id.clone(),
            workflow_name: workflow.name.clone(),
            status: "running".into(),
            current_node_id: Some(start_node.id.clone()),
            context: context.clone(),
            events: vec![],
            started_at: Utc::now().to_rfc3339(),
            ended_at: None,
            error: None,
        };
        self.runtime.db.upsert_workflow_run(&run)?;
        emit_run_update(run.clone());

        let started_at = Instant::now();
        let mut total_tool_calls: usize = 0;
        let mut current_id: Option<String> = Some(start_node.id);
        let mut visited_count: HashMap<String, usize> = HashMap::new();

        while let Some(nid) = current_id {
            // Handle pause/cancel checkpoints cleanly
            if ctrl.cancel.is_cancelled() {
                run.status = "cancelled".into();
                run.ended_at = Some(Utc::now().to_rfc3339());
                self.runtime.db.upsert_workflow_run(&run)?;
                emit_run_update(run.clone());
                return Ok(run);
            }
            while ctrl.paused.load(std::sync::atomic::Ordering::SeqCst) {
                if run.status != "paused" {
                    run.status = "paused".into();
                    self.runtime.db.upsert_workflow_run(&run)?;
                    emit_run_update(run.clone());
                }
                ctrl.resume_notify.notified().await;
                if ctrl.cancel.is_cancelled() {
                    run.status = "cancelled".into();
                    run.ended_at = Some(Utc::now().to_rfc3339());
                    self.runtime.db.upsert_workflow_run(&run)?;
                    emit_run_update(run.clone());
                    return Ok(run);
                }
            }
            if run.status == "paused" {
                run.status = "running".into();
            }

            if started_at.elapsed().as_secs() > workflow.max_duration_secs.max(10) {
                return self.fail_run(
                    &mut run,
                    format!("Workflow exceeded max duration ({}s)", workflow.max_duration_secs),
                    &emit_run_update,
                );
            }

            let count = visited_count.entry(nid.clone()).or_insert(0);
            *count += 1;
            if *count > 25 {
                return self.fail_run(
                    &mut run,
                    format!("Cycle limit exceeded on node '{nid}'"),
                    &emit_run_update,
                );
            }

            let Some(node) = node_map.get(&nid) else {
                break;
            };
            run.current_node_id = Some(node.id.clone());

            let step_result = self
                .execute_node(
                    node,
                    &mut context,
                    &workflow,
                    project_id.as_deref(),
                    &mut total_tool_calls,
                    &ctrl.cancel,
                    emit_approval.clone(),
                )
                .await;

            match step_result {
                Ok((detail, output, branch_choice)) => {
                    context["steps"][&node.id] = output.clone();
                    if !output.is_null() {
                        context["lastOutput"] = output.clone();
                    }
                    run.context = context.clone();
                    run.events.push(WorkflowEvent {
                        timestamp: Utc::now().to_rfc3339(),
                        node_id: node.id.clone(),
                        node_label: node.label.clone(),
                        status: "completed".into(),
                        detail,
                        output: Some(output),
                    });
                    self.runtime.db.upsert_workflow_run(&run)?;
                    emit_run_update(run.clone());

                    if node.node_type == "end" || node.node_type == "output" && workflow.edges.iter().all(|e| e.source != node.id) {
                        current_id = None;
                    } else {
                        current_id = pick_next_node(&workflow, &node.id, branch_choice.as_deref());
                    }
                }
                Err(AppError::Cancelled) => {
                    run.status = "cancelled".into();
                    run.ended_at = Some(Utc::now().to_rfc3339());
                    self.runtime.db.upsert_workflow_run(&run)?;
                    emit_run_update(run.clone());
                    return Ok(run);
                }
                Err(e) => {
                    run.events.push(WorkflowEvent {
                        timestamp: Utc::now().to_rfc3339(),
                        node_id: node.id.clone(),
                        node_label: node.label.clone(),
                        status: "error".into(),
                        detail: e.to_string(),
                        output: None,
                    });
                    return self.fail_run(&mut run, e.to_string(), &emit_run_update);
                }
            }
        }

        run.status = "completed".into();
        run.current_node_id = None;
        run.ended_at = Some(Utc::now().to_rfc3339());
        self.runtime.db.upsert_workflow_run(&run)?;
        emit_run_update(run.clone());
        Ok(run)
    }

    fn fail_run<FEmit>(
        &self,
        run: &mut WorkflowRunRecord,
        err: String,
        emit_run_update: &FEmit,
    ) -> AppResult<WorkflowRunRecord>
    where
        FEmit: Fn(WorkflowRunRecord),
    {
        run.status = "failed".into();
        run.error = Some(err);
        run.ended_at = Some(Utc::now().to_rfc3339());
        self.runtime.db.upsert_workflow_run(run)?;
        emit_run_update(run.clone());
        Ok(run.clone())
    }

    async fn execute_node<FApprove>(
        &self,
        node: &WorkflowNode,
        context: &mut serde_json::Value,
        workflow: &WorkflowDefinition,
        project_id: Option<&str>,
        total_tool_calls: &mut usize,
        cancel: &CancellationToken,
        emit_approval: FApprove,
    ) -> AppResult<(String, serde_json::Value, Option<String>)>
    where
        FApprove: Fn(ApprovalRequest) + Send + Sync + Clone + 'static,
    {
        match node.node_type.as_str() {
            "start" => Ok(("Workflow started".into(), serde_json::json!({"started": true}), None)),
            "input" => {
                let key = node.config.get("key").and_then(|v| v.as_str()).unwrap_or("prompt");
                let default_val = node.config.get("defaultValue").cloned().unwrap_or(serde_json::json!(""));
                let val = context["input"].get(key).cloned().unwrap_or(default_val);
                Ok((format!("Loaded input '{key}'"), val, None))
            }
            "agent" => {
                let agent_id = node
                    .config
                    .get("agentId")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .ok_or_else(|| AppError::Workflow(format!("Agent node '{}' has no agentId configured", node.label)))?;
                let template = node
                    .config
                    .get("promptTemplate")
                    .and_then(|v| v.as_str())
                    .unwrap_or("{{lastOutput}}");
                let prompt = interpolate_template(template, context);
                let (output, tools_used) = self
                    .runtime
                    .run_agent_task(
                        agent_id,
                        &prompt,
                        project_id,
                        1,
                        workflow.max_agent_depth,
                        cancel.clone(),
                        emit_approval,
                    )
                    .await?;
                *total_tool_calls += tools_used;
                if *total_tool_calls > workflow.max_total_tool_calls as usize {
                    return Err(AppError::Workflow(format!(
                        "Workflow exceeded max total tool calls ({})",
                        workflow.max_total_tool_calls
                    )));
                }
                Ok((
                    format!("Agent completed ({tools_used} tool call(s))"),
                    serde_json::json!(output),
                    None,
                ))
            }
            "mcp_tool" => {
                *total_tool_calls += 1;
                if *total_tool_calls > workflow.max_total_tool_calls as usize {
                    return Err(AppError::Workflow("Workflow exceeded max total tool calls".into()));
                }
                let server_id = node
                    .config
                    .get("serverId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| AppError::Workflow("MCP tool node missing serverId".into()))?;
                let tool_name = node
                    .config
                    .get("toolName")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| AppError::Workflow("MCP tool node missing toolName".into()))?;
                let args_val = node.config.get("arguments").cloned().unwrap_or(serde_json::json!({}));
                let res = self.runtime.mcp.call_tool(server_id, tool_name, args_val).await?;
                Ok((format!("Called MCP tool '{tool_name}'"), res, None))
            }
            "skill" => {
                let skill_id = node
                    .config
                    .get("skillId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| AppError::Workflow("Skill node missing skillId".into()))?;
                let skill = self
                    .runtime
                    .db
                    .get_skill(skill_id)?
                    .ok_or_else(|| AppError::NotFound(format!("Skill '{skill_id}' not found")))?;
                Ok((
                    format!("Injected skill context '{}'", skill.name),
                    serde_json::json!({ "skill": skill.name, "instructions": skill.instructions_md }),
                    None,
                ))
            }
            "conditional" => {
                let contains = node
                    .config
                    .get("contains")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let last_str = match &context["lastOutput"] {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                let matched = !contains.is_empty()
                    && last_str
                        .to_ascii_lowercase()
                        .contains(&contains.to_ascii_lowercase());
                let branch = if matched { "true" } else { "false" };
                Ok((
                    format!("Condition evaluated to '{branch}' (contains '{contains}')"),
                    serde_json::json!({ "matched": matched }),
                    Some(branch.into()),
                ))
            }
            "approval" => {
                let message = node
                    .config
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Approve workflow continuation?");
                let (req, rx) = self.runtime.permissions.create_approval_ticket(
                    None,
                    Some(format!("Workflow: {}", workflow.name)),
                    "workflow_checkpoint".into(),
                    format!("Workflow checkpoint at '{}'", node.label),
                    message.to_string(),
                    node.label.clone(),
                    vec![workflow.name.clone()],
                    context["lastOutput"].clone(),
                    None,
                );
                emit_approval(req);
                let decision = tokio::select! {
                    _ = cancel.cancelled() => return Err(AppError::Cancelled),
                    res = rx => res.unwrap_or(ApprovalDecision::Deny),
                };
                if decision == ApprovalDecision::Deny {
                    return Err(AppError::PermissionDenied("Workflow approval checkpoint denied by user".into()));
                }
                Ok(("Checkpoint approved by user".into(), serde_json::json!({ "approved": true }), None))
            }
            "delay" => {
                let ms = node.config.get("delayMs").and_then(|v| v.as_u64()).unwrap_or(500).min(60_000);
                tokio::select! {
                    _ = cancel.cancelled() => return Err(AppError::Cancelled),
                    _ = tokio::time::sleep(std::time::Duration::from_millis(ms)) => {}
                }
                Ok((format!("Delayed {ms}ms"), serde_json::json!({ "delayedMs": ms }), None))
            }
            "output" => {
                let out = context["lastOutput"].clone();
                Ok(("Workflow output captured".into(), out, None))
            }
            "end" => Ok(("Workflow finished".into(), context["lastOutput"].clone(), None)),
            other => Err(AppError::Workflow(format!("Unknown node type: {other}"))),
        }
    }
}

pub fn validate_workflow_graph(wf: &WorkflowDefinition) -> Vec<String> {
    let mut errors = Vec::new();
    let ids: HashSet<&String> = wf.nodes.iter().map(|n| &n.id).collect();
    if !wf.nodes.iter().any(|n| n.node_type == "start") {
        errors.push("Workflow should contain a Start node".into());
    }
    for e in &wf.edges {
        if !ids.contains(&e.source) || !ids.contains(&e.target) {
            errors.push(format!("Edge '{}' references missing node", e.id));
        }
        if e.source == e.target {
            errors.push(format!("Edge '{}' cannot connect a node to itself", e.id));
        }
    }
    errors
}

fn pick_next_node(
    wf: &WorkflowDefinition,
    from_id: &str,
    branch_choice: Option<&str>,
) -> Option<String> {
    let outgoing: Vec<&crate::storage::models::WorkflowEdge> =
        wf.edges.iter().filter(|e| e.source == from_id).collect();
    if let Some(choice) = branch_choice {
        if let Some(edge) = outgoing
            .iter()
            .find(|e| e.condition.as_deref() == Some(choice))
        {
            return Some(edge.target.clone());
        }
    }
    outgoing.first().map(|e| e.target.clone())
}

fn interpolate_template(template: &str, context: &serde_json::Value) -> String {
    let last_str = match &context["lastOutput"] {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Null => String::new(),
        other => other.to_string(),
    };
    let input_str = match context["input"].get("prompt") {
        Some(serde_json::Value::String(s)) => s.clone(),
        _ => context["input"].to_string(),
    };
    template
        .replace("{{lastOutput}}", &last_str)
        .replace("{{input}}", &input_str)
        .replace("{{input.prompt}}", &input_str)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp::McpHubManager;
    use crate::permissions::PermissionManager;
    use crate::security::credentials::CredentialStore;
    use crate::security::redaction::SecretRedactor;
    use crate::storage::models::WorkflowEdge;
    use crate::storage::Database;
    use tempfile::TempDir;

    #[tokio::test]
    async fn executes_conditional_and_delay_workflow_nodes() {
        let dir = TempDir::new().unwrap();
        let redactor = Arc::new(SecretRedactor::new());
        let db = Arc::new(Database::open_in_memory(dir.path().to_path_buf(), redactor.clone()).unwrap());
        let creds = Arc::new(CredentialStore::new_in_memory(redactor.clone()));
        let mcp = Arc::new(McpHubManager::new(db.clone(), creds.clone(), redactor.clone()));
        let perms = Arc::new(PermissionManager::new(db.clone()));
        let runtime = Arc::new(AgentRuntime::new(db.clone(), creds, redactor, mcp, perms));
        let engine = WorkflowEngine::new(runtime);

        let now = Utc::now().to_rfc3339();
        let wf = WorkflowDefinition {
            id: "wf-1".into(),
            name: "Conditional Test".into(),
            description: "Tests branching".into(),
            nodes: vec![
                WorkflowNode { id: "n1".into(), node_type: "start".into(), label: "Start".into(), x: 0.0, y: 0.0, config: serde_json::json!({}) },
                WorkflowNode { id: "n2".into(), node_type: "input".into(), label: "Input".into(), x: 100.0, y: 0.0, config: serde_json::json!({"key": "prompt"}) },
                WorkflowNode { id: "n3".into(), node_type: "conditional".into(), label: "Check Urgent".into(), x: 200.0, y: 0.0, config: serde_json::json!({"contains": "urgent"}) },
                WorkflowNode { id: "n4".into(), node_type: "delay".into(), label: "Fast Path".into(), x: 300.0, y: -50.0, config: serde_json::json!({"delayMs": 10}) },
                WorkflowNode { id: "n5".into(), node_type: "end".into(), label: "End".into(), x: 400.0, y: 0.0, config: serde_json::json!({}) },
            ],
            edges: vec![
                WorkflowEdge { id: "e1".into(), source: "n1".into(), target: "n2".into(), condition: None },
                WorkflowEdge { id: "e2".into(), source: "n2".into(), target: "n3".into(), condition: None },
                WorkflowEdge { id: "e3".into(), source: "n3".into(), target: "n4".into(), condition: Some("true".into()) },
                WorkflowEdge { id: "e4".into(), source: "n4".into(), target: "n5".into(), condition: None },
            ],
            max_agent_depth: 2,
            max_total_tool_calls: 10,
            max_duration_secs: 30,
            created_at: now.clone(),
            updated_at: now,
        };

        let run = engine
            .execute_workflow(
                wf,
                serde_json::json!({ "prompt": "This is URGENT" }),
                None,
                |_| {},
                |_| {},
            )
            .await
            .unwrap();

        assert_eq!(run.status, "completed");
        assert_eq!(run.events.len(), 5);
        assert_eq!(run.events[2].status, "completed");
    }
}
