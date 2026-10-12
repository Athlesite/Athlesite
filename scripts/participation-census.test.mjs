import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describeCensusOutstanding } from "./participation-census.mjs";
import { BLOCKING_COUNTS, INFORMATIONAL_COUNTS } from "./participation-census-validation.mjs";

/**
 * This script cannot be tested against live data — see its own docblock for why no
 * credential in this repo's reach can run the cross-owner census it describes. These
 * tests only prove the script honestly reports that state and points at the right
 * artifact, never that it has measured anything.
 */

describe("participation census — honest-unavailability reporting", () => {
  test("reports status outstanding, never a fabricated result", () => {
    const info = describeCensusOutstanding();
    assert.equal(info.status, "outstanding");
  });

  test("names the real SQL file, which exists on disk", () => {
    const info = describeCensusOutstanding();
    assert.equal(info.sqlFile, "scripts/participation-census.sql");
    assert.ok(existsSync(info.sqlFile), "the referenced SQL file must actually exist");
  });

  test("lists all nine expected count columns — the five Phase 1a counts plus the two Phase 1b coverage counts", () => {
    const info = describeCensusOutstanding();
    assert.deepEqual(info.expectedCounts, [
      "profile_owner_count",
      "media_owner_count",
      "profile_owners_without_media",
      "media_only_owner_count",
      "missing_first_segment_count",
      "non_uuid_first_segment_count",
      "orphaned_media_owner_count",
      "owners_missing_participation_count",
      "owners_participation_not_approved_count",
    ]);
  });

  test("the reason names every actual access-boundary cause, not a generic excuse", () => {
    const info = describeCensusOutstanding();
    assert.match(info.reason, /anon/);
    assert.match(info.reason, /authenticated/i);
    assert.match(info.reason, /service_role/);
  });
});

describe("participation census — blocking vs informational distinction", () => {
  test("exposes BLOCKING_COUNTS and INFORMATIONAL_COUNTS exactly as participation-census-validation.mjs defines them", () => {
    const info = describeCensusOutstanding();
    assert.deepEqual(info.blockingCounts, BLOCKING_COUNTS);
    assert.deepEqual(info.informationalCounts, INFORMATIONAL_COUNTS);
  });

  test("the two coverage counts are blocking, not informational", () => {
    const info = describeCensusOutstanding();
    assert.ok(info.blockingCounts.includes("owners_missing_participation_count"));
    assert.ok(info.blockingCounts.includes("owners_participation_not_approved_count"));
    assert.ok(!info.informationalCounts.includes("owners_missing_participation_count"));
    assert.ok(!info.informationalCounts.includes("owners_participation_not_approved_count"));
  });

  test("blocking and informational together account for exactly the nine expected columns, with no overlap", () => {
    const info = describeCensusOutstanding();
    const combined = [...info.blockingCounts, ...info.informationalCounts];
    assert.equal(new Set(combined).size, combined.length, "no name appears in both lists");
    assert.deepEqual(new Set(combined), new Set(info.expectedCounts));
  });

  test("the goNoGo text names every blocking count and states the informational counts may be non-zero", () => {
    const info = describeCensusOutstanding();
    for (const name of info.blockingCounts) {
      assert.ok(info.goNoGo.includes(name), `goNoGo text must name blocking count ${name}`);
    }
    assert.match(info.goNoGo, /non-zero/);
  });
});

describe("participation census — CLI --evaluate", () => {
  function runEvaluate(countsJson) {
    return execFileSync(
      process.execPath,
      ["scripts/participation-census.mjs", "--evaluate", countsJson],
      { encoding: "utf8" }
    );
  }

  const ALL_ZERO = {
    missing_first_segment_count: 0,
    non_uuid_first_segment_count: 0,
    orphaned_media_owner_count: 0,
    owners_missing_participation_count: 0,
    owners_participation_not_approved_count: 0,
  };

  test("all-zero blocking counts prints GO", () => {
    const output = runEvaluate(JSON.stringify(ALL_ZERO));
    assert.match(output, /Phase 1b decision: GO/);
  });

  test("a single non-zero blocking count prints NO-GO and names it", () => {
    const output = runEvaluate(JSON.stringify({ ...ALL_ZERO, owners_participation_not_approved_count: 2 }));
    assert.match(output, /Phase 1b decision: NO-GO/);
    assert.match(output, /owners_participation_not_approved_count = 2/);
  });

  test("invalid JSON exits non-zero rather than crashing uninformatively", () => {
    assert.throws(() =>
      execFileSync(process.execPath, ["scripts/participation-census.mjs", "--evaluate", "{not json"], {
        encoding: "utf8",
      })
    );
  });

  test("a missing required count exits non-zero rather than silently assuming GO", () => {
    assert.throws(() =>
      execFileSync(
        process.execPath,
        [
          "scripts/participation-census.mjs",
          "--evaluate",
          JSON.stringify({ ...ALL_ZERO, owners_missing_participation_count: undefined }),
        ],
        { encoding: "utf8" }
      )
    );
  });
});
