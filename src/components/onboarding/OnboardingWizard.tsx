"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StepProgress } from "@/components/onboarding/StepProgress";
import { WelcomeStep } from "@/components/onboarding/steps/WelcomeStep";
import { AgeGateStep } from "@/components/onboarding/steps/AgeGateStep";
import { AgeBlocked } from "@/components/onboarding/steps/AgeBlocked";
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
import {
  isBlockedFromOnboarding,
  mayContinueOnboarding,
  type AgeEligibility,
} from "@/lib/age-eligibility";
import { rememberAgeBlock, rememberedAgeBlock } from "@/lib/age-gate-session";
import { createProfile, checkOwnershipStatus, type SaveProfileResult } from "@/lib/profile-save";
import {
  ATTESTATION_VERSION,
  TERMS_VERSION,
  PRIVACY_VERSION,
} from "@/lib/participation";
import { initializeAdultParticipation } from "@/lib/participation-repository";

const STEP_LABELS = [
  "Welcome",
  // Asked before any profile field, so a blocked athlete has nothing retained
  // anywhere: no profile row, no Auth user (created at OTP *send*, four steps
  // later), and no browser draft. See lib/age-eligibility.ts.
  "Age",
  "Athlete Info",
  "Media",
  "Recruiting",
  "Brand & Links",
  "Preview",
];

/** Where the username field lives, for sending an athlete back to fix a taken one. */
const ATHLETE_INFO_STEP = STEP_LABELS.indexOf("Athlete Info");

// `clampStepIndex` lived here to sanitise a step index read back from
// localStorage. Nothing restores a step any more — onboarding always starts at
// Welcome — so the only untrusted source it guarded against is gone with it.

