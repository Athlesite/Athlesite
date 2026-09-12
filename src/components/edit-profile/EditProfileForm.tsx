"use client";

import { useState } from "react";
import Link from "next/link";
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
import { PublishSection } from "@/components/edit-profile/PublishSection";
import { toAthleteProfileView, MIN_HERO_ZOOM, type AthleteProfileData } from "@/lib/athlete-profile";
import { updateProfile } from "@/lib/profile-save";
import type { OwnerAthleteProfileRecord } from "@/lib/db-mappers";

type EditProfileFormProps = {
  record: OwnerAthleteProfileRecord;
  /** Signed, short-lived URL for the hero photo. Undefined if none is stored. */
  heroPhotoUrl?: string;
};

/**
 * Checkpoint 5B: the interactive edit surface for a returning athlete's own
 * profile.
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
 * Hero/profile photo replacement and framing (position/zoom) are
 * deliberately not editable here — out of scope for this checkpoint. This
 * component never imports media-storage.ts and never sends a media column;
 * see db-mappers.ts's AthleteProfileUpdateRow for the structural guarantee.
 */
export function EditProfileForm({ record, heroPhotoUrl }: EditProfileFormProps) {
  const [profile, setProfile] = useState<AthleteProfileData>(record.profile);

  // The switch is local-only until Save: flipping it changes nothing on the
  // server. `isPublished` is what the next Save will write; `persisted*`
  // reflect what is actually live right now, and only move once a save
  // actually succeeds.
  const [isPublished, setIsPublished] = useState(record.isPublished);
  const [persistedSlug, setPersistedSlug] = useState(record.profile.slug);
  const [persistedIsPublished, setPersistedIsPublished] = useState(record.isPublished);

  const [attempted, setAttempted] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const errors = validateAthleteInfo(profile);
  const athlete = toAthleteProfileView(profile);

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

    setSaving(true);
    const result = await updateProfile(profile, isPublished);
    setSaving(false);

    if (!result.ok) {
      if (result.field === "slug") {
        setSlugError(result.message);
        return;
      }
      setErrorMessage(result.message);
      return;
    }

    setPersistedSlug(result.slug);
    setPersistedIsPublished(isPublished);
    setSuccessMessage(buildSuccessMessage(result.slug, isPublished, slugChangedThisSave));
  }

  return (
    <div>
      <Section className="border-b border-border pb-8 pt-12 sm:pt-16">
        <Container className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Edit your Athlesite
          </h1>
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
          photoUrl={heroPhotoUrl}
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
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </Container>
      </Section>
    </div>
  );
}

function buildSuccessMessage(slug: string, isPublished: boolean, slugChanged: boolean): string {
  const url = `athlesite.com/${slug}`;

  if (!slugChanged) {
    return "Saved.";
  }
  if (isPublished) {
    return `Saved — your profile is now live at ${url}.`;
  }
  return `Saved — your profile's link is now ${url}. It isn't public yet — publish to make it visible.`;
}
