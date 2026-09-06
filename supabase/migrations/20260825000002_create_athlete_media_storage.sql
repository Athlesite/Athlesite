-- Private bucket for athlete profile/hero media. Deliberately NOT public —
-- visibility is enforced by the RLS policy below (joined to
-- athlete_profiles.is_published), not by bucket-level public access.
-- MIME type and 5MB size limits are enforced here at the bucket level as a
-- second layer, in addition to client-side validation before upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'athlete-media',
  'athlete-media',
  false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: {owner_user_id}/profile-photo.<ext>, {owner_user_id}/hero-photo.<ext>
-- One current file per slot; a new upload overwrites the same path.

-- Anyone may read media belonging to a published profile. An authenticated
-- athlete may also read their own media before publishing. This is what
-- createSignedUrl() checks against when generating a delivery URL for
-- <img src> — see src/lib/supabase (Phase B) for the render-time helper.
create policy "Read media for published or own profile"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'athlete-media'
  and exists (
    select 1
    from public.athlete_profiles p
    where p.owner_user_id::text = (storage.foldername(name))[1]
      and (p.is_published = true or p.owner_user_id = (select auth.uid()))
  )
);

-- An athlete may upload media only into their own folder.
create policy "Owner can upload own media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'athlete-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- An athlete may replace (upsert) only their own media.
create policy "Owner can update own media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'athlete-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'athlete-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- An athlete may delete only their own media.
create policy "Owner can delete own media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'athlete-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
