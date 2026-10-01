import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { REFUSAL, bindOperation } from "./binding.mjs";
import {
  CHECKPOINTS,
  KEY_STATE,
  INVENTORY_FORMAT_VERSION,
  canTransition,
  invalidateDownstream,
  reconcileMediaState,
  reconcileProfileState,
  validateInventory,
  createInventory,
  residualTokenOutcomeSatisfied,
  mergeResidualOutcome,
  hasUnresolvedProbe,
} from "./checkpoints.mjs";

const UID = "11111111-1111-4111-8111-111111111111";
const UID2 = "22222222-2222-4222-8222-222222222222";
const ENV = "abcdef0123456789";
const OP = "op-abcdef123456";
const { binding } = bindOperation({ environment: ENV, uid: UID, profileRowId: null, operationId: OP });

describe("checkpoint ordering", () => {
  test("the six checkpoints are in the locked order", () => {
    assert.deepEqual(CHECKPOINTS, [
      "bound",
      "inventory-ready",
      "media-absent",
      "profile-absent",
      "auth-deletion-recorded",
      "verified-complete",
    ]);
  });

  test("checkpoints cannot be skipped", () => {
    const r = canTransition("bound", "media-absent", { bindingValid: true });
    assert.equal(r.ok, false);
    assert.match(r.detail, /skip/);
  });

  test("backward transitions are not allowed via canTransition", () => {
    const r = canTransition("media-absent", "inventory-ready", { bindingValid: true });
    assert.equal(r.ok, false);
    assert.match(r.detail, /forward/);
  });

  test("AUTH-FIRST IS FORBIDDEN: cannot reach auth-deletion-recorded before media/profile", () => {
    // The single most dangerous ordering error: deleting the Auth user early strands media
    // permanently, because the owner can no longer authorize its deletion.
    for (const from of ["bound", "inventory-ready", "media-absent"]) {
      const r = canTransition(from, "auth-deletion-recorded", {
        bindingValid: true,
        founderConfirmedUid: UID,
        boundUid: UID,
        manualAcknowledgement: true,
        ownerProofRecorded: true,
      });
      assert.equal(r.ok, false, `auth deletion must be unreachable from ${from}`);
    }
    // Only legal immediately after profile-absent.
    const ok = canTransition("profile-absent", "auth-deletion-recorded", {
      bindingValid: true,
      founderConfirmedUid: UID,
      boundUid: UID,
      manualAcknowledgement: true,
      ownerProofRecorded: true,
    });
    assert.equal(ok.ok, true);
  });

  test("every transition requires a re-validated binding", () => {
    const r = canTransition("bound", "inventory-ready", {
      bindingValid: false,
      profileUnpublishedOrAbsent: true,
      enumerationComplete: true,
      inventoryPersisted: true,
    });
    assert.equal(r.refusal, REFUSAL.AUTH_VALIDATION_FAILED);
  });
});

describe("inventory-ready requires persistence before anything destructive", () => {
  const base = {
    bindingValid: true,
    freshAuthValidated: true,
    profileUnpublishedOrAbsent: true,
    publicState: "absent",
    enumerationComplete: true,
    operatorConfirmationsRecorded: true,
    inventoryPersisted: true,
  };

  test("accepts when unpublished, enumeration complete, inventory persisted", () => {
    assert.equal(canTransition("bound", "inventory-ready", base).ok, true);
  });

  test("REFUSES if the inventory was not durably persisted first", () => {
    const r = canTransition("bound", "inventory-ready", { ...base, inventoryPersisted: false });
    assert.equal(r.ok, false);
    assert.match(r.detail, /persisted/);
  });

  test("refuses on incomplete enumeration", () => {
    const r = canTransition("bound", "inventory-ready", { ...base, enumerationComplete: false });
    assert.equal(r.refusal, REFUSAL.ENUMERATION_INCOMPLETE);
  });

  test("refuses if the profile is still published", () => {
    const r = canTransition("bound", "inventory-ready", { ...base, profileUnpublishedOrAbsent: false });
    assert.equal(r.ok, false);
  });
});

