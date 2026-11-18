export interface ConfigurableLink {
  id: string;
  label: string;
  href: string | null;
  placeholderNote: string;
}

const cleanEnv = (value: string | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const siteConfig = {
  brand: {
    name: "NOCTRA",
    tagline: "YOUR AI. YOUR RULES. YOUR OWN ECOSYSTEM.",
    secondaryTagline:
      "Powerful AI experiences. Private by design. Built around you.",
    description:
      "NOCTRA builds privacy-first, local-first AI software — NOCTRA AI for Android and NOCTRA STUDIO for desktop agent workflows, MCP integrations, and Skills.",
  },
  url: cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) ?? "https://noctra.ai",
  links: {
    github: cleanEnv(process.env.NEXT_PUBLIC_GITHUB_URL),
    discord: cleanEnv(process.env.NEXT_PUBLIC_DISCORD_URL),
    community: cleanEnv(process.env.NEXT_PUBLIC_COMMUNITY_URL),
    email: cleanEnv(process.env.NEXT_PUBLIC_CONTACT_EMAIL),
    issues: cleanEnv(process.env.NEXT_PUBLIC_ISSUES_URL),
    featureRequests: cleanEnv(process.env.NEXT_PUBLIC_FEATURE_REQUESTS_URL),
  },
  communityLinks: [
    {
      id: "github",
      label: "GitHub Repository",
      href: cleanEnv(process.env.NEXT_PUBLIC_GITHUB_URL),
      placeholderNote: "Set NEXT_PUBLIC_GITHUB_URL to publish repository link",
    },
    {
      id: "discord",
      label: "Discord Community",
      href: cleanEnv(process.env.NEXT_PUBLIC_DISCORD_URL),
      placeholderNote: "Set NEXT_PUBLIC_DISCORD_URL to publish invite link",
    },
    {
      id: "community",
      label: "Community Forum",
      href: cleanEnv(process.env.NEXT_PUBLIC_COMMUNITY_URL),
      placeholderNote: "Set NEXT_PUBLIC_COMMUNITY_URL to publish forum link",
    },
    {
      id: "email",
      label: "Contact Email",
      href: cleanEnv(process.env.NEXT_PUBLIC_CONTACT_EMAIL)
        ? `mailto:${cleanEnv(process.env.NEXT_PUBLIC_CONTACT_EMAIL)}`
        : null,
      placeholderNote: "Set NEXT_PUBLIC_CONTACT_EMAIL to publish contact email",
    },
    {
      id: "issues",
      label: "Issue Reporting",
      href: cleanEnv(process.env.NEXT_PUBLIC_ISSUES_URL),
      placeholderNote: "Set NEXT_PUBLIC_ISSUES_URL to publish issue tracker",
    },
    {
      id: "featureRequests",
      label: "Feature Requests",
      href: cleanEnv(process.env.NEXT_PUBLIC_FEATURE_REQUESTS_URL),
      placeholderNote:
        "Set NEXT_PUBLIC_FEATURE_REQUESTS_URL to publish feature board",
    },
  ] satisfies ConfigurableLink[],
  navigation: {
    products: [
      {
        name: "NOCTRA AI",
        href: "/products/noctra-ai",
        description: "Privacy-first Android AI chat application",
        badge: "Android",
      },
      {
        name: "NOCTRA STUDIO",
        href: "/products/noctra-studio",
        description: "Desktop AI agent, MCP & workflow platform",
        badge: "Desktop",
      },
    ],
    main: [
      { label: "Features", href: "/features" },
      { label: "Downloads", href: "/downloads" },
      { label: "Documentation", href: "/docs" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  keywords: [
    "NOCTRA AI",
    "NOCTRA STUDIO",
    "Privacy-first AI assistant",
    "Android AI chat",
    "Desktop AI agents",
    "MCP desktop client",
    "AI agent builder",
    "MCP integrations",
    "AI Skills marketplace",
  ],
};
