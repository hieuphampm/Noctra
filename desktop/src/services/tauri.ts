import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AgentConfig,
  AgentMemoryEntry,
  AiProvider,
  AiProviderInput,
  AppSettings,
  ApprovalRequest,
  AuditLogEntry,
  BrowserSessionSnapshot,
  ChatAttachment,
  ChatMessage,
  ChatStreamEvent,
  Conversation,
  ExecutionMode,
  GitHubSkillPreview,
  MarketplacePackageItem,
  MarketplaceSource,
  McpPrompt,
  McpResource,
  McpServer,
  McpServerInput,
  McpTool,
  MultiAgentStepResult,
  MultiAgentStepSpec,
  ParsedSkillMd,
  PermissionRule,
  ProjectFileContent,
  ProjectFileEntry,
  ProjectImportResult,
  ProjectMetadata,
  ProjectSearchMatch,
  ProjectTreeNode,
  ProjectWorkspace,
  ProviderTestResult,
  SkillRecord,
  SshExecResult,
  SshServer,
  SshServerInput,
  SshTestResult,
  WorkflowDefinition,
  WorkflowRunRecord,
} from "@/types/noctra";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function callBackend<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error(
      `Desktop runtime required for '${cmd}'. Launch via Tauri ('npm run tauri dev' or installed desktop app).`
    );
  }
  return invoke<T>(cmd, args);
}