describe("media-absent requires proven absence, not delete acknowledgements", () => {
  test("refuses without a fresh complete scan", () => {
    const r = canTransition("inventory-ready", "media-absent", {
      bindingValid: true,
      freshAuthValidated: true,
      freshScanComplete: false,
      freshScanEmpty: true,
      unresolvedKeyStates: 0,
    });
    assert.equal(r.refusal, REFUSAL.ENUMERATION_INCOMPLETE);
  });

  test("refuses when the fresh scan is not empty", () => {
    const r = canTransition("inventory-ready", "media-absent", {
      bindingValid: true,
      freshAuthValidated: true,
      freshScanComplete: true,
      freshScanEmpty: false,
      unresolvedKeyStates: 0,
    });
    assert.equal(r.refusal, REFUSAL.ABSENCE_UNPROVEN);
  });

  test("refuses while any key state is unresolved", () => {
    const r = canTransition("inventory-ready", "media-absent", {
      bindingValid: true,
      freshAuthValidated: true,
      freshScanComplete: true,
      freshScanEmpty: true,
      unresolvedKeyStates: 2,
    });
    assert.equal(r.refusal, REFUSAL.ABSENCE_UNPROVEN);
  });

  test("accepts only with a complete, empty scan and zero unresolved states", () => {
    const r = canTransition("inventory-ready", "media-absent", {
      bindingValid: true,
      freshAuthValidated: true,
      freshScanComplete: true,
      freshScanEmpty: true,
      unresolvedKeyStates: 0,
    });
    assert.equal(r.ok, true);
  });
});

/** The minimum evidence set that legitimately completes an operation. */
function completeEvidence() {
  return {
    bindingValid: true,
    ownerProofRecorded: true,
    authDeletionRecorded: true,
    publicState: "absent",
    residualTokenOutcomeSatisfied: true,
    adminCrossCheckAttested: true,
  };
}

