import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Globe,
  Lock,
  Plus,
  Settings,
  Shield,
  Trash2,
  Upload,
} from "lucide-react";
import { api, isTauriRuntime } from "@/services/tauri";
import { useAppStore } from "@/stores/appStore";
import type { AppSettings, ExecutionMode, PermissionRule } from "@/types/noctra";
import { normalizeLanguage, useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card, Select, Switch } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ExecutionModeToggle } from "@/components/workspace/ExecutionModeToggle";

const FALLBACK_SETTINGS: AppSettings = {
  general: {
    language: "en",
    theme: "obsidian",
    accentColor: "#A78BFA",
    fontSize: 14,
    sidebarCollapsed: false,
    inspectorVisible: true,
    restoreLastSession: true,
  },
  ai: {
    defaultProviderId: null,
    defaultModel: null,
    temperature: 0.7,
    topP: 1.0,
    maxTokens: 4096,
    streamResponses: true,
    contextMessageLimit: 40,
  },
  mcp: {
    autoConnectOnStartup: true,
    healthCheckIntervalSecs: 30,
    defaultTimeoutSecs: 30,
    allowShellWrappers: false,
  },
  agents: {
    defaultMaxSteps: 12,
    defaultMaxToolCalls: 24,
    defaultMaxRuntimeSecs: 180,
    requireApprovalForSensitive: true,
    maxAgentDepth: 3,
    defaultExecutionMode: "review",
  },
  skills: {
    installDirectory: "",
    autoCheckUpdates: true,
    githubApiBase: "https://api.github.com",
  },
  security: {
    credentialBackend: "os-keychain",
    defaultPermissionMode: "ask",
    redactLogs: true,
    sandboxMode: true,
  },
  internet: {
    defaultEnabled: false,
    allowPrivateTargets: false,
    allowedDomains: [],
    maxPortsPerScan: 256,
    scanTimeoutMs: 1200,
    maxConcurrency: 32,
    requireApprovalForScans: true,
  },
  advanced: {
    developerMode: false,
    logRetentionDays: 30,
    maxLogEntries: 2000,
    experimentalFeatures: false,
  },
  shortcuts: {
    commandPalette: "Ctrl+K",
    newChat: "Ctrl+N",
    newAgent: "Ctrl+Shift+N",
    sendMessage: "Ctrl+Enter",
    settings: "Ctrl+,",
    mcpHub: "Ctrl+Shift+M",
    skillsCenter: "Ctrl+Shift+S",
    quickSearch: "Ctrl+P",
  },
};

