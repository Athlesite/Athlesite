"use client";

import { createClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/supabase/auth";
import {
  toAthleteProfileRow,
  toAthleteProfileUpdateRow,
  type MediaPathUpdate,
  type AthleteProfileUpdateRow,
} from "@/lib/db-mappers";
import { uploadPhoto, deleteObjects } from "@/lib/media-storage";
import { currentMediaBelongsToOwner } from "@/lib/media-paths";
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
import {
  describeUpdateError,
  isDefiniteUpdateFailure,
  zeroRowUpdateResult,
  decideAfterAmbiguousUpdate,
  decideAfterConfirmedUpdateSuccess,
  decideAfterDefiniteUpdateFailure,
  withCleanupWarning,
  withOrphanPaths,
  type UpdateProfileResult,
  type UpdateReconciliationOutcome,
  type MediaSlotOutcome,
} from "@/lib/profile-update-decisions";

export type { SaveProfileResult } from "@/lib/profile-save-decisions";
import type { SaveProfileResult } from "@/lib/profile-save-decisions";
export type { UpdateProfileResult } from "@/lib/profile-update-decisions";

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

/**
 * Exactly the columns updateProfile writes (AthleteProfileUpdateRow),
 * selected back for reconciliation after an ambiguous update — never `*`,
 * so this can never accidentally read (or compare against) ownership/
 * identity columns. Includes media paths and framing (Checkpoint 5C): both
 * are now sometimes part of what an update intends to write, so
 * reconciliation must be able to see them. See profile-update-decisions.ts's
 * updateRowsMatch for how this is compared — media paths only when this
 * attempt expressed an opinion, framing unconditionally.
 */
const UPDATE_RECONCILIATION_COLUMNS = `
  slug,
  first_name, last_name, sport, position, class_year, school_or_team, city, state,
  height_in, weight_lb, bio,
  hero_photo_position_x, hero_photo_position_y, hero_photo_zoom,
  hero_photo_path, profile_photo_path,
  highlight_links,
  recruiting_status, recruiting_contact, recruiting_notes,
  social_instagram, social_twitter, social_tiktok, social_hudl, social_youtube, social_website,
  nil_open, nil_contact, nil_interests,
  is_published
`;

/**
 * PostgREST can return a `numeric` column as either a JSON number or a
 * string depending on value and version (see db-mappers.ts's own `numeric`
 * helper, which exists for the same reason on the read side). A naive
 * `===` in updateRowsMatch would spuriously report a mismatch between a
 * freshly-computed `0.3` and a reread `"0.3"` even when the write landed
 * exactly as intended, so the framing columns are coerced explicitly here
 * before this row is ever compared.
 */
function coerceNumeric(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Queries the owner's current row after an ambiguous update outcome, so
 * updateProfile can weigh a genuinely uncommitted update against one that
 * actually landed despite an apparent failure. Mirrors
 * reconcileAfterAmbiguousInsert's own reasoning: "not-visible" is an
 * observation, not proof nothing was written.
 */
async function reconcileAfterAmbiguousUpdate(userId: string): Promise<UpdateReconciliationOutcome> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("athlete_profiles")
      .select(UPDATE_RECONCILIATION_COLUMNS)
      .eq("owner_user_id", userId)
      .maybeSingle();

    if (error) return { status: "query-failed" };
    if (!data) return { status: "not-visible" };

    const row = data as unknown as AthleteProfileUpdateRow;
    return {
      status: "found",
      row: {
        ...row,
        hero_photo_position_x: coerceNumeric(row.hero_photo_position_x),
        hero_photo_position_y: coerceNumeric(row.hero_photo_position_y),
        hero_photo_zoom: coerceNumeric(row.hero_photo_zoom),
      },
    };
  } catch {
    return { status: "query-failed" };
  }
}

/** A photo slot's intent for one save: leave it alone, replace it, or remove it. */
export type MediaSlotIntent =
  | { kind: "preserve" }
  | { kind: "replace"; file: File }
  | { kind: "remove" };

