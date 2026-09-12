import type { AthleteProfileUpdateRow } from "@/lib/db-mappers";
import type { DeleteOutcome } from "@/lib/profile-save-decisions";

/**
 * Pure decision logic for updateProfile's branching in profile-save.ts,
 * factored out for the same reason profile-save-decisions.ts is: every
 * function here is a plain data transformation with no I/O of its own, so
 * each branch can be verified directly, without a live Supabase project.
 *
 * The only imports here are `import type`, erased entirely at compile time,
 * so this module has zero runtime dependencies and can be loaded in
 * isolation (see profile-update-decisions.test.ts, run via `node --test`).
 *
 * Checkpoint 5C adds media (replace/remove/framing) to what updateProfile
 * can write. Unlike createProfile's rollback — where an unreferenced upload
 * is always safe to *attempt* deleting, because nothing could reference it
 * before the insert — an update's media decisions are two-sided: an old
 * object may still be exactly what's live, and a freshly uploaded
 * replacement may or may not be. So cleanup of the *old* object is now
 * gated on the SAME confirmation signal as the update's own success —
 * immediate, or reconciled — never attempted eagerly or on ambiguity.
 *
 * The three outcome categories from 5B still apply to the write as a whole:
 *
 * - **definite failure** — Postgres returned a recognized rejection code
 *   (23505 slug collision, 23514 a check constraint, 42501 RLS refused the
 *   write). The database processed and refused the statement atomically;
 *   nothing was written, including any media path this attempt intended.
 *   Any replacement this attempt uploaded is therefore *not* live and may be
 *   cleaned up unconditionally — see decideAfterDefiniteUpdateFailure.
 * - **zero rows matched** — the `.update()` succeeded as a statement but
 *   matched no row for this owner. Handled identically to a definite
 *   failure for media purposes: nothing committed, any replacement upload
 *   is safe to clean up, nothing about the old object changes.
 * - **ambiguous** — a thrown exception or a response this client cannot
 *   trust. Resolved by reconciling against the owner's current row and
 *   comparing it, field by field — now including media paths where this
 *   attempt expressed an opinion, and framing unconditionally — against the
 *   entire state this update intended to write. Only an exact match
 *   unlocks old-object cleanup; anything less leaves both the old and any
 *   newly uploaded object untouched and reports them as unresolved.
 */

export type UpdateProfileResult =
  | {
      ok: true;
      slug: string;
      /**
       * Present only when the DB commit itself succeeded (or was reconciled
       * as committed) but best-effort deletion of a superseded/removed media
       * object could not be confirmed. Already an athlete-safe message —
       * never a raw Storage path. The save is real; this is a caveat, not a
       * failure, per the project's existing "superseded object is deleted
       * best-effort" decision.
       */
      mediaCleanupWarning?: string;
    }
  | {
      ok: false;
      message: string;
      field?: "slug";
      /**
       * Present when this attempt has media whose fate is not fully
       * resolved — an ambiguous write that could not be confirmed, or a
       * failed cleanup attempt. Diagnostic only, exactly like
       * SaveProfileResult's own orphanPaths — never rendered to the athlete
       * verbatim; profile-save.ts logs it.
       */
      orphanPaths?: string[];
    };

/**
 * What the reconciliation read actually observed, not what it proves. Both
 * "not-visible" and "query-failed" are an absence of evidence, not evidence
 * that the update failed — see decideAfterAmbiguousUpdate.
 */
export type UpdateReconciliationOutcome =
  | { status: "found"; row: AthleteProfileUpdateRow }
  | { status: "not-visible" }
  | { status: "query-failed" };

/**
 * What happened to one media slot this attempt, once any replacement upload
 * has already resolved to a real path. Operates purely on paths — never a
 * `File` — so it stays usable by this dependency-free module.
 *
 * `previousPath` is supplied by the caller (the value already loaded before
 * this attempt began), not re-read here — see profile-save.ts's
 * updateProfile for why: it is what makes "a second save in the same
 * session" safe (each attempt's own previousPath comes from that attempt's
 * own freshly-loaded state, never a value left over from an earlier one).
 */
