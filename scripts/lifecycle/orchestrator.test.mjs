/**
 * Integration tests for the deletion orchestrator.
 *
 * These drive complete sequences end to end through stub ports — no network, no Supabase project,
 * no filesystem. What they assert is the part that cannot be checked by reading the code: which
 * calls happened, in what order, and what the tool refuses to do.
 *
 * Every stub is deliberately generous about succeeding, so a test that passes because a step was
 * silently skipped shows up as a missing entry in `calls`. Nothing here matches on source text.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { REFUSAL, bindOperation } from "./binding.mjs";
import { KEY_STATE, createInventory, validateInventory } from "./checkpoints.mjs";
import { runDeletion, MODE, PUBLIC_STATE, classifyPublicExposure } from "./orchestrator.mjs";

const UID = "11111111-1111-4111-8111-111111111111";
const OTHER_UID = "22222222-2222-4222-8222-222222222222";
const ROW = "33333333-3333-4333-8333-333333333333";
const OTHER_ROW = "44444444-4444-4444-8444-444444444444";
const ENV = "abcdef0123456789";
const SLUG = "test-athlete";
const KEY_A = `${UID}/hero/a.png`;
const KEY_B = `${UID}/profile/b.png`;
const OP = "op-seeded-0000001";
const T = "2026-09-30T00:00:00.000Z";

const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * Builds stub ports plus the mutable world they act on.
 *
 * `calls` records every port invocation in order, which is how orderings are asserted.
 */
function harness(overrides = {}) {
  const calls = [];
  const state = {
    row: { readOk: true, rowPresent: true, rowId: ROW, observedOwnerUid: UID, slug: SLUG, isPublished: true },
    keys: [KEY_A, KEY_B],
    scanComplete: true,
    scanProblems: [],
    publicReachable: true,
    publicStatus: 200,
    publicRows: [],
    publicParsed: true,
    persistFails: false,
    lockHeldBy: null,
    unpublishOk: true,
    sessionValid: true,
    sessionUid: UID,
    deleteIsNoOp: false,
    deleted: [],
    saved: null,
    ...overrides,
  };
  const answers = overrides.answers ?? {};

  const ports = {
    identity: overrides.identity === undefined ? { authValidated: true, uid: UID } : overrides.identity,
    readOwnRow: async () => {
      calls.push("readOwnRow");
      return clone(state.row);
    },
    validateSession: async () => {
      calls.push("validateSession");
      return state.sessionValid ? { authValidated: true, uid: state.sessionUid } : { authValidated: false };
    },
    unpublish: async () => {
      calls.push("unpublish");
      if (!state.unpublishOk) return { ok: false, status: 409 };
      state.row.isPublished = false;
      return { ok: true, status: 200 };
    },
    publicProfileBySlug: async (slug) => {
      calls.push(`publicProfileBySlug(${slug})`);
      return {
        reachable: state.publicReachable,
        status: state.publicStatus,
        parsed: state.publicParsed,
        rows: state.publicRows,
      };
    },
    scan: async () => {
      calls.push("scan");
      return {
        complete: state.scanComplete,
        keys: [...state.keys],
        folders: [],
        problems: state.scanProblems,
        pages: 1,
      };
    },
    deleteMedia: async (keys) => {
      calls.push(`deleteMedia(${keys.length})`);
      state.deleted.push(...keys);
      if (state.deleteIsNoOp !== true) state.keys = state.keys.filter((k) => !keys.includes(k));
      return { ok: true, status: 200 };
    },
    deleteProfileRow: async () => {
      calls.push("deleteProfileRow");
      state.row = { readOk: true, rowPresent: false, slug: SLUG };
      return { ok: true, status: 204 };
    },
    persist: (inventory) => {
      calls.push("persist");
      if (state.persistFails) return { ok: false, problems: ["simulated write failure"] };
      // The stub validates too: a sequence that would write an invalid inventory is a bug here,
      // not something to discover later against a real project.
      const shape = validateInventory(inventory);
      if (!shape.ok) return { ok: false, problems: shape.problems };
      state.saved = clone(inventory);
      return { ok: true, path: "(memory)" };
    },
    load: (id) => {
      calls.push(`load(${id})`);
      if (!state.saved) return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, problems: ["not found"] };
      const shape = validateInventory(state.saved);
      if (!shape.ok) return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, problems: shape.problems };
      return { ok: true, inventory: clone(state.saved) };
    },
    withLock: async (identity, fn) => {
      calls.push("withLock");
      if (state.lockHeldBy) return { ok: false, refusal: REFUSAL.LOCK_HELD, heldBy: state.lockHeldBy };
      return { ok: true, result: await fn() };
    },
    prompt: async (question) => {
      calls.push("prompt");
      if (/closed Athlesite/.test(question)) return answers.quiet ?? "yes";
      if (/Type exactly/.test(question)) return answers.phrase ?? `delete ${UID.slice(-6)}`;
      if (/FULL uid/.test(question)) return answers.typedUid ?? UID;
      if (/no other/.test(question)) return answers.authAck ?? "yes";
      if (/READ:/.test(question)) return answers.staleRead ?? "no";
      if (/WRITE:/.test(question)) return answers.staleWrite ?? "no";
      if (/expiry windows/.test(question)) return answers.expiryPassed ?? "yes";
      if (/Object key created/.test(question)) return answers.probeKey ?? "none";
      if (/been removed and its absence confirmed/.test(question)) return answers.probeRemoved ?? "yes";
      if (/Storage and athlete_profiles cross-check been completed/.test(question)) return answers.crossChecked ?? "yes";
      if (/Attest that you have completed it/.test(question)) return answers.attested ?? "yes";
      throw new Error(`unexpected prompt: ${question}`);
    },
    newOperationId: () => "op-test-000000001",
    newRunId: () => overrides.runId ?? "run-testrun00001",
    now: () => T,
    log: () => {},
  };
  return { ports, state, calls };
}

const run = (h, config = {}) => runDeletion({ environment: ENV, ports: h.ports, ...config });

const unpublishedRow = { readOk: true, rowPresent: true, rowId: ROW, observedOwnerUid: UID, slug: SLUG, isPublished: false };
const absentRow = { readOk: true, rowPresent: false, slug: SLUG };

/** Builds a schema-valid inventory parked at `checkpoint`, as a previous run would have left it. */
function seed(h, checkpoint, extra = {}) {
  const { binding } = bindOperation({
    environment: ENV,
    uid: UID,
    profileRowId: ROW,
    operationId: OP,
    requestedSlug: SLUG,
  });
  const inv = createInventory({ binding, now: () => T });
  const order = ["bound", "inventory-ready", "media-absent", "profile-absent", "auth-deletion-recorded", "verified-complete"];
  const upto = order.indexOf(checkpoint);
  inv.checkpoint = checkpoint;

  if (upto >= 1) {
    inv.enumerationComplete = true;
    inv.operatorConfirmations = {
      // A DIFFERENT run id from the current one, which is the realistic resume case.
      runId: "run-earlierrun001",
      quietWindowConfirmedAt: T,
      phraseConfirmedAt: T,
    };
    inv.evidence.push({ checkpoint: "inventory-ready", at: T, objects: 2 });
  }
  inv.keyStates =
    upto >= 2
      ? { [KEY_A]: KEY_STATE.VERIFIED_ABSENT, [KEY_B]: KEY_STATE.VERIFIED_ABSENT }
      : { [KEY_A]: KEY_STATE.PENDING, [KEY_B]: KEY_STATE.PENDING };
  if (upto >= 2) inv.evidence.push({ checkpoint: "media-absent", at: T });
  if (upto >= 3) inv.evidence.push({ checkpoint: "profile-absent", at: T });
  if (upto >= 4) {
    inv.evidence.push({ checkpoint: "auth-deletion-recorded", at: T });
    inv.authDeletion = { recordedAt: T, confirmedUid: UID };
  }
  if (upto >= 5) {
    inv.evidence.push({ checkpoint: "verified-complete", at: T });
    inv.residualTokenTest = {
      testedAt: T,
      readCapable: false,
      writeCapable: false,
      probeObjectKey: null,
      probeGeneration: null,
      probeRemovedGeneration: null,
      probeRemovedAt: null,
      tokenExpiryPassedAt: null,
      publicRecheckAt: T,
      adminCrossCheckAt: null,
    };
    inv.finalVerification = { at: T, publicState: "absent", adminCrossCheckAttestedAt: T };
  }
  Object.assign(inv, extra);
  const shape = validateInventory(inv);
  assert.equal(shape.ok, true, `the seeded fixture must itself be valid: ${(shape.problems ?? []).join("; ")}`);
  h.state.saved = clone(inv);
  return inv;
}

// ────────────────────────────────────────────────────────── the happy path ──

