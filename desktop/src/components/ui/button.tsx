import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]/60 disabled:pointer-events-none disabled:opacity-45 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-[#A78BFA] text-[#090B10] hover:bg-[#B79FFF] shadow-sm shadow-[#A78BFA]/20 font-semibold",
        secondary:
          "bg-[#191E2C] text-[#F3F4F8] border border-[#252B3A] hover:bg-[#212739] hover:border-[#343C52]",
        cyan:
          "bg-[#67DDF2]/15 text-[#67DDF2] border border-[#67DDF2]/30 hover:bg-[#67DDF2]/25",
        ghost:
          "text-[#9399AA] hover:text-[#F3F4F8] hover:bg-[#191E2C]",
        destructive:
          "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25",
        outline:
          "border border-[#252B3A] bg-transparent text-[#F3F4F8] hover:bg-[#191E2C]",
      },
      size: {
        default: "h-8 px-3.5 py-1.5",
        sm: "h-7 px-2.5 text-[11px]",
        lg: "h-9 px-4 text-sm",
        icon: "h-8 w-8 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
);
Button.displayName = "Button";
