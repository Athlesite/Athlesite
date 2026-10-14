import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  acceptanceExitCode, acceptanceSuccessSummary, mappedIpv6Observation,
} from "./phase2-acceptance-summary.mjs";

test("armed SQL success without HTTP observation leaves Gate D visibly incomplete", () => {
  const output = acceptanceSuccessSummary({ phase: "armed", rollbackHttpObserved: false });
  assert.match(output, /SQL ASSERTIONS PASS .* Gate D INCOMPLETE/);
  assert.match(output, /rollback HTTP observation not configured/);
  assert.match(output, /PostgREST rollback observation remains unproved/);
  assert.doesNotMatch(output, /PASS — every recorded assertion matched/);
  assert.doesNotMatch(output, /successful disarmed HTTP observation/);
});

test("armed success with observed HTTP reports the rollback proof but leaves hosted gates open", () => {
  const output = acceptanceSuccessSummary({ phase: "armed", rollbackHttpObserved: true });
  assert.match(output, /PASS — every recorded assertion matched/);
  assert.match(output, /successful disarmed HTTP observation and catalog restoration/);
  assert.doesNotMatch(output, /Gate D INCOMPLETE/);
  assert.match(output, /not complete hosted acceptance/);
});

test("pre-arm success requires no HTTP rollback observation", () => {
  const output = acceptanceSuccessSummary({ phase: "pre-arm", rollbackHttpObserved: false });
  assert.match(output, /PASS — every recorded assertion matched/);
  assert.match(output, /rollback drill was not run in pre-arm/);
  assert.doesNotMatch(output, /Gate D INCOMPLETE/);
});

for (const phase of ["pre-arm", "armed"]) {
  for (const observed of [true, false]) {
    test(`${phase} final output retains SQL observation ${observed} without an assertion label`, () => {
      const mappedIpv6 = mappedIpv6Observation(
        ` mapped_ipv6_observation\n-----------------------\n OBSERVATION: ipv4_mapped_ipv6_collapses_to_sentinel=${observed}\n(1 row)\n`
      );
      assert.equal(mappedIpv6, observed);
      const output = acceptanceSuccessSummary({ phase, rollbackHttpObserved: true, mappedIpv6 });
      const line = output.split("\n").find(value => value.includes("OBSERVATION —"));
      assert.equal(line, `  OBSERVATION — IPv4-mapped IPv6 collapses to sentinel: ${observed}`);
      assert.doesNotMatch(line, /PASS|FAIL/);
    });
  }
}

test("absent or unknown observation never fabricates a boolean", () => {
  for (const output of ["", "OBSERVATION: ipv4_mapped_ipv6_collapses_to_sentinel=unknown"]) {
    const mappedIpv6 = mappedIpv6Observation(output);
    assert.equal(mappedIpv6, null);
    assert.match(acceptanceSuccessSummary({ phase: "pre-arm", mappedIpv6 }), /sentinel: unknown \(no boolean observed\)/);
  }
});

test("only complete requested phases exit zero; armed SQL-only success exits two", () => {
  const clean = { allPass: true, failureCount: 0 };
  assert.equal(acceptanceExitCode({ ...clean, phase: "pre-arm", rollbackHttpObserved: false }), 0);
  assert.equal(acceptanceExitCode({ ...clean, phase: "armed", rollbackHttpObserved: true }), 0);
  assert.equal(acceptanceExitCode({ ...clean, phase: "armed", rollbackHttpObserved: false }), 2);
});

test("SQL, attempted HTTP, and restoration failures take precedence over incomplete evidence", () => {
  for (const rollbackHttpObserved of [true, false]) {
    assert.equal(acceptanceExitCode({ phase: "armed", rollbackHttpObserved, allPass: false, failureCount: 0 }), 1);
    // Failed HTTP or restoration steps are recorded in the runner failure ledger.
    assert.equal(acceptanceExitCode({ phase: "armed", rollbackHttpObserved, allPass: true, failureCount: 1 }), 1);
    assert.equal(acceptanceExitCode({ phase: "pre-arm", rollbackHttpObserved, allPass: true, failureCount: 1 }), 1);
  }
});

test("runner safety refusal exits one, reserving two for passed-but-incomplete acceptance", () => {
  const result = spawnSync(process.execPath, ["scripts/phase2-acceptance.mjs", "--phase=armed"], {
    env: { ...process.env, ATHLESITE_PHASE2_ACCEPTANCE: "" },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to run/);
  assert.doesNotMatch(result.stdout, /SQL ASSERTIONS PASS/);
});
