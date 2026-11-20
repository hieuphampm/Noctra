import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Bot,
  Check,
  Columns2,
  Copy,
  Download,
  Edit3,
  FileText,
  FolderPlus,
  Globe,
  Image as ImageIcon,
  Paperclip,
  RotateCcw,
  Send,
  Server,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { api, isTauriRuntime } from "@/services/tauri";
import { useAppStore } from "@/stores/appStore";
import { useI18n } from "@/i18n";
import { pickAndImportProjectFolder } from "@/utils/importProject";
import type {
  ChatAttachment,
  ChatMessage,
  Conversation,
  ExecutionMode,
} from "@/types/noctra";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { ExecutionModeToggle } from "@/components/workspace/ExecutionModeToggle";
import { InternetModeToggle } from "@/components/workspace/InternetModeToggle";
import { SshQuickConnectModal } from "@/components/workspace/SshQuickConnectModal";
import { ProjectTreeSidebar } from "@/components/workspace/ProjectTreeSidebar";
import { CodeEditorPane } from "@/components/workspace/CodeEditorPane";
import { AiChangedFilesPopup } from "@/components/workspace/AiChangedFilesPopup";
import { formatBytes, formatRelativeTime } from "@/utils/cn";

export function ChatView() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const activeConvId = useAppStore((s) => s.activeConversationId);
  const setActiveConvId = useAppStore((s) => s.setActiveConversationId);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  const preferredExecutionMode = useAppStore((s) => s.preferredExecutionMode);
  const setPreferredExecutionMode = useAppStore((s) => s.setPreferredExecutionMode);
  const preferredInternetMode = useAppStore((s) => s.preferredInternetMode);
  const setPreferredInternetMode = useAppStore((s) => s.setPreferredInternetMode);
  const preferredProviderId = useAppStore((s) => s.preferredProviderId);
  const setPreferredProviderId = useAppStore((s) => s.setPreferredProviderId);
  const openProviderPicker = useAppStore((s) => s.openProviderPicker);
  const setSettingsSection = useAppStore((s) => s.setSettingsSection);
  const workspaceSplitOpen = useAppStore((s) => s.workspaceSplitOpen);
  const setWorkspaceSplitOpen = useAppStore((s) => s.setWorkspaceSplitOpen);
  const pendingComposerInsert = useAppStore((s) => s.pendingComposerInsert);
  const setPendingComposerInsert = useAppStore((s) => s.setPendingComposerInsert);
  const aiChangedPaths = useAppStore((s) => s.recentlyAiChangedPaths);
  const clearAiChangedPaths = useAppStore((s) => s.clearAiChangedPaths);
  const openEditorTab = useAppStore((s) => s.openEditorTab);
  const setSection = useAppStore((s) => s.setActiveSection);
  const streamingText = useAppStore((s) => s.streamingText);
  const streamingToolCalls = useAppStore((s) => s.streamingToolCalls);
  const activeRunId = useAppStore((s) => s.activeChatRunId);
  const setActiveRunId = useAppStore((s) => s.setActiveChatRunId);
  const clearStreaming = useAppStore((s) => s.clearStreamingState);
  const setRunningCount = useAppStore((s) => s.setRunningTaskCount);

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
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
    enabled: isTauriRuntime(),
  });
  const { data: sshServers = [] } = useQuery({
    queryKey: ["ssh-servers"],
    queryFn: api.listSshServers,
    enabled: isTauriRuntime(),
  });

  const activeConv: Conversation | undefined = conversations.find(
    (c) => c.id === activeConvId
  );
  const resolvedProjectId = activeConv?.projectId ?? activeProjectId ?? null;
  const activeProject = projects.find((p) => p.id === resolvedProjectId) ?? null;
  const activeSshServer =
    sshServers.find((s) => s.id === activeConv?.sshServerId) ?? null;

  // Keep global activeProjectId in sync with the active conversation's project
  React.useEffect(() => {
    if (activeConv?.projectId && activeConv.projectId !== activeProjectId) {
      setActiveProjectId(activeConv.projectId);
    }
  }, [activeConv?.projectId, activeProjectId, setActiveProjectId]);

  const resolvedProvider =
    providers.find((p) => p.id === activeConv?.activeProviderId) ??
    providers.find((p) => p.id === preferredProviderId) ??
    providers[0];

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", activeConvId],
    queryFn: () => api.listMessages(activeConvId!),
    enabled: Boolean(activeConvId) && isTauriRuntime(),
  });

  const [draft, setDraft] = React.useState("");
  const [attachments, setAttachments] = React.useState<ChatAttachment[]>([]);
  const [editingMsgId, setEditingMsgId] = React.useState<string | null>(null);
  const [editingText, setEditingText] = React.useState("");
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [importingFolder, setImportingFolder] = React.useState(false);
  const [sshModalOpen, setSshModalOpen] = React.useState(false);
  const [sshModalTargetId, setSshModalTargetId] = React.useState<string | null>(null);
  const [splitRatio, setSplitRatio] = React.useState(52); // % width of IDE left pane
  const splitContainerRef = React.useRef<HTMLDivElement>(null);
  const composerRef = React.useRef<HTMLTextAreaElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages.length, streamingText, streamingToolCalls.length]);

  React.useEffect(() => {
    if (pendingComposerInsert) {
      setDraft((prev) => (prev ? `${prev.trimEnd()} ${pendingComposerInsert}` : pendingComposerInsert));
      setPendingComposerInsert(null);
      composerRef.current?.focus();
    }
  }, [pendingComposerInsert, setPendingComposerInsert]);

  const effectiveExecMode: ExecutionMode =
    activeConv?.executionMode ?? preferredExecutionMode;
  const effectiveInternetMode: boolean =
    activeConv?.internetMode ?? preferredInternetMode;

  const ensureConversation = async (
    overrides?: Partial<{
      mode: "direct" | "agent";
      executionMode: ExecutionMode;
      internetMode: boolean;
      projectId: string | null;
      sshServerId: string | null;
      agentId: string | null;
    }>
  ): Promise<Conversation> => {
    if (activeConv) return activeConv;
    const targetProject = overrides?.projectId !== undefined ? overrides.projectId : resolvedProjectId;
    const targetSsh = overrides?.sshServerId !== undefined ? overrides.sshServerId : null;
    const targetMode = overrides?.mode ?? (targetProject || targetSsh ? "agent" : "direct");
    const defaultAgent =
      overrides?.agentId ??
      (targetMode === "agent"
        ? (targetSsh
            ? agents.find((a) => a.id === "tpl-ssh-ops")?.id
            : agents.find((a) => a.id === "tpl-coding")?.id) ??
          agents[0]?.id ??
          null
        : null);
    const defaultProvider =
      providers.find((p) => p.id === preferredProviderId) ?? providers[0] ?? null;
    const created = await api.createConversation({
      title: targetProject && activeProject ? `Project: ${activeProject.name}` : "New Conversation",
      mode: targetMode,
      executionMode: overrides?.executionMode ?? preferredExecutionMode,
      internetMode: overrides?.internetMode ?? preferredInternetMode,
      providerId: defaultProvider?.id ?? null,
      model: defaultProvider?.modelId ?? null,
      agentId: defaultAgent,
      projectId: targetProject,
      sshServerId: targetSsh,
    });
    await qc.invalidateQueries({ queryKey: ["conversations"] });
    setActiveConvId(created.id);
    return created;
  };

  const handleImportFolder = async () => {
    setErrorMsg(null);
    setImportingFolder(true);
    try {
      await pickAndImportProjectFolder({
        qc,
        activeConv,
        providers,
        agents,
        openInChatSplit: true,
      });
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setImportingFolder(false);
    }
  };

  const handleExecutionModeChange = async (mode: ExecutionMode) => {
    setPreferredExecutionMode(mode);
    if (activeConv) {
      await updateConvField({ executionMode: mode });
    }
  };

  const handleInternetModeChange = async (enabled: boolean) => {
    setPreferredInternetMode(enabled);
    if (activeConv) {
      await updateConvField({ internetMode: enabled });
    }
  };

  const handleAttachFiles = async () => {
    try {
      const selected = await openDialog({ multiple: true });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      const loaded = await Promise.all(
        paths.map((p) => api.loadAttachmentFromPath(p))
      );
      setAttachments((prev) => [...prev, ...loaded]);
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? draft).trim();
    if (!text && attachments.length === 0) return;
    setErrorMsg(null);
    setSending(true);
    setRunningCount(1);
    clearStreaming();
    clearAiChangedPaths();

    try {
      let conv = await ensureConversation();
      const convProvider =
        providers.find((p) => p.id === conv.activeProviderId) ??
        providers.find((p) => p.id === preferredProviderId) ??
        providers[0] ??
        null;
      const hasValidConvProvider = Boolean(
        conv.activeProviderId && providers.some((p) => p.id === conv.activeProviderId)
      );
      const effectiveProviderId = convProvider?.id ?? null;
      const effectiveModel = hasValidConvProvider
        ? (conv.activeModel ?? convProvider?.modelId ?? null)
        : (convProvider?.modelId ?? null);

      const convPatch: Partial<Conversation> = {};
      if (conv.title === "New Conversation" && text.length > 0) {
        convPatch.title = text.slice(0, 44) + (text.length > 44 ? "..." : "");
      }
      if (conv.activeProviderId !== effectiveProviderId) {
        convPatch.activeProviderId = effectiveProviderId;
        convPatch.activeModel = effectiveModel;
      }
      if (Object.keys(convPatch).length > 0) {
        conv = await api.updateConversation({ ...conv, ...convPatch });
      }
      if (!overrideText) {
        setDraft("");
      }
      const attsToSend = overrideText ? [] : attachments;
      if (!overrideText) setAttachments([]);

      const finalMsg = await api.sendChatMessage({
        conversationId: conv.id,
        content: text,
        attachments: attsToSend,
        providerId: effectiveProviderId,
        model: effectiveModel,
      });
      if (finalMsg.tokenUsage) {
        useAppStore.getState().setLastTokenUsage(finalMsg.tokenUsage);
      }
      await qc.invalidateQueries({ queryKey: ["messages", conv.id] });
      await qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      clearStreaming();
      setSending(false);
      setRunningCount(0);
    }
  };

  const handleStop = async () => {
    if (activeRunId) {
      await api.cancelChatRun(activeRunId);
      setActiveRunId(null);
    }
  };

  const updateConvField = async (patch: Partial<Conversation>) => {
    if (!activeConv) {
      const next = await ensureConversation({
        mode: patch.mode,
        executionMode: patch.executionMode,
        internetMode: patch.internetMode,
        projectId: patch.projectId,
        sshServerId: patch.sshServerId,
        agentId: patch.activeAgentId,
      });
      if (patch.projectId !== undefined) {
        setActiveProjectId(patch.projectId ?? null);
      }
      return next;
    }
    const next = { ...activeConv, ...patch };
    await api.updateConversation(next);
    await qc.invalidateQueries({ queryKey: ["conversations"] });
    return next;
  };

  const handleRegenerate = async (assistantMsg: ChatMessage) => {
    if (!activeConv) return;
    const idx = messages.findIndex((m) => m.id === assistantMsg.id);
    const prevUser = [...messages.slice(0, idx)]
      .reverse()
      .find((m) => m.role === "user");
    if (!prevUser) return;
    await api.editAndTruncateMessage(activeConv.id, prevUser.id, prevUser.content);
    await api.deleteMessage(prevUser.id);
    await qc.invalidateQueries({ queryKey: ["messages", activeConv.id] });
    await handleSend(prevUser.content);
  };

  const handleSaveEdit = async (msg: ChatMessage) => {
    if (!activeConv || !editingText.trim()) return;
    await api.editAndTruncateMessage(activeConv.id, msg.id, editingText.trim());
    setEditingMsgId(null);
    await qc.invalidateQueries({ queryKey: ["messages", activeConv.id] });
  };

  const handleExportMarkdown = () => {
    if (!activeConv) return;
    const md = [
      `# ${activeConv.title}`,
      `_Mode: ${activeConv.mode} (${activeConv.executionMode}) | Exported from NOCTRA STUDIO_`,
      "",
      ...messages
        .filter((m) => m.role !== "tool")
        .map((m) => `## ${m.role.toUpperCase()} (${m.createdAt})\n\n${m.content}\n`),
    ].join("\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeConv.title.replace(/[^a-z0-9-_]+/gi, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openChangedFile = async (relativePath: string) => {
    if (!activeProject) return;
    try {
      const rich = await api.readProjectFileRich(activeProject.id, relativePath);
      const name = relativePath.split("/").pop() || relativePath;
      openEditorTab({
        projectId: activeProject.id,
        relativePath: rich.relativePath,
        name,
        kind: rich.kind,
        content: rich.content ?? "",
        savedContent: rich.content ?? "",
        dataUrl: rich.dataUrl,
        sizeBytes: rich.sizeBytes,
        language: rich.language,
        aiModified: true,
      });
      setWorkspaceSplitOpen(true);
    } catch {
      // ignore if file was deleted
    }
  };

  const startResizeSplit = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const onMove = (me: MouseEvent) => {
      const pct = ((me.clientX - rect.left) / rect.width) * 100;
      setSplitRatio(Math.max(30, Math.min(72, pct)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.shiftKey) return;
    e.preventDefault();
    if (!sending && (draft.trim() || attachments.length > 0)) {
      handleSend();
    }
  };

  const visibleMessages = messages.filter((m) => m.role !== "tool");
  const showSplitIde = Boolean(activeProject && workspaceSplitOpen);

  return (
    <div className="flex h-full flex-col bg-[#090B10] overflow-hidden">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#252B3A] bg-[#0D1018] px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Direct vs Agent Mode Switcher */}
          <div className="inline-flex rounded-lg border border-[#252B3A] bg-[#090B10] p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => updateConvField({ mode: "direct" })}
              className={`rounded-md px-2.5 py-1 flex items-center gap-1 cursor-pointer ${
                (activeConv?.mode ?? "direct") === "direct"
                  ? "bg-[#191E2C] text-[#67DDF2] font-medium"
                  : "text-[#9399AA]"
              }`}
            >
              <Sparkles className="h-3 w-3" />
              {t("chat.direct")}
            </button>
            <button
              type="button"
              onClick={() => updateConvField({ mode: "agent" })}
              className={`rounded-md px-2.5 py-1 flex items-center gap-1 cursor-pointer ${
                activeConv?.mode === "agent"
                  ? "bg-[#A78BFA]/20 text-[#A78BFA] font-medium"
                  : "text-[#9399AA]"
              }`}
            >
              <Bot className="h-3 w-3" />
              {t("chat.agent")}
            </button>
          </div>

          {activeConv?.mode === "agent" && (
            <Select
              value={activeConv.activeAgentId ?? ""}
              onChange={(val) => updateConvField({ activeAgentId: val || null })}
            >
              <option value="">{t("chat.selectAgent")}</option>
              {agents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name} ({ag.role})
                </option>
              ))}
            </Select>
          )}

          {/* Provider Selector (Always visible in both Direct and Agent Mode) */}
          <Select
            value={resolvedProvider?.id ?? ""}
            onChange={(val) => {
              const prov = providers.find((p) => p.id === val);
              setPreferredProviderId(val || null);
              updateConvField({
                activeProviderId: val || null,
                activeModel: prov?.modelId ?? null,
              });
            }}
          >
            <option value="">{t("chat.selectProvider")}</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.modelId}
              </option>
            ))}
          </Select>

          {providers.length > 1 && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => openProviderPicker(null)}
              className="h-7 px-2 text-[11px]"
              title={t("providers.pickerTitle")}
            >
              {t("providers.switchBtn")}
            </Button>
          )}

          {/* Project Selector + Quick Import Folder */}
          <div className="flex items-center gap-1">
            <Select
              value={resolvedProjectId ?? ""}
              onChange={(val) => {
                const pid = val || null;
                setActiveProjectId(pid);
                if (pid) setWorkspaceSplitOpen(true);
                updateConvField({
                  projectId: pid,
                  ...(pid && (activeConv?.mode ?? "direct") === "direct"
                    ? {
                        mode: "agent",
                        activeAgentId:
                          activeConv?.activeAgentId ??
                          agents.find((a) => a.id === "tpl-coding")?.id ??
                          agents[0]?.id ??
                          null,
                      }
                    : {}),
                });
              }}
            >
              <option value="">{t("chat.noProjectScope")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={importingFolder}
              onClick={handleImportFolder}
              title={t("projects.importFolder")}
              className="h-7 px-2.5 text-[11px]"
            >
              <FolderPlus className="h-3.5 w-3.5 text-[#67DDF2]" />
              <span className="hidden sm:inline">{t("projects.importFolder")}</span>
            </Button>
          </div>

          {/* Review (Ask User) vs Turbo (Full Auto) Toggle */}
          <ExecutionModeToggle
            value={effectiveExecMode}
            onChange={handleExecutionModeChange}
          />

          {/* Internet Mode Toggle (Built-in Port Scan, DNS, HTTP Audit, Web Fetch) */}
          <InternetModeToggle
            enabled={effectiveInternetMode}
            onChange={handleInternetModeChange}
          />

          {/* SSH Server Selector & Quick Connect */}
          <div className="flex items-center gap-1">
            {sshServers.length > 0 && (
              <Select
                value={activeConv?.sshServerId ?? ""}
                onChange={(val) => {
                  const sid = val || null;
                  updateConvField({ sshServerId: sid });
                  if (sid) {
                    const target = sshServers.find((s) => s.id === sid);
                    if (target && target.status !== "connected" && !target.hasPassword && target.authType === "password") {
                      setSshModalTargetId(sid);
                      setSshModalOpen(true);
                    }
                  }
                }}
              >
                <option value="">{t("ssh.noSshScope")}</option>
                {sshServers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.status === "connected" ? "● " : ""}
                    {s.name} ({s.username}@{s.host})
                  </option>
                ))}
              </Select>
            )}
            <Button
              type="button"
              size="sm"
              variant={activeSshServer?.status === "connected" ? "cyan" : "secondary"}
              onClick={() => {
                setSshModalTargetId(activeSshServer?.id ?? null);
                setSshModalOpen(true);
              }}
              title={t("ssh.quickConnectTitle")}
              className="h-7 px-2.5 text-[11px]"
            >
              <Server className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">{t("ssh.quickConnect")}</span>
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {activeProject && (
            <Button
              type="button"
              size="sm"
              variant={workspaceSplitOpen ? "cyan" : "secondary"}
              onClick={() => setWorkspaceSplitOpen(!workspaceSplitOpen)}
              className="h-7 px-2.5 text-[11px]"
            >
              <Columns2 className="h-3.5 w-3.5" />
              {t("projects.splitWorkspace")}
            </Button>
          )}
          {providers.length === 0 && (
            <Button
              size="sm"
              variant="cyan"
              onClick={() => setSection("providers")}
            >
              {t("chat.configureProvider")}
            </Button>
          )}
          {activeConv && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleExportMarkdown}
              title={t("chat.export")}
            >
              <Download className="h-3.5 w-3.5" />
              {t("chat.export")}
            </Button>
          )}
        </div>
      </div>

      {/* Internet Mode active status bar */}
      {effectiveInternetMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#67DDF2]/30 bg-[#67DDF2]/10 px-4 py-1.5 text-[11px] text-[#F3F4F8]">
          <span className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-[#67DDF2] shrink-0" />
            <span>{t("internet.bannerActive")}</span>
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="h-6 px-2.5 text-[10px]"
            onClick={() => {
              setSettingsSection("internet");
              setSection("settings");
            }}
          >
            {t("internet.bannerConfigure")}
          </Button>
        </div>
      )}

      {/* Active SSH Server status bar */}
      {activeSshServer && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-[11px] text-[#F3F4F8]">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Terminal className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="font-medium text-emerald-300">{t("ssh.bannerAttached")}:</span>
            <span className="font-mono text-[#67DDF2] truncate">
              {activeSshServer.username}@{activeSshServer.host}:{activeSshServer.port}
            </span>
            <Badge
              variant={
                activeSshServer.status === "connected"
                  ? "success"
                  : activeSshServer.status === "error"
                  ? "danger"
                  : "warning"
              }
            >
              {activeSshServer.status === "connected"
                ? t("ssh.connected")
                : activeSshServer.status === "error"
                ? t("ssh.error")
                : t("ssh.disconnected")}
            </Badge>
            <span className="hidden lg:inline text-[#9399AA]">{t("ssh.bannerAutoHint")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {activeSshServer.status !== "connected" && (
              <Button
                type="button"
                size="sm"
                variant="cyan"
                className="h-6 px-2.5 text-[10px]"
                onClick={() => {
                  setSshModalTargetId(activeSshServer.id);
                  setSshModalOpen(true);
                }}
              >
                {t("ssh.enterPasswordConnect")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-6 px-2 text-[10px]"
              onClick={() => updateConvField({ sshServerId: null })}
            >
              {t("ssh.detach")}
            </Button>
          </div>
        </div>
      )}

      {/* Helpful hint when a project is attached in Direct mode */}
      {activeProject && (activeConv?.mode ?? "direct") === "direct" && (
        <div className="flex items-center justify-between gap-3 border-b border-[#A78BFA]/30 bg-[#A78BFA]/10 px-4 py-1.5 text-[11px] text-[#F3F4F8]">
          <span>{t("projects.switchAgentHint")}</span>
          <Button
            size="sm"
            variant="secondary"
            className="h-6 px-2.5 text-[10px]"
            onClick={() =>
              updateConvField({
                mode: "agent",
                activeAgentId:
                  activeConv?.activeAgentId ??
                  agents.find((a) => a.id === "tpl-coding")?.id ??
                  agents[0]?.id ??
                  null,
              })
            }
          >
            <Bot className="h-3 w-3 text-[#A78BFA]" />
            {t("projects.enableAgentNow")}
          </Button>
        </div>
      )}

      {/* Main Content: Optional Split IDE + Chat */}
      <div ref={splitContainerRef} className="flex flex-1 min-h-0 overflow-hidden">
        {showSplitIde && activeProject && (
          <>
            <div
              style={{ width: `${splitRatio}%` }}
              className="flex min-w-[280px] h-full overflow-hidden border-r border-[#252B3A]"
            >
              <div className="w-56 shrink-0 h-full overflow-hidden">
                <ProjectTreeSidebar
                  project={activeProject}
                  onImportFolder={handleImportFolder}
                  compact
                />
              </div>
              <CodeEditorPane project={activeProject} />
            </div>
            <div
              onMouseDown={startResizeSplit}
              className="w-1 shrink-0 cursor-col-resize bg-[#252B3A]/50 hover:bg-[#67DDF2]/70 transition-colors"
              title="Resize IDE / Chat Split"
            />
          </>
        )}

        {/* Chat Column */}
        <div className="relative flex flex-1 min-w-[300px] flex-col overflow-hidden">
          {activeProject && (
            <AiChangedFilesPopup
              paths={aiChangedPaths}
              onSelectFile={openChangedFile}
              onDismiss={clearAiChangedPaths}
            />
          )}

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {visibleMessages.length === 0 && !sending ? (
              <div className="mx-auto max-w-xl pt-12 text-center space-y-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#A78BFA]/20 to-[#67DDF2]/20 border border-[#A78BFA]/30">
                  <Sparkles className="h-6 w-6 text-[#A78BFA]" />
                </div>
                <h2 className="text-lg font-semibold text-[#F3F4F8]">
                  NOCTRA STUDIO
                </h2>
                <p className="text-xs text-[#9399AA] leading-relaxed">
                  {t("chat.welcomeBody")}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <Button variant="cyan" onClick={handleImportFolder}>
                    <FolderPlus className="h-3.5 w-3.5" />
                    {t("projects.importFolder")}
                  </Button>
                  {providers.length === 0 && (
                    <Button onClick={() => setSection("providers")}>
                      {t("chat.addFirstProvider")}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              visibleMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`group mx-auto max-w-4xl rounded-2xl border p-4 ${
                    msg.role === "user"
                      ? "border-[#252B3A] bg-[#121622]"
                      : "border-[#252B3A]/80 bg-[#0D1018]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={msg.role === "user" ? "violet" : "cyan"}>
                        {msg.role === "user" ? t("chat.you") : t("chat.assistant")}
                      </Badge>
                      <span className="text-[10px] text-[#9399AA]">
                        {formatRelativeTime(msg.createdAt)}
                      </span>
                      {msg.tokenUsage && (
                        <span className="text-[10px] text-[#9399AA]">
                          • {msg.tokenUsage.totalTokens} tokens
                        </span>
                      )}
                    </div>

                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(msg.content);
                          setCopiedId(msg.id);
                          setTimeout(() => setCopiedId(null), 1200);
                        }}
                        className="p-1 rounded hover:bg-[#191E2C] text-[#9399AA] hover:text-[#F3F4F8] cursor-pointer"
                        title="Copy"
                      >
                        {copiedId === msg.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {msg.role === "user" && (
                        <button
                          onClick={() => {
                            setEditingMsgId(msg.id);
                            setEditingText(msg.content);
                          }}
                          className="p-1 rounded hover:bg-[#191E2C] text-[#9399AA] hover:text-[#F3F4F8] cursor-pointer"
                          title="Edit message"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {msg.role === "assistant" && (
                        <button
                          onClick={() => handleRegenerate(msg)}
                          className="p-1 rounded hover:bg-[#191E2C] text-[#9399AA] hover:text-[#F3F4F8] cursor-pointer"
                          title="Regenerate"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          await api.deleteMessage(msg.id);
                          if (activeConv) {
                            qc.invalidateQueries({ queryKey: ["messages", activeConv.id] });
                          }
                        }}
                        className="p-1 rounded hover:bg-[#191E2C] text-[#9399AA] hover:text-red-400 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {msg.attachments.length > 0 && (
                    <div className="mb-2.5 flex flex-wrap gap-2">
                      {msg.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center gap-1.5 rounded-lg border border-[#252B3A] bg-[#191E2C] px-2.5 py-1 text-[11px]"
                        >
                          {att.kind === "image" ? (
                            <ImageIcon className="h-3.5 w-3.5 text-[#67DDF2]" />
                          ) : (
                            <FileText className="h-3.5 w-3.5 text-[#A78BFA]" />
                          )}
                          <span>{att.name}</span>
                          <span className="text-[#9399AA]">
                            ({formatBytes(att.sizeBytes)})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.toolCalls.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {msg.toolCalls.map((tc) => (
                        <div
                          key={tc.id}
                          className="rounded-xl border border-[#252B3A] bg-[#121622] p-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5 font-mono text-[#67DDF2] truncate">
                              <Wrench className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{tc.name}</span>
                            </span>
                            <Badge
                              variant={
                                tc.status === "completed"
                                  ? "success"
                                  : tc.status === "denied" || tc.status === "error"
                                  ? "danger"
                                  : "warning"
                              }
                            >
                              {tc.status}
                              {tc.durationMs ? ` • ${tc.durationMs}ms` : ""}
                            </Badge>
                          </div>
                          <pre className="mt-1.5 max-h-24 overflow-auto text-[10px] text-[#9399AA]">
                            {JSON.stringify(tc.arguments)}
                          </pre>
                          {tc.error && (
                            <div className="mt-1 text-[11px] text-red-400">
                              {tc.error}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {editingMsgId === msg.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-[#A78BFA]/50 bg-[#090B10] p-2.5 text-xs text-[#F3F4F8]"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleSaveEdit(msg)}>
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingMsgId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <MarkdownRenderer content={msg.content || "_(tool orchestration step)_"} />
                  )}
                </div>
              ))
            )}

            {/* Live Streaming Preview */}
            {sending && (
              <div className="mx-auto max-w-4xl rounded-2xl border border-[#A78BFA]/40 bg-[#0D1018] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="cyan">{t("chat.streaming")}</Badge>
                  <span className="text-[10px] text-[#9399AA]">
                    {effectiveExecMode === "turbo" ? t("mode.turbo") : t("mode.review")} • {t("chat.executing")}
                  </span>
                </div>
                {streamingToolCalls.map((tc) => (
                  <div
                    key={tc.id}
                    className="rounded-lg border border-[#252B3A] bg-[#121622] px-3 py-2 text-xs flex items-center justify-between gap-2"
                  >
                    <span className="font-mono text-[#67DDF2] truncate">{tc.name}</span>
                    <Badge variant="warning">{tc.status}</Badge>
                  </div>
                ))}
                {streamingText ? (
                  <MarkdownRenderer content={streamingText} />
                ) : (
                  <div className="text-xs text-[#9399AA] animate-pulse">
                    {t("chat.waitingTokens")}
                  </div>
                )}
              </div>
            )}

            {errorMsg && (
              <div className="mx-auto max-w-4xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-300 break-words">
                {errorMsg}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="border-t border-[#252B3A] bg-[#0D1018] p-3.5">
            <div className="mx-auto max-w-4xl rounded-2xl border border-[#252B3A] bg-[#121622] p-3">
              {attachments.length > 0 && (
                <div className="mb-2.5 flex flex-wrap gap-2">
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center gap-1.5 rounded-lg border border-[#252B3A] bg-[#191E2C] px-2.5 py-1 text-[11px]"
                    >
                      <span className="max-w-[160px] truncate">{att.name}</span>
                      <button
                        onClick={() =>
                          setAttachments((prev) => prev.filter((a) => a.id !== att.id))
                        }
                        className="text-[#9399AA] hover:text-red-400 cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                ref={composerRef}
                rows={3}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={
                  activeConv?.mode === "agent"
                    ? t("chat.placeholderAgent")
                    : t("chat.placeholderDirect")
                }
                className="w-full resize-none bg-transparent text-xs text-[#F3F4F8] placeholder:text-[#9399AA]/70 focus:outline-none"
              />

              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleAttachFiles}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {t("chat.attach")}
                  </Button>
                  <span className="text-[10px] text-[#9399AA] hidden sm:inline">
                    {t("chat.ctrlEnter")}
                  </span>
                </div>

                {sending ? (
                  <Button type="button" variant="destructive" onClick={handleStop}>
                    <Square className="h-3.5 w-3.5" />
                    {t("chat.stop")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={!draft.trim() && attachments.length === 0}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {t("chat.send")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <SshQuickConnectModal
        open={sshModalOpen}
        existingServer={sshServers.find((s) => s.id === sshModalTargetId) ?? null}
        onClose={() => setSshModalOpen(false)}
        onConnected={async (srv, enableTurbo) => {
          const nextExecMode: ExecutionMode = enableTurbo ? "turbo" : effectiveExecMode;
          if (enableTurbo) {
            setPreferredExecutionMode("turbo");
          }
          const sshAgentId =
            activeConv?.activeAgentId ??
            agents.find((a) => a.id === "tpl-ssh-ops")?.id ??
            agents[0]?.id ??
            null;
          await updateConvField({
            sshServerId: srv.id,
            executionMode: nextExecMode,
            ...(activeConv?.mode !== "agent" && sshAgentId
              ? { mode: "agent", activeAgentId: sshAgentId }
              : {}),
          });
          await qc.invalidateQueries({ queryKey: ["ssh-servers"] });
        }}
      />
    </div>
  );
}
