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
  dark: "/brand/athlesite-mark-on-dark.svg",
  light: "/brand/athlesite-mark-on-light.svg",
};

/**
 * The approved flat Brand V1 mark.
 *
 * Use the micro variant only below 24px, where the full mark's finer geometry
 * loses definition. The current micro asset is intended for dark surfaces;
 * light surfaces fall back to the standard dark-ink mark.
 */
export function LogoMark({
  className,
  surface = "dark",
  variant = "standard",
}: LogoMarkProps) {
  const useMicroMark = variant === "micro" && surface === "dark";
  const src = useMicroMark
    ? "/brand/athlesite-micromark-on-dark.svg"
    : STANDARD_MARKS[surface];

  return (
    <Image
      src={src}
      alt=""
      width={120}
      height={105}
      aria-hidden="true"
      className={cn("h-8 w-auto shrink-0", className)}
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
        "inline-flex items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background",
        className
      )}
    >
      <LogoMark surface={surface} className={cn("h-9", markClassName)} />
      <span
        className={cn(
          "text-[1rem] font-medium uppercase leading-none tracking-[0.28em]",
          surface === "dark" ? "text-brand-off-white" : "text-brand-deep-black"
        )}
      >
        Athlesite
      </span>
    </Link>
  );
}
