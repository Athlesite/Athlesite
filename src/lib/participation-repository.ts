"use client";

import { createClient } from "@/lib/supabase/client";
import type {
  InitializeAdultParticipationResult,
  ParticipationStatus,
  RecordAcceptanceBundleResult,
} from "@/lib/participation";

/**
 * Client-side (browser) calls onto the Phase 1a participation RPCs.
 *
 * This repo has no server actions or route handlers anywhere, so every write in
 * this app is a direct browser->Supabase call under RLS — see profile-save.ts for
 * the established pattern this file follows. Every function here fails closed: an
 * RPC error (network, config, anything) is never treated as a defined success
 * value. A caller that gets back "refused" or "absent" on error cannot mistake a
 * transient failure for a resolved eligibility decision.
 */

/**
 * Calls `initialize_adult_participation`. See that function's own comment in
 * 20261008000003 for the full transition contract.
 *
 * Must be called only from an explicit user action that has already shown the
 * attestation wording — never from an effect, a session restore, or automatically
 * on mount. See AdultAcceptancePanel, the one caller of this function.
 */
export async function initializeAdultParticipation(
  attestationVersion: string,
  termsVersion: string,
  privacyVersion: string
): Promise<InitializeAdultParticipationResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("initialize_adult_participation", {
    p_attestation_version: attestationVersion,
    p_terms_version: termsVersion,
    p_privacy_version: privacyVersion,
  });

  if (error) {
    return "refused";
  }

  return data as InitializeAdultParticipationResult;
}

/**
 * Calls `record_acceptance_bundle`. Phase 1a does not yet surface a re-acceptance
 * UI — nothing today produces a version bump to react to — but the wrapper exists
 * so the RPC is directly testable and so no further app change is needed when a
 * later checkpoint does surface one.
 */
export async function recordAcceptanceBundle(
  attestationVersion: string,
  termsVersion: string,
  privacyVersion: string
): Promise<RecordAcceptanceBundleResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("record_acceptance_bundle", {
    p_attestation_version: attestationVersion,
    p_terms_version: termsVersion,
    p_privacy_version: privacyVersion,
  });

  if (error) {
    return "refused";
  }

  return data as RecordAcceptanceBundleResult;
}

/**
 * Calls `participation_status()` from the browser.
 *
 * Used by profile-save.ts's pre-check before createProfile/updateProfile — see
 * that module. Not used for `/edit-profile`'s own routing decision, which reads
 * status server-side instead (participation-repository.server.ts) so the route is
 * resolved before anything renders, with no client-side flash of the wrong state.
 *
 * Fails closed to "absent" on any error: a failed status check must never be read
 * as "this athlete turns out to be approved".
 */
export async function getParticipationStatus(): Promise<ParticipationStatus> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("participation_status");

  if (error) {
    return "absent";
  }

  return data as ParticipationStatus;
}

/**
 * Calls `unpublish_own_profile()`. The one write in this file that works
 * regardless of participation state — see that RPC's own docblock. Returns false
 * both on a genuine "no profile exists" and on any error, since neither case
 * changed anything; VisibilityOnlyPanel treats both identically.
 */
export async function unpublishOwnProfile(): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("unpublish_own_profile");

  if (error) {
    return false;
  }

  return Boolean(data);
}
