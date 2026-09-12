import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  decideOwnershipGate,
  decideAfterUploadFailure,
  decideAfterDefiniteFailure,
  decideAfterAmbiguousInsert,
  mergeCleanupOutcome,
  unresolvedPathsToLog,
  isDefiniteInsertFailure,
  classifyCommittedRow,
  classifyUploadAttempt,
  confirmDeletions,
  normalizeDeletePaths,
  describeInsertError,
} from "./profile-save-decisions.ts";

/**
 * Focused, in-memory checks for createProfile's fail-closed / rollback
 * branching, run against the actual functions profile-save.ts and
 * media-storage.ts call for every one of these decisions — not a
 * reimplementation or a description of the logic.
 *
 * This file has no runtime dependency on Next.js, Supabase, or this
 * project's `@/` path aliases: profile-save-decisions.ts imports only
 * `import type`, which is erased entirely at compile time, so both files can
 * run standalone under Node's own TypeScript support. No mocking of the
 * Supabase client, network, or module system is needed, because the actual
 * upload/insert/reconcile/delete I/O calls in profile-save.ts and
 * media-storage.ts are themselves thin wrappers around these pure functions
 * — testing the functions is testing the real decisions createProfile makes,
 * for every outcome its I/O can produce, including the outcomes only visible
 * at the I/O shell boundary (an upload throwing mid-attempt, a deletion
 * response that only partially confirms what was requested).
 *
 * Run directly: node --test src/lib/profile-save-decisions.test.ts
 */

describe("decideOwnershipGate — preflight", () => {
  test("existing owner is blocked, not passed through to upload", () => {
    const gate = decideOwnershipGate({ status: "exists" });
    assert.equal(gate.proceed, false);
    if (gate.proceed) throw new Error("unreachable");
    assert.equal(gate.result.ok, false);
    assert.match(gate.result.message, /already have a profile/i);
  });

  test("a failed ownership lookup blocks creation — fails closed, not open", () => {
    const gate = decideOwnershipGate({ status: "unknown" });
    assert.equal(gate.proceed, false);
    if (gate.proceed) throw new Error("unreachable");
    assert.equal(gate.result.ok, false);
    assert.match(gate.result.message, /couldn't confirm your account status/i);
  });

  test("confirmed absence is the only status that proceeds", () => {
    const gate = decideOwnershipGate({ status: "none" });
    assert.equal(gate.proceed, true);
  });
});

describe("classifyUploadAttempt — no network-layer outcome is ever definite", () => {
  test("a clean success (outcomeUnproven: false) carries the path", () => {
    const outcome = classifyUploadAttempt("uid/hero/aaa.jpg", false, "unused");
    assert.deepEqual(outcome, { kind: "success", path: "uid/hero/aaa.jpg" });
  });

  test("Astra regression: even a clean, structured API error is ambiguous, never definite — this function has no definite branch at all", () => {
    // Superseded assumption, kept as an explicit negative: a prior version of
    // this function treated a clean/structured returned error as proof of
    // rejection. Investigation of the installed SDK found no returned error,
    // of any class or HTTP status, that proves an object was not created
    // (see media-storage.ts's uploadPhoto docblock) — a "clean" response can
    // be a 502/503/504 from a gateway with no knowledge of the origin's
    // outcome. There is no longer any input that produces "definite-failure"
    // from this function; only its caller's pre-network checks can.
    const outcome = classifyUploadAttempt("uid/hero/aaa.jpg", true, "That photo is over 5MB.");
    assert.equal(outcome.kind, "ambiguous");
    if (outcome.kind !== "ambiguous") throw new Error("unreachable");
    assert.equal(outcome.attemptedPath, "uid/hero/aaa.jpg", "the path must still be preserved");
    assert.equal(outcome.message, "That photo is over 5MB.", "a real message is still passed through when available");
  });

  test("a thrown network exception preserves the exact attempted path rather than losing it", () => {
    const outcome = classifyUploadAttempt(
      "uid/hero/aaa.jpg",
      true,
      "Couldn't upload your photo. Check your connection."
    );
    assert.deepEqual(outcome, {
      kind: "ambiguous",
      attemptedPath: "uid/hero/aaa.jpg",
      message: "Couldn't upload your photo. Check your connection.",
    });
  });
});

describe("decideAfterUploadFailure — cleanup list for a failed/thrown upload", () => {
  test("hero succeeds, profile upload fails: hero is queued for deletion", () => {
    const { deletePaths, result } = decideAfterUploadFailure(
      ["uid/hero/aaa.jpg"],
      "That photo is over 5MB. Try a smaller one."
    );
    assert.deepEqual(deletePaths, ["uid/hero/aaa.jpg"]);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.message, "That photo is over 5MB. Try a smaller one.");
  });

  test("hero succeeds, profile upload THROWS (ambiguous): hero's confirmed path is still queued for cleanup", () => {
    // Simulates profile-save.ts's handleSlotUpload sequence: hero's confirmed
    // path is already in attemptedPaths by the time profile's attempt fails,
    // whether that failure was a clean rejection or a thrown exception —
    // both funnel into the same attemptedPaths list before this is called.
    const attemptedPaths = ["uid/hero/aaa.jpg", "uid/profile/bbb.jpg"]; // bbb.jpg is the ambiguous attempt's preserved path
    const { deletePaths, result } = decideAfterUploadFailure(
      attemptedPaths,
      "Couldn't upload your photo. Check your connection."
    );
    assert.deepEqual(deletePaths, attemptedPaths, "both the confirmed and the ambiguous-attempt path must be queued");
    assert.equal(result.ok, false);
  });

  test("no prior upload this attempt: nothing queued for deletion", () => {
    const { deletePaths } = decideAfterUploadFailure([], "upload failed");
    assert.deepEqual(deletePaths, []);
  });
});

