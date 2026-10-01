import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, mkdirSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { bindOperation, REFUSAL } from "./binding.mjs";
import { createInventory, KEY_STATE } from "./checkpoints.mjs";
import {
  resolveWorkDir,
  resolveLockDir,
  assertSafeWorkDir,
  newOperationId,
  persistInventory,
  loadInventory,
  discardInventory,
  acquireLock,
  releaseLock,
  inspectLock,
  withLock,
} from "./store.mjs";

const UID = "11111111-1111-4111-8111-111111111111";
const ENV = "abcdef0123456789";
const STORE_URL = pathToFileURL(fileURLToPath(new URL("./store.mjs", import.meta.url))).href;

const dirs = [];
function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "athlesite-lifecycle-test-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) {
    try {
      rmSync(dirs.pop(), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function freshInventory(operationId = newOperationId()) {
  const { binding } = bindOperation({ environment: ENV, uid: UID, profileRowId: null, operationId });
  return createInventory({ binding });
}

function lockFileIn(dir) {
  return readdirSync(dir).filter((f) => f.startsWith("lock-"));
}

/**
 * Spawns a separate OS process that tries to acquire the lock and, on success, holds it.
 *
 * A real child process is the only honest test of exclusivity: in-process calls share a pid and
 * would pass even against a check-then-write implementation.
 */
function spawnWorker({ lockDir, operationId, holdMs = 0, release = false }) {
  // Inputs travel by environment, not argv: `node -e` does not keep argv[1] for the script, so
  // a positional list silently shifts and the first value is read as the second.
  const source = `
import { acquireLock, releaseLock } from ${JSON.stringify(STORE_URL)};
const lockDir = process.env.W_LOCK_DIR;
const operationId = process.env.W_OP_ID;
const identity = { environment: ${JSON.stringify(ENV)}, uid: ${JSON.stringify(UID)}, operationId, lockDir };
const r = acquireLock(identity);
process.stdout.write(JSON.stringify({ ok: r.ok === true, refusal: r.refusal ?? null, reclaimed: r.reclaimedFrom ?? null }));
if (r.ok) {
  await new Promise((res) => setTimeout(res, Number(process.env.W_HOLD_MS)));
  if (process.env.W_RELEASE === "1") releaseLock(identity);
}
`;
  return new Promise((resolveP, rejectP) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", source], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        W_LOCK_DIR: lockDir,
        W_OP_ID: operationId,
        W_HOLD_MS: String(holdMs),
        W_RELEASE: release ? "1" : "0",
      },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => {
      out += c;
    });
    child.stderr.on("data", (c) => {
      err += c;
    });
    child.on("error", rejectP);
    child.on("close", (code) => {
      if (out.trim() === "") return rejectP(new Error(`worker produced no output (code ${code}): ${err}`));
      resolveP({ ...JSON.parse(out.trim()), code, stderr: err });
    });
  });
}

