import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Trash2,
} from "lucide-react";
import { api, isTauriRuntime } from "@/services/tauri";
import { useAppStore } from "@/stores/appStore";
import { useI18n } from "@/i18n";
import type { MarketplacePackageItem, MarketplaceSource } from "@/types/noctra";
import { Button } from "@/components/ui/button";
import { Card, Select } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";

export function MarketplaceView() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const setSection = useAppStore((s) => s.setActiveSection);

  const { data: sources = [] } = useQuery({
    queryKey: ["marketplace-sources"],
    queryFn: api.listMarketplaceSources,
    enabled: isTauriRuntime(),
  });
  const { data: agentTemplates = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: api.listAgents,
    enabled: isTauriRuntime(),
  });
  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: api.listWorkflows,
    enabled: isTauriRuntime(),
  });

  const [category, setCategory] = React.useState<
    "mcp" | "skills" | "agent_templates" | "workflow_templates"
  >("mcp");
  const [selectedSourceId, setSelectedSourceId] = React.useState<string>("");
  const [query, setQuery] = React.useState("");
  const [items, setItems] = React.useState<MarketplacePackageItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [inspectItem, setInspectItem] = React.useState<MarketplacePackageItem | null>(null);

  // Add custom source
  const [showAddSource, setShowAddSource] = React.useState(false);
  const [newSrc, setNewSrc] = React.useState<Partial<MarketplaceSource>>({
    name: "",
    kind: "mcp",
    adapterType: "json_catalog",
    url: "",
  });

  const matchingSources = sources.filter(
    (s) =>
      s.enabled &&
      ((category === "mcp" && s.kind === "mcp") ||
        (category === "skills" && s.kind === "skills"))
  );

  React.useEffect(() => {
    if (matchingSources.length > 0 && !matchingSources.some((s) => s.id === selectedSourceId)) {
      setSelectedSourceId(matchingSources[0].id);
    }
  }, [category, sources, selectedSourceId]);

  const fetchCatalog = async () => {
    if (!selectedSourceId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const list = await api.browseMarketplace(selectedSourceId, query || undefined);
      setItems(list);
    } catch (err) {
      setErrorMsg(String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const confirmInstallMcp = async (item: MarketplacePackageItem) => {
    await api.saveMcpServer({
      name: item.name,
      description: item.description,
      source: item.sourceName,
      trustLevel: item.trustLevel,
      transport: item.transport === "streamable_http" ? "streamable_http" : "stdio",
      endpointOrCommand: item.commandOrEndpoint || "",
      args: item.args,
      plainEnv: {},
      secretEnv: {},
      authType: "none",
      authConfig: {},
      autoReconnect: true,
      maxReconnects: 3,
      enabled: true,
    });
    await qc.invalidateQueries({ queryKey: ["mcp-servers"] });
    setInspectItem(null);
    setSection("mcp");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#252B3A] bg-[#0D1018] px-5 py-2.5">
        <div className="flex items-center gap-3">
          <Store className="h-4 w-4 text-[#A78BFA]" />
          <span className="text-sm font-semibold text-[#F3F4F8]">
            {t("marketplace.title")}
          </span>
          <div className="flex items-center gap-1 rounded-lg border border-[#252B3A] bg-[#090B10] p-0.5 text-xs">
            {(
              [
                ["mcp", t("marketplace.mcp")],
                ["skills", t("marketplace.skills")],
                ["agent_templates", t("marketplace.agentTemplates")],
                ["workflow_templates", t("marketplace.workflowTemplates")],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setCategory(k)}
                className={`rounded-md px-3 py-1 cursor-pointer ${
                  category === k
                    ? "bg-[#191E2C] text-[#A78BFA] font-medium"
                    : "text-[#9399AA]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowAddSource(!showAddSource)}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("marketplace.addSource")}
        </Button>
      </div>

      {showAddSource && (
        <div className="border-b border-[#252B3A] bg-[#121622] px-5 py-3 flex flex-wrap items-end gap-2">
          <Input
            className="w-44"
            placeholder="Source name"
            value={newSrc.name ?? ""}
            onChange={(e) => setNewSrc({ ...newSrc, name: e.target.value })}
          />
          <Select
            value={newSrc.kind ?? "mcp"}
            onChange={(v) =>
              setNewSrc({ ...newSrc, kind: v as MarketplaceSource["kind"] })
            }
          >
            <option value="mcp">MCP</option>
            <option value="skills">Skills</option>
          </Select>
          <Select
            value={newSrc.adapterType ?? "json_catalog"}
            onChange={(v) =>
              setNewSrc({
                ...newSrc,
                adapterType: v as MarketplaceSource["adapterType"],
              })
            }
          >
            <option value="json_catalog">JSON Catalog Adapter</option>
            <option value="mcp_registry">Official MCP Registry API</option>
            <option value="github_repo">GitHub Contents Directory</option>
          </Select>
          <Input
            className="flex-1 min-w-[240px]"
            placeholder="https://..."
            value={newSrc.url ?? ""}
            onChange={(e) => setNewSrc({ ...newSrc, url: e.target.value })}
          />
          <Button
            size="sm"
            onClick={async () => {
              if (!newSrc.name || !newSrc.url) return;
              await api.saveMarketplaceSource({
                id: "",
                name: newSrc.name,
                kind: newSrc.kind ?? "mcp",
                adapterType: newSrc.adapterType ?? "json_catalog",
                url: newSrc.url,
                enabled: true,
                builtin: false,
                createdAt: "",
              });
              await qc.invalidateQueries({ queryKey: ["marketplace-sources"] });
              setShowAddSource(false);
            }}
          >
            Add Source
          </Button>
        </div>
      )}

      {(category === "mcp" || category === "skills") && (
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Select
              className="w-72"
              value={selectedSourceId}
              onChange={(v) => setSelectedSourceId(v)}
            >
              {matchingSources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.adapterType})
                </option>
              ))}
            </Select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-3.5 w-3.5 text-[#9399AA] absolute left-2.5 top-2.5" />
              <Input
                className="pl-8"
                placeholder="Search registry or filter..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") fetchCatalog();
                }}
              />
            </div>
            <Button onClick={fetchCatalog} disabled={loading || !selectedSourceId}>
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Query Source
            </Button>
            {matchingSources.find((s) => s.id === selectedSourceId && !s.builtin) && (
              <Button
                variant="destructive"
                size="icon"
                onClick={async () => {
                  await api.deleteMarketplaceSource(selectedSourceId);
                  qc.invalidateQueries({ queryKey: ["marketplace-sources"] });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((item) => (
              <Card key={item.id} className="p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xs font-semibold text-[#F3F4F8]">{item.name}</h3>
                    <Badge
                      variant={item.trustLevel === "verified" ? "cyan" : "warning"}
                    >
                      {item.trustLevel === "verified" ? (
                        <ShieldCheck className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {item.trustLevel}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[#9399AA] line-clamp-3">
                    {item.description || "No description provided by source."}
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {item.version && <Badge variant="default">v{item.version}</Badge>}
                    {item.transport && <Badge variant="violet">{item.transport}</Badge>}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#252B3A]">
                  <span className="text-[10px] text-[#9399AA] truncate max-w-[140px]">
                    {item.sourceName}
                  </span>
                  <div className="flex gap-1.5">
                    {item.repositoryUrl && (
                      <a
                        href={item.repositoryUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-lg border border-[#252B3A] px-2 py-1 text-[11px] text-[#9399AA] hover:text-[#F3F4F8]"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <Button size="sm" onClick={() => setInspectItem(item)}>
                      Inspect & Install
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {!loading && items.length === 0 && !errorMsg && (
            <div className="py-16 text-center text-xs text-[#9399AA]">
              Click <strong>Query Source</strong> to fetch live packages from the selected external marketplace adapter.
            </div>
          )}
        </div>
      )}

      {category === "agent_templates" && (
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agentTemplates
            .filter((a) => a.isTemplate)
            .map((tpl) => (
              <Card key={tpl.id} className="p-4 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-[#F3F4F8]">{tpl.name}</h3>
                    <Badge variant="cyan">Built-in</Badge>
                  </div>
                  <div className="text-[11px] text-[#A78BFA] mt-0.5">{tpl.role}</div>
                  <p className="text-[11px] text-[#9399AA] mt-1.5">{tpl.description}</p>
                </div>
                <Button
                  size="sm"
                  onClick={async () => {
                    await api.duplicateAgent(tpl.id);
                    await qc.invalidateQueries({ queryKey: ["agents"] });
                    setSection("agents");
                  }}
                >
                  Use Template
                </Button>
              </Card>
            ))}
        </div>
      )}

      {category === "workflow_templates" && (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <Card className="p-4 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-[#F3F4F8]">
                Research → Analyze → Write → Review Pipeline
              </h3>
              <p className="text-[11px] text-[#9399AA] mt-0.5">
                Multi-stage sequential agent workflow with approval gate and structured output.
              </p>
            </div>
            <Button
              size="sm"
              onClick={async () => {
                await api.saveWorkflow({
                  id: "",
                  name: "Research → Analyst → Writer → Reviewer",
                  description: "End-to-end 4-stage multi-agent research report pipeline",
                  nodes: [
                    { id: "s", nodeType: "start", label: "Start", x: 40, y: 120, config: {} },
                    { id: "r", nodeType: "agent", label: "Research Agent", x: 220, y: 120, config: { agentId: "tpl-research", promptTemplate: "Research: {{input}}" } },
                    { id: "a", nodeType: "agent", label: "Analyst Agent", x: 420, y: 120, config: { agentId: "tpl-data", promptTemplate: "Analyze:\n{{lastOutput}}" } },
                    { id: "g", nodeType: "approval", label: "Review Gate", x: 620, y: 120, config: { message: "Approve draft for final writing?" } },
                    { id: "w", nodeType: "agent", label: "Writing Agent", x: 820, y: 120, config: { agentId: "tpl-writer", promptTemplate: "Produce final report:\n{{lastOutput}}" } },
                    { id: "e", nodeType: "end", label: "End", x: 1020, y: 120, config: {} },
                  ],
                  edges: [
                    { id: "e1", source: "s", target: "r", condition: null },
                    { id: "e2", source: "r", target: "a", condition: null },
                    { id: "e3", source: "a", target: "g", condition: null },
                    { id: "e4", source: "g", target: "w", condition: null },
                    { id: "e5", source: "w", target: "e", condition: null },
                  ],
                  maxAgentDepth: 3,
                  maxTotalToolCalls: 30,
                  maxDurationSecs: 300,
                  createdAt: "",
                  updatedAt: "",
                });
                await qc.invalidateQueries({ queryKey: ["workflows"] });
                setSection("workflows");
              }}
            >
              Install Template ({workflows.length} saved)
            </Button>
          </Card>
        </div>
      )}

      {/* Pre-Install Inspection & Confirmation Modal */}
      <Modal
        open={Boolean(inspectItem)}
        onClose={() => setInspectItem(null)}
        title={`Inspect Package: ${inspectItem?.name ?? ""}`}
        subtitle={`Source: ${inspectItem?.sourceName ?? ""} • Trust: ${inspectItem?.trustLevel ?? ""}`}
      >
        {inspectItem && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                External packages are treated as untrusted. Inspect the command, endpoint, and requested permissions carefully before confirming installation.
              </span>
            </div>
            <div>
              <div className="text-[#9399AA] mb-1">Description</div>
              <p className="text-[#F3F4F8]">{inspectItem.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[#9399AA] mb-1">Compatibility</div>
                <div className="rounded-lg border border-[#252B3A] bg-[#090B10] px-2.5 py-1.5">
                  {inspectItem.compatibility}
                </div>
              </div>
              <div>
                <div className="text-[#9399AA] mb-1">Transport</div>
                <div className="rounded-lg border border-[#252B3A] bg-[#090B10] px-2.5 py-1.5">
                  {inspectItem.transport ?? "Skill / Repository"}
                </div>
              </div>
            </div>
            {inspectItem.commandOrEndpoint && (
              <div>
                <div className="text-[#9399AA] mb-1">Command / Endpoint</div>
                <pre className="rounded-lg border border-[#252B3A] bg-[#090B10] p-2.5 font-mono text-[#67DDF2]">
                  {inspectItem.commandOrEndpoint} {inspectItem.args.join(" ")}
                </pre>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setInspectItem(null)}>
                Cancel
              </Button>
              {inspectItem.kind === "mcp" ? (
                <Button onClick={() => confirmInstallMcp(inspectItem)}>
                  Confirm & Configure MCP Server
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setInspectItem(null);
                    setSection("skills");
                  }}
                >
                  Open in Skills Center Installer
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
