-- Narrow non-owner media reads to the ONE object a published profile currently
-- points at.
--
-- Checkpoint 5D.7, migration 2 of 3.
--
-- ORDERING IS DELIBERATE AND LOAD-BEARING. This migration must be applied
-- BEFORE 20260928000003 (which revokes `anon`'s table grant), which is why its
-- filename sorts first. The policy being replaced below joins to
-- `public.athlete_profiles` as a plain subquery, and a policy subquery is
-- subject to the CALLER's own column privileges — so the moment `anon` loses
-- SELECT on the table, the old policy stops matching and every published
-- athlete's hero photo breaks. Replacing the policy first closes that window:
-- the new one reaches the table through a SECURITY DEFINER function, which does
-- not depend on the caller holding any grant at all.
--
-- WHAT WAS WRONG. The superseded policy authorised any reader — anonymous
-- included — to read EVERY object in a published athlete's folder, because it
-- matched on the folder prefix `(storage.foldername(name))[1]` and never on
-- which object the profile actually references. Media paths are versioned per
-- upload and never overwritten (docs/ai/DECISIONS.md § Media & Storage), so an
-- athlete's folder accumulates superseded objects, and a save that fails after
-- its upload leaves an orphan there too. All of it was publicly readable. An
-- athlete who replaced a photo — perhaps precisely because the first one showed
-- something they did not want public — had no way to know the old one was still
-- fetchable.
--
-- WHAT THIS DOES NOT DO. It does not delete anything. Superseded and orphaned
-- objects stay exactly where they are and keep costing storage; they simply stop
-- being readable by anyone but their owner. Cleanup remains best-effort and
-- owner-driven on purpose — nothing here deletes an object merely for being old,
-- and the ambiguous-write reconciliation in profile-save.ts is untouched.
--
-- HERO ONLY. `profile_photo_path` is deliberately NOT covered. It is not in the
-- public projection and no public page renders it, so no published page can
-- reference it — src/app/[slug]/page.tsx signs the hero and nothing else.
-- Granting non-owner reads to profile media would grant access to media nothing
-- public displays, which is the exact class of over-exposure this checkpoint
-- removes. Making profile media public later is a coordinated product + policy
-- change that must move the projection and this function together (Checkpoint
-- 5D.7, founder decision).

-- Whether one exact object is the hero a published profile currently points at
-- AND actually belongs to that profile's owner.
--
-- THE OWNER BINDING IS THE SECURITY PROPERTY, not a sanity check. Without it this
-- function asks only "does *some* published row reference this path", which is
-- forgeable: `hero_photo_path` is an owner-writable column and is one of the 18
-- columns the public read returns, so any visitor can copy a victim's exact hero
-- path off their published profile. An attacker could then set their OWN
-- `hero_photo_path` to that path, publish, and keep the victim's object publicly
-- readable — surviving the victim unpublishing it, and surviving the victim
-- replacing it, which is precisely the guarantee this migration exists to create.
-- Superseded and unpublished media would have stayed exposed indefinitely at a
-- stranger's discretion.
--
-- Binding the object's own folder segment to that row's `owner_user_id` closes it:
-- a row can only ever make objects in ITS OWN owner's folder public, so a forged
-- `hero_photo_path` pointing outside the forger's folder matches nothing. This is
-- enforced here, in the database, and deliberately does not rely on application
-- validation of what an athlete may write to that column.
--
-- FOUR CONDITIONS, all required:
--   1. `p.is_published = true`                     — unpublished profiles expose nothing
--   2. `p.hero_photo_path = object_name`           — exact full-path equality
--   3. folder segment 1 = `p.owner_user_id`        — the object belongs to that owner
--   4. folder segment 2 = 'hero'                   — hero slot only
--
-- Condition 4 is why `profile_photo_path` can never become publicly readable
-- through this path, even if an owner pointed their own `hero_photo_path` at a
-- profile-slot object. Paths are `{owner_user_id}/{slot}/{uuid}.{ext}` — see
-- buildMediaPath in src/lib/media-paths.ts, which is the convention these two
-- segment checks depend on.
--
-- SECURITY MODEL. SECURITY DEFINER owned by `postgres`, for the same reason and
-- with the same trade-off documented at length in 20260928000001. Returns a bare
-- boolean and never a path, row, or owner id, so it cannot be used to read the
-- data it checks.
--
-- EQUALITY ONLY — also a security property. `=` against a complete object name
-- means a caller must already hold the exact path to learn anything, and paths
-- carry two v4 UUIDs (~244 bits) so they cannot be guessed or walked. Changing
-- any comparison here to LIKE, a prefix match, or anything accepting a pattern
-- would convert this function into an enumeration oracle over athlete media.
--
-- NOT AN ORACLE, as written. It returns false identically for a nonexistent path,
-- an unpublished profile's hero, a superseded object, a profile-slot object, and
-- a path forged into someone else's row — so no probe distinguishes "exists but
-- unpublished" from "does not exist". A true result confirms only that a path is
-- the current hero of a published profile, which is already public via the 18
-- column projection to anyone holding the slug.
--
-- `split_part` is written as `pg_catalog.split_part` as defence in depth, NOT out of
-- necessity: `pg_catalog` is implicitly searched ahead of the configured `search_path`,
-- so an unqualified call would still resolve even with `search_path` pinned empty.
-- Qualifying it explicitly removes any dependence on that implicit behaviour and makes
-- the resolution auditable at the call site.
--
-- OWNER ACCESS WITHOUT A PROFILE ROW is intentional in the policy below. The owner branch
-- keys only on the folder segment matching `auth.uid()`, so an authenticated user can read
-- objects under their own uid folder even when no `athlete_profiles` row exists. This is
-- deliberate and consistent: the insert/update/delete policies from 20260825000002 already
-- key on exactly that predicate with no profile requirement, because onboarding uploads
-- media *before* the profile row is created. The superseded read policy did require a row,
-- which left a first-time athlete unable to read back their own just-uploaded object, and
-- left objects from an ambiguous failed first save unreadable by the only person entitled
-- to reconcile them. There is no cross-user exposure: the branch is confined to the
-- caller's own uid folder, which they can already write to and delete from.
create or replace function public.is_publicly_referenced_media(object_name text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.athlete_profiles p
    where p.is_published = true
      and p.hero_photo_path = object_name
      and p.owner_user_id::text = pg_catalog.split_part(object_name, '/', 1)
      and pg_catalog.split_part(object_name, '/', 2) = 'hero'
  );
$$;

-- Callers subject to the policy below must hold EXECUTE, because RLS policy
-- expressions are evaluated with the CALLER's privileges. There is no
-- configuration that makes a function callable inside a policy but not
-- directly, which is why the "not an oracle" reasoning above has to hold.
revoke all on function public.is_publicly_referenced_media(text) from public;
grant execute on function public.is_publicly_referenced_media(text) to anon, authenticated;

comment on function public.is_publicly_referenced_media(text) is
  'True only when the exact object name is the hero_photo_path of a published profile AND '
  'sits in that profile owner''s own hero folder. The owner binding prevents one athlete '
  'from exposing another''s media by forging hero_photo_path. Equality only, boolean only '
  '— see Checkpoint 5D.7 before changing any of the four conditions.';

drop policy "Read media for published or own profile" on storage.objects;

-- Owner keeps unrestricted read of their own folder: preview, replacement, and
-- the ambiguous-save reconciliation path all depend on being able to read
-- objects that no published row references yet. Everyone else gets exactly the
-- currently referenced hero and nothing more.
--
-- Folder listing: a non-owner LIST does not error, it simply matches at most the
-- one referenced object. That is the strongest outcome a per-object policy can
-- produce, and it is sufficient — there is nothing left to enumerate. No
-- application code calls .list() today.
create policy "Read own media or publicly referenced hero"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'athlete-media'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_publicly_referenced_media(name)
  )
);

-- Insert, update, and delete policies from 20260825000002 are deliberately
-- untouched: the owner's upload, replace, and cleanup paths must not change.
