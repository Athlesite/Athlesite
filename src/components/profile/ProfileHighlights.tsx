import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { PlayGlyph } from "@/components/profile/glyphs";

export function ProfileHighlights({ highlights }: { highlights: string[] }) {
  const [featured, ...secondary] = highlights;

  return (
    <Section className="border-b border-border bg-surface/40">
      <Container>
        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-[var(--athlete-accent-light)]">
          Highlights
        </p>
        <div aria-hidden="true" className="mt-6 grid gap-4 sm:grid-cols-3 sm:grid-rows-2">
          {featured ? (
            <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-border bg-linear-to-br from-surface to-background text-muted-foreground sm:col-span-2 sm:row-span-2 sm:aspect-auto">
              <PlayGlyph size={36} />
              <span className="absolute left-4 top-4 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium text-[var(--athlete-accent-light)] backdrop-blur">
                Featured
              </span>
              <span className="absolute bottom-4 left-4 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                {featured}
              </span>
            </div>
          ) : null}
          {secondary.map((label) => (
            <div
              key={label}
              className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-border bg-linear-to-br from-surface to-background text-muted-foreground"
            >
              <PlayGlyph size={20} />
              <span className="absolute bottom-3 left-3 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
                {label}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Sample media shown for illustration. Real highlight reels, Hudl and YouTube
          embeds, and uploaded film will live here.
        </p>
        <p className="sr-only">
          Sample highlight media placeholders: {highlights.join(", ")}.
        </p>
      </Container>
    </Section>
  );
}
