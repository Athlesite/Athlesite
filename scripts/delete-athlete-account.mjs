/**
 * Founder-only local tool for permanent athlete account deletion (Checkpoint 5D.9).
 *
 * ── WHAT THIS FILE IS ────────────────────────────────────────────────────────────
 *
 * An adapter, nothing more. It loads configuration, authenticates the athlete when a mode needs
 * a session, builds the real ports, calls `runDeletion`, and turns the result into output and an
 * exit code. Every ordering and refusal rule lives in `scripts/lifecycle/orchestrator.mjs`,
 * where it can be tested without a live project.
 *
 * ── PILOT MODEL ──────────────────────────────────────────────────────────────────
 *
 * Deletion is founder-assisted. This tool performs only the steps an authenticated OWNER is
 * already authorised to perform under existing RLS and Storage policies:
 *
 *   unpublish  ->  enumerate  ->  delete media  ->  delete profile row
 *
 * It then STOPS and hands off. **It never deletes the Auth user**, never uses a service_role
 * key, never touches `storage.objects` with SQL, and never weakens a policy. Auth-user deletion
 * is performed manually by the founder in the Supabase dashboard, strictly last.
 *
 * ── WHY AUTH IS STRICTLY LAST ────────────────────────────────────────────────────
 *
 * `athlete_profiles.owner_user_id` is `references auth.users(id) on delete cascade`, but NOTHING
 * cascades to Storage. Delete the Auth user first and the profile row vanishes while the media
 * survives — and the reliable route to removing it is gone, because Storage owner authorization is
 * keyed on `auth.uid()` and no new owner credential can be minted once the sign-in path is deleted.
 *
 * Note what is NOT claimed: that the objects instantly become unreachable. A token issued before
 * the deletion still carries the `auth.uid()` claim and may remain API-valid until it expires. The
 * ordering exists because nothing *dependable* remains, not because access provably ends.
 * So: media, then row, then Auth.
 *
 * ── WHAT COUNTS AS DONE ──────────────────────────────────────────────────────────
 *
 * Only verified absence. A 200 from a delete call, a failed signing attempt, an empty list from
 * an unauthorised reader, and a failed `getUser()` are all explicitly NOT evidence.
 *
 * ── COOPERATIVE QUIET WINDOW (a limitation, not a guarantee) ─────────────────────
 *
 * Unpublishing does not install a write barrier. Another tab, a stale edit form, or a second
 * session can still save or upload mid-operation. The tool detects that by re-scanning before
 * each destructive transition and rolling the checkpoint backward, but it cannot prevent it.
 * Do not describe this workflow as race-safe.
 *
 *   Usage:
 *     ATHLESITE_ACCOUNT_DELETION=1 node scripts/delete-athlete-account.mjs --mode <mode> [options]
 *
 *   Modes:
 *     plan            (default) read-only; reports what would happen
 *     execute         performs the owner-authorised deletion steps
 *     verify-owner    read-only verification WITH an athlete session
 *     verify-public   read-only public verification with NO session, and the only mode
 *                     usable after the Auth user has been deleted
 *
 *   Options:
 *     --slug <slug>       informational target hint; identity is bound to uid, not slug
 *     --operation <id>    resume an existing operation (required for verify-public)
 *     --work-dir <path>   override the founder-only inventory directory
 *     --full-keys         print every discovered object key in full, untruncated. The live
 *                         acceptance cases that verify enumeration completeness cannot be judged
 *                         from a shortened sample. Keys only — never signed URLs, never tokens.
 *
 *   Diagnostics (acceptance testing only):
 *     ATHLESITE_DELETION_FORCE_PUBLIC_UNREACHABLE=1
 *     ATHLESITE_DELETION_FORCE_PUBLIC_EXPOSED=1
 *       INJECT a synthetic public-verification result: the first an unreachable endpoint (UNKNOWN),
 *       the second one published row (EXPOSED). The check happens BEFORE the real `api()` call and
 *       returns in its place, so for that one check no HTTP request is issued — these exercise the
 *       result GATE, not the HTTP path. Without the variable set, nothing reaches the injection and
 *       the real public request is always made.
 *
 *       They exist because the alternatives do not isolate the public gate. Blocking the project
 *       host at the firewall also breaks authentication; changing NEXT_PUBLIC_SUPABASE_URL changes
 *       the environment fingerprint, so the run is refused for an unrelated reason; and republishing
 *       a profile to make it genuinely EXPOSED trips the concurrent-activity check first, before any
 *       public request is made. With these switches auth still succeeds and the bound environment is
 *       unchanged, so a refusal is attributable to the public result alone.
 *
 *       Both can ONLY cause a refusal. Neither UNKNOWN nor EXPOSED is treated anywhere as
 *       permission to proceed, so they cannot make the tool delete anything it otherwise would not.
 */
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { REFUSAL, environmentFingerprint } from "./lifecycle/binding.mjs";
import {
  persistInventory,
  loadInventory,
  withLock,
  resolveWorkDir,
  assertSafeWorkDir,
  newOperationId,
} from "./lifecycle/store.mjs";
import { enumerateOwnerNamespace, makeStorageLister } from "./lifecycle/enumerate.mjs";
import { sendDeletionOtp, verifyDeletionOtp, confirmIdentity } from "./lifecycle/reauth.mjs";
import { runDeletion, MODE } from "./lifecycle/orchestrator.mjs";
import { readHiddenLine, readVisibleLine } from "./lifecycle/terminal.mjs";

