import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isEditable,
  afterSaveStarted,
  afterSaveSettled,
  afterFreshRecordArrived,
  saveButtonLabel,
  type EditProfileSaveState,
} from "./save-state.ts";

/**
 * Regression for Codex's P2 #1/#2: a second Save must be impossible from
 * the moment a media-touching save begins until the fresh, server-confirmed
 * record actually arrives — not merely until updateProfile's promise
 * resolves (router.refresh() returns void; it schedules a round trip, it
 * does not wait for one).
 *
 * This is a plain, dependency-free module — no React, no DOM, no Next.js —
 * so it runs under Node's own TypeScript support with no loader hook, the
 * same way profile-save-decisions.test.ts and profile-update-decisions.test.ts
 * do. There is no component-test framework in this project; this is the
 * closest equivalent, and it verifies the exact transition rules
 * EditProfileForm wires directly into its own state, not a description of
 * them.
 *
 * Run directly: node --test src/components/edit-profile/save-state.test.ts
 */

describe("isEditable — Save and the media controls are gated on being idle", () => {
  test("idle is editable", () => {
    assert.equal(isEditable("idle"), true);
  });

  test("saving is not editable", () => {
    assert.equal(isEditable("saving"), false);
  });

  test("awaiting-refresh is not editable", () => {
    assert.equal(isEditable("awaiting-refresh"), false);
  });
});

describe("afterSaveStarted", () => {
  test("always moves to saving", () => {
    assert.equal(afterSaveStarted(), "saving");
  });
});

describe("afterSaveSettled", () => {
  test("a failed save returns to idle immediately — nothing committed", () => {
    assert.equal(afterSaveSettled({ ok: false }), "idle");
  });

  test("a successful save that touched no media returns to idle immediately", () => {
    assert.equal(afterSaveSettled({ ok: true, mediaTouched: false }), "idle");
  });

  test("a successful save that touched media moves to awaiting-refresh, not idle", () => {
    assert.equal(afterSaveSettled({ ok: true, mediaTouched: true }), "awaiting-refresh");
  });
});

describe("afterFreshRecordArrived", () => {
  test("always moves to idle", () => {
    assert.equal(afterFreshRecordArrived(), "idle");
  });
});

describe("the full replacement A -> B sequence: a second Save is impossible before the fresh record arrives", () => {
  test("idle -> saving -> awaiting-refresh (not editable) -> idle (editable) only after the fresh record lands", () => {
    let state: EditProfileSaveState = "idle";
    assert.equal(isEditable(state), true, "starts editable");

    // Athlete clicks Save on a replacement (A -> B).
    state = afterSaveStarted();
    assert.equal(state, "saving");
    assert.equal(isEditable(state), false, "a second Save must be impossible while the write is in flight");

    // updateProfile resolves ok:true; the DB commit for B is real, but this
    // component's own currentMedia/signed URLs are still the pre-save (A)
    // baseline — router.refresh() has been called but has not delivered
    // anything yet.
    state = afterSaveSettled({ ok: true, mediaTouched: true });
    assert.equal(state, "awaiting-refresh");
    assert.equal(
      isEditable(state),
      false,
      "a second Save must remain impossible after commit while currentMedia still refers to the pre-save (A) baseline — " +
        "submitting it here would target A again for cleanup and orphan B"
    );

    // Only once the refreshed record actually arrives (record.updatedAt
    // changes) does the form become editable again.
    state = afterFreshRecordArrived();
    assert.equal(state, "idle");
    assert.equal(isEditable(state), true, "editable again now that the fresh baseline has genuinely landed");
  });

  test("a save that never touches media never enters the locked awaiting-refresh phase at all", () => {
    let state: EditProfileSaveState = "idle";
    state = afterSaveStarted();
    state = afterSaveSettled({ ok: true, mediaTouched: false });
    assert.equal(state, "idle");
    assert.equal(isEditable(state), true);
  });

  test("a failed save (e.g. a slug collision) releases the lock immediately, without waiting for any refresh", () => {
    let state: EditProfileSaveState = "idle";
    state = afterSaveStarted();
    state = afterSaveSettled({ ok: false });
    assert.equal(state, "idle");
    assert.equal(isEditable(state), true);
  });
});

describe("saveButtonLabel — the athlete always sees that something is still happening", () => {
  test("idle reads as the normal call to action", () => {
    assert.equal(saveButtonLabel("idle"), "Save changes");
  });

  test("saving and awaiting-refresh both read as distinct in-progress states, never the idle label", () => {
    const saving = saveButtonLabel("saving");
    const awaitingRefresh = saveButtonLabel("awaiting-refresh");
    assert.notEqual(saving, "Save changes");
    assert.notEqual(awaitingRefresh, "Save changes");
    assert.notEqual(
      saving,
      awaitingRefresh,
      "the two in-progress phases should read differently so the form never appears to hang unchanged"
    );
  });
});