/**
 * The media paths as already known by the caller before this save — i.e.
 * whatever EditProfileForm most recently loaded from the server. Supplied
 * rather than re-read here so each attempt reasons about its own freshly
 * loaded state; see updateProfile's own docblock for why this is what makes
 * a second save in the same session safe.
 */
export type CurrentMediaPaths = {
  heroPhotoPath: string | null;
  profilePhotoPath: string | null;
};

const PRESERVE_MEDIA: { hero: MediaSlotIntent; profile: MediaSlotIntent } = {
  hero: { kind: "preserve" },
  profile: { kind: "preserve" },
};

/**
 * Best-effort deletion of `paths` once the DB commit itself is already
 * confirmed (immediately, or via reconciliation) — the save has genuinely
 * happened either way, so a failed deletion here is folded in as an
 * athlete-safe caveat (see withCleanupWarning), never a rollback and never
 * silently reported as an ordinary clean success.
 */
async function applyConfirmedMediaCleanup(
  deletePaths: string[],
  result: UpdateProfileResult
): Promise<UpdateProfileResult> {
  if (deletePaths.length === 0) return result;

  const cleanup = await deleteObjects(deletePaths);
  if (!cleanup.ok) {
    console.error(
      "[updateProfile] couldn't confirm a superseded/removed media object was deleted after a confirmed save:",
      cleanup.failedPaths,
      cleanup.message
    );
  }
  return withCleanupWarning(result, cleanup);
}

/**
 * Best-effort deletion of a replacement upload this attempt made but which
 * is now known NOT to be live — a definite update failure, or a confirmed
 * zero-row match. A failed deletion here is folded into the already-failed
 * `result` as a diagnostic (orphanPaths), never changing its ok:false shape
 * otherwise. The old/current object is never passed to this — see
 * decideAfterDefiniteUpdateFailure.
 */
async function applyDoomedReplacementCleanup(
  deletePaths: string[],
  result: UpdateProfileResult
): Promise<UpdateProfileResult> {
  if (deletePaths.length === 0) return result;

  const cleanup = await deleteObjects(deletePaths);
  if (!cleanup.ok) {
    console.error(
      "[updateProfile] failed to clean up a doomed replacement upload after a rejected update:",
      cleanup.failedPaths,
      cleanup.message
    );
  }
  return withOrphanPaths(result, cleanup);
}

/**
 * This project has no server-side error reporting yet; the console is the
 * only place an unresolved orphan can currently surface. Deliberately
 * narrow: no retry queue or background sweep is introduced here — mirrors
 * cleanupAndReport's identical reasoning above.
 */
function logUnresolvedMediaPaths(result: UpdateProfileResult): void {
  if (!result.ok && result.orphanPaths && result.orphanPaths.length > 0) {
    console.error(
      "[updateProfile] unresolved media path(s) after an ambiguous update — not deleted, outcome could not be confirmed:",
      result.orphanPaths
    );
  }
}

