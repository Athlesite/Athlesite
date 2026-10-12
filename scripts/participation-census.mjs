#!/usr/bin/env node
/**
 * Entry point for the Guardian-First Participation Phase 1a/1b owner/media census.
 *
 * This script does NOT connect to Supabase with an application credential, and that
 * is deliberate, not a missing feature. See participation-census.sql's own header
 * for the full reasoning: `anon` holds no grant on athlete_profiles, `authenticated`
 * is confined to its own row, and this project holds no service_role key by design
 * (.env.example; docs/ai/DECISIONS.md § No service-role key). There is no credential
 * reachable from this repo, this CI pipeline, or this coding environment that can
 * run a cross-owner count — only a human with Supabase dashboard access can, via the
 * SQL Editor.
 *
 * What this script actually does: prints the exact SQL to run and the shape of the
 * counts to expect, so "run the census" has one unambiguous next step rather than
 * requiring anyone to go find the .sql file and remember what each query means. It
 * performs no network call and mutates nothing.
 *
 * Usage: node scripts/participation-census.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { BLOCKING_COUNTS, INFORMATIONAL_COUNTS, evaluateGoNoGo } from "./participation-census-validation.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = join(__dirname, "participation-census.sql");

export function describeCensusOutstanding() {
  return {
    status: "outstanding",
    reason:
      "No credential available to this environment can read across every owner's " +
      "athlete_profiles/storage.objects rows: anon holds no table grant (5D.7), " +
      "authenticated is confined to its own row by RLS, and this project holds no " +
      "service_role key by design. Only the Supabase SQL Editor, run by a human " +
      "with dashboard access to the Athlete project, can execute this census.",
    sqlFile: "scripts/participation-census.sql",
    // Order matches the SQL file's own section order (1-7). Informational counts
    // describe the population and may be any value; blocking counts gate Phase 1b
    // — see BLOCKING_COUNTS/INFORMATIONAL_COUNTS and evaluateGoNoGo below, which is
    // the one place that distinction is decided, rather than leaving it implicit in
    // this list's ordering or in prose.
    expectedCounts: [...INFORMATIONAL_COUNTS, ...BLOCKING_COUNTS],
    blockingCounts: BLOCKING_COUNTS,
    informationalCounts: INFORMATIONAL_COUNTS,
    goNoGo:
      "GO requires every one of the five BLOCKING counts to be exactly zero: " +
      BLOCKING_COUNTS.join(", ") +
      ". The four INFORMATIONAL counts (" +
      INFORMATIONAL_COUNTS.join(", ") +
      ") may be any value, including non-zero, and still be a GO — they describe " +
      "the population, not a defect in it. This script reports structure only; it " +
      "has not been run against live data. Once a founder has run the SQL and has " +
      "real numbers, feed them to evaluateGoNoGo({...}) (exported from " +
      "participation-census-validation.mjs) to get the actual decision rather than " +
      "reading the counts by eye.",
  };
}

/**
 * Prints the go/no-go decision for a real set of census results, e.g.:
 *   node scripts/participation-census.mjs --evaluate '{"missing_first_segment_count":0,...}'
 * Still performs no network call — the counts are supplied by the caller, read back
 * from the SQL Editor by a human.
 */
function printEvaluation(countsJson) {
  let counts;
  try {
    counts = JSON.parse(countsJson);
  } catch {
    console.error("Could not parse --evaluate argument as JSON.");
    process.exitCode = 1;
    return;
  }

  let result;
  try {
    result = evaluateGoNoGo(counts);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.log(`Phase 1b decision: ${result.decision}`);
  if (result.decision === "NO-GO") {
    console.log("Blocking:");
    for (const { count, value } of result.blockingReasons) {
      console.log(`  - ${count} = ${value}`);
    }
  }
}

function main() {
  const evaluateIndex = process.argv.indexOf("--evaluate");
  if (evaluateIndex !== -1) {
    printEvaluation(process.argv[evaluateIndex + 1]);
    return;
  }

  const sql = readFileSync(SQL_PATH, "utf8");
  const info = describeCensusOutstanding();

  console.log("Guardian-First Participation — owner/media census");
  console.log("=".repeat(60));
  console.log(`Status: ${info.status.toUpperCase()}`);
  console.log("");
  console.log(info.reason);
  console.log("");
  console.log(`Run this file in the Supabase SQL Editor: ${info.sqlFile}`);
  console.log("");
  console.log("INFORMATIONAL result columns — any value, including non-zero, is fine:");
  for (const name of info.informationalCounts) {
    console.log(`  - ${name}`);
  }
  console.log("");
  console.log("BLOCKING result columns — Phase 1b requires every one of these to be zero:");
  for (const name of info.blockingCounts) {
    console.log(`  - ${name}`);
  }
  console.log("");
  console.log(info.goNoGo);
  console.log("");
  console.log(`(${sql.split("\n").length} lines of read-only SQL in ${info.sqlFile})`);
}

// Only run as a CLI; stay importable for the test file without side effects. Built
// from process.argv[1] via pathToFileURL rather than a manual `file://` template —
// the manual form breaks on Windows (backslashes, drive letters) and when invoked
// with a relative path, both of which apply to how this script is actually run.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
