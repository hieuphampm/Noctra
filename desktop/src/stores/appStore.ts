import { create } from "zustand";
import type {
  ApprovalRequest,
  ExecutionMode,
  NavSection,
  OpenEditorTab,
  ToolCallRecord,
  TokenUsage,
} from "@/types/noctra";
import type { AppLanguage } from "@/i18n";

const LANG_STORAGE_KEY = "noctra:language";

function readInitialLanguage(): AppLanguage {
  try {
    const raw =
      typeof window !== "undefined" ? window.localStorage?.getItem(LANG_STORAGE_KEY) : null;
    return raw === "vi" ? "vi" : "en";
  } catch {
    return "en";
  }
}

interface AppStoreState {
  language: AppLanguage;
  activeSection: NavSection;
  activeConversationId: string | null;
  activeProjectId: string | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  inspectorVisible: boolean;
  inspectorWidth: number;
  devConsoleOpen: boolean;
  commandPaletteOpen: boolean;
  conversationSearch: string;

  // Workspace IDE & Execution Mode
  preferredExecutionMode: ExecutionMode;
  workspaceSplitOpen: boolean;
  openEditorTabs: OpenEditorTab[];
  activeEditorTabPath: string | null;
  recentlyAiChangedPaths: string[];
  pendingComposerInsert: string | null;

  // Live streaming & execution indicators
  activeChatRunId: string | null;
  streamingText: string;
  streamingToolCalls: ToolCallRecord[];
  runningTaskCount: number;
  lastTokenUsage: TokenUsage | null;
  approvalQueue: ApprovalRequest[];

  setLanguage: (lang: AppLanguage) => void;
  setActiveSection: (s: NavSection) => void;
  setActiveConversationId: (id: string | null) => void;
  setActiveProjectId: (id: string | null) => void;
  setPreferredExecutionMode: (mode: ExecutionMode) => void;
  setWorkspaceSplitOpen: (v: boolean) => void;
  openEditorTab: (tab: OpenEditorTab) => void;
  updateEditorTabContent: (projectId: string, relativePath: string, content: string) => void;
  markEditorTabSaved: (projectId: string, relativePath: string, content: string) => void;
  refreshEditorTabFromDisk: (projectId: string, relativePath: string, content: string) => void;
  closeEditorTab: (projectId: string, relativePath: string) => void;
  closeAllProjectTabs: (projectId: string) => void;
  setActiveEditorTabPath: (path: string | null) => void;
  addAiChangedPaths: (paths: string[]) => void;
  clearAiChangedPaths: () => void;
  setPendingComposerInsert: (text: string | null) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setSidebarWidth: (w: number) => void;
  setInspectorVisible: (v: boolean) => void;
  setInspectorWidth: (w: number) => void;
  setDevConsoleOpen: (v: boolean) => void;
  setCommandPaletteOpen: (v: boolean) => void;
  setConversationSearch: (q: string) => void;

  setActiveChatRunId: (id: string | null) => void;
  appendStreamingText: (delta: string) => void;
  clearStreamingState: () => void;
  upsertStreamingToolCall: (tc: ToolCallRecord) => void;
  setRunningTaskCount: (n: number) => void;
  setLastTokenUsage: (u: TokenUsage | null) => void;
  pushApprovalRequest: (req: ApprovalRequest) => void;
  shiftApprovalRequest: (id: string) => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  language: readInitialLanguage(),
  activeSection: "chat",
  activeConversationId: null,
  activeProjectId: null,
  sidebarCollapsed: false,
  sidebarWidth: 260,
  inspectorVisible: true,
  inspectorWidth: 300,
  devConsoleOpen: false,
  commandPaletteOpen: false,
  conversationSearch: "",

  activeChatRunId: null,
  streamingText: "",
  streamingToolCalls: [],
  runningTaskCount: 0,
  lastTokenUsage: null,
  approvalQueue: [],

  preferredExecutionMode: "review",
  workspaceSplitOpen: true,
  openEditorTabs: [],
  activeEditorTabPath: null,
  recentlyAiChangedPaths: [],
  pendingComposerInsert: null,

