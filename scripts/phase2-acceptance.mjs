/**
 * Live acceptance runner for Guardian-First Participation Phase 2.
 *
 * NOT part of CI, and not part of `npm test`. Every assertion it drives is
 * about deployed grants, real row locking, and real wall-clock expiry, so none
 * of it can run without a database — hence the gate below rather than any
 * wiring into a default script.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * IT CREATES SYNTHETIC MINOR PARTICIPATION ROWS. NEVER RUN IT ON PRODUCTION.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * docs/ai/GUARDRAILS.md § Athlete data forbids real athlete data in fixtures,
 * and the Phase 2 checkpoint forbids manufacturing production minors. This
 * harness manufactures eight fictional ones, on `example.invalid`, at fixed
 * ids. That is safe on a throwaway database and unacceptable anywhere else, so
 * the gate is deliberately awkward:
 *
 *   ATHLESITE_PHASE2_ACCEPTANCE=1          explicit opt-in
 *   PHASE2_ACCEPTANCE_DATABASE_URL=...     the target
 *   PHASE2_ACCEPTANCE_NONPROD_CONFIRM=...  the target's HOST, retyped
 *
 * The third one is the point. A flag can be set once and forgotten in a shell
 * profile; restating the host means the operator has looked at which database
 * they are about to write minor rows into. The runner compares it to the host
 * it parsed out of the URL and refuses on any mismatch. It cannot tell a
 * production host from a development one — only a human can — so it makes the
 * human say it.
 *
 * ── WHY psql AND NOT A NODE DRIVER ──────────────────────────────────────
 *
 * This project has no PostgreSQL client dependency and no `service_role` key
 * (docs/ai/DECISIONS.md § No service-role key in this project). Adding either
 * to run an acceptance harness would introduce a credential, or a vendor
 * dependency, whose only purpose is testing — a worse trade than requiring
 * `psql` on the operator's PATH. So the SQL files are the harness and this
 * file only sequences them.
 *
 * ── WHY TWO CONCURRENT SESSIONS ─────────────────────────────────────────
 *
 * Two of the five parts — concurrent decisions, and a redeem waiting out an
 * expiry behind a row lock — are claims about overlapping transactions. They
 * are unprovable in one session, and the a/b script pairs are written to
 * synchronise through the database itself (committed signals plus a direct
 * pg_stat_activity observation that the other session is genuinely blocked).
 * Session gates ensure A owns the target lock before B proceeds; completion
 * signals keep the next round from clearing state before B verifies it.
 *
 * ── DIAGNOSTIC POLICY ───────────────────────────────────────────────────
 *
 * The connection URL is parsed here and passed to psql through libpq
 * environment variables, never through argv — argv is visible to every other
 * process on the machine, and the URL contains a password. Nothing prints the
 * URL, the password, or the project ref; the host is printed once, because the
 * operator has already typed it and seeing it is the point.
 *
 *   Usage:
 *     ATHLESITE_PHASE2_ACCEPTANCE=1 \
 *     PHASE2_ACCEPTANCE_DATABASE_URL='postgresql://...' \
 *     PHASE2_ACCEPTANCE_NONPROD_CONFIRM=localhost \
 *     node scripts/phase2-acceptance.mjs [--keep-fixtures]
 *
 * See docs/ai/RUNBOOK-phase2-acceptance.md for the full procedure, the gates
 * this harness does NOT close, and what to do with a failure.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

const ACCEPTANCE_DIR = "supabase/acceptance";
const runId = randomUUID();

/**
 * The run order. `concurrent` pairs are launched together and both must exit
 * before the next step starts.
 */
