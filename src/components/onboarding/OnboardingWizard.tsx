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
import { createEmptyAthleteProfile, type AthleteProfileData } from "@/lib/athlete-profile";
import { loadDraft, saveDraft, loadDraftStep, saveDraftStep } from "@/lib/onboarding-storage";
import { saveProfile, type SaveProfileResult } from "@/lib/profile-save";

const STEP_LABELS = ["Welcome", "Athlete Info", "Media", "Recruiting", "Brand & Links", "Preview"];

/** Where the username field lives, for sending an athlete back to fix a taken one. */
const ATHLETE_INFO_STEP = STEP_LABELS.indexOf("Athlete Info");

function clampStepIndex(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(Math.max(Math.trunc(numeric), 0), STEP_LABELS.length - 1);
}

export function OnboardingWizard() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
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

  useEffect(() => {
    // One-time hydration from a browser-only store (localStorage) on mount, gated
    // behind `hydrated` so the server render and the initial client render both
    // produce the same empty-draft/step-0 output before this runs.
    const draft = loadDraft();
    if (draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfile(draft);
      // Only resume a saved step alongside an actual draft — a genuinely new
      // session (no draft) always starts at Welcome, regardless of any stray
      // step value left behind.
      setStepIndex(clampStepIndex(loadDraftStep()));
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveDraft(profile);
  }, [profile, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveDraftStep(stepIndex);
  }, [stepIndex, hydrated]);

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
    setter(file ? { fileName: file.name, objectUrl: URL.createObjectURL(file) } : null);
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
   * Writes the profile to Supabase and, only on success, sends the athlete to
   * their live page. A failed save leaves them on Preview with everything
   * intact — including the in-memory photo previews — so they can fix a taken
   * username and try again.
   *
   * The local draft is deliberately left in place: it is the athlete's
   * work-in-progress copy, and there is no edit flow yet that would reload
   * their saved profile instead.
   */
  async function handleSaveAndComplete(): Promise<SaveProfileResult> {
    const result = await saveProfile(profile);

    if (result.ok) {
      router.push(`/athletes/${result.slug}`);
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

  if (!hydrated) return null;

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
          onBack={goBack}
          onSave={handleSaveAndComplete}
        />
      ) : null}
    </div>
  );
}
