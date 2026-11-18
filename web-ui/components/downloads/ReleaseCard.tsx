import Link from "next/link";
import { Download, Clock, ShieldCheck, FileCheck2 } from "lucide-react";
import type { ReleaseChannel } from "@/lib/content/releases";

interface ReleaseCardProps {
  channel: ReleaseChannel;
  accent?: "violet" | "cyan";
}

export function ReleaseCard({
  channel,
  accent = "violet",
}: ReleaseCardProps) {
  const isAvailable = channel.published && Boolean(channel.downloadUrl);
  const badgeClasses = isAvailable
    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
    : channel.status === "coming_soon"
      ? "border-[#A78BFA]/30 bg-[#A78BFA]/10 text-[#A78BFA]"
      : "border-white/[0.12] bg-[#171B28] text-[#969BAD]";

  return (
    <article className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#10131D] p-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="font-mono text-xs text-[#969BAD] uppercase">
              {channel.platform} · {channel.format}
            </span>
            <h3 className="mt-1 text-lg font-semibold text-[#F5F5FA]">
              {channel.label}
            </h3>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] ${badgeClasses}`}
          >
            {!isAvailable && <Clock className="h-3 w-3" aria-hidden="true" />}
            <span>{isAvailable ? `v${channel.version}` : channel.statusLabel}</span>
          </span>
        </div>

        {/* Technical Metadata Grid */}
        <dl className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-white/[0.06] bg-[#0B0E17] p-4 text-xs">
          <div>
            <dt className="font-mono text-[10px] text-[#969BAD] uppercase">
              Version
            </dt>
            <dd className="mt-0.5 font-mono text-[#F5F5FA]">
              {channel.version ?? "Not yet published"}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] text-[#969BAD] uppercase">
              Architecture
            </dt>
            <dd className="mt-0.5 font-mono text-[#F5F5FA]">
              {channel.architecture ?? "Pending release"}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] text-[#969BAD] uppercase">
              File Size
            </dt>
            <dd className="mt-0.5 font-mono text-[#F5F5FA]">
              {channel.fileSize ?? "Pending release"}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] text-[#969BAD] uppercase">
              Release Date
            </dt>
            <dd className="mt-0.5 font-mono text-[#F5F5FA]">
              {channel.releaseDate ?? "Pending"}
            </dd>
          </div>
        </dl>

        <div className="mt-4 space-y-2.5 text-xs text-[#969BAD]">
          <div>
            <span className="font-semibold text-[#F5F5FA]">
              Minimum Requirements:{" "}
            </span>
            <span>{channel.minRequirements}</span>
          </div>
          <div>
            <span className="inline-flex items-center gap-1 font-semibold text-[#F5F5FA]">
              <FileCheck2 className="h-3.5 w-3.5 text-[#67DDF2]" aria-hidden="true" />
              SHA-256 Checksum:{" "}
            </span>
            <span className="break-all font-mono text-[11px]">
              {channel.sha256 ?? "Published alongside release artifact"}
            </span>
          </div>
          <div>
            <span className="inline-flex items-center gap-1 font-semibold text-[#F5F5FA]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#A78BFA]" aria-hidden="true" />
              Signature:{" "}
            </span>
            <span>
              {channel.signatureInfo ?? "Verification details published with release"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
        <Link
          href={channel.changelogHref}
          className="text-xs font-medium text-[#67DDF2] hover:underline"
        >
          View Changelog →
        </Link>

        {isAvailable ? (
          <a
            href={channel.downloadUrl!}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-[#080A10] transition-colors ${
              accent === "cyan"
                ? "bg-[#67DDF2] hover:bg-[#8AE7F7]"
                : "bg-[#A78BFA] hover:bg-[#B89FFF]"
            }`}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Download</span>
          </a>
        ) : (
          <Link
            href="/docs/getting-started/installation"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#171B28] px-3.5 py-2 text-xs font-medium text-[#F5F5FA] transition-colors hover:border-white/[0.2]"
          >
            Build from Source
          </Link>
        )}
      </div>
    </article>
  );
}
