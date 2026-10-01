/**
 * Identity binding and path containment for founder-assisted account deletion.
 *
 * ── WHY IDENTITY IS BOUND, NOT LOOKED UP ─────────────────────────────────────────
 *
 * A deletion operation targets exactly one thing: an **environment fingerprint plus a
 * verified Auth UID**. That pair is decided once, at bind time, and never re-derived.
 *
 * Slug is informational only. It is deliberately NOT part of the target, because slugs are
 * mutable and reusable: an athlete may change their slug mid-operation, and a slug freed by
 * one athlete can later belong to a different UID. Re-resolving by slug on a retry could
 * therefore point the operation at an innocent athlete's data. The profile row id is kept
 * as *supporting* evidence — useful for detecting that the row changed underneath us, never
 * used to decide who the target is.
 *
 * Everything here is pure. No network, no filesystem, no credentials.
 */
import { createHash } from "node:crypto";

/** Refusal codes. Every hard stop maps to exactly one of these. */
export const REFUSAL = {
  ENVIRONMENT_MISMATCH: "ENVIRONMENT_MISMATCH",
  UID_MISMATCH: "UID_MISMATCH",
  UID_MISSING: "UID_MISSING",
  AUTH_VALIDATION_FAILED: "AUTH_VALIDATION_FAILED",
  PROFILE_ROW_UNEXPECTED: "PROFILE_ROW_UNEXPECTED",
  IDENTITY_EVIDENCE_CONFLICT: "IDENTITY_EVIDENCE_CONFLICT",
  FOREIGN_PATH: "FOREIGN_PATH",
  AMBIGUOUS_PATH: "AMBIGUOUS_PATH",
  INVENTORY_CORRUPT: "INVENTORY_CORRUPT",
  ENUMERATION_INCOMPLETE: "ENUMERATION_INCOMPLETE",
  ABSENCE_UNPROVEN: "ABSENCE_UNPROVEN",
  CONCURRENT_ACTIVITY: "CONCURRENT_ACTIVITY",
  TRANSITION_NOT_ELIGIBLE: "TRANSITION_NOT_ELIGIBLE",
  LOCK_HELD: "LOCK_HELD",
  PERSISTENCE_FAILED: "PERSISTENCE_FAILED",
  QUIET_WINDOW_NOT_CONFIRMED: "QUIET_WINDOW_NOT_CONFIRMED",
  CONFIRMATION_MISMATCH: "CONFIRMATION_MISMATCH",
  UNPUBLISH_FAILED: "UNPUBLISH_FAILED",
  STILL_PUBLIC: "STILL_PUBLIC",
  PUBLIC_STATE_UNKNOWN: "PUBLIC_STATE_UNKNOWN",
};

/**
 * A non-secret, stable fingerprint for the target environment.
 *
 * A hash rather than the URL itself: the inventory file lives outside the repo but is still
 * written to disk, and there is no reason for it to carry a project reference. Truncated
 * because its only job is to distinguish one environment from another, not to be reversible.
 */
export function environmentFingerprint(supabaseUrl) {
  if (typeof supabaseUrl !== "string" || supabaseUrl.trim() === "") return null;
  return createHash("sha256").update(supabaseUrl.trim()).digest("hex").slice(0, 16);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Binds an operation to environment + verified UID. Returns `{ binding }` or `{ refusal }`. */
export function bindOperation({ environment, uid, profileRowId = null, operationId, requestedSlug = null }) {
  if (typeof environment !== "string" || environment === "") {
    return { refusal: REFUSAL.ENVIRONMENT_MISMATCH, detail: "no environment fingerprint" };
  }
  if (typeof uid !== "string" || !UUID_RE.test(uid)) {
    return { refusal: REFUSAL.UID_MISSING, detail: "uid absent or not a uuid" };
  }
  if (profileRowId !== null && (typeof profileRowId !== "string" || !UUID_RE.test(profileRowId))) {
    return { refusal: REFUSAL.PROFILE_ROW_UNEXPECTED, detail: "profile row id present but malformed" };
  }
  if (typeof operationId !== "string" || operationId.length < 8) {
    return { refusal: REFUSAL.IDENTITY_EVIDENCE_CONFLICT, detail: "missing operation id" };
  }
  return {
    binding: {
      environment,
      uid,
      profileRowId,
      operationId,
      // Recorded for the audit trail only. Never used to resolve the target.
      requestedSlugAtBindTime: requestedSlug,
    },
  };
}

/**
 * Re-validates a binding against freshly observed facts. Called before EVERY destructive
 * step, including on resume — a stored checkpoint never excuses skipping this.
 *
 * `observed.profileRowId` may be `null` legitimately (the row is already gone). It is a
 * conflict only when a row exists whose id differs from the bound one, or when a row appears
 * that was never bound.
 */
export function validateBinding(binding, observed) {
  if (!binding || typeof binding !== "object") {
    return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, detail: "no binding" };
  }
  if (!observed || typeof observed !== "object") {
    return { ok: false, refusal: REFUSAL.AUTH_VALIDATION_FAILED, detail: "no observation" };
  }
  if (observed.authValidated !== true) {
    return { ok: false, refusal: REFUSAL.AUTH_VALIDATION_FAILED, detail: "auth not positively validated" };
  }
  if (observed.environment !== binding.environment) {
    return { ok: false, refusal: REFUSAL.ENVIRONMENT_MISMATCH };
  }
  if (observed.uid !== binding.uid) {
    return { ok: false, refusal: REFUSAL.UID_MISMATCH };
  }
  if (
    observed.profileRowId != null &&
    binding.profileRowId != null &&
    observed.profileRowId !== binding.profileRowId
  ) {
    return { ok: false, refusal: REFUSAL.PROFILE_ROW_UNEXPECTED };
  }
  // A row appearing with an id we never bound is concurrent activity, not a match.
  if (observed.profileRowId != null && binding.profileRowId == null) {
    return { ok: false, refusal: REFUSAL.CONCURRENT_ACTIVITY, detail: "profile row appeared after binding" };
  }
  return { ok: true };
}

