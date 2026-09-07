"use client";

import { cn } from "@/lib/cn";

type SwitchProps = {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function Switch({ label, description, checked, onChange }: SwitchProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          checked ? "bg-accent" : "bg-border"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-background transition-transform",
            checked ? "translate-x-[1.375rem]" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}
