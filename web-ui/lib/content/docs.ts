import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface DocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface DocMeta {
  slug: string;
  category: string;
  categoryTitle: string;
  title: string;
  description: string;
  order: number;
}

export interface DocPage extends DocMeta {
  content: string;
  headings: DocHeading[];
  searchableText: string;
}

export interface DocCategoryGroup {
  id: string;
  title: string;
  items: DocMeta[];
}

const DOCS_ROOT = path.join(process.cwd(), "content", "docs");

const CATEGORY_ORDER: Array<{ id: string; title: string }> = [
  { id: "getting-started", title: "Getting Started" },
  { id: "noctra-ai", title: "NOCTRA AI" },
  { id: "noctra-studio", title: "NOCTRA STUDIO" },
  { id: "advanced", title: "Advanced" },
];

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[`*_~()[\]{}<>.,:;!?'"/\\]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function extractHeadings(markdown: string): DocHeading[] {
  const lines = markdown.split(/\r?\n/);
  const headings: DocHeading[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = /^(#{2,3})\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const level = match[1].length as 2 | 3;
    const text = match[2].replace(/`([^`]+)`/g, "$1").trim();
    headings.push({
      id: slugifyHeading(text),
      text,
      level,
    });
  }

  return headings;
}

function stripMarkdownForSearch(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[#>*_\-[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

export function getAllDocs(): DocPage[] {
  if (!fs.existsSync(DOCS_ROOT)) return [];

  const docs: DocPage[] = [];

  for (const categoryInfo of CATEGORY_ORDER) {
    const categoryDir = path.join(DOCS_ROOT, categoryInfo.id);
    if (!fs.existsSync(categoryDir)) continue;

    const files = fs
      .readdirSync(categoryDir)
      .filter((file) => file.endsWith(".mdx") || file.endsWith(".md"));

    for (const file of files) {
      const fullPath = path.join(categoryDir, file);
      const raw = fs.readFileSync(fullPath, "utf-8");
      const { data, content } = matter(raw);
      const slugPart = file.replace(/\.(mdx|md)$/, "");
      const slug = `${categoryInfo.id}/${slugPart}`;

      docs.push({
        slug,
        category: categoryInfo.id,
        categoryTitle: categoryInfo.title,
        title: String(data.title ?? slugPart),
        description: String(data.description ?? ""),
        order: Number(data.order ?? 99),
        content,
        headings: extractHeadings(content),
        searchableText: stripMarkdownForSearch(content),
      });
    }
  }

  return docs.sort((a, b) => {
    const catA = CATEGORY_ORDER.findIndex((c) => c.id === a.category);
    const catB = CATEGORY_ORDER.findIndex((c) => c.id === b.category);
    if (catA !== catB) return catA - catB;
    return a.order - b.order;
  });
}

export function getDocsNavigation(): DocCategoryGroup[] {
  const all = getAllDocs();
  return CATEGORY_ORDER.map((category) => ({
    id: category.id,
    title: category.title,
    items: all
      .filter((doc) => doc.category === category.id)
      .map(({ slug, category: cat, categoryTitle, title, description, order }) => ({
        slug,
        category: cat,
        categoryTitle,
        title,
        description,
        order,
      })),
  })).filter((group) => group.items.length > 0);
}

export function getDocBySlug(slugParts: string[]): {
  doc: DocPage | null;
  prev: DocMeta | null;
  next: DocMeta | null;
} {
  const targetSlug = slugParts.join("/");
  const all = getAllDocs();
  const index = all.findIndex((doc) => doc.slug === targetSlug);
  if (index === -1) {
    return { doc: null, prev: null, next: null };
  }

  return {
    doc: all[index],
    prev: index > 0 ? all[index - 1] : null,
    next: index < all.length - 1 ? all[index + 1] : null,
  };
}
