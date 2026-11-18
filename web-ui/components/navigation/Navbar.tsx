"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Menu,
  X,
  Smartphone,
  Monitor,
  ArrowRight,
} from "lucide-react";
import { NoctraLogo } from "@/components/shared/NoctraLogo";
import { cn } from "@/lib/utilities/cn";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

interface ProductNavItem {
  name: string;
  href: string;
  description: string;
  badge: string;
}

interface MainNavItem {
  label: string;
  href: string;
}

interface NavbarProps {
  products: ProductNavItem[];
  mainLinks: MainNavItem[];
  githubUrl: string | null;
  isDev: boolean;
}

export function Navbar({ products, mainLinks, githubUrl, isDev }: NavbarProps) {
  const pathname = usePathname();
  const [productsMenuPath, setProductsMenuPath] = useState<string | null>(null);
  const [mobileMenuPath, setMobileMenuPath] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const productsOpen = productsMenuPath === pathname;
  const mobileOpen = mobileMenuPath === pathname;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProductsMenuPath(null);
        setMobileMenuPath(null);
      }
    }
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setProductsMenuPath(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const toggleProducts = () =>
    setProductsMenuPath((prev) => (prev === pathname ? null : pathname));
  const toggleMobile = () =>
    setMobileMenuPath((prev) => (prev === pathname ? null : pathname));
  const closeAll = () => {
    setProductsMenuPath(null);
    setMobileMenuPath(null);
  };

  const isProductActive = pathname.startsWith("/products");

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#080A10]/85 backdrop-blur-xl">
      <nav
        aria-label="Primary Navigation"
        className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
      >
        {/* Left: Brand Logo & Wordmark */}
        <Link
          href="/"
          className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]"
          aria-label="NOCTRA Home"
        >
          <NoctraLogo size="md" />
        </Link>

        {/* Center: Desktop Navigation */}
        <div className="hidden items-center gap-1 lg:flex">
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={toggleProducts}
              aria-expanded={productsOpen}
              aria-haspopup="menu"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]",
                isProductActive || productsOpen
                  ? "bg-white/[0.06] text-[#F5F5FA]"
                  : "text-[#969BAD] hover:bg-white/[0.04] hover:text-[#F5F5FA]"
              )}
            >
              <span>Products</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-200",
                  productsOpen && "rotate-180"
                )}
                aria-hidden="true"
              />
            </button>

            <AnimatePresence>
              {productsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  role="menu"
                  className="absolute left-0 mt-2 w-80 rounded-2xl border border-white/[0.1] bg-[#10131D]/95 p-2 shadow-2xl shadow-black/60 backdrop-blur-xl"
                >
                  {products.map((product) => {
                    const isStudio = product.href.includes("studio");
                    return (
                      <Link
                        key={product.href}
                        href={product.href}
                        role="menuitem"
                        className="group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]"
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                            isStudio
                              ? "border-[#67DDF2]/25 bg-[#67DDF2]/10 text-[#67DDF2]"
                              : "border-[#A78BFA]/25 bg-[#A78BFA]/10 text-[#A78BFA]"
                          )}
                        >
                          {isStudio ? (
                            <Monitor className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Smartphone className="h-4 w-4" aria-hidden="true" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-[#F5F5FA]">
                              {product.name}
                            </span>
                            <span className="rounded-full border border-white/[0.08] bg-[#171B28] px-2 py-0.5 font-mono text-[10px] text-[#969BAD]">
                              {product.badge}
                            </span>
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed text-[#969BAD]">
                            {product.description}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {mainLinks.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]",
                  active
                    ? "bg-white/[0.06] text-[#F5F5FA]"
                    : "text-[#969BAD] hover:bg-white/[0.04] hover:text-[#F5F5FA]"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Right: GitHub & Get Started */}
        <div className="hidden items-center gap-3 lg:flex">
          {githubUrl ? (
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#10131D] px-3.5 py-2 text-sm font-medium text-[#F5F5FA] transition-colors hover:border-white/[0.18] hover:bg-[#171B28] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]"
            >
              <GitHubIcon className="h-4 w-4 text-[#969BAD]" />
              <span>GitHub</span>
            </a>
          ) : isDev ? (
            <Link
              href="/about#community"
              title="Development placeholder: set NEXT_PUBLIC_GITHUB_URL"
              className="inline-flex items-center gap-2 rounded-lg border border-dashed border-white/[0.15] bg-[#10131D]/60 px-3 py-2 font-mono text-xs text-[#969BAD] transition-colors hover:border-[#A78BFA]/40 hover:text-[#F5F5FA]"
            >
              <GitHubIcon className="h-3.5 w-3.5" />
              <span>GitHub (Unconfigured)</span>
            </Link>
          ) : null}

          <Link
            href="/docs/getting-started/introduction"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#A78BFA] px-4 py-2 text-sm font-semibold text-[#080A10] transition-colors hover:bg-[#B89FFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#67DDF2]"
          >
            <span>Get Started</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        {/* Mobile Menu Trigger */}
        <button
          type="button"
          onClick={toggleMobile}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation-drawer"
          aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.08] bg-[#10131D] text-[#F5F5FA] transition-colors hover:bg-[#171B28] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA] lg:hidden"
        >
          {mobileOpen ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </nav>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeAll}
              className="fixed inset-0 top-16 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
              aria-hidden="true"
            />
            <motion.div
              id="mobile-navigation-drawer"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-x-0 top-16 z-50 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-white/[0.08] bg-[#0B0E17] px-4 py-6 shadow-2xl lg:hidden"
            >
              <div className="space-y-6">
                <div>
                  <p className="mb-2 px-2 font-mono text-[11px] tracking-wider text-[#969BAD] uppercase">
                    Products
                  </p>
                  <div className="space-y-2">
                    {products.map((product) => (
                      <Link
                        key={product.href}
                        href={product.href}
                        className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#10131D] p-3.5 text-[#F5F5FA]"
                      >
                        <div>
                          <div className="text-sm font-semibold">
                            {product.name}
                          </div>
                          <div className="mt-0.5 text-xs text-[#969BAD]">
                            {product.description}
                          </div>
                        </div>
                        <span className="rounded-full border border-white/[0.08] bg-[#171B28] px-2 py-0.5 font-mono text-[10px] text-[#969BAD]">
                          {product.badge}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 px-2 font-mono text-[11px] tracking-wider text-[#969BAD] uppercase">
                    Ecosystem
                  </p>
                  <div className="space-y-1">
                    {mainLinks.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "block rounded-lg px-3 py-2.5 text-sm font-medium",
                          pathname === item.href
                            ? "bg-white/[0.07] text-[#F5F5FA]"
                            : "text-[#969BAD] hover:bg-white/[0.04] hover:text-[#F5F5FA]"
                        )}
                      >
                        {item.label}
                      </Link>
                    ))}
                    <Link
                      href="/about"
                      className={cn(
                        "block rounded-lg px-3 py-2.5 text-sm font-medium",
                        pathname === "/about"
                          ? "bg-white/[0.07] text-[#F5F5FA]"
                          : "text-[#969BAD] hover:bg-white/[0.04] hover:text-[#F5F5FA]"
                      )}
                    >
                      About
                    </Link>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 border-t border-white/[0.08] pt-4">
                  {githubUrl && (
                    <a
                      href={githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-[#10131D] px-4 py-3 text-sm font-medium text-[#F5F5FA]"
                    >
                      <GitHubIcon className="h-4 w-4" />
                      <span>GitHub</span>
                    </a>
                  )}
                  <Link
                    href="/docs/getting-started/introduction"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#A78BFA] px-4 py-3 text-sm font-semibold text-[#080A10]"
                  >
                    <span>Get Started</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
