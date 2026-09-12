/**
 * Asserts that the anonymous column allow-list is defined identically in both
 * places it has to exist.
 *
 * The database grant and the application's select list are separate artifacts
 * in different languages, and they must name the same columns. If the app asks
 * for a column `anon` was not granted, PostgREST fails the *entire* query with
 * 42501 — so the symptom is a 500 on every public profile page, not a missing
 * field. That failure mode is invisible in review and invisible in a build, so
 * it gets a machine check.
 *
 * Deliberately dependency-free and framework-free: this repo has no test runner
 * yet, and a parity assertion should not be the thing that introduces one.
 *
 * Usage: npm run check:columns   (exit 0 = lists agree)
 */
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/20260911000001_restrict_anon_profile_columns.sql";
const REPOSITORY = "src/lib/profile-repository.ts";

/**
 * Column names inside the migration's anon grant, specifically:
 * `grant select ( ... ) on table public.athlete_profiles to anon`.
 *
 * Matches that exact statement rather than the first `grant select (...) on
 * table` in the file, so an unrelated grant to a different role or a different
 * table (e.g. a future `to authenticated` grant, or one on another table)
 * cannot be picked up by accident and compared against the app's list instead
 * of the real anon grant.
 */
function columnsFromMigration(sql) {
  const match = sql.match(
    /grant\s+select\s*\(([^)]*)\)\s*on\s+table\s+public\.athlete_profiles\s+to\s+anon\s*;/i
  );
  if (!match) {
    throw new Error(
      `No "grant select ( ... ) on table public.athlete_profiles to anon;" found in ${MIGRATION}`
    );
  }
  return splitColumns(match[1]);
}

/** Column names inside the PUBLIC_PROFILE_COLUMNS template literal. */
function columnsFromRepository(ts) {
  const match = ts.match(/const\s+PUBLIC_PROFILE_COLUMNS\s*=\s*`([^`]*)`/);
  if (!match) throw new Error(`No PUBLIC_PROFILE_COLUMNS template literal found in ${REPOSITORY}`);
  return splitColumns(match[1]);
}

function splitColumns(block) {
  return block
    .split(",")
    .map((part) => part.replace(/--.*$/gm, "").trim())
    .filter(Boolean);
}

function report(label, problems) {
  console.error(`\n  FAIL: ${label}`);
  for (const p of problems) console.error(`    ${p}`);
}

const migration = columnsFromMigration(readFileSync(MIGRATION, "utf8"));
const repository = columnsFromRepository(readFileSync(REPOSITORY, "utf8"));

const problems = [];

// Duplicates would make the counts agree while the sets differ.
for (const [label, list] of [["migration", migration], ["repository", repository]]) {
  const seen = new Set();
  for (const c of list) {
    if (seen.has(c)) problems.push(`duplicate column "${c}" in the ${label} list`);
    seen.add(c);
  }
}

const inMigration = new Set(migration);
const inRepository = new Set(repository);
for (const c of migration) {
  if (!inRepository.has(c)) problems.push(`granted to anon but never selected: ${c}`);
}
for (const c of repository) {
  if (!inMigration.has(c)) problems.push(`selected by the app but NOT granted to anon: ${c}  <-- would 500 every profile page`);
}

if (problems.length > 0) {
  report("anon column grant and PUBLIC_PROFILE_COLUMNS disagree", problems);
  console.error(`\n    migration  (${migration.length}): ${[...migration].sort().join(", ")}`);
  console.error(`    repository (${repository.length}): ${[...repository].sort().join(", ")}\n`);
  process.exit(1);
}

console.log(`  anon column parity OK — ${migration.length} columns, identical in both lists`);
console.log(`    ${[...migration].sort().join(", ")}`);