export type MediaSlotOutcome =
  | { kind: "preserve" }
  | { kind: "replace"; newPath: string; previousPath: string | null }
  | { kind: "remove"; previousPath: string | null };

/**
 * Postgres error codes we can say something useful about, for a *definite*
 * update failure — an ambiguous error is reconciled instead of ever reaching
 * this function. Anything else gets a calm fallback; a raw PostgREST message
 * must never reach an athlete.
 *
 * Unlike describeInsertError, this never needs to inspect the raw message to
 * tell two unique constraints apart: `slug` is the only column this payload
 * writes that carries one — `owner_user_id` is never a settable column here
 * (see AthleteProfileUpdateRow) — so a 23505 can only ever mean the slug.
 */
export function describeUpdateError(code: string | undefined): UpdateProfileResult {
  if (code === "23505") {
    return {
      ok: false,
      field: "slug",
      message: "That username is already taken. Choose another.",
    };
  }

  // RLS rejected the write — should not be reachable from an authenticated
  // owner editing their own already-loaded row, but fail closed rather than
  // assume why.
  if (code === "42501") {
    return {
      ok: false,
      message: "You don't have permission to update this profile. Refresh the page and try again.",
    };
  }

  // A column check constraint failed (e.g. the recruiting status enum).
  if (code === "23514") {
    return { ok: false, message: "Something in your profile isn't valid. Review it and try again." };
  }

  return { ok: false, message: "Couldn't save your changes. Try again in a moment." };
}

/** Postgres codes that mean the update definitely did not commit. */
export function isDefiniteUpdateFailure(code: string | undefined): boolean {
  return code === "23505" || code === "23514" || code === "42501";
}

/**
 * `.update()` succeeding as a statement but matching zero rows must never be
 * read as the athlete's edit having taken effect. Kept as its own named
 * result (rather than inlined at the call site) so the "no row" case reads
 * as a deliberate, considered outcome wherever it is produced or tested.
 */
export function zeroRowUpdateResult(): UpdateProfileResult {
  return {
    ok: false,
    message: "Couldn't find your profile to update. Refresh the page and try again.",
  };
}

function highlightLinksMatch(
  a: { label: string; url: string }[],
  b: { label: string; url: string }[]
): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => row.label === b[i].label && row.url === b[i].url);
}

/**
 * Whether a reread (persisted) row matches the entire state an update
 * intended to write.
 *
 * Media paths are compared conditionally: `intended`'s own value decides
 * whether this attempt had an opinion at all. `undefined` means this
 * attempt's intent for that slot was "preserve" — it made no claim, so the
 * persisted value (whatever it already was, untouched by this attempt) is
 * accepted unconditionally. A concrete value (a path, or `null`) means this
 * attempt intended to *set* that column, so the persisted value must match
 * it exactly for the write to be considered confirmed. Framing
 * (`hero_photo_position_x/y`, `hero_photo_zoom`) is unconditional, like
 * every other ordinary profile field — 5C always writes it.
 */
