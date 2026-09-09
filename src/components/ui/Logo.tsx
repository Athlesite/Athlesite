import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";

type LogoSurface = "dark" | "light";
type MarkVariant = "standard" | "micro";

type LogoMarkProps = {
  className?: string;
  surface?: LogoSurface;
  variant?: MarkVariant;
};

const STANDARD_MARKS: Record<LogoSurface, string> = {
  dark: "/brand/athlesite-mark-reference-on-dark.png",
  light: "/brand/athlesite-mark-on-light.svg",
};

const WORDMARKS: Record<LogoSurface, string> = {
  dark: "/brand/athlesite-wordmark-on-dark.png",
  light: "/brand/athlesite-wordmark-on-light.png",
};

/**
 * Brand V1 mark. The dark-surface asset is reference-exact artwork isolated
 * from the approved brand sheet; do not redraw it or substitute another A.
 * Light surfaces use the production-safe dark-ink variant.
 */
export function LogoMark({
  className,
  surface = "dark",
  variant = "standard",
}: LogoMarkProps) {
  const src =
    variant === "micro" && surface === "dark"
      ? "/brand/athlesite-mark-reference-on-dark.png"
      : STANDARD_MARKS[surface];

  return (
    <Image
      src={src}
      alt=""
      width={264}
      height={190}
      aria-hidden="true"
      className={cn("h-10 w-auto shrink-0", className)}
      unoptimized
    />
  );
}

type LogoProps = {
  className?: string;
  markClassName?: string;
  surface?: LogoSurface;
};

export function Logo({ className, markClassName, surface = "dark" }: LogoProps) {
  return (
    <Link
      href="/"
      aria-label="Athlesite home"
      className={cn(
        "inline-flex items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background",
        className
      )}
    >
      <LogoMark surface={surface} className={markClassName ?? "h-10 lg:h-[46px]"} />
      <Image
        src={WORDMARKS[surface]}
        alt=""
        width={369}
        height={28}
        aria-hidden="true"
        className="h-[9px] w-auto shrink-0 lg:h-[10px]"
        unoptimized
      />
    </Link>
  );
}
