import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ExampleProfileCard } from "@/components/marketing/ExampleProfileCard";

export function ProductPreview() {
  return (
    <Section id="for-athletes" className="scroll-mt-28 border-t border-border bg-surface/40">
      <Container className="flex flex-col items-center gap-12">
        <SectionHeading
          align="center"
          eyebrow="Example Athlesite"
          title="One athlete. One link. Everything that matters."
        />
        <div className="w-full max-w-2xl">
          <ExampleProfileCard />
        </div>
      </Container>
    </Section>
  );
}
