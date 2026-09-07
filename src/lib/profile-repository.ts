import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  toAthleteProfileRecord,
  type AthleteProfileRecord,
  type AthleteProfileRow,
} from "@/lib/db-mappers";

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
 * Writes land in checkpoint 4.
 */

/** Every column, named explicitly so a schema drift surfaces here rather than silently. */
const PROFILE_COLUMNS = `
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
): Promise<AthleteProfileRecord | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("athlete_profiles")
    .select(PROFILE_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    // Surface real failures (network, misconfiguration, schema drift) rather
    // than rendering them as a missing profile. The message is Supabase's own
    // and carries no credentials.
    throw new Error(`Failed to load profile "${slug}": ${error.message}`);
  }

  if (!data) return null;

  return toAthleteProfileRecord(data as unknown as AthleteProfileRow);
});
