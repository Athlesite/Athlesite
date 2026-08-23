import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { ProfileContactPath } from "@/components/profile/ProfileContactPath";
import type { ExampleAthlete } from "@/lib/example-athlete";

export function ProfileRecruitingNil({ athlete }: { athlete: ExampleAthlete }) {
  return (
    <Section className="border-b border-border">
      <Container className="max-w-3xl">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-[var(--athlete-accent-light)]">
          Recruiting
        </p>
        <p className="mt-4 text-base font-medium text-foreground sm:text-lg">
          {athlete.position} · Class of {athlete.classYear} · {athlete.location} ·{" "}
          {athlete.heightWeight}
        </p>
        <p className="mt-3 text-base text-muted-foreground sm:text-lg">
          {athlete.name} is open to recruiting conversations with college programs at the
          next level.
        </p>
        <ProfileContactPath label="Recruiting inquiries — available soon" />

        <div className="my-10 h-px w-full bg-border" />

        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-[var(--athlete-accent-light)]">
          NIL &amp; Business
        </p>
        <p className="mt-3 text-base text-muted-foreground sm:text-lg">
          {athlete.name} is open to NIL and business partnerships with brands that fit.
        </p>
        <ProfileContactPath label="Business & NIL inquiries — available soon" />
      </Container>
    </Section>
  );
}
