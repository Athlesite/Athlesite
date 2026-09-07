import {
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
 * Mirrors how StoredAthleteProfile wraps AthleteProfileData for the local draft
 * cache — same separation, different backing store.
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

// The domain → row direction lands with the save/publish path in checkpoint 4.
// It is deliberately absent here: an untested write mapper with no caller is
// worse than no write mapper.
