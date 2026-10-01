/**
 * Durable inventory storage and the founder-process lock.
 *
 * ── WHERE, AND WHY NOT A TEMP DIR ────────────────────────────────────────────────
 *
 * Inventories live in a founder-only local application-data directory, never in the repo or
 * checkout, and never in a general temp directory. A temp dir can be cleaned out between runs
 * by the OS or by tooling, which would destroy resumability at exactly the moment it matters —
 * after media deletion started but before it finished.
 *
 * Any caller-supplied directory is **canonicalised and then refused** if it resolves inside the
 * repository checkout, or if any path segment matches a small list of well-known cloud-sync folder
 * names. Symlinks and junctions are resolved first, so a link pointing back into the checkout
 * cannot smuggle the inventory in. A dangerous directory is refused rather than quietly relocated:
 * the caller would look where they asked and find nothing.
 *
 * The checkout check is structural and reliable. The cloud-sync check is a **heuristic on folder
 * names only** — it is not comprehensive, and it cannot detect a renamed sync root, a sync client
 * configured over an arbitrary directory, or a network share that is replicated elsewhere. Treat it
 * as a guard against the common mistake, not as assurance that the inventory is unsynced.
 *
 * ── PERSISTENCE SEMANTICS, STATED HONESTLY ───────────────────────────────────────
 *
 * Writes are **atomic within the local filesystem**: temp file, fsync, rename. After the
 * rename the file is read back and compared field-by-field against what was intended, because a
 * write call returning is not evidence that the bytes are on disk and parseable.
 *
 * This is NOT a claim of guaranteed crash durability. `fsync` is attempted on the **file** only.
 * The containing directory entry is NOT flushed — that would need a separate directory fsync,
 * which is not portable (Windows offers no equivalent), and it is not performed here. So the
 * honest description is: **atomic local persistence with verified read-back, not guaranteed
 * crash-durable storage.** Do not describe the inventory as crash-proof.
 *
 * ── THE LOCK ─────────────────────────────────────────────────────────────────────
 *
 * Exclusive by construction, and **recovery of a dead holder is itself gated and atomic** — see
 * `acquireLock`, which explains the two-worker race that a naive unlink-and-recreate allows.
 *
 * There is no check-then-write window, no "older-than-an-hour is safe to steal" assumption, and
 * the same operation id does NOT bypass a lock held by a *live* process. Anything ambiguous —
 * another host, an unreadable record, an empty file, a missing or malformed pid, a missing instance
 * id — **fails closed** and requires explicit manual cleanup.
 *
 * Locks live in a FIXED coordination directory, independent of `--work-dir`, so a different work
 * directory cannot bypass per-environment/per-UID coordination.
 *
 * Scope: **one OS user, one host, that user's local application-data root.** Not distributed, not
 * cross-user, not cross-machine. It says nothing about an athlete's browser.
 */
import {
  mkdirSync,
  readFileSync,
  renameSync,
  existsSync,
  unlinkSync,
  readdirSync,
  chmodSync,
  linkSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  realpathSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { validateInventory } from "./checkpoints.mjs";
import { REFUSAL } from "./binding.mjs";

/** The repository checkout this script belongs to — inventories must never land inside it. */
function repoRoot() {
  // scripts/lifecycle/store.mjs -> repo root is two levels up. `fileURLToPath` rather than
  // `.pathname`, which keeps the Windows leading slash and leaves %20 undecoded.
  return resolve(fileURLToPath(new URL("../..", import.meta.url)));
}

/** Canonicalises a path as far as it exists, so symlinks/junctions cannot hide the target. */
function canonicalise(path) {
  let current = resolve(path);
  const tail = [];
  for (;;) {
    try {
      return join(realpathSync(current), ...tail.reverse());
    } catch {
      const parent = resolve(current, "..");
      if (parent === current) return resolve(path); // nothing resolvable; use as-is
      tail.push(current.slice(parent.length + 1));
      current = parent;
    }
  }
}

function isInside(child, parent) {
  const c = canonicalise(child).toLowerCase();
  const p = canonicalise(parent).toLowerCase();
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
}

/**
 * Refuses an unsafe inventory location rather than silently relocating it.
 *
 * A caller who asks for a dangerous directory gets an error, because quietly writing somewhere
 * else would be worse: they would look in the place they specified and find nothing.
 */
export function assertSafeWorkDir(dir) {
  if (typeof dir !== "string" || dir.trim() === "") {
    return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, detail: "work dir not specified" };
  }
  const canonical = canonicalise(dir);
  const repo = repoRoot();

  if (isInside(canonical, repo)) {
    return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, detail: "work dir resolves inside the repository checkout" };
  }
  // Common cloud-sync roots, where a deletion inventory has no business living.
  for (const marker of ["OneDrive", "Dropbox", "Google Drive", "iCloudDrive"]) {
    if (canonical.split(sep).some((seg) => seg.toLowerCase() === marker.toLowerCase())) {
      return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, detail: `work dir resolves inside ${marker}` };
    }
  }
  return { ok: true, dir: canonical };
}

