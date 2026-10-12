/**
 * Phase 1b's restrictive Storage expression only. Passing this condition does
 * not grant access: an applicable permissive policy must also authorize the row.
 */
export function mediaRetentionGateAllows(caller, bucketId = "athlete-media") {
  return (bucketId != null && bucketId !== "athlete-media") ||
    participationAllowsRetention(caller);
}

/**
 * Phase 1b authorization model — a pure-JS mirror of what the Phase 1b policies
 * decide, in the same spirit as computeCensusCoverage mirroring the census SQL.
 *
 * ── WHAT THIS PROVES, AND WHAT IT DOES NOT ──────────────────────────────────────
 *
 * There is no local Postgres in this environment (no `supabase` CLI stack, no
 * Docker), so the real RLS evaluation cannot be executed as part of `npm test`.
 * This module therefore proves that the authorization DECISION LOGIC is correct for
 * every case the Phase 1b checkpoint names. It proves nothing about whether
 * PostgreSQL actually enforces it — that is established by three other things:
 *
 *   1. the byte-pinned digest of the migration in scripts/sql-contract.mjs,
 *   2. the structural contract in scripts/phase1b-policy-contract.mjs, which
 *      asserts the real migration still contains these exact gates, and
 *   3. the founder-run live acceptance matrix, which is the only layer that
 *      exercises a real Postgres with real tokens.
 *
 * Keeping the model and the SQL in lockstep is the job of (2): if the migration
 * stops matching this model's assumptions, the structural contract fails.
 *
 * ── THE CALLER SHAPE ────────────────────────────────────────────────────────────
 *
 * `caller` describes what the DATABASE can see at write time, not what a token
 * asserts — which is the whole point of gating on live state:
 *
 *   { uid, authUserExists, row: { bracket, status } | null }
 *
 *   uid            — auth.uid(), or null/undefined when unauthenticated
 *   authUserExists — whether that uid still exists in auth.users. False models a
 *                    stale-but-unexpired JWT held by a deleted Auth user.
 *   row            — the owner's athlete_participation row, or null when absent
 */

/**
 * Mirrors public.participation_allows_retention().
 * Retention is status='approved' for EITHER bracket — an approved minor may retain.
 */
export function participationAllowsRetention(caller) {
  if (!caller || !caller.uid) return false;
  if (!caller.authUserExists) return false;
  if (!caller.row) return false;
  return caller.row.status === "approved";
}

/**
 * Mirrors public.participation_allows_publication().
 * Strictly narrower than retention: bracket='adult' AND status='approved'. An
 * approved minor returns false, which IS the interim minor-publication restriction.
 */
export function participationAllowsPublication(caller) {
  if (!caller || !caller.uid) return false;
  if (!caller.authUserExists) return false;
  if (!caller.row) return false;
  return caller.row.bracket === "adult" && caller.row.status === "approved";
}

/**
 * Mirrors public.participation_status() — the owner-scoped read surface. Included
 * so the model can express "a recorded minor" without duplicating the enum.
 */
export function participationStatus(caller, now = new Date()) {
  if (!caller || !caller.uid || !caller.row) return "absent";
  const { bracket, status, expiresAt } = caller.row;
  if (bracket === "adult" && status === "approved") return "adult_approved";
  if (bracket === "minor" && status === "pending") {
    if (expiresAt && new Date(expiresAt) < now) return "expired";
    return "minor_pending";
  }
  if (bracket === "minor" && status === "approved") return "minor_approved";
  if (bracket === "minor" && status === "declined") return "minor_declined";
  if (status === "revoked") return "revoked";
  return "absent";
}

/**
 * Authorization for a write or read against public.athlete_profiles, as the
 * composition PostgreSQL actually performs: the PERMISSIVE owner-identity policies
 * from 20260825000001, ANDed with the Phase 1b RESTRICTIVE gates.
 *
 * `operation`      — 'select' | 'insert' | 'update' | 'delete'
 * `isOwnRow`       — whether (select auth.uid()) = owner_user_id for the target row
 * `newIsPublished` — the post-write value of is_published; ignored for select/delete
 *
 * Returns { allowed, reason } so a test can assert WHY, not merely that a denial
 * happened — a denial for the wrong reason is a different bug.
 */
