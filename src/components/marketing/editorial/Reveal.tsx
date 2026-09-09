import type { ReactNode } from "react";

/** Progressive enhancement: content stays visible without hydration or JS. */
export function Reveal({ children, className, variant = "up", delay = 0 }: {
  children: ReactNode; className?: string;
  variant?: "up" | "image" | "left" | "right"; delay?: number;
}) {
  return <div className={className} data-home-reveal={variant} data-home-delay={delay}>{children}</div>;
}
