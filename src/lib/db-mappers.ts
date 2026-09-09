import {
  clampHeroZoom,
  normalizeAthleteProfileData,
  type AthleteProfileData,
} from "@/lib/athlete-profile";

/**
 * The `public.athlete_profiles` row shape, exactly as the database defines it.
 *
 * This is the one place vendor/storage shapes are allowed to appear. The domain
 * model in athlete-profile.ts stays plain TypeScript and knows nothing about
 * Supabase or snake_case — see docs/ai/DECISIONS.md § Vendors & Infrastructure.
 *
 * Column names here must stay in step with supabase/migrations/. If they drift,
 * this file is where the mismatch should surface.
 */
export type AthleteProfileRow = {
  id: string;
  owner_user_id: string;
  slug: string;

  first_name: string;
  last_name: string;
  sport: string;
  position: string;
  class_year: string;
  school_or_team: string;
  city: string;
  state: string;
  height_in: number | null;
  weight_lb: number | null;
  bio: string;

  hero_photo_position_x: number | string;
  hero_photo_position_y: number | string;
  hero_photo_zoom: number | string;

  hero_photo_path: string | null;
  profile_photo_path: string | null;

  highlight_links: unknown;

  recruiting_status: string;
  recruiting_contact: string;
  recruiting_notes: string;

  social_instagram: string;
  social_twitter: string;
  social_tiktok: string;
  social_hudl: string;
  social_youtube: string;
  social_website: string;

  nil_open: boolean;
  nil_contact: string;
  nil_interests: string;

  is_published: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * A profile as it exists in the database: the domain data, plus the storage
 * metadata and media paths that deliberately do not live on the domain model.
 *
 * Keeps storage concerns off AthleteProfileData, which stays free of ids,
 * timestamps, and anything vendor-shaped.
 *
 * Media fields are object *paths*, never URLs. Signed URLs are generated at
 * render time (docs/ai/GUARDRAILS.md § Storage).
 */
export type AthleteProfileRecord = {
  id: string;
  ownerUserId: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  heroPhotoPath: string | null;
  profilePhotoPath: string | null;
  profile: AthleteProfileData;
};

/**
 * PostgREST can return `numeric` columns as either a JSON number or a string
 * depending on value and version, so coerce rather than trusting the type.
 * Invalid values fall through to normalizeAthleteProfileData's clamping.
 */
function numeric(value: number | string | null | undefined): number | undefined {
  if (value == null) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Database row → domain model.
 *
 * The assembled object is passed through normalizeAthleteProfileData rather
 * than returned directly. That reuses the existing field-by-field clamping and
 * defaulting (hero zoom range, focal point 0-1, recruiting status enum, nested
 * social and highlightLinks) instead of duplicating it here, so a row written
 * by an older client — or hand-edited in the SQL editor — cannot produce an
 * invalid domain object.
 */
export function toAthleteProfileData(row: AthleteProfileRow): AthleteProfileData {
  return normalizeAthleteProfileData({
    slug: row.slug,
    firstName: row.first_name,
    lastName: row.last_name,
    sport: row.sport,
    position: row.position,
    classYear: row.class_year,
    schoolOrTeam: row.school_or_team,
    city: row.city,
    state: row.state,
    heightIn: row.height_in,
    weightLb: row.weight_lb,
    bio: row.bio,

    heroPhotoPositionX: numeric(row.hero_photo_position_x),
    heroPhotoPositionY: numeric(row.hero_photo_position_y),
    heroPhotoZoom: numeric(row.hero_photo_zoom),

    highlightLinks: row.highlight_links,

    recruitingStatus: row.recruiting_status,
    recruitingContact: row.recruiting_contact,
    recruitingNotes: row.recruiting_notes,

    social: {
      instagram: row.social_instagram,
      twitter: row.social_twitter,
      tiktok: row.social_tiktok,
      hudl: row.social_hudl,
      youtube: row.social_youtube,
      website: row.social_website,
    },

    nilOpen: row.nil_open,
    nilContact: row.nil_contact,
    nilInterests: row.nil_interests,
  });
}

/** Database row → the full record, including storage metadata and media paths. */
export function toAthleteProfileRecord(row: AthleteProfileRow): AthleteProfileRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    isPublished: row.is_published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    heroPhotoPath: row.hero_photo_path,
    profilePhotoPath: row.profile_photo_path,
    profile: toAthleteProfileData(row),
  };
}

