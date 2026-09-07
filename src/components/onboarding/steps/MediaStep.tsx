"use client";

import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { FileField, type PhotoPreview } from "@/components/forms/FileField";
import { RepeatingUrlListField } from "@/components/forms/RepeatingUrlListField";
import { RangeField } from "@/components/forms/RangeField";
import { StepActions } from "@/components/onboarding/StepActions";
import { ProfileHero } from "@/components/profile/ProfileHero";
import {
  toAthleteProfileView,
  MIN_HERO_ZOOM,
  MAX_HERO_ZOOM,
  type AthleteProfileData,
  type HighlightLink,
} from "@/lib/athlete-profile";

type MediaStepProps = {
  profile: AthleteProfileData;
  onChange: (profile: AthleteProfileData) => void;
  profilePhoto: PhotoPreview;
  actionPhoto: PhotoPreview;
  onProfilePhotoSelect: (file: File | null) => void;
  onActionPhotoSelect: (file: File | null) => void;
  onNext: () => void;
  onBack: () => void;
};

export function MediaStep({
  profile,
  onChange,
  profilePhoto,
  actionPhoto,
  onProfilePhotoSelect,
  onActionPhotoSelect,
  onNext,
  onBack,
}: MediaStepProps) {
  function updateHighlights(links: HighlightLink[]) {
    onChange({ ...profile, highlightLinks: links });
  }

  const athlete = toAthleteProfileView(profile);

  return (
    <div>
      <Section className="pb-0 pt-12 sm:pt-16">
        <Container className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Media
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Photos preview here for this session only — nothing is uploaded or saved
            permanently yet.
          </p>
        </Container>
      </Section>

      <Section className="pt-8">
        <Container className="max-w-2xl">
          <div className="space-y-8">
            <FileField
              label="Profile photo"
              hint="A clear headshot-style photo."
              value={profilePhoto}
              onSelect={onProfilePhotoSelect}
            />
            <FileField
              label="Hero / action photo"
              hint="Your main photo — this is what appears at the top of your Athlesite."
              value={actionPhoto}
              onSelect={onActionPhotoSelect}
            />
          </div>
        </Container>

        {actionPhoto ? (
          <div className="athlete-theme mt-8">
            <ProfileHero
              athlete={athlete}
              photoUrl={actionPhoto.objectUrl}
              photoPosition={{
                x: profile.heroPhotoPositionX ?? 0.5,
                y: profile.heroPhotoPositionY ?? 0,
              }}
              photoZoom={profile.heroPhotoZoom ?? MIN_HERO_ZOOM}
            />
            <Container className="max-w-2xl py-6">
              <p className="text-sm font-medium text-foreground">Position your photo</p>
              <p className="mt-1 text-xs text-muted-foreground">
                This is the exact framing your hero photo will use. Adjust it until you look
                right.
              </p>
              <div className="mt-4 grid gap-6 sm:grid-cols-3">
                <RangeField
                  label="Horizontal position"
                  value={profile.heroPhotoPositionX ?? 0.5}
                  onChange={(v) => onChange({ ...profile, heroPhotoPositionX: v })}
                />
                <RangeField
                  label="Vertical position"
                  value={profile.heroPhotoPositionY ?? 0}
                  onChange={(v) => onChange({ ...profile, heroPhotoPositionY: v })}
                />
                <RangeField
                  label="Zoom"
                  // Secondary safeguard only — the real fix is normalizing data
                  // at the storage boundary (see loadDraft/loadAthleteProfile),
                  // so this field should never actually be undefined here.
                  value={profile.heroPhotoZoom ?? MIN_HERO_ZOOM}
                  onChange={(v) => onChange({ ...profile, heroPhotoZoom: v })}
                  min={MIN_HERO_ZOOM}
                  max={MAX_HERO_ZOOM}
                  step={0.01}
                  formatValue={(v) => `${(v ?? MIN_HERO_ZOOM).toFixed(2)}×`}
                />
              </div>
            </Container>
          </div>
        ) : null}

        <Container className="max-w-2xl">
          <div className="mt-8 border-t border-border pt-8">
            <RepeatingUrlListField
              label="Highlight & video links"
              hint="Add links to Hudl, YouTube, or any highlight video. Your first link becomes the featured highlight on your profile — keep titles short and clear (40 characters max)."
              value={profile.highlightLinks}
              onChange={updateHighlights}
            />
          </div>

          <StepActions onBack={onBack} onNext={onNext} />
        </Container>
      </Section>
    </div>
  );
}