/** Resolves the founder-only work directory. */
export function resolveWorkDir(overrides = {}) {
  if (overrides.dir) return overrides.dir;
  const env = overrides.env ?? process.env;
  const platform = overrides.platform ?? process.platform;

  if (platform === "win32") {
    const base = env.LOCALAPPDATA;
    if (base) return join(base, "Athlesite", "deletion-work");
    return join(homedir(), "AppData", "Local", "Athlesite", "deletion-work");
  }
  const xdg = env.XDG_STATE_HOME;
  if (xdg) return join(xdg, "athlesite", "deletion-work");
  return join(homedir(), ".local", "state", "athlesite", "deletion-work");
}

/**
 * The lock directory, deliberately NOT derived from `--work-dir`.
 *
 * If locks lived beside the inventory, two operators passing different `--work-dir` values
 * would never see each other's lock — the coordination would silently not exist.
 */
export function resolveLockDir(overrides = {}) {
  const base = resolveWorkDir({ env: overrides.env, platform: overrides.platform });
  return join(base, "..", "deletion-locks");
}

export function newOperationId() {
  return `op-${randomUUID()}`;
}

function pathFor(dir, operationId) {
  if (!/^op-[0-9a-zA-Z-]{8,}$/.test(operationId)) throw new Error("unsafe operation id");
  return join(dir, `${operationId}.json`);
}

export function ensureWorkDir(dir) {
  const safe = assertSafeWorkDir(dir);
  if (!safe.ok) throw new Error(`unsafe work dir: ${safe.detail}`);
  mkdirSync(safe.dir, { recursive: true });
  try {
    chmodSync(safe.dir, 0o700);
  } catch {
    /* Windows ignores the mode; not fatal */
  }
  return safe.dir;
}

/** Writes bytes atomically: temp file, fsync, rename. */
function atomicWrite(file, contents) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  let fd;
  try {
    fd = openSync(tmp, "wx", 0o600);
    writeSync(fd, contents);
    try {
      fsyncSync(fd);
    } catch {
      /* best effort; see the honesty note in the module docblock */
    }
    closeSync(fd);
    fd = undefined;
    renameSync(tmp, file);
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Writes the inventory atomically, then reads it back and compares the WHOLE object.
 *
 * Returns `{ ok: true, path }` only when the persisted bytes parse, validate, and deep-equal
 * what was intended. Callers may treat that, and only that, as "persisted".
 */
export function persistInventory(inventory, { dir } = {}) {
  const shape = validateInventory(inventory);
  if (!shape.ok) return { ok: false, refusal: shape.refusal, problems: shape.problems };

  let target;
  try {
    target = ensureWorkDir(dir ?? resolveWorkDir());
  } catch (err) {
    return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, problems: [err.message] };
  }
  const file = pathFor(target, inventory.operationId);
  const serialised = JSON.stringify(inventory, null, 2);

  try {
    atomicWrite(file, serialised);
  } catch (err) {
    return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, problems: [`write failed: ${err.code ?? err.message}`] };
  }

  const readBack = loadInventory(inventory.operationId, { dir: target });
  if (!readBack.ok) return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, problems: ["read-back failed"] };
  // Full comparison, not just the checkpoint: a partial write that happened to parse must fail.
  if (JSON.stringify(readBack.inventory) !== JSON.stringify(JSON.parse(serialised))) {
    return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, problems: ["read-back does not match what was written"] };
  }
  return { ok: true, path: file };
}

export function loadInventory(operationId, { dir } = {}) {
  const target = dir ?? resolveWorkDir();
  const file = pathFor(target, operationId);
  if (!existsSync(file)) return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, problems: ["not found"] };

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { ok: false, refusal: REFUSAL.INVENTORY_CORRUPT, problems: ["unparseable"] };
  }
  const shape = validateInventory(parsed);
  if (!shape.ok) return { ok: false, refusal: shape.refusal, problems: shape.problems };
  return { ok: true, inventory: parsed, path: file };
}

