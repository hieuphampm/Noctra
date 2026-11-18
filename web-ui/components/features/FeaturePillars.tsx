import {
  ShieldCheck,
  Server,
  Plug,
  Cpu,
  BookOpen,
  Workflow,
  AlertCircle,
} from "lucide-react";
import { MotionReveal } from "@/components/shared/MotionReveal";
import { SectionHeading } from "@/components/shared/SectionHeading";

const pillars = [
  {
    code: "A",
    title: "Private by Design",
    subtitle: "Local-first storage & OS credential isolation",
    icon: ShieldCheck,
    accent: "violet" as const,
    points: [
      "Local conversation storage (Hive on Android, SQLite on Desktop)",
      "User-controlled API configuration with no mandatory account",
      "Zero advertising and zero analytics or tracking by default",
      "Hardware/OS-backed credential storage (Android Keystore & OS Keyring)",
    ],
    notice:
      "Transparency Note: When you send requests or attachments to an external AI provider or remote MCP server, that content is transmitted directly to that configured provider under its own policies.",
  },
  {
    code: "B",
    title: "Your AI Providers",
    subtitle: "OpenAI-compatible REST & SSE endpoints",
    icon: Server,
    accent: "cyan" as const,
    points: [
      "Standard POST /chat/completions & GET /models integration",
      "Connect cloud endpoints or local servers (Ollama, LM Studio)",
      "Live SSE token streaming with automatic JSON fallback",
      "Custom base URLs, model overrides, and connection testers",
    ],
  },
  {
    code: "C",
    title: "MCP Ecosystem",
    subtitle: "Official MCP 2025-03-26 JSON-RPC 2.0",
    icon: Plug,
    accent: "cyan" as const,
    points: [
      "Simultaneous local stdio and remote Streamable HTTP servers",
      "Strict JSON Schema input validation via jsonschema",
      "Unified Tool Explorer for Tools, Resources, and Prompts",
      "Health pings, bounded auto-reconnect, and redacted logs",
    ],
  },
  {
    code: "D",
    title: "Build Custom Agents",
    subtitle: "Deterministic tool scoping & guardrails",
    icon: Cpu,
    accent: "violet" as const,
    points: [
      "Configure identity, system prompt, model, Skills, and tools",
      "Canonicalized directory path containment for project scopes",
      "Execution limits: maxSteps, maxToolCalls, maxRuntimeSecs",
      "Interactive permission policies: Ask Every Time, Session, Allow, Deny",
    ],
  },
  {
    code: "E",
    title: "Skills Ecosystem",
    subtitle: "GitHub pre-install inspection & local authoring",
    icon: BookOpen,
    accent: "violet" as const,
    points: [
      "SKILL.md YAML frontmatter + Markdown parser and built-in editor",
      "Inspect GitHub repositories, branches, and commits before install",
      "Local folder and ZIP imports with supporting file trees",
      "Untrusted by default: Skill scripts/ are never auto-executed",
    ],
  },
  {
    code: "F",
    title: "Automation & Workflows",
    subtitle: "Multi-agent orchestration & DAG execution",
    icon: Workflow,
    accent: "cyan" as const,
    points: [
      "Visual DAG nodes: Start, Input, AI Agent, MCP Tool, Skill, Conditional",
      "Human-in-the-loop Approval gates and Delay controls",
      "Pause, resume, cancel, and inspect live execution timelines",
      "Sequential and parallel multi-agent delegation with maxAgentDepth",
    ],
  },
];

export function FeaturePillars() {
  return (
    <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Ecosystem Architecture"
        title="Six pillars designed around user sovereignty."
        description="Every subsystem in NOCTRA AI and NOCTRA STUDIO separates local execution and storage from external model inference."
      />

      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {pillars.map((pillar, index) => (
          <MotionReveal key={pillar.code} delay={index * 0.04}>
            <div className="flex h-full flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#10131D] p-6 transition-colors hover:border-white/[0.14]">
              <div>
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${
                      pillar.accent === "cyan"
                        ? "border-[#67DDF2]/30 bg-[#67DDF2]/10 text-[#67DDF2]"
                        : "border-[#A78BFA]/30 bg-[#A78BFA]/10 text-[#A78BFA]"
                    }`}
                  >
                    <pillar.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-xs text-[#969BAD]">
                    0{index + 1} · {pillar.code}
                  </span>
                </div>

                <h3 className="mt-5 text-xl font-semibold text-[#F5F5FA]">
                  {pillar.title}
                </h3>
                <p className="mt-1 font-mono text-xs text-[#67DDF2]">
                  {pillar.subtitle}
                </p>

                <ul className="mt-4 space-y-2.5 text-sm text-[#969BAD]">
                  {pillar.points.map((point) => (
                    <li key={point} className="flex items-start gap-2.5">
                      <span
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#A78BFA]"
                        aria-hidden="true"
                      />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {pillar.notice && (
                <div className="mt-5 flex items-start gap-2 rounded-xl border border-white/[0.08] bg-[#0B0E17] p-3 text-xs leading-relaxed text-[#969BAD]">
                  <AlertCircle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#67DDF2]"
                    aria-hidden="true"
                  />
                  <span>{pillar.notice}</span>
                </div>
              )}
            </div>
          </MotionReveal>
        ))}
      </div>
    </section>
  );
}
