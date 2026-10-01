/**
 * The six-checkpoint deletion state model, the strict inventory schema, and reconciliation.
 *
 * ── WHAT A CHECKPOINT IS, AND IS NOT ─────────────────────────────────────────────
 *
 * A checkpoint records that evidence was obtained *at a point in time*. It is NOT a licence to
 * skip preconditions on resume. Every destructive transition re-proves its facts against a fresh
 * observation, because the world changes between runs — a stale edit form can republish, another
 * session can upload, a row can be recreated.
 *
 * So `canTransition` takes freshly-gathered evidence, not just the stored checkpoint.
 *
 * ── VERIFIED ABSENCE, NOT ACKNOWLEDGEMENT ────────────────────────────────────────
 *
 * Nothing here accepts a delete response as proof. An object is `verified-absent` only once an
 * *authorized, complete* enumeration no longer lists it. A delete call that returns 200 moves a
 * key to `pending-verification`, never to absent. This is the single most important rule in the
 * module, and it is why the media-replacement helper in the app (which reasons about delete
 * acknowledgements) is deliberately not reused here.
 *
 * ── AND NOT ACKNOWLEDGEMENT OF READING, EITHER ───────────────────────────────────
 *
 * `verified-complete` cannot be reached by confirming that a caveat was read. It requires recorded
 * *outcomes*: which uid was deleted, what a pre-deletion token could still read and write, and —
 * when any capability remained — that the expiry window passed, the probe object was removed, the
 * public check was re-run, and an admin-side cross-check was attested. See
 * `residualTokenOutcomeSatisfied`.
 */
import { REFUSAL, isExactlyOwnedPath } from "./binding.mjs";

/**
 * Bumped from 1 for the strict schema. A version-1 file on disk is refused rather than migrated:
 * there are no live operations, and silently upgrading a deletion inventory is exactly the kind of
 * convenience that turns a corrupt record into a destructive action.
 */
export const INVENTORY_FORMAT_VERSION = 2;

/** Ordered checkpoints. Index order is the only legal forward direction. */
export const CHECKPOINTS = [
  "bound",
  "inventory-ready",
  "media-absent",
  "profile-absent",
  "auth-deletion-recorded",
  "verified-complete",
];

export const KEY_STATE = {
  PENDING: "pending",
  PENDING_VERIFICATION: "pending-verification",
  UNKNOWN: "unknown",
  VERIFIED_ABSENT: "verified-absent",
};

export function checkpointIndex(name) {
  return CHECKPOINTS.indexOf(name);
}

/**
 * Merges a newly observed residual-token outcome into whatever a previous run recorded.
 *
 * ── WHY THIS IS NOT A REPLACEMENT ────────────────────────────────────────────────
 *
 * An obligation, once incurred, is not discharged by a later run failing to observe it. If run 1
 * found a pre-deletion token could still WRITE, that happened; run 2 answering "no" means only that
 * run 2 did not reproduce it — perhaps because the token it used had since expired, perhaps because
 * it tested a different one. Overwriting the record would silently erase the cleanup that was still
 * owed, and the operation would complete with a probe object still sitting in the bucket.
 *
 * So capability is **monotonic**: once observed it stays observed. Each obligation has exactly one
 * resolution transition, and only a positive observation performs it:
 *
 *   readCapable / writeCapable   false -> true on any observation of capability; NEVER true -> false
 *   probeObjectKey               the key of the CURRENT probe generation, or null
 *   probeGeneration              identity of that generation; a new one is minted every time a
 *                                probe is reported to exist, even at a key used before
 *   probeRemovedGeneration       the generation whose removal was positively confirmed
 *   probeRemovedAt               timestamp of that confirmation
 *   tokenExpiryPassedAt          null -> timestamp, only on positive confirmation the windows passed
 *   adminCrossCheckAt            null -> timestamp, only on positive confirmation of the cross-check
 *   publicRecheckAt              stamped ONLY from a real public request (see the orchestrator)
 *
 * Only one outstanding probe object is tracked. A second probe cannot be recorded while the first is
 * unresolved — the caller asks about the outstanding one instead of offering a new one.
 *
 * ── WHY THE PROBE NEEDS A GENERATION, NOT JUST A KEY ─────────────────────────────
 *
 * Removal evidence belongs to a specific object, not to a path. A probe written to a key, removed,
 * and then written to that SAME key again is a second object that happens to reuse the name — and
 * the first removal says nothing about it. Matching on the key alone let the recreated probe inherit
 * the earlier `probeRemovedAt`, so an operation could complete while the founder was saying, in that
 * very run, that the new probe had NOT been removed.
 *
 * So each reported existence mints a `probeGeneration`, and cleanup is satisfied only when
 * `probeRemovedGeneration === probeGeneration`. Same key plus an old removal timestamp can no longer
 * discharge anything.
 */
