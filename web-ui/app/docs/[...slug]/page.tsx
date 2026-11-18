import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { mdxComponents } from "@/components/documentation/MdxComponents";
import { TableOfContents } from "@/components/documentation/TableOfContents";
import { getAllDocs, getDocBySlug } from "@/lib/content/docs";
import { buildPageMetadata } from "@/lib/seo/metadata";

interface DocPageProps {
  params: Promise<{ slug: string[] }>;
}

export async function generateStaticParams() {
  return getAllDocs().map((doc) => ({
    slug: doc.slug.split("/"),
  }));
}

export async function generateMetadata({ params }: DocPageProps) {
  const { slug } = await params;
  const { doc } = getDocBySlug(slug);
  if (!doc) {
    return buildPageMetadata({
      title: "Documentation Not Found",
      description: "Requested documentation article could not be found.",
      path: "/docs",
    });
  }
  return buildPageMetadata({
    title: `${doc.title} — Docs`,
    description: doc.description,
    path: `/docs/${doc.slug}`,
  });
}

export default async function DocArticlePage({ params }: DocPageProps) {
  const { slug } = await params;
  const { doc, prev, next } = getDocBySlug(slug);

  if (!doc) {
    notFound();
  }

  return (
    <div className="flex gap-10">
      <article className="min-w-0 flex-1">
        <div className="border-b border-white/[0.08] pb-6">
          <span className="font-mono text-xs tracking-wider text-[#67DDF2] uppercase">
            {doc.categoryTitle}
          </span>
          <h1 className="mt-2 text-3xl font-semibold text-[#F5F5FA] sm:text-4xl">
            {doc.title}
          </h1>
          {doc.description && (
            <p className="mt-3 text-base leading-relaxed text-[#969BAD]">
              {doc.description}
            </p>
          )}
        </div>

        <div className="mt-8">
          <MDXRemote
            source={doc.content}
            components={mdxComponents}
            options={{
              mdxOptions: {
                remarkPlugins: [remarkGfm],
              },
            }}
          />
        </div>

        {/* Previous / Next Navigation */}
        <nav
          aria-label="Documentation pagination"
          className="mt-14 grid gap-4 border-t border-white/[0.08] pt-8 sm:grid-cols-2"
        >
          {prev ? (
            <Link
              href={`/docs/${prev.slug}`}
              className="group rounded-2xl border border-white/[0.08] bg-[#10131D] p-4 transition-colors hover:border-[#A78BFA]/40"
            >
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#969BAD]">
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                <span>Previous</span>
              </span>
              <div className="mt-1 text-sm font-semibold text-[#F5F5FA] group-hover:text-[#A78BFA]">
                {prev.title}
              </div>
            </Link>
          ) : (
            <div />
          )}

          {next && (
            <Link
              href={`/docs/${next.slug}`}
              className="group rounded-2xl border border-white/[0.08] bg-[#10131D] p-4 text-right transition-colors hover:border-[#67DDF2]/40"
            >
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#969BAD]">
                <span>Next</span>
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </span>
              <div className="mt-1 text-sm font-semibold text-[#F5F5FA] group-hover:text-[#67DDF2]">
                {next.title}
              </div>
            </Link>
          )}
        </nav>
      </article>

      <TableOfContents headings={doc.headings} />
    </div>
  );
}