describe("orchestrator — the intended path", () => {
  test("plan mode reaches the enumeration and mutates nothing", async () => {
    const h = harness();
    const r = await run(h, { mode: MODE.PLAN, slug: SLUG });
    assert.equal(r.ok, true);
    assert.equal(r.plan, true);
    assert.deepEqual(r.objects, [KEY_A, KEY_B]);
    assert.ok(!h.calls.includes("unpublish"), "plan must not unpublish");
    assert.ok(!h.calls.some((c) => c.startsWith("deleteMedia")), "plan must not delete media");
    assert.ok(!h.calls.includes("deleteProfileRow"), "plan must not delete the row");
    assert.ok(!h.calls.includes("prompt"), "plan must not ask for destructive confirmation");
  });

  test("execute runs unpublish -> enumerate -> delete media -> delete row, in that order", async () => {
    const h = harness();
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, true, `expected success, got ${r.refusal} ${r.detail ?? ""}`);
    assert.equal(r.checkpoint, "profile-absent");

    const order = h.calls.filter((c) => /^(unpublish|scan|deleteMedia|deleteProfileRow)/.test(c));
    const firstScan = order.indexOf("scan");
    const firstDelete = order.findIndex((c) => c.startsWith("deleteMedia"));
    const rowDelete = order.indexOf("deleteProfileRow");
    assert.ok(order.indexOf("unpublish") < firstScan, "unpublish precedes enumeration");
    assert.ok(firstScan < firstDelete, "a complete enumeration precedes the first delete");
    assert.ok(firstDelete < rowDelete, "media is deleted before the profile row");
    assert.deepEqual([...h.state.deleted].sort(), [KEY_A, KEY_B].sort());
  });

  test("the Auth handoff names the bound uid and a resume command needing no session", async () => {
    const h = harness();
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.handoff.uid, UID);
    assert.match(r.handoff.resumeWith, /verify-public/);
  });

  test("verify-public then completes the operation without any athlete session", async () => {
    const h = harness();
    await run(h, { mode: MODE.EXECUTE, slug: SLUG });

    const h2 = harness({ identity: null, saved: h.state.saved, row: { readOk: false } });
    const r = await run(h2, { mode: MODE.VERIFY_PUBLIC, operationId: h.state.saved.operationId });
    assert.equal(r.ok, true, `${r.refusal} ${r.detail ?? ""}`);
    assert.equal(r.checkpoint, "verified-complete");
    assert.equal(r.verdict.clean, true);
    assert.ok(!h2.calls.includes("readOwnRow"), "verify-public must not need an owner read");
    assert.ok(!h2.calls.includes("validateSession"), "verify-public must not validate a session");
  });
});

// ────────────────────────────── HIGH 7: fresh auth at destructive boundaries ──

describe("orchestrator — fresh auth validation at every destructive boundary (HIGH 7)", () => {
  test("a fresh session validation happens before the first mutation", async () => {
    const h = harness();
    await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    const firstMutation = h.calls.findIndex(
      (c) => c === "unpublish" || c.startsWith("deleteMedia") || c === "deleteProfileRow"
    );
    assert.ok(h.calls.indexOf("validateSession") >= 0 && h.calls.indexOf("validateSession") < firstMutation);
  });

  test("startup auth valid but LATER fresh validation failing stops the operation", async () => {
    const h = harness();
    // Startup identity is good; the session stops being accepted before the destructive phase.
    h.state.sessionValid = false;
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.AUTH_VALIDATION_FAILED);
    assert.ok(!h.calls.includes("unpublish"), "nothing may be mutated on a stale session");
    assert.equal(h.state.deleted.length, 0);
  });

  test("a fresh session for a DIFFERENT uid than the bound one is refused", async () => {
    const h = harness({ row: unpublishedRow });
    seed(h, "inventory-ready");
    h.state.sessionUid = OTHER_UID;
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.UID_MISMATCH);
    assert.equal(h.state.deleted.length, 0);
  });

  test("auth revoked between media deletion and the row delete stops before the row", async () => {
    const h = harness({ row: unpublishedRow });
    seed(h, "media-absent");
    h.state.keys = [];
    h.state.sessionValid = false;
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.AUTH_VALIDATION_FAILED);
    assert.ok(!h.calls.includes("deleteProfileRow"));
  });

  test("auth failing at profile-absent blocks the Auth handoff", async () => {
    const h = harness({ row: absentRow });
    seed(h, "profile-absent");
    h.state.keys = [];
    h.state.sessionValid = false;
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.AUTH_VALIDATION_FAILED);
    assert.equal(r.handoff, undefined);
  });
});

// ───────────────────────── HIGH 2: profile deletion gates at media-absent ──

describe("orchestrator — profile deletion gates when resuming from media-absent (HIGH 2)", () => {
  test("a PUBLISHED row at media-absent is never deleted", async () => {
    // The reproduced bug: resuming at media-absent went straight to the row delete without
    // re-checking publication, so a profile republished between runs was deleted anyway.
    const h = harness({ row: { readOk: true, rowPresent: true, rowId: ROW, observedOwnerUid: UID, slug: SLUG, isPublished: true } });
    seed(h, "media-absent");
    h.state.keys = [];
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.CONCURRENT_ACTIVITY);
    assert.ok(!h.calls.includes("deleteProfileRow"), "a published row must not be deleted");
    assert.equal(h.state.saved.checkpoint, "bound", "the checkpoint must roll backward");
  });

  test("a REPLACEMENT row at media-absent is never deleted", async () => {
    const h = harness({
      row: { readOk: true, rowPresent: true, rowId: OTHER_ROW, observedOwnerUid: UID, slug: SLUG, isPublished: false },
    });
    seed(h, "media-absent");
    h.state.keys = [];
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.PROFILE_ROW_UNEXPECTED);
    assert.ok(!h.calls.includes("deleteProfileRow"));
  });

  test("an UNRESOLVED inventory entry at media-absent blocks the row delete", async () => {
    const h = harness({ row: unpublishedRow });
    // The stored inventory claims media-absent but carries an unresolved entry. The schema catches
    // that on load, which is itself the gate — an inconsistent inventory is never acted upon.
    const inv = seed(h, "media-absent");
    inv.keyStates[KEY_B] = KEY_STATE.PENDING;
    h.state.saved = clone(inv);
    h.state.keys = [];
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.INVENTORY_CORRUPT);
    assert.ok(!h.calls.includes("deleteProfileRow"));
  });

  test("a foreign-owned row at media-absent is never touched", async () => {
    const h = harness({
      row: { readOk: true, rowPresent: true, rowId: ROW, observedOwnerUid: OTHER_UID, slug: SLUG, isPublished: false },
    });
    seed(h, "media-absent");
    h.state.keys = [];
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.UID_MISMATCH);
    assert.ok(!h.calls.includes("deleteProfileRow"));
  });

  test("media reappearing at media-absent blocks the row delete", async () => {
    const h = harness({ row: unpublishedRow });
    seed(h, "media-absent");
    h.state.keys = [`${UID}/hero/new.png`];
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.CONCURRENT_ACTIVITY);
    assert.ok(!h.calls.includes("deleteProfileRow"));
  });

  test("a resumed run at media-absent requires confirmation for THIS run", async () => {
    const h = harness({ row: unpublishedRow, answers: { phrase: "wrong" } });
    seed(h, "media-absent");
    h.state.keys = [];
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.CONFIRMATION_MISMATCH, "a stored confirmation is not a standing one");
    assert.ok(!h.calls.includes("deleteProfileRow"));
  });
});

// ───────────────────── HIGH 3: profile-absent resume re-proves before handoff ──

describe("orchestrator — profile-absent resume re-proves before the Auth handoff (HIGH 3)", () => {
  test("a clean resume re-reads, re-scans and re-checks the public surface first", async () => {
    const h = harness({ row: absentRow });
    seed(h, "profile-absent");
    h.state.keys = [];
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, true, `${r.refusal} ${r.detail ?? ""}`);
    assert.ok(r.handoff, "the handoff is printed only after the re-proof");
    assert.ok(h.calls.includes("validateSession"), "a fresh session validation is required");
    assert.ok(h.calls.includes("readOwnRow"), "the row is re-read");
    assert.ok(h.calls.includes("scan"), "a fresh complete scan is required");
    assert.ok(h.calls.some((c) => c.startsWith("publicProfileBySlug")), "the public surface is re-checked");
  });

  test("a REPLACEMENT profile appearing blocks the handoff and rolls back", async () => {
    const h = harness({
      row: { readOk: true, rowPresent: true, rowId: OTHER_ROW, observedOwnerUid: UID, slug: SLUG, isPublished: false },
    });
    seed(h, "profile-absent");
    h.state.keys = [];
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.CONCURRENT_ACTIVITY);
    assert.equal(r.handoff, undefined, "the founder must not be told to delete the Auth user");
    assert.equal(h.state.saved.checkpoint, "bound");
  });

  test("a PUBLISHED profile appearing blocks the handoff and rolls back", async () => {
    const h = harness({
      row: { readOk: true, rowPresent: true, rowId: ROW, observedOwnerUid: UID, slug: SLUG, isPublished: true },
    });
    seed(h, "profile-absent");
    h.state.keys = [];
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.CONCURRENT_ACTIVITY);
    assert.match(r.detail, /published/);
    assert.equal(r.handoff, undefined);
    assert.equal(h.state.saved.checkpoint, "bound");
  });

  test("NEW MEDIA appearing blocks the handoff and rolls back", async () => {
    const h = harness({ row: absentRow });
    seed(h, "profile-absent");
    h.state.keys = [`${UID}/hero/reuploaded.png`];
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.CONCURRENT_ACTIVITY);
    assert.equal(r.handoff, undefined);
    assert.equal(h.state.saved.checkpoint, "bound");
  });

  test("an UNKNOWN public state blocks the handoff", async () => {
    const h = harness({ row: absentRow, publicReachable: false });
    seed(h, "profile-absent");
    h.state.keys = [];
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.PUBLIC_STATE_UNKNOWN);
    assert.equal(r.handoff, undefined);
  });

  test("an incomplete pre-handoff scan blocks the handoff", async () => {
    const h = harness({ row: absentRow, scanComplete: false });
    seed(h, "profile-absent");
    h.state.keys = [];
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.ENUMERATION_INCOMPLETE);
    assert.equal(r.handoff, undefined);
  });

  test("a failed pre-handoff persist suppresses the handoff", async () => {
    const h = harness({ row: absentRow });
    seed(h, "profile-absent");
    h.state.keys = [];
    h.state.persistFails = true;
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.PERSISTENCE_FAILED);
    assert.equal(r.handoff, undefined);
    assert.match(r.detail, /do NOT delete the Auth user/);
  });
});

