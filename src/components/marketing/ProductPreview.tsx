import { Container } from "@/components/ui/Container";
import { AthlesiteShowcase } from "@/components/marketing/section01/AthlesiteShowcase";

const principles = [
  {
    number: "01",
    title: "One Link",
    copy: "Your story, highlights, recruiting information, and brand — together in one place.",
  },
  {
    number: "02",
    title: "Built Around You",
    copy: "A professional home for your identity, not another profile buried inside someone else’s platform.",
  },
  {
    number: "03",
    title: "Made to Move With You",
    copy: "From recruiting to college, NIL, and beyond, your Athlesite grows with your career.",
  },
];

export function ProductPreview() {
  return (
    <section
      id="for-athletes"
      className="relative isolate scroll-mt-24 overflow-hidden border-t border-black/10 bg-[#f2f1ed] text-[#0b0b0f]"
    >
      {/* Full-bleed sports scene. It deliberately reaches the viewport edge so
          the section feels like editorial art direction rather than a card. */}
      <div className="absolute inset-y-0 right-0 hidden w-[56%] xl:block">
        <AthlesiteShowcase />
      </div>

      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-[44%] z-10 hidden w-px bg-brand-blue xl:block"
      />

      <Container
        size="wide"
        className="relative z-20 flex min-h-[calc(100svh-88px)] flex-col justify-center py-20 lg:py-24 xl:pr-[58%]"
      >
        <div className="max-w-[610px] xl:max-w-[535px]">
          <div className="flex items-center gap-4">
            <span className="font-condensed text-[13px] font-semibold tracking-[0.12em] text-brand-blue">
              01
            </span>
            <span className="h-px w-10 bg-brand-blue/45" />
            <span className="font-condensed text-[11px] font-semibold uppercase tracking-[0.31em] text-black/48">
              Your Identity
            </span>
          </div>

          <h2 className="mt-8 font-display text-[clamp(3.2rem,6vw,5.75rem)] uppercase leading-[0.94] tracking-[-0.015em] text-[#0b0b0f]">
            Your professional
            <span className="block text-brand-blue">athlete website.</span>
          </h2>

          <p className="mt-8 max-w-[505px] text-[16px] leading-[1.72] text-black/64 sm:text-[18px]">
            Bring your story, highlights, stats, recruiting information, and personal brand
            together in one place built around you.
          </p>

          <div className="mt-12 border-t border-black/15">
            {principles.map((principle) => (
              <div
                key={principle.number}
                className="group grid grid-cols-[42px_1fr_auto] items-start gap-4 border-b border-black/15 py-6"
              >
                <span className="pt-[2px] font-condensed text-[11px] font-semibold tracking-[0.12em] text-brand-blue">
                  {principle.number}
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[#0b0b0f] sm:text-[16px]">
                    {principle.title}
                  </h3>
                  <p className="mt-2 max-w-[410px] text-[13.5px] leading-[1.55] text-black/52 sm:text-[14px]">
                    {principle.copy}
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="mt-1 font-condensed text-[17px] text-black/24 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-brand-blue"
                >
                  →
                </span>
              </div>
            ))}
          </div>

          <p className="mt-8 font-condensed text-[10px] font-semibold uppercase tracking-[0.28em] text-black/35">
            One athlete. One identity. One link.
          </p>
        </div>
      </Container>

      {/* On smaller screens the cinematic scene becomes its own full-width beat. */}
      <div className="relative h-[680px] border-t border-black/10 sm:h-[760px] xl:hidden">
        <AthlesiteShowcase />
      </div>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[0.16em] left-[-0.02em] hidden font-display text-[230px] leading-none text-black/[0.025] xl:block 2xl:text-[290px]"
      >
        01
      </span>
    </section>
  );
}
