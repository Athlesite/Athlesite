"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

type TextAreaFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
};

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  rows = 4,
  maxLength,
  className,
}: TextAreaFieldProps) {
  const id = useId();
  const noteId = useId();

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        aria-describedby={hint || error ? noteId : undefined}
        className={cn(
          "mt-2 w-full resize-none rounded-lg border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-accent",
          error ? "border-red-500/60" : "border-border"
        )}
      />
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
