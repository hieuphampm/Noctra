import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Copy,
  Download,
  Loader2,
  Play,
  Plus,
  Shield,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { api, isTauriRuntime } from "@/services/tauri";
import { useAppStore } from "@/stores/appStore";
import { useI18n } from "@/i18n";
import type {
  AgentConfig,
  MultiAgentStepResult,
  MultiAgentStepSpec,
} from "@/types/noctra";
import { Button } from "@/components/ui/button";
import { Card, Select, Switch } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

function blankAgent(): AgentConfig {
  return {
    id: "",
    name: "New Custom Agent",
    description: "",
    avatar: "bot",
    role: "Specialist Assistant",
    personality: "Clear, methodical, accurate",
    systemInstructions: "Follow instructions carefully and respect all permission boundaries.",
    providerId: null,
    modelId: null,
    temperature: 0.4,
    maxTokens: 4096,
    contextWindow: 32768,
    assignedMcpServerIds: [],
    enabledToolIds: [],
    assignedSkillIds: [],
    fileAccessMode: "project_only",
    allowedDirectories: [],
    internetAccess: false,
    externalApiAccess: false,
    autonomousExecution: false,
    requireApprovalSensitive: true,
    maxSteps: 12,
    maxToolCalls: 24,
    maxRuntimeSecs: 180,
    retryPolicy: "once",
    errorStrategy: "stop",
    memoryConfig: {
      conversationMemory: true,
      agentLocalMemory: true,
      projectMemory: true,
      retentionMessages: 30,
    },
    isTemplate: false,
    createdAt: "",
    updatedAt: "",
  };
}

