"use client";

import { createClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/supabase/auth";
import { toAthleteProfileRow, type MediaPathUpdate } from "@/lib/db-mappers";
import { uploadPhoto, deleteObjects } from "@/lib/media-storage";
import type { AthleteProfileData } from "@/lib/athlete-profile";

/**
 * Save/publish an athlete's profile to Supabase, including media.
 *
 * Runs as the signed-in athlete from the browser, so RLS is the enforcement
 * layer rather than anything in this file. There is no service-role key in this
 * project by design (docs/ai/DECISIONS.md § Auth & Ownership).
 *
 * Reads live in profile-repository.ts, which is server-side. This module is the
 * write half and is client-only, because the session is established in the
 * browser by the inline OTP flow.
 *
 * Ordering matters more than anything else here. Uploads go to fresh, unique
 * paths and therefore change nothing an existing profile points at; the
 * database upsert is the single moment an athlete's live photo changes. A save
 * that fails after a successful upload leaves the published profile exactly as
 * it was, with an unreferenced object nobody can see.
 */

/** Photos the athlete picked this session. Null means "did not pick one". */
export type PhotoUploads = {
  hero: File | null;
  profile: File | null;
};

export type SaveProfileResult =
  | { ok: true; slug: string }
  | { ok: false; message: string; field?: "slug" };

/**
 * Postgres error codes we can say something useful about. Anything else gets a
 * calm fallback — a raw PostgREST message must never reach an athlete.
 */
function describeError(code: string | undefined, message: string): SaveProfileResult {
  // Unique violation. Two unique constraints exist on this table, so decide
  // which one from the constraint name in the message.
  if (code === "23505") {
    if (message.includes("slug")) {
      return {
        ok: false,
        field: "slug",
        message: "That username is already taken. Go back and choose another.",
      };
    }
    return {
      ok: false,
      message: "You already have a profile. Refresh the page and try again.",
    };
  }

  // RLS rejected the write — no session, or owner_user_id did not match auth.uid().
  if (code === "42501") {
    return { ok: false, message: "You need to be signed in to save your Athlesite." };
  }

  // A column check constraint failed (hero zoom range, recruiting status enum).
  if (code === "23514") {
    return { ok: false, message: "Something in your profile isn't valid. Go back and review it." };
  }

  return { ok: false, message: "Couldn't save your Athlesite. Try again in a moment." };
}

/** The media paths the athlete's stored profile currently points at, if any. */
type StoredMedia = { heroPhotoPath: string | null; profilePhotoPath: string | null };

/**
 * Reads the athlete's own current media paths so superseded objects can be
 * cleaned up after a successful save.
 *
 * Permitted by the existing "Owner can view own profile" policy — a read, not a
 * write, and scoped to their own row. Only called when a photo actually
 * changed: with nothing to supersede there is nothing to look up, so an
 * ordinary repeat save costs no extra round trip.
 */
async function readStoredMedia(userId: string): Promise<StoredMedia | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("athlete_profiles")
      .select("hero_photo_path, profile_photo_path")
      .eq("owner_user_id", userId)
      .maybeSingle();

    if (error) return null;
    if (!data) return { heroPhotoPath: null, profilePhotoPath: null };

    return {
      heroPhotoPath: data.hero_photo_path,
      profilePhotoPath: data.profile_photo_path,
    };
  } catch {
    return null;
  }
}

/**
 * Creates the athlete's profile row, or updates it if they already have one.
 *
 * The conflict target is `owner_user_id`, not the primary key. It is unique but
 * not the PK, and PostgREST resolves conflicts on the PK by default — without
 * this, a repeat save would attempt a second insert and fail rather than update.
 *
 * Ownership comes from getCurrentUser(), never from the profile argument, so a
 * caller cannot aim this at somebody else's row. RLS would reject that anyway.
 */
export async function saveProfile(
  profile: AthleteProfileData,
  photos: PhotoUploads = { hero: null, profile: null }
): Promise<SaveProfileResult> {
  let userId: string;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, message: "You need to be signed in to save your Athlesite." };
    }
    userId = user.id;
  } catch {
    return { ok: false, message: "Couldn't confirm your account. Try again in a moment." };
  }

  const mediaChanged = Boolean(photos.hero || photos.profile);

  // Fetch the outgoing paths *before* uploading, so a superseded object can be
  // found afterwards. Abort if this fails rather than uploading blind: the old
  // object would become unfindable, and the athlete gains nothing by proceeding.
  let stored: StoredMedia | null = null;
  if (mediaChanged) {
    stored = await readStoredMedia(userId);
    if (!stored) {
      return { ok: false, message: "Couldn't load your current photos. Try again in a moment." };
    }
  }

  // Upload to fresh paths. Nothing the live profile references is touched, so a
  // failure here leaves the athlete exactly where they were.
  const media: MediaPathUpdate = {};
  const supersededPaths: string[] = [];

  if (photos.hero) {
    const upload = await uploadPhoto(userId, "hero", photos.hero);
    if (!upload.ok) return { ok: false, message: upload.message };
    media.heroPhotoPath = upload.path;
    if (stored?.heroPhotoPath) supersededPaths.push(stored.heroPhotoPath);
  }

  if (photos.profile) {
    const upload = await uploadPhoto(userId, "profile", photos.profile);
    if (!upload.ok) return { ok: false, message: upload.message };
    media.profilePhotoPath = upload.path;
    if (stored?.profilePhotoPath) supersededPaths.push(stored.profilePhotoPath);
  }

  const row = toAthleteProfileRow(profile, userId, media);

  // The commit point. Until this succeeds, the athlete's published profile —
  // photo included — is unchanged.
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("athlete_profiles")
      .upsert(row, { onConflict: "owner_user_id" })
      .select("slug")
      .single();

    if (error) {
      return describeError(error.code, `${error.message} ${error.details ?? ""}`.toLowerCase());
    }

    if (!data?.slug) {
      return { ok: false, message: "Saved, but couldn't confirm your profile link. Try again." };
    }

    // Only now is the old object genuinely unreferenced. Best-effort: the save
    // has already succeeded and a leftover object is invisible to everyone.
    await deleteObjects(supersededPaths);

    return { ok: true, slug: data.slug };
  } catch {
    return { ok: false, message: "Couldn't reach Athlesite. Check your connection and try again." };
  }
}
