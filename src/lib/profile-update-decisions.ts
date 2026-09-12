import type { AthleteProfileUpdateRow } from "@/lib/db-mappers";

/**
 * Pure decision logic for updateProfile's branching in profile-save.ts,
 * factored out for the same reason profile-save-decisions.ts is: every
 * function here is a plain data transformation with no I/O of its own, so
 * each branch can be verified directly, without a live Supabase project.
 *
 * The only import here is `import type`, erased entirely at compile time, so
 * this module has zero runtime dependencies and can be loaded in isolation
 * (see profile-update-decisions.test.ts, run via `node --test`).
 *
 * updateProfile is structurally simpler than createProfile: it never touches
 * media, so there is no upload to roll back and no Storage cleanup to
 * attempt in any branch here. Its only real question, once the write itself
 * is attempted, is whether that write can be trusted:
 *
 * - **definite failure** — Postgres returned a recognized rejection code
 *   (23505 slug collision, 23514 a check constraint, 42501 RLS refused the
 *   write). The database processed and refused the statement atomically;
 *   nothing was written.
 * - **zero rows matched** — the `.update()` succeeded as a statement but
 *   matched no row for this owner. Must never be read as success: an
 *   `.update()` that touches nothing is not the athlete's edit taking
 *   effect. This is a fail-closed guard against a scenario that should not
 *   be reachable from a page that only ever renders this form once a row is
 *   already confirmed loaded — but "should not happen" is not "cannot
 *   happen", so it is a real, handled branch here.
 * - **ambiguous** — a thrown exception (network failure, timeout) or a
 *   response this client cannot trust. The update may have completed on the
 *   server despite the client never learning that. Resolved by reconciling
 *   against the owner's current row and comparing it, field by field,
 *   against the entire state this update intended to write.
 */

export type UpdateProfileResult =
  | { ok: true; slug: string }
  | { ok: false; message: string; field?: "slug" };

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
 * Whether a reread row matches the entire state an update intended to
 * write. Field-by-field, not a JSON string comparison, so the comparison
 * stays correct regardless of key order. Media columns are not part of
 * either side of this comparison by construction — `AthleteProfileUpdateRow`
 * has no media fields to compare (see db-mappers.ts).
 */
export function updateRowsMatch(a: AthleteProfileUpdateRow, b: AthleteProfileUpdateRow): boolean {
  return (
    a.slug === b.slug &&
    a.first_name === b.first_name &&
    a.last_name === b.last_name &&
    a.sport === b.sport &&
    a.position === b.position &&
    a.class_year === b.class_year &&
    a.school_or_team === b.school_or_team &&
    a.city === b.city &&
    a.state === b.state &&
    a.height_in === b.height_in &&
    a.weight_lb === b.weight_lb &&
    a.bio === b.bio &&
    highlightLinksMatch(a.highlight_links, b.highlight_links) &&
    a.recruiting_status === b.recruiting_status &&
    a.recruiting_contact === b.recruiting_contact &&
    a.recruiting_notes === b.recruiting_notes &&
    a.social_instagram === b.social_instagram &&
    a.social_twitter === b.social_twitter &&
    a.social_tiktok === b.social_tiktok &&
    a.social_hudl === b.social_hudl &&
    a.social_youtube === b.social_youtube &&
    a.social_website === b.social_website &&
    a.nil_open === b.nil_open &&
    a.nil_contact === b.nil_contact &&
    a.nil_interests === b.nil_interests &&
    a.is_published === b.is_published
  );
}

function unresolvedUpdateResult(): UpdateProfileResult {
  return {
    ok: false,
    message:
      "Couldn't confirm whether your changes saved. Refresh the page in a moment, and contact support if they still haven't appeared.",
  };
}

/**
 * What to conclude after an AMBIGUOUS update outcome, once reconciliation
 * has queried the owner's current row.
 *
 * - A row is found and it matches the entire intended update state, field by
 *   field: the apparent failure was, e.g., a lost response — recover as the
 *   success it actually was.
 * - A row is found but differs in any field: do not guess whether that
 *   difference means this update partially applied, did not apply, or was
 *   overtaken by something else. Unresolved.
 * - No row is visible, or the reconciliation query itself failed: also
 *   unresolved — an empty or failed read is an absence of evidence, not
 *   evidence the update failed.
 */
export function decideAfterAmbiguousUpdate(
  reconciliation: UpdateReconciliationOutcome,
  intended: AthleteProfileUpdateRow
): UpdateProfileResult {
  if (reconciliation.status !== "found") {
    return unresolvedUpdateResult();
  }

  if (updateRowsMatch(reconciliation.row, intended)) {
    return { ok: true, slug: intended.slug };
  }

  return unresolvedUpdateResult();
}