describe("resolveWorkDir", () => {
  test("uses LOCALAPPDATA\\Athlesite\\deletion-work on Windows", () => {
    const dir = resolveWorkDir({ platform: "win32", env: { LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" } });
    assert.ok(dir.includes("Athlesite"));
    assert.ok(dir.includes("deletion-work"));
  });

  test("uses XDG_STATE_HOME elsewhere when set", () => {
    const dir = resolveWorkDir({ platform: "linux", env: { XDG_STATE_HOME: "/home/x/.local/state" } });
    assert.equal(dir, join("/home/x/.local/state", "athlesite", "deletion-work"));
  });

  test("is never inside the repository checkout", () => {
    const dir = resolveWorkDir({ platform: "win32", env: { LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" } });
    assert.ok(!dir.includes("projects"), "work dir must not live in the checkout");
    assert.ok(!/athlesite[\\/]+(src|scripts|docs|supabase)/i.test(dir));
  });

  test("the lock dir is NOT derived from a caller-supplied work dir", () => {
    // Locks must be per-environment/per-UID globally. If they lived beside the inventory, two
    // operators passing different --work-dir values would simply not see each other.
    const a = resolveLockDir({ platform: "linux", env: { XDG_STATE_HOME: "/home/x/.local/state" } });
    const b = resolveLockDir({ platform: "linux", env: { XDG_STATE_HOME: "/home/x/.local/state" } });
    assert.equal(a, b);
    assert.ok(!a.includes("deletion-work"), "locks live in their own fixed directory");
  });
});

describe("assertSafeWorkDir", () => {
  test("accepts an ordinary application-data directory", () => {
    const r = assertSafeWorkDir(tempDir());
    assert.equal(r.ok, true);
    assert.ok(r.dir.length > 0);
  });

  test("refuses a directory inside the repository checkout", () => {
    const inRepo = fileURLToPath(new URL("../../scripts/lifecycle-workdir-should-refuse", import.meta.url));
    const r = assertSafeWorkDir(inRepo);
    assert.equal(r.ok, false);
    assert.match(r.detail, /repository checkout/);
  });

  test("refuses the repository root itself", () => {
    const repo = fileURLToPath(new URL("../..", import.meta.url));
    assert.equal(assertSafeWorkDir(repo).ok, false);
  });

  test("refuses a cloud-synced directory", () => {
    const r = assertSafeWorkDir(join(tmpdir(), "OneDrive", "athlesite-work"));
    assert.equal(r.ok, false);
    assert.match(r.detail, /OneDrive/);
  });

  test("refuses an empty or non-string directory", () => {
    assert.equal(assertSafeWorkDir("").ok, false);
    assert.equal(assertSafeWorkDir(undefined).ok, false);
  });

  test("a sibling directory whose name merely shares the repo prefix is allowed", () => {
    // Containment is decided on path segments, not string prefixes.
    const repo = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
    const r = assertSafeWorkDir(`${repo}-elsewhere-work`);
    assert.equal(r.ok, true, "athlesite-elsewhere-work is not inside athlesite");
  });

  test("persistInventory refuses rather than silently relocating an unsafe dir", () => {
    const inRepo = fileURLToPath(new URL("../../.lifecycle-should-refuse", import.meta.url));
    const r = persistInventory(freshInventory(), { dir: inRepo });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.INVENTORY_CORRUPT);
  });
});

describe("persistInventory", () => {
  test("round-trips and verifies persistence by reading back", () => {
    const dir = tempDir();
    const inv = freshInventory();
    const w = persistInventory(inv, { dir });
    assert.equal(w.ok, true);

    const r = loadInventory(inv.operationId, { dir });
    assert.equal(r.ok, true);
    assert.equal(r.inventory.operationId, inv.operationId);
    assert.equal(r.inventory.checkpoint, "bound");
  });

  test("read-back compares the WHOLE object, not just the checkpoint", () => {
    const dir = tempDir();
    const inv = freshInventory();
    inv.keyStates[`${UID}/hero/a.png`] = KEY_STATE.PENDING;
    inv.keyStates[`${UID}/hero/b.png`] = KEY_STATE.VERIFIED_ABSENT;
    const w = persistInventory(inv, { dir });
    assert.equal(w.ok, true);
    const back = loadInventory(inv.operationId, { dir }).inventory;
    assert.deepEqual(back, JSON.parse(JSON.stringify(inv)), "every field must survive the round trip");
  });

  test("refuses to persist a corrupt inventory", () => {
    const dir = tempDir();
    const inv = { ...freshInventory(), checkpoint: "nonsense" };
    const w = persistInventory(inv, { dir });
    assert.equal(w.ok, false);
    assert.equal(w.refusal, REFUSAL.INVENTORY_CORRUPT);
  });

  test("REFUSES to persist an inventory carrying credential material", () => {
    const dir = tempDir();
    const inv = { ...freshInventory(), accessToken: "eyJshouldneverbehere" };
    const w = persistInventory(inv, { dir });
    assert.equal(w.ok, false);
  });

  test("the persisted file contains no credential-shaped strings", () => {
    const dir = tempDir();
    const inv = freshInventory();
    inv.keyStates[`${UID}/hero/a.png`] = KEY_STATE.PENDING;
    const w = persistInventory(inv, { dir });
    const raw = readFileSync(w.path, "utf8");
    for (const bad of ["eyJ", "sb_secret_", "sb_publishable_", "refresh_token", "Bearer ", "token="]) {
      assert.ok(!raw.includes(bad), `persisted inventory must not contain ${bad}`);
    }
  });

  test("leaves no temp file behind after a successful write", () => {
    const dir = tempDir();
    persistInventory(freshInventory(), { dir });
    const leftovers = readdirSync(dir).filter((n) => n.endsWith(".tmp"));
    assert.deepEqual(leftovers, [], "the temp file must be renamed or removed, never left");
  });

  test("a failed write reports ok:false so the caller can STOP", () => {
    // A directory standing where the inventory file should go makes the rename fail.
    const dir = tempDir();
    const inv = freshInventory();
    mkdirSync(join(dir, `${inv.operationId}.json`), { recursive: true });
    const w = persistInventory(inv, { dir });
    assert.equal(w.ok, false, "persistence failure must never be reported as success");
    assert.equal(w.refusal, REFUSAL.INVENTORY_CORRUPT);
  });
});

describe("loadInventory", () => {
  test("a missing inventory is a refusal, not an empty default", () => {
    const dir = tempDir();
    const r = loadInventory("op-does-not-exist-1234", { dir });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.INVENTORY_CORRUPT);
  });

  test("an unparseable inventory refuses rather than being repaired", () => {
    const dir = tempDir();
    const id = newOperationId();
    writeFileSync(join(dir, `${id}.json`), "{ not json", "utf8");
    const r = loadInventory(id, { dir });
    assert.equal(r.ok, false);
    assert.ok(r.problems.includes("unparseable"));
  });

  test("a structurally corrupt inventory refuses", () => {
    const dir = tempDir();
    const id = newOperationId();
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ formatVersion: 1 }), "utf8");
    assert.equal(loadInventory(id, { dir }).ok, false);
  });

  test("an unsafe operation id is rejected outright", () => {
    const dir = tempDir();
    assert.throws(() => loadInventory("../../etc/passwd", { dir }), /unsafe operation id/);
  });

  test("operation ids containing separators or dots cannot escape the work dir", () => {
    const dir = tempDir();
    for (const bad of ["op-..\\..\\x", "op-a/b", "op-.hidden", "op-a\0b", "op-short"]) {
      assert.throws(() => loadInventory(bad, { dir }), /unsafe operation id/, `${bad} must be rejected`);
    }
  });
});

describe("discardInventory", () => {
  test("refuses to discard before verified-complete", () => {
    const dir = tempDir();
    const inv = freshInventory();
    persistInventory(inv, { dir });
    const r = discardInventory(inv.operationId, { dir });
    assert.equal(r.ok, false);
    assert.match(r.detail, /verified-complete/);
  });

  test("discards once verified-complete", () => {
    const dir = tempDir();
    const inv = completedInventory();
    persistInventory(inv, { dir });
    assert.equal(discardInventory(inv.operationId, { dir }).ok, true);
    assert.equal(loadInventory(inv.operationId, { dir }).ok, false);
  });
});

describe("operation lock — exclusivity", () => {
  test("PRECONDITION: the fixture's 'live foreign pid' really is a live, foreign pid", () => {
    // Several tests below depend on this. If it ever stops holding, they would silently
    // degrade into testing a DEAD holder — i.e. the opposite of what they claim — so the
    // assumption is asserted out loud rather than trusted.
    const pid = livePidOtherThanOurs();
    assert.ok(Number.isInteger(pid) && pid > 0, "fixture pid must be a real pid");
    assert.notEqual(pid, process.pid, "fixture pid must not be this process");
    assert.doesNotThrow(() => process.kill(pid, 0), "fixture pid must be live");
  });

  test("acquisition is atomic: a second operation is refused while the first is held", () => {
    const lockDir = tempDir();
    const first = acquireLock({ environment: ENV, uid: UID, operationId: "op-first-000000", lockDir });
    assert.equal(first.ok, true);

    const second = acquireLock({ environment: ENV, uid: UID, operationId: "op-second-00000", lockDir });
    assert.equal(second.ok, false);
    assert.equal(second.refusal, REFUSAL.LOCK_HELD);
    assert.equal(second.heldBy, "op-first-000000");
  });

  test("the SAME operation id does NOT bypass a lock held by a live process", () => {
    const lockDir = tempDir();
    // A live holder recorded under this operation id but a different pid: the old behaviour
    // treated a matching operation id as re-entrant and handed over the lock.
    plantLock(lockDir, { operationId: "op-same-0000000", pid: process.pid });
    const again = acquireLock({ environment: ENV, uid: UID, operationId: "op-same-0000000", lockDir });
    // pid === process.pid AND matching op id is the one legitimate same-process case.
    assert.equal(again.ok, true);
    assert.equal(again.alreadyHeld, true);

    // But a matching operation id with a *different* live pid must be refused.
    plantLock(lockDir, { operationId: "op-same-0000000", pid: livePidOtherThanOurs() });
    const blocked = acquireLock({ environment: ENV, uid: UID, operationId: "op-same-0000000", lockDir });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.refusal, REFUSAL.LOCK_HELD);
    assert.match(blocked.detail, /does not bypass a live lock/);
  });

  test("a different uid in the same environment is not blocked", () => {
    const lockDir = tempDir();
    acquireLock({ environment: ENV, uid: UID, operationId: "op-a-00000000", lockDir });
    const other = acquireLock({
      environment: ENV,
      uid: "22222222-2222-4222-8222-222222222222",
      operationId: "op-b-00000000",
      lockDir,
    });
    assert.equal(other.ok, true, "the lock is per-uid, not global");
  });

  test("a different environment with the same uid is not blocked", () => {
    const lockDir = tempDir();
    acquireLock({ environment: ENV, uid: UID, operationId: "op-a-00000000", lockDir });
    const other = acquireLock({ environment: "0123456789abcdef", uid: UID, operationId: "op-b-00000000", lockDir });
    assert.equal(other.ok, true);
  });

  test("age alone NEVER permits a takeover", () => {
    const lockDir = tempDir();
    const aYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      join(lockDir, lockFileNameFor()),
      JSON.stringify({ operationId: "op-ancient-0000", pid: livePidOtherThanOurs(), host: hostname(), at: aYearAgo }),
      "utf8"
    );
    const r = acquireLock({ environment: ENV, uid: UID, operationId: "op-new-0000000", lockDir });
    assert.equal(r.ok, false, "a year-old lock held by a LIVE process is still held");
  });

  test("a lock from another host fails closed rather than being stolen", () => {
    const lockDir = tempDir();
    writeFileSync(
      join(lockDir, lockFileNameFor()),
      JSON.stringify({ operationId: "op-elsewhere-00", pid: 4242, host: "some-other-machine", at: new Date().toISOString() }),
      "utf8"
    );
    const r = acquireLock({ environment: ENV, uid: UID, operationId: "op-new-0000000", lockDir });
    assert.equal(r.ok, false);
    assert.match(r.detail, /cannot establish that the holder is dead|delete the lock file by hand/);
  });

  test("an unreadable lock file fails closed, it is not treated as absent", () => {
    const lockDir = tempDir();
    writeFileSync(join(lockDir, lockFileNameFor()), "{{{ corrupt", "utf8");
    const r = acquireLock({ environment: ENV, uid: UID, operationId: "op-new-0000000", lockDir });
    // An unreadable record could be a corrupt file OR a competitor mid-write. Reclaiming it
    // would be a guess, so the operator clears it after confirming no worker is running.
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.LOCK_HELD);
    assert.match(r.detail, /delete the lock file by hand/);
  });

  test("an EMPTY lock file also fails closed", () => {
    const lockDir = tempDir();
    writeFileSync(join(lockDir, lockFileNameFor()), "", "utf8");
    assert.equal(acquireLock({ environment: ENV, uid: UID, operationId: "op-new-0000000", lockDir }).ok, false);
  });

  test("inspectLock reports a corrupt holder as unknown, never as free", () => {
    const lockDir = tempDir();
    writeFileSync(join(lockDir, lockFileNameFor()), "nope", "utf8");
    const seen = inspectLock({ environment: ENV, uid: UID, lockDir });
    assert.equal(seen.present, true);
    assert.equal(seen.liveness.live, "unknown");
  });

  test("release refuses when the lock belongs to another operation", () => {
    const lockDir = tempDir();
    acquireLock({ environment: ENV, uid: UID, operationId: "op-owner-000000", lockDir });
    const r = releaseLock({ environment: ENV, uid: UID, operationId: "op-other-000000", lockDir });
    assert.equal(r.ok, false);
    assert.equal(r.refusal, REFUSAL.LOCK_HELD);
  });

  test("release succeeds for the holder and allows a new acquisition", () => {
    const lockDir = tempDir();
    acquireLock({ environment: ENV, uid: UID, operationId: "op-holder-00000", lockDir });
    assert.equal(releaseLock({ environment: ENV, uid: UID, operationId: "op-holder-00000", lockDir }).ok, true);
    assert.equal(acquireLock({ environment: ENV, uid: UID, operationId: "op-next-000000", lockDir }).ok, true);
  });

  test("withLock releases through finally even when the body throws", async () => {
    const lockDir = tempDir();
    await assert.rejects(
      withLock({ environment: ENV, uid: UID, operationId: "op-throws-00000", lockDir }, async () => {
        throw new Error("boom");
      })
    );
    assert.equal(lockFileIn(lockDir).length, 0, "the lock must not survive a thrown body");
    assert.equal(acquireLock({ environment: ENV, uid: UID, operationId: "op-after-000000", lockDir }).ok, true);
  });

  test("withLock refuses without running the body when the lock is held", async () => {
    const lockDir = tempDir();
    writeFileSync(
      join(lockDir, lockFileNameFor()),
      JSON.stringify({ operationId: "op-live-000000", pid: livePidOtherThanOurs(), host: hostname(), at: new Date().toISOString() }),
      "utf8"
    );
    let ran = false;
    const r = await withLock({ environment: ENV, uid: UID, operationId: "op-mine-000000", lockDir }, async () => {
      ran = true;
    });
    assert.equal(r.ok, false);
    assert.equal(ran, false, "the destructive body must never run without the lock");
  });
});