const STEPS = [
  { label: "setup — preflight, schema, fixtures, coordination helpers", files: ["00-setup.sql"] },
  { label: "part A — deployed effective ACLs, volatility, grantees", files: ["01-acl.sql"] },
  { label: "part B — pre-request limiter scope and policy", files: ["02-limiter-scope.sql"] },
  { label: "part C — replay, token uniqueness, deleted owner", files: ["03-replay-uniqueness-owner.sql"] },
  {
    label: "part G — the hook under anon/authenticated/service_role, and the method gate",
    files: ["04-hook-roles.sql"],
  },
  {
    label: "part H — the read-only-transaction hazard A6 removes",
    files: ["05-readonly-hazard.sql"],
  },
  {
    label: "part D — concurrent guardian decisions (two sessions)",
    files: ["10-concurrency-a.sql", "11-concurrency-b.sql"],
    concurrent: true,
  },
  {
    label: "part J — the rate limits are hard caps under concurrency (two sessions)",
    files: ["12-limiter-atomic-a.sql", "13-limiter-atomic-b.sql"],
    concurrent: true,
  },
  {
    label: "part E — lock-wait expiry and the deleted-owner race (two sessions)",
    files: ["20-lockwait-a.sql", "21-lockwait-b.sql"],
    concurrent: true,
  },
  { label: "part F — the state the races left behind", files: ["30-concurrency-verify.sql"] },
];

const ROLLBACK_VERIFY_DISARMED = "41-rollback-verify-disarmed.sql";
const ROLLBACK_VERIFY_RESTORED = "42-rollback-verify-restored.sql";

const REPORT = "90-report.sql";
const TEARDOWN = "99-teardown.sql";

// ── Gate ──────────────────────────────────────────────────────────────────

function refuse(lines) {
  console.error(`\n  Refusing to run.\n`);
  for (const line of lines) console.error(`    ${line}`);
  console.error("");
  process.exit(2);
}

if (process.env.ATHLESITE_PHASE2_ACCEPTANCE !== "1") {
  refuse([
    "This harness CREATES SYNTHETIC MINOR PARTICIPATION ROWS and real auth users.",
    "",
    "Set ATHLESITE_PHASE2_ACCEPTANCE=1, and only against a local Supabase, a",
    "development branch, or a dedicated non-production database. Never production.",
    "",
    "See docs/ai/RUNBOOK-phase2-acceptance.md.",
  ]);
}

const databaseUrl = process.env.PHASE2_ACCEPTANCE_DATABASE_URL;
if (!databaseUrl) {
  refuse(["PHASE2_ACCEPTANCE_DATABASE_URL is not set."]);
}

let target;
try {
  target = new URL(databaseUrl);
} catch {
  refuse(["PHASE2_ACCEPTANCE_DATABASE_URL is not a parseable URL."]);
}

if (!["postgres:", "postgresql:"].includes(target.protocol)) {
  refuse([`PHASE2_ACCEPTANCE_DATABASE_URL is not a postgres:// URL.`]);
}

/**
 * The isolation acknowledgement.
 *
 * This harness is DESTRUCTIVE beyond its own fixtures: 02-limiter-scope.sql
 * empties `private.guardian_rate_limits` repeatedly to get deterministic
 * counts, and the armed-phase rollback drill unregisters the global PostgREST
 * hook. Both wreck anything else using the same database, so "non-production"
 * is not a strong enough claim — a shared development branch is non-production
 * and still the wrong target.
 *
 * Asking for a separate acknowledgement rather than folding this into the host
 * confirmation is deliberate: the two statements are different. One says which
 * database; this one says nobody else is using it.
 *
 * 00-setup.sql enforces the same requirement from the other side, by refusing
 * a database whose `auth.users` is nonempty, before any helper DDL.
 */
if (process.env.PHASE2_ACCEPTANCE_ISOLATED !== "1") {
  refuse([
    "PHASE2_ACCEPTANCE_ISOLATED is not set to 1.",
    "",
    "This harness does more than create fixtures. It DELETES ALL ROWS from",
    "private.guardian_rate_limits, and in --phase=armed it unregisters the global",
    "PostgREST pre-request hook before restoring it.",
    "",
    "Both are destructive to any other traffic sharing the database, so it needs an",
    "isolated throwaway database with no shared development traffic — not merely a",
    "non-production one.",
    "",
    "Set PHASE2_ACCEPTANCE_ISOLATED=1 to acknowledge that.",
  ]);
}

