import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Copy,
  Cpu,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { api, isTauriRuntime } from "@/services/tauri";
import { useAppStore } from "@/stores/appStore";
import type { AiProvider, AiProviderInput, ProviderTestResult } from "@/types/noctra";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card, Switch } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  modelId: string;
  tag: string;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    modelId: "gpt-4o-mini",
    tag: "Cloud",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    modelId: "gemini-2.5-flash",
    tag: "Cloud",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    baseUrl: "https://api.anthropic.com/v1",
    modelId: "claude-3-7-sonnet-latest",
    tag: "Cloud",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    modelId: "openai/gpt-4o-mini",
    tag: "Aggregator",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    modelId: "deepseek-chat",
    tag: "Cloud",
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    modelId: "llama-3.3-70b-versatile",
    tag: "Fast Cloud",
  },
  {
    id: "xai",
    name: "xAI Grok",
    baseUrl: "https://api.x.ai/v1",
    modelId: "grok-2-latest",
    tag: "Cloud",
  },
  {
    id: "mistral",
    name: "Mistral AI",
    baseUrl: "https://api.mistral.ai/v1",
    modelId: "mistral-large-latest",
    tag: "Cloud",
  },
  {
    id: "together",
    name: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    modelId: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    tag: "Cloud",
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    baseUrl: "http://localhost:11434/v1",
    modelId: "llama3.1",
    tag: "Local",
  },
  {
    id: "lmstudio",
    name: "LM Studio (Local)",
    baseUrl: "http://localhost:1234/v1",
    modelId: "local-model",
    tag: "Local",
  },
  {
    id: "custom",
    name: "Custom Endpoint",
    baseUrl: "https://api.example.com/v1",
    modelId: "custom-model",
    tag: "Custom",
  },
];

const EMPTY_FORM: AiProviderInput = {
  id: null,
  name: "",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  clearApiKey: false,
  modelId: "gpt-4o-mini",
  customHeaders: {},
  temperature: 0.7,
  topP: 1.0,
  maxTokens: 4096,
  timeoutSecs: 60,
  streaming: true,
  defaultSystemPrompt: "",
};

