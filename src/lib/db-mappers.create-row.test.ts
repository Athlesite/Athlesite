import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { toAthleteProfileRow, toAthleteProfileUpdateRow } from "@/lib/db-mappers";
import { normalizeAthleteProfileData } from "@/lib/athlete-profile";

/**
 * Publication is an explicit act, for every athlete.
 *
 * These tests pin the half of that guarantee that lives in the row builders: a CREATE
 * never publishes, and an UPDATE carries forward exactly the publication state it was
 * given. Before this checkpoint `toAthleteProfileRow` hardcoded `is_published: true`,
 * so a first save silently made a profile public — and nothing tested it.
 *
 * The create builder deliberately takes no publication parameter, so "a create can
 * publish" is not expressible rather than merely discouraged. That is a design property
 * of the function, enforced by review and by the behaviour tests below — not by any
 * assertion here. An earlier version of this file checked `toAthleteProfileRow.length`,
 * which was misleading: `Function.length` stops counting at the first defaulted
 * parameter, and `media` is defaulted, so a later publication parameter could be added
 * with the assertion still passing.
 */

const OWNER = "11111111-1111-4111-8111-111111111111";

function buildProfile() {
  return normalizeAthleteProfileData({
    firstName: "Explicit",
    lastName: "Publish",
    sport: "Track",
    slug: "explicit-publish",
  });
}

describe("toAthleteProfileRow — a create never publishes", () => {
  test("first create is unpublished", () => {
    const row = toAthleteProfileRow(buildProfile(), OWNER);
    assert.equal(row.is_published, false);
  });

  test("still unpublished when the create carries media", () => {
    const row = toAthleteProfileRow(buildProfile(), OWNER, {
      heroPhotoPath: `${OWNER}/hero/a.jpg`,
      profilePhotoPath: `${OWNER}/profile/b.jpg`,
    });
    assert.equal(row.is_published, false);
    assert.equal(row.hero_photo_path, `${OWNER}/hero/a.jpg`);
  });

  test("repeated creates from the same profile data are all unpublished", () => {
    for (let i = 0; i < 3; i += 1) {
      assert.equal(toAthleteProfileRow(buildProfile(), OWNER).is_published, false);
    }
  });

});

describe("toAthleteProfileUpdateRow — an ordinary save preserves publication state", () => {
  test("unpublished stays unpublished", () => {
    assert.equal(toAthleteProfileUpdateRow(buildProfile(), false).is_published, false);
  });

  test("published stays published", () => {
    assert.equal(toAthleteProfileUpdateRow(buildProfile(), true).is_published, true);
  });

  test("repeated saves do not drift in either direction", () => {
    for (let i = 0; i < 3; i += 1) {
      assert.equal(toAthleteProfileUpdateRow(buildProfile(), false).is_published, false);
      assert.equal(toAthleteProfileUpdateRow(buildProfile(), true).is_published, true);
    }
  });

  test("explicit publish is expressed only through the update path", () => {
    // Publish: the athlete toggles PublishSection, then saves.
    assert.equal(toAthleteProfileUpdateRow(buildProfile(), true).is_published, true);
    // Unpublish: the same control, the other way.
    assert.equal(toAthleteProfileUpdateRow(buildProfile(), false).is_published, false);
  });
});
