"use client";

import { createClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/supabase/auth";
import { toAthleteProfileRow, type MediaPathUpdate } from "@/lib/db-mappers";
import { uploadPhoto, deleteObjects } from "@/lib/media-storage";
import type { AthleteProfileData } from "@/lib/athlete-profile";
import {
  decideOwnershipGate,
  decideAfterUploadFailure,
  decideAfterDefiniteFailure,
  decideAfterAmbiguousInsert,
  mergeCleanupOutcome,
  unresolvedPathsToLog,
  isDefiniteInsertFailure,
  describeInsertError,
  type OwnershipStatus,
  type ReconciliationOutcome,
} from "@/lib/profile-save-decisions";

export type { SaveProfileResult } from "@/lib/profile-save-decisions";
import type { SaveProfileResult } from "@/lib/profile-save-decisions";

/**
 * Create an athlete's profile in Supabase, including media. First-time
 * creation only — see the guarantee on createProfile below.
 *
 * Runs as the signed-in athlete from the browser, so RLS is the enforcement
 * layer rather than anything in this file. There is no service-role key in this
 * project by design (docs/ai/DECISIONS.md § Auth & Ownership).
 *
 * Reads live in profile-repository.ts, which is server-side. This module is the
 * write half and is client-only, because the session is established in the
 * browser by the inline OTP flow.
 *
 * This file is the imperative shell: it performs the actual reads, writes,
 * and uploads. The branching logic for what to do with each possible outcome
 * — including every rollback decision, and the definite/ambiguous/unresolved
 * classification behind it — lives in profile-save-decisions.ts as plain,
 * dependency-free functions, so that logic can be checked directly without
 * mocking a live Supabase project.
 *
 * Create and update are deliberately separate concerns, not one function
 * branching on whether a row already exists. A future updateProfile() belongs
 * here alongside createProfile() once Edit Profile can write — it would
 * .update() filtered on owner_user_id (never inserting), so it is
 * structurally unable to create a row, exactly mirroring the guarantee below
 * in the other direction. Neither function should ever be asked to do both
 * jobs.
 */

/** Photos the athlete picked this session. Null means "did not pick one". */
export type PhotoUploads = {
  hero: File | null;
  profile: File | null;
};

/**
 * Whether the signed-in user already has a profile row. Three states, not a
 * boolean: a lookup failure must never be read as "no profile exists" — that
 * would let onboarding's Save button light up for an athlete who may already
 * own one. See decideOwnershipGate for how each state is handled.
 *
 * Used both as onboarding's advisory post-OTP UI check and, unconditionally,
 * as createProfile's own preflight immediately below — the UI check existing
 * does not excuse createProfile from repeating it, since the UI check can
 * race or be bypassed. Either way, the database's owner_user_id unique
 * constraint remains the actual backstop: this function only ever improves
 * on it by catching a known duplicate, or a lookup failure, before any
 * Storage write.
 */
export async function checkOwnershipStatus(userId: string): Promise<OwnershipStatus> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("athlete_profiles")
      .select("owner_user_id")
      .eq("owner_user_id", userId)
      .maybeSingle();

    if (error) return { status: "unknown" };
    return { status: data ? "exists" : "none" };
  } catch {
    return { status: "unknown" };
  }
}

/**
 * Queries the owner's current row after an ambiguous insert outcome, so
 * createProfile can weigh a genuinely uncommitted insert against one that
 * actually landed despite an apparent failure (a lost response, a timeout
 * after the write reached the database).
 *
 * Returns an *observation*, not a conclusion: "not-visible" means this read
 * found no row, which is not proof no row was written — a write still
 * completing on a different connection is not guaranteed visible to this
 * one. "query-failed" means the read itself cannot be trusted. Both are
 * handled identically by decideAfterAmbiguousInsert, as unresolved.
 */
async function reconcileAfterAmbiguousInsert(userId: string): Promise<ReconciliationOutcome> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("athlete_profiles")
      .select("slug, hero_photo_path, profile_photo_path")
      .eq("owner_user_id", userId)
      .maybeSingle();

    if (error) return { status: "query-failed" };
    if (!data) return { status: "not-visible" };

    return {
      status: "found",
      row: {
        slug: data.slug,
        heroPhotoPath: data.hero_photo_path,
        profilePhotoPath: data.profile_photo_path,
      },
    };
  } catch {
    return { status: "query-failed" };
  }
}

