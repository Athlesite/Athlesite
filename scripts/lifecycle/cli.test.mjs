/**
 * Tests for the CLI adapter's own surface: the environment gate, argument validation, and the
 * work-dir refusal.
 *
 * These run the real script as a child process but never reach the network — each case is
 * expected to refuse before any request would be made. The sequencing rules are covered in
 * `orchestrator.test.mjs`, which can drive them without a project.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = fileURLToPath(new URL("../delete-athlete-account.mjs", import.meta.url));

/**
 * Runs the CLI with stdin closed.
 *
 * A case that reaches an interactive prompt would otherwise wait forever, so the child is
 * killed after `timeoutMs` and whatever it printed up to that point is returned with
 * `code: null`. Tests that assert on an exit code use cases that refuse before prompting;
 * tests that only assert on output may legitimately be killed.
 */
function runCli(argv, env = {}, timeoutMs = 10000) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [SCRIPT, ...argv], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (c) => {
      stdout += c;
    });
    child.stderr.on("data", (c) => {
      stderr += c;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      rejectPromise(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code: timedOut ? null : code, stdout, stderr, timedOut });
    });
  });
}

describe("CLI adapter", () => {
  test("refuses to run without the explicit environment gate", async () => {
    const r = await runCli(["--mode", "plan"], { ATHLESITE_ACCOUNT_DELETION: "" });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /Refusing to run/);
    assert.match(r.stderr, /ATHLESITE_ACCOUNT_DELETION=1/);
  });

  test("a gate value other than 1 is not accepted", async () => {
    for (const value of ["0", "true", "yes", "01"]) {
      const r = await runCli(["--mode", "plan"], { ATHLESITE_ACCOUNT_DELETION: value });
      assert.equal(r.code, 2, `gate value ${value} must not enable the tool`);
    }
  });

  test("rejects an unknown mode before doing anything", async () => {
    const r = await runCli(["--mode", "delete-everything"], { ATHLESITE_ACCOUNT_DELETION: "1" });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /--mode must be one of/);
  });

  test("names every valid mode in the error, including verify-public", async () => {
    const r = await runCli(["--mode", "nonsense"], { ATHLESITE_ACCOUNT_DELETION: "1" });
    assert.match(r.stderr, /plan/);
    assert.match(r.stderr, /execute/);
    assert.match(r.stderr, /verify-owner/);
    assert.match(r.stderr, /verify-public/);
  });

  test("rejects an unknown argument rather than ignoring it", async () => {
    const r = await runCli(["--force"], { ATHLESITE_ACCOUNT_DELETION: "1" });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /unknown argument: --force/);
  });

  test("refuses a work dir inside the repository checkout", async () => {
    const inRepo = fileURLToPath(new URL("../../.cli-test-should-refuse", import.meta.url));
    const r = await runCli(["--mode", "plan", "--work-dir", inRepo], { ATHLESITE_ACCOUNT_DELETION: "1" });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /repository checkout/);
  });

  test("refuses a cloud-synced work dir", async () => {
    const synced = join(tmpdir(), "OneDrive", "athlesite-cli-test");
    const r = await runCli(["--mode", "plan", "--work-dir", synced], { ATHLESITE_ACCOUNT_DELETION: "1" });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /OneDrive/);
  });

  test("the banner states the two capabilities this tool never has", async () => {
    // Printed before the first prompt, so it is visible even though this run is then killed
    // for want of stdin.
    const r = await runCli(["--mode", "plan"], { ATHLESITE_ACCOUNT_DELETION: "1" }, 4000);
    assert.match(r.stdout, /never deletes the Auth user/);
    assert.match(r.stdout, /never uses a service_role key/);
  });

  test("plan mode is labelled read-only and execute is labelled as mutating", async () => {
    const plan = await runCli(["--mode", "plan"], { ATHLESITE_ACCOUNT_DELETION: "1" }, 4000);
    assert.match(plan.stdout, /mode: plan\s+\(read-only\)/);
    const execute = await runCli(["--mode", "execute"], { ATHLESITE_ACCOUNT_DELETION: "1" }, 4000);
    assert.match(execute.stdout, /mode: execute\s+\(WILL MUTATE\)/);
  });

  test("verify-public announces that it does not authenticate as the athlete", async () => {
    const r = await runCli(["--mode", "verify-public"], { ATHLESITE_ACCOUNT_DELETION: "1" });
    assert.match(r.stdout, /does not authenticate as the athlete/);
  });


  test("--full-keys is accepted as an argument", async () => {
    // It must not be rejected as unknown; the acceptance matrix depends on it existing.
    const r = await runCli(["--mode", "plan", "--full-keys"], { ATHLESITE_ACCOUNT_DELETION: "1" }, 4000);
    assert.ok(!/unknown argument/.test(r.stderr), r.stderr);
  });

  test("the diagnostic public-failure switch can only cause a refusal, never a deletion", async () => {
    // Asserted structurally: the switch appears exactly once, inside publicProfileBySlug, and its
    // only effect is to return an unreachable result. An unreachable public result has no path in
    // the orchestrator that permits more work.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(SCRIPT, "utf8");
    const executable = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const name of ["ATHLESITE_DELETION_FORCE_PUBLIC_UNREACHABLE", "ATHLESITE_DELETION_FORCE_PUBLIC_EXPOSED"]) {
      const uses = executable.match(new RegExp(name, "g")) ?? [];
      assert.equal(uses.length, 1, `${name} must be read in exactly one place`);
    }
    // Each switch sits inside the public-lookup port and does nothing but shape its result.
    const unreachable = executable.slice(executable.indexOf("ATHLESITE_DELETION_FORCE_PUBLIC_UNREACHABLE"));
    assert.match(unreachable.slice(0, 260), /reachable: false/, "UNKNOWN is its only effect");
    const exposed = executable.slice(executable.indexOf("ATHLESITE_DELETION_FORCE_PUBLIC_EXPOSED"));
    assert.match(exposed.slice(0, 320), /rows: \[\{ forced: true \}\]/, "EXPOSED is its only effect");
    // Neither may touch anything destructive.
    for (const half of [unreachable.slice(0, 320), exposed.slice(0, 320)]) {
      assert.ok(!/delete|unpublish/i.test(half), "a diagnostic switch must not reach a mutation");
    }
  });

  test("the source contains no credential literals and no admin endpoints", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(SCRIPT, "utf8");
    const executable = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/\/auth\/v1\/admin/.test(executable), "must never call an Auth admin endpoint");
    assert.ok(!/service_role\s*:/.test(executable), "must never set a service_role claim");
    assert.ok(!/eyJ[A-Za-z0-9_-]{10,}/.test(source), "no JWT literal anywhere in the file");
    assert.ok(!/sb_secret_[A-Za-z0-9]/.test(executable), "no secret key literal");
    assert.ok(!/storage\.objects/.test(executable), "must never issue SQL against storage.objects");
  });
});
