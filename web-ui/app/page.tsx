import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  Monitor,
  Smartphone,
  Shield,
} from "lucide-react";
import { HeroMockupShowcase } from "@/components/hero/HeroMockupShowcase";
import { FeaturePillars } from "@/components/features/FeaturePillars";
import { ArchitectureDiagram } from "@/components/features/ArchitectureDiagram";
import { FaqAccordion } from "@/components/shared/FaqAccordion";
import { MotionReveal } from "@/components/shared/MotionReveal";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { siteConfig } from "@/data/site-config";
import { faqItems } from "@/data/faq";
import { getProductsData } from "@/lib/content/releases";
import { buildFaqJsonLd, buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
  title: siteConfig.brand.tagline,
  description:
    "Discover NOCTRA AI for Android and NOCTRA STUDIO for desktop — privacy-first AI chat, custom agents, MCP integrations, Skills, and workflows under your control.",
  path: "/",
});

export default function HomePage() {
  const { noctraAi, noctraStudio } = getProductsData();
  const faqJsonLd = buildFaqJsonLd(faqItems);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-white/[0.08] noctra-grid-bg">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-[#A78BFA]/10 via-transparent to-transparent"
        />

        <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-[#10131D]/90 px-3.5 py-1 font-mono text-xs tracking-wider text-[#67DDF2]">
              <Shield className="h-3.5 w-3.5 text-[#A78BFA]" aria-hidden="true" />
              <span>{siteConfig.brand.tagline}</span>
            </span>

            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-[#F5F5FA] sm:text-6xl lg:text-[4.25rem] lg:leading-[1.06]">
              Your AI. Your Rules.
              <span className="mt-1 block bg-gradient-to-r from-[#A78BFA] via-[#C4B5FD] to-[#67DDF2] bg-clip-text text-transparent">
                Your Own Ecosystem.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#969BAD] sm:text-lg">
              Discover a new way to work with AI. From private AI conversations
              on Android to powerful autonomous agent workflows on desktop,
              NOCTRA gives you control over your AI ecosystem.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
              <a
                href="#products"
                className="inline-flex items-center gap-2 rounded-xl bg-[#A78BFA] px-6 py-3.5 text-sm font-semibold text-[#080A10] transition-colors hover:bg-[#B89FFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#67DDF2]"
              >
                <span>Explore Products</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <Link
                href="/downloads"
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-[#10131D] px-6 py-3.5 text-sm font-semibold text-[#F5F5FA] transition-colors hover:border-white/[0.22] hover:bg-[#171B28] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]"
              >
                <Download className="h-4 w-4 text-[#67DDF2]" aria-hidden="true" />
                <span>View Downloads</span>
              </Link>
            </div>

            <p className="mt-5 font-mono text-xs text-[#969BAD]">
              {siteConfig.brand.secondaryTagline}
            </p>
          </div>

          <HeroMockupShowcase />
        </div>
      </section>

      {/* Product Ecosystem Section */}
      <section
        id="products"
        className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
      >
        <SectionHeading
          eyebrow="Product Ecosystem"
          title="Two dedicated experiences. One unified privacy standard."
          description="Use NOCTRA AI for focused mobile conversations or NOCTRA STUDIO to orchestrate agents, MCP servers, Skills, and workflows on desktop."
        />

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          {/* Product One: NOCTRA AI */}
          <MotionReveal>
            <article className="flex h-full flex-col justify-between rounded-3xl border border-white/[0.08] bg-[#10131D] p-7 sm:p-9">
              <div>
                <div className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#A78BFA]/30 bg-[#A78BFA]/10 px-3 py-1 font-mono text-xs text-[#A78BFA]">
                    <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{noctraAi.platformLabel}</span>
                  </span>
                  <span className="font-mono text-xs text-[#969BAD]">
                    {noctraAi.name}
                  </span>
                </div>

                <h3 className="mt-6 text-2xl font-semibold text-[#F5F5FA] sm:text-3xl">
                  {noctraAi.headline}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#969BAD] sm:text-base">
                  {noctraAi.shortDescription}
                </p>

                <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  {noctraAi.features.map((feature) => (
                    <li
                      key={feature.title}
                      className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-[#171B28]/70 p-3 text-xs text-[#F5F5FA]"
                    >
                      <CheckCircle2
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A78BFA]"
                        aria-hidden="true"
                      />
                      <span>{feature.title}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-6">
                <Link
                  href={noctraAi.href}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#A78BFA] px-5 py-2.5 text-sm font-semibold text-[#080A10] transition-colors hover:bg-[#B89FFF]"
                >
                  <span>{noctraAi.ctaLabel}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <span className="font-mono text-xs text-[#969BAD]">
                  Flutter · Hive · Keystore
                </span>
              </div>
            </article>
          </MotionReveal>

          {/* Product Two: NOCTRA STUDIO */}
          <MotionReveal delay={0.08}>
            <article className="flex h-full flex-col justify-between rounded-3xl border border-white/[0.08] bg-[#10131D] p-7 sm:p-9">
              <div>
                <div className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#67DDF2]/30 bg-[#67DDF2]/10 px-3 py-1 font-mono text-xs text-[#67DDF2]">
                    <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{noctraStudio.platformLabel}</span>
                  </span>
                  <span className="font-mono text-xs text-[#969BAD]">
                    {noctraStudio.name}
                  </span>
                </div>

                <h3 className="mt-6 text-2xl font-semibold text-[#F5F5FA] sm:text-3xl">
                  {noctraStudio.headline}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#969BAD] sm:text-base">
                  {noctraStudio.shortDescription}
                </p>

                <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  {noctraStudio.features.map((feature) => (
                    <li
                      key={feature.title}
                      className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-[#171B28]/70 p-3 text-xs text-[#F5F5FA]"
                    >
                      <CheckCircle2
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#67DDF2]"
                        aria-hidden="true"
                      />
                      <span>{feature.title}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-6">
                <Link
                  href={noctraStudio.href}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#67DDF2] px-5 py-2.5 text-sm font-semibold text-[#080A10] transition-colors hover:bg-[#8AE7F7]"
                >
                  <span>{noctraStudio.ctaLabel}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <span className="font-mono text-xs text-[#969BAD]">
                  Tauri 2 · Rust · SQLite · MCP
                </span>
              </div>
            </article>
          </MotionReveal>
        </div>
      </section>

      {/* Feature Pillars (A-F) */}
      <FeaturePillars />

      {/* Architecture Flow Diagram */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <ArchitectureDiagram />
      </section>

      {/* FAQ Section */}
      <section className="border-t border-white/[0.08] bg-[#0B0E17]/60">
        <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="FAQ"
            title="Questions about the NOCTRA ecosystem."
            description="Clear answers on local storage, API keys, MCP connectivity, GitHub Skills, and supported operating systems."
            align="center"
          />
          <div className="mt-10">
            <FaqAccordion items={faqItems} />
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-white/[0.08]">
        <div className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold text-[#F5F5FA] sm:text-4xl">
            Take control of your AI stack.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-[#969BAD]">
            Explore the documentation, inspect the local-first security model, or
            check current release availability in the Download Center.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-xl bg-[#A78BFA] px-6 py-3 text-sm font-semibold text-[#080A10] transition-colors hover:bg-[#B89FFF]"
            >
              <span>Read Documentation</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/downloads"
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-[#10131D] px-6 py-3 text-sm font-semibold text-[#F5F5FA] transition-colors hover:bg-[#171B28]"
            >
              <span>Go to Downloads</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