/**
 * Runs Storage cleanup for the given paths and folds the outcome into
 * `result` — logging, not swallowing, a cleanup failure, since an
 * unconfirmed rollback after a failed create is a real orphan risk (see
 * docs/ai/DECISIONS.md § Media & Storage), not a harmless one the way
 * cleanup after a *successful* save is.
 *
 * `paths` being empty does not mean there is nothing to report: a decision
 * function upstream may have deliberately chosen not to attempt deletion at
 * all (the unresolved case — a path that might still be referenced by a row
 * that has not finished committing). That must still reach diagnostics, so
 * this checks `result` itself for unresolved paths even when no deletion was
 * ever attempted, rather than only logging on a `deleteObjects` failure.
 */
async function cleanupAndReport(
  paths: string[],
  result: SaveProfileResult
): Promise<SaveProfileResult> {
  if (paths.length === 0) {
    const unresolved = unresolvedPathsToLog(result);
    if (unresolved) {
      // This project has no server-side error reporting yet; the console is
      // the only place this can currently surface. Deliberately narrow: no
      // retry queue or background sweep is introduced here.
      console.error(
        "[createProfile] unresolved media path(s) after a failed create — not deleted, outcome could not be confirmed:",
        unresolved
      );
    }
    return result;
  }

  const cleanup = await deleteObjects(paths);
  if (!cleanup.ok) {
    console.error(
      "[createProfile] failed to clean up orphaned media after a failed create:",
      cleanup.failedPaths,
      cleanup.message
    );
  }

  return mergeCleanupOutcome(result, cleanup);
}

/**
 * Uploads one slot's photo and applies its outcome to the attempt's running
 * media/path state. Wrapped in its own try/catch: uploadPhoto is designed to
 * convert every failure, including a thrown network exception, into a
 * structured UploadOutcome rather than rejecting — but this attempt must not
 * reject unexpectedly regardless of whether that design holds in every case,
 * so an unforeseen throw here is still caught and treated as a controlled
 * failure rather than an unhandled rejection escaping createProfile.
 *
 * `attemptedPaths` accumulates every path this attempt is aware of,
 * including one whose upload outcome was ambiguous — tracked so an
 * unconfirmed-but-possibly-real object is never silently lost, even though
 * its actual deletion may itself be unconfirmed. `uploadedPaths` accumulates
 * only confirmed successes. Both are threaded through by reference so a
 * failure on this slot still reports whatever an earlier slot already
 * confirmed.
 */
async function handleSlotUpload(
  userId: string,
  slot: "hero" | "profile",
  file: File,
  media: MediaPathUpdate,
  uploadedPaths: string[],
  attemptedPaths: string[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const outcome = await uploadPhoto(userId, slot, file);

    if (outcome.kind === "success") {
      uploadedPaths.push(outcome.path);
      attemptedPaths.push(outcome.path);
      if (slot === "hero") media.heroPhotoPath = outcome.path;
      else media.profilePhotoPath = outcome.path;
      return { ok: true };
    }

    if (outcome.kind === "ambiguous") {
      attemptedPaths.push(outcome.attemptedPath);
      return { ok: false, message: outcome.message };
    }

    // definite-failure: nothing was confirmed to reach Storage for this slot.
    return { ok: false, message: outcome.message };
  } catch {
    return { ok: false, message: "Couldn't upload your photo. Check your connection." };
  }
}

/**
 * Creates the athlete's profile row. Cannot update or overwrite one that
 * already exists — that is the whole point of this function's existence
 * separate from a future updateProfile().
 *
 * The write is a plain `.insert()`, not an upsert. `owner_user_id` carries a
 * unique constraint (supabase/migrations/20260825000001_create_athlete_profiles.sql),
 * so if a row for this user already exists, Postgres rejects the insert with
 * `23505` rather than silently overwriting it. That guarantee is enforced by
 * the database and holds regardless of anything in this file, the caller, or
 * the UI — including the preflight check immediately below, which is
 * advisory, not the enforcement.
 *
 * Every media object this attempt is aware of — confirmed uploads and any
 * whose outcome was ambiguous — is tracked and rolled back if the attempt
 * does not end in a committed row: an upload failure part-way through, a
 * definite insert rejection (duplicate owner, slug collision, a check
 * constraint), or — reconciled first, never assumed — an ambiguous insert
 * outcome that turns out not to have committed. If the insert actually
 * committed despite looking like a failure, reconciliation detects that from
 * the row itself and this recovers as a success instead of deleting media a
 * real row now references. See profile-save-decisions.ts for the branching
 * this function threads its I/O results through, and for what "definite",
 * "ambiguous", and "unresolved" each mean.
 *
 * Ownership comes from getCurrentUser(), never from the profile argument, so a
 * caller cannot aim this at somebody else's row. RLS would reject that anyway.
 */
