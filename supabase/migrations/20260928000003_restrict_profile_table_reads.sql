-- Remove direct table reads of other athletes' profiles, for every role except
-- the owner.
--
-- Checkpoint 5D.7, migration 3 of 3. This one restricts *table* reads; 20260928000002
-- also restricts, narrowing Storage reads — so this is not "the only restrictive
-- migration", it is the one that closes the table surface. Apply it LAST (its filename
-- sorts last for that reason): it depends on 20260928000001 having created the public
-- read function and on 20260928000002 having replaced the Storage policy that used to
-- rely on `anon` holding a table grant.
--
-- TWO HOLES CLOSE HERE, and the second was the larger of the two.
--
-- 1. `anon` could enumerate every published profile across the 18 granted
--    columns without knowing a slug (recorded as an accepted gap in
--    docs/ai/NOW.md). Published is supposed to mean "the exact link works", not
--    "the cohort is one query".
--
-- 2. `authenticated` could read EVERY COLUMN of every published profile. The
--    policy dropped below was declared `to anon, authenticated`, and
--    20260825000001 grants `authenticated` a table-wide SELECT — so RLS admitted
--    the row and nothing restricted the columns. Any signed-in athlete could
--    read every other athlete's `recruiting_contact`, `nil_contact`,
--    `school_or_team`, and all six social columns. `anon` was column-scoped;
--    `authenticated` was not, which made a signed-in athlete a broader reader
--    than an anonymous one. Signing in must not grant access to another
--    athlete's private fields (Checkpoint 5D.7, founder decision).
--
-- AFTER THIS MIGRATION:
--
--   anon           no SELECT policy and no grant -> zero rows, zero columns.
--                  Public viewing goes through get_published_profile_by_slug.
--   authenticated  only "Owner can view own profile" remains -> own row only.
--                  Public viewing goes through the same function.
--   owner          unchanged. Full 35 columns of their own row, published or
--                  not, under the untouched owner policies.
--
-- The table-wide grant to `authenticated` is deliberately LEFT IN PLACE. It is
-- correct rather than dangerous once this policy is gone: an owner legitimately
-- needs every column of their own row for /edit-profile, and RLS now confines
-- them to exactly that row.
--
-- VERIFIED UNAFFECTED. Every other authenticated read already filters on
-- owner_user_id and runs under the owner policy: getOwnProfile,
-- checkOwnershipStatus, and reconcileAfterAmbiguousInsert. The insert, update,
-- and delete policies are untouched, so saving, publishing, and unpublishing all
-- behave exactly as before.

drop policy "Public can view published profiles" on public.athlete_profiles;

-- Both forms, deliberately. Column-level and table-level privileges are tracked
-- separately in PostgreSQL, so the column grant from 20260911000001 is revoked
-- by name and then ALL is revoked as a backstop. The acceptance matrix proves the
-- outcome empirically rather than relying on REVOKE's interaction rules.
revoke select (
  owner_user_id, slug,
  first_name, last_name, sport, position, class_year, city, state,
  height_in, weight_lb, bio,
  hero_photo_position_x, hero_photo_position_y, hero_photo_zoom,
  hero_photo_path, highlight_links, is_published
) on table public.athlete_profiles from anon;

revoke all on table public.athlete_profiles from anon;

-- NOTE FOR ANY FUTURE PUBLIC COLUMN. There is no longer an `anon` column grant
-- to update when a column should become public. The public projection now lives
-- in exactly two places -- the RETURNS TABLE of
-- get_published_profile_by_slug (20260928000001) and PUBLIC_PROFILE_COLUMNS in
-- src/lib/profile-repository.ts -- and `npm run check:columns` fails if they
-- disagree. That same check pins this migration byte-for-byte by SHA-256: the
-- hash proves only that these reviewed bytes are unchanged, and does not inspect
-- or prove SQL semantics.
