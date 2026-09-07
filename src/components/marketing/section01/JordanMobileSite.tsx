import type { ReactNode } from "react";
import Image from "next/image";
import { LogoMark } from "@/components/ui/Logo";
import { exampleAthlete } from "@/lib/example-athlete";
import { S01_PHONE } from "./composition";

const SEASON = [
  { value: "24", label: "GP" },
  { value: "58", label: "Rec" },
  { value: "842", label: "Yds" },
  { value: "12", label: "TD" },
];

const MEDIA = [
  { src: "/marketing/s01-media-1.webp", caption: "Week 7" },
  { src: "/marketing/s01-media-2.webp", caption: "Playoffs" },
  { src: "/marketing/s01-media-3.webp", caption: "Combine" },
];

const SOCIALS = ["IG", "X", "TT", "HD", "@"];

/**
 * Jordan Bell's Athlesite at mobile scale, in full — identity, recruiting
 * status, season line, highlights, media, NIL, and contact.
 *
 * This is the whole point of the section: the athlete's own content is the
 * visual, rather than a placeholder device parked beside a feature list.
 * Rendered at fixed design pixels; the parent stage scales it.
 */
export function JordanMobileSite() {
  return (
    <div
      className="relative rounded-[34px] bg-linear-to-b from-[#2a2d34] to-[#0e0f13] p-[4px] shadow-[0_60px_100px_-30px_rgba(0,0,0,0.95)]"
      style={{ width: S01_PHONE.width, height: S01_PHONE.height }}
    >
      <span aria-hidden="true" className="absolute -right-[2px] top-[140px] h-[56px] w-[2px] rounded-r bg-[#383b43]" />
      <span aria-hidden="true" className="absolute -left-[2px] top-[112px] h-[30px] w-[2px] rounded-l bg-[#383b43]" />
      <span aria-hidden="true" className="absolute -left-[2px] top-[158px] h-[46px] w-[2px] rounded-l bg-[#383b43]" />

      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[30px] bg-[#0b0c0f]">
        {/* Status bar */}
        <div className="relative flex h-[22px] shrink-0 items-center justify-between px-[16px] pt-[6px]">
          <span className="text-[8px] font-medium leading-none text-white/55">9:41</span>
          <span aria-hidden="true" className="absolute left-1/2 top-[4px] h-[15px] w-[72px] -translate-x-1/2 rounded-full bg-black" />
          <span aria-hidden="true" className="flex items-end gap-[2px]">
            <span className="h-[5px] w-[2px] rounded-[1px] bg-white/50" />
            <span className="h-[7px] w-[2px] rounded-[1px] bg-white/50" />
            <span className="h-[9px] w-[2px] rounded-[1px] bg-white/50" />
            <span className="ml-[4px] h-[7px] w-[13px] rounded-[2px] border border-white/45" />
          </span>
        </div>

        {/* App bar — the one link, stated plainly */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-[16px] py-[8px]">
          <span className="flex items-center gap-[6px]">
            <LogoMark className="h-[13px]" />
            <span className="text-[8px] leading-none tracking-[0.06em] text-white/55">
              {exampleAthlete.displayUrl}
            </span>
          </span>
          <span aria-hidden="true" className="flex flex-col gap-[3px]">
            <span className="h-[1.5px] w-[15px] rounded-full bg-white/65" />
            <span className="h-[1.5px] w-[15px] rounded-full bg-white/65" />
            <span className="h-[1.5px] w-[15px] rounded-full bg-white/65" />
          </span>
        </div>

        {/* Identity */}
        <div className="relative h-[178px] shrink-0">
          <Image
            src="/marketing/s01-identity.webp"
            alt=""
            fill
            sizes="360px"
            className="object-cover object-[62%_28%]"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, #0b0c0f 4%, rgba(11,12,15,0.72) 34%, rgba(11,12,15,0.05) 78%)",
            }}
          />
          <div className="absolute inset-x-[16px] bottom-[12px]">
            <p className="font-display text-[30px] leading-[0.92] tracking-[0.005em] text-foreground">
              Jordan Bell
            </p>
            <p className="mt-[6px] font-condensed text-[9.5px] font-semibold uppercase leading-none tracking-[0.2em] text-accent-light">
              #11 <span className="text-accent-light/40">·</span> {exampleAthlete.position}
            </p>
            <p className="mt-[6px] text-[8.5px] leading-none text-white/55">
              Class of {exampleAthlete.classYear} · {exampleAthlete.location} · {exampleAthlete.heightWeight}
            </p>
          </div>
        </div>

        {/* Recruiting status */}
        <div className="flex shrink-0 items-center justify-between border-y border-white/10 bg-white/[0.03] px-[16px] py-[9px]">
          <span className="flex items-center gap-[6px]">
            <span aria-hidden="true" className="h-[5px] w-[5px] rounded-full bg-accent" />
            <span className="font-condensed text-[8px] font-semibold uppercase leading-none tracking-[0.22em] text-foreground/85">
              Open to offers
            </span>
          </span>
          <span className="text-[8px] leading-none text-white/45">Coach contact ›</span>
        </div>

        {/* Season line */}
        <div className="grid shrink-0 grid-cols-4 px-[10px] py-[13px]">
          {SEASON.map((stat, index) => (
            <div key={stat.label} className="relative flex flex-col items-center">
              {index > 0 ? (
                <span aria-hidden="true" className="absolute left-0 top-[3px] h-[24px] w-px bg-white/10" />
              ) : null}
              <span className="font-display text-[21px] leading-none text-foreground">{stat.value}</span>
              <span className="mt-[6px] font-condensed text-[7px] font-medium uppercase leading-none tracking-[0.22em] text-white/40">
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        {/* Highlights */}
        <div className="shrink-0 px-[16px]">
          <SectionLabel>Highlights</SectionLabel>
          <div className="relative mt-[8px] h-[86px] overflow-hidden rounded-[8px]">
            <Image src="/marketing/s01-highlight.webp" alt="" fill sizes="360px" className="object-cover" />
            <span aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-black/80 via-black/10 to-transparent" />
            <span className="absolute left-1/2 top-[30px] flex h-[22px] w-[22px] -translate-x-1/2 items-center justify-center rounded-full border border-white/60 bg-black/30">
              <svg width="7" height="9" viewBox="0 0 7 9" fill="none" aria-hidden="true">
                <path d="M.8.7 6.2 4.5.8 8.3z" fill="#fff" />
              </svg>
            </span>
            <span className="absolute bottom-[7px] left-[9px] font-condensed text-[7.5px] font-medium uppercase tracking-[0.18em] text-white/85">
              Senior season reel
            </span>
            <span className="absolute bottom-[7px] right-[9px] text-[7.5px] text-white/60">2:14</span>
          </div>
        </div>

        {/* Media */}
        <div className="mt-[13px] shrink-0 px-[16px]">
          <SectionLabel>Media</SectionLabel>
          <div className="mt-[8px] grid grid-cols-3 gap-[6px]">
            {MEDIA.map((item) => (
              <div key={item.caption} className="relative h-[52px] overflow-hidden rounded-[5px]">
                <Image src={item.src} alt="" fill sizes="120px" className="object-cover" />
                <span aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent" />
                <span className="absolute bottom-[4px] left-[5px] text-[6.5px] leading-none text-white/75">
                  {item.caption}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* NIL & brand */}
        <div className="mt-[13px] shrink-0 px-[16px]">
          <SectionLabel>NIL &amp; Brand</SectionLabel>
          <p className="mt-[7px] text-[8.5px] leading-[1.5] text-white/60">
            Open to local and regional partnerships. Media kit available on request.
          </p>
        </div>

        {/* Contact */}
        <div className="mt-[13px] shrink-0 px-[16px] pb-[12px]">
          <SectionLabel>Contact</SectionLabel>
          <div className="mt-[8px] flex items-center gap-[6px]">
            {SOCIALS.map((handle) => (
              <span
                key={handle}
                className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-white/15 text-[7px] font-medium tracking-[0.06em] text-white/60"
              >
                {handle}
              </span>
            ))}
          </div>
        </div>

        <span aria-hidden="true" className="mx-auto mt-auto mb-[7px] h-[3px] w-[80px] shrink-0 rounded-full bg-white/30" />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="font-condensed text-[7.5px] font-semibold uppercase leading-none tracking-[0.28em] text-accent-light/85">
      {children}
    </p>
  );
}
