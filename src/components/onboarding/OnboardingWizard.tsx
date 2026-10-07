"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StepProgress } from "@/components/onboarding/StepProgress";
import { WelcomeStep } from "@/components/onboarding/steps/WelcomeStep";
import { AthleteInfoStep } from "@/components/onboarding/steps/AthleteInfoStep";
import { MediaStep } from "@/components/onboarding/steps/MediaStep";
import { RecruitingStep } from "@/components/onboarding/steps/RecruitingStep";
import { BrandLinksStep } from "@/components/onboarding/steps/BrandLinksStep";
import { PreviewStep } from "@/components/onboarding/steps/PreviewStep";
import type { PhotoPreview } from "@/components/forms/FileField";
import { useInlineOtp } from "@/components/auth/useInlineOtp";
import { getCurrentUser } from "@/lib/supabase/auth";
import {
  athleteRoutePath,
  createEmptyAthleteProfile,
  type AthleteProfileData,
} from "@/lib/athlete-profile";
import { purgeOnboardingBrowserStorage } from "@/lib/onboarding-storage";
import { createProfile, checkOwnershipStatus, type SaveProfileResult } from "@/lib/profile-save";

const STEP_LABELS = ["Welcome", "Athlete Info", "Media", "Recruiting", "Brand & Links", "Preview"];

/** Where the username field lives, for sending an athlete back to fix a taken one. */
const ATHLETE_INFO_STEP = STEP_LABELS.indexOf("Athlete Info");

// `clampStepIndex` lived here to sanitise a step index read back from
// localStorage. Nothing restores a step any more — onboarding always starts at
// Welcome — so the only untrusted source it guarded against is gone with it.