// ──────────────────────── HIGH 4: reappearing verified-absent media ──

describe("orchestrator — media that regresses from verified-absent (HIGH 4)", () => {
  test("a key previously proven absent that reappears is a regression, not a re-delete", async () => {
    const h = harness({ row: unpublishedRow });
    const inv = seed(h, "inventory-ready");
    // A previous run proved KEY_A absent; the fresh scan lists it again.
    inv.keyStates[KEY_A] = KEY_STATE.VERIFIED_ABSENT;
    h.state.saved = clone(inv);
    h.state.keys = [KEY_A];

    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.CONCURRENT_ACTIVITY);
    assert.match(r.detail, /previously proven absent/);
    assert.equal(h.state.deleted.length, 0, "it must NOT be silently deleted and the run continued");
    assert.equal(h.state.saved.checkpoint, "bound", "media-absent and everything downstream is invalidated");
  });

  test("the rollback un-proves every previously absent key", async () => {
    const h = harness({ row: unpublishedRow });
    const inv = seed(h, "inventory-ready");
    inv.keyStates[KEY_A] = KEY_STATE.VERIFIED_ABSENT;
    inv.keyStates[KEY_B] = KEY_STATE.VERIFIED_ABSENT;
    h.state.saved = clone(inv);
    h.state.keys = [KEY_A];

    await run(h, { mode: MODE.EXECUTE, operationId: OP });
    for (const [key, value] of Object.entries(h.state.saved.keyStates)) {
      assert.notEqual(value, KEY_STATE.VERIFIED_ABSENT, `${key} must be re-proven, not remembered as absent`);
    }
  });

  test("a regression detected in the POST-delete scan also stops the run", async () => {
    const h = harness({ row: unpublishedRow });
    seed(h, "inventory-ready");
    // The delete acknowledges, but the object is put back before the verifying scan.
    h.state.keys = [KEY_A, KEY_B];
    let scans = 0;
    const realScan = h.ports.scan;
    h.ports.scan = async (uid) => {
      scans += 1;
      if (scans >= 2) {
        // After the deletes, re-present a key that the reconcile had just proven absent.
        h.state.keys = [KEY_A];
      }
      return realScan(uid);
    };
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.ok([REFUSAL.CONCURRENT_ACTIVITY, REFUSAL.ABSENCE_UNPROVEN].includes(r.refusal));
    assert.notEqual(h.state.saved.checkpoint, "media-absent");
  });
});

// ─────────────────────────── HIGH 5: public verification gates everywhere ──

describe("orchestrator — public absence gates everywhere (HIGH 5)", () => {
  test("an UNKNOWN public state stops the destructive flow before any delete", async () => {
    const h = harness({ publicReachable: false });
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.PUBLIC_STATE_UNKNOWN);
    assert.equal(h.state.deleted.length, 0);
  });

  test("a malformed public response also stops the destructive flow", async () => {
    const h = harness({ publicParsed: false });
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.PUBLIC_STATE_UNKNOWN);
    assert.equal(h.state.deleted.length, 0);
  });

  test("a non-200 public status stops the destructive flow", async () => {
    const h = harness({ publicStatus: 503 });
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.PUBLIC_STATE_UNKNOWN);
  });

  test("a still-published public row blocks execution", async () => {
    const h = harness({ publicRows: [{ slug: SLUG }] });
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.STILL_PUBLIC);
    assert.equal(h.state.deleted.length, 0);
  });

  test("EXPOSED after verified-complete contradicts the stored conclusion", async () => {
    const h = harness({ identity: null, publicRows: [{ slug: SLUG }] });
    seed(h, "verified-complete");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, false, "a stored verified-complete must not override fresh evidence");
    assert.equal(r.refusal, REFUSAL.STILL_PUBLIC);
    assert.match(r.detail, /does not override current evidence/);
  });

  test("UNKNOWN after verified-complete also refuses to report clean", async () => {
    const h = harness({ identity: null, publicReachable: false });
    seed(h, "verified-complete");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.PUBLIC_STATE_UNKNOWN);
  });

  test("ABSENT after verified-complete is reported clean", async () => {
    const h = harness({ identity: null });
    seed(h, "verified-complete");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, true);
    assert.equal(r.verdict.clean, true);
  });

  test("UNKNOWN blocks completion from auth-deletion-recorded", async () => {
    const h = harness({ identity: null, publicReachable: false });
    seed(h, "auth-deletion-recorded");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.PUBLIC_STATE_UNKNOWN);
    assert.notEqual(h.state.saved.checkpoint, "verified-complete");
  });

  test("classifyPublicExposure never reports absence from a non-200 or a missing slug", () => {
    assert.equal(classifyPublicExposure({ reachable: true, status: 200, parsed: true, rows: [] }, SLUG).state, PUBLIC_STATE.ABSENT);
    assert.equal(classifyPublicExposure({ reachable: true, status: 200, parsed: true, rows: [{}] }, SLUG).state, PUBLIC_STATE.EXPOSED);
    assert.equal(classifyPublicExposure({ reachable: true, status: 404, parsed: true, rows: [] }, SLUG).state, PUBLIC_STATE.UNKNOWN);
    assert.equal(classifyPublicExposure({ reachable: true, status: 200, parsed: false }, SLUG).state, PUBLIC_STATE.UNKNOWN);
    assert.equal(classifyPublicExposure({ reachable: false }, SLUG).state, PUBLIC_STATE.UNKNOWN);
    assert.equal(classifyPublicExposure({ reachable: true, status: 200, parsed: true, rows: [] }, "").state, PUBLIC_STATE.UNKNOWN);
    assert.equal(classifyPublicExposure({ reachable: true, status: 200, parsed: true, rows: [] }, null).state, PUBLIC_STATE.UNKNOWN);
  });
});

// ──────────────── HIGH 6 + completion order: residual-token evidence ──

