import { Container } from "@/components/ui/Container";
import { SocialGlyph, CameraGlyph } from "@/components/profile/glyphs";
import type { ExampleAthlete } from "@/lib/example-athlete";

export function ProfileHero({ athlete }: { athlete: ExampleAthlete }) {
  return (
    <section className="border-b border-border">
      <div className="relative h-[26rem] w-full overflow-hidden sm:h-[32rem]">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-br from-[var(--athlete-media-from)] via-surface to-background"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 [background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [background-size:56px_56px] opacity-20"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground/50"
        >
          <CameraGlyph size={36} />
          <span className="text-xs font-medium uppercase tracking-[0.2em]">
            Athlete Photo
          </span>
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-background via-background/85 to-transparent"
        />
        <Container className="absolute inset-x-0 bottom-0 pb-8 sm:pb-10">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-6xl md:text-7xl">
            {athlete.name}
          </h1>
          <p className="mt-3 text-lg text-[var(--athlete-accent-light)] sm:text-xl">
            {athlete.sport} · {athlete.position}
          </p>
          <p className="mt-1 text-base text-muted-foreground">
            Class of {athlete.classYear} · {athlete.location}
          </p>
        </Container>
      </div>

      <Container className="flex flex-wrap items-center justify-between gap-4 py-5">
        <p className="text-sm text-muted-foreground">{athlete.heightWeight}</p>
        <div aria-hidden="true" className="flex items-center gap-2">
          <SocialGlyph icon="handle" />
          <SocialGlyph icon="camera" />
          <SocialGlyph icon="mail" />
        </div>
        <p className="sr-only">Social and contact links (sample placeholders).</p>
      </Container>
    </section>
  );
}
