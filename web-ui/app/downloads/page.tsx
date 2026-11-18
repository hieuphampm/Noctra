import Link from "next/link";
import { Info, Monitor, Smartphone, Terminal } from "lucide-react";
import { ReleaseCard } from "@/components/downloads/ReleaseCard";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { getReleaseManifests } from "@/lib/content/releases";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata({
  title: "Download Center",
  description:
    "Official Download Center for NOCTRA AI (Android) and NOCTRA STUDIO (Windows, macOS, Linux). View release metadata, SHA-256 verification status, and build-from-source guides.",
  path: "/downloads",
});

export default function DownloadsPage() {
  const { noctraAi, noctraStudio } = getReleaseManifests();

  return (
    <>
      <section className="border-b border-white/[0.08] noctra-grid-bg">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <SectionHeading
            eyebrow="Download Center"
            title="Verified releases, checksums, and platform availability."
            description="All release metadata is loaded from centralized manifests. Platforms without an active public build clearly display a Coming Soon or Unavailable state."
          />

          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-[#67DDF2]/25 bg-[#10131D]/90 p-4 text-sm text-[#969BAD]">
            <Info
              className="mt-0.5 h-5 w-5 shrink-0 text-[#67DDF2]"
              aria-hidden="true"
            />
            <p>
              No public binary releases have been published to a hosted
              distribution channel yet. Maintainers can configure release URLs,
              versions, sizes, and SHA-256 checksums in{" "}
              <code className="text-[#F5F5FA]">data/releases/</code>, or build
              directly from the local repository source.
            </p>
          </div>
        </div>
      </section>

      {/* NOCTRA AI Downloads */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#A78BFA]/30 bg-[#A78BFA]/10 text-[#A78BFA]">
              <Smartphone className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-2xl font-semibold text-[#F5F5FA]">
                {noctraAi.productName}
              </h2>
              <p className="text-sm text-[#969BAD]">
                Android mobile application · Android APK &amp; Google Play
              </p>
            </div>
          </div>
          <Link
            href="/products/noctra-ai"
            className="text-sm font-medium text-[#A78BFA] hover:underline"
          >
            Product Overview →
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {noctraAi.channels.map((channel) => (
            <ReleaseCard key={channel.id} channel={channel} accent="violet" />
          ))}
        </div>
      </section>

      {/* NOCTRA STUDIO Downloads */}
      <section className="border-t border-white/[0.08] bg-[#0B0E17]/60">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#67DDF2]/30 bg-[#67DDF2]/10 text-[#67DDF2]">
                <Monitor className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-2xl font-semibold text-[#F5F5FA]">
                  {noctraStudio.productName}
                </h2>
                <p className="text-sm text-[#969BAD]">
                  Desktop AI agent platform · Windows, macOS &amp; Linux
                </p>
              </div>
            </div>
            <Link
              href="/products/noctra-studio"
              className="text-sm font-medium text-[#67DDF2] hover:underline"
            >
              Product Overview →
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {noctraStudio.channels.map((channel) => (
              <ReleaseCard key={channel.id} channel={channel} accent="cyan" />
            ))}
          </div>
        </div>
      </section>

      {/* Source Build Instructions */}
      <section className="border-t border-white/[0.08]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-white/[0.08] bg-[#10131D] p-7">
            <div className="flex items-center gap-2.5 font-mono text-xs text-[#67DDF2] uppercase">
              <Terminal className="h-4 w-4" aria-hidden="true" />
              <span>Workspace Source Builds</span>
            </div>
            <h3 className="mt-2 text-xl font-semibold text-[#F5F5FA]">
              Building locally from the NOCTRA repository
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-[#969BAD]">
              Developers working directly with the repository folders can
              compile release artifacts locally with Flutter and Tauri 2.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/[0.08] bg-[#080A10] p-4">
                <div className="font-mono text-xs font-semibold text-[#A78BFA]">
                  android/ (NOCTRA AI)
                </div>
                <pre className="mt-2 overflow-x-auto font-mono text-xs text-[#F5F5FA]">
                  {`cd android\nflutter pub get\nflutter build apk --release`}
                </pre>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-[#080A10] p-4">
                <div className="font-mono text-xs font-semibold text-[#67DDF2]">
                  desktop/ (NOCTRA STUDIO)
                </div>
                <pre className="mt-2 overflow-x-auto font-mono text-xs text-[#F5F5FA]">
                  {`cd desktop\nnpm install\nnpm run tauri build`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
