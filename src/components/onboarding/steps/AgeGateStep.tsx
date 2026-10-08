"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SelectField } from "@/components/forms/SelectField";
import { AGE_GATE_EXPLANATION, AGE_GATE_PROMPT } from "@/lib/age-gate-copy";
import { resolveAgeEligibility, type AgeEligibility } from "@/lib/age-eligibility";

type AgeGateStepProps = {
  /** Called with the resolved bracket. The wizard decides what each one means. */
  onResolved: (eligibility: AgeEligibility) => void;
  onBack: () => void;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((label, index) => ({ value: String(index + 1), label }));

const DAYS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

/**
 * Year range: this year back 100 years. Wide enough for any athlete, and it means the
 * list itself never implies an expected age.
 */
function buildYears(): { value: string; label: string }[] {
  const current = new Date().getFullYear();
  return Array.from({ length: 100 }, (_, i) => {
    const year = current - i;
    return { value: String(year), label: String(year) };
  });
}

/**
 * Asks date of birth before any profile field is collected.
 *
 * Three selects rather than a free-text or native date input: selects cannot produce a
 * half-typed invalid state, and they sidestep the locale ambiguity of `03/04`. The
 * parts live in local state only, are passed straight to `resolveAgeEligibility`, and
 * are never lifted into the profile, written to storage, or sent anywhere.
 *
 * The date itself is deliberately *not* reported upward — only the resolved bracket —
 * so there is no path by which a caller could persist it even by mistake.
 */
export function AgeGateStep({ onResolved, onBack }: AgeGateStepProps) {
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [year, setYear] = useState("");
  const [error, setError] = useState<string | null>(null);

  const complete = month !== "" && day !== "" && year !== "";

  function handleContinue() {
    const eligibility = resolveAgeEligibility({ year, month, day });

    // `null` means indeterminate — an impossible date like 30 February, or a future
    // one. Fail closed: say so and go nowhere. This can never read as `adult`.
    if (eligibility === null) {
      setError("That doesn't look like a real date. Please check the day and month.");
      return;
    }

    setError(null);
    onResolved(eligibility);
  }

  return (
    <Section>
      <Container className="max-w-xl">
        <SectionHeading title={AGE_GATE_PROMPT} />
        <p className="mt-3 text-sm text-muted-foreground">{AGE_GATE_EXPLANATION}</p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr_1.2fr]">
          <SelectField
            label="Month"
            value={month}
            onChange={(value) => {
              setMonth(value);
              setError(null);
            }}
            options={MONTHS}
            placeholder="Month"
            required
          />
          <SelectField
            label="Day"
            value={day}
            onChange={(value) => {
              setDay(value);
              setError(null);
            }}
            options={DAYS}
            placeholder="Day"
            required
          />
          <SelectField
            label="Year"
            value={year}
            onChange={(value) => {
              setYear(value);
              setError(null);
            }}
            options={buildYears()}
            placeholder="Year"
            required
            error={error ?? undefined}
          />
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <Button type="button" variant="secondary" onClick={onBack}>
            Back
          </Button>
          <Button type="button" onClick={handleContinue} disabled={!complete}>
            Continue
          </Button>
        </div>
      </Container>
    </Section>
  );
}
