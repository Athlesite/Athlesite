-- Guardian-First Participation, Phase 1b — participation becomes an authorization
-- boundary for RETENTION, and the interim minor-publication restriction lands.
--
-- Phase 1a (20261008000001..3) recorded participation state and defined the two
-- predicates, but deliberately referenced them from NO policy: "Defined for Phase 1b;
-- referenced by no policy yet in Phase 1a." This migration is that reference, and
-- nothing else. It adds no table, no column, no function, and no grant — the EXECUTE
-- grants the predicates need were already issued to `authenticated` in Phase 1a.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- RETENTION vs PUBLICATION — two different questions, two different predicates
-- ══════════════════════════════════════════════════════════════════════════════
--
-- RETENTION — "may this owner keep data in the system at all?"
--   public.participation_allows_retention()  ->  status = 'approved', any bracket.
--   An approved MINOR may retain. Gating applies to writes that CREATE or CHANGE
--   retained data: INSERT and UPDATE on athlete_profiles, INSERT and UPDATE on the
--   athlete-media bucket.
--
-- PUBLICATION — "may this owner's data become publicly visible?"
--   public.participation_allows_publication()  ->  bracket = 'adult' AND
--   status = 'approved'. An approved minor returns FALSE, on purpose: guardian
--   participation approval permits retention, never publication, until the separate
--   exact-public-revision guardian approval exists (a later phase). That asymmetry
--   is the entire interim minor-publication restriction, and it already lives in the
--   predicate — this migration only enforces it.
--
-- The two gates are separate restrictive policies rather than one compound
-- expression so that a denial attributes to the right cause, and so a future change
-- to one semantic cannot silently alter the other.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- WHAT IS DELIBERATELY NOT GATED
-- ══════════════════════════════════════════════════════════════════════════════
--
-- SELECT and DELETE are NOT gated, on either athlete_profiles or storage.objects.
-- A participation problem must not trap an athlete's own data: an owner whose
-- participation lapsed must still be able to READ what the system holds about them
-- and DELETE it. Gating those would convert a participation lapse into a data
-- hostage situation, which is the opposite of what guardian-first participation is
-- for.
--
-- public.unpublish_own_profile() stays reachable in EVERY participation state. It is
-- SECURITY DEFINER and owned by `postgres`, so it bypasses RLS and is unaffected by
-- every policy below — which is exactly why Phase 1a built it that way:
-- "SECURITY DEFINER so it continues to work once Phase 1b's restrictive policies are
-- in place." Reducing public exposure must never require passing the gate that
-- blocks everything else (docs/ai/GUARDRAILS.md § Public / private boundary).
--
-- ══════════════════════════════════════════════════════════════════════════════
-- WHY RESTRICTIVE, AND WHY THAT MAKES THE CUTOVER SAFE
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Every policy below is `as restrictive`. PostgreSQL ANDs restrictive policies with
-- the result of the permissive ones, so the existing owner-identity policies from
-- 20260825000001 and 20260825000002 keep doing exactly what they did, and these add
-- a second condition on top. Three consequences, all of them wanted:
--
--   1. PURELY ADDITIVE. No existing policy is dropped, altered, or recreated. There
--      is therefore no instant at which writes are MORE permissive than before this
--      migration — the failure mode of a drop-then-create cutover. The only
--      transition is permissive-only -> permissive AND restrictive.
--   2. ATOMIC. DDL in PostgreSQL is transactional and the Supabase CLI runs each
--      migration file in one transaction, so all six policies become visible at the
--      same commit. There is no window in which some gates are live and others are
--      not. If any statement fails, the whole file rolls back and the boundary is
--      unchanged. (No explicit BEGIN/COMMIT here, matching every other migration in
--      this project — the CLI supplies the transaction.)
--   3. FAIL-CLOSED FOR ROWS THAT APPEAR AFTER THE CENSUS. The Phase 1b prerequisite
--      census was GO at 0 owners, but that is a snapshot, not a guarantee. An owner
--      created between census and cutover gets an adult/approved row from
--      initialize_adult_participation() during onboarding, so retention passes
--      normally. An owner who somehow has NO participation row is DENIED writes
--      rather than allowed them, and recovers by attesting. Denial is the safe
--      direction, and it is reversible without an operator.
--
-- LOCKING: `create policy` takes a brief ACCESS EXCLUSIVE lock on the table and
-- performs no table rewrite and no row scan, so its cost is independent of row
-- count. There is no backfill and nothing to batch.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- WHY NO RECURSION
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Both predicates are SECURITY DEFINER, owned by `postgres`, and read only
-- public.athlete_participation and auth.users. Neither reads athlete_profiles or
-- storage.objects, so referencing them from policies ON those relations cannot
-- recurse. Running as the table owner also means they are unaffected by
-- athlete_participation's own RLS (which is enabled and holds zero policies by
-- design — all access is through these functions).
--
-- Both are STABLE, so PostgreSQL may evaluate them once per statement rather than
-- once per row.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- ROLE SCOPING
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Each policy is `to authenticated`, matching the roles that can actually write
-- today: `anon` holds no grant at all on athlete_profiles (20260928000003) and no
-- permissive write policy on storage.objects, so it has no write path to gate. See
-- the note in docs/ai/DECISIONS.md § Phase 1b on the alternative (scoping these to
-- PUBLIC for defense-in-depth) and why it was left as a reviewed decision rather
-- than taken unilaterally.

-- ── 1. athlete_profiles — RETENTION gate ──────────────────────────────────────

-- A new profile row is retained data, so creating one requires current retention
-- eligibility.
create policy "Participation required to insert profile"
on public.athlete_profiles
as restrictive
for insert
to authenticated
with check (public.participation_allows_retention());

