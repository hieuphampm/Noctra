import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { FeaturePillars } from "@/components/features/FeaturePillars";
import { ArchitectureDiagram } from "@/components/features/ArchitectureDiagram";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
  title: "Features",
  description:
    "Explore NOCTRA's six core architectural pillars: Private by Design, OpenAI-compatible AI providers, MCP 2025-03-26 ecosystem, Custom Agents, GitHub Skills, and Workflow automation.",
  path: "/features",
});

export default function FeaturesPage() {
  return (
    <>
      <section className="border-b border-white/[0.08] noctra-grid-bg">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <SectionHeading
            eyebrow="NOCTRA Ecosystem Features"
            title="Built around local ownership, open protocols, and explicit permissions."
            description="From mobile chat on Android to multi-agent MCP workflows on desktop, every capability is engineered to keep your keys, history, and tool execution under your rules."
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/products/noctra-ai"
              className="inline-flex items-center gap-2 rounded-xl bg-[#A78BFA] px-5 py-2.5 text-sm font-semibold text-[#080A10] hover:bg-[#B89FFF]"
            >
              <span>NOCTRA AI</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/products/noctra-studio"
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-[#10131D] px-5 py-2.5 text-sm font-semibold text-[#F5F5FA] hover:bg-[#171B28]"
            >
              <span>NOCTRA STUDIO</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <FeaturePillars />

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <ArchitectureDiagram />
      </section>

      <section className="border-t border-white/[0.08] bg-[#0B0E17]/60">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-white/[0.08] bg-[#10131D] p-7 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <ShieldCheck
                className="mt-1 h-6 w-6 shrink-0 text-[#67DDF2]"
                aria-hidden="true"
              />
              <div>
                <h2 className="text-lg font-semibold text-[#F5F5FA]">
                  Inspect the full Security Model
                </h2>
                <p className="mt-1 text-sm text-[#969BAD]">
                  Learn how Android Keystore, OS Keyring, SecretRedactor, and
                  canonicalized path containment protect your workspace.
                </p>
              </div>
            </div>
            <Link
              href="/docs/advanced/security-model"
              className="shrink-0 rounded-xl bg-[#67DDF2] px-5 py-2.5 text-sm font-semibold text-[#080A10] hover:bg-[#8AE7F7]"
            >
              Security Docs
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
