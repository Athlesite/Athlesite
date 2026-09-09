"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Progressive enhancement: content stays visible without hydration or JS. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!node || reduced.matches || !("IntersectionObserver" in window)) return;
    let animation: Animation | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      if (!reduced.matches) animation = node.animate(
        [{ opacity: 0.45, transform: "translateY(16px)" }, { opacity: 1, transform: "translateY(0)" }],
        { duration: 480, easing: "cubic-bezier(.2,.7,.2,1)" },
      );
      observer.disconnect();
    }, { threshold: 0.08 });
    const stopMotion = () => { if (reduced.matches) animation?.cancel(); };
    reduced.addEventListener("change", stopMotion);
    observer.observe(node);
    return () => { observer.disconnect(); animation?.cancel(); reduced.removeEventListener("change", stopMotion); };
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}