const confirm = process.env.PHASE2_ACCEPTANCE_NONPROD_CONFIRM;
if (!confirm || confirm !== target.hostname) {
  refuse([
    "PHASE2_ACCEPTANCE_NONPROD_CONFIRM must exactly equal the host in",
    "PHASE2_ACCEPTANCE_DATABASE_URL.",
    "",
    `  host in the URL:  ${target.hostname || "(none)"}`,
    `  confirmed host:   ${confirm ?? "(unset)"}`,
    "",
    "This is not a formality. This runner cannot tell a production database from a",
    "development one; restating the host is how a human asserts which it is.",
  ]);
}

const keepFixtures = process.argv.includes("--keep-fixtures");

/**
 * `--phase=pre-arm` (default) or `--phase=armed`.
 *
 * Only ONE assertion depends on it — part A6, the registered hook — but it has
 * to, because the right answer genuinely differs. Before arming, `(unset)` is
 * the PASS and is the positive evidence that the infrastructure and volatility
 * migrations are inert. After arming, the dispatcher must be named. The first
 * version asserted "armed" unconditionally while the runbook instructed a
 * pre-arm run, which guaranteed a confusing failure on a correct deployment.
 *
 * The rollback drill runs only in the armed phase. Rehearsing a kill switch
 * against a hook that was never registered proves nothing, and the drill's own
 * restore step would have nothing to restore.
 */
const phaseArgument = process.argv.find((argument) => argument.startsWith("--phase="));
const phase = phaseArgument ? phaseArgument.slice("--phase=".length) : "pre-arm";
if (!["pre-arm", "armed"].includes(phase)) {
  refuse([
    `Unknown --phase=${phase}.`,
    "",
    "  --phase=pre-arm  (default) the hook is NOT registered yet; A6 expects (unset)",
    "  --phase=armed              the hook IS registered; A6 expects the dispatcher,",
    "                             and the rollback drill runs",
  ]);
}
const expectArmed = phase === "armed" ? "1" : "0";

/** Opt-in HTTP smoke check for the disarmed window. Skipped unless both are set. */
const restUrl = process.env.PHASE2_ACCEPTANCE_REST_URL;
const anonKey = process.env.PHASE2_ACCEPTANCE_ANON_KEY;

// ── psql invocation ───────────────────────────────────────────────────────

/**
 * libpq environment for the child, built from the parsed URL.
 *
 * The password never reaches argv. `PGOPTIONS` pins an empty `search_path` off
 * — deliberately NOT set — because the acceptance SQL qualifies what it needs
 * and relies on `public` being reachable the way an ordinary session reaches
 * it; the harness is meant to see the database as a normal client does.
 */
