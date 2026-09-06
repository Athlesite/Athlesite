-- Athlete profiles: one row per athlete, one profile per authenticated user.
-- Field names map 1:1 onto src/lib/athlete-profile.ts's AthleteProfileData.

create table if not exists public.athlete_profiles (
  id uuid primary key default gen_random_uuid(),

  -- One profile per authenticated user; also the reliable upsert boundary
  -- for save/publish (see db-mappers / the Save & Publish action).
  owner_user_id uuid not null unique references auth.users (id) on delete cascade,

  -- Public, globally unique profile URL segment. Editable pre-publish,
  -- locked afterward at the application layer (no slug-history table here).
  slug text not null unique,

  first_name text not null default '',
  last_name text not null default '',
  sport text not null default '',
  position text not null default '',
  class_year text not null default '',
  school_or_team text not null default '',
  city text not null default '',
  state text not null default '',
  height_in integer,
  weight_lb integer,
  bio text not null default '',

  hero_photo_position_x numeric not null default 0.5
    check (hero_photo_position_x >= 0 and hero_photo_position_x <= 1),
  hero_photo_position_y numeric not null default 0
    check (hero_photo_position_y >= 0 and hero_photo_position_y <= 1),
  hero_photo_zoom numeric not null default 1
    check (hero_photo_zoom >= 1 and hero_photo_zoom <= 1.8),

  -- Storage object paths (not URLs) — resolved to signed URLs at render
  -- time. See storage migration for bucket/policy design.
  hero_photo_path text,
  profile_photo_path text,

  -- Ordered [{label, url}, ...]; see architecture proposal for why this is
  -- JSONB rather than a child table at pilot scale.
  highlight_links jsonb not null default '[]'::jsonb,

  recruiting_status text not null default 'undecided'
    check (recruiting_status in ('open', 'not_open', 'undecided')),
  recruiting_contact text not null default '',
  recruiting_notes text not null default '',

  -- Fixed, known six-field shape — flat columns rather than JSONB.
  social_instagram text not null default '',
  social_twitter text not null default '',
  social_tiktok text not null default '',
  social_hudl text not null default '',
  social_youtube text not null default '',
  social_website text not null default '',

  nil_open boolean not null default false,
  nil_contact text not null default '',
  nil_interests text not null default '',

  -- Set true as part of the same upsert that first creates the row
  -- (auto-publish on first successful save; see Save & Publish flow).
  is_published boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists athlete_profiles_slug_idx on public.athlete_profiles (slug);

-- Keep updated_at current on every write.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_athlete_profiles_updated_at on public.athlete_profiles;
create trigger set_athlete_profiles_updated_at
  before update on public.athlete_profiles
  for each row
  execute function public.set_updated_at();

alter table public.athlete_profiles enable row level security;

-- Explicit table-level grants rather than relying on default privileges;
-- RLS policies below further restrict which specific rows are visible.
revoke all on table public.athlete_profiles from anon, authenticated;
grant select on table public.athlete_profiles to anon;
grant select, insert, update, delete on table public.athlete_profiles to authenticated;

-- Anyone (including logged-out visitors) may read published profiles.
create policy "Public can view published profiles"
on public.athlete_profiles
for select
to anon, authenticated
using (is_published = true);

-- An athlete may always read their own profile, published or not
-- (needed so /profile/edit can load an athlete's own current data).
create policy "Owner can view own profile"
on public.athlete_profiles
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

-- An athlete may create only their own profile row.
create policy "Owner can insert own profile"
on public.athlete_profiles
for insert
to authenticated
with check ((select auth.uid()) = owner_user_id);

-- An athlete may update only their own profile row.
create policy "Owner can update own profile"
on public.athlete_profiles
for update
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

-- An athlete may delete only their own profile row.
create policy "Owner can delete own profile"
on public.athlete_profiles
for delete
to authenticated
using ((select auth.uid()) = owner_user_id);