export function mergeResidualOutcome(prior, observed) {
  if (prior === null || prior === undefined) return { ...observed };

  const readCapable = prior.readCapable === true || observed.readCapable === true;
  const writeCapable = prior.writeCapable === true || observed.writeCapable === true;

  let probeObjectKey = prior.probeObjectKey ?? null;
  let probeGeneration = prior.probeGeneration ?? null;
  let probeRemovedGeneration = prior.probeRemovedGeneration ?? null;
  let probeRemovedAt = prior.probeRemovedAt ?? null;

  // A NEW generation is a NEW obligation, whatever the key says. The key is deliberately absent from
  // this test: reusing a path is precisely the case the generation exists to distinguish.
  const reportsNewGeneration =
    typeof observed.probeObjectKey === "string" &&
    observed.probeObjectKey !== "" &&
    typeof observed.probeGeneration === "string" &&
    observed.probeGeneration !== "" &&
    observed.probeGeneration !== probeGeneration;

  if (reportsNewGeneration) {
    probeObjectKey = observed.probeObjectKey;
    probeGeneration = observed.probeGeneration;
    // Removal carries over ONLY if this observation confirms removal of this same generation.
    const confirmsOwnRemoval = observed.probeRemovedGeneration === observed.probeGeneration;
    probeRemovedGeneration = confirmsOwnRemoval ? observed.probeGeneration : null;
    probeRemovedAt = confirmsOwnRemoval ? (observed.probeRemovedAt ?? null) : null;
  } else if (probeObjectKey !== null && probeRemovedGeneration !== probeGeneration) {
    // The prior generation is still outstanding; only a confirmation naming IT resolves it.
    if (observed.probeRemovedGeneration === probeGeneration) {
      probeRemovedGeneration = probeGeneration;
      probeRemovedAt = observed.probeRemovedAt ?? null;
    }
  }

  return {
    testedAt: observed.testedAt ?? prior.testedAt,
    readCapable,
    writeCapable,
    probeObjectKey,
    probeGeneration,
    probeRemovedGeneration,
    probeRemovedAt,
    tokenExpiryPassedAt: prior.tokenExpiryPassedAt ?? observed.tokenExpiryPassedAt ?? null,
    publicRecheckAt: observed.publicRecheckAt ?? prior.publicRecheckAt ?? null,
    adminCrossCheckAt: prior.adminCrossCheckAt ?? observed.adminCrossCheckAt ?? null,
  };
}

/**
 * Whether an outstanding probe blocks recording a new one.
 *
 * Exported so the caller can refuse at input time with a useful message rather than silently
 * dropping one of two probe objects.
 */
export function hasUnresolvedProbe(test) {
  if (test === null || typeof test !== "object") return false;
  if (typeof test.probeObjectKey !== "string" || test.probeObjectKey === "") return false;
  // Outstanding unless the removal evidence names THIS generation.
  const resolved =
    test.probeRemovedGeneration != null &&
    test.probeRemovedGeneration === test.probeGeneration &&
    Boolean(test.probeRemovedAt);
  return !resolved;
}

/**
 * Whether the residual-credential outcome is recorded and, where needed, resolved.
 *
 * Exported because it is the rule that decides whether an operation may complete, and it deserves
 * to be tested directly rather than only through the orchestrator.
 *
 * The shape of the rule: a recorded outcome of "no residual capability" completes immediately. A
 * recorded outcome of "the token could still read or write" leaves the operation OPEN until the
 * expiry window has passed, any probe object has been removed, the public check has been re-run,
 * and a human has attested to the admin-side Storage/profile cross-check — because no programmatic
 * post-Auth check of the owner namespace is available.
 */
