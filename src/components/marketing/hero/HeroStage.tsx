import Image from "next/image";
import { JordanLaptop } from "./JordanLaptop";
import { JordanPhone } from "./JordanPhone";
import { ATHLETE, ATHLETE_PLATE, LAPTOP_SCREEN, PHONE } from "./composition";

/**
 * The hero's right-hand cinematic composition: a night-stadium plate, the
 * athlete standing above and behind the devices, his laptop Athlesite, and his
 * phone Athlesite overlapping it. Purely decorative — it never intercepts
 * pointer events from the copy beside it.
 */
export function HeroStage() {
  return (
    <div className="hero-stage pointer-events-none absolute bottom-0 right-0 select-none">
      <div className="hero-stage-inner">
        {/* Athlete — dominant subject. His legs dissolve behind the laptop so
            the figure sits in the scene instead of standing on the fold. */}
        <div
          className="absolute"
          style={{
            ...ATHLETE,
            maskImage: "linear-gradient(to bottom, #000 0%, #000 68%, transparent 82%)",
            WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 68%, transparent 82%)",
          }}
        >
          <Image
            src={ATHLETE_PLATE}
            alt=""
            fill
            sizes="800px"
            className="object-cover"
            priority
          />
        </div>

        {/* Laptop, sitting in front of him */}
        <div className="absolute" style={{ left: LAPTOP_SCREEN.left - 7, top: LAPTOP_SCREEN.top - 7 }}>
          <JordanLaptop />
        </div>

        {/* Phone, overlapping the laptop on the far right */}
        <div className="absolute" style={{ left: PHONE.left, top: PHONE.top }}>
          <JordanPhone />
        </div>
      </div>
    </div>
  );
}

/**
 * Full-bleed night-stadium atmosphere behind the whole hero. Kept separate
 * from the scaled stage so it always covers the section, however tall it is.
 */
export function HeroAtmosphere() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute right-0 top-[-20px] h-[520px] w-[min(1100px,80%)]">
        <Image
          src="/marketing/hero-stadium.webp"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-[75%_50%] xl:object-[45%_50%]"
          priority
        />
      </div>

      {/* Fade the whole right-hand scene into black under the copy */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, #090a0c 0%, #090a0c 22%, rgba(9,10,12,0.9) 33%, rgba(9,10,12,0.5) 45%, rgba(9,10,12,0.1) 62%, transparent 76%)",
        }}
      />
      {/* Floodlight bank flaring in from the far side of the stadium */}
      <div
        className="absolute right-[1%] top-[10%] h-[360px] w-[520px]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(236,238,236,0.34), rgba(176,184,206,0.15) 34%, rgba(89,104,196,0.07) 60%, transparent 80%)",
        }}
      />

      {/* Cobalt bloom from the stadium lights */}
      <div className="absolute right-[6%] top-[6%] h-[420px] w-[560px] rounded-full bg-[#5968c4]/10 blur-[130px]" />
      <div className="absolute -bottom-24 left-[38%] h-[380px] w-[620px] rounded-full bg-[#3c4785]/10 blur-[140px]" />
    </div>
  );
}
