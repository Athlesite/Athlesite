import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";

const html = readFileSync(".next/server/app/index.html", "utf8");
const css = readFileSync("src/components/marketing/editorial/home.module.css", "utf8");

test("homepage is rendered with a single headline and the approved message", () => {
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  for (const text of ["Your Name.", "Your Game.", "Your Brand.", "Make your"]) assert.ok(html.includes(text));
});

test("navigation has its real section and route destinations", () => {
  for (const id of ["for-athletes", "recruiting", "main-content"]) assert.ok(html.includes(`id="${id}"`));
  assert.ok(html.includes('href="/get-started"'));
  assert.ok(html.includes('href="/athletes/jordan-bell"'));
});

test("fictional examples and photos are disclosed, old invented trust proof is absent", () => {
  for (const text of ["fictional sample data", "FICTIONAL DEMO", "No endorsement implied"]) assert.ok(html.includes(text));
  for (const text of ["Trusted by athletes nationwide", "athlete-avatar-", "jordan-football.svg", "maya-soccer.svg", "tyler-baseball.svg"]) assert.ok(!html.includes(text));
});

test("feature exploration and FAQ have native no-JS disclosures", () => {
  assert.equal((html.match(/<details\b/g) || []).length, 7);
  assert.equal((html.match(/<summary\b/g) || []).length, 7);
  assert.ok(html.includes('name="athlesite-features"'));
});

test("media is local and motion has explicit reduced-motion and visibility fallbacks", () => {
  for (const file of ["football-night.jpg", "football-team.jpg", "football-detail.jpg"]) assert.ok(existsSync(`public/marketing/editorial/${file}`));
  assert.ok(css.includes("prefers-reduced-motion: reduce"));
  assert.ok(!css.includes("opacity: 0;"));
  const reveal = readFileSync("src/components/marketing/editorial/motion.ts", "utf8");
  assert.ok(reveal.includes("reduced.matches"));
  assert.ok(reveal.includes("observer.disconnect()"));
  assert.ok(reveal.includes("animation.cancel()"));
});

test("brand, global styling, shared chrome, product routes and backend are unchanged", () => {
  const protectedPaths = ["public/brand", "src/components/ui/Logo.tsx", "src/app/globals.css", "src/app/layout.tsx", "src/app/athletes", "src/app/get-started", "src/components/layout", "src/components/onboarding", "src/components/profile", "src/lib", "src/proxy.ts", "supabase", "next.config.ts", "package.json", "package-lock.json"];
  const diff = execFileSync("git", ["diff", "136990f5b09ad3490cb93aa3b0b740464a280904", "--", ...protectedPaths], { encoding: "utf8" });
  assert.equal(diff, "");
});
