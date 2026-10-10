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
with first_segments as (
  select distinct (storage.foldername(name))[1] as owner_segment
  from storage.objects
  where bucket_id = 'athlete-media'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
)
select count(*) as orphaned_media_owner_count
from first_segments f
where not exists (
  select 1 from auth.users u where u.id = f.owner_segment::uuid
);

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
