import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { toAthleteProfileUpdateRow } from "@/lib/db-mappers";
import { createEmptyAthleteProfile, type AthleteProfileData } from "@/lib/athlete-profile";

/**
 * Regression for the 5B requirement that toAthleteProfileUpdateRow's output
 * is structurally incapable of touching ownership, identity, timestamps, or
 * media — not just "happens not to set them today".
 *
 * db-mappers.ts imports real, value-level functions from athlete-profile.ts
 * via this project's "@/" path alias, so — unlike profile-save-decisions.ts
 * and profile-update-decisions.ts, which are `import type`-only and can run
 * under Node's native TypeScript support alone — this file needs the
 * project's alias-resolving loader hook to run under `node --test`:
 *
 *   node --import ./scripts/register-alias-resolver.mjs --test src/lib/db-mappers.update-row.test.ts
 *
 * No Supabase env is required: neither db-mappers.ts nor athlete-profile.ts
 * reads process.env.
 */

const FORBIDDEN_KEYS = [
  "id",
  "owner_user_id",
  "created_at",
  "updated_at",
  "hero_photo_path",
  "profile_photo_path",
  "hero_photo_position_x",
  "hero_photo_position_y",
  "hero_photo_zoom",
];

function buildProfile(overrides: Partial<AthleteProfileData> = {}): AthleteProfileData {
  return {
    ...createEmptyAthleteProfile(),
    slug: "test-athlete",
    firstName: "Test",
    lastName: "Athlete",
    sport: "Soccer",
    position: "Midfielder",
    classYear: "2028",
    schoolOrTeam: "Test High",
    city: "Testburg",
    state: "TS",
    heightIn: 68,
    weightLb: 150,
    bio: "A bio.",
    highlightLinks: [{ label: "Reel", url: "https://example.invalid/reel" }],
    recruitingStatus: "open",
    recruitingContact: "coach@example.invalid",
    recruitingNotes: "Notes.",
    social: {
      instagram: "@test",
      twitter: "@test",
      tiktok: "@test",
      hudl: "https://hudl.example.invalid",
      youtube: "https://youtube.example.invalid",
      website: "https://example.invalid",
    },
    nilOpen: true,
    nilContact: "brand@example.invalid",
    nilInterests: "Interests.",
    ...overrides,
  };
}

describe("toAthleteProfileUpdateRow — structural exclusion of out-of-scope columns", () => {
  test("the output never carries any media, framing, ownership, identity, or timestamp key", () => {
    const row = toAthleteProfileUpdateRow(buildProfile(), true);
    const keys = Object.keys(row);

    for (const forbidden of FORBIDDEN_KEYS) {
      assert.equal(
        keys.includes(forbidden),
        false,
        `update row must never contain "${forbidden}"`
      );
    }
  });

  test("this holds regardless of what the profile's own hero/framing fields contain", () => {
    // AthleteProfileData still carries these fields (they're part of the
    // domain model) — the guarantee is that the update mapper never reads
    // or forwards them, not that the input happens to lack them.
    const profile = buildProfile({
      heroPhotoPositionX: 0.75,
      heroPhotoPositionY: 0.25,
      heroPhotoZoom: 1.5,
    });
    const row = toAthleteProfileUpdateRow(profile, true);
    const keys = Object.keys(row);
    assert.equal(keys.includes("hero_photo_position_x"), false);
    assert.equal(keys.includes("hero_photo_position_y"), false);
    assert.equal(keys.includes("hero_photo_zoom"), false);
  });

  test("the row carries exactly the editable-field and is_published columns — nothing more", () => {
    const row = toAthleteProfileUpdateRow(buildProfile(), true);
    const expectedKeys = [
      "slug",
      "first_name",
      "last_name",
      "sport",
      "position",
      "class_year",
      "school_or_team",
      "city",
      "state",
      "height_in",
      "weight_lb",
      "bio",
      "highlight_links",
      "recruiting_status",
      "recruiting_contact",
      "recruiting_notes",
      "social_instagram",
      "social_twitter",
      "social_tiktok",
      "social_hudl",
      "social_youtube",
      "social_website",
      "nil_open",
      "nil_contact",
      "nil_interests",
      "is_published",
    ].sort();
    assert.deepEqual(Object.keys(row).sort(), expectedKeys);
  });
});

describe("toAthleteProfileUpdateRow — is_published passes through exactly, never hardcoded", () => {
  test("isPublished: false remains false", () => {
    const row = toAthleteProfileUpdateRow(buildProfile(), false);
    assert.equal(row.is_published, false);
  });

  test("isPublished: true remains true", () => {
    const row = toAthleteProfileUpdateRow(buildProfile(), true);
    assert.equal(row.is_published, true);
  });
});
