/**
 * Which read path a public profile request takes, as a pure decision.
 *
 * Split out from profile-repository.ts for the same reason as
 * profile-save-decisions.ts: the branching is a security property, and it should
 * be checkable directly rather than only through a live Supabase project.
 *
 * Background (Checkpoint 5D.7). A published profile is read through
 * `get_published_profile_by_slug`, a SECURITY DEFINER function that hard-codes
 * `is_published = true`. That function is the whole public surface — `anon` has
 * no grant on `athlete_profiles` at all any more. But an owner must still be able
 * to preview their OWN unpublished profile at its real URL, and the function
 * refuses to return unpublished rows to anybody. So there is a second, narrower
 * step: a direct table read that RLS confines to the caller's own row.
 *
 * The invariant this module exists to protect: **the owner-preview step is never
 * attempted without a session.** Not for efficiency — for clarity of the
 * security story. An anonymous request must be able to reach exactly one code
 * path, so that "anon cannot read the table" is true by construction here and not
 * merely true because the database would have refused.
 */

/**
 * What to do after the published-profile lookup has run.
 *
 * - `resolved` — the published read returned a row; render it.
 * - `try-owner-preview` — nothing published matched, but the caller may be
 *   signed in, so their own (possibly unpublished) row is worth one query. RLS
 *   decides whether they actually get it.
 * - `not-found` — nothing published matched and there is no session, so there is
 *   nothing further any query could legitimately return. 404.
 */
export type PublicReadStep = "resolved" | "try-owner-preview" | "not-found";

/**
 * `hasLocalSession` is read from the request's cookies, which means it is a hint
 * and not proof: a cookie can be present and stale. That is fine, and is the
 * reason this is a separate pure function rather than an inline condition — the
 * value is only ever used to decide whether a query is *worth attempting*.
 * Authorization stays with RLS, which re-decides on every read regardless of what
 * this returns. A false positive costs one query that returns no rows; a false
 * negative shows a 404 to an owner whose session had already expired, which is
 * the same thing they would see after being signed out.
 */
export function decidePublicReadStep(args: {
  publishedRowFound: boolean;
  hasLocalSession: boolean;
}): PublicReadStep {
  if (args.publishedRowFound) return "resolved";
  if (args.hasLocalSession) return "try-owner-preview";
  return "not-found";
}

/**
 * Whether a given step may issue a direct `athlete_profiles` read.
 *
 * Exists so the invariant in this module's docblock is assertable rather than
 * only documented: exactly one step may touch the table, and reaching it
 * requires a session.
 */
export function stepMayReadTableDirectly(step: PublicReadStep): boolean {
  return step === "try-owner-preview";
}