export function AgentsView() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const setSection = useAppStore((s) => s.setActiveSection);
  const setActiveConvId = useAppStore((s) => s.setActiveConversationId);

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
  const { data: mcpServers = [] } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: api.listMcpServers,
    enabled: isTauriRuntime(),
  });
  const { data: mcpTools = [] } = useQuery({
    queryKey: ["mcp-tools"],
    queryFn: api.listMcpTools,
    enabled: isTauriRuntime(),
  });
  const { data: skills = [] } = useQuery({
    queryKey: ["skills"],
    queryFn: api.listSkills,
    enabled: isTauriRuntime(),
  });

  const [tab, setTab] = React.useState<"builder" | "orchestrate">("builder");
  const [form, setForm] = React.useState<AgentConfig>(blankAgent);
  const [allowedDirsText, setAllowedDirsText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Multi-Agent Pipeline State
  const [pipelinePrompt, setPipelinePrompt] = React.useState("");
  const [pipelineSteps, setPipelineSteps] = React.useState<MultiAgentStepSpec[]>([]);
  const [pipelineResults, setPipelineResults] = React.useState<MultiAgentStepResult[]>([]);

  const selectAgent = (ag: AgentConfig) => {
    setForm(ag);
    setAllowedDirsText(ag.allowedDirectories.join("\n"));
    setStatusMsg(null);
    setErrorMsg(null);
  };

  const toggleArr = (arr: string[], val: string): string[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const dirs = allowedDirsText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const saved = await api.saveAgent({
        ...form,
        isTemplate: false,
        allowedDirectories: dirs,
      });
      await qc.invalidateQueries({ queryKey: ["agents"] });
      selectAgent(saved);
      setStatusMsg(`Saved agent '${saved.name}'.`);
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleLaunchChat = async () => {
    if (!form.id) return;
    const validProvider = providers.find((p) => p.id === form.providerId) ?? providers[0];
    const conv = await api.createConversation({
      title: `Agent: ${form.name}`,
      mode: "agent",
      internetMode: form.internetAccess,
      agentId: form.id,
      providerId: validProvider?.id ?? null,
      model: form.modelId ?? validProvider?.modelId ?? null,
    });
    await qc.invalidateQueries({ queryKey: ["conversations"] });
    setActiveConvId(conv.id);
    setSection("chat");
  };

  const handleExportAgent = () => {
    const blob = new Blob([JSON.stringify(form, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.name.replace(/[^a-z0-9-_]+/gi, "_")}.agent.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportAgent = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as AgentConfig;
      parsed.id = "";
      parsed.isTemplate = false;
      const saved = await api.saveAgent(parsed);
      await qc.invalidateQueries({ queryKey: ["agents"] });
      selectAgent(saved);
      setStatusMsg(`Imported agent '${saved.name}'.`);
    } catch (err) {
      setErrorMsg(`Invalid agent JSON: ${err}`);
    }
  };

  const handleRunPipeline = async () => {
    if (!pipelinePrompt.trim() || pipelineSteps.length === 0) return;
    setBusy(true);
    setErrorMsg(null);
    setPipelineResults([]);
    try {
      const res = await api.runMultiAgentPipeline({
        initialPrompt: pipelinePrompt,
        steps: pipelineSteps,
      });
      setPipelineResults(res);
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#252B3A] bg-[#0D1018] px-5 py-2.5">
        <div className="flex items-center gap-3">
          <Bot className="h-4 w-4 text-[#A78BFA]" />
          <span className="text-sm font-semibold text-[#F3F4F8]">{t("agents.studio")}</span>
          <div className="flex items-center gap-1 rounded-lg border border-[#252B3A] bg-[#090B10] p-0.5 text-xs">
            <button
              onClick={() => setTab("builder")}
              className={`rounded-md px-3 py-1 cursor-pointer ${
                tab === "builder"
                  ? "bg-[#191E2C] text-[#A78BFA] font-medium"
                  : "text-[#9399AA]"
              }`}
            >
              {t("agents.builder")}
            </button>
            <button
              onClick={() => setTab("orchestrate")}
              className={`rounded-md px-3 py-1 cursor-pointer flex items-center gap-1.5 ${
                tab === "orchestrate"
                  ? "bg-[#191E2C] text-[#67DDF2] font-medium"
                  : "text-[#9399AA]"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              {t("agents.orchestrator")}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-[#252B3A] bg-[#191E2C] px-3 py-1.5 text-xs text-[#F3F4F8] hover:bg-[#212739] cursor-pointer">
            <Upload className="h-3.5 w-3.5" />
            {t("agents.import")}
            <input type="file" accept=".json" className="hidden" onChange={handleImportAgent} />
          </label>
          <Button
            size="sm"
            onClick={() => {
              setForm(blankAgent());
              setAllowedDirsText("");
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("agents.new")}
          </Button>
        </div>
      </div>

      {tab === "builder" ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Agents & Templates list */}
          <div className="w-72 border-r border-[#252B3A] bg-[#0D1018] overflow-y-auto p-3 space-y-2">
            {agents.map((ag) => (
              <div
                key={ag.id}
                onClick={() => selectAgent(ag)}
                className={`rounded-xl border p-3 cursor-pointer ${
                  form.id === ag.id
                    ? "border-[#A78BFA]/60 bg-[#191E2C]"
                    : "border-[#252B3A] bg-[#121622] hover:bg-[#191E2C]/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#F3F4F8] truncate">
                    {ag.name}
                  </span>
                  {ag.isTemplate && <Badge variant="cyan">Template</Badge>}
                </div>
                <div className="mt-0.5 text-[11px] text-[#A78BFA] truncate">
                  {ag.role}
                </div>
                <div className="mt-1 text-[10px] text-[#9399AA] flex gap-2">
                  <span>{ag.enabledToolIds.length} tools</span>
                  <span>•</span>
                  <span>{ag.assignedSkillIds.length} skills</span>
                </div>
              </div>
            ))}
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto p-6">
            <form onSubmit={handleSave} className="max-w-4xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-[#F3F4F8]">
                    {form.id ? form.name : "Create Custom Agent"}
                  </h2>
                  <p className="text-xs text-[#9399AA]">
                    Agents only see tools, skills, and directories you explicitly assign here.
                  </p>
                </div>
                {form.id && (
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="cyan" onClick={handleLaunchChat}>
                      <Play className="h-3.5 w-3.5" />
                      Run in Chat
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={async () => {
                        const dup = await api.duplicateAgent(form.id);
                        await qc.invalidateQueries({ queryKey: ["agents"] });
                        selectAgent(dup);
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="secondary" onClick={handleExportAgent}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    {!form.isTemplate && (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={async () => {
                          await api.deleteAgent(form.id);
                          await qc.invalidateQueries({ queryKey: ["agents"] });
                          setForm(blankAgent());
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {errorMsg && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300">
                  {errorMsg}
                </div>
              )}
              {statusMsg && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-300">
                  {statusMsg}
                </div>
              )}

              {/* Identity */}
              <Card className="p-5 space-y-4">
                <div className="text-xs font-semibold text-[#A78BFA] uppercase tracking-wider">
                  1. Identity & Instructions
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">Agent Name</label>
                    <Input
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">Role</label>
                    <Input
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">Personality</label>
                    <Input
                      value={form.personality}
                      onChange={(e) => setForm({ ...form, personality: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">Description</label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">System Instructions</label>
                  <Textarea
                    rows={4}
                    value={form.systemInstructions}
                    onChange={(e) =>
                      setForm({ ...form, systemInstructions: e.target.value })
                    }
                  />
                </div>
              </Card>

              {/* AI Config */}
              <Card className="p-5 space-y-4">
                <div className="text-xs font-semibold text-[#67DDF2] uppercase tracking-wider">
                  2. AI Configuration
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">Provider</label>
                    <Select
                      className="w-full"
                      value={
                        providers.some((p) => p.id === form.providerId)
                          ? (form.providerId ?? "")
                          : ""
                      }
                      onChange={(v) => setForm({ ...form, providerId: v || null })}
                    >
                      <option value="">Use Default Provider</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">Model Override</label>
                    <Input
                      value={form.modelId ?? ""}
                      onChange={(e) => setForm({ ...form, modelId: e.target.value || null })}
                      placeholder="Provider default"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">Temperature</label>
                    <Input
                      type="number"
                      step="0.05"
                      value={form.temperature}
                      onChange={(e) =>
                        setForm({ ...form, temperature: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">Max Output Tokens</label>
                    <Input
                      type="number"
                      value={form.maxTokens}
                      onChange={(e) =>
                        setForm({ ...form, maxTokens: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
              </Card>

              {/* Capabilities */}
              <Card className="p-5 space-y-4">
                <div className="text-xs font-semibold text-[#A78BFA] uppercase tracking-wider">
                  3. Capabilities: MCP Tools, Skills & Permissions
                </div>

                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1.5">
                    Assigned MCP Servers
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {mcpServers.map((srv) => {
                      const active = form.assignedMcpServerIds.includes(srv.id);
                      return (
                        <button
                          key={srv.id}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              assignedMcpServerIds: toggleArr(
                                form.assignedMcpServerIds,
                                srv.id
                              ),
                            })
                          }
                          className={`rounded-lg border px-2.5 py-1 text-xs cursor-pointer ${
                            active
                              ? "border-[#67DDF2] bg-[#67DDF2]/15 text-[#67DDF2]"
                              : "border-[#252B3A] bg-[#090B10] text-[#9399AA]"
                          }`}
                        >
                          {srv.name}
                        </button>
                      );
                    })}
                    {mcpServers.length === 0 && (
                      <span className="text-xs text-[#9399AA]">No MCP servers configured.</span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1.5">
                    Explicitly Enabled MCP Tools (Agent sees ONLY checked tools)
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-44 overflow-y-auto">
                    {mcpTools.map((tool) => {
                      const active = form.enabledToolIds.includes(tool.id);
                      return (
                        <label
                          key={tool.id}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs cursor-pointer ${
                            active
                              ? "border-[#A78BFA]/60 bg-[#A78BFA]/10"
                              : "border-[#252B3A] bg-[#090B10]"
                          }`}
                        >
                          <span className="truncate">
                            <span className="font-mono text-[#67DDF2]">{tool.name}</span>
                            <span className="text-[#9399AA] ml-1.5">({tool.serverName})</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() =>
                              setForm({
                                ...form,
                                enabledToolIds: toggleArr(form.enabledToolIds, tool.id),
                              })
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1.5">
                    Assigned Skills
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {skills.map((sk) => {
                      const active = form.assignedSkillIds.includes(sk.id);
                      return (
                        <button
                          key={sk.id}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              assignedSkillIds: toggleArr(form.assignedSkillIds, sk.id),
                            })
                          }
                          className={`rounded-lg border px-2.5 py-1 text-xs cursor-pointer ${
                            active
                              ? "border-[#A78BFA] bg-[#A78BFA]/20 text-[#A78BFA]"
                              : "border-[#252B3A] bg-[#090B10] text-[#9399AA]"
                          }`}
                        >
                          {sk.name}
                        </button>
                      );
                    })}
                    {skills.length === 0 && (
                      <span className="text-xs text-[#9399AA]">No skills installed yet.</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">
                      File Access Scope
                    </label>
                    <Select
                      className="w-full"
                      value={form.fileAccessMode}
                      onChange={(v) =>
                        setForm({
                          ...form,
                          fileAccessMode: v as AgentConfig["fileAccessMode"],
                        })
                      }
                    >
                      <option value="none">None (No Filesystem)</option>
                      <option value="project_only">Active Project Directory Only</option>
                      <option value="allowlist">Explicit Directory Allowlist</option>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[#252B3A] bg-[#090B10] px-3 py-2 mt-4">
                    <span className="text-xs">Internet Access</span>
                    <Switch
                      checked={form.internetAccess}
                      onCheckedChange={(v) => setForm({ ...form, internetAccess: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[#252B3A] bg-[#090B10] px-3 py-2 mt-4">
                    <span className="text-xs">External APIs</span>
                    <Switch
                      checked={form.externalApiAccess}
                      onCheckedChange={(v) =>
                        setForm({ ...form, externalApiAccess: v })
                      }
                    />
                  </div>
                </div>

                {form.fileAccessMode === "allowlist" && (
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">
                      Allowed Directories (one per line)
                    </label>
                    <Textarea
                      rows={2}
                      className="font-mono"
                      value={allowedDirsText}
                      onChange={(e) => setAllowedDirsText(e.target.value)}
                    />
                  </div>
                )}
              </Card>

              {/* Behavior & Memory */}
              <Card className="p-5 space-y-4">
                <div className="text-xs font-semibold text-[#67DDF2] uppercase tracking-wider flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  4. Execution Limits, Safety & Memory
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">Max Steps</label>
                    <Input
                      type="number"
                      min="1"
                      value={form.maxSteps}
                      onChange={(e) =>
                        setForm({ ...form, maxSteps: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">Max Tool Calls</label>
                    <Input
                      type="number"
                      min="0"
                      value={form.maxToolCalls}
                      onChange={(e) =>
                        setForm({ ...form, maxToolCalls: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">Max Runtime (s)</label>
                    <Input
                      type="number"
                      min="10"
                      value={form.maxRuntimeSecs}
                      onChange={(e) =>
                        setForm({ ...form, maxRuntimeSecs: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">Retry Policy</label>
                    <Select
                      className="w-full"
                      value={form.retryPolicy}
                      onChange={(v) =>
                        setForm({
                          ...form,
                          retryPolicy: v as AgentConfig["retryPolicy"],
                        })
                      }
                    >
                      <option value="none">None</option>
                      <option value="once">Retry Once</option>
                      <option value="exponential">Exponential</option>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between rounded-lg border border-[#252B3A] bg-[#090B10] px-3 py-2">
                    <span className="text-xs">Require Approval for Sensitive Actions</span>
                    <Switch
                      checked={form.requireApprovalSensitive}
                      onCheckedChange={(v) =>
                        setForm({ ...form, requireApprovalSensitive: v })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[#252B3A] bg-[#090B10] px-3 py-2">
                    <span className="text-xs">Autonomous Execution</span>
                    <Switch
                      checked={form.autonomousExecution}
                      onCheckedChange={(v) =>
                        setForm({ ...form, autonomousExecution: v })
                      }
                    />
                  </div>
                </div>
              </Card>

              <div className="flex justify-end">
                <Button type="submit" disabled={busy}>
                  {form.id ? "Save Agent Changes" : "Create Agent"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl space-y-5">
            <Card className="p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[#F3F4F8]">
                  Multi-Agent Orchestration Pipeline
                </h2>
                <p className="text-xs text-[#9399AA]">
                  Chain specialized agents sequentially or in parallel groups (sharing the same group name) with bounded recursion depth.
                </p>
              </div>

              <div>
                <label className="block text-[11px] text-[#9399AA] mb-1">
                  Initial Objective / Prompt
                </label>
                <Textarea
                  rows={3}
                  value={pipelinePrompt}
                  onChange={(e) => setPipelinePrompt(e.target.value)}
                  placeholder="Describe the goal to hand off across your agent team..."
                />
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#F3F4F8]">
                    Pipeline Stages ({pipelineSteps.length})
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setPipelineSteps((prev) => [
                        ...prev,
                        {
                          agentId: agents[0]?.id ?? "",
                          label: `Stage ${prev.length + 1}`,
                          taskTemplate:
                            prev.length === 0
                              ? "{{input}}"
                              : "Review and build upon the previous output:\n\n{{previous}}",
                          parallelGroup: null,
                        },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Stage
                  </Button>
                </div>

                {pipelineSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-[#252B3A] bg-[#090B10] p-3 space-y-2"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <Input
                        value={step.label}
                        onChange={(e) => {
                          const next = [...pipelineSteps];
                          next[idx].label = e.target.value;
                          setPipelineSteps(next);
                        }}
                        placeholder="Stage label (e.g., Research, Review)"
                      />
                      <Select
                        value={step.agentId}
                        onChange={(v) => {
                          const next = [...pipelineSteps];
                          next[idx].agentId = v;
                          setPipelineSteps(next);
                        }}
                      >
                        {agents.map((ag) => (
                          <option key={ag.id} value={ag.id}>
                            {ag.name}
                          </option>
                        ))}
                      </Select>
                      <div className="flex gap-2">
                        <Input
                          value={step.parallelGroup ?? ""}
                          onChange={(e) => {
                            const next = [...pipelineSteps];
                            next[idx].parallelGroup = e.target.value || null;
                            setPipelineSteps(next);
                          }}
                          placeholder="Parallel group (optional)"
                        />
                        <Button
                          size="icon"
                          variant="destructive"
                          onClick={() =>
                            setPipelineSteps((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      rows={2}
                      value={step.taskTemplate}
                      onChange={(e) => {
                        const next = [...pipelineSteps];
                        next[idx].taskTemplate = e.target.value;
                        setPipelineSteps(next);
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleRunPipeline}
                  disabled={busy || !pipelinePrompt.trim() || pipelineSteps.length === 0}
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Execute Multi-Agent Pipeline
                </Button>
              </div>
            </Card>

            {errorMsg && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {errorMsg}
              </div>
            )}

            {pipelineResults.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9399AA]">
                  Live Execution Timeline
                </h3>
                {pipelineResults.map((res, idx) => (
                  <Card key={idx} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="violet">{res.label}</Badge>
                        <span className="text-xs font-semibold text-[#F3F4F8]">
                          {res.agentName}
                        </span>
                      </div>
                      <span className="text-[11px] text-[#9399AA]">
                        {res.toolCallsUsed} tool(s) • {res.durationMs} ms
                      </span>
                    </div>
                    <MarkdownRenderer content={res.output} />
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
