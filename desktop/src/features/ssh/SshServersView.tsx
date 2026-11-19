import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Play,
  Plug,
  PlugZap,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  Trash2,
  XCircle,
} from "lucide-react";
import { api, isTauriRuntime } from "@/services/tauri";
import { useAppStore } from "@/stores/appStore";
import { useI18n } from "@/i18n";
import type { SshExecResult, SshServer, SshServerInput, SshTestResult } from "@/types/noctra";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const EMPTY_FORM: SshServerInput = {
  id: null,
  name: "",
  host: "",
  port: 22,
  username: "root",
  authType: "password",
  password: "",
  savePassword: true,
  clearPassword: false,
  privateKeyPath: "",
  privateKeyPem: "",
  clearPrivateKey: false,
  passphrase: "",
  defaultWorkingDir: "",
  notes: "",
};

const QUICK_COMMANDS = [
  { label: "System Info", cmd: "hostname && uname -a && uptime" },
  { label: "Disk & RAM", cmd: "df -h && echo '---' && free -h" },
  { label: "Docker PS", cmd: "docker ps -a --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'" },
  { label: "Ports", cmd: "ss -tulpn | head -n 25" },
];

export function SshServersView() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const setActiveConvId = useAppStore((s) => s.setActiveConversationId);
  const setPreferredExecutionMode = useAppStore((s) => s.setPreferredExecutionMode);

  const { data: servers = [] } = useQuery({
    queryKey: ["ssh-servers"],
    queryFn: api.listSshServers,
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

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<SshServerInput>(EMPTY_FORM);
  const [showPassword, setShowPassword] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [testResult, setTestResult] = React.useState<SshTestResult | null>(null);

  // Interactive SSH Command Runner state
  const [cmdInput, setCmdInput] = React.useState("");
  const [cmdRunning, setCmdRunning] = React.useState(false);
  const [cmdHistory, setCmdHistory] = React.useState<SshExecResult[]>([]);

  const selectedServer = servers.find((s) => s.id === selectedId) ?? null;

  const selectServer = (srv: SshServer) => {
    setSelectedId(srv.id);
    setForm({
      id: srv.id,
      name: srv.name,
      host: srv.host,
      port: srv.port,
      username: srv.username,
      authType: srv.authType,
      password: "",
      savePassword: true,
      clearPassword: false,
      privateKeyPath: srv.privateKeyPath ?? "",
      privateKeyPem: "",
      clearPrivateKey: false,
      passphrase: "",
      defaultWorkingDir: srv.defaultWorkingDir,
      notes: srv.notes,
    });
    setShowPassword(false);
    setStatusMsg(null);
    setErrorMsg(null);
    setTestResult(null);
  };

  const startNew = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setShowPassword(false);
    setStatusMsg(null);
    setErrorMsg(null);
    setTestResult(null);
    setCmdHistory([]);
  };

  const persistForm = async (): Promise<SshServer | null> => {
    setErrorMsg(null);
    if (!form.host.trim() || !form.username.trim()) {
      setErrorMsg("Host/IP and Username are required.");
      return null;
    }
    const saved = await api.saveSshServer({
      ...form,
      port: Number(form.port) || 22,
    });
    await qc.invalidateQueries({ queryKey: ["ssh-servers"] });
    setSelectedId(saved.id);
    setForm((prev) => ({
      ...prev,
      id: saved.id,
      name: saved.name,
      host: saved.host,
      port: saved.port,
      username: saved.username,
      password: "",
      clearPassword: false,
      privateKeyPem: "",
      clearPrivateKey: false,
      passphrase: "",
    }));
    return saved;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setBusy(true);
    try {
      const saved = await persistForm();
      if (saved) {
        setStatusMsg(
          `Saved '${saved.name}' (${saved.username}@${saved.host}:${saved.port}).`
        );
      }
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    setTestResult(null);
    try {
      const rawPassword = form.password || null;
      const saved = await persistForm();
      if (!saved) return;
      const res = await api.testSshConnection({
        id: saved.id,
        password: rawPassword,
        trustHostKey: false,
      });
      setTestResult(res);
      await qc.invalidateQueries({ queryKey: ["ssh-servers"] });
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = async () => {
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const rawPassword = form.password || null;
      const savePw = form.savePassword ?? true;
      const saved = await persistForm();
      if (!saved) return;
      const connected = await api.connectSshServer({
        id: saved.id,
        password: rawPassword,
        savePassword: savePw,
        trustHostKey: false,
      });
      await qc.invalidateQueries({ queryKey: ["ssh-servers"] });
      setStatusMsg(
        `Connected to ${connected.username}@${connected.host}:${connected.port}. Ready for manual or AI automation.`
      );
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await api.disconnectSshServer(id);
      await qc.invalidateQueries({ queryKey: ["ssh-servers"] });
      setStatusMsg("Disconnected SSH session.");
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await api.deleteSshServer(id);
      await qc.invalidateQueries({ queryKey: ["ssh-servers"] });
      if (selectedId === id) {
        startNew();
      }
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleResetFingerprint = async (id: string) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await api.resetSshHostFingerprint(id);
      await qc.invalidateQueries({ queryKey: ["ssh-servers"] });
      setStatusMsg("Host key fingerprint cleared. Next connect will trust & record the new key.");
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRunCommand = async (commandOverride?: string) => {
    const targetId = selectedServer?.id ?? form.id;
    const cmd = (commandOverride ?? cmdInput).trim();
    if (!targetId || !cmd) return;
    setCmdRunning(true);
    setErrorMsg(null);
    try {
      const res = await api.execSshCommand({
        id: targetId,
        command: cmd,
      });
      setCmdHistory((prev) => [res, ...prev].slice(0, 30));
      if (!commandOverride) setCmdInput("");
      await qc.invalidateQueries({ queryKey: ["ssh-servers"] });
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setCmdRunning(false);
    }
  };

  const handleAutomateInChat = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const rawPassword = form.password || null;
      const savePw = form.savePassword ?? true;
      const saved = await persistForm();
      if (!saved) return;

      if (saved.status !== "connected") {
        await api.connectSshServer({
          id: saved.id,
          password: rawPassword,
          savePassword: savePw,
          trustHostKey: false,
        });
      }

      const sshAgent =
        agents.find((a) => a.id === "tpl-ssh-ops") ??
        agents.find((a) => a.id === "tpl-automation") ??
        agents[0] ??
        null;

      setPreferredExecutionMode("turbo");
      const conv = await api.createConversation({
        title: `SSH: ${saved.name}`,
        mode: sshAgent ? "agent" : "direct",
        executionMode: "turbo",
        providerId: providers[0]?.id ?? null,
        model: providers[0]?.modelId ?? null,
        agentId: sshAgent?.id ?? null,
        sshServerId: saved.id,
      });
      await qc.invalidateQueries({ queryKey: ["ssh-servers"] });
      await qc.invalidateQueries({ queryKey: ["conversations"] });
      setActiveConvId(conv.id);
      setActiveSection("chat");
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (status: SshServer["status"]) => {
    switch (status) {
      case "connected":
        return <Badge variant="success">{t("ssh.connected")}</Badge>;
      case "connecting":
        return <Badge variant="cyan">{t("ssh.connecting")}</Badge>;
      case "error":
        return <Badge variant="danger">{t("ssh.error")}</Badge>;
      default:
        return <Badge variant="default">{t("ssh.disconnected")}</Badge>;
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-[#090B10]">
      {/* Left Column: Saved SSH Servers */}
      <div className="flex w-72 shrink-0 flex-col border-r border-[#252B3A] bg-[#0D1018]">
        <div className="border-b border-[#252B3A] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-[#67DDF2]" />
              <h2 className="text-sm font-semibold text-[#F3F4F8]">{t("ssh.title")}</h2>
            </div>
            <Badge variant="cyan">{servers.length}</Badge>
          </div>
          <Button onClick={startNew} className="w-full" size="sm">
            <Plus className="h-3.5 w-3.5" />
            {t("ssh.newServer")}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {servers.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#252B3A] p-4 text-center text-xs text-[#9399AA]">
              {t("ssh.noServers")}
            </div>
          )}
          {servers.map((srv) => {
            const active = selectedId === srv.id;
            return (
              <div
                key={srv.id}
                onClick={() => selectServer(srv)}
                className={`group rounded-xl border p-3 cursor-pointer transition-colors ${
                  active
                    ? "border-[#A78BFA]/60 bg-[#191E2C]"
                    : "border-[#252B3A] bg-[#121622] hover:border-[#252B3A]/80 hover:bg-[#161B29]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        srv.status === "connected"
                          ? "bg-emerald-400"
                          : srv.status === "error"
                          ? "bg-red-400"
                          : "bg-[#9399AA]/50"
                      }`}
                    />
                    <span className="truncate text-xs font-medium text-[#F3F4F8]">
                      {srv.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(srv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-[#9399AA] hover:text-red-400 cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-[#67DDF2]">
                  {srv.username}@{srv.host}:{srv.port}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  {statusBadge(srv.status)}
                  {srv.hasPassword && (
                    <span className="flex items-center gap-1 text-[10px] text-[#9399AA]">
                      <KeyRound className="h-3 w-3 text-[#A78BFA]" />
                      PW
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column: Server Config + Live SSH Terminal */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-[#F3F4F8]">
              {selectedServer ? selectedServer.name : t("ssh.newServer")}
            </h1>
            <p className="text-xs text-[#9399AA] mt-0.5">{t("ssh.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedServer && statusBadge(selectedServer.status)}
            {selectedServer?.status === "connected" ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => handleDisconnect(selectedServer.id)}
              >
                <Plug className="h-3.5 w-3.5" />
                {t("ssh.disconnect")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="cyan"
                size="sm"
                disabled={busy}
                onClick={handleConnect}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PlugZap className="h-3.5 w-3.5" />
                )}
                {t("ssh.connect")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={handleAutomateInChat}
            >
              <Bot className="h-3.5 w-3.5" />
              {t("ssh.automateInChat")}
            </Button>
          </div>
        </div>

        {/* Status / Error / Test Banners */}
        {statusMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300 break-words">
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
        {testResult && (
          <div
            className={`rounded-xl border px-4 py-3 text-xs space-y-1 ${
              testResult.ok
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : "border-red-500/40 bg-red-500/10 text-red-200"
            }`}
          >
            <div className="font-medium flex items-center gap-2">
              {testResult.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <XCircle className="h-4 w-4 text-red-400" />
              )}
              <span>{testResult.message}</span>
            </div>
            {testResult.serverBanner && (
              <div className="text-[11px] font-mono opacity-90">
                Server: {testResult.remoteWhoami ? `${testResult.remoteWhoami}@` : ""}
                {testResult.serverBanner}
              </div>
            )}
            {testResult.hostFingerprint && (
              <div className="text-[11px] font-mono opacity-80">
                Fingerprint: {testResult.hostFingerprint}
              </div>
            )}
          </div>
        )}

        {/* Configuration Form */}
        <Card className="p-5">
          <form onSubmit={handleSave} className="space-y-4 text-xs">
            <div className="grid grid-cols-12 gap-3.5">
              <div className="col-span-12 md:col-span-6">
                <label className="mb-1 block text-[11px] text-[#9399AA]">{t("ssh.name")}</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Production Ubuntu VPS"
                />
              </div>
              <div className="col-span-8 md:col-span-4">
                <label className="mb-1 block text-[11px] text-[#9399AA]">{t("ssh.host")} *</label>
                <Input
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  placeholder="203.0.113.10 or myserver.com"
                  required
                />
              </div>
              <div className="col-span-4 md:col-span-2">
                <label className="mb-1 block text-[11px] text-[#9399AA]">{t("ssh.port")}</label>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: Number(e.target.value) || 22 })}
                />
              </div>

              <div className="col-span-12 md:col-span-6">
                <label className="mb-1 block text-[11px] text-[#9399AA]">
                  {t("ssh.username")} *
                </label>
                <Input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="root"
                  required
                />
              </div>

              <div className="col-span-12 md:col-span-6">
                <label className="mb-1 block text-[11px] text-[#9399AA]">
                  {t("ssh.authType")}
                </label>
                <div className="inline-flex w-full rounded-lg border border-[#252B3A] bg-[#090B10] p-0.5">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, authType: "password" })}
                    className={`flex-1 rounded-md py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                      form.authType === "password"
                        ? "bg-[#A78BFA]/20 text-[#A78BFA]"
                        : "text-[#9399AA] hover:text-[#F3F4F8]"
                    }`}
                  >
                    {t("ssh.authPassword")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, authType: "private_key" })}
                    className={`flex-1 rounded-md py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                      form.authType === "private_key"
                        ? "bg-[#67DDF2]/20 text-[#67DDF2]"
                        : "text-[#9399AA] hover:text-[#F3F4F8]"
                    }`}
                  >
                    {t("ssh.authKey")}
                  </button>
                </div>
              </div>

              {/* Password Authentication Section */}
              {form.authType === "password" ? (
                <div className="col-span-12 space-y-2.5 rounded-xl border border-[#252B3A] bg-[#090B10]/70 p-3.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-[11px] font-medium text-[#F3F4F8]">
                      <KeyRound className="h-3.5 w-3.5 text-[#A78BFA]" />
                      {t("ssh.password")}
                    </label>
                    {selectedServer?.hasPassword && (
                      <Badge variant="success">Password Configured</Badge>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={form.password ?? ""}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder={
                        selectedServer?.hasPassword
                          ? t("ssh.passwordSavedPlaceholder")
                          : t("ssh.passwordPlaceholder")
                      }
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9399AA] hover:text-[#F3F4F8] cursor-pointer"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <label className="flex items-center gap-2 text-[#F3F4F8] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.savePassword ?? true}
                        onChange={(e) =>
                          setForm({ ...form, savePassword: e.target.checked })
                        }
                        className="accent-[#A78BFA]"
                      />
                      <span>{t("ssh.savePasswordKeychain")}</span>
                    </label>
                    {selectedServer?.hasPassword && (
                      <label className="flex items-center gap-1.5 text-amber-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(form.clearPassword)}
                          onChange={(e) =>
                            setForm({ ...form, clearPassword: e.target.checked })
                          }
                          className="accent-amber-400"
                        />
                        <span>{t("ssh.clearPassword")}</span>
                      </label>
                    )}
                  </div>
                  <p className="text-[10px] text-[#9399AA]">{t("ssh.sessionOnlyHint")}</p>
                </div>
              ) : (
                <div className="col-span-12 space-y-3 rounded-xl border border-[#252B3A] bg-[#090B10]/70 p-3.5">
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 md:col-span-7">
                      <label className="mb-1 block text-[11px] text-[#9399AA]">
                        {t("ssh.privateKeyPath")}
                      </label>
                      <Input
                        value={form.privateKeyPath ?? ""}
                        onChange={(e) =>
                          setForm({ ...form, privateKeyPath: e.target.value })
                        }
                        placeholder="C:\Users\you\.ssh\id_ed25519 or ~/.ssh/id_rsa"
                      />
                    </div>
                    <div className="col-span-12 md:col-span-5">
                      <label className="mb-1 block text-[11px] text-[#9399AA]">
                        {t("ssh.passphrase")}
                      </label>
                      <Input
                        type="password"
                        value={form.passphrase ?? ""}
                        onChange={(e) =>
                          setForm({ ...form, passphrase: e.target.value })
                        }
                        placeholder="Optional key passphrase"
                      />
                    </div>
                    <div className="col-span-12">
                      <label className="mb-1 block text-[11px] text-[#9399AA]">
                        {t("ssh.privateKeyPem")}
                      </label>
                      <Textarea
                        rows={3}
                        value={form.privateKeyPem ?? ""}
                        onChange={(e) =>
                          setForm({ ...form, privateKeyPem: e.target.value })
                        }
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                        className="font-mono text-[11px]"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="col-span-12 md:col-span-6">
                <label className="mb-1 block text-[11px] text-[#9399AA]">
                  {t("ssh.workingDir")}
                </label>
                <Input
                  value={form.defaultWorkingDir}
                  onChange={(e) =>
                    setForm({ ...form, defaultWorkingDir: e.target.value })
                  }
                  placeholder="/var/www/app or /root"
                />
              </div>

              <div className="col-span-12 md:col-span-6">
                <label className="mb-1 block text-[11px] text-[#9399AA]">
                  {t("ssh.fingerprint")}
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 truncate rounded-lg border border-[#252B3A] bg-[#090B10] px-2.5 py-2 font-mono text-[11px] text-[#9399AA]">
                    {selectedServer?.hostFingerprint || "Not recorded yet (TOFU on first connect)"}
                  </div>
                  {selectedServer?.hostFingerprint && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => handleResetFingerprint(selectedServer.id)}
                      title={t("ssh.resetFingerprint")}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="col-span-12">
                <label className="mb-1 block text-[11px] text-[#9399AA]">{t("ssh.notes")}</label>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder={t("ssh.notesPlaceholder")}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#252B3A] pt-3">
              <div className="flex items-center gap-1.5 text-[11px] text-[#9399AA]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#67DDF2]" />
                <span>Passwords stored in OS Keychain & automatically redacted from logs.</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={handleTest}
                >
                  {t("ssh.test")}
                </Button>
                <Button type="submit" size="sm" disabled={busy}>
                  {t("ssh.save")}
                </Button>
              </div>
            </div>
          </form>
        </Card>

        {/* Live Interactive SSH Command Runner */}
        {selectedServer && (
          <Card className="p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-[#F3F4F8]">
                  {t("ssh.terminalTitle")}
                </h3>
                <span className="font-mono text-[11px] text-[#67DDF2]">
                  {selectedServer.username}@{selectedServer.host}:{selectedServer.port}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {QUICK_COMMANDS.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    disabled={cmdRunning}
                    onClick={() => handleRunCommand(q.cmd)}
                    className="rounded-md border border-[#252B3A] bg-[#090B10] px-2 py-1 text-[10px] text-[#9399AA] hover:border-[#67DDF2]/50 hover:text-[#67DDF2] cursor-pointer"
                  >
                    {q.label}
                  </button>
                ))}
                {cmdHistory.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setCmdHistory([])}
                  >
                    {t("ssh.clearOutput")}
                  </Button>
                )}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRunCommand();
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-emerald-400">
                  $
                </span>
                <Input
                  value={cmdInput}
                  onChange={(e) => setCmdInput(e.target.value)}
                  placeholder={t("ssh.terminalPlaceholder")}
                  className="pl-7 font-mono text-xs"
                  disabled={cmdRunning}
                />
              </div>
              <Button type="submit" size="sm" disabled={cmdRunning || !cmdInput.trim()}>
                {cmdRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {t("ssh.runCommand")}
              </Button>
            </form>

            {cmdHistory.length > 0 && (
              <div className="space-y-2.5 max-h-96 overflow-y-auto">
                {cmdHistory.map((item, idx) => (
                  <div
                    key={`${item.command}-${idx}`}
                    className="rounded-xl border border-[#252B3A] bg-[#090B10] p-3 font-mono text-[11px] space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#252B3A]/70 pb-1.5">
                      <span className="text-emerald-300">$ {item.command}</span>
                      <div className="flex items-center gap-2 text-[10px]">
                        <Badge variant={item.exitCode === 0 ? "success" : "danger"}>
                          exit {item.exitCode}
                        </Badge>
                        <span className="text-[#9399AA]">{item.durationMs}ms</span>
                      </div>
                    </div>
                    {item.stdout && (
                      <pre className="whitespace-pre-wrap break-words text-[#F3F4F8] leading-relaxed">
                        {item.stdout}
                      </pre>
                    )}
                    {item.stderr && (
                      <pre className="whitespace-pre-wrap break-words text-amber-300 leading-relaxed">
                        {item.stderr}
                      </pre>
                    )}
                    {!item.stdout && !item.stderr && (
                      <div className="text-[#9399AA] italic">(no output)</div>
                    )}
                    {item.truncated && (
                      <div className="text-[10px] text-amber-400">
                        (output truncated at 64 KB)
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
