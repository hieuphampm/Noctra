import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  FileCode2,
  Loader2,
  Play,
  Plug,
  Power,
  PowerOff,
  Plus,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Trash2,
} from "lucide-react";
import { api, isTauriRuntime } from "@/services/tauri";
import type { McpServer, McpServerInput, McpTool } from "@/types/noctra";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card, Select, Switch } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const EMPTY_SERVER: McpServerInput = {
  id: null,
  name: "",
  description: "",
  source: "manual",
  trustLevel: "unverified",
  transport: "stdio",
  endpointOrCommand: "",
  args: [],
  plainEnv: {},
  secretEnv: {},
  authType: "none",
  authConfig: {},
  authSecret: "",
  autoReconnect: true,
  maxReconnects: 3,
  enabled: true,
};

export function McpHubView() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: servers = [] } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: api.listMcpServers,
    enabled: isTauriRuntime(),
  });
  const { data: tools = [] } = useQuery({
    queryKey: ["mcp-tools"],
    queryFn: api.listMcpTools,
    enabled: isTauriRuntime(),
  });
  const { data: resources = [] } = useQuery({
    queryKey: ["mcp-resources"],
    queryFn: () => api.listMcpResources(),
    enabled: isTauriRuntime(),
  });
  const { data: prompts = [] } = useQuery({
    queryKey: ["mcp-prompts"],
    queryFn: () => api.listMcpPrompts(),
    enabled: isTauriRuntime(),
  });

  const [tab, setTab] = React.useState<"servers" | "tools" | "resources" | "prompts">("servers");
  const [selectedServerId, setSelectedServerId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<McpServerInput>(EMPTY_SERVER);
  const [argsText, setArgsText] = React.useState("");
  const [plainEnvText, setPlainEnvText] = React.useState("{}");
  const [secretEnvText, setSecretEnvText] = React.useState("{}");
  const [authHeaderName, setAuthHeaderName] = React.useState("X-API-Key");

  // Tool Explorer state
  const [selectedTool, setSelectedTool] = React.useState<McpTool | null>(null);
  const [toolArgsJson, setToolArgsJson] = React.useState("{}");
  const [toolResult, setToolResult] = React.useState<string | null>(null);
  const [resourceOutput, setResourceOutput] = React.useState<string | null>(null);

  const [busy, setBusy] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);

  const selectServer = (s: McpServer) => {
    setSelectedServerId(s.id);
    setForm({
      id: s.id,
      name: s.name,
      description: s.description,
      source: s.source,
      trustLevel: s.trustLevel,
      transport: s.transport,
      endpointOrCommand: s.endpointOrCommand,
      args: s.args,
      plainEnv: s.plainEnv,
      secretEnv: {},
      authType: s.authType,
      authConfig: s.authConfig,
      authSecret: "",
      autoReconnect: s.autoReconnect,
      maxReconnects: s.maxReconnects,
      enabled: s.enabled,
    });
    setArgsText(s.args.join(" "));
    setPlainEnvText(JSON.stringify(s.plainEnv ?? {}, null, 2));
    setSecretEnvText("{}");
    setAuthHeaderName(String(s.authConfig?.headerName ?? "X-API-Key"));
    setErrorMsg(null);
    setStatusMsg(null);
  };

  const resetForm = () => {
    setSelectedServerId(null);
    setForm(EMPTY_SERVER);
    setArgsText("");
    setPlainEnvText("{}");
    setSecretEnvText("{}");
    setErrorMsg(null);
    setStatusMsg(null);
  };

  const refreshAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["mcp-servers"] }),
      qc.invalidateQueries({ queryKey: ["mcp-tools"] }),
      qc.invalidateQueries({ queryKey: ["mcp-resources"] }),
      qc.invalidateQueries({ queryKey: ["mcp-prompts"] }),
    ]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    let plainEnv: Record<string, string> = {};
    let secretEnv: Record<string, string> = {};
    try {
      plainEnv = JSON.parse(plainEnvText || "{}");
      secretEnv = JSON.parse(secretEnvText || "{}");
    } catch {
      setErrorMsg("Environment variables must be valid JSON objects.");
      return;
    }

    const args = argsText
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    setBusy(true);
    try {
      const saved = await api.saveMcpServer({
        ...form,
        args,
        plainEnv,
        secretEnv,
        authConfig:
          form.authType === "custom_header"
            ? { headerName: authHeaderName }
            : form.authConfig,
      });
      await refreshAll();
      selectServer(saved);
      setStatusMsg(`Saved MCP server '${saved.name}'.`);
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = async (id: string) => {
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const srv = await api.connectMcpServer(id);
      await refreshAll();
      selectServer(srv);
      setStatusMsg(`Connected to '${srv.name}' and discovered MCP capabilities.`);
    } catch (err) {
      setErrorMsg(String(err));
      await refreshAll();
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    setBusy(true);
    try {
      await api.disconnectMcpServer(id);
      await refreshAll();
      setStatusMsg("Disconnected server.");
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleTestTool = async () => {
    if (!selectedTool) return;
    setBusy(true);
    setErrorMsg(null);
    setToolResult(null);
    try {
      const args = JSON.parse(toolArgsJson || "{}");
      const res = await api.testMcpTool(
        selectedTool.serverId,
        selectedTool.name,
        args
      );
      setToolResult(JSON.stringify(res, null, 2));
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sub-navigation */}
      <div className="flex items-center justify-between border-b border-[#252B3A] bg-[#0D1018] px-5 py-2.5">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-[#67DDF2]" />
          <span className="text-sm font-semibold text-[#F3F4F8]">{t("mcp.title")}</span>
          <div className="ml-4 flex items-center gap-1 rounded-lg border border-[#252B3A] bg-[#090B10] p-0.5 text-xs">
            {(
              [
                ["servers", `${t("mcp.servers")} (${servers.length})`],
                ["tools", `${t("mcp.tools")} (${tools.length})`],
                ["resources", `${t("mcp.resources")} (${resources.length})`],
                ["prompts", `${t("mcp.prompts")} (${prompts.length})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-md px-3 py-1 cursor-pointer ${
                  tab === k
                    ? "bg-[#191E2C] text-[#A78BFA] font-medium"
                    : "text-[#9399AA] hover:text-[#F3F4F8]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Button size="sm" onClick={resetForm}>
          <Plus className="h-3.5 w-3.5" />
          {t("mcp.addServer")}
        </Button>
      </div>

      {tab === "servers" && (
        <div className="flex flex-1 overflow-hidden">
          {/* Server list */}
          <div className="w-72 border-r border-[#252B3A] bg-[#0D1018] overflow-y-auto p-3 space-y-2">
            {servers.map((s) => (
              <div
                key={s.id}
                onClick={() => selectServer(s)}
                className={`rounded-xl border p-3 cursor-pointer transition-colors ${
                  selectedServerId === s.id
                    ? "border-[#A78BFA]/60 bg-[#191E2C]"
                    : "border-[#252B3A] bg-[#121622] hover:bg-[#191E2C]/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#F3F4F8] truncate">
                    {s.name}
                  </span>
                  <Badge
                    variant={
                      s.status === "connected"
                        ? "success"
                        : s.status === "error"
                        ? "danger"
                        : "default"
                    }
                  >
                    {s.status}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[#9399AA]">
                  <span className="uppercase">{s.transport}</span>
                  <span>•</span>
                  <span
                    className={
                      s.trustLevel === "trusted"
                        ? "text-emerald-400"
                        : s.trustLevel === "verified"
                        ? "text-[#67DDF2]"
                        : "text-amber-400"
                    }
                  >
                    {s.trustLevel}
                  </span>
                </div>
                <div className="mt-1 text-[10px] font-mono text-[#9399AA]/80 truncate">
                  {s.endpointOrCommand}
                </div>
                {s.lastError && (
                  <div className="mt-1 text-[10px] text-red-400 truncate">
                    {s.lastError}
                  </div>
                )}
              </div>
            ))}
            {servers.length === 0 && (
              <div className="py-10 text-center text-xs text-[#9399AA]">
                No MCP servers configured. Add a local stdio server or remote Streamable HTTP endpoint.
              </div>
            )}
          </div>

          {/* Server Configuration */}
          <div className="flex-1 overflow-y-auto p-6">
            <form onSubmit={handleSave} className="max-w-3xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-[#F3F4F8]">
                    {selectedServerId ? form.name : t("mcp.configureTitle")}
                  </h2>
                  <p className="text-xs text-[#9399AA]">
                    Official MCP 2025-03-26 JSON-RPC over stdio & Streamable HTTP.
                  </p>
                </div>
                {selectedServerId && (
                  <div className="flex items-center gap-2">
                    {servers.find((s) => s.id === selectedServerId)?.status === "connected" ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleDisconnect(selectedServerId)}
                        disabled={busy}
                      >
                        <PowerOff className="h-3.5 w-3.5" />
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="cyan"
                        onClick={() => handleConnect(selectedServerId)}
                        disabled={busy}
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Power className="h-3.5 w-3.5" />
                        )}
                        Connect & Discover
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={async () => {
                        await api.deleteMcpServer(selectedServerId);
                        await refreshAll();
                        resetForm();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {form.trustLevel === "unverified" && (
                <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    Unverified external source: review executable arguments, working scope, and tool permissions before connecting.
                  </span>
                </div>
              )}

              {errorMsg && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
                  {errorMsg}
                </div>
              )}
              {statusMsg && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300">
                  {statusMsg}
                </div>
              )}

              <Card className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">Server Name</label>
                    <Input
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g., Filesystem MCP, GitHub MCP"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">Transport</label>
                    <Select
                      className="w-full"
                      value={form.transport}
                      onChange={(v) =>
                        setForm({ ...form, transport: v as "stdio" | "streamable_http" })
                      }
                    >
                      <option value="stdio">Local Stdio (Subprocess)</option>
                      <option value="streamable_http">Remote Streamable HTTP</option>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">Description</label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="What capabilities does this MCP server provide?"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">
                      {form.transport === "stdio" ? "Executable Command" : "Streamable HTTP Endpoint URL"}
                    </label>
                    <Input
                      required
                      value={form.endpointOrCommand}
                      onChange={(e) =>
                        setForm({ ...form, endpointOrCommand: e.target.value })
                      }
                      placeholder={
                        form.transport === "stdio"
                          ? "npx, uvx, node, python..."
                          : "https://example.com/mcp"
                      }
                    />
                  </div>
                  {form.transport === "stdio" ? (
                    <div>
                      <label className="block text-[11px] text-[#9399AA] mb-1">
                        Arguments (space-separated)
                      </label>
                      <Input
                        value={argsText}
                        onChange={(e) => setArgsText(e.target.value)}
                        placeholder="-y @modelcontextprotocol/server-filesystem C:\workspace"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] text-[#9399AA] mb-1">
                        Authentication
                      </label>
                      <Select
                        className="w-full"
                        value={form.authType}
                        onChange={(v) => setForm({ ...form, authType: v })}
                      >
                        <option value="none">None</option>
                        <option value="bearer">Bearer Token</option>
                        <option value="oauth">OAuth Access Token</option>
                        <option value="custom_header">Custom Header</option>
                      </Select>
                    </div>
                  )}
                </div>

                {form.transport === "streamable_http" && form.authType !== "none" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {form.authType === "custom_header" && (
                      <div>
                        <label className="block text-[11px] text-[#9399AA] mb-1">
                          Header Name
                        </label>
                        <Input
                          value={authHeaderName}
                          onChange={(e) => setAuthHeaderName(e.target.value)}
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] text-[#9399AA] mb-1">
                        Auth Token / Secret (OS Keychain)
                      </label>
                      <Input
                        type="password"
                        value={form.authSecret ?? ""}
                        onChange={(e) => setForm({ ...form, authSecret: e.target.value })}
                        placeholder="Stored securely in OS Credential Manager"
                      />
                    </div>
                  </div>
                )}

                {form.transport === "stdio" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] text-[#9399AA] mb-1">
                        Plain Environment Variables (JSON)
                      </label>
                      <Textarea
                        rows={3}
                        className="font-mono"
                        value={plainEnvText}
                        onChange={(e) => setPlainEnvText(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#9399AA] mb-1">
                        Secret Environment Variables (JSON → OS Keychain)
                      </label>
                      <Textarea
                        rows={3}
                        className="font-mono"
                        value={secretEnvText}
                        onChange={(e) => setSecretEnvText(e.target.value)}
                        placeholder='{"GITHUB_TOKEN": "ghp_..."}'
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center pt-1">
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">Trust Level</label>
                    <Select
                      className="w-full"
                      value={form.trustLevel}
                      onChange={(v) => setForm({ ...form, trustLevel: v })}
                    >
                      <option value="trusted">Trusted (Local / User Owned)</option>
                      <option value="verified">Verified Registry</option>
                      <option value="unverified">Unverified External</option>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9399AA] mb-1">
                      Max Reconnect Attempts
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={form.maxReconnects}
                      onChange={(e) =>
                        setForm({ ...form, maxReconnects: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[#252B3A] bg-[#090B10] px-3 py-2 mt-4">
                    <span className="text-xs text-[#F3F4F8]">Auto-Reconnect</span>
                    <Switch
                      checked={form.autoReconnect}
                      onCheckedChange={(v) => setForm({ ...form, autoReconnect: v })}
                    />
                  </div>
                </div>
              </Card>

              <div className="flex justify-end gap-2">
                <Button type="submit" disabled={busy}>
                  {selectedServerId ? "Update Server" : "Save MCP Server"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tab === "tools" && (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-80 border-r border-[#252B3A] bg-[#0D1018] overflow-y-auto p-3 space-y-2">
            {tools.map((tool) => (
              <div
                key={tool.id}
                onClick={() => {
                  setSelectedTool(tool);
                  setToolArgsJson("{}");
                  setToolResult(null);
                  setErrorMsg(null);
                }}
                className={`rounded-xl border p-3 cursor-pointer ${
                  selectedTool?.id === tool.id
                    ? "border-[#67DDF2]/60 bg-[#191E2C]"
                    : "border-[#252B3A] bg-[#121622] hover:bg-[#191E2C]/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-medium text-[#67DDF2] truncate">
                    {tool.name}
                  </span>
                  <Switch
                    checked={tool.enabled}
                    onCheckedChange={async (v) => {
                      await api.setMcpToolEnabled(tool.id, v);
                      refreshAll();
                    }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-[#A78BFA]">{tool.serverName}</div>
                <div className="mt-1 text-[11px] text-[#9399AA] line-clamp-2">
                  {tool.description || "No description"}
                </div>
              </div>
            ))}
            {tools.length === 0 && (
              <div className="py-10 text-center text-xs text-[#9399AA]">
                Connect an MCP server to discover tools.
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {selectedTool ? (
              <div className="max-w-3xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold font-mono text-[#67DDF2]">
                      {selectedTool.name}
                    </h2>
                    <p className="text-xs text-[#9399AA]">{selectedTool.description}</p>
                  </div>
                  <div className="flex gap-1.5">
                    {selectedTool.requiredPermissions.map((p) => (
                      <Badge key={p} variant="violet">
                        <ShieldCheck className="h-3 w-3" />
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Card className="p-4 space-y-2">
                  <div className="text-[11px] uppercase tracking-wider text-[#9399AA]">
                    Input JSON Schema
                  </div>
                  <pre className="max-h-48 overflow-auto rounded-lg border border-[#252B3A] bg-[#090B10] p-3 font-mono text-[11px] text-[#F3F4F8]">
                    {JSON.stringify(selectedTool.inputSchema, null, 2)}
                  </pre>
                </Card>

                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#F3F4F8] flex items-center gap-1.5">
                      <Terminal className="h-3.5 w-3.5 text-[#A78BFA]" />
                      Manual Tool Execution Tester (JSON Schema Validated)
                    </span>
                    <Button size="sm" onClick={handleTestTool} disabled={busy || !selectedTool.enabled}>
                      <Play className="h-3.5 w-3.5" />
                      Execute Tool
                    </Button>
                  </div>
                  <Textarea
                    rows={5}
                    className="font-mono"
                    value={toolArgsJson}
                    onChange={(e) => setToolArgsJson(e.target.value)}
                  />
                  {errorMsg && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                      {errorMsg}
                    </div>
                  )}
                  {toolResult && (
                    <pre className="max-h-60 overflow-auto rounded-lg border border-emerald-500/30 bg-[#090B10] p-3 font-mono text-[11px] text-emerald-300">
                      {toolResult}
                    </pre>
                  )}
                </Card>
              </div>
            ) : (
              <div className="py-20 text-center text-xs text-[#9399AA]">
                Select an MCP tool on the left to inspect its JSON Schema and test execution.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "resources" && (
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {resources.map((r) => (
            <Card key={r.id} className="p-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-[#F3F4F8]">{r.name}</div>
                <div className="text-[11px] font-mono text-[#67DDF2]">{r.uri}</div>
                {r.description && (
                  <div className="text-[11px] text-[#9399AA] mt-0.5">{r.description}</div>
                )}
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const res = await api.readMcpResource(r.serverId, r.uri);
                  setResourceOutput(JSON.stringify(res, null, 2));
                }}
              >
                <FileCode2 className="h-3.5 w-3.5" />
                Read Resource
              </Button>
            </Card>
          ))}
          {resources.length === 0 && (
            <div className="py-12 text-center text-xs text-[#9399AA]">
              No MCP resources exposed by connected servers.
            </div>
          )}
          {resourceOutput && (
            <pre className="rounded-xl border border-[#252B3A] bg-[#121622] p-4 font-mono text-xs text-[#F3F4F8] overflow-auto max-h-72">
              {resourceOutput}
            </pre>
          )}
        </div>
      )}

      {tab === "prompts" && (
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {prompts.map((p) => (
            <Card key={p.id} className="p-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-[#F3F4F8]">{p.name}</div>
                {p.description && (
                  <div className="text-[11px] text-[#9399AA] mt-0.5">{p.description}</div>
                )}
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const res = await api.getMcpPrompt(p.serverId, p.name, {});
                  setResourceOutput(JSON.stringify(res, null, 2));
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Inspect Prompt
              </Button>
            </Card>
          ))}
          {prompts.length === 0 && (
            <div className="py-12 text-center text-xs text-[#9399AA]">
              No MCP prompts exposed by connected servers.
            </div>
          )}
          {resourceOutput && (
            <pre className="rounded-xl border border-[#252B3A] bg-[#121622] p-4 font-mono text-xs text-[#F3F4F8] overflow-auto max-h-72">
              {resourceOutput}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
