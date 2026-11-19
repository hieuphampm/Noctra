import { ShieldAlert, Terminal, CheckCircle2, XCircle, Globe, Server } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useI18n } from "@/i18n";
import { api } from "@/services/tauri";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function ApprovalModal() {
  const { t } = useI18n();
  const queue = useAppStore((s) => s.approvalQueue);
  const shiftApproval = useAppStore((s) => s.shiftApprovalRequest);

  const current = queue[0];
  if (!current) return null;

  const resource = current.affectedResources[0] || current.toolName;

  const decide = async (
    decision: "allow_once" | "allow_session" | "allow_always" | "deny"
  ) => {
    try {
      await api.resolveApprovalRequest({
        requestId: current.id,
        decision,
        agentId: current.agentId,
        category: current.category,
        resource,
      });
    } finally {
      shiftApproval(current.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-[#A78BFA]/40 bg-[#121622] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#252B3A] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#F3F4F8]">
                {t("approval.title")}
              </h3>
              <p className="text-xs text-[#9399AA]">
                {current.agentName || "Agent Runtime"} {t("approval.requestsAuth")}
              </p>
            </div>
          </div>
          <Badge variant="warning">{current.category}</Badge>
        </div>

        <div className="space-y-3.5 p-5 text-xs">
          {current.category === "internet_access" && (
            <div className="flex items-start gap-2 rounded-lg border border-[#67DDF2]/35 bg-[#67DDF2]/10 px-3 py-2 text-[11px] text-[#67DDF2]">
              <Globe className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{t("internet.approvalWarning")}</span>
            </div>
          )}

          {current.category.startsWith("ssh_") && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300">
              <Server className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{t("ssh.approvalWarning")}</span>
            </div>
          )}

          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#9399AA] mb-1">
              {t("approval.action")}
            </div>
            <div className="rounded-lg border border-[#252B3A] bg-[#090B10] px-3 py-2 text-[#F3F4F8] font-medium">
              {current.actionSummary}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#9399AA] mb-1">
              {t("approval.why")}
            </div>
            <p className="text-[#F3F4F8]/90">{current.reason}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#9399AA] mb-1">
                {t("approval.tool")}
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-[#252B3A] bg-[#090B10] px-2.5 py-1.5 font-mono text-[#67DDF2]">
                <Terminal className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{current.toolName}</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#9399AA] mb-1">
                {t("approval.resources")}
              </div>
              <div className="rounded-lg border border-[#252B3A] bg-[#090B10] px-2.5 py-1.5 font-mono text-[#F3F4F8] truncate">
                {current.affectedResources.join(", ")}
              </div>
            </div>
          </div>

          {current.diffPreview && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#9399AA] mb-1">
                {t("approval.diffPreview")}
              </div>
              <div className="max-h-48 overflow-auto rounded-lg border border-[#252B3A] bg-[#090B10] p-2.5 font-mono text-[11px] leading-relaxed">
                {current.diffPreview.split("\n").map((line, idx) => {
                  const cls = line.startsWith("+") && !line.startsWith("+++")
                    ? "bg-emerald-500/15 text-emerald-300"
                    : line.startsWith("-") && !line.startsWith("---")
                    ? "bg-red-500/15 text-red-300"
                    : line.startsWith("@@")
                    ? "text-[#A78BFA]"
                    : line.startsWith("---") || line.startsWith("+++")
                    ? "text-[#67DDF2]"
                    : "text-[#9399AA]";
                  return (
                    <div key={idx} className={`px-1.5 whitespace-pre-wrap break-all ${cls}`}>
                      {line || " "}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#9399AA] mb-1">
              {t("approval.payload")}
            </div>
            <pre className="max-h-32 overflow-auto rounded-lg border border-[#252B3A] bg-[#090B10] p-3 font-mono text-[11px] text-[#67DDF2]">
              {JSON.stringify(current.exactPayload, null, 2)}
            </pre>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#252B3A] px-5 py-3.5 bg-[#0D1018] rounded-b-2xl">
          <Button variant="destructive" onClick={() => decide("deny")}>
            <XCircle className="h-3.5 w-3.5" />
            {t("approval.deny")}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => decide("allow_always")}>
              {t("approval.allowAlways")}
            </Button>
            <Button variant="cyan" onClick={() => decide("allow_session")}>
              {t("approval.allowSession")}
            </Button>
            <Button onClick={() => decide("allow_once")}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("approval.allowOnce")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