export const api = {
  // Settings
  getSettings: () => callBackend<AppSettings>("get_settings"),
  saveSettings: (settings: AppSettings) => callBackend<void>("save_settings", { settings }),

  // Providers
  listProviders: () => callBackend<AiProvider[]>("list_providers"),
  saveProvider: (input: AiProviderInput) => callBackend<AiProvider>("save_provider", { input }),
  duplicateProvider: (id: string) => callBackend<AiProvider>("duplicate_provider", { id }),
  deleteProvider: (id: string) => callBackend<void>("delete_provider", { id }),
  testProviderConnection: (id: string) =>
    callBackend<ProviderTestResult>("test_provider_connection_cmd", { id }),
  fetchProviderModels: (id: string) => callBackend<string[]>("fetch_provider_models_cmd", { id }),

  // Conversations & Chat
  listConversations: () => callBackend<Conversation[]>("list_conversations"),
  createConversation: (params: {
    title?: string;
    mode?: "direct" | "agent";
    executionMode?: ExecutionMode;
    internetMode?: boolean;
    providerId?: string | null;
    model?: string | null;
    agentId?: string | null;
    projectId?: string | null;
    sshServerId?: string | null;
  }) => callBackend<Conversation>("create_conversation", params),
  updateConversation: (conversation: Conversation) =>
    callBackend<Conversation>("update_conversation", { conversation }),
  deleteConversation: (id: string) => callBackend<void>("delete_conversation", { id }),
  listMessages: (conversationId: string) =>
    callBackend<ChatMessage[]>("list_messages", { conversationId }),
  deleteMessage: (id: string) => callBackend<void>("delete_message", { id }),
  editAndTruncateMessage: (conversationId: string, messageId: string, newContent: string) =>
    callBackend<ChatMessage[]>("edit_and_truncate_message", {
      conversationId,
      messageId,
      newContent,
    }),
  loadAttachmentFromPath: (path: string) =>
    callBackend<ChatAttachment>("load_attachment_from_path", { path }),
  sendChatMessage: (params: {
    conversationId: string;
    content: string;
    attachments: ChatAttachment[];
    providerId?: string | null;
    model?: string | null;
  }) => callBackend<ChatMessage>("send_chat_message", params),
  cancelChatRun: (runId: string) => callBackend<boolean>("cancel_chat_run", { runId }),

  // MCP Hub
  listMcpServers: () => callBackend<McpServer[]>("list_mcp_servers"),
  saveMcpServer: (input: McpServerInput) => callBackend<McpServer>("save_mcp_server", { input }),
  deleteMcpServer: (id: string) => callBackend<void>("delete_mcp_server", { id }),
  connectMcpServer: (id: string) => callBackend<McpServer>("connect_mcp_server", { id }),
  disconnectMcpServer: (id: string) => callBackend<void>("disconnect_mcp_server", { id }),
  listMcpTools: () => callBackend<McpTool[]>("list_mcp_tools"),
  setMcpToolEnabled: (toolId: string, enabled: boolean) =>
    callBackend<void>("set_mcp_tool_enabled", { toolId, enabled }),
  testMcpTool: (serverId: string, toolName: string, args: Record<string, unknown>) =>
    callBackend<unknown>("test_mcp_tool", { serverId, toolName, arguments: args }),
  listMcpResources: (serverId?: string) =>
    callBackend<McpResource[]>("list_mcp_resources", { serverId }),
  readMcpResource: (serverId: string, uri: string) =>
    callBackend<unknown>("read_mcp_resource", { serverId, uri }),
  listMcpPrompts: (serverId?: string) => callBackend<McpPrompt[]>("list_mcp_prompts", { serverId }),
  getMcpPrompt: (serverId: string, name: string, args: Record<string, unknown>) =>
    callBackend<unknown>("get_mcp_prompt", { serverId, name, arguments: args }),

  // Marketplace
  listMarketplaceSources: () => callBackend<MarketplaceSource[]>("list_marketplace_sources"),
  saveMarketplaceSource: (source: MarketplaceSource) =>
    callBackend<MarketplaceSource>("save_marketplace_source", { source }),
  deleteMarketplaceSource: (id: string) => callBackend<void>("delete_marketplace_source", { id }),
  browseMarketplace: (sourceId: string, query?: string) =>
    callBackend<MarketplacePackageItem[]>("browse_marketplace", { sourceId, query }),

  // Skills Center
  listSkills: () => callBackend<SkillRecord[]>("list_skills"),
  parseSkillPreview: (rawSkillMd: string) =>
    callBackend<ParsedSkillMd>("parse_skill_preview", { rawSkillMd }),
  inspectGitHubSkills: (params: {
    repoUrl: string;
    branch?: string;
    subdirectory?: string;
    commitRef?: string;
  }) => callBackend<GitHubSkillPreview[]>("inspect_github_skills_cmd", params),
  installGitHubSkill: (preview: GitHubSkillPreview) =>
    callBackend<SkillRecord>("install_github_skill_cmd", { preview }),
  importLocalSkill: (path: string) => callBackend<SkillRecord>("import_local_skill_cmd", { path }),
  importZipSkill: (path: string) => callBackend<SkillRecord>("import_zip_skill_cmd", { path }),
  saveSkill: (id: string | null, rawSkillMd: string) =>
    callBackend<SkillRecord>("save_skill_cmd", { id, rawSkillMd }),
  toggleSkill: (id: string, enabled: boolean) =>
    callBackend<SkillRecord>("toggle_skill_cmd", { id, enabled }),
  deleteSkill: (id: string) => callBackend<void>("delete_skill_cmd", { id }),
  readSkillFile: (skillId: string, relativePath: string) =>
    callBackend<string>("read_skill_file_cmd", { skillId, relativePath }),
  writeSkillFile: (skillId: string, relativePath: string, content: string) =>
    callBackend<SkillRecord>("write_skill_file_cmd", { skillId, relativePath, content }),

  // Agents & Multi-Agent
  listAgents: () => callBackend<AgentConfig[]>("list_agents"),
  saveAgent: (agent: AgentConfig) => callBackend<AgentConfig>("save_agent", { agent }),
  duplicateAgent: (id: string) => callBackend<AgentConfig>("duplicate_agent", { id }),
  deleteAgent: (id: string) => callBackend<void>("delete_agent", { id }),
  listAgentMemories: (agentId: string, projectId?: string | null) =>
    callBackend<AgentMemoryEntry[]>("list_agent_memories", { agentId, projectId }),
  saveAgentMemory: (entry: AgentMemoryEntry) =>
    callBackend<AgentMemoryEntry>("save_agent_memory", { entry }),
  deleteAgentMemory: (id: string) => callBackend<void>("delete_agent_memory", { id }),
  runMultiAgentPipeline: (params: {
    initialPrompt: string;
    steps: MultiAgentStepSpec[];
    projectId?: string | null;
    maxAgentDepth?: number;
  }) => callBackend<MultiAgentStepResult[]>("run_multi_agent_pipeline", params),

  // Projects & Files
  listProjects: () => callBackend<ProjectWorkspace[]>("list_projects"),
  saveProject: (project: ProjectWorkspace) =>
    callBackend<ProjectWorkspace>("save_project", { project }),
  deleteProject: (id: string) => callBackend<void>("delete_project", { id }),
  listProjectFiles: (projectId: string, relativeDir?: string) =>
    callBackend<ProjectFileEntry[]>("list_project_files", { projectId, relativeDir }),
  readProjectFile: (projectId: string, relativePath: string) =>
    callBackend<string>("read_project_file", { projectId, relativePath }),
  writeProjectFile: (projectId: string, relativePath: string, content: string) =>
    callBackend<void>("write_project_file", { projectId, relativePath, content }),
  deleteProjectFile: (projectId: string, relativePath: string) =>
    callBackend<void>("delete_project_file", { projectId, relativePath }),
  importProjectFolder: (rootPath: string, name?: string | null) =>
    callBackend<ProjectImportResult>("import_project_folder_cmd", { rootPath, name }),
  inspectProjectMetadata: (projectId: string) =>
    callBackend<ProjectMetadata>("inspect_project_metadata_cmd", { projectId }),
  getProjectTree: (projectId: string, includeIgnored?: boolean) =>
    callBackend<ProjectTreeNode[]>("get_project_tree_cmd", { projectId, includeIgnored }),
  readProjectFileRich: (projectId: string, relativePath: string) =>
    callBackend<ProjectFileContent>("read_project_file_rich_cmd", { projectId, relativePath }),
  createProjectDir: (projectId: string, relativePath: string) =>
    callBackend<void>("create_project_dir_cmd", { projectId, relativePath }),
  renameProjectEntry: (projectId: string, fromRelativePath: string, toRelativePath: string) =>
    callBackend<void>("rename_project_entry_cmd", {
      projectId,
      fromRelativePath,
      toRelativePath,
    }),
  searchProjectFiles: (projectId: string, query: string, caseSensitive?: boolean) =>
    callBackend<ProjectSearchMatch[]>("search_project_files_cmd", {
      projectId,
      query,
      caseSensitive,
    }),

  // Workflows
  listWorkflows: () => callBackend<WorkflowDefinition[]>("list_workflows"),
  saveWorkflow: (workflow: WorkflowDefinition) =>
    callBackend<WorkflowDefinition>("save_workflow", { workflow }),
  deleteWorkflow: (id: string) => callBackend<void>("delete_workflow", { id }),
  validateWorkflow: (workflow: WorkflowDefinition) =>
    callBackend<string[]>("validate_workflow_cmd", { workflow }),
  runWorkflow: (workflowId: string, initialInput: Record<string, unknown>, projectId?: string | null) =>
    callBackend<WorkflowRunRecord>("run_workflow_cmd", { workflowId, initialInput, projectId }),
  pauseWorkflowRun: (runId: string) => callBackend<boolean>("pause_workflow_run", { runId }),
  resumeWorkflowRun: (runId: string) => callBackend<boolean>("resume_workflow_run", { runId }),
  cancelWorkflowRun: (runId: string) => callBackend<boolean>("cancel_workflow_run", { runId }),
  listWorkflowRuns: (workflowId?: string) =>
    callBackend<WorkflowRunRecord[]>("list_workflow_runs", { workflowId }),

  // Permissions & Approvals
  listPermissionRules: () => callBackend<PermissionRule[]>("list_permission_rules"),
  savePermissionRule: (rule: PermissionRule) =>
    callBackend<PermissionRule>("save_permission_rule", { rule }),
  deletePermissionRule: (id: string) => callBackend<void>("delete_permission_rule", { id }),
  resolveApprovalRequest: (params: {
    requestId: string;
    decision: "allow_once" | "allow_session" | "allow_always" | "deny";
    agentId: string | null;
    category: string;
    resource: string;
  }) => callBackend<void>("resolve_approval_request", params),

  // SSH Servers
  listSshServers: () => callBackend<SshServer[]>("list_ssh_servers"),
  saveSshServer: (input: SshServerInput) =>
    callBackend<SshServer>("save_ssh_server", { input }),
  deleteSshServer: (id: string) => callBackend<void>("delete_ssh_server", { id }),
  connectSshServer: (params: {
    id: string;
    password?: string | null;
    savePassword?: boolean;
    trustHostKey?: boolean;
  }) => callBackend<SshServer>("connect_ssh_server", params),
  disconnectSshServer: (id: string) => callBackend<void>("disconnect_ssh_server", { id }),
  testSshConnection: (params: {
    id: string;
    password?: string | null;
    trustHostKey?: boolean;
  }) => callBackend<SshTestResult>("test_ssh_connection", params),
  execSshCommand: (params: {
    id: string;
    command: string;
    workingDir?: string | null;
    timeoutSecs?: number;
  }) => callBackend<SshExecResult>("exec_ssh_command", params),
  resetSshHostFingerprint: (id: string) =>
    callBackend<SshServer>("reset_ssh_host_fingerprint", { id }),

  // Browser Automation (/browser)
  getBrowserSession: (conversationId: string) =>
    callBackend<BrowserSessionSnapshot | null>("get_browser_session", { conversationId }),
  listBrowserSessions: () =>
    callBackend<BrowserSessionSnapshot[]>("list_browser_sessions"),
  closeBrowserSession: (conversationId: string) =>
    callBackend<boolean>("close_browser_session", { conversationId }),

  // Logs & Backup
  listAuditLogs: (limit?: number) => callBackend<AuditLogEntry[]>("list_audit_logs", { limit }),
  clearAuditLogs: () => callBackend<void>("clear_audit_logs"),
  exportBackupJson: () => callBackend<Record<string, unknown>>("export_backup_json"),
  importBackupJson: (backup: Record<string, unknown>) =>
    callBackend<void>("import_backup_json", { backup }),
  wipeAllLocalData: () => callBackend<void>("wipe_all_local_data"),

  // Event Subscriptions
  onChatStream: async (cb: (ev: ChatStreamEvent) => void): Promise<UnlistenFn> => {
    if (!isTauriRuntime()) return () => {};
    return listen<ChatStreamEvent>("chat://stream", (e) => cb(e.payload));
  },
  onApprovalRequest: async (cb: (req: ApprovalRequest) => void): Promise<UnlistenFn> => {
    if (!isTauriRuntime()) return () => {};
    return listen<ApprovalRequest>("agent://approval-request", (e) => cb(e.payload));
  },
  onWorkflowRunUpdate: async (cb: (run: WorkflowRunRecord) => void): Promise<UnlistenFn> => {
    if (!isTauriRuntime()) return () => {};
    return listen<WorkflowRunRecord>("workflow://run-update", (e) => cb(e.payload));
  },
};
