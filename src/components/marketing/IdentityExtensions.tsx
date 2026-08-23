import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";

const extensions = [
  {
    id: "recruiting",
    title: "Recruiting",
    description:
      "Put what coaches need front and center — recruiting details easy to find, wherever they're looking.",
  },
  {
    id: "nil",
    title: "NIL & Brand",
    description:
      "Show up the way brands expect — a business-ready presence for NIL opportunities.",
  },
];

export function IdentityExtensions() {
  return (
    <Section className="border-t border-border">
      <Container>
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-accent-light">
            Built around you
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Your identity comes first.
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Everything on Athlesite starts with your profile. Recruiting and NIL are
            extensions of that identity, not separate products.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          {extensions.map((item) => (
            <div
              key={item.id}
              id={item.id}
              className="scroll-mt-28 rounded-2xl border border-border p-6"
            >
              <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}