-- Changing a profile row is also retention. USING and WITH CHECK both carry the
-- predicate: USING so a non-eligible owner cannot target the row, WITH CHECK so the
-- post-update row is equally gated. GUARDRAILS.md § Row Level Security requires both
-- explicitly on an UPDATE policy. PostgreSQL inherits USING as WITH CHECK when
-- WITH CHECK is omitted; spelling out both makes the two checks auditable. Omitting
-- USING instead would leave row targeting unconstrained by this restrictive policy.
create policy "Participation required to update profile"
on public.athlete_profiles
as restrictive
for update
to authenticated
using (public.participation_allows_retention())
with check (public.participation_allows_retention());

-- ── 2. athlete_profiles — PUBLICATION gate (interim minor restriction) ────────

-- Publication is a strictly narrower question than retention, so it gets its own
-- predicate and its own policy. The condition is expressed as "either this row is
-- not published, or the owner is allowed to publish" so that:
--
--   * setting or leaving is_published = false is ALWAYS permitted by this policy,
--     including for a minor and including for a revoked owner — reducing exposure is
--     never gated;
--   * setting is_published = true requires bracket='adult' AND status='approved'.
--
-- `is not true` rather than `= false` is deliberate: it treats NULL as not published.
-- With NULL, `= false` evaluates to UNKNOWN; if publication eligibility is false,
-- the OR expression stays UNKNOWN and WITH CHECK rejects it (only TRUE passes).
-- `IS NOT TRUE` instead accepts that non-published NULL through this gate.
-- athlete_profiles.is_published is NOT NULL today, so both agree for current rows.
--
-- Today's application always inserts is_published = false (see
-- src/lib/db-mappers.ts toAthleteProfileRow), so the insert form of this gate is
-- satisfied trivially by the current flow and exists to bind any future path that
-- tries to create an already-published row.
create policy "Publication requires adult approved participation on insert"
on public.athlete_profiles
as restrictive
for insert
to authenticated
with check (
  is_published is not true
  or public.participation_allows_publication()
);

-- On UPDATE this gate constrains the NEW row only, which is why USING is `true`:
-- which existing rows an owner may target is already decided by the permissive
-- owner-identity policy and by the retention gate above, and duplicating that here
-- would conflate two separate questions. The bare `true` is therefore load-bearing
-- and intentional, not a weakened predicate — the enforcement is entirely in
-- WITH CHECK, where the post-update is_published value is examined.
--
-- Interaction worth stating plainly: an owner who is published and then becomes
-- minor/approved can no longer satisfy this gate while is_published = true, so their
-- profile updates are blocked until they unpublish. public.unpublish_own_profile()
-- remains available for exactly that, in every participation state, and bypasses
-- RLS. That is the designed escape hatch, not a deadlock.
create policy "Publication requires adult approved participation on update"
on public.athlete_profiles
as restrictive
for update
to authenticated
using (true)
with check (
  is_published is not true
  or public.participation_allows_publication()
);

-- ── 3. storage.objects — RETENTION gate for the athlete-media bucket ──────────

-- Scoped with `bucket_id <> 'athlete-media' or <predicate>` rather than
-- `bucket_id = 'athlete-media' and <predicate>`. A restrictive policy applies to
-- every row of storage.objects, which is a SHARED table across all buckets, so the
-- `<>` form leaves any present or future bucket untouched while gating this one.
-- The `and` form would have denied writes to every other bucket outright.
--
-- 'athlete-media' is the only bucket this project creates (20260825000002) and the
-- only one referenced anywhere in the repo, but the scoping is written to survive a
-- second bucket arriving without this policy having to be revisited.
--
-- This is the gate that makes participation bind on the Storage path specifically.
-- A stale-but-unexpired JWT cannot be used to retain media after participation
-- lapses, and neither can a direct Storage API call that never touches the Next.js
-- app: participation_allows_retention() is evaluated against LIVE database state on
-- every write, and it additionally returns false when the caller's uid no longer
-- exists in auth.users. Authorization therefore depends on current participation
-- state rather than on whatever a token asserted when it was minted.
create policy "Participation required to insert athlete media"
on storage.objects
as restrictive
for insert
to authenticated
with check (
  bucket_id <> 'athlete-media'
  or public.participation_allows_retention()
);

-- Replacing an object is the same retention question as creating one; the app's
-- upsert path uses UPDATE when the object already exists at that key.
create policy "Participation required to update athlete media"
on storage.objects
as restrictive
for update
to authenticated
using (
  bucket_id <> 'athlete-media'
  or public.participation_allows_retention()
)
with check (
  bucket_id <> 'athlete-media'
  or public.participation_allows_retention()
);

-- ── 4. What this migration deliberately does NOT do ───────────────────────────
--
-- No guardian request/redeem flow, and no guardian issuer. No exact-public-revision
-- guardian publication approval. No change to any Phase 1a function. No new grant,
-- no service_role bypass, and no relaxation of any existing policy. No SELECT or
-- DELETE gate on either relation. No change to the anon/public read path: the
-- published-profile RPC (20260928000001) and the referenced-hero Storage read policy
-- (20260928000002) are untouched, so public visibility still turns on is_published
-- and nothing else.

-- NOTE ON `comment on policy`: deliberately absent. COMMENT ON POLICY requires
-- ownership of the underlying relation, and storage.objects is owned by
-- supabase_storage_admin rather than postgres — CREATE POLICY on it is permitted here
-- (20260825000002, 20260928000002 both do it) but COMMENT ON POLICY would raise
-- "must be owner of relation objects" and roll back this entire migration. No other
-- migration in this project comments on a policy either; the reasoning for each gate
-- lives in the -- comments above, which cost nothing at apply time.
