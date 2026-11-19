import { Globe, GlobeLock } from "lucide-react";
import { useI18n } from "@/i18n";

interface InternetModeToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function InternetModeToggle({ enabled, onChange }: InternetModeToggleProps) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={t("internet.label")}
      title={t("internet.toggleHint")}
      onClick={() => onChange(!enabled)}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition-colors cursor-pointer ${
        enabled
          ? "border-[#67DDF2]/50 bg-[#67DDF2]/15 text-[#67DDF2] font-medium shadow-sm"
          : "border-[#252B3A] bg-[#090B10] text-[#9399AA] hover:text-[#F3F4F8]"
      }`}
    >
      {enabled ? (
        <Globe className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <GlobeLock className="h-3.5 w-3.5 shrink-0" />
      )}
      <span>{enabled ? t("internet.on") : t("internet.off")}</span>
    </button>
  );
}
