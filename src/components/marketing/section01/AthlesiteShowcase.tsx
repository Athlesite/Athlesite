import Image from "next/image";
import { JordanMobileSite } from "./JordanMobileSite";
import { S01_FRAME, S01_PLATE, S01_PHONE, S01_STAT, S01_STATUS } from "./composition";

/**
 * The layered showcase: a cropped action photograph bleeding off the right
 * edge, a highlight frame emerging from behind the device, the athlete's own
 * mobile Athlesite in front, and two fragments — a season stat set in type on
 * open ground, and a recruiting status sitting directly on the photograph.
 *
 * Deliberately few pieces at deliberately different scales, so the section
 * reads as one composed image rather than a grid of cards. Decorative only;
 * it never intercepts pointer events from the copy beside it.
 */
export function AthlesiteShowcase() {
  return (
    <div className="s01-stage pointer-events-none absolute bottom-[72px] right-0 select-none">
      <div className="s01-stage-inner">
        {/* Cropped action photo */}
        <div className="absolute" style={S01_PLATE}>
          <Image
            src="/marketing/s01-athlete.webp"
            alt=""
            fill
            sizes="620px"
            className="object-cover object-[48%_32%]"
          />
        </div>

        {/* Highlight frame, emerging from behind the device */}
        <figure
          className="absolute overflow-hidden rounded-[12px] border border-border-strong bg-surface shadow-[0_40px_70px_-34px_rgba(0,0,0,0.95)]"
          style={S01_FRAME}
        >
          <Image
            src="/marketing/s01-highlight.webp"
            alt=""
            fill
            sizes="360px"
            className="object-cover"
          />
          <span aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-black/85 via-black/20 to-transparent" />
          <span className="absolute left-[16px] top-[16px] flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/55 bg-black/30">
            <svg width="9" height="11" viewBox="0 0 9 11" fill="none" aria-hidden="true">
              <path d="M1 .9 8 5.5 1 10.1z" fill="#fff" />
            </svg>
          </span>
          <figcaption className="absolute inset-x-[16px] bottom-[13px] flex items-baseline justify-between">
            <span className="font-condensed text-[9px] font-medium uppercase tracking-[0.22em] text-white/85">
              Highlight reel
            </span>
            <span className="text-[9px] text-white/55">2:14</span>
          </figcaption>
        </figure>

        {/* Device */}
        <div className="absolute" style={{ left: S01_PHONE.left, top: S01_PHONE.top }}>
          <JordanMobileSite />
        </div>

        {/* Season fragment — type on open ground, not another card */}
        <div className="absolute" style={S01_STAT}>
          <span className="block h-px w-full bg-border-strong" />
          <p className="mt-[16px] font-display text-[62px] leading-[0.86] text-foreground">842</p>
          <p className="mt-[12px] font-condensed text-[10px] font-medium uppercase leading-none tracking-[0.28em] text-muted-foreground">
            Receiving yards
          </p>
          <p className="mt-[8px] text-[12px] leading-none text-muted-foreground/70">
            2024 season · 24 games
          </p>
        </div>

        {/* Recruiting status, on the photograph */}
        <div
          className="absolute flex items-center gap-[9px] rounded-full border border-white/15 bg-black/45 px-[14px] py-[7px] backdrop-blur-[2px]"
          style={S01_STATUS}
        >
          <span aria-hidden="true" className="h-[6px] w-[6px] rounded-full bg-accent" />
          <span className="font-condensed text-[9px] font-semibold uppercase leading-none tracking-[0.22em] text-foreground/90">
            Open to offers
          </span>
          <span className="text-[9px] leading-none text-white/45">Class of 2027</span>
        </div>
      </div>
    </div>
  );
}