export function residualTokenOutcomeSatisfied(test) {
  if (test === null || typeof test !== "object" || Array.isArray(test)) {
    return { ok: false, detail: "no residual-token test outcome recorded" };
  }
  if (typeof test.readCapable !== "boolean" || typeof test.writeCapable !== "boolean") {
    return { ok: false, detail: "residual-token read/write outcomes not both recorded" };
  }
  if (!isIsoTimestamp(test.testedAt)) return { ok: false, detail: "residual-token test has no timestamp" };

  // Required in EVERY case, capability or not: the public surface must have been re-checked AFTER
  // the stale-token testing, not before it. Evidence gathered before the probes says nothing about
  // what the probes may have changed.
  if (!isIsoTimestamp(test.publicRecheckAt)) {
    return { ok: false, detail: "the public check was not re-run after the stale-token testing" };
  }

  if (test.readCapable === false && test.writeCapable === false) return { ok: true };

  if (!isIsoTimestamp(test.tokenExpiryPassedAt)) {
    return { ok: false, detail: "residual capability remained and the token expiry window has not been recorded as passed" };
  }
  if (typeof test.probeObjectKey === "string" && test.probeObjectKey !== "") {
    // Removal evidence must belong to the CURRENT generation, not to an earlier object that happened
    // to use the same key. A bare `probeRemovedAt` is not enough.
    if (test.probeRemovedGeneration == null || test.probeRemovedGeneration !== test.probeGeneration) {
      return { ok: false, detail: "a probe object was created and its removal is not recorded for that probe" };
    }
    if (!isIsoTimestamp(test.probeRemovedAt)) {
      return { ok: false, detail: "a probe object was created and its removal is not recorded" };
    }
  }
  if (!isIsoTimestamp(test.adminCrossCheckAt)) {
    return { ok: false, detail: "residual capability remained and the admin cross-check is not recorded" };
  }
  return { ok: true };
}

/**
 * Whether a transition is allowed, given FRESH evidence.
 *
 * Every field is required to be positively true; absent or falsy evidence is a refusal, never an
 * assumption.
 */
