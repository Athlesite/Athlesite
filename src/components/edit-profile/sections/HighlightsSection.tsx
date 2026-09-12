"use client";

import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { RepeatingUrlListField } from "@/components/forms/RepeatingUrlListField";
import type { AthleteProfileData, HighlightLink } from "@/lib/athlete-profile";

type HighlightsSectionProps = {
  profile: AthleteProfileData;
  onChange: (profile: AthleteProfileData) => void;
};

/**
 * Highlight links only — deliberately split out of what MediaStep bundles
 * them with in onboarding. MediaStep couples this pure-data field with photo
 * pickers and framing controls, all of which are out of scope for 5B; this
 * section reuses the same underlying RepeatingUrlListField without dragging
 * any of that in.
 */
export function HighlightsSection({ profile, onChange }: HighlightsSectionProps) {
  function updateHighlights(links: HighlightLink[]) {
    onChange({ ...profile, highlightLinks: links });
  }

  return (
    <Section className="py-10 border-t border-border">
      <Container className="max-w-2xl">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Highlights</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Links to Hudl, YouTube, or any highlight video. Your first link is the featured
          highlight on your profile.
        </p>

        <div className="mt-6">
          <RepeatingUrlListField
            label="Highlight & video links"
            hint="Keep titles short and clear (40 characters max)."
            value={profile.highlightLinks}
            onChange={updateHighlights}
          />
        </div>
      </Container>
    </Section>
  );
}
