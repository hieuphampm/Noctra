use crate::error::{AppError, AppResult};
use crate::storage::models::{ApprovalRequest, PermissionRule};
use crate::storage::Database;
use chrono::Utc;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalDecision {
    AllowOnce,
    AllowSession,
    AllowAlways,
    Deny,
}

impl ApprovalDecision {
    pub fn from_str(s: &str) -> AppResult<Self> {
        match s {
            "allow_once" => Ok(Self::AllowOnce),
            "allow_session" => Ok(Self::AllowSession),
            "allow_always" => Ok(Self::AllowAlways),
            "deny" => Ok(Self::Deny),
            _ => Err(AppError::Validation(format!("Invalid approval decision: {s}"))),
        }
    }
}

pub struct PermissionManager {
    db: Arc<Database>,
    session_allows: Mutex<HashSet<(String, String, String)>>, // (agent_key, category, resource)
    pending_approvals: Mutex<HashMap<String, oneshot::Sender<ApprovalDecision>>>,
}

impl PermissionManager {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            db,
            session_allows: Mutex::new(HashSet::new()),
            pending_approvals: Mutex::new(HashMap::new()),
        }
    }

    pub fn clear_session_allows(&self) {
        if let Ok(mut guard) = self.session_allows.lock() {
            guard.clear();
        }
    }

    /// Evaluates effective permission mode ("always" | "session" | "deny" | "ask")
    /// following specificity: agent rule -> project rule -> global rule -> default setting.
    pub fn evaluate_mode(
        &self,
        agent_id: Option<&str>,
        project_id: Option<&str>,
        category: &str,
        resource: &str,
    ) -> AppResult<String> {
        let agent_key = agent_id.unwrap_or("*").to_string();
        if let Ok(guard) = self.session_allows.lock() {
            if guard.contains(&(agent_key.clone(), category.to_string(), resource.to_string()))
                || guard.contains(&(agent_key, category.to_string(), "*".to_string()))
            {
                return Ok("session".into());
            }
        }

        let rules = self.db.list_permission_rules()?;
        let matches_rule = |r: &PermissionRule, scope: &str, target: Option<&str>| -> bool {
            if r.scope != scope || r.category != category {
                return false;
            }
            if let Some(t) = target {
                if r.target_id.as_deref() != Some(t) {
                    return false;
                }
            }
            pattern_matches(&r.resource_pattern, resource)
        };

        if let Some(aid) = agent_id {
            if let Some(rule) = rules.iter().find(|r| matches_rule(r, "agent", Some(aid))) {
                return Ok(rule.mode.clone());
            }
        }
        if let Some(pid) = project_id {
            if let Some(rule) = rules.iter().find(|r| matches_rule(r, "project", Some(pid))) {
                return Ok(rule.mode.clone());
            }
        }
        if let Some(rule) = rules.iter().find(|r| matches_rule(r, "global", None)) {
            return Ok(rule.mode.clone());
        }

        let settings = self.db.get_settings()?;
        Ok(settings.security.default_permission_mode)
    }

    pub fn create_approval_ticket(
        &self,
        agent_id: Option<String>,
        agent_name: Option<String>,
        category: String,
        action_summary: String,
        reason: String,
        tool_name: String,
        affected_resources: Vec<String>,
        exact_payload: serde_json::Value,
        diff_preview: Option<String>,
    ) -> (ApprovalRequest, oneshot::Receiver<ApprovalDecision>) {
        let id = Uuid::new_v4().to_string();
        let req = ApprovalRequest {
            id: id.clone(),
            agent_id,
            agent_name,
            category,
            action_summary,
            reason,
            tool_name,
            affected_resources,
            exact_payload,
            diff_preview,
            created_at: Utc::now().to_rfc3339(),
        };
        let (tx, rx) = oneshot::channel();
        if let Ok(mut pending) = self.pending_approvals.lock() {
            pending.insert(id, tx);
        }
        (req, rx)
    }

    pub fn resolve_approval(
        &self,
        request_id: &str,
        decision: ApprovalDecision,
        agent_id: Option<&str>,
        category: &str,
        resource: &str,
    ) -> AppResult<()> {
        let sender = {
            let mut pending = self.pending_approvals.lock().unwrap();
            pending.remove(request_id)
        };

        match decision {
            ApprovalDecision::AllowSession => {
                let mut guard = self.session_allows.lock().unwrap();
                guard.insert((
                    agent_id.unwrap_or("*").to_string(),
                    category.to_string(),
                    resource.to_string(),
                ));
            }
            ApprovalDecision::AllowAlways => {
                let rule = PermissionRule {
                    id: Uuid::new_v4().to_string(),
                    scope: if agent_id.is_some() { "agent".into() } else { "global".into() },
                    target_id: agent_id.map(|s| s.to_string()),
                    category: category.to_string(),
                    resource_pattern: resource.to_string(),
                    mode: "always".into(),
                    created_at: Utc::now().to_rfc3339(),
                };
                self.db.upsert_permission_rule(&rule)?;
            }
            ApprovalDecision::Deny | ApprovalDecision::AllowOnce => {}
        }

        if let Some(tx) = sender {
            let _ = tx.send(decision);
            Ok(())
        } else {
            Err(AppError::NotFound(format!(
                "Approval request '{request_id}' not found or already resolved"
            )))
        }
    }
}

fn pattern_matches(pattern: &str, resource: &str) -> bool {
    if pattern == "*" || pattern == resource {
        return true;
    }
    if let Some(prefix) = pattern.strip_suffix('*') {
        return resource.starts_with(prefix);
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::redaction::SecretRedactor;
    use tempfile::TempDir;

    #[test]
    fn resolves_agent_over_global_and_persists_always_allow() {
        let dir = TempDir::new().unwrap();
        let db = Arc::new(Database::open_in_memory(dir.path().to_path_buf(), Arc::new(SecretRedactor::new())).unwrap());
        let mgr = PermissionManager::new(db.clone());

        assert_eq!(
            mgr.evaluate_mode(Some("agent-1"), None, "mcp_tools", "fs:read_file").unwrap(),
            "ask"
        );

        db.upsert_permission_rule(&PermissionRule {
            id: "r1".into(),
            scope: "global".into(),
            target_id: None,
            category: "mcp_tools".into(),
            resource_pattern: "*".into(),
            mode: "deny".into(),
            created_at: Utc::now().to_rfc3339(),
        })
        .unwrap();

        assert_eq!(
            mgr.evaluate_mode(Some("agent-1"), None, "mcp_tools", "fs:read_file").unwrap(),
            "deny"
        );

        db.upsert_permission_rule(&PermissionRule {
            id: "r2".into(),
            scope: "agent".into(),
            target_id: Some("agent-1".into()),
            category: "mcp_tools".into(),
            resource_pattern: "fs:*".into(),
            mode: "always".into(),
            created_at: Utc::now().to_rfc3339(),
        })
        .unwrap();

        assert_eq!(
            mgr.evaluate_mode(Some("agent-1"), None, "mcp_tools", "fs:read_file").unwrap(),
            "always"
        );
    }
}
