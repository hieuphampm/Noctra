import { cn } from "@/lib/utilities/cn";

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  accent?: "violet" | "cyan";
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  accent = "violet",
  className,
}: SectionHeadingProps) {
  const accentColor =
    accent === "cyan"
      ? "text-[#67DDF2] border-[#67DDF2]/25 bg-[#67DDF2]/10"
      : "text-[#A78BFA] border-[#A78BFA]/25 bg-[#A78BFA]/10";

  return (
    <div
      className={cn(
        align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl",
        className
      )}
    >
      {eyebrow && (
        <span
          className={cn(
            "mb-4 inline-flex items-center rounded-full border px-3 py-1 font-mono text-xs tracking-wider uppercase",
            accentColor
          )}
        >
          {eyebrow}
        </span>
      )}
      <h2 className="text-3xl font-semibold tracking-tight text-[#F5F5FA] sm:text-4xl lg:text-[2.6rem] lg:leading-[1.12]">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-base leading-relaxed text-[#969BAD] sm:text-lg">
          {description}
        </p>
      )}
    </div>
  );
}
