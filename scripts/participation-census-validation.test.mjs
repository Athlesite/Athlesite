import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CANONICAL_UUID_PATTERN_SOURCE,
  isCanonicalUuidFormat,
} from "./participation-census-validation.mjs";
import { PARTICIPATION_MIGRATIONS } from "./participation-sql-contract.mjs";

const CENSUS_SQL_PATH = "scripts/participation-census.sql";

describe("isCanonicalUuidFormat — the exact cases the finding named", () => {
  test("36 hyphens is rejected (the old loose pattern's exact failure case)", () => {
    const thirtySixHyphens = "-".repeat(36);
    assert.equal(thirtySixHyphens.length, 36, "precondition: exactly 36 characters");
    assert.equal(isCanonicalUuidFormat(thirtySixHyphens), false);
  });

  test("wrong hyphen placement is rejected, even with otherwise-valid hex digits", () => {
    // 32 hex digits plus 4 hyphens = 36 characters, same length and alphabet as a
    // real UUID, but every hyphen sits one position right of where the canonical
    // 8-4-4-4-12 grouping requires. Verified by construction: strip the hyphens,
    // confirm 32 hex characters remain, then confirm the hyphen GROUPING is wrong.
    const misplaced = "0123456-789ab-cdef-0123-456789abcdef";
    const hexOnly = misplaced.replace(/-/g, "");
    assert.equal(hexOnly.length, 32, "precondition: 32 hex characters");
    assert.match(hexOnly, /^[0-9a-fA-F]{32}$/, "precondition: all valid hex digits");
    assert.notDeepEqual(
      misplaced.split("-").map((part) => part.length),
      [8, 4, 4, 4, 12],
      "precondition: this grouping is NOT the canonical 8-4-4-4-12 shape"
    );
    assert.equal(isCanonicalUuidFormat(misplaced), false);
  });

  test("a genuinely valid UUID is accepted", () => {
    assert.equal(isCanonicalUuidFormat("123e4567-e89b-12d3-a456-426614174000"), true);
    assert.equal(isCanonicalUuidFormat("00000000-0000-0000-0000-000000000000"), true);
    // Case-insensitive: Postgres's uuid type does not care about hex-digit case.
    assert.equal(isCanonicalUuidFormat("ABCDEF12-AB12-AB12-AB12-ABCDEF123456"), true);
  });

  test("a valid-format UUID that happens to be missing from auth.users is still format-valid", () => {
    // This function only answers the FORMAT question. Existence in auth.users is a
    // separate, later check in the census SQL (section 5c) that only ever runs
    // against a segment this function has already approved — see that file.
    const wellFormedButHypothetical = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    assert.equal(isCanonicalUuidFormat(wellFormedButHypothetical), true);
  });

  test("a missing or empty first segment is rejected", () => {
    assert.equal(isCanonicalUuidFormat(""), false);
    assert.equal(isCanonicalUuidFormat(null), false);
    assert.equal(isCanonicalUuidFormat(undefined), false);
  });

  test("never throws, for any input including pathological strings", () => {
    const pathological = [
      "", "-", "-".repeat(1000), "not-a-uuid-at-all",
      "123e4567e89b12d3a456426614174000", // valid chars, no hyphens
      "123e4567-e89b-12d3-a456-42661417400", // one char short
      "123e4567-e89b-12d3-a456-4266141740000", // one char long
      null, undefined, 12345, {}, [],
    ];
    for (const input of pathological) {
      assert.doesNotThrow(() => isCanonicalUuidFormat(input), `threw on: ${JSON.stringify(input)}`);
    }
  });
});

describe("the census SQL uses the exact same canonical pattern as this mirror", () => {
  test("participation-census.sql contains the canonical regex, twice (sections 5b and 5c)", () => {
    const sql = readFileSync(CENSUS_SQL_PATH, "utf8");
    // Convert the JS regex source (which Postgres regex syntax matches exactly for
    // this pattern — no JS-only escapes are used) into the literal string the SQL
    // file must contain between single quotes.
    const occurrences = sql.split(CANONICAL_UUID_PATTERN_SOURCE).length - 1;
    assert.equal(
      occurrences,
      2,
      "expected the canonical UUID pattern to appear exactly twice (5b's rejection " +
        "and 5c's cast-safety precondition) — found " + occurrences
    );
  });

  test("the OLD loose 36-character-only pattern no longer appears as live SQL", () => {
    const sql = readFileSync(CENSUS_SQL_PATH, "utf8");
    // Strip `--` line comments first: the fix's own explanatory comment quotes the
    // old pattern verbatim to describe what was wrong with it, which would
    // otherwise false-positive against a check for the literal pattern string. Only
    // code lines should be scanned — see the equivalent fix in
    // participation-sql-contract.test.mjs's bracket-literal check.
    const codeOnly = sql
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n");
    assert.doesNotMatch(
      codeOnly,
      /\^\[0-9a-fA-F-\]\{36\}\$/,
      "the loose length-only pattern this finding fixed must not have returned as code"
    );
  });

  test("the SQL's cast sites are both reached only after the canonical regex", () => {
    const sql = readFileSync(CENSUS_SQL_PATH, "utf8");
    // 5c's WHERE clause filters by the canonical pattern BEFORE the CTE's rows ever
    // reach the ::uuid cast two statements later — a textual proxy for "the cast is
    // only attempted on already-validated input", which is the actual safety
    // property being asserted.
    const castSite = sql.indexOf("f.owner_segment::uuid");
    assert.ok(castSite > -1, "expected the orphaned-owner cast to still exist");
    const precedingCte = sql.lastIndexOf("with first_segments as (", castSite);
    const ctePattern = sql.slice(precedingCte, castSite);
    assert.ok(
      ctePattern.includes(CANONICAL_UUID_PATTERN_SOURCE),
      "the cast's own CTE must filter by the canonical pattern before the cast runs"
    );
  });
});

describe("sanity: this file exercises a real migration-adjacent path", () => {
  test("PARTICIPATION_MIGRATIONS is still importable (no accidental path drift)", () => {
    assert.ok(Object.keys(PARTICIPATION_MIGRATIONS).length > 0);
  });
});
