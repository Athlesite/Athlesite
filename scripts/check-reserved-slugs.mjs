/**
 * Asserts that every static root route is a reserved slug.
 *
 * Athlete profiles live at the root (`/{slug}`) as of Checkpoint 5D.3, so a
 * static root segment and an athlete's public URL now occupy the same
 * namespace. Next resolves a static segment ahead of the root dynamic one, so
 * adding `src/app/privacy/` would not error — it would silently take `/privacy`
 * away from whichever athlete had claimed it, breaking a link they had already
 * given to a coach. Nothing about that failure is visible in review, in a
 * typecheck, or in a build, which is exactly why it gets a machine check.
 *
 * This can only cover routes that already exist. The forward-looking entries in
 * RESERVED_SLUGS (privacy, terms, pricing, …) are a deliberate human judgement
 * about routes we expect to add — this check is what stops one from landing
 * without the matching reservation.
 *
 * Deliberately dependency-free, matching check-anon-column-parity.mjs.
 *
 * Usage: npm run check:slugs   (exit 0 = every root route is reserved)
 */
import { readFileSync, readdirSync } from "node:fs";

const APP_DIR = "src/app";
const DOMAIN = "src/lib/athlete-profile.ts";

/**
 * Static root route segments — the directories directly under src/app that
 * produce a URL at `/<segment>`.
 *
 * Excluded, because none of them occupies a literal root path:
 *  - `[slug]` / `[...x]` — the dynamic segment itself, i.e. the athlete space.
 *  - `(group)` — route groups, which organise files without adding a segment.
 *  - `_private` — folders Next excludes from routing entirely.
 *  - `@slot` — parallel route slots.
 */
function staticRootSegments() {
  return readdirSync(APP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(
      (name) =>
        !name.startsWith("[") &&
        !name.startsWith("(") &&
        !name.startsWith("_") &&
        !name.startsWith("@")
    );
}

/**
 * The names inside `const RESERVED_SLUGS = new Set([ ... ])`.
 *
 * Parsed from the source rather than imported so this stays a dependency-free
 * Node script with no TypeScript loader, exactly like the column-parity check
 * it sits beside.
 */
function reservedSlugs(source) {
  const match = source.match(/const\s+RESERVED_SLUGS\s*=\s*new\s+Set\s*\(\s*\[([\s\S]*?)\]\s*\)/);
  if (!match) {
    throw new Error(`No "const RESERVED_SLUGS = new Set([ ... ])" found in ${DOMAIN}`);
  }

  const names = [...match[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  if (names.length === 0) {
    throw new Error(`RESERVED_SLUGS in ${DOMAIN} parsed as empty — refusing to pass vacuously.`);
  }
  return new Set(names);
}

const segments = staticRootSegments();
const reserved = reservedSlugs(readFileSync(DOMAIN, "utf8"));

const unreserved = segments.filter((segment) => !reserved.has(segment));

if (unreserved.length > 0) {
  console.error(
    `\n  Root route(s) not reserved: ${unreserved.join(", ")}\n\n` +
      `  Each of these serves a URL at /<name>, which is the same namespace\n` +
      `  athlete profiles live in. Add them to RESERVED_SLUGS in ${DOMAIN}\n` +
      `  so no athlete can claim a username a route would shadow.\n`
  );
  process.exit(1);
}

console.log(
  `\n  reserved-slug check OK — ${segments.length} root route(s), all reserved` +
    ` (${reserved.size} names reserved in total)\n    ${segments.sort().join(", ")}\n`
);
