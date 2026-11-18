import * as React from "react";
import {
  Bot,
  Cpu,
  FolderKanban,
  GitBranch,
  MessageSquarePlus,
  Plug,
  Search,
  Settings,
  Sparkles,
  Store,
  Terminal,
} from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useI18n } from "@/i18n";
import type { NavSection } from "@/types/noctra";

interface CommandItem {
  id: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
}

export function CommandPalette({
  onNewChat,
}: {
  onNewChat: () => void;
}) {
  const { t } = useI18n();
  const open = useAppStore((s) => s.commandPaletteOpen);
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setSection = useAppStore((s) => s.setActiveSection);
  const setDevConsole = useAppStore((s) => s.setDevConsoleOpen);
  const devConsoleOpen = useAppStore((s) => s.devConsoleOpen);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  if (!open) return null;

  const go = (s: NavSection) => {
    setSection(s);
    setOpen(false);
  };

  const items: CommandItem[] = [
    {
      id: "new-chat",
      label: t("cmd.newChat"),
      hint: "Ctrl+N",
      icon: MessageSquarePlus,
      action: () => {
        onNewChat();
        setOpen(false);
      },
    },
    {
      id: "nav-chat",
      label: t("cmd.navChat"),
      hint: t("nav.chat"),
      icon: Sparkles,
      action: () => go("chat"),
    },
    {
      id: "nav-providers",
      label: t("cmd.navProviders"),
      hint: "OpenAI-compatible",
      icon: Cpu,
      action: () => go("providers"),
    },
    {
      id: "nav-agents",
      label: t("cmd.navAgents"),
      hint: "Ctrl+Shift+N",
      icon: Bot,
      action: () => go("agents"),
    },
    {
      id: "nav-mcp",
      label: t("cmd.navMcp"),
      hint: "Ctrl+Shift+M",
      icon: Plug,
      action: () => go("mcp"),
    },
    {
      id: "nav-skills",
      label: t("cmd.navSkills"),
      hint: "Ctrl+Shift+S",
      icon: Sparkles,
      action: () => go("skills"),
    },
    {
      id: "nav-workflows",
      label: t("cmd.navWorkflows"),
      hint: "Visual DAG",
      icon: GitBranch,
      action: () => go("workflows"),
    },
    {
      id: "nav-projects",
      label: t("cmd.navProjects"),
      hint: t("nav.projects"),
      icon: FolderKanban,
      action: () => go("projects"),
    },
    {
      id: "nav-marketplace",
      label: t("cmd.navMarketplace"),
      hint: "MCP & Skills",
      icon: Store,
      action: () => go("marketplace"),
    },
    {
      id: "nav-settings",
      label: t("cmd.navSettings"),
      hint: "Ctrl+,",
      icon: Settings,
      action: () => go("settings"),
    },
    {
      id: "toggle-console",
      label: devConsoleOpen ? t("cmd.hideConsole") : t("cmd.showConsole"),
      hint: t("status.console"),
      icon: Terminal,
      action: () => {
        setDevConsole(!devConsoleOpen);
        setOpen(false);
      },
    },
  ];

  const filtered = items.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 backdrop-blur-sm pt-20 px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[#252B3A] bg-[#121622] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-[#252B3A] px-4 py-3">
          <Search className="h-4 w-4 text-[#A78BFA]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter" && filtered[0]) filtered[0].action();
            }}
            placeholder={t("cmd.placeholder")}
            className="w-full bg-transparent text-sm text-[#F3F4F8] placeholder:text-[#9399AA] focus:outline-none"
          />
          <span className="rounded border border-[#252B3A] bg-[#090B10] px-1.5 py-0.5 text-[10px] text-[#9399AA]">
            ESC
          </span>
        </div>
        <div className="max-h-80 overflow-y-auto p-2 space-y-0.5">
          {filtered.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={item.action}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs text-[#F3F4F8] hover:bg-[#191E2C] transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 text-[#A78BFA]" />
                  <span>{item.label}</span>
                </span>
                <span className="text-[11px] text-[#9399AA]">{item.hint}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-6 text-center text-xs text-[#9399AA]">
              {t("cmd.noMatch")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
