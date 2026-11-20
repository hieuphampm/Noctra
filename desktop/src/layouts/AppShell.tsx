import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FolderKanban,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Globe,
  MessageSquare,
  MessageSquarePlus,
  PanelRightClose,
  PanelRightOpen,
  Plug,
  Search,
  Server,
  Settings,
  Shield,
  Sparkles,
  Store,
  Terminal,
  Trash2,
} from "lucide-react";
import { api, isTauriRuntime } from "@/services/tauri";
import { useAppStore } from "@/stores/appStore";
import { normalizeLanguage, useI18n } from "@/i18n";
import { pickAndImportProjectFolder } from "@/utils/importProject";
import type { NavSection } from "@/types/noctra";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatView } from "@/features/chat/ChatView";
import { ProvidersView } from "@/features/providers/ProvidersView";
import { AgentsView } from "@/features/agents/AgentsView";
import { McpHubView } from "@/features/mcp/McpHubView";
import { SshServersView } from "@/features/ssh/SshServersView";
import { SkillsCenterView } from "@/features/skills/SkillsCenterView";
import { WorkflowBuilderView } from "@/features/workflows/WorkflowBuilderView";
import { ProjectsFilesView } from "@/features/projects/ProjectsFilesView";
import { MarketplaceView } from "@/features/marketplace/MarketplaceView";
import { SettingsView } from "@/features/settings/SettingsView";
import { ApprovalModal } from "@/components/ApprovalModal";
import { CommandPalette } from "@/components/CommandPalette";
import { DevConsoleDrawer } from "@/components/DevConsoleDrawer";
import { ProviderPickerModal } from "@/components/ProviderPickerModal";

