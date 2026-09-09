"use client";

import { createClient } from "@/lib/supabase/client";
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

  const path = buildMediaPath(ownerUserId, slot, file.type);

  try {
    const supabase = createClient();
    const { error } = await supabase.storage.from(ATHLETE_MEDIA_BUCKET).upload(path, file, {
      // Authoritative for how the object is served back. The path extension is
      // only there to make the bucket readable by a human.
      contentType: file.type,
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
