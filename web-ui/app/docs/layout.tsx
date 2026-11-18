import type { ReactNode } from "react";
import { DocsSidebar } from "@/components/documentation/DocsSidebar";
import { getAllDocs, getDocsNavigation } from "@/lib/content/docs";

export default function DocsLayout({ children }: { children: ReactNode }) {
  const groups = getDocsNavigation();
  const searchableDocs = getAllDocs().map((doc) => ({
    slug: doc.slug,
    title: doc.title,
    categoryTitle: doc.categoryTitle,
    description: doc.description,
    searchableText: doc.searchableText,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="flex flex-col gap-10 lg:flex-row">
        <DocsSidebar groups={groups} searchableDocs={searchableDocs} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
