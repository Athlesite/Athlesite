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
import {
  toAthleteProfileView,
  MIN_HERO_ZOOM,
  type AthleteProfileData,
} from "@/lib/athlete-profile";

type PreviewStepProps = {
  profile: AthleteProfileData;
  actionPhoto: PhotoPreview;
  onBack: () => void;
  onSave: () => void;
};

export function PreviewStep({ profile, actionPhoto, onBack, onSave }: PreviewStepProps) {
  const [saving, setSaving] = useState(false);
  const athlete = toAthleteProfileView(profile);

  function handleSave() {
    setSaving(true);
    onSave();
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
          <div className="flex items-center justify-between gap-4 border-t border-border pt-6">
            <Button type="button" variant="secondary" onClick={onBack}>
              Back
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save & View My Profile"}
            </Button>
          </div>
        </Container>
      </Section>
    </div>
  );
}
