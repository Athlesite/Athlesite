import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";

export const metadata: Metadata = {
  title: "Founding Athlete Access — Athlesite",
  description:
    "Athlesite is being built for athletes first. Learn about founding athlete access.",
};

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

export default function GetStartedPage() {
  return (
    <Section className="py-28 sm:py-36">
      <Container className="max-w-2xl">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-accent-light">
          Founding Athlete Access
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Athlesite is being built for athletes like you.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground">
          We&apos;re building the first professional digital home made for athletes — part
          personal website, part recruiting profile, part NIL presence. It&apos;s early,
          and founding athletes will be among the first to get access and help shape what
          it becomes.
        </p>
        <div className="mt-12 space-y-8 border-t border-border pt-10">
          {opportunities.map((item) => (
            <div key={item.title}>
              <h2 className="text-lg font-semibold text-foreground">{item.title}</h2>
              <p className="mt-2 text-base text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}
