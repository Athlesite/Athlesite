/**
 * Proves the REAL, running Next.js redirect behavior for the legacy athlete
 * path — not a reimplementation of it.
 *
 * Why this exists, specifically: `src/lib/canonical-redirects.test.ts` reads
 * `next.config.ts`'s own `redirects()` array and hand-applies a small
 * `:param` substitution to check its *shape*. That could not catch this
 * checkpoint's actual bug, because the bug was never in that array — it was
 * in a framework-level redirect Next inserts *ahead of* that array by
 * default (trailing-slash normalization), which a test that only reads the
 * array can't see at all. Astra caught it by observing the real, deployed
 * behavior: `/athletes/jordan-bell/` came back as two chained redirects,
 * not one. This script reproduces that same observation as a repeatable
 * check: build the real app, start the real production server, and fetch
 * real HTTP requests against it with `redirect: "manual"` so every hop is
 * visible individually.
 *
 * Requires a production build to already exist (`npm run build` first —
 * see package.json and .github/workflows/ci.yml, where this runs right
 * after Build). It does not build for itself, to keep this fast and to keep
 * "does the build succeed" and "does the built server redirect correctly"
 * as separate, separately-diagnosable steps.
 *
 * Needs no Supabase configuration, matching the rest of this CI job (see
 * ci.yml's own header comment) — deliberately so, not by accident. Verified
 * directly: `/edit-profile` and `/get-started` both throw at request time
 * with no `NEXT_PUBLIC_SUPABASE_URL` configured (they call the Supabase
 * server client to resolve the current session), so this script only ever
 * asserts *redirect* behavior for them — hop count and `Location` — and
 * never asserts what their final rendered status code is. Only the fully
 * static, fixture-only pages (`/`, `/jordan-bell`) get a hard `200`
 * assertion, since those never touch Supabase either way.
 *
 * Deliberately dependency-free, matching check-anon-column-parity.mjs and
 * check-reserved-slugs.mjs.
 *
 * Usage: npm run check:redirects   (exit 0 = every hop below matches)
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const NEXT_BIN = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const BUILD_DIR = fileURLToPath(new URL("../.next", import.meta.url));
const READY_TIMEOUT_MS = 20_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Polls `url` until it responds at all (any status), or times out. */
async function waitUntilReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { redirect: "manual" });
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  return false;
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), SHUTDOWN_TIMEOUT_MS)),
  ]);
  if (!exited) child.kill("SIGKILL");
}

/**
 * One real request, with automatic redirect-following disabled so each hop
 * is a separately observed response rather than something `fetch` resolves
 * for us — the entire point being to see exactly how many hops there are.
 */
