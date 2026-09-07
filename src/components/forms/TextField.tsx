"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  type?: "text" | "email" | "tel" | "url";
  inputMode?: "text" | "numeric" | "url" | "email" | "tel";
  maxLength?: number;
  className?: string;
};

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  error,
  hint,
  type = "text",
  inputMode,
  maxLength,
  className,
}: TextFieldProps) {
  const id = useId();
  const noteId = useId();

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-muted-foreground"> (required)</span> : null}
      </label>
      <div
        className={cn(
          "mt-2 flex items-center overflow-hidden rounded-lg border bg-surface transition-colors focus-within:border-accent",
          error ? "border-red-500/60" : "border-border"
        )}
      >
        <input
          id={id}
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-describedby={hint || error ? noteId : undefined}
          aria-invalid={Boolean(error)}
          className="w-full bg-transparent px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
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
