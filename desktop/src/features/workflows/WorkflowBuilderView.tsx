import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  GitBranch,
  Link2,
  Pause,
  Play,
  Plus,
  Save,
  Square,
  Trash2,
} from "lucide-react";
import { api, isTauriRuntime } from "@/services/tauri";
import { useI18n } from "@/i18n";
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowRunRecord,
} from "@/types/noctra";
import { Button } from "@/components/ui/button";
import { Card, Select } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const NODE_TYPES: Array<{ type: WorkflowNode["nodeType"]; label: string; color: string }> = [
  { type: "start", label: "Start", color: "#10B981" },
  { type: "input", label: "Input", color: "#67DDF2" },
  { type: "agent", label: "AI Agent", color: "#A78BFA" },
  { type: "mcp_tool", label: "MCP Tool", color: "#38BDF8" },
  { type: "skill", label: "Skill", color: "#C084FC" },
  { type: "conditional", label: "Conditional", color: "#F59E0B" },
  { type: "approval", label: "Approval", color: "#FB7185" },
  { type: "delay", label: "Delay", color: "#94A3B8" },
  { type: "output", label: "Output", color: "#2DD4BF" },
  { type: "end", label: "End", color: "#EF4444" },
];

function createDefaultWorkflow(): WorkflowDefinition {
  return {
    id: "",
    name: "New Agent Workflow",
    description: "Multi-step automated workflow",
    nodes: [
      { id: "n-start", nodeType: "start", label: "Start", x: 60, y: 120, config: {} },
      {
        id: "n-input",
        nodeType: "input",
        label: "Task Input",
        x: 260,
        y: 120,
        config: { key: "prompt", defaultValue: "Summarize key findings" },
      },
      { id: "n-end", nodeType: "end", label: "End", x: 480, y: 120, config: {} },
    ],
    edges: [
      { id: "e-1", source: "n-start", target: "n-input", condition: null },
      { id: "e-2", source: "n-input", target: "n-end", condition: null },
    ],
    maxAgentDepth: 3,
    maxTotalToolCalls: 25,
    maxDurationSecs: 300,
    createdAt: "",
    updatedAt: "",
  };
}

