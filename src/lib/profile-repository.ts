import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  toPublicAthleteProfileRecord,
  toOwnerAthleteProfileRecord,
  type PublicAthleteProfileRecord,
  type PublicAthleteProfileRow,
  type OwnerAthleteProfileRecord,
  type AthleteProfileRow,
} from "@/lib/db-mappers";
import { ATHLETE_MEDIA_BUCKET } from "@/lib/media-paths";
import { decidePublicReadStep } from "@/lib/profile-read-decisions";

/**
 * Read access to athlete profiles.
 *
 * Visibility is decided by the database, not by this module — but as of
 * Checkpoint 5D.7 it is decided in two different ways, and the difference
 * matters:
 *
 * - **Published profiles** are read through `get_published_profile_by_slug`, a
 *   SECURITY DEFINER function that takes one slug, compares it with equality, and
 *   hard-codes `is_published = true`. `anon` has no grant on the table at all any
 *   more, so this function is the entire anonymous read surface. That is what
 *   makes "published" mean *the exact link works* rather than *the cohort is one
 *   query* — a filterless bulk read is no longer expressible.
 * - **An owner's own row** is read directly from the table under the unchanged
 *   "Owner can view own profile" policy, which is what still allows an athlete to
 *   preview their own *unpublished* profile at its real URL.
 *
 * Neither path can be talked out of its check: the function will not return an
 * unpublished row to anyone, and RLS will not return another athlete's row to a
 * signed-in caller (docs/ai/GUARDRAILS.md § Ownership). Which of the two runs is
 * decided by profile-read-decisions.ts.
 *
 * Writes live in profile-save.ts, which is client-side because the session is
 * established in the browser by the inline OTP flow.
 */

/**
 * The public projection, named explicitly so a schema drift surfaces here rather
 * than silently.
 *
 * **This list and the `returns table (...)` of
 * `get_published_profile_by_slug` in
 * supabase/migrations/20260928000001_add_published_profile_rpc.sql must stay
 * identical.** The function's declared output is the authoritative definition of
 * what is public once 5D.7 is applied; until then the live project still uses
 * `anon`'s column grant. `npm run check:columns` asserts this parity, and
 * separately pins the three 5D.7 migrations byte-for-byte by SHA-256 — so any
 * change to that SQL fails until the digest is deliberately updated and
 * re-reviewed. Run it after touching either list.
 *
 * Used for the owner-preview read below as well as documenting the function's
 * shape, so that an owner viewing their own unpublished profile receives exactly
 * the same fields a visitor would — never a wider row that could leak a private
 * column into the rendered payload.
 *
 * Everything omitted here — school, recruiting, NIL, socials, profile photo,
 * timestamps — is unreadable through either public path by design, and is
 * rendered nowhere.
 */
const PUBLIC_PROFILE_COLUMNS = `
  owner_user_id, slug,
  first_name, last_name, sport, position, class_year, city, state,
  height_in, weight_lb, bio,
  hero_photo_position_x, hero_photo_position_y, hero_photo_zoom,
  hero_photo_path, highlight_links, is_published
`;

/**
 * Looks up a profile by its public slug.
 *
 * Returns null when no row is visible to the current caller — which covers both
 * "no such slug" and "exists but is unpublished and you are not the owner".
 * Callers should treat both the same way (a 404), so that an unpublished slug is
 * not distinguishable from a free one.
 *
 * Wrapped in React's `cache` so that generateMetadata and the page component —
 * which both need the same profile — share one query per request instead of
 * issuing two. The cache is per-request, so it never leaks one visitor's row to
 * another, and it stays correct under RLS because each request builds its own
 * client from that request's cookies.
 */
