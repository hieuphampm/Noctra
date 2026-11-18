import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  FolderOpen,
  GitBranch,
  Github,
  Package,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api, isTauriRuntime } from "@/services/tauri";
import type { GitHubSkillPreview, SkillRecord } from "@/types/noctra";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card, Switch } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

const SKILL_TEMPLATE = `---
name: custom-research-skill
description: Structured research methodology with verified citations.
category: research
version: 0.1.0
dependencies: []
---
# Instructions
1. Clarify the core question and constraints.
2. Separate verified primary evidence from hypotheses.
3. Return a concise executive summary followed by supporting details.
`;

export function SkillsCenterView() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: skills = [] } = useQuery({
    queryKey: ["skills"],
    queryFn: api.listSkills,
    enabled: isTauriRuntime(),
  });

  const [mode, setMode] = React.useState<"library" | "github" | "editor">("library");
  const [search, setSearch] = React.useState("");
  const [selectedSkill, setSelectedSkill] = React.useState<SkillRecord | null>(null);

  // GitHub Inspector
  const [repoUrl, setRepoUrl] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [subdir, setSubdir] = React.useState("");
  const [commitRef, setCommitRef] = React.useState("");
  const [previews, setPreviews] = React.useState<GitHubSkillPreview[]>([]);
  const [previewFilter, setPreviewFilter] = React.useState("");
  const [selectedPreview, setSelectedPreview] = React.useState<GitHubSkillPreview | null>(null);

  // Editor state
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editorText, setEditorText] = React.useState(SKILL_TEMPLATE);
  const [previewMode, setPreviewMode] = React.useState(false);
  const [activeFileRel, setActiveFileRel] = React.useState<string>("SKILL.md");
  const [supportingContent, setSupportingContent] = React.useState("");

  const [busy, setBusy] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);

  const openSkillInEditor = (sk: SkillRecord) => {
    setEditingId(sk.id);
    setEditorText(sk.instructionsMd);
    setSelectedSkill(sk);
    setActiveFileRel("SKILL.md");
    setMode("editor");
    setErrorMsg(null);
    setStatusMsg(null);
  };

  const handleImportLocalFolder = async () => {
    try {
      const folder = await openDialog({ directory: true });
      if (!folder || Array.isArray(folder)) return;
      const sk = await api.importLocalSkill(folder);
      await qc.invalidateQueries({ queryKey: ["skills"] });
      setSelectedSkill(sk);
      setStatusMsg(`Imported local skill '${sk.name}'.`);
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const handleImportZip = async () => {
    try {
      const file = await openDialog({ filters: [{ name: "ZIP", extensions: ["zip"] }] });
      if (!file || Array.isArray(file)) return;
      const sk = await api.importZipSkill(file);
      await qc.invalidateQueries({ queryKey: ["skills"] });
      setSelectedSkill(sk);
      setStatusMsg(`Imported ZIP skill '${sk.name}'.`);
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const handleInspectGitHub = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    setPreviews([]);
    setSelectedPreview(null);
    try {
      const list = await api.inspectGitHubSkills({
        repoUrl,
        branch: branch || undefined,
        subdirectory: subdir || undefined,
        commitRef: commitRef || undefined,
      });
      setPreviews(list);
      setSelectedPreview(list[0] ?? null);
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmInstallGitHub = async () => {
    if (!selectedPreview) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const installed = await api.installGitHubSkill(selectedPreview);
      await qc.invalidateQueries({ queryKey: ["skills"] });
      setSelectedSkill(installed);
      setMode("library");
      setStatusMsg(`Installed skill '${installed.name}' from GitHub (scripts were NOT executed).`);
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleInstallAllGitHub = async () => {
    if (previews.length === 0) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      let lastInstalled: SkillRecord | null = null;
      for (const p of previews) {
        lastInstalled = await api.installGitHubSkill(p);
      }
      await qc.invalidateQueries({ queryKey: ["skills"] });
      if (lastInstalled) setSelectedSkill(lastInstalled);
      setMode("library");
      setStatusMsg(
        `Installed ${previews.length} skill(s) from GitHub (scripts were NOT executed).`
      );
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEditor = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      if (activeFileRel === "SKILL.md") {
        const saved = await api.saveSkill(editingId, editorText);
        await qc.invalidateQueries({ queryKey: ["skills"] });
        setEditingId(saved.id);
        setSelectedSkill(saved);
        setStatusMsg(`Saved '${saved.name}'.`);
      } else if (editingId) {
        const saved = await api.writeSkillFile(editingId, activeFileRel, supportingContent);
        await qc.invalidateQueries({ queryKey: ["skills"] });
        setSelectedSkill(saved);
        setStatusMsg(`Saved '${activeFileRel}'.`);
      }
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const filtered = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#252B3A] bg-[#0D1018] px-5 py-2.5">
        <div className="flex items-center gap-3">
          <Sparkles className="h-4 w-4 text-[#A78BFA]" />
          <span className="text-sm font-semibold text-[#F3F4F8]">{t("skills.title")}</span>
          <div className="flex items-center gap-1 rounded-lg border border-[#252B3A] bg-[#090B10] p-0.5 text-xs">
            <button
              onClick={() => setMode("library")}
              className={`rounded-md px-3 py-1 cursor-pointer ${
                mode === "library"
                  ? "bg-[#191E2C] text-[#A78BFA] font-medium"
                  : "text-[#9399AA]"
              }`}
            >
              {t("skills.installed")} ({skills.length})
            </button>
            <button
              onClick={() => setMode("github")}
              className={`rounded-md px-3 py-1 cursor-pointer ${
                mode === "github"
                  ? "bg-[#191E2C] text-[#67DDF2] font-medium"
                  : "text-[#9399AA]"
              }`}
            >
              {t("skills.github")}
            </button>
            <button
              onClick={() => {
                setEditingId(null);
                setEditorText(SKILL_TEMPLATE);
                setActiveFileRel("SKILL.md");
                setMode("editor");
              }}
              className={`rounded-md px-3 py-1 cursor-pointer ${
                mode === "editor"
                  ? "bg-[#191E2C] text-[#F3F4F8] font-medium"
                  : "text-[#9399AA]"
              }`}
            >
              {t("skills.editor")}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={handleImportLocalFolder}>
            <FolderOpen className="h-3.5 w-3.5" />
            {t("skills.importFolder")}
          </Button>
          <Button size="sm" variant="secondary" onClick={handleImportZip}>
            <Package className="h-3.5 w-3.5" />
            {t("skills.importZip")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingId(null);
              setEditorText(SKILL_TEMPLATE);
              setActiveFileRel("SKILL.md");
              setMode("editor");
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            New Skill
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

      {mode === "library" && (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-80 border-r border-[#252B3A] bg-[#0D1018] flex flex-col">
            <div className="p-3 border-b border-[#252B3A]">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-[#9399AA] absolute left-2.5 top-2.5" />
                <Input
                  className="pl-8"
                  placeholder="Search installed skills..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filtered.map((sk) => (
                <div
                  key={sk.id}
                  onClick={() => setSelectedSkill(sk)}
                  className={`rounded-xl border p-3 cursor-pointer ${
                    selectedSkill?.id === sk.id
                      ? "border-[#A78BFA]/60 bg-[#191E2C]"
                      : "border-[#252B3A] bg-[#121622] hover:bg-[#191E2C]/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#F3F4F8] truncate">
                      {sk.name}
                    </span>
                    <Switch
                      checked={sk.enabled}
                      onCheckedChange={async (v) => {
                        await api.toggleSkill(sk.id, v);
                        qc.invalidateQueries({ queryKey: ["skills"] });
                      }}
                    />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Badge variant="violet">{sk.category}</Badge>
                    <Badge variant={sk.trustLevel === "trusted" ? "success" : "warning"}>
                      {sk.sourceType}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-[11px] text-[#9399AA] line-clamp-2">
                    {sk.description}
                  </p>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="py-12 text-center text-xs text-[#9399AA]">
                  No skills installed yet. Import from GitHub, a local folder, ZIP, or create one in the editor.
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {selectedSkill ? (
              <div className="max-w-3xl space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-[#F3F4F8]">
                      {selectedSkill.name}
                    </h2>
                    <p className="text-xs text-[#9399AA] mt-0.5">
                      {selectedSkill.description}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                      <Badge variant="cyan">v{selectedSkill.version}</Badge>
                      {selectedSkill.branchOrTag && (
                        <Badge variant="default">
                          <GitBranch className="h-3 w-3" />
                          {selectedSkill.branchOrTag}
                        </Badge>
                      )}
                      {selectedSkill.commitSha && (
                        <Badge variant="default">
                          {selectedSkill.commitSha.slice(0, 8)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openSkillInEditor(selectedSkill)}
                    >
                      Edit SKILL.md
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        await api.deleteSkill(selectedSkill.id);
                        setSelectedSkill(null);
                        qc.invalidateQueries({ queryKey: ["skills"] });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {selectedSkill.validationErrors.length > 0 && (
                  <Card className="p-3.5 border-amber-500/30 bg-amber-500/10 text-xs text-amber-300 space-y-1">
                    <div className="font-semibold">Validation Warnings:</div>
                    {selectedSkill.validationErrors.map((e, i) => (
                      <div key={i}>• {e}</div>
                    ))}
                  </Card>
                )}

                {selectedSkill.supportingFiles.length > 0 && (
                  <Card className="p-4">
                    <div className="text-[11px] uppercase tracking-wider text-[#9399AA] mb-2">
                      Supporting Files (Read-only Sandbox Inspection)
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedSkill.supportingFiles.map((f) => (
                        <Badge key={f.relativePath} variant="default">
                          <FileText className="h-3 w-3" />
                          {f.relativePath}
                        </Badge>
                      ))}
                    </div>
                  </Card>
                )}

                <Card className="p-5">
                  <MarkdownRenderer content={selectedSkill.instructionsMd} />
                </Card>
              </div>
            ) : (
              <div className="py-20 text-center text-xs text-[#9399AA]">
                Select a skill to inspect its metadata, source commit, supporting files, and instructions.
              </div>
            )}
          </div>
        </div>
      )}

      {mode === "github" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl space-y-5">
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2.5">
                <Github className="h-5 w-5 text-[#67DDF2]" />
                <div>
                  <h2 className="text-sm font-semibold text-[#F3F4F8]">
                    Inspect & Install Skills from GitHub
                  </h2>
                  <p className="text-xs text-[#9399AA]">
                    Retrieves repository metadata and previews SKILL.md BEFORE installing. Scripts are never executed automatically.
                  </p>
                </div>
              </div>

              <form onSubmit={handleInspectGitHub} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">
                      GitHub Link (repo, tree/main/..., blob/.../SKILL.md, raw, or *.github.io)
                    </label>
                    <Input
                      required
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      placeholder="https://github.com/owner/repo/tree/main/skills/subdomain"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">
                      Subdirectory / Domain Override (optional)
                    </label>
                    <Input
                      value={subdir}
                      onChange={(e) => setSubdir(e.target.value)}
                      placeholder="skills/subdomain (auto-detected from URL)"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">
                      Branch or Tag (optional)
                    </label>
                    <Input
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      placeholder="main (auto-detected from URL)"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">
                      Commit SHA (optional)
                    </label>
                    <Input
                      value={commitRef}
                      onChange={(e) => setCommitRef(e.target.value)}
                      placeholder="Pin exact commit"
                    />
                  </div>
                  <Button type="submit" disabled={busy}>
                    {busy ? "Inspecting..." : "Inspect Repository"}
                  </Button>
                </div>
              </form>
            </Card>

            {previews.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <div className="text-[11px] uppercase tracking-wider text-[#9399AA]">
                      Discovered Skills ({previews.length})
                    </div>
                    {previews.length > 1 && (
                      <Button
                        size="sm"
                        variant="cyan"
                        onClick={handleInstallAllGitHub}
                        disabled={busy}
                        className="h-6 px-2 text-[10px]"
                      >
                        Install All ({previews.length})
                      </Button>
                    )}
                  </div>
                  {previews.length > 4 && (
                    <Input
                      value={previewFilter}
                      onChange={(e) => setPreviewFilter(e.target.value)}
                      placeholder="Filter discovered skills..."
                      className="h-7 text-[11px]"
                    />
                  )}
                  <div className="max-h-96 overflow-y-auto space-y-1">
                    {previews
                      .filter((p) => {
                        const q = previewFilter.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          p.skillName.toLowerCase().includes(q) ||
                          p.subdirectory.toLowerCase().includes(q)
                        );
                      })
                      .map((p) => (
                        <button
                          key={`${p.subdirectory}-${p.skillName}`}
                          onClick={() => setSelectedPreview(p)}
                          className={`w-full rounded-lg p-2.5 text-left text-xs cursor-pointer ${
                            selectedPreview === p
                              ? "bg-[#191E2C] border border-[#67DDF2]/50 text-[#F3F4F8]"
                              : "hover:bg-[#191E2C]/60 text-[#9399AA]"
                          }`}
                        >
                          <div className="font-semibold text-[#F3F4F8]">{p.skillName}</div>
                          <div className="text-[10px] font-mono truncate">
                            {p.subdirectory || "/"}
                          </div>
                        </button>
                      ))}
                  </div>
                </Card>

                {selectedPreview && (
                  <Card className="md:col-span-2 p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-[#F3F4F8]">
                          {selectedPreview.skillName}
                        </h3>
                        <p className="text-xs text-[#9399AA]">
                          {selectedPreview.description}
                        </p>
                      </div>
                      <Button onClick={handleConfirmInstallGitHub} disabled={busy}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Confirm & Install
                      </Button>
                    </div>

                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <div>{selectedPreview.trustWarning}</div>
                        {selectedPreview.hasScripts && (
                          <div className="mt-1 font-semibold">
                            Contains scripts/ directory — scripts remain dormant and require explicit inspection.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-[11px] text-[#9399AA]">
                      Files ({selectedPreview.requiredFiles.length}):{" "}
                      <span className="font-mono text-[#F3F4F8]">
                        {selectedPreview.requiredFiles.join(", ")}
                      </span>
                    </div>

                    <pre className="max-h-72 overflow-auto rounded-lg border border-[#252B3A] bg-[#090B10] p-3 font-mono text-[11px] text-[#F3F4F8]">
                      {selectedPreview.skillMdRaw}
                    </pre>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {mode === "editor" && (
        <div className="flex flex-1 overflow-hidden">
          {/* File Tree */}
          <div className="w-60 border-r border-[#252B3A] bg-[#0D1018] p-3 space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-[#9399AA]">
              Skill Files
            </div>
            <button
              onClick={() => setActiveFileRel("SKILL.md")}
              className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs cursor-pointer ${
                activeFileRel === "SKILL.md"
                  ? "bg-[#191E2C] text-[#A78BFA]"
                  : "text-[#9399AA] hover:text-[#F3F4F8]"
              }`}
            >
              SKILL.md
            </button>
            {selectedSkill?.supportingFiles.map((f) => (
              <button
                key={f.relativePath}
                onClick={async () => {
                  const content = await api.readSkillFile(
                    selectedSkill.id,
                    f.relativePath
                  );
                  setActiveFileRel(f.relativePath);
                  setSupportingContent(content);
                }}
                className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs truncate cursor-pointer ${
                  activeFileRel === f.relativePath
                    ? "bg-[#191E2C] text-[#67DDF2]"
                    : "text-[#9399AA] hover:text-[#F3F4F8]"
                }`}
              >
                {f.relativePath}
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col p-5 space-y-3 overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#67DDF2]">{activeFileRel}</span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPreviewMode(!previewMode)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  {previewMode ? "Edit" : "Preview"}
                </Button>
                <Button size="sm" onClick={handleSaveEditor} disabled={busy}>
                  Save Skill
                </Button>
              </div>
            </div>

            {previewMode && activeFileRel === "SKILL.md" ? (
              <Card className="flex-1 overflow-y-auto p-5">
                <MarkdownRenderer content={editorText} />
              </Card>
            ) : (
              <Textarea
                className="flex-1 font-mono text-xs resize-none"
                value={activeFileRel === "SKILL.md" ? editorText : supportingContent}
                onChange={(e) =>
                  activeFileRel === "SKILL.md"
                    ? setEditorText(e.target.value)
                    : setSupportingContent(e.target.value)
                }
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
