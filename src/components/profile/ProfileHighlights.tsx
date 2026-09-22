import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { HighlightMedia } from "@/components/profile/HighlightMedia";
import { usableHighlights } from "@/components/profile/profile-display";
import type { HighlightLink } from "@/lib/athlete-profile";

type ProfileHighlightsProps = {
  highlights: HighlightLink[];
  /**
   * Whether this surface is the explicitly-labelled fictional example.
   *
   * Gates two demo-only behaviours: keeping highlight slots that have a label
   * but no URL (which render as cards that look playable and are not — fine
   * when demonstrating the layout, misleading on a real athlete's page), and
   * the note describing which formats Athlesite supports, which is product
   * copy rather than anything the athlete wrote.
   */
  example?: boolean;
};

export function ProfileHighlights({ highlights, example }: ProfileHighlightsProps) {
  const visible = usableHighlights(highlights, { example });

  if (visible.length === 0) return null;

  const [featured, ...secondary] = visible;

  return (
    <Section className="border-b border-border bg-surface/40">
      <Container>
        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-[var(--athlete-accent-light)]">
          Highlights
        </p>

        <div className="mt-6">
          <HighlightMedia link={featured} fallbackLabel="Highlight 1" featured />
        </div>

        {secondary.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {secondary.map((link, index) => (
              <HighlightMedia
                key={`${index}-${link.url}`}
                link={link}
                fallbackLabel={`Highlight ${index + 2}`}
              />
            ))}
          </div>
        ) : null}

        {example ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Real highlight reels, Hudl embeds, and uploaded film live here alongside YouTube.
          </p>
        ) : null}
      </Container>
    </Section>
  );
}
