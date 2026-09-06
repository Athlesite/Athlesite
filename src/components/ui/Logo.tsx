import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Angular "A" monogram. The mark is the one place the electric cobalt
 * survives — it carries the brand energy so the rest of the UI can stay
 * restrained. Stops read design tokens so a rebrand happens in one file.: a heavy cobalt left limb, a detached right limb, and
 * feet that catch light — matching the approved marketing design reference.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 52 46"
      fill="none"
      aria-hidden="true"
      className={cn("h-[30px] w-auto", className)}
    >
      <defs>
        <linearGradient id="athlesite-mark" x1="0.3" y1="0" x2="0.15" y2="1">
          <stop offset="0" stopColor="var(--accent-electric)" />
          <stop offset="0.6" stopColor="#3a4ec9" />
          <stop offset="0.88" stopColor="#97a2e6" />
          <stop offset="1" stopColor="var(--foreground)" />
        </linearGradient>
        <linearGradient id="athlesite-mark-leg" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="var(--accent-electric)" />
          <stop offset="0.72" stopColor="#3a4ec9" />
          <stop offset="1" stopColor="#dfe2f2" />
        </linearGradient>
      </defs>
      {/* Apex + left limb */}
      <path
        d="M24.5 1h9.5L13.5 45H2.5Z"
        fill="url(#athlesite-mark)"
      />
      {/* Crossbar sweeping under the counter */}
      <path
        d="M15.5 26.2h22.5l2.4 8.4H13Z"
        fill="url(#athlesite-mark)"
      />
      {/* Detached right limb */}
      <path
        d="M33 14h8l11 31H41Z"
        fill="url(#athlesite-mark-leg)"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-3 rounded-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      <LogoMark />
      <span className="text-[1.05rem] font-semibold uppercase leading-none tracking-[0.24em] text-foreground">
        Athlesite
      </span>
    </Link>
  );
}