describe("profile-absent and verified-complete", () => {
  test("profile-absent requires a still-empty fresh media scan", () => {
    const r = canTransition("media-absent", "profile-absent", {
      bindingValid: true,
      freshAuthValidated: true,
      profileConfirmedAbsent: true,
      freshScanComplete: true,
      freshScanEmpty: false,
      unresolvedKeyStates: 0,
    });
    assert.equal(r.refusal, REFUSAL.CONCURRENT_ACTIVITY);
  });

  test("auth-deletion-recorded refuses when the founder confirms a DIFFERENT uid", () => {
    const r = canTransition("profile-absent", "auth-deletion-recorded", {
      bindingValid: true,
      founderConfirmedUid: UID2,
      boundUid: UID,
      ownerProofRecorded: true,
      manualAcknowledgement: true,
    });
    assert.equal(r.refusal, REFUSAL.UID_MISMATCH);
  });

  test("auth-deletion-recorded refuses without explicit manual acknowledgement", () => {
    const r = canTransition("profile-absent", "auth-deletion-recorded", {
      bindingValid: true,
      founderConfirmedUid: UID,
      boundUid: UID,
      ownerProofRecorded: true,
      manualAcknowledgement: false,
    });
    assert.equal(r.ok, false);
  });

  test("verified-complete IGNORES caller-asserted absence booleans", () => {
    // The old contract accepted `finalProfileAbsent: true` / `finalMediaScanClean: true` as claims.
    // They are not evidence of anything, so passing them must change nothing.
    const r = canTransition("auth-deletion-recorded", "verified-complete", {
      bindingValid: true,
      finalProfileAbsent: true,
      finalMediaScanClean: true,
      residualTokenCaveatAddressed: true,
    });
    assert.equal(r.ok, false, "asserted booleans must not be able to complete an operation");
    assert.equal(r.refusal, REFUSAL.ABSENCE_UNPROVEN);
  });

  test("verified-complete requires the recorded owner-authorised proof", () => {
    const r = canTransition("auth-deletion-recorded", "verified-complete", {
      ...completeEvidence(),
      ownerProofRecorded: false,
    });
    assert.equal(r.refusal, REFUSAL.ABSENCE_UNPROVEN);
    assert.match(r.detail, /owner-authorised/);
  });

  test("verified-complete requires the recorded Auth deletion", () => {
    const r = canTransition("auth-deletion-recorded", "verified-complete", {
      ...completeEvidence(),
      authDeletionRecorded: false,
    });
    assert.equal(r.ok, false);
    assert.match(r.detail, /Auth deletion not recorded/);
  });

  test("verified-complete refuses a fresh EXPOSED or UNKNOWN public state", () => {
    const exposed = canTransition("auth-deletion-recorded", "verified-complete", {
      ...completeEvidence(),
      publicState: "exposed",
    });
    assert.equal(exposed.refusal, REFUSAL.STILL_PUBLIC);
    const unknown = canTransition("auth-deletion-recorded", "verified-complete", {
      ...completeEvidence(),
      publicState: "unknown",
    });
    assert.equal(unknown.refusal, REFUSAL.PUBLIC_STATE_UNKNOWN);
    const unreported = canTransition("auth-deletion-recorded", "verified-complete", {
      ...completeEvidence(),
      publicState: undefined,
    });
    assert.equal(unreported.refusal, REFUSAL.PUBLIC_STATE_UNKNOWN);
  });

  test("verified-complete requires a satisfied residual-token OUTCOME", () => {
    const r = canTransition("auth-deletion-recorded", "verified-complete", {
      ...completeEvidence(),
      residualTokenOutcomeSatisfied: false,
      residualTokenDetail: "nothing recorded",
    });
    assert.equal(r.refusal, REFUSAL.ABSENCE_UNPROVEN);
    assert.match(r.detail, /nothing recorded/);
  });

  test("verified-complete requires the founder attestation of the admin cross-check", () => {
    const r = canTransition("auth-deletion-recorded", "verified-complete", {
      ...completeEvidence(),
      adminCrossCheckAttested: false,
    });
    assert.equal(r.refusal, REFUSAL.ABSENCE_UNPROVEN);
    assert.match(r.detail, /attestation/);
  });

  test("verified-complete accepts only the full evidence set", () => {
    assert.equal(canTransition("auth-deletion-recorded", "verified-complete", completeEvidence()).ok, true);
  });
});

describe("reconcileMediaState", () => {
  const inv = { keyStates: { [`${UID}/hero/a.png`]: KEY_STATE.PENDING, [`${UID}/profile/b.png`]: KEY_STATE.PENDING } };

  test("a complete scan that omits a key proves it absent", () => {
    const r = reconcileMediaState(inv, { complete: true, keys: [`${UID}/hero/a.png`] });
    assert.equal(r.keyStates[`${UID}/profile/b.png`], KEY_STATE.VERIFIED_ABSENT);
    assert.deepEqual(r.remaining, [`${UID}/hero/a.png`]);
    assert.equal(r.provenAbsent, false);
  });

  test("ALREADY-ABSENT counts only after a complete scan", () => {
    const incomplete = reconcileMediaState(inv, { complete: false, keys: [] });
    assert.equal(incomplete.keyStates[`${UID}/hero/a.png`], KEY_STATE.UNKNOWN);
    assert.equal(incomplete.provenAbsent, false, "an incomplete scan must never prove absence");

    const complete = reconcileMediaState(inv, { complete: true, keys: [] });
    assert.equal(complete.keyStates[`${UID}/hero/a.png`], KEY_STATE.VERIFIED_ABSENT);
    assert.equal(complete.provenAbsent, true);
  });

  test("unexpected new media is surfaced and blocks absence", () => {
    const r = reconcileMediaState(inv, { complete: true, keys: [`${UID}/hero/NEW.png`] });
    assert.deepEqual(r.unexpected, [`${UID}/hero/NEW.png`]);
    assert.equal(r.provenAbsent, false);
  });

  test("partial deletion leaves the remainder listed for retry", () => {
    const r = reconcileMediaState(inv, { complete: true, keys: [`${UID}/profile/b.png`] });
    assert.deepEqual(r.remaining, [`${UID}/profile/b.png`]);
  });
});

