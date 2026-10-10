"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AgeGateStep } from "@/components/onboarding/steps/AgeGateStep";
import { AgeBlocked } from "@/components/onboarding/steps/AgeBlocked";
import { AdultAcceptancePanel } from "@/components/participation/AdultAcceptancePanel";
import { VisibilityOnlyPanel } from "@/components/participation/VisibilityOnlyPanel";
import { isBlockedFromOnboarding, type AgeEligibility } from "@/lib/age-eligibility";
import type { InitializeAdultParticipationResult } from "@/lib/participation";

type AdultAttestationGateProps = {
  /**
   * So the "reducing public exposure is always available" principle holds even
   * in this gate: an owner with an existing published profile but no
   * participation row yet can still make it private without attesting first.
   */
  publicationState: { exists: boolean; isPublished: boolean };
};

/**
 * Rendered by `/edit-profile` when an authenticated owner has no participation
 * row at all — the "attestation-gate" route from resolveEditProfileRoute.
 *
 * Reuses the existing onboarding `AgeGateStep` rather than inventing a second age
 * question: the exact-DOB-is-transient, under-18-is-blocked behaviour is identical
 * here, for a returning owner who never went through onboarding's own age step
 * (or whose session predates it). Resolving "adult" here still does NOT initialize
 * participation by itself — see AdultAcceptancePanel, the one place that call is
 * made, which requires its own separate explicit action.
 *
 * Why this exists as a distinct component from onboarding's own adult path: this
 * component's age question has no surrounding wizard, no profile fields collected
 * either side of it, and nothing to discard if the answer turns out to be
 * under-18 — unlike OnboardingWizard's `discardOnboardingSession`, there is no
 * session state here to clear in the first place.
 */
export function AdultAttestationGate({ publicationState }: AdultAttestationGateProps) {
  const router = useRouter();
  const [ageEligibility, setAgeEligibility] = useState<AgeEligibility | null>(null);
  const [done, setDone] = useState(false);

  // Refreshes the route ONLY after the explicit acceptance panel's own submit
  // handler has already resolved — never on mount, never from a session restore.
  // This mirrors EditProfileSignIn's own router.refresh() pattern: the effect
  // reacts to a state change that already happened inside a user-initiated
  // handler, it does not itself perform the privileged write.
  useEffect(() => {
    if (done) {
      router.refresh();
    }
  }, [done, router]);

  function handleAgeResolved(eligibility: AgeEligibility) {
    setAgeEligibility(eligibility);
  }

  function handleAcceptanceResolved(result: InitializeAdultParticipationResult): void {
    // The caller treats every non-"refused" result identically (see
    // AdultAcceptancePanel's own docblock) — this handler just needs to know the
    // attempt resolved, not which of the three success variants it was.
    void result;
    setDone(true);
  }

  // Every branch below renders through this one layout, with VisibilityOnlyPanel
  // always present underneath. This is the fix for the finding Codex caught: an
  // earlier version returned <AgeBlocked> directly for a blocked age answer,
  // which — being a separate return statement — skipped the panel entirely. A
  // blocked-but-published owner (under_13 or minor) must still be able to make
  // their profile private; "reducing public exposure is always available" cannot
  // have a branch that quietly drops it.
  let primary: ReactNode;

  if (ageEligibility && isBlockedFromOnboarding(ageEligibility)) {
    primary = <AgeBlocked reason={ageEligibility} />;
  } else if (ageEligibility === "adult") {
    primary = <AdultAcceptancePanel onResolved={handleAcceptanceResolved} />;
  } else {
    primary = <AgeGateStep onResolved={handleAgeResolved} onBack={() => router.push("/")} />;
  }

  return (
    <div>
      {primary}

      <div className="mx-auto mt-8 max-w-xl px-4">
        <VisibilityOnlyPanel
          exists={publicationState.exists}
          isPublished={publicationState.isPublished}
        />
      </div>
    </div>
  );
}