export function updateRowsMatch(persisted: AthleteProfileUpdateRow, intended: AthleteProfileUpdateRow): boolean {
  return (
    persisted.slug === intended.slug &&
    persisted.first_name === intended.first_name &&
    persisted.last_name === intended.last_name &&
    persisted.sport === intended.sport &&
    persisted.position === intended.position &&
    persisted.class_year === intended.class_year &&
    persisted.school_or_team === intended.school_or_team &&
    persisted.city === intended.city &&
    persisted.state === intended.state &&
    persisted.height_in === intended.height_in &&
    persisted.weight_lb === intended.weight_lb &&
    persisted.bio === intended.bio &&
    persisted.hero_photo_position_x === intended.hero_photo_position_x &&
    persisted.hero_photo_position_y === intended.hero_photo_position_y &&
    persisted.hero_photo_zoom === intended.hero_photo_zoom &&
    highlightLinksMatch(persisted.highlight_links, intended.highlight_links) &&
    persisted.recruiting_status === intended.recruiting_status &&
    persisted.recruiting_contact === intended.recruiting_contact &&
    persisted.recruiting_notes === intended.recruiting_notes &&
    persisted.social_instagram === intended.social_instagram &&
    persisted.social_twitter === intended.social_twitter &&
    persisted.social_tiktok === intended.social_tiktok &&
    persisted.social_hudl === intended.social_hudl &&
    persisted.social_youtube === intended.social_youtube &&
    persisted.social_website === intended.social_website &&
    persisted.nil_open === intended.nil_open &&
    persisted.nil_contact === intended.nil_contact &&
    persisted.nil_interests === intended.nil_interests &&
    persisted.is_published === intended.is_published &&
    (intended.hero_photo_path === undefined || persisted.hero_photo_path === intended.hero_photo_path) &&
    (intended.profile_photo_path === undefined || persisted.profile_photo_path === intended.profile_photo_path)
  );
}

/**
 * The old (pre-attempt) path for every slot this attempt actually changed
 * (replaced or removed) — the only paths ever eligible for cleanup, and
 * only once the caller has confirmed (immediately or via reconciliation)
 * that the change committed. A "preserve" slot never contributes anything
 * here, and there's nothing to clean up for a slot whose previous path was
 * already null.
 */
export function oldPathsEligibleForCleanup(hero: MediaSlotOutcome, profileSlot: MediaSlotOutcome): string[] {
  const paths: string[] = [];
  if (hero.kind !== "preserve" && hero.previousPath) paths.push(hero.previousPath);
  if (profileSlot.kind !== "preserve" && profileSlot.previousPath) paths.push(profileSlot.previousPath);
  return paths;
}

/**
 * Every path left in limbo by an update whose outcome could not be
 * confirmed: the old path for a changed slot (might still be live, if the
 * write never actually committed) and the newly uploaded path for a
 * "replace" (might now be live, if it did). Neither is ever deleted while
 * unresolved — this is purely what gets reported/logged.
 */
function orphanPathsForUnresolvedMedia(hero: MediaSlotOutcome, profileSlot: MediaSlotOutcome): string[] {
  const paths: string[] = [];
  for (const slot of [hero, profileSlot]) {
    if (slot.kind === "replace") {
      paths.push(slot.newPath);
      if (slot.previousPath) paths.push(slot.previousPath);
    } else if (slot.kind === "remove" && slot.previousPath) {
      paths.push(slot.previousPath);
    }
  }
  return paths;
}

/** Every newly uploaded replacement path this attempt made — nothing else. */
function newPathsFromReplace(hero: MediaSlotOutcome, profileSlot: MediaSlotOutcome): string[] {
  const paths: string[] = [];
  if (hero.kind === "replace") paths.push(hero.newPath);
  if (profileSlot.kind === "replace") paths.push(profileSlot.newPath);
  return paths;
}

function unresolvedUpdateResult(orphanPaths: string[]): UpdateProfileResult {
  return {
    ok: false,
    message:
      "Couldn't confirm whether your changes saved. Refresh the page in a moment, and contact support if they still haven't appeared.",
    ...(orphanPaths.length > 0 ? { orphanPaths } : {}),
  };
}

/**
 * What to conclude once the DB write is known, with certainty, to have
 * committed exactly as intended — no reconciliation needed, because nothing
 * about this outcome was ever ambiguous. The old path for any changed slot
 * becomes eligible for cleanup; there is nothing to reconcile.
 */
export function decideAfterConfirmedUpdateSuccess(
  slug: string,
  hero: MediaSlotOutcome = { kind: "preserve" },
  profileSlot: MediaSlotOutcome = { kind: "preserve" }
): { deletePaths: string[]; result: UpdateProfileResult } {
  return {
    deletePaths: oldPathsEligibleForCleanup(hero, profileSlot),
    result: { ok: true, slug },
  };
}

