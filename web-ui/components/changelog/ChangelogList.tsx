"use client";

import { useState } from "react";
import type { ChangelogEntry } from "@/lib/content/changelog";
import { cn } from "@/lib/utilities/cn";

const filters = ["All", "NOCTRA AI", "NOCTRA STUDIO", "NOCTRA Ecosystem"] as const;

export function ChangelogList({ entries }: { entries: ChangelogEntry[] }) {
  const [selected, setSelected] = useState<string>("All");

  const filtered =
    selected === "All"
      ? entries
      : entries.filter((entry) => entry.product === selected);

  return (
    <div>
      <div
        role="tablist"
        aria-label="Filter changelog by product"
        className="mb-8 flex flex-wrap gap-2"
      >
        {filters.map((filter) => {
          const active = selected === filter;
          return (
            <button
              key={filter}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelected(filter)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]",
                active
                  ? "border-[#A78BFA]/50 bg-[#A78BFA]/15 text-[#F5F5FA]"
                  : "border-white/[0.08] bg-[#10131D] text-[#969BAD] hover:text-[#F5F5FA]"
              )}
            >
              {filter}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#10131D] p-8 text-center">
          <p className="text-sm font-medium text-[#F5F5FA]">
            No published release entries for {selected} yet.
          </p>
          <p className="mt-2 text-xs text-[#969BAD]">
            Release notes will appear here as soon as public builds are tagged
            and published.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map((entry) => (
            <article
              key={entry.slug}
              className="rounded-2xl border border-white/[0.08] bg-[#10131D] p-6 sm:p-8"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="rounded-full border border-[#67DDF2]/30 bg-[#67DDF2]/10 px-3 py-0.5 font-mono text-xs text-[#67DDF2]">
                      {entry.product}
                    </span>
                    {entry.isSampleData && (
                      <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-0.5 font-mono text-xs text-amber-300">
                        Sample Development Data
                      </span>
                    )}
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold text-[#F5F5FA]">
                    {entry.version}
                  </h2>
                </div>
                <span className="font-mono text-xs text-[#969BAD]">
                  {entry.releaseDate}
                </span>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-[#969BAD]">
                {entry.summary}
              </p>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                {entry.added.length > 0 && (
                  <div>
                    <h3 className="font-mono text-xs font-semibold tracking-wider text-emerald-300 uppercase">
                      Added Features
                    </h3>
                    <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-sm text-[#969BAD]">
                      {entry.added.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {entry.improvements.length > 0 && (
                  <div>
                    <h3 className="font-mono text-xs font-semibold tracking-wider text-[#67DDF2] uppercase">
                      Improvements
                    </h3>
                    <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-sm text-[#969BAD]">
                      {entry.improvements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {entry.bugFixes.length > 0 && (
                  <div>
                    <h3 className="font-mono text-xs font-semibold tracking-wider text-[#A78BFA] uppercase">
                      Bug Fixes
                    </h3>
                    <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-sm text-[#969BAD]">
                      {entry.bugFixes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {entry.breakingChanges.length > 0 && (
                  <div>
                    <h3 className="font-mono text-xs font-semibold tracking-wider text-rose-300 uppercase">
                      Breaking Changes
                    </h3>
                    <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-sm text-[#969BAD]">
                      {entry.breakingChanges.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