export function OnboardingWizard() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);

  // Transient, memory-only, and never persisted — not the date of birth, and not
  // this bracket either. Nothing downstream consumes it yet (Explicit Publish is
  // global, not minor-scoped), so there is nothing to store it for; persistence
  // lands with guardian approval, where an approval has to be recorded against it.
  // Seeded from the document-lifetime block so a client-side navigation away and
  // back (AgeBlocked links home, Home links here) mounts a fresh wizard that is
  // still blocked. A full reload drops the module instance and resets it.
  const [ageEligibility, setAgeEligibility] = useState<AgeEligibility | null>(
    () => rememberedAgeBlock()
  );
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

  /**
   * Whether this wizard has an accepted adult answer. Blocked answers never get here —
   * they return early from `handleAgeResolved` and render `AgeBlocked` instead — so
   * this is specifically "answered, and allowed through".
   */
  const ageAnsweredAdult = mayContinueOnboarding(ageEligibility);

  /**
   * Once an accepted adult answer has been given *and* account creation has begun, the
   * age answer is frozen for the rest of this wizard session.
   *
   * `sendEmailOtp` creates the Auth account at **send** time, so without this an
   * athlete could reach Preview, request a code, step Back to Age, and reclassify
   * themselves after the account already existed.
   *
   * Both halves are required, and the first half is the whole reason this is not just
   * `otp.sendStarted`. An athlete who arrives with an existing Supabase session has
   * `sendStarted` true from the very first render, because the account plainly exists
   * already. Locking on that alone froze an age answer that had never been given: the
   * gate rendered, Continue did nothing, and `goBack`'s floor let them step *into*
   * Athlete Info without ever answering. A session proves an account exists; it proves
   * nothing whatsoever about age. So a signed-in athlete still answers the gate, and
   * the lock engages only once there is an accepted adult answer to protect.
   */
  const ageLocked = ageAnsweredAdult && otp.sendStarted;

  /**
   * Discards everything collected in this mounted session.
   *
   * Called when an age answer resolves to a blocked bracket. Without this, an athlete
   * could answer as an adult, fill in their name, school and city, pick photos, then
   * step Back and answer as a minor — and the blocked screen would render over a
   * wizard still holding all of it in memory, with live blob URLs.
   *
   * Object URLs are released by the cleanup effects above, not revoked here directly.
   * Those effects are keyed on the preview itself, so setting it to null runs the
   * previous preview's cleanup and revokes its blob — that is the one and only place
   * either URL is ever revoked. Revoking it again here as well would be a harmless
   * no-op in practice, but it would also mean two call sites are each responsible for
   * the same release, which is exactly the kind of duplication that makes "was this
   * actually revoked once, not twice, not zero times" hard to verify by reading the
   * code. Letting the effect own it keeps there being exactly one path to revocation.
   */
  function discardOnboardingSession() {
    setProfilePhoto(null);
    setActionPhoto(null);

    // Replaces every profile field at once — identity, school, city, bio, highlight
    // links, recruiting, socials and NIL all live on this one object.
    setProfile(createEmptyAthleteProfile());
    setSlugError(null);

    // Local OTP input: typed email, typed code, any error. Not a Supabase session —
    // see the RESET action, and `ageLocked`, which keeps this path unreachable once
    // an account exists.
    otp.reset();
  }

  function handleAgeResolved(eligibility: AgeEligibility) {
    // Defence in depth: the Age step is unreachable while locked, but a stale handler
    // must not be able to reclassify either.
    if (ageLocked) return;

    setAgeEligibility(eligibility);

    // Blocked branch first, via the type predicate: it narrows `eligibility` to the two
    // blocked brackets, which `!mayContinueOnboarding(...)` cannot do — TypeScript does
    // not narrow a union through an ordinary function return.
    if (isBlockedFromOnboarding(eligibility)) {
      // Drop everything collected so far, and remember the block for this document so
      // navigating away and back does not reopen the gate.
      discardOnboardingSession();
      rememberAgeBlock(eligibility);
      return;
    }

    if (mayContinueOnboarding(eligibility)) goNext();
  }

  function goNext() {
    setStepIndex((i) => Math.min(i + 1, STEP_LABELS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    // Once the age is locked, Athlete Info is the floor: profile fields stay
    // editable, but the pre-profile steps (Welcome, Age) are closed for the rest of
    // the session. Nothing is lost — Welcome collects nothing.
    const floor = ageLocked ? ATHLETE_INFO_STEP : 0;
    setStepIndex((i) => Math.max(i - 1, floor));
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
    // Guardian-First Participation, Phase 1a: the explicit adult self-attestation,
    // called only here — after PreviewStep's own checkbox has been checked and
    // Save has been pressed — never earlier in the wizard and never from an
    // effect. Having answered the Age step as "adult" several steps ago is not,
    // by itself, treated as sufficient; this call is the actual attestation.
    //
    // "already_initialized" and "already_initialized_acceptance_outdated" both
    // mean this athlete is adult/approved going forward, so both proceed to
    // createProfile exactly like "initialized" — only "refused" stops here.
    // "refused" also means createProfile itself would refuse (profile-save.ts's
    // own pre-check), so failing early avoids an upload attempt that could not
    // have succeeded anyway.
    const participationResult = await initializeAdultParticipation(
      ATTESTATION_VERSION,
      TERMS_VERSION,
      PRIVACY_VERSION
    );

    if (participationResult === "refused") {
      return {
        ok: false,
        message: "Couldn't confirm your account. Try again in a moment.",
      };
    }

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

  // Terminal. Rendered INSTEAD of the step machinery, so a blocked athlete has no
  // Back button, no progress bar, and no control that leads onward. Placed before
  // the main return rather than inside the step switch for exactly that reason.
  if (isBlockedFromOnboarding(ageEligibility)) {
    return <AgeBlocked reason={ageEligibility} />;
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
        <AgeGateStep onResolved={handleAgeResolved} onBack={goBack} />
      ) : null}

      {stepIndex === 2 ? (
        <AthleteInfoStep
          profile={profile}
          onChange={setProfile}
          onNext={goNext}
          onBack={goBack}
          slugError={slugError}
          onSlugErrorClear={() => setSlugError(null)}
        />
      ) : null}

      {stepIndex === 3 ? (
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

      {stepIndex === 4 ? (
        <RecruitingStep profile={profile} onChange={setProfile} onNext={goNext} onBack={goBack} />
      ) : null}

      {stepIndex === 5 ? (
        <BrandLinksStep profile={profile} onChange={setProfile} onNext={goNext} onBack={goBack} />
      ) : null}

      {stepIndex === 6 ? (
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
