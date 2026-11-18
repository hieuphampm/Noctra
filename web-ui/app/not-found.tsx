import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-4 py-24 text-center">
      <span className="rounded-full border border-[#A78BFA]/30 bg-[#A78BFA]/10 px-3 py-1 font-mono text-xs text-[#A78BFA]">
        404 — NOT FOUND
      </span>
      <h1 className="mt-6 text-4xl font-semibold text-[#F5F5FA] sm:text-5xl">
        Page not found
      </h1>
      <p className="mt-4 max-w-md text-base text-[#969BAD]">
        The requested NOCTRA page or documentation path could not be found.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-[#A78BFA] px-5 py-2.5 text-sm font-semibold text-[#080A10] transition-colors hover:bg-[#B89FFF]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to Home</span>
        </Link>
        <Link
          href="/docs"
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-[#10131D] px-5 py-2.5 text-sm font-medium text-[#F5F5FA] transition-colors hover:bg-[#171B28]"
        >
          Browse Documentation
        </Link>
      </div>
    </section>
  );
}
