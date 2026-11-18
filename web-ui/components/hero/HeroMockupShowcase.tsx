"use client";

import { motion } from "framer-motion";
import {
  ShieldCheck,
  Cpu,
  Plug,
  Workflow,
  Smartphone,
  Lock,
  Sparkles,
  FileText,
  KeyRound,
} from "lucide-react";

export function HeroMockupShowcase() {
  return (
    <div className="relative mx-auto mt-14 max-w-6xl">
      {/* Subtle Ambient Lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-12 left-1/4 h-72 w-72 rounded-full bg-[#A78BFA]/15 blur-[110px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 right-1/5 h-64 w-64 rounded-full bg-[#67DDF2]/12 blur-[110px]"
      />

      {/* Abstract Connected AI Network SVG Layer */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1100 520"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-55"
        fill="none"
      >
        <defs>
          <linearGradient id="netLine" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#67DDF2" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#A78BFA" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <path
          d="M140 90 C 260 90, 280 210, 420 210"
          stroke="url(#netLine)"
          strokeWidth="1.2"
          strokeDasharray="4 6"
        />
        <path
          d="M950 110 C 820 110, 780 240, 660 240"
          stroke="url(#netLine)"
          strokeWidth="1.2"
          strokeDasharray="4 6"
        />
        <circle cx="140" cy="90" r="3.5" fill="#A78BFA" fillOpacity="0.7" />
        <circle cx="950" cy="110" r="3.5" fill="#67DDF2" fillOpacity="0.7" />
      </svg>

      {/* Main Layered Device Composition */}
      <div className="relative grid items-end gap-6 lg:grid-cols-12">
        {/* Desktop Workstation Mockup (NOCTRA STUDIO) */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="lg:col-span-9"
        >
          <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[#10131D]/95 shadow-2xl shadow-black/70">
            {/* Window Chrome */}
            <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#0B0E17] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="ml-3 font-mono text-xs text-[#969BAD]">
                  NOCTRA STUDIO — Local Agent &amp; MCP Workspace
                </span>
              </div>
              <span className="rounded-full border border-[#67DDF2]/25 bg-[#67DDF2]/10 px-2.5 py-0.5 font-mono text-[10px] text-[#67DDF2]">
                Interactive UI Mockup
              </span>
            </div>

            {/* Desktop Workspace Body */}
            <div className="grid min-h-[360px] md:grid-cols-12">
              {/* Left Sidebar */}
              <div className="border-b border-white/[0.08] bg-[#0D1019] p-4 md:col-span-3 md:border-r md:border-b-0">
                <div className="space-y-1.5">
                  {[
                    { icon: Sparkles, label: "Agent Chat", active: false },
                    { icon: Plug, label: "MCP Hub", active: true },
                    { icon: Cpu, label: "Agent Builder", active: false },
                    { icon: Workflow, label: "Workflow DAG", active: false },
                    { icon: ShieldCheck, label: "Permissions", active: false },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium ${
                        item.active
                          ? "border border-[#67DDF2]/30 bg-[#67DDF2]/10 text-[#F5F5FA]"
                          : "text-[#969BAD]"
                      }`}
                    >
                      <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-xl border border-white/[0.07] bg-[#171B28]/70 p-3">
                  <div className="flex items-center gap-2 text-[11px] font-medium text-[#F5F5FA]">
                    <Lock className="h-3 w-3 text-[#A78BFA]" aria-hidden="true" />
                    <span>OS Keyring Active</span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] leading-relaxed text-[#969BAD]">
                    SQLite local store · Zero telemetry
                  </p>
                </div>
              </div>

              {/* Center Canvas */}
              <div className="p-5 md:col-span-9">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[#F5F5FA]">
                      MCP Hub &amp; Agent Runtime
                    </h3>
                    <p className="text-xs text-[#969BAD]">
                      MCP 2025-03-26 · stdio &amp; Streamable HTTP transports
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] text-emerald-300">
                      2 Servers Connected
                    </span>
                    <span className="rounded-md border border-[#A78BFA]/30 bg-[#A78BFA]/10 px-2.5 py-1 font-mono text-[10px] text-[#A78BFA]">
                      Ask Every Time
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/[0.08] bg-[#171B28] p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-medium text-[#67DDF2]">
                        filesystem-local
                      </span>
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-[#969BAD]">
                        stdio
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[#969BAD]">
                      Path containment verified · Filtered child env
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/[0.08] bg-[#171B28] p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-medium text-[#A78BFA]">
                        github-skills-inspector
                      </span>
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-[#969BAD]">
                        HTTP
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[#969BAD]">
                      Pre-install SKILL.md preview · Scripts isolated
                    </p>
                  </div>
                </div>

                {/* Mini Workflow Pipeline */}
                <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#0B0E17] p-4">
                  <div className="mb-3 flex items-center justify-between text-[11px] font-mono text-[#969BAD]">
                    <span>WORKFLOW DAG PIPELINE</span>
                    <span className="text-[#67DDF2]">Approval Gate Ready</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {["Input", "Research Agent", "MCP Tool", "Human Approval", "Output"].map(
                      (node, idx, arr) => (
                        <div key={node} className="flex items-center gap-2">
                          <span
                            className={`rounded-lg border px-2.5 py-1.5 font-mono text-[11px] ${
                              node === "Human Approval"
                                ? "border-[#A78BFA]/40 bg-[#A78BFA]/15 text-[#F5F5FA]"
                                : "border-white/[0.08] bg-[#171B28] text-[#969BAD]"
                            }`}
                          >
                            {node}
                          </span>
                          {idx < arr.length - 1 && (
                            <span className="text-[#969BAD]/50" aria-hidden="true">
                              →
                            </span>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Smartphone Mockup (NOCTRA AI) */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-[300px] lg:col-span-3 lg:-ml-8"
        >
          <div className="rounded-[2rem] border border-white/[0.14] bg-[#090B10] p-3 shadow-2xl shadow-black/80 ring-1 ring-[#A78BFA]/20">
            <div className="rounded-[1.45rem] border border-white/[0.06] bg-[#11141C] p-3.5">
              {/* Phone Header */}
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-3.5 w-3.5 text-[#A78BFA]" aria-hidden="true" />
                  <span className="text-xs font-semibold text-[#F5F5FA]">
                    NOCTRA AI
                  </span>
                </div>
                <span className="rounded-full bg-[#A78BFA]/15 px-2 py-0.5 font-mono text-[9px] text-[#A78BFA]">
                  Android
                </span>
              </div>

              {/* Endpoint Pill */}
              <div className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.08] bg-[#171B26] px-2.5 py-1.5">
                <span className="font-mono text-[10px] text-[#67DDF2]">
                  OpenAI-Compatible
                </span>
                <KeyRound className="h-3 w-3 text-[#A78BFA]" aria-hidden="true" />
              </div>

              {/* Chat Bubbles */}
              <div className="mt-3 space-y-2.5 text-[11px]">
                <div className="ml-6 rounded-xl rounded-tr-sm bg-[#A78BFA]/20 p-2.5 text-[#F5F5FA]">
                  Summarize the attached architecture notes locally.
                </div>

                <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#090B10] px-2.5 py-1.5 font-mono text-[10px] text-[#969BAD]">
                  <FileText className="h-3 w-3 text-[#67DDF2]" aria-hidden="true" />
                  <span>notes.pdf · extracted on-device</span>
                </div>

                <div className="mr-4 rounded-xl rounded-tl-sm border border-white/[0.08] bg-[#171B26] p-2.5 leading-relaxed text-[#F5F5FA]">
                  Parsed locally via Hive vault. Streaming directly from your
                  configured endpoint...
                </div>
              </div>

              {/* Composer */}
              <div className="mt-3 flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#090B10] px-3 py-2 text-[10px] text-[#969BAD]">
                <span>Keystore Secured</span>
                <span className="font-mono text-[#A78BFA]">SSE</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
