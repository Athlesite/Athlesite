-- Narrow anonymous read access to the columns a published public profile
-- actually renders.
--
-- Supersedes the table-wide anon grant in
-- 20260825000001_create_athlete_profiles.sql, which is applied and therefore
-- not edited (docs/ai/GUARDRAILS.md § Migrations).
--
-- Why. RLS decides which ROWS an anonymous caller sees (is_published = true).
-- It cannot restrict COLUMNS. So every field of a published profile was
-- readable by anyone holding the publishable key — including contact,
-- recruiting, NIL, social and school data that no page renders. Verified
-- against the live project before this migration was written: all 35 columns
-- returned HTTP 200 to an anonymous caller.
--
-- Why owner_user_id and is_published stay granted. The Storage read policy in
-- 20260825000002 joins this table on both, and a policy subquery is subject to
-- the caller's own column privileges — revoking either would stop anonymous
-- visitors signing a published athlete's hero photo. owner_user_id is also
-- already public in every signed media URL ({uid}/hero/{uuid}.ext), so hiding
-- the column would conceal nothing while breaking photos.
--
-- What this does NOT change: the schema, RLS policies, Storage policies, and
-- the `authenticated` grant are all untouched. An athlete still reads and
-- writes their own full row under the existing owner policies.
--
-- Not solved here: an anonymous caller can still enumerate published rows'
-- public columns without knowing a slug. Accepted, scoped out, and recorded in
-- docs/ai/NOW.md.
--
-- Verified end to end against the live project before merge, with a disposable
-- published profile: 18 columns readable, the other 17 refused with 42501
-- (including via `select=*` and filter predicates), the published hero still
-- signed and delivered its bytes, and once unpublished the row returned zero
-- rows and the hero could no longer be signed.

revoke select on table public.athlete_profiles from anon;

grant select (
  owner_user_id, slug,
  first_name, last_name, sport, position, class_year, city, state,
  height_in, weight_lb, bio,
  hero_photo_position_x, hero_photo_position_y, hero_photo_zoom,
  hero_photo_path, highlight_links, is_published
) on table public.athlete_profiles to anon;
