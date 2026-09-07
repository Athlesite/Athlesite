"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

type UsernameFieldProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  className?: string;
};

export function UsernameField({ value, onChange, error, hint, className }: UsernameFieldProps) {
  const id = useId();
  const noteId = useId();

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        Your Athlesite URL <span className="text-muted-foreground">(required)</span>
      </label>
      <p className="mt-1 text-xs text-muted-foreground">
        The one link you&apos;ll share with coaches, fans, and brands.
      </p>
      <div
        className={cn(
          "mt-2 flex items-center overflow-hidden rounded-lg border bg-surface transition-colors focus-within:border-accent",
          error ? "border-red-500/60" : "border-border"
        )}
      >
        <span className="pl-4 font-mono text-sm text-muted-foreground">athlesite.com/</span>
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="yourname"
          aria-describedby={hint || error ? noteId : undefined}
          aria-invalid={Boolean(error)}
          className="w-full bg-transparent py-3 pr-4 font-mono text-base font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/50"
        />
      </div>
      {error ? (
        <p id={noteId} className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
