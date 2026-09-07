import { Container } from "@/components/ui/Container";

const stages = [
  { step: "01", title: "High School", copy: "Stand out. Get seen." },
  { step: "02", title: "College", copy: "Compete. Perform. Keep growing." },
  { step: "03", title: "NIL & Brand", copy: "Build your brand. Unlock opportunities." },
  { step: "04", title: "Beyond Sports", copy: "Your platform. Your future." },
];

export function GrowthPath() {
  return (
    <section className="border-t border-border">
      <Container className="flex min-h-[82svh] flex-col justify-center py-20 lg:py-24">
        <div className="max-w-3xl">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-accent-light">
            04 — Built for where you are
          </p>
          <h2 className="mt-5 text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
            Ready for where you&apos;re going.
          </h2>
        </div>

        <div className="relative mt-14 grid gap-8 md:grid-cols-4 md:gap-4">
          <div aria-hidden="true" className="absolute left-0 right-0 top-5 hidden h-px bg-border md:block" />
          {stages.map((stage) => (
            <div key={stage.step} className="relative border-t border-border pt-5 md:border-t-0 md:pt-14">
              <span className="absolute left-0 top-0 z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-accent/40 bg-background font-mono text-[10px] text-accent-light md:flex">
                {stage.step}
              </span>
              <span className="font-mono text-[10px] text-accent-light md:hidden">{stage.step}</span>
              <h3 className="mt-3 text-xl font-semibold text-foreground md:mt-0">{stage.title}</h3>
              <p className="mt-2 max-w-[14rem] text-sm leading-6 text-muted-foreground">{stage.copy}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