describe("describeInsertError + isDefiniteInsertFailure — classification", () => {
  test("23505 on the owner_user_id constraint is a definite failure, generic message, no field", () => {
    assert.equal(isDefiniteInsertFailure("23505"), true);
    const result = describeInsertError(
      "23505",
      'duplicate key value violates unique constraint "athlete_profiles_owner_user_id_key"'
    );
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.field, undefined);
    assert.match(result.message, /already have a profile/i);
  });

  test("23505 on the slug constraint is a definite failure, field: slug", () => {
    const result = describeInsertError(
      "23505",
      'duplicate key value violates unique constraint "athlete_profiles_slug_key"'
    );
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.field, "slug");
    assert.match(result.message, /already taken/i);
  });

  test("23514 (check constraint) and 42501 (RLS) are also definite failures", () => {
    assert.equal(isDefiniteInsertFailure("23514"), true);
    assert.equal(isDefiniteInsertFailure("42501"), true);
  });

  test("an unrecognized or missing code is NOT a definite failure — must be reconciled", () => {
    assert.equal(isDefiniteInsertFailure("57014"), false); // e.g. statement_timeout
    assert.equal(isDefiniteInsertFailure(undefined), false); // thrown exception, no code at all
  });
});

describe("decideAfterDefiniteFailure — both uploads succeed, then a definite insert failure", () => {
  const uploaded = ["uid/hero/aaa.jpg", "uid/profile/bbb.jpg"];

  test("duplicate-owner 23505: both uploads are queued for deletion", () => {
    const errorResult = describeInsertError(
      "23505",
      'duplicate key value violates unique constraint "athlete_profiles_owner_user_id_key"'
    );
    const { deletePaths, result } = decideAfterDefiniteFailure(uploaded, errorResult);
    assert.deepEqual(deletePaths, uploaded);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.field, undefined);
  });

  test("slug 23505: both uploads are queued for deletion, and the slug field is preserved", () => {
    const errorResult = describeInsertError(
      "23505",
      'duplicate key value violates unique constraint "athlete_profiles_slug_key"'
    );
    const { deletePaths, result } = decideAfterDefiniteFailure(uploaded, errorResult);
    assert.deepEqual(deletePaths, uploaded);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.field, "slug");
  });
});

describe("classifyCommittedRow — attempt identity requires actual UUID evidence", () => {
  test("matches when every uploaded slot equals the committed row's path", () => {
    const committed = { heroPhotoPath: "uid/hero/aaa.jpg", profilePhotoPath: "uid/profile/bbb.jpg" };
    const media = { heroPhotoPath: "uid/hero/aaa.jpg", profilePhotoPath: "uid/profile/bbb.jpg" };
    assert.equal(classifyCommittedRow(committed, media), "confirmed-ours");
  });

  test("a slot this attempt never uploaded to must be null on the committed row", () => {
    const committed = { heroPhotoPath: "uid/hero/aaa.jpg", profilePhotoPath: null };
    const media = { heroPhotoPath: "uid/hero/aaa.jpg" }; // profilePhotoPath omitted
    assert.equal(classifyCommittedRow(committed, media), "confirmed-ours");
  });

  test("a positive mismatch on the one uploaded slot is confirmed-not-ours", () => {
    const committed = { heroPhotoPath: "other-uid/hero/zzz.jpg", profilePhotoPath: null };
    const media = { heroPhotoPath: "uid/hero/aaa.jpg" };
    assert.equal(classifyCommittedRow(committed, media), "confirmed-not-ours");
  });

  test("Astra regression: no photos uploaded this attempt + a row with null/null media is INDETERMINATE, never a match", () => {
    // The exact case that must not recover as success: this attempt uploaded
    // no media at all, so there is no UUID evidence either way. A row that
    // happens to also have no photos proves nothing — it could be a
    // completely different write for the same owner.
    const committed = { heroPhotoPath: null, profilePhotoPath: null };
    const media = {}; // no hero, no profile uploaded this attempt
    assert.equal(
      classifyCommittedRow(committed, media),
      "indeterminate",
      "a row with null/null media must never be treated as proof of identity when nothing was uploaded"
    );
  });
});