export function authorizeProfile({ operation, caller, isOwnRow, newIsPublished }) {
  // PERMISSIVE layer. Every surviving policy on athlete_profiles is owner-scoped:
  // "Public can view published profiles" was dropped in 20260928000003, so there is
  // no anon path to this table at all (anon also holds no grant).
  if (!caller || !caller.uid) return { allowed: false, reason: "no_identity" };
  if (!isOwnRow) return { allowed: false, reason: "not_owner" };

  // SELECT and DELETE are deliberately UNGATED by Phase 1b, so a participation
  // problem never traps the owner's own data.
  if (operation === "select" || operation === "delete") {
    return { allowed: true, reason: "ungated_by_phase1b" };
  }

  if (operation !== "insert" && operation !== "update") {
    return { allowed: false, reason: "unknown_operation" };
  }

  // RESTRICTIVE layer 1 — retention gate.
  if (!participationAllowsRetention(caller)) {
    return { allowed: false, reason: "retention_denied" };
  }

  // RESTRICTIVE layer 2 — publication gate. Mirrors
  // `is_published is not true or participation_allows_publication()`, so leaving or
  // setting is_published false is never gated.
  if (newIsPublished === true && !participationAllowsPublication(caller)) {
    return { allowed: false, reason: "publication_denied" };
  }

  return { allowed: true, reason: "allowed" };
}

/**
 * Authorization against storage.objects for the athlete-media bucket, composing the
 * permissive policies from 20260825000002 and 20260928000002 with the Phase 1b
 * restrictive retention gates.
 *
 * `role`                      — 'anon' | 'authenticated'
 * `isOwnFolder`               — whether (storage.foldername(name))[1] = auth.uid()::text
 * `isPubliclyReferencedHero`  — whether public.is_publicly_referenced_media(name) is true
 * `bucketId`                  — all current permissive policies require 'athlete-media';
 *                               the restrictive gate alone passes other buckets
 */
export function authorizeMedia({
  operation,
  caller,
  role,
  isOwnFolder,
  isPubliclyReferencedHero = false,
  bucketId = "athlete-media",
}) {
  // Both layers matter: permissive policies grant access only to athlete-media;
  // the Phase 1b restrictive gate does not itself grant access to other buckets.
  const inScope = bucketId === "athlete-media";

  if (operation === "select") {
    // Permissive: "Read own media or publicly referenced hero" — anon AND
    // authenticated, own folder OR the currently referenced published hero.
    // Phase 1b adds NO select gate, so public read behaviour is unchanged.
    if (!inScope) return { allowed: false, reason: "other_bucket_no_policy" };
    if (isOwnFolder && caller && caller.uid) {
      return { allowed: true, reason: "own_folder" };
    }
    if (isPubliclyReferencedHero) {
      return { allowed: true, reason: "publicly_referenced_hero" };
    }
    return { allowed: false, reason: "not_readable" };
  }

  // Every write policy on storage.objects is `to authenticated` and owner-scoped.
  if (role !== "authenticated") return { allowed: false, reason: "not_authenticated" };
  if (!caller || !caller.uid) return { allowed: false, reason: "no_identity" };
  if (!inScope) return { allowed: false, reason: "other_bucket_no_policy" };
  if (!isOwnFolder) return { allowed: false, reason: "not_owner" };

  // DELETE is deliberately UNGATED, same reasoning as athlete_profiles: an owner
  // must always be able to remove their own media.
  if (operation === "delete") {
    return { allowed: true, reason: "ungated_by_phase1b" };
  }

  if (operation !== "insert" && operation !== "update") {
    return { allowed: false, reason: "unknown_operation" };
  }

  // Restrictive layer, ANDed with the bucket/owner permissive layer above.
  if (!mediaRetentionGateAllows(caller, bucketId)) {
    return { allowed: false, reason: "retention_denied" };
  }

  return { allowed: true, reason: "allowed" };
}

/**
 * Mirrors public.unpublish_own_profile(). SECURITY DEFINER and owned by `postgres`,
 * so it bypasses RLS entirely and is unaffected by every Phase 1b policy. It needs
 * only a live Auth identity — no participation state of any kind.
 */
export function authorizeUnpublishOwnProfile(caller) {
  if (!caller || !caller.uid) return { allowed: false, reason: "no_identity" };
  if (!caller.authUserExists) return { allowed: false, reason: "auth_user_absent" };
  return { allowed: true, reason: "ungated_by_participation" };
}

/** Convenience fixtures for the states this phase cares about. */
export const CALLERS = {
  adultApproved: { uid: "u-adult", authUserExists: true, row: { bracket: "adult", status: "approved" } },
  minorApproved: { uid: "u-minor-ok", authUserExists: true, row: { bracket: "minor", status: "approved" } },
  minorPending: { uid: "u-minor-p", authUserExists: true, row: { bracket: "minor", status: "pending" } },
  minorDeclined: { uid: "u-minor-d", authUserExists: true, row: { bracket: "minor", status: "declined" } },
  revoked: { uid: "u-revoked", authUserExists: true, row: { bracket: "minor", status: "revoked" } },
  noRow: { uid: "u-norow", authUserExists: true, row: null },
  // A stale-but-unexpired JWT whose Auth user has since been deleted.
  staleToken: { uid: "u-deleted", authUserExists: false, row: { bracket: "adult", status: "approved" } },
  anonymous: { uid: null, authUserExists: false, row: null },
};
