import type { MediaPathUpdate } from "@/lib/db-mappers";

/**
 * Pure decision logic for createProfile's fail-closed / rollback branching in
 * profile-save.ts and the upload classification media-storage.ts's
 * uploadPhoto delegates to, factored out on purpose: every function here is a
 * plain data transformation with no I/O of its own, so each branch can be
 * verified directly — construct the inputs a scenario would produce, check
 * the output — without a live Supabase project, network mocking, or the
 * module-alias resolution a full integration test would need.
 *
 * The only import here is `import type`, erased entirely at compile time, so
 * this module has zero runtime dependencies and can be loaded in isolation
 * (see profile-save-decisions.test.ts, run via `node --test`).
 *
 * Three outcome categories recur throughout this file, for both the insert
 * and the upload:
 *
 * - **definite** — known with certainty not to have taken effect. For an
 *   insert: Postgres returned a recognized rejection code (23505, 23514,
 *   42501) — the database processed and refused the statement atomically.
 *   For an upload: a client-side validation/processing failure, or path
 *   generation itself throwing — every one of these happens *before* any
 *   network attempt begins, so nothing was ever sent. A *returned* Storage
 *   error is deliberately **not** in this category for an upload, even a
 *   "clean" HTTP response: the installed SDK constructs the same error class
 *   for any non-2xx status, including a 502/503/504 from a gateway that
 *   cannot itself know whether the origin completed the write. Nothing in
 *   the SDK's source proves otherwise for any status this project has found
 *   — see media-storage.ts's uploadPhoto docblock for the investigation.
 *   Nothing needs reconciling or preserving only for the pre-network case.
 * - **ambiguous** — the outcome cannot be read from the response, because
 *   there was no *trustworthy* response: either no response at all (a
 *   thrown exception — network failure, timeout, connection reset) or a
 *   response whose semantics do not rule out the write having completed
 *   anyway. The operation may have completed on the server despite the
 *   client never learning that, or never being able to trust what it
 *   learned. An ambiguous insert triggers reconciliation; an ambiguous
 *   upload preserves its exact destination path rather than losing the only
 *   identifier for bytes that may now exist under it.
 * - **unresolved** — the final classification once no further evidence is
 *   available to settle an ambiguous outcome. Reached when reconciliation's
 *   own query fails, or finds no row (not proof of absence — a still-
 *   completing write on a different connection is not guaranteed visible to
 *   this read), or finds a row with insufficient evidence to prove or
 *   disprove it is this attempt's (see classifyCommittedRow). Unresolved
 *   paths are never deleted and are always reported, in the returned result
 *   and in the diagnostic log — see unresolvedPathsToLog.
 */

export type OwnershipStatus = { status: "exists" } | { status: "none" } | { status: "unknown" };

export type SaveProfileResult =
  | { ok: true; slug: string }
  | {
      ok: false;
      message: string;
      field?: "slug";
      /**
       * Present when this create attempt has media whose fate is not fully
       * resolved: cleanup was attempted and failed, or cleanup was
       * deliberately not attempted because the path might still be
       * referenced by a row that has not finished committing. Diagnostic
       * only — never rendered to the athlete verbatim; profile-save.ts logs
       * it, since this project has no server-side error reporting yet.
       */
      orphanPaths?: string[];
    };

export type DeleteOutcome = { ok: true } | { ok: false; failedPaths: string[]; message: string };

/**
 * What the reconciliation read actually observed, not what it proves. In
 * particular, "not-visible" is an observation ("this read found no row"),
 * not a conclusion ("no row was written") — see decideAfterAmbiguousInsert.
 */
export type ReconciliationOutcome =
  | {
      status: "found";
      row: { slug: string; heroPhotoPath: string | null; profilePhotoPath: string | null };
    }
  | { status: "not-visible" }
  | { status: "query-failed" };

export type UploadOutcome =
  | { kind: "success"; path: string }
  | { kind: "definite-failure"; message: string }
  | { kind: "ambiguous"; attemptedPath: string; message: string };

