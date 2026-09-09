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

/** Marketing-only device rendering of Jordan's Athlesite. */
export function JordanMobileSite() {
  return (
    <div
      className="relative rounded-[49px] bg-[linear-gradient(145deg,#777b82_0%,#25282d_14%,#090a0d_47%,#34373d_78%,#8a8e94_100%)] p-[7px] shadow-[0_70px_120px_-28px_rgba(0,0,0,0.92),0_0_0_1px_rgba(255,255,255,0.18)]"
      style={{ width: S01_PHONE.width, height: S01_PHONE.height }}
    >
      {/* Physical controls on the titanium rail. */}
      <span aria-hidden="true" className="absolute -left-[4px] top-[90px] h-[24px] w-[4px] rounded-l-[3px] bg-[#24272c] shadow-[-1px_0_0_rgba(255,255,255,0.13)]" />
      <span aria-hidden="true" className="absolute -left-[4px] top-[128px] h-[48px] w-[4px] rounded-l-[3px] bg-[#24272c] shadow-[-1px_0_0_rgba(255,255,255,0.13)]" />
      <span aria-hidden="true" className="absolute -left-[4px] top-[188px] h-[48px] w-[4px] rounded-l-[3px] bg-[#24272c] shadow-[-1px_0_0_rgba(255,255,255,0.13)]" />
      <span aria-hidden="true" className="absolute -right-[4px] top-[145px] h-[74px] w-[4px] rounded-r-[3px] bg-[#24272c] shadow-[1px_0_0_rgba(255,255,255,0.13)]" />

      <div className="relative h-full w-full overflow-hidden rounded-[42px] bg-black p-[3px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[39px] bg-[#0b0c0f]">
          {/* Glass reflection: barely visible, but enough to make the object feel physical. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-50 bg-[linear-gradient(118deg,rgba(255,255,255,0.11)_0%,rgba(255,255,255,0.025)_17%,transparent_34%)]"
          />

          {/* Status bar */}
          <div className="relative z-10 flex h-[25px] shrink-0 items-center justify-between px-[17px] pt-[7px]">
            <span className="text-[8px] font-semibold leading-none text-white/72">9:41</span>
            <span
              aria-hidden="true"
              className="absolute left-1/2 top-[5px] h-[18px] w-[82px] -translate-x-1/2 rounded-full bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)]"
            >
              <span className="absolute right-[9px] top-[6px] h-[5px] w-[5px] rounded-full bg-[#101114] shadow-[inset_0_0_0_1px_rgba(90,110,150,0.18)]" />
            </span>
            <span aria-hidden="true" className="flex items-end gap-[2px] text-white/65">
              <span className="h-[5px] w-[2px] rounded-[1px] bg-current" />
              <span className="h-[7px] w-[2px] rounded-[1px] bg-current" />
              <span className="h-[9px] w-[2px] rounded-[1px] bg-current" />
              <span className="ml-[4px] h-[8px] w-[14px] rounded-[2px] border border-current">
                <span className="block h-full w-[72%] bg-current" />
              </span>
            </span>
          </div>

          {/* App bar */}
          <div className="relative z-10 flex shrink-0 items-center justify-between border-b border-white/10 px-[16px] py-[8px]">
            <span className="flex items-center gap-[6px]">
              <LogoMark variant="micro" className="h-[16px]" />
              <span className="text-[8px] leading-none tracking-[0.05em] text-white/58">
                {exampleAthlete.displayUrl}
              </span>
            </span>
            <span aria-hidden="true" className="flex flex-col gap-[3px]">
              <span className="h-[1.5px] w-[15px] rounded-full bg-white/70" />
              <span className="h-[1.5px] w-[15px] rounded-full bg-white/70" />
              <span className="h-[1.5px] w-[15px] rounded-full bg-white/70" />
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

          <span aria-hidden="true" className="mx-auto mt-auto mb-[8px] h-[4px] w-[86px] shrink-0 rounded-full bg-white/30" />
        </div>
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
