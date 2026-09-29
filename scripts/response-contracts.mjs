/**
 * Pure response classifiers for the live access-boundary harness.
 *
 * Extracted so the two trickiest validations can be unit tested against synthetic
 * responses without touching a live project. Both were accepting shapes that should have
 * failed: an argument-rejection check that took any 4xx object including `{}`, and a
 * Storage-list check that took `id: ""` and `metadata: []` as a valid object record.
 *
 * Nothing here performs I/O or prints. Callers map the returned `reason` onto their own
 * diagnostic codes.
 */

/**
 * Statuses PostgREST may use when it refuses a malformed argument. 404 accompanies
 * PGRST202 ("no function matches these argument types"), 400 the parse/cast failures.
 */
export const ARGUMENT_REJECTION_STATUSES = [400, 404];

/**
 * Error codes that genuinely mean "this argument was rejected or could not be converted".
 *
 * Deliberately an allowlist rather than "any code": an unrelated 4xx — a privilege error
 * (`42501`), an expired JWT (`PGRST301`), a missing schema — would otherwise pass this
 * assertion while proving nothing about argument handling, which is the entire point of
 * the test.
 *
 *   PGRST202  no function matches the supplied argument types (HTTP 404)
 *   PGRST100  the request body/arguments could not be parsed (HTTP 400)
 *   22P02     Postgres invalid_text_representation — the value would not cast (HTTP 400)
 *
 * The installed @supabase/postgrest-js documents `code` as the stable field and says to
 * "branch on this rather than on `message` text", which is why no message, details, or
 * hint text is asserted anywhere here.
 *
 * NOT YET OBSERVED LIVE. After the first acceptance run, narrow this to the single code
 * the deployed PostgREST actually returns for this input.
 */
export const ARGUMENT_REJECTION_CODES = new Set(["PGRST202", "PGRST100", "22P02"]);

/** Reasons a classifier can return. Callers map these to their own diagnostic codes. */
export const REASON = {
  OK: "OK",
  NETWORK_FAILURE: "NETWORK_FAILURE",
  HTTP_SERVER_ERROR: "HTTP_SERVER_ERROR",
  HTTP_STATUS_UNEXPECTED: "HTTP_STATUS_UNEXPECTED",
  BODY_NOT_ARRAY: "BODY_NOT_ARRAY",
  BODY_NOT_OBJECT: "BODY_NOT_OBJECT",
  BODY_NOT_OBJECT_LIST: "BODY_NOT_OBJECT_LIST",
  ARGUMENT_REJECTION_CODE_UNEXPECTED: "ARGUMENT_REJECTION_CODE_UNEXPECTED",
  POLICY_ALLOWED_UNEXPECTEDLY: "POLICY_ALLOWED_UNEXPECTEDLY",
  OBJECT_SET_UNEXPECTED: "OBJECT_SET_UNEXPECTED",
};

/**
 * Classifies the response to an array-shaped argument sent to the one-text-argument RPC.
 *
 * THE SECURITY PROPERTY: array-shaped input must never create multi-value lookup
 * behaviour — no array lookup, no multiple-slug lookup, no wildcard, no enumeration.
 *
 * Two outcomes satisfy that and both are accepted:
 *   (a) PostgREST rejects the argument — an expected status AND an argument/conversion
 *       error code from the allowlist above.
 *   (b) PostgREST coerces it to ONE scalar text value, which the exact-slug predicate then
 *       fails to match — HTTP 200, a real array body, exactly zero rows.
 *
 * Never acceptable: a 5xx, an unrelated 4xx (including a bare `{}` with no code), a
 * non-array 200 body, or any non-empty result.
 */