/**
 * Postgres error codes we can say something useful about, for a *definite*
 * insert failure (see isDefiniteInsertFailure) — an ambiguous error is
 * reconciled instead of ever reaching this function. Anything else gets a
 * calm fallback; a raw PostgREST message must never reach an athlete.
 */
export function describeInsertError(code: string | undefined, message: string): SaveProfileResult {
  // Unique violation. Two unique constraints exist on this table, so decide
  // which one from the constraint name in the message.
  if (code === "23505") {
    if (message.includes("slug")) {
      return {
        ok: false,
        field: "slug",
        message: "That username is already taken. Go back and choose another.",
      };
    }
    // The owner_user_id constraint, not slug: this athlete already has a
    // row. Reachable for real despite the ownership preflight — that check
    // is advisory against races, and this constraint is what actually
    // enforces the guarantee when one occurs.
    return {
      ok: false,
      message: "You already have a profile. Refresh the page and try again.",
    };
  }

  // RLS rejected the write — no session, or owner_user_id did not match auth.uid().
  if (code === "42501") {
    return { ok: false, message: "You need to be signed in to save your Athlesite." };
  }

  // A column check constraint failed (hero zoom range, recruiting status enum).
  if (code === "23514") {
    return { ok: false, message: "Something in your profile isn't valid. Go back and review it." };
  }

  return { ok: false, message: "Couldn't save your Athlesite. Try again in a moment." };
}

/**
 * Whether onboarding may proceed to upload media / attempt creation, given
 * the ownership preflight's outcome. Fail-closed: only a confirmed "none"
 * allows creation — an existing owner is redirected instead of reaching
 * Save, and a lookup failure blocks creation rather than assuming absence.
 */
export function decideOwnershipGate(
  status: OwnershipStatus
): { proceed: true } | { proceed: false; result: SaveProfileResult } {
  if (status.status === "exists") {
    return {
      proceed: false,
      result: { ok: false, message: "You already have a profile. Refresh the page and try again." },
    };
  }
  if (status.status === "unknown") {
    return {
      proceed: false,
      result: { ok: false, message: "Couldn't confirm your account status. Try again in a moment." },
    };
  }
  return { proceed: true };
}

/**
 * Classifies one upload attempt once its destination path is known and the
 * network call has resolved or thrown.
 *
 * There is no "definite failure" branch here. Investigation of the installed
 * `@supabase/storage-js` SDK (see media-storage.ts's own docblock on
 * uploadPhoto) found no returned error — of any class, for any HTTP status —
 * whose documented or source-defined semantics prove the object was not
 * created. The SDK's own type system distinguishes only "a response was
 * received" from "no response was received"; it makes no claim about
 * whether the Storage backend committed the write in either case. Absent
 * that proof, every network-layer outcome other than a clean success is
 * ambiguous: the path is preserved as `attemptedPath` rather than
 * discarded, because the bytes may have reached Storage even though this
 * client never received — or could not trust — a confirming response.
 *
 * A `definite-failure` UploadOutcome is still a real, reachable value — see
 * `UploadOutcome`'s type — but only from a client-side check that runs
 * strictly *before* this function is ever called (validation, image
 * processing, path generation itself throwing): failures where nothing was
 * ever sent over the network, so there is nothing to preserve or reconcile.
 * media-storage.ts constructs those directly; this function only ever
 * decides between the two outcomes possible once a network attempt has
 * actually been made.
 */
export function classifyUploadAttempt(
  path: string,
  outcomeUnproven: boolean,
  ambiguousMessage: string
): UploadOutcome {
  if (outcomeUnproven) {
    return { kind: "ambiguous", attemptedPath: path, message: ambiguousMessage };
  }
  return { kind: "success", path };
}

