import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";

export function ClosingCta() {
  return (
    <Section className="border-t border-border">
      <Container className="flex flex-col items-center gap-6 text-center">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-accent-light">
          Founding Athlete Access
        </p>
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Every athlete deserves a professional digital home.
        </h2>
        <Button href="/get-started" className="mt-2">
          Create Your Athlesite
        </Button>
      </Container>
    </Section>
  );
}
