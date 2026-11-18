import type { Metadata } from "next";
import { siteConfig } from "@/data/site-config";
import type { FaqItem } from "@/data/faq";

interface PageSeoOptions {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
}

export function buildPageMetadata({
  title,
  description,
  path,
  keywords = [],
}: PageSeoOptions): Metadata {
  const fullTitle =
    path === "/" ? `${siteConfig.brand.name} — ${title}` : `${title} | ${siteConfig.brand.name}`;
  const canonicalUrl = `${siteConfig.url.replace(/\/$/, "")}${path}`;

  return {
    title: fullTitle,
    description,
    keywords: Array.from(new Set([...siteConfig.keywords, ...keywords])),
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: fullTitle,
      description,
      url: canonicalUrl,
      siteName: siteConfig.brand.name,
      type: "website",
      images: [
        {
          url: "/images/og-cover.svg",
          width: 1200,
          height: 630,
          alt: `${siteConfig.brand.name} — ${siteConfig.brand.tagline}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: ["/images/og-cover.svg"],
    },
  };
}

export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.brand.name,
    url: siteConfig.url,
    description: siteConfig.brand.description,
    slogan: siteConfig.brand.tagline,
  };
}

export function buildSoftwareJsonLd(options: {
  name: string;
  description: string;
  operatingSystem: string;
  applicationCategory: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: options.name,
    description: options.description,
    operatingSystem: options.operatingSystem,
    applicationCategory: options.applicationCategory,
    url: `${siteConfig.url.replace(/\/$/, "")}${options.url}`,
    publisher: {
      "@type": "Organization",
      name: siteConfig.brand.name,
    },
  };
}

export function buildFaqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