describe("invalidateDownstream", () => {
  test("rolls the checkpoint back and un-proves absent keys", () => {
    const inv = {
      checkpoint: "profile-absent",
      keyStates: { [`${UID}/hero/a.png`]: KEY_STATE.VERIFIED_ABSENT },
      invalidations: [],
    };
    const out = invalidateDownstream(inv, "inventory-ready", "media reappeared");
    assert.equal(out.checkpoint, "inventory-ready");
    assert.equal(out.keyStates[`${UID}/hero/a.png`], KEY_STATE.UNKNOWN, "previously-proven absence must be re-proven");
    assert.equal(out.invalidations.length, 1);
    assert.match(out.invalidations[0].reason, /reappeared/);
  });

  test("never moves forward", () => {
    const inv = { checkpoint: "bound", keyStates: {}, invalidations: [] };
    const out = invalidateDownstream(inv, "verified-complete", "nope");
    assert.equal(out.checkpoint, "bound");
  });
});

describe("reconcileProfileState", () => {
  test("an unreadable profile is unknown, never absent", () => {
    const r = reconcileProfileState({ readOk: false, boundUid: UID });
    assert.equal(r.state, "unknown");
    assert.equal(r.refusal, REFUSAL.ABSENCE_UNPROVEN);
  });

  test("a lost delete response reconciles to absent when the row is genuinely gone", () => {
    const r = reconcileProfileState({ readOk: true, rowPresent: false, boundUid: UID });
    assert.equal(r.state, "absent");
  });

  test("a row owned by a different uid is foreign and must not be touched", () => {
    const r = reconcileProfileState({ readOk: true, rowPresent: true, boundUid: UID, observedOwnerUid: UID2 });
    assert.equal(r.state, "foreign");
    assert.equal(r.refusal, REFUSAL.UID_MISMATCH);
  });

  test("a present row owned by the bound uid is present", () => {
    const r = reconcileProfileState({ readOk: true, rowPresent: true, rowId: "x", boundUid: UID, observedOwnerUid: UID });
    assert.equal(r.state, "present");
  });
});

describe("validateInventory", () => {
  const good = () => createInventory({ binding });

  test("a freshly created inventory is valid and starts at bound", () => {
    const inv = good();
    assert.deepEqual(validateInventory(inv), { ok: true });
    assert.equal(inv.checkpoint, "bound");
    assert.equal(inv.formatVersion, INVENTORY_FORMAT_VERSION);
  });

  test("refuses a non-object or wrong format version", () => {
    assert.equal(validateInventory(null).refusal, REFUSAL.INVENTORY_CORRUPT);
    assert.equal(validateInventory([]).refusal, REFUSAL.INVENTORY_CORRUPT);
    const inv = { ...good(), formatVersion: 999 };
    assert.equal(validateInventory(inv).ok, false);
  });

  test("refuses a corrupt checkpoint or key state", () => {
    assert.equal(validateInventory({ ...good(), checkpoint: "made-up" }).ok, false);
    assert.equal(validateInventory({ ...good(), keyStates: { "a/b": "bogus" } }).ok, false);
  });

  test("refuses a missing profileRowId field even when null is legitimate", () => {
    const inv = good();
    delete inv.profileRowId;
    const r = validateInventory(inv);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => /profileRowId/.test(p)));
  });

  test("REFUSES any inventory carrying credential material", () => {
    for (const field of ["accessToken", "refreshToken", "apiKey", "otp", "password", "signedUrl"]) {
      const inv = { ...good(), [field]: "whatever" };
      const r = validateInventory(inv);
      assert.equal(r.ok, false, `expected refusal for ${field}`);
      assert.ok(r.problems.some((p) => p.includes(field)));
    }
  });

  test("a created inventory contains no credential fields", () => {
    const inv = good();
    for (const field of ["accessToken", "refreshToken", "apiKey", "anonKey", "otp", "password", "signedUrl"]) {
      assert.equal(field in inv, false, `${field} must never be written`);
    }
  });
});

