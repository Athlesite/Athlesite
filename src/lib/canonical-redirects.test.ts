import { test, describe } from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../../next.config.ts";

/**
 * Checkpoint 5D.3 moved athlete profiles from `/athletes/{slug}` to the
 * canonical root `/{slug}`. Any link shared before that — including the
 * marketing site's own links to the example — must keep resolving, so the old
 * shape redirects permanently rather than 404ing.
 *
 * This file proves the *shape* of our own hand-authored `redirects()` array:
 * each rule's source/destination/permanence, and that the array as a whole
 * cannot loop or chain into itself. What it cannot prove — and did not, the
 * first time this shipped — is what Next.js actually does with a request
 * before this array is ever consulted. `trailingSlash`'s default automatic
 * redirect is inserted by the framework *ahead of* `redirects()`, entirely
 * invisible to a test that only reads and replays this array; that is
 * exactly how the original two-hop `/athletes/jordan-bell/` chain shipped
 * past this file unnoticed. The real, running-server proof of hop counts —
 * including that framework-level behavior — lives in
 * scripts/check-redirects.mjs (`npm run check:redirects`), which this file
 * does not attempt to duplicate.
 */

/**
 * Applies a Next redirect rule's `source` pattern to `path` the way the
 * router would, for the two segment-matcher shapes this config actually
 * uses:
 *  - `:name`  — exactly one path segment (no `/`).
 *  - `:name+` — one or more path segments (`/`-joined) — Next's catch-all.
 *
 * Deliberately reimplements only what this project's own rules need, not a
 * general path-to-regexp port.
 */
function applyRule(rule: { source: string; destination: string }, path: string): string | null {
  const paramNames: string[] = [];
  const pattern = rule.source.replace(/:([A-Za-z0-9_]+)(\+)?/g, (_match, name: string, plus?: string) => {
    paramNames.push(name);
    return plus ? "([^/]+(?:/[^/]+)*)" : "([^/]+)";
  });

  const matched = new RegExp(`^${pattern}$`).exec(path);
  if (!matched) return null;

  // Next's own destination syntax repeats the modifier, e.g. destination
  // `/:path+` for source `/:path+/` (see the docs' `/blog/:slug*` ->
  // `/news/:slug*` example) — strip an optional trailing +/*/? along with
  // the name itself, or it would survive substitution as a literal
  // character (e.g. "/jordan-bell+").
  return paramNames.reduce(
    (destination, name, index) => destination.replace(new RegExp(`:${name}[+*?]?`), matched[index + 1]),
    rule.destination
  );
}

const rules = await nextConfig.redirects!();

describe("skipTrailingSlashRedirect is on", () => {
  test("the framework's automatic trailing-slash redirect is disabled, so our own rules are the only source of it", () => {
    assert.equal(
      nextConfig.skipTrailingSlashRedirect,
      true,
      "without this, Next inserts its own redirect ahead of redirects() — see this file's own docblock"
    );
  });
});