/**
 * Whether `key` is *exactly* inside the owner's namespace.
 *
 * Deliberately NOT `key.startsWith(uid)`: that would accept `"<uid>2/hero/x.png"`, a
 * different athlete's folder that merely shares a prefix. Ownership is decided by exact
 * equality of the **first path segment**.
 *
 * Also rejects anything structurally ambiguous — traversal segments, empty segments,
 * backslashes, leading slashes, control characters — rather than trying to normalise them.
 * A path we cannot reason about confidently is never treated as owned.
 */
export function isExactlyOwnedPath(key, uid) {
  if (typeof key !== "string" || key === "") return false;
  if (typeof uid !== "string" || uid === "") return false;

  if (key.startsWith("/") || key.includes("\\")) return false;

  // Percent-encoded separators and traversal forms are refused OUTRIGHT, never decoded.
  // Decoding and re-normalising is how a path ends up meaning one thing to this check and
  // another to the storage backend; if an encoding could denote a separator or a dot
  // segment, the key is ambiguous and we simply do not act on it. `%25` is included because
  // it opens double-encoding (`%252f` -> `%2f` -> `/`).
  if (/%(?:2f|5c|2e|25)/i.test(key)) return false;
  // Control characters make a key impossible to reason about safely. Checked by char
  // code rather than a regex literal, so no control byte ever appears in this source.
  for (let i = 0; i < key.length; i += 1) {
    const c = key.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
  }

  const segments = key.split("/");
  if (segments.length < 2) return false; // must be at least `uid/something`
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") return false;
  }
  return segments[0] === uid;
}

/**
 * Re-validates every key an inventory carries, before it is ever used as a delete target.
 *
 * An inventory is a file on disk. It can be edited, corrupted, or carried over from another
 * operation, so its contents are treated as untrusted input on every load — RLS is the last
 * line of defence, not the tool's only one. Any key that is not exactly owned, or that names a
 * different bucket, is a hard refusal for the whole operation rather than a skipped entry.
 */
export function validateInventoryPaths(inventory, { uid, bucket = "athlete-media" } = {}) {
  const problems = [];
  if (!inventory || typeof inventory !== "object") {
    return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, problems: ["not an object"] };
  }
  if (inventory.bucket !== bucket) {
    return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, problems: [`bucket is not ${bucket}`] };
  }
  const targetUid = uid ?? inventory.uid;
  if (typeof targetUid !== "string" || targetUid === "") {
    return { ok: false, refusal: REFUSAL.UID_MISSING, problems: ["no uid to validate against"] };
  }
  if (inventory.uid !== targetUid) {
    return { ok: false, refusal: REFUSAL.UID_MISMATCH, problems: ["inventory uid differs from bound uid"] };
  }

  const keys = Object.keys(inventory.keyStates ?? {});
  const { foreign, ambiguous } = classifyPaths(keys, targetUid);
  if (foreign.length > 0) {
    problems.push(`${foreign.length} key(s) outside the owner namespace`);
    return { ok: false, refusal: REFUSAL.FOREIGN_PATH, problems };
  }
  if (ambiguous.length > 0) {
    problems.push(`${ambiguous.length} unparseable key(s)`);
    return { ok: false, refusal: REFUSAL.AMBIGUOUS_PATH, problems };
  }
  return { ok: true, keys };
}

/**
 * Gate applied immediately before each Storage DELETE batch.
 *
 * Every candidate is re-checked for ownership AND must appear in the fresh enumeration. A
 * path that is not currently observed is not deleted — it is either already gone (which the
 * post-delete scan will confirm) or it is not something this operation discovered.
 */
export function validateDeleteBatch(keys, { uid, observedKeys }) {
  const observed = new Set(Array.isArray(observedKeys) ? observedKeys : []);
  const rejected = [];
  const approved = [];
  for (const key of Array.isArray(keys) ? keys : []) {
    if (!isExactlyOwnedPath(key, uid)) {
      rejected.push({ key, reason: REFUSAL.FOREIGN_PATH });
      continue;
    }
    if (!observed.has(key)) {
      rejected.push({ key, reason: REFUSAL.ABSENCE_UNPROVEN });
      continue;
    }
    approved.push(key);
  }
  return { approved, rejected, ok: rejected.length === 0 };
}

/** Splits discovered keys into owned / foreign / ambiguous, for refusal reporting. */
export function classifyPaths(keys, uid) {
  const owned = [];
  const foreign = [];
  const ambiguous = [];
  for (const key of Array.isArray(keys) ? keys : []) {
    if (typeof key !== "string" || key === "") {
      ambiguous.push(key);
      continue;
    }
    if (isExactlyOwnedPath(key, uid)) {
      owned.push(key);
      continue;
    }
    const segments = key.split("/");
    // A well-formed path under a different first segment is foreign; anything whose
    // structure we could not parse confidently is ambiguous.
    const wellFormed =
      !key.startsWith("/") &&
      !key.includes("\\") &&
      segments.length >= 2 &&
      segments.every((s) => s !== "" && s !== "." && s !== "..");
    (wellFormed ? foreign : ambiguous).push(key);
  }
  return { owned, foreign, ambiguous };
}
