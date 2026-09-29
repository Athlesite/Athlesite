/**
 * Verifies that Checkpoint 5D.7's three reviewed migrations are byte-for-byte unchanged,
 * and that the application's public select list still matches the intended 18-field
 * projection.
 *
 * Replaces check-anon-column-parity.mjs, which compared the app's select list against
 * `anon`'s column grant — migration B revokes that grant, so the grant is no longer the
 * definition of "public".
 *
 * THE MIGRATIONS ARE PINNED BY SHA-256 OVER THEIR RAW BYTES. Any change — including a
 * comment typo or a reflowed line — fails this check until the digest is deliberately
 * updated in scripts/sql-contract.mjs. That brittleness is the point: it forces a security
 * boundary change to arrive as a reviewable two-part diff.
 *
 * This is a **change-detection gate**, not runtime isolation, and it does not prove the
 * SQL is safe — only that the bytes are the reviewed bytes. `postgres` owns both public
 * functions, so at runtime they bypass RLS and can read every column of
 * `athlete_profiles` (docs/ai/DECISIONS.md, Option A). Correctness of the SQL is
 * established by human review and by the gated live acceptance harness.
 *
 * Usage: npm run check:columns   (exit 0 = bytes unchanged, projection consistent)
 */
import { readFileSync } from "node:fs";
import { PINNED_MIGRATIONS, validateSqlContract } from "./sql-contract.mjs";

const REPOSITORY = "src/lib/profile-repository.ts";

const bytesByPath = {};
for (const { path } of PINNED_MIGRATIONS) {
  try {
    // No encoding: raw bytes, deliberately.
    bytesByPath[path] = readFileSync(path);
  } catch {
    bytesByPath[path] = null;
  }
}

const { problems, publicColumns } = validateSqlContract({
  bytesByPath,
  repositorySql: readFileSync(REPOSITORY, "utf8"),
});

if (problems.length > 0) {
  console.error("\n  FAIL: 5D.7 migration hash contract / projection parity\n");
  for (const problem of problems) console.error(`    ${problem}`);
  console.error(
    "\n  These migrations are the security source of truth. A hash failure is a request for\n" +
      "  renewed security review, not a lint error to silence.\n"
  );
  process.exit(1);
}

console.log(`  migration hash contract OK — ${PINNED_MIGRATIONS.length} reviewed migrations byte-for-byte unchanged`);
for (const { label, sha256 } of PINNED_MIGRATIONS) {
  console.log(`    ${sha256.slice(0, 16)}…  ${label}`);
}
console.log(`  application projection parity OK — ${publicColumns.length} columns, identical in the app`);
console.log(`    ${[...publicColumns].sort().join(", ")}`);
console.log("  note: hashes prove the bytes are the reviewed bytes; they do not prove SQL safety");