describe("legacy /athletes/{slug} redirects", () => {
  test("a permanent rule exists for the retired path shape, no trailing slash", () => {
    const rule = rules.find((r) => r.source === "/athletes/:slug");
    assert.ok(rule, "expected a redirect from /athletes/:slug");
    assert.equal(rule.destination, "/:slug");
    assert.equal(rule.permanent, true, "must be a permanent (308) redirect, not temporary");
  });

  test("a permanent rule also exists for the retired path shape WITH a trailing slash", () => {
    const rule = rules.find((r) => r.source === "/athletes/:slug/");
    assert.ok(rule, "expected a redirect from /athletes/:slug/ — this is the case Astra caught");
    assert.equal(rule.destination, "/:slug");
    assert.equal(rule.permanent, true);
  });

  test("the trailing-slash legacy rule is listed before the plain one — Next stops at the first match", () => {
    const slashIndex = rules.findIndex((r) => r.source === "/athletes/:slug/");
    const plainIndex = rules.findIndex((r) => r.source === "/athletes/:slug");
    assert.ok(slashIndex >= 0 && plainIndex >= 0);
    assert.ok(
      slashIndex < plainIndex,
      "the trailing-slash rule must come first, or it would never be reached"
    );
  });

  test("an athlete's old link lands on their canonical root URL", () => {
    const rule = rules.find((r) => r.source === "/athletes/:slug")!;
    assert.equal(applyRule(rule, "/athletes/maya-torres"), "/maya-torres");
  });

  test("the same link with a trailing slash resolves via its own dedicated rule", () => {
    const rule = rules.find((r) => r.source === "/athletes/:slug/")!;
    assert.equal(applyRule(rule, "/athletes/maya-torres/"), "/maya-torres");
  });

  test("the example's old link redirects correctly too, both forms", () => {
    const noSlash = rules.find((r) => r.source === "/athletes/:slug")!;
    const withSlash = rules.find((r) => r.source === "/athletes/:slug/")!;
    assert.equal(applyRule(noSlash, "/athletes/jordan-bell"), "/jordan-bell");
    assert.equal(applyRule(withSlash, "/athletes/jordan-bell/"), "/jordan-bell");
  });

  test("bare /athletes does not match either legacy rule, so it simply 404s rather than looping", () => {
    const noSlash = rules.find((r) => r.source === "/athletes/:slug")!;
    const withSlash = rules.find((r) => r.source === "/athletes/:slug/")!;
    assert.equal(applyRule(noSlash, "/athletes"), null);
    assert.equal(applyRule(withSlash, "/athletes/"), null);
  });
});

describe("canonical trailing-slash policy for every other root path", () => {
  test("a permanent generic rule strips a trailing slash from any real route", () => {
    const rule = rules.find((r) => r.source === "/:path+/");
    assert.ok(rule, "expected a generic trailing-slash rule");
    assert.equal(rule.destination, "/:path+");
    assert.equal(rule.permanent, true);
  });

  test("it is listed last — the two more specific /athletes/* rules must win first", () => {
    const genericIndex = rules.findIndex((r) => r.source === "/:path+/");
    assert.equal(genericIndex, rules.length - 1, "the generic rule must be checked last, not first");
  });

  test("it does not match the bare root request — the homepage must never redirect", () => {
    const rule = rules.find((r) => r.source === "/:path+/")!;
    // A `*` (zero-or-more) catch-all here matched "/" itself with nothing
    // captured, producing a real 308-to-nowhere — see this rule's own
    // comment in next.config.ts and check-redirects.mjs's Case 5. `+`
    // (one-or-more) must not repeat that.
    assert.equal(applyRule(rule, "/"), null, "the generic rule must never match a bare '/'");
  });

  test("it covers a real single-segment route's trailing slash", () => {
    const rule = rules.find((r) => r.source === "/:path+/")!;
    assert.equal(applyRule(rule, "/jordan-bell/"), "/jordan-bell");
    assert.equal(applyRule(rule, "/edit-profile/"), "/edit-profile");
    assert.equal(applyRule(rule, "/get-started/"), "/get-started");
  });
});

describe("no loop, no chain across the whole array", () => {
  test("no rule redirects a path to itself", () => {
    for (const rule of rules) {
      const sample = rule.source.replace(/:([A-Za-z0-9_]+)\+?/g, "sample");
      const result = applyRule(rule, sample);
      assert.notEqual(result, sample, `rule ${rule.source} redirects to itself`);
    }
  });

  test("a redirect destination is never itself matched by another rule", () => {
    // Guards against a second rule being added later that bounces the
    // destination back into a retired or generic path space — e.g. if the
    // generic trailing-slash rule ever matched an /athletes/* destination.
    for (const rule of rules) {
      const destination = rule.destination.replace(/:([A-Za-z0-9_]+)\+?/g, "sample");
      for (const other of rules) {
        assert.equal(
          applyRule(other, destination),
          null,
          `destination ${destination} is matched by rule ${other.source} — redirect chain`
        );
      }
    }
  });
});
