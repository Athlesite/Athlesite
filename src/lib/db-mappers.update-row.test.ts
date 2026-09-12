import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { toAthleteProfileUpdateRow } from "@/lib/db-mappers";
import { createEmptyAthleteProfile, MAX_HERO_ZOOM, type AthleteProfileData } from "@/lib/athlete-profile";

/**
 * Regression for toAthleteProfileUpdateRow's exact 5C contract:
 *
 * - `id`, `owner_user_id`, `created_at`, `updated_at` remain structurally
 *   impossible to set — unchanged from 5B.
 * - `hero_photo_path`/`profile_photo_path` are conditional: omitted from the
 *   media argument means the key is structurally absent from the output
 *   (preserve), a string means it is written exactly (replace), and `null`
 *   writes an explicit clear (remove) — reusing the exact same
 *   `MediaPathUpdate` convention the create path already established.
 * - `hero_photo_position_x/y` and `hero_photo_zoom` are unconditional,
 *   always present and sourced from the profile, with zoom clamped
 *   identically to the create path's own defensive clamp.
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

const FORBIDDEN_KEYS = ["id", "owner_user_id", "created_at", "updated_at"];

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
    heroPhotoPositionX: 0.3,
    heroPhotoPositionY: 0.7,
    heroPhotoZoom: 1.4,
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

describe("toAthleteProfileUpdateRow — never touches ownership, identity, or timestamps", () => {
  test("the output never carries id/owner_user_id/created_at/updated_at, with or without a media argument", () => {
    const withoutMedia = toAthleteProfileUpdateRow(buildProfile(), true);
    const withMedia = toAthleteProfileUpdateRow(buildProfile(), true, {
      heroPhotoPath: "uid/hero/new.jpg",
      profilePhotoPath: null,
    });

    for (const forbidden of FORBIDDEN_KEYS) {
      assert.equal(Object.keys(withoutMedia).includes(forbidden), false, `must never contain "${forbidden}"`);
      assert.equal(Object.keys(withMedia).includes(forbidden), false, `must never contain "${forbidden}"`);
    }
  });
});

describe("toAthleteProfileUpdateRow — media paths are conditional (Checkpoint 5C)", () => {
  test("preserve hero (omitted from media): the hero_photo_path key is structurally absent", () => {
    const row = toAthleteProfileUpdateRow(buildProfile(), true, { profilePhotoPath: null });
    assert.equal("hero_photo_path" in row, false);
  });

  test("preserve profile (omitted from media): the profile_photo_path key is structurally absent", () => {
    const row = toAthleteProfileUpdateRow(buildProfile(), true, { heroPhotoPath: "uid/hero/new.jpg" });
    assert.equal("profile_photo_path" in row, false);
  });

  test("preserve on both slots (media omitted entirely): neither media key is present", () => {
    const row = toAthleteProfileUpdateRow(buildProfile(), true);
    assert.equal("hero_photo_path" in row, false);
    assert.equal("profile_photo_path" in row, false);
  });

  test("replace hero: the exact newly uploaded path is written", () => {
    const row = toAthleteProfileUpdateRow(buildProfile(), true, { heroPhotoPath: "uid/hero/fresh-uuid.jpg" });
    assert.equal(row.hero_photo_path, "uid/hero/fresh-uuid.jpg");
  });

  test("replace profile: the exact newly uploaded path is written", () => {
    const row = toAthleteProfileUpdateRow(buildProfile(), true, { profilePhotoPath: "uid/profile/fresh-uuid.jpg" });
    assert.equal(row.profile_photo_path, "uid/profile/fresh-uuid.jpg");
  });

  test("remove hero: writes an explicit null, not an omitted key", () => {
    const row = toAthleteProfileUpdateRow(buildProfile(), true, { heroPhotoPath: null });
    assert.equal("hero_photo_path" in row, true);
    assert.equal(row.hero_photo_path, null);
  });

  test("remove profile: writes an explicit null, not an omitted key", () => {
    const row = toAthleteProfileUpdateRow(buildProfile(), true, { profilePhotoPath: null });
    assert.equal("profile_photo_path" in row, true);
    assert.equal(row.profile_photo_path, null);
  });

  test("both slots can carry independent, different instructions in the same call", () => {
    const row = toAthleteProfileUpdateRow(buildProfile(), true, {
      heroPhotoPath: "uid/hero/new.jpg",
      profilePhotoPath: null,
    });
    assert.equal(row.hero_photo_path, "uid/hero/new.jpg");
    assert.equal(row.profile_photo_path, null);
  });
});

describe("toAthleteProfileUpdateRow — hero framing is unconditional (Checkpoint 5C)", () => {
  test("framing is always present and sourced from the profile, regardless of any media instruction", () => {
    const profile = buildProfile({ heroPhotoPositionX: 0.2, heroPhotoPositionY: 0.9, heroPhotoZoom: 1.6 });
    const row = toAthleteProfileUpdateRow(profile, true, { heroPhotoPath: null });
    assert.equal(row.hero_photo_position_x, 0.2);
    assert.equal(row.hero_photo_position_y, 0.9);
    assert.equal(row.hero_photo_zoom, 1.6);
  });

  test("zoom is clamped to the column's check-constraint range, mirroring the create path's own clamp", () => {
    const row = toAthleteProfileUpdateRow(buildProfile({ heroPhotoZoom: 99 }), true);
    assert.equal(row.hero_photo_zoom, MAX_HERO_ZOOM);
  });

  test("framing is present even when this save never touches media at all", () => {
    const row = toAthleteProfileUpdateRow(buildProfile(), true);
    assert.equal(typeof row.hero_photo_position_x, "number");
    assert.equal(typeof row.hero_photo_position_y, "number");
    assert.equal(typeof row.hero_photo_zoom, "number");
  });
});

describe("toAthleteProfileUpdateRow — the row carries exactly the expected columns", () => {
  test("with no media instruction: editable fields + framing + is_published, nothing more", () => {
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
      "hero_photo_position_x",
      "hero_photo_position_y",
      "hero_photo_zoom",
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