export function canTransition(from, to, evidence = {}) {
  const fromIdx = checkpointIndex(from);
  const toIdx = checkpointIndex(to);

  if (fromIdx < 0 || toIdx < 0) {
    return { ok: false, refusal: REFUSAL.TRANSITION_NOT_ELIGIBLE, detail: "unknown checkpoint" };
  }
  if (toIdx !== fromIdx + 1) {
    return {
      ok: false,
      refusal: REFUSAL.TRANSITION_NOT_ELIGIBLE,
      detail: toIdx <= fromIdx ? "not a forward transition" : "cannot skip checkpoints",
    };
  }
  if (evidence.bindingValid !== true) {
    return { ok: false, refusal: REFUSAL.AUTH_VALIDATION_FAILED, detail: "binding not re-validated" };
  }

  switch (to) {
    case "inventory-ready": {
      if (evidence.freshAuthValidated !== true) {
        return { ok: false, refusal: REFUSAL.AUTH_VALIDATION_FAILED, detail: "no fresh auth validation" };
      }
      if (evidence.profileUnpublishedOrAbsent !== true) {
        return { ok: false, refusal: REFUSAL.TRANSITION_NOT_ELIGIBLE, detail: "profile not unpublished/absent" };
      }
      if (evidence.publicState !== "absent") {
        return {
          ok: false,
          refusal: evidence.publicState === "exposed" ? REFUSAL.STILL_PUBLIC : REFUSAL.PUBLIC_STATE_UNKNOWN,
          detail: `public state is ${evidence.publicState ?? "unreported"}`,
        };
      }
      if (evidence.enumerationComplete !== true) {
        return { ok: false, refusal: REFUSAL.ENUMERATION_INCOMPLETE };
      }
      if (evidence.operatorConfirmationsRecorded !== true) {
        return { ok: false, refusal: REFUSAL.TRANSITION_NOT_ELIGIBLE, detail: "operator confirmations not recorded" };
      }
      if (evidence.inventoryPersisted !== true) {
        return { ok: false, refusal: REFUSAL.TRANSITION_NOT_ELIGIBLE, detail: "inventory not durably persisted" };
      }
      return { ok: true };
    }
    case "media-absent": {
      if (evidence.freshAuthValidated !== true) {
        return { ok: false, refusal: REFUSAL.AUTH_VALIDATION_FAILED, detail: "no fresh auth validation" };
      }
      // Must be proven by a fresh, complete scan that returned nothing — not by delete acks.
      if (evidence.freshScanComplete !== true) return { ok: false, refusal: REFUSAL.ENUMERATION_INCOMPLETE };
      if (evidence.freshScanEmpty !== true) return { ok: false, refusal: REFUSAL.ABSENCE_UNPROVEN };
      if (evidence.unresolvedKeyStates !== 0) {
        return { ok: false, refusal: REFUSAL.ABSENCE_UNPROVEN, detail: "unresolved key states remain" };
      }
      return { ok: true };
    }
    case "profile-absent": {
      if (evidence.freshAuthValidated !== true) {
        return { ok: false, refusal: REFUSAL.AUTH_VALIDATION_FAILED, detail: "no fresh auth validation" };
      }
      if (evidence.profileConfirmedAbsent !== true) return { ok: false, refusal: REFUSAL.ABSENCE_UNPROVEN };
      if (evidence.freshScanComplete !== true) return { ok: false, refusal: REFUSAL.ENUMERATION_INCOMPLETE };
      if (evidence.freshScanEmpty !== true) {
        return { ok: false, refusal: REFUSAL.CONCURRENT_ACTIVITY, detail: "media reappeared" };
      }
      if (evidence.unresolvedKeyStates !== 0) {
        return { ok: false, refusal: REFUSAL.ABSENCE_UNPROVEN, detail: "unresolved key states remain" };
      }
      return { ok: true };
    }
    case "auth-deletion-recorded": {
      // Founder-supplied, manual, and must name the exact bound uid.
      if (!evidence.boundUid || evidence.founderConfirmedUid !== evidence.boundUid) {
        return { ok: false, refusal: REFUSAL.UID_MISMATCH, detail: "confirmed uid does not match bound uid" };
      }
      if (evidence.manualAcknowledgement !== true) {
        return { ok: false, refusal: REFUSAL.TRANSITION_NOT_ELIGIBLE, detail: "no manual acknowledgement" };
      }
      if (evidence.ownerProofRecorded !== true) {
        return { ok: false, refusal: REFUSAL.ABSENCE_UNPROVEN, detail: "no recorded owner-authorised absence proof" };
      }
      return { ok: true };
    }
    case "verified-complete": {
      // Deliberately NOT accepting `finalProfileAbsent: true` / `finalMediaScanClean: true` as
      // caller-asserted booleans. Those facts are only as good as the evidence behind them, so the
      // evidence is what is required: the recorded owner-authorised proof taken before Auth
      // deletion, plus a human attestation of the admin-side cross-check that this tool cannot
      // perform. Acknowledging that a caveat was read is not evidence of anything.
      if (evidence.ownerProofRecorded !== true) {
        return { ok: false, refusal: REFUSAL.ABSENCE_UNPROVEN, detail: "no recorded owner-authorised absence proof" };
      }
      if (evidence.authDeletionRecorded !== true) {
        return { ok: false, refusal: REFUSAL.TRANSITION_NOT_ELIGIBLE, detail: "manual Auth deletion not recorded" };
      }
      if (evidence.publicState !== "absent") {
        return {
          ok: false,
          refusal: evidence.publicState === "exposed" ? REFUSAL.STILL_PUBLIC : REFUSAL.PUBLIC_STATE_UNKNOWN,
          detail: `fresh public state is ${evidence.publicState ?? "unreported"}`,
        };
      }
      if (evidence.residualTokenOutcomeSatisfied !== true) {
        return {
          ok: false,
          refusal: REFUSAL.ABSENCE_UNPROVEN,
          detail: evidence.residualTokenDetail ?? "residual-token outcome not recorded or not resolved",
        };
      }
      if (evidence.adminCrossCheckAttested !== true) {
        return {
          ok: false,
          refusal: REFUSAL.ABSENCE_UNPROVEN,
          detail: "no founder attestation of the admin-side Storage/profile cross-check",
        };
      }
      return { ok: true };
    }
    default:
      return { ok: false, refusal: REFUSAL.TRANSITION_NOT_ELIGIBLE, detail: "no rule for target" };
  }
}

/**
 * Rolls state backward when facts regress.
 *
 * Used when a fresh scan finds media that should be gone, or profile activity appears. The
 * operation must never silently advance past a regression, and must never "remember" that it had
 * once proven absence. Downstream evidence and completion state are dropped with the checkpoint.
 */
export function invalidateDownstream(inventory, toCheckpoint, reason) {
  const targetIdx = checkpointIndex(toCheckpoint);
  const currentIdx = checkpointIndex(inventory.checkpoint);
  if (targetIdx < 0) return inventory;
  if (targetIdx >= currentIdx) return inventory;

  return {
    ...inventory,
    checkpoint: toCheckpoint,
    // Any key previously believed absent must be re-proven.
    keyStates: Object.fromEntries(
      Object.entries(inventory.keyStates ?? {}).map(([k, v]) => [
        k,
        v === KEY_STATE.VERIFIED_ABSENT ? KEY_STATE.UNKNOWN : v,
      ])
    ),
    // Evidence for checkpoints we no longer hold is dropped, so a later run cannot read it back as
    // a standing proof.
    evidence: (inventory.evidence ?? []).filter((e) => checkpointIndex(e.checkpoint) <= targetIdx),
    authDeletion: targetIdx >= checkpointIndex("auth-deletion-recorded") ? inventory.authDeletion : null,
    residualTokenTest: targetIdx >= checkpointIndex("auth-deletion-recorded") ? inventory.residualTokenTest : null,
    finalVerification: null,
    invalidations: [
      ...(inventory.invalidations ?? []),
      { at: new Date().toISOString(), from: inventory.checkpoint, to: toCheckpoint, reason: String(reason).slice(0, 300) },
    ],
  };
}

