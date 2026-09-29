-- The exact-slug public read path for published athlete profiles.
--
-- Checkpoint 5D.7, migration 1 of 3. This one is purely ADDITIVE: it creates a
-- function and grants EXECUTE on it. It changes no policy, revokes no grant, and
-- alters no existing behaviour, so it is safe to apply on its own and safe to
-- leave applied if the other two are rolled back.
--
-- Why a function at all. `anon` currently holds a column-scoped SELECT on the
-- table (20260911000001), and RLS restricts it to `is_published = true` rows.
-- That combination makes every published profile *bulk-listable*: an anonymous
-- caller can enumerate the whole pilot cohort without knowing a single slug,
-- because PostgREST will happily serve a filterless query. A view cannot fix
-- this — a view is still queried with arbitrary filters and no required
-- argument. Only a function can demand a slug before it returns anything, which
-- is why this exists (docs/ai/DECISIONS.md § Anonymous reads are column-scoped).
--
-- Published means the exact link works. It does not mean listable, searchable,
-- or discoverable. This function is what makes that distinction enforceable in
-- the database rather than merely intended.
--
-- SECURITY MODEL — the owner is `postgres`, deliberately (Checkpoint 5D.7,
-- founder decision, Option A).
--
--   SECURITY DEFINER runs with the privileges of the function OWNER, so the
--   owner choice IS the security model. `postgres` owns `athlete_profiles`, so
--   this function BYPASSES RLS and holds SELECT on all 35 columns. Two
--   consequences, both load-bearing:
--
--     1. `and p.is_published = true` below is the ONLY thing enforcing
--        publication. It is hard-coded, never a parameter.
--     2. The explicit RETURNS TABLE list below is the ONLY thing limiting which
--        columns can escape.
--
--   A least-privilege owner role was evaluated and rejected for this project:
--   Postgres 16+ grants a CREATEROLE creator only `ADMIN TRUE, SET FALSE`, so
--   `ALTER FUNCTION ... OWNER TO` fails without a further non-obvious grant, and
--   with no local Docker stack there is no way to rehearse any of it before it
--   runs against the only real database. What replaced it is change detection,
--   not enforcement: `npm run check:columns` pins this migration byte-for-byte
--   by SHA-256 and separately asserts that the application's public select list
--   matches the approved 18-field projection. The hash proves only that these
--   reviewed bytes are unchanged; it does not inspect or prove SQL semantics.
--
-- RETURNS TABLE, never `setof public.athlete_profiles`. The composite row type
-- would expose all 35 columns as this function's contract, and would silently
-- widen every time a column is added to the table. An explicit list of scalars
-- cannot widen by accident: a new column is invisible here until someone adds it
-- on purpose, and CI fails if they do.
--
-- `"position"` is quoted because POSITION is a SQL keyword that Postgres accepts
-- as a column name but NOT as a bare function/parameter name. Every column in
-- the body is also qualified with the `p.` alias so an output parameter name can
-- never be mistaken for a column reference.

create or replace function public.get_published_profile_by_slug(profile_slug text)
returns table (
  owner_user_id uuid,
  slug text,
  first_name text,
  last_name text,
  sport text,
  "position" text,
  class_year text,
  city text,
  state text,
  height_in integer,
  weight_lb integer,
  bio text,
  hero_photo_position_x numeric,
  hero_photo_position_y numeric,
  hero_photo_zoom numeric,
  hero_photo_path text,
  highlight_links jsonb,
  is_published boolean
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    p.owner_user_id,
    p.slug,
    p.first_name,
    p.last_name,
    p.sport,
    p."position",
    p.class_year,
    p.city,
    p.state,
    p.height_in,
    p.weight_lb,
    p.bio,
    p.hero_photo_position_x,
    p.hero_photo_position_y,
    p.hero_photo_zoom,
    p.hero_photo_path,
    p.highlight_links,
    p.is_published
  from public.athlete_profiles p
  where p.slug = profile_slug
    and p.is_published = true
  limit 1;
$$;

-- Exactly one scalar argument, compared with `=`. No LIKE, no prefix match, no
-- array or IN list, no caller-supplied predicate, no dynamic SQL. Changing the
-- comparison below to a pattern match would turn this function into the bulk
-- enumeration surface it exists to remove.

-- EXECUTE is granted explicitly rather than left at PostgreSQL's default, which
-- grants EXECUTE on new functions to PUBLIC.
revoke all on function public.get_published_profile_by_slug(text) from public;
grant execute on function public.get_published_profile_by_slug(text) to anon, authenticated;

comment on function public.get_published_profile_by_slug(text) is
  'Exact-slug read of one published athlete profile, limited to the 18 public columns. '
  'Requires is_published = true. Not a listing or search surface: takes one slug, '
  'compares it with equality, and returns at most one row. See Checkpoint 5D.7.';