function libpqEnv() {
  const env = { ...process.env };
  if (target.hostname) env.PGHOST = target.hostname;
  if (target.port) env.PGPORT = target.port;
  if (target.username) env.PGUSER = decodeURIComponent(target.username);
  if (target.password) env.PGPASSWORD = decodeURIComponent(target.password);
  const database = target.pathname.replace(/^\//, "");
  if (database) env.PGDATABASE = decodeURIComponent(database);
  for (const [key, value] of target.searchParams) {
    if (key === "sslmode") env.PGSSLMODE = value;
  }
  // Never let the parent's own URL leak into the child.
  delete env.PHASE2_ACCEPTANCE_DATABASE_URL;
  return env;
}

/** Shared psql arguments: the phase variable every file may reference. */
function psqlVars(extra = {}) {
  return Object.entries({ expect_armed: expectArmed, ...extra }).flatMap(([key, value]) => [
    "-v",
    `${key}=${value}`,
  ]);
}

function runPsql(file, { capture = false, vars = {} } = {}) {
  const filePath = path.join(ACCEPTANCE_DIR, file);
  if (!existsSync(filePath)) {
    return Promise.resolve({ file, code: 127, output: `missing acceptance file: ${filePath}` });
  }

  return new Promise((resolve) => {
    const child = spawn(
      "psql",
      ["-X", "-v", "ON_ERROR_STOP=1", ...psqlVars(vars),
        "-c", `select pg_catalog.set_config('phase2_acceptance.run_id', '${runId}', false)`,
        "-f", filePath],
      {
        env: libpqEnv(),
        stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
      }
    );

    let output = "";
    if (capture) {
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.on("data", (chunk) => {
        output += chunk;
      });
    }

    child.on("error", (error) => {
      resolve({
        file,
        code: 127,
        output:
          error.code === "ENOENT"
            ? "psql was not found on PATH. Install the PostgreSQL client tools and retry."
            : `psql could not be started (${error.code ?? "unknown"}).`,
      });
    });

    child.on("close", (code) => resolve({ file, code: code ?? 1, output }));
  });
}

/**
 * Runs one or more statements with `psql -c`, each in its OWN committed
 * transaction. This is what the rollback drill needs and what a single SQL
 * file cannot give it: a state that actually commits, so PostgREST can observe
 * it, rather than a reset and restore that cancel out inside one transaction.
 */
function runPsqlCommands(statements, { label }) {
  const args = ["-X", "-v", "ON_ERROR_STOP=1", "-At"];
  for (const statement of statements) args.push("-c", statement);

  return new Promise((resolve) => {
    const child = spawn("psql", args, { env: libpqEnv(), stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", (error) =>
      resolve({
        label,
        code: 127,
        output:
          error.code === "ENOENT"
            ? "psql was not found on PATH."
            : `psql could not be started (${error.code ?? "unknown"}).`,
      })
    );
    child.on("close", (code) => resolve({ label, code: code ?? 1, output: output.trim() }));
  });
}

/** The only value this drill will ever write back. Anything else is refused. */
const APPROVED_HOOK_FUNCTION = "public.data_api_pre_request";

/**
 * PART I — the kill switch, rehearsed as separately committed operations.
 *
 * Armed phase only. The sequence, and why each step is its own commit:
 *
 *   1. capture the existing setting                      (read)
 *   2. ALTER ROLE ... RESET + NOTIFY                      COMMITTED
 *   3. verify the catalog is disarmed                    (41-…)
 *   4. HTTP/Data API smoke check, if configured          (opt-in)
 *   5. ALTER ROLE ... SET + NOTIFY, restoring             COMMITTED, in `finally`
 *   6. verify the catalog is restored                    (42-…)
 *
 * Step 5 is in a `finally`, so a failure in 3 or 4 cannot leave the project
 * disarmed through an early return. There is deliberately NO SQL exception
 * handler anywhere in the drill: a restore that fails surfaces as a loud
 * runner error naming the exact statement to run by hand, rather than being
 * swallowed by a handler that then lets the run report success.
 */
async function rollbackDrill(failures) {
  console.log(`\n  ── part I — the kill switch, rehearsed (briefly disarms the hook)\n`);

  const captured = await runPsqlCommands(["select phase2_acceptance.hook_setting()"], {
    label: "capture hook setting",
  });
  if (captured.code !== 0) {
    failures.push(`rollback drill: could not read the current hook setting`);
    console.error(captured.output);
    return;
  }

  const before = captured.output.split("\n").pop().trim();
  console.log(`  captured hook setting: ${before}`);
  if (before === "(unset)") {
    failures.push("rollback drill REFUSED: armed acceptance requires an armed hook to disarm");
    return;
  }

  // Only ever restore the reviewed dispatcher, or nothing. If the captured
  // value named something else, this drill is not the tool to put it back.
  const restoreStatements =
    before === "(unset)"
      ? []
      : [
          `alter role authenticator set pgrst.db_pre_request = '${APPROVED_HOOK_FUNCTION}'`,
          "notify pgrst, 'reload config'",
        ];
  if (before !== "(unset)" && before !== `pgrst.db_pre_request=${APPROVED_HOOK_FUNCTION}`) {
    failures.push(
      `rollback drill REFUSED: the hook currently names something this drill will not write ` +
        `back (${before}). Disarm and restore it by hand.`
    );
    return;
  }

  let restored = false;
  try {
    const disarm = await runPsqlCommands(
      ["alter role authenticator reset pgrst.db_pre_request", "notify pgrst, 'reload config'"],
      { label: "disarm" }
    );
    if (disarm.code !== 0) {
      failures.push("rollback drill: the committed kill switch FAILED — see output");
      console.error(disarm.output);
    } else {
      const verifyDisarmed = await runPsql(ROLLBACK_VERIFY_DISARMED, { capture: true });
      process.stdout.write(verifyDisarmed.output);
      if (verifyDisarmed.code !== 0) failures.push(`${ROLLBACK_VERIFY_DISARMED} exited ${verifyDisarmed.code}`);

      // Step 4 — the one check that proves PostgREST actually observed the
      // disarmed state. Opt-in, because it needs network access and a key, and
      // skipped loudly rather than silently.
      if (restUrl && anonKey) {
        try {
          const beforeSmoke = await runPsqlCommands(["select count(*) from private.guardian_rate_limits"], { label: "before HTTP smoke" });
          if (beforeSmoke.code !== 0) throw new Error("counter read failed");
          const response = await fetch(`${restUrl.replace(/\/$/, "")}/rpc/peek_guardian_request`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: anonKey,
              Authorization: `Bearer ${anonKey}`,
            },
            body: JSON.stringify({ p_token: "x".repeat(43) }),
            signal: AbortSignal.timeout(10000),
          });
          await response.arrayBuffer();
          const afterSmoke = await runPsqlCommands(["select count(*) from private.guardian_rate_limits"], { label: "after HTTP smoke" });
          if (response.status !== 200 || afterSmoke.code !== 0 || beforeSmoke.output !== afterSmoke.output) {
            failures.push("rollback drill: HTTP did not prove successful peek with no limiter write; verify PostgREST reload timing");
          }
          console.log(`  HTTP smoke check while disarmed: status ${response.status}`);
        } catch {
          failures.push("rollback drill: configured HTTP smoke check failed");
        }
      } else {
        console.log(
          "  HTTP smoke check skipped — set PHASE2_ACCEPTANCE_REST_URL and\n" +
            "  PHASE2_ACCEPTANCE_ANON_KEY to exercise the disarmed window over HTTP."
        );
      }
    }
  } finally {
    if (restoreStatements.length > 0) {
      const restore = await runPsqlCommands(restoreStatements, { label: "restore" });
      restored = restore.code === 0;
      if (!restored) {
        failures.push(
          "ROLLBACK DRILL COULD NOT RESTORE THE HOOK. The project is DISARMED. Run by hand:\n" +
            `        alter role authenticator set pgrst.db_pre_request = '${APPROVED_HOOK_FUNCTION}';\n` +
            "        notify pgrst, 'reload config';"
        );
        console.error(restore.output);
      }
    } else {
      restored = true;
    }
  }

  const verifyRestored = await runPsql(ROLLBACK_VERIFY_RESTORED, {
    capture: true,
    vars: { expected_hook: before },
  });
  process.stdout.write(verifyRestored.output);
  if (verifyRestored.code !== 0) failures.push(`${ROLLBACK_VERIFY_RESTORED} exited ${verifyRestored.code}`);
}

