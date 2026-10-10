import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";

/**
 * Static scope guards for Guardian-First Participation Phase 1a.
 *
 * These assert the NEGATIVE space the implementation prompt explicitly forbade:
 * no guardian_issuer role, no Edge Function, no Resend email code, and no app-level
 * code path capable of writing bracket='minor'. A grep-based check is the right
 * tool here — the claim is "this string does not appear anywhere in src/", which a
 * unit test cannot otherwise make, and the SQL-level version of this guard already
 * lives in participation-sql-contract.test.mjs for the migrations themselves.
 */

/** This file's own path, relative to the repo root, as git grep reports it. */
const SELF_PATH = "src/lib/participation-phase1a-boundaries.test.ts";

/**
 * Runs `git grep`, returning matched lines (or [] if nothing matched).
 *
 * Always excludes this file itself: its own search patterns are string literals
 * containing the exact forbidden terms it looks for (e.g. the pattern
 * "guardian_issuer" is, unavoidably, the substring "guardian_issuer"), so without
 * the exclusion this test would always fail against itself.
 */
function gitGrep(pattern: string, pathspec: string): string[] {
  try {
    // --untracked matters: a newly-added file that hasn't been `git add`-ed yet is
    // invisible to plain `git grep`, which would make this guard blind to the exact
    // in-progress-work scenario it exists to catch.
    const output = execFileSync(
      "git",
      ["grep", "--untracked", "-n", "-E", pattern, "--", pathspec, `:(exclude)${SELF_PATH}`],
      { encoding: "utf8", cwd: process.cwd() }
    );
    return output.split("\n").filter(Boolean);
  } catch (error) {
    // git grep exits 1 when nothing matches — that is success here, not a failure.
    const e = error as { status?: number; stdout?: string };
    if (e.status === 1) return [];
    throw error;
  }
}

/** Lines whose only match is inside a comment explaining the absence, not code. */
function excludingExplanatoryComments(lines: string[]): string[] {
  return lines.filter((line) => {
    const afterPath = line.replace(/^[^:]+:\d+:/, "");
    const codePart = afterPath.split("//")[0].split(/--/)[0];
    return codePart.trim().length > 0 && !/^\s*\*/.test(afterPath);
  });
}

describe("Phase 1a scope boundaries — nothing out-of-scope exists in src/", () => {
  test("no guardian_issuer role or GUARDIAN_ISSUER secret reference", () => {
    const lines = gitGrep("guardian_issuer|GUARDIAN_ISSUER", "src/*");
    assert.deepEqual(excludingExplanatoryComments(lines), []);
  });

  test("no Edge Function or Resend email-sending code", () => {
    const lines = gitGrep("RESEND_API_KEY|supabase\\.functions|Deno\\.serve", "src/*");
    assert.deepEqual(excludingExplanatoryComments(lines), []);
  });

  test("supabase/functions does not exist", () => {
    // FIX for the finding Codex caught: the previous version shelled out to the
    // Unix `test` executable (`test -d ...`), which does not exist as a native
    // binary on Windows — this assertion would throw with "command not found"
    // there regardless of whether the directory existed, making it pass for the
    // wrong reason on one platform and fail for the wrong reason on another.
    // fs.existsSync is a Node API, identical on every platform this repo runs on.
    const path = "supabase/functions";
    assert.ok(
      !existsSync(path) || !statSync(path).isDirectory(),
      "supabase/functions must not exist in Phase 1a — Edge Functions are a later phase"
    );
  });

  test("no issuance/rotation/redemption/delivery RPC is referenced from app code", () => {
    const lines = gitGrep(
      "issue_guardian_request|rotate_guardian_request|redeem_guardian_request|peek_guardian_request|record_guardian_delivery",
      "src/*"
    );
    assert.deepEqual(excludingExplanatoryComments(lines), []);
  });

  test("no app code writes a bracket='minor' literal (comments referencing its absence are fine)", () => {
    const lines = gitGrep("bracket.*'minor'|'minor'.*bracket", "src/*");
    assert.deepEqual(excludingExplanatoryComments(lines), []);
  });
});