describe("orchestrator — residual-token completion requires evidence (HIGH 6)", () => {
  test("acknowledging the caveat alone CANNOT reach verified-complete", async () => {
    // There is no "I read it" answer any more. Declining to record the outcomes leaves the
    // operation open, whatever else the operator says.
    const h = harness({ identity: null, answers: { staleRead: "not-tested", staleWrite: "not-tested" } });
    seed(h, "auth-deletion-recorded");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.ABSENCE_UNPROVEN);
    assert.match(r.detail, /READ and WRITE outcomes must both be recorded/);
    assert.notEqual(h.state.saved.checkpoint, "verified-complete");
  });

  test("a recorded outcome of no residual capability completes", async () => {
    const h = harness({ identity: null, answers: { staleRead: "no", staleWrite: "no" } });
    seed(h, "auth-deletion-recorded");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, true, `${r.refusal} ${r.detail ?? ""}`);
    assert.equal(r.checkpoint, "verified-complete");
    assert.equal(h.state.saved.residualTokenTest.readCapable, false);
    assert.equal(h.state.saved.residualTokenTest.writeCapable, false);
  });

  test("a residual WRITE capability leaves the operation OPEN until every condition is met", async () => {
    const h = harness({
      identity: null,
      answers: { staleRead: "no", staleWrite: "yes", expiryPassed: "no", probeKey: `${UID}/probe.png` },
    });
    seed(h, "auth-deletion-recorded");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, true, "the run itself succeeds — it records the outcome");
    assert.equal(r.checkpoint, "auth-deletion-recorded", "but the operation is NOT complete");
    assert.equal(r.verdict.clean, false);
    assert.match(r.outstanding, /expiry window/);
    assert.equal(h.state.saved.residualTokenTest.writeCapable, true);
  });

  test("a residual READ capability is treated as seriously as a write", async () => {
    const h = harness({ identity: null, answers: { staleRead: "yes", staleWrite: "no", expiryPassed: "no" } });
    seed(h, "auth-deletion-recorded");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.checkpoint, "auth-deletion-recorded");
    assert.equal(r.verdict.clean, false);
  });

  test("an unremoved probe object keeps the operation open", async () => {
    const h = harness({
      identity: null,
      answers: {
        staleRead: "no",
        staleWrite: "yes",
        expiryPassed: "yes",
        probeKey: `${UID}/probe.png`,
        probeRemoved: "no",
        crossChecked: "yes",
      },
    });
    seed(h, "auth-deletion-recorded");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.checkpoint, "auth-deletion-recorded");
    assert.match(r.outstanding, /probe object/);
  });

  test("all residual conditions satisfied completes, and records each one", async () => {
    const h = harness({
      identity: null,
      answers: {
        staleRead: "yes",
        staleWrite: "yes",
        expiryPassed: "yes",
        probeKey: `${UID}/probe.png`,
        probeRemoved: "yes",
        crossChecked: "yes",
        attested: "yes",
      },
    });
    seed(h, "auth-deletion-recorded");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, true, `${r.refusal} ${r.detail ?? ""}`);
    assert.equal(r.checkpoint, "verified-complete");
    const rec = h.state.saved.residualTokenTest;
    assert.ok(rec.tokenExpiryPassedAt, "the expiry window must be recorded");
    assert.ok(rec.probeRemovedAt, "the probe removal must be recorded");
    assert.ok(rec.adminCrossCheckAt, "the admin cross-check must be recorded");
    assert.ok(h.state.saved.finalVerification.adminCrossCheckAttestedAt);
  });

  test("refusing the admin cross-check attestation blocks completion", async () => {
    const h = harness({ identity: null, answers: { attested: "no" } });
    seed(h, "auth-deletion-recorded");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.ABSENCE_UNPROVEN);
    assert.match(r.detail, /attestation/);
  });

  test("COMPLETION ORDER: the Auth deletion is recorded before the stale-token test is asked", async () => {
    const h = harness({ identity: null });
    seed(h, "profile-absent");
    const asked = [];
    const realPrompt = h.ports.prompt;
    h.ports.prompt = async (q) => {
      asked.push(q);
      return realPrompt(q);
    };
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, true, `${r.refusal} ${r.detail ?? ""}`);
    const uidAsk = asked.findIndex((q) => /FULL uid/.test(q));
    const readAsk = asked.findIndex((q) => /READ:/.test(q));
    assert.ok(uidAsk >= 0 && readAsk >= 0);
    assert.ok(uidAsk < readAsk, "the deleted uid is recorded before the stale-token questions");
  });

  test("COMPLETION ORDER: verified-complete cannot be reached before the stale-token outcome", async () => {
    const h = harness({ identity: null, answers: { staleRead: "maybe", staleWrite: "maybe" } });
    seed(h, "profile-absent");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, false);
    // The Auth deletion was recorded; completion was not reached.
    assert.equal(h.state.saved.checkpoint, "auth-deletion-recorded");
    assert.equal(h.state.saved.residualTokenTest, null);
  });

  test("recording the manual Auth deletion requires the FULL bound uid", async () => {
    const h = harness({ identity: null, answers: { typedUid: OTHER_UID } });
    seed(h, "profile-absent");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, false);
    assert.ok([REFUSAL.UID_MISMATCH, REFUSAL.AUTH_VALIDATION_FAILED].includes(r.refusal));
    assert.notEqual(h.state.saved.checkpoint, "auth-deletion-recorded");
  });

  test("completion requires the recorded owner-authorised proof, not just public absence", async () => {
    const h = harness({ identity: null });
    const inv = seed(h, "auth-deletion-recorded");
    // Strip the owner-authorised proof but keep the checkpoint: the schema rejects the
    // inconsistency, so it can never be acted upon.
    inv.evidence = inv.evidence.filter((e) => e.checkpoint !== "profile-absent");
    h.state.saved = clone(inv);
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, false);
    assert.ok([REFUSAL.ABSENCE_UNPROVEN, REFUSAL.INVENTORY_CORRUPT].includes(r.refusal));
  });
});

// ─────────────────────────────────── resume from every checkpoint ──

describe("orchestrator — checkpoint-aware resume (all six)", () => {
  test("resume at bound restarts the inventory phase", async () => {
    const h = harness();
    seed(h, "bound", { keyStates: {} });
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, true, `${r.refusal} ${r.detail ?? ""}`);
    assert.equal(r.checkpoint, "profile-absent");
  });

  test("resume at inventory-ready re-reads and re-scans before deleting", async () => {
    const h = harness({ row: unpublishedRow });
    seed(h, "inventory-ready");
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, true, `${r.refusal} ${r.detail ?? ""}`);
    const firstDelete = h.calls.findIndex((c) => c.startsWith("deleteMedia"));
    assert.ok(h.calls.indexOf("validateSession") < firstDelete);
    assert.ok(h.calls.indexOf("readOwnRow") < firstDelete);
    assert.ok(h.calls.indexOf("scan") < firstDelete);
  });

  test("resume at media-absent skips media deletion and goes to the row", async () => {
    const h = harness({ row: unpublishedRow });
    seed(h, "media-absent");
    h.state.keys = [];
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, true, `${r.refusal} ${r.detail ?? ""}`);
    assert.ok(!h.calls.some((c) => c.startsWith("deleteMedia")), "media deletion is already proven done");
    assert.ok(h.calls.includes("deleteProfileRow"));
  });

  test("resume at profile-absent re-proves and re-prints the handoff", async () => {
    const h = harness({ row: absentRow });
    seed(h, "profile-absent");
    h.state.keys = [];
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, true);
    assert.equal(r.checkpoint, "profile-absent");
    assert.equal(r.handoff.uid, UID);
    assert.ok(!h.calls.includes("deleteProfileRow"));
    assert.ok(!h.calls.some((c) => c.startsWith("deleteMedia")));
  });

  test("resume at auth-deletion-recorded completes without a session", async () => {
    const h = harness({ identity: null });
    seed(h, "auth-deletion-recorded");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, true, `${r.refusal} ${r.detail ?? ""}`);
    assert.equal(r.checkpoint, "verified-complete");
  });

  test("resume at verified-complete is idempotent and mutates nothing", async () => {
    const h = harness({ identity: null });
    seed(h, "verified-complete");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, true);
    assert.equal(r.checkpoint, "verified-complete");
    assert.ok(!h.calls.some((c) => c.startsWith("deleteMedia")));
    assert.ok(!h.calls.includes("deleteProfileRow"));
    assert.ok(!h.calls.includes("prompt"), "a completed operation asks nothing further");
  });

  test("an inventory from a different environment is refused on resume", async () => {
    const h = harness();
    const inv = seed(h, "inventory-ready");
    inv.environment = "0000000000000000";
    h.state.saved = clone(inv);
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.ENVIRONMENT_MISMATCH);
  });

  test("resuming as a DIFFERENT athlete is refused, and the lock taken is the caller's own", async () => {
    // The authoritative load now happens inside the lock, so this refusal does too. The lock key
    // comes from the SIGNED-IN uid, so a caller inspecting someone else's operation locks only their
    // own identity — the bound athlete's lock is never taken, and nothing of theirs is touched.
    const h = harness({ identity: { authValidated: true, uid: OTHER_UID } });
    seed(h, "inventory-ready");
    const lockedIdentities = [];
    const realWithLock = h.ports.withLock;
    h.ports.withLock = async (identity, fn) => {
      lockedIdentities.push(identity.uid);
      return realWithLock(identity, fn);
    };

    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.UID_MISMATCH);
    assert.deepEqual(lockedIdentities, [OTHER_UID], "only the caller's own identity may be locked");
    assert.equal(h.state.deleted.length, 0);
    assert.ok(!h.calls.includes("unpublish"));
    assert.ok(!h.calls.includes("deleteProfileRow"));
    assert.equal(h.state.saved.checkpoint, "inventory-ready", "the stored inventory is left untouched");
  });
});

// ─────────────────────────────── ownership gate and foreign paths ──

describe("orchestrator — ownership gate (HIGH 5 of the prior pass)", () => {
  test("a foreign path in the enumeration is a hard refusal", async () => {
    const h = harness();
    h.state.keys = [KEY_A, `${OTHER_UID}/hero/victim.png`];
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.FOREIGN_PATH);
    assert.equal(h.state.deleted.length, 0, "not one key may be sent to Storage DELETE");
  });

  test("a foreign path in a STORED inventory is refused at load, at any checkpoint", async () => {
    const h = harness({ row: unpublishedRow });
    const inv = seed(h, "media-absent");
    inv.keyStates[`${OTHER_UID}/hero/victim.png`] = KEY_STATE.VERIFIED_ABSENT;
    h.state.saved = clone(inv);
    h.state.keys = [];
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.INVENTORY_CORRUPT);
    assert.equal(h.state.deleted.length, 0);
    assert.ok(!h.calls.includes("deleteProfileRow"));
  });

  test("a prefix-sharing sibling namespace is foreign, not owned", async () => {
    const h = harness();
    h.state.keys = [KEY_A, `${UID}2/hero/other.png`];
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.FOREIGN_PATH);
  });

  test("an unparseable key stops the operation rather than being skipped", async () => {
    const h = harness();
    h.state.keys = [KEY_A, `${UID}/../${OTHER_UID}/x.png`];
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, false);
    assert.ok([REFUSAL.AMBIGUOUS_PATH, REFUSAL.FOREIGN_PATH].includes(r.refusal));
    assert.equal(h.state.deleted.length, 0);
  });
});

