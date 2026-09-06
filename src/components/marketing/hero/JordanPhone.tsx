import Image from "next/image";
import { LogoMark } from "@/components/ui/Logo";
import { exampleAthlete } from "@/lib/example-athlete";
import { JORDAN_JERSEY, JORDAN_SEASON_STATS, PHONE } from "./composition";

const MOBILE_STATS = [
  JORDAN_SEASON_STATS[0],
  JORDAN_SEASON_STATS[2],
  JORDAN_SEASON_STATS[3],
];

/**
 * The same Athlesite at mobile scale, overlapping the laptop on the far right
 * of the hero. Rendered at fixed design pixels so a parent can scale it — on
 * small screens it becomes the hero device and is scaled *up*, never shrunk.
 */
export function JordanPhone() {
  return (
    <div
      className="relative rounded-[30px] bg-linear-to-b from-[#2b2e36] to-[#101116] p-[4px] shadow-[0_50px_80px_-24px_rgba(0,0,0,0.95)]"
      style={{ width: PHONE.width, height: PHONE.height }}
    >
      {/* Side buttons */}
      <span aria-hidden="true" className="absolute -right-[2px] top-[92px] h-[34px] w-[2px] rounded-r bg-[#3a3d45]" />
      <span aria-hidden="true" className="absolute -right-[2px] top-[136px] h-[52px] w-[2px] rounded-r bg-[#3a3d45]" />
      <span aria-hidden="true" className="absolute -left-[2px] top-[104px] h-[26px] w-[2px] rounded-l bg-[#3a3d45]" />

      <div className="relative h-full w-full overflow-hidden rounded-[26px] bg-[#0b0c0f]">
        {/* Athlete photo filling the upper right of the screen */}
        <div className="absolute right-0 top-[26px] h-[248px] w-[139px]">
          <Image
            src="/marketing/hero-athlete-portrait.webp"
            alt=""
            fill
            sizes="200px"
            className="object-cover object-top"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(95deg, #0b0c0f 0%, rgba(11,12,15,0.86) 26%, rgba(11,12,15,0.2) 62%, transparent 100%)",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[64px]"
            style={{ background: "linear-gradient(to top, #0b0c0f 12%, transparent 100%)" }}
          />
        </div>

        {/* Status bar */}
        <div className="relative flex h-[20px] items-center justify-between px-[13px] pt-[5px]">
          <span className="text-[6.5px] font-medium leading-none text-white/60">9:41</span>
          <span aria-hidden="true" className="absolute left-1/2 top-[3px] h-[13px] w-[58px] -translate-x-1/2 rounded-full bg-black" />
          <span aria-hidden="true" className="flex items-end gap-[2px]">
            <span className="h-[4px] w-[2px] rounded-[1px] bg-white/55" />
            <span className="h-[5.5px] w-[2px] rounded-[1px] bg-white/55" />
            <span className="h-[7px] w-[2px] rounded-[1px] bg-white/55" />
            <span className="ml-[3px] h-[6px] w-[10px] rounded-[2px] border border-white/50" />
          </span>
        </div>

        {/* App bar */}
        <div className="relative flex items-center justify-between px-[13px] pt-[8px]">
          <span className="flex items-center gap-[4px]">
            <LogoMark className="h-[11px]" />
            <span className="text-[6px] font-semibold uppercase leading-none tracking-[0.24em] text-white/80">
              Athlesite
            </span>
          </span>
          <span aria-hidden="true" className="flex flex-col gap-[2.5px]">
            <span className="h-[1.5px] w-[13px] rounded-full bg-white/70" />
            <span className="h-[1.5px] w-[13px] rounded-full bg-white/70" />
            <span className="h-[1.5px] w-[13px] rounded-full bg-white/70" />
          </span>
        </div>

        {/* Name plate */}
        <div className="relative px-[13px] pt-[16px]">
          <p className="font-display text-[15px] leading-[0.9] text-white">Jordan</p>
          <p className="font-display text-[38px] leading-[0.86] text-white">Bell</p>
          <p className="mt-[7px] font-condensed text-[10px] font-semibold uppercase leading-none tracking-[0.16em] text-accent-light">
            #{JORDAN_JERSEY} <span className="text-accent-light/45">|</span> WR
          </p>

          <span className="mt-[13px] inline-flex h-[25px] items-center gap-[5px] rounded-full bg-accent px-[11px] text-[9px] font-medium text-white">
            <PlayGlyph />
            Watch Reel
          </span>
        </div>

        {/* Stats */}
        <div className="relative mt-[20px] px-[13px]">
          <p className="font-condensed text-[7.5px] font-semibold uppercase leading-none tracking-[0.28em] text-accent-light">
            Stats
          </p>
          <div className="mt-[9px] grid grid-cols-3">
            {MOBILE_STATS.map((stat, index) => (
              <div key={stat.label} className="relative flex flex-col items-start pl-[9px] first:pl-0">
                {index > 0 ? (
                  <span aria-hidden="true" className="absolute left-0 top-[2px] h-[24px] w-px bg-white/12" />
                ) : null}
                <span className="font-display text-[20px] leading-none text-white">{stat.value}</span>
                <span className="mt-[5px] font-condensed text-[6.5px] font-medium uppercase leading-none tracking-[0.2em] text-white/45">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Highlights */}
        <div className="relative mt-[16px] px-[13px]">
          <div className="flex items-center justify-between">
            <p className="font-condensed text-[7.5px] font-semibold uppercase leading-none tracking-[0.28em] text-accent-light">
              Highlights
            </p>
            <ShieldGlyph />
          </div>
          <div className="relative mt-[8px] h-[74px] w-full overflow-hidden rounded-[7px]">
            <Image
              src="/marketing/hero-highlight.webp"
              alt=""
              fill
              sizes="240px"
              className="object-cover"
            />
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent"
            />
            <span className="absolute bottom-[6px] left-[7px] font-condensed text-[6.5px] font-medium uppercase tracking-[0.2em] text-white/85">
              Week 7 · vs Cedar Park
            </span>
          </div>
        </div>
        {/* Quick links + home indicator, so the screen reads as a full page */}
        <div className="relative mt-[12px] px-[13px]">
          {["About Me", "Recruiting"].map((label) => (
            <div
              key={label}
              className="flex items-center justify-between border-t border-white/10 py-[6px] text-[8px] text-white/70"
            >
              {label}
              <svg width="4" height="7" viewBox="0 0 4 7" fill="none" aria-hidden="true">
                <path d="M.7.7 3.3 3.5.7 6.3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
              </svg>
            </div>
          ))}
        </div>
        <span
          aria-hidden="true"
          className="absolute bottom-[6px] left-1/2 h-[3px] w-[62px] -translate-x-1/2 rounded-full bg-white/35"
        />
      </div>

      <span className="sr-only">
        Preview of the {exampleAthlete.name} Athlesite on mobile
      </span>
    </div>
  );
}

function PlayGlyph() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="5.4" stroke="currentColor" strokeWidth="1" opacity="0.65" />
      <path d="M4.9 3.9 8.3 6l-3.4 2.1z" fill="currentColor" />
    </svg>
  );
}

function ShieldGlyph() {
  return (
    <svg width="9" height="10" viewBox="0 0 12 13" fill="none" aria-hidden="true" className="text-white/40">
      <path d="M6 1 10.5 2.7v4.1c0 2.5-1.8 4.3-4.5 5.2C3.3 11.1 1.5 9.3 1.5 6.8V2.7z" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}