/**
 * The columns the application writes. Deliberately narrower than
 * AthleteProfileRow:
 *
 * - `id`, `created_at`, `updated_at` are the database's to manage.
 * - `hero_photo_path` / `profile_photo_path` are present only when the media
 *   actually changed. PostgREST writes only the columns in the payload, so
 *   omitting them preserves whatever the athlete already had. Sending null
 *   unconditionally would wipe their photos on the next save.
 */
export type AthleteProfileWriteRow = {
  owner_user_id: string;
  slug: string;
  first_name: string;
  last_name: string;
  sport: string;
  position: string;
  class_year: string;
  school_or_team: string;
  city: string;
  state: string;
  height_in: number | null;
  weight_lb: number | null;
  bio: string;
  hero_photo_position_x: number;
  hero_photo_position_y: number;
  hero_photo_zoom: number;
  highlight_links: { label: string; url: string }[];
  recruiting_status: string;
  recruiting_contact: string;
  recruiting_notes: string;
  social_instagram: string;
  social_twitter: string;
  social_tiktok: string;
  social_hudl: string;
  social_youtube: string;
  social_website: string;
  nil_open: boolean;
  nil_contact: string;
  nil_interests: string;
  is_published: boolean;
  hero_photo_path?: string | null;
  profile_photo_path?: string | null;
};

/**
 * Three-state media instruction, one entry per slot:
 *
 * - **absent / undefined** — preserve whatever is stored. The column is left out
 *   of the payload entirely.
 * - **a path string** — the athlete uploaded a replacement; point at it.
 * - **null** — deliberately clear the photo.
 *
 * Onboarding never produces `null` today. It cannot distinguish "removed this
 * photo" from "never picked one", because the wizard does not load an existing
 * profile's media — so treating an empty slot as a clear would delete a
 * returning athlete's photo. `null` is reserved for a future edit flow that
 * knows what was there to begin with.
 */
export type MediaPathUpdate = {
  heroPhotoPath?: string | null;
  profilePhotoPath?: string | null;
};

/**
 * Domain model → the row we write.
 *
 * `ownerUserId` is a separate argument rather than a field on
 * AthleteProfileData because ownership is not profile content — it comes from
 * the authenticated session and must never be caller-supplied. The database
 * rejects a mismatch regardless (RLS `with check (auth.uid() = owner_user_id)`),
 * but keeping it out of the domain type means there is no field for a caller to
 * set hopefully in the first place.
 *
 * `is_published` is true on every save. That matches today's product, where the
 * only save action is "Save & View My Profile" and there is no way to unpublish.
 * It must be revisited when draft/unpublish controls arrive: editing an
 * intentionally unpublished profile must not silently republish it.
 */
export function toAthleteProfileRow(
  profile: AthleteProfileData,
  ownerUserId: string,
  media: MediaPathUpdate = {}
): AthleteProfileWriteRow {
  const row: AthleteProfileWriteRow = {
    owner_user_id: ownerUserId,
    slug: profile.slug,
    first_name: profile.firstName,
    last_name: profile.lastName,
    sport: profile.sport,
    position: profile.position,
    class_year: profile.classYear,
    school_or_team: profile.schoolOrTeam,
    city: profile.city,
    state: profile.state,
    height_in: profile.heightIn,
    weight_lb: profile.weightLb,
    bio: profile.bio,

    hero_photo_position_x: profile.heroPhotoPositionX,
    hero_photo_position_y: profile.heroPhotoPositionY,
    // Clamped in the domain layer to the same 1–1.8 range as the column's
    // check constraint. If those ever drift apart, saves start failing here.
    hero_photo_zoom: clampHeroZoom(profile.heroPhotoZoom),

    highlight_links: profile.highlightLinks,

    recruiting_status: profile.recruitingStatus,
    recruiting_contact: profile.recruitingContact,
    recruiting_notes: profile.recruitingNotes,

    social_instagram: profile.social.instagram,
    social_twitter: profile.social.twitter,
    social_tiktok: profile.social.tiktok,
    social_hudl: profile.social.hudl,
    social_youtube: profile.social.youtube,
    social_website: profile.social.website,

    nil_open: profile.nilOpen,
    nil_contact: profile.nilContact,
    nil_interests: profile.nilInterests,

    is_published: true,
  };

  // Only touch a media column when the caller actually has an instruction for
  // it. `undefined` means "leave whatever is stored alone", which is different
  // from `null` meaning "clear it".
  if (media.heroPhotoPath !== undefined) {
    row.hero_photo_path = media.heroPhotoPath;
  }
  if (media.profilePhotoPath !== undefined) {
    row.profile_photo_path = media.profilePhotoPath;
  }

  return row;
}
