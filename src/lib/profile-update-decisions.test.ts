import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  describeUpdateError,
  isDefiniteUpdateFailure,
  zeroRowUpdateResult,
  updateRowsMatch,
  oldPathsEligibleForCleanup,
  decideAfterConfirmedUpdateSuccess,
  decideAfterDefiniteUpdateFailure,
  decideAfterAmbiguousUpdate,
  withCleanupWarning,
  withOrphanPaths,
  type UpdateReconciliationOutcome,
  type MediaSlotOutcome,
} from "./profile-update-decisions.ts";
import type { AthleteProfileUpdateRow } from "./db-mappers.ts";
import type { DeleteOutcome } from "./profile-save-decisions.ts";

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
 * Checkpoint 5C adds media (replace/remove/framing) coverage: the two-sided
 * cleanup-eligibility rules (old-object deletion gated on confirmed commit;
 * a replacement upload never deleted while its fate is ambiguous; a
 * definite/zero-row failure makes a replacement safe to delete
 * unconditionally while leaving the old object untouched).
 *
 * Run directly: node --test src/lib/profile-update-decisions.test.ts
 */

const PRESERVE: MediaSlotOutcome = { kind: "preserve" };

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
    // Deliberately non-default so an "unchanged" assertion is meaningful
    // rather than trivially true because it matches the column defaults.
    hero_photo_position_x: 0.3,
    hero_photo_position_y: 0.7,
    hero_photo_zoom: 1.4,
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