// ───────────────────────────────── persistence, gating, refusals ──

describe("orchestrator — persistence and gating", () => {
  test("a failed save before the first mutation stops the operation", async () => {
    const h = harness({ persistFails: true });
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.PERSISTENCE_FAILED);
    assert.ok(!h.calls.includes("unpublish"), "nothing may be mutated without a durable record");
  });

  test("both confirmations are taken BEFORE the first mutation", async () => {
    const h = harness();
    await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    const firstMutation = h.calls.findIndex(
      (c) => c === "unpublish" || c.startsWith("deleteMedia") || c === "deleteProfileRow"
    );
    const promptsBefore = h.calls.slice(0, firstMutation).filter((c) => c === "prompt").length;
    assert.ok(firstMutation > 0, "there must be a mutation to compare against");
    assert.ok(promptsBefore >= 2, `expected quiet-window + typed confirmation first, saw ${promptsBefore}`);
  });

  test("declining the quiet window mutates nothing", async () => {
    const h = harness({ answers: { quiet: "no" } });
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.QUIET_WINDOW_NOT_CONFIRMED);
    assert.ok(!h.calls.includes("unpublish"));
  });

  test("a mistyped confirmation phrase mutates nothing", async () => {
    const h = harness({ answers: { phrase: "delete everything" } });
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.CONFIRMATION_MISMATCH);
    assert.ok(!h.calls.includes("unpublish"));
    assert.equal(h.state.deleted.length, 0);
  });

  test("the recorded confirmations carry THIS run's id", async () => {
    const h = harness({ runId: "run-specificrun01" });
    await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(h.state.saved.operatorConfirmations.runId, "run-specificrun01");
  });

  test("every persisted inventory is schema-valid at every step", async () => {
    const h = harness();
    const seen = [];
    const realPersist = h.ports.persist;
    h.ports.persist = (inv) => {
      seen.push(validateInventory(inv));
      return realPersist(inv);
    };
    await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.ok(seen.length > 0);
    for (const [i, v] of seen.entries()) {
      assert.equal(v.ok, true, `save ${i} wrote an invalid inventory: ${(v.problems ?? []).join("; ")}`);
    }
  });
});

describe("orchestrator — refusals", () => {
  test("a held lock refuses before any read or mutation", async () => {
    const h = harness({ lockHeldBy: "op-someone-else" });
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.LOCK_HELD);
    assert.equal(r.heldBy, "op-someone-else");
    assert.ok(!h.calls.includes("unpublish"));
    assert.equal(h.state.deleted.length, 0);
  });

  test("execute without a validated startup session is refused", async () => {
    const h = harness({ identity: { authValidated: false, uid: UID } });
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.AUTH_VALIDATION_FAILED);
  });

  test("an unauthoritative owner-row read refuses instead of assuming absence", async () => {
    const h = harness({ row: { readOk: false } });
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.ABSENCE_UNPROVEN);
  });

  test("a failed unpublish stops before enumeration", async () => {
    const h = harness({ unpublishOk: false });
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.UNPUBLISH_FAILED);
    assert.ok(!h.calls.some((c) => c.startsWith("deleteMedia")));
  });

  test("an incomplete scan is never treated as an empty namespace", async () => {
    const h = harness({ scanComplete: false, scanProblems: ["list threw"] });
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.ENUMERATION_INCOMPLETE);
    assert.equal(h.state.deleted.length, 0);
  });

  test("a delete that silently changes nothing does not advance the checkpoint", async () => {
    const h = harness({ deleteIsNoOp: true });
    const r = await run(h, { mode: MODE.EXECUTE, slug: SLUG });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.ABSENCE_UNPROVEN, "a 200 from DELETE is not proof of absence");
    assert.notEqual(h.state.saved.checkpoint, "media-absent");
  });

  test("a slug changed after binding is refused, not verified against the old name", async () => {
    const h = harness({
      row: { readOk: true, rowPresent: true, rowId: ROW, observedOwnerUid: UID, slug: "renamed-athlete", isPublished: false },
    });
    seed(h, "inventory-ready");
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.CONCURRENT_ACTIVITY);
    assert.match(r.detail, /slug changed/);
    assert.equal(h.state.deleted.length, 0);
  });

  test("verify-public requires an operation id, since it has nothing else to bind to", async () => {
    const h = harness({ identity: null });
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.INVENTORY_CORRUPT);
  });

  test("verify-owner mutates nothing even when everything is still present", async () => {
    const h = harness();
    seed(h, "inventory-ready");
    const r = await run(h, { mode: MODE.VERIFY_OWNER, operationId: OP });
    assert.equal(r.ok, true);
    assert.equal(r.readOnly, true);
    assert.equal(r.verdict.clean, false);
    assert.ok(!h.calls.includes("unpublish"));
    assert.ok(!h.calls.some((c) => c.startsWith("deleteMedia")));
    assert.ok(!h.calls.includes("deleteProfileRow"));
  });

  test("verify-owner reports a failed fresh auth rather than a clean verdict", async () => {
    const h = harness({ sessionValid: false });
    seed(h, "profile-absent");
    h.state.keys = [];
    const r = await run(h, { mode: MODE.VERIFY_OWNER, operationId: OP });
    assert.equal(r.ok, true);
    assert.equal(r.verdict.clean, false);
    assert.match(r.verdict.freshAuth, /failed/);
  });

  test("an unknown mode is refused rather than defaulting to something destructive", async () => {
    const h = harness();
    const r = await run(h, { mode: "delete-everything" });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.TRANSITION_NOT_ELIGIBLE);
    assert.equal(h.calls.length, 0);
  });
});

// ───── HIGH 1: resumed destructive phases require a fresh public ABSENT ─────

describe("orchestrator — resumed destructive phases require fresh public ABSENT (HIGH 1)", () => {
  test("resume at inventory-ready + UNKNOWN public deletes nothing", async () => {
    const h = harness({ row: unpublishedRow, publicReachable: false });
    seed(h, "inventory-ready");
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.PUBLIC_STATE_UNKNOWN);
    assert.equal(h.state.deleted.length, 0, "no media delete");
    assert.ok(!h.calls.some((c) => c.startsWith("deleteMedia")));
    assert.ok(!h.calls.includes("deleteProfileRow"), "no profile delete");
  });

  test("resume at inventory-ready + EXPOSED public deletes nothing", async () => {
    const h = harness({ row: unpublishedRow, publicRows: [{ slug: SLUG }] });
    seed(h, "inventory-ready");
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.STILL_PUBLIC);
    assert.equal(h.state.deleted.length, 0, "no media delete");
    assert.ok(!h.calls.includes("deleteProfileRow"), "no profile delete");
  });

  test("resume at media-absent + UNKNOWN public deletes no row", async () => {
    const h = harness({ row: unpublishedRow, publicReachable: false });
    seed(h, "media-absent");
    h.state.keys = [];
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.PUBLIC_STATE_UNKNOWN);
    assert.ok(!h.calls.includes("deleteProfileRow"), "no profile delete");
    assert.equal(h.state.deleted.length, 0);
  });

  test("resume at media-absent + EXPOSED public deletes no row", async () => {
    const h = harness({ row: unpublishedRow, publicRows: [{ slug: SLUG }] });
    seed(h, "media-absent");
    h.state.keys = [];
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.STILL_PUBLIC);
    assert.ok(!h.calls.includes("deleteProfileRow"), "no profile delete");
  });

  test("a malformed public response is also UNKNOWN at both destructive entry points", async () => {
    for (const checkpoint of ["inventory-ready", "media-absent"]) {
      const h = harness({ row: unpublishedRow, publicParsed: false });
      seed(h, checkpoint);
      if (checkpoint === "media-absent") h.state.keys = [];
      const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
      assert.equal(r.refusal, REFUSAL.PUBLIC_STATE_UNKNOWN, `${checkpoint} must refuse`);
      assert.equal(h.state.deleted.length, 0);
      assert.ok(!h.calls.includes("deleteProfileRow"));
    }
  });

  test("the public check happens BEFORE the first delete call of each phase", async () => {
    const h = harness({ row: unpublishedRow });
    seed(h, "inventory-ready");
    const r = await run(h, { mode: MODE.EXECUTE, operationId: OP });
    assert.equal(r.ok, true, `${r.refusal} ${r.detail ?? ""}`);
    const firstPublic = h.calls.findIndex((c) => c.startsWith("publicProfileBySlug"));
    const firstDelete = h.calls.findIndex((c) => c.startsWith("deleteMedia"));
    const rowDelete = h.calls.indexOf("deleteProfileRow");
    assert.ok(firstPublic >= 0 && firstPublic < firstDelete, "public check precedes media deletion");
    const publicBeforeRow = h.calls.slice(0, rowDelete).filter((c) => c.startsWith("publicProfileBySlug")).length;
    assert.ok(publicBeforeRow >= 2, "a separate public check precedes the row deletion");
  });
});

// ───── HIGH 2: the public re-check happens AFTER residual testing ─────

