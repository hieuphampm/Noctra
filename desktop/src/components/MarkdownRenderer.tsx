import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";

function CodeBlock({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  const [copied, setCopied] = React.useState(false);
  const isBlock = Boolean(className && className.includes("language-"));
  const textRef = React.useRef<HTMLElement>(null);

  if (!isBlock) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  const lang = className?.replace("language-", "") ?? "code";
  const copy = () => {
    const raw = textRef.current?.textContent ?? "";
    navigator.clipboard?.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative group my-2">
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-[#252B3A] bg-[#121622] px-3 py-1 text-[10px] text-[#9399AA]">
        <span className="uppercase tracking-wider">{lang}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[#191E2C] hover:text-[#F3F4F8]"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <code ref={textRef} className={className} {...props}>
        {children}
      </code>
    </div>
  );
}

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="noctra-prose break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code: CodeBlock as never,
          pre: ({ children }) => (
            <pre className="!mt-0 !rounded-t-none">{children}</pre>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