const BUCKET = "athlete-media";

// ──────────────────────────────────────────────────────────────── gating ──

if (process.env.ATHLESITE_ACCOUNT_DELETION !== "1") {
  console.error(
    "\n  Refusing to run: this tool permanently deletes athlete data from the live project.\n" +
      "  Set ATHLESITE_ACCOUNT_DELETION=1 and run it only with founder approval, following\n" +
      "  docs/ai/RUNBOOK-deletion.md.\n"
  );
  process.exit(2);
}

// ───────────────────────────────────────────────────────────────── args ──

function parseArgs(argv) {
  const args = { mode: MODE.PLAN };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--slug") args.slug = argv[++i];
    else if (a === "--operation") args.operation = argv[++i];
    else if (a === "--mode") args.mode = argv[++i];
    else if (a === "--work-dir") args.workDir = argv[++i];
    else if (a === "--full-keys") args.fullKeys = true;
    else {
      console.error(`  unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!Object.values(MODE).includes(args.mode)) {
    console.error(`  --mode must be one of: ${Object.values(MODE).join(", ")}`);
    process.exit(2);
  }
  return args;
}

const args = parseArgs(process.argv);

// ────────────────────────────────────────────────────────── environment ──

/**
 * Reads the project URL and publishable key.
 *
 * The guard below rejects the two credential spellings this project actually uses. It is a
 * guard against an obvious mistake, NOT an exhaustive role detector: a legacy JWT-format key
 * carries its role inside the encoded payload, and this does not decode or inspect that. Never
 * rely on it as proof that a key is owner-scoped — the operational rule is that only the
 * publishable key belongs in `.env.local`.
 */
function loadEnv() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY missing");
  if (/sb_secret_|service_role/.test(anonKey)) {
    throw new Error("refusing to run with a secret/service_role key — this tool is owner-scoped only");
  }
  return { url, anonKey };
}

// ───────────────────────────────────────────────────────────── plumbing ──

let ENV_URL;
let ANON;

const api = async (path, { token, method = "GET", body, headers = {} } = {}) => {
  let response;
  try {
    response = await fetch(`${ENV_URL}${path}`, {
      method,
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token ?? ANON}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // A transport failure is reported as unreachable, never as an empty result.
    return { reachable: false, status: null, ok: false, json: null, parsed: false };
  }
  const text = await response.text();
  let json = null;
  let parsed = true;
  if (text.trim() !== "") {
    try {
      json = JSON.parse(text);
    } catch {
      parsed = false;
    }
  }
  return { reachable: true, status: response.status, ok: response.ok, json, parsed };
};

const log = (msg) => console.log(`  ${msg}`);

// ──────────────────────────────────────────────── interactive input ──

/**
 * The emailed code is read with terminal echo OFF, and both readers are used BEFORE any readline
 * interface exists — so there is exactly one consumer of stdin while raw mode is in effect. Their
 * cleanup behaviour (raw mode restored, listeners removed, promise settled) is tested in
 * `scripts/lifecycle/terminal.test.mjs`.
 */
const readHidden = (promptText) => readHiddenLine(promptText, { input, output });
const readVisible = (promptText) => readVisibleLine(promptText, { input, output });

// ─────────────────────────────────────────────────────── real port set ──

function buildPorts({ token, identity, workDir, rl }) {
  return {
    identity,
    log,
    newOperationId,
    newRunId: () => `run-${randomUUID()}`,

    /**
     * FRESH validation of the credential in hand, called at every destructive boundary.
     *
     * `GET /auth/v1/user` with the access token. A 200 whose `id` matches means the credential is
     * **currently accepted for this uid** — which is what authorises the next destructive step.
     *
     * It is deliberately NOT treated as evidence that the Auth user exists: an access token issued
     * before a deletion can stay signature-valid until it expires, so a 200 here after a deletion
     * would prove nothing about the user. Auth-user absence is established only by the founder in
     * the dashboard, and post-Auth phases never call this.
     */
    validateSession: async () => {
      if (!token) return { authValidated: false };
      const r = await api("/auth/v1/user", { token });
      if (r.status !== 200 || !r.parsed || !r.json || typeof r.json.id !== "string") {
        return { authValidated: false };
      }
      return { authValidated: true, uid: r.json.id };
    },
    now: () => new Date().toISOString(),
    prompt: (question) => rl.question(`\n  ${question}`),
    persist: (inventory) => persistInventory(inventory, { dir: workDir }),
    load: (operationId) => loadInventory(operationId, { dir: workDir }),
    withLock: (identityKey, fn) =>
      withLock(identityKey, (held) => {
        // Recovery evidence, surfaced rather than swallowed: the acceptance case for dead-holder
        // recovery needs to see which operation was reclaimed from.
        if (held.reclaimedFrom) log(`lock reclaimed from a dead holder: ${held.reclaimedFrom}`);
        else if (held.alreadyHeld) log("lock already held by this process");
        return fn();
      }),

    /** Reads the owner's own row by bound uid. Never by slug. */
    readOwnRow: async (uid) => {
      const r = await api(
        `/rest/v1/athlete_profiles?select=id,owner_user_id,slug,is_published&owner_user_id=eq.${uid}`,
        { token }
      );
      if (r.status !== 200 || !r.parsed || !Array.isArray(r.json)) return { readOk: false };
      if (r.json.length === 0) return { readOk: true, rowPresent: false };
      const row = r.json[0];
      return {
        readOk: true,
        rowPresent: true,
        rowId: row.id,
        observedOwnerUid: row.owner_user_id,
        slug: row.slug,
        isPublished: row.is_published,
      };
    },

    unpublish: async (uid) => {
      const r = await api(`/rest/v1/athlete_profiles?owner_user_id=eq.${uid}`, {
        token,
        method: "PATCH",
        body: { is_published: false },
        headers: { Prefer: "return=representation" },
      });
      if (r.status !== 200 || !Array.isArray(r.json) || r.json.length !== 1) {
        return { ok: false, status: r.status };
      }
      return { ok: r.json[0].is_published === false, status: r.status };
    },

    /**
     * Anonymous public lookup. Deliberately sends no Authorization beyond the publishable key,
     * because the question is what an ordinary visitor can see.
     */
    publicProfileBySlug: async (slug) => {
      if (!slug) return { reachable: false };
      // Fail-closed diagnostics; see the header. Each can only produce UNKNOWN or EXPOSED, never
      // ABSENT, and neither of those is permission to proceed anywhere in the orchestrator.
      if (process.env.ATHLESITE_DELETION_FORCE_PUBLIC_UNREACHABLE === "1") {
        log("DIAGNOSTIC: public verification forced to UNREACHABLE by environment switch");
        return { reachable: false };
      }
      if (process.env.ATHLESITE_DELETION_FORCE_PUBLIC_EXPOSED === "1") {
        log("DIAGNOSTIC: public verification forced to EXPOSED by environment switch");
        return { reachable: true, status: 200, parsed: true, rows: [{ forced: true }] };
      }
      const r = await api("/rest/v1/rpc/get_published_profile_by_slug", {
        method: "POST",
        body: { profile_slug: slug },
      });
      return {
        reachable: r.reachable,
        status: r.status,
        parsed: r.parsed && Array.isArray(r.json),
        rows: Array.isArray(r.json) ? r.json : null,
      };
    },

    scan: async (uid) => {
      const list = makeStorageLister({
        fetchImpl: fetch,
        supabaseUrl: ENV_URL,
        anonKey: ANON,
        accessToken: token,
        bucket: BUCKET,
      });
      return enumerateOwnerNamespace({ list, rootPrefix: uid, pageSize: 100 });
    },

    deleteMedia: async (keys) => {
      const r = await api(`/storage/v1/object/${BUCKET}`, { token, method: "DELETE", body: { prefixes: keys } });
      return { ok: r.ok, status: r.status };
    },

    deleteProfileRow: async (uid) => {
      const r = await api(`/rest/v1/athlete_profiles?owner_user_id=eq.${uid}`, {
        token,
        method: "DELETE",
        headers: { Prefer: "return=representation" },
      });
      return { ok: r.ok, status: r.status };
    },
  };
}

// ──────────────────────────────────────────────────────────────── main ──

async function main() {
  // Local-only checks FIRST: the work-dir safety check and the startup banner depend on nothing
  // Supabase-related, and must run even when .env.local is entirely absent — a clean checkout with
  // no project configured, which is exactly the state of a fresh CI runner. `loadEnv()` used to run
  // first and throw ENOENT before either of these ever executed; a generic top-level catch then
  // turned that into an opaque INTERNAL_ERROR with empty stdout, which is what actually failed on
  // Linux CI (reproduced locally by removing .env.local — identical failure on this same OS).
  // Nothing security-relevant moves: the environment gate and argument parsing already run before
  // main() is even called (see the top of this file), and loadEnv()'s service_role/sb_secret_ guard
  // still runs — merely later, immediately before its result is first needed.
  const safeDir = assertSafeWorkDir(args.workDir ?? resolveWorkDir());
  if (!safeDir.ok) {
    console.error(`\n  STOP [${safeDir.refusal}] ${safeDir.detail}\n`);
    return 1;
  }
  const workDir = safeDir.dir;

  const needsSession = args.mode !== MODE.VERIFY_PUBLIC;

  console.log("\n  Athlesite — founder-assisted account deletion");
  console.log(`  mode: ${args.mode}${args.mode === MODE.EXECUTE ? "  (WILL MUTATE)" : "  (read-only)"}`);
  console.log(`  inventory dir: ${workDir}`);
  console.log("  this tool never deletes the Auth user and never uses a service_role key\n");

  if (!needsSession) {
    log("no session requested: public verification does not authenticate as the athlete");
  }

  // Everything from here on talks to the configured Supabase project — an OTP request, or (for
  // verify-public) the public-verification RPC — so the project configuration is loaded now, the
  // first point it is actually required, rather than at the top of main().
  const { url, anonKey } = loadEnv();
  ENV_URL = url;
  ANON = anonKey;
  const environment = environmentFingerprint(url);

  // The email and the code are read BEFORE any readline interface exists, so the hidden-input
  // reader is the only consumer of stdin while it runs. Two consumers on one stdin is how raw-mode
  // handling goes wrong, and getting that wrong here would leave the terminal in raw mode.
  let token;
  let identity = null;

  if (needsSession) {
    // Sign-in-only OTP. This flow cannot create an account.
    const email = (await readVisible("Athlete email (never written to disk by this tool): ")).trim();
    const sent = await sendDeletionOtp({ fetchImpl: fetch, supabaseUrl: ENV_URL, anonKey: ANON, email });
    if (!sent.ok) {
      console.error(
        `\n  STOP [OTP_REQUEST_REFUSED] status ${sent.status ?? "-"}${sent.code ? ` code ${sent.code}` : ""}\n` +
          "  If the Auth user has already been deleted this is expected and correct — that account\n" +
          "  cannot sign in any more. Use --mode verify-public --operation <id> instead.\n"
      );
      return 1;
    }
    log("code sent (sign-in only; this flow cannot create an account)");

    const code = (await readHidden("Emailed code (not echoed): ")).trim();
    const verified = await verifyDeletionOtp({
      fetchImpl: fetch,
      supabaseUrl: ENV_URL,
      anonKey: ANON,
      email,
      token: code,
    });
    if (!verified.ok) {
      console.error(`\n  STOP [OTP_VERIFY_FAILED] status ${verified.status ?? "-"}\n`);
      return 1;
    }

    token = verified.accessToken; // memory only, never persisted
    const confirmed = await confirmIdentity({
      fetchImpl: fetch,
      supabaseUrl: ENV_URL,
      anonKey: ANON,
      accessToken: token,
    });
    if (!confirmed.authValidated || confirmed.uid !== verified.uid) {
      console.error(`\n  STOP [${REFUSAL.AUTH_VALIDATION_FAILED}]\n`);
      return 1;
    }
    identity = { authValidated: true, uid: confirmed.uid };
    log(`authenticated and identity confirmed (uid ends ...${identity.uid.slice(-6)})`);
  }

  const rl = createInterface({ input, output });
  try {
    const result = await runDeletion({
      mode: args.mode,
      environment,
      operationId: args.operation ?? null,
      slug: args.slug ?? null,
      ports: buildPorts({ token, identity, workDir, rl }),
    });

    return report(result);
  } finally {
    rl.close();
  }
}


/** Turns the orchestrator's structured result into output and an exit code. */
function report(result) {
  if (result.ok !== true) {
    console.error(`\n  STOP [${result.refusal}]${result.detail ? ` ${result.detail}` : ""}`);
    if (result.heldBy) console.error(`  another operation holds the lock: ${result.heldBy}`);
    console.error("  Nothing further was attempted. See docs/ai/RUNBOOK-deletion.md.\n");
    return 1;
  }

  if (result.plan) {
    console.log("\n  ── PLAN (nothing was changed) ──");
    console.log(`  operation      : ${result.inventory.operationId}`);
    console.log(`  bound uid      : ...${result.inventory.uid.slice(-6)}`);
    const objects = result.objects ?? [];
    console.log(`  objects found  : ${objects.length}`);
    if (args.fullKeys) {
      // Complete and unabbreviated. Enumeration completeness cannot be judged from a sample, and
      // the acceptance matrix has cases that turn on exactly which keys were discovered.
      console.log("  full key list  :");
      for (const key of objects) console.log(`    ${key}`);
    } else {
      for (const key of objects.slice(0, 20)) console.log(`    - ...${key.slice(-28)}`);
      if (objects.length > 20) {
        console.log(`    ... and ${objects.length - 20} more — re-run with --full-keys to list them all`);
      }
    }
    console.log("\n  Re-run with --mode execute to perform the deletion.\n");
    return 0;
  }

  if (result.verdict) {
    console.log("\n  ── VERIFICATION (no mutations) ──");
    for (const [k, v] of Object.entries(result.verdict)) console.log(`  ${k.padEnd(18)}: ${v}`);
    console.log("");
  }

  if (result.handoff) printAuthHandoff(result.handoff);

  if (result.checkpoint === "verified-complete") {
    console.log("  Operation is verified complete. The inventory may now be discarded.\n");
  }
  return 0;
}

function printAuthHandoff(handoff) {
  console.log("\n  ════════════════ MANUAL AUTH HANDOFF ════════════════");
  console.log("  Athlete media and profile row are deleted and absence is verified.");
  console.log("  This tool does NOT delete Auth users. Complete the operation manually:\n");
  console.log("    1. Open the Supabase dashboard for the ATHLETE project (never Ops).");
  console.log("    2. Authentication -> Users.");
  console.log(`    3. Delete EXACTLY this user id:\n\n         ${handoff.uid}\n`);
  console.log("    4. Confirm no other user was affected.");
  console.log(`    5. Re-run:  ${handoff.resumeWith}\n`);
  console.log("  That final run needs NO athlete session, which is the point: the account will be");
  console.log("  gone, so requesting an OTP for it would fail by design.\n");
  console.log("  Residual-credential caveat: an access token issued before deletion stays");
  console.log("  signature-valid until it expires, and any signed media URL already handed out");
  console.log("  stays valid for its TTL. The row and objects are gone, so such a token can read");
  console.log("  nothing — but do not describe deletion as instantly revoking every credential.");
  console.log("  ═════════════════════════════════════════════════════\n");
}

let code = 1;
try {
  code = await main();
} catch (err) {
  // Sanitised: provider and runtime messages can embed the project host.
  console.error(`\n  INTERNAL_ERROR (${err?.name ?? "Error"}) — diagnostics suppressed by policy.`);
  console.error("  No further steps were attempted.\n");
  code = 1;
}
// The single exit point. Locks are released inside `withLock`'s finally, which has already run
// by the time we get here — an early `process.exit()` mid-operation would skip that.
process.exit(code);