/**
 * Updates the athlete's existing profile row — non-media fields, publish
 * state, hero framing, and (Checkpoint 5C) hero/profile media replace or
 * remove. Cannot create a row — that is the whole point of this function's
 * existence separate from createProfile.
 *
 * The write is a plain `.update()`, filtered on `owner_user_id`, never an
 * upsert and never an insert: PostgREST's UPDATE cannot create a row by
 * construction, regardless of what the payload contains or how many rows
 * happen to match. `userId` comes from getCurrentUser(), never from the
 * `profile` argument, so a caller cannot aim this at somebody else's row —
 * and even if it were wrong, the database's own "Owner can update own
 * profile" RLS policy (using/with check both `auth.uid() = owner_user_id`)
 * independently refuses any row that is not the caller's, exactly mirroring
 * the defense-in-depth relationship createProfile's preflight has with the
 * `owner_user_id` unique constraint.
 *
 * `.select("slug").maybeSingle()` is what lets a zero-row match be told
 * apart from a real update: PostgREST returns no error and `data: null` when
 * the filter matched nothing, which must never be read as success (see
 * zeroRowUpdateResult). Because this is a single UPDATE statement — no
 * separate insert — there is no partial-write window for the non-media
 * columns: a rejected write (a slug collision, a check constraint) is
 * refused atomically by Postgres, and nothing about the row changes.
 *
 * Media ordering (5C). For a "replace": upload to a fresh UUID path
 * (`upsert:false`, via the unchanged, 5A-hardened uploadPhoto) *before* the
 * DB write — nothing live changes until the row is updated to reference it,
 * exactly like createProfile's own media never mutating a currently-live
 * object. For a "remove": no upload at all; the DB write alone sets the
 * path to `null`. Either way, the *old* (pre-attempt) object — supplied by
 * the caller as `currentMedia`, never re-read here — is only ever eligible
 * for deletion *after* the DB outcome is confirmed committed, immediately
 * or via reconciliation. It is never deleted eagerly, and never on an
 * ambiguous or failed outcome. A failed upload aborts before any DB write is
 * attempted at all, so the existing/old object is untouched either way (see
 * decideAfterUploadFailure, reused unchanged from createProfile).
 *
 * An ambiguous DB outcome (a thrown exception, or a response this client
 * cannot trust) is never treated as a failure outright: it is reconciled by
 * rereading the owner's row and comparing it, field by field, against the
 * entire state this update intended to write — every 5B field, hero
 * framing unconditionally, and media paths only where this attempt
 * expressed an opinion (see updateRowsMatch). An exact match unlocks old-
 * object cleanup; anything less leaves both the old and any newly uploaded
 * object untouched and reports them as unresolved (see
 * decideAfterAmbiguousUpdate). A definite failure or confirmed zero-row
 * match makes any replacement this attempt uploaded safe to clean up
 * unconditionally, since the row is guaranteed not to have committed it.
 *
 * A successful DB commit whose best-effort old-object cleanup cannot be
 * confirmed is still reported `ok: true` — the save is real; a failed
 * cleanup is surfaced as `mediaCleanupWarning`, an already athlete-safe
 * message, while the raw path is only ever logged (see
 * applyConfirmedMediaCleanup), never returned to a caller.
 */
