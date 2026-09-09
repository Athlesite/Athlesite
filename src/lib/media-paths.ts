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
 * A random v4 UUID, without requiring a secure context.
 *
 * `crypto.randomUUID()` is specified `[SecureContext]`, so it exists only over
 * HTTPS or on localhost. Serving the app over plain HTTP — a LAN IP for device
 * testing, or an internal preview host — leaves it `undefined`, and calling it
 * threw a TypeError from the middle of the upload path.
 *
 * The fallback draws the same 122 bits of entropy from
 * `crypto.getRandomValues()`, which carries no secure-context requirement, and
 * formats them per RFC 4122: version nibble 4, variant bits 10xx. Collision
 * resistance is identical — only the convenience wrapper differs. There is
 * deliberately no `Math.random()` path; if neither CSPRNG is available the
 * caller should fail rather than mint a guessable object path.
 */
export function randomId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
  return `${ownerUserId}/${slot}/${randomId()}.${extension}`;
}
