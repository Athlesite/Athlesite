"use client";

import { createClient } from "@/lib/supabase/client";
import { stripImageMetadata } from "@/lib/image-processing";
import {
  ATHLETE_MEDIA_BUCKET,
  buildMediaPath,
  validatePhoto,
  type MediaSlot,
} from "@/lib/media-paths";
import {
  classifyUploadAttempt,
  confirmDeletions,
  normalizeDeletePaths,
  type UploadOutcome,
  type DeleteOutcome,
} from "@/lib/profile-save-decisions";

export type { UploadOutcome, DeleteOutcome } from "@/lib/profile-save-decisions";

/**
 * Uploading and removing athlete media, as the signed-in athlete.
 *
 * Runs in the browser against the private `athlete-media` bucket, so the
 * Storage policies are the enforcement layer: an athlete can only write inside
 * their own `{uid}/` folder. Nothing here grants access it does not already
 * have (docs/ai/GUARDRAILS.md § Storage).
 *
 * The definite/ambiguous/unresolved classification both functions here use is
 * shared with the insert side of createProfile — see the module docblock on
 * profile-save-decisions.ts.
 */

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
 * so would defeat the point precisely when it matters. A processing/validation
 * failure is always a *definite* failure: it happens before any path is even
 * generated, so there is nothing to preserve or roll back.
 *
 * Once a path is generated, no outcome of the network call is ever read as
 * proof the object was not created — not a thrown exception, and not a
 * *returned* Storage error either, of any class or HTTP status.
 *
 * This was investigated directly against the installed
 * `@supabase/storage-js` SDK's source rather than assumed. It returns two
 * distinct `StorageError` subclasses from a failed `.upload()`:
 *
 * - `StorageApiError` — built from an actual HTTP `Response` (see the SDK's
 *   own fetch handler), carrying a genuine `status`/`statusCode`/`code`.
 * - `StorageUnknownError` — built when the underlying `fetch` call itself
 *   failed and no response was ever received at all.
 *
 * The instinctive reading is that `StorageApiError` — a real response —
 * proves the API rejected the request before creating anything. That
 * instinct is wrong: a `StorageApiError` is constructed for *any* non-2xx
 * status the client receives, including 502/503/504 — a gateway or proxy in
 * front of the real Storage backend reporting that *it* could not get a
 * timely or valid answer from the origin, which says nothing about whether
 * the origin actually completed the write. The SDK's own type system draws
 * its line at "was a response received at all", not at whether that
 * response is authoritative about the backend's own state. Nothing in the
 * installed SDK's source documents a status code or error shape that proves
 * the opposite. Absent that proof, every returned Storage error is treated
 * exactly like a thrown exception: ambiguous, with the exact attempted path
 * preserved rather than discarded — the bytes may have reached Storage
 * either way. See classifyUploadAttempt in profile-save-decisions.ts, and
 * the real-SDK regression in media-storage.upload-classification.test.ts.
 *
 * A `definite-failure` remains possible from this function — but only from
 * the client-side checks above, which run and can fail *before* any network
 * attempt begins. Nothing reachable after that point is ever definite.
 */
export async function uploadPhoto(
  ownerUserId: string,
  slot: MediaSlot,
  file: File
): Promise<UploadOutcome> {
  const validation = validatePhoto(file);
  if (!validation.ok) {
    return { kind: "definite-failure", message: validation.message };
  }

  const processed = await stripImageMetadata(file);
  if (!processed.ok) {
    return { kind: "definite-failure", message: processed.message };
  }

  // Re-validate: re-encoding changes the size, and a lossless PNG can come out
  // larger than it went in. The bucket would reject it, so catch it here with a
  // message the athlete can act on.
  const processedValidation = validatePhoto(processed.file);
  if (!processedValidation.ok) {
    return { kind: "definite-failure", message: processedValidation.message };
  }

  let path: string;
  try {
    // Path generation reads platform crypto and can throw in a genuinely
    // crypto-less environment. Nothing has been sent over the network yet,
    // so there is no path to preserve if this fails.
    path = buildMediaPath(ownerUserId, slot, processed.file.type);
  } catch {
    return { kind: "definite-failure", message: "Couldn't prepare your photo for upload. Try again." };
  }

  // Everything downstream follows the processed file's own type, so the path
  // extension and the stored contentType always describe the real bytes.
  let outcomeUnproven = false;
  let ambiguousMessage = "Couldn't upload your photo. Check your connection.";

  try {
    const supabase = createClient();
    const { error } = await supabase.storage.from(ATHLETE_MEDIA_BUCKET).upload(path, processed.file, {
      // Authoritative for how the object is served back. The path extension is
      // only there to make the bucket readable by a human.
      contentType: processed.file.type,
      upsert: false,
    });

    if (error) {
      // See this function's docblock: no returned Storage error, of any
      // class or status, has been proven to mean the object was not
      // created. Still translate the message when one is available — being
      // conservative about the *rollback* decision does not require being
      // vague about *what likely happened*, when real information exists.
      outcomeUnproven = true;
      ambiguousMessage = describeUploadError(error.message);
    }
  } catch {
    outcomeUnproven = true;
  }

  return classifyUploadAttempt(path, outcomeUnproven, ambiguousMessage);
}

/**
 * Deletes objects a profile no longer references, or that a failed create
 * attempt uploaded before it could ever be referenced.
 *
 * `{ ok: true }` is returned only when Storage's own response confirms every
 * requested path was actually removed — see confirmDeletions in
 * profile-save-decisions.ts. Empty deletion data, partial deletion data, and
 * a path simply absent from the response are all treated the same way: not
 * confirmed, therefore reported as failed. None of those are read as
 * evidence the object must already be gone.
 *
 * Reports the outcome rather than swallowing it — a caller cleaning up after
 * a successful save can still choose to treat a failure here as non-fatal
 * (the row already points somewhere else, so a leftover object is invisible
 * to everyone), but a caller rolling back an unsuccessful create needs to
 * know a rollback is incomplete rather than silently believe it worked.
 */
export async function deleteObjects(paths: string[]): Promise<DeleteOutcome> {
  const targets = normalizeDeletePaths(paths);
  if (targets.length === 0) return { ok: true };

  try {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from(ATHLETE_MEDIA_BUCKET).remove(targets);

    if (error) {
      return { ok: false, failedPaths: targets, message: error.message };
    }

    return confirmDeletions(
      targets,
      (data ?? []).map((entry) => entry.name)
    );
  } catch (err) {
    return {
      ok: false,
      failedPaths: targets,
      message: err instanceof Error ? err.message : "Storage removal failed.",
    };
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
