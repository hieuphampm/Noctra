import { cn } from "@/lib/utilities/cn";

interface NoctraLogoProps {
  className?: string;
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg";
}

export function NoctraLogo({
  className,
  showWordmark = true,
  size = "md",
}: NoctraLogoProps) {
  const boxSize =
    size === "sm" ? "h-7 w-7" : size === "lg" ? "h-10 w-10" : "h-8 w-8";
  const textSize =
    size === "sm"
      ? "text-sm tracking-[0.22em]"
      : size === "lg"
        ? "text-lg tracking-[0.26em]"
        : "text-base tracking-[0.24em]";

  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <svg
        viewBox="0 0 64 64"
        fill="none"
        className={cn(boxSize, "shrink-0")}
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="noctraLogoGrad"
            x1="8"
            y1="8"
            x2="56"
            y2="56"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#A78BFA" />
            <stop offset="100%" stopColor="#67DDF2" />
          </linearGradient>
        </defs>
        <rect
          x="3"
          y="3"
          width="58"
          height="58"
          rx="16"
          fill="#10131D"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="2"
        />
        <path
          d="M20 44V20L44 44V20"
          stroke="url(#noctraLogoGrad)"
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="20" r="3" fill="#A78BFA" />
        <circle cx="44" cy="44" r="3" fill="#67DDF2" />
      </svg>
      {showWordmark && (
        <span
          className={cn(
            "font-semibold text-[#F5F5FA] uppercase",
            textSize
          )}
        >
          NOCTRA
        </span>
      )}
    </span>
  );
}
