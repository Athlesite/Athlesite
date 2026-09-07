"use client";

import { useId, useRef } from "react";
import { Button } from "@/components/ui/Button";

export type PhotoPreview = { fileName: string; objectUrl: string } | null;

type FileFieldProps = {
  label: string;
  hint?: string;
  value: PhotoPreview;
  onSelect: (file: File | null) => void;
};

export function FileField({ label, hint, value, onSelect }: FileFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <span className="block text-sm font-medium text-foreground">{label}</span>
      <div className="mt-2 flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-surface">
          {value ? (
            // Temporary local preview (blob: URL) — not eligible for next/image optimization.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value.objectUrl}
              alt=""
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
              No photo
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => onSelect(event.target.files?.[0] ?? null)}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              {value ? "Replace photo" : "Choose photo"}
            </Button>
            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (inputRef.current) inputRef.current.value = "";
                  onSelect(null);
                }}
              >
                Remove
              </Button>
            ) : null}
          </div>
          {value ? (
            <p className="max-w-[16rem] truncate text-xs text-muted-foreground">
              {value.fileName}
            </p>
          ) : null}
        </div>
      </div>
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
