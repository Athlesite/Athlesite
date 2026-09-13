"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { ProfileBio } from "@/components/profile/ProfileBio";
import { ProfileHighlights } from "@/components/profile/ProfileHighlights";
import { ProfileRecruitingNil } from "@/components/profile/ProfileRecruitingNil";
import { AthleteInfoSection, validateAthleteInfo } from "@/components/edit-profile/sections/AthleteInfoSection";
import { RecruitingSection } from "@/components/edit-profile/sections/RecruitingSection";
import { BrandLinksSection } from "@/components/edit-profile/sections/BrandLinksSection";
import { HighlightsSection } from "@/components/edit-profile/sections/HighlightsSection";
import { MediaSection } from "@/components/edit-profile/sections/MediaSection";
import { PublishSection } from "@/components/edit-profile/PublishSection";
import { toAthleteProfileView, MIN_HERO_ZOOM, type AthleteProfileData } from "@/lib/athlete-profile";
import { updateProfile, type MediaSlotIntent } from "@/lib/profile-save";
import { signOutAndGetRedirectPath, navigateAfterSignOut } from "@/components/edit-profile/sign-out";
import type { OwnerAthleteProfileRecord } from "@/lib/db-mappers";
import {
  isEditable,
  afterSaveStarted,
  afterSaveSettled,
  afterFreshRecordArrived,
  saveButtonLabel,
  type EditProfileSaveState,
} from "@/components/edit-profile/save-state";

type EditProfileFormProps = {
  record: OwnerAthleteProfileRecord;
  /** Signed, short-lived URL for the hero photo. Undefined if none is stored. */
  heroPhotoUrl?: string;
  /** Signed, short-lived URL for the profile photo. Undefined if none is stored. */
  profilePhotoUrl?: string;
};

/**
 * What a media slot should currently preview: a local blob URL while
 * replacing, nothing while removing, or the signed remote URL while
 * preserving. Pure — takes the local blob URL already created for a
 * "replace" intent rather than creating one itself; see
 * useMediaReplacementSlot for where that URL's lifecycle actually lives.
 */
function resolvePreviewUrl(
  intent: MediaSlotIntent,
  replacementUrl: string | undefined,
  existingUrl: string | undefined
): string | undefined {
  if (intent.kind === "replace") return replacementUrl;
  if (intent.kind === "remove") return undefined;
  return existingUrl;
}

/**
 * One media slot's intent, plus the local blob URL lifecycle for its
 * "replace" case. The object URL is created synchronously inside the
 * setter a file picker calls — the same place OnboardingWizard's own
 * selectPhoto creates one — never inside an effect body, which would
 * trigger a cascading setState-in-effect render. A cleanup-only effect
 * (no setState in its body, only in its cleanup function) revokes the
 * previous URL whenever it changes or this component unmounts.
 */
function useMediaReplacementSlot(): {
  intent: MediaSlotIntent;
  replacementUrl: string | undefined;
  setIntent: (next: MediaSlotIntent) => void;
} {
  const [intent, setIntentState] = useState<MediaSlotIntent>({ kind: "preserve" });
  const [replacementUrl, setReplacementUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (replacementUrl) URL.revokeObjectURL(replacementUrl);
    };
  }, [replacementUrl]);

  // Stable across renders (no closed-over values that change) so it can be
  // used safely inside another effect's dependency array without that
  // effect re-firing on every render.
  const setIntent = useCallback((next: MediaSlotIntent) => {
    setIntentState(next);
    setReplacementUrl(next.kind === "replace" ? URL.createObjectURL(next.file) : undefined);
  }, []);

  return { intent, replacementUrl, setIntent };
}

/**
 * Checkpoint 5B/5C: the interactive edit surface for a returning athlete's
 * own profile.
 *
 * Seeded exclusively from the server-loaded OwnerAthleteProfileRecord — no
 * localStorage. Unlike onboarding's draft cache (which exists because
 * onboarding happens pre-auth and needs to survive a closed tab), an
 * authenticated athlete's own row is already durable server state; caching a
 * second, possibly-stale copy in the browser would only reintroduce the
 * "stale draft republished in one click" risk this project already
 * identified for onboarding, now against a live public profile instead of
 * one that does not exist yet.
 *
 * Deliberately a single page with one Save action, not a re-run of the
 * onboarding wizard: a returning athlete came here to fix something, not to
 * step through six screens again. The section components below reuse the
 * same forms/* primitives onboarding's steps do, without the step-navigation
 * chrome (StepActions, onNext/onBack) that only makes sense in a wizard.
 *
 * Media (Checkpoint 5C): `heroIntent`/`profileIntent` are the only new
 * pieces of local state — everything else needed to build a save (the
 * current, pre-attempt paths; fresh signed URLs) is read straight from the
 * `record`/`heroPhotoUrl`/`profilePhotoUrl` props rather than copied into
 * local state, specifically so nothing here can ever go stale across a
 * second save: after any save that touches media, router.refresh() re-runs
 * the server page, which re-signs both URLs and hands this component fresh
 * props on the very next render — no client-side signed-URL guessing, and
 * no hand-rolled "was this already superseded" bookkeeping. The effect
 * below resets the two intents back to "preserve" exactly when a genuinely
 * new, server-confirmed record arrives (its `updatedAt` — bumped by the
 * database on every successful write — is the signal), never on the form's
 * own optimistic local state.
 */
