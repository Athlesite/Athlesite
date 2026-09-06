import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { HeroAtmosphere, HeroStage } from "@/components/marketing/hero/HeroStage";
import { JordanPhone } from "@/components/marketing/hero/JordanPhone";
import { ATHLETE_PLATE } from "@/components/marketing/hero/composition";

const TRUST_AVATARS = [1, 2, 3, 4];
const STARS = [1, 2, 3, 4, 5];

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-background">
      <HeroAtmosphere />

      {/* Full cinematic composition — desktop only */}
      <div className="hidden xl:block">
        <HeroStage />
      </div>

      {/*
        Below the cinematic breakpoint the athlete stays in the scene as a
        bleeding backdrop rather than being squeezed into a shrunken stage.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[16%] top-0 h-[56%] w-[82%] max-w-[540px] opacity-55 sm:-right-[4%] sm:opacity-65 xl:hidden"
        style={{
          maskImage: "linear-gradient(to bottom, #000 0%, #000 58%, transparent 92%)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 58%, transparent 92%)",
        }}
      >
        <Image
          src={ATHLETE_PLATE}
          alt=""
          fill
          sizes="(max-width: 640px) 82vw, 540px"
          className="object-cover object-top"
          priority
        />
      </div>

      <Container
        size="wide"
        className="relative flex min-h-[calc(100svh-4rem)] flex-col justify-center py-16 lg:min-h-[calc(100svh-92px)] lg:py-16 xl:justify-start xl:py-0 xl:pt-[66px]"
      >
        <div className="flex flex-col gap-16 lg:flex-row lg:items-center lg:gap-10 xl:block">
          <div className="max-w-[560px] lg:max-w-[520px] xl:max-w-[600px]">
            <p className="font-condensed text-[11px] font-semibold uppercase leading-none tracking-[0.34em] text-accent-light sm:text-[12.5px]">
              Athlete Identity Platform
            </p>

            <h1 className="mt-[22px] font-display text-[clamp(2.9rem,10vw,4.6rem)] uppercase leading-[1.05] tracking-[-0.005em] xl:text-[88px]">
              <span className="block bg-linear-to-b from-[#f7f6f2] via-[#f4f3ef] to-[#b9bcc2] bg-clip-text text-transparent">
                Your Name.
              </span>
              <span className="block bg-linear-to-b from-[#f7f6f2] via-[#f4f3ef] to-[#b9bcc2] bg-clip-text text-transparent">
                Your Game.
              </span>
              <span className="block bg-linear-to-b from-[#8b97dc] via-[#5968c4] to-[#3c4785] bg-clip-text text-transparent">
                Your Brand.
              </span>
            </h1>

            <p className="mt-7 max-w-[470px] text-[15px] leading-[1.8] text-white/72 sm:text-[17px]">
              Athlesite gives athletes one professional digital home to share their story,
              connect with opportunities, and build their brand — all in one link.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-4">
              <Button
                href="/get-started"
                shape="rounded"
                className="h-[46px] px-7 text-[15px] font-semibold shadow-[0_14px_34px_-18px_rgba(89,104,196,0.85)]"
              >
                Create Your Athlesite
              </Button>

              <Link
                href="/athletes/jordan-bell"
                className="group inline-flex items-center gap-3.5 rounded-full text-[15px] font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-border-strong text-foreground/80 transition-colors group-hover:border-accent group-hover:text-accent-light">
                  <svg width="10" height="12" viewBox="0 0 10 12" fill="none" aria-hidden="true">
                    <path d="M1 1.1 9 6l-8 4.9z" fill="currentColor" />
                  </svg>
                </span>
                See It In Action
              </Link>
            </div>

            <div className="mt-11 flex items-center gap-4">
              <div className="flex -space-x-2.5">
                {TRUST_AVATARS.map((n) => (
                  <span
                    key={n}
                    className="relative h-9 w-9 overflow-hidden rounded-full ring-2 ring-background"
                  >
                    <Image
                      src={`/marketing/athlete-avatar-${n}.webp`}
                      alt=""
                      fill
                      sizes="36px"
                      className="object-cover"
                    />
                  </span>
                ))}
              </div>
              <div>
                <span className="flex gap-[3px] text-highlight" aria-hidden="true">
                  {STARS.map((n) => (
                    <StarGlyph key={n} />
                  ))}
                </span>
                <p className="mt-1 text-[13px] text-white/62">Trusted by athletes nationwide</p>
              </div>
            </div>
          </div>

          {/* Recomposed device: the phone leads, scaled up so its UI stays readable */}
          <div className="flex justify-center lg:justify-end xl:hidden">
            <div className="hero-phone-scale relative">
              <JordanPhone />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function StarGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <path d="M7 .8l1.86 3.9 4.24.6-3.07 3.03.73 4.28L7 10.58l-3.76 2.03.73-4.28L.9 5.3l4.24-.6z" />
    </svg>
  );
}
