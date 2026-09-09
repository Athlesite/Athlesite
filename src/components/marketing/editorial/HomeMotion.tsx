"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { startHomepageMotion } from "./motion";

export function HomeMotion({ children, className }: { children: ReactNode; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current ? startHomepageMotion(ref.current) : undefined, []);
  return <div ref={ref} className={className} data-home-root>{children}</div>;
}