export function SettingsView() {
  const qc = useQueryClient();
  const { language, setLanguage, t } = useI18n();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
    enabled: isTauriRuntime(),
  });
  const { data: rules = [] } = useQuery({
    queryKey: ["permission-rules"],
    queryFn: api.listPermissionRules,
    enabled: isTauriRuntime(),
  });
  const { data: providers = [] } = useQuery({
    queryKey: ["providers"],
    queryFn: api.listProviders,
    enabled: isTauriRuntime(),
  });

  const [draft, setDraft] = React.useState<AppSettings>(() => ({
    ...FALLBACK_SETTINGS,
    general: { ...FALLBACK_SETTINGS.general, language },
  }));
  const section = useAppStore((s) => s.settingsSection);
  const setSection = useAppStore((s) => s.setSettingsSection);
  const setPreferredInternetMode = useAppStore((s) => s.setPreferredInternetMode);
  const [allowedDomainsText, setAllowedDomainsText] = React.useState("");
  const [newRuleCat, setNewRuleCat] = React.useState("mcp_tools");
  const [newRulePat, setNewRulePat] = React.useState("*");
  const [newRuleMode, setNewRuleMode] = React.useState<PermissionRule["mode"]>("ask");
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (settings) {
      const merged: AppSettings = {
        ...FALLBACK_SETTINGS,
        ...settings,
        internet: {
          ...FALLBACK_SETTINGS.internet,
          ...(settings.internet ?? {}),
        },
      };
      setDraft(merged);
      setAllowedDomainsText((merged.internet.allowedDomains ?? []).join("\n"));
      setLanguage(normalizeLanguage(settings.general.language));
    }
  }, [settings, setLanguage]);

  const handleLanguageChange = async (langCode: string) => {
    const nextLang = normalizeLanguage(langCode);
    const nextDraft: AppSettings = {
      ...draft,
      general: { ...draft.general, language: nextLang },
    };
    setDraft(nextDraft);
    setLanguage(nextLang);
    if (isTauriRuntime()) {
      await api.saveSettings(nextDraft);
      await qc.invalidateQueries({ queryKey: ["settings"] });
    }
    setStatusMsg(t("settings.languageSaved"));
  };

  const save = async () => {
    const cleanedDomains = allowedDomainsText
      .split(/\r?\n/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const nextDraft: AppSettings = {
      ...draft,
      internet: {
        ...draft.internet,
        allowedDomains: cleanedDomains,
        maxPortsPerScan: Math.max(1, Math.min(1024, Number(draft.internet.maxPortsPerScan) || 256)),
        scanTimeoutMs: Math.max(100, Math.min(10000, Number(draft.internet.scanTimeoutMs) || 1200)),
        maxConcurrency: Math.max(1, Math.min(128, Number(draft.internet.maxConcurrency) || 32)),
      },
    };
    setDraft(nextDraft);
    setLanguage(normalizeLanguage(nextDraft.general.language));
    setPreferredInternetMode(nextDraft.internet.defaultEnabled);
    if (isTauriRuntime()) {
      await api.saveSettings(nextDraft);
      await qc.invalidateQueries({ queryKey: ["settings"] });
    }
    setStatusMsg(t("settings.saved"));
  };

  const handleExportBackup = async () => {
    const data = await api.exportBackupJson();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `noctra-studio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const parsed = JSON.parse(await f.text()) as Record<string, unknown>;
    await api.importBackupJson(parsed);
    await qc.invalidateQueries();
    setStatusMsg(t("settings.security.importDone"));
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-56 shrink-0 border-r border-[#252B3A] bg-[#0D1018] p-3 space-y-1">
        <div className="flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-[#F3F4F8]">
          <Settings className="h-4 w-4 text-[#A78BFA]" />
          {t("settings.title")}
        </div>
        {(
          [
            ["general", t("settings.cat.general")],
            ["ai", t("settings.cat.ai")],
            ["mcp", t("settings.cat.mcp")],
            ["agents", t("settings.cat.agents")],
            ["skills", t("settings.cat.skills")],
            ["internet", t("settings.cat.internet")],
            ["security", t("settings.cat.security")],
            ["advanced", t("settings.cat.advanced")],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSection(k)}
            className={`w-full rounded-lg px-3 py-2 text-left text-xs cursor-pointer ${
              section === k
                ? "bg-[#191E2C] text-[#A78BFA] font-medium"
                : "text-[#9399AA] hover:text-[#F3F4F8]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto p-6">
        <div className="max-w-3xl space-y-5">
          {statusMsg && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-300">
              {statusMsg}
            </div>
          )}

          {section === "general" && (
            <Card className="p-5 space-y-4">
              <h2 className="text-sm font-semibold">{t("settings.general.heading")}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="noctra-lang-select" className="block text-[11px] text-[#9399AA] mb-1">
                    {t("settings.general.language")}
                  </label>
                  <Select
                    id="noctra-lang-select"
                    className="w-full"
                    value={normalizeLanguage(draft.general.language)}
                    onChange={handleLanguageChange}
                  >
                    <option value="en">English</option>
                    <option value="vi">Tiếng Việt (Vietnamese)</option>
                  </Select>
                  <p className="mt-1 text-[10px] text-[#9399AA]">
                    {t("settings.general.languageHint")}
                  </p>
                </div>
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">
                    {t("settings.general.fontSize")}
                  </label>
                  <Input
                    type="number"
                    min="12"
                    max="18"
                    value={draft.general.fontSize}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        general: { ...draft.general, fontSize: Number(e.target.value) },
                      })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs">{t("settings.general.restoreSession")}</span>
                <Switch
                  checked={draft.general.restoreLastSession}
                  onCheckedChange={(v) =>
                    setDraft({
                      ...draft,
                      general: { ...draft.general, restoreLastSession: v },
                    })
                  }
                />
              </div>
            </Card>
          )}

          {section === "ai" && (
            <Card className="p-5 space-y-4">
              <h2 className="text-sm font-semibold">{t("settings.ai.heading")}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">
                    {t("settings.ai.defaultProvider")}
                  </label>
                  <Select
                    id="noctra-default-provider-select"
                    className="w-full"
                    value={
                      providers.some((p) => p.id === draft.ai.defaultProviderId)
                        ? (draft.ai.defaultProviderId ?? "")
                        : ""
                    }
                    onChange={(v) =>
                      setDraft({
                        ...draft,
                        ai: { ...draft.ai, defaultProviderId: v || null },
                      })
                    }
                  >
                    <option value="">{t("settings.ai.none")}</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">
                    {t("settings.ai.contextLimit")}
                  </label>
                  <Input
                    type="number"
                    value={draft.ai.contextMessageLimit}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        ai: {
                          ...draft.ai,
                          contextMessageLimit: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              </div>
            </Card>
          )}

          {section === "mcp" && (
            <Card className="p-5 space-y-4">
              <h2 className="text-sm font-semibold">{t("settings.mcp.heading")}</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">
                    {t("settings.mcp.healthInterval")}
                  </label>
                  <Input
                    type="number"
                    value={draft.mcp.healthCheckIntervalSecs}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        mcp: {
                          ...draft.mcp,
                          healthCheckIntervalSecs: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">
                    {t("settings.mcp.requestTimeout")}
                  </label>
                  <Input
                    type="number"
                    value={draft.mcp.defaultTimeoutSecs}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        mcp: {
                          ...draft.mcp,
                          defaultTimeoutSecs: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium">{t("settings.mcp.allowShell")}</div>
                  <div className="text-[11px] text-[#9399AA]">
                    {t("settings.mcp.allowShellHint")}
                  </div>
                </div>
                <Switch
                  checked={draft.mcp.allowShellWrappers}
                  onCheckedChange={(v) =>
                    setDraft({ ...draft, mcp: { ...draft.mcp, allowShellWrappers: v } })
                  }
                />
              </div>
            </Card>
          )}

          {section === "agents" && (
            <Card className="p-5 space-y-4">
              <h2 className="text-sm font-semibold">{t("settings.agents.heading")}</h2>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">
                    {t("settings.agents.maxSteps")}
                  </label>
                  <Input
                    type="number"
                    value={draft.agents.defaultMaxSteps}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        agents: { ...draft.agents, defaultMaxSteps: Number(e.target.value) },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">
                    {t("settings.agents.maxToolCalls")}
                  </label>
                  <Input
                    type="number"
                    value={draft.agents.defaultMaxToolCalls}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        agents: {
                          ...draft.agents,
                          defaultMaxToolCalls: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">
                    {t("settings.agents.maxDepth")}
                  </label>
                  <Input
                    type="number"
                    value={draft.agents.maxAgentDepth}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        agents: { ...draft.agents, maxAgentDepth: Number(e.target.value) },
                      })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#252B3A]">
                <div>
                  <div className="text-xs font-medium">Default Execution Mode</div>
                  <div className="text-[11px] text-[#9399AA]">
                    {t("mode.reviewHint")} / {t("mode.turboHint")}
                  </div>
                </div>
                <ExecutionModeToggle
                  value={(draft.agents.defaultExecutionMode ?? "review") as ExecutionMode}
                  onChange={(mode) =>
                    setDraft({
                      ...draft,
                      agents: { ...draft.agents, defaultExecutionMode: mode },
                    })
                  }
                />
              </div>
            </Card>
          )}

          {section === "skills" && (
            <Card className="p-5 space-y-4">
              <h2 className="text-sm font-semibold">{t("settings.skills.heading")}</h2>
              <div>
                <label className="block text-[11px] text-[#9399AA] mb-1">
                  {t("settings.skills.installDir")}
                </label>
                <Input readOnly value={draft.skills.installDirectory} />
              </div>
              <div>
                <label className="block text-[11px] text-[#9399AA] mb-1">
                  {t("settings.skills.githubApi")}
                </label>
                <Input
                  value={draft.skills.githubApiBase}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      skills: { ...draft.skills, githubApiBase: e.target.value },
                    })
                  }
                />
              </div>
            </Card>
          )}

          {section === "internet" && (
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-[#67DDF2]" />
                <h2 className="text-sm font-semibold">{t("settings.internet.heading")}</h2>
              </div>
              <p className="text-xs text-[#9399AA] leading-relaxed">
                {t("settings.internet.subtitle")}
              </p>

              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-[#252B3A] bg-[#090B10] px-3.5 py-2.5">
                  <div>
                    <div className="text-xs font-medium">
                      {t("settings.internet.defaultEnabled")}
                    </div>
                    <div className="text-[11px] text-[#9399AA]">
                      {t("settings.internet.defaultEnabledHint")}
                    </div>
                  </div>
                  <Switch
                    checked={draft.internet.defaultEnabled}
                    onCheckedChange={(v) =>
                      setDraft({
                        ...draft,
                        internet: { ...draft.internet, defaultEnabled: v },
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border border-[#252B3A] bg-[#090B10] px-3.5 py-2.5">
                  <div>
                    <div className="text-xs font-medium">
                      {t("settings.internet.requireApproval")}
                    </div>
                    <div className="text-[11px] text-[#9399AA]">
                      {t("settings.internet.requireApprovalHint")}
                    </div>
                  </div>
                  <Switch
                    checked={draft.internet.requireApprovalForScans}
                    onCheckedChange={(v) =>
                      setDraft({
                        ...draft,
                        internet: { ...draft.internet, requireApprovalForScans: v },
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border border-[#252B3A] bg-[#090B10] px-3.5 py-2.5">
                  <div>
                    <div className="text-xs font-medium">
                      {t("settings.internet.allowPrivate")}
                    </div>
                    <div className="text-[11px] text-[#9399AA]">
                      {t("settings.internet.allowPrivateHint")}
                    </div>
                  </div>
                  <Switch
                    checked={draft.internet.allowPrivateTargets}
                    onCheckedChange={(v) =>
                      setDraft({
                        ...draft,
                        internet: { ...draft.internet, allowPrivateTargets: v },
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">
                    {t("settings.internet.maxPorts")}
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="1024"
                    value={draft.internet.maxPortsPerScan}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        internet: {
                          ...draft.internet,
                          maxPortsPerScan: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">
                    {t("settings.internet.timeoutMs")}
                  </label>
                  <Input
                    type="number"
                    min="100"
                    max="10000"
                    value={draft.internet.scanTimeoutMs}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        internet: {
                          ...draft.internet,
                          scanTimeoutMs: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9399AA] mb-1">
                    {t("settings.internet.maxConcurrency")}
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="128"
                    value={draft.internet.maxConcurrency}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        internet: {
                          ...draft.internet,
                          maxConcurrency: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-[#9399AA] mb-1">
                  {t("settings.internet.allowedDomains")}
                </label>
                <Textarea
                  rows={3}
                  className="font-mono"
                  placeholder={"example.com\n*.mycompany.com"}
                  value={allowedDomainsText}
                  onChange={(e) => setAllowedDomainsText(e.target.value)}
                />
                <p className="mt-1 text-[10px] text-[#9399AA]">
                  {t("settings.internet.allowedDomainsHint")}
                </p>
              </div>
            </Card>
          )}

          {section === "security" && (
            <div className="space-y-4">
              <Card className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-[#67DDF2]" />
                  <h2 className="text-sm font-semibold">{t("settings.security.privacyHeading")}</h2>
                </div>
                <p className="text-xs text-[#9399AA] leading-relaxed">
                  {t("settings.security.privacyBody")}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="secondary" onClick={handleExportBackup}>
                    <Download className="h-3.5 w-3.5" />
                    {t("settings.security.export")}
                  </Button>
                  <label className="inline-flex items-center gap-1.5 rounded-lg border border-[#252B3A] bg-[#191E2C] px-3 py-1.5 text-xs hover:bg-[#212739] cursor-pointer">
                    <Upload className="h-3.5 w-3.5" />
                    {t("settings.security.import")}
                    <input type="file" accept=".json" className="hidden" onChange={handleImportBackup} />
                  </label>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      if (window.confirm(t("settings.security.wipeConfirm"))) {
                        await api.wipeAllLocalData();
                        await qc.invalidateQueries();
                        setStatusMsg(t("settings.security.wipeDone"));
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("settings.security.wipe")}
                  </Button>
                </div>
              </Card>

              <Card className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-[#A78BFA]" />
                  <h2 className="text-sm font-semibold">{t("settings.security.rulesHeading")}</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select value={newRuleCat} onChange={setNewRuleCat}>
                    {[
                      "mcp_tools",
                      "read_files",
                      "write_files",
                      "delete_files",
                      "execute_commands",
                      "internet_access",
                      "execute_scripts",
                    ].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                  <Input
                    className="w-44"
                    value={newRulePat}
                    onChange={(e) => setNewRulePat(e.target.value)}
                    placeholder="Resource pattern (*)"
                  />
                  <Select
                    value={newRuleMode}
                    onChange={(v) => setNewRuleMode(v as PermissionRule["mode"])}
                  >
                    <option value="ask">{t("settings.security.ask")}</option>
                    <option value="always">{t("settings.security.always")}</option>
                    <option value="deny">{t("settings.security.deny")}</option>
                  </Select>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await api.savePermissionRule({
                        id: "",
                        scope: "global",
                        targetId: null,
                        category: newRuleCat,
                        resourcePattern: newRulePat || "*",
                        mode: newRuleMode,
                        createdAt: "",
                      });
                      qc.invalidateQueries({ queryKey: ["permission-rules"] });
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("settings.security.addRule")}
                  </Button>
                </div>

                <div className="space-y-1.5">
                  {rules.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border border-[#252B3A] bg-[#090B10] px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="violet">{r.scope}</Badge>
                        <span className="font-mono text-[#67DDF2]">{r.category}</span>
                        <span className="text-[#9399AA]">{r.resourcePattern}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            r.mode === "deny"
                              ? "danger"
                              : r.mode === "always"
                              ? "success"
                              : "default"
                          }
                        >
                          {r.mode}
                        </Badge>
                        <button
                          onClick={async () => {
                            await api.deletePermissionRule(r.id);
                            qc.invalidateQueries({ queryKey: ["permission-rules"] });
                          }}
                          className="text-[#9399AA] hover:text-red-400 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {section === "advanced" && (
            <Card className="p-5 space-y-4">
              <h2 className="text-sm font-semibold">{t("settings.advanced.heading")}</h2>
              <div className="flex items-center justify-between">
                <span className="text-xs">{t("settings.advanced.devMode")}</span>
                <Switch
                  checked={draft.advanced.developerMode}
                  onCheckedChange={(v) =>
                    setDraft({
                      ...draft,
                      advanced: { ...draft.advanced, developerMode: v },
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(draft.shortcuts).map(([k, val]) => (
                  <div key={k}>
                    <label className="block text-[11px] text-[#9399AA] mb-1 capitalize">
                      {k}
                    </label>
                    <Input
                      value={val}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          shortcuts: { ...draft.shortcuts, [k]: e.target.value },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="flex justify-end">
            <Button onClick={save}>{t("settings.saveButton")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
