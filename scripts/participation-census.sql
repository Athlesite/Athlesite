-- Guardian-First Participation, Phase 1a — read-only live owner/media census.
--
-- NOT a migration. Nothing here writes anything; every statement is a SELECT. Run
-- this in the Supabase SQL Editor against the Athlete project, by a founder/operator
-- with dashboard access — there is no other way to run it.
--
-- WHY THIS CANNOT RUN FROM APPLICATION CODE, AND WHY THAT IS CORRECT. Since
-- Checkpoint 5D.7 (20260928000003), `anon` holds no grant at all on
-- athlete_profiles, and `authenticated` holds only the "Owner can view own profile"
-- policy — a signed-in caller sees their own row and nothing else. A cross-owner
-- count (`count(distinct owner_user_id)` over every owner) is exactly the kind of
-- query those policies exist to prevent, for any token this project could mint. This
-- project deliberately holds no service_role key (.env.example; docs/ai/DECISIONS.md
-- § No service-role key), so there is no credential anywhere in this repo's reach
-- that can run this query — only a human with Supabase dashboard access can. That is
-- the intended consequence of the access boundary, not a gap in this tooling.
--
-- Output discipline: every query below returns COUNTS, never ids, by default. The
-- two "detail" queries at the end (commented out) return ids for triage ONLY if a
-- count above is non-zero and a founder needs to act on it — uncomment deliberately,
-- never run them routinely, and never paste their output into a chat, ticket, or log.

-- ── 1. Profile owners ──────────────────────────────────────────────────────────
select count(distinct owner_user_id) as profile_owner_count
from public.athlete_profiles;

-- ── 2. athlete-media owners, derived EXACTLY as the live Storage policies derive
--       ownership: the first path segment, as text ──────────────────────────────
with media_owners as (
  select distinct (storage.foldername(name))[1] as owner_segment
  from storage.objects
  where bucket_id = 'athlete-media'
)
select count(*) as media_owner_count
from media_owners;

-- ── 3. Profile owners with no media in their folder ───────────────────────────
with media_owners as (
  select distinct (storage.foldername(name))[1] as owner_segment
  from storage.objects
  where bucket_id = 'athlete-media'
)
select count(*) as profile_owners_without_media
from public.athlete_profiles p
where not exists (
  select 1 from media_owners m where m.owner_segment = p.owner_user_id::text
);

-- ── 4. Media-only owners: media exists, no profile row ─────────────────────────
-- This is the bypass this whole Phase 1a/1b split closes: today's Storage write
-- policies never consult athlete_profiles, so an owner can have media with no row.
with media_owners as (
  select distinct (storage.foldername(name))[1] as owner_segment
  from storage.objects
  where bucket_id = 'athlete-media'
)
select count(*) as media_only_owner_count
from media_owners m
where not exists (
  select 1 from public.athlete_profiles p where p.owner_user_id::text = m.owner_segment
);

-- ── 5. Malformed athlete-media ownership paths, by class ───────────────────────

-- 5a. Missing first segment (an object written at the bucket root, with no
--     folder prefix at all).
select count(*) as missing_first_segment_count
from storage.objects
where bucket_id = 'athlete-media'
  and (
    (storage.foldername(name)) is null
    or array_length(storage.foldername(name), 1) is null
    or (storage.foldername(name))[1] is null
    or (storage.foldername(name))[1] = ''
  );