describe("the strict inventory schema (MED 8)", () => {
  const good = () => createInventory({ binding });

  /** An inventory parked at a later checkpoint, as a resumed run would load it. */
  function atMediaAbsent() {
    const inv = good();
    inv.checkpoint = "media-absent";
    inv.enumerationComplete = true;
    inv.operatorConfirmations = {
      runId: "run-abcdefgh1234",
      quietWindowConfirmedAt: "2026-09-30T00:00:00.000Z",
      phraseConfirmedAt: "2026-09-30T00:00:01.000Z",
    };
    inv.keyStates = { [`${UID}/hero/a.png`]: KEY_STATE.VERIFIED_ABSENT };
    inv.evidence = [
      { checkpoint: "bound", at: "2026-09-30T00:00:00.000Z" },
      { checkpoint: "inventory-ready", at: "2026-09-30T00:00:02.000Z", objects: 1 },
      { checkpoint: "media-absent", at: "2026-09-30T00:00:03.000Z" },
    ];
    return inv;
  }

  test("a valid later-checkpoint inventory is accepted, so the negatives below mean something", () => {
    assert.deepEqual(validateInventory(atMediaAbsent()), { ok: true });
  });

  test("a FOREIGN key is refused at media-absent, not only when entering the media phase", () => {
    // The original gap: path ownership was checked on the way into media deletion, so an inventory
    // already past that point could carry a foreign key unchallenged.
    const inv = atMediaAbsent();
    inv.keyStates[`${UID2}/hero/victim.png`] = KEY_STATE.VERIFIED_ABSENT;
    const r = validateInventory(inv);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => /outside the owner namespace/.test(p)));
  });

  test("a prefix-sharing sibling namespace is also refused", () => {
    const inv = atMediaAbsent();
    inv.keyStates[`${UID}2/hero/other.png`] = KEY_STATE.VERIFIED_ABSENT;
    assert.equal(validateInventory(inv).ok, false);
  });

  test("an unknown top-level field is refused", () => {
    const inv = { ...good(), notes: "harmless looking" };
    const r = validateInventory(inv);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => /notes is not an allowed field/.test(p)));
  });

  test("a nested RAW PROFILE BODY has nowhere to live", () => {
    const inv = good();
    inv.evidence.push({
      checkpoint: "bound",
      at: "2026-09-30T00:00:00.000Z",
      profile: { first_name: "A", last_name: "B", bio: "a whole profile body" },
    });
    const r = validateInventory(inv);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => /profile is not an allowed field/.test(p)));
  });

  test("a nested API RESPONSE DUMP is refused", () => {
    const inv = good();
    inv.evidence.push({
      checkpoint: "bound",
      at: "2026-09-30T00:00:00.000Z",
      response: { status: 200, headers: {}, body: "..." },
    });
    assert.equal(validateInventory(inv).ok, false);
  });

  test("a BYTE ARRAY is refused wherever it is put", () => {
    const bytes = [137, 80, 78, 71, 13, 10, 26, 10];
    assert.equal(validateInventory({ ...good(), media: bytes }).ok, false);
    const nested = good();
    nested.evidence.push({ checkpoint: "bound", at: "2026-09-30T00:00:00.000Z", bytes });
    assert.equal(validateInventory(nested).ok, false);
    const asKeyState = good();
    asKeyState.keyStates[`${UID}/hero/a.png`] = bytes;
    assert.equal(validateInventory(asKeyState).ok, false);
  });

  test("an OBJECT-VALUED slug is refused rather than stringified later", () => {
    assert.equal(validateInventory({ ...good(), requestedSlugAtBindTime: { slug: "x" } }).ok, false);
    assert.equal(validateInventory({ ...good(), requestedSlugAtBindTime: ["x"] }).ok, false);
    assert.equal(validateInventory({ ...good(), requestedSlugAtBindTime: 7 }).ok, false);
    // A slug-shaped string and null both remain legal.
    assert.equal(validateInventory({ ...good(), requestedSlugAtBindTime: "test-athlete" }).ok, true);
    assert.equal(validateInventory({ ...good(), requestedSlugAtBindTime: null }).ok, true);
  });

  test("a slug containing a path separator or spaces is refused", () => {
    for (const bad of ["a/b", "a b", "../x", "a\\b"]) {
      assert.equal(validateInventory({ ...good(), requestedSlugAtBindTime: bad }).ok, false, `${bad} must be refused`);
    }
  });

  test("evidence AHEAD of the current checkpoint is inconsistent", () => {
    const inv = good();
    inv.evidence.push({ checkpoint: "media-absent", at: "2026-09-30T00:00:05.000Z" });
    const r = validateInventory(inv);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => /ahead of the current checkpoint/.test(p)));
  });

  test("a reached checkpoint with NO recorded evidence is inconsistent", () => {
    const inv = atMediaAbsent();
    inv.evidence = inv.evidence.filter((e) => e.checkpoint !== "inventory-ready");
    const r = validateInventory(inv);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => /no recorded evidence for reached checkpoint inventory-ready/.test(p)));
  });

  test("media-absent with an unresolved key state is inconsistent", () => {
    const inv = atMediaAbsent();
    inv.keyStates[`${UID}/hero/b.png`] = KEY_STATE.PENDING;
    const r = validateInventory(inv);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => /not verified-absent/.test(p)));
  });

  test("inventory-ready without recorded operator confirmations is inconsistent", () => {
    const inv = atMediaAbsent();
    inv.checkpoint = "inventory-ready";
    inv.evidence = inv.evidence.filter((e) => e.checkpoint !== "media-absent");
    inv.operatorConfirmations = null;
    const r = validateInventory(inv);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => /operator confirmations/.test(p)));
  });

  test("an Auth deletion recorded too early is inconsistent", () => {
    const inv = atMediaAbsent();
    inv.authDeletion = { recordedAt: "2026-09-30T00:00:09.000Z", confirmedUid: UID };
    const r = validateInventory(inv);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => /precedes it/.test(p)));
  });

  test("an Auth deletion naming a different uid is inconsistent", () => {
    const inv = atMediaAbsent();
    inv.checkpoint = "auth-deletion-recorded";
    inv.evidence.push({ checkpoint: "profile-absent", at: "2026-09-30T00:00:04.000Z" });
    inv.evidence.push({ checkpoint: "auth-deletion-recorded", at: "2026-09-30T00:00:05.000Z" });
    inv.authDeletion = { recordedAt: "2026-09-30T00:00:05.000Z", confirmedUid: UID2 };
    const r = validateInventory(inv);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => /different uid/.test(p)));
  });

  test("a malformed operation id, environment or uid is refused", () => {
    assert.equal(validateInventory({ ...good(), operationId: "nope" }).ok, false);
    assert.equal(validateInventory({ ...good(), environment: "not-hex" }).ok, false);
    assert.equal(validateInventory({ ...good(), uid: "not-a-uuid" }).ok, false);
  });

  test("a non-ISO timestamp in evidence is refused", () => {
    const inv = good();
    inv.evidence = [{ checkpoint: "bound", at: "yesterday" }];
    assert.equal(validateInventory(inv).ok, false);
  });

  test("format version 1 is refused rather than migrated", () => {
    const inv = { ...good(), formatVersion: 1 };
    assert.equal(validateInventory(inv).ok, false);
  });
});