export function classifyArrayArgumentResponse(response) {
  if (!response || response.kind === "network") return { ok: false, reason: REASON.NETWORK_FAILURE };
  if (typeof response.status !== "number") return { ok: false, reason: REASON.HTTP_STATUS_UNEXPECTED };
  if (response.status >= 500) return { ok: false, reason: REASON.HTTP_SERVER_ERROR };

  // (b) the safe coercion path
  if (response.status === 200) {
    if (response.kind !== "array" || !Array.isArray(response.rows)) {
      return { ok: false, reason: REASON.BODY_NOT_ARRAY };
    }
    if (response.rows.length !== 0) {
      return { ok: false, reason: REASON.POLICY_ALLOWED_UNEXPECTEDLY, actual: response.rows.length };
    }
    return { ok: true, reason: REASON.OK };
  }

  // (a) the rejection path
  if (!ARGUMENT_REJECTION_STATUSES.includes(response.status)) {
    return { ok: false, reason: REASON.HTTP_STATUS_UNEXPECTED };
  }
  if (response.kind !== "object" || response.value === null || typeof response.value !== "object") {
    return { ok: false, reason: REASON.BODY_NOT_OBJECT };
  }
  const code = response.value.code;
  if (typeof code !== "string" || code === "" || !ARGUMENT_REJECTION_CODES.has(code)) {
    // A bare {} lands here, as does any unrelated 4xx such as a privilege or JWT error.
    return { ok: false, reason: REASON.ARGUMENT_REJECTION_CODE_UNEXPECTED };
  }
  return { ok: true, reason: REASON.OK };
}

/**
 * Whether one entry from a Storage `list()` response is a real object record.
 *
 * Uses only fields the installed @supabase/storage-js documents as dependable for
 * `list()`: `name` is "always present", `id` and `metadata` are "null for folders".
 * `bucket_id` is documented as "NOT returned by list() operations" and is never consulted.
 *
 * The emptiness and array checks matter: `id: ""` is not an identifier, and `metadata: []`
 * is an array — `typeof [] === "object"` and `[] !== null`, so a naive object test accepts
 * it. Both previously passed.
 */
export function isStorageObjectRecord(entry) {
  return (
    entry !== null &&
    typeof entry === "object" &&
    !Array.isArray(entry) &&
    typeof entry.name === "string" &&
    entry.name !== "" &&
    typeof entry.id === "string" &&
    entry.id !== "" &&
    entry.metadata !== null &&
    typeof entry.metadata === "object" &&
    !Array.isArray(entry.metadata)
  );
}

/**
 * Classifies a Storage list response against an exact expected set of object names.
 *
 * Folder placeholders should not arise for the calls this harness makes: every list uses
 * the prefix `{uid}/{slot}`, and this project's paths are exactly
 * `{uid}/{slot}/{uuid}.{ext}` (buildMediaPath), so nothing nests below a slot. The record
 * check is therefore a tripwire for an unexpected shape rather than a folder filter.
 *
 * Duplicate names are rejected before the set comparison, since comparing Sets alone would
 * silently tolerate them.
 */
export function classifyStorageList(response, expectedNames) {
  if (!response || response.kind === "network") return { ok: false, reason: REASON.NETWORK_FAILURE };
  if (response.status !== 200) return { ok: false, reason: REASON.HTTP_STATUS_UNEXPECTED };
  if (response.kind !== "array" || !Array.isArray(response.rows)) {
    return { ok: false, reason: REASON.BODY_NOT_ARRAY };
  }
  if (!response.rows.every(isStorageObjectRecord)) {
    return { ok: false, reason: REASON.BODY_NOT_OBJECT_LIST, actual: response.rows.length };
  }

  const names = response.rows.map((entry) => entry.name);
  const unique = new Set(names);
  if (unique.size !== names.length) {
    return { ok: false, reason: REASON.OBJECT_SET_UNEXPECTED, expected: names.length, actual: unique.size };
  }

  const want = new Set(expectedNames);
  const same = unique.size === want.size && [...want].every((name) => unique.has(name));
  if (!same) return { ok: false, reason: REASON.OBJECT_SET_UNEXPECTED, expected: want.size, actual: unique.size };

  return { ok: true, reason: REASON.OK };
}
