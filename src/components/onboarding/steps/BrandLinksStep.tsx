"use client";

import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { TextField } from "@/components/forms/TextField";
import { TextAreaField } from "@/components/forms/TextAreaField";
import { Switch } from "@/components/forms/Switch";
import { StepActions } from "@/components/onboarding/StepActions";
import type { AthleteProfileData } from "@/lib/athlete-profile";

type BrandLinksStepProps = {
  profile: AthleteProfileData;
  onChange: (profile: AthleteProfileData) => void;
  onNext: () => void;
  onBack: () => void;
};

export function BrandLinksStep({ profile, onChange, onNext, onBack }: BrandLinksStepProps) {
  function updateSocial(key: keyof AthleteProfileData["social"], value: string) {
    onChange({ ...profile, social: { ...profile.social, [key]: value } });
  }

  return (
    <Section className="py-12 sm:py-16">
      <Container className="max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Brand &amp; Links
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your social presence and NIL/business openness. All optional.
        </p>

        <div className="mt-8">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Social
          </h3>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <TextField
              label="Instagram"
              value={profile.social.instagram}
              onChange={(v) => updateSocial("instagram", v)}
              placeholder="@handle or URL"
            />
            <TextField
              label="X / Twitter"
              value={profile.social.twitter}
              onChange={(v) => updateSocial("twitter", v)}
              placeholder="@handle or URL"
            />
            <TextField
              label="TikTok"
              value={profile.social.tiktok}
              onChange={(v) => updateSocial("tiktok", v)}
              placeholder="@handle or URL"
            />
            <TextField
              label="Hudl"
              value={profile.social.hudl}
              onChange={(v) => updateSocial("hudl", v)}
              placeholder="Profile URL"
              type="url"
            />
            <TextField
              label="YouTube"
              value={profile.social.youtube}
              onChange={(v) => updateSocial("youtube", v)}
              placeholder="Channel URL"
              type="url"
            />
            <TextField
              label="Personal website"
              value={profile.social.website}
              onChange={(v) => updateSocial("website", v)}
              placeholder="https://…"
              type="url"
            />
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-8">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            NIL &amp; Business
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            This becomes the NIL &amp; business contact point on your profile — how brands
            reach you about partnerships.
          </p>
          <div className="mt-4 space-y-6">
            <Switch
              label="Open to NIL & business opportunities"
              description="Lets brands know you're open to partnerships."
              checked={profile.nilOpen}
              onChange={(v) => onChange({ ...profile, nilOpen: v })}
            />
            <TextField
              label="Business / NIL contact"
              value={profile.nilContact}
              onChange={(v) => onChange({ ...profile, nilContact: v })}
              placeholder="e.g. brand@email.com"
              hint="Email or contact method brands should use. Shown as entered — not verified."
            />
            <TextAreaField
              label="Brand & interests"
              value={profile.nilInterests}
              onChange={(v) => onChange({ ...profile, nilInterests: v })}
              placeholder="Short description of the kind of brands/partnerships you're interested in."
              rows={3}
            />
          </div>
        </div>

        <StepActions onBack={onBack} onNext={onNext} />
      </Container>
    </Section>
  );
}