// ── Run ───────────────────────────────────────────────────────────────────

console.log(`\n  Phase 2 live acceptance`);
console.log(`  target host: ${target.hostname}`);
console.log(`  phase:       ${phase}${phase === "armed" ? " (includes the rollback drill)" : ""}`);
console.log(`  run ID:      ${runId}`);
console.log(`  fixtures:    8 synthetic minor participation rows (example.invalid)`);
console.log(`  destructive: DELETES ALL rows from private.guardian_rate_limits`);
if (phase === "armed") {
  console.log(`               and briefly unregisters pgrst.db_pre_request, then restores it`);
}
console.log("");

const failures = [];

for (const step of STEPS) {
  console.log(`  ── ${step.label}`);

  let results;
  if (step.concurrent) {
    // Both sessions must be in flight at the same time; the SQL pair
    // synchronises itself and each side records a FAIL if the other never
    // arrives, so a stall is reported rather than hanging silently forever.
    results = await Promise.all(step.files.map((file) => runPsql(file, { capture: true })));
    for (const result of results) {
      if (result.output) process.stdout.write(result.output);
    }
  } else {
    results = [await runPsql(step.files[0])];
  }

  for (const result of results) {
    if (result.code !== 0) {
      failures.push(`${result.file} exited ${result.code}`);
      if (result.output && !step.concurrent) process.stdout.write(result.output);
    }
  }

  // Setup is a hard prerequisite, and its preflight is a deliberate STOP: a
  // reserved fixture id already existing, or a populated auth.users, means the
  // target is not an isolated throwaway database. Nothing has been mutated at
  // that point, and nothing should be.
  if (failures.length > 0 && step.files.includes("00-setup.sql")) {
    console.error(
      `\n  SETUP FAILED — stopping, and nothing was created.\n` +
        `  If the message above says PHASE2 PREFLIGHT STOP, that is the harness refusing a\n` +
        `  database it does not own. Do not delete the colliding identities to "fix" it;\n` +
        `  use an isolated throwaway database.\n`
    );
    process.exit(1);
  }
}

