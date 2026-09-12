"use client";

import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { RangeField } from "@/components/forms/RangeField";
import { MediaSlotField } from "@/components/edit-profile/MediaSlotField";
import { MIN_HERO_ZOOM, MAX_HERO_ZOOM, type AthleteProfileData } from "@/lib/athlete-profile";
import type { MediaSlotIntent } from "@/lib/profile-save";

type MediaSectionProps = {
  profile: AthleteProfileData;
  onChange: (profile: AthleteProfileData) => void;

  heroIntent: MediaSlotIntent;
  onHeroIntentChange: (intent: MediaSlotIntent) => void;
  heroPreviewUrl?: string;
  hasExistingHero: boolean;

  profileIntent: MediaSlotIntent;
  onProfileIntentChange: (intent: MediaSlotIntent) => void;
  profilePreviewUrl?: string;
  hasExistingProfile: boolean;

  /**
   * True from the moment a save begins until the caller's own baseline
   * (currentMedia, previousPath) reflects that save's committed result —
   * see EditProfileForm. Without this, a pick made here while an earlier
   * media save is still uploading/committing/refreshing would be silently
   * discarded the instant that earlier save's refreshed record lands and
   * resets both intents back to "preserve".
   */
  disabled?: boolean;
};

/**
 * Hero/profile photo replace, remove, and (hero only) framing.
 *
 * Deliberately split out of what onboarding's MediaStep bundles this with:
 * MediaStep only ever renders a freshly-picked File (its own preview and
 * framing controls both gate on that), with no concept of an existing
 * remote asset or an explicit remove — reusing it directly would mean
 * teaching it a second, unrelated rendering mode. This section is built
 * from the same underlying `forms/*` primitives (RangeField, unchanged)
 * without importing MediaStep at all.
 *
 * Highlight links live in their own HighlightsSection (5B) — this section
 * is media only.
 */
export function MediaSection({
  profile,
  onChange,
  heroIntent,
  onHeroIntentChange,
  heroPreviewUrl,
  hasExistingHero,
  profileIntent,
  onProfileIntentChange,
  profilePreviewUrl,
  hasExistingProfile,
  disabled = false,
}: MediaSectionProps) {
  // A hero will exist after Save either because the existing one is being
  // preserved, or because a replacement was picked — never because of
  // "remove", regardless of whether a replacement was ever considered.
  const heroWillExist = heroIntent.kind === "replace" || (heroIntent.kind === "preserve" && hasExistingHero);

  return (
    <Section className="py-10 border-t border-border">
      <Container className="max-w-2xl">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Photos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your hero photo appears at the top of your Athlesite. Your profile photo is stored on
          your account but isn&apos;t shown publicly yet.
        </p>

        <div className="mt-6 space-y-8">
          <MediaSlotField
            label="Hero / action photo"
            hint="This is your main photo — it appears at the top of your Athlesite."
            previewUrl={heroPreviewUrl}
            hasExisting={hasExistingHero}
            intent={heroIntent}
            onSelect={(file) => onHeroIntentChange({ kind: "replace", file })}
            onRemove={() => onHeroIntentChange({ kind: "remove" })}
            onUndo={() => onHeroIntentChange({ kind: "preserve" })}
            disabled={disabled}
          />

          <MediaSlotField
            label="Profile photo"
            hint="A clear headshot-style photo."
            previewUrl={profilePreviewUrl}
            hasExisting={hasExistingProfile}
            intent={profileIntent}
            onSelect={(file) => onProfileIntentChange({ kind: "replace", file })}
            onRemove={() => onProfileIntentChange({ kind: "remove" })}
            onUndo={() => onProfileIntentChange({ kind: "preserve" })}
            disabled={disabled}
          />
        </div>

        {heroWillExist ? (
          <div className="mt-8 border-t border-border pt-8">
            <p className="text-sm font-medium text-foreground">Position your hero photo</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Adjust the framing until it looks right — see the live preview above.
            </p>
            <div className="mt-4 grid gap-6 sm:grid-cols-3">
              <RangeField
                label="Horizontal position"
                value={profile.heroPhotoPositionX}
                onChange={(v) => onChange({ ...profile, heroPhotoPositionX: v })}
                disabled={disabled}
              />
              <RangeField
                label="Vertical position"
                value={profile.heroPhotoPositionY}
                onChange={(v) => onChange({ ...profile, heroPhotoPositionY: v })}
                disabled={disabled}
              />
              <RangeField
                label="Zoom"
                value={profile.heroPhotoZoom}
                onChange={(v) => onChange({ ...profile, heroPhotoZoom: v })}
                min={MIN_HERO_ZOOM}
                max={MAX_HERO_ZOOM}
                step={0.01}
                formatValue={(v) => `${v.toFixed(2)}×`}
                disabled={disabled}
              />
            </div>
          </div>
        ) : null}
      </Container>
    </Section>
  );
}