export function ProvidersView() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const openProviderPicker = useAppStore((s) => s.openProviderPicker);
  const preferredProviderId = useAppStore((s) => s.preferredProviderId);
  const setPreferredProviderId = useAppStore((s) => s.setPreferredProviderId);
  const activeConvId = useAppStore((s) => s.activeConversationId);

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
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
    enabled: isTauriRuntime(),
  });

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const currentActiveProviderId =
    activeConv?.activeProviderId ??
    preferredProviderId ??
    settings?.ai?.defaultProviderId ??
    providers[0]?.id ??
    null;

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<AiProviderInput>(EMPTY_FORM);
  const [headersText, setHeadersText] = React.useState("{}");
  const [discoveredModels, setDiscoveredModels] = React.useState<string[]>([]);
  const [testResult, setTestResult] = React.useState<ProviderTestResult | null>(null);
  const [presetModalOpen, setPresetModalOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const selectProvider = (p: AiProvider) => {
    setSelectedId(p.id);
    setForm({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      apiKey: "",
      clearApiKey: false,
      modelId: p.modelId,
      customHeaders: p.customHeaders,
      temperature: p.temperature,
      topP: p.topP,
      maxTokens: p.maxTokens,
      timeoutSecs: p.timeoutSecs,
      streaming: p.streaming,
      defaultSystemPrompt: p.defaultSystemPrompt,
    });
    setHeadersText(JSON.stringify(p.customHeaders ?? {}, null, 2));
    setDiscoveredModels([]);
    setTestResult(null);
    setStatusMsg(null);
    setErrorMsg(null);
  };

  const startNew = (preset?: { name: string; baseUrl: string; modelId: string }) => {
    setSelectedId(null);
    setForm({
      ...EMPTY_FORM,
      name: preset?.name ?? "",
      baseUrl: preset?.baseUrl ?? "https://api.openai.com/v1",
      modelId: preset?.modelId ?? "gpt-4o-mini",
    });
    setHeadersText("{}");
    setDiscoveredModels([]);
    setTestResult(null);
    setStatusMsg(null);
    setErrorMsg(null);
  };

  const persistCurrentForm = async (): Promise<AiProvider | null> => {
    setErrorMsg(null);
    if (!form.name.trim() || !form.baseUrl.trim()) {
      setErrorMsg("Provider name and API base URL are required.");
      return null;
    }
    let parsedHeaders: Record<string, string> = {};
    try {
      parsedHeaders = JSON.parse(headersText || "{}");
    } catch {
      setErrorMsg("Custom headers must be valid JSON object.");
      return null;
    }

    const saved = await api.saveProvider({ ...form, customHeaders: parsedHeaders });
    await qc.invalidateQueries({ queryKey: ["providers"] });
    setSelectedId(saved.id);
    setForm((prev) => ({
      ...prev,
      id: saved.id,
      name: saved.name,
      baseUrl: saved.baseUrl,
      apiKey: "",
      clearApiKey: false,
      modelId: saved.modelId,
      customHeaders: saved.customHeaders,
    }));
    return saved;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    const wasNew = !selectedId;
    setBusy(true);
    try {
      const saved = await persistCurrentForm();
      if (saved) {
        selectProvider(saved);
        setStatusMsg(`Saved '${saved.name}'. API key stored in OS Credential Manager.`);
        // Open the Provider Selection Popup so user can choose which provider to use
        openProviderPicker(wasNew ? saved.id : saved.id);
      }
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleActivateProvider = async (p: AiProvider) => {
    setPreferredProviderId(p.id);
    if (isTauriRuntime()) {
      if (activeConv) {
        await api.updateConversation({
          ...activeConv,
          activeProviderId: p.id,
          activeModel: p.modelId,
        });
        await qc.invalidateQueries({ queryKey: ["conversations"] });
      }
      if (settings) {
        await api.saveSettings({
          ...settings,
          ai: {
            ...settings.ai,
            defaultProviderId: p.id,
            defaultModel: p.modelId,
          },
        });
        await qc.invalidateQueries({ queryKey: ["settings"] });
      }
    }
    setStatusMsg(`Active provider set to '${p.name}' (${p.modelId}).`);
  };

  const handleTest = async () => {
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const saved = await persistCurrentForm();
      if (!saved) return;
      const res = await api.testProviderConnection(saved.id);
      setTestResult(res);
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleFetchModels = async () => {
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const saved = await persistCurrentForm();
      if (!saved) return;
      const models = await api.fetchProviderModels(saved.id);
      setDiscoveredModels(models);
      setStatusMsg(`Fetched ${models.length} model(s) from endpoint.`);
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const dup = await api.duplicateProvider(id);
      await qc.invalidateQueries({ queryKey: ["providers"] });
      selectProvider(dup);
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteProvider(id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["providers"] }),
        qc.invalidateQueries({ queryKey: ["conversations"] }),
        qc.invalidateQueries({ queryKey: ["agents"] }),
        qc.invalidateQueries({ queryKey: ["settings"] }),
      ]);
      if (selectedId === id) startNew();
    } catch (err) {
      setErrorMsg(String(err));
    }
  };

  const activeProvider = providers.find((p) => p.id === selectedId);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Provider List */}
      <div className="w-72 shrink-0 border-r border-[#252B3A] bg-[#0D1018] flex flex-col">
        <div className="p-3.5 border-b border-[#252B3A] space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold text-[#F3F4F8]">{t("providers.title")}</h2>
              <p className="text-[11px] text-[#9399AA]">{t("providers.subtitle")}</p>
            </div>
            <Button size="sm" onClick={() => setPresetModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("providers.add")}
            </Button>
          </div>
          {providers.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full justify-center text-[11px]"
              onClick={() => openProviderPicker(null)}
            >
              <Sparkles className="h-3.5 w-3.5 text-[#A78BFA]" />
              {t("providers.switchBtn")}
            </Button>
          )}
        </div>

        <div className="px-3 py-2 border-b border-[#252B3A] flex flex-wrap gap-1.5">
          <button
            onClick={() =>
              startNew({
                name: "Ollama (Local)",
                baseUrl: "http://localhost:11434/v1",
                modelId: "llama3.1",
              })
            }
            className="rounded-md border border-[#252B3A] bg-[#121622] px-2 py-1 text-[10px] text-[#9399AA] hover:text-[#67DDF2] cursor-pointer"
          >
            + Ollama Local
          </button>
          <button
            onClick={() =>
              startNew({
                name: "LM Studio (Local)",
                baseUrl: "http://localhost:1234/v1",
                modelId: "local-model",
              })
            }
            className="rounded-md border border-[#252B3A] bg-[#121622] px-2 py-1 text-[10px] text-[#9399AA] hover:text-[#67DDF2] cursor-pointer"
          >
            + LM Studio
          </button>
          <button
            onClick={() =>
              startNew({
                name: "OpenRouter",
                baseUrl: "https://openrouter.ai/api/v1",
                modelId: "openai/gpt-4o-mini",
              })
            }
            className="rounded-md border border-[#252B3A] bg-[#121622] px-2 py-1 text-[10px] text-[#9399AA] hover:text-[#A78BFA] cursor-pointer"
          >
            + OpenRouter
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {providers.map((p) => {
            const isCurrentActive = currentActiveProviderId === p.id;
            return (
              <div
                key={p.id}
                onClick={() => selectProvider(p)}
                className={`rounded-xl border p-2.5 cursor-pointer transition-colors ${
                  selectedId === p.id
                    ? "border-[#A78BFA]/60 bg-[#191E2C]"
                    : "border-[#252B3A] bg-[#121622] hover:bg-[#191E2C]/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#F3F4F8] truncate">
                    {p.name}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {isCurrentActive && (
                      <Badge variant="success">{t("providers.active")}</Badge>
                    )}
                    {p.hasApiKey ? (
                      <Badge variant="cyan">Keychain</Badge>
                    ) : (
                      <Badge variant="default">No Key</Badge>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-[#9399AA] truncate">
                  {p.modelId || "No model set"}
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-[#9399AA]/70 truncate font-mono">
                    {p.baseUrl}
                  </span>
                  {!isCurrentActive && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleActivateProvider(p);
                      }}
                      className="shrink-0 rounded-md border border-[#A78BFA]/40 bg-[#A78BFA]/10 px-2 py-0.5 text-[10px] font-medium text-[#A78BFA] hover:bg-[#A78BFA]/20 cursor-pointer"
                    >
                      {t("providers.useNow")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {providers.length === 0 && (
            <div className="py-10 text-center text-xs text-[#9399AA]">
              {t("providers.empty")}
            </div>
          )}
        </div>
      </div>

      {/* Provider Form */}
      <div className="flex-1 min-w-0 overflow-y-auto p-6">
        <form onSubmit={handleSave} className="max-w-3xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#A78BFA]/15 text-[#A78BFA]">
                <Cpu className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-semibold text-[#F3F4F8] truncate">
                  {selectedId
                    ? `${t("providers.editHeading")}: ${activeProvider?.name ?? form.name}`
                    : t("providers.newHeading")}
                </h1>
                <p className="text-xs text-[#9399AA]">
                  {t("providers.keychainNote")}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleTest}
                disabled={busy || !form.name.trim() || !form.baseUrl.trim()}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {t("providers.testConnection")}
              </Button>
              {selectedId && (
                <>
                  <Button type="button" variant="secondary" onClick={() => handleDuplicate(selectedId)}>
                    <Copy className="h-3.5 w-3.5" />
                    {t("providers.duplicate")}
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => handleDelete(selectedId)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-300 break-words">
              {errorMsg}
            </div>
          )}
          {statusMsg && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300 break-words">
              {statusMsg}
            </div>
          )}
          {testResult && (
            <Card className="p-3.5 flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-2.5 text-xs">
                {testResult.ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                )}
                <span className="min-w-0 flex-1 break-words leading-relaxed">
                  {testResult.message}
                </span>
              </div>
              <Badge variant={testResult.ok ? "success" : "danger"} className="shrink-0 whitespace-nowrap">
                {testResult.latencyMs} ms
              </Badge>
            </Card>
          )}

          <Card className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-[#9399AA] mb-1.5">
                  {t("providers.name")}
                </label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Local Ollama, OpenAI, Groq"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#9399AA] mb-1.5">
                  {t("providers.baseUrl")}
                </label>
                <Input
                  required
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-[#9399AA] mb-1.5">
                  {t("providers.apiKey")}
                </label>
                <div className="relative">
                  <Input
                    type="password"
                    className="pr-8"
                    value={form.apiKey ?? ""}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value, clearApiKey: false })}
                    placeholder={
                      activeProvider?.hasApiKey
                        ? "Stored securely in OS Keychain (enter to replace)"
                        : "Enter API key (optional for local Ollama)"
                    }
                  />
                  <KeyRound className="h-3.5 w-3.5 text-[#9399AA] pointer-events-none absolute right-2.5 top-2.5" />
                </div>
                {activeProvider?.hasApiKey && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, apiKey: "", clearApiKey: true })}
                    className="mt-1 text-[10px] text-red-400 hover:underline cursor-pointer"
                  >
                    {t("providers.removeKey")}
                  </button>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-medium text-[#9399AA]">
                    {t("providers.modelId")}
                  </label>
                  {form.name.trim() && form.baseUrl.trim() && (
                    <button
                      type="button"
                      onClick={handleFetchModels}
                      className="text-[10px] text-[#67DDF2] hover:underline cursor-pointer"
                    >
                      {t("providers.fetchModels")}
                    </button>
                  )}
                </div>
                <Input
                  value={form.modelId}
                  onChange={(e) => setForm({ ...form, modelId: e.target.value })}
                  placeholder="gpt-4o-mini, llama3.1, claude-3-5..."
                />
                {discoveredModels.length > 0 && (
                  <select
                    value={form.modelId}
                    onChange={(e) => setForm({ ...form, modelId: e.target.value })}
                    className="mt-2 h-8 w-full rounded-lg border border-[#252B3A] bg-[#090B10] px-2.5 text-xs text-[#67DDF2]"
                  >
                    {discoveredModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] text-[#9399AA] mb-1">{t("providers.temperature")}</label>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="2"
                  value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#9399AA] mb-1">{t("providers.topP")}</label>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={form.topP}
                  onChange={(e) => setForm({ ...form, topP: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#9399AA] mb-1">{t("providers.maxTokens")}</label>
                <Input
                  type="number"
                  min="1"
                  value={form.maxTokens}
                  onChange={(e) => setForm({ ...form, maxTokens: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#9399AA] mb-1">{t("providers.timeout")}</label>
                <Input
                  type="number"
                  min="5"
                  value={form.timeoutSecs}
                  onChange={(e) => setForm({ ...form, timeoutSecs: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[#252B3A] bg-[#090B10] px-3.5 py-2.5">
              <div>
                <div className="text-xs font-medium text-[#F3F4F8]">
                  {t("providers.streamTitle")}
                </div>
                <div className="text-[11px] text-[#9399AA]">
                  {t("providers.streamSubtitle")}
                </div>
              </div>
              <Switch
                checked={form.streaming}
                onCheckedChange={(v) => setForm({ ...form, streaming: v })}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#9399AA] mb-1.5">
                {t("providers.customHeaders")}
              </label>
              <Textarea
                rows={3}
                className="font-mono"
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#9399AA] mb-1.5">
                {t("providers.defaultSystemPrompt")}
              </label>
              <Textarea
                rows={3}
                value={form.defaultSystemPrompt}
                onChange={(e) => setForm({ ...form, defaultSystemPrompt: e.target.value })}
                placeholder="Optional default system instructions for direct chats using this provider..."
              />
            </div>
          </Card>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPresetModalOpen(true)}
            >
              {t("providers.presetBtn")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t("providers.saving") : selectedId ? t("providers.update") : t("providers.save")}
            </Button>
          </div>
        </form>
      </div>

      {/* Choose AI Provider Preset Popup Modal */}
      {presetModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setPresetModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-[#252B3A] bg-[#121622] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#252B3A] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#A78BFA]/15 text-[#A78BFA]">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#F3F4F8]">
                    {t("providers.presetModalTitle")}
                  </h3>
                  <p className="text-xs text-[#9399AA]">
                    {t("providers.presetModalSubtitle")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPresetModalOpen(false)}
                className="rounded-lg p-1 text-[#9399AA] hover:bg-[#191E2C] hover:text-[#F3F4F8] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 p-5 max-h-[65vh] overflow-y-auto text-xs">
              {PROVIDER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    startNew({
                      name: preset.id === "custom" ? "" : preset.name,
                      baseUrl: preset.baseUrl,
                      modelId: preset.modelId,
                    });
                    setPresetModalOpen(false);
                  }}
                  className="flex flex-col items-start justify-between rounded-xl border border-[#252B3A] bg-[#0D1018] p-3 text-left hover:border-[#A78BFA]/60 hover:bg-[#191E2C] transition-colors cursor-pointer"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="font-semibold text-[#F3F4F8] truncate">
                      {preset.name}
                    </span>
                    <Badge
                      variant={
                        preset.tag === "Local"
                          ? "cyan"
                          : preset.tag === "Custom"
                          ? "default"
                          : "violet"
                      }
                    >
                      {preset.tag}
                    </Badge>
                  </div>
                  <div className="mt-1.5 text-[11px] text-[#67DDF2] truncate w-full">
                    {preset.modelId}
                  </div>
                  <div className="mt-0.5 text-[10px] font-mono text-[#9399AA] truncate w-full">
                    {preset.baseUrl}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
