import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  describeUpdateError,
  isDefiniteUpdateFailure,
  zeroRowUpdateResult,
  updateRowsMatch,
  decideAfterAmbiguousUpdate,
  type UpdateReconciliationOutcome,
} from "./profile-update-decisions.ts";
import type { AthleteProfileUpdateRow } from "./db-mappers.ts";

/**
 * Focused, in-memory checks for updateProfile's branching in profile-save.ts
 * — run against the actual functions that file calls for every one of these
 * decisions, not a reimplementation.
 *
 * Like profile-save-decisions.test.ts, this has no runtime dependency on
 * Next.js, Supabase, or this project's `@/` path aliases:
 * profile-update-decisions.ts imports only `import type`, erased entirely at
 * compile time, so this runs standalone under Node's own TypeScript support.
 *
 * Run directly: node --test src/lib/profile-update-decisions.test.ts
 */

function buildRow(overrides: Partial<AthleteProfileUpdateRow> = {}): AthleteProfileUpdateRow {
  return {
    slug: "test-athlete",
    first_name: "Test",
    last_name: "Athlete",
    sport: "Soccer",
    position: "Midfielder",
    class_year: "2028",
    school_or_team: "Test High",
    city: "Testburg",
    state: "TS",
    height_in: 68,
    weight_lb: 150,
    bio: "A bio.",
    highlight_links: [{ label: "Reel", url: "https://example.invalid/reel" }],
    recruiting_status: "open",
    recruiting_contact: "coach@example.invalid",
    recruiting_notes: "Notes.",
    social_instagram: "@test",
    social_twitter: "@test",
    social_tiktok: "@test",
    social_hudl: "https://hudl.example.invalid",
    social_youtube: "https://youtube.example.invalid",
    social_website: "https://example.invalid",
    nil_open: true,
    nil_contact: "brand@example.invalid",
    nil_interests: "Interests.",
    is_published: true,
    ...overrides,
  };
}

describe("describeUpdateError — mapping Postgres codes to safe messages", () => {
  test("23505 (unique violation) is always attributed to slug — owner_user_id is never a settable column here", () => {
    const result = describeUpdateError("23505");
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.field, "slug");
    assert.match(result.message, /already taken/i);
  });

  test("42501 (RLS refused the write) fails closed with a safe message", () => {
    const result = describeUpdateError("42501");
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.field, undefined);
    assert.match(result.message, /permission/i);
  });

  test("23514 (check constraint) surfaces a review-your-profile message", () => {
    const result = describeUpdateError("23514");
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.match(result.message, /valid/i);
  });

  test("an unrecognized code gets a calm generic fallback", () => {
    const result = describeUpdateError("99999");
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.match(result.message, /try again/i);
  });
});

describe("isDefiniteUpdateFailure", () => {
  test("recognizes the three definite codes", () => {
    assert.equal(isDefiniteUpdateFailure("23505"), true);
    assert.equal(isDefiniteUpdateFailure("23514"), true);
    assert.equal(isDefiniteUpdateFailure("42501"), true);
  });

  test("anything else is not definite — including undefined", () => {
    assert.equal(isDefiniteUpdateFailure("40001"), false);
    assert.equal(isDefiniteUpdateFailure(undefined), false);
  });
});

describe("zeroRowUpdateResult — a matched-nothing update is never success", () => {
  test("returns a fail-closed result, not ok:true", () => {
    const result = zeroRowUpdateResult();
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.match(result.message, /couldn't find your profile/i);
  });
});

describe("updateRowsMatch — the entire intended 5B state, field by field", () => {
  test("identical rows match", () => {
    assert.equal(updateRowsMatch(buildRow(), buildRow()), true);
  });

  test("a difference in any single scalar field is a mismatch", () => {
    assert.equal(updateRowsMatch(buildRow(), buildRow({ bio: "Different bio." })), false);
    assert.equal(updateRowsMatch(buildRow(), buildRow({ slug: "different-slug" })), false);
    assert.equal(updateRowsMatch(buildRow(), buildRow({ is_published: false })), false);
    assert.equal(updateRowsMatch(buildRow({ is_published: false }), buildRow({ is_published: false })), true);
  });

  test("highlight_links differing in content is a mismatch", () => {
    const a = buildRow({ highlight_links: [{ label: "A", url: "https://a.invalid" }] });
    const b = buildRow({ highlight_links: [{ label: "B", url: "https://b.invalid" }] });
    assert.equal(updateRowsMatch(a, b), false);
  });

  test("highlight_links differing only in order is a mismatch — order is part of the athlete's intended state", () => {
    const a = buildRow({
      highlight_links: [
        { label: "First", url: "https://first.invalid" },
        { label: "Second", url: "https://second.invalid" },
      ],
    });
    const b = buildRow({
      highlight_links: [
        { label: "Second", url: "https://second.invalid" },
        { label: "First", url: "https://first.invalid" },
      ],
    });
    assert.equal(updateRowsMatch(a, b), false);
  });

  test("highlight_links differing in length is a mismatch", () => {
    const a = buildRow({ highlight_links: [{ label: "Only", url: "https://only.invalid" }] });
    const b = buildRow({ highlight_links: [] });
    assert.equal(updateRowsMatch(a, b), false);
  });
});

describe("decideAfterAmbiguousUpdate — reconciling an ambiguous write", () => {
  test("reread matches the entire intended state exactly -> reconciled as success", () => {
    const intended = buildRow();
    const reconciliation: UpdateReconciliationOutcome = { status: "found", row: buildRow() };
    const result = decideAfterAmbiguousUpdate(reconciliation, intended);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.slug, intended.slug);
  });

  test("reread differs from the intended state -> unresolved, not success, not a guessed failure", () => {
    const intended = buildRow();
    const reconciliation: UpdateReconciliationOutcome = {
      status: "found",
      row: buildRow({ bio: "A different bio than what was intended." }),
    };
    const result = decideAfterAmbiguousUpdate(reconciliation, intended);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.match(result.message, /couldn't confirm/i);
  });

  test("reread finds no row visible -> unresolved, not assumed failed", () => {
    const result = decideAfterAmbiguousUpdate({ status: "not-visible" }, buildRow());
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.match(result.message, /couldn't confirm/i);
  });

  test("the reconciliation query itself fails -> unresolved, not assumed failed", () => {
    const result = decideAfterAmbiguousUpdate({ status: "query-failed" }, buildRow());
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.match(result.message, /couldn't confirm/i);
  });

  test("published/unpublished intent is itself part of the comparison, not just profile fields", () => {
    const intendedUnpublish = buildRow({ is_published: false });
    // A reread showing the row still published — as if the unpublish never
    // took effect — must not be reconciled as success.
    const staleStillPublished: UpdateReconciliationOutcome = {
      status: "found",
      row: buildRow({ is_published: true }),
    };
    const result = decideAfterAmbiguousUpdate(staleStillPublished, intendedUnpublish);
    assert.equal(result.ok, false);
  });
});
