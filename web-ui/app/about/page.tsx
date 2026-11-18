import Link from "next/link";
import { ArrowRight, Compass, Lock, Layers, Radio } from "lucide-react";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { siteConfig } from "@/data/site-config";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
  title: "About NOCTRA",
  description:
    "Learn about NOCTRA's philosophy, local-first privacy principles, development roadmap, and configurable community channels.",
  path: "/about",
});

const roadmapItems = [
  {
    phase: "Foundation",
    title: "Local-First Mobile & Desktop Clients",
    detail:
      "NOCTRA AI (Flutter/Hive/Keystore) and NOCTRA STUDIO (Tauri 2/Rust/SQLite/MCP) core architectures built around zero developer telemetry.",
  },
  {
    phase: "Distribution",
    title: "Signed Public Releases & Checksums",
    detail:
      "Publish signed installers for Android, Windows, macOS, and Linux via the centralized Download Center with SHA-256 verification.",
  },
  {
    phase: "Ecosystem",
    title: "Expanded MCP Registries & Skill Catalogs",
    detail:
      "Broaden pluggable marketplace adapters and safe pre-install GitHub Skill inspection workflows while preserving untrusted-by-default safeguards.",
  },
];

export default function AboutPage() {
  const isDev = process.env.NODE_ENV === "development";
  const configuredLinks = siteConfig.communityLinks.filter((l) =>
    Boolean(l.href)
  );

  return (
    <>
      <section className="border-b border-white/[0.08] noctra-grid-bg">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <SectionHeading
            eyebrow="About NOCTRA"
            title="Technology should empower people, not take control away from them."
          />

          <div className="mt-8 space-y-5 text-base leading-relaxed text-[#969BAD] sm:text-lg">
            <p>
              NOCTRA is built around a simple idea: AI should be flexible,
              transparent, and controlled by the people who use it.
            </p>
            <p>
              Whether you are having a conversation with an AI assistant or
              building an ecosystem of intelligent agents, your tools should
              adapt to you.
            </p>
          </div>
        </div>
      </section>

      {/* Philosophy & Privacy Principles */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.08] bg-[#10131D] p-7">
            <Compass
              className="h-6 w-6 text-[#A78BFA]"
              aria-hidden="true"
            />
            <h2 className="mt-4 text-xl font-semibold text-[#F5F5FA]">
              Product Philosophy
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#969BAD]">
              Keep software modular, inspectable, and independent of vendor
              lock-in. Users bring their own providers, local models, MCP tools,
              and Skills.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#10131D] p-7">
            <Lock className="h-6 w-6 text-[#67DDF2]" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold text-[#F5F5FA]">
              Privacy Principles
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#969BAD]">
              Zero mandatory accounts, zero analytics or ad trackers, OS-native
              credential isolation, and clear disclosure whenever data is
              transmitted to external AI providers.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#10131D] p-7">
            <Layers className="h-6 w-6 text-[#A78BFA]" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold text-[#F5F5FA]">
              Honest Engineering
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#969BAD]">
              Every security boundary—from untrusted-by-default GitHub Skills to
              interactive tool approval prompts—is documented openly without
              exaggerated claims.
            </p>
          </div>
        </div>
      </section>

      {/* Development Roadmap */}
      <section className="border-t border-white/[0.08] bg-[#0B0E17]/60">
        <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Development Roadmap"
            title="Where the ecosystem is headed."
            accent="cyan"
          />

          <div className="mt-10 space-y-4">
            {roadmapItems.map((item, idx) => (
              <div
                key={item.phase}
                className="rounded-2xl border border-white/[0.08] bg-[#10131D] p-6"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-[#67DDF2]/30 bg-[#67DDF2]/10 px-3 py-0.5 font-mono text-xs text-[#67DDF2]">
                    0{idx + 1} · {item.phase}
                  </span>
                  <h3 className="text-lg font-semibold text-[#F5F5FA]">
                    {item.title}
                  </h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[#969BAD]">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact & Community (Configurable Placeholders) */}
      <section
        id="community"
        className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8"
      >
        <SectionHeading
          eyebrow="Contact & Community"
          title="Repositories, support channels, and feedback."
          description="External links are configured via environment variables in data/site-config.ts so unconfigured URLs are never fabricated."
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {siteConfig.communityLinks.map((channel) => {
            if (channel.href) {
              return (
                <a
                  key={channel.id}
                  href={channel.href}
                  target={channel.id === "email" ? undefined : "_blank"}
                  rel={
                    channel.id === "email" ? undefined : "noopener noreferrer"
                  }
                  className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-[#10131D] p-5 transition-colors hover:border-[#A78BFA]/40"
                >
                  <div>
                    <div className="text-sm font-semibold text-[#F5F5FA]">
                      {channel.label}
                    </div>
                    <div className="mt-1 font-mono text-xs text-[#67DDF2]">
                      Configured
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[#969BAD]" aria-hidden="true" />
                </a>
              );
            }

            if (!isDev && configuredLinks.length > 0) {
              return null;
            }

            return (
              <div
                key={channel.id}
                className="rounded-2xl border border-dashed border-white/[0.12] bg-[#10131D]/60 p-5"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-[#F5F5FA]">
                  <Radio className="h-4 w-4 text-[#969BAD]" aria-hidden="true" />
                  <span>{channel.label}</span>
                </div>
                <p className="mt-2 font-mono text-[11px] text-[#969BAD]">
                  {isDev
                    ? `Placeholder (Dev): ${channel.placeholderNote}`
                    : "Not yet published — configure via environment settings."}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-10">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-xl bg-[#A78BFA] px-5 py-2.5 text-sm font-semibold text-[#080A10] hover:bg-[#B89FFF]"
          >
            <span>Browse Documentation</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