describe("operation lock — two competing worker processes", () => {
  test("exactly one of two concurrent processes acquires the lock", async () => {
    const lockDir = tempDir();
    const [a, b] = await Promise.all([
      spawnWorker({ lockDir, operationId: "op-worker-a0000", holdMs: 1200 }),
      spawnWorker({ lockDir, operationId: "op-worker-b0000", holdMs: 1200 }),
    ]);
    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);
    assert.equal(winners.length, 1, `exactly one worker must win, got ${winners.length}`);
    assert.equal(losers.length, 1);
    assert.equal(losers[0].refusal, REFUSAL.LOCK_HELD);
  });

  test("two concurrent processes sharing one operation id still cannot both proceed", async () => {
    const lockDir = tempDir();
    const [a, b] = await Promise.all([
      spawnWorker({ lockDir, operationId: "op-shared-00000", holdMs: 1200 }),
      spawnWorker({ lockDir, operationId: "op-shared-00000", holdMs: 1200 }),
    ]);
    assert.equal([a, b].filter((r) => r.ok).length, 1, "a shared operation id is not a licence to double-run");
  });

  test("a second process is admitted only after the holder releases", async () => {
    const lockDir = tempDir();
    const first = await spawnWorker({ lockDir, operationId: "op-first-w00000", holdMs: 50, release: true });
    assert.equal(first.ok, true);
    const second = await spawnWorker({ lockDir, operationId: "op-second-w0000", holdMs: 0, release: true });
    assert.equal(second.ok, true);
    assert.equal(second.reclaimed, null, "a released lock is simply gone, not reclaimed");
  });

  test("a lock abandoned by a crashed process is reclaimed, and says so", async () => {
    const lockDir = tempDir();
    // The worker exits without releasing — the lock file survives its pid.
    const crashed = await spawnWorker({ lockDir, operationId: "op-crashed-0000", holdMs: 0, release: false });
    assert.equal(crashed.ok, true);
    assert.equal(lockFileIn(lockDir).length, 1, "the abandoned lock file is still there");

    const next = acquireLock({ environment: ENV, uid: UID, operationId: "op-recover-0000", lockDir });
    assert.equal(next.ok, true, "a provably dead holder may be reclaimed");
    assert.equal(next.reclaimedFrom, "op-crashed-0000", "the reclaim must be visible, not silent");
  });
});