-- 5b. First segment present but not a valid UUID.
--
-- FIX for the finding Codex caught: the previous version matched on
-- `^[0-9a-fA-F-]{36}$` — exactly 36 characters from the set {hex digits, hyphen},
-- with NO constraint on hyphen position or count. "36 hyphens" and a 36-character
-- hex string with hyphens in the wrong positions (e.g. shifted by one) both satisfy
-- that pattern. The old code then eagerly evaluated `owner_segment::uuid` inside a
-- CASE branch reached by that loose match — Postgres's text-to-uuid cast throws a
-- hard `invalid_text_representation` error for either input, which is not
-- catchable inside a plain SQL SELECT, so the entire census query would abort.
--
-- The fix is a CANONICAL-FORMAT regex: exactly 8-4-4-4-12 hex digits, hyphens
-- required at exactly those four positions and nowhere else. A string that
-- matches this pattern is, provably, accepted by `::uuid` unconditionally — so no
-- cast is attempted at all here, and none can ever throw. Validity is determined
-- by the regex alone.
with first_segments as (
  select distinct (storage.foldername(name))[1] as owner_segment
  from storage.objects
  where bucket_id = 'athlete-media'
    and (storage.foldername(name))[1] is not null
    and (storage.foldername(name))[1] <> ''
)
select count(*) as non_uuid_first_segment_count
from first_segments
where owner_segment !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- 5c. First segment matches the canonical UUID format (and is therefore cast-safe
-- by construction — see 5b), but that UUID is absent from auth.users: an orphaned
-- owner, almost certainly from a deleted Auth user whose media was never (or could
-- not be) cleaned up. athlete_participation cannot be created for this owner: its
-- FK to auth.users makes that incoherent. The `::uuid` cast below is reached only
-- for segments that already passed the same canonical-format regex as 5b, so it
-- is safe for the same reason.
-- FIX for the finding Codex caught: `select distinct` above dedupes by RAW path
-- text, so the same real UUID written under two differently-cased storage paths
-- (e.g. an uppercase and a lowercase folder for the same owner) survives as two
-- distinct rows here. `count(*)` then reports 2 orphans for what is really one —
-- disagreeing with the JS mirror, which normalizes to UUID identity before
-- counting. `count(distinct f.owner_segment::uuid)` dedupes by the actual 128-bit
-- UUID value instead of its text spelling, matching the JS side exactly. The
-- `::uuid` cast is reached only for segments that already passed the canonical-
-- format regex above, so it is cast-safe for the same reason 5b/5c's casts are.
with first_segments as (
  select distinct (storage.foldername(name))[1] as owner_segment
  from storage.objects
  where bucket_id = 'athlete-media'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
)
select count(distinct f.owner_segment::uuid) as orphaned_media_owner_count
from first_segments f
where not exists (
  select 1 from auth.users u where u.id = f.owner_segment::uuid
);

