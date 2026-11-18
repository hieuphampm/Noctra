import Link from "next/link";
import {
  ArrowRight,
  Check,
  FileText,
  KeyRound,
  Lock,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import { AndroidMockupInteractive } from "@/components/products/AndroidMockupInteractive";
import { ReleaseCard } from "@/components/downloads/ReleaseCard";
import { FaqAccordion } from "@/components/shared/FaqAccordion";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { faqItems } from "@/data/faq";
import { getProductsData, getReleaseManifests } from "@/lib/content/releases";
import { buildPageMetadata, buildSoftwareJsonLd } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
  title: "NOCTRA AI — Privacy-First Android AI Chat",
  description:
    "NOCTRA AI is a privacy-first Android AI chat application built with Flutter. Connect OpenAI-compatible providers, keep conversations in local Hive storage, and protect API keys with Android Keystore.",
  path: "/products/noctra-ai",
  keywords: ["NOCTRA AI", "Android AI chat", "OpenAI compatible Android client"],
});

export default function NoctraAiPage() {
  const { noctraAi } = getProductsData();
  const { noctraAi: releaseManifest } = getReleaseManifests();
  const aiFaqs = faqItems.filter(
    (item) => item.category === "noctra-ai" || item.category === "privacy" || item.id === "supported-providers"
  );

  const softwareJsonLd = buildSoftwareJsonLd({
    name: noctraAi.name,
    description: noctraAi.shortDescription,
    operatingSystem: "Android",
    applicationCategory: "UtilitiesApplication",
    url: noctraAi.href,
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
            <span className="inline-flex items-center gap-2 rounded-full border border-[#A78BFA]/30 bg-[#A78BFA]/10 px-3.5 py-1 font-mono text-xs text-[#A78BFA]">
              <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
              <span>NOCTRA AI · Android</span>
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-[#F5F5FA] sm:text-5xl lg:text-6xl">
              {noctraAi.headline}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-[#969BAD]">
              {noctraAi.overview}
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href="#android-downloads"
                className="inline-flex items-center gap-2 rounded-xl bg-[#A78BFA] px-5 py-3 text-sm font-semibold text-[#080A10] transition-colors hover:bg-[#B89FFF]"
              >
                <span>Check Release Status</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <Link
                href="/docs/noctra-ai/adding-ai-providers"
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-[#10131D] px-5 py-3 text-sm font-semibold text-[#F5F5FA] transition-colors hover:bg-[#171B28]"
              >
                <span>Read Mobile Docs</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Chat Interface Showcase */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <AndroidMockupInteractive />
      </section>

      {/* Capabilities Grid */}
      <section className="border-t border-white/[0.08] bg-[#0B0E17]/60">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Capabilities"
            title="Everything needed for private mobile AI conversations."
            description="Designed in Flutter with Material 3 Dark and true-black AMOLED modes."
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {noctraAi.features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-white/[0.08] bg-[#10131D] p-5"
              >
                <h3 className="text-base font-semibold text-[#F5F5FA]">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#969BAD]">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Provider Configuration & Attachments */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/[0.08] bg-[#10131D] p-7">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-[#F5F5FA]">
              <KeyRound className="h-5 w-5 text-[#A78BFA]" aria-hidden="true" />
              <span>Provider Configuration &amp; Keystore Isolation</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[#969BAD]">
              Connect multiple OpenAI-compatible endpoints (cloud APIs or local
              LAN servers like Ollama and LM Studio) via{" "}
              <code className="text-[#67DDF2]">POST /chat/completions</code> and{" "}
              <code className="text-[#67DDF2]">GET /models</code>. API keys reside
              exclusively inside Android Keystore via{" "}
              <code className="text-[#67DDF2]">FlutterSecureStorage</code>.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-[#969BAD]">
              {noctraAi.techStack.map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-[#A78BFA]" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#10131D] p-7">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-[#F5F5FA]">
              <FileText className="h-5 w-5 text-[#67DDF2]" aria-hidden="true" />
              <span>Local File &amp; Image Attachments</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[#969BAD]">
              Attachments are extracted locally on your Android device and
              previewed in the composer before you decide to send them.
            </p>
            <div className="mt-5 space-y-3 text-xs">
              <div>
                <span className="font-mono text-[#67DDF2] uppercase">
                  Images:
                </span>{" "}
                <span className="text-[#F5F5FA]">
                  {noctraAi.attachmentFormats.images.join(", ")}
                </span>
              </div>
              <div>
                <span className="font-mono text-[#67DDF2] uppercase">
                  Documents:
                </span>{" "}
                <span className="text-[#F5F5FA]">
                  {noctraAi.attachmentFormats.documents.join(", ")}
                </span>
              </div>
              <div>
                <span className="font-mono text-[#67DDF2] uppercase">
                  Text &amp; Data:
                </span>{" "}
                <span className="text-[#F5F5FA]">
                  {noctraAi.attachmentFormats.textAndData.join(", ")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Local-first Privacy & Security */}
      <section className="border-t border-white/[0.08] bg-[#0B0E17]/60">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Privacy & Security"
            title="Local-first by architecture, transparent by policy."
          />

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {noctraAi.privacyControls.map((control) => (
              <div
                key={control}
                className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-[#10131D] p-4 text-sm text-[#F5F5FA]"
              >
                <Lock
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#A78BFA]"
                  aria-hidden="true"
                />
                <span>{control}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#67DDF2]/25 bg-[#67DDF2]/10 p-5 text-sm text-[#F5F5FA]">
            <ShieldAlert
              className="mt-0.5 h-5 w-5 shrink-0 text-[#67DDF2]"
              aria-hidden="true"
            />
            <p>{noctraAi.transmissionNotice}</p>
          </div>
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Ecosystem Comparison"
          title="NOCTRA AI vs. NOCTRA STUDIO"
          description="Choose mobile portability on Android, full agentic orchestration on desktop, or pair both with the same providers."
        />
        <div className="mt-8 overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#10131D]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] bg-[#0B0E17]">
                <th className="px-5 py-4 font-semibold text-[#F5F5FA]">
                  Capability
                </th>
                <th className="px-5 py-4 font-semibold text-[#A78BFA]">
                  NOCTRA AI (Android)
                </th>
                <th className="px-5 py-4 font-semibold text-[#67DDF2]">
                  NOCTRA STUDIO (Desktop)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-[#969BAD]">
              <tr>
                <td className="px-5 py-3.5 text-[#F5F5FA]">
                  OpenAI-Compatible Chat &amp; SSE Streaming
                </td>
                <td className="px-5 py-3.5">Included</td>
                <td className="px-5 py-3.5">Included</td>
              </tr>
              <tr>
                <td className="px-5 py-3.5 text-[#F5F5FA]">
                  Local Storage Engine
                </td>
                <td className="px-5 py-3.5">Hive (On-device)</td>
                <td className="px-5 py-3.5">SQLite (rusqlite)</td>
              </tr>
              <tr>
                <td className="px-5 py-3.5 text-[#F5F5FA]">
                  Credential Vault
                </td>
                <td className="px-5 py-3.5">Android Keystore</td>
                <td className="px-5 py-3.5">OS Keyring (Win/Mac/Linux)</td>
              </tr>
              <tr>
                <td className="px-5 py-3.5 text-[#F5F5FA]">
                  Biometric Lock Gate
                </td>
                <td className="px-5 py-3.5">Included</td>
                <td className="px-5 py-3.5">OS User Session</td>
              </tr>
              <tr>
                <td className="px-5 py-3.5 text-[#F5F5FA]">
                  MCP Hub, Agent Builder, Skills &amp; Workflows
                </td>
                <td className="px-5 py-3.5">—</td>
                <td className="px-5 py-3.5">Included</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-white/[0.08] bg-[#0B0E17]/60">
        <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="FAQ"
            title="NOCTRA AI Questions"
            align="center"
          />
          <div className="mt-10">
            <FaqAccordion items={aiFaqs} showFilters={false} />
          </div>
        </div>
      </section>

      {/* Download CTA */}
      <section
        id="android-downloads"
        className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
      >
        <SectionHeading
          eyebrow="Downloads"
          title="NOCTRA AI Distribution Channels"
          description={releaseManifest.distributionNote}
        />
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {releaseManifest.channels.map((channel) => (
            <ReleaseCard key={channel.id} channel={channel} accent="violet" />
          ))}
        </div>
      </section>
    </>
  );
}