export const getProfileBySlug = cache(async function getProfileBySlug(
  slug: string
): Promise<PublicAthleteProfileRecord | null> {
  const supabase = await createClient();

  // Step 1 — the published read. One slug, equality, `is_published = true`
  // enforced inside the function. This is the only path an anonymous visitor can
  // take, and it serves the overwhelmingly common case (a real, published
  // profile) in a single round trip.
  const { data: publishedRow, error: publishedError } = await supabase
    .rpc("get_published_profile_by_slug", { profile_slug: slug })
    .maybeSingle();

  if (publishedError) {
    // Surface real failures (network, misconfiguration, schema drift) rather
    // than rendering them as a missing profile. The message is Supabase's own
    // and carries no credentials.
    throw new Error(`Failed to load profile "${slug}": ${publishedError.message}`);
  }

  // Reading the session from this request's cookies. Deliberately not getUser():
  // this is not an authorization decision and must not cost a network round trip
  // on a public page. It only decides whether step 2 is worth attempting — RLS
  // re-decides what may actually be read. See profile-read-decisions.ts.
  let hasLocalSession = false;
  if (!publishedRow) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      hasLocalSession = sessionData.session !== null;
    } catch {
      // An unreadable session is simply "no session": the owner-preview step is
      // skipped and an unpublished profile 404s, exactly as it would for a
      // signed-out visitor.
      hasLocalSession = false;
    }
  }

  const step = decidePublicReadStep({
    publishedRowFound: publishedRow !== null,
    hasLocalSession,
  });

  if (step === "resolved") {
    return toPublicAthleteProfileRecord(publishedRow as unknown as PublicAthleteProfileRow);
  }

  if (step === "not-found") return null;

  // Step 2 — owner preview. Nothing published matched, but this caller has a
  // session, so their own row may be an unpublished profile at this slug. RLS
  // ("Owner can view own profile") is what restricts this to the caller's own
  // row; the filter below only says which slug is being asked about.
  //
  // Selecting PUBLIC_PROFILE_COLUMNS rather than the full row is deliberate: the
  // owner's preview must render from exactly the fields a visitor would get, so
  // no private column can reach the page payload through this path.
  const { data: ownRow, error: ownError } = await supabase
    .from("athlete_profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (ownError) {
    throw new Error(`Failed to load profile "${slug}": ${ownError.message}`);
  }

  if (!ownRow) return null;

  return toPublicAthleteProfileRecord(ownRow as unknown as PublicAthleteProfileRow);
});

/**
 * Every column, for the authenticated owner reading their own row. Named
 * explicitly rather than `select("*")`, matching PUBLIC_PROFILE_COLUMNS's
 * convention — a schema drift surfaces here rather than silently.
 */
const OWNER_PROFILE_COLUMNS = `
  id, owner_user_id, slug,
  first_name, last_name, sport, position, class_year, school_or_team, city, state,
  height_in, weight_lb, bio,
  hero_photo_position_x, hero_photo_position_y, hero_photo_zoom,
  hero_photo_path, profile_photo_path,
  highlight_links,
  recruiting_status, recruiting_contact, recruiting_notes,
  social_instagram, social_twitter, social_tiktok, social_hudl, social_youtube, social_website,
  nil_open, nil_contact, nil_interests,
  is_published, created_at, updated_at
`;

/**
 * Looks up the signed-in athlete's own profile, full row.
 *
 * `userId` must come from the current request's own authenticated session
 * (getUser(), server-side) — never from a route param, query string, or other
 * client-supplied value. The query filters on it explicitly rather than
 * relying on RLS alone to say what this call means — but RLS ("Owner can view
 * own profile": auth.uid() = owner_user_id) is what actually enforces it
 * regardless of any mistake here.
 *
 * Unlike getProfileBySlug, this is not wrapped in React's cache(): it is
 * called at most once per request today (from /edit-profile), so there is
 * nothing yet to deduplicate.
 */
export async function getOwnProfile(userId: string): Promise<OwnerAthleteProfileRecord | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("athlete_profiles")
    .select(OWNER_PROFILE_COLUMNS)
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load own profile: ${error.message}`);
  }

  if (!data) return null;

  return toOwnerAthleteProfileRecord(data as unknown as AthleteProfileRow);
}

/**
 * Turns a stored object path into a temporary URL an `<img>` can load.
 *
 * The bucket is private, so media is never served directly — a signed URL is
 * minted per render (docs/ai/GUARDRAILS.md § Storage). Signing is itself
 * authorised by the Storage read policy, which since Checkpoint 5D.7 matches on
 * the **exact object** a published profile currently references, not on the
 * owner's folder. So a non-owner can only sign the hero that is live right now:
 * a superseded photo, an orphan from a failed save, and profile-slot media are
 * all refused, and unpublishing cuts off signing immediately. The owner can still
 * sign anything in their own folder, which is what replacement and reconciliation
 * need.
 *
 * Note this means a *failed* signing attempt is a normal outcome for a stale
 * path, not necessarily an error — hence the undefined return below rather than a
 * throw.
 *
 * Returns undefined rather than throwing. A profile page is public and must
 * keep rendering if Storage is unreachable — the hero simply falls back to its
 * placeholder, exactly as it does for an athlete who never uploaded a photo.
 *
 * Note that a signed URL, once issued, is bearer access for its lifetime: it
 * bypasses RLS until it expires. The window is deliberately short.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function signMediaUrl(path: string | null): Promise<string | undefined> {
  if (!path) return undefined;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from(ATHLETE_MEDIA_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) return undefined;
    return data.signedUrl;
  } catch {
    return undefined;
  }
}
