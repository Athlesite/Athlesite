import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { AthlesiteShowcase } from "@/components/marketing/section01/AthlesiteShowcase";
import { JordanMobileSite } from "@/components/marketing/section01/JordanMobileSite";

const valueStatements = [
  {
    number: "01",
    title: "One Link",
    copy: "Everything you want coaches, fans, brands, and opportunities to see — in one place.",
  },
  {
    number: "02",
    title: "Built Around You",
    copy: "Your identity is not buried inside someone else’s social feed or recruiting database.",
  },
  {
    number: "03",
    title: "Made to Move With You",
    copy: "From recruiting to college to NIL and beyond, your Athlesite can grow with your career.",
  },
];

export function ProductPreview() {
  return (
    <section
      id="for-athletes"
      className="relative isolate scroll-mt-24 overflow-hidden border-t border-border bg-surface/25"
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
          <div className="max-w-[580px] lg:max-w-[500px]">
            <p className="flex items-baseline gap-3">
              <span className="font-condensed text-[13px] font-semibold leading-none tracking-[0.1em] text-accent-light">
                01
              </span>
              <span className="font-condensed text-[11px] font-medium uppercase leading-none tracking-[0.3em] text-muted-foreground">
                Your Identity
              </span>
            </p>

            <h2 className="mt-7 text-[clamp(2.35rem,4.6vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-foreground">
              Your professional
              <br className="hidden sm:block" /> athlete website.
            </h2>

            <p className="mt-7 max-w-[470px] text-[16px] leading-[1.75] text-white/70 sm:text-[17px]">
              Bring your story, highlights, stats, recruiting information, and personal brand
              together in one place built around you.
            </p>

            <div className="mt-12 divide-y divide-border border-y border-border">
              {valueStatements.map((statement) => (
                <div
                  key={statement.number}
                  className="grid gap-3 py-5 sm:grid-cols-[74px_1fr] sm:gap-5 sm:py-6"
                >
                  <span className="font-condensed text-[10px] font-semibold uppercase leading-none tracking-[0.24em] text-muted-foreground/55">
                    {statement.number}
                  </span>
                  <div>
                    <h3 className="text-[15px] font-semibold leading-none text-foreground sm:text-[16px]">
                      {statement.title}
                    </h3>
                    <p className="mt-2.5 max-w-[390px] text-[13.5px] leading-[1.55] text-muted-foreground sm:text-[14px]">
                      {statement.copy}
                    </p>
                  </div>
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