if (phase === "armed") {
  await rollbackDrill(failures);
} else {
  console.log(
    `\n  ── part I — skipped: the rollback drill needs --phase=armed\n` +
      `     (rehearsing a kill switch against an unregistered hook proves nothing)\n`
  );
}

console.log(`\n  ── report\n`);
const report = await runPsql(REPORT, { capture: true });
if (report.code !== 0) failures.push(`${REPORT} exited ${report.code}`);
process.stdout.write(report.output);

if (!keepFixtures) {
  console.log(`\n  ── teardown\n`);
  const teardown = await runPsql(TEARDOWN, { capture: true });
  if (teardown.code !== 0) {
    failures.push(`${TEARDOWN} exited ${teardown.code}`);
    process.stdout.write(teardown.output);
  }
} else {
  console.log(
    `\n  fixtures kept (--keep-fixtures). Run this to remove them:\n` +
      `    psql -X -v ON_ERROR_STOP=1 -c "select set_config('phase2_acceptance.run_id', '${runId}', false)" -f ${path.join(ACCEPTANCE_DIR, TEARDOWN)}\n`
  );
}

// The verdict comes from the report's own summary line, not from exit codes:
// every assertion is recorded as data, so a psql that exits 0 can still have
// produced failures, and that must not read as a pass.
const allPass = report.output.includes("PHASE2-ACCEPTANCE: ALL PASS");
const noAssertions = report.output.includes("PHASE2-ACCEPTANCE: NO ASSERTIONS RECORDED");

if (failures.length > 0) {
  console.error(`\n  SCRIPT FAILURES:`);
  for (const failure of failures) console.error(`    ${failure}`);
}

if (noAssertions) {
  console.error(`\n  FAIL — no assertions were recorded at all.\n`);
  process.exit(1);
}
if (!allPass || failures.length > 0) {
  console.error(`\n  FAIL — see the FAIL rows above.\n`);
  process.exit(1);
}

console.log(`\n  PASS — every recorded assertion matched.`);
console.log(
  `  This closes the ACL (including the exact dispatcher grantee set), peek/redeem\n` +
    `  volatility, per-role hook execution, the method gate, concurrency, lock-wait,\n` +
    `  replay, uniqueness, cleanup, and the rollback drill.\n` +
    `  It does NOT close: the observed request.path shape, forwarding-header\n` +
    `  trustworthiness, whether PostgREST really opens a read/write transaction for a\n` +
    `  POST to a VOLATILE function on a deployed project, platform logging of RPC\n` +
    `  bodies, proxy/CDN CSP behaviour, or browser bfcache behaviour.\n` +
    `  See docs/ai/RUNBOOK-phase2-acceptance.md.\n`
);
