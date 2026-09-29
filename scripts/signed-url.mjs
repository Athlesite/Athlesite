/**
 * Resolving a Supabase Storage signed-URL value into something fetchable.
 *
 * WHY THIS IS NOT OBVIOUS, AND WHY IT GETS ITS OWN MODULE WITH TESTS.
 *
 * The Storage REST API returns a **relative** value that is relative to the *Storage API
 * base*, not to the project origin:
 *
 *     { "signedURL": "/object/sign/athlete-media/<uid>/hero/<uuid>.jpg?token=…" }
 *
 * The official SDK builds the absolute URL as `${storageApiBase}${signedURL}`, where
 * `storageApiBase` is `${projectUrl}/storage/v1` — verified against the installed
 * @supabase/storage-js, whose own documented example pairs
 * `"/object/sign/avatars/…"` with
 * `"https://example.supabase.co/storage/v1/object/sign/avatars/…"`.
 *
 * Resolving that relative path against the project origin instead silently produces
 * `https://<project>/object/sign/…` — missing `/storage/v1` — which 404s. The failure
 * looks like "the object is not readable", i.e. exactly like a correct access denial, so
 * in an access-boundary harness it would manufacture false passes. That is why it is
 * isolated here and unit tested rather than inlined.
 *
 * The harness never prints a resolved URL: it carries the project ref and a bearer token.
 */

/** Storage REST is mounted under this path on the project origin. */
const STORAGE_API_PREFIX = "/storage/v1";

/**
 * The only rooted paths accepted as a signed-object value.
 *
 * `/object/sign/…` is the form the Storage API returns (confirmed against the installed
 * @supabase/storage-js). The `/storage/v1`-prefixed form is accepted defensively in case a
 * deployment returns an already-prefixed path; it resolves against the project origin
 * instead of the Storage base so the prefix is never doubled.
 *
 * Arbitrary rooted paths are rejected: `/foo/bar` is not a signing endpoint, and silently
 * turning it into a URL would let a malformed response become a fetch against something
 * unintended.
 */
const RELATIVE_PREFIXES = [
  { prefix: "/object/sign/", appendStorageBase: true },
  { prefix: `${STORAGE_API_PREFIX}/object/sign/`, appendStorageBase: false },
];

/**
 * Resolves a `signedURL` value from the Storage API into an absolute URL.
 *
 * Returns `null` for anything unusable — missing, empty, not a string, or a relative value
 * that does not start with `/`. Callers must treat `null` as a failure rather than
 * attempting a fetch, so a malformed response can never be mistaken for a denial.
 *
 * @param {string} projectUrl  e.g. https://<ref>.supabase.co (trailing slash tolerated,
 *                             and an accidental trailing /storage/v1 is not duplicated)
 * @param {unknown} signedValue  the `signedURL` field as returned by the API
 * @returns {string | null}
 */
export function resolveSignedObjectUrl(projectUrl, signedValue) {
  if (typeof signedValue !== "string" || signedValue.trim() === "") return null;

  // Absolute: must actually PARSE and carry an http(s) scheme. A bare "http://" matches a
  // naive prefix test but is not a URL, and passing it to fetch() would throw from inside
  // an assertion — so it is validated, not pattern-matched.
  if (/^[a-z][a-z0-9+.-]*:/i.test(signedValue)) {
    let parsed;
    try {
      parsed = new URL(signedValue);
    } catch {
      return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.host === "") return null;
    return signedValue;
  }

  // Relative: only a rooted signing-endpoint path, never an arbitrary rooted path.
  const match = RELATIVE_PREFIXES.find(({ prefix }) => signedValue.startsWith(prefix));
  if (!match) return null;

  if (typeof projectUrl !== "string" || projectUrl.trim() === "") return null;

  let base = projectUrl.trim().replace(/\/+$/, "");
  if (match.appendStorageBase) {
    // Defensive: if a caller already supplied the Storage base, do not append it twice.
    if (!base.toLowerCase().endsWith(STORAGE_API_PREFIX)) base += STORAGE_API_PREFIX;
  } else if (base.toLowerCase().endsWith(STORAGE_API_PREFIX)) {
    // The value already carries /storage/v1, so strip it from the base.
    base = base.slice(0, -STORAGE_API_PREFIX.length);
  }

  return `${base}${signedValue}`;
}
