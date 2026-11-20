import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Cpu, MessageSquare, Sparkles, X } from "lucide-react";
import { api, isTauriRuntime } from "@/services/tauri";
import { useAppStore } from "@/stores/appStore";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function ProviderPickerModal() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const open = useAppStore((s) => s.providerPickerOpen);
  const newlyAddedId = useAppStore((s) => s.newlyAddedProviderId);
  const closePicker = useAppStore((s) => s.closeProviderPicker);
  const activeConvId = useAppStore((s) => s.activeConversationId);
  const preferredProviderId = useAppStore((s) => s.preferredProviderId);
  const setPreferredProviderId = useAppStore((s) => s.setPreferredProviderId);
  const setActiveSection = useAppStore((s) => s.setActiveSection);

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
  const currentActiveId =
    activeConv?.activeProviderId ??
    preferredProviderId ??
    settings?.ai?.defaultProviderId ??
    providers[0]?.id ??
    null;

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [setAsDefault, setSetAsDefault] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSelectedId(newlyAddedId ?? currentActiveId ?? providers[0]?.id ?? null);
    setSetAsDefault(true);
  }, [open, newlyAddedId, currentActiveId, providers]);

  if (!open) return null;

  const applySelection = async (openChatAfter: boolean) => {
    const chosen = providers.find((p) => p.id === selectedId) ?? providers[0];
    if (!chosen) {
      closePicker();
      return;
    }
    setBusy(true);
    try {
      setPreferredProviderId(chosen.id);

      if (isTauriRuntime()) {
        if (activeConv) {
          await api.updateConversation({
            ...activeConv,
            activeProviderId: chosen.id,
            activeModel: chosen.modelId,
          });
          await qc.invalidateQueries({ queryKey: ["conversations"] });
        }
        if (setAsDefault && settings) {
          await api.saveSettings({
            ...settings,
            ai: {
              ...settings.ai,
              defaultProviderId: chosen.id,
              defaultModel: chosen.modelId,
            },
          });
          await qc.invalidateQueries({ queryKey: ["settings"] });
        }
      }

      closePicker();
      if (openChatAfter) {
        setActiveSection("chat");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={closePicker}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[#A78BFA]/40 bg-[#121622] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#252B3A] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#A78BFA]/15 text-[#A78BFA]">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#F3F4F8]">
                {t("providers.pickerTitle")}
              </h3>
              <p className="text-xs text-[#9399AA]">{t("providers.pickerSubtitle")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closePicker}
            className="rounded-lg p-1 text-[#9399AA] hover:bg-[#191E2C] hover:text-[#F3F4F8] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3.5 text-xs">
          {newlyAddedId && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-2.5 text-emerald-300">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span>{t("providers.pickerNewAdded")}</span>
            </div>
          )}

          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {providers.map((p) => {
              const isSelected = selectedId === p.id;
              const isCurrent = currentActiveId === p.id;
              const isNew = newlyAddedId === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                    isSelected
                      ? "border-[#A78BFA] bg-[#191E2C]"
                      : "border-[#252B3A] bg-[#0D1018] hover:border-[#252B3A]/80 hover:bg-[#161B29]"
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        isSelected
                          ? "border-[#A78BFA] bg-[#A78BFA] text-[#090B10]"
                          : "border-[#252B3A] bg-[#090B10]"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-[#F3F4F8] truncate">
                          {p.name}
                        </span>
                        {isNew && <Badge variant="success">NEW</Badge>}
                        {isCurrent && (
                          <Badge variant="violet">{t("providers.active")}</Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-[#67DDF2] truncate mt-0.5">
                        {p.modelId || "default"}
                      </div>
                      <div className="text-[10px] font-mono text-[#9399AA] truncate">
                        {p.baseUrl}
                      </div>
                    </div>
                  </div>
                  <Badge variant={p.hasApiKey ? "cyan" : "default"}>
                    {p.hasApiKey ? "Keychain" : "No Key"}
                  </Badge>
                </div>
              );
            })}
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-[#252B3A] bg-[#0D1018] px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={setAsDefault}
              onChange={(e) => setSetAsDefault(e.target.checked)}
              className="accent-[#A78BFA]"
            />
            <span className="text-[#F3F4F8]">{t("providers.pickerSetDefault")}</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#252B3A] bg-[#0D1018] px-5 py-3.5">
          <Button type="button" variant="ghost" onClick={closePicker} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !selectedId}
            onClick={() => applySelection(false)}
          >
            <Check className="h-3.5 w-3.5" />
            {t("providers.pickerApply")}
          </Button>
          <Button
            type="button"
            disabled={busy || !selectedId}
            onClick={() => applySelection(true)}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {t("providers.pickerUseAndChat")}
          </Button>
        </div>
      </div>
    </div>
  );
}