describe("decideAfterAmbiguousInsert — reconciliation outcomes", () => {
  const uploaded = ["uid/hero/aaa.jpg", "uid/profile/bbb.jpg"];
  const media = { heroPhotoPath: "uid/hero/aaa.jpg", profilePhotoPath: "uid/profile/bbb.jpg" };

  test("found + matches this attempt: recover as success, delete nothing", () => {
    const reconciliation = {
      status: "found" as const,
      row: { slug: "jordan-b", heroPhotoPath: "uid/hero/aaa.jpg", profilePhotoPath: "uid/profile/bbb.jpg" },
    };
    const { deletePaths, result } = decideAfterAmbiguousInsert(reconciliation, uploaded, media);
    assert.deepEqual(deletePaths, [], "a row that references these uploads must never have them deleted");
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.slug, "jordan-b");
  });

  test("found + a different row (unrelated write for this owner): this attempt did not win, cleanup allowed", () => {
    const reconciliation = {
      status: "found" as const,
      row: { slug: "someone-else", heroPhotoPath: "other-uid/hero/zzz.jpg", profilePhotoPath: null },
    };
    const { deletePaths, result } = decideAfterAmbiguousInsert(reconciliation, uploaded, media);
    assert.deepEqual(deletePaths, uploaded);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.orphanPaths, undefined, "a definite cleanup attempt is not a reported orphan");
  });

  test("Astra regression: no photos + found row with a DIFFERENT slug and null/null media -> unresolved, NOT success, NOT auto-deleted", () => {
    const reconciliation = {
      status: "found" as const,
      row: { slug: "a-completely-different-slug", heroPhotoPath: null, profilePhotoPath: null },
    };
    const { deletePaths, result } = decideAfterAmbiguousInsert(reconciliation, [], {});
    assert.deepEqual(deletePaths, [], "must not delete when identity could not be established either way");
    assert.equal(result.ok, false, "must NOT recover as success on null/null evidence alone");
    if (result.ok) throw new Error("unreachable");
    assert.deepEqual(result.orphanPaths, [], "nothing was uploaded, so nothing is an orphan, but the field is still present");
  });

  test("not-visible (empty read): unresolved, not deleted, not treated as proof of absence", () => {
    const reconciliation = { status: "not-visible" as const };
    const { deletePaths, result } = decideAfterAmbiguousInsert(reconciliation, uploaded, media);
    assert.deepEqual(deletePaths, [], "an empty immediate read must never be treated as proof the write failed");
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.deepEqual(result.orphanPaths, uploaded, "the unresolved paths must be reported, not hidden");
    assert.match(result.message, /couldn't confirm whether your athlesite saved/i);
  });

  test("query-failed: unresolved, not deleted, reported the same way as not-visible", () => {
    const reconciliation = { status: "query-failed" as const };
    const { deletePaths, result } = decideAfterAmbiguousInsert(reconciliation, uploaded, media);
    assert.deepEqual(deletePaths, []);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.deepEqual(result.orphanPaths, uploaded);
  });
});

