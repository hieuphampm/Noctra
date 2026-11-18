"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, FileText, X } from "lucide-react";

export interface SearchableDocItem {
  slug: string;
  title: string;
  categoryTitle: string;
  description: string;
  searchableText: string;
}

export function DocsSearch({ docs }: { docs: SearchableDocItem[] }) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    return docs
      .filter(
        (doc) =>
          doc.title.toLowerCase().includes(trimmed) ||
          doc.description.toLowerCase().includes(trimmed) ||
          doc.categoryTitle.toLowerCase().includes(trimmed) ||
          doc.searchableText.toLowerCase().includes(trimmed)
      )
      .slice(0, 8);
  }, [docs, query]);

  return (
    <div className="relative mb-6">
      <label htmlFor="docs-search-input" className="sr-only">
        Search documentation
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#969BAD]"
          aria-hidden="true"
        />
        <input
          id="docs-search-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search docs..."
          className="w-full rounded-xl border border-white/[0.08] bg-[#10131D] py-2.5 pr-9 pl-9 text-sm text-[#F5F5FA] placeholder:text-[#969BAD] focus:border-[#A78BFA]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-[#969BAD] hover:text-[#F5F5FA]"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {query.trim().length > 0 && (
        <div className="absolute right-0 left-0 z-30 mt-2 rounded-xl border border-white/[0.1] bg-[#10131D] p-2 shadow-2xl shadow-black/70">
          {results.length > 0 ? (
            <ul className="space-y-1">
              {results.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/docs/${item.slug}`}
                    onClick={() => setQuery("")}
                    className="flex items-start gap-2.5 rounded-lg p-2.5 transition-colors hover:bg-white/[0.05]"
                  >
                    <FileText
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#A78BFA]"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#F5F5FA]">
                          {item.title}
                        </span>
                        <span className="rounded bg-[#171B28] px-1.5 py-0.5 font-mono text-[10px] text-[#67DDF2]">
                          {item.categoryTitle}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-[#969BAD]">
                        {item.description}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-center text-xs text-[#969BAD]">
              No documentation matches &ldquo;{query}&rdquo;.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
