import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";

export function ProfileClosingCta() {
  return (
    <Section className="text-center">
      <Container className="flex flex-col items-center gap-6">
        <p className="max-w-xl text-lg text-muted-foreground">
          This is what an Athlesite can look like. Build your own professional home for
          your identity, recruiting story, and brand.
        </p>
        <Button href="/get-started">Create Your Athlesite</Button>
        <Link
          href="/"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Back to homepage
        </Link>
      </Container>
    </Section>
  );
}
