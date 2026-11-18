import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className={cn(
          "relative w-full max-w-2xl rounded-xl border border-[#252B3A] bg-[#121622] shadow-2xl max-h-[88vh] flex flex-col",
          className
        )}
      >
        <div className="flex items-start justify-between border-b border-[#252B3A] px-5 py-3.5">
          <div>
            <h3 className="text-sm font-semibold text-[#F3F4F8]">{title}</h3>
            {subtitle && (
              <p className="text-xs text-[#9399AA] mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[#9399AA] hover:bg-[#191E2C] hover:text-[#F3F4F8]"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
