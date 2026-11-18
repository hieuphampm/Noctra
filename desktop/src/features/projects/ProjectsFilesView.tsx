import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  FolderKanban,
  FolderOpen,
  FolderPlus,
  MessageSquareCode,
  Plus,
  Trash2,
} from "lucide-react";
import { api, isTauriRuntime } from "@/services/tauri";
import { useAppStore } from "@/stores/appStore";
import { useI18n } from "@/i18n";
import { pickAndImportProjectFolder } from "@/utils/importProject";
import type { ProjectWorkspace } from "@/types/noctra";
import { Button } from "@/components/ui/button";
import { Card, Select } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProjectTreeSidebar } from "@/components/workspace/ProjectTreeSidebar";
import { CodeEditorPane } from "@/components/workspace/CodeEditorPane";

function blankProject(): ProjectWorkspace {
  return {
    id: "",
    name: "",
    description: "",
    rootPath: "",
    instructions: "",
    assignedAgentIds: [],
    assignedSkillIds: [],
    allowedToolIds: [],
    createdAt: "",
    updatedAt: "",
  };
}

export function ProjectsFilesView({
  initialTab = "projects",
}: {
  initialTab?: "projects" | "files";
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const setActiveConvId = useAppStore((s) => s.setActiveConversationId);
  const setWorkspaceSplitOpen = useAppStore((s) => s.setWorkspaceSplitOpen);
  const preferredExecutionMode = useAppStore((s) => s.preferredExecutionMode);
  const setPendingComposerInsert = useAppStore((s) => s.setPendingComposerInsert);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
    enabled: isTauriRuntime(),
  });
  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: api.listAgents,
    enabled: isTauriRuntime(),
  });
  const { data: providers = [] } = useQuery({
    queryKey: ["providers"],
    queryFn: api.listProviders,
    enabled: isTauriRuntime(),
  });
  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: api.listConversations,
    enabled: isTauriRuntime(),
  });

  const [tab, setTab] = React.useState<"projects" | "files">(initialTab);
  React.useEffect(() => setTab(initialTab), [initialTab]);

  const [form, setForm] = React.useState<ProjectWorkspace>(blankProject);
  const [importing, setImporting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);

  const selectedProject =
    projects.find((p) => p.id === activeProjectId) ??
    projects.find((p) => p.id === form.id) ??
    projects[0] ??
    null;

  React.useEffect(() => {
    if (selectedProject && !activeProjectId) {
      setActiveProjectId(selectedProject.id);
    }
  }, [selectedProject, activeProjectId, setActiveProjectId]);

  const handleImportFolder = async (openChatAfter = false) => {
    setErrorMsg(null);
    setStatusMsg(null);
    setImporting(true);
    try {
      const res = await pickAndImportProjectFolder({
        qc,
        providers,
        agents,
        openInChatSplit: openChatAfter,
      });
      if (res) {
        setForm(res.project);
        setStatusMsg(
          res.reusedExisting
            ? `Opened existing project '${res.project.name}' (${res.metadata.fileCount} files).`
            : `Imported folder '${res.project.name}' (${res.metadata.fileCount} files).`
        );
        if (!openChatAfter) {
          setTab("files");
        }
      }
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setImporting(false);
    }
  };

  const handleOpenInSplitChat = async (proj: ProjectWorkspace) => {
    setActiveProjectId(proj.id);
    setWorkspaceSplitOpen(true);
    const existingConv = conversations.find((c) => c.projectId === proj.id);
    if (existingConv) {
      setActiveConvId(existingConv.id);
      setActiveSection("chat");
      return;
    }
    const defaultAgent =
      proj.assignedAgentIds[0] ??
      agents.find((a) => a.id === "tpl-coding")?.id ??
      agents[0]?.id ??
      null;
    const prov = providers[0];
    const created = await api.createConversation({
      title: `Project: ${proj.name}`,
      mode: "agent",
      executionMode: preferredExecutionMode,
      providerId: prov?.id ?? null,
      model: prov?.modelId ?? null,
      agentId: defaultAgent,
      projectId: proj.id,
    });
    await qc.invalidateQueries({ queryKey: ["conversations"] });
    setActiveConvId(created.id);
    setActiveSection("chat");
  };

  const pickRootFolderForForm = async () => {
    const dir = await openDialog({ directory: true });
    if (dir && !Array.isArray(dir)) {
      setForm((prev) => ({
        ...prev,
        rootPath: dir,
        name: prev.name || dir.split(/[/\\]/).pop() || "Project",
      }));
    }
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const saved = await api.saveProject(form);
      await qc.invalidateQueries({ queryKey: ["projects"] });
      setForm(saved);
      setActiveProjectId(saved.id);
      setStatusMsg(`Saved project '${saved.name}'.`);
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const askAiAboutFile = async (relativePath: string) => {
    if (!selectedProject) return;
    setPendingComposerInsert(`Please inspect and help with @${relativePath} `);
    await handleOpenInSplitChat(selectedProject);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#252B3A] bg-[#0D1018] px-5 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <FolderKanban className="h-4 w-4 text-[#67DDF2]" />
          <span className="text-sm font-semibold text-[#F3F4F8]">
            {t("projects.workspaceIde")}
          </span>
          <div className="flex items-center gap-1 rounded-lg border border-[#252B3A] bg-[#090B10] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setTab("files")}
              className={`rounded-md px-3 py-1 cursor-pointer ${
                tab === "files"
                  ? "bg-[#191E2C] text-[#67DDF2] font-medium"
                  : "text-[#9399AA]"
              }`}
            >
              {t("projects.workspaceIde")}
            </button>
            <button
              type="button"
              onClick={() => setTab("projects")}
              className={`rounded-md px-3 py-1 cursor-pointer ${
                tab === "projects"
                  ? "bg-[#191E2C] text-[#A78BFA] font-medium"
                  : "text-[#9399AA]"
              }`}
            >
              {t("projects.manager")} ({projects.length})
            </button>
          </div>

          {projects.length > 0 && tab === "files" && (
            <Select
              value={selectedProject?.id ?? ""}
              onChange={(val) => setActiveProjectId(val || null)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selectedProject && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleOpenInSplitChat(selectedProject)}
            >
              <MessageSquareCode className="h-3.5 w-3.5 text-[#A78BFA]" />
              {t("projects.openInChat")}
            </Button>
          )}
          <Button
            size="sm"
            variant="cyan"
            disabled={importing}
            onClick={() => handleImportFolder(false)}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            {importing ? t("projects.importing") : t("projects.importFolder")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setForm(blankProject());
              setTab("projects");
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("projects.new")}
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="mx-5 mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300">
          {errorMsg}
        </div>
      )}
      {statusMsg && (
        <div className="mx-5 mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-300">
          {statusMsg}
        </div>
      )}

      {tab === "files" ? (
        selectedProject ? (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="w-72 shrink-0 h-full overflow-hidden">
              <ProjectTreeSidebar
                project={selectedProject}
                onImportFolder={() => handleImportFolder(false)}
                onMentionFile={askAiAboutFile}
              />
            </div>
            <CodeEditorPane project={selectedProject} onAskAiFile={askAiAboutFile} />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#67DDF2]/30 bg-[#67DDF2]/10 mb-4">
              <FolderPlus className="h-7 w-7 text-[#67DDF2]" />
            </div>
            <h2 className="text-base font-semibold text-[#F3F4F8]">
              Import a Project Folder
            </h2>
            <p className="mt-1.5 max-w-md text-xs text-[#9399AA] leading-relaxed">
              Select any local folder on your computer to browse its file tree, edit code across multiple tabs, and let AI agents assist in Review or Turbo mode.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <Button variant="cyan" onClick={() => handleImportFolder(false)}>
                <FolderPlus className="h-4 w-4" />
                {t("projects.importFolder")}
              </Button>
              <Button variant="secondary" onClick={() => setTab("projects")}>
                {t("projects.new")}
              </Button>
            </div>
          </div>
        )
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-76 border-r border-[#252B3A] bg-[#0D1018] overflow-y-auto p-3 space-y-2">
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  setForm(p);
                  setActiveProjectId(p.id);
                }}
                className={`rounded-xl border p-3 cursor-pointer transition-colors ${
                  selectedProject?.id === p.id
                    ? "border-[#67DDF2]/60 bg-[#191E2C]"
                    : "border-[#252B3A] bg-[#121622] hover:bg-[#191E2C]/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-[#F3F4F8] truncate">
                    {p.name}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveProjectId(p.id);
                      setTab("files");
                    }}
                    className="rounded px-1.5 py-0.5 text-[10px] bg-[#67DDF2]/15 text-[#67DDF2] hover:bg-[#67DDF2]/25 cursor-pointer"
                  >
                    IDE
                  </button>
                </div>
                <div className="mt-1 text-[10px] font-mono text-[#9399AA] truncate">
                  {p.rootPath}
                </div>
                {p.description && (
                  <div className="mt-1 text-[10px] text-[#9399AA]/80 truncate">
                    {p.description}
                  </div>
                )}
              </div>
            ))}
            {projects.length === 0 && (
              <div className="py-10 text-center text-xs text-[#9399AA]">
                Import a folder or create a project workspace to grant scoped directory access to your agents.
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <form onSubmit={handleSaveProject} className="max-w-3xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-[#F3F4F8]">
                  {form.id ? `Project: ${form.name}` : t("projects.createTitle")}
                </h2>
                {form.id && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleOpenInSplitChat(form)}
                    >
                      <MessageSquareCode className="h-3.5 w-3.5" />
                      {t("projects.openInChat")}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={async () => {
                        await api.deleteProject(form.id);
                        await qc.invalidateQueries({ queryKey: ["projects"] });
                        if (activeProjectId === form.id) setActiveProjectId(null);
                        setForm(blankProject());
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              <Card className="p-5 space-y-4">
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">Project Name</label>
                  <Input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">
                    Authorized Root Folder (Sandboxed Scope)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      required
                      value={form.rootPath}
                      onChange={(e) => setForm({ ...form, rootPath: e.target.value })}
                      placeholder="G:\projects\my-workspace"
                    />
                    <Button type="button" variant="secondary" onClick={pickRootFolderForForm}>
                      <FolderOpen className="h-3.5 w-3.5" />
                      Browse
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">
                    Project Instructions (Injected into Project Agents)
                  </label>
                  <Textarea
                    rows={4}
                    value={form.instructions}
                    onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1.5">
                    Assigned Agents
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {agents.map((ag) => {
                      const active = form.assignedAgentIds.includes(ag.id);
                      return (
                        <button
                          key={ag.id}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              assignedAgentIds: active
                                ? form.assignedAgentIds.filter((id) => id !== ag.id)
                                : [...form.assignedAgentIds, ag.id],
                            })
                          }
                          className={`rounded-lg border px-2.5 py-1 text-xs cursor-pointer ${
                            active
                              ? "border-[#A78BFA] bg-[#A78BFA]/20 text-[#A78BFA]"
                              : "border-[#252B3A] bg-[#090B10] text-[#9399AA]"
                          }`}
                        >
                          {ag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Card>

              <div className="flex justify-end">
                <Button type="submit">Save Project</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
