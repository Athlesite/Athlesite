"use client";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/forms/TextField";
import type { HighlightLink } from "@/lib/athlete-profile";

const TITLE_MAX_LENGTH = 40;

type RepeatingUrlListFieldProps = {
  label: string;
  hint?: string;
  value: HighlightLink[];
  onChange: (value: HighlightLink[]) => void;
};

export function RepeatingUrlListField({
  label,
  hint,
  value,
  onChange,
}: RepeatingUrlListFieldProps) {
  function updateRow(index: number, patch: Partial<HighlightLink>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...value, { label: "", url: "" }]);
  }

  return (
    <div>
      <span className="block text-sm font-medium text-foreground">{label}</span>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}

      {value.length > 0 ? (
        <div className="mt-3 space-y-4">
          {value.map((row, index) => {
            const isFeatured = index === 0;
            return (
              <div key={index} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-4">
                  <span
                    className={
                      isFeatured
                        ? "rounded-full bg-accent-subtle px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-accent-light"
                        : "text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                    }
                  >
                    {isFeatured ? "Featured highlight" : `Highlight ${index + 1}`}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(index)}
                  >
                    Remove
                  </Button>
                </div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <TextField
                    label="Link title"
                    value={row.label}
                    onChange={(v) => updateRow(index, { label: v })}
                    placeholder="e.g. Senior Highlight Reel"
                    maxLength={TITLE_MAX_LENGTH}
                    className="flex-1"
                  />
                  <TextField
                    label="URL"
                    value={row.url}
                    onChange={(v) => updateRow(index, { url: v })}
                    placeholder="https://…"
                    type="url"
                    inputMode="url"
                    className="flex-1"
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <Button type="button" variant="secondary" size="sm" onClick={addRow} className="mt-3">
        Add a highlight link
      </Button>
    </div>
  );
}
