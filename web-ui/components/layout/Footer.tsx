import Link from "next/link";
import { NoctraLogo } from "@/components/shared/NoctraLogo";
import { siteConfig } from "@/data/site-config";

export function Footer() {
  const isDev = process.env.NODE_ENV === "development";
  const configuredCommunity = siteConfig.communityLinks.filter(
    (link) => Boolean(link.href)
  );

  return (
    <footer className="border-t border-white/[0.08] bg-[#080A10]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Link
              href="/"
              className="inline-block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]"
            >
              <NoctraLogo size="md" />
            </Link>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-[#969BAD]">
              {siteConfig.brand.secondaryTagline}
            </p>
            <p className="mt-3 font-mono text-xs tracking-wider text-[#A78BFA]">
              {siteConfig.brand.tagline}
            </p>
          </div>

          <div>
            <h3 className="font-mono text-xs tracking-wider text-[#F5F5FA] uppercase">
              Products
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-[#969BAD]">
              <li>
                <Link
                  href="/products/noctra-ai"
                  className="transition-colors hover:text-[#F5F5FA]"
                >
                  NOCTRA AI (Android)
                </Link>
              </li>
              <li>
                <Link
                  href="/products/noctra-studio"
                  className="transition-colors hover:text-[#F5F5FA]"
                >
                  NOCTRA STUDIO (Desktop)
                </Link>
              </li>
              <li>
                <Link
                  href="/features"
                  className="transition-colors hover:text-[#F5F5FA]"
                >
                  Ecosystem Features
                </Link>
              </li>
              <li>
                <Link
                  href="/downloads"
                  className="transition-colors hover:text-[#F5F5FA]"
                >
                  Download Center
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-mono text-xs tracking-wider text-[#F5F5FA] uppercase">
              Resources
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-[#969BAD]">
              <li>
                <Link
                  href="/docs"
                  className="transition-colors hover:text-[#F5F5FA]"
                >
                  Documentation
                </Link>
              </li>
              <li>
                <Link
                  href="/docs/getting-started/installation"
                  className="transition-colors hover:text-[#F5F5FA]"
                >
                  Installation Guide
                </Link>
              </li>
              <li>
                <Link
                  href="/docs/advanced/security-model"
                  className="transition-colors hover:text-[#F5F5FA]"
                >
                  Security Model
                </Link>
              </li>
              <li>
                <Link
                  href="/changelog"
                  className="transition-colors hover:text-[#F5F5FA]"
                >
                  Changelog
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="transition-colors hover:text-[#F5F5FA]"
                >
                  About NOCTRA
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-mono text-xs tracking-wider text-[#F5F5FA] uppercase">
              Community
            </h3>
            {configuredCommunity.length > 0 ? (
              <ul className="mt-4 space-y-2.5 text-sm text-[#969BAD]">
                {configuredCommunity.map((item) => (
                  <li key={item.id}>
                    <a
                      href={item.href!}
                      target={item.id === "email" ? undefined : "_blank"}
                      rel={
                        item.id === "email" ? undefined : "noopener noreferrer"
                      }
                      className="transition-colors hover:text-[#F5F5FA]"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 space-y-2 text-xs leading-relaxed text-[#969BAD]">
                <p>
                  {isDev
                    ? "Dev Mode: No external community links configured in environment variables."
                    : "Community channels are managed centrally and will appear once published."}
                </p>
                <Link
                  href="/about#community"
                  className="inline-block text-[#67DDF2] hover:underline"
                >
                  View community configuration →
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-white/[0.08] pt-8 text-xs text-[#969BAD] sm:flex-row sm:items-center">
          <p>
            NOCTRA Ecosystem — Local-first software. Prompts sent to external
            providers are subject to each provider&apos;s privacy policy.
          </p>
          <p className="font-mono text-[11px] text-[#969BAD]/80">
            NOCTRA AI · NOCTRA STUDIO
          </p>
        </div>
      </div>
    </footer>
  );
}