describe("orchestrator — fresh public re-check after residual testing (HIGH 2)", () => {
  test("a public check is issued AFTER the stale-token questions", async () => {
    const h = harness({ identity: null });
    seed(h, "auth-deletion-recorded");
    const order = [];
    const realPrompt = h.ports.prompt;
    const realPublic = h.ports.publicProfileBySlug;
    h.ports.prompt = async (q) => {
      if (/READ:/.test(q)) order.push("read-question");
      if (/WRITE:/.test(q)) order.push("write-question");
      return realPrompt(q);
    };
    h.ports.publicProfileBySlug = async (slug) => {
      order.push("public");
      return realPublic(slug);
    };
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, true, `${r.refusal} ${r.detail ?? ""}`);
    const lastPublic = order.lastIndexOf("public");
    assert.ok(lastPublic > order.indexOf("read-question"), "a public request follows the READ question");
    assert.ok(lastPublic > order.indexOf("write-question"), "a public request follows the WRITE question");
  });

  test("publicRecheckAt is stamped only when a real request returned ABSENT", async () => {
    const h = harness({ identity: null });
    seed(h, "auth-deletion-recorded");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, true);
    assert.ok(h.state.saved.residualTokenTest.publicRecheckAt, "the recheck must be recorded");
  });

  test("public that becomes EXPOSED during residual testing refuses completion", async () => {
    // ABSENT at the start of the run; the probing takes time, and by the final check a profile is
    // published at the slug again. Completion must turn on the LATER observation.
    const h = harness({ identity: null });
    seed(h, "auth-deletion-recorded");
    let publicCalls = 0;
    const realPublic = h.ports.publicProfileBySlug;
    h.ports.publicProfileBySlug = async (slug) => {
      publicCalls += 1;
      if (publicCalls > 1) h.state.publicRows = [{ slug: SLUG }];
      return realPublic(slug);
    };
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.ok(publicCalls >= 2, "there must be a second, later public request to observe");
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.STILL_PUBLIC);
    assert.match(r.detail, /after stale-token testing/);
    assert.notEqual(h.state.saved.checkpoint, "verified-complete");
    assert.equal(h.state.saved.residualTokenTest.publicRecheckAt, null, "no recheck stamp without an ABSENT result");
  });

  test("final public UNKNOWN after residual testing refuses completion", async () => {
    const h = harness({ identity: null });
    seed(h, "auth-deletion-recorded");
    let publicCalls = 0;
    const realPublic = h.ports.publicProfileBySlug;
    h.ports.publicProfileBySlug = async (slug) => {
      publicCalls += 1;
      if (publicCalls > 1) h.state.publicReachable = false;
      return realPublic(slug);
    };
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.PUBLIC_STATE_UNKNOWN);
    assert.notEqual(h.state.saved.checkpoint, "verified-complete");
  });

  test("the recorded completion order is auth deletion, then outcomes, then recheck", async () => {
    const h = harness({ identity: null });
    seed(h, "profile-absent");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, true, `${r.refusal} ${r.detail ?? ""}`);
    const inv = h.state.saved;
    assert.ok(inv.authDeletion.recordedAt, "Auth deletion recorded");
    assert.ok(inv.residualTokenTest.testedAt, "stale-token outcome recorded");
    assert.ok(inv.residualTokenTest.publicRecheckAt, "public re-check recorded");
    assert.equal(inv.checkpoint, "verified-complete");
  });
});

// ───── HIGH 3: residual obligations survive resume ─────

describe("orchestrator — residual obligations are monotonic across runs (HIGH 3)", () => {
  /**
   * Seeds auth-deletion-recorded plus a residual record from an earlier run.
   *
   * A probe key implies a generation, so `probeObjectKey` alone is expanded into a schema-valid pair
   * attributed to an earlier run. That is what a resume actually loads.
   */
  const EARLIER_RUN = "run-earlierrun001";

  function seedWithResidual(h, residual) {
    if (residual.probeObjectKey && residual.probeGeneration === undefined) {
      residual = { ...residual, probeGeneration: EARLIER_RUN };
    }
    const inv = seed(h, "auth-deletion-recorded");
    inv.residualTokenTest = {
      testedAt: T,
      readCapable: false,
      writeCapable: false,
      probeObjectKey: null,
      probeGeneration: null,
      probeRemovedGeneration: null,
      probeRemovedAt: null,
      tokenExpiryPassedAt: null,
      publicRecheckAt: null,
      adminCrossCheckAt: null,
      ...residual,
    };
    h.state.saved = clone(inv);
    return inv;
  }

  test("a prior READ capability survives a later no", async () => {
    const h = harness({ identity: null, answers: { staleRead: "no", staleWrite: "no", expiryPassed: "no" } });
    seedWithResidual(h, { readCapable: true });
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(h.state.saved.residualTokenTest.readCapable, true, "an observed capability is never un-observed");
    assert.notEqual(r.checkpoint, "verified-complete");
    assert.match(r.outstanding, /expiry window/);
  });

  test("a prior WRITE capability survives a later no", async () => {
    const h = harness({ identity: null, answers: { staleRead: "no", staleWrite: "no", expiryPassed: "no" } });
    seedWithResidual(h, { writeCapable: true });
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(h.state.saved.residualTokenTest.writeCapable, true);
    assert.notEqual(r.checkpoint, "verified-complete");
  });

  test("an unremoved probe object survives a run whose input omits it", async () => {
    const h = harness({
      identity: null,
      // This run answers no/no and is never asked for a new probe key; the outstanding one must
      // still be there, and still unresolved.
      answers: { staleRead: "no", staleWrite: "no", expiryPassed: "yes", probeRemoved: "no" },
    });
    seedWithResidual(h, { writeCapable: true, probeObjectKey: `${UID}/probe.png` });
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(h.state.saved.residualTokenTest.probeObjectKey, `${UID}/probe.png`);
    assert.equal(h.state.saved.residualTokenTest.probeRemovedAt, null);
    assert.match(r.outstanding, /probe object/);
    assert.notEqual(h.state.saved.checkpoint, "verified-complete");
  });

  test("an unresolved expiry obligation survives and blocks completion", async () => {
    const h = harness({ identity: null, answers: { staleRead: "no", staleWrite: "no", expiryPassed: "no" } });
    seedWithResidual(h, { readCapable: true, writeCapable: true });
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(h.state.saved.residualTokenTest.tokenExpiryPassedAt, null);
    assert.notEqual(r.checkpoint, "verified-complete");
  });

  test("resuming repeatedly never discharges an obligation by attrition", async () => {
    // Three runs, each answering no/no. The inherited WRITE capability and its probe must still be
    // outstanding at the end of all of them.
    let saved = null;
    for (let i = 0; i < 3; i += 1) {
      const h = harness({
        identity: null,
        answers: { staleRead: "no", staleWrite: "no", expiryPassed: "no", probeRemoved: "no" },
      });
      if (saved === null) {
        seedWithResidual(h, { writeCapable: true, probeObjectKey: `${UID}/probe.png` });
      } else {
        h.state.saved = clone(saved);
      }
      const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
      assert.notEqual(r.checkpoint, "verified-complete", `run ${i + 1} must not complete`);
      saved = h.state.saved;
      assert.equal(saved.residualTokenTest.writeCapable, true, `run ${i + 1} kept the capability`);
      assert.equal(saved.residualTokenTest.probeRemovedAt, null, `run ${i + 1} kept the probe obligation`);
    }
  });

  test("obligations CAN be discharged, one positive confirmation at a time", async () => {
    // The mirror of the tests above: monotonic must not mean unresolvable.
    const h1 = harness({
      identity: null,
      answers: { staleRead: "no", staleWrite: "no", expiryPassed: "yes", probeRemoved: "no", crossChecked: "yes" },
    });
    seedWithResidual(h1, { writeCapable: true, probeObjectKey: `${UID}/probe.png` });
    const first = await run(h1, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.notEqual(first.checkpoint, "verified-complete");
    assert.ok(h1.state.saved.residualTokenTest.tokenExpiryPassedAt, "expiry resolved");

    const h2 = harness({ identity: null, answers: { staleRead: "no", staleWrite: "no", probeRemoved: "yes" } });
    h2.state.saved = clone(h1.state.saved);
    const second = await run(h2, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(second.ok, true, `${second.refusal} ${second.detail ?? ""}`);
    assert.equal(second.checkpoint, "verified-complete");
    assert.ok(h2.state.saved.residualTokenTest.probeRemovedAt, "probe removal resolved");
  });

  test("an inherited obligation is announced, not silently carried", async () => {
    const h = harness({ identity: null, answers: { staleRead: "no", staleWrite: "no", expiryPassed: "no" } });
    seedWithResidual(h, { writeCapable: true, probeObjectKey: `${UID}/probe.png` });
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.ok(
      r.steps.some((s) => /carrying forward from an earlier run/.test(s)),
      "the operator must be told what this run inherited"
    );
  });
});

// ───── MEDIUM 1: probe key path containment ─────

describe("orchestrator — the probe object key obeys path containment (MEDIUM 1)", () => {
  const withCapability = { staleRead: "no", staleWrite: "yes", expiryPassed: "yes", crossChecked: "yes" };

  test("a probe key under ANOTHER uid is refused and never recorded", async () => {
    const h = harness({
      identity: null,
      answers: { ...withCapability, probeKey: `${OTHER_UID}/probe.png` },
    });
    seed(h, "auth-deletion-recorded");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.FOREIGN_PATH);
    assert.equal(h.state.saved.residualTokenTest, null, "a foreign probe key must not be stored");
  });

  test("a prefix-sharing sibling namespace is refused", async () => {
    const h = harness({ identity: null, answers: { ...withCapability, probeKey: `${UID}2/probe.png` } });
    seed(h, "auth-deletion-recorded");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.refusal, REFUSAL.FOREIGN_PATH);
  });

  test("an encoded or traversal-shaped probe key is refused", async () => {
    for (const key of [`${UID}%2f..%2f${OTHER_UID}/x.png`, `${UID}/../${OTHER_UID}/x.png`, `/${UID}/x.png`]) {
      const h = harness({ identity: null, answers: { ...withCapability, probeKey: key } });
      seed(h, "auth-deletion-recorded");
      const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
      assert.equal(r.refusal, REFUSAL.FOREIGN_PATH, `${key} must be refused`);
    }
  });

  test("a malformed probe key is refused", async () => {
    for (const key of [`${UID}`, `${UID}/`, `${UID}//x.png`, `${UID}\\x.png`]) {
      const h = harness({ identity: null, answers: { ...withCapability, probeKey: key } });
      seed(h, "auth-deletion-recorded");
      const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
      assert.equal(r.refusal, REFUSAL.FOREIGN_PATH, `${JSON.stringify(key)} must be refused`);
    }
  });

  test("a well-formed probe key inside the owner namespace is accepted", async () => {
    const h = harness({
      identity: null,
      answers: { ...withCapability, probeKey: `${UID}/probe.png`, probeRemoved: "yes" },
    });
    seed(h, "auth-deletion-recorded");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, true, `${r.refusal} ${r.detail ?? ""}`);
    assert.equal(h.state.saved.residualTokenTest.probeObjectKey, `${UID}/probe.png`);
  });
});