/** The lock file name for the fixture identity, mirroring the module's own sanitisation. */
function lockFileNameFor(environment = ENV, uid = UID) {
  return `lock-${environment.replace(/[^0-9a-f]/gi, "")}-${uid.replace(/[^0-9a-fA-F-]/g, "")}.json`;
}

/**
 * Writes a lock record by hand.
 *
 * `instanceId` is part of every real record, and a record without one is UNKNOWN rather than dead —
 * so a fixture that omits it is testing the corrupt-lock path, not the path it looks like.
 */
function plantLock(lockDir, overrides = {}) {
  const record = {
    operationId: "op-planted-00001",
    environment: ENV,
    uid: UID,
    instanceId: "11111111-2222-4333-8444-555555555555",
    pid: process.pid,
    host: hostname(),
    at: new Date().toISOString(),
    ...overrides,
  };
  for (const [k, v] of Object.entries(overrides)) if (v === undefined) delete record[k];
  writeFileSync(join(lockDir, lockFileNameFor()), JSON.stringify(record, null, 2), "utf8");
  return record;
}

/** An inventory that legitimately satisfies every verified-complete consistency rule. */
function completedInventory() {
  const inv = freshInventory();
  inv.checkpoint = "verified-complete";
  inv.enumerationComplete = true;
  inv.operatorConfirmations = {
    runId: "run-abcdefgh1234",
    quietWindowConfirmedAt: "2026-09-30T00:00:00.000Z",
    phraseConfirmedAt: "2026-09-30T00:00:01.000Z",
  };
  inv.evidence = [
    { checkpoint: "bound", at: "2026-09-30T00:00:00.000Z" },
    { checkpoint: "inventory-ready", at: "2026-09-30T00:00:02.000Z", objects: 0 },
    { checkpoint: "media-absent", at: "2026-09-30T00:00:03.000Z" },
    { checkpoint: "profile-absent", at: "2026-09-30T00:00:04.000Z" },
    { checkpoint: "auth-deletion-recorded", at: "2026-09-30T00:00:05.000Z" },
    { checkpoint: "verified-complete", at: "2026-09-30T00:00:06.000Z" },
  ];
  inv.authDeletion = { recordedAt: "2026-09-30T00:00:05.000Z", confirmedUid: UID };
  inv.residualTokenTest = {
    testedAt: "2026-09-30T00:00:05.500Z",
    readCapable: false,
    writeCapable: false,
    probeObjectKey: null,
    probeGeneration: null,
    probeRemovedGeneration: null,
    probeRemovedAt: null,
    tokenExpiryPassedAt: null,
    publicRecheckAt: "2026-09-30T00:00:05.900Z",
    adminCrossCheckAt: null,
  };
  inv.finalVerification = {
    at: "2026-09-30T00:00:06.000Z",
    publicState: "absent",
    adminCrossCheckAttestedAt: "2026-09-30T00:00:06.000Z",
  };
  return inv;
}

