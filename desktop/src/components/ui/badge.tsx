import * as React from "react";
import { cn } from "@/utils/cn";

type BadgeVariant = "default" | "violet" | "cyan" | "success" | "warning" | "danger";

const styles: Record<BadgeVariant, string> = {
  default: "bg-[#191E2C] text-[#9399AA] border-[#252B3A]",
  violet: "bg-[#A78BFA]/15 text-[#A78BFA] border-[#A78BFA]/30",
  cyan: "bg-[#67DDF2]/15 text-[#67DDF2] border-[#67DDF2]/30",
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  danger: "bg-red-500/15 text-red-400 border-red-500/30",
};

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-medium tracking-wide",
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
