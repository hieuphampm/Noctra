import {
  Server,
  Cpu,
  Plug,
  BookOpen,
  Workflow,
  ShieldCheck,
} from "lucide-react";

const nodes = [
  {
    title: "AI Providers",
    subtitle: "OpenAI-Compatible / Local",
    detail: "Cloud APIs, Ollama, LM Studio via POST /chat/completions",
    icon: Server,
    accent: "text-[#A78BFA] border-[#A78BFA]/30 bg-[#A78BFA]/10",
  },
  {
    title: "Custom Agents",
    subtitle: "Scoped Identity & Guardrails",
    detail: "System prompts, model overrides, maxSteps, isolated memory",
    icon: Cpu,
    accent: "text-[#67DDF2] border-[#67DDF2]/30 bg-[#67DDF2]/10",
  },
  {
    title: "MCP Servers",
    subtitle: "stdio & Streamable HTTP",
    detail: "JSON-RPC 2.0 tools, resources, and prompts with jsonschema validation",
    icon: Plug,
    accent: "text-[#67DDF2] border-[#67DDF2]/30 bg-[#67DDF2]/10",
  },
  {
    title: "Skills Center",
    subtitle: "SKILL.md Modules",
    detail: "Local authoring, ZIP import, or pre-inspected GitHub Skills",
    icon: BookOpen,
    accent: "text-[#A78BFA] border-[#A78BFA]/30 bg-[#A78BFA]/10",
  },
  {
    title: "Workflow Engine",
    subtitle: "Pausable DAG Execution",
    detail: "Orchestrate agents, tools, conditionals, and human Approval gates",
    icon: Workflow,
    accent: "text-[#67DDF2] border-[#67DDF2]/30 bg-[#67DDF2]/10",
  },
];

export function ArchitectureDiagram() {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#10131D] p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <span className="font-mono text-xs tracking-wider text-[#67DDF2] uppercase">
            Unified Local Architecture
          </span>
          <h3 className="mt-1 text-xl font-semibold text-[#F5F5FA]">
            How Providers, Agents, MCP Servers, Skills, and Workflows Connect
          </h3>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 font-mono text-xs text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Permission &amp; Keyring Boundary</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {nodes.map((node, index) => (
          <div
            key={node.title}
            className="relative flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#171B28] p-4"
          >
            <div>
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${node.accent}`}
                >
                  <node.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="font-mono text-[11px] text-[#969BAD]">
                  0{index + 1}
                </span>
              </div>
              <h4 className="mt-4 text-sm font-semibold text-[#F5F5FA]">
                {node.title}
              </h4>
              <p className="mt-0.5 font-mono text-[11px] text-[#67DDF2]">
                {node.subtitle}
              </p>
              <p className="mt-2.5 text-xs leading-relaxed text-[#969BAD]">
                {node.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