export function listOperations({ dir } = {}) {
  const target = dir ?? resolveWorkDir();
  if (!existsSync(target)) return [];
  return readdirSync(target)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

/** Removes the inventory. Only legal once verified-complete is actually recorded. */
export function discardInventory(operationId, { dir, force = false } = {}) {
  const loaded = loadInventory(operationId, { dir });
  if (!loaded.ok) return { ok: false, refusal: loaded.refusal };
  if (!force && loaded.inventory.checkpoint !== "verified-complete") {
    return { ok: false, refusal: REFUSAL.TRANSITION_NOT_ELIGIBLE, detail: "not verified-complete" };
  }
  unlinkSync(loaded.path);
  return { ok: true };
}

// ─────────────────────────────────────────────────────── operation lock ──

/**
 * Scope of this lock, stated narrowly.
 *
 * It coordinates **founder tooling runs by one OS user on one machine**, through a file under that
 * user's local application-data root. It is not distributed, not cross-user, and not
 * cross-machine: a lock recorded by another host is something this process can only refuse to
 * reason about. And it says nothing whatsoever about an athlete's browser — nothing here is a
 * write barrier.
 */

function lockPathFor(dir, environment, uid) {
  const safeEnv = String(environment).replace(/[^0-9a-f]/gi, "");
  const safeUid = String(uid).replace(/[^0-9a-fA-F-]/g, "");
  if (safeEnv === "" || safeUid === "") throw new Error("unsafe lock identity");
  return join(dir, `lock-${safeEnv}-${safeUid}.json`);
}

/**
 * Liveness of a recorded holder, as a THREE-valued answer.
 *
 * `"unknown"` is not a softer "no". Every caller must treat it exactly as held, because the
 * situations that produce it — a corrupt record, a truncated write by a competitor still in
 * flight, a missing or malformed pid, a lock from another host — are indistinguishable from a live
 * holder using the evidence available here. Only a positively established dead pid on this host
 * is `false`.
 *
 * PID reuse is a known limitation, and it fails in the safe direction: if the operating system has
 * since handed the recorded pid to an unrelated process, that pid answers, we read `live`, and we
 * refuse. The cost is availability — a manual cleanup — never two concurrent workers.
 */
function holderIsLive(holder) {
  if (!holder || typeof holder !== "object" || Array.isArray(holder)) {
    return { live: "unknown", reason: "record unreadable" };
  }
  if (typeof holder.instanceId !== "string" || holder.instanceId === "") {
    // Without an instance id, a later takeover cannot prove it is removing the same lock.
    return { live: "unknown", reason: "record has no instance id" };
  }
  if (holder.host !== hostname()) return { live: "unknown", reason: "different host" };

  const pid = holder.pid;
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
    return { live: "unknown", reason: "record has no usable pid" };
  }
  if (pid === process.pid) return { live: true, reason: "this process" };
  try {
    process.kill(pid, 0);
    return { live: true, reason: "pid responds" };
  } catch (err) {
    if (err.code === "ESRCH") return { live: false, reason: "pid gone" };
    if (err.code === "EPERM") return { live: true, reason: "pid exists, not ours" };
    return { live: "unknown", reason: err.code ?? "unknown errno" };
  }
}

