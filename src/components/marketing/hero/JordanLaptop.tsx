import Image from "next/image";
import { LogoMark } from "@/components/ui/Logo";
import { exampleAthlete } from "@/lib/example-athlete";
import {
  ATHLETE_IN_SCREEN,
  ATHLETE_PLATE,
  JORDAN_JERSEY,
  JORDAN_SEASON_STATS,
  LAPTOP_SCREEN,
} from "./composition";

/**
 * The laptop the hero athlete stands behind, showing his Athlesite.
 *
 * Rendered at fixed design-pixel sizes; the parent stage scales it. The screen
 * re-renders the same athlete plate at the offset that continues his body from
 * the figure behind, so the device reads as a window onto the same scene.
 */
export function JordanLaptop() {
  const { width, height } = LAPTOP_SCREEN;
  const bezel = 7;

  return (
    <div className="relative" style={{ width: width + bezel * 2 }}>
      {/* Lid */}
      <div
        className="relative rounded-t-[14px] rounded-b-[4px] bg-linear-to-b from-[#33363f] to-[#191b21] shadow-[0_50px_90px_-30px_rgba(0,0,0,0.95)]"
        style={{ padding: bezel }}
      >
        <div
          className="relative overflow-hidden rounded-[8px] bg-[#0b0c0f]"
          style={{ width, height }}
        >
          {/* Athlete, continued from behind the device */}
          <div className="absolute" style={ATHLETE_IN_SCREEN}>
            <Image
              src={ATHLETE_PLATE}
              alt=""
              fill
              sizes="800px"
              className="object-cover brightness-[1.3] contrast-[1.04] saturate-[0.9]"
              priority
            />
          </div>

          {/* Reading scrim so the name-plate stays legible over the photo */}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(97deg, #0b0c0f 0%, #0b0c0f 28%, rgba(11,12,15,0.82) 42%, rgba(11,12,15,0.3) 58%, rgba(11,12,15,0) 78%, rgba(11,12,15,0.22) 100%)",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[46%]"
            style={{
              background:
                "linear-gradient(to top, rgba(11,12,15,0.97) 34%, rgba(11,12,15,0.55) 68%, transparent 100%)",
            }}
          />

          {/* Screen content */}
          <div className="absolute left-10 top-[22px] w-[340px]">
            <div className="flex items-center gap-1.5">
              <LogoMark className="h-[13px]" />
              <span className="text-[7.5px] font-semibold uppercase leading-none tracking-[0.24em] text-white/80">
                Athlesite
              </span>
            </div>

            <p className="mt-[30px] font-display text-[26px] leading-[0.92] tracking-[0.01em] text-white">
              Jordan
            </p>
            <p className="font-display text-[72px] leading-[0.88] tracking-[-0.005em] text-white">
              Bell
            </p>

            <p className="mt-[16px] font-condensed text-[16px] font-semibold uppercase leading-none tracking-[0.16em] text-accent-light">
              #{JORDAN_JERSEY} <span className="text-accent-light/45">|</span> {exampleAthlete.position}
            </p>

            <p className="mt-[16px] text-[13px] leading-[1.7] text-white/70">
              Class of {exampleAthlete.classYear} · {exampleAthlete.location}
            </p>
            <p className="text-[13px] leading-[1.7] text-white/70">{exampleAthlete.heightWeight}</p>

            <div className="mt-[18px] flex items-center gap-[10px]">
              <span className="inline-flex h-[32px] items-center gap-[7px] rounded-[8px] bg-accent px-[13px] text-[11.5px] font-medium text-white">
                <PlayGlyph />
                Watch Highlight Reel
              </span>
              <span className="inline-flex h-[32px] items-center gap-[7px] rounded-[8px] border border-white/18 px-[13px] text-[11.5px] font-medium text-white/85">
                <ProfileGlyph />
                View Profile
              </span>
            </div>
          </div>

          {/* Season line */}
          <div className="absolute bottom-[26px] left-[14px] grid w-[556px] grid-cols-5">
            {JORDAN_SEASON_STATS.map((stat, index) => (
              <div key={stat.label} className="relative flex flex-col items-center justify-center">
                {index > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1/2 h-[46px] w-px -translate-y-1/2 bg-white/12"
                  />
                ) : null}
                <span className="font-display text-[32px] leading-none text-white">{stat.value}</span>
                <span className="mt-[9px] font-condensed text-[9px] font-medium uppercase leading-none tracking-[0.22em] text-white/45">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>

          {/* Glass sheen */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(112deg, rgba(255,255,255,0.055) 0%, transparent 32%, transparent 72%, rgba(255,255,255,0.03) 100%)",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[8px] ring-1 ring-inset ring-white/[0.07]"
          />
        </div>
      </div>

      {/* Base */}
      <div className="relative left-1/2 h-[15px] w-[842px] -translate-x-1/2 rounded-b-[11px] bg-linear-to-b from-[#3b3e47] via-[#2a2c33] to-[#15161b] shadow-[0_26px_40px_-18px_rgba(0,0,0,0.9)]">
        <span className="absolute left-1/2 top-0 h-[5px] w-[96px] -translate-x-1/2 rounded-b-[5px] bg-[#0d0e12]/80" />
      </div>
      <div
        aria-hidden="true"
        className="mx-auto h-[3px] w-[900px] rounded-full bg-black/70 blur-[4px]"
      />
    </div>
  );
}

function PlayGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="5.4" stroke="currentColor" strokeWidth="1" opacity="0.65" />
      <path d="M4.9 3.9 8.3 6l-3.4 2.1z" fill="currentColor" />
    </svg>
  );
}

function ProfileGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="4.4" r="2.1" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2.4 10.2c.5-1.9 1.9-2.9 3.6-2.9s3.1 1 3.6 2.9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
