"use client";

import { useState } from "react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { ExampleBadge } from "@/components/profile/ExampleBadge";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { ProfileBio } from "@/components/profile/ProfileBio";
import { ProfileHighlights } from "@/components/profile/ProfileHighlights";
import { ProfileRecruitingNil } from "@/components/profile/ProfileRecruitingNil";
import type { PhotoPreview } from "@/components/forms/FileField";
import { InlineOtpForm } from "@/components/auth/InlineOtpForm";
import { maskEmail } from "@/components/auth/otpMachine";
import type { InlineOtp } from "@/components/auth/useInlineOtp";
import type { SaveProfileResult } from "@/lib/profile-save";
import {
  toAthleteProfileView,
  MIN_HERO_ZOOM,
  type AthleteProfileData,
} from "@/lib/athlete-profile";

type PreviewStepProps = {
  profile: AthleteProfileData;
  actionPhoto: PhotoPreview;
  /**
   * Auth state, owned by the wizard so an outstanding code survives stepping
   * back and forward. Saving is gated on it.
   */
  otp: InlineOtp;
  /**
   * Whether the wizard has confirmed this authenticated athlete owns no
   * profile yet. False before that check resolves, if it finds an existing
   * one (the wizard is already navigating away), and if the check itself
   * failed — a signed-in athlete never reaches an enabled Save button before
   * ownership is confirmed absent. This is a UX gate, not the safety
   * guarantee: createProfile itself cannot overwrite an existing row even if
   * this were somehow true when it should not be.
   */
  canCreate: boolean;
  /**
   * True when the ownership check itself failed (a lookup error, not "still
   * checking" and not "found an existing profile"). Fail-closed: Save stays
   * disabled, and this is surfaced as a retryable error rather than silently
   * leaving the athlete on an inert button with no explanation.
   */
  ownershipCheckFailed: boolean;
  onRetryOwnershipCheck: () => void;
  onBack: () => void;
  /** Resolves with the outcome so a failed save can be shown in place. */
  onSave: () => Promise<SaveProfileResult>;
};

export function PreviewStep({
  profile,
  actionPhoto,
  otp,
  canCreate,
  ownershipCheckFailed,
  onRetryOwnershipCheck,
  onBack,
  onSave,
}: PreviewStepProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const athlete = toAthleteProfileView(profile);

  // Still resolving whether there is an existing session. Showing the sign-in
  // block here would flash it at an athlete who is already signed in.
  const checkingSession = otp.state.status === "checking";
  const canSave = otp.authenticated && canCreate && !saving;

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    const result = await onSave();
    if (result.ok) {
      // Navigation is under way; stay disabled so the athlete cannot double-save.
      return;
    }
    if (result.field === "slug") {
      // The wizard has already sent the athlete back to the username field,
      // which unmounts this step. Showing the message here too would be a
      // second copy of an error they can no longer see.
      return;
    }
    setSaveError(result.message);
    setSaving(false);
  }

  return (
    <div>
      <Section className="border-b border-border pb-8 pt-12 sm:pt-16">
        <Container className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            This is your Athlesite.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You can still go back and change anything before you save.
          </p>
        </Container>
      </Section>

      <div className="athlete-theme">
        <ExampleBadge variant="quiet" message="Live preview · not saved yet" />
        <ProfileHero
          athlete={athlete}
          photoUrl={actionPhoto?.objectUrl}
          photoPosition={{
            x: profile.heroPhotoPositionX ?? 0.5,
            y: profile.heroPhotoPositionY ?? 0,
          }}
          photoZoom={profile.heroPhotoZoom ?? MIN_HERO_ZOOM}
        />
        <ProfileBio bio={athlete.bio} />
        <ProfileHighlights highlights={athlete.highlights} />
        <ProfileRecruitingNil athlete={athlete} />
      </div>

      <Section className="pt-0">
        <Container className="max-w-2xl">
          <div className="border-t border-border pt-6">
            {otp.authenticated ? (
              <p className="text-sm text-muted-foreground">
                <span className="text-accent-light">✓</span> Signed in as{" "}
                <span className="text-foreground">
                  {otp.state.signedInEmail ? maskEmail(otp.state.signedInEmail) : "your account"}
                </span>
              </p>
            ) : checkingSession ? null : (
              <InlineOtpForm otp={otp} />
            )}

            {ownershipCheckFailed ? (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                <p role="alert" className="text-sm text-red-400">
                  Couldn&apos;t confirm your account status. Try again before saving.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={onRetryOwnershipCheck}
                >
                  Try again
                </Button>
              </div>
            ) : null}

            {saveError ? (
              <p role="alert" className="mt-4 text-sm text-red-400">
                {saveError}
              </p>
            ) : null}

            <div className="mt-6 flex items-center justify-between gap-4">
              <Button
                type="button"
                variant="secondary"
                onClick={onBack}
                disabled={otp.busy || saving}
              >
                Back
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={!canSave}>
                {saving ? "Saving…" : "Save & View My Profile"}
              </Button>
            </div>
          </div>
        </Container>
      </Section>
    </div>
  );
}
