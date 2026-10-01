/**
 * The deletion orchestrator: all sequencing, gating, and evidence rules, with every external
 * effect behind an injected port.
 *
 * ── WHY THIS IS SEPARATE FROM THE CLI ────────────────────────────────────────────
 *
 * The rules that matter here are orderings and refusals — "never delete before a fresh
 * enumeration", "never print the Auth handoff without re-proving absence", "an unreadable public
 * surface is UNKNOWN, not ABSENT". None of those can be tested against a real project: the only way
 * to observe them is to drive the sequence with stubs and assert on what was called, in what order,
 * and what was refused. So the orchestrator performs no I/O of its own. It reads facts and causes
 * effects exclusively through `ports`, and it RETURNS a refusal rather than exiting.
 *
 * The CLI is then a thin adapter: load env, authenticate, build real ports, map the result to an
 * exit code.
 *
 * ── GATING ORDER ─────────────────────────────────────────────────────────────────
 *
 *   bind -> persist -> quiet window -> typed confirmation -> unpublish -> verify public
 *   -> enumerate -> persist inventory -> delete media -> re-prove -> delete row -> re-prove
 *   -> re-prove again before handoff -> record manual Auth deletion -> record stale-token
 *   outcome -> resolve any residual capability -> verified-complete
 *
 * Both confirmations are taken BEFORE the first mutation, so there is no "early mutation exception"
 * to document: unpublish is inside the confirmed window like everything else. They are recorded in
 * the inventory against a **run id**, and every destructive phase requires the confirmations on file
 * to belong to the current run — a stored checkpoint is not a standing confirmation.
 *
 * ── THE AUTHORITATIVE INVENTORY IS LOADED INSIDE THE LOCK ────────────────────────
 *
 * Only the lock KEY is derived before the lock. The inventory that lifecycle phases read and write
 * is loaded after acquisition, because serialising execution achieves nothing if the state being
 * serialised was read before the wait — two runs could load one snapshot, the first record a new
 * obligation, and the second write its stale copy back over it. A pre-lock read exists only for
 * `verify-public`, which has no session and must discover the bound uid from disk; the single value
 * taken from it is that uid, and it never becomes the lifecycle state.
 *
 * ── EVERY DESTRUCTIVE STEP RE-PROVES ITS FACTS ───────────────────────────────────
 *
 * A stored checkpoint says what was true once. Before deleting media, before deleting the profile
 * row, and again before printing the Auth handoff, the orchestrator performs a **fresh session
 * validation**, re-reads the owner row, re-validates the binding, re-runs a complete enumeration,
 * and re-checks the public surface. A resumed operation cannot inherit a stale proof.
 *
 * Note precisely what a fresh session validation proves: that the credential in hand is **currently
 * accepted**. It is not evidence that the Auth user exists — a token issued before a deletion can
 * remain acceptable until it expires. That is why post-Auth phases never call it, and why Auth-user
 * absence is only ever established by the founder in the dashboard.
 *
 * ── AFTER AUTH DELETION ──────────────────────────────────────────────────────────
 *
 * Final verification must work when the athlete's Auth user no longer exists, so it cannot ask that
 * athlete for an OTP — the account is gone; requesting one is guaranteed to fail.
 * `MODE.VERIFY_PUBLIC` needs no session at all.
 *
 * What it can observe is narrower than it may look, and the honest statement is: the owner-scoped
 * facts were proven and recorded while owner authorization existed, and they are **not reliably
 * re-verifiable through this tool afterwards**. Whether a previously issued token can still reach
 * PostgREST or Storage is an open question that live acceptance answers, not something to assume in
 * either direction — the Storage owner policy is keyed on `auth.uid()`, and a residual JWT still
 * carries that claim. So completion requires the recorded stale-token outcome plus a founder
 * attestation of an admin-side cross-check.
 */
import {
  REFUSAL,
  validateBinding,
  bindOperation,
  classifyPaths,
  isExactlyOwnedPath,
  validateInventoryPaths,
  validateDeleteBatch,
} from "./binding.mjs";
import {
  KEY_STATE,
  canTransition,
  checkpointIndex,
  createInventory,
  invalidateDownstream,
  reconcileMediaState,
  reconcileProfileState,
  residualTokenOutcomeSatisfied,
  mergeResidualOutcome,
  hasUnresolvedProbe,
} from "./checkpoints.mjs";

export const MODE = {
  /** Read-only. Reports what would happen and stops before the first mutation. */
  PLAN: "plan",
  /** Performs the owner-authorised deletion steps. Requires both confirmations. */
  EXECUTE: "execute",
  /** Owner-authenticated verification. Mutates nothing. Requires a live athlete session. */
  VERIFY_OWNER: "verify-owner",
  /** Public verification with NO session — the only mode usable after Auth deletion. */
  VERIFY_PUBLIC: "verify-public",
};

/** What the public surface tells us. `UNKNOWN` is never good enough to proceed or to complete. */
export const PUBLIC_STATE = {
  ABSENT: "absent",
  EXPOSED: "exposed",
  UNKNOWN: "unknown",
};

export const DELETE_BATCH_SIZE = 50;

const QUIET_WINDOW_QUESTION =
  "Has the athlete confirmed they have closed Athlesite and will not edit during this " +
  "operation? This is a cooperative agreement, not an enforced lock. (yes/no): ";

/**
 * Classifies the public surface, distinguishing "proven gone" from "could not tell".
 *
 * Only an authoritative, parsed, empty 200 counts as ABSENT. A transport error, a non-200, an
 * unparseable body, or a missing slug all mean we did not learn anything — and in a deletion
 * workflow not learning anything must never be recorded as absence, because that is precisely the
 * shape of a false pass (a 404 from a wrong path reads identically to a clean result).
 */
export function classifyPublicExposure(result, slug) {
  if (typeof slug !== "string" || slug.trim() === "") {
    return { state: PUBLIC_STATE.UNKNOWN, reason: "no slug known for this operation" };
  }
  if (!result || result.reachable !== true) {
    return { state: PUBLIC_STATE.UNKNOWN, reason: "public endpoint unreachable" };
  }
  if (result.status !== 200) {
    return { state: PUBLIC_STATE.UNKNOWN, reason: `unexpected status ${result.status}` };
  }
  if (result.parsed !== true || !Array.isArray(result.rows)) {
    return { state: PUBLIC_STATE.UNKNOWN, reason: "public response not parseable as rows" };
  }
  if (result.rows.length > 0) {
    return { state: PUBLIC_STATE.EXPOSED, reason: `${result.rows.length} row(s) still published` };
  }
  return { state: PUBLIC_STATE.ABSENT, reason: "public lookup returned zero rows" };
}

