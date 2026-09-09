/** Shared by the running homepage and its standalone review export. */
export function startHomepageMotion(root: HTMLElement): () => void {
  if (!("IntersectionObserver" in window) || !("animate" in HTMLElement.prototype)) return () => {};
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const narrow = window.matchMedia("(max-width: 600px)");
  const animations = new Set<Animation>();
  const seen = new WeakSet<Element>();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || seen.has(entry.target)) continue;
      const node = entry.target as HTMLElement;
      seen.add(node);
      observer.unobserve(node);
      if (reduced.matches) continue;
      const variant = node.dataset.homeReveal;
      const image = variant === "image";
      const transform = !narrow.matches && (variant === "left" || variant === "right")
        ? `translateX(${variant === "left" ? "-" : ""}28px)`
        : image ? "translateY(36px) scale(.975)" : "translateY(26px)";
      const requestedDelay = Number(node.dataset.homeDelay || 0);
      const delay = narrow.matches || !Number.isFinite(requestedDelay) ? 0 : Math.min(180, Math.max(0, requestedDelay));
      const animation = node.animate([
        { opacity: .3, transform },
        { opacity: 1, transform: "none" },
      ], { duration: image ? 800 : 680, delay, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
      animations.add(animation);
      animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
    }
  }, { threshold: .08, rootMargin: "0px 0px -28px 0px" });
  for (const node of root.querySelectorAll<HTMLElement>("[data-home-reveal]")) {
    const rect = node.getBoundingClientRect();
    // Leave the initial viewport and deep-link destination stable on hydration.
    if (rect.top < window.innerHeight && rect.bottom > 0) seen.add(node);
    else observer.observe(node);
  }
  const cancel = () => { animations.forEach(animation => animation.cancel()); animations.clear(); };
  const onPreference = () => { if (reduced.matches) cancel(); };
  reduced.addEventListener("change", onPreference);
  return () => { observer.disconnect(); cancel(); reduced.removeEventListener("change", onPreference); };
}
