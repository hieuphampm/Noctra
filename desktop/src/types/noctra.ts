export type NavSection =
  | "chat"
  | "providers"
  | "agents"
  | "mcp"
  | "skills"
  | "workflows"
  | "projects"
  | "files"
  | "marketplace"
  | "settings";

export interface AppSettings {
  general: {
    language: string;
    theme: string;
    accentColor: string;
    fontSize: number;
    sidebarCollapsed: boolean;
    inspectorVisible: boolean;
    restoreLastSession: boolean;
  };
  ai: {
    defaultProviderId: string | null;
    defaultModel: string | null;
    temperature: number;
    topP: number;
    maxTokens: number;
    streamResponses: boolean;
    contextMessageLimit: number;
  };
  mcp: {
    autoConnectOnStartup: boolean;
    healthCheckIntervalSecs: number;
    defaultTimeoutSecs: number;
    allowShellWrappers: boolean;
  };
  agents: {
    defaultMaxSteps: number;
    defaultMaxToolCalls: number;
    defaultMaxRuntimeSecs: number;
    requireApprovalForSensitive: boolean;
    maxAgentDepth: number;
    defaultExecutionMode?: ExecutionMode;
  };
  skills: {
    installDirectory: string;
    autoCheckUpdates: boolean;
    githubApiBase: string;
  };
  security: {
    credentialBackend: string;
    defaultPermissionMode: string;
    redactLogs: boolean;
    sandboxMode: boolean;
  };
  advanced: {
    developerMode: boolean;
    logRetentionDays: number;
    maxLogEntries: number;
    experimentalFeatures: boolean;
  };
  shortcuts: Record<string, string>;
}

