import type { DocHeading } from "@/lib/content/docs";
import { cn } from "@/lib/utilities/cn";

export function TableOfContents({ headings }: { headings: DocHeading[] }) {
  if (headings.length === 0) return null;

  return (
    <aside
      aria-label="Table of Contents"
      className="hidden xl:block xl:w-60 xl:shrink-0"
    >
      <div className="sticky top-24 rounded-2xl border border-white/[0.08] bg-[#10131D]/70 p-4">
        <p className="mb-3 font-mono text-[11px] font-semibold tracking-wider text-[#F5F5FA] uppercase">
          On this page
        </p>
        <ul className="space-y-2 text-xs">
          {headings.map((heading) => (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                className={cn(
                  "block text-[#969BAD] transition-colors hover:text-[#F5F5FA]",
                  heading.level === 3 && "pl-3 text-[11px]"
                )}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
