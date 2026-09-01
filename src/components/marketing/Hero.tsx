import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

const heroStats = [
  { value: "1,240", label: "Yards" },
  { value: "14", label: "TDs" },
  { value: "4.6", label: "40 yd" },
];

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-10rem] top-24 h-[34rem] w-[34rem] rounded-full bg-accent/15 blur-[120px]" />
        <div className="absolute right-[-12rem] top-[-8rem] h-[38rem] w-[38rem] rounded-full bg-[#765cff]/15 blur-[140px]" />
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [background-size:72px_72px] opacity-[0.12]" />
      </div>

      <Container className="grid min-h-[calc(100svh-5rem)] items-center gap-14 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:py-20">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.24em] text-accent-light">
            Athlete Identity Platform
          </p>
          <h1 className="mt-6 text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-foreground sm:text-6xl lg:text-7xl xl:text-[5.4rem]">
            Your Name.
            <br />
            Your Game.
            <br />
            <span className="text-accent-light">Your Brand.</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            One professional digital home for your identity, recruiting story, highlights,
            brand, and opportunities — built to look like you, not a database entry.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button href="/get-started">Create Your Athlesite</Button>
            <Button href="#for-athletes" variant="secondary">
              See It In Action
            </Button>
          </div>
          <p className="mt-6 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Built for athletes · Shareable anywhere · Yours to grow
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-2xl lg:mx-0">
          <div aria-hidden="true" className="absolute -inset-8 rounded-[3rem] bg-accent/10 blur-3xl" />
          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#090b12] shadow-2xl shadow-black/40">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="ml-3 text-[10px] uppercase tracking-[0.18em] text-white/40">
                athlesite.com/jordanbell
              </span>
            </div>

            <div className="relative min-h-[28rem] overflow-hidden sm:min-h-[33rem]">
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: "url('/marketing/jordan-football.svg')" }}
              />
              <div className="absolute inset-0 bg-linear-to-t from-black via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/60">
                  Wide Receiver · Class of 2027
                </p>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-6xl">
                      Jordan Bell
                    </h2>
                    <p className="mt-2 text-sm text-white/60">Round Rock, Texas</p>
                  </div>
                  <span className="text-7xl font-black leading-none tracking-[-0.08em] text-white/20 sm:text-8xl">
                    11
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 border-t border-white/10 bg-black/70">
              {heroStats.map((stat) => (
                <div key={stat.label} className="px-4 py-4 text-center sm:px-6">
                  <p className="text-xl font-semibold text-white sm:text-2xl">{stat.value}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/40">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute -bottom-8 right-2 hidden w-[10.5rem] overflow-hidden rounded-[1.7rem] border-[6px] border-[#11131a] bg-black shadow-2xl shadow-black/50 sm:block lg:-right-8">
            <div
              className="relative aspect-[9/16] bg-cover bg-center"
              style={{ backgroundImage: "url('/marketing/jordan-football.svg')" }}
            >
              <div className="absolute inset-0 bg-linear-to-t from-black via-transparent to-black/10" />
              <div className="absolute inset-x-0 bottom-0 p-3">
                <p className="text-[7px] uppercase tracking-[0.18em] text-white/50">WR · 2027</p>
                <p className="mt-1 text-lg font-semibold leading-none text-white">Jordan Bell</p>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