export function WorkflowBuilderView() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: api.listWorkflows,
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
  const { data: skills = [] } = useQuery({
    queryKey: ["skills"],
    queryFn: api.listSkills,
    enabled: isTauriRuntime(),
  });
  const { data: runs = [] } = useQuery({
    queryKey: ["workflow-runs"],
    queryFn: () => api.listWorkflowRuns(),
    enabled: isTauriRuntime(),
  });

  const [wf, setWf] = React.useState<WorkflowDefinition>(createDefaultWorkflow);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>("n-input");
  const [connectFrom, setConnectFrom] = React.useState<string | null>(null);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [runInputPrompt, setRunInputPrompt] = React.useState("Analyze workspace status");
  const [activeRun, setActiveRun] = React.useState<WorkflowRunRecord | null>(null);
  const [validationErrors, setValidationErrors] = React.useState<string[]>([]);
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    api.onWorkflowRunUpdate((run) => {
      setActiveRun(run);
      qc.invalidateQueries({ queryKey: ["workflow-runs"] });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [qc]);

  const selectedNode = wf.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const addNode = (nodeType: WorkflowNode["nodeType"], label: string) => {
    const id = `n-${Date.now().toString(36)}`;
    const next: WorkflowNode = {
      id,
      nodeType,
      label,
      x: 120 + (wf.nodes.length % 4) * 170,
      y: 80 + Math.floor(wf.nodes.length / 4) * 120,
      config:
        nodeType === "agent"
          ? { agentId: agents[0]?.id ?? "", promptTemplate: "{{lastOutput}}" }
          : nodeType === "delay"
          ? { delayMs: 500 }
          : nodeType === "conditional"
          ? { contains: "approved" }
          : {},
    };
    setWf({ ...wf, nodes: [...wf.nodes, next] });
    setSelectedNodeId(id);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(12, Math.round(e.clientX - rect.left - 75));
    const y = Math.max(12, Math.round(e.clientY - rect.top - 26));
    setWf((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === draggingId ? { ...n, x, y } : n)),
    }));
  };

  const handleConnect = (targetId: string) => {
    if (!connectFrom || connectFrom === targetId) {
      setConnectFrom(null);
      return;
    }
    const edgeId = `e-${Date.now().toString(36)}`;
    setWf((prev) => ({
      ...prev,
      edges: [
        ...prev.edges,
        { id: edgeId, source: connectFrom, target: targetId, condition: null },
      ],
    }));
    setConnectFrom(null);
  };

  const handleSave = async () => {
    const errs = await api.validateWorkflow(wf);
    setValidationErrors(errs);
    const saved = await api.saveWorkflow(wf);
    await qc.invalidateQueries({ queryKey: ["workflows"] });
    setWf(saved);
    setStatusMsg(`Saved workflow '${saved.name}'.`);
  };

  const handleRun = async () => {
    let id = wf.id;
    if (!id) {
      const saved = await api.saveWorkflow(wf);
      setWf(saved);
      id = saved.id;
    }
    setStatusMsg(null);
    const run = await api.runWorkflow(id, { prompt: runInputPrompt });
    setActiveRun(run);
    await qc.invalidateQueries({ queryKey: ["workflow-runs"] });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#252B3A] bg-[#0D1018] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-[#A78BFA]" />
          <Input
            className="w-56"
            value={wf.name}
            onChange={(e) => setWf({ ...wf, name: e.target.value })}
          />
          <Select
            value={wf.id}
            onChange={(id) => {
              const found = workflows.find((w) => w.id === id);
              if (found) setWf(found);
            }}
          >
            <option value="">{t("workflows.loadSaved")}</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" onClick={() => setWf(createDefaultWorkflow())}>
            <Plus className="h-3.5 w-3.5" />
            {t("workflows.new")}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Input
            className="w-52"
            value={runInputPrompt}
            onChange={(e) => setRunInputPrompt(e.target.value)}
            placeholder="Initial workflow input..."
          />
          <Button size="sm" variant="secondary" onClick={handleSave}>
            <Save className="h-3.5 w-3.5" />
            {t("workflows.save")}
          </Button>
          <Button size="sm" onClick={handleRun}>
            <Play className="h-3.5 w-3.5" />
            {t("workflows.run")}
          </Button>
          {activeRun && activeRun.status === "running" && (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => api.pauseWorkflowRun(activeRun.id)}
              >
                <Pause className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => api.cancelWorkflowRun(activeRun.id)}
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {activeRun && activeRun.status === "paused" && (
            <Button
              size="sm"
              variant="cyan"
              onClick={() => api.resumeWorkflowRun(activeRun.id)}
            >
              <Play className="h-3.5 w-3.5" />
              Resume
            </Button>
          )}
        </div>
      </div>

      {/* Node Palette */}
      <div className="flex items-center gap-1.5 border-b border-[#252B3A] bg-[#121622] px-4 py-1.5 overflow-x-auto">
        <span className="text-[10px] uppercase tracking-wider text-[#9399AA] mr-1">
          Add Node:
        </span>
        {NODE_TYPES.map((nt) => (
          <button
            key={nt.type}
            onClick={() => addNode(nt.type, nt.label)}
            className="rounded-md border border-[#252B3A] bg-[#090B10] px-2.5 py-1 text-[11px] text-[#F3F4F8] hover:border-[#A78BFA]/60 cursor-pointer whitespace-nowrap"
          >
            + {nt.label}
          </button>
        ))}
      </div>

      {validationErrors.length > 0 && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-1.5 text-xs text-amber-300">
          {validationErrors.join(" • ")}
        </div>
      )}
      {statusMsg && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/30 px-4 py-1.5 text-xs text-emerald-300">
          {statusMsg}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Visual Graph Canvas */}
        <div
          className="relative flex-1 overflow-auto bg-[#090B10]"
          style={{
            backgroundImage: "radial-gradient(#252B3A 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={() => setDraggingId(null)}
        >
          <svg className="pointer-events-none absolute inset-0 h-full w-full min-h-[600px] min-w-[900px]">
            {wf.edges.map((edge) => {
              const src = wf.nodes.find((n) => n.id === edge.source);
              const dst = wf.nodes.find((n) => n.id === edge.target);
              if (!src || !dst) return null;
              const x1 = src.x + 156;
              const y1 = src.y + 28;
              const x2 = dst.x;
              const y2 = dst.y + 28;
              const cx = (x1 + x2) / 2;
              return (
                <g key={edge.id}>
                  <path
                    d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke="#A78BFA"
                    strokeWidth={2}
                    strokeOpacity={0.7}
                  />
                  {edge.condition && (
                    <text
                      x={cx}
                      y={(y1 + y2) / 2 - 6}
                      fill="#67DDF2"
                      fontSize="10"
                      textAnchor="middle"
                    >
                      {edge.condition}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {wf.nodes.map((node) => {
            const meta = NODE_TYPES.find((t) => t.type === node.nodeType);
            const isActive = activeRun?.currentNodeId === node.id;
            return (
              <div
                key={node.id}
                style={{ left: node.x, top: node.y }}
                onMouseDown={() => {
                  setSelectedNodeId(node.id);
                  setDraggingId(node.id);
                }}
                onClick={() => {
                  if (connectFrom) handleConnect(node.id);
                }}
                className={`absolute w-40 select-none rounded-xl border bg-[#121622] p-2.5 shadow-lg cursor-grab active:cursor-grabbing ${
                  isActive
                    ? "border-[#67DDF2] ring-2 ring-[#67DDF2]/40"
                    : selectedNodeId === node.id
                    ? "border-[#A78BFA]"
                    : "border-[#252B3A]"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider"
                    style={{ color: meta?.color ?? "#A78BFA" }}
                  >
                    {node.nodeType}
                  </span>
                  <button
                    type="button"
                    title="Connect from this node"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConnectFrom(connectFrom === node.id ? null : node.id);
                    }}
                    className={`rounded p-0.5 cursor-pointer ${
                      connectFrom === node.id
                        ? "bg-[#67DDF2]/20 text-[#67DDF2]"
                        : "text-[#9399AA] hover:text-[#F3F4F8]"
                    }`}
                  >
                    <Link2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="mt-1 text-xs font-medium text-[#F3F4F8] truncate">
                  {node.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Node Config & Run Timeline Sidebar */}
        <div className="w-80 border-l border-[#252B3A] bg-[#0D1018] flex flex-col overflow-y-auto p-4 space-y-4">
          {selectedNode ? (
            <Card className="p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="violet">{selectedNode.nodeType}</Badge>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setWf((prev) => ({
                      ...prev,
                      nodes: prev.nodes.filter((n) => n.id !== selectedNode.id),
                      edges: prev.edges.filter(
                        (e) =>
                          e.source !== selectedNode.id && e.target !== selectedNode.id
                      ),
                    }));
                    setSelectedNodeId(null);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <div>
                <label className="block text-[11px] text-[#9399AA] mb-1">Label</label>
                <Input
                  value={selectedNode.label}
                  onChange={(e) =>
                    setWf((prev) => ({
                      ...prev,
                      nodes: prev.nodes.map((n) =>
                        n.id === selectedNode.id ? { ...n, label: e.target.value } : n
                      ),
                    }))
                  }
                />
              </div>

              {selectedNode.nodeType === "agent" && (
                <>
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">Agent</label>
                    <Select
                      className="w-full"
                      value={String(selectedNode.config.agentId ?? "")}
                      onChange={(val) =>
                        setWf((prev) => ({
                          ...prev,
                          nodes: prev.nodes.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, config: { ...n.config, agentId: val } }
                              : n
                          ),
                        }))
                      }
                    >
                      <option value="">Select Agent...</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">
                      Prompt Template
                    </label>
                    <Textarea
                      rows={3}
                      value={String(selectedNode.config.promptTemplate ?? "{{lastOutput}}")}
                      onChange={(e) =>
                        setWf((prev) => ({
                          ...prev,
                          nodes: prev.nodes.map((n) =>
                            n.id === selectedNode.id
                              ? {
                                  ...n,
                                  config: { ...n.config, promptTemplate: e.target.value },
                                }
                              : n
                          ),
                        }))
                      }
                    />
                  </div>
                </>
              )}

              {selectedNode.nodeType === "mcp_tool" && (
                <div className="space-y-2">
                  <Select
                    className="w-full"
                    value={String(selectedNode.config.serverId ?? "")}
                    onChange={(val) =>
                      setWf((prev) => ({
                        ...prev,
                        nodes: prev.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, config: { ...n.config, serverId: val } }
                            : n
                        ),
                      }))
                    }
                  >
                    <option value="">Select MCP Server...</option>
                    {mcpServers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    placeholder="Tool name"
                    value={String(selectedNode.config.toolName ?? "")}
                    onChange={(e) =>
                      setWf((prev) => ({
                        ...prev,
                        nodes: prev.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, config: { ...n.config, toolName: e.target.value } }
                            : n
                        ),
                      }))
                    }
                  />
                </div>
              )}

              {selectedNode.nodeType === "skill" && (
                <Select
                  className="w-full"
                  value={String(selectedNode.config.skillId ?? "")}
                  onChange={(val) =>
                    setWf((prev) => ({
                      ...prev,
                      nodes: prev.nodes.map((n) =>
                        n.id === selectedNode.id
                          ? { ...n, config: { ...n.config, skillId: val } }
                          : n
                      ),
                    }))
                  }
                >
                  <option value="">Select Skill...</option>
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}

              {selectedNode.nodeType === "conditional" && (
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">
                    Output contains text
                  </label>
                  <Input
                    value={String(selectedNode.config.contains ?? "")}
                    onChange={(e) =>
                      setWf((prev) => ({
                        ...prev,
                        nodes: prev.nodes.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, config: { ...n.config, contains: e.target.value } }
                            : n
                        ),
                      }))
                    }
                  />
                </div>
              )}
            </Card>
          ) : (
            <div className="text-xs text-[#9399AA]">
              Click a node to configure it, or click its link icon then another node to connect.
            </div>
          )}

          {/* Execution Timeline */}
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-[#9399AA]">
              Execution Timeline
            </div>
            {activeRun ? (
              <Card className="p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{activeRun.workflowName}</span>
                  <Badge
                    variant={
                      activeRun.status === "completed"
                        ? "success"
                        : activeRun.status === "failed"
                        ? "danger"
                        : "cyan"
                    }
                  >
                    {activeRun.status}
                  </Badge>
                </div>
                {activeRun.error && (
                  <div className="text-red-400 text-[11px]">{activeRun.error}</div>
                )}
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {activeRun.events.map((ev, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-[#252B3A] bg-[#090B10] p-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[#F3F4F8]">{ev.nodeLabel}</span>
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      </div>
                      <div className="text-[10px] text-[#9399AA]">{ev.detail}</div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <div className="space-y-1.5">
                {runs.slice(0, 5).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setActiveRun(r)}
                    className="w-full rounded-lg border border-[#252B3A] bg-[#121622] p-2 text-left text-xs hover:bg-[#191E2C] cursor-pointer"
                  >
                    <div className="flex justify-between">
                      <span className="font-medium truncate">{r.workflowName}</span>
                      <Badge variant="default">{r.status}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
