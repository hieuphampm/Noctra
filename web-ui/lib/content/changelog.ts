import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export type ChangelogProduct = "NOCTRA AI" | "NOCTRA STUDIO" | "NOCTRA Ecosystem";

export interface ChangelogEntry {
  slug: string;
  version: string;
  releaseDate: string;
  product: ChangelogProduct;
  isSampleData: boolean;
  summary: string;
  added: string[];
  improvements: string[];
  bugFixes: string[];
  breakingChanges: string[];
  content: string;
}

const CHANGELOG_ROOT = path.join(process.cwd(), "content", "changelog");

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

export function getAllChangelogs(): ChangelogEntry[] {
  if (!fs.existsSync(CHANGELOG_ROOT)) return [];

  const files = fs
    .readdirSync(CHANGELOG_ROOT)
    .filter((file) => file.endsWith(".mdx") || file.endsWith(".md"))
    .sort()
    .reverse();

  return files.map((file) => {
    const raw = fs.readFileSync(path.join(CHANGELOG_ROOT, file), "utf-8");
    const { data, content } = matter(raw);

    return {
      slug: file.replace(/\.(mdx|md)$/, ""),
      version: String(data.version ?? "Unreleased"),
      releaseDate: String(data.releaseDate ?? "Pending"),
      product: (data.product as ChangelogProduct) ?? "NOCTRA Ecosystem",
      isSampleData: Boolean(data.isSampleData),
      summary: String(data.summary ?? ""),
      added: asStringArray(data.added),
      improvements: asStringArray(data.improvements),
      bugFixes: asStringArray(data.bugFixes),
      breakingChanges: asStringArray(data.breakingChanges),
      content,
    };
  });
}