describe("unresolvedPathsToLog — diagnostics reach logging even when nothing is deleted", () => {
  test("an unresolved result (orphanPaths set, no deletion attempted) must surface for logging", () => {
    const reconciliation = { status: "not-visible" as const };
    const { deletePaths, result } = decideAfterAmbiguousInsert(
      reconciliation,
      ["uid/hero/aaa.jpg"],
      { heroPhotoPath: "uid/hero/aaa.jpg" }
    );
    assert.deepEqual(deletePaths, [], "precondition: no deletion was attempted for this scenario");
    const toLog = unresolvedPathsToLog(result);
    assert.deepEqual(toLog, ["uid/hero/aaa.jpg"], "the unresolved path must reach the logging decision");
  });

  test("a success result never has anything to log", () => {
    assert.equal(unresolvedPathsToLog({ ok: true, slug: "jordan-b" }), null);
  });

  test("a plain failure with no orphanPaths has nothing to log", () => {
    assert.equal(unresolvedPathsToLog({ ok: false, message: "That username is already taken." }), null);
  });

  test("an empty orphanPaths array is treated as nothing to log", () => {
    assert.equal(unresolvedPathsToLog({ ok: false, message: "x", orphanPaths: [] }), null);
  });
});

describe("normalizeDeletePaths — deduplication ahead of a deletion request", () => {
  test("duplicate requested paths are collapsed to one", () => {
    assert.deepEqual(
      normalizeDeletePaths(["uid/hero/aaa.jpg", "uid/hero/aaa.jpg", "uid/profile/bbb.jpg"]),
      ["uid/hero/aaa.jpg", "uid/profile/bbb.jpg"]
    );
  });

  test("empty strings are dropped", () => {
    assert.deepEqual(normalizeDeletePaths(["", "uid/hero/aaa.jpg", ""]), ["uid/hero/aaa.jpg"]);
  });

  test("order is preserved by first occurrence", () => {
    assert.deepEqual(normalizeDeletePaths(["b", "a", "b", "c", "a"]), ["b", "a", "c"]);
  });
});

describe("confirmDeletions — Storage's response is the only evidence trusted", () => {
  test("every requested path confirmed: ok:true", () => {
    const result = confirmDeletions(
      ["uid/hero/aaa.jpg", "uid/profile/bbb.jpg"],
      ["uid/hero/aaa.jpg", "uid/profile/bbb.jpg"]
    );
    assert.deepEqual(result, { ok: true });
  });

  test("empty deletion data: nothing is confirmed, every path reported failed", () => {
    const result = confirmDeletions(["uid/hero/aaa.jpg", "uid/profile/bbb.jpg"], []);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.deepEqual(result.failedPaths, ["uid/hero/aaa.jpg", "uid/profile/bbb.jpg"]);
  });

  test("partial deletion data: only the unconfirmed path is reported failed", () => {
    const result = confirmDeletions(
      ["uid/hero/aaa.jpg", "uid/profile/bbb.jpg"],
      ["uid/hero/aaa.jpg"] // profile's path missing from the response
    );
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.deepEqual(result.failedPaths, ["uid/profile/bbb.jpg"]);
  });

  test("a name present in the response that was never requested does not manufacture a false confirmation", () => {
    const result = confirmDeletions(["uid/hero/aaa.jpg"], ["some/unrelated/path.jpg"]);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.deepEqual(result.failedPaths, ["uid/hero/aaa.jpg"]);
  });
});

describe("mergeCleanupOutcome — folding a real deletion attempt's result into the returned diagnostic", () => {
  test("a failed cleanup is reported with the exact orphan paths, not silently treated as resolved", () => {
    const base: Parameters<typeof mergeCleanupOutcome>[0] = {
      ok: false,
      message: "Couldn't reach Athlesite. Check your connection and try again.",
    };
    const cleanup: Parameters<typeof mergeCleanupOutcome>[1] = {
      ok: false,
      failedPaths: ["uid/hero/aaa.jpg"],
      message: "Storage did not confirm all of the requested objects were removed.",
    };
    const merged = mergeCleanupOutcome(base, cleanup);
    assert.equal(merged.ok, false);
    if (merged.ok) throw new Error("unreachable");
    assert.deepEqual(merged.orphanPaths, ["uid/hero/aaa.jpg"]);
    // The athlete-facing message is untouched — orphanPaths is diagnostic only.
    assert.equal(merged.message, base.message);
  });

  test("a successful cleanup reports no orphan paths", () => {
    const base: Parameters<typeof mergeCleanupOutcome>[0] = { ok: false, message: "some failure" };
    const merged = mergeCleanupOutcome(base, { ok: true });
    assert.equal(merged.ok, false);
    if (merged.ok) throw new Error("unreachable");
    assert.equal(merged.orphanPaths, undefined);
  });

  test("an ok:true result is never contaminated with cleanup diagnostics", () => {
    const merged = mergeCleanupOutcome(
      { ok: true, slug: "jordan-b" },
      { ok: false, failedPaths: ["should-not-appear"], message: "irrelevant" }
    );
    assert.deepEqual(merged, { ok: true, slug: "jordan-b" });
  });
});
