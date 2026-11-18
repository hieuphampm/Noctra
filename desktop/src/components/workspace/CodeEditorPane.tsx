import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Code,
  Eye,
  FileCode2,
  MessageSquarePlus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/services/tauri";
import { useAppStore } from "@/stores/appStore";
import { useI18n } from "@/i18n";
import type { ProjectWorkspace } from "@/types/noctra";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { formatBytes } from "@/utils/cn";

interface CodeEditorPaneProps {
  project: ProjectWorkspace;
  onAskAiFile?: (relativePath: string) => void;
}

export function CodeEditorPane({ project, onAskAiFile }: CodeEditorPaneProps) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const openTabs = useAppStore((s) => s.openEditorTabs);
  const activeTabPath = useAppStore((s) => s.activeEditorTabPath);
  const setActiveTabPath = useAppStore((s) => s.setActiveEditorTabPath);
  const updateTabContent = useAppStore((s) => s.updateEditorTabContent);
  const markTabSaved = useAppStore((s) => s.markEditorTabSaved);
  const refreshTabFromDisk = useAppStore((s) => s.refreshEditorTabFromDisk);
  const closeTab = useAppStore((s) => s.closeEditorTab);
  const setPendingComposerInsert = useAppStore((s) => s.setPendingComposerInsert);

  const projectTabs = React.useMemo(
    () => openTabs.filter((tab) => tab.projectId === project.id),
    [openTabs, project.id]
  );
  const activeTab =
    projectTabs.find((tab) => tab.relativePath === activeTabPath) ?? projectTabs[0] ?? null;

  const [previewMd, setPreviewMd] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [cursorPos, setCursorPos] = React.useState({ line: 1, col: 1 });
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const gutterRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setPreviewMd(false);
    setStatusMsg(null);
    setErrorMsg(null);
  }, [activeTab?.relativePath]);

  // Jump to target line when opened from search results
  React.useEffect(() => {
    if (!activeTab?.targetLine || !textareaRef.current || activeTab.kind !== "text") return;
    const lines = activeTab.content.split("\n");
    const targetIdx = Math.max(0, Math.min(lines.length - 1, activeTab.targetLine - 1));
    let charOffset = 0;
    for (let i = 0; i < targetIdx; i++) {
      charOffset += lines[i].length + 1;
    }
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(charOffset, charOffset + (lines[targetIdx]?.length ?? 0));
    setCursorPos({ line: targetIdx + 1, col: 1 });
  }, [activeTab?.relativePath, activeTab?.targetLine]);

  const handleSave = async () => {
    if (!activeTab || activeTab.kind !== "text") return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await api.writeProjectFile(project.id, activeTab.relativePath, activeTab.content);
      markTabSaved(project.id, activeTab.relativePath, activeTab.content);
      setStatusMsg(`Saved ${activeTab.relativePath}`);
      await qc.invalidateQueries({ queryKey: ["project-tree", project.id] });
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReload = async () => {
    if (!activeTab) return;
    setErrorMsg(null);
    try {
      const rich = await api.readProjectFileRich(project.id, activeTab.relativePath);
      if (rich.kind === "text") {
        refreshTabFromDisk(project.id, activeTab.relativePath, rich.content ?? "");
        markTabSaved(project.id, activeTab.relativePath, rich.content ?? "");
      }
      setStatusMsg(`Reloaded ${activeTab.relativePath} from disk`);
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const handleDelete = async () => {
    if (!activeTab) return;
    if (!window.confirm(`Delete '${activeTab.relativePath}'?`)) return;
    try {
      await api.deleteProjectFile(project.id, activeTab.relativePath);
      closeTab(project.id, activeTab.relativePath);
      await qc.invalidateQueries({ queryKey: ["project-tree", project.id] });
      await qc.invalidateQueries({ queryKey: ["project-metadata", project.id] });
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const updateCursorFromEl = (el: HTMLTextAreaElement) => {
    const upto = el.value.slice(0, el.selectionStart);
    const parts = upto.split("\n");
    setCursorPos({ line: parts.length, col: (parts[parts.length - 1]?.length ?? 0) + 1 });
  };

  if (!activeTab) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[#090B10] p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#252B3A] bg-[#121622] mb-3">
          <FileCode2 className="h-6 w-6 text-[#67DDF2]" />
        </div>
        <div className="text-sm font-medium text-[#F3F4F8]">{project.name}</div>
        <p className="mt-1.5 max-w-sm text-xs text-[#9399AA]">
          Select any file from the Explorer tree to inspect or edit directly, or ask your AI agent to modify files inside this folder.
        </p>
      </div>
    );
  }

  const isDirty = activeTab.kind === "text" && activeTab.content !== activeTab.savedContent;
  const lineCount = activeTab.kind === "text" ? activeTab.content.split("\n").length : 0;

  return (
    <div className="flex flex-1 min-w-0 flex-col bg-[#090B10] overflow-hidden">
      {/* Multi-Tab Strip */}
      <div className="flex items-center overflow-x-auto border-b border-[#252B3A] bg-[#0D1018]">
        {projectTabs.map((tab) => {
          const active = tab.relativePath === activeTab.relativePath;
          const dirty = tab.kind === "text" && tab.content !== tab.savedContent;
          return (
            <div
              key={tab.relativePath}
              onClick={() => setActiveTabPath(tab.relativePath)}
              title={tab.relativePath}
              className={`group flex items-center gap-2 border-r border-[#252B3A] px-3 py-2 text-[11px] cursor-pointer shrink-0 max-w-[200px] ${
                active
                  ? "bg-[#090B10] text-[#F3F4F8] border-t-2 border-t-[#67DDF2]"
                  : "bg-[#0D1018] text-[#9399AA] hover:bg-[#121622] hover:text-[#F3F4F8]"
              }`}
            >
              <span className="truncate">{tab.name}</span>
              {dirty && (
                <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" title={t("projects.unsaved")} />
              )}
              {tab.aiModified && !dirty && (
                <span title={t("projects.aiUpdated")} className="shrink-0">
                  <Sparkles className="h-3 w-3 text-emerald-400" />
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (dirty && !window.confirm(`Close '${tab.name}' with unsaved changes?`)) {
                    return;
                  }
                  closeTab(project.id, tab.relativePath);
                }}
                className="rounded p-0.5 text-[#9399AA] opacity-60 hover:opacity-100 hover:bg-[#191E2C] hover:text-[#F3F4F8]"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* File Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#252B3A] bg-[#0D1018]/70 px-3 py-1.5 text-[11px]">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[#67DDF2] truncate">{activeTab.relativePath}</span>
          <Badge variant="default" className="text-[9px] py-0">
            {activeTab.language}
          </Badge>
          {isDirty && (
            <Badge variant="warning" className="text-[9px] py-0">
              {t("projects.unsaved")}
            </Badge>
          )}
          {activeTab.aiModified && (
            <Badge variant="success" className="text-[9px] py-0">
              {t("projects.aiUpdated")}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {activeTab.language === "markdown" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPreviewMd(!previewMd)}
              className="h-7 px-2 text-[11px]"
            >
              {previewMd ? <Code className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {previewMd ? t("projects.code") : t("projects.preview")}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (onAskAiFile) {
                onAskAiFile(activeTab.relativePath);
              } else {
                setPendingComposerInsert(`@${activeTab.relativePath} `);
              }
            }}
            className="h-7 px-2 text-[11px]"
          >
            <MessageSquarePlus className="h-3 w-3" />
            {t("projects.askAiFile")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReload}
            className="h-7 px-2 text-[11px]"
            title={t("projects.reloadFile")}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          {activeTab.kind === "text" && (
            <Button
              size="sm"
              variant={isDirty ? "default" : "secondary"}
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="h-7 px-2.5 text-[11px]"
            >
              <Save className="h-3 w-3" />
              {t("projects.saveFile")}
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            onClick={handleDelete}
            className="h-7 px-2 text-[11px]"
            title={t("projects.delete")}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="mx-3 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-300">
          {errorMsg}
        </div>
      )}
      {statusMsg && (
        <div className="mx-3 mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-300">
          {statusMsg}
        </div>
      )}

      {/* Editor Body */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {activeTab.kind === "image" && activeTab.dataUrl ? (
          <div className="flex h-full items-center justify-center p-6 overflow-auto bg-[#090B10]">
            <img
              src={activeTab.dataUrl}
              alt={activeTab.name}
              className="max-h-full max-w-full rounded-xl border border-[#252B3A] object-contain"
            />
          </div>
        ) : activeTab.kind === "binary" ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-xs text-[#9399AA]">
            <div>Binary or oversized file ({formatBytes(activeTab.sizeBytes)})</div>
            <div className="mt-1 text-[11px]">Inline text editing is disabled for binary files.</div>
          </div>
        ) : previewMd ? (
          <div className="h-full overflow-y-auto p-6">
            <div className="mx-auto max-w-3xl">
              <MarkdownRenderer content={activeTab.content} />
            </div>
          </div>
        ) : (
          <div className="flex h-full overflow-hidden">
            {/* Synchronized Line Numbers Gutter */}
            <div
              ref={gutterRef}
              aria-hidden="true"
              className="w-12 shrink-0 select-none overflow-hidden border-r border-[#252B3A]/70 bg-[#0D1018]/60 py-3 pr-2 text-right font-mono text-[11px] leading-[1.5rem] text-[#9399AA]/60"
            >
              {Array.from({ length: lineCount }, (_, idx) => (
                <div key={idx} className={cursorPos.line === idx + 1 ? "text-[#67DDF2]" : ""}>
                  {idx + 1}
                </div>
              ))}
            </div>

            {/* Code Editor Textarea */}
            <textarea
              ref={textareaRef}
              value={activeTab.content}
              spellCheck={false}
              onScroll={(e) => {
                if (gutterRef.current) {
                  gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                }
              }}
              onClick={(e) => updateCursorFromEl(e.currentTarget)}
              onKeyUp={(e) => updateCursorFromEl(e.currentTarget)}
              onChange={(e) => {
                updateTabContent(project.id, activeTab.relativePath, e.target.value);
                updateCursorFromEl(e.currentTarget);
                if (statusMsg) setStatusMsg(null);
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                  e.preventDefault();
                  handleSave();
                } else if (e.key === "Tab") {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const start = el.selectionStart;
                  const end = el.selectionEnd;
                  const next =
                    activeTab.content.slice(0, start) + "  " + activeTab.content.slice(end);
                  updateTabContent(project.id, activeTab.relativePath, next);
                  requestAnimationFrame(() => {
                    el.selectionStart = el.selectionEnd = start + 2;
                  });
                }
              }}
              className="flex-1 resize-none bg-[#090B10] px-4 py-3 font-mono text-xs leading-[1.5rem] text-[#F3F4F8] focus:outline-none overflow-auto whitespace-pre"
            />
          </div>
        )}
      </div>

      {/* Editor Footer */}
      <div className="flex items-center justify-between border-t border-[#252B3A] bg-[#0D1018] px-3 py-1 text-[10px] text-[#9399AA]">
        <span>
          {activeTab.kind === "text"
            ? `Ln ${cursorPos.line}, Col ${cursorPos.col} • ${lineCount} lines`
            : activeTab.kind.toUpperCase()}
        </span>
        <span>{formatBytes(activeTab.sizeBytes)} • UTF-8 • Ctrl+S to save</span>
      </div>
    </div>
  );
}