/**
 * Reconciles recorded key states against a fresh authorized scan.
 *
 * Only a complete scan can prove absence. An incomplete scan leaves every non-absent key `unknown`
 * and reports `provenAbsent: false`, so the caller cannot advance.
 *
 * `regressed` is reported separately from `unexpected`: a key that was already **proven absent**
 * and is now listed again is not a new upload to be cleaned up, it is a contradiction of evidence
 * this operation already recorded. The caller must stop, not delete it again.
 */
export function reconcileMediaState(inventory, freshScan) {
  const recorded = Object.keys(inventory.keyStates ?? {});
  const live = new Set(Array.isArray(freshScan?.keys) ? freshScan.keys : []);
  const complete = freshScan?.complete === true;

  const keyStates = {};
  const regressed = [];
  for (const key of recorded) {
    const was = inventory.keyStates[key];
    if (live.has(key)) {
      if (was === KEY_STATE.VERIFIED_ABSENT) regressed.push(key);
      keyStates[key] = KEY_STATE.PENDING;
    } else if (complete) {
      keyStates[key] = KEY_STATE.VERIFIED_ABSENT;
    } else {
      keyStates[key] = KEY_STATE.UNKNOWN;
    }
  }

  // Anything live but never recorded appeared after the inventory was taken.
  const unexpected = [...live].filter((k) => !recorded.includes(k));
  for (const key of unexpected) keyStates[key] = KEY_STATE.PENDING;

  const remaining = Object.entries(keyStates)
    .filter(([, v]) => v === KEY_STATE.PENDING)
    .map(([k]) => k)
    .sort();
  const unresolved = Object.values(keyStates).filter((v) => v === KEY_STATE.UNKNOWN).length;

  return {
    keyStates,
    remaining,
    unexpected: unexpected.sort(),
    regressed: regressed.sort(),
    unresolvedCount: unresolved,
    provenAbsent: complete && remaining.length === 0 && unresolved === 0 && regressed.length === 0,
  };
}

/**
 * Reconciles the profile row against a fresh read, including the ambiguous case where a delete
 * response was lost.
 *
 * Resolution is always by bound uid, never by slug. A row whose id differs from the bound one is
 * `replacement`: the original was deleted and something new exists at this identity, which is
 * concurrent activity, not the target.
 */
export function reconcileProfileState({ readOk, rowPresent, rowId, boundUid, boundRowId, observedOwnerUid }) {
  if (readOk !== true) {
    return { state: "unknown", refusal: REFUSAL.ABSENCE_UNPROVEN, detail: "profile read not authorized/complete" };
  }
  if (rowPresent !== true) {
    return { state: "absent" };
  }
  if (observedOwnerUid !== boundUid) {
    // A row exists at this slug/id but belongs to someone else. Never touch it.
    return { state: "foreign", refusal: REFUSAL.UID_MISMATCH };
  }
  if (boundRowId != null && rowId != null && rowId !== boundRowId) {
    return { state: "replacement", refusal: REFUSAL.PROFILE_ROW_UNEXPECTED, rowId };
  }
  return { state: "present", rowId: rowId ?? null };
}

// ──────────────────────────────────────────── the strict inventory schema ──

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATION_ID_RE = /^op-[0-9a-zA-Z-]{8,}$/;
const ENVIRONMENT_RE = /^[0-9a-f]{16}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const RUN_ID_RE = /^run-[0-9a-zA-Z-]{8,}$/;

const MAX_KEYS = 10000;
const MAX_EVIDENCE = 64;
const MAX_INVALIDATIONS = 64;
const MAX_KEY_LENGTH = 1024;
const MAX_REASON_LENGTH = 300;

function isIsoTimestamp(v) {
  return typeof v === "string" && ISO_RE.test(v);
}

/**
 * Validates one object against an exact field spec: every required key present and well-typed,
 * **no other keys at all**.
 *
 * This is where "arbitrary nested evidence objects", raw profile bodies, response dumps, and byte
 * arrays are refused — not by recognising them, but by leaving nowhere for them to go. A denylist
 * of shapes to reject always loses to the next shape; an exact schema does not.
 */