export async function updateProfile(
  profile: AthleteProfileData,
  isPublished: boolean,
  currentMedia: CurrentMediaPaths = { heroPhotoPath: null, profilePhotoPath: null },
  mediaIntents: { hero: MediaSlotIntent; profile: MediaSlotIntent } = PRESERVE_MEDIA
): Promise<UpdateProfileResult> {
  let userId: string;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, message: "You need to be signed in to save your changes." };
    }
    userId = user.id;
  } catch {
    return { ok: false, message: "Couldn't confirm your account. Try again in a moment." };
  }

  // Defense in depth: `currentMedia` is a real caller-supplied input, not
  // re-read from the database (see this function's own docblock for why) —
  // so a stale baseline (e.g. a leftover record after an account switch in
  // the same tab) could in principle name a path outside this session's own
  // folder, or a real path in the wrong slot. currentMediaBelongsToOwner
  // checks both structurally (see media-paths.ts's parseMediaPath) — never
  // a substring/prefix check. Storage's own RLS would independently refuse
  // to delete a foreign path regardless, but rejecting a mismatched
  // baseline here, before any upload or update is even attempted, is what
  // makes "a foreign-owner path cannot enter cleanup" true at this layer
  // too, not just there. Nothing about which path or slot failed is logged:
  // a foreign path is, by definition, not this session's own to expose,
  // even to its own developer console.
  if (!currentMediaBelongsToOwner(currentMedia, userId)) {
    console.error("[updateProfile] rejected: the supplied media baseline does not structurally belong to the authenticated owner.");
    return { ok: false, message: "Couldn't confirm your account. Refresh the page and try again." };
  }

  // Upload any replacement first. attemptedPaths tracks everything this
  // attempt is aware of (confirmed or ambiguous) so a failure below can
  // attempt cleanup of it — nothing about the DB row has changed yet at
  // this point, so the existing/old object for either slot is never at risk
  // here regardless of which slot's upload fails.
  const media: MediaPathUpdate = {};
  const attemptedPaths: string[] = [];
  const uploadedPathsThisAttempt: string[] = [];

  if (mediaIntents.hero.kind === "replace") {
    const outcome = await handleSlotUpload(
      userId,
      "hero",
      mediaIntents.hero.file,
      media,
      uploadedPathsThisAttempt,
      attemptedPaths
    );
    if (!outcome.ok) {
      const { deletePaths, result } = decideAfterUploadFailure(attemptedPaths, outcome.message);
      return applyDoomedReplacementCleanup(deletePaths, result);
    }
  } else if (mediaIntents.hero.kind === "remove") {
    media.heroPhotoPath = null;
  }

  if (mediaIntents.profile.kind === "replace") {
    const outcome = await handleSlotUpload(
      userId,
      "profile",
      mediaIntents.profile.file,
      media,
      uploadedPathsThisAttempt,
      attemptedPaths
    );
    if (!outcome.ok) {
      const { deletePaths, result } = decideAfterUploadFailure(attemptedPaths, outcome.message);
      return applyDoomedReplacementCleanup(deletePaths, result);
    }
  } else if (mediaIntents.profile.kind === "remove") {
    media.profilePhotoPath = null;
  }

  const row = toAthleteProfileUpdateRow(profile, isPublished, media);

  // Both uploads above, if attempted, have already succeeded by this point
  // (a failure returns early) — media.heroPhotoPath/profilePhotoPath are
  // therefore guaranteed set whenever the corresponding intent is "replace".
  const heroOutcome: MediaSlotOutcome =
    mediaIntents.hero.kind === "replace"
      ? { kind: "replace", newPath: media.heroPhotoPath!, previousPath: currentMedia.heroPhotoPath }
      : mediaIntents.hero.kind === "remove"
        ? { kind: "remove", previousPath: currentMedia.heroPhotoPath }
        : { kind: "preserve" };

  const profileOutcome: MediaSlotOutcome =
    mediaIntents.profile.kind === "replace"
      ? { kind: "replace", newPath: media.profilePhotoPath!, previousPath: currentMedia.profilePhotoPath }
      : mediaIntents.profile.kind === "remove"
        ? { kind: "remove", previousPath: currentMedia.profilePhotoPath }
        : { kind: "preserve" };

  let outcome:
    | { kind: "success"; slug: string }
    | { kind: "definite-failure"; code: string | undefined }
    | { kind: "zero-rows" }
    | { kind: "ambiguous" };

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("athlete_profiles")
      .update(row)
      .eq("owner_user_id", userId)
      .select("slug")
      .maybeSingle();

    if (error) {
      outcome = isDefiniteUpdateFailure(error.code)
        ? { kind: "definite-failure", code: error.code }
        : { kind: "ambiguous" };
    } else if (!data?.slug) {
      // No error and no row: the update matched nothing. Never success.
      outcome = { kind: "zero-rows" };
    } else {
      outcome = { kind: "success", slug: data.slug };
    }
  } catch {
    // A thrown exception (network failure, timeout) does not prove the
    // request never reached the database — reconcile, do not assume.
    outcome = { kind: "ambiguous" };
  }

  if (outcome.kind === "success") {
    const { deletePaths, result } = decideAfterConfirmedUpdateSuccess(outcome.slug, heroOutcome, profileOutcome);
    return applyConfirmedMediaCleanup(deletePaths, result);
  }

  if (outcome.kind === "zero-rows") {
    const { deletePaths, result } = decideAfterDefiniteUpdateFailure(
      zeroRowUpdateResult(),
      heroOutcome,
      profileOutcome
    );
    return applyDoomedReplacementCleanup(deletePaths, result);
  }

  if (outcome.kind === "definite-failure") {
    const { deletePaths, result } = decideAfterDefiniteUpdateFailure(
      describeUpdateError(outcome.code),
      heroOutcome,
      profileOutcome
    );
    return applyDoomedReplacementCleanup(deletePaths, result);
  }

  // Ambiguous: find out what actually happened before touching any media.
  const reconciliation = await reconcileAfterAmbiguousUpdate(userId);
  const { deletePaths, result } = decideAfterAmbiguousUpdate(reconciliation, row, heroOutcome, profileOutcome);

  if (result.ok) {
    return applyConfirmedMediaCleanup(deletePaths, result);
  }

  logUnresolvedMediaPaths(result);
  return result;
}
