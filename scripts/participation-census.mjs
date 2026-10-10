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
    expectedCounts: [
      "profile_owner_count",
      "media_owner_count",
      "profile_owners_without_media",
      "media_only_owner_count",
      "missing_first_segment_count",
      "non_uuid_first_segment_count",
      "orphaned_media_owner_count",
    ],
    goNoGo:
      "Phase 1b's cutover may proceed only once profile_owners_without_media's " +
      "counterpart check (every profile owner has approved participation), " +
      "media_only_owner_count, and all three malformed-path counts are resolved to " +
      "zero — see the architecture's Phase 1b go/no-go condition. This script reports " +
      "structure only; it has not been run against live data.",
  };
}

function main() {
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
  console.log("Expected result columns (one per SELECT, in order):");
  for (const name of info.expectedCounts) {
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