describe("updateRowsMatch — the entire intended 5B/5C state, field by field", () => {
  test("identical rows match", () => {
    assert.equal(updateRowsMatch(buildRow(), buildRow()), true);
  });

  test("a difference in any single scalar field is a mismatch", () => {
    assert.equal(updateRowsMatch(buildRow(), buildRow({ bio: "Different bio." })), false);
    assert.equal(updateRowsMatch(buildRow(), buildRow({ slug: "different-slug" })), false);
    assert.equal(updateRowsMatch(buildRow(), buildRow({ is_published: false })), false);
    assert.equal(updateRowsMatch(buildRow({ is_published: false }), buildRow({ is_published: false })), true);
  });

  test("hero framing (x/y/zoom) is compared unconditionally, like any other field", () => {
    assert.equal(updateRowsMatch(buildRow(), buildRow({ hero_photo_position_x: 0.9 })), false);
    assert.equal(updateRowsMatch(buildRow(), buildRow({ hero_photo_position_y: 0.1 })), false);
    assert.equal(updateRowsMatch(buildRow(), buildRow({ hero_photo_zoom: 1.1 })), false);
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

  describe("media paths — conditional on the intended side (Checkpoint 5C)", () => {
    test("intended has no opinion (undefined = preserve): any persisted value is accepted", () => {
      const intended = buildRow(); // hero_photo_path/profile_photo_path both absent
      const persistedWithHero = buildRow({ hero_photo_path: "uid/hero/anything.jpg" });
      const persistedWithNullHero = buildRow({ hero_photo_path: null });
      assert.equal(updateRowsMatch(persistedWithHero, intended), true);
      assert.equal(updateRowsMatch(persistedWithNullHero, intended), true);
    });

    test("intended is a replace (a concrete path): persisted must match exactly", () => {
      const intended = buildRow({ hero_photo_path: "uid/hero/new-uuid.jpg" });
      assert.equal(
        updateRowsMatch(buildRow({ hero_photo_path: "uid/hero/new-uuid.jpg" }), intended),
        true
      );
      assert.equal(
        updateRowsMatch(buildRow({ hero_photo_path: "uid/hero/old-uuid.jpg" }), intended),
        false,
        "the old path still being persisted means the replace did not commit"
      );
    });

    test("intended is a remove (null): persisted must also be null", () => {
      const intended = buildRow({ hero_photo_path: null });
      assert.equal(updateRowsMatch(buildRow({ hero_photo_path: null }), intended), true);
      assert.equal(
        updateRowsMatch(buildRow({ hero_photo_path: "uid/hero/still-there.jpg" }), intended),
        false,
        "a non-null persisted path means the remove did not commit"
      );
    });

    test("profile_photo_path follows the identical rule, independently of hero_photo_path", () => {
      const intended = buildRow({ profile_photo_path: "uid/profile/new-uuid.jpg" });
      assert.equal(
        updateRowsMatch(buildRow({ profile_photo_path: "uid/profile/new-uuid.jpg" }), intended),
        true
      );
      assert.equal(
        updateRowsMatch(buildRow({ profile_photo_path: "uid/profile/old-uuid.jpg" }), intended),
        false
      );
    });
  });
});

describe("oldPathsEligibleForCleanup — only a changed slot's previous path, and only if non-null", () => {
  test("both slots preserved: nothing is eligible", () => {
    assert.deepEqual(oldPathsEligibleForCleanup(PRESERVE, PRESERVE), []);
  });

  test("a replaced hero contributes its previous path", () => {
    const hero: MediaSlotOutcome = { kind: "replace", newPath: "uid/hero/new.jpg", previousPath: "uid/hero/old.jpg" };
    assert.deepEqual(oldPathsEligibleForCleanup(hero, PRESERVE), ["uid/hero/old.jpg"]);
  });

  test("a removed profile photo contributes its previous path", () => {
    const profileSlot: MediaSlotOutcome = { kind: "remove", previousPath: "uid/profile/old.jpg" };
    assert.deepEqual(oldPathsEligibleForCleanup(PRESERVE, profileSlot), ["uid/profile/old.jpg"]);
  });

  test("a replace/remove whose previous path was already null contributes nothing", () => {
    const hero: MediaSlotOutcome = { kind: "replace", newPath: "uid/hero/new.jpg", previousPath: null };
    const profileSlot: MediaSlotOutcome = { kind: "remove", previousPath: null };
    assert.deepEqual(oldPathsEligibleForCleanup(hero, profileSlot), []);
  });

  test("both slots changed: both previous paths are eligible", () => {
    const hero: MediaSlotOutcome = { kind: "replace", newPath: "uid/hero/new.jpg", previousPath: "uid/hero/old.jpg" };
    const profileSlot: MediaSlotOutcome = { kind: "remove", previousPath: "uid/profile/old.jpg" };
    assert.deepEqual(oldPathsEligibleForCleanup(hero, profileSlot), ["uid/hero/old.jpg", "uid/profile/old.jpg"]);
  });
});


describe("decideAfterConfirmedUpdateSuccess — a known-committed write", () => {
  test("preserve on both slots -> no cleanup at all", () => {
    const { deletePaths, result } = decideAfterConfirmedUpdateSuccess("some-slug");
    assert.deepEqual(deletePaths, []);
    assert.equal(result.ok, true);
  });

  test("confirmed replacement -> only the old path is eligible, never the new one", () => {
    const hero: MediaSlotOutcome = { kind: "replace", newPath: "uid/hero/new.jpg", previousPath: "uid/hero/old.jpg" };
    const { deletePaths, result } = decideAfterConfirmedUpdateSuccess("some-slug", hero, PRESERVE);
    assert.deepEqual(deletePaths, ["uid/hero/old.jpg"]);
    assert.ok(!deletePaths.includes("uid/hero/new.jpg"), "the freshly committed replacement must never be deleted");
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.slug, "some-slug");
  });

  test("confirmed removal -> only the old path is eligible for cleanup", () => {
    const profileSlot: MediaSlotOutcome = { kind: "remove", previousPath: "uid/profile/old.jpg" };
    const { deletePaths, result } = decideAfterConfirmedUpdateSuccess("some-slug", PRESERVE, profileSlot);
    assert.deepEqual(deletePaths, ["uid/profile/old.jpg"]);
    assert.equal(result.ok, true);
  });
});

describe("decideAfterDefiniteUpdateFailure — the row is guaranteed not to have committed", () => {
  test("a replacement upload is eligible for cleanup; the old/current object is never touched", () => {
    const hero: MediaSlotOutcome = { kind: "replace", newPath: "uid/hero/new.jpg", previousPath: "uid/hero/old.jpg" };
    const errorResult = describeUpdateError("23505");
    const { deletePaths, result } = decideAfterDefiniteUpdateFailure(errorResult, hero, PRESERVE);
    assert.deepEqual(deletePaths, ["uid/hero/new.jpg"]);
    assert.ok(!deletePaths.includes("uid/hero/old.jpg"), "the still-live old object must never be deleted on failure");
    assert.equal(result.ok, false);
  });

  test("a remove intent contributes nothing to cleanup here — nothing was ever uploaded for it", () => {
    const profileSlot: MediaSlotOutcome = { kind: "remove", previousPath: "uid/profile/old.jpg" };
    const { deletePaths } = decideAfterDefiniteUpdateFailure(zeroRowUpdateResult(), PRESERVE, profileSlot);
    assert.deepEqual(deletePaths, []);
  });

  test("both slots preserved -> no cleanup at all", () => {
    const { deletePaths, result } = decideAfterDefiniteUpdateFailure(zeroRowUpdateResult());
    assert.deepEqual(deletePaths, []);
    assert.equal(result.ok, false);
  });
});

describe("decideAfterAmbiguousUpdate — reconciling an ambiguous write", () => {
  test("reread matches the entire intended state exactly -> reconciled as success (no media involved)", () => {
    const intended = buildRow();
    const reconciliation: UpdateReconciliationOutcome = { status: "found", row: buildRow() };
    const { deletePaths, result } = decideAfterAmbiguousUpdate(reconciliation, intended);
    assert.deepEqual(deletePaths, []);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.slug, intended.slug);
  });

  test("ambiguous update + exact replace-media match -> reconciled success, old path eligible for cleanup", () => {
    const hero: MediaSlotOutcome = { kind: "replace", newPath: "uid/hero/new.jpg", previousPath: "uid/hero/old.jpg" };
    const intended = buildRow({ hero_photo_path: "uid/hero/new.jpg" });
    const reconciliation: UpdateReconciliationOutcome = {
      status: "found",
      row: buildRow({ hero_photo_path: "uid/hero/new.jpg" }),
    };
    const { deletePaths, result } = decideAfterAmbiguousUpdate(reconciliation, intended, hero, PRESERVE);
    assert.equal(result.ok, true);
    assert.deepEqual(deletePaths, ["uid/hero/old.jpg"]);
  });

  test("ambiguous update + remove persisted as null -> reconciled success, old path eligible for cleanup", () => {
    const profileSlot: MediaSlotOutcome = { kind: "remove", previousPath: "uid/profile/old.jpg" };
    const intended = buildRow({ profile_photo_path: null });
    const reconciliation: UpdateReconciliationOutcome = {
      status: "found",
      row: buildRow({ profile_photo_path: null }),
    };
    const { deletePaths, result } = decideAfterAmbiguousUpdate(reconciliation, intended, PRESERVE, profileSlot);
    assert.equal(result.ok, true);
    assert.deepEqual(deletePaths, ["uid/profile/old.jpg"]);
  });

  test("reread differs from the intended state -> unresolved, not success, not a guessed failure", () => {
    const intended = buildRow();
    const reconciliation: UpdateReconciliationOutcome = {
      status: "found",
      row: buildRow({ bio: "A different bio than what was intended." }),
    };
    const { deletePaths, result } = decideAfterAmbiguousUpdate(reconciliation, intended);
    assert.deepEqual(deletePaths, []);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.match(result.message, /couldn't confirm/i);
  });

  test("ambiguous replace, reread still shows the OLD path -> mismatch, no destructive cleanup of either object", () => {
    const hero: MediaSlotOutcome = { kind: "replace", newPath: "uid/hero/new.jpg", previousPath: "uid/hero/old.jpg" };
    const intended = buildRow({ hero_photo_path: "uid/hero/new.jpg" });
    const reconciliation: UpdateReconciliationOutcome = {
      status: "found",
      row: buildRow({ hero_photo_path: "uid/hero/old.jpg" }),
    };
    const { deletePaths, result } = decideAfterAmbiguousUpdate(reconciliation, intended, hero, PRESERVE);
    assert.deepEqual(deletePaths, [], "neither the old nor the new object may be deleted while unresolved");
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.ok(result.orphanPaths?.includes("uid/hero/new.jpg"), "the new path must be reported, not silently lost");
    assert.ok(result.orphanPaths?.includes("uid/hero/old.jpg"), "the old path must also be reported — its fate is equally unknown");
  });

  test("reread finds no row visible -> unresolved, not assumed failed; media paths reported, not deleted", () => {
    const hero: MediaSlotOutcome = { kind: "replace", newPath: "uid/hero/new.jpg", previousPath: "uid/hero/old.jpg" };
    const { deletePaths, result } = decideAfterAmbiguousUpdate({ status: "not-visible" }, buildRow(), hero, PRESERVE);
    assert.deepEqual(deletePaths, []);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.match(result.message, /couldn't confirm/i);
    assert.ok(result.orphanPaths && result.orphanPaths.length > 0);
  });

  test("the reconciliation query itself fails -> unresolved, not assumed failed; no destructive cleanup", () => {
    const { deletePaths, result } = decideAfterAmbiguousUpdate({ status: "query-failed" }, buildRow());
    assert.deepEqual(deletePaths, []);
    assert.equal(result.ok, false);
  });

  test("published/unpublished intent is itself part of the comparison, not just profile fields", () => {
    const intendedUnpublish = buildRow({ is_published: false });
    const staleStillPublished: UpdateReconciliationOutcome = {
      status: "found",
      row: buildRow({ is_published: true }),
    };
    const { result } = decideAfterAmbiguousUpdate(staleStillPublished, intendedUnpublish);
    assert.equal(result.ok, false);
  });
});

describe("withCleanupWarning — a confirmed save is never rolled back or reported as a plain clean success", () => {
  const okResult = { ok: true as const, slug: "some-slug" };
  const failedResult = { ok: false as const, message: "Couldn't save your changes. Try again in a moment." };

  test("cleanup succeeded -> result is returned unchanged, no warning", () => {
    const cleanup: DeleteOutcome = { ok: true };
    assert.deepEqual(withCleanupWarning(okResult, cleanup), okResult);
  });

  test("cleanup failed -> still ok:true, with an athlete-safe warning message, no raw path exposed", () => {
    const cleanup: DeleteOutcome = { ok: false, failedPaths: ["uid/hero/old.jpg"], message: "boom" };
    const result = withCleanupWarning(okResult, cleanup);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.slug, "some-slug");
    assert.ok(result.mediaCleanupWarning, "a cleanup failure after a confirmed commit must surface a warning");
    assert.doesNotMatch(result.mediaCleanupWarning ?? "", /uid\/hero/, "the raw Storage path must never reach athlete-facing text");
  });

  test("never touches an ok:false result", () => {
    const cleanup: DeleteOutcome = { ok: false, failedPaths: ["uid/hero/old.jpg"], message: "boom" };
    assert.deepEqual(withCleanupWarning(failedResult, cleanup), failedResult);
  });
});

describe("withOrphanPaths — folding a failed doomed-replacement cleanup into an already-failed result", () => {
  test("cleanup failed -> orphanPaths attached to the existing ok:false result", () => {
    const errorResult = describeUpdateError("23505");
    const cleanup: DeleteOutcome = { ok: false, failedPaths: ["uid/hero/new.jpg"], message: "boom" };
    const result = withOrphanPaths(errorResult, cleanup);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.deepEqual(result.orphanPaths, ["uid/hero/new.jpg"]);
  });

  test("cleanup succeeded -> result unchanged", () => {
    const errorResult = describeUpdateError("23505");
    assert.deepEqual(withOrphanPaths(errorResult, { ok: true }), errorResult);
  });

  test("never touches an ok:true result", () => {
    const okResult = { ok: true as const, slug: "some-slug" };
    const cleanup: DeleteOutcome = { ok: false, failedPaths: ["uid/hero/new.jpg"], message: "boom" };
    assert.deepEqual(withOrphanPaths(okResult, cleanup), okResult);
  });
});

describe("a second save cannot reference or delete the pre-save old path (Checkpoint 5C)", () => {
  test("each attempt's cleanup decision is driven solely by the previousPath it was given, not by any earlier attempt", () => {
    // Simulates: attempt 1 replaces hero old-A -> new-B and commits.
    const firstAttemptHero: MediaSlotOutcome = {
      kind: "replace",
      newPath: "uid/hero/new-B.jpg",
      previousPath: "uid/hero/old-A.jpg",
    };
    const first = decideAfterConfirmedUpdateSuccess("some-slug", firstAttemptHero, PRESERVE);
    assert.deepEqual(first.deletePaths, ["uid/hero/old-A.jpg"]);

    // A second save, in the same browser session, must be built from the
    // NEW persisted state (new-B is now "previous"), never from old-A —
    // exactly what updateProfile achieves by taking currentMedia from the
    // caller's freshly-reloaded record rather than any value left over from
    // the first attempt. Modeled here directly: the second attempt's own
    // previousPath is new-B, not old-A.
    const secondAttemptHero: MediaSlotOutcome = {
      kind: "replace",
      newPath: "uid/hero/new-C.jpg",
      previousPath: "uid/hero/new-B.jpg",
    };
    const second = decideAfterConfirmedUpdateSuccess("some-slug", secondAttemptHero, PRESERVE);
    assert.deepEqual(second.deletePaths, ["uid/hero/new-B.jpg"]);
    assert.ok(
      !second.deletePaths.includes("uid/hero/old-A.jpg"),
      "the second attempt must never reference the first attempt's already-superseded old path"
    );
  });
});
