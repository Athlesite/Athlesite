import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describeCensusOutstanding } from "./participation-census.mjs";

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

  test("lists all seven expected count columns from the architecture", () => {
    const info = describeCensusOutstanding();
    assert.deepEqual(info.expectedCounts, [
      "profile_owner_count",
      "media_owner_count",
      "profile_owners_without_media",
      "media_only_owner_count",
      "missing_first_segment_count",
      "non_uuid_first_segment_count",
      "orphaned_media_owner_count",
    ]);
  });

  test("the reason names every actual access-boundary cause, not a generic excuse", () => {
    const info = describeCensusOutstanding();
    assert.match(info.reason, /anon/);
    assert.match(info.reason, /authenticated/i);
    assert.match(info.reason, /service_role/);
  });
});