function exactObject(node, spec, path, problems) {
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    problems.push(`${path} must be an object`);
    return;
  }
  for (const key of Object.keys(node)) {
    if (!Object.prototype.hasOwnProperty.call(spec, key)) {
      problems.push(`${path}.${key} is not an allowed field`);
    }
  }
  for (const [key, check] of Object.entries(spec)) {
    const present = Object.prototype.hasOwnProperty.call(node, key);
    if (!present) {
      if (!check.optional) problems.push(`${path}.${key} is missing`);
      continue;
    }
    if (!check.test(node[key])) problems.push(`${path}.${key} is invalid`);
  }
}

const EVIDENCE_SPEC = {
  checkpoint: { test: (v) => checkpointIndex(v) >= 0 },
  at: { test: isIsoTimestamp },
  objects: { test: (v) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_KEYS, optional: true },
};

const INVALIDATION_SPEC = {
  at: { test: isIsoTimestamp },
  from: { test: (v) => checkpointIndex(v) >= 0 },
  to: { test: (v) => checkpointIndex(v) >= 0 },
  reason: { test: (v) => typeof v === "string" && v.length > 0 && v.length <= MAX_REASON_LENGTH },
};

const CONFIRMATIONS_SPEC = {
  runId: { test: (v) => typeof v === "string" && RUN_ID_RE.test(v) },
  quietWindowConfirmedAt: { test: isIsoTimestamp },
  phraseConfirmedAt: { test: isIsoTimestamp },
};

const AUTH_DELETION_SPEC = {
  recordedAt: { test: isIsoTimestamp },
  confirmedUid: { test: (v) => typeof v === "string" && UUID_RE.test(v) },
};

const RESIDUAL_SPEC = {
  testedAt: { test: isIsoTimestamp },
  readCapable: { test: (v) => typeof v === "boolean" },
  writeCapable: { test: (v) => typeof v === "boolean" },
  probeObjectKey: { test: (v) => v === null || (typeof v === "string" && v.length > 0 && v.length <= MAX_KEY_LENGTH) },
  probeGeneration: { test: (v) => v === null || (typeof v === "string" && RUN_ID_RE.test(v)) },
  probeRemovedGeneration: { test: (v) => v === null || (typeof v === "string" && RUN_ID_RE.test(v)) },
  probeRemovedAt: { test: (v) => v === null || isIsoTimestamp(v) },
  tokenExpiryPassedAt: { test: (v) => v === null || isIsoTimestamp(v) },
  publicRecheckAt: { test: (v) => v === null || isIsoTimestamp(v) },
  adminCrossCheckAt: { test: (v) => v === null || isIsoTimestamp(v) },
};

const FINAL_VERIFICATION_SPEC = {
  at: { test: isIsoTimestamp },
  publicState: { test: (v) => v === "absent" },
  adminCrossCheckAttestedAt: { test: isIsoTimestamp },
};

/** The top-level field set. Anything else is a refusal. */
const INVENTORY_SPEC = {
  formatVersion: { test: (v) => v === INVENTORY_FORMAT_VERSION },
  operationId: { test: (v) => typeof v === "string" && OPERATION_ID_RE.test(v) },
  environment: { test: (v) => typeof v === "string" && ENVIRONMENT_RE.test(v) },
  uid: { test: (v) => typeof v === "string" && UUID_RE.test(v) },
  profileRowId: { test: (v) => v === null || (typeof v === "string" && UUID_RE.test(v)) },
  // A slug must be a slug-shaped STRING or null. An object-valued slug is refused outright rather
  // than stringified somewhere downstream.
  requestedSlugAtBindTime: { test: (v) => v === null || (typeof v === "string" && SLUG_RE.test(v)) },
  bucket: { test: (v) => v === "athlete-media" },
  checkpoint: { test: (v) => checkpointIndex(v) >= 0 },
  enumerationComplete: { test: (v) => typeof v === "boolean" },
  keyStates: { test: (v) => v !== null && typeof v === "object" && !Array.isArray(v) },
  evidence: { test: (v) => Array.isArray(v) && v.length <= MAX_EVIDENCE },
  invalidations: { test: (v) => Array.isArray(v) && v.length <= MAX_INVALIDATIONS },
  operatorConfirmations: { test: (v) => v === null || (v !== null && typeof v === "object" && !Array.isArray(v)) },
  authDeletion: { test: (v) => v === null || (v !== null && typeof v === "object" && !Array.isArray(v)) },
  residualTokenTest: { test: (v) => v === null || (v !== null && typeof v === "object" && !Array.isArray(v)) },
  finalVerification: { test: (v) => v === null || (v !== null && typeof v === "object" && !Array.isArray(v)) },
};

