import { AlertTriangle } from "lucide-react";
import { ChangelogList } from "@/components/changelog/ChangelogList";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { getAllChangelogs } from "@/lib/content/changelog";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
  title: "Changelog",
  description:
    "Release notes and development changelog template for NOCTRA AI and NOCTRA STUDIO.",
  path: "/changelog",
});

export default function ChangelogPage() {
  const entries = getAllChangelogs();
  const hasSampleOnly = entries.length > 0 && entries.every((e) => e.isSampleData);

  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <SectionHeading
        eyebrow="Changelog"
        title="Release updates & platform history."
        description="Structured release tracking across NOCTRA AI and NOCTRA STUDIO."
      />

      {hasSampleOnly && (
        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-300"
            aria-hidden="true"
          />
          <div>
            <p className="font-semibold">
              Pre-Release Notice — Sample Development Template
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
              No public binary releases have been published yet. The entry
              below is clearly labeled as sample development data illustrating
              the changelog format stored in{" "}
              <code className="text-amber-200">content/changelog/</code>.
            </p>
          </div>
        </div>
      )}

      <div className="mt-10">
        <ChangelogList entries={entries} />
      </div>
    </section>
  );
}
