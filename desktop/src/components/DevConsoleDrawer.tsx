import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Terminal, Trash2, X } from "lucide-react";
import { api, isTauriRuntime } from "@/services/tauri";
import { useAppStore } from "@/stores/appStore";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/utils/cn";

export function DevConsoleDrawer() {
  const { t } = useI18n();
  const open = useAppStore((s) => s.devConsoleOpen);
  const setOpen = useAppStore((s) => s.setDevConsoleOpen);
  const [filterSource, setFilterSource] = React.useState("all");
  const qc = useQueryClient();

  const { data: logs = [], refetch } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => api.listAuditLogs(200),
    enabled: open && isTauriRuntime(),
    refetchInterval: open ? 3000 : false,
  });

  if (!open) return null;

  const filtered =
    filterSource === "all"
      ? logs
      : logs.filter((l) => l.source === filterSource);

  const clear = async () => {
    await api.clearAuditLogs();
    qc.invalidateQueries({ queryKey: ["audit-logs"] });
  };

  return (
    <div className="h-64 border-t border-[#252B3A] bg-[#0D1018] flex flex-col">
      <div className="flex items-center justify-between border-b border-[#252B3A] px-4 py-1.5">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#F3F4F8]">
            <Terminal className="h-3.5 w-3.5 text-[#67DDF2]" />
            {t("console.title")}
          </span>
          <span className="text-[10px] text-[#9399AA]">
            {t("console.redacted")}
          </span>
          <div className="flex items-center gap-1">
            {["all", "ai", "mcp", "agent", "workflow", "skill", "security"].map(
              (src) => (
                <button
                  key={src}
                  onClick={() => setFilterSource(src)}
                  className={`rounded px-2 py-0.5 text-[10px] capitalize cursor-pointer ${
                    filterSource === src
                      ? "bg-[#A78BFA]/20 text-[#A78BFA]"
                      : "text-[#9399AA] hover:text-[#F3F4F8]"
                  }`}
                >
                  {src}
                </button>
              )
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" onClick={clear}>
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 font-mono text-[11px] space-y-1">
        {filtered.length === 0 ? (
          <div className="text-[#9399AA] py-4 text-center">
            No local diagnostic events recorded yet.
          </div>
        ) : (
          filtered.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-2.5 rounded px-2 py-1 hover:bg-[#121622]"
            >
              <span className="text-[#9399AA] shrink-0">
                {formatRelativeTime(entry.createdAt)}
              </span>
              <Badge
                variant={
                  entry.level === "error"
                    ? "danger"
                    : entry.level === "warn"
                    ? "warning"
                    : "cyan"
                }
                className="uppercase text-[9px] py-0"
              >
                {entry.source}
              </Badge>
              <span className="text-[#F3F4F8] flex-1 break-all">
                {entry.message}
                {entry.detail && (
                  <span className="block text-[#9399AA] mt-0.5">
                    {entry.detail}
                  </span>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
