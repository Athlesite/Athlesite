import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";

const opportunities = [
  {
    title: "Early access",
    description: "Be among the first athletes with a live Athlesite profile.",
  },
  {
    title: "A voice in the product",
    description: "Founding athletes help shape what Athlesite becomes.",
  },
  {
    title: "A profile built around you",
    description: "One professional home for your identity, recruiting story, and brand.",
  },
];

export function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <Section className="py-16 sm:py-20">
      <Container className="max-w-2xl">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-accent-light">
          Founding Athlete Access
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Let&apos;s build your Athlesite.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground">
          This is an early preview build. What you enter here is stored only on this
          device and browser — it isn&apos;t public yet, and there&apos;s no account or
          backend behind it. You&apos;re helping shape what Athlesite becomes.
        </p>
        <div className="mt-12 space-y-8 border-t border-border pt-10">
          {opportunities.map((item) => (
            <div key={item.title}>
              <h2 className="text-lg font-semibold text-foreground">{item.title}</h2>
              <p className="mt-2 text-base text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
        <Button type="button" onClick={onNext} className="mt-12">
          Begin
        </Button>
      </Container>
    </Section>
  );
}
