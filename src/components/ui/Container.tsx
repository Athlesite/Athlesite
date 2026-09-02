import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

type ContainerProps = ComponentPropsWithoutRef<"div"> & {
  /**
   * `wide` matches the marketing design reference's near-full-bleed measure,
   * used by the site chrome and the homepage hero. Everything else keeps the
   * original reading width.
   */
  size?: "default" | "wide";
};

const sizeClasses = {
  default: "max-w-6xl px-6 sm:px-8",
  wide: "max-w-[1520px] px-6 sm:px-10 lg:px-16",
} as const;

export function Container({ className, children, size = "default", ...rest }: ContainerProps) {
  return (
    <div className={cn("mx-auto w-full", sizeClasses[size], className)} {...rest}>
      {children}
    </div>
  );
}
