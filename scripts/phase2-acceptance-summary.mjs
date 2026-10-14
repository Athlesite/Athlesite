/** Read the SQL-produced state; never recompute the database bucket logic here. */
export function mappedIpv6Observation(output) {
  const state = output.match(/OBSERVATION: ipv4_mapped_ipv6_collapses_to_sentinel=(true|false|unknown)\b/)?.[1];
  return state === "true" ? true : state === "false" ? false : null;
}

export function mappedIpv6Summary(observation) {
  return `  OBSERVATION — IPv4-mapped IPv6 collapses to sentinel: ${observation ?? "unknown (no boolean observed)"}`;
}

export function acceptanceExitCode({ phase, rollbackHttpObserved, allPass, failureCount }) {
  if (!allPass || failureCount > 0) return 1;
  return phase === "armed" && !rollbackHttpObserved ? 2 : 0;
}

/** Called only after all recorded assertions and runner steps have succeeded. */
export function acceptanceSuccessSummary({ phase, rollbackHttpObserved, mappedIpv6 }) {
  const incomplete = phase === "armed" && !rollbackHttpObserved;
  const headline = incomplete
    ? "SQL ASSERTIONS PASS — rollback HTTP observation not configured; Gate D INCOMPLETE"
    : "PASS — every recorded assertion matched.";
  const rollback = phase === "pre-arm"
    ? "  The rollback drill was not run in pre-arm."
    : incomplete
      ? "  Catalog disarm/rearm checks passed; PostgREST rollback observation remains unproved."
      : "  The rollback drill includes successful disarmed HTTP observation and catalog restoration.";

  return `\n  ${headline}\n` +
    `${mappedIpv6Summary(mappedIpv6)}\n` +
    "  SQL coverage: ACLs, volatility, per-role hook execution, method gate,\n" +
    "  concurrency, lock-wait, replay, uniqueness, and cleanup.\n" +
    `${rollback}\n` +
    "  This is not complete hosted acceptance: request.path, client-address format,\n" +
    "  forwarding-header trust, hosted transaction mode, body logging, CSP, and\n" +
    "  browser/bfcache evidence remain separate runbook gates.\n" +
    "  See docs/ai/RUNBOOK-phase2-acceptance.md.\n";
}
