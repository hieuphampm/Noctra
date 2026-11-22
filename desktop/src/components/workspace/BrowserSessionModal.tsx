import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  ExternalLink,
  Layers,
  Play,
  ShieldAlert,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { useI18n } from "@/i18n";
import type { BrowserSessionSnapshot } from "@/types/noctra";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BrowserSessionModalProps {
  open: boolean;
  initialTab?: "launch" | "session";
  session: BrowserSessionSnapshot | null;
  onClose: () => void;
  onRunCommand: (commandText: string) => void;
  onInsertCommand: (commandText: string) => void;
  onCloseSession: () => void;
}

export function BrowserSessionModal({
  open,
  initialTab = "launch",
  session,
  onClose,
  onRunCommand,
  onInsertCommand,
  onCloseSession,
}: BrowserSessionModalProps) {
  const { t } = useI18n();
  const [tab, setTab] = React.useState<"launch" | "session">(initialTab);
  const [urlInput, setUrlInput] = React.useState("");
  const [taskInput, setTaskInput] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setTab(initialTab === "session" && session ? "session" : initialTab);
      if (session?.currentUrl && !urlInput) {
        setUrlInput(session.currentUrl);
      }
    }
  }, [open, initialTab, session]);

  if (!open) return null;

  const buildCommand = () => {
    const cleanUrl = urlInput.trim();
    const cleanTask = taskInput.trim();
    if (cleanUrl && cleanTask) {
      return `/browser ${cleanUrl} ${cleanTask}`;
    }
    if (cleanUrl) {
      return `/browser ${cleanUrl}`;
    }
    if (cleanTask) {
      return `/browser ${cleanTask}`;
    }
    return "/browser https://example.com";
  };

  const canSubmit = Boolean(urlInput.trim() || (session?.currentUrl && taskInput.trim()));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-[#67DDF2]/35 bg-[#121622] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#252B3A] px-5 py-4 bg-[#0D1018]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#67DDF2]/15 text-[#67DDF2]">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#F3F4F8]">
                {t("browser.modalTitle")}
              </h3>
              <p className="text-[11px] text-[#9399AA]">
                {t("browser.modalSubtitle")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#9399AA] hover:bg-[#191E2C] hover:text-[#F3F4F8] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-[#252B3A] bg-[#0D1018]/70 px-5 py-2">
          <button
            type="button"
            onClick={() => setTab("launch")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
              tab === "launch"
                ? "bg-[#67DDF2]/15 text-[#67DDF2]"
                : "text-[#9399AA] hover:text-[#F3F4F8]"
            }`}
          >
            {t("browser.tabLaunch")}
          </button>
          <button
            type="button"
            onClick={() => setTab("session")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
              tab === "session"
                ? "bg-[#A78BFA]/20 text-[#A78BFA]"
                : "text-[#9399AA] hover:text-[#F3F4F8]"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>{t("browser.tabSession")}</span>
            {session?.currentUrl && (
              <Badge variant="success" className="ml-1">
                {session.elements.length}
              </Badge>
            )}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {tab === "launch" ? (
            <>
              <div className="rounded-xl border border-[#67DDF2]/25 bg-[#67DDF2]/10 px-3.5 py-2.5 text-[11px] text-[#F3F4F8]/90 leading-relaxed">
                {t("browser.ruleNotice")}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#9399AA]">
                  {t("browser.urlLabel")}
                </label>
                <input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder={t("browser.urlPlaceholder")}
                  className="w-full rounded-xl border border-[#252B3A] bg-[#090B10] px-3 py-2 font-mono text-xs text-[#F3F4F8] placeholder:text-[#9399AA]/60 focus:border-[#67DDF2]/60 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#9399AA]">
                  {t("browser.taskLabel")}
                </label>
                <textarea
                  rows={3}
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  placeholder={t("browser.taskPlaceholder")}
                  className="w-full rounded-xl border border-[#252B3A] bg-[#090B10] px-3 py-2 text-xs text-[#F3F4F8] placeholder:text-[#9399AA]/60 focus:border-[#67DDF2]/60 focus:outline-none"
                />
              </div>

              <div className="rounded-xl border border-[#252B3A] bg-[#090B10] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-[#9399AA] mb-1">
                  Command Preview
                </div>
                <div className="font-mono text-[11px] text-[#67DDF2] break-all">
                  {buildCommand()}
                </div>
              </div>
            </>
          ) : session?.currentUrl ? (
            <>
              {/* Active Session Summary */}
              <div className="rounded-xl border border-[#252B3A] bg-[#090B10] p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-[#9399AA]">
                    {t("browser.currentUrl")}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {session.httpStatus && (
                      <Badge variant={session.httpStatus < 400 ? "success" : "danger"}>
                        HTTP {session.httpStatus}
                      </Badge>
                    )}
                    <Badge variant="default">{session.loadTimeMs}ms</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#67DDF2] break-all">
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span>{session.currentUrl}</span>
                </div>
                <div className="text-xs font-medium text-[#F3F4F8]">
                  {session.pageTitle}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge variant="cyan">
                    {session.elements.length} {t("browser.bannerElements")}
                  </Badge>
                  <Badge variant="violet">
                    {session.forms.length} {t("browser.bannerForms")}
                  </Badge>
                  <Badge variant="default">
                    {session.actionLog.length} {t("browser.bannerActions")}
                  </Badge>
                </div>
              </div>

              {/* Auth / CAPTCHA Barrier Alert */}
              {session.authBarrier && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2.5 text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                  <div className="space-y-0.5">
                    <div className="font-semibold text-xs">
                      {t("browser.barrierTitle")}: {session.authBarrier.provider}
                    </div>
                    <div className="text-[11px] opacity-90">
                      {session.authBarrier.message}
                    </div>
                  </div>
                </div>
              )}

              {/* Interactive UI Elements */}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-[#F3F4F8]">
                  {t("browser.elementsHeading")} ({session.elements.length})
                </div>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-[#252B3A] bg-[#090B10] divide-y divide-[#252B3A]/70">
                  {session.elements.slice(0, 50).map((el) => (
                    <div
                      key={el.elementId}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-[11px]"
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="font-mono text-[#67DDF2] shrink-0">
                          {el.elementId}
                        </span>
                        <Badge variant={el.isSensitive ? "danger" : "default"}>
                          {el.kind}
                        </Badge>
                        <span className="truncate text-[#F3F4F8]">{el.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {el.isSensitive && (
                          <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                        )}
                        <span className="font-mono text-[10px] text-[#9399AA] max-w-[140px] truncate">
                          {el.selector}
                        </span>
                      </div>
                    </div>
                  ))}
                  {session.elements.length === 0 && (
                    <div className="px-3 py-4 text-center text-[#9399AA]">
                      No interactive UI elements detected on this page.
                    </div>
                  )}
                </div>
              </div>

              {/* Completed Action History */}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-[#F3F4F8]">
                  {t("browser.actionLogHeading")} ({session.actionLog.length})
                </div>
                <div className="max-h-44 overflow-y-auto rounded-xl border border-[#252B3A] bg-[#090B10] divide-y divide-[#252B3A]/70">
                  {session.actionLog.map((act) => (
                    <div key={`${act.step}-${act.timestamp}`} className="px-3 py-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 font-mono text-[11px] text-[#67DDF2]">
                          <Terminal className="h-3 w-3 shrink-0" />
                          <span>
                            #{act.step} {act.action}
                          </span>
                        </span>
                        <Badge
                          variant={
                            act.status === "completed"
                              ? "success"
                              : act.status === "blocked_auth"
                              ? "warning"
                              : "danger"
                          }
                        >
                          {act.status} • {act.durationMs}ms
                        </Badge>
                      </div>
                      <div className="text-[11px] text-[#9399AA] break-words">
                        {act.observation}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-[#252B3A] bg-[#090B10] p-6 text-center text-[#9399AA]">
              {t("browser.noSession")}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#252B3A] bg-[#0D1018] px-5 py-3.5">
          {session?.currentUrl ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => {
                onCloseSession();
                onClose();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("browser.bannerClose")}
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {tab === "launch" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!canSubmit}
                  onClick={() => {
                    onInsertCommand(buildCommand());
                    onClose();
                  }}
                >
                  {t("browser.insertCommand")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="cyan"
                  disabled={!canSubmit}
                  onClick={() => {
                    onRunCommand(buildCommand());
                    onClose();
                  }}
                >
                  <Play className="h-3.5 w-3.5" />
                  {t("browser.runNow")}
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" onClick={onClose}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                OK
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
