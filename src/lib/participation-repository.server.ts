import { createClient } from "@/lib/supabase/server";
import type { ParticipationStatus } from "@/lib/participation";

/**
 * Server-side (Server Component) calls onto the Phase 1a participation surface.
 *
 * Used by `/edit-profile`'s page component to resolve `resolveEditProfileRoute`'s
 * inputs before anything renders — no client-side flash of the wrong gated state.
 * Mirrors profile-repository.ts's own split between a server read path and
 * profile-save.ts's client write path.
 */

/**
 * Calls `participation_status()` from the server. Fails closed to "absent" on any
 * error, exactly like the client-side wrapper — a failed status check must never
 * be read as "this athlete turns out to be approved".
 */
export async function getParticipationStatusServer(): Promise<ParticipationStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("participation_status");

  if (error) {
    return "absent";
  }

  return data as ParticipationStatus;
}

/**
 * The minimum read needed to drive the gated-state visibility control: whether a
 * profile row exists at all, and if so whether it is currently published.
 *
 * Deliberately not `getOwnProfile` (profile-repository.ts) — that loads all 35
 * columns and is paired with signing media URLs for the editor. A gated athlete
 * never reaches the editor, so there is nothing to sign and nothing else to read.
 */
export async function getOwnPublicationState(
  userId: string
): Promise<{ exists: boolean; isPublished: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("athlete_profiles")
    .select("is_published")
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return { exists: false, isPublished: false };
  }

  return { exists: true, isPublished: data.is_published };
}
