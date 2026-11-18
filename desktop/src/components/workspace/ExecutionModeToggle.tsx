import { ShieldCheck, Zap } from "lucide-react";
import type { ExecutionMode } from "@/types/noctra";
import { useI18n } from "@/i18n";

interface ExecutionModeToggleProps {
  value: ExecutionMode;
  onChange: (mode: ExecutionMode) => void;
  compact?: boolean;
}

export function ExecutionModeToggle({
  value,
  onChange,
  compact = false,
}: ExecutionModeToggleProps) {
  const { t } = useI18n();
  const isReview = value !== "turbo";

  return (
    <div
      role="group"
      aria-label="Execution Mode"
      className="inline-flex items-center rounded-lg border border-[#252B3A] bg-[#090B10] p-0.5 text-[11px]"
    >
      <button
        type="button"
        onClick={() => onChange("review")}
        title={t("mode.reviewHint")}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors cursor-pointer ${
          isReview
            ? "bg-amber-500/20 text-amber-300 font-medium shadow-sm"
            : "text-[#9399AA] hover:text-[#F3F4F8]"
        }`}
      >
        <ShieldCheck className="h-3 w-3 shrink-0" />
        <span>{t("mode.review")}</span>
        {!compact && (
          <span className="hidden xl:inline text-[9px] opacity-80">• Ask</span>
        )}
      </button>
      <button
        type="button"
        onClick={() => onChange("turbo")}
        title={t("mode.turboHint")}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors cursor-pointer ${
          !isReview
            ? "bg-emerald-500/20 text-emerald-300 font-medium shadow-sm"
            : "text-[#9399AA] hover:text-[#F3F4F8]"
        }`}
      >
        <Zap className="h-3 w-3 shrink-0" />
        <span>{t("mode.turbo")}</span>
        {!compact && (
          <span className="hidden xl:inline text-[9px] opacity-80">• Auto</span>
        )}
      </button>
    </div>
  );
}