/**
 * What to do once the update's outcome is known to be a DEFINITE failure
 * (see isDefiniteUpdateFailure) or a confirmed zero-row match: the row is
 * guaranteed not to carry this attempt's intended changes, so any
 * replacement this attempt uploaded is guaranteed not live and safe to
 * clean up unconditionally. The old object is never touched here — nothing
 * about it changed.
 */
export function decideAfterDefiniteUpdateFailure(
  errorResult: UpdateProfileResult,
  hero: MediaSlotOutcome = { kind: "preserve" },
  profileSlot: MediaSlotOutcome = { kind: "preserve" }
): { deletePaths: string[]; result: UpdateProfileResult } {
  return { deletePaths: newPathsFromReplace(hero, profileSlot), result: errorResult };
}

/**
 * What to conclude after an AMBIGUOUS update outcome, once reconciliation
 * has queried the owner's current row.
 *
 * - A row is found and it matches the entire intended update state, field by
 *   field (including media paths where this attempt expressed an opinion,
 *   and framing unconditionally): the apparent failure was, e.g., a lost
 *   response — recover as the success it actually was, and the old path for
 *   any changed slot is now safe to clean up.
 * - A row is found but differs in any field: do not guess whether that
 *   difference means this update partially applied, did not apply, or was
 *   overtaken by something else. Unresolved — neither the old nor any newly
 *   uploaded replacement is deleted; both are reported.
 * - No row is visible, or the reconciliation query itself failed: also
 *   unresolved, for the same reason.
 *
 * `hero`/`profileSlot` default to "preserve" so every existing 5B call site
 * — which never had media to reason about — is unaffected.
 */
export function decideAfterAmbiguousUpdate(
  reconciliation: UpdateReconciliationOutcome,
  intended: AthleteProfileUpdateRow,
  hero: MediaSlotOutcome = { kind: "preserve" },
  profileSlot: MediaSlotOutcome = { kind: "preserve" }
): { deletePaths: string[]; result: UpdateProfileResult } {
  if (reconciliation.status !== "found") {
    return { deletePaths: [], result: unresolvedUpdateResult(orphanPathsForUnresolvedMedia(hero, profileSlot)) };
  }

  if (updateRowsMatch(reconciliation.row, intended)) {
    return decideAfterConfirmedUpdateSuccess(intended.slug, hero, profileSlot);
  }

  return { deletePaths: [], result: unresolvedUpdateResult(orphanPathsForUnresolvedMedia(hero, profileSlot)) };
}

/**
 * Folds a best-effort old-media cleanup attempt into an already-successful
 * result. Never turns a success into a failure and never rolls back the
 * (already committed) DB state — a failed cleanup only ever adds an
 * athlete-safe caveat message. Never touches an `ok:false` result: there is
 * nothing to add a cleanup warning to on a failed save.
 */
export function withCleanupWarning(result: UpdateProfileResult, cleanup: DeleteOutcome): UpdateProfileResult {
  if (cleanup.ok || !result.ok) return result;
  return {
    ...result,
    mediaCleanupWarning:
      "Your changes saved, but we couldn't confirm your previous photo was fully removed from storage.",
  };
}

/**
 * Folds a failed cleanup-of-a-doomed-replacement attempt into an already
 * failed (definite-failure/zero-row) result, exactly like
 * profile-save-decisions.ts's mergeCleanupOutcome — a separate, small
 * function rather than a shared one, since UpdateProfileResult and
 * SaveProfileResult are deliberately distinct types with different `ok:true`
 * shapes. Never touches an `ok:true` result.
 */
export function withOrphanPaths(result: UpdateProfileResult, cleanup: DeleteOutcome): UpdateProfileResult {
  if (cleanup.ok || result.ok) return result;
  return { ...result, orphanPaths: cleanup.failedPaths };
}
