import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseMediaPath, isMediaPathForOwnerSlot, currentMediaBelongsToOwner } from "./media-paths.ts";

/**
 * Regression for Codex's P2 #3: a caller-supplied media baseline must be
 * validated structurally — owner folder AND slot, both exact — before it
 * can ever become a Storage cleanup candidate. Not a substring/prefix
 * check, which a crafted or merely similar-looking string could satisfy
 * without being a real object path this project ever produced.
 *
 * This file is a leaf module with zero imports of its own (see its own
 * docblock: "Deliberately free of Supabase imports"), so — like
 * profile-save-decisions.test.ts and profile-update-decisions.test.ts —
 * this runs standalone under Node's own TypeScript support, no loader hook
 * needed, via a plain relative import.
 *
 * Run directly: node --test src/lib/media-paths.test.ts
 */

const USER_ID = "6795530f-ad10-44a4-b0d8-516553d80ea5";
const OTHER_USER_ID = "60ef02e7-b8bd-4705-8b2b-eee45a83a349";

describe("parseMediaPath — structural parsing of this project's own path convention", () => {
  test("a well-formed hero path parses into owner/slot/filename", () => {
    assert.deepEqual(parseMediaPath(`${USER_ID}/hero/3a1ffe0a-2bd8-42f0-b7ba-23fa7e415d25.jpg`), {
      ownerUserId: USER_ID,
      slot: "hero",
      filename: "3a1ffe0a-2bd8-42f0-b7ba-23fa7e415d25.jpg",
    });
  });

  test("a well-formed profile path parses correctly", () => {
    assert.deepEqual(parseMediaPath(`${USER_ID}/profile/a69aaf58-6476-4785-8500-b8a9b005df60.jpg`), {
      ownerUserId: USER_ID,
      slot: "profile",
      filename: "a69aaf58-6476-4785-8500-b8a9b005df60.jpg",
    });
  });

  test("a slot that is not hero or profile is rejected, even if otherwise well-formed", () => {
    assert.equal(parseMediaPath(`${USER_ID}/avatar/file.jpg`), null);
  });

  test("an extra path segment is rejected, not fuzzily accepted", () => {
    assert.equal(parseMediaPath(`${USER_ID}/hero/nested/file.jpg`), null);
  });

  test("a missing segment (only owner/slot, no filename) is rejected", () => {
    assert.equal(parseMediaPath(`${USER_ID}/hero`), null);
  });

  test("an empty owner segment is rejected", () => {
    assert.equal(parseMediaPath(`/hero/file.jpg`), null);
  });

  test("a completely malformed string is rejected", () => {
    assert.equal(parseMediaPath("not-a-path-at-all"), null);
    assert.equal(parseMediaPath(""), null);
  });
});

describe("isMediaPathForOwnerSlot — exact owner AND slot match, never a prefix match", () => {
  test("a valid hero path for the current user belongs to that user in the hero slot", () => {
    assert.equal(isMediaPathForOwnerSlot(`${USER_ID}/hero/file.jpg`, USER_ID, "hero"), true);
  });

  test("a valid profile path for the current user belongs to that user in the profile slot", () => {
    assert.equal(isMediaPathForOwnerSlot(`${USER_ID}/profile/file.jpg`, USER_ID, "profile"), true);
  });

  test("a path under a different user's folder is rejected", () => {
    assert.equal(isMediaPathForOwnerSlot(`${OTHER_USER_ID}/hero/file.jpg`, USER_ID, "hero"), false);
  });

  test("a real hero path supplied as a profile baseline is rejected — slot must match exactly", () => {
    assert.equal(isMediaPathForOwnerSlot(`${USER_ID}/hero/file.jpg`, USER_ID, "profile"), false);
  });

  test("a real profile path supplied as a hero baseline is rejected — slot must match exactly", () => {
    assert.equal(isMediaPathForOwnerSlot(`${USER_ID}/profile/file.jpg`, USER_ID, "hero"), false);
  });

  test("a malformed path is rejected outright, regardless of owner/slot arguments", () => {
    assert.equal(isMediaPathForOwnerSlot("not-a-path-at-all", USER_ID, "hero"), false);
    assert.equal(isMediaPathForOwnerSlot(`${USER_ID}/hero/nested/file.jpg`, USER_ID, "hero"), false);
  });

  test("a folder that merely starts with the same characters as the owner id is rejected — exact match, not a prefix", () => {
    // Guards specifically against the substring/prefix check this replaces:
    // "{USER_ID}-2" is not "{USER_ID}".
    assert.equal(isMediaPathForOwnerSlot(`${USER_ID}-2/hero/file.jpg`, USER_ID, "hero"), false);
  });
});

describe("currentMediaBelongsToOwner — the caller-supplied media baseline updateProfile validates before any upload or update", () => {
  test("valid hero path and valid profile path for the current user: belongs", () => {
    assert.equal(
      currentMediaBelongsToOwner(
        { heroPhotoPath: `${USER_ID}/hero/a.jpg`, profilePhotoPath: `${USER_ID}/profile/b.jpg` },
        USER_ID
      ),
      true
    );
  });

  test("both paths null: trivially belongs — nothing to check", () => {
    assert.equal(currentMediaBelongsToOwner({ heroPhotoPath: null, profilePhotoPath: null }, USER_ID), true);
  });

  test("only the hero path present and null profile path: still belongs (null accepted)", () => {
    assert.equal(
      currentMediaBelongsToOwner({ heroPhotoPath: `${USER_ID}/hero/a.jpg`, profilePhotoPath: null }, USER_ID),
      true
    );
  });

  test("a hero path under a DIFFERENT owner's folder: does not belong", () => {
    assert.equal(
      currentMediaBelongsToOwner(
        { heroPhotoPath: `${OTHER_USER_ID}/hero/a.jpg`, profilePhotoPath: null },
        USER_ID
      ),
      false
    );
  });

  test("a profile path under a DIFFERENT owner's folder: does not belong", () => {
    assert.equal(
      currentMediaBelongsToOwner(
        { heroPhotoPath: null, profilePhotoPath: `${OTHER_USER_ID}/profile/b.jpg` },
        USER_ID
      ),
      false
    );
  });

  test("a hero path supplied where the slot doesn't match (own folder, wrong slot) is rejected", () => {
    assert.equal(
      currentMediaBelongsToOwner({ heroPhotoPath: `${USER_ID}/profile/a.jpg`, profilePhotoPath: null }, USER_ID),
      false
    );
  });

  test("a malformed path in either slot is rejected", () => {
    assert.equal(
      currentMediaBelongsToOwner({ heroPhotoPath: "not-a-path-at-all", profilePhotoPath: null }, USER_ID),
      false
    );
  });

  test("one matching, one foreign: still does not belong — either mismatch fails the whole baseline", () => {
    assert.equal(
      currentMediaBelongsToOwner(
        { heroPhotoPath: `${USER_ID}/hero/a.jpg`, profilePhotoPath: `${OTHER_USER_ID}/profile/b.jpg` },
        USER_ID
      ),
      false
    );
  });
});