/**
 * What to clean up given every path this create attempt is aware of —
 * confirmed successful uploads and any upload whose outcome was ambiguous —
 * once the attempt cannot proceed. Pre-insert, nothing generated this
 * attempt can ever be referenced by a row (no insert has been attempted
 * yet), so cleanup of everything gathered so far, ambiguous or not, is
 * always safe to *attempt* — deleteObjects' own confirmation determines
 * what actually gets reported as removed.
 */
export function decideAfterUploadFailure(
  attemptedPaths: string[],
  uploadErrorMessage: string
): { deletePaths: string[]; result: SaveProfileResult } {
  return {
    deletePaths: attemptedPaths,
    result: { ok: false, message: uploadErrorMessage },
  };
}

/** Postgres codes that mean the insert definitely did not commit. */
export function isDefiniteInsertFailure(code: string | undefined): boolean {
  return code === "23505" || code === "23514" || code === "42501";
}

export type AttemptIdentity = "confirmed-ours" | "confirmed-not-ours" | "indeterminate";

/**
 * Whether an already-committed row is the one THIS attempt's insert created.
 *
 * Requires at least one attempt-specific UUID media path to positively match
 * before media-path identity can prove anything — object paths are random
 * per upload, so a match is effectively proof, but only when there is
 * something to match. If this attempt uploaded no media at all, there is no
 * UUID evidence either way: a later row with null/null media proves nothing,
 * since that is equally consistent with this attempt's insert, a different
 * attempt's insert, or a retried request — "indeterminate", not a match.
 *
 * When this attempt did upload at least one photo, every slot it uploaded to
 * must match exactly, and every slot it did not upload to must be null on
 * the committed row (what a fresh insert with that column omitted produces).
 * Any deviation means a different write produced this row.
 */
export function classifyCommittedRow(
  committed: { heroPhotoPath: string | null; profilePhotoPath: string | null },
  media: MediaPathUpdate
): AttemptIdentity {
  const uploadedThisAttempt = media.heroPhotoPath !== undefined || media.profilePhotoPath !== undefined;
  if (!uploadedThisAttempt) {
    return "indeterminate";
  }

  const heroMatches =
    media.heroPhotoPath === undefined
      ? committed.heroPhotoPath === null
      : committed.heroPhotoPath === media.heroPhotoPath;
  const profileMatches =
    media.profilePhotoPath === undefined
      ? committed.profilePhotoPath === null
      : committed.profilePhotoPath === media.profilePhotoPath;

  return heroMatches && profileMatches ? "confirmed-ours" : "confirmed-not-ours";
}

/**
 * What to do once the insert's outcome is known to be a DEFINITE failure
 * (see isDefiniteInsertFailure) — the row is guaranteed not written, so
 * cleanup of everything uploaded this attempt is unconditional. No
 * reconciliation is needed: there is nothing ambiguous about a rejected
 * insert.
 */
export function decideAfterDefiniteFailure(
  uploadedPaths: string[],
  errorResult: SaveProfileResult
): { deletePaths: string[]; result: SaveProfileResult } {
  return { deletePaths: uploadedPaths, result: errorResult };
}

function unresolvedInsertResult(uploadedPaths: string[]): SaveProfileResult {
  return {
    ok: false,
    message:
      "Couldn't confirm whether your Athlesite saved. Refresh the page in a moment, and contact support if it still hasn't appeared.",
    orphanPaths: uploadedPaths,
  };
}

/**
 * What to do after an AMBIGUOUS insert outcome — a thrown exception, a
 * timeout, an error code that is not a recognized definite failure — once
 * reconciliation has queried the owner's current row.
 *
 * - A row is found and its media identifies it as this attempt's own
 *   (classifyCommittedRow): the apparent failure was, e.g., a lost response
 *   — recover as the success it actually was. Nothing is deleted.
 * - A row is found but identifies as a different write's: only one row can
 *   ever exist per owner_user_id, so that row's existence proves this
 *   attempt's insert did not, and now cannot, commit. Cleanup of this
 *   attempt's own uploads is safe.
 * - A row is found but there is not enough evidence either way (this
 *   attempt uploaded no media): unresolved. Do not guess.
 * - No row is visible, or the reconciliation query itself failed: unresolved
 *   — an empty read is an observation, not proof of absence, since a write
 *   still completing on a different connection is not guaranteed visible to
 *   this one. Nothing is deleted; the paths are reported, not hidden.
 */
