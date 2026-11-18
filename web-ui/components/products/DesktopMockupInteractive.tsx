"use client";

import { useState } from "react";
import {
  Plug,
  Cpu,
  BookOpen,
  Workflow,
  ShieldAlert,
  Check,
  GitBranch,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utilities/cn";

const studioTabs = [
  { id: "mcp", label: "MCP Hub", icon: Plug },
  { id: "agents", label: "Agent Builder", icon: Cpu },
  { id: "skills", label: "Skills Center", icon: BookOpen },
  { id: "workflows", label: "Workflow DAG", icon: Workflow },
  { id: "permissions", label: "Permissions", icon: ShieldAlert },
] as const;

type StudioTabId = (typeof studioTabs)[number]["id"];

export function DesktopMockupInteractive() {
  const [activeTab, setActiveTab] = useState<StudioTabId>("mcp");

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[#10131D] shadow-2xl shadow-black/70">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-[#0B0E17] px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          </div>
          <span className="font-mono text-xs text-[#F5F5FA]">
            NOCTRA STUDIO · Tauri 2 + Rust Core
          </span>
        </div>
        <span className="rounded-full border border-[#67DDF2]/25 bg-[#67DDF2]/10 px-3 py-0.5 font-mono text-[10px] text-[#67DDF2]">
          Interactive Desktop UI Preview
        </span>
      </div>

      {/* Tab Switcher */}
      <div className="flex flex-wrap gap-1.5 border-b border-white/[0.08] bg-[#0D1019] px-4 py-2.5">
        {studioTabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#67DDF2]",
                active
                  ? "border border-[#67DDF2]/35 bg-[#67DDF2]/12 text-[#F5F5FA]"
                  : "border border-transparent text-[#969BAD] hover:bg-white/[0.04] hover:text-[#F5F5FA]"
              )}
            >
              <tab.icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === "mcp" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/[0.08] bg-[#171B28] p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-[#67DDF2]">
                  MCP 2025-03-26 Client
                </span>
                <span className="rounded bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                  Healthy
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#969BAD]">
                Manage simultaneous local stdio and remote Streamable HTTP MCP
                servers with Mcp-Session-Id tracking and ping health checks.
              </p>
              <div className="mt-3 rounded-lg bg-[#080A10] p-3 font-mono text-[11px] text-[#969BAD]">
                <div>transport: stdio (filtered env)</div>
                <div>validation: jsonschema strict</div>
                <div>logs: SecretRedactor active</div>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#171B28] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F5F5FA]">
                <Terminal className="h-4 w-4 text-[#A78BFA]" aria-hidden="true" />
                <span>Unified Tool Explorer</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#969BAD]">
                Inspect exposed Tools, Resources, and Prompts, validate JSON
                arguments, and test tool invocations manually before assigning
                them to agents.
              </p>
              <div className="mt-3 space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between rounded bg-[#080A10] px-2.5 py-1.5 text-[#F5F5FA]">
                  <span>read_project_file</span>
                  <span className="text-[#67DDF2]">scoped</span>
                </div>
                <div className="flex justify-between rounded bg-[#080A10] px-2.5 py-1.5 text-[#F5F5FA]">
                  <span>search_docs_index</span>
                  <span className="text-[#A78BFA]">enabled</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "agents" && (
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                name: "Coding Agent",
                model: "Provider Override",
                limits: "maxSteps: 16 · maxToolCalls: 24",
                scope: "Canonicalized project root",
              },
              {
                name: "Research Agent",
                model: "Isolated Memory",
                limits: "maxAgentDepth: 2",
                scope: "Assigned read-only MCP tools",
              },
              {
                name: "Automation Agent",
                model: "Multi-Agent Ready",
                limits: "maxRuntimeSecs: 180",
                scope: "Explicit SKILL.md bindings",
              },
            ].map((agent) => (
              <div
                key={agent.name}
                className="rounded-xl border border-white/[0.08] bg-[#171B28] p-4"
              >
                <div className="text-sm font-semibold text-[#F5F5FA]">
                  {agent.name}
                </div>
                <div className="mt-1 font-mono text-[11px] text-[#67DDF2]">
                  {agent.model}
                </div>
                <div className="mt-3 space-y-1 text-xs text-[#969BAD]">
                  <div>{agent.limits}</div>
                  <div>{agent.scope}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "skills" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/[0.08] bg-[#171B28] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F5F5FA]">
                <GitBranch className="h-4 w-4 text-[#A78BFA]" aria-hidden="true" />
                <span>GitHub Pre-Install Inspector</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#969BAD]">
                Preview repository trees, branches, commits, and SKILL.md YAML
                frontmatter before installing. External skills start flagged as
                unverified.
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-[#171B28] p-4">
              <div className="text-xs font-semibold text-[#F5F5FA]">
                Built-in Skill Editor &amp; ZIP Import
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#969BAD]">
                Author local SKILL.md files with supporting file trees or import
                ZIP archives. Supporting scripts/ directories are indexed as
                metadata only and never auto-executed.
              </p>
            </div>
          </div>
        )}

        {activeTab === "workflows" && (
          <div className="rounded-xl border border-white/[0.08] bg-[#171B28] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-[#F5F5FA]">
                Node-Based DAG Execution Engine
              </span>
              <span className="font-mono text-[11px] text-[#67DDF2]">
                Pause · Resume · Cancel · Run History
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                "Start",
                "Input",
                "AI Agent",
                "Conditional",
                "MCP Tool",
                "Approval",
                "Output",
                "End",
              ].map((node, index, arr) => (
                <div key={node} className="flex items-center gap-2">
                  <span className="rounded-lg border border-white/[0.1] bg-[#080A10] px-3 py-1.5 font-mono text-xs text-[#F5F5FA]">
                    {node}
                  </span>
                  {index < arr.length - 1 && (
                    <span className="text-[#969BAD]/50" aria-hidden="true">
                      →
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "permissions" && (
          <div className="rounded-xl border border-[#A78BFA]/30 bg-[#171B28] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-[#F5F5FA]">
                Interactive Tool Approval Modal
              </span>
              <span className="font-mono text-[11px] text-[#A78BFA]">
                Agent → Project → Global Evaluation
              </span>
            </div>
            <p className="mt-2 text-xs text-[#969BAD]">
              Before a sensitive tool executes, NOCTRA STUDIO pauses and shows
              exact JSON arguments and affected canonicalized paths.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                "Ask every time",
                "Allow for this session",
                "Always allow",
                "Deny",
              ].map((policy, idx) => (
                <span
                  key={policy}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
                    idx === 0
                      ? "border-[#67DDF2]/40 bg-[#67DDF2]/15 text-[#F5F5FA]"
                      : "border-white/[0.08] bg-[#080A10] text-[#969BAD]"
                  )}
                >
                  {idx === 0 && <Check className="h-3 w-3 text-[#67DDF2]" />}
                  {policy}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
