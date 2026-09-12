"use client";

import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Switch } from "@/components/forms/Switch";

type PublishSectionProps = {
  isPublished: boolean;
  onChange: (isPublished: boolean) => void;
};

/**
 * The publish/unpublish control.
 *
 * Deliberately only local component state — see EditProfileForm. Flipping
 * this switch changes nothing on the server; the chosen value is only ever
 * written when the athlete presses Save, alongside every other field, in the
 * same single `.update()` statement.
 */
export function PublishSection({ isPublished, onChange }: PublishSectionProps) {
  return (
    <Section className="py-10 border-t border-border">
      <Container className="max-w-2xl">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Visibility</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Controls whether anyone besides you can see this profile.
        </p>

        <div className="mt-6">
          <Switch
            label="Published"
            description={
              isPublished
                ? "Anyone with your link can view this profile."
                : "Only you can see this profile. It won't appear at your public link until you publish it."
            }
            checked={isPublished}
            onChange={onChange}
          />
        </div>
      </Container>
    </Section>
  );
}