export interface AiProvider {
  id: string;
  name: string;
  baseUrl: string;
  modelId: string;
  customHeaders: Record<string, string>;
  temperature: number;
  topP: number;
  maxTokens: number;
  timeoutSecs: number;
  streaming: boolean;
  defaultSystemPrompt: string;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiProviderInput {
  id?: string | null;
  name: string;
  baseUrl: string;
  apiKey?: string | null;
  clearApiKey?: boolean;
  modelId: string;
  customHeaders: Record<string, string>;
  temperature: number;
  topP: number;
  maxTokens: number;
  timeoutSecs: number;
  streaming: boolean;
  defaultSystemPrompt: string;
}

export interface ProviderTestResult {
  ok: boolean;
  latencyMs: number;
  modelsEndpointSupported: boolean;
  modelsFound: number;
  message: string;
}

export type ExecutionMode = "review" | "turbo";

export interface Conversation {
  id: string;
  title: string;
  mode: "direct" | "agent";
  executionMode: ExecutionMode;
  activeProviderId: string | null;
  activeModel: string | null;
  activeAgentId: string | null;
  projectId: string | null;
  systemPromptOverride: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: "image" | "text" | "pdf" | "binary";
  extractedText: string | null;
  dataUrl: string | null;
}

export interface ToolCallRecord {
  id: string;
  serverId: string | null;
  name: string;
  arguments: Record<string, unknown>;
  status: "pending_approval" | "running" | "completed" | "denied" | "error";
  result: unknown;
  error: string | null;
  durationMs: number | null;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  attachments: ChatAttachment[];
  toolCalls: ToolCallRecord[];
  toolCallId: string | null;
  tokenUsage: TokenUsage | null;
  createdAt: string;
}

export interface ChatStreamEvent {
  runId: string;
  conversationId: string;
  kind:
    | "delta"
    | "tool_call"
    | "tool_result"
    | "project_changed"
    | "status"
    | "done"
    | "error";
  text: string | null;
  toolCall: ToolCallRecord | null;
  message: ChatMessage | null;
  changedPaths?: string[] | null;
}

export interface McpServer {
  id: string;
  name: string;
  description: string;
  source: string;
  trustLevel: "trusted" | "verified" | "unverified";
  transport: "stdio" | "streamable_http";
  endpointOrCommand: string;
  args: string[];
  envKeys: string[];
  plainEnv: Record<string, string>;
  authType: "none" | "bearer" | "oauth" | "custom_header";
  authConfig: Record<string, unknown>;
  hasAuthSecret: boolean;
  autoReconnect: boolean;
  maxReconnects: number;
  enabled: boolean;
  status: "disconnected" | "connecting" | "connected" | "error";
  lastError: string | null;
  serverInfo: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface McpServerInput {
  id?: string | null;
  name: string;
  description: string;
  source: string;
  trustLevel: string;
  transport: "stdio" | "streamable_http";
  endpointOrCommand: string;
  args: string[];
  plainEnv: Record<string, string>;
  secretEnv: Record<string, string>;
  authType: string;
  authConfig: Record<string, unknown>;
  authSecret?: string | null;
  autoReconnect: boolean;
  maxReconnects: number;
  enabled: boolean;
}

export interface McpTool {
  id: string;
  serverId: string;
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown> | null;
  requiredPermissions: string[];
  enabled: boolean;
  available: boolean;
}

export interface McpResource {
  id: string;
  serverId: string;
  uri: string;
  name: string;
  description: string | null;
  mimeType: string | null;
}

export interface McpPrompt {
  id: string;
  serverId: string;
  name: string;
  description: string | null;
  arguments: unknown;
}

export interface SkillSupportingFile {
  relativePath: string;
  kind: string;
  sizeBytes: number;
}

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  sourceType: string;
  sourceUrl: string | null;
  branchOrTag: string | null;
  subdirectory: string | null;
  commitSha: string | null;
  version: string;
  localPath: string;
  enabled: boolean;
  trustLevel: string;
  frontmatter: Record<string, unknown>;
  instructionsMd: string;
  dependencies: string[];
  supportingFiles: SkillSupportingFile[];
  validationErrors: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ParsedSkillMd {
  name: string;
  description: string;
  category: string;
  version: string;
  dependencies: string[];
  frontmatter: Record<string, unknown>;
  instructionsMd: string;
  validationErrors: string[];
}

export interface GitHubSkillPreview {
  owner: string;
  repo: string;
  branch: string;
  commitSha: string | null;
  subdirectory: string;
  skillName: string;
  description: string;
  skillMdRaw: string;
  requiredFiles: string[];
  hasScripts: boolean;
  validationErrors: string[];
  trustWarning: string;
}

export interface AgentMemoryConfig {
  conversationMemory: boolean;
  agentLocalMemory: boolean;
  projectMemory: boolean;
  retentionMessages: number;
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  avatar: string;
  role: string;
  personality: string;
  systemInstructions: string;
  providerId: string | null;
  modelId: string | null;
  temperature: number;
  maxTokens: number;
  contextWindow: number;
  assignedMcpServerIds: string[];
  enabledToolIds: string[];
  assignedSkillIds: string[];
  fileAccessMode: "none" | "project_only" | "allowlist";
  allowedDirectories: string[];
  internetAccess: boolean;
  externalApiAccess: boolean;
  autonomousExecution: boolean;
  requireApprovalSensitive: boolean;
  maxSteps: number;
  maxToolCalls: number;
  maxRuntimeSecs: number;
  retryPolicy: "none" | "once" | "exponential";
  errorStrategy: "stop" | "continue" | "ask_user";
  memoryConfig: AgentMemoryConfig;
  isTemplate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMemoryEntry {
  id: string;
  agentId: string;
  projectId: string | null;
  scope: "agent" | "project";
  key: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface MultiAgentStepSpec {
  agentId: string;
  label: string;
  taskTemplate: string;
  parallelGroup: string | null;
}

export interface MultiAgentStepResult {
  agentId: string;
  agentName: string;
  label: string;
  output: string;
  toolCallsUsed: number;
  durationMs: number;
}

export interface ProjectWorkspace {
  id: string;
  name: string;
  description: string;
  rootPath: string;
  instructions: string;
  assignedAgentIds: string[];
  assignedSkillIds: string[];
  allowedToolIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFileEntry {
  name: string;
  relativePath: string;
  isDir: boolean;
  sizeBytes: number;
}

export interface ProjectTreeNode {
  name: string;
  relativePath: string;
  isDir: boolean;
  sizeBytes: number;
  children: ProjectTreeNode[] | null;
}

export interface ProjectMetadata {
  gitBranch: string | null;
  techStack: string[];
  fileCount: number;
  dirCount: number;
}

export interface ProjectImportResult {
  project: ProjectWorkspace;
  metadata: ProjectMetadata;
  reusedExisting: boolean;
}

export interface ProjectFileContent {
  relativePath: string;
  kind: "text" | "image" | "binary";
  content: string | null;
  dataUrl: string | null;
  sizeBytes: number;
  language: string;
}

export interface ProjectSearchMatch {
  relativePath: string;
  lineNumber: number;
  lineText: string;
}

export interface OpenEditorTab {
  projectId: string;
  relativePath: string;
  name: string;
  kind: "text" | "image" | "binary";
  content: string;
  savedContent: string;
  dataUrl: string | null;
  sizeBytes: number;
  language: string;
  aiModified?: boolean;
  targetLine?: number;
}

export interface WorkflowNode {
  id: string;
  nodeType:
    | "start"
    | "input"
    | "agent"
    | "mcp_tool"
    | "skill"
    | "conditional"
    | "approval"
    | "delay"
    | "output"
    | "end";
  label: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition: string | null;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  maxAgentDepth: number;
  maxTotalToolCalls: number;
  maxDurationSecs: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowEvent {
  timestamp: string;
  nodeId: string;
  nodeLabel: string;
  status: string;
  detail: string;
  output: unknown;
}

export interface WorkflowRunRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  status: "running" | "paused" | "completed" | "failed" | "cancelled";
  currentNodeId: string | null;
  context: Record<string, unknown>;
  events: WorkflowEvent[];
  startedAt: string;
  endedAt: string | null;
  error: string | null;
}

export interface PermissionRule {
  id: string;
  scope: "global" | "agent" | "project";
  targetId: string | null;
  category: string;
  resourcePattern: string;
  mode: "ask" | "session" | "always" | "deny";
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  agentId: string | null;
  agentName: string | null;
  category: string;
  actionSummary: string;
  reason: string;
  toolName: string;
  affectedResources: string[];
  exactPayload: unknown;
  diffPreview?: string | null;
  createdAt: string;
}

export interface MarketplaceSource {
  id: string;
  name: string;
  kind: "mcp" | "skills" | "templates";
  adapterType: "mcp_registry" | "github_repo" | "json_catalog";
  url: string;
  enabled: boolean;
  builtin: boolean;
  createdAt: string;
}

export interface MarketplacePackageItem {
  id: string;
  name: string;
  description: string;
  kind: string;
  category: string;
  sourceName: string;
  sourceUrl: string;
  repositoryUrl: string | null;
  version: string | null;
  trustLevel: "verified" | "unverified";
  transport: string | null;
  installHint: string;
  commandOrEndpoint: string | null;
  args: string[];
  compatibility: string;
}

export interface AuditLogEntry {
  id: string;
  source: string;
  level: "info" | "warn" | "error";
  message: string;
  detail: string | null;
  createdAt: string;
}
