import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Testing on a real phone? `next dev` 403s requests to `/_next/*` from any
   * host it was not started with, so opening the dev server by LAN IP serves
   * the page but none of its JavaScript. Onboarding then renders blank rather
   * than erroring, because the wizard is gated behind hydration.
   *
   * Add your machine's LAN IP locally while device-testing, then remove it —
   * it is machine-specific and does not belong in shared config:
   *
   *   allowedDevOrigins: ["192.168.x.x"],
   *
   * Development only; the option has no effect in a production build.
   */

  /**
   * Trailing slashes, end to end (Checkpoint 5D.3 follow-up).
   *
   * By default Next inserts its OWN redirect ahead of anything in
   * `redirects()` below: with `trailingSlash` left at its default `false`,
   * any request ending in `/` is 308'd to the slash-stripped path *first*,
   * and only that already-stripped path is ever checked against our own
   * rules. That is a real, separate round trip to the browser, not an
   * internal pipeline step — which is exactly what produced a two-hop chain
   * for the legacy athlete path: `/athletes/jordan-bell/` → (Next's own
   * redirect) `/athletes/jordan-bell` → (our rule, below) `/jordan-bell`.
   * There is no way to reorder or merge into that framework-level pass; it
   * is inserted unconditionally unless this flag turns it off.
   *
   * `skipTrailingSlashRedirect: true` turns that automatic pass off
   * entirely and hands trailing-slash handling to us — at which point our
   * own `redirects()` becomes the single source of truth for it, so the
   * legacy-path rules below can each cover their own trailing-slash form
   * directly, in one hop, with nothing running ahead of them.
   *
   * Turning it off site-wide has one consequence that has to be taken
   * deliberately rather than left as a gap: every other route stops
   * normalizing its own trailing slash too, so `/edit-profile/` and
   * `/get-started/` would each start serving a *second*, un-redirected
   * `200` alongside their canonical form — two URLs for one page — unless
   * something still normalizes them. The generic rule at the end of the
   * array below is that something: it is the decided, documented canonical
   * policy for every root path in this app, not only the athlete ones —
   * see its own comment.
   */
  skipTrailingSlashRedirect: true,

  /**
   * Athlete profiles moved from the implementation-stage `/athletes/{slug}`
   * to the canonical root `/{slug}` (docs/ai/DECISIONS.md § The canonical
   * public athlete URL is athlesite.com/{slug}).
   *
   * Declared here rather than as a redirecting route file so the old path
   * space needs no `app/athletes/` tree at all — a redirect resolves before
   * routing, so there is nothing left to accidentally render.
   *
   * No loop is possible: the source space (`/athletes/*`) and the
   * destination space (`/*`) are disjoint, because `athletes` is itself a
   * reserved slug and therefore can never be a real destination. Bare
   * `/athletes` does not match either rule below (both require a `:slug`
   * segment) and simply 404s.
   *
   * Rule order matters and is deliberate: Next checks this array in order
   * and stops at the first match, so the two specific `/athletes/*` rules
   * must come before the generic trailing-slash rule — otherwise the
   * generic rule would fire first on `/athletes/jordan-bell/`, producing
   * exactly the two-hop chain this change exists to remove
   * (`/athletes/jordan-bell/` → generic rule → `/athletes/jordan-bell` →
   * legacy rule → `/jordan-bell`).
   */
  async redirects() {
    return [
      // Legacy path, trailing slash: matched first (more specific) so it
      // reaches the canonical URL in one hop rather than falling through
      // to the plain legacy rule and then the generic one.
      {
        source: "/athletes/:slug/",
        destination: "/:slug",
        permanent: true,
      },
      // Legacy path, no trailing slash — the original 5D.3 rule, unchanged.
      {
        source: "/athletes/:slug",
        destination: "/:slug",
        permanent: true,
      },
      /**
       * The decided canonical policy for a trailing slash on any other
       * path in this app, athlete profiles included: redirect to the
       * slash-free form, in one hop, permanently. This is what
       * `trailingSlash: false` already did automatically before
       * `skipTrailingSlashRedirect` was turned on above — restated
       * explicitly here so it keeps happening for every route (not only
       * the two above) now that nothing does it for us.
       *
       * `:path+` — one *or more* segments, not `:path*` (zero or more) —
       * is deliberate and was verified against the installed version, not
       * assumed: path-to-regexp compiles a `*` catch-all immediately
       * followed by a literal `/` such that the zero-segment case folds
       * into that same trailing slash, so a zero-or-more catch-all followed
       * by a literal slash matches the bare root request `/` itself, with
       * nothing captured — which produced a real,
       * observed `308` to an *empty* `Location` header, breaking the
       * homepage outright. `+` requires at least one real segment before
       * the trailing slash can match at all, which excludes `/` correctly
       * while still covering every real route. Confirmed against a real
       * `next start` server (see check-redirects.mjs) before and after
       * this fix: `/` → `200` with `+`, `308` to nothing with `*`.
       *
       * Must be last in this array — see the ordering note above.
       */
      {
        source: "/:path+/",
        destination: "/:path+",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