// ───── HIGH: a recreated probe at the SAME key is a new obligation ─────

describe("orchestrator — a probe recreated at the same key does not inherit removal (HIGH)", () => {
  const SAME_KEY = `${UID}/probe.png`;
  const capable = { staleRead: "no", staleWrite: "yes", expiryPassed: "yes", crossChecked: "yes" };

  /** Run 1: a probe is written at SAME_KEY and confirmed removed. */
  async function firstRunWritesAndRemoves() {
    const h = harness({
      identity: null,
      runId: "run-firstrun00001",
      answers: { ...capable, probeKey: SAME_KEY, probeRemoved: "yes" },
    });
    seed(h, "auth-deletion-recorded");
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    return { h, r };
  }

  test("run 1 writes a probe at a key and resolves it", async () => {
    const { h, r } = await firstRunWritesAndRemoves();
    assert.equal(r.ok, true, `${r.refusal} ${r.detail ?? ""}`);
    const rec = h.state.saved.residualTokenTest;
    assert.equal(rec.probeObjectKey, SAME_KEY);
    assert.equal(rec.probeGeneration, "run-firstrun00001");
    assert.equal(rec.probeRemovedGeneration, "run-firstrun00001", "removal is attributed to that generation");
    assert.ok(rec.probeRemovedAt);
  });

  test("REGRESSION: a later run recreating the SAME key, reported NOT removed, keeps the operation open", async () => {
    // The defect: the new observation matched the prior key, so it inherited the prior
    // `probeRemovedAt` and the operation could complete while the founder was saying, in that same
    // run, that the newly written probe had not been cleaned up.
    const { h: first } = await firstRunWritesAndRemoves();
    const priorInventory = clone(first.state.saved);
    // Roll the checkpoint back to where a further residual run happens, keeping the residual record.
    priorInventory.checkpoint = "auth-deletion-recorded";
    priorInventory.evidence = priorInventory.evidence.filter((e) => e.checkpoint !== "verified-complete");
    priorInventory.finalVerification = null;

    const h = harness({
      identity: null,
      runId: "run-secondrun0001",
      answers: { ...capable, probeKey: SAME_KEY, probeRemoved: "no" },
    });
    h.state.saved = priorInventory;

    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.notEqual(r.checkpoint, "verified-complete", "a recreated probe must block completion");
    const rec = h.state.saved.residualTokenTest;
    assert.equal(rec.probeObjectKey, SAME_KEY);
    assert.equal(rec.probeGeneration, "run-secondrun0001", "the recreation mints a new generation");
    assert.equal(rec.probeRemovedGeneration, null, "the earlier removal must not carry over");
    assert.equal(rec.probeRemovedAt, null, "the earlier timestamp must not carry over");
    assert.match(r.outstanding, /removal is not recorded for that probe/);
  });

  test("the recreated probe CAN then be positively removed, and the obligation resolves", async () => {
    const { h: first } = await firstRunWritesAndRemoves();
    const rolled = clone(first.state.saved);
    rolled.checkpoint = "auth-deletion-recorded";
    rolled.evidence = rolled.evidence.filter((e) => e.checkpoint !== "verified-complete");
    rolled.finalVerification = null;

    const second = harness({
      identity: null,
      runId: "run-secondrun0001",
      answers: { ...capable, probeKey: SAME_KEY, probeRemoved: "no" },
    });
    second.state.saved = rolled;
    const open = await run(second, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.notEqual(open.checkpoint, "verified-complete");

    // A third run confirms removal of the OUTSTANDING generation.
    const third = harness({
      identity: null,
      runId: "run-thirdrun00001",
      answers: { staleRead: "no", staleWrite: "no", probeRemoved: "yes" },
    });
    third.state.saved = clone(second.state.saved);
    const done = await run(third, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(done.ok, true, `${done.refusal} ${done.detail ?? ""}`);
    assert.equal(done.checkpoint, "verified-complete");
    const rec = third.state.saved.residualTokenTest;
    assert.equal(rec.probeRemovedGeneration, "run-secondrun0001", "resolution names the outstanding generation");
    assert.ok(rec.probeRemovedAt);
  });

  test("a DIFFERENT probe key still behaves correctly", async () => {
    const { h: first } = await firstRunWritesAndRemoves();
    const rolled = clone(first.state.saved);
    rolled.checkpoint = "auth-deletion-recorded";
    rolled.evidence = rolled.evidence.filter((e) => e.checkpoint !== "verified-complete");
    rolled.finalVerification = null;

    const h = harness({
      identity: null,
      runId: "run-secondrun0001",
      answers: { ...capable, probeKey: `${UID}/probe-2.png`, probeRemoved: "no" },
    });
    h.state.saved = rolled;
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.notEqual(r.checkpoint, "verified-complete");
    const rec = h.state.saved.residualTokenTest;
    assert.equal(rec.probeObjectKey, `${UID}/probe-2.png`);
    assert.equal(rec.probeRemovedGeneration, null);
  });

  test("resume preserves the NEWEST unresolved generation across several runs", async () => {
    const { h: first } = await firstRunWritesAndRemoves();
    let saved = clone(first.state.saved);
    saved.checkpoint = "auth-deletion-recorded";
    saved.evidence = saved.evidence.filter((e) => e.checkpoint !== "verified-complete");
    saved.finalVerification = null;

    // Run 2 recreates the same key and leaves it unresolved.
    const second = harness({
      identity: null,
      runId: "run-secondrun0001",
      answers: { ...capable, probeKey: SAME_KEY, probeRemoved: "no" },
    });
    second.state.saved = saved;
    await run(second, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    saved = clone(second.state.saved);
    assert.equal(saved.residualTokenTest.probeGeneration, "run-secondrun0001");

    // Runs 3 and 4 answer "not removed"; the newest generation must persist untouched and unresolved.
    for (const runId of ["run-thirdrun00001", "run-fourthrun0001"]) {
      const h = harness({ identity: null, runId, answers: { staleRead: "no", staleWrite: "no", probeRemoved: "no" } });
      h.state.saved = clone(saved);
      const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
      assert.notEqual(r.checkpoint, "verified-complete", `${runId} must not complete`);
      saved = clone(h.state.saved);
      assert.equal(saved.residualTokenTest.probeGeneration, "run-secondrun0001", `${runId} kept the newest generation`);
      assert.equal(saved.residualTokenTest.probeRemovedGeneration, null, `${runId} kept it unresolved`);
    }
  });

  test("a stored inventory whose removal names a stale generation is refused as corrupt", async () => {
    // Belt and braces: even hand-edited, removal evidence for a generation that is not the current
    // one cannot sit in a valid inventory.
    const h = harness({ identity: null });
    const inv = seed(h, "auth-deletion-recorded");
    inv.residualTokenTest = {
      testedAt: T,
      readCapable: false,
      writeCapable: true,
      probeObjectKey: SAME_KEY,
      probeGeneration: "run-currentgen001",
      probeRemovedGeneration: "run-staleoldgen01",
      probeRemovedAt: T,
      tokenExpiryPassedAt: T,
      publicRecheckAt: null,
      adminCrossCheckAt: T,
    };
    h.state.saved = clone(inv);
    const r = await run(h, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.INVENTORY_CORRUPT);
  });
});

// ───── P1: a pre-lock snapshot must never outlive the lock wait ─────

describe("orchestrator — a stale pre-lock inventory cannot overwrite newer state (P1)", () => {
  /**
   * One shared "disk" both runs read and write, so a stale snapshot has something newer to clobber.
   *
   * `persist` validates, exactly as the real store does, and `load` returns a fresh copy — so a run
   * that keeps its own object cannot accidentally share structure with the disk and appear correct.
   */
  function sharedDisk(initial) {
    const disk = { current: clone(initial), writes: 0 };
    const wire = (h) => {
      h.ports.persist = (inv) => {
        h.calls.push("persist");
        const shape = validateInventory(inv);
        if (!shape.ok) return { ok: false, problems: shape.problems };
        disk.current = clone(inv);
        disk.writes += 1;
        h.state.saved = clone(inv);
        return { ok: true, path: "(disk)" };
      };
      h.ports.load = (id) => {
        h.calls.push(`load(${id})`);
        if (!disk.current) return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, problems: ["not found"] };
        const shape = validateInventory(disk.current);
        if (!shape.ok) return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, problems: shape.problems };
        return { ok: true, inventory: clone(disk.current) };
      };
      return h;
    };
    return { disk, wire };
  }

  /**
   * Gates a run's lock acquisition on a promise, which is how the two runs are made to interleave the
   * way the report describes: B starts, does whatever it does before the lock, then waits; A runs to
   * completion and commits; only then is B admitted.
   */
  function gateLock(h, gate) {
    h.ports.withLock = async (identity, fn) => {
      h.calls.push("withLock:waiting");
      await gate;
      h.calls.push("withLock:acquired");
      return { ok: true, result: await fn() };
    };
  }

  /** An operation parked at auth-deletion-recorded with nothing residual recorded yet. */
  function initialInventory() {
    const probe = harness({ identity: null });
    return seed(probe, "auth-deletion-recorded");
  }

  test("REGRESSION: B, which loaded before A committed, must not erase A's new obligation", async () => {
    const { disk, wire } = sharedDisk(initialInventory());

    // ── B starts first and blocks at the lock ──
    let admitB;
    const bGate = new Promise((resolve) => {
      admitB = resolve;
    });
    const b = wire(
      harness({
        identity: null,
        runId: "run-brunbbbbbbbbbb",
        // B saw no residual obligation when it started, so it answers no to everything it is
        // asked. That it is asked about expiry and a probe at all is already evidence it reloaded.
        answers: { staleRead: "no", staleWrite: "no", expiryPassed: "no", probeRemoved: "no" },
      })
    );
    gateLock(b, bGate);
    const bPromise = run(b, { mode: MODE.VERIFY_PUBLIC, operationId: OP });

    // Let B reach the lock. Its pre-lock discovery read has happened by now.
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
    assert.ok(b.calls.includes("withLock:waiting"), "B must be waiting on the lock");
    assert.ok(!b.calls.includes("withLock:acquired"));

    // ── A runs to completion while B waits, and records a NEW obligation ──
    const a = wire(
      harness({
        identity: null,
        runId: "run-arunaaaaaaaaaa",
        answers: {
          staleRead: "no",
          staleWrite: "yes",
          expiryPassed: "no",
          probeKey: `${UID}/probe.png`,
          probeRemoved: "no",
        },
      })
    );
    const aResult = await run(a, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.notEqual(aResult.checkpoint, "verified-complete", "A leaves the operation open");
    assert.equal(disk.current.residualTokenTest.writeCapable, true, "A committed a WRITE capability");
    assert.equal(disk.current.residualTokenTest.probeGeneration, "run-arunaaaaaaaaaa");

    // ── B is now admitted, and must work from A's committed state ──
    admitB();
    const bResult = await bPromise;

    assert.notEqual(bResult.checkpoint, "verified-complete", "B must NOT complete over A's obligation");
    const final = disk.current.residualTokenTest;
    assert.equal(final.writeCapable, true, "A's WRITE capability must survive B");
    assert.equal(final.probeObjectKey, `${UID}/probe.png`, "A's probe must survive B");
    assert.equal(final.probeGeneration, "run-arunaaaaaaaaaa", "A's probe generation must survive B");
    assert.equal(final.probeRemovedGeneration, null, "the cleanup obligation must remain unresolved");
    assert.equal(final.tokenExpiryPassedAt, null, "the expiry obligation must remain unresolved");
  });

  test("the waiting run RELOADS the inventory after acquiring the lock", async () => {
    const { disk, wire } = sharedDisk(initialInventory());
    let admit;
    const gate = new Promise((r) => {
      admit = r;
    });
    const b = wire(harness({ identity: null, runId: "run-brunbbbbbbbbbb", answers: { staleRead: "no", staleWrite: "no", probeRemoved: "no" } }));
    gateLock(b, gate);
    const bPromise = run(b, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));

    const loadsBeforeLock = b.calls.filter((c) => c.startsWith("load(")).length;
    admit();
    await bPromise;
    const loadsTotal = b.calls.filter((c) => c.startsWith("load(")).length;
    assert.ok(loadsTotal > loadsBeforeLock, "a load must occur AFTER the lock is acquired");

    const acquiredAt = b.calls.indexOf("withLock:acquired");
    const loadAfter = b.calls.findIndex((c, i) => i > acquiredAt && c.startsWith("load("));
    assert.ok(loadAfter > acquiredAt, "the authoritative load is inside the lock");
    assert.ok(disk.writes > 0);
  });

  test("a newer CHECKPOINT committed while a run waits is respected, not rewound", async () => {
    const { disk, wire } = sharedDisk(initialInventory());
    let admit;
    const gate = new Promise((r) => {
      admit = r;
    });
    // B would have asked the residual questions had it kept its stale snapshot.
    const b = wire(harness({ identity: null, runId: "run-brunbbbbbbbbbb" }));
    gateLock(b, gate);
    const bPromise = run(b, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));

    // A completes the operation entirely.
    const a = wire(harness({ identity: null, runId: "run-arunaaaaaaaaaa" }));
    const aResult = await run(a, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(aResult.checkpoint, "verified-complete", `${aResult.refusal} ${aResult.detail ?? ""}`);

    const promptsBefore = b.calls.filter((c) => c === "prompt").length;
    admit();
    const bResult = await bPromise;

    assert.equal(bResult.checkpoint, "verified-complete", "B must see the newer checkpoint");
    assert.equal(disk.current.checkpoint, "verified-complete");
    assert.equal(
      b.calls.filter((c) => c === "prompt").length,
      promptsBefore,
      "B must not re-ask the residual questions for an already-completed operation"
    );
  });

  test("a newer residual READ capability survives a waiting run answering no", async () => {
    const { disk, wire } = sharedDisk(initialInventory());
    let admit;
    const gate = new Promise((r) => {
      admit = r;
    });
    const b = wire(harness({ identity: null, runId: "run-brunbbbbbbbbbb", answers: { staleRead: "no", staleWrite: "no", expiryPassed: "no" } }));
    gateLock(b, gate);
    const bPromise = run(b, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));

    const a = wire(
      harness({
        identity: null,
        runId: "run-arunaaaaaaaaaa",
        answers: { staleRead: "yes", staleWrite: "no", expiryPassed: "no", probeKey: "none" },
      })
    );
    await run(a, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    assert.equal(disk.current.residualTokenTest.readCapable, true);

    admit();
    const bResult = await bPromise;
    assert.equal(disk.current.residualTokenTest.readCapable, true, "a recorded READ capability is never un-recorded");
    assert.notEqual(bResult.checkpoint, "verified-complete");
  });

  test("no stale in-memory inventory is persisted after the lock is acquired", async () => {
    // The sharpest form of the invariant: every write B makes must be derived from what it read under
    // the lock, so A's fields are present in each of them.
    const { disk, wire } = sharedDisk(initialInventory());
    let admit;
    const gate = new Promise((r) => {
      admit = r;
    });
    const b = wire(harness({ identity: null, runId: "run-brunbbbbbbbbbb", answers: { staleRead: "no", staleWrite: "no", probeRemoved: "no" } }));
    const written = [];
    gateLock(b, gate);
    const bPromise = run(b, { mode: MODE.VERIFY_PUBLIC, operationId: OP });
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));

    const a = wire(
      harness({
        identity: null,
        runId: "run-arunaaaaaaaaaa",
        answers: { staleRead: "no", staleWrite: "yes", expiryPassed: "no", probeKey: `${UID}/probe.png`, probeRemoved: "no" },
      })
    );
    await run(a, { mode: MODE.VERIFY_PUBLIC, operationId: OP });

    // Record every inventory B persists from here on.
    const bPersist = b.ports.persist;
    b.ports.persist = (inv) => {
      written.push(clone(inv));
      return bPersist(inv);
    };

    admit();
    await bPromise;

    assert.ok(written.length > 0, "B must have written something for this to mean anything");
    for (const [i, inv] of written.entries()) {
      assert.equal(inv.residualTokenTest?.writeCapable, true, `B write ${i} dropped A's WRITE capability`);
      assert.equal(inv.residualTokenTest?.probeObjectKey, `${UID}/probe.png`, `B write ${i} dropped A's probe`);
    }
    assert.equal(disk.current.residualTokenTest.probeGeneration, "run-arunaaaaaaaaaa");
  });
});