/** Normalises a yes/no answer without guessing. Anything else is `null` — "not recorded". */
function triState(answer) {
  const a = String(answer ?? "").trim().toLowerCase();
  if (a === "yes" || a === "y") return true;
  if (a === "no" || a === "n") return false;
  return null;
}

/**
 * Runs the deletion workflow to the furthest point the current facts justify.
 *
 * @param {object} config
 * @param {string} config.mode            one of MODE
 * @param {string} config.environment     environment fingerprint (never the project URL)
 * @param {string|null} [config.operationId] resume an existing operation
 * @param {string|null} [config.slug]     informational hint only; identity is the bound uid
 * @param {object} config.ports           every external effect, injected
 */
export async function runDeletion({ mode = MODE.PLAN, environment, operationId = null, slug = null, ports }) {
  const steps = [];
  const log = (message) => {
    steps.push(message);
    ports.log?.(message);
  };
  const stop = (refusal, detail = "", extra = {}) => ({ ok: false, refusal, detail, steps, ...extra });
  const now = ports.now ?? (() => new Date().toISOString());

  if (!Object.values(MODE).includes(mode)) return stop(REFUSAL.TRANSITION_NOT_ELIGIBLE, `unknown mode ${mode}`);
  if (typeof environment !== "string" || environment === "") {
    return stop(REFUSAL.ENVIRONMENT_MISMATCH, "no environment fingerprint");
  }

  /** Identifies THIS run, so a stored confirmation cannot be reused by a later one. */
  const runId = ports.newRunId();

  let inventory;

  /** Persists, and treats anything but a verified save as a hard stop. */
  const save = () => {
    const result = ports.persist(inventory);
    if (!result || result.ok !== true) {
      return { ok: false, refusal: REFUSAL.PERSISTENCE_FAILED, detail: (result?.problems ?? []).join("; ") };
    }
    return { ok: true, path: result.path };
  };

  /**
   * Rolls the checkpoint backward and records it.
   *
   * A rollback that cannot be written is worth saying out loud: the on-disk checkpoint would then be
   * AHEAD of the facts, and a later resume would trust it. The operation refuses either way, so this
   * reports rather than masking the original reason for stopping.
   */
  const noteRollback = (toCheckpoint, reason) => {
    inventory = invalidateDownstream(inventory, toCheckpoint, reason);
    if (save().ok !== true) {
      log("WARNING: the rollback could not be persisted — the stored checkpoint is now ahead of the facts");
    }
  };

  // ── load or bind ───────────────────────────────────────────────────────────

  const needsSession = mode !== MODE.VERIFY_PUBLIC;
  const startupIdentity = ports.identity ?? null;
  if (
    needsSession &&
    (!startupIdentity || startupIdentity.authValidated !== true || typeof startupIdentity.uid !== "string")
  ) {
    return stop(REFUSAL.AUTH_VALIDATION_FAILED, "no positively validated athlete session");
  }

  // ── the lock key, and ONLY the lock key ────────────────────────────────────
  //
  // Nothing authoritative is loaded here. Serialising execution is worthless if the state the
  // serialised section operates on was read before the wait: two runs can load the same snapshot,
  // the first can take the lock and record a new obligation, and the second — still holding its
  // pre-lock copy — can write that stale state back and erase it. The lock has done its job and the
  // data has defeated it.
  //
  // So this block establishes the three values needed to compute the lock key and nothing else.
  let lockUid;
  let lockOperationId;

  if (operationId) {
    lockOperationId = operationId;
    if (needsSession) {
      // The lock is per environment+uid, and the uid we are entitled to lock is the one we
      // authenticated as. If the stored operation turns out to belong to someone else, the
      // post-lock reload refuses — having briefly locked our OWN identity, which touches nobody.
      lockUid = startupIdentity.uid;
    } else {
      // `verify-public` has no session, so the bound uid can only come from disk. This read is
      // DISCOVERY ONLY: the single value taken from it is the uid, and the object is discarded
      // rather than retained. The authoritative load happens after the lock, below.
      const discovery = ports.load(operationId);
      if (!discovery || discovery.ok !== true) {
        return stop(discovery?.refusal ?? REFUSAL.INVENTORY_CORRUPT, (discovery?.problems ?? []).join("; "));
      }
      lockUid = discovery.inventory.uid;
    }
  } else {
    if (mode === MODE.VERIFY_PUBLIC) return stop(REFUSAL.INVENTORY_CORRUPT, "--operation is required without a session");
    lockUid = startupIdentity.uid;
    lockOperationId = ports.newOperationId();
  }
  if (typeof lockUid !== "string" || lockUid === "") {
    return stop(REFUSAL.UID_MISSING, "could not determine the identity to lock");
  }

  // ── everything past here is serialised per environment+uid ─────────────────

  const held = await ports.withLock({ environment, uid: lockUid, operationId: lockOperationId }, async () => {
    const prepared = await loadAuthoritativeInventory(lockOperationId);
    if (prepared.ok !== true) return prepared;
    return runPhases();
  });
  if (held.ok !== true) return stop(held.refusal ?? REFUSAL.LOCK_HELD, held.detail ?? "", { heldBy: held.heldBy });
  return held.result;

  /**
   * Establishes the authoritative lifecycle state, INSIDE the lock.
   *
   * Called after the lock is held, so whatever it reads is the newest committed state — including
   * anything a run that held the lock before us wrote. There is deliberately no merge with an
   * earlier in-memory copy: a pre-lock snapshot has no standing at all once we have waited, and
   * merging it could only ever downgrade newer on-disk evidence (a recorded residual capability, a
   * newer probe generation, an unresolved cleanup, a further checkpoint).
   */
  async function loadAuthoritativeInventory(boundOperationId) {
    if (operationId) {
      const loaded = ports.load(operationId);
      if (!loaded || loaded.ok !== true) {
        return stop(loaded?.refusal ?? REFUSAL.INVENTORY_CORRUPT, (loaded?.problems ?? []).join("; "));
      }
      inventory = loaded.inventory;

      if (inventory.environment !== environment) {
        return stop(REFUSAL.ENVIRONMENT_MISMATCH, "this inventory belongs to a different environment");
      }
      if (needsSession && inventory.uid !== startupIdentity.uid) {
        return stop(REFUSAL.UID_MISMATCH, "the signed-in athlete is not the bound target");
      }
      // The lock we hold must be the lock this inventory needs. For `verify-public` the key came
      // from a pre-lock discovery read, so this is where that value is checked against the
      // authoritative one — a mismatch means the file changed identity under us.
      if (inventory.uid !== lockUid) {
        return stop(REFUSAL.UID_MISMATCH, "the locked identity is not the one this inventory is bound to");
      }
      log(`loaded operation ${inventory.operationId} under the lock, at checkpoint "${inventory.checkpoint}"`);
      return { ok: true };
    }

    // A new operation is bound inside the lock too, so no pre-lock authoritative read exists at all.
    const row = await ports.readOwnRow(startupIdentity.uid);
    if (!row || row.readOk !== true) {
      return stop(REFUSAL.ABSENCE_UNPROVEN, "could not read the owner row authoritatively");
    }
    const bound = bindOperation({
      environment,
      uid: startupIdentity.uid,
      profileRowId: row.rowPresent ? row.rowId : null,
      operationId: boundOperationId,
      requestedSlug: slug ?? row.slug ?? null,
    });
    if (bound.refusal) return stop(bound.refusal, bound.detail ?? "");
    inventory = createInventory({ binding: bound.binding, now });
    log(`bound new operation ${inventory.operationId}`);
    return { ok: true };
  }

  // ───────────────────────────────────────────────────────────── helpers ──

  /**
   * FRESH identity validation plus a fresh owner-row read and binding re-validation.
   *
   * `authValidated` is never passed through from startup. Startup auth proves the session was
   * accepted at startup; a destructive boundary needs it accepted *now*, against the bound uid.
   * What this does NOT establish is that the Auth user still exists — see the module docblock.
   */
  async function proveIdentityAndBinding() {
    const session = await ports.validateSession();
    if (!session || session.authValidated !== true) {
      return { ok: false, refusal: REFUSAL.AUTH_VALIDATION_FAILED, detail: "fresh session validation failed" };
    }
    if (session.uid !== inventory.uid) {
      return { ok: false, refusal: REFUSAL.UID_MISMATCH, detail: "the live session is not the bound uid" };
    }

    const fresh = await ports.readOwnRow(inventory.uid);
    if (!fresh || fresh.readOk !== true) {
      return { ok: false, refusal: REFUSAL.ABSENCE_UNPROVEN, detail: "owner row read not authoritative" };
    }
    const check = validateBinding(
      {
        environment: inventory.environment,
        uid: inventory.uid,
        profileRowId: inventory.profileRowId,
        operationId: inventory.operationId,
      },
      {
        authValidated: true,
        environment,
        uid: session.uid,
        profileRowId: fresh.rowPresent ? fresh.rowId : null,
      }
    );
    if (!check.ok) return { ok: false, refusal: check.refusal, detail: check.detail ?? "" };

    // A slug change mid-operation is profile activity, and it also breaks the final public check —
    // that runs after the row is gone and can only look up the slug recorded at bind time.
    if (
      fresh.rowPresent === true &&
      typeof inventory.requestedSlugAtBindTime === "string" &&
      typeof fresh.slug === "string" &&
      fresh.slug !== inventory.requestedSlugAtBindTime
    ) {
      return {
        ok: false,
        refusal: REFUSAL.CONCURRENT_ACTIVITY,
        detail: "the profile slug changed after binding; re-bind a new operation",
      };
    }
    return { ok: true, row: fresh, session };
  }

  async function checkPublic(slugToCheck) {
    const raw = await ports.publicProfileBySlug(slugToCheck);
    const verdict = classifyPublicExposure(raw, slugToCheck);
    log(`public surface: ${verdict.state} (${verdict.reason})`);
    return verdict;
  }

  /** Count of inventory entries not yet proven absent. */
  function unresolvedCount() {
    return Object.values(inventory.keyStates).filter((v) => v !== KEY_STATE.VERIFIED_ABSENT).length;
  }

  /** Whether the operator confirmations on file belong to THIS run. */
  function confirmationsCurrent() {
    return inventory.operatorConfirmations !== null && inventory.operatorConfirmations.runId === runId;
  }

  /** Takes both confirmations once per destructive run and records them. */
  async function ensureConfirmations() {
    if (confirmationsCurrent()) return { ok: true };
    const quiet = triState(await ports.prompt(QUIET_WINDOW_QUESTION));
    if (quiet !== true) return { ok: false, refusal: REFUSAL.QUIET_WINDOW_NOT_CONFIRMED };
    const quietAt = now();

    const phrase = `delete ${inventory.uid.slice(-6)}`;
    const typed = String(await ports.prompt(`Type exactly "${phrase}" to proceed with permanent deletion: `)).trim();
    if (typed !== phrase) return { ok: false, refusal: REFUSAL.CONFIRMATION_MISMATCH };

    inventory.operatorConfirmations = { runId, quietWindowConfirmedAt: quietAt, phraseConfirmedAt: now() };
    const saved = save();
    if (saved.ok !== true) return { ok: false, refusal: saved.refusal, detail: "confirmations could not be recorded" };
    return { ok: true };
  }

  // ───────────────────────────────────────────────────────────── phases ──

  async function runPhases() {
    const at = () => checkpointIndex(inventory.checkpoint);

    if (mode === MODE.VERIFY_OWNER) return verifyAsOwner();
    if (mode === MODE.VERIFY_PUBLIC) return verifyPublicly();

    if (at() === checkpointIndex("bound")) {
      const phase = await phaseInventory();
      if (phase.ok !== true) return phase;
      if (mode === MODE.PLAN) return phase;
    }

    if (mode === MODE.PLAN) {
      log("PLAN: nothing was changed; re-run with execute to proceed");
      return { ok: true, checkpoint: inventory.checkpoint, inventory, steps, plan: true };
    }

    if (at() === checkpointIndex("inventory-ready")) {
      const phase = await phaseMedia();
      if (phase.ok !== true) return phase;
    }

    if (at() === checkpointIndex("media-absent")) {
      const phase = await phaseProfile();
      if (phase.ok !== true) return phase;
    }

    if (at() === checkpointIndex("profile-absent")) {
      return phaseHandoff();
    }

    // At or past auth-deletion-recorded there is nothing left that needs a session.
    return verifyPublicly();
  }

  /** bound -> inventory-ready. Confirmations first, then unpublish, then enumerate. */
  async function phaseInventory() {
    const firstSave = save();
    if (firstSave.ok !== true) return stop(firstSave.refusal, `${firstSave.detail} — refusing to start`);

    const proven = await proveIdentityAndBinding();
    if (proven.ok !== true) return stop(proven.refusal, proven.detail);
    log("fresh identity validated and binding re-proved");

    if (mode === MODE.EXECUTE) {
      const intent = await ensureConfirmations();
      if (intent.ok !== true) return stop(intent.refusal, intent.detail ?? "no mutation was attempted");
    }

    const targetSlug = proven.row.slug ?? inventory.requestedSlugAtBindTime ?? null;
    if (proven.row.rowPresent && proven.row.isPublished === true) {
      if (mode !== MODE.EXECUTE) {
        log("PLAN: would unpublish the profile");
      } else {
        const unpublished = await ports.unpublish(inventory.uid);
        if (!unpublished || unpublished.ok !== true) {
          return stop(REFUSAL.UNPUBLISH_FAILED, `status ${unpublished?.status ?? "-"}`);
        }
        log("profile unpublished");
      }
    } else {
      log(proven.row.rowPresent ? "profile already unpublished" : "profile row already absent");
    }

    // The public surface must actually reflect it, and UNKNOWN is not good enough to continue.
    const publicState = await checkPublic(targetSlug);
    if (mode === MODE.EXECUTE && publicState.state !== PUBLIC_STATE.ABSENT) {
      return stop(
        publicState.state === PUBLIC_STATE.EXPOSED ? REFUSAL.STILL_PUBLIC : REFUSAL.PUBLIC_STATE_UNKNOWN,
        `${publicState.reason} — refusing to delete anything while the public state is not proven absent`
      );
    }

    const scan = await ports.scan(inventory.uid);
    if (!scan || scan.complete !== true) {
      return stop(REFUSAL.ENUMERATION_INCOMPLETE, (scan?.problems ?? []).slice(0, 3).join("; "));
    }
    const { owned, foreign, ambiguous } = classifyPaths(scan.keys, inventory.uid);
    if (foreign.length > 0) return stop(REFUSAL.FOREIGN_PATH, `${foreign.length} object(s) outside the owner namespace`);
    if (ambiguous.length > 0) return stop(REFUSAL.AMBIGUOUS_PATH, `${ambiguous.length} unparseable key(s)`);
    log(`enumeration complete: ${owned.length} object(s), ${scan.folders.length} folder(s), ${scan.pages} page(s)`);

    inventory.enumerationComplete = true;
    for (const key of owned) {
      if (!Object.prototype.hasOwnProperty.call(inventory.keyStates, key)) {
        inventory.keyStates[key] = KEY_STATE.PENDING;
      }
    }

    if (mode !== MODE.EXECUTE) {
      log("PLAN: would persist the inventory, then delete the objects listed above");
      return { ok: true, checkpoint: inventory.checkpoint, inventory, steps, plan: true, objects: owned };
    }

    // Persist the full inventory BEFORE any delete: a crash after deleting but before saving would
    // otherwise leave objects removed with no record that they ever existed.
    const persisted = save();
    if (persisted.ok !== true) return stop(persisted.refusal, "refusing to delete anything without a durable inventory");

    const advance = canTransition(inventory.checkpoint, "inventory-ready", {
      bindingValid: true,
      freshAuthValidated: true,
      profileUnpublishedOrAbsent: true,
      publicState: publicState.state,
      enumerationComplete: true,
      operatorConfirmationsRecorded: confirmationsCurrent(),
      inventoryPersisted: true,
    });
    if (advance.ok !== true) return stop(advance.refusal, advance.detail ?? "");
    inventory.checkpoint = "inventory-ready";
    inventory.evidence.push({ checkpoint: "inventory-ready", at: now(), objects: owned.length });
    const saved = save();
    if (saved.ok !== true) return stop(saved.refusal, saved.detail);
    log(`inventory persisted at inventory-ready (${owned.length} object(s))`);
    return { ok: true, checkpoint: inventory.checkpoint, inventory, steps };
  }

  /** inventory-ready -> media-absent. Re-proves everything, deletes, then re-proves again. */
  async function phaseMedia() {
    const proven = await proveIdentityAndBinding();
    if (proven.ok !== true) return stop(proven.refusal, proven.detail);
    if (proven.row.rowPresent && proven.row.isPublished === true) {
      noteRollback("bound", "profile was re-published before media deletion");
      return stop(REFUSAL.CONCURRENT_ACTIVITY, "profile is published again; start over");
    }

    // A resumed run is about to delete, so it confirms again, for this run.
    const intent = await ensureConfirmations();
    if (intent.ok !== true) return stop(intent.refusal, intent.detail ?? "no mutation was attempted");

    const paths = validateInventoryPaths(inventory, { uid: inventory.uid });
    if (paths.ok !== true) return stop(paths.refusal, (paths.problems ?? []).join("; "));

    // A FRESH public check immediately before the destructive step. Reaching inventory-ready in an
    // earlier run proved the public surface was clear *then*; this phase can be entered directly on
    // resume, and between runs a profile can be republished. UNKNOWN stops as firmly as EXPOSED —
    // not knowing is not the same as knowing it is gone.
    const publicState = await checkPublic(proven.row.slug ?? inventory.requestedSlugAtBindTime);
    if (publicState.state !== PUBLIC_STATE.ABSENT) {
      return stop(
        publicState.state === PUBLIC_STATE.EXPOSED ? REFUSAL.STILL_PUBLIC : REFUSAL.PUBLIC_STATE_UNKNOWN,
        `${publicState.reason} — refusing to delete media while the public state is not proven absent`
      );
    }

    const pre = await ports.scan(inventory.uid);
    if (!pre || pre.complete !== true) {
      return stop(REFUSAL.ENUMERATION_INCOMPLETE, (pre?.problems ?? []).slice(0, 3).join("; "));
    }

    // A key already PROVEN ABSENT that is listed again contradicts recorded evidence; it is not a
    // stray upload to clean up. Deleting it and carrying on would paper over whatever put it back —
    // and whatever put it back can do so again, after the final scan.
    const regressed = pre.keys.filter((k) => inventory.keyStates[k] === KEY_STATE.VERIFIED_ABSENT);
    if (regressed.length > 0) {
      noteRollback("bound", "media previously proven absent is present again");
      return stop(
        REFUSAL.CONCURRENT_ACTIVITY,
        `${regressed.length} object(s) previously proven absent reappeared; checkpoint rolled back`
      );
    }

    const unexpected = pre.keys.filter((k) => !Object.prototype.hasOwnProperty.call(inventory.keyStates, k));
    if (unexpected.length > 0) {
      noteRollback("bound", "media appeared after the inventory was taken");
      return stop(REFUSAL.CONCURRENT_ACTIVITY, `${unexpected.length} unexpected new object(s); checkpoint rolled back`);
    }

    for (let i = 0; i < pre.keys.length; i += DELETE_BATCH_SIZE) {
      const batch = pre.keys.slice(i, i + DELETE_BATCH_SIZE);
      const gate = validateDeleteBatch(batch, { uid: inventory.uid, observedKeys: pre.keys });
      if (gate.ok !== true) {
        return stop(gate.rejected[0].reason, "a delete batch contained a key that failed the ownership gate");
      }
      const deleted = await ports.deleteMedia(gate.approved);
      // An acknowledgement is not proof; the state moves to pending-verification only.
      for (const key of gate.approved) inventory.keyStates[key] = KEY_STATE.PENDING_VERIFICATION;
      const savedBatch = save();
      if (savedBatch.ok !== true) return stop(savedBatch.refusal, "inventory could not be updated after a delete batch");
      log(
        `delete batch ${Math.floor(i / DELETE_BATCH_SIZE) + 1}: status ${deleted?.status ?? "-"} ` +
          `(${gate.approved.length} key(s), not yet proven absent)`
      );
    }

    const after = await ports.scan(inventory.uid);
    const reconciled = reconcileMediaState(inventory, after);
    inventory.keyStates = reconciled.keyStates;
    const savedAfter = save();
    if (savedAfter.ok !== true) return stop(savedAfter.refusal, savedAfter.detail);

    if (reconciled.regressed.length > 0) {
      noteRollback("bound", "media previously proven absent is present again");
      return stop(REFUSAL.CONCURRENT_ACTIVITY, `${reconciled.regressed.length} object(s) regressed from verified-absent`);
    }
    if (reconciled.unexpected.length > 0) {
      noteRollback("bound", "new media appeared during deletion");
      return stop(REFUSAL.CONCURRENT_ACTIVITY, `${reconciled.unexpected.length} unexpected new object(s)`);
    }
    if (reconciled.provenAbsent !== true) {
      return stop(
        REFUSAL.ABSENCE_UNPROVEN,
        `${reconciled.remaining.length} remaining, ${reconciled.unresolvedCount} unresolved — re-run to continue`
      );
    }

    const advance = canTransition(inventory.checkpoint, "media-absent", {
      bindingValid: true,
      freshAuthValidated: true,
      freshScanComplete: after.complete === true,
      freshScanEmpty: Array.isArray(after.keys) && after.keys.length === 0,
      unresolvedKeyStates: reconciled.unresolvedCount,
    });
    if (advance.ok !== true) return stop(advance.refusal, advance.detail ?? "");
    inventory.checkpoint = "media-absent";
    inventory.evidence.push({ checkpoint: "media-absent", at: now() });
    const saved = save();
    if (saved.ok !== true) return stop(saved.refusal, saved.detail);
    log("media absence PROVEN by a fresh complete scan");
    return { ok: true, checkpoint: inventory.checkpoint, inventory, steps };
  }

  /**
   * media-absent -> profile-absent.
   *
   * Entered directly on resume, so every gate is re-checked here rather than relying on having come
   * through `phaseMedia` in this process. The published-row check is the one that matters most: a
   * profile republished between runs must stop the operation, not be deleted around.
   */
  async function phaseProfile() {
    const proven = await proveIdentityAndBinding();
    if (proven.ok !== true) return stop(proven.refusal, proven.detail);

    // Confirmations must belong to THIS run even when this phase is the entry point.
    const intent = await ensureConfirmations();
    if (intent.ok !== true) return stop(intent.refusal, intent.detail ?? "no mutation was attempted");

    if (proven.row.rowPresent && proven.row.isPublished === true) {
      noteRollback("bound", "profile was re-published before row deletion");
      return stop(REFUSAL.CONCURRENT_ACTIVITY, "the profile is published again; refusing to delete it");
    }

    // Media must STILL be gone, by a fresh complete scan. Proven once is not proven now.
    const before = await ports.scan(inventory.uid);
    if (!before || before.complete !== true) {
      return stop(REFUSAL.ENUMERATION_INCOMPLETE, "pre-row-delete scan incomplete");
    }
    if (before.keys.length !== 0) {
      noteRollback("bound", "media reappeared before row deletion");
      return stop(REFUSAL.CONCURRENT_ACTIVITY, `${before.keys.length} object(s) reappeared`);
    }
    if (unresolvedCount() !== 0) {
      return stop(REFUSAL.ABSENCE_UNPROVEN, `${unresolvedCount()} inventory entr(ies) are not proven absent`);
    }

    // Fresh public check immediately before the row delete, for the same reason as the media phase:
    // this is a destructive entry point in its own right.
    const publicState = await checkPublic(proven.row.slug ?? inventory.requestedSlugAtBindTime);
    if (publicState.state !== PUBLIC_STATE.ABSENT) {
      return stop(
        publicState.state === PUBLIC_STATE.EXPOSED ? REFUSAL.STILL_PUBLIC : REFUSAL.PUBLIC_STATE_UNKNOWN,
        `${publicState.reason} — refusing to delete the profile row while the public state is not proven absent`
      );
    }

    const preState = reconcileProfileState({
      ...proven.row,
      boundUid: inventory.uid,
      boundRowId: inventory.profileRowId,
    });
    if (preState.state === "foreign") return stop(preState.refusal, "the row at this identity belongs to another uid");
    if (preState.state === "replacement") {
      noteRollback("bound", "a different profile row exists for this uid");
      return stop(preState.refusal, "the row id differs from the bound one; a replacement row exists");
    }
    if (preState.state === "unknown") return stop(preState.refusal, "profile state not authoritative");

    if (preState.state === "present") {
      const deleted = await ports.deleteProfileRow(inventory.uid);
      log(`profile row delete: status ${deleted?.status ?? "-"} (acknowledgement only, not proof)`);
    }

    const postRow = await ports.readOwnRow(inventory.uid);
    const postState = reconcileProfileState({
      ...(postRow ?? {}),
      boundUid: inventory.uid,
      boundRowId: inventory.profileRowId,
    });
    if (postState.state !== "absent") return stop(REFUSAL.ABSENCE_UNPROVEN, `profile state is ${postState.state}`);

    const finalScan = await ports.scan(inventory.uid);
    if (!finalScan || finalScan.complete !== true) {
      return stop(REFUSAL.ENUMERATION_INCOMPLETE, "final owner scan incomplete");
    }
    if (finalScan.keys.length !== 0) {
      noteRollback("bound", "media present at the final owner scan");
      return stop(REFUSAL.CONCURRENT_ACTIVITY, `${finalScan.keys.length} object(s) present at the final scan`);
    }

    const advance = canTransition(inventory.checkpoint, "profile-absent", {
      bindingValid: true,
      freshAuthValidated: true,
      profileConfirmedAbsent: true,
      freshScanComplete: true,
      freshScanEmpty: true,
      unresolvedKeyStates: unresolvedCount(),
    });
    if (advance.ok !== true) return stop(advance.refusal, advance.detail ?? "");
    inventory.checkpoint = "profile-absent";
    inventory.evidence.push({ checkpoint: "profile-absent", at: now() });

    const saved = save();
    if (saved.ok !== true) {
      return stop(saved.refusal, "profile-absent could not be recorded — do NOT delete the Auth user yet");
    }
    log("profile absence PROVEN; recorded at profile-absent");
    return { ok: true, checkpoint: inventory.checkpoint, inventory, steps };
  }

  /**
   * profile-absent -> the Auth handoff.
   *
   * Reaching this checkpoint in a previous run is NOT sufficient to print the handoff. The handoff
   * tells the founder to destroy the credential path that can still read the owner namespace, so it
   * is gated on the facts being true *now*: fresh session, row still absent, a fresh complete empty
   * scan, an authoritative ABSENT public surface, and a successful persist.
   */
  async function phaseHandoff() {
    const proven = await proveIdentityAndBinding();
    if (proven.ok !== true) {
      // At this checkpoint the row is supposed to be GONE, so a binding refusal that reports a row
      // is not merely a mismatch — it is evidence that something was recreated after we proved
      // absence. That invalidates the proof, so the checkpoint goes backward as well as stopping.
      if (proven.refusal === REFUSAL.PROFILE_ROW_UNEXPECTED || proven.refusal === REFUSAL.CONCURRENT_ACTIVITY) {
        noteRollback("bound", "a profile row exists again after profile-absent");
        return stop(REFUSAL.CONCURRENT_ACTIVITY, `${proven.detail} — checkpoint rolled back`);
      }
      return stop(proven.refusal, proven.detail);
    }

    const rowState = reconcileProfileState({
      ...proven.row,
      boundUid: inventory.uid,
      boundRowId: inventory.profileRowId,
    });
    if (rowState.state === "foreign") return stop(rowState.refusal, "the row at this identity belongs to another uid");
    if (rowState.state === "replacement" || rowState.state === "present") {
      const published = proven.row.isPublished === true ? " and it is published" : "";
      noteRollback("bound", "a profile row exists again after profile-absent");
      return stop(
        REFUSAL.CONCURRENT_ACTIVITY,
        `a profile row is present again (${rowState.state})${published}; checkpoint rolled back`
      );
    }
    if (rowState.state !== "absent") return stop(REFUSAL.ABSENCE_UNPROVEN, `profile state is ${rowState.state}`);

    const scan = await ports.scan(inventory.uid);
    if (!scan || scan.complete !== true) return stop(REFUSAL.ENUMERATION_INCOMPLETE, "pre-handoff scan incomplete");
    if (scan.keys.length !== 0) {
      noteRollback("bound", "media present at the pre-handoff scan");
      return stop(REFUSAL.CONCURRENT_ACTIVITY, `${scan.keys.length} object(s) present before the Auth handoff`);
    }

    const publicState = await checkPublic(inventory.requestedSlugAtBindTime);
    if (publicState.state !== PUBLIC_STATE.ABSENT) {
      return stop(
        publicState.state === PUBLIC_STATE.EXPOSED ? REFUSAL.STILL_PUBLIC : REFUSAL.PUBLIC_STATE_UNKNOWN,
        `${publicState.reason} — refusing to hand off Auth deletion`
      );
    }

    const saved = save();
    if (saved.ok !== true) {
      return stop(saved.refusal, "pre-handoff state could not be persisted — do NOT delete the Auth user");
    }

    log("pre-handoff re-proof complete: row absent, namespace empty, public surface absent");
    return {
      ok: true,
      checkpoint: inventory.checkpoint,
      inventory,
      steps,
      handoff: {
        uid: inventory.uid,
        operationId: inventory.operationId,
        resumeWith: `--operation ${inventory.operationId} --mode verify-public`,
      },
    };
  }

  /** Owner-authenticated verification. Mutates nothing. */
  async function verifyAsOwner() {
    const proven = await proveIdentityAndBinding();
    const rowState = proven.ok
      ? reconcileProfileState({ ...proven.row, boundUid: inventory.uid, boundRowId: inventory.profileRowId })
      : { state: "unknown" };
    const scan = await ports.scan(inventory.uid);
    const publicState = await checkPublic(
      proven.ok ? proven.row.slug ?? inventory.requestedSlugAtBindTime : inventory.requestedSlugAtBindTime
    );

    const verdict = {
      freshAuth: proven.ok ? "validated" : `failed (${proven.refusal})`,
      profileRow: rowState.state,
      ownerScanComplete: scan?.complete === true,
      ownerObjects: Array.isArray(scan?.keys) ? scan.keys.length : null,
      unresolvedInventoryEntries: unresolvedCount(),
      publicState: publicState.state,
      clean:
        proven.ok &&
        rowState.state === "absent" &&
        scan?.complete === true &&
        Array.isArray(scan.keys) &&
        scan.keys.length === 0 &&
        publicState.state === PUBLIC_STATE.ABSENT,
    };
    log(`verification (owner): ${verdict.clean ? "profile and media ABSENT" : "NOT clean"}`);
    return { ok: true, checkpoint: inventory.checkpoint, inventory, steps, verdict, readOnly: true };
  }

  /**
   * Verification with no session: records the manual Auth deletion, then the stale-token outcome,
   * then completes — in that order, never out of it.
   *
   * `bindingValid` here does not come from `validateBinding`: that requires a positively validated
   * session, which cannot be required of a deleted user. The binding evidence for these last two
   * transitions is (a) the inventory's environment fingerprint matching the environment being
   * operated on, checked at load, and (b) the founder typing the bound uid in full. This is the only
   * place that substitution is made.
   */
  async function verifyPublicly() {
    const publicState = await checkPublic(inventory.requestedSlugAtBindTime);

    if (checkpointIndex(inventory.checkpoint) < checkpointIndex("profile-absent")) {
      return {
        ok: true,
        checkpoint: inventory.checkpoint,
        inventory,
        steps,
        readOnly: true,
        verdict: {
          publicState: publicState.state,
          ownerScopedFacts: "unknown — this mode has no session; run verify-owner while the account still exists",
          clean: false,
        },
      };
    }

    // A fresh contradiction outranks a stored conclusion. An operation already recorded
    // verified-complete whose slug is public again is not complete, whatever the file says.
    if (inventory.checkpoint === "verified-complete" && publicState.state !== PUBLIC_STATE.ABSENT) {
      return stop(
        publicState.state === PUBLIC_STATE.EXPOSED ? REFUSAL.STILL_PUBLIC : REFUSAL.PUBLIC_STATE_UNKNOWN,
        `this operation is recorded verified-complete but the fresh public check says ${publicState.state} ` +
          `(${publicState.reason}); a stored conclusion does not override current evidence`
      );
    }

    const ownerProofRecorded = (inventory.evidence ?? []).some((e) => e.checkpoint === "profile-absent");

    // ── step 1: record the manual Auth deletion ──
    if (inventory.checkpoint === "profile-absent") {
      const typedUid = String(await ports.prompt("Type the FULL uid you deleted in the dashboard: ")).trim();
      const acknowledged = triState(
        await ports.prompt("Confirm you deleted exactly that Auth user and no other (yes/no): ")
      );

      const advance = canTransition(inventory.checkpoint, "auth-deletion-recorded", {
        bindingValid: typedUid === inventory.uid,
        boundUid: inventory.uid,
        founderConfirmedUid: typedUid,
        manualAcknowledgement: acknowledged === true,
        ownerProofRecorded,
      });
      if (advance.ok !== true) return stop(advance.refusal, advance.detail ?? "");

      inventory.checkpoint = "auth-deletion-recorded";
      inventory.authDeletion = { recordedAt: now(), confirmedUid: typedUid };
      inventory.evidence.push({ checkpoint: "auth-deletion-recorded", at: now() });
      const saved = save();
      if (saved.ok !== true) return stop(saved.refusal, saved.detail);
      log("manual Auth deletion recorded against the bound uid");
    }

    // ── steps 2-6: the stale-token outcome, its obligations, then a FRESH public re-check ──
    if (inventory.checkpoint === "auth-deletion-recorded") {
      const gathered = await gatherResidualOutcome();
      if (gathered.ok !== true) return gathered;

      // Obligations first, evaluated WITHOUT the public re-check — that comes after, so it cannot
      // be satisfied by evidence gathered before the probes ran.
      const obligations = residualObligationsOutstanding(inventory.residualTokenTest);
      if (obligations !== null) {
        return {
          ok: true,
          checkpoint: inventory.checkpoint,
          inventory,
          steps,
          outstanding: obligations,
          verdict: {
            publicState: publicState.state,
            residualOutcome: "recorded, not yet resolved",
            outstanding: obligations,
            clean: false,
          },
        };
      }

      const attested = triState(
        await ports.prompt(
          "Admin-side cross-check: in the dashboard, confirm Storage holds no object under the deleted " +
            "uid's prefix and athlete_profiles holds no row for it. This tool cannot perform that check. " +
            "Attest that you have completed it (yes/no): "
        )
      );
      if (attested !== true) {
        return stop(REFUSAL.ABSENCE_UNPROVEN, "no founder attestation of the admin-side Storage/profile cross-check");
      }

      // ── step 5: a REAL public request, issued now, after everything above ──
      //
      // The earlier `publicState` was read at the top of this run, before the stale-token questions
      // and before any probe cleanup. Completing on it would be completing on evidence that predates
      // the very actions it is supposed to account for — a write probe can republish nothing, but a
      // probe object, a botched cleanup, or simply time passing can all change what the public
      // surface shows. So the check is re-issued, and `publicRecheckAt` is stamped only from this
      // request. It is never derived from a timestamp or carried over from the earlier read.
      const finalPublic = await checkPublic(inventory.requestedSlugAtBindTime);
      if (finalPublic.state !== PUBLIC_STATE.ABSENT) {
        return stop(
          finalPublic.state === PUBLIC_STATE.EXPOSED ? REFUSAL.STILL_PUBLIC : REFUSAL.PUBLIC_STATE_UNKNOWN,
          `${finalPublic.reason} — the public re-check after stale-token testing did not prove absence`
        );
      }
      inventory.residualTokenTest = { ...inventory.residualTokenTest, publicRecheckAt: now() };
      const savedRecheck = save();
      if (savedRecheck.ok !== true) return stop(savedRecheck.refusal, savedRecheck.detail);

      const residual = residualTokenOutcomeSatisfied(inventory.residualTokenTest);

      const advance = canTransition(inventory.checkpoint, "verified-complete", {
        bindingValid: true,
        ownerProofRecorded,
        authDeletionRecorded: inventory.authDeletion !== null,
        publicState: finalPublic.state,
        residualTokenOutcomeSatisfied: residual.ok,
        residualTokenDetail: residual.detail,
        adminCrossCheckAttested: true,
      });
      if (advance.ok !== true) return stop(advance.refusal, advance.detail ?? "");

      inventory.checkpoint = "verified-complete";
      inventory.finalVerification = { at: now(), publicState: "absent", adminCrossCheckAttestedAt: now() };
      inventory.evidence.push({ checkpoint: "verified-complete", at: now() });
      const saved = save();
      if (saved.ok !== true) return stop(saved.refusal, saved.detail);
      log("operation verified complete");
    }

    return {
      ok: true,
      checkpoint: inventory.checkpoint,
      inventory,
      steps,
      verdict: {
        publicState: publicState.state,
        ownerScopedFacts:
          "proven before Auth deletion and recorded; not reliably re-verifiable through this tool afterwards",
        residualOutcome: inventory.residualTokenTest === null ? "not recorded" : "recorded and resolved",
        clean: inventory.checkpoint === "verified-complete",
      },
    };
  }

  /**
   * Records what a pre-deletion token could still do, and what was done about it.
   *
   * These are *outcomes*, not an acknowledgement. "Yes, I read the caveat" establishes nothing about
   * the system; "the token could still write, here is the probe object I created, here is when I
   * removed it, here is when the expiry windows passed" does.
   *
   * The one-probe-token limitation is stated in the prompt itself: a single token is not evidence
   * about every session that may have been outstanding, so the question asked is about ALL
   * outstanding windows, not the probe's own expiry.
   */
  async function gatherResidualOutcome() {
    const prior = inventory.residualTokenTest;
    const inherited = [];
    if (prior?.readCapable === true) inherited.push("a previously observed READ capability");
    if (prior?.writeCapable === true) inherited.push("a previously observed WRITE capability");
    if (hasUnresolvedProbe(prior)) inherited.push(`an unremoved probe object (${prior.probeObjectKey})`);
    if (inherited.length > 0) {
      log(`carrying forward from an earlier run: ${inherited.join("; ")}`);
    }

    const read = triState(
      await ports.prompt(
        "Stale-token test — READ: using an access token issued BEFORE the Auth deletion, could you " +
          "still read the athlete's profile row or list their Storage prefix? (yes/no): "
      )
    );
    const write = triState(
      await ports.prompt(
        "Stale-token test — WRITE: using the same token, could you still upload an object under the " +
          "athlete's prefix or insert a profile row? (yes/no): "
      )
    );
    if (read === null || write === null) {
      return stop(
        REFUSAL.ABSENCE_UNPROVEN,
        "the stale-token READ and WRITE outcomes must both be recorded before this operation can " +
          "complete; perform the tests in runbook §17 cases 36-37 and re-run"
      );
    }

    // What THIS run observed. It is merged into the prior record rather than replacing it, so a
    // later "no" cannot discharge an obligation an earlier run incurred — see mergeResidualOutcome.
    // `publicRecheckAt` is deliberately absent here: it is stamped only from the real public request
    // issued after every obligation is resolved.
    const observed = {
      testedAt: now(),
      readCapable: read,
      writeCapable: write,
      probeObjectKey: null,
      probeGeneration: null,
      probeRemovedGeneration: null,
      probeRemovedAt: null,
      tokenExpiryPassedAt: null,
      publicRecheckAt: null,
      adminCrossCheckAt: null,
    };

    const anyCapability = read === true || write === true || prior?.readCapable === true || prior?.writeCapable === true;

    if (anyCapability) {
      if (!prior?.tokenExpiryPassedAt) {
        const expiryPassed = triState(
          await ports.prompt(
            "Residual capability remained. Have ALL outstanding access-token expiry windows from the " +
              "deletion session(s) now passed? One probe token is not evidence about every session that " +
              "may have been issued. (yes/no): "
          )
        );
        if (expiryPassed === true) observed.tokenExpiryPassedAt = now();
      }

      if (hasUnresolvedProbe(prior)) {
        // An outstanding probe is resolved before any new one is offered, so the tool is never
        // tracking two objects in one slot.
        const removed = triState(
          await ports.prompt(
            `An earlier run recorded a probe object that has not been confirmed removed: ` +
              `${prior.probeObjectKey}. Has it now been removed and its absence confirmed? (yes/no): `
          )
        );
        // Carry the PRIOR generation: this answer is evidence about that object, not a new one.
        observed.probeObjectKey = prior.probeObjectKey;
        observed.probeGeneration = prior.probeGeneration;
        if (removed === true) {
          observed.probeRemovedGeneration = prior.probeGeneration;
          observed.probeRemovedAt = now();
        }
      } else {
        const probeKey = String(await ports.prompt("Object key created by the WRITE test, or 'none': ")).trim();
        if (probeKey !== "" && probeKey.toLowerCase() !== "none") {
          // A probe object is a media key, so it obeys the same containment rule as every other key
          // this tool will act on. A probe path under another uid would nominate a foreign object
          // for cleanup, and an encoded or traversal-shaped one cannot be reasoned about at all.
          if (!isExactlyOwnedPath(probeKey, inventory.uid)) {
            return stop(
              REFUSAL.FOREIGN_PATH,
              "the probe object key is not exactly inside the bound athlete's namespace; refusing to record it"
            );
          }
          // A fresh generation for this reported existence. Minted unconditionally, including when
          // `probeKey` equals a key an earlier run already cleaned up: that earlier removal was
          // evidence about a different object, and must not discharge this one.
          const generation = runId;
          observed.probeObjectKey = probeKey;
          observed.probeGeneration = generation;
          const removed = triState(
            await ports.prompt("Has that probe object been removed and its absence confirmed? (yes/no): ")
          );
          if (removed === true) {
            observed.probeRemovedGeneration = generation;
            observed.probeRemovedAt = now();
          }
        }
      }

      if (!prior?.adminCrossCheckAt) {
        const crossChecked = triState(
          await ports.prompt("Has the admin/dashboard Storage and athlete_profiles cross-check been completed? (yes/no): ")
        );
        if (crossChecked === true) observed.adminCrossCheckAt = now();
      }
    }

    inventory.residualTokenTest = mergeResidualOutcome(prior, observed);
    const saved = save();
    if (saved.ok !== true) return stop(saved.refusal, "the stale-token outcome could not be recorded");
    const merged = inventory.residualTokenTest;
    log(
      `stale-token outcome recorded: read=${merged.readCapable} write=${merged.writeCapable}` +
        (merged.readCapable !== read || merged.writeCapable !== write ? " (includes capability inherited from an earlier run)" : "")
    );
    return { ok: true };
  }

  /**
   * Which residual obligations are still outstanding, ignoring the public re-check.
   *
   * The public re-check is deliberately excluded: it is performed AFTER these are resolved, so
   * including it here would report it as outstanding on every run and never let the flow reach the
   * point where it is issued.
   */
  function residualObligationsOutstanding(test) {
    if (test === null || typeof test !== "object") return "no residual-token test outcome recorded";
    if (typeof test.readCapable !== "boolean" || typeof test.writeCapable !== "boolean") {
      return "residual-token read/write outcomes not both recorded";
    }
    if (test.readCapable === false && test.writeCapable === false) return null;
    if (!test.tokenExpiryPassedAt) {
      return "residual capability remained and the token expiry window has not been recorded as passed";
    }
    if (test.probeObjectKey && (test.probeRemovedGeneration !== test.probeGeneration || !test.probeRemovedAt)) {
      return "a probe object was created and its removal is not recorded for that probe";
    }
    if (!test.adminCrossCheckAt) {
      return "residual capability remained and the admin cross-check is not recorded";
    }
    return null;
  }
}
