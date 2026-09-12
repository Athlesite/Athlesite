"use client";

import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { TextField } from "@/components/forms/TextField";
import { TextAreaField } from "@/components/forms/TextAreaField";
import { SelectField } from "@/components/forms/SelectField";
import { UsernameField } from "@/components/forms/UsernameField";
import {
  isReservedSlug,
  isValidSlugFormat,
  toAthleteProfileView,
  type AthleteProfileData,
} from "@/lib/athlete-profile";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
].map((code) => ({ value: code, label: code }));

/**
 * Required-field and slug-format checks for the edit surface.
 *
 * Deliberately its own copy rather than importing AthleteInfoStep's internal
 * validate() from onboarding: onboarding is explicitly out of scope for 5B
 * (see docs/ai for the checkpoint), and lifting a shared export out of it is
 * a refactor of onboarding's own file this checkpoint does not need to make.
 * The rules themselves are the same because they describe the same domain
 * requirement (docs/ai/DECISIONS.md § Slug format and reserved names are
 * enforced in the domain layer) — slug format/reserved checks call the exact
 * same athlete-profile.ts functions onboarding does, so the two cannot drift
 * on what a *valid* slug is, only duplicate the small wrapper around it.
 */
export function validateAthleteInfo(profile: AthleteProfileData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!profile.firstName.trim()) errors.firstName = "First name is required.";
  if (!profile.lastName.trim()) errors.lastName = "Last name is required.";

  if (!profile.slug.trim()) {
    errors.slug = "Choose a username for your profile link.";
  } else if (!isValidSlugFormat(profile.slug)) {
    errors.slug = "Use 3-30 lowercase letters, numbers, or hyphens, starting with a letter.";
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

function parseOptionalInt(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

type AthleteInfoSectionProps = {
  profile: AthleteProfileData;
  onChange: (profile: AthleteProfileData) => void;
  errors: Record<string, string>;
  showErrors: boolean;
  /** The slug as loaded when the form opened, to detect and warn about a change. */
  initialSlug: string;
  /**
   * An error the database reported about the username — currently only
   * "already taken", which cannot be known before attempting the save.
   * Takes precedence over local format/required validation.
   */
  slugError?: string | null;
  /** Called when the athlete edits the username, clearing the server error. */
  onSlugErrorClear?: () => void;
};

export function AthleteInfoSection({
  profile,
  onChange,
  errors,
  showErrors,
  initialSlug,
  slugError,
  onSlugErrorClear,
}: AthleteInfoSectionProps) {
  const show = (field: string) => (showErrors ? errors[field] : undefined);

  const heightFt = profile.heightIn != null ? Math.floor(profile.heightIn / 12) : null;
  const heightInRemainder = profile.heightIn != null ? profile.heightIn % 12 : null;

  function updateHeight(ft: number | null, inches: number | null) {
    if (ft == null && inches == null) {
      onChange({ ...profile, heightIn: null });
      return;
    }
    onChange({ ...profile, heightIn: (ft ?? 0) * 12 + (inches ?? 0) });
  }

  const slugChanged = profile.slug !== initialSlug;
  const oldDisplayUrl = toAthleteProfileView({ ...profile, slug: initialSlug }).displayUrl;

  return (
    <Section className="py-10">
      <Container className="max-w-2xl">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Athlete information</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The core details that appear on your Athlesite.
        </p>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
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
          onChange={(v) => {
            onSlugErrorClear?.();
            onChange({ ...profile, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, "") });
          }}
          error={slugError ?? show("slug")}
          focusOnMount={Boolean(slugError)}
          hint={
            !slugError && !show("slug")
              ? "Lowercase letters, numbers, and hyphens only."
              : undefined
          }
        />
        {slugChanged ? (
          <p role="alert" className="mt-2 text-xs text-amber-500">
            Changing your username changes your public profile link immediately. Your current
            link — {oldDisplayUrl} — will stop working as soon as you save.
          </p>
        ) : null}

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
      </Container>
    </Section>
  );
}
