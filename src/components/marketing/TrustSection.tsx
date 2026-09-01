import { Container } from "@/components/ui/Container";

const trustItems = [
  { title: "Athlete Owned", copy: "You control your content and your story." },
  { title: "Privacy First", copy: "You decide what belongs on your public Athlesite." },
  { title: "Recruiter Friendly", copy: "Coaches can find the information they need quickly." },
  { title: "Mobile First", copy: "Your link feels premium wherever someone opens it." },
];

export function TrustSection() {
  return (
    <section className="border-t border-border bg-surface/25">
      <Container className="flex min-h-[68svh] flex-col justify-center py-20">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-accent-light">
          Built around the athlete
        </p>
        <div className="mt-8 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-4">
          {trustItems.map((item) => (
            <div key={item.title} className="border-t border-border py-6">
              <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.copy}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
