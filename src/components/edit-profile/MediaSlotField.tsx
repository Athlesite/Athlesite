"use client";

import { useId, useRef } from "react";
import { Button } from "@/components/ui/Button";
import type { MediaSlotIntent } from "@/lib/profile-save";

type MediaSlotFieldProps = {
  label: string;
  hint?: string;
  /**
   * The URL to preview right now — already resolved by the parent: a local
   * blob URL when `intent.kind === "replace"`, the signed remote URL when
   * preserving an existing photo, or undefined when there's nothing to show
   * (removed, or never uploaded). This component never creates or revokes
   * object URLs itself — see EditProfileForm for why that stays with the
   * caller.
   */
  previewUrl?: string;
  /**
   * Whether a path is currently stored for this slot, independent of
   * `previewUrl` — a signed URL can fail to generate even when a real
   * object exists (see profile-repository.ts's signMediaUrl), and "Remove"
   * must still be offered in that case.
   */
  hasExisting: boolean;
  intent: MediaSlotIntent;
  onSelect: (file: File) => void;
  onRemove: () => void;
  onUndo: () => void;
  /**
   * True while a save is in flight for this slot's form, through its full
   * media-refresh window (see EditProfileForm/MediaSection) — not just the
   * network request. A pick made here while that window is open would
   * otherwise be silently discarded once the in-flight save's refreshed
   * record lands and resets the intent back to "preserve".
   */
  disabled?: boolean;
};

export function MediaSlotField({
  label,
  hint,
  previewUrl,
  hasExisting,
  intent,
  onSelect,
  onRemove,
  onUndo,
  disabled = false,
}: MediaSlotFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const hasPhotoToRemove = intent.kind === "replace" || (intent.kind === "preserve" && hasExisting);

  return (
    <div>
      <span className="block text-sm font-medium text-foreground">{label}</span>
      <div className="mt-2 flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-surface">
          {intent.kind !== "remove" && previewUrl ? (
            // Local blob preview or a signed remote URL — neither is
            // eligible for next/image optimization.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="h-full w-full object-cover object-top" />
          ) : (
            <span className="text-center text-[10px] uppercase tracking-wide text-muted-foreground/60">
              {intent.kind === "remove" ? "Removing" : "No photo"}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onSelect(file);
              // Allow picking the same file again after an Undo without the
              // browser treating it as "no change".
              event.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            {intent.kind === "remove" ? (
              <Button type="button" variant="secondary" size="sm" onClick={onUndo} disabled={disabled}>
                Undo
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                  disabled={disabled}
                >
                  {intent.kind === "replace" ? "Choose a different photo" : hasExisting ? "Replace photo" : "Choose photo"}
                </Button>
                {intent.kind === "replace" ? (
                  <Button type="button" variant="ghost" size="sm" onClick={onUndo} disabled={disabled}>
                    Undo
                  </Button>
                ) : hasPhotoToRemove ? (
                  <Button type="button" variant="ghost" size="sm" onClick={onRemove} disabled={disabled}>
                    Remove photo
                  </Button>
                ) : null}
              </>
            )}
          </div>
          {intent.kind === "replace" ? (
            <p className="text-xs text-muted-foreground">New photo — not saved yet.</p>
          ) : intent.kind === "remove" ? (
            <p className="text-xs text-muted-foreground">This photo will be removed when you save.</p>
          ) : null}
        </div>
      </div>
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