/**
 * A pid that is alive but is not this process.
 *
 * `process.ppid` is the test runner or shell that launched us; it is live by definition for as
 * long as this test runs, and it is never equal to `process.pid`.
 */
function livePidOtherThanOurs() {
  return process.ppid;
}

/**
 * A pid that is guaranteed to be dead: a child process is started, waited for, and its pid reused.
 *
 * Synchronous on purpose, so fixtures can be planted without threading async through every test.
 * PID reuse could in principle make this pid live again; if that happened the lock would read as
 * live and the test would fail closed rather than pass wrongly.
 */
function deadPid() {
  const done = spawnSync(process.execPath, ["-e", ""], { stdio: "ignore" });
  if (typeof done.pid !== "number") throw new Error("could not obtain a dead pid");
  try {
    process.kill(done.pid, 0);
    throw new Error("the fixture pid is still alive; cannot use it as a dead holder");
  } catch (err) {
    if (err.code !== "ESRCH") throw err;
  }
  return done.pid;
}

describe("operation lock — corrupt and ambiguous locks fail closed (MED 9)", () => {
  test("a MISSING pid is UNKNOWN, not dead", () => {
    const lockDir = tempDir();
    plantLock(lockDir, { pid: undefined });
    const r = acquireLock({ environment: ENV, uid: UID, operationId: "op-new-0000000", lockDir });
    assert.equal(r.ok, false, "a record with no pid must never be reclaimed");
    assert.equal(r.refusal, REFUSAL.LOCK_HELD);
    assert.match(r.detail, /no usable pid/);
  });

  test("an INVALID pid is UNKNOWN, not dead", () => {
    const lockDir = tempDir();
    for (const pid of [0, -1, 1.5, "1234", null, {}]) {
      plantLock(lockDir, { pid });
      const r = acquireLock({ environment: ENV, uid: UID, operationId: "op-new-0000000", lockDir });
      assert.equal(r.ok, false, `pid ${JSON.stringify(pid)} must not be treated as dead`);
    }
  });

  test("a record with NO instanceId is UNKNOWN, not dead", () => {
    // Without an instance id a takeover cannot prove it is removing the same lock it inspected, so
    // there is no safe recovery available and the only correct answer is to refuse.
    const lockDir = tempDir();
    plantLock(lockDir, { instanceId: undefined, pid: deadPid() });
    const r = acquireLock({ environment: ENV, uid: UID, operationId: "op-new-0000000", lockDir });
    assert.equal(r.ok, false);
    assert.match(r.detail, /no instance id/);
  });

  test("CORRUPT JSON is UNKNOWN, not dead", () => {
    const lockDir = tempDir();
    writeFileSync(join(lockDir, lockFileNameFor()), "{ not json at all", "utf8");
    const r = acquireLock({ environment: ENV, uid: UID, operationId: "op-new-0000000", lockDir });
    assert.equal(r.ok, false);
    assert.match(r.detail, /record unreadable/);
  });

  test("a JSON ARRAY or scalar in the lock file is UNKNOWN, not dead", () => {
    const lockDir = tempDir();
    for (const body of ["[]", '"held"', "42", "null"]) {
      writeFileSync(join(lockDir, lockFileNameFor()), body, "utf8");
      assert.equal(acquireLock({ environment: ENV, uid: UID, operationId: "op-new-0000000", lockDir }).ok, false);
    }
  });

  test("a same-host corrupt lock is NOT auto-reclaimed", () => {
    const lockDir = tempDir();
    writeFileSync(
      join(lockDir, lockFileNameFor()),
      JSON.stringify({ host: hostname(), garbage: true }),
      "utf8"
    );
    const r = acquireLock({ environment: ENV, uid: UID, operationId: "op-new-0000000", lockDir });
    assert.equal(r.ok, false, "same host is not a licence to reclaim a record we cannot read");
    assert.match(r.detail, /delete the lock file by hand/);
  });

  test("every fail-closed refusal names the manual remedy", () => {
    const lockDir = tempDir();
    plantLock(lockDir, { host: "some-other-machine", pid: 4242 });
    const r = acquireLock({ environment: ENV, uid: UID, operationId: "op-new-0000000", lockDir });
    assert.equal(r.ok, false);
    assert.match(r.detail, /confirm no founder process is running/);
  });
});