export function AppShell() {
  const qc = useQueryClient();
  const { t, setLanguage } = useI18n();
  const activeSection = useAppStore((s) => s.activeSection);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const activeConvId = useAppStore((s) => s.activeConversationId);
  const setActiveConvId = useAppStore((s) => s.setActiveConversationId);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth);
  const inspectorVisible = useAppStore((s) => s.inspectorVisible);
  const setInspectorVisible = useAppStore((s) => s.setInspectorVisible);
  const inspectorWidth = useAppStore((s) => s.inspectorWidth);
  const setInspectorWidth = useAppStore((s) => s.setInspectorWidth);
  const devConsoleOpen = useAppStore((s) => s.devConsoleOpen);
  const setDevConsoleOpen = useAppStore((s) => s.setDevConsoleOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const convSearch = useAppStore((s) => s.conversationSearch);
  const setConvSearch = useAppStore((s) => s.setConversationSearch);
  const runningTasks = useAppStore((s) => s.runningTaskCount);
  const lastTokenUsage = useAppStore((s) => s.lastTokenUsage);

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: api.listConversations,
    enabled: isTauriRuntime(),
  });
  const { data: providers = [] } = useQuery({
    queryKey: ["providers"],
    queryFn: api.listProviders,
    enabled: isTauriRuntime(),
  });
  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: api.listAgents,
    enabled: isTauriRuntime(),
  });
  const { data: mcpServers = [] } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: api.listMcpServers,
    enabled: isTauriRuntime(),
  });
  const { data: sshServers = [] } = useQuery({
    queryKey: ["ssh-servers"],
    queryFn: api.listSshServers,
    enabled: isTauriRuntime(),
  });
  const { data: skills = [] } = useQuery({
    queryKey: ["skills"],
    queryFn: api.listSkills,
    enabled: isTauriRuntime(),
  });
  const { data: appSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
    enabled: isTauriRuntime(),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
    enabled: isTauriRuntime(),
  });

  React.useEffect(() => {
    if (appSettings?.general?.language) {
      setLanguage(normalizeLanguage(appSettings.general.language));
    }
    if (appSettings?.agents?.defaultExecutionMode) {
      useAppStore
        .getState()
        .setPreferredExecutionMode(appSettings.agents.defaultExecutionMode);
    }
    if (typeof appSettings?.internet?.defaultEnabled === "boolean") {
      useAppStore
        .getState()
        .setPreferredInternetMode(appSettings.internet.defaultEnabled);
    }
    if (appSettings?.ai?.defaultProviderId && !useAppStore.getState().preferredProviderId) {
      useAppStore
        .getState()
        .setPreferredProviderId(appSettings.ai.defaultProviderId);
    }
  }, [
    appSettings?.general?.language,
    appSettings?.agents?.defaultExecutionMode,
    appSettings?.internet?.defaultEnabled,
    appSettings?.ai?.defaultProviderId,
    setLanguage,
  ]);

  // Subscribe to backend streaming, approval requests & workflow updates
  React.useEffect(() => {
    const cleanups: Array<() => void> = [];
    api
      .onChatStream((ev) => {
        const store = useAppStore.getState();
        store.setActiveChatRunId(ev.runId);
        if (ev.kind === "delta" && ev.text) {
          store.appendStreamingText(ev.text);
        } else if (
          (ev.kind === "tool_call" || ev.kind === "tool_result") &&
          ev.toolCall
        ) {
          store.upsertStreamingToolCall(ev.toolCall);
        } else if (ev.kind === "project_changed" && ev.changedPaths?.length) {
          store.addAiChangedPaths(ev.changedPaths);
          qc.invalidateQueries({ queryKey: ["project-tree"] });
          qc.invalidateQueries({ queryKey: ["project-metadata"] });
          const pid = store.activeProjectId;
          if (pid) {
            for (const rel of ev.changedPaths) {
              const hasOpenTab = store.openEditorTabs.some(
                (t) => t.projectId === pid && t.relativePath === rel
              );
              if (hasOpenTab) {
                api
                  .readProjectFileRich(pid, rel)
                  .then((rich) => {
                    if (rich.kind === "text") {
                      useAppStore
                        .getState()
                        .refreshEditorTabFromDisk(pid, rel, rich.content ?? "");
                    }
                  })
                  .catch(() => {});
              }
            }
          }
        } else if (ev.kind === "done") {
          store.clearStreamingState();
        }
      })
      .then((u) => cleanups.push(u));

    api
      .onApprovalRequest((req) => {
        useAppStore.getState().pushApprovalRequest(req);
      })
      .then((u) => cleanups.push(u));

    return () => {
      cleanups.forEach((u) => u());
    };
  }, []);

  const handleNewChat = React.useCallback(async () => {
    if (!isTauriRuntime()) {
      setActiveSection("chat");
      return;
    }
    const prefProvId = useAppStore.getState().preferredProviderId;
    const chosenProv =
      providers.find((p) => p.id === prefProvId) ?? providers[0] ?? null;
    const created = await api.createConversation({
      title: "New Conversation",
      mode: "direct",
      executionMode: useAppStore.getState().preferredExecutionMode,
      internetMode: useAppStore.getState().preferredInternetMode,
      providerId: chosenProv?.id ?? null,
      model: chosenProv?.modelId ?? null,
    });
    await qc.invalidateQueries({ queryKey: ["conversations"] });
    setActiveConvId(created.id);
    setActiveSection("chat");
  }, [providers, qc, setActiveConvId, setActiveSection]);

  // Global keyboard productivity shortcuts
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "k" || key === "p") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if (key === "n" && e.shiftKey) {
        e.preventDefault();
        setActiveSection("agents");
      } else if (key === "n") {
        e.preventDefault();
        handleNewChat();
      } else if (key === ",") {
        e.preventDefault();
        setActiveSection("settings");
      } else if (key === "m" && e.shiftKey) {
        e.preventDefault();
        setActiveSection("mcp");
      } else if (key === "s" && e.shiftKey) {
        e.preventDefault();
        setActiveSection("skills");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNewChat, setActiveSection, setCommandPaletteOpen]);

  const startResizeLeft = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (me: MouseEvent) => setSidebarWidth(startW + (me.clientX - startX));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startResizeRight = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = inspectorWidth;
    const onMove = (me: MouseEvent) => setInspectorWidth(startW - (me.clientX - startX));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const preferredExecutionMode = useAppStore((s) => s.preferredExecutionMode);
  const preferredInternetMode = useAppStore((s) => s.preferredInternetMode);
  const preferredProviderId = useAppStore((s) => s.preferredProviderId);
  const openProviderPicker = useAppStore((s) => s.openProviderPicker);
  const setSettingsSection = useAppStore((s) => s.setSettingsSection);
  const activeProject =
    projects.find((p) => p.id === (activeConv?.projectId ?? activeProjectId)) ?? null;
  const activeExecMode = activeConv?.executionMode ?? preferredExecutionMode;
  const activeInternetMode = activeConv?.internetMode ?? preferredInternetMode;
  const activeProvider =
    providers.find((p) => p.id === activeConv?.activeProviderId) ??
    providers.find((p) => p.id === preferredProviderId) ??
    providers[0];
  const activeAgent = agents.find((a) => a.id === activeConv?.activeAgentId);
  const connectedMcp = mcpServers.filter((s) => s.status === "connected");
  const connectedSsh = sshServers.filter((s) => s.status === "connected");
  const enabledSkills = skills.filter((s) => s.enabled);

  const navItems: Array<{
    id: NavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "chat", label: t("nav.chat"), icon: MessageSquare },
    { id: "agents", label: t("nav.agents"), icon: Bot },
    { id: "mcp", label: t("nav.mcp"), icon: Plug },
    { id: "ssh", label: t("nav.ssh"), icon: Server },
    { id: "skills", label: t("nav.skills"), icon: Sparkles },
    { id: "workflows", label: t("nav.workflows"), icon: GitBranch },
    { id: "projects", label: t("nav.projects"), icon: FolderKanban },
    { id: "files", label: t("nav.files"), icon: FolderOpen },
    { id: "marketplace", label: t("nav.marketplace"), icon: Store },
    { id: "providers", label: t("nav.providers"), icon: Cpu },
    { id: "settings", label: t("nav.settings"), icon: Settings },
  ];

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(convSearch.toLowerCase())
  );

  const isLocalEndpoint =
    activeProvider?.baseUrl.includes("localhost") ||
    activeProvider?.baseUrl.includes("127.0.0.1");

  return (
    <div className="flex h-screen w-screen flex-col bg-[#090B10] text-[#F3F4F8]">
      {/* Main 3-Pane Workspace */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar */}
        <aside
          style={{ width: sidebarCollapsed ? 56 : sidebarWidth }}
          className="relative flex shrink-0 flex-col border-r border-[#252B3A] bg-[#0D1018] transition-[width] duration-150 select-none"
        >
          {/* Logo Header */}
          <div
            className={`flex items-center border-b border-[#252B3A] px-3 py-3 ${
              sidebarCollapsed ? "justify-center" : "justify-between"
            }`}
          >
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#A78BFA] to-[#67DDF2] text-[#090B10] font-bold text-xs">
                  N
                </div>
                <div className="truncate">
                  <div className="text-xs font-bold tracking-wider text-[#F3F4F8]">
                    NOCTRA STUDIO
                  </div>
                  <div className="text-[9px] text-[#9399AA] tracking-wide truncate">
                    {t("app.tagline")}
                  </div>
                </div>
              </div>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="rounded-lg p-1 text-[#9399AA] hover:bg-[#191E2C] hover:text-[#F3F4F8] cursor-pointer"
              title={t("app.toggleSidebar")}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* New Chat & Import Folder Actions */}
          <div className="p-2.5 space-y-1.5">
            <Button
              onClick={handleNewChat}
              className={sidebarCollapsed ? "w-full px-0" : "w-full justify-start"}
              title={`${t("app.newChat")} (Ctrl+N)`}
            >
              <MessageSquarePlus className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span>{t("app.newChat")}</span>}
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                if (!isTauriRuntime()) {
                  setActiveSection("files");
                  return;
                }
                await pickAndImportProjectFolder({
                  qc,
                  activeConv,
                  providers,
                  agents,
                  openInChatSplit: true,
                });
              }}
              className={sidebarCollapsed ? "w-full px-0" : "w-full justify-start"}
              title={t("projects.importFolder")}
            >
              <FolderPlus className="h-4 w-4 shrink-0 text-[#67DDF2]" />
              {!sidebarCollapsed && (
                <span className="truncate">
                  {activeProject ? activeProject.name : t("projects.importFolder")}
                </span>
              )}
            </Button>
          </div>

          {/* Primary Navigation */}
          <nav className="px-2 space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  title={item.label}
                  className={`flex w-full items-center rounded-lg py-1.5 text-xs transition-colors cursor-pointer ${
                    sidebarCollapsed ? "justify-center px-0" : "gap-2.5 px-2.5"
                  } ${
                    active
                      ? "bg-[#191E2C] text-[#A78BFA] font-medium"
                      : "text-[#9399AA] hover:bg-[#121622] hover:text-[#F3F4F8]"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </nav>

          {/* Searchable Conversations List */}
          {!sidebarCollapsed && (
            <div className="mt-3 flex flex-1 flex-col overflow-hidden border-t border-[#252B3A]">
              <div className="p-2.5">
                <div className="relative">
                  <Search className="h-3 w-3 text-[#9399AA] absolute left-2.5 top-2.5" />
                  <input
                    value={convSearch}
                    onChange={(e) => setConvSearch(e.target.value)}
                    placeholder={t("app.searchChats")}
                    className="h-7 w-full rounded-lg border border-[#252B3A] bg-[#090B10] pl-7 pr-2 text-[11px] text-[#F3F4F8] placeholder:text-[#9399AA]/60 focus:border-[#A78BFA]/60 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
                {filteredConversations.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setActiveConvId(c.id);
                      setActiveSection("chat");
                    }}
                    className={`group flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] cursor-pointer ${
                      activeConvId === c.id && activeSection === "chat"
                        ? "bg-[#191E2C] text-[#F3F4F8]"
                        : "text-[#9399AA] hover:bg-[#121622] hover:text-[#F3F4F8]"
                    }`}
                  >
                    <span className="truncate">{c.title}</span>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await api.deleteConversation(c.id);
                        if (activeConvId === c.id) setActiveConvId(null);
                        qc.invalidateQueries({ queryKey: ["conversations"] });
                      }}
                      className="opacity-0 group-hover:opacity-100 text-[#9399AA] hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resize Handle */}
          {!sidebarCollapsed && (
            <div
              onMouseDown={startResizeLeft}
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#A78BFA]/50"
            />
          )}
        </aside>

        {/* Center Workspace */}
        <main className="flex-1 min-w-0 overflow-hidden bg-[#090B10] flex flex-col">
          {!isTauriRuntime() && (
            <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-[11px] text-amber-300">
              {t("app.browserPreviewBanner")}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeSection === "chat" && <ChatView />}
            {activeSection === "providers" && <ProvidersView />}
            {activeSection === "agents" && <AgentsView />}
            {activeSection === "mcp" && <McpHubView />}
            {activeSection === "ssh" && <SshServersView />}
            {activeSection === "skills" && <SkillsCenterView />}
            {activeSection === "workflows" && <WorkflowBuilderView />}
            {activeSection === "projects" && <ProjectsFilesView initialTab="projects" />}
            {activeSection === "files" && <ProjectsFilesView initialTab="files" />}
            {activeSection === "marketplace" && <MarketplaceView />}
            {activeSection === "settings" && <SettingsView />}
          </div>
        </main>

        {/* Right Contextual Inspector */}
        {inspectorVisible && (
          <aside
            style={{ width: inspectorWidth }}
            className="relative flex shrink-0 flex-col border-l border-[#252B3A] bg-[#0D1018] overflow-y-auto"
          >
            <div
              onMouseDown={startResizeRight}
              className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#A78BFA]/50"
            />
            <div className="flex items-center justify-between border-b border-[#252B3A] px-4 py-3">
              <span className="text-xs font-semibold text-[#F3F4F8]">
                {t("inspector.title")}
              </span>
              <button
                onClick={() => setInspectorVisible(false)}
                className="rounded p-1 text-[#9399AA] hover:bg-[#191E2C] hover:text-[#F3F4F8] cursor-pointer"
              >
                <PanelRightClose className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="p-4 space-y-4 text-xs">
              <div className="rounded-xl border border-[#252B3A] bg-[#121622] p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-wider text-[#9399AA]">
                    {t("inspector.currentModel")}
                  </div>
                  {providers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => openProviderPicker(null)}
                      className="text-[10px] text-[#A78BFA] hover:underline cursor-pointer"
                    >
                      {t("providers.switchBtn")}
                    </button>
                  )}
                </div>
                <div className="font-medium text-[#F3F4F8]">
                  {activeConv?.activeModel || activeProvider?.modelId || t("inspector.notConfigured")}
                </div>
                <div className="text-[11px] text-[#67DDF2]">
                  {activeProvider?.name || t("inspector.noProvider")}
                </div>
              </div>

              <div className="rounded-xl border border-[#252B3A] bg-[#121622] p-3 space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-[#9399AA]">
                  {t("inspector.activeAgent")}
                </div>
                {activeAgent ? (
                  <>
                    <div className="font-medium text-[#A78BFA]">{activeAgent.name}</div>
                    <div className="text-[11px] text-[#9399AA]">{activeAgent.role}</div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      <Badge variant="violet">
                        {activeAgent.enabledToolIds.length} {t("inspector.toolsCount")}
                      </Badge>
                      <Badge variant="cyan">
                        {activeAgent.assignedSkillIds.length} {t("inspector.skillsCount")}
                      </Badge>
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-[#9399AA]">
                    {activeConv?.mode === "agent"
                      ? t("inspector.noAgentSelected")
                      : t("inspector.directModeHint")}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[#252B3A] bg-[#121622] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-[#9399AA]">
                    {t("inspector.connectedMcp")}
                  </span>
                  <Badge variant={connectedMcp.length > 0 ? "success" : "default"}>
                    {connectedMcp.length}/{mcpServers.length}
                  </Badge>
                </div>
                {connectedMcp.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between text-[11px] text-[#F3F4F8]"
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="text-emerald-400">●</span>
                  </div>
                ))}
                {connectedMcp.length === 0 && (
                  <div className="text-[11px] text-[#9399AA]">
                    {t("inspector.noLiveConnections")}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[#252B3A] bg-[#121622] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-[#9399AA]">
                    {t("ssh.inspectorTitle")}
                  </span>
                  <Badge variant={connectedSsh.length > 0 ? "success" : "default"}>
                    {connectedSsh.length}/{sshServers.length}
                  </Badge>
                </div>
                {connectedSsh.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between text-[11px] text-[#F3F4F8]"
                  >
                    <span className="truncate font-mono">
                      {s.username}@{s.host}
                    </span>
                    <span className="text-emerald-400">●</span>
                  </div>
                ))}
                {connectedSsh.length === 0 && (
                  <div className="text-[11px] text-[#9399AA]">
                    {t("inspector.noLiveConnections")}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[#252B3A] bg-[#121622] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-[#9399AA]">
                    {t("inspector.enabledSkills")}
                  </span>
                  <Badge variant="violet">{enabledSkills.length}</Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {enabledSkills.slice(0, 8).map((sk) => (
                    <Badge key={sk.id} variant="default">
                      {sk.name}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-[#252B3A] bg-[#121622] p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#9399AA]">
                  <Shield className="h-3 w-3 text-[#67DDF2]" />
                  {t("inspector.securityContext")}
                </div>
                <div className="text-[11px] text-[#9399AA]">
                  {t("inspector.mode")}:{" "}
                  <span className="text-[#F3F4F8]">{activeConv?.mode ?? "direct"}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#9399AA]">
                  <span>Approval Mode:</span>
                  <Badge variant={activeExecMode === "turbo" ? "success" : "warning"}>
                    {activeExecMode === "turbo" ? t("mode.turbo") : t("mode.review")}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#9399AA]">
                  <span>{t("internet.inspectorLabel")}:</span>
                  <Badge variant={activeInternetMode ? "cyan" : "default"}>
                    {activeInternetMode ? t("internet.on") : t("internet.off")}
                  </Badge>
                </div>
                {activeProject && (
                  <div className="text-[11px] text-[#9399AA] pt-1 border-t border-[#252B3A]">
                    <div className="text-[10px] uppercase tracking-wider">Active Project</div>
                    <div className="text-[#67DDF2] font-medium truncate">
                      {activeProject.name}
                    </div>
                    <div className="text-[10px] font-mono truncate opacity-80">
                      {activeProject.rootPath}
                    </div>
                  </div>
                )}
                <div className="text-[11px] text-[#9399AA]">
                  {t("inspector.execution")}:{" "}
                  <span className="text-[#F3F4F8]">
                    {runningTasks > 0
                      ? `${runningTasks} ${t("inspector.active")}`
                      : t("inspector.idle")}
                  </span>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Local Developer Console Drawer */}
      <DevConsoleDrawer />

      {/* Bottom Status Bar */}
      <footer className="flex h-7 shrink-0 items-center justify-between gap-4 overflow-hidden border-t border-[#252B3A] bg-[#0D1018] px-3 text-[11px] text-[#9399AA] select-none">
        <div className="flex min-w-0 items-center gap-4">
          <button
            onClick={() => {
              if (providers.length > 0) {
                openProviderPicker(null);
              } else {
                setActiveSection("providers");
              }
            }}
            className="flex min-w-0 items-center gap-1.5 hover:text-[#F3F4F8] cursor-pointer"
            title={t("providers.pickerTitle")}
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                activeProvider ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <span className="truncate max-w-[160px]">
              {activeProvider ? activeProvider.name : t("status.noProvider")}
            </span>
          </button>

          <span className="text-[#67DDF2] truncate max-w-[180px]">
            {activeConv?.activeModel || activeProvider?.modelId || "—"}
          </span>

          {activeProject && (
            <button
              onClick={() => setActiveSection("files")}
              className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[#67DDF2] hover:underline cursor-pointer max-w-[160px]"
              title={activeProject.rootPath}
            >
              <FolderOpen className="h-3 w-3 shrink-0" />
              <span className="truncate">{activeProject.name}</span>
            </button>
          )}

          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
              activeExecMode === "turbo"
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-amber-500/15 text-amber-300"
            }`}
          >
            {activeExecMode === "turbo" ? t("mode.turbo") : t("mode.review")}
          </span>

          {activeInternetMode && (
            <button
              onClick={() => {
                setSettingsSection("internet");
                setActiveSection("settings");
              }}
              className="flex shrink-0 items-center gap-1 rounded bg-[#67DDF2]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#67DDF2] hover:bg-[#67DDF2]/25 cursor-pointer"
              title={t("internet.bannerConfigure")}
            >
              <Globe className="h-3 w-3" />
              <span>{t("internet.on")}</span>
            </button>
          )}

          <button
            onClick={() => setActiveSection("mcp")}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap hover:text-[#F3F4F8] cursor-pointer"
          >
            <Plug className="h-3 w-3 text-[#A78BFA]" />
            <span>
              MCP: {connectedMcp.length} {t("status.mcpConnected")}
            </span>
          </button>

          <button
            onClick={() => setActiveSection("ssh")}
            className={`flex shrink-0 items-center gap-1 whitespace-nowrap cursor-pointer ${
              connectedSsh.length > 0
                ? "text-emerald-400 hover:text-emerald-300"
                : "hover:text-[#F3F4F8]"
            }`}
          >
            <Server className="h-3 w-3" />
            <span>
              SSH: {connectedSsh.length}
            </span>
          </button>

          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
            <Activity className="h-3 w-3" />
            <span>
              {t("status.tasks")}: {runningTasks}
            </span>
          </span>

          {lastTokenUsage && (
            <span className="shrink-0 whitespace-nowrap">
              {t("status.tokens")}: {lastTokenUsage.totalTokens}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
          <span>
            {activeProvider
              ? isLocalEndpoint
                ? t("status.localEndpoint")
                : t("status.remoteEndpoint")
              : t("status.offlineLocal")}
          </span>
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="hover:text-[#F3F4F8] cursor-pointer"
          >
            Ctrl+K
          </button>
          <button
            onClick={() => setDevConsoleOpen(!devConsoleOpen)}
            className={`flex items-center gap-1 cursor-pointer ${
              devConsoleOpen ? "text-[#67DDF2]" : "hover:text-[#F3F4F8]"
            }`}
          >
            <Terminal className="h-3 w-3" />
            <span>{t("status.console")}</span>
          </button>
          {!inspectorVisible && (
            <button
              onClick={() => setInspectorVisible(true)}
              className="flex items-center gap-1 hover:text-[#F3F4F8] cursor-pointer"
            >
              <PanelRightOpen className="h-3 w-3" />
              <span>{t("status.inspector")}</span>
            </button>
          )}
        </div>
      </footer>

      {/* Global Modals */}
      <ApprovalModal />
      <ProviderPickerModal />
      <CommandPalette onNewChat={handleNewChat} />
    </div>
  );
}
