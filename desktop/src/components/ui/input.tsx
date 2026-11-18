import * as React from "react";
import { cn } from "@/utils/cn";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-8 w-full rounded-lg border border-[#252B3A] bg-[#090B10] px-3 py-1.5 text-xs text-[#F3F4F8] placeholder:text-[#9399AA]/60 focus:border-[#A78BFA]/70 focus:outline-none focus:ring-1 focus:ring-[#A78BFA]/40 disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";
