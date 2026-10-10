"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { unpublishOwnProfile } from "@/lib/participation-repository";

type VisibilityOnlyPanelProps = {
  /** Whether a profile row exists at all for this owner. */
  exists: boolean;
  /** The row's current is_published value, as read server-side. */
  isPublished: boolean;
};

/**
 * The one control available in every gated `/edit-profile` state: reduce public
 * exposure, without needing to pass the gate first.
 *
 * Deliberately narrow. This component:
 *   - never loads EditProfileForm or any other editable field
 *   - never signs a media URL
 *   - never requires adult attestation or any participation state
 *   - calls only unpublishOwnProfile(), which sets is_published=false and nothing
 *     else (see that RPC's own docblock)
 *
 * Rendered in every gated `/edit-profile` state: the "attestation-gate" state
 * (no participation row yet) and the "blocked" state (minor/declined/revoked).
 * Reducing public exposure must always remain available, including to the people
 * this checkpoint blocks from everything else.
 */
export function VisibilityOnlyPanel({ exists, isPublished }: VisibilityOnlyPanelProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reacts to a write that already happened inside handleConfirm's explicit click
  // handler — this effect performs no write itself, only the follow-up navigation
  // refresh, mirroring AdultAttestationGate's own router.refresh() pattern.
  useEffect(() => {
    if (done) {
      router.refresh();
    }
  }, [done, router]);

  if (!exists) {
    return null;
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);

    const succeeded = await unpublishOwnProfile();

    if (!succeeded) {
      setError("Couldn't make your Athlesite private. Try again in a moment.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setConfirming(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-foreground">Your Athlesite is now private.</p>
      </div>
    );
  }

  if (!isPublished) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-muted-foreground">Your Athlesite isn&apos;t public right now.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm text-foreground">Your Athlesite is public right now.</p>

      {confirming ? (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">
            Make it private? You&apos;ll need to finish the age check before you can make it
            public again.
          </p>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {error}
            </p>
          ) : null}
          <div className="mt-3 flex gap-3">
            <Button type="button" variant="secondary" onClick={handleConfirm} disabled={submitting}>
              {submitting ? "Making it private…" : "Yes, make it private"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="secondary" className="mt-3" onClick={() => setConfirming(true)}>
          Make it private
        </Button>
      )}
    </div>
  );
}
