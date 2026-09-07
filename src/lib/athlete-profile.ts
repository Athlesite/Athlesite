export type RecruitingStatus = "open" | "not_open" | "undecided";

export type AthleteSocialLinks = {
  instagram: string;
  twitter: string;
  tiktok: string;
  hudl: string;
  youtube: string;
  website: string;
};

export type HighlightLink = {
  label: string;
  url: string;
};

/**
 * Normalized, presentation-independent athlete profile data.
 * Shaped to map cleanly onto future database columns — no storage
 * metadata (id/timestamps) and no pre-formatted display strings live here.
 */
export type AthleteProfileData = {
  slug: string;
  firstName: string;
  lastName: string;
  sport: string;
  position: string;
  classYear: string;
  schoolOrTeam: string;
  city: string;
  state: string;
  heightIn: number | null;
  weightLb: number | null;
  bio: string;

  /**
   * Normalized (0-1) focal point for the hero/action photo, independent of
   * any CSS. ProfileHero converts this to `object-position` at render time.
   */
  heroPhotoPositionX: number;
  heroPhotoPositionY: number;
  /** Zoom multiplier for the hero photo. 1 = no zoom. See clampHeroZoom. */
  heroPhotoZoom: number;

  highlightLinks: HighlightLink[];

  recruitingStatus: RecruitingStatus;
  recruitingContact: string;
  recruitingNotes: string;

  social: AthleteSocialLinks;

  nilOpen: boolean;
  nilContact: string;
  nilInterests: string;
};

/**
 * The flat, presentational shape the existing profile-rendering
 * components (ProfileHero, ProfileRecruitingNil, etc.) already consume.
 */
export type AthleteProfileView = {
  name: string;
  sport: string;
  position: string;
  classYear: string;
  location: string;
  heightWeight: string;
  bio: string;
  highlights: HighlightLink[];
  displayUrl: string;
  routePath: string;
};

export const MIN_HERO_ZOOM = 1;
export const MAX_HERO_ZOOM = 1.8;

/** Clamps an arbitrary (possibly malformed/stored) value into the allowed hero zoom range. */
export function clampHeroZoom(value: number): number {
  if (!Number.isFinite(value)) return MIN_HERO_ZOOM;
  return Math.min(Math.max(value, MIN_HERO_ZOOM), MAX_HERO_ZOOM);
}

export function createEmptyAthleteProfile(): AthleteProfileData {
  return {
    slug: "",
    firstName: "",
    lastName: "",
    sport: "",
    position: "",
    classYear: "",
    schoolOrTeam: "",
    city: "",
    state: "",
    heightIn: null,
    weightLb: null,
    bio: "",
    heroPhotoPositionX: 0.5,
    heroPhotoPositionY: 0,
    heroPhotoZoom: MIN_HERO_ZOOM,
    highlightLinks: [],
    recruitingStatus: "undecided",
    recruitingContact: "",
    recruitingNotes: "",
    social: {
      instagram: "",
      twitter: "",
      tiktok: "",
      hudl: "",
      youtube: "",
      website: "",
    },
    nilOpen: false,
    nilContact: "",
    nilInterests: "",
  };
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function num(value: unknown, fallback: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numOrFallback(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Clamps an arbitrary value into the normalized 0-1 focal-point range, falling back when invalid. */
function clampUnitInterval(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 0), 1);
}

function normalizeRecruitingStatus(value: unknown): RecruitingStatus {
  return value === "open" || value === "not_open" || value === "undecided"
    ? value
    : "undecided";
}

function normalizeSocialLinks(value: unknown): AthleteSocialLinks {
  const defaults = createEmptyAthleteProfile().social;
  if (!value || typeof value !== "object") return defaults;
  const social = value as Partial<Record<keyof AthleteSocialLinks, unknown>>;
  return {
    instagram: str(social.instagram, defaults.instagram),
    twitter: str(social.twitter, defaults.twitter),
    tiktok: str(social.tiktok, defaults.tiktok),
    hudl: str(social.hudl, defaults.hudl),
    youtube: str(social.youtube, defaults.youtube),
    website: str(social.website, defaults.website),
  };
}

function normalizeHighlightLinks(value: unknown): HighlightLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      label: str(item.label, ""),
      url: str(item.url, ""),
    }));
}

