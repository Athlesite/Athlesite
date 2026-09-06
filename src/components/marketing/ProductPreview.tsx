import type { ReactNode } from "react";
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { AthlesiteShowcase } from "@/components/marketing/section01/AthlesiteShowcase";
import { JordanMobileSite } from "@/components/marketing/section01/JordanMobileSite";

const benefits = [
  {
    number: "01",
    title: "One Link",
    copy: "Share your entire profile with one link.",
    icon: <LinkIcon />,
  },
  {
    number: "02",
    title: "Always Yours",
    copy: "You own your content and your data.",
    icon: <ShieldIcon />,
  },
  {
    number: "03",
    title: "Built for Athletes",
    copy: "Designed by athletes, for athletes.",
    icon: <StarIcon />,
  },
  {
    number: "04",
    title: "Recruiter Friendly",
    copy: "Everything coaches need, in one place.",
    icon: <PeopleIcon />,
  },
];

export function ProductPreview() {
  return (
    <section
      id="for-athletes"
      className="relative isolate scroll-mt-24 overflow-hidden border-t border-border bg-background"
    >
      {/* Desktop: the full layered showcase */}
      <div className="hidden xl:block">
        <AthlesiteShowcase />
      </div>

      {/* Below the showcase breakpoint the photograph stays as atmosphere */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[14%] top-0 h-[54%] w-[78%] max-w-[500px] opacity-70 sm:-right-[4%] sm:opacity-80 xl:hidden"
        style={{
          maskImage: "linear-gradient(to bottom, #000 0%, #000 54%, transparent 92%)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 54%, transparent 92%)",
        }}
      >
        <Image
          src="/marketing/s01-athlete.webp"
          alt=""
          fill
          sizes="(max-width: 640px) 80vw, 520px"
          className="object-cover object-[52%_36%]"
        />
      </div>

      <Container
        size="wide"
        className="relative flex min-h-[calc(100svh-4rem)] flex-col justify-center py-20 lg:min-h-[calc(100svh-92px)] lg:py-24"
      >
        <div className="flex flex-col gap-16 lg:flex-row lg:items-center lg:gap-12 xl:block">
          <div className="max-w-[560px] lg:max-w-[470px]">
            <p className="flex items-baseline gap-3">
              <span className="font-condensed text-[13px] font-semibold leading-none tracking-[0.1em] text-accent-light">
                01
              </span>
              <span className="font-condensed text-[11px] font-medium uppercase leading-none tracking-[0.3em] text-muted-foreground">
                What is an Athlesite?
              </span>
            </p>

            <h2 className="mt-7 text-[clamp(2.35rem,4.6vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-foreground">
              Your professional
              <br className="hidden sm:block" /> athlete website.
            </h2>

            <p className="mt-7 max-w-[440px] text-[16px] leading-[1.75] text-muted-foreground sm:text-[17px]">
              A central home for everything that defines you as an athlete. Share your story.
              Showcase your game. Get discovered.
            </p>

            <div className="mt-12 grid gap-x-10 sm:grid-cols-2">
              {benefits.map((benefit) => (
                <div key={benefit.number} className="border-t border-border pb-6 pt-5">
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    {benefit.icon}
                    <span className="font-condensed text-[10px] font-medium uppercase leading-none tracking-[0.24em] text-muted-foreground/60">
                      {benefit.number}
                    </span>
                  </div>
                  <h3 className="mt-4 text-[15px] font-semibold leading-none text-foreground">
                    {benefit.title}
                  </h3>
                  <p className="mt-2.5 max-w-[210px] text-[13.5px] leading-[1.5] text-muted-foreground">
                    {benefit.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Recomposed for narrow viewports: the Athlesite itself, scaled up */}
          <div className="flex justify-center lg:justify-end xl:hidden">
            <div className="s01-phone-scale relative">
              <JordanMobileSite />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function LinkIcon() {
  return (
    <Glyph>
      <path d="M8.4 11.6a3.4 3.4 0 0 0 5 .3l2-2a3.4 3.4 0 0 0-4.8-4.8l-1.1 1.1" />
      <path d="M11.6 8.4a3.4 3.4 0 0 0-5-.3l-2 2a3.4 3.4 0 0 0 4.8 4.8l1.1-1.1" />
    </Glyph>
  );
}

function ShieldIcon() {
  return (
    <Glyph>
      <path d="M10 2.5 16 5v4.6c0 3.6-2.4 6.2-6 7.9-3.6-1.7-6-4.3-6-7.9V5z" />
      <path d="m7.6 9.9 1.8 1.8 3.2-3.4" />
    </Glyph>
  );
}

function StarIcon() {
  return (
    <Glyph>
      <path d="m10 2.7 2.3 4.8 5.2.7-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2L2.5 8.2l5.2-.7z" />
    </Glyph>
  );
}

function PeopleIcon() {
  return (
    <Glyph>
      <circle cx="8" cy="6.6" r="2.6" />
      <path d="M2.9 16.2c.7-2.9 2.7-4.4 5.1-4.4s4.4 1.5 5.1 4.4" />
      <path d="M13.6 4.4a2.6 2.6 0 0 1 0 4.9M15.2 11.9c1.4.6 2.4 1.9 2.8 4" />
    </Glyph>
  );
}
