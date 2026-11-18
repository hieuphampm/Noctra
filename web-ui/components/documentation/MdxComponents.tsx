import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import { slugifyHeading } from "@/lib/content/docs";
import { CodeBlock } from "@/components/documentation/CodeBlock";

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join("");
  }
  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: ReactNode } }).props;
    return extractText(props?.children);
  }
  return "";
}

export const mdxComponents = {
  h2: ({ children, ...props }: ComponentPropsWithoutRef<"h2">) => {
    const id = slugifyHeading(extractText(children));
    return (
      <h2
        id={id}
        className="mt-10 mb-4 scroll-mt-24 border-b border-white/[0.08] pb-2 text-2xl font-semibold text-[#F5F5FA]"
        {...props}
      >
        {children}
      </h2>
    );
  },
  h3: ({ children, ...props }: ComponentPropsWithoutRef<"h3">) => {
    const id = slugifyHeading(extractText(children));
    return (
      <h3
        id={id}
        className="mt-7 mb-3 scroll-mt-24 text-lg font-semibold text-[#F5F5FA]"
        {...props}
      >
        {children}
      </h3>
    );
  },
  p: (props: ComponentPropsWithoutRef<"p">) => (
    <p className="my-4 text-[15px] leading-7 text-[#969BAD]" {...props} />
  ),
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul
      className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-7 text-[#969BAD]"
      {...props}
    />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol
      className="my-4 list-decimal space-y-2 pl-6 text-[15px] leading-7 text-[#969BAD]"
      {...props}
    />
  ),
  li: (props: ComponentPropsWithoutRef<"li">) => (
    <li className="marker:text-[#A78BFA]" {...props} />
  ),
  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-[#F5F5FA]" {...props} />
  ),
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className="my-5 rounded-r-xl border-l-2 border-[#A78BFA] bg-[#10131D] px-4 py-3 text-sm text-[#F5F5FA]/90"
      {...props}
    />
  ),
  a: ({ href = "", children, ...props }: ComponentPropsWithoutRef<"a">) => {
    if (href.startsWith("/")) {
      return (
        <Link
          href={href}
          className="font-medium text-[#67DDF2] underline decoration-[#67DDF2]/40 underline-offset-4 hover:decoration-[#67DDF2]"
          {...props}
        >
          {children}
        </Link>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-[#67DDF2] underline decoration-[#67DDF2]/40 underline-offset-4 hover:decoration-[#67DDF2]"
        {...props}
      >
        {children}
      </a>
    );
  },
  code: ({ className, children, ...props }: ComponentPropsWithoutRef<"code">) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded-md border border-white/[0.08] bg-[#171B28] px-1.5 py-0.5 font-mono text-[13px] text-[#67DDF2]"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }: ComponentPropsWithoutRef<"pre">) => {
    const rawText = extractText(children).trimEnd();
    let language = "";
    if (
      children &&
      typeof children === "object" &&
      "props" in children &&
      typeof (children as { props?: { className?: string } }).props?.className ===
        "string"
    ) {
      const cls =
        (children as { props?: { className?: string } }).props?.className ?? "";
      language = cls.replace("language-", "");
    }
    return (
      <CodeBlock rawText={rawText} language={language}>
        {children}
      </CodeBlock>
    );
  },
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="my-6 overflow-x-auto rounded-xl border border-white/[0.08]">
      <table className="w-full text-left text-sm" {...props} />
    </div>
  ),
  th: (props: ComponentPropsWithoutRef<"th">) => (
    <th
      className="border-b border-white/[0.08] bg-[#10131D] px-4 py-3 font-semibold text-[#F5F5FA]"
      {...props}
    />
  ),
  td: (props: ComponentPropsWithoutRef<"td">) => (
    <td
      className="border-b border-white/[0.05] px-4 py-3 text-[#969BAD]"
      {...props}
    />
  ),
};
