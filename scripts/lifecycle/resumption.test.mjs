import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REFUSAL, bindOperation, validateBinding } from "./binding.mjs";
import {
  KEY_STATE,
  canTransition,
  createInventory,
  invalidateDownstream,
  reconcileMediaState,
  reconcileProfileState,
} from "./checkpoints.mjs";
import { persistInventory, loadInventory, newOperationId } from "./store.mjs";
import { enumerateOwnerNamespace } from "./enumerate.mjs";

/**
 * End-to-end resumption scenarios, driven through the pure helpers with fake scans.
 *
 * These are the situations that actually occur in a half-finished deletion: a batch that
 * partly applied, a response that never arrived, a second run, and an athlete who kept
 * editing. The property under test throughout is that the workflow only ever advances on
 * *proven* facts, and rolls backward when facts regress.
 */

const UID = "11111111-1111-4111-8111-111111111111";
const UID2 = "22222222-2222-4222-8222-222222222222";
const ENV = "abcdef0123456789";

const dirs = [];
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), "athlesite-resume-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) {
    try {
      rmSync(dirs.pop(), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

const AT = "2026-09-30T00:00:00.000Z";
const CHECKPOINT_ORDER = [
  "bound",
  "inventory-ready",
  "media-absent",
  "profile-absent",
  "auth-deletion-recorded",
  "verified-complete",
];

/**
 * A schema-valid inventory parked at `checkpoint`.
 *
 * The strict schema requires recorded evidence for every checkpoint reached and confirmations for
 * anything at or past inventory-ready, so a fixture has to carry them too — otherwise the test is
 * exercising a corrupt inventory rather than the resume path it claims to.
 */
function inventoryWith(keys, checkpoint = "inventory-ready") {
  const { binding } = bindOperation({
    environment: ENV,
    uid: UID,
    profileRowId: null,
    operationId: newOperationId(),
  });
  const inv = createInventory({ binding, now: () => AT });
  const upto = CHECKPOINT_ORDER.indexOf(checkpoint);
  inv.checkpoint = checkpoint;
  inv.enumerationComplete = true;
  for (const k of keys) inv.keyStates[k] = KEY_STATE.PENDING;
  if (upto >= 1) {
    inv.operatorConfirmations = { runId: "run-fixturerun001", quietWindowConfirmedAt: AT, phraseConfirmedAt: AT };
    inv.evidence.push({ checkpoint: "inventory-ready", at: AT, objects: keys.length });
  }
  if (upto >= 2) {
    for (const k of Object.keys(inv.keyStates)) inv.keyStates[k] = KEY_STATE.VERIFIED_ABSENT;
    inv.evidence.push({ checkpoint: "media-absent", at: AT });
  }
  if (upto >= 3) inv.evidence.push({ checkpoint: "profile-absent", at: AT });
  return inv;
}

/** A fake backend from a flat key list, mirroring Storage's folder derivation. */
function backend(keys) {
  const children = new Map();
  for (const key of keys) {
    const parts = key.split("/");
    for (let i = 1; i < parts.length; i += 1) {
      const prefix = parts.slice(0, i).join("/");
      if (!children.has(prefix)) children.set(prefix, new Map());
      children.get(prefix).set(parts[i], { folder: i < parts.length - 1 });
    }
  }
  return async (prefix, { limit, offset }) => {
    const bucket = children.get(prefix);
    const entries = bucket ? [...bucket.entries()].sort(([a], [b]) => (a < b ? -1 : 1)) : [];
    return entries.slice(offset, offset + limit).map(([name, m]) =>
      m.folder ? { name, id: null, metadata: null } : { name, id: `id-${name}`, metadata: { size: 1 } }
    );
  };
}

describe("interrupted media deletion", () => {
  test("partial batch: the remainder is listed for retry and absence is not claimed", async () => {
    const all = [`${UID}/hero/a.png`, `${UID}/hero/b.png`, `${UID}/profile/c.png`];
    const inv = inventoryWith(all);

    // Two of three actually went away.
    const scan = await enumerateOwnerNamespace({ list: backend([`${UID}/profile/c.png`]), rootPrefix: UID });
    const r = reconcileMediaState(inv, scan);

    assert.deepEqual(r.remaining, [`${UID}/profile/c.png`]);
    assert.equal(r.keyStates[`${UID}/hero/a.png`], KEY_STATE.VERIFIED_ABSENT);
    assert.equal(r.provenAbsent, false);

    const t = canTransition("inventory-ready", "media-absent", {
      bindingValid: true,
      freshScanComplete: scan.complete,
      freshScanEmpty: scan.keys.length === 0,
      unresolvedKeyStates: r.unresolvedCount,
    });
    assert.equal(t.ok, false, "must not advance while an object remains");
  });

  test("lost delete response: pending-verification is reconciled by a fresh scan, not assumed", async () => {
    const inv = inventoryWith([`${UID}/hero/a.png`]);
    // The delete call's outcome was never observed.
    inv.keyStates[`${UID}/hero/a.png`] = KEY_STATE.PENDING_VERIFICATION;

    const gone = await enumerateOwnerNamespace({ list: backend([]), rootPrefix: UID });
    const proven = reconcileMediaState(inv, gone);
    assert.equal(proven.keyStates[`${UID}/hero/a.png`], KEY_STATE.VERIFIED_ABSENT);
    assert.equal(proven.provenAbsent, true);

    // Same starting state, but the object is actually still there.
    const still = await enumerateOwnerNamespace({ list: backend([`${UID}/hero/a.png`]), rootPrefix: UID });
    const notProven = reconcileMediaState(inv, still);
    assert.equal(notProven.provenAbsent, false);
  });

  test("an unreadable scan after deletion leaves keys unknown and blocks advancement", async () => {
    const inv = inventoryWith([`${UID}/hero/a.png`]);
    const broken = await enumerateOwnerNamespace({
      list: async () => {
        throw new Error("denied");
      },
      rootPrefix: UID,
    });
    const r = reconcileMediaState(inv, broken);
    assert.equal(r.keyStates[`${UID}/hero/a.png`], KEY_STATE.UNKNOWN);
    assert.equal(r.provenAbsent, false);
    assert.ok(r.unresolvedCount > 0);
  });
});

describe("profile deletion outcomes", () => {
  test("ambiguous delete response resolves by bound uid, not slug", () => {
    // The delete call's response was lost; the row is in fact gone.
    const r = reconcileProfileState({ readOk: true, rowPresent: false, boundUid: UID });
    assert.equal(r.state, "absent");
  });

  test("a row at the same slug owned by another uid is foreign and untouchable", () => {
    const r = reconcileProfileState({
      readOk: true,
      rowPresent: true,
      rowId: "x",
      boundUid: UID,
      observedOwnerUid: UID2,
    });
    assert.equal(r.state, "foreign");
    assert.equal(r.refusal, REFUSAL.UID_MISMATCH);
  });

  test("resume after profile deletion: owner Storage cleanup is still permitted", async () => {
    const profile = reconcileProfileState({ readOk: true, rowPresent: false, boundUid: UID });
    assert.equal(profile.state, "absent");

    // Media reappeared/remained; the Auth user still exists, so the owner can still delete it.
    const scan = await enumerateOwnerNamespace({ list: backend([`${UID}/hero/leftover.png`]), rootPrefix: UID });
    const t = canTransition("media-absent", "profile-absent", {
      bindingValid: true,
      freshAuthValidated: true,
      profileConfirmedAbsent: true,
      freshScanComplete: scan.complete,
      freshScanEmpty: scan.keys.length === 0,
      unresolvedKeyStates: 0,
    });
    assert.equal(t.ok, false);
    assert.equal(t.refusal, REFUSAL.CONCURRENT_ACTIVITY, "leftover media must block, not be ignored");
  });
});

describe("post-Auth-deletion state is verification-only", () => {
  test("a rejected sign-in cannot be read as proof of deletion", () => {
    // After Auth deletion the athlete cannot authenticate, so no owner-scoped read is possible.
    // That is exactly why the final scan must happen BEFORE the Auth step.
    const v = validateBinding(
      { environment: ENV, uid: UID, profileRowId: null, operationId: "op-x-00000000" },
      { authValidated: false, environment: ENV, uid: UID, profileRowId: null }
    );
    assert.equal(v.ok, false);
    assert.equal(v.refusal, REFUSAL.AUTH_VALIDATION_FAILED);
  });

  test("verified-complete still requires the residual-token caveat to be addressed", () => {
    const t = canTransition("auth-deletion-recorded", "verified-complete", {
      bindingValid: true,
      finalProfileAbsent: true,
      finalMediaScanClean: true,
      residualTokenCaveatAddressed: false,
    });
    assert.equal(t.ok, false);
  });
});

describe("double execution", () => {
  test("a second run reconciles from the persisted operation and does not restart", () => {
    const dir = tempDir();
    const inv = inventoryWith([`${UID}/hero/a.png`], "media-absent");
    assert.equal(persistInventory(inv, { dir }).ok, true);

    const reloaded = loadInventory(inv.operationId, { dir });
    assert.equal(reloaded.ok, true);
    assert.equal(reloaded.inventory.checkpoint, "media-absent");
    assert.equal(reloaded.inventory.uid, UID, "the bound uid survives a restart");
  });

  test("a resumed operation still cannot skip fresh proof", () => {
    // Checkpoint says media-absent, but the next transition still demands fresh evidence.
    const t = canTransition("media-absent", "profile-absent", { bindingValid: true });
    assert.equal(t.ok, false, "a stored checkpoint is not a substitute for fresh preconditions");
  });
});

describe("concurrent activity invalidates downstream checkpoints", () => {
  test("unexpected new media rolls the checkpoint backward and un-proves absence", async () => {
    let inv = inventoryWith([`${UID}/hero/a.png`], "media-absent");
    inv.keyStates[`${UID}/hero/a.png`] = KEY_STATE.VERIFIED_ABSENT;

    const scan = await enumerateOwnerNamespace({ list: backend([`${UID}/hero/UPLOADED-MID-RUN.png`]), rootPrefix: UID });
    const r = reconcileMediaState(inv, scan);
    assert.deepEqual(r.unexpected, [`${UID}/hero/UPLOADED-MID-RUN.png`]);

    inv = invalidateDownstream(inv, "bound", "new media appeared during deletion");
    assert.equal(inv.checkpoint, "bound");
    assert.equal(inv.keyStates[`${UID}/hero/a.png`], KEY_STATE.UNKNOWN);
    assert.equal(inv.invalidations.length, 1);
  });

  test("unexpected profile activity is caught by binding re-validation", () => {
    // Bound with no row (already deleted), then a row appears: someone re-created/re-saved.
    const v = validateBinding(
      { environment: ENV, uid: UID, profileRowId: null, operationId: "op-y-00000000" },
      { authValidated: true, environment: ENV, uid: UID, profileRowId: "99999999-9999-4999-8999-999999999999" }
    );
    assert.equal(v.ok, false);
    assert.equal(v.refusal, REFUSAL.CONCURRENT_ACTIVITY);
  });

  test("invalidation is recorded with a reason for the audit trail", () => {
    const inv = invalidateDownstream(
      { checkpoint: "profile-absent", keyStates: {}, invalidations: [] },
      "inventory-ready",
      "republished mid-operation"
    );
    assert.match(inv.invalidations[0].reason, /republished/);
    assert.ok(inv.invalidations[0].at);
  });
});

describe("inventory is persisted before anything destructive", () => {
  test("a failed persist blocks the inventory-ready transition", () => {
    const t = canTransition("bound", "inventory-ready", {
      bindingValid: true,
      profileUnpublishedOrAbsent: true,
      enumerationComplete: true,
      inventoryPersisted: false,
    });
    assert.equal(t.ok, false, "no deletion may begin unless the inventory is durably stored");
  });

  test("persistence is confirmed by read-back, not by the write call returning", () => {
    const dir = tempDir();
    const inv = inventoryWith([`${UID}/hero/a.png`]);
    const w = persistInventory(inv, { dir });
    assert.equal(w.ok, true);
    const back = loadInventory(inv.operationId, { dir });
    assert.equal(back.ok, true);
    assert.deepEqual(Object.keys(back.inventory.keyStates), [`${UID}/hero/a.png`]);
  });
});