describe("residualTokenOutcomeSatisfied (HIGH 6)", () => {
  const base = { testedAt: "2026-09-30T00:00:00.000Z" };

  test("nothing recorded is not satisfied", () => {
    assert.equal(residualTokenOutcomeSatisfied(null).ok, false);
    assert.equal(residualTokenOutcomeSatisfied({}).ok, false);
  });

  test("a recorded outcome of NO residual capability completes", () => {
    const r = residualTokenOutcomeSatisfied({
      ...base,
      readCapable: false,
      writeCapable: false,
      probeObjectKey: null,
      probeGeneration: null,
      probeRemovedGeneration: null,
      probeRemovedAt: null,
      tokenExpiryPassedAt: null,
      publicRecheckAt: "2026-09-30T00:00:01.000Z",
      adminCrossCheckAt: null,
    });
    assert.equal(r.ok, true);
  });

  test("a missing read or write outcome is not satisfied", () => {
    assert.equal(residualTokenOutcomeSatisfied({ ...base, readCapable: false }).ok, false);
    assert.equal(residualTokenOutcomeSatisfied({ ...base, writeCapable: false }).ok, false);
  });

  test("a public re-check is required in EVERY case, capability or not", () => {
    // It must have happened AFTER the stale-token testing, so its absence is a refusal even when
    // nothing residual was found.
    const clean = {
      ...base,
      readCapable: false,
      writeCapable: false,
      probeObjectKey: null,
      probeGeneration: null,
      probeRemovedGeneration: null,
      probeRemovedAt: null,
      tokenExpiryPassedAt: null,
      publicRecheckAt: null,
      adminCrossCheckAt: null,
    };
    assert.match(residualTokenOutcomeSatisfied(clean).detail, /public check was not re-run/);
    assert.equal(residualTokenOutcomeSatisfied({ ...clean, publicRecheckAt: "2026-10-01T00:00:00.000Z" }).ok, true);
  });

  test("residual capability keeps the operation OPEN until every condition is recorded", () => {
    const open = {
      ...base,
      readCapable: false,
      writeCapable: true,
      probeObjectKey: `${UID}/probe.png`,
      probeGeneration: "run-genonefixture1",
      probeRemovedGeneration: null,
      probeRemovedAt: null,
      tokenExpiryPassedAt: null,
      publicRecheckAt: "2026-10-01T00:02:00.000Z",
      adminCrossCheckAt: null,
    };
    assert.match(residualTokenOutcomeSatisfied(open).detail, /expiry window/);

    const withExpiry = { ...open, tokenExpiryPassedAt: "2026-10-01T00:00:00.000Z" };
    assert.match(residualTokenOutcomeSatisfied(withExpiry).detail, /probe object/);

    const withProbe = {
      ...withExpiry,
      probeRemovedGeneration: "run-genonefixture1",
      probeRemovedAt: "2026-10-01T00:01:00.000Z",
    };
    assert.match(residualTokenOutcomeSatisfied(withProbe).detail, /admin cross-check/);

    const complete = { ...withProbe, adminCrossCheckAt: "2026-10-01T00:03:00.000Z" };
    assert.equal(residualTokenOutcomeSatisfied(complete).ok, true);
  });

  test("a READ-only residual capability is treated exactly as seriously as a write", () => {
    const readOnly = {
      ...base,
      readCapable: true,
      writeCapable: false,
      probeObjectKey: null,
      probeGeneration: null,
      probeRemovedGeneration: null,
      probeRemovedAt: null,
      tokenExpiryPassedAt: null,
      publicRecheckAt: "2026-09-30T00:00:01.000Z",
      adminCrossCheckAt: null,
    };
    assert.equal(residualTokenOutcomeSatisfied(readOnly).ok, false);
  });
});