/**
 * Normalizes an arbitrary (possibly outdated or malformed) value loaded from
 * storage into a complete, valid AthleteProfileData. Every field is
 * reconciled individually against createEmptyAthleteProfile()'s defaults —
 * deliberately not a blanket object spread, so a legacy record missing only
 * newer fields (e.g. heroPhotoZoom) keeps all of its other valid data
 * (including nested `social` and `highlightLinks` entries) instead of having
 * them clobbered by an all-or-nothing merge.
 *
 * This is what lets the data model gain new required fields over time
 * without every previously-saved draft/profile becoming unloadable.
 */
export function normalizeAthleteProfileData(value: unknown): AthleteProfileData {
  const defaults = createEmptyAthleteProfile();
  if (!value || typeof value !== "object") return defaults;
  const data = value as Partial<Record<keyof AthleteProfileData, unknown>>;

  return {
    slug: str(data.slug, defaults.slug),
    firstName: str(data.firstName, defaults.firstName),
    lastName: str(data.lastName, defaults.lastName),
    sport: str(data.sport, defaults.sport),
    position: str(data.position, defaults.position),
    classYear: str(data.classYear, defaults.classYear),
    schoolOrTeam: str(data.schoolOrTeam, defaults.schoolOrTeam),
    city: str(data.city, defaults.city),
    state: str(data.state, defaults.state),
    heightIn: num(data.heightIn, null),
    weightLb: num(data.weightLb, null),
    bio: str(data.bio, defaults.bio),

    heroPhotoPositionX: clampUnitInterval(data.heroPhotoPositionX, defaults.heroPhotoPositionX),
    heroPhotoPositionY: clampUnitInterval(data.heroPhotoPositionY, defaults.heroPhotoPositionY),
    heroPhotoZoom: clampHeroZoom(numOrFallback(data.heroPhotoZoom, defaults.heroPhotoZoom)),

    highlightLinks: normalizeHighlightLinks(data.highlightLinks),

    recruitingStatus: normalizeRecruitingStatus(data.recruitingStatus),
    recruitingContact: str(data.recruitingContact, defaults.recruitingContact),
    recruitingNotes: str(data.recruitingNotes, defaults.recruitingNotes),

    social: normalizeSocialLinks(data.social),

    nilOpen: bool(data.nilOpen, defaults.nilOpen),
    nilContact: str(data.nilContact, defaults.nilContact),
    nilInterests: str(data.nilInterests, defaults.nilInterests),
  };
}

function formatHeightWeight(heightIn: number | null, weightLb: number | null): string {
  const parts: string[] = [];
  if (heightIn != null && heightIn > 0) {
    const feet = Math.floor(heightIn / 12);
    const inches = heightIn % 12;
    parts.push(`${feet}'${inches}"`);
  }
  if (weightLb != null && weightLb > 0) {
    parts.push(`${weightLb} lbs`);
  }
  return parts.join(" · ");
}

export function toAthleteProfileView(data: AthleteProfileData): AthleteProfileView {
  const name = `${data.firstName} ${data.lastName}`.trim();
  const location = [data.city, data.state].filter(Boolean).join(", ");

  return {
    name,
    sport: data.sport,
    position: data.position,
    classYear: data.classYear,
    location,
    heightWeight: formatHeightWeight(data.heightIn, data.weightLb),
    bio: data.bio,
    highlights: data.highlightLinks,
    displayUrl: `athlesite.com/${data.slug}`,
    routePath: `/athletes/${data.slug}`,
  };
}

const SLUG_PATTERN = /^[a-z][a-z0-9-]{2,29}$/;

const RESERVED_SLUGS = new Set([
  "get-started",
  "athletes",
  "jordan-bell",
  "example",
  "api",
  "admin",
  "login",
  "signup",
  "onboarding",
]);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export function isValidSlugFormat(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !slug.includes("--");
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}