export function decideAfterAmbiguousInsert(
  reconciliation: ReconciliationOutcome,
  uploadedPaths: string[],
  media: MediaPathUpdate
): { deletePaths: string[]; result: SaveProfileResult } {
  if (reconciliation.status !== "found") {
    // "not-visible" or "query-failed" — both are an absence of evidence, not
    // evidence of absence.
    return { deletePaths: [], result: unresolvedInsertResult(uploadedPaths) };
  }

  const identity = classifyCommittedRow(reconciliation.row, media);

  if (identity === "confirmed-ours") {
    return { deletePaths: [], result: { ok: true, slug: reconciliation.row.slug } };
  }

  if (identity === "confirmed-not-ours") {
    return {
      deletePaths: uploadedPaths,
      result: { ok: false, message: "Couldn't reach Athlesite. Check your connection and try again." },
    };
  }

  // "indeterminate": a row exists, but this attempt has no UUID evidence to
  // either claim or rule it out.
  return { deletePaths: [], result: unresolvedInsertResult(uploadedPaths) };
}

/**
 * Whether a create attempt's own result already carries unresolved orphan
 * paths worth logging, even when no deletion was ever attempted for them
 * (the unresolved case above deliberately sets deletePaths to []). An
 * unresolved orphan is exactly as real a leak as a failed deletion, and must
 * not go unlogged just because cleanup was never attempted for it. Returns
 * the paths to log, or null when there is nothing to report.
 */
export function unresolvedPathsToLog(result: SaveProfileResult): string[] | null {
  if (result.ok) return null;
  if (!result.orphanPaths || result.orphanPaths.length === 0) return null;
  return result.orphanPaths;
}

/**
 * Folds a Storage cleanup attempt's outcome into the result that will be
 * returned to the caller. A cleanup failure is never hidden — the returned
 * result names exactly which paths could not be confirmed removed, rather
 * than claiming a rollback succeeded when it did not. Never touches an
 * ok:true result: there is nothing to report cleanup for on a success, since
 * a success by construction has no path in the cleanup list (see
 * decideAfterAmbiguousInsert's confirmed-ours branch).
 */
export function mergeCleanupOutcome(result: SaveProfileResult, cleanup: DeleteOutcome): SaveProfileResult {
  if (cleanup.ok || result.ok) return result;
  return { ...result, orphanPaths: cleanup.failedPaths };
}

/** Removes empty strings and duplicates from a delete request, preserving first-seen order. */
export function normalizeDeletePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    if (path.length === 0 || seen.has(path)) continue;
    seen.add(path);
    result.push(path);
  }
  return result;
}

/**
 * Given the (already deduplicated) paths a deletion was requested for, and
 * the names Storage's own response actually confirmed removed, decides
 * whether the deletion as a whole may be reported as successful.
 *
 * `{ ok: true }` requires every requested path to be individually confirmed.
 * Empty confirmed data, partial confirmed data, and a path that is simply
 * absent from the response are all treated identically: not confirmed,
 * therefore reported as failed. None of those are read as "must already be
 * gone" — Storage's response is the only evidence trusted here.
 */
export function confirmDeletions(targets: string[], confirmedNames: string[]): DeleteOutcome {
  const confirmed = new Set(confirmedNames);
  const failedPaths = targets.filter((path) => !confirmed.has(path));

  if (failedPaths.length > 0) {
    return {
      ok: false,
      failedPaths,
      message:
        failedPaths.length === targets.length
          ? "Storage did not confirm any of the requested objects were removed."
          : "Storage did not confirm all of the requested objects were removed.",
    };
  }

  return { ok: true };
}
