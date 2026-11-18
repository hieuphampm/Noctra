import * as React from "react";
import { cn } from "@/utils/cn";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[80px] w-full rounded-lg border border-[#252B3A] bg-[#090B10] px-3 py-2 text-xs text-[#F3F4F8] placeholder:text-[#9399AA]/60 focus:border-[#A78BFA]/70 focus:outline-none focus:ring-1 focus:ring-[#A78BFA]/40 disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
