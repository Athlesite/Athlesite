import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

type ContainerProps = ComponentPropsWithoutRef<"div">;

export function Container({ className, children, ...rest }: ContainerProps) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-6 sm:px-8", className)} {...rest}>
      {children}
    </div>
  );
}