describe("operation lock — dead-holder recovery is atomic (HIGH 1)", () => {
  test("a provably dead holder is reclaimed, and the reclaim is reported", () => {
    const lockDir = tempDir();
    plantLock(lockDir, { operationId: "op-dead-0000001", pid: deadPid() });
    const r = acquireLock({ environment: ENV, uid: UID, operationId: "op-live-0000001", lockDir });
    assert.equal(r.ok, true);
    assert.equal(r.reclaimedFrom, "op-dead-0000001", "a reclaim must be visible, not silent");
  });

  test("a leftover recovery token blocks automatic reclaim of THAT instance", () => {
    // This is the crash-mid-recovery case. It degrades to manual cleanup rather than to a race.
    const lockDir = tempDir();
    const planted = plantLock(lockDir, { operationId: "op-dead-0000002", pid: deadPid() });
    writeFileSync(
      join(lockDir, `${lockFileNameFor()}.takeover.${planted.instanceId}`),
      JSON.stringify({ recovering: planted.instanceId }),
      "utf8"
    );
    const r = acquireLock({ environment: ENV, uid: UID, operationId: "op-live-0000002", lockDir });
    assert.equal(r.ok, false);
    assert.match(r.detail, /recovery token|did not finish/);
  });

  test("a takeover token for a DIFFERENT instance does not block recovery", () => {
    const lockDir = tempDir();
    plantLock(lockDir, { operationId: "op-dead-0000003", pid: deadPid() });
    writeFileSync(
      join(lockDir, `${lockFileNameFor()}.takeover.some-other-instance`),
      JSON.stringify({ recovering: "some-other-instance" }),
      "utf8"
    );
    assert.equal(acquireLock({ environment: ENV, uid: UID, operationId: "op-live-0000003", lockDir }).ok, true);
  });

  test("a successful reclaim leaves no takeover token behind", () => {
    const lockDir = tempDir();
    plantLock(lockDir, { operationId: "op-dead-0000004", pid: deadPid() });
    assert.equal(acquireLock({ environment: ENV, uid: UID, operationId: "op-live-0000004", lockDir }).ok, true);
    assert.deepEqual(
      readdirSync(lockDir).filter((f) => f.includes(".takeover.")),
      [],
      "the token is cleanup, not state"
    );
  });

  test("release requires the exact instance, not just the operation id", () => {
    const lockDir = tempDir();
    const held = acquireLock({ environment: ENV, uid: UID, operationId: "op-inst-0000001", lockDir });
    assert.equal(held.ok, true);
    const wrongInstance = releaseLock({
      environment: ENV,
      uid: UID,
      operationId: "op-inst-0000001",
      instanceId: "00000000-0000-4000-8000-000000000000",
      lockDir,
    });
    assert.equal(wrongInstance.ok, false, "a later run must not release an earlier run's live lock");
    assert.equal(releaseLock({ environment: ENV, uid: UID, operationId: "op-inst-0000001", instanceId: held.instanceId, lockDir }).ok, true);
  });
});

