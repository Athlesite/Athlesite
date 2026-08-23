import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-12rem] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-accent/20 blur-[120px]" />
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [background-size:64px_64px] opacity-20" />
      </div>

      <Container className="flex flex-col items-start gap-8 py-28 sm:py-36">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-accent-light">
          Athlete Identity Platform
        </p>
        <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl md:text-7xl">
          Your Name. Your Game. Your Brand.
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground sm:text-xl">
          Athlesite gives athletes one professional home for their identity, recruiting
          story, and brand — a single link for coaches, fans, and brands to find you.
        </p>
        <Button href="/get-started" className="mt-2">
          Create Your Athlesite
        </Button>
      </Container>
    </section>
  );
}