  setLanguage: (lang) => {
    const normalized: AppLanguage = lang === "vi" ? "vi" : "en";
    try {
      if (typeof window !== "undefined") {
        window.localStorage?.setItem(LANG_STORAGE_KEY, normalized);
        document.documentElement.lang = normalized;
      }
    } catch {
      // ignore storage errors in restricted contexts
    }
    set({ language: normalized });
  },
  setActiveSection: (activeSection) => set({ activeSection }),
  setActiveConversationId: (activeConversationId) => set({ activeConversationId }),
  setActiveProjectId: (activeProjectId) => set({ activeProjectId }),
  setPreferredExecutionMode: (preferredExecutionMode) => set({ preferredExecutionMode }),
  setWorkspaceSplitOpen: (workspaceSplitOpen) => set({ workspaceSplitOpen }),
  openEditorTab: (tab) =>
    set((s) => {
      const idx = s.openEditorTabs.findIndex(
        (t) => t.projectId === tab.projectId && t.relativePath === tab.relativePath
      );
      if (idx === -1) {
        return {
          openEditorTabs: [...s.openEditorTabs, tab],
          activeEditorTabPath: tab.relativePath,
        };
      }
      const next = [...s.openEditorTabs];
      next[idx] = { ...next[idx], targetLine: tab.targetLine };
      return {
        openEditorTabs: next,
        activeEditorTabPath: tab.relativePath,
      };
    }),
  updateEditorTabContent: (projectId, relativePath, content) =>
    set((s) => ({
      openEditorTabs: s.openEditorTabs.map((t) =>
        t.projectId === projectId && t.relativePath === relativePath
          ? { ...t, content }
          : t
      ),
    })),
  markEditorTabSaved: (projectId, relativePath, content) =>
    set((s) => ({
      openEditorTabs: s.openEditorTabs.map((t) =>
        t.projectId === projectId && t.relativePath === relativePath
          ? { ...t, content, savedContent: content, aiModified: false }
          : t
      ),
    })),
  refreshEditorTabFromDisk: (projectId, relativePath, content) =>
    set((s) => ({
      openEditorTabs: s.openEditorTabs.map((t) => {
        if (t.projectId !== projectId || t.relativePath !== relativePath) return t;
        const isDirty = t.content !== t.savedContent;
        return isDirty
          ? { ...t, aiModified: true }
          : { ...t, content, savedContent: content, aiModified: true };
      }),
    })),
  closeEditorTab: (projectId, relativePath) =>
    set((s) => {
      const remaining = s.openEditorTabs.filter(
        (t) => !(t.projectId === projectId && t.relativePath === relativePath)
      );
      let nextActive = s.activeEditorTabPath;
      if (nextActive === relativePath) {
        const sameProj = remaining.filter((t) => t.projectId === projectId);
        nextActive = sameProj.length > 0 ? sameProj[sameProj.length - 1].relativePath : null;
      }
      return { openEditorTabs: remaining, activeEditorTabPath: nextActive };
    }),
  closeAllProjectTabs: (projectId) =>
    set((s) => ({
      openEditorTabs: s.openEditorTabs.filter((t) => t.projectId !== projectId),
      activeEditorTabPath: null,
    })),
  setActiveEditorTabPath: (activeEditorTabPath) => set({ activeEditorTabPath }),
  addAiChangedPaths: (paths) =>
    set((s) => ({
      recentlyAiChangedPaths: Array.from(new Set([...s.recentlyAiChangedPaths, ...paths])),
    })),
  clearAiChangedPaths: () => set({ recentlyAiChangedPaths: [] }),
  setPendingComposerInsert: (pendingComposerInsert) => set({ pendingComposerInsert }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth: Math.max(200, Math.min(380, sidebarWidth)) }),
  setInspectorVisible: (inspectorVisible) => set({ inspectorVisible }),
  setInspectorWidth: (inspectorWidth) => set({ inspectorWidth: Math.max(240, Math.min(440, inspectorWidth)) }),
  setDevConsoleOpen: (devConsoleOpen) => set({ devConsoleOpen }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setConversationSearch: (conversationSearch) => set({ conversationSearch }),

  setActiveChatRunId: (activeChatRunId) => set({ activeChatRunId }),
  appendStreamingText: (delta) =>
    set((s) => ({ streamingText: s.streamingText + delta })),
  clearStreamingState: () =>
    set({ activeChatRunId: null, streamingText: "", streamingToolCalls: [] }),
  upsertStreamingToolCall: (tc) =>
    set((s) => {
      const idx = s.streamingToolCalls.findIndex((item) => item.id === tc.id);
      if (idx === -1) {
        return { streamingToolCalls: [...s.streamingToolCalls, tc] };
      }
      const next = [...s.streamingToolCalls];
      next[idx] = tc;
      return { streamingToolCalls: next };
    }),
  setRunningTaskCount: (runningTaskCount) => set({ runningTaskCount }),
  setLastTokenUsage: (lastTokenUsage) => set({ lastTokenUsage }),
  pushApprovalRequest: (req) =>
    set((s) => ({ approvalQueue: [...s.approvalQueue, req] })),
  shiftApprovalRequest: (id) =>
    set((s) => ({ approvalQueue: s.approvalQueue.filter((r) => r.id !== id) })),
}));
