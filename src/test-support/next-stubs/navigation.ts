/**
 * Test double for `next/navigation`.
 *
 * The real module needs a mounted App Router context and throws
 * "invariant expected app router to be mounted" outside one. These tests are about the
 * age gate's own state transitions, not about Next's routing, so a double is both
 * sufficient and more honest than wiring Next internals into the harness.
 *
 * Mapped in by scripts/alias-resolver-hook.mjs, which is test-time only — the Next
 * build never sees this file.
 */

type PushedRoute = { method: "push" | "replace"; href: string };

/** Routes requested during a test, so navigation can be asserted if needed. */
export const navigations: PushedRoute[] = [];

export function resetNavigations(): void {
  navigations.length = 0;
}

/**
 * One router instance for the whole test run.
 *
 * It has to be stable by identity. Components put the router in effect dependency
 * arrays — `OnboardingWizard`'s ownership check does — and returning a fresh object
 * literal from `useRouter()` made that dependency change on *every* render, so the
 * effect re-ran in a loop, re-issuing `getCurrentUser` and `checkOwnershipStatus`
 * calls and making authenticated behaviour impossible to observe. The real
 * `useRouter` returns a stable instance, so a double that does not is simply wrong.
 *
 * Methods are defined once on this object rather than recreated, so their identities
 * are stable too. Calls are still recorded in `navigations` for assertions.
 */
const router = {
  push: (href: string) => {
    navigations.push({ method: "push", href });
  },
  replace: (href: string) => {
    navigations.push({ method: "replace", href });
  },
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
};

export function useRouter(): typeof router {
  return router;
}

export function usePathname(): string {
  return "/get-started";
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams();
}

export function redirect(href: string): never {
  throw new Error(`redirect(${href}) called during a test`);
}

export function notFound(): never {
  throw new Error("notFound() called during a test");
}
