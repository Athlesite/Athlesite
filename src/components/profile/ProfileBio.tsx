import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";

export function ProfileBio({ bio }: { bio: string }) {
  if (!bio) return null;

  return (
    <Section className="border-b border-border">
      <Container className="max-w-3xl">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-[var(--athlete-accent-light)]">
          About
        </p>
        <p className="mt-4 text-xl leading-relaxed text-foreground sm:text-2xl">{bio}</p>
      </Container>
    </Section>
  );
}
