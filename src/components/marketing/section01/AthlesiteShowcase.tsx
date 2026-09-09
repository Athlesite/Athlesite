import Image from "next/image";
import { JordanMobileSite } from "./JordanMobileSite";

/**
 * Section 01 is one cinematic scene, not a pile of UI fragments. The athlete
 * photograph fills the entire right-hand field and the phone is the single
 * product object layered over it. This makes the composition feel like sports
 * editorial art direction while keeping the product itself unmistakable.
 */
export function AthlesiteShowcase() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#090a0d]">
      <Image
        src="/marketing/s01-athlete.webp"
        alt=""
        fill
        sizes="(min-width: 1280px) 56vw, 100vw"
        className="object-cover object-[58%_42%]"
      />

      {/* Grade the existing photograph into one coherent scene rather than
          cutting the player out onto empty black. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,8,0.82)_0%,rgba(5,6,8,0.36)_24%,rgba(5,6,8,0.02)_56%,rgba(5,6,8,0.18)_100%)]"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(0deg,rgba(4,5,7,0.72)_0%,transparent_36%,rgba(2,3,5,0.12)_72%,rgba(2,3,5,0.3)_100%)]"
      />
      <span
        aria-hidden="true"
        className="absolute -left-[12%] top-[12%] h-[58%] w-[48%] rounded-full bg-brand-blue/14 blur-[110px]"
      />

      {/* Oversized chapter typography gives the sports-editorial scale that the
          previous floating stat fragments were missing. */}
      <div className="pointer-events-none absolute bottom-5 right-6 text-right sm:bottom-8 sm:right-8">
        <p className="font-display text-[82px] uppercase leading-[0.78] tracking-[-0.02em] text-white/[0.09] sm:text-[110px] xl:text-[132px]">
          Identity
        </p>
        <p className="mt-4 font-condensed text-[10px] font-semibold uppercase tracking-[0.34em] text-white/42">
          Built around the athlete
        </p>
      </div>

      {/* One believable device. Its perspective and shadow are deliberately
          physical; the website UI remains flat inside the glass. */}
      <div
        className="absolute left-[7%] top-1/2 origin-center -translate-y-1/2 sm:left-[12%] xl:left-[8%]"
        style={{
          transform:
            "translateY(-50%) perspective(1400px) rotateY(-7deg) rotateZ(1.25deg)",
        }}
      >
        <div className="relative">
          <span
            aria-hidden="true"
            className="absolute -inset-10 rounded-[70px] bg-black/50 blur-3xl"
          />
          <div className="relative scale-[0.88] sm:scale-[1.02] xl:scale-[1.08] 2xl:scale-[1.15]">
            <JordanMobileSite />
          </div>
        </div>
      </div>

      {/* A single annotation ties the product object to the story without
          reintroducing card clutter. */}
      <div className="absolute left-[8%] top-[7%] hidden items-center gap-3 xl:flex">
        <span className="h-px w-12 bg-white/35" />
        <span className="font-condensed text-[9px] font-semibold uppercase tracking-[0.3em] text-white/55">
          Your site · one link
        </span>
      </div>
    </div>
  );
}
