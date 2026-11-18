"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronDown } from "lucide-react";
import type { DocCategoryGroup } from "@/lib/content/docs";
import {
  DocsSearch,
  type SearchableDocItem,
} from "@/components/documentation/DocsSearch";
import { cn } from "@/lib/utilities/cn";

interface DocsSidebarProps {
  groups: DocCategoryGroup[];
  searchableDocs: SearchableDocItem[];
}

export function DocsSidebar({ groups, searchableDocs }: DocsSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navContent = (
    <nav aria-label="Documentation Navigation" className="space-y-6">
      {groups.map((group) => (
        <div key={group.id}>
          <h3 className="mb-2 px-2 font-mono text-[11px] font-semibold tracking-wider text-[#F5F5FA] uppercase">
            {group.title}
          </h3>
          <ul className="space-y-1 border-l border-white/[0.08] pl-2">
            {group.items.map((item) => {
              const href = `/docs/${item.slug}`;
              const active = pathname === href;
              return (
                <li key={item.slug}>
                  <Link
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "block rounded-lg px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]",
                      active
                        ? "bg-[#A78BFA]/15 font-medium text-[#F5F5FA]"
                        : "text-[#969BAD] hover:bg-white/[0.04] hover:text-[#F5F5FA]"
                    )}
                  >
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <aside className="lg:w-72 lg:shrink-0">
      <div className="lg:sticky lg:top-24">
        <DocsSearch docs={searchableDocs} />

        {/* Mobile Toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-expanded={mobileOpen}
          className="mb-4 flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-[#10131D] px-4 py-3 text-sm font-medium text-[#F5F5FA] lg:hidden"
        >
          <span className="inline-flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#A78BFA]" aria-hidden="true" />
            <span>Documentation Menu</span>
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              mobileOpen && "rotate-180"
            )}
            aria-hidden="true"
          />
        </button>

        <div
          className={cn(
            "lg:block",
            mobileOpen
              ? "mb-8 block rounded-2xl border border-white/[0.08] bg-[#10131D] p-4"
              : "hidden"
          )}
        >
          {navContent}
        </div>
      </div>
    </aside>
  );
}
