import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  toPublicAthleteProfileRecord,
  type PublicAthleteProfileRecord,
  type PublicAthleteProfileRow,
} from "@/lib/db-mappers";
import { ATHLETE_MEDIA_BUCKET } from "@/lib/media-paths";

/**
 * Read access to athlete profiles.
 *
 * Visibility is decided by RLS, not by this module. The policies in
 * supabase/migrations/ allow an anonymous reader to select only rows where
 * `is_published = true`, while an authenticated athlete may additionally select
 * their own row. So an unpublished profile simply returns no rows to anyone but
 * its owner — there is no filter here to forget, and no way for a caller to opt
 * out of the check (docs/ai/GUARDRAILS.md § Ownership).
 *
 * Writes live in profile-save.ts, which is client-side because the session is
 * established in the browser by the inline OTP flow.
 */

/**
 * Exactly the columns `anon` is granted in
 * supabase/migrations/20260911000001_restrict_anon_profile_columns.sql, named
 * explicitly so a schema drift surfaces here rather than silently.
 *
 * **These two lists must stay identical.** Asking for a column `anon` cannot
 * read fails the entire query with 42501, which would turn every public profile
 * page into a 500 — not a missing field. `npm run check:columns` asserts the
 * parity; run it after touching either list.
 *
 * Everything omitted here — school, recruiting, NIL, socials, timestamps — is
 * unreadable to an anonymous caller by design, and is rendered nowhere.
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

  const { data, error } = await supabase
    .from("athlete_profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    // Surface real failures (network, misconfiguration, schema drift) rather
    // than rendering them as a missing profile. The message is Supabase's own
    // and carries no credentials.
    throw new Error(`Failed to load profile "${slug}": ${error.message}`);
  }

  if (!data) return null;

  return toPublicAthleteProfileRecord(data as unknown as PublicAthleteProfileRow);
});

/**
 * Turns a stored object path into a temporary URL an `<img>` can load.
 *
 * The bucket is private, so media is never served directly — a signed URL is
 * minted per render (docs/ai/GUARDRAILS.md § Storage). Signing is itself
 * authorised by the Storage read policy, which joins back to
 * `athlete_profiles.is_published`: an anonymous visitor can only obtain a URL
 * for a published profile's media, and the athlete can obtain one for their own
 * either way.
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