async function fetchOneHop(base, pathname) {
  const res = await fetch(`${base}${pathname}`, { redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") };
}

/**
 * Follows redirects itself, recording every hop, so a test can assert the
 * exact hop count — not just the eventual destination, which is exactly
 * the distinction that made the original two-hop bug invisible to a test
 * that only checked the final page loaded.
 */
async function traceHops(base, pathname, { maxHops = 5 } = {}) {
  const hops = [];
  let current = pathname;

  for (let i = 0; i < maxHops; i++) {
    const { status, location } = await fetchOneHop(base, current);
    if (status < 300 || status >= 400) {
      return { hops, finalStatus: status, finalPath: current };
    }
    hops.push({ from: current, status, to: location });
    if (!location) {
      throw new Error(`Redirect from "${current}" carried no Location header (status ${status}).`);
    }
    current = location;
  }
  throw new Error(`More than ${maxHops} redirect hops starting from "${pathname}" — likely a loop.`);
}

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exitCode = 1;
}

async function main() {
  if (!existsSync(BUILD_DIR)) {
    console.error(
      "\n  No production build found at .next/ — run `npm run build` before `npm run check:redirects`.\n"
    );
    process.exit(1);
  }

  const port = await getFreePort();
  const base = `http://localhost:${port}`;
  const child = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port)], {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const ready = await waitUntilReady(`${base}/`, READY_TIMEOUT_MS);
    if (!ready) {
      fail(`Production server never became ready on ${base}.\n\n  stderr:\n${stderr}`);
      return;
    }

    // --- Case 1: the legacy path with a trailing slash, exactly what
    // Astra observed as a two-hop chain, must now be exactly one hop. ---
    {
      const { hops, finalPath } = await traceHops(base, "/athletes/jordan-bell/");
      if (hops.length !== 1) {
        fail(
          `/athletes/jordan-bell/ took ${hops.length} redirect hop(s), expected exactly 1.\n` +
            `  Hops: ${JSON.stringify(hops)}`
        );
      } else if (hops[0].to !== "/jordan-bell") {
        fail(`/athletes/jordan-bell/ redirected to "${hops[0].to}", expected "/jordan-bell".`);
      } else if (finalPath !== "/jordan-bell") {
        fail(`/athletes/jordan-bell/ ultimately reached "${finalPath}", expected "/jordan-bell".`);
      } else {
        console.log('  ✓ /athletes/jordan-bell/  -> 1 hop -> /jordan-bell');
      }
    }

    // --- Case 2: the legacy path without a trailing slash — must remain
    // exactly one hop too (this is the pre-existing, already-correct case;
    // asserting it here proves the fix did not regress it). ---
    {
      const { hops } = await traceHops(base, "/athletes/jordan-bell");
      if (hops.length !== 1 || hops[0].to !== "/jordan-bell") {
        fail(`/athletes/jordan-bell -> unexpected hops: ${JSON.stringify(hops)}`);
      } else {
        console.log("  ✓ /athletes/jordan-bell   -> 1 hop -> /jordan-bell");
      }
    }

    // --- Case 3: an arbitrary (non-existent-as-a-page) athlete slug, both
    // forms — proves the fix generalizes past the one hardcoded example. ---
    for (const [path, expected] of [
      ["/athletes/some-athlete/", "/some-athlete"],
      ["/athletes/some-athlete", "/some-athlete"],
    ]) {
      const { hops } = await traceHops(base, path);
      if (hops.length !== 1 || hops[0].to !== expected) {
        fail(`${path} -> unexpected hops: ${JSON.stringify(hops)} (expected 1 hop to ${expected})`);
      } else {
        console.log(`  ✓ ${path.padEnd(25)} -> 1 hop -> ${expected}`);
      }
    }

    // --- Case 4: canonical root URLs — the decided trailing-slash policy
    // (redirect to the slash-free form, one hop) applies to real routes and
    // must never touch the homepage. ---
    for (const [path, expectedHops, expectedFinal] of [
      ["/jordan-bell/", 1, "/jordan-bell"],
      ["/edit-profile/", 1, "/edit-profile"],
      ["/get-started/", 1, "/get-started"],
    ]) {
      const { hops, finalPath } = await traceHops(base, path);
      if (hops.length !== expectedHops || finalPath !== expectedFinal) {
        fail(`${path} -> ${JSON.stringify(hops)}, final "${finalPath}" (expected ${expectedHops} hop(s) to "${expectedFinal}")`);
      } else {
        console.log(`  ✓ ${path.padEnd(25)} -> ${expectedHops} hop -> ${expectedFinal}`);
      }
    }

    // --- Case 5: the regression this fix introduced and then caught in
    // manual verification — the generic trailing-slash rule must never
    // catch the bare homepage. A 308 with an empty Location is exactly
    // what a bad `:path*` (zero-or-more) pattern produced before this was
    // corrected to `:path+` (one-or-more). ---
    {
      const { status, location } = await fetchOneHop(base, "/");
      if (status !== 200) {
        fail(`/ returned ${status} (location: ${location ?? "none"}), expected 200 — the homepage must never redirect.`);
      } else {
        console.log("  ✓ /                         -> 200 (no redirect)");
      }
    }

    // --- Case 6: canonical no-slash forms are unaffected — no redirect at
    // all. `/jordan-bell` is static and fixture-only, so a hard 200 is
    // asserted directly. `/edit-profile` and `/get-started` are dynamic and
    // call the Supabase server client to resolve the current session — with
    // no Supabase configured (this CI job's own deliberate norm) they throw
    // and return 500, which is correct, unrelated behavior this script has
    // no business asserting against. What this script owns is narrower and
    // still fully proven either way: neither path is a redirect. ---
    {
      const { status, location } = await fetchOneHop(base, "/jordan-bell");
      if (status !== 200) {
        fail(`/jordan-bell returned ${status} (location: ${location ?? "none"}), expected 200.`);
      } else {
        console.log("  ✓ /jordan-bell               -> 200 (no redirect)");
      }
    }
    for (const path of ["/edit-profile", "/get-started"]) {
      const { status, location } = await fetchOneHop(base, path);
      if (status >= 300 && status < 400) {
        fail(`${path} redirected (${status} -> ${location}), expected no redirect at all.`);
      } else {
        console.log(`  ✓ ${path.padEnd(25)} -> ${status} (no redirect)`);
      }
    }

    if (process.exitCode !== 1) {
      console.log("\n  redirect regression check OK — every hop matches the decided canonical policy\n");
    }
  } finally {
    await stopServer(child);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
