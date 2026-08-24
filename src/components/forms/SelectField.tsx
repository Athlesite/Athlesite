"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

type SelectFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  error?: string;
  className?: string;
};

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  required,
  error,
  className,
}: SelectFieldProps) {
  const id = useId();
  const noteId = useId();

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-muted-foreground"> (required)</span> : null}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={error ? noteId : undefined}
        aria-invalid={Boolean(error)}
        className={cn(
          "mt-2 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-accent",
          error ? "border-red-500/60" : "border-border",
          value === "" && "text-muted-foreground/60"
        )}
      >
        <option value="" disabled hidden>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="text-foreground">
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={noteId} className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
