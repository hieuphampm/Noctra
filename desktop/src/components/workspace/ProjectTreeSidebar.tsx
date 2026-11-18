import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Edit2,
  Eye,
  EyeOff,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  MessageSquarePlus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api, isTauriRuntime } from "@/services/tauri";
import { useAppStore } from "@/stores/appStore";
import { useI18n } from "@/i18n";
import type { ProjectTreeNode, ProjectWorkspace } from "@/types/noctra";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/utils/cn";

interface ProjectTreeSidebarProps {
  project: ProjectWorkspace;
  onImportFolder?: () => void;
  onMentionFile?: (relativePath: string) => void;
  compact?: boolean;
}

function filterTree(nodes: ProjectTreeNode[], query: string): ProjectTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const out: ProjectTreeNode[] = [];
  for (const node of nodes) {
    if (node.isDir) {
      const filteredChildren = filterTree(node.children ?? [], q);
      if (node.name.toLowerCase().includes(q) || filteredChildren.length > 0) {
        out.push({ ...node, children: filteredChildren });
      }
    } else if (
      node.name.toLowerCase().includes(q) ||
      node.relativePath.toLowerCase().includes(q)
    ) {
      out.push(node);
    }
  }
  return out;
}

export function ProjectTreeSidebar({
  project,
  onImportFolder,
  onMentionFile,
  compact = false,
}: ProjectTreeSidebarProps) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const openTabs = useAppStore((s) => s.openEditorTabs);
  const activeTabPath = useAppStore((s) => s.activeEditorTabPath);
  const openEditorTab = useAppStore((s) => s.openEditorTab);
  const closeEditorTab = useAppStore((s) => s.closeEditorTab);
  const aiChangedPaths = useAppStore((s) => s.recentlyAiChangedPaths);
  const setPendingComposerInsert = useAppStore((s) => s.setPendingComposerInsert);

  const [tab, setTab] = React.useState<"explorer" | "search">("explorer");
  const [includeIgnored, setIncludeIgnored] = React.useState(false);
  const [fileFilter, setFileFilter] = React.useState("");
  const [expandedDirs, setExpandedDirs] = React.useState<Record<string, boolean>>({});
  const [creatingMode, setCreatingMode] = React.useState<{
    kind: "file" | "dir";
    parentDir: string;
  } | null>(null);
  const [createName, setCreateName] = React.useState("");
  const [renamingPath, setRenamingPath] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchSubmitted, setSearchSubmitted] = React.useState("");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const {
    data: tree = [],
    isFetching: treeLoading,
    refetch: refetchTree,
  } = useQuery({
    queryKey: ["project-tree", project.id, includeIgnored],
    queryFn: () => api.getProjectTree(project.id, includeIgnored),
    enabled: Boolean(project.id) && isTauriRuntime(),
  });

  const { data: metadata } = useQuery({
    queryKey: ["project-metadata", project.id],
    queryFn: () => api.inspectProjectMetadata(project.id),
    enabled: Boolean(project.id) && isTauriRuntime(),
  });

  const { data: searchMatches = [], isFetching: searching } = useQuery({
    queryKey: ["project-search", project.id, searchSubmitted],
    queryFn: () => api.searchProjectFiles(project.id, searchSubmitted, false),
    enabled: Boolean(project.id && searchSubmitted.trim()) && isTauriRuntime(),
  });

  const visibleTree = React.useMemo(
    () => filterTree(tree, fileFilter),
    [tree, fileFilter]
  );

  const openFile = async (relativePath: string, targetLine?: number) => {
    setErrorMsg(null);
    try {
      const rich = await api.readProjectFileRich(project.id, relativePath);
      const name = relativePath.split("/").pop() || relativePath;
      openEditorTab({
        projectId: project.id,
        relativePath: rich.relativePath,
        name,
        kind: rich.kind,
        content: rich.content ?? "",
        savedContent: rich.content ?? "",
        dataUrl: rich.dataUrl,
        sizeBytes: rich.sizeBytes,
        language: rich.language,
        targetLine,
      });
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creatingMode || !createName.trim()) return;
    setErrorMsg(null);
    const cleanName = createName.trim().replace(/^[/\\]+/, "");
    const rel = creatingMode.parentDir
      ? `${creatingMode.parentDir}/${cleanName}`
      : cleanName;
    try {
      if (creatingMode.kind === "dir") {
        await api.createProjectDir(project.id, rel);
        setExpandedDirs((prev) => ({
          ...prev,
          ...(creatingMode.parentDir ? { [creatingMode.parentDir]: true } : {}),
          [rel]: true,
        }));
      } else {
        await api.writeProjectFile(project.id, rel, "");
        if (creatingMode.parentDir) {
          setExpandedDirs((prev) => ({ ...prev, [creatingMode.parentDir]: true }));
        }
        await openFile(rel);
      }
      setCreatingMode(null);
      setCreateName("");
      await qc.invalidateQueries({ queryKey: ["project-tree", project.id] });
      await qc.invalidateQueries({ queryKey: ["project-metadata", project.id] });
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingPath || !renameValue.trim()) return;
    setErrorMsg(null);
    const parts = renamingPath.split("/");
    parts[parts.length - 1] = renameValue.trim();
    const targetRel = parts.join("/");
    if (targetRel === renamingPath) {
      setRenamingPath(null);
      return;
    }
    try {
      await api.renameProjectEntry(project.id, renamingPath, targetRel);
      closeEditorTab(project.id, renamingPath);
      setRenamingPath(null);
      await qc.invalidateQueries({ queryKey: ["project-tree", project.id] });
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const handleDeleteEntry = async (node: ProjectTreeNode) => {
    const ok = window.confirm(`Delete '${node.relativePath}' from disk?`);
    if (!ok) return;
    setErrorMsg(null);
    try {
      await api.deleteProjectFile(project.id, node.relativePath);
      closeEditorTab(project.id, node.relativePath);
      await qc.invalidateQueries({ queryKey: ["project-tree", project.id] });
      await qc.invalidateQueries({ queryKey: ["project-metadata", project.id] });
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const mentionInChat = (relativePath: string) => {
    if (onMentionFile) {
      onMentionFile(relativePath);
    } else {
      setPendingComposerInsert(`@${relativePath} `);
    }
  };

  const renderNode = (node: ProjectTreeNode, depth: number) => {
    const isExpanded = Boolean(fileFilter.trim()) || Boolean(expandedDirs[node.relativePath]);
    const openTab = openTabs.find(
      (t) => t.projectId === project.id && t.relativePath === node.relativePath
    );
    const isDirty = Boolean(openTab && openTab.content !== openTab.savedContent);
    const isAiChanged = aiChangedPaths.includes(node.relativePath);
    const isSelected = activeTabPath === node.relativePath;

    if (renamingPath === node.relativePath) {
      return (
        <form
          key={node.relativePath}
          onSubmit={handleRenameSubmit}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          className="pr-2 py-0.5"
        >
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => setRenamingPath(null)}
            className="h-6 text-[11px]"
          />
        </form>
      );
    }

    return (
      <div key={node.relativePath}>
        <div
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => {
            if (node.isDir) {
              setExpandedDirs((prev) => ({
                ...prev,
                [node.relativePath]: !prev[node.relativePath],
              }));
            } else {
              openFile(node.relativePath);
            }
          }}
          className={`group flex items-center justify-between gap-1 pr-2 py-1 rounded-md text-[11px] cursor-pointer select-none ${
            isSelected
              ? "bg-[#191E2C] text-[#67DDF2]"
              : "text-[#F3F4F8]/90 hover:bg-[#191E2C]/60"
          }`}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {node.isDir ? (
              <>
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3 shrink-0 text-[#9399AA]" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0 text-[#9399AA]" />
                )}
                {isExpanded ? (
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#A78BFA]" />
                ) : (
                  <Folder className="h-3.5 w-3.5 shrink-0 text-[#A78BFA]" />
                )}
              </>
            ) : (
              <>
                <span className="w-3 shrink-0" />
                <FileText className="h-3.5 w-3.5 shrink-0 text-[#9399AA]" />
              </>
            )}
            <span className="truncate">{node.name}</span>
            {isDirty && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" title={t("projects.unsaved")} />
            )}
            {isAiChanged && !isDirty && (
              <span title={t("projects.aiUpdated")} className="shrink-0">
                <Sparkles className="h-3 w-3 text-emerald-400" />
              </span>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {!node.isDir && !compact && (
              <span className="text-[9px] text-[#9399AA] group-hover:hidden">
                {formatBytes(node.sizeBytes)}
              </span>
            )}
            <div className="hidden group-hover:flex items-center gap-0.5">
              {node.isDir && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCreatingMode({ kind: "file", parentDir: node.relativePath });
                      setCreateName("");
                    }}
                    title={t("projects.newFile")}
                    className="p-0.5 rounded hover:bg-[#252B3A] text-[#9399AA] hover:text-[#67DDF2]"
                  >
                    <FilePlus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCreatingMode({ kind: "dir", parentDir: node.relativePath });
                      setCreateName("");
                    }}
                    title={t("projects.newFolder")}
                    className="p-0.5 rounded hover:bg-[#252B3A] text-[#9399AA] hover:text-[#A78BFA]"
                  >
                    <FolderPlus className="h-3 w-3" />
                  </button>
                </>
              )}
              {!node.isDir && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    mentionInChat(node.relativePath);
                  }}
                  title={t("projects.askAiFile")}
                  className="p-0.5 rounded hover:bg-[#252B3A] text-[#9399AA] hover:text-[#67DDF2]"
                >
                  <MessageSquarePlus className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingPath(node.relativePath);
                  setRenameValue(node.name);
                }}
                title={t("projects.rename")}
                className="p-0.5 rounded hover:bg-[#252B3A] text-[#9399AA] hover:text-[#F3F4F8]"
              >
                <Edit2 className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteEntry(node);
                }}
                title={t("projects.delete")}
                className="p-0.5 rounded hover:bg-[#252B3A] text-[#9399AA] hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>

        {node.isDir &&
          isExpanded &&
          (node.children ?? []).map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-[#0D1018] border-r border-[#252B3A] overflow-hidden">
      {/* Project Header */}
      <div className="border-b border-[#252B3A] px-3 py-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#F3F4F8] truncate">
              {project.name}
            </div>
            <div className="text-[10px] font-mono text-[#9399AA] truncate" title={project.rootPath}>
              {project.rootPath}
            </div>
          </div>
          {onImportFolder && (
            <button
              type="button"
              onClick={onImportFolder}
              title={t("projects.importFolder")}
              className="shrink-0 rounded-lg border border-[#252B3A] bg-[#121622] px-2 py-1 text-[10px] text-[#67DDF2] hover:bg-[#191E2C] cursor-pointer"
            >
              {t("projects.importFolder")}
            </button>
          )}
        </div>

        {metadata && (
          <div className="flex flex-wrap items-center gap-1">
            {metadata.gitBranch && (
              <Badge variant="violet" className="text-[9px] py-0 px-1.5">
                <GitBranch className="h-2.5 w-2.5 mr-0.5" />
                {metadata.gitBranch}
              </Badge>
            )}
            {metadata.techStack.slice(0, 3).map((s) => (
              <Badge key={s} variant="cyan" className="text-[9px] py-0 px-1.5">
                {s}
              </Badge>
            ))}
            <span className="text-[9px] text-[#9399AA] ml-auto">
              {metadata.fileCount} files
            </span>
          </div>
        )}

        {/* Explorer vs Search Tabs */}
        <div className="flex items-center justify-between pt-1">
          <div className="inline-flex rounded-md border border-[#252B3A] bg-[#090B10] p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setTab("explorer")}
              className={`rounded px-2 py-0.5 cursor-pointer ${
                tab === "explorer" ? "bg-[#191E2C] text-[#67DDF2]" : "text-[#9399AA]"
              }`}
            >
              {t("projects.explorer")}
            </button>
            <button
              type="button"
              onClick={() => setTab("search")}
              className={`rounded px-2 py-0.5 cursor-pointer ${
                tab === "search" ? "bg-[#191E2C] text-[#A78BFA]" : "text-[#9399AA]"
              }`}
            >
              {t("projects.searchFiles")}
            </button>
          </div>

          {tab === "explorer" && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setCreatingMode({ kind: "file", parentDir: "" });
                  setCreateName("");
                }}
                title={t("projects.newFile")}
                className="rounded p-1 text-[#9399AA] hover:bg-[#191E2C] hover:text-[#67DDF2] cursor-pointer"
              >
                <FilePlus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreatingMode({ kind: "dir", parentDir: "" });
                  setCreateName("");
                }}
                title={t("projects.newFolder")}
                className="rounded p-1 text-[#9399AA] hover:bg-[#191E2C] hover:text-[#A78BFA] cursor-pointer"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIncludeIgnored(!includeIgnored)}
                title={t("projects.showIgnored")}
                className={`rounded p-1 hover:bg-[#191E2C] cursor-pointer ${
                  includeIgnored ? "text-[#A78BFA]" : "text-[#9399AA]"
                }`}
              >
                {includeIgnored ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => refetchTree()}
                title={t("projects.refresh")}
                className="rounded p-1 text-[#9399AA] hover:bg-[#191E2C] hover:text-[#F3F4F8] cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${treeLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="mx-2 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[10px] text-red-300">
          {errorMsg}
        </div>
      )}

      {tab === "explorer" ? (
        <>
          <div className="p-2 border-b border-[#252B3A]/60 space-y-1.5">
            <div className="relative">
              <Search className="h-3 w-3 text-[#9399AA] absolute left-2.5 top-2" />
              <input
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
                placeholder={t("projects.filterFiles")}
                className="h-7 w-full rounded-md border border-[#252B3A] bg-[#090B10] pl-7 pr-2 text-[11px] text-[#F3F4F8] placeholder:text-[#9399AA]/60 focus:border-[#67DDF2]/60 focus:outline-none"
              />
            </div>

            {creatingMode && (
              <form onSubmit={handleCreateSubmit} className="space-y-1 rounded-lg border border-[#67DDF2]/40 bg-[#121622] p-2">
                <div className="text-[10px] text-[#67DDF2]">
                  {creatingMode.kind === "file" ? t("projects.newFile") : t("projects.newFolder")}
                  {creatingMode.parentDir ? ` in ${creatingMode.parentDir}/` : ""}
                </div>
                <div className="flex gap-1">
                  <Input
                    autoFocus
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder={creatingMode.kind === "file" ? "src/notes.md" : "components"}
                    className="h-6 text-[11px]"
                  />
                  <button
                    type="submit"
                    className="rounded bg-[#67DDF2]/20 px-2 text-[10px] text-[#67DDF2] hover:bg-[#67DDF2]/30 cursor-pointer"
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatingMode(null)}
                    className="rounded px-1.5 text-[10px] text-[#9399AA] hover:text-[#F3F4F8] cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
            {visibleTree.map((n) => renderNode(n, 0))}
            {visibleTree.length === 0 && !treeLoading && (
              <div className="py-8 text-center text-[11px] text-[#9399AA]">
                {fileFilter ? "No matching files." : "Empty workspace folder."}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearchSubmitted(searchQuery);
            }}
            className="p-2 border-b border-[#252B3A]/60 flex gap-1.5"
          >
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("projects.searchPlaceholder")}
              className="h-7 text-[11px]"
            />
            <button
              type="submit"
              className="rounded-md bg-[#A78BFA]/20 px-2.5 text-[11px] text-[#A78BFA] hover:bg-[#A78BFA]/30 cursor-pointer"
            >
              Go
            </button>
          </form>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {searching && (
              <div className="text-[11px] text-[#9399AA] px-2 py-2">Searching...</div>
            )}
            {searchMatches.map((m, idx) => (
              <button
                key={`${m.relativePath}:${m.lineNumber}:${idx}`}
                type="button"
                onClick={() => openFile(m.relativePath, m.lineNumber)}
                className="w-full text-left rounded-lg border border-[#252B3A] bg-[#121622] hover:border-[#A78BFA]/50 p-2 cursor-pointer"
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-[#67DDF2]">
                  <span className="truncate">{m.relativePath}</span>
                  <span className="shrink-0 text-[#A78BFA]">:{m.lineNumber}</span>
                </div>
                <div className="mt-1 font-mono text-[10px] text-[#9399AA] truncate">
                  {m.lineText.trim()}
                </div>
              </button>
            ))}
            {!searching && searchSubmitted && searchMatches.length === 0 && (
              <div className="py-8 text-center text-[11px] text-[#9399AA]">
                No matches found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
