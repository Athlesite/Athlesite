/**
 * Guardian-First Participation — pure types, versions, and routing logic.
 *
 * Deliberately has no Supabase import, so the bare `node:test` runner can exercise
 * every decision here with no DOM and no network — see profile-save-decisions.ts,
 * age-eligibility.ts, and otpMachine.ts for the same pattern elsewhere in this repo.
 * `participation-repository.ts` and `participation-repository.server.ts` are the
 * thin, untested-by-design wrappers that call the RPCs this module's types describe.
 */

/**
 * Centralized version identifiers for the adult acceptance bundle.
 *
 * These are what gets pinned into evidence at attestation time (see
 * `initialize_adult_participation` in 20261008000003). Bumping any one of them is a
 * deliberate product/legal act — see docs/ai/DECISIONS.md § Material policy changes
 * gate expanded data use — never a casual edit. Centralized here, rather than
 * inlined at each call site, so there is exactly one place that change happens and
 * one place a test can assert against.
 */
export const ATTESTATION_VERSION = "2026-10-08";
export const TERMS_VERSION = "2026-10-08";
export const PRIVACY_VERSION = "2026-10-08";

/**
 * Routing-relevant participation status, mirroring `public.participation_status()`'s
 * return contract exactly. "absent" covers both "no session" and "session, no row" —
 * the RPC itself returns "absent" for a null `auth.uid()`, so this type does not
 * separately model "not signed in".
 */
export type ParticipationStatus =
  | "absent"
  | "adult_approved"
  | "minor_pending"
  | "minor_approved"
  | "minor_declined"
  | "revoked"
  | "expired";

/** Mirrors `initialize_adult_participation`'s return contract exactly. */
export type InitializeAdultParticipationResult =
  | "initialized"
  | "already_initialized"
  | "already_initialized_acceptance_outdated"
  | "refused";

/** Mirrors `record_acceptance_bundle`'s return contract exactly. */
export type RecordAcceptanceBundleResult = "recorded" | "already_recorded" | "refused";

/**
 * Every status except `adult_approved` is a gate: the athlete cannot reach the
 * editor, but reducing public exposure must still be available to them (see
 * `unpublish_own_profile`'s own docblock). `absent` is included deliberately — an
 * authenticated owner who has simply never attested is just as gated as a declined
 * or revoked minor, for exactly the same reason: no durable write access yet.
 */
export function isGatedParticipationStatus(status: ParticipationStatus): boolean {
  return status !== "adult_approved";
}

/**
 * The five states `/edit-profile` resolves to, in the order its page component
 * checks them. Pure so the routing decision is testable without a server component,
 * a session, or a database.
 */
export type EditProfileRoute =
  | "sign-in"
  | "attestation-gate"
  | "blocked"
  | "onboarding-redirect"
  | "editor";

/**
 * Resolves which of the five `/edit-profile` states applies.
 *
 * Order matters and is fixed, matching the architecture exactly:
 *   1. no session -> sign-in
 *   2. session, participation absent -> attestation-gate (never auto-initialized)
 *   3. session, minor/* or revoked or expired -> blocked
 *   4. adult_approved, no profile -> onboarding-redirect
 *   5. adult_approved, has profile -> editor
 *
 * This function makes no Supabase call and performs no write. It is handed
 * already-resolved facts (a session exists, the status RPC's answer, whether a
 * profile row exists) and returns a label; the page component is what actually
 * fetches those facts and acts on the label.
 */
export function resolveEditProfileRoute(params: {
  hasSession: boolean;
  status: ParticipationStatus;
  hasProfile: boolean;
}): EditProfileRoute {
  const { hasSession, status, hasProfile } = params;

  if (!hasSession) {
    return "sign-in";
  }

  if (status === "absent") {
    return "attestation-gate";
  }

  if (status === "adult_approved") {
    return hasProfile ? "editor" : "onboarding-redirect";
  }

  // minor_pending | minor_approved | minor_declined | revoked | expired
  return "blocked";
}
