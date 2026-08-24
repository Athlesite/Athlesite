"use client";

import { useEffect, useState } from "react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { TextField } from "@/components/forms/TextField";
import { TextAreaField } from "@/components/forms/TextAreaField";
import { SelectField } from "@/components/forms/SelectField";
import { UsernameField } from "@/components/forms/UsernameField";
import { StepActions } from "@/components/onboarding/StepActions";
import {
  isReservedSlug,
  isValidSlugFormat,
  slugify,
  type AthleteProfileData,
} from "@/lib/athlete-profile";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
].map((code) => ({ value: code, label: code }));

type AthleteInfoStepProps = {
  profile: AthleteProfileData;
  onChange: (profile: AthleteProfileData) => void;
  onNext: () => void;
  onBack: () => void;
};

function parseOptionalInt(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function validate(profile: AthleteProfileData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!profile.firstName.trim()) errors.firstName = "First name is required.";
  if (!profile.lastName.trim()) errors.lastName = "Last name is required.";

  if (!profile.slug.trim()) {
    errors.slug = "Choose a username for your profile link.";
  } else if (!isValidSlugFormat(profile.slug)) {
    errors.slug =
      "Use 3-30 lowercase letters, numbers, or hyphens, starting with a letter.";
  } else if (isReservedSlug(profile.slug)) {
    errors.slug = "That username is reserved. Try another.";
  }

  if (!profile.sport.trim()) errors.sport = "Sport is required.";
  if (!profile.position.trim()) errors.position = "Position/event is required.";
  if (!profile.classYear.trim()) errors.classYear = "Class/graduation year is required.";
  if (!profile.schoolOrTeam.trim()) errors.schoolOrTeam = "School or team is required.";
  if (!profile.city.trim()) errors.city = "City is required.";
  if (!profile.state.trim()) errors.state = "State is required.";

  return errors;
}

export function AthleteInfoStep({ profile, onChange, onNext, onBack }: AthleteInfoStepProps) {
  const [attempted, setAttempted] = useState(false);
  const errors = validate(profile);

  // Suggest a username from the athlete's name, once, without overwriting a manual edit.
  useEffect(() => {
    if (!profile.slug && profile.firstName && profile.lastName) {
      onChange({ ...profile, slug: slugify(`${profile.firstName} ${profile.lastName}`) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.firstName, profile.lastName]);

  const heightFt = profile.heightIn != null ? Math.floor(profile.heightIn / 12) : null;
  const heightInRemainder = profile.heightIn != null ? profile.heightIn % 12 : null;

  function updateHeight(ft: number | null, inches: number | null) {
    if (ft == null && inches == null) {
      onChange({ ...profile, heightIn: null });
      return;
    }
    onChange({ ...profile, heightIn: (ft ?? 0) * 12 + (inches ?? 0) });
  }

  function handleNext() {
    if (Object.keys(errors).length > 0) {
      setAttempted(true);
      return;
    }
    onNext();
  }

  const show = (field: string) => (attempted ? errors[field] : undefined);

  return (
    <Section className="py-12 sm:py-16">
      <Container className="max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Athlete Info
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The core details that appear on your Athlesite.
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <TextField
            label="First name"
            required
            value={profile.firstName}
            onChange={(v) => onChange({ ...profile, firstName: v })}
            error={show("firstName")}
          />
          <TextField
            label="Last name"
            required
            value={profile.lastName}
            onChange={(v) => onChange({ ...profile, lastName: v })}
            error={show("lastName")}
          />
        </div>

        <UsernameField
          className="mt-6"
          value={profile.slug}
          onChange={(v) => onChange({ ...profile, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
          error={show("slug")}
          hint={
            !show("slug") ? "Lowercase letters, numbers, and hyphens only." : undefined
          }
        />

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <TextField
            label="Sport"
            required
            value={profile.sport}
            onChange={(v) => onChange({ ...profile, sport: v })}
            error={show("sport")}
          />
          <TextField
            label="Position / event"
            required
            value={profile.position}
            onChange={(v) => onChange({ ...profile, position: v })}
            error={show("position")}
          />
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <TextField
            label="Class / graduation year"
            required
            value={profile.classYear}
            onChange={(v) => onChange({ ...profile, classYear: v })}
            error={show("classYear")}
          />
          <TextField
            label="School / team"
            required
            value={profile.schoolOrTeam}
            onChange={(v) => onChange({ ...profile, schoolOrTeam: v })}
            error={show("schoolOrTeam")}
          />
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <TextField
            label="City"
            required
            value={profile.city}
            onChange={(v) => onChange({ ...profile, city: v })}
            error={show("city")}
          />
          <SelectField
            label="State"
            required
            value={profile.state}
            onChange={(v) => onChange({ ...profile, state: v })}
            options={US_STATES}
            error={show("state")}
          />
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          <TextField
            label="Height — ft"
            value={heightFt != null ? String(heightFt) : ""}
            onChange={(v) => updateHeight(parseOptionalInt(v), heightInRemainder)}
            inputMode="numeric"
            placeholder="6"
          />
          <TextField
            label="Height — in"
            value={heightInRemainder != null ? String(heightInRemainder) : ""}
            onChange={(v) => updateHeight(heightFt, parseOptionalInt(v))}
            inputMode="numeric"
            placeholder="2"
          />
          <TextField
            label="Weight — lb"
            value={profile.weightLb != null ? String(profile.weightLb) : ""}
            onChange={(v) => onChange({ ...profile, weightLb: parseOptionalInt(v) })}
            inputMode="numeric"
            placeholder="185"
          />
        </div>

        <TextAreaField
          className="mt-6"
          label="Short bio"
          value={profile.bio}
          onChange={(v) => onChange({ ...profile, bio: v })}
          placeholder="A couple of sentences about you as an athlete."
          maxLength={400}
        />

        <StepActions onBack={onBack} onNext={handleNext} />
      </Container>
    </Section>
  );
}
