import { Container } from "@/components/ui/Container";

export function Personalization() {
  return (
    <section className="border-t border-border bg-surface/20">
      <Container className="flex min-h-[calc(100svh-5rem)] flex-col justify-center py-20 lg:py-24">
        <div className="max-w-3xl">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-accent-light">
            03 — Make it yours
          </p>
          <h2 className="mt-5 text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
            No two athletes are the same.
            <br />
            Their Athlesites shouldn&apos;t be either.
          </h2>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Athlesite keeps the structure professional while giving each athlete room to
            emphasize the story, style, and information that feels like them.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          <article className="relative min-h-[27rem] overflow-hidden rounded-[1.8rem] border border-white/10 bg-black">
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/marketing/jordan-football.svg')" }} />
            <div className="absolute inset-0 bg-linear-to-t from-black via-transparent to-black/20" />
            <div className="absolute left-5 right-5 top-5 flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-white/60">
              <span>Athlesite / 01</span><span>Football</span>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-6">
              <p className="text-5xl font-black leading-none tracking-[-0.07em] text-white/20">11</p>
              <h3 className="-mt-2 text-3xl font-semibold tracking-[-0.04em] text-white">Jordan Bell</h3>
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-white/55">Dark · Cinematic · Stat-forward</p>
            </div>
          </article>

          <article className="min-h-[27rem] overflow-hidden rounded-[1.8rem] border border-[#d2d5c8] bg-[#e8eadf] text-[#153e2c]">
            <div className="p-6">
              <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.2em] text-[#153e2c]/60">
                <span>Athlesite Journal</span><span>Soccer</span>
              </div>
              <h3 className="mt-9 max-w-[12rem] font-serif text-4xl leading-[0.96]">Maya Rodriguez</h3>
              <p className="mt-4 max-w-[15rem] font-serif text-sm leading-6 text-[#153e2c]/70">
                Midfielder. Creator. Student of the game.
              </p>
            </div>
            <div className="mx-6 min-h-[15rem] rounded-t-[1.2rem] border border-[#153e2c]/15 bg-cover bg-center" style={{ backgroundImage: "url('/marketing/maya-soccer.svg')" }} />
          </article>

          <article className="min-h-[27rem] overflow-hidden rounded-[1.8rem] border border-[#6d4c3d] bg-[#271612] text-[#fff1d6]">
            <div className="border-b border-[#d8c39f]/25 p-6">
              <div className="flex items-center justify-between font-serif text-[9px] uppercase tracking-[0.2em] text-[#d8c39f]">
                <span>Scouting File</span><span>2027</span>
              </div>
              <h3 className="mt-6 font-serif text-4xl leading-none">Tyler Brooks</h3>
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[#d8c39f]">SS / RHP · Baseball</p>
            </div>
            <div className="grid grid-cols-[1.05fr_0.95fr]">
              <div className="min-h-[15rem] bg-cover bg-center" style={{ backgroundImage: "url('/marketing/tyler-baseball.svg')" }} />
              <div className="flex flex-col justify-center gap-5 p-5">
                <div><p className="text-3xl font-semibold">94</p><p className="text-[9px] uppercase tracking-widest text-[#d8c39f]">Exit velo</p></div>
                <div><p className="text-3xl font-semibold">6.8</p><p className="text-[9px] uppercase tracking-widest text-[#d8c39f]">60 yard</p></div>
                <div><p className="text-3xl font-semibold">3.9</p><p className="text-[9px] uppercase tracking-widest text-[#d8c39f]">GPA</p></div>
              </div>
            </div>
          </article>
        </div>
      </Container>
    </section>
  );
}
