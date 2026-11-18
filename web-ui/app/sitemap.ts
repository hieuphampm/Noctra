import type { MetadataRoute } from "next";
import { siteConfig } from "@/data/site-config";
import { getAllDocs } from "@/lib/content/docs";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteConfig.url.replace(/\/$/, "");
  const staticRoutes = [
    "",
    "/products/noctra-ai",
    "/products/noctra-studio",
    "/features",
    "/downloads",
    "/docs",
    "/changelog",
    "/about",
  ];

  const docs = getAllDocs().map((doc) => `/docs/${doc.slug}`);

  return [...staticRoutes, ...docs].map((route) => ({
    url: `${baseUrl}${route}`,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route.startsWith("/products") ? 0.9 : 0.7,
  }));
}
