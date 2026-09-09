/**
 * Athlete media: bucket, path convention, and client-side validation.
 *
 * Deliberately free of Supabase imports so both the browser upload path and the
 * server render path can share it without dragging a client into the server
 * graph or vice versa.
 */

export const ATHLETE_MEDIA_BUCKET = "athlete-media";

/** The two media slots an athlete profile has. */
export type MediaSlot = "hero" | "profile";

/**
 * Mirrors `allowed_mime_types` on the bucket. The bucket is the real boundary;
 * checking here only spares the athlete a confusing server rejection.
 */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Mirrors the bucket's `file_size_limit` of 5 MB. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type PhotoValidation = { ok: true } | { ok: false; message: string };

/**
 * Rejects what the bucket would reject anyway, in language an athlete can act
 * on. iPhone photos are the case worth knowing about: iOS usually transcodes
 * HEIC to JPEG through a file input, but not always.
 */
export function validatePhoto(file: File): PhotoValidation {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return {
      ok: false,
      message: "That image format isn't supported. Use a JPG, PNG, or WebP.",
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: "That photo is over 5MB. Try a smaller one." };
  }
  return { ok: true };
}

/**
 * Builds a fresh object path for an upload: `{uid}/{slot}/{uuid}.{ext}`.
 *
 * Every upload gets a new UUID, so an upload can never overwrite the object a
 * published profile is currently pointing at. That is what makes the database
 * upsert — not the upload — the point at which an athlete's live photo changes.
 * See docs/ai/DECISIONS.md § Media & Storage.
 *
 * The first path segment stays the owner's uid, which is what every Storage
 * policy checks via `(storage.foldername(name))[1]`. The extension is cosmetic;
 * contentType set at upload time is what actually governs how the object is
 * served. It is kept because these folders get inspected by hand in the Supabase
 * dashboard during the pilot, and a list of bare UUIDs is hard to work with.
 */
export function buildMediaPath(ownerUserId: string, slot: MediaSlot, mimeType: string): string {
  const extension = EXTENSION_BY_TYPE[mimeType] ?? "bin";
  return `${ownerUserId}/${slot}/${crypto.randomUUID()}.${extension}`;
}
