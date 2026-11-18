import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { getDocsNavigation } from "@/lib/content/docs";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
  title: "Documentation",
  description:
    "Official MDX documentation for NOCTRA AI (Android) and NOCTRA STUDIO (Desktop): Getting Started, Providers, MCP Setup, Agents, Skills, Workflows, and Security Model.",
  path: "/docs",
});

export default function DocsIndexPage() {
  const groups = getDocsNavigation();

  return (
    <div className="max-w-4xl">
      <span className="inline-flex items-center gap-2 rounded-full border border-[#A78BFA]/30 bg-[#A78BFA]/10 px-3 py-1 font-mono text-xs text-[#A78BFA]">
        <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
        <span>NOCTRA Documentation</span>
      </span>
      <h1 className="mt-5 text-3xl font-semibold text-[#F5F5FA] sm:text-4xl">
        Guides, architecture, and reference manuals.
      </h1>
      <p className="mt-3 text-base leading-relaxed text-[#969BAD]">
        Learn how to configure OpenAI-compatible AI providers, connect MCP 2025-03-26
        servers, build scoped agents, inspect GitHub Skills, and orchestrate
        local workflows.
      </p>

      <div className="mt-6">
        <Link
          href="/docs/getting-started/introduction"
          className="inline-flex items-center gap-2 rounded-xl bg-[#A78BFA] px-5 py-2.5 text-sm font-semibold text-[#080A10] hover:bg-[#B89FFF]"
        >
          <span>Start with Introduction</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {groups.map((group) => (
          <section
            key={group.id}
            className="rounded-2xl border border-white/[0.08] bg-[#10131D] p-6"
          >
            <h2 className="font-mono text-xs font-semibold tracking-wider text-[#67DDF2] uppercase">
              {group.title}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {group.items.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/docs/${item.slug}`}
                    className="group flex items-center justify-between rounded-lg border border-white/[0.05] bg-[#171B28]/60 px-3.5 py-2.5 text-sm text-[#F5F5FA] transition-colors hover:border-[#A78BFA]/40"
                  >
                    <span>{item.title}</span>
                    <ArrowRight
                      className="h-3.5 w-3.5 text-[#969BAD] transition-transform group-hover:translate-x-0.5 group-hover:text-[#A78BFA]"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