-- ── 6/7. Participation coverage — the queries Phase 1b's go/no-go actually needs ──
--
-- Sections 1-5 above answer "who are the owners and are any paths malformed". They
-- do NOT answer "is every owner covered by an approved participation row", which is
-- the actual Phase 1b precondition (participation_allows_retention() in
-- 20261008000003_create_participation_functions.sql literally returns
-- `status = 'approved'` and nothing else). These two queries close that gap.
--
-- THE UNION, defined exactly once and reused by both queries below: every
-- athlete_profiles owner, plus every athlete-media owner whose first folder
-- segment is a CANONICAL-format UUID that actually exists in auth.users.
--
-- Orphaned owners (valid UUID format, absent from auth.users — section 5c) are
-- deliberately EXCLUDED from this union, not included and then flagged again here.
-- athlete_participation's owner_user_id has a NOT NULL foreign key to auth.users
-- ON DELETE CASCADE, so a participation row for an orphaned owner cannot exist by
-- construction — folding them into "missing participation" would report the same
-- underlying problem (a deleted Auth user's media was never cleaned up) under a
-- second name, with a second remediation path (attest) that does not apply to it.
-- Malformed paths (section 5a/5b) are excluded for the identical reason: there is no
-- well-formed owner there to check participation for at all.
with media_owners_canonical as (
  select distinct (storage.foldername(name))[1] as owner_segment
  from storage.objects
  where bucket_id = 'athlete-media'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
),
media_owners_real as (
  -- The ::uuid cast here is reached only for segments that already passed the
  -- canonical-format regex above, so it is cast-safe for the same reason section
  -- 5c's cast is.
  --
  -- NORMALIZATION (fix for the finding Codex caught): owner_segment is cast
  -- through ::uuid AND BACK to ::text, not selected as the raw path text.
  -- PostgreSQL's uuid type is a 128-bit value with no case of its own — its
  -- text OUTPUT form is always lowercase canonical, regardless of the case the
  -- TEXT INPUT was written in. Without this round-trip, an uppercase folder
  -- name for the exact same UUID as a lowercase athlete_profiles/
  -- athlete_participation owner_user_id would carry a DIFFERENT text value
  -- into coverage_union below, so `union` could not deduplicate them (the same
  -- owner would appear to be two different owners) and the later join against
  -- athlete_participation.owner_user_id::text (itself always lowercase) could
  -- fail to match an owner who is, in reality, fully covered — misreporting a
  -- real, approved owner as "missing participation".
  select (m.owner_segment::uuid)::text as owner_segment
  from media_owners_canonical m
  where exists (select 1 from auth.users u where u.id = m.owner_segment::uuid)
),
coverage_union as (
  -- `union` (not `union all`) is load-bearing: it is what makes an owner who
  -- appears in BOTH athlete_profiles and athlete-media count exactly once in
  -- every query below, rather than being double-counted toward either go/no-go
  -- total.
  select owner_user_id::text as owner_id from public.athlete_profiles
  union
  select owner_segment as owner_id from media_owners_real
)
select count(*) as owners_missing_participation_count
from coverage_union c
where not exists (
  select 1 from public.athlete_participation p where p.owner_user_id::text = c.owner_id
);

-- Same union, independent condition: a participation row EXISTS but its status is
-- not 'approved' (pending, declined, or revoked — Phase 1a creates only 'approved'
-- rows, but this must hold regardless of which future phase writes the others).
-- Deliberately a SEPARATE count from owners_missing_participation_count above: an
-- owner can be in at most one of the two (no row vs a non-approved row are
-- mutually exclusive), and collapsing them into one number would hide which
-- remediation path applies — attest from scratch, versus a guardian/founder
-- decision on an existing non-approved row.
with media_owners_canonical as (
  select distinct (storage.foldername(name))[1] as owner_segment
  from storage.objects
  where bucket_id = 'athlete-media'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
),
media_owners_real as (
  -- NORMALIZATION (fix for the finding Codex caught): see section 6's own
  -- comment on this identical CTE for the full reasoning. owner_segment is
  -- cast through ::uuid AND BACK to ::text so coverage_union's `union` can
  -- correctly deduplicate against athlete_profiles/athlete_participation's
  -- own, always-lowercase owner_user_id::text — without this, an uppercase
  -- folder name for the same real UUID would misreport a covered, approved
  -- owner as "missing participation".
  select (m.owner_segment::uuid)::text as owner_segment
  from media_owners_canonical m
  where exists (select 1 from auth.users u where u.id = m.owner_segment::uuid)
),
coverage_union as (
  select owner_user_id::text as owner_id from public.athlete_profiles
  union
  select owner_segment as owner_id from media_owners_real
)
select count(*) as owners_participation_not_approved_count
from coverage_union c
join public.athlete_participation p on p.owner_user_id::text = c.owner_id
where p.status <> 'approved';

-- ── DETAIL (ids) — uncomment ONLY if a count above is non-zero and you need to
--    act on specific rows. Never paste this output anywhere outside the dashboard.
--
-- select owner_user_id from public.athlete_profiles p
-- where not exists (
--   select 1 from storage.objects o
--   where o.bucket_id = 'athlete-media'
--     and (storage.foldername(o.name))[1] = p.owner_user_id::text
-- );
--
-- select distinct (storage.foldername(name))[1] as owner_segment
-- from storage.objects
-- where bucket_id = 'athlete-media'
--   and not exists (
--     select 1 from public.athlete_profiles p
--     where p.owner_user_id::text = (storage.foldername(name))[1]
--   );
--
-- -- Owners missing a participation row (same union as section 6/7 above):
-- with media_owners_canonical as (
--   select distinct (storage.foldername(name))[1] as owner_segment
--   from storage.objects
--   where bucket_id = 'athlete-media'
--     and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
-- ),
-- media_owners_real as (
--   select (m.owner_segment::uuid)::text as owner_segment from media_owners_canonical m
--   where exists (select 1 from auth.users u where u.id = m.owner_segment::uuid)
-- ),
-- coverage_union as (
--   select owner_user_id::text as owner_id from public.athlete_profiles
--   union
--   select owner_segment as owner_id from media_owners_real
-- )
-- select c.owner_id from coverage_union c
-- where not exists (
--   select 1 from public.athlete_participation p where p.owner_user_id::text = c.owner_id
-- );
--
-- -- Owners whose participation exists but is not approved (same union):
-- with media_owners_canonical as (
--   select distinct (storage.foldername(name))[1] as owner_segment
--   from storage.objects
--   where bucket_id = 'athlete-media'
--     and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
-- ),
-- media_owners_real as (
--   select (m.owner_segment::uuid)::text as owner_segment from media_owners_canonical m
--   where exists (select 1 from auth.users u where u.id = m.owner_segment::uuid)
-- ),
-- coverage_union as (
--   select owner_user_id::text as owner_id from public.athlete_profiles
--   union
--   select owner_segment as owner_id from media_owners_real
-- )
-- select c.owner_id, p.status from coverage_union c
-- join public.athlete_participation p on p.owner_user_id::text = c.owner_id
-- where p.status <> 'approved';