describe("operation lock — the dead-holder recovery RACE, with two real processes", () => {
  test("two workers that both observe the same dead holder cannot both proceed", async () => {
    // The exact prior bug: both read the dead record, A unlinks it and claims the lock, then B —
    // still acting on its earlier read — unlinks A's LIVE lock and claims it too. Both proceeded.
    //
    // The two workers are started together against a lock file that is already present and whose
    // recorded pid is provably dead, so both are guaranteed to enter the recovery path.
    const lockDir = tempDir();
    plantLock(lockDir, { operationId: "op-dead-race-001", pid: deadPid() });

    const [a, b] = await Promise.all([
      spawnWorker({ lockDir, operationId: "op-race-a000001", holdMs: 1500 }),
      spawnWorker({ lockDir, operationId: "op-race-b000001", holdMs: 1500 }),
    ]);

    const winners = [a, b].filter((r) => r.ok);
    assert.equal(winners.length, 1, `exactly one worker may recover the dead lock, got ${winners.length}`);
    const loser = [a, b].find((r) => !r.ok);
    assert.equal(loser.refusal, REFUSAL.LOCK_HELD);
  });

  test("the winner's live lock is still intact after the loser refuses", async () => {
    const lockDir = tempDir();
    plantLock(lockDir, { operationId: "op-dead-race-002", pid: deadPid() });

    const [a, b] = await Promise.all([
      spawnWorker({ lockDir, operationId: "op-race-a000002", holdMs: 1500 }),
      spawnWorker({ lockDir, operationId: "op-race-b000002", holdMs: 1500 }),
    ]);
    const winnerOp = a.ok ? "op-race-a000002" : "op-race-b000002";
    assert.equal([a, b].filter((r) => r.ok).length, 1);

    // Both workers have exited by now and neither released, so the file left behind must be the
    // WINNER's record — not a record written by the loser over the top of it.
    const seen = inspectLock({ environment: ENV, uid: UID, lockDir });
    assert.equal(seen.present, true, "the loser must not have removed the winner's lock");
    assert.equal(seen.holder.operationId, winnerOp);
  });

  test("repeating the race ten times never admits two workers", async () => {
    // A single pass can pass by luck of scheduling. Ten passes with a short hold make the
    // interleaving vary, and the invariant has to hold in all of them.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const lockDir = tempDir();
      plantLock(lockDir, { operationId: `op-dead-loop-${String(attempt).padStart(3, "0")}`, pid: deadPid() });
      const [a, b] = await Promise.all([
        spawnWorker({ lockDir, operationId: "op-loop-a000001", holdMs: 60 }),
        spawnWorker({ lockDir, operationId: "op-loop-b000001", holdMs: 60 }),
      ]);
      assert.equal([a, b].filter((r) => r.ok).length, 1, `attempt ${attempt}: exactly one worker must win`);
    }
  });
});
