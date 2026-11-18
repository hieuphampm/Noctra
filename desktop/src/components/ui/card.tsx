import * as React from "react";
import { cn } from "@/utils/cn";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[#252B3A] bg-[#121622] shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors",
        checked
          ? "border-[#A78BFA] bg-[#A78BFA]"
          : "border-[#252B3A] bg-[#191E2C]",
        disabled && "opacity-45 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-3.5 w-3.5 rounded-full bg-[#090B10] shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export function Select({
  value,
  onChange,
  children,
  className,
  id,
}: {
  value: string;
  onChange: (val: string) => void;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-8 rounded-lg border border-[#252B3A] bg-[#090B10] px-2.5 text-xs text-[#F3F4F8] focus:border-[#A78BFA]/70 focus:outline-none",
        className
      )}
    >
      {children}
    </select>
  );
}