/** Field-name fragments that must never appear, as a second line after the exact schema. */
const CREDENTIAL_NAME_FRAGMENTS = [
  "token",
  "jwt",
  "secret",
  "password",
  "passwd",
  "apikey",
  "anonkey",
  "authorization",
  "bearer",
  "otp",
  "signedurl",
  "cookie",
  "session",
  "credential",
];

/** Value shapes that look like credential material regardless of the field name. */
function looksLikeCredentialValue(value) {
  if (typeof value !== "string") return false;
  if (/^eyJ[A-Za-z0-9_-]{10,}/.test(value)) return true; // JWT
  if (/\bsb_(secret|publishable)_[A-Za-z0-9]/.test(value)) return true;
  if (/\bsbp_[A-Za-z0-9]{10,}/.test(value)) return true;
  if (/[?&]token=/.test(value)) return true; // signed URL
  if (/\bBearer\s+[A-Za-z0-9._-]{10,}/.test(value)) return true;
  return false;
}

/** The names the exact schema legitimately uses that would trip the fragment scan. */
const NAME_SCAN_EXEMPT = new Set(["residualTokenTest", "tokenExpiryPassedAt"]);

/**
 * Scans every value at every depth for credential shapes, and every *unexpected* name for
 * credential words. The exact schema is the primary gate; this catches a value smuggled into an
 * otherwise-legal string field.
 */
function scanForCredentials(node, path, problems, depth = 0) {
  if (depth > 8) {
    problems.push(`structure nested too deeply at ${path}`);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => scanForCredentials(item, `${path}[${i}]`, problems, depth + 1));
    return;
  }
  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (!NAME_SCAN_EXEMPT.has(key)) {
        const normalised = key.toLowerCase().replace(/[^a-z]/g, "");
        for (const fragment of CREDENTIAL_NAME_FRAGMENTS) {
          if (normalised.includes(fragment)) {
            problems.push(`credential-like field name at ${path}.${key}`);
            break;
          }
        }
      }
      scanForCredentials(value, `${path}.${key}`, problems, depth + 1);
    }
    return;
  }
  if (looksLikeCredentialValue(node)) problems.push(`credential-like value at ${path}`);
}

/**
 * Validates the inventory: exact schema, path ownership, and checkpoint/evidence consistency.
 *
 * **Path ownership is checked here, on every load** — not only when the media phase is entered. An
 * inventory is a file on disk; if a foreign key can sit in it unnoticed while the operation is at
 * `media-absent`, then the one check that would have caught it has already been passed.
 */
