import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { HighlightMedia } from "@/components/profile/HighlightMedia";
import type { HighlightLink } from "@/lib/athlete-profile";

export function ProfileHighlights({ highlights }: { highlights: HighlightLink[] }) {
  if (highlights.length === 0) return null;

  const [featured, ...secondary] = highlights;

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

        <p className="mt-4 text-xs text-muted-foreground">
          Real highlight reels, Hudl embeds, and uploaded film live here alongside YouTube.
        </p>
      </Container>
    </Section>
  );
}
