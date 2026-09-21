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
 * Exactly the athlete fields an anonymous visitor may read — the domain-model
 * half of the approved 18-column anonymous grant (docs/ai/DECISIONS.md
 * § Anonymous reads are column-scoped).
 *
 * This exists so a public surface is *structurally incapable* of reading a
 * private field, rather than merely discouraged from it. The subtlety it
 * guards against is specific and would otherwise be invisible:
 * `toAthleteProfileData` normalizes a partial row, so on the public read path
 * the un-fetched private columns silently become `recruitingStatus:
 * "undecided"`, `nilOpen: false`, and empty contacts/socials — values
 * indistinguishable from a real athlete's choice. Rendering any of those
 * would not be "missing data", it would be a *fabricated claim* about a
 * minor. Omitting them from the type makes that a compile error.
 *
 * `schoolOrTeam` is excluded for the same reason it is excluded from the
 * grant: name + school + city + class year is a precise real-world locator
 * for a minor.
 */
export type PublicAthleteProfileFields = Omit<
  AthleteProfileData,
  | "schoolOrTeam"
  | "recruitingStatus"
  | "recruitingContact"
  | "recruitingNotes"
  | "social"
  | "nilOpen"
  | "nilContact"
  | "nilInterests"
>;

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

/**
 * The public host an athlete's link is spoken and written as.
 *
 * Deliberately a bare host with no scheme: this is what an athlete reads,
 * copies, and says out loud, not something used to build an href. Navigation
 * always uses athleteRoutePath below.
 */
export const PUBLIC_HOST = "athlesite.com";

/**
 * The canonical in-app path for an athlete's public profile: the slug at the
 * root, with no prefix (docs/ai/DECISIONS.md § The canonical public athlete
 * URL is athlesite.com/{slug}).
 *
 * The old implementation-stage `/athletes/{slug}` shape is kept working as a
 * permanent redirect (see next.config.ts) so any link shared before this
 * change still resolves — but nothing generates it any more.
 */
export function athleteRoutePath(slug: string): string {
  return `/${slug}`;
}

/**
 * The same URL as the athlete sees it written.
 *
 * Built from athleteRoutePath rather than re-templated, so the displayed URL
 * and the route it actually navigates to cannot drift apart — which is
 * exactly what happened before this checkpoint, when the product told
 * athletes `athlesite.com/{slug}` while serving `/athletes/{slug}`. The
 * invariant `displayUrl === PUBLIC_HOST + routePath` is asserted in
 * athlete-profile.test.ts.
 */
export function athleteDisplayUrl(slug: string): string {
  return `${PUBLIC_HOST}${athleteRoutePath(slug)}`;
}

export function toAthleteProfileView(data: PublicAthleteProfileFields): AthleteProfileView {
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
    displayUrl: athleteDisplayUrl(data.slug),
    routePath: athleteRoutePath(data.slug),
  };
}

const SLUG_PATTERN = /^[a-z][a-z0-9-]{2,29}$/;

/**
 * Root-level names an athlete may not claim as a slug.
 *
 * Load-bearing as of this checkpoint: athlete profiles now live at the root
 * (`/{slug}`), so this list is the only thing standing between an athlete's
 * live public URL and a future application or marketing route silently
 * shadowing it. A static segment always wins over the root dynamic segment in
 * Next's router, so adding `src/app/privacy/` later would not error — it
 * would just quietly take over `/privacy` from whichever athlete had claimed
 * it, breaking a link they had already shared.
 *
 * That is why this list covers names that are *not* routes yet. Reserving a
 * name costs nothing today (no athlete holds a slug); un-reserving one after
 * an athlete has shared their link is a live-URL migration.
 * `npm run check:slugs` asserts every existing root segment appears here, but
 * a machine check can only cover routes that already exist — the
 * forward-looking entries are the deliberate part.
 *
 * Never shrink this list (docs/ai/GUARDRAILS.md § Authority).
 */
const RESERVED_SLUGS = new Set([
  // Existing application routes.
  "get-started",
  "edit-profile",
  "athletes",
  "jordan-bell",
  "example",
  "api",
  "admin",
  "login",
  "signup",
  "onboarding",

  // Legal and policy pages the pilot will need.
  "privacy",
  "terms",

  // Marketing and company routes.
  "about",
  "contact",
  "support",
  "help",
  "pricing",
  "blog",
  "resources",

  // Account and application surfaces.
  "account",
  "settings",
  "dashboard",

  // Product-section names already used as marketing anchors.
  "recruiting",
  "nil",

  // Infrastructure hostnames that must never resolve to an athlete.
  "www",
  "app",
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
