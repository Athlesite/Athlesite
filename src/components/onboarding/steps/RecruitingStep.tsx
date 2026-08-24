"use client";

import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { TextField } from "@/components/forms/TextField";
import { TextAreaField } from "@/components/forms/TextAreaField";
import { SegmentedControl } from "@/components/forms/SegmentedControl";
import { StepActions } from "@/components/onboarding/StepActions";
import type { AthleteProfileData, RecruitingStatus } from "@/lib/athlete-profile";

const STATUS_OPTIONS: { value: RecruitingStatus; label: string }[] = [
  { value: "open", label: "Open to recruiting" },
  { value: "not_open", label: "Not open right now" },
  { value: "undecided", label: "Not sure yet" },
];

type RecruitingStepProps = {
  profile: AthleteProfileData;
  onChange: (profile: AthleteProfileData) => void;
  onNext: () => void;
  onBack: () => void;
};

export function RecruitingStep({ profile, onChange, onNext, onBack }: RecruitingStepProps) {
  return (
    <Section className="py-12 sm:py-16">
      <Container className="max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Recruiting
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          What coaches and scouts see. All optional.
        </p>

        <div className="mt-8 space-y-6">
          <SegmentedControl
            label="Recruiting status"
            value={profile.recruitingStatus}
            onChange={(v) => onChange({ ...profile, recruitingStatus: v })}
            options={STATUS_OPTIONS}
          />

          <TextField
            label="Recruiting contact"
            value={profile.recruitingContact}
            onChange={(v) => onChange({ ...profile, recruitingContact: v })}
            placeholder="e.g. coach@school.edu"
            hint="Email or contact method coaches should use. Shown as entered — not verified."
          />

          <TextAreaField
            label="Recruiting notes"
            value={profile.recruitingNotes}
            onChange={(v) => onChange({ ...profile, recruitingNotes: v })}
            placeholder="Anything else coaches should know."
            rows={3}
          />
        </div>

        <StepActions onBack={onBack} onNext={onNext} />
      </Container>
    </Section>
  );
}
