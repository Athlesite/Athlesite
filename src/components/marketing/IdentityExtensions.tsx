import { Container } from "@/components/ui/Container";

const stats = [
  { value: "28", label: "Games" },
  { value: "1,240", label: "Yards" },
  { value: "14", label: "Touchdowns" },
];

export function IdentityExtensions() {
  return (
    <section id="recruiting" className="scroll-mt-20 border-t border-border">
      <Container className="flex min-h-[calc(100svh-5rem)] flex-col justify-center py-20 lg:py-24">
        <div className="max-w-3xl">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-accent-light">
            02 — Everything in one place
          </p>
          <h2 className="mt-5 text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
            Your whole identity.
            <br />
            One home.
          </h2>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-12 lg:grid-rows-2">
          <article className="relative min-h-[20rem] overflow-hidden rounded-[1.75rem] border border-border bg-[#0d1021] lg:col-span-7 lg:row-span-2">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-65"
              style={{ backgroundImage: "url('/marketing/jordan-football.svg')" }}
            />
            <div className="absolute inset-0 bg-linear-to-t from-black via-black/35 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-black/35 text-sm text-white">
                ▶
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-light">
                Media & Highlights
              </p>
              <h3 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
                Put the game on screen.
              </h3>
              <p className="mt-3 max-w-lg text-sm leading-6 text-white/60">
                Film, training, photos, and the moments that tell coaches who you are before
                you ever meet.
              </p>
            </div>
          </article>

          <article className="rounded-[1.75rem] border border-border bg-surface/55 p-6 lg:col-span-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-light">
              Stats & Performance
            </p>
            <div className="mt-8 grid grid-cols-3 gap-3">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <p className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{stat.value}</p>
                  <p className="mt-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          </article>

          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-5">
            <article className="rounded-[1.75rem] border border-border bg-surface/35 p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-light">Recruiting</p>
              <h3 className="mt-5 text-xl font-semibold text-foreground">What coaches need. Fast.</h3>
              <dl className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between border-t border-border pt-2"><dt className="text-muted-foreground">Class</dt><dd>2027</dd></div>
                <div className="flex justify-between border-t border-border pt-2"><dt className="text-muted-foreground">Position</dt><dd>WR</dd></div>
                <div className="flex justify-between border-t border-border pt-2"><dt className="text-muted-foreground">Status</dt><dd className="text-accent-light">Open</dd></div>
              </dl>
            </article>

            <article id="nil" className="scroll-mt-24 rounded-[1.75rem] border border-accent/25 bg-accent-subtle/55 p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-light">NIL & Brand</p>
              <h3 className="mt-5 text-xl font-semibold text-foreground">More than a stat line.</h3>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Social links, brand story, partnerships, and future opportunities can live
                beside the athlete — not in another disconnected profile.
              </p>
            </article>
          </div>
        </div>
      </Container>
    </section>
  );
}
