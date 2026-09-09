"use client";

import { createClient } from "@/lib/supabase/client";
import { stripImageMetadata } from "@/lib/image-processing";
import {
  ATHLETE_MEDIA_BUCKET,
  buildMediaPath,
  validatePhoto,
  type MediaSlot,
} from "@/lib/media-paths";

/**
 * Uploading and removing athlete media, as the signed-in athlete.
 *
 * Runs in the browser against the private `athlete-media` bucket, so the
 * Storage policies are the enforcement layer: an athlete can only write inside
 * their own `{uid}/` folder. Nothing here grants access it does not already
 * have (docs/ai/GUARDRAILS.md § Storage).
 */

export type UploadResult = { ok: true; path: string } | { ok: false; message: string };

/**
 * Uploads one photo to a brand-new path and returns it.
 *
 * `upsert: false` is the important flag. Every path carries a fresh UUID, so
 * there is nothing to overwrite — and if a collision somehow occurred, failing
 * is the correct outcome. This is what guarantees that an upload cannot mutate
 * the object a currently published profile points at: the live photo only
 * changes when the database row is updated to reference the new path.
 *
 * Photos are re-encoded before upload to strip EXIF and other embedded
 * metadata, so no athlete's location is stored. If that processing fails the
 * upload is abandoned — the original is never sent as a fallback, since doing
 * so would defeat the point precisely when it matters.
 */
export async function uploadPhoto(
  ownerUserId: string,
  slot: MediaSlot,
  file: File
): Promise<UploadResult> {
  const validation = validatePhoto(file);
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const processed = await stripImageMetadata(file);
  if (!processed.ok) {
    return { ok: false, message: processed.message };
  }

  // Re-validate: re-encoding changes the size, and a lossless PNG can come out
  // larger than it went in. The bucket would reject it, so catch it here with a
  // message the athlete can act on.
  const processedValidation = validatePhoto(processed.file);
  if (!processedValidation.ok) {
    return { ok: false, message: processedValidation.message };
  }

  try {
    // Inside the try deliberately: path generation reads platform crypto, and
    // anything that throws here should surface as a handled upload failure
    // rather than escaping as an unhandled rejection from the save handler.
    //
    // Everything downstream follows the processed file's own type, so the path
    // extension and the stored contentType always describe the real bytes.
    const path = buildMediaPath(ownerUserId, slot, processed.file.type);

    const supabase = createClient();
    const { error } = await supabase.storage.from(ATHLETE_MEDIA_BUCKET).upload(path, processed.file, {
      // Authoritative for how the object is served back. The path extension is
      // only there to make the bucket readable by a human.
      contentType: processed.file.type,
      upsert: false,
    });

    if (error) {
      return { ok: false, message: describeUploadError(error.message) };
    }

    return { ok: true, path };
  } catch {
    return { ok: false, message: "Couldn't upload your photo. Check your connection." };
  }
}

/**
 * Deletes objects that a profile no longer references.
 *
 * Best-effort by design, and only ever called *after* a successful database
 * save. At that point the row already points somewhere else, so a failure here
 * leaves an unreferenced object nobody can see — not a reason to fail a save
 * the athlete has already completed.
 */
export async function deleteObjects(paths: string[]): Promise<void> {
  const targets = paths.filter((path) => path.length > 0);
  if (targets.length === 0) return;

  try {
    const supabase = createClient();
    await supabase.storage.from(ATHLETE_MEDIA_BUCKET).remove(targets);
  } catch {
    // Intentionally swallowed. See above.
  }
}

/** Storage errors are developer-facing; translate the ones an athlete can hit. */
function describeUploadError(raw: string): string {
  const message = raw.toLowerCase();

  if (message.includes("exceeded") || message.includes("too large") || message.includes("size")) {
    return "That photo is over 5MB. Try a smaller one.";
  }
  if (message.includes("mime") || message.includes("content type")) {
    return "That image format isn't supported. Use a JPG, PNG, or WebP.";
  }
  if (message.includes("row-level security") || message.includes("unauthorized")) {
    return "You need to be signed in to upload photos.";
  }
  return "Couldn't upload your photo. Try again in a moment.";
}