function readHolder(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const MANUAL_CLEANUP = "confirm no founder process is running, then delete the lock file by hand";

/**
 * Claims `file` exclusively with complete content already in it, or returns null for "taken".
 *
 * The record is written to a private staging file and then **hard-linked** onto the target.
 * `link` fails with EEXIST when the target exists, so the claim is atomic; and because the content
 * was written before linking, the target never exists half-written. That matters more than it
 * looks: a competitor reads this file to judge liveness, and an empty read is indistinguishable
 * from a corrupt one.
 *
 * `link` is unavailable on a few filesystems, so an exclusive `open(..., "wx")` is the fallback.
 * The narrow half-written window it reintroduces is covered by treating an unreadable record as
 * held rather than as free.
 */
function claimExclusively(file, record) {
  const staging = `${file}.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.claim`;

  try {
    const fd = openSync(staging, "wx", 0o600);
    try {
      writeSync(fd, record);
      try {
        fsyncSync(fd);
      } catch {
        /* best effort; see the persistence note in the module docblock */
      }
    } finally {
      closeSync(fd);
    }
  } catch (err) {
    return { ok: false, refusal: REFUSAL.LOCK_HELD, detail: `lock staging failed: ${err.code ?? "unknown"}` };
  }

  try {
    linkSync(staging, file);
    return { ok: true, path: file };
  } catch (err) {
    if (err.code === "EEXIST") return null;
    if (err.code !== "EPERM" && err.code !== "ENOSYS" && err.code !== "EXDEV" && err.code !== "EACCES") {
      return { ok: false, refusal: REFUSAL.LOCK_HELD, detail: `lock link failed: ${err.code ?? "unknown"}` };
    }
    try {
      const fd = openSync(file, "wx", 0o600);
      try {
        writeSync(fd, record);
        try {
          fsyncSync(fd);
        } catch {
          /* best effort */
        }
      } finally {
        closeSync(fd);
      }
      return { ok: true, path: file };
    } catch (fallbackErr) {
      if (fallbackErr.code === "EEXIST") return null;
      return {
        ok: false,
        refusal: REFUSAL.LOCK_HELD,
        detail: `lock write failed: ${fallbackErr.code ?? "unknown"}`,
      };
    }
  } finally {
    try {
      unlinkSync(staging);
    } catch {
      /* the hardlink keeps the content alive; removing the staging name is cleanup only */
    }
  }
}

/**
 * Acquires the lock exclusively, or refuses.
 *
 * ── WHY RECOVERY NEEDS ITS OWN ATOMIC STEP ───────────────────────────────────────
 *
 * "Read the holder, see a dead pid, unlink it, re-create" is not safe, and the failure is not
 * theoretical. Two workers can read the *same* dead holder; A unlinks it and claims the lock; B —
 * still acting on its earlier read — unlinks **A's newly created live lock** and claims it too.
 * Both then proceed. Nothing in that sequence ever re-checks that the file being removed is still
 * the dead one.
 *
 * So a takeover is gated on winning a **per-dead-instance recovery token**, created with the same
 * exclusive primitive as the lock itself:
 *
 *   1. every holder record carries a random `instanceId`, unique to that one acquisition
 *   2. a would-be recoverer must exclusively create `<lock>.takeover.<instanceId>` — only ONE
 *      process can, so only one process is ever entitled to remove that instance
 *   3. the winner then RE-READS the lock and proceeds only if it is still that exact instance and
 *      still dead; anything else and it refuses rather than removing what it found
 *   4. removal is followed by a fresh exclusive claim, which a third party may legitimately have
 *      won in between — in which case this process refuses
 *
 * B never reaches step 3: the token is already taken, so it refuses. There is no interleaving in
 * which two workers both proceed.
 *
 * If a recoverer dies between steps 2 and 4 the token survives, and that instance can no longer be
 * reclaimed automatically. That is deliberate — it degrades to **manual cleanup**, which is
 * acceptable for the pilot, and never to a second live worker.
 */
export function acquireLock({ environment, uid, operationId, lockDir } = {}) {
  const target = ensureWorkDir(lockDir ?? resolveLockDir());
  const file = lockPathFor(target, environment, uid);
  const instanceId = randomUUID();
  const record = JSON.stringify(
    {
      operationId,
      environment,
      uid,
      instanceId,
      pid: process.pid,
      host: hostname(),
      at: new Date().toISOString(),
    },
    null,
    2
  );

  const first = claimExclusively(file, record);
  if (first) return first.ok ? { ...first, instanceId } : first;

  // The lock exists. Everything below decides only whether we may TAKE IT OVER.
  const holder = readHolder(file);

  // The single narrow non-refusal: this exact OS process already holds it for this exact
  // operation. No second worker is involved. Note the conjunction — a matching operation id with a
  // different pid falls through, and is refused if that pid is alive.
  if (
    holder &&
    holder.host === hostname() &&
    holder.pid === process.pid &&
    holder.operationId === operationId
  ) {
    return { ok: true, path: file, alreadyHeld: true, instanceId: holder.instanceId ?? null };
  }

  const liveness = holderIsLive(holder);

  if (liveness.live === true) {
    return {
      ok: false,
      refusal: REFUSAL.LOCK_HELD,
      heldBy: holder?.operationId ?? "unknown",
      detail: `holder is live (${liveness.reason}); the same operation id does not bypass a live lock`,
    };
  }
  if (liveness.live !== false) {
    // UNKNOWN. Fail closed — a corrupt, pid-less, instance-less, or foreign-host lock lands here.
    return {
      ok: false,
      refusal: REFUSAL.LOCK_HELD,
      heldBy: holder?.operationId ?? "unknown",
      detail: `cannot establish that the holder is dead (${liveness.reason}) — failing closed; ${MANUAL_CLEANUP}`,
    };
  }

  // ── positively dead: attempt the gated, atomic takeover ──
  const deadInstance = holder.instanceId;
  const tokenPath = `${file}.takeover.${deadInstance}`;
  const token = claimExclusively(
    tokenPath,
    JSON.stringify({ recovering: deadInstance, by: process.pid, at: new Date().toISOString() }, null, 2)
  );
  if (token === null) {
    return {
      ok: false,
      refusal: REFUSAL.LOCK_HELD,
      heldBy: holder.operationId ?? "unknown",
      detail:
        "another process already holds the recovery token for this dead lock, or an earlier " +
        `recovery did not finish — failing closed; ${MANUAL_CLEANUP} (and its .takeover file)`,
    };
  }
  if (token.ok !== true) return token;

  try {
    // RE-VALIDATE the exact instance. The earlier read is not authority to delete anything.
    const current = readHolder(file);
    if (current === null) {
      // Already gone. We may only claim it the ordinary exclusive way.
      const claimed = claimExclusively(file, record);
      if (claimed && claimed.ok) return { ...claimed, instanceId, reclaimedFrom: holder.operationId ?? "unknown" };
      return { ok: false, refusal: REFUSAL.LOCK_HELD, detail: "the lock was taken while recovering" };
    }
    if (current.instanceId !== deadInstance) {
      return {
        ok: false,
        refusal: REFUSAL.LOCK_HELD,
        heldBy: current.operationId ?? "unknown",
        detail: "the lock was replaced by another instance while recovering; refusing to remove it",
      };
    }
    const recheck = holderIsLive(current);
    if (recheck.live !== false) {
      return {
        ok: false,
        refusal: REFUSAL.LOCK_HELD,
        heldBy: current.operationId ?? "unknown",
        detail: `the holder is no longer provably dead (${recheck.reason}) — failing closed`,
      };
    }

    try {
      unlinkSync(file);
    } catch (err) {
      if (err.code !== "ENOENT") {
        return { ok: false, refusal: REFUSAL.LOCK_HELD, detail: `could not clear the dead lock: ${err.code}` };
      }
    }
    const claimed = claimExclusively(file, record);
    if (claimed && claimed.ok) return { ...claimed, instanceId, reclaimedFrom: holder.operationId ?? "unknown" };
    if (claimed === null) {
      return { ok: false, refusal: REFUSAL.LOCK_HELD, detail: "another process claimed the lock during recovery" };
    }
    return claimed;
  } finally {
    // Released only on a path that reached a decision. A crash before here leaves the token, which
    // blocks automatic recovery of this instance and forces manual cleanup — by design.
    try {
      unlinkSync(tokenPath);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Releases the lock, but only the exact instance the caller acquired.
 *
 * `instanceId` matters: two runs can share an operation id, and releasing on the operation id
 * alone would let a later run delete an earlier one's live lock.
 */
export function releaseLock({ environment, uid, operationId, instanceId, lockDir } = {}) {
  const target = lockDir ?? resolveLockDir();
  let file;
  try {
    file = lockPathFor(target, environment, uid);
  } catch {
    return { ok: true };
  }
  if (!existsSync(file)) return { ok: true };

  const holder = readHolder(file);
  if (holder) {
    if (holder.operationId !== operationId) {
      return { ok: false, refusal: REFUSAL.LOCK_HELD, detail: "lock held by another operation" };
    }
    if (instanceId != null && holder.instanceId !== instanceId) {
      return { ok: false, refusal: REFUSAL.LOCK_HELD, detail: "lock held by another instance of this operation" };
    }
  }
  try {
    unlinkSync(file);
  } catch {
    /* ignore */
  }
  return { ok: true };
}

/**
 * Runs `fn` while holding the lock, releasing it in `finally`.
 *
 * Every orchestrator path goes through this rather than pairing acquire/release by hand. The lock
 * is a file, so a path that returns early — or calls `process.exit()` — leaves it behind, and the
 * next run then has to establish that the holder is dead before it can continue.
 */
export async function withLock({ environment, uid, operationId, lockDir }, fn) {
  const held = acquireLock({ environment, uid, operationId, lockDir });
  if (!held.ok) return { ok: false, refusal: held.refusal, detail: held.detail, heldBy: held.heldBy };
  try {
    return { ok: true, result: await fn(held) };
  } finally {
    // Not released when we merely observed our own pre-existing hold: the outer frame owns it.
    if (!held.alreadyHeld) {
      releaseLock({ environment, uid, operationId, instanceId: held.instanceId, lockDir });
    }
  }
}

export function inspectLock({ environment, uid, lockDir } = {}) {
  const target = lockDir ?? resolveLockDir();
  let file;
  try {
    file = lockPathFor(target, environment, uid);
  } catch {
    return { present: false };
  }
  if (!existsSync(file)) return { present: false };
  const holder = readHolder(file);
  return { present: true, holder, liveness: holderIsLive(holder) };
}