export function OnboardingWizard() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [profile, setProfile] = useState<AthleteProfileData>(createEmptyAthleteProfile);

  // Photo previews are session-only (blob: object URLs) and are never written to storage.
  const [profilePhoto, setProfilePhoto] = useState<PhotoPreview>(null);
  const [actionPhoto, setActionPhoto] = useState<PhotoPreview>(null);

  // Auth lives here rather than in the Preview step so an outstanding code
  // survives stepping back to fix a field and returning — re-sending would
  // spend a rate-limited email. Nothing in this hook navigates, which is what
  // keeps the object URLs above alive through sign-in.
  const otp = useInlineOtp();

  // Set when the database rejects a username as taken. Lives here rather than
  // in a step so it survives the jump from Preview back to Athlete Info.
  const [slugError, setSlugError] = useState<string | null>(null);

  // Gates the Save button, separately from otp.authenticated. Onboarding
  // creates a profile; it must never be allowed to save into one that already
  // exists — see createProfile in profile-save.ts for the write-side
  // guarantee (a plain insert, rejected by the database if a row already
  // exists) that holds even if this check below is skipped, races, or is
  // bypassed entirely. This state only ever improves on that by redirecting
  // an existing owner, or blocking Save on a failed lookup, before they reach
  // a button that createProfile would otherwise have to refuse.
  //
  // "unknown" is a real, fail-closed state, not just "checking" — a lookup
  // error must never be read as "no profile exists". It stays retryable: an
  // athlete should not be stuck on a transient network blip with no way
  // forward but abandoning the flow.
  const [ownershipStatus, setOwnershipStatus] = useState<
    "checking" | "creatable" | "unknown"
  >("checking");
  const [ownershipAttempt, setOwnershipAttempt] = useState(0);

  // Runs once authentication succeeds, and again each time the athlete asks
  // to retry a failed check. Nothing in this wizard's OTP flow can flip
  // otp.authenticated back to false once true (there is no sign-out here),
  // so absent a retry this fires at most once per session.
  useEffect(() => {
    if (!otp.authenticated) return;
    let cancelled = false;
    // Reset synchronously so a retry immediately clears the prior "unknown"
    // error rather than leaving it visible until the new check resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOwnershipStatus("checking");

    (async () => {
      const user = await getCurrentUser();
      if (cancelled) return;
      if (!user) {
        // Should not happen immediately after otp.authenticated flips true,
        // but fail closed rather than guess if it somehow does.
        setOwnershipStatus("unknown");
        return;
      }

      const status = await checkOwnershipStatus(user.id);
      if (cancelled) return;

      if (status.status === "exists") {
        // This athlete already has a profile. Onboarding is creation-only, so
        // send them to the route that can actually show and manage it, rather
        // than leaving them on a Save button that createProfile would refuse.
        router.push("/edit-profile");
      } else if (status.status === "none") {
        setOwnershipStatus("creatable");
      } else {
        setOwnershipStatus("unknown");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [otp.authenticated, router, ownershipAttempt]);

  useEffect(() => {
    // Pre-auth onboarding state is memory-only: this wizard never restores a
    // draft and never writes one. See onboarding-storage.ts for why.
    //
    // What this one-time mount effect does instead is REMOVE what earlier builds
    // left behind — the old draft keys and the pre-Supabase per-slug profile keys
    // — so a previous athlete's personal data cannot be restored into this form or
    // left sitting in a shared browser. Onboarding entry is the right moment: it is
    // the only route that ever wrote them.
    purgeOnboardingBrowserStorage();
  }, []);

  // Revoke each object URL when it's replaced, and on unmount.
  useEffect(() => {
    return () => {
      if (profilePhoto) URL.revokeObjectURL(profilePhoto.objectUrl);
    };
  }, [profilePhoto]);

  useEffect(() => {
    return () => {
      if (actionPhoto) URL.revokeObjectURL(actionPhoto.objectUrl);
    };
  }, [actionPhoto]);

  function selectPhoto(file: File | null, setter: (value: PhotoPreview) => void) {
    // The File itself is kept, not just its name — the bytes are what gets
    // uploaded to Storage at save time.
    setter(file ? { file, fileName: file.name, objectUrl: URL.createObjectURL(file) } : null);
  }

  function goNext() {
    setStepIndex((i) => Math.min(i + 1, STEP_LABELS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * Creates the profile in Supabase and, only on success, sends the athlete to
   * their live page. A failed save leaves them on Preview with everything
   * intact — including the in-memory photo previews — so they can fix a taken
   * username and try again.
   *
   * The local draft is deliberately left in place: it is the athlete's
   * work-in-progress copy. By the time this can run, readyToCreate has
   * already confirmed this athlete owns no profile yet — an existing owner is
   * redirected to /edit-profile before ever reaching this button.
   *
   * Photos are passed only when the athlete picked one this session. An empty
   * slot means no photo for that slot yet — there is nothing to preserve or
   * remove on a row that does not exist until this call creates it.
   */
  async function handleSaveAndComplete(): Promise<SaveProfileResult> {
    const result = await createProfile(profile, {
      hero: actionPhoto?.file ?? null,
      profile: profilePhoto?.file ?? null,
    });

    if (result.ok) {
      router.push(athleteRoutePath(result.slug));
      return result;
    }

    // A taken username is the one save failure the athlete can actually fix,
    // and the field is four steps back. Take them to it rather than leaving
    // them on Preview to work out where to go. Everything else — profile data,
    // photo previews, the authenticated session — is untouched, since this is
    // a step change inside the same mounted wizard.
    if (result.field === "slug") {
      setSlugError(result.message);
      setStepIndex(ATHLETE_INFO_STEP);
    }

    return result;
  }

  // No mount gate: with nothing restored from the browser, the server render and
  // the first client render are both the same empty-profile/step-0 output, so there
  // is no hydration mismatch left to hide behind a null first paint. The previous
  // `hydrated` flag existed only for that mismatch.

  return (
    <div>
      <StepProgress labels={STEP_LABELS} currentIndex={stepIndex} />

      {stepIndex === 0 ? <WelcomeStep onNext={goNext} /> : null}

      {stepIndex === 1 ? (
        <AthleteInfoStep
          profile={profile}
          onChange={setProfile}
          onNext={goNext}
          onBack={goBack}
          slugError={slugError}
          onSlugErrorClear={() => setSlugError(null)}
        />
      ) : null}

      {stepIndex === 2 ? (
        <MediaStep
          profile={profile}
          onChange={setProfile}
          profilePhoto={profilePhoto}
          actionPhoto={actionPhoto}
          onProfilePhotoSelect={(file) => selectPhoto(file, setProfilePhoto)}
          onActionPhotoSelect={(file) => selectPhoto(file, setActionPhoto)}
          onNext={goNext}
          onBack={goBack}
        />
      ) : null}

      {stepIndex === 3 ? (
        <RecruitingStep profile={profile} onChange={setProfile} onNext={goNext} onBack={goBack} />
      ) : null}

      {stepIndex === 4 ? (
        <BrandLinksStep profile={profile} onChange={setProfile} onNext={goNext} onBack={goBack} />
      ) : null}

      {stepIndex === 5 ? (
        <PreviewStep
          profile={profile}
          actionPhoto={actionPhoto}
          otp={otp}
          canCreate={ownershipStatus === "creatable"}
          ownershipCheckFailed={otp.authenticated && ownershipStatus === "unknown"}
          onRetryOwnershipCheck={() => setOwnershipAttempt((n) => n + 1)}
          onBack={goBack}
          onSave={handleSaveAndComplete}
        />
      ) : null}
    </div>
  );
}
