pub mod agents;
pub mod ai;
pub mod commands;
pub mod error;
pub mod internet;
pub mod marketplace;
pub mod mcp;
pub mod permissions;
pub mod project_fs;
pub mod security;
pub mod skills;
pub mod ssh;
pub mod storage;
pub mod workflows;

use crate::agents::AgentRuntime;
use crate::commands::AppState;
use crate::mcp::McpHubManager;
use crate::permissions::PermissionManager;
use crate::security::credentials::CredentialStore;
use crate::security::redaction::SecretRedactor;
use crate::ssh::SshManager;
use crate::storage::Database;
use crate::workflows::WorkflowEngine;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("noctra-studio"));

            let redactor = Arc::new(SecretRedactor::new());
            let db = Arc::new(
                Database::open(data_dir, redactor.clone())
                    .expect("Failed to initialize NOCTRA STUDIO local database"),
            );
            let creds = Arc::new(CredentialStore::new_os(redactor.clone()));
            let mcp = Arc::new(McpHubManager::new(db.clone(), creds.clone(), redactor.clone()));
            let ssh = Arc::new(SshManager::new(db.clone(), creds.clone(), redactor.clone()));
            let permissions = Arc::new(PermissionManager::new(db.clone()));
            let runtime = Arc::new(AgentRuntime::new(
                db.clone(),
                creds.clone(),
                redactor.clone(),
                mcp.clone(),
                ssh.clone(),
                permissions.clone(),
            ));
            let workflows = Arc::new(WorkflowEngine::new(runtime.clone()));

            // Periodic MCP health monitor respecting user settings
            let mcp_health = mcp.clone();
            let db_health = db.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    let interval = db_health
                        .get_settings()
                        .map(|s| s.mcp.health_check_interval_secs.max(10))
                        .unwrap_or(30);
                    tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
                    let _ = mcp_health.health_check_all().await;
                }
            });

            app.manage(AppState {
                db,
                creds,
                redactor,
                mcp,
                ssh,
                permissions,
                runtime,
                workflows,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::list_providers,
            commands::save_provider,
            commands::duplicate_provider,
            commands::delete_provider,
            commands::test_provider_connection_cmd,
            commands::fetch_provider_models_cmd,
            commands::list_conversations,
            commands::create_conversation,
            commands::update_conversation,
            commands::delete_conversation,
            commands::list_messages,
            commands::delete_message,
            commands::edit_and_truncate_message,
            commands::load_attachment_from_path,
            commands::send_chat_message,
            commands::cancel_chat_run,
            commands::list_mcp_servers,
            commands::save_mcp_server,
            commands::delete_mcp_server,
            commands::connect_mcp_server,
            commands::disconnect_mcp_server,
            commands::list_mcp_tools,
            commands::set_mcp_tool_enabled,
            commands::test_mcp_tool,
            commands::list_mcp_resources,
            commands::read_mcp_resource,
            commands::list_mcp_prompts,
            commands::get_mcp_prompt,
            commands::list_marketplace_sources,
            commands::save_marketplace_source,
            commands::delete_marketplace_source,
            commands::browse_marketplace,
            commands::list_skills,
            commands::parse_skill_preview,
            commands::inspect_github_skills_cmd,
            commands::install_github_skill_cmd,
            commands::import_local_skill_cmd,
            commands::import_zip_skill_cmd,
            commands::save_skill_cmd,
            commands::toggle_skill_cmd,
            commands::delete_skill_cmd,
            commands::read_skill_file_cmd,
            commands::write_skill_file_cmd,
            commands::list_agents,
            commands::save_agent,
            commands::duplicate_agent,
            commands::delete_agent,
            commands::list_agent_memories,
            commands::save_agent_memory,
            commands::delete_agent_memory,
            commands::run_multi_agent_pipeline,
            commands::list_projects,
            commands::save_project,
            commands::delete_project,
            commands::list_project_files,
            commands::read_project_file,
            commands::write_project_file,
            commands::delete_project_file,
            commands::import_project_folder_cmd,
            commands::inspect_project_metadata_cmd,
            commands::get_project_tree_cmd,
            commands::read_project_file_rich_cmd,
            commands::create_project_dir_cmd,
            commands::rename_project_entry_cmd,
            commands::search_project_files_cmd,
            commands::list_workflows,
            commands::save_workflow,
            commands::delete_workflow,
            commands::validate_workflow_cmd,
            commands::run_workflow_cmd,
            commands::pause_workflow_run,
            commands::resume_workflow_run,
            commands::cancel_workflow_run,
            commands::list_workflow_runs,
            commands::list_permission_rules,
            commands::save_permission_rule,
            commands::delete_permission_rule,
            commands::resolve_approval_request,
            commands::list_ssh_servers,
            commands::save_ssh_server,
            commands::delete_ssh_server,
            commands::connect_ssh_server,
            commands::disconnect_ssh_server,
            commands::test_ssh_connection,
            commands::exec_ssh_command,
            commands::reset_ssh_host_fingerprint,
            commands::list_audit_logs,
            commands::clear_audit_logs,
            commands::export_backup_json,
            commands::import_backup_json,
            commands::wipe_all_local_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NOCTRA STUDIO");
}
