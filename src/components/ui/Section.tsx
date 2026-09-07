import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

type SectionProps = ComponentPropsWithoutRef<"section">;

export function Section({ className, children, ...rest }: SectionProps) {
  return (
    <section className={cn("py-20 sm:py-28", className)} {...rest}>
      {children}
    </section>
  );
}
