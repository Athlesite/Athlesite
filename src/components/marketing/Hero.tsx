import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { HeroAtmosphere, HeroStage } from "@/components/marketing/hero/HeroStage";
import { JordanPhone } from "@/components/marketing/hero/JordanPhone";
import { ATHLETE_PLATE } from "@/components/marketing/hero/composition";

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
        className="relative flex min-h-[calc(100svh-4rem)] flex-col justify-center py-16 lg:min-h-[calc(100svh-88px)] lg:py-16 xl:justify-start xl:py-0 xl:pt-[64px]"
      >
        <div className="flex flex-col gap-16 lg:flex-row lg:items-center lg:gap-10 xl:block">
          <div className="max-w-[560px] lg:max-w-[520px] xl:max-w-[600px]">
            <p className="font-condensed text-[11px] font-semibold uppercase leading-none tracking-[0.34em] text-accent-light sm:text-[12.5px]">
              Built for the Modern Athlete
            </p>

            <h1 className="mt-[22px] font-display text-[clamp(2.9rem,10vw,4.6rem)] uppercase leading-[1.05] tracking-[-0.005em] xl:text-[88px]">
              <span className="block bg-linear-to-b from-brand-off-white via-brand-off-white to-brand-silver bg-clip-text text-transparent">
                Your Name.
              </span>
              <span className="block bg-linear-to-b from-brand-off-white via-brand-off-white to-brand-silver bg-clip-text text-transparent">
                Your Game.
              </span>
              <span className="block bg-linear-to-b from-accent-light via-accent to-accent-deep bg-clip-text text-transparent">
                Your Brand.
              </span>
            </h1>

            <p className="mt-7 max-w-[510px] text-[15px] leading-[1.72] text-white/82 sm:text-[17px]">
              Your story, highlights, recruiting profile, and personal brand — together in one
              professional athlete website built around you.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-4">
              <Button
                href="/get-started"
                shape="rounded"
                className="h-[46px] px-7 text-[15px] font-semibold shadow-[0_14px_34px_-18px_rgba(37,99,235,0.8)]"
              >
                Create Your Athlesite
              </Button>

              <Link
                href="/athletes/jordan-bell"
                className="group inline-flex items-center gap-3.5 rounded-full text-[15px] font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-border-strong text-foreground/80 transition-colors group-hover:border-accent group-hover:text-accent-light">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <path d="M2.25 6.5h8.5M7.5 3.25 10.75 6.5 7.5 9.75" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                Explore a Profile
              </Link>
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