export function validateInventory(inventory) {
  const problems = [];
  const isObj = inventory !== null && typeof inventory === "object" && !Array.isArray(inventory);
  if (!isObj) return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, problems: ["not an object"] };

  exactObject(inventory, INVENTORY_SPEC, "inventory", problems);
  if (problems.length > 0) return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, problems };

  // ── nested exact shapes ──
  inventory.evidence.forEach((e, i) => exactObject(e, EVIDENCE_SPEC, `inventory.evidence[${i}]`, problems));
  inventory.invalidations.forEach((e, i) =>
    exactObject(e, INVALIDATION_SPEC, `inventory.invalidations[${i}]`, problems)
  );
  if (inventory.operatorConfirmations !== null) {
    exactObject(inventory.operatorConfirmations, CONFIRMATIONS_SPEC, "inventory.operatorConfirmations", problems);
  }
  if (inventory.authDeletion !== null) {
    exactObject(inventory.authDeletion, AUTH_DELETION_SPEC, "inventory.authDeletion", problems);
  }
  if (inventory.residualTokenTest !== null) {
    exactObject(inventory.residualTokenTest, RESIDUAL_SPEC, "inventory.residualTokenTest", problems);
    // A probe object is a media key like any other, so it obeys the same containment rule. A probe
    // path under another uid would name a foreign object for cleanup, which is exactly the class of
    // mistake the ownership check exists to stop.
    const residual = inventory.residualTokenTest;
    const probe = residual.probeObjectKey;
    if (typeof probe === "string" && typeof inventory.uid === "string" && !isExactlyOwnedPath(probe, inventory.uid)) {
      problems.push("residualTokenTest.probeObjectKey is outside the owner namespace");
    }
    if (typeof probe === "string" && residual.probeGeneration === null) {
      problems.push("residualTokenTest has a probe key with no generation");
    }
    if (probe === null && residual.probeGeneration !== null) {
      problems.push("residualTokenTest has a probe generation with no key");
    }
    if (residual.probeRemovedAt !== null && residual.probeRemovedGeneration === null) {
      problems.push("residualTokenTest records a probe removal with no generation");
    }
    if (residual.probeRemovedGeneration !== null && residual.probeRemovedGeneration !== residual.probeGeneration) {
      problems.push("residualTokenTest records a probe removal for a generation that is not the current one");
    }
  }
  if (inventory.finalVerification !== null) {
    exactObject(inventory.finalVerification, FINAL_VERIFICATION_SPEC, "inventory.finalVerification", problems);
  }

  // ── keyStates: ownership and shape, every load ──
  const keys = Object.keys(inventory.keyStates);
  if (keys.length > MAX_KEYS) problems.push(`keyStates holds more than ${MAX_KEYS} keys`);
  const allowedStates = new Set(Object.values(KEY_STATE));
  for (const key of keys) {
    if (typeof key !== "string" || key === "" || key.length > MAX_KEY_LENGTH) {
      problems.push("keyStates has a malformed key");
      continue;
    }
    if (!allowedStates.has(inventory.keyStates[key])) problems.push(`keyStates value for a key is not a known state`);
    if (typeof inventory.uid === "string" && !isExactlyOwnedPath(key, inventory.uid)) {
      problems.push(`keyStates holds a path outside the owner namespace`);
    }
  }

  // ── checkpoint / evidence / flag consistency ──
  const idx = checkpointIndex(inventory.checkpoint);
  const readyIdx = checkpointIndex("inventory-ready");
  const mediaIdx = checkpointIndex("media-absent");
  const authIdx = checkpointIndex("auth-deletion-recorded");
  const completeIdx = checkpointIndex("verified-complete");

  for (let i = 0; i <= idx; i += 1) {
    if (!inventory.evidence.some((e) => e.checkpoint === CHECKPOINTS[i])) {
      problems.push(`no recorded evidence for reached checkpoint ${CHECKPOINTS[i]}`);
    }
  }
  for (const e of inventory.evidence) {
    if (checkpointIndex(e.checkpoint) > idx) {
      problems.push(`evidence for ${e.checkpoint} is ahead of the current checkpoint`);
    }
  }
  if (idx >= readyIdx) {
    if (inventory.enumerationComplete !== true) problems.push("inventory-ready reached without a complete enumeration");
    if (inventory.operatorConfirmations === null) problems.push("inventory-ready reached without recorded operator confirmations");
  }
  if (idx >= mediaIdx) {
    const unresolved = Object.values(inventory.keyStates).filter((v) => v !== KEY_STATE.VERIFIED_ABSENT);
    if (unresolved.length > 0) {
      problems.push(`media-absent reached with ${unresolved.length} key(s) not verified-absent`);
    }
  }
  if (idx >= authIdx) {
    if (inventory.authDeletion === null) problems.push("auth-deletion-recorded reached without a recorded Auth deletion");
    else if (inventory.authDeletion.confirmedUid !== inventory.uid) {
      problems.push("recorded Auth deletion names a different uid than the bound one");
    }
  } else if (inventory.authDeletion !== null) {
    problems.push("an Auth deletion is recorded at a checkpoint that precedes it");
  }
  if (idx >= completeIdx) {
    const residual = residualTokenOutcomeSatisfied(inventory.residualTokenTest);
    if (!residual.ok) problems.push(`verified-complete reached but ${residual.detail}`);
    if (inventory.finalVerification === null) problems.push("verified-complete reached without a final verification record");
  } else if (inventory.finalVerification !== null) {
    problems.push("a final verification is recorded at a checkpoint that precedes verified-complete");
  }

  scanForCredentials(inventory, "inventory", problems, 0);

  return problems.length === 0 ? { ok: true } : { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, problems };
}

/** A fresh inventory at the `bound` checkpoint. */
export function createInventory({ binding, bucket = "athlete-media", now = () => new Date().toISOString() }) {
  return {
    formatVersion: INVENTORY_FORMAT_VERSION,
    operationId: binding.operationId,
    environment: binding.environment,
    uid: binding.uid,
    profileRowId: binding.profileRowId ?? null,
    requestedSlugAtBindTime: binding.requestedSlugAtBindTime ?? null,
    bucket,
    checkpoint: "bound",
    enumerationComplete: false,
    keyStates: {},
    evidence: [{ checkpoint: "bound", at: now() }],
    invalidations: [],
    operatorConfirmations: null,
    authDeletion: null,
    residualTokenTest: null,
    finalVerification: null,
  };
}
