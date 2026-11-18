"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { FaqItem } from "@/data/faq";
import { cn } from "@/lib/utilities/cn";

interface FaqAccordionProps {
  items: FaqItem[];
  showFilters?: boolean;
}

const categories = [
  { id: "all", label: "All" },
  { id: "general", label: "General" },
  { id: "privacy", label: "Privacy & Storage" },
  { id: "noctra-ai", label: "NOCTRA AI" },
  { id: "noctra-studio", label: "NOCTRA STUDIO" },
] as const;

export function FaqAccordion({
  items,
  showFilters = true,
}: FaqAccordionProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  const filtered =
    selectedCategory === "all"
      ? items
      : items.filter((item) => item.category === selectedCategory);

  return (
    <div>
      {showFilters && (
        <div
          role="tablist"
          aria-label="FAQ categories"
          className="mb-6 flex flex-wrap gap-2"
        >
          {categories.map((category) => {
            const active = selectedCategory === category.id;
            return (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedCategory(category.id)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]",
                  active
                    ? "border-[#A78BFA]/50 bg-[#A78BFA]/15 text-[#F5F5FA]"
                    : "border-white/[0.08] bg-[#10131D] text-[#969BAD] hover:text-[#F5F5FA]"
                )}
              >
                {category.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((item) => {
          const isOpen = openId === item.id;
          return (
            <div
              key={item.id}
              className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#10131D]"
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenId(isOpen ? null : item.id)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]"
              >
                <span className="text-sm font-semibold text-[#F5F5FA] sm:text-base">
                  {item.question}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-[#969BAD] transition-transform duration-200",
                    isOpen && "rotate-180 text-[#A78BFA]"
                  )}
                  aria-hidden="true"
                />
              </button>
              {isOpen && (
                <div className="border-t border-white/[0.06] px-5 py-4 text-sm leading-relaxed text-[#969BAD]">
                  {item.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
