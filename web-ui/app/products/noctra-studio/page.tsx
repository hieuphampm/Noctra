import Link from "next/link";
import {
  ArrowRight,
  Monitor,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { DesktopMockupInteractive } from "@/components/products/DesktopMockupInteractive";
import { ArchitectureDiagram } from "@/components/features/ArchitectureDiagram";
import { ReleaseCard } from "@/components/downloads/ReleaseCard";
import { FaqAccordion } from "@/components/shared/FaqAccordion";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { faqItems } from "@/data/faq";
import {
  getProductsData,
  getPublishedChannels,
  getReleaseManifests,
} from "@/lib/content/releases";
import { buildPageMetadata, buildSoftwareJsonLd } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
  title: "NOCTRA STUDIO — Desktop AI Agent, MCP & Workflow Platform",
  description:
    "NOCTRA STUDIO is a privacy-first desktop AI platform built with Tauri 2, Rust, React, and SQLite. Connect MCP servers, build custom agents, inspect GitHub Skills, and run DAG workflows.",
  path: "/products/noctra-studio",
  keywords: [
    "NOCTRA STUDIO",
    "Desktop AI agents",
    "MCP desktop client",
    "AI agent builder",
    "AI Skills marketplace",
  ],
});

export default function NoctraStudioPage() {
  const { noctraStudio } = getProductsData();
  const { noctraStudio: releaseManifest } = getReleaseManifests();
  const publishedChannels = getPublishedChannels(releaseManifest);
  const studioFaqs = faqItems.filter(
    (item) =>
      item.category === "noctra-studio" ||
      item.category === "privacy" ||
      item.id === "supported-os"
  );

  const softwareJsonLd = buildSoftwareJsonLd({
    name: noctraStudio.name,
    description: noctraStudio.shortDescription,
    operatingSystem: "Windows, macOS, Linux",
    applicationCategory: "DeveloperApplication",
    url: noctraStudio.href,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />

      {/* Hero */}
      <section className="border-b border-white/[0.08] noctra-grid-bg">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#67DDF2]/30 bg-[#67DDF2]/10 px-3.5 py-1 font-mono text-xs text-[#67DDF2]">
              <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
              <span>NOCTRA STUDIO · Desktop Platform</span>
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-[#F5F5FA] sm:text-5xl lg:text-6xl">
              {noctraStudio.headline}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-[#969BAD]">
              {noctraStudio.overview}
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href="#studio-downloads"
                className="inline-flex items-center gap-2 rounded-xl bg-[#67DDF2] px-5 py-3 text-sm font-semibold text-[#080A10] transition-colors hover:bg-[#8AE7F7]"
              >
                <span>View Release Availability</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <Link
                href="/docs/noctra-studio/mcp-setup"
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-[#10131D] px-5 py-3 text-sm font-semibold text-[#F5F5FA] transition-colors hover:bg-[#171B28]"
              >
                <span>Explore Desktop Docs</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Desktop Showcase */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Desktop Application Showcase"
          title="Five integrated subsystems backed by a Rust/SQLite core."
          description="Switch through MCP Hub, Agent Builder, Skills Center, Workflow DAG, and Permission controls below."
          accent="cyan"
        />
        <div className="mt-10">
          <DesktopMockupInteractive />
        </div>
      </section>

      {/* Core Subsystems (MCP Hub, Agent Builder, Skills Center, Marketplace, Multi-agent, Workflows) */}
      <section className="border-t border-white/[0.08] bg-[#0B0E17]/60">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Platform Capabilities"
            title="Every layer of an extensible desktop AI workstation."
            accent="cyan"
          />

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {noctraStudio.features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-white/[0.08] bg-[#10131D] p-6"
              >
                <h3 className="text-base font-semibold text-[#F5F5FA]">
                  {feature.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-[#969BAD]">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-5">
            {noctraStudio.subsystems.map((sub) => (
              <div
                key={sub.name}
                className="rounded-xl border border-white/[0.08] bg-[#10131D] p-4"
              >
                <div className="flex items-center gap-2 font-mono text-[11px] text-[#67DDF2]">
                  <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{sub.module}</span>
                </div>
                <h4 className="mt-2 text-sm font-semibold text-[#F5F5FA]">
                  {sub.name}
                </h4>
                <p className="mt-1.5 text-xs leading-relaxed text-[#969BAD]">
                  {sub.summary}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture Diagram */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <ArchitectureDiagram />
      </section>

      {/* Permissions, Security & Local-First */}
      <section className="border-t border-white/[0.08] bg-[#0B0E17]/60">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Permissions & Security"
            title="Built for untrusted skills, sandboxed MCP tools, and local storage."
            accent="cyan"
          />

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {noctraStudio.securityModel.map((rule) => (
              <div
                key={rule}
                className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-[#10131D] p-5 text-sm leading-relaxed text-[#F5F5FA]"
              >
                <ShieldCheck
                  className="mt-0.5 h-5 w-5 shrink-0 text-[#67DDF2]"
                  aria-hidden="true"
                />
                <span>{rule}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#A78BFA]/25 bg-[#A78BFA]/10 p-5 text-sm text-[#F5F5FA]">
            <ShieldAlert
              className="mt-0.5 h-5 w-5 shrink-0 text-[#A78BFA]"
              aria-hidden="true"
            />
            <p>{noctraStudio.transmissionNotice}</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="FAQ"
          title="NOCTRA STUDIO Questions"
          align="center"
          accent="cyan"
        />
        <div className="mt-10">
          <FaqAccordion items={studioFaqs} showFilters={false} />
        </div>
      </section>

      {/* Download CTA */}
      <section
        id="studio-downloads"
        className="border-t border-white/[0.08] bg-[#0B0E17]/60"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Downloads"
            title="NOCTRA STUDIO Desktop Builds"
            description={releaseManifest.distributionNote}
            accent="cyan"
          />

          {publishedChannels.length > 0 ? (
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {publishedChannels.map((channel) => (
                <ReleaseCard key={channel.id} channel={channel} accent="cyan" />
              ))}
            </div>
          ) : (
            <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#10131D] p-8">
              <h3 className="text-lg font-semibold text-[#F5F5FA]">
                No public desktop installers published yet
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#969BAD]">
                NOCTRA STUDIO targets Windows, macOS, and Linux via Tauri 2.
                Active download links appear here only once signed public
                builds are published in{" "}
                <code className="text-[#67DDF2]">
                  data/releases/noctra-studio.json
                </code>
                .
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/downloads"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#67DDF2] px-5 py-2.5 text-sm font-semibold text-[#080A10] transition-colors hover:bg-[#8AE7F7]"
                >
                  <span>Open Download Center</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/docs/noctra-studio/desktop-installation"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-[#171B28] px-5 py-2.5 text-sm font-medium text-[#F5F5FA] hover:border-white/[0.2]"
                >
                  <span>Build from Source Guide</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
