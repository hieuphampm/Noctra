"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

interface CodeBlockProps {
  children: ReactNode;
  rawText: string;
  language?: string;
}

export function CodeBlock({ children, rawText, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(rawText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable in restricted contexts
    }
  }

  return (
    <div className="group my-5 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0B0E17]">
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#10131D] px-4 py-2">
        <span className="font-mono text-[11px] text-[#969BAD] uppercase">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code block"
          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#171B28] px-2.5 py-1 font-mono text-[11px] text-[#969BAD] transition-colors hover:text-[#F5F5FA] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
              <span className="text-emerald-300">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" aria-hidden="true" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-[#F5F5FA]">
        {children}
      </pre>
    </div>
  );
}