export function EditProfileForm({ record, heroPhotoUrl, profilePhotoUrl }: EditProfileFormProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<AthleteProfileData>(record.profile);

  // The switch is local-only until Save: flipping it changes nothing on the
  // server. `isPublished` is what the next Save will write; `persisted*`
  // reflect what is actually live right now, and only move once a save
  // actually succeeds.
  const [isPublished, setIsPublished] = useState(record.isPublished);
  const [persistedSlug, setPersistedSlug] = useState(record.profile.slug);
  const [persistedIsPublished, setPersistedIsPublished] = useState(record.isPublished);

  const heroSlot = useMediaReplacementSlot();
  const profileSlot = useMediaReplacementSlot();

  const [attempted, setAttempted] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<EditProfileSaveState>("idle");
  const [signingOut, setSigningOut] = useState(false);

  const errors = validateAthleteInfo(profile);
  const athlete = toAthleteProfileView(profile);

  const heroPreviewUrl = resolvePreviewUrl(heroSlot.intent, heroSlot.replacementUrl, heroPhotoUrl);
  const profilePreviewUrl = resolvePreviewUrl(profileSlot.intent, profileSlot.replacementUrl, profilePhotoUrl);

  // Fires only when the server confirms a genuinely new record — never on
  // this form's own local edits — so a media intent is never silently
  // cleared mid-edit, and never left stale after a save actually commits.
  //
  // This is also the ONLY path back to "idle" from "awaiting-refresh" (see
  // save-state.ts's afterFreshRecordArrived) — handleSave deliberately does
  // not clear the lock itself after a media-touching save, because
  // router.refresh() returns void: it schedules a round trip, it does not
  // wait for one. "The write finished" and "this component has the
  // refreshed baseline" are different moments, and releasing the lock only
  // here, on the second one, is what stops a second save from ever
  // reasoning about a pre-refresh previousPath (submitting it would target
  // an already-superseded path for cleanup and orphan what the first save
  // just committed) or from clobbering a media pick made while the first
  // save was still in flight (see MediaSection's `disabled` prop).
  const lastSyncedUpdatedAt = useRef(record.updatedAt);
  useEffect(() => {
    if (record.updatedAt === lastSyncedUpdatedAt.current) return;
    lastSyncedUpdatedAt.current = record.updatedAt;
    heroSlot.setIntent({ kind: "preserve" });
    profileSlot.setIntent({ kind: "preserve" });
    setSaveState(afterFreshRecordArrived());
    // Only record.updatedAt should ever re-trigger this. heroSlot/profileSlot
    // are fresh object literals every render (only their own .setIntent is
    // stabilized via useCallback), so listing them would re-fire this on
    // every render and defeat the update-triggered-only guard above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.updatedAt]);

  function updateField(next: AthleteProfileData) {
    // Any further edit after a save invalidates the last confirmation —
    // showing a stale "Saved" banner next to newly-changed, unsaved fields
    // would be misleading.
    if (successMessage) setSuccessMessage(null);
    setProfile(next);
  }

  function handlePublishChange(next: boolean) {
    if (successMessage) setSuccessMessage(null);
    setIsPublished(next);
  }

  async function handleSave() {
    setAttempted(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    // A stale collision from a previous attempt must not linger once a new
    // attempt starts — it will be re-derived fresh from this attempt's own
    // outcome, or correctly disappear if this attempt doesn't fail on slug.
    setSlugError(null);

    if (Object.keys(errors).length > 0) {
      return;
    }

    const slugChangedThisSave = profile.slug !== persistedSlug;
    const mediaTouchedThisSave = heroSlot.intent.kind !== "preserve" || profileSlot.intent.kind !== "preserve";

    setSaveState(afterSaveStarted());
    const result = await updateProfile(
      profile,
      isPublished,
      { heroPhotoPath: record.heroPhotoPath, profilePhotoPath: record.profilePhotoPath },
      { hero: heroSlot.intent, profile: profileSlot.intent }
    );

    if (!result.ok) {
      setSaveState(afterSaveSettled({ ok: false }));
      if (result.field === "slug") {
        setSlugError(result.message);
        return;
      }
      setErrorMessage(result.message);
      return;
    }

    setPersistedSlug(result.slug);
    setPersistedIsPublished(isPublished);
    setSuccessMessage(
      buildSuccessMessage(result.slug, isPublished, slugChangedThisSave, result.mediaCleanupWarning)
    );

    // A media-touching save moves to "awaiting-refresh", not "idle" — see
    // save-state.ts. Save and the media controls stay locked until the
    // effect above observes the refreshed record and releases them.
    setSaveState(afterSaveSettled({ ok: true, mediaTouched: mediaTouchedThisSave }));
    if (mediaTouchedThisSave) {
      router.refresh();
    }
  }

  /**
   * Ends the session and leaves this route entirely via a real, full-page
   * navigation (never router.push) — the guarantee that this component's own
   * React state, and Next's client Router Cache for /edit-profile, both
   * disappear rather than reappearing on a Back navigation. See sign-out.ts
   * for why the auth call and the navigation are split out and testable,
   * and for why navigation is specifically `location.replace`.
   *
   * signOutAndGetRedirectPath rejects (rather than resolving) when Supabase
   * reports a real sign-out failure — see signOutCurrentUser's own docblock
   * — so navigation only ever runs after a genuinely confirmed sign-out; a
   * failure here leaves the athlete on this page, still signed in, with a
   * recoverable error instead of a false "you're signed out" navigation.
   */
  async function handleSignOut() {
    setSigningOut(true);
    try {
      const destination = await signOutAndGetRedirectPath();
      navigateAfterSignOut(destination);
    } catch {
      setSigningOut(false);
      setErrorMessage("Couldn't sign out. Check your connection and try again.");
    }
  }

  return (
    <div>
      <Section className="border-b border-border pb-8 pt-12 sm:pt-16">
        <Container className="max-w-2xl">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Edit your Athlesite
            </h1>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="shrink-0"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>
          {persistedIsPublished ? (
            <p className="mt-4 text-sm text-muted-foreground">
              <span className="text-accent-light">●</span> Published — visible at{" "}
              <Link
                href={`/athletes/${persistedSlug}`}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {`athlesite.com/${persistedSlug}`}
              </Link>
            </p>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              <span className="text-muted-foreground/60">●</span> Not published — only you can
              see this
            </p>
          )}
        </Container>
      </Section>

      <div className="athlete-theme">
        <ProfileHero
          athlete={athlete}
          photoUrl={heroPreviewUrl}
          photoPosition={{
            x: profile.heroPhotoPositionX,
            y: profile.heroPhotoPositionY,
          }}
          photoZoom={profile.heroPhotoZoom ?? MIN_HERO_ZOOM}
        />
        <ProfileBio bio={athlete.bio} />
        <ProfileHighlights highlights={athlete.highlights} />
        <ProfileRecruitingNil athlete={athlete} />
      </div>

      <AthleteInfoSection
        profile={profile}
        onChange={updateField}
        errors={errors}
        showErrors={attempted}
        initialSlug={persistedSlug}
        slugError={slugError}
        onSlugErrorClear={() => setSlugError(null)}
      />
      <RecruitingSection profile={profile} onChange={updateField} />
      <BrandLinksSection profile={profile} onChange={updateField} />
      <HighlightsSection profile={profile} onChange={updateField} />
      <MediaSection
        profile={profile}
        onChange={updateField}
        heroIntent={heroSlot.intent}
        onHeroIntentChange={heroSlot.setIntent}
        heroPreviewUrl={heroPreviewUrl}
        hasExistingHero={record.heroPhotoPath !== null}
        profileIntent={profileSlot.intent}
        onProfileIntentChange={profileSlot.setIntent}
        profilePreviewUrl={profilePreviewUrl}
        hasExistingProfile={record.profilePhotoPath !== null}
        // Locked for the same window Save is: from the moment a save
        // begins until this component actually has that save's committed
        // paths as its new baseline (see the effect above and save-state.ts).
        // Without this, a pick made here while an earlier media save is
        // still uploading/committing/awaiting its refresh would be silently
        // discarded the moment that earlier save's refreshed record lands
        // and resets both intents.
        disabled={!isEditable(saveState)}
      />
      <PublishSection isPublished={isPublished} onChange={handlePublishChange} />

      <Section className="border-t border-border py-10">
        <Container className="max-w-2xl">
          {errorMessage ? (
            <p role="alert" className="mb-4 text-sm text-red-400">
              {errorMessage}
            </p>
          ) : null}
          {successMessage ? (
            <p role="status" className="mb-4 text-sm text-accent-light">
              {successMessage}
            </p>
          ) : null}
          <div className="flex items-center justify-end">
            <Button type="button" onClick={() => void handleSave()} disabled={!isEditable(saveState)}>
              {saveButtonLabel(saveState)}
            </Button>
          </div>
        </Container>
      </Section>
    </div>
  );
}

function buildSuccessMessage(
  slug: string,
  isPublished: boolean,
  slugChanged: boolean,
  mediaCleanupWarning?: string
): string {
  const url = `athlesite.com/${slug}`;

  let message: string;
  if (!slugChanged) {
    message = "Saved.";
  } else if (isPublished) {
    message = `Saved — your profile is now live at ${url}.`;
  } else {
    message = `Saved — your profile's link is now ${url}. It isn't public yet — publish to make it visible.`;
  }

  return mediaCleanupWarning ? `${message} ${mediaCleanupWarning}` : message;
}
