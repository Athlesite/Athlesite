/**
 * The canonical-UUID-format check used by participation-census.sql, mirrored here
 * in JavaScript so it is directly unit-testable.
 *
 * There is no local Postgres in this environment (confirmed: no `supabase` CLI, no
 * linked local stack — see the Guardian-First Participation Phase 1a report), so
 * the real SQL regex cannot be executed against a real `::uuid` cast as part of
 * this test suite. This module exists so the VALIDATION LOGIC can be proven correct
 * in isolation, and `participation-sql-contract.test.mjs` separately asserts the
 * .sql file contains this exact pattern string — tying the two together so they
 * cannot silently drift apart.
 *
 * Exactly 8-4-4-4-12 hex digits with hyphens required at exactly those four
 * positions and nowhere else. A string matching this pattern is unconditionally
 * accepted by PostgreSQL's text-to-uuid cast, so validating with this regex FIRST
 * means the cast that follows in the SQL can never throw — see that file's own
 * comment for the full reasoning, including the "36 hyphens" and "wrong hyphen
 * placement" inputs that a looser `{36}`-length-only pattern would wrongly accept
 * and then crash on.
 */
export const CANONICAL_UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The exact source text of CANONICAL_UUID_PATTERN, for the SQL cross-check. */
export const CANONICAL_UUID_PATTERN_SOURCE = CANONICAL_UUID_PATTERN.source;

/**
 * Whether `segment` is a syntactically valid UUID in the canonical 8-4-4-4-12
 * hyphenated form. Says nothing about whether that UUID exists in `auth.users` —
 * see participation-census.sql's section 5c, a separate, later check that is only
 * ever reached for a segment this function has already approved.
 */
export function isCanonicalUuidFormat(segment) {
  if (typeof segment !== "string") return false;
  return CANONICAL_UUID_PATTERN.test(segment);
}
