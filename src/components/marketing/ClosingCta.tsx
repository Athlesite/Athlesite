import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

export function ClosingCta() {
  return (
    <section className="relative isolate overflow-hidden border-t border-border">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 -z-10 w-full bg-cover bg-center opacity-25 sm:w-2/3"
        style={{ backgroundImage: "url('/marketing/jordan-football.svg')" }}
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-r from-background via-background/90 to-background/25" />
      <Container className="flex min-h-[78svh] flex-col justify-center py-20">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-accent-light">
          Your Athlesite starts here
        </p>
        <h2 className="mt-5 max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-foreground sm:text-6xl lg:text-7xl">
          Your career is already a story.
          <br />
          <span className="text-accent-light">Give it a home.</span>
        </h2>
        <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
          Build a professional athlete identity you can share today and keep growing tomorrow.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Button href="/get-started">Create Your Athlesite</Button>
          <Button href="/athletes/jordan-bell" variant="secondary">See It In Action</Button>
        </div>
      </Container>
    </section>
  );
}