describe("mergeResidualOutcome — probe generations", () => {
  const KEY = `${UID}/probe.png`;
  const base = {
    testedAt: "2026-09-30T00:00:00.000Z",
    readCapable: false,
    writeCapable: false,
    probeObjectKey: null,
    probeGeneration: null,
    probeRemovedGeneration: null,
    probeRemovedAt: null,
    tokenExpiryPassedAt: null,
    publicRecheckAt: null,
    adminCrossCheckAt: null,
  };

  test("a first probe observation is adopted with its generation", () => {
    const merged = mergeResidualOutcome(null, {
      ...base,
      writeCapable: true,
      probeObjectKey: KEY,
      probeGeneration: "run-genoneaaaaaaa",
    });
    assert.equal(merged.probeObjectKey, KEY);
    assert.equal(merged.probeGeneration, "run-genoneaaaaaaa");
    assert.equal(merged.probeRemovedGeneration, null);
  });

  test("REGRESSION: the SAME key in a new generation does not inherit the old removal", () => {
    const prior = {
      ...base,
      writeCapable: true,
      probeObjectKey: KEY,
      probeGeneration: "run-genoneaaaaaaa",
      probeRemovedGeneration: "run-genoneaaaaaaa",
      probeRemovedAt: "2026-09-30T01:00:00.000Z",
    };
    const merged = mergeResidualOutcome(prior, {
      ...base,
      writeCapable: true,
      probeObjectKey: KEY, // identical key, second object
      probeGeneration: "run-gentwobbbbbbb",
    });
    assert.equal(merged.probeGeneration, "run-gentwobbbbbbb");
    assert.equal(merged.probeRemovedGeneration, null, "the earlier removal must not discharge the new object");
    assert.equal(merged.probeRemovedAt, null);
    assert.equal(hasUnresolvedProbe(merged), true);
    assert.equal(residualTokenOutcomeSatisfied(merged).ok, false);
  });

  test("a removal confirmed in the same observation that reports the probe does resolve it", () => {
    const merged = mergeResidualOutcome(null, {
      ...base,
      writeCapable: true,
      probeObjectKey: KEY,
      probeGeneration: "run-genoneaaaaaaa",
      probeRemovedGeneration: "run-genoneaaaaaaa",
      probeRemovedAt: "2026-09-30T02:00:00.000Z",
    });
    assert.equal(hasUnresolvedProbe(merged), false);
  });

  test("a removal naming a DIFFERENT generation does not resolve the outstanding one", () => {
    const prior = {
      ...base,
      writeCapable: true,
      probeObjectKey: KEY,
      probeGeneration: "run-gentwobbbbbbb",
    };
    const merged = mergeResidualOutcome(prior, {
      ...base,
      writeCapable: true,
      probeRemovedGeneration: "run-genoneaaaaaaa", // evidence about the previous object
      probeRemovedAt: "2026-09-30T03:00:00.000Z",
    });
    assert.equal(merged.probeRemovedGeneration, null);
    assert.equal(hasUnresolvedProbe(merged), true);
  });

  test("an outstanding generation IS resolved by a confirmation naming it", () => {
    const prior = {
      ...base,
      writeCapable: true,
      probeObjectKey: KEY,
      probeGeneration: "run-gentwobbbbbbb",
    };
    const merged = mergeResidualOutcome(prior, {
      ...base,
      probeObjectKey: KEY,
      probeGeneration: "run-gentwobbbbbbb",
      probeRemovedGeneration: "run-gentwobbbbbbb",
      probeRemovedAt: "2026-09-30T04:00:00.000Z",
    });
    assert.equal(merged.probeRemovedGeneration, "run-gentwobbbbbbb");
    assert.equal(hasUnresolvedProbe(merged), false);
  });

  test("an observation that reports no probe leaves an outstanding one untouched", () => {
    const prior = {
      ...base,
      writeCapable: true,
      probeObjectKey: KEY,
      probeGeneration: "run-gentwobbbbbbb",
    };
    const merged = mergeResidualOutcome(prior, { ...base });
    assert.equal(merged.probeObjectKey, KEY);
    assert.equal(merged.probeGeneration, "run-gentwobbbbbbb");
    assert.equal(hasUnresolvedProbe(merged), true);
  });

  test("capability remains monotonic alongside the generation logic", () => {
    const prior = { ...base, readCapable: true, writeCapable: true };
    const merged = mergeResidualOutcome(prior, { ...base, readCapable: false, writeCapable: false });
    assert.equal(merged.readCapable, true);
    assert.equal(merged.writeCapable, true);
  });
});
