import { Container } from "@/components/ui/Container";

const benefits = [
  { number: "01", title: "One Link", copy: "Your entire athlete identity in one place." },
  { number: "02", title: "Always Yours", copy: "A home that grows with your career." },
  { number: "03", title: "Built for Athletes", copy: "Media, stats, story, recruiting, and brand." },
  { number: "04", title: "Recruiter Friendly", copy: "The important details are easy to find fast." },
];

export function ProductPreview() {
  return (
    <section id="for-athletes" className="scroll-mt-20 border-t border-border bg-surface/25">
      <Container className="grid min-h-[calc(100svh-5rem)] items-center gap-14 py-20 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20 lg:py-24">
        <div className="order-2 lg:order-1">
          <div className="relative mx-auto w-full max-w-[24rem]">
            <div aria-hidden="true" className="absolute -inset-10 rounded-full bg-accent/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2.4rem] border-[7px] border-[#15171d] bg-black shadow-2xl shadow-black/50">
              <div
                className="relative aspect-[9/16] bg-cover bg-center"
                style={{ backgroundImage: "url('/marketing/jordan-football.svg')" }}
              >
                <div className="absolute inset-0 bg-linear-to-t from-black via-black/5 to-black/10" />
                <div className="absolute left-5 right-5 top-5 flex items-center justify-between text-[8px] uppercase tracking-[0.2em] text-white/70">
                  <span>ATHLESITE</span>
                  <span>JB / 11</span>
                </div>
                <div className="absolute inset-x-0 bottom-0 p-6">
                  <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-accent-light">
                    Football · WR · 2027
                  </p>
                  <p className="mt-2 text-4xl font-semibold tracking-[-0.045em] text-white">
                    Jordan Bell
                  </p>
                  <div className="mt-5 grid grid-cols-3 border-y border-white/15 py-4 text-center">
                    <div><p className="text-lg font-semibold">1,240</p><p className="text-[8px] uppercase tracking-widest text-white/45">YDS</p></div>
                    <div><p className="text-lg font-semibold">14</p><p className="text-[8px] uppercase tracking-widest text-white/45">TD</p></div>
                    <div><p className="text-lg font-semibold">4.6</p><p className="text-[8px] uppercase tracking-widest text-white/45">40 YD</p></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-accent-light">
            01 — What is an Athlesite?
          </p>
          <h2 className="mt-5 max-w-2xl text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
            Your professional athlete website.
          </h2>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            A central home for everything that defines you as an athlete. Share your story.
            Showcase your game. Get discovered — without looking like you filled out another
            recruiting form.
          </p>

          <div className="mt-10 grid gap-x-10 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <div key={benefit.number} className="border-t border-border py-5">
                <div className="flex gap-4">
                  <span className="font-mono text-[10px] text-accent-light">{benefit.number}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{benefit.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{benefit.copy}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
