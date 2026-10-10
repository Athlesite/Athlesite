"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  ATTESTATION_VERSION,
  TERMS_VERSION,
  PRIVACY_VERSION,
  type InitializeAdultParticipationResult,
} from "@/lib/participation";
import { initializeAdultParticipation } from "@/lib/participation-repository";

type AdultAcceptancePanelProps = {
  /**
   * Called once initialize_adult_participation returns. Never called from an
   * effect, a mount, or a session restore — only from this panel's own explicit
   * submit handler, which fires only after the athlete has clicked the button
   * below having been shown the statement above it.
   */
  onResolved: (result: InitializeAdultParticipationResult) => void;
};

/**
 * The versioned adult self-attestation statement and its one explicit action.
 *
 * This is the only place in the app that calls `initializeAdultParticipation`.
 * Deliberately a plain button click handler, not a `useEffect` keyed on some
 * upstream "is adult" flag — being authenticated, or having answered the age
 * gate earlier in the same session, is never by itself treated as evidence of
 * adulthood. The athlete must see this exact statement and press this exact
 * button.
 */
export function AdultAcceptancePanel({ onResolved }: AdultAcceptancePanelProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setSubmitting(true);
    setError(null);

    const result = await initializeAdultParticipation(
      ATTESTATION_VERSION,
      TERMS_VERSION,
      PRIVACY_VERSION
    );

    if (result === "refused") {
      setError("Couldn't confirm that. Try again in a moment.");
      setSubmitting(false);
      return;
    }

    // "initialized" | "already_initialized" | "already_initialized_acceptance_outdated"
    // all mean the athlete is adult/approved going forward — the caller proceeds the
    // same way in each case. Only "refused" stays on this screen.
    onResolved(result);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="text-base font-semibold text-foreground">Confirm you&apos;re 18 or older</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Athlesite profiles for athletes under 18 need a parent or guardian&apos;s OK first.
        By continuing, you&apos;re confirming you&apos;re 18 or older and agreeing to our
        Terms and Privacy Policy.
      </p>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      ) : null}

      <Button type="button" className="mt-4" onClick={handleAccept} disabled={submitting}>
        {submitting ? "Confirming…" : "Confirm and continue"}
      </Button>
    </div>
  );
}
