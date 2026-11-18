import * as React from "react";
import { ChevronDown, ChevronUp, FileText, Sparkles, X } from "lucide-react";
import { useI18n } from "@/i18n";

interface AiChangedFilesPopupProps {
  paths: string[];
  onSelectFile: (relativePath: string) => void;
  onDismiss: () => void;
}

export function AiChangedFilesPopup({
  paths,
  onSelectFile,
  onDismiss,
}: AiChangedFilesPopupProps) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  if (paths.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="relative z-20 border-b border-emerald-500/20 bg-[#0D1018]/95 px-4 py-1.5 text-[11px]"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-1.5 text-emerald-300 font-medium hover:text-emerald-200 cursor-pointer"
        >
          <Sparkles className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {t("projects.aiUpdated")} ({paths.length})
          </span>
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[#9399AA]" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#9399AA]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onDismiss();
          }}
          title="Dismiss"
          aria-label="Dismiss AI updated files"
          className="rounded p-0.5 text-[#9399AA] hover:bg-[#191E2C] hover:text-[#F3F4F8] cursor-pointer"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {open && (
        <div
          role="region"
          aria-label="AI updated files list"
          className="absolute left-4 right-4 top-full mt-1.5 z-30 rounded-xl border border-emerald-500/30 bg-[#121622]/95 backdrop-blur-md shadow-2xl p-2 max-h-64 overflow-y-auto space-y-1"
        >
          {paths.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                onSelectFile(p);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 text-left font-mono text-[11px] text-[#67DDF2] hover:border-emerald-500/30 hover:bg-[#191E2C] cursor-pointer"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span className="truncate">{p}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