export async function createProfile(
  profile: AthleteProfileData,
  photos: PhotoUploads = { hero: null, profile: null }
): Promise<SaveProfileResult> {
  let userId: string;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, message: "You need to be signed in to save your Athlesite." };
    }
    userId = user.id;
  } catch {
    return { ok: false, message: "Couldn't confirm your account. Try again in a moment." };
  }

  // Preflight, before any Storage write. Advisory against the UI-level check
  // racing or being skipped — the database backstop above is what actually
  // enforces this regardless of what happens here.
  const gate = decideOwnershipGate(await checkOwnershipStatus(userId));
  if (!gate.proceed) return gate.result;

  // Upload to fresh paths. attemptedPaths is deliberately a superset of
  // uploadedPaths pre-insert: it also carries a path whose outcome was
  // ambiguous, so it is never lost even though it cannot be confirmed
  // uploaded. Pre-insert, nothing generated this attempt can ever be
  // referenced by a row (no insert has been attempted yet), so cleanup of
  // everything gathered so far — confirmed or ambiguous — is always safe to
  // *attempt*; deleteObjects' own confirmation decides what is reported.
  const media: MediaPathUpdate = {};
  const uploadedPaths: string[] = [];
  const attemptedPaths: string[] = [];

  if (photos.hero) {
    const outcome = await handleSlotUpload(userId, "hero", photos.hero, media, uploadedPaths, attemptedPaths);
    if (!outcome.ok) {
      const { deletePaths, result } = decideAfterUploadFailure(attemptedPaths, outcome.message);
      return cleanupAndReport(deletePaths, result);
    }
  }

  if (photos.profile) {
    const outcome = await handleSlotUpload(
      userId,
      "profile",
      photos.profile,
      media,
      uploadedPaths,
      attemptedPaths
    );
    if (!outcome.ok) {
      const { deletePaths, result } = decideAfterUploadFailure(attemptedPaths, outcome.message);
      return cleanupAndReport(deletePaths, result);
    }
  }

  const row = toAthleteProfileRow(profile, userId, media);

  // Classify the insert's outcome before deciding anything: success, a
  // definite (guaranteed-not-committed) failure, or ambiguous. An ambiguous
  // outcome is never treated as a failure outright — see below.
  let outcome:
    | { kind: "success"; slug: string }
    | { kind: "definite-failure"; code: string | undefined; message: string }
    | { kind: "ambiguous" };

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("athlete_profiles")
      .insert(row)
      .select("slug")
      .single();

    if (error) {
      outcome = isDefiniteInsertFailure(error.code)
        ? {
            kind: "definite-failure",
            code: error.code,
            message: `${error.message} ${error.details ?? ""}`.toLowerCase(),
          }
        : { kind: "ambiguous" };
    } else if (!data?.slug) {
      // A response with no error and no usable data is not a shape this
      // client can trust either way — reconcile rather than assume.
      outcome = { kind: "ambiguous" };
    } else {
      outcome = { kind: "success", slug: data.slug };
    }
  } catch {
    // A thrown exception (network failure, timeout) does not prove the
    // request never reached the database — reconcile, do not assume.
    outcome = { kind: "ambiguous" };
  }

  if (outcome.kind === "success") {
    return { ok: true, slug: outcome.slug };
  }

  if (outcome.kind === "definite-failure") {
    const { deletePaths, result } = decideAfterDefiniteFailure(
      uploadedPaths,
      describeInsertError(outcome.code, outcome.message)
    );
    return cleanupAndReport(deletePaths, result);
  }

  // Ambiguous: find out what actually happened before touching any upload.
  const reconciliation = await reconcileAfterAmbiguousInsert(userId);
  const { deletePaths, result } = decideAfterAmbiguousInsert(reconciliation, uploadedPaths, media);
  return cleanupAndReport(deletePaths, result);
}
