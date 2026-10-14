import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RATE_LIMIT_MIGRATION,
  VOLATILITY_MIGRATION,
  ARM_MIGRATION,
  RATE_LIMIT_POLICY,
  DISPATCHER_EXECUTE_ROLES,
  PROPERTIES,
  APPROVED_STATEMENTS,
  APPROVED_ARM_STATEMENTS,
  APPROVED_VOLATILITY_STATEMENTS,
  APPROVED_BODIES,
  validateGuardianRateLimitContract,
} from "./guardian-rate-limit-contract.mjs";

/**
 * Mutation tests for the Phase 2 production-readiness SQL contract.
 *
 * Each case mutates the REAL migration one attack at a time and proves the
 * contract rejects it. The emphasis matches the lesson recorded in
 * scripts/guardian-sql-contract.mjs: the mutations that defeated two earlier
 * generations of this project's SQL checkers were ADDITIONS and SUBSTITUTIONS,
 * not deletions, so most cases here add a statement, swap a source, widen a
 * predicate, or reorder control flow rather than removing something required.
 *
 * Two kinds of case, deliberately separated:
 *
 *   - TOP-LEVEL mutations, which Layer 1's exhaustive statement allowlist
 *     catches by construction. These prove the allowlist is actually
 *     exhaustive rather than merely long.
 *
 *   - BODY mutations, which Layer 1 masks on purpose (`<body>`). These are the
 *     only real test of Layer 2, so every one of them additionally asserts
 *     that a LAYER 2 property fired — a case that passed only because Layer 1
 *     objected would prove nothing about the property it claims to cover.
 */

const realSql = readFileSync(RATE_LIMIT_MIGRATION, "utf8");
const realArmSql = readFileSync(ARM_MIGRATION, "utf8");
const realVolatilitySql = readFileSync(VOLATILITY_MIGRATION, "utf8");

function run({ sql = realSql, armSql = realArmSql, volatilitySql = realVolatilitySql } = {}) {
  return validateGuardianRateLimitContract({
    [RATE_LIMIT_MIGRATION]: Buffer.from(sql, "utf8"),
    [VOLATILITY_MIGRATION]: Buffer.from(volatilitySql, "utf8"),
    [ARM_MIGRATION]: Buffer.from(armSql, "utf8"),
  });
}

/**
 * Literal find/replace as a mutate function.
 *
 * MUST go through a replacement FUNCTION, never a replacement string: both
 * migrations wrap every function body in `$$ … $$`, and
 * `String.prototype.replace` treats `$$` in a replacement STRING as an escape
 * for one literal `$`. A string replacement would silently corrupt the
 * dollar-quoting and the test would "pass" because it broke the tokenizer
 * rather than because the contract caught the attack. This is the same trap
 * guardian-sql-contract.test.mjs records having hit for real.
 */
function sub(find, replacement) {
  return (sql) => {
    const next = sql.replace(find, () => replacement);
    assert.notEqual(
      next,
      sql,
      `mutation did not apply — the snippet it searches for is stale, so this test would pass vacuously: ${find}`
    );
    return next;
  };
}

/** Asserts the mutation landed, that it was rejected, and (optionally) why. */
const SOURCES = {
  sql: { real: () => realSql, run: (mutated) => run({ sql: mutated }) },
  arm: { real: () => realArmSql, run: (mutated) => run({ armSql: mutated }) },
  volatility: {
    real: () => realVolatilitySql,
    run: (mutated) => run({ volatilitySql: mutated }),
  },
};

function expectRejected(mutate, { property, layer2 = false, target = "sql" } = {}) {
  const source = SOURCES[target];
  const mutated = mutate(source.real());
  const problems = source.run(mutated);

  assert.ok(
    problems.length > 0,
    "MUTATION NOT CAUGHT — the contract reported zero problems for this mutation"
  );
  assert.ok(
    !problems.some((p) => p.includes("could not be tokenized")),
    `mutation broke the tokenizer instead of exercising the property under test — the replacement ` +
      `probably mangled a $$ delimiter (use sub()). Problems: ${JSON.stringify(problems)}`
  );

  if (property) {
    assert.ok(
      problems.some((p) => p.startsWith(property)),
      `expected a "${property}" problem; got ${JSON.stringify(problems)}`
    );
  }
  if (layer2) {
    // The mutation must have been caught by a layer that inspects EXECUTABLE
    // BODY content — Layer 1b or a named Layer 2 property — and not only by
    // Layer 1's statement-shape comparison. A case that passed on Layer 1
     // alone would not be testing what it claims: the mutation would not be
    // inside a function body at all.
    //
    // "Layer 1b" counts, deliberately. It is the complete token comparison of
    // every body, and for mutations with no enumerated named property (the
    // decoder internals, for instance) it is the protection.
    assert.ok(
      problems.some((p) => !p.startsWith("Layer 1:")),
      "this case claims to exercise body-level checking, but every reported problem came from " +
        "Layer 1's statement-shape comparison — the mutation is not inside a function body, so it " +
        "proves nothing about the property"
    );
  }
  return problems;
}

describe("Phase 2 rate-limit contract — baseline", () => {
  test("the committed migrations satisfy the contract", () => {
    assert.deepEqual(validateGuardianRateLimitContract(), []);
  });

  test("statement allowlists are non-trivial", () => {
    assert.equal(APPROVED_STATEMENTS.length, 34);
    assert.equal(APPROVED_ARM_STATEMENTS.length, 2);
    assert.equal(APPROVED_VOLATILITY_STATEMENTS.length, 2);
    assert.ok(PROPERTIES.length >= 17);
    assert.ok(Object.keys(APPROVED_BODIES).length === 7, "every function body must have an approved baseline");
  });

  test("a missing file is a problem, not a silent pass", () => {
    const problems = validateGuardianRateLimitContract({
      [RATE_LIMIT_MIGRATION]: null,
      [VOLATILITY_MIGRATION]: null,
      [ARM_MIGRATION]: null,
    });
    assert.equal(problems.length, 3);
  });

  test("a missing peek-volatility migration is called out specifically", () => {
    // The most dangerous absence of the three: arming without it does not
    // merely leave peek unlimited, it makes every POST peek fail with 25006.
    const problems = validateGuardianRateLimitContract({
      [RATE_LIMIT_MIGRATION]: Buffer.from(realSql, "utf8"),
      [VOLATILITY_MIGRATION]: null,
      [ARM_MIGRATION]: Buffer.from(realArmSql, "utf8"),
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /25006/);
  });
});

describe("Layer 1 — nothing may be appended, removed, or retargeted", () => {
  test("an appended grant to anon on the limiter table", () => {
    expectRejected(
      sub(
        "comment on table private.guardian_rate_limits is",
        "grant select on private.guardian_rate_limits to anon;\n\ncomment on table private.guardian_rate_limits is"
      ),
      { property: "Layer 1" }
    );
  });

  test("an appended grant of schema USAGE to anon", () => {
    const problems = expectRejected(
      sub(
        "revoke all on schema private from public;",
        "revoke all on schema private from public;\ngrant usage on schema private to anon, authenticated;"
      )
    );
    assert.ok(problems.some((p) => p.startsWith("G:")), JSON.stringify(problems));
  });

  test("an appended DROP INDEX", () => {
    expectRejected(
      sub(
        "comment on table private.guardian_rate_limits is",
        "drop index private.guardian_rate_limits_endpoint_at_idx;\n\ncomment on table private.guardian_rate_limits is"
      ),
      { property: "Layer 1" }
    );
  });

  test("an appended DELETE against an athlete table", () => {
    const problems = expectRejected(
      sub(
        "comment on table private.guardian_rate_limits is",
        "delete from public.participation_events;\n\ncomment on table private.guardian_rate_limits is"
      )
    );
    assert.ok(problems.some((p) => p.startsWith("F:")), JSON.stringify(problems));
  });

  test("a fourth column on the limiter table", () => {
    const problems = expectRejected(
      sub("  request_at timestamptz not null,", "  request_at timestamptz not null,\n  user_agent text,")
    );
    assert.ok(problems.some((p) => p.startsWith("Layer 1")), JSON.stringify(problems));
    assert.ok(problems.some((p) => p.startsWith("F:")), JSON.stringify(problems));
  });

  test("a function losing its pinned empty search_path", () => {
    const problems = expectRejected(
      sub(
        "returns void\nlanguage plpgsql\nsecurity definer\nset search_path = ''\nas $$\ndeclare\n  v_now timestamptz",
        "returns void\nlanguage plpgsql\nsecurity definer\nas $$\ndeclare\n  v_now timestamptz"
      )
    );
    assert.ok(problems.some((p) => p.startsWith("H:")), JSON.stringify(problems));
  });

  test("RLS no longer enabled on the limiter table", () => {
    const problems = expectRejected(
      sub("alter table private.guardian_rate_limits enable row level security;\n\n", "")
    );
    assert.ok(problems.some((p) => p.startsWith("H:")), JSON.stringify(problems));
  });

  test("FORCE row level security, which would blind the owner's own functions", () => {
    const problems = expectRejected(
      sub(
        "alter table private.guardian_rate_limits enable row level security;",
        "alter table private.guardian_rate_limits enable row level security;\nalter table private.guardian_rate_limits force row level security;"
      )
    );
    assert.ok(problems.some((p) => p.startsWith("G:")), JSON.stringify(problems));
  });

});

describe("G — the dispatcher EXECUTE ACL (FOUNDER DECISION A1)", () => {
  test("widened back to PUBLIC", () => {
    const problems = expectRejected(
      sub(
        "grant execute on function public.data_api_pre_request() to anon, authenticated, service_role;",
        "grant execute on function public.data_api_pre_request() to public;"
      )
    );
    assert.ok(problems.some((p) => p.startsWith("G:")), JSON.stringify(problems));
    assert.ok(
      problems.some((p) => p.includes("A1")),
      "the failure should name the founder decision it violates"
    );
  });

  test("a role dropped from the approved set", () => {
    // A role PostgREST switches into, without EXECUTE, loses its ENTIRE Data
    // API — not just the limiter. Silent narrowing is as bad as widening.
    const problems = expectRejected(
      sub(
        "to anon, authenticated, service_role;",
        "to anon, authenticated;"
      )
    );
    assert.ok(problems.some((p) => p.startsWith("G:")), JSON.stringify(problems));
  });

  test("a fourth role added without review", () => {
    const problems = expectRejected(
      sub(
        "to anon, authenticated, service_role;",
        "to anon, authenticated, service_role, authenticator;"
      )
    );
    assert.ok(problems.some((p) => p.startsWith("G:")), JSON.stringify(problems));
    assert.ok(
      problems.some((p) => p.includes("authenticator")),
      "granting authenticator should be named as the stop-and-report case"
    );
  });

  test("the explicit PUBLIC revoke removed, leaving PostgreSQL's default grant in place", () => {
    // The subtle one: with the revoke gone, PUBLIC keeps the EXECUTE that
    // `create function` grants by default, so the rejected A1 design is live
    // even though the grant statement still reads as enumerated.
    const problems = expectRejected(
      sub("revoke all on function public.data_api_pre_request() from public;\n", "")
    );
    assert.ok(problems.some((p) => p.startsWith("G:")), JSON.stringify(problems));
  });

  test("a Data API role given access to limiter internals", () => {
    const problems = expectRejected(
      sub(
        "revoke all on function private.guardian_rate_limit_enforce(text) from public;",
        "grant execute on function private.guardian_rate_limit_enforce(text) to service_role;"
      )
    );
    assert.ok(
      problems.some((p) => p.startsWith("G:") || p.startsWith("F:")),
      JSON.stringify(problems)
    );
  });
});

describe("K — the peek-volatility migration (FOUNDER DECISION A6)", () => {
  test("peek left STABLE — every POST peek would fail with 25006", () => {
    const problems = expectRejected(
      sub(
        "alter function public.peek_guardian_request(text) volatile;",
        "alter function public.peek_guardian_request(text) stable;"
      ),
      { target: "volatility", property: "K:" }
    );
    assert.ok(problems.some((p) => p.includes("25006")), JSON.stringify(problems));
  });

  test("restating the body with create or replace instead of altering one attribute", () => {
    expectRejected(
      sub(
        "alter function public.peek_guardian_request(text) volatile;",
        "create or replace function public.peek_guardian_request(text) returns void language sql as $x$ select 1 $x$;"
      ),
      { target: "volatility", property: "K:" }
    );
  });

  test("retargeting the already-correct redeem function", () => {
    expectRejected(
      sub(
        "alter function public.peek_guardian_request(text) volatile;",
        "alter function public.redeem_guardian_request(text, text) volatile;"
      ),
      { target: "volatility", property: "K:" }
    );
  });

  test("an extra statement smuggled into the volatility migration", () => {
    expectRejected(
      sub(
        "alter function public.peek_guardian_request(text) volatile;",
        "alter function public.peek_guardian_request(text) volatile;\n" +
          "grant execute on function public.peek_guardian_request(text) to authenticated;"
      ),
      { target: "volatility", property: "K:" }
    );
  });

  test("changing the owner alongside the volatility", () => {
    expectRejected(
      sub(
        "alter function public.peek_guardian_request(text) volatile;",
        "alter function public.peek_guardian_request(text) volatile;\n" +
          "alter function public.peek_guardian_request(text) owner to authenticated;"
      ),
      { target: "volatility", property: "K:" }
    );
  });

  test("changing the pinned search_path alongside the volatility", () => {
    expectRejected(
      sub(
        "alter function public.peek_guardian_request(text) volatile;",
        "alter function public.peek_guardian_request(text) volatile;\n" +
          "alter function public.peek_guardian_request(text) set search_path = public;"
      ),
      { target: "volatility", property: "K:" }
    );
  });
});

describe("A — path scope", () => {
  test("a third endpoint smuggled into the CASE", () => {
    expectRejected(
      sub(
        "    when 'redeem_guardian_request' then 'redeem'",
        "    when 'redeem_guardian_request' then 'redeem'\n    when 'get_published_profile_by_slug' then 'peek'"
      ),
      { property: "A:", layer2: true }
    );
  });

  test("the guardian endpoint mapping removed", () => {
    expectRejected(sub("when 'peek_guardian_request' then 'peek'", "when 'peek_guardian_request' then 'redeem'"), {
      property: "A:",
      layer2: true,
    });
  });

  test("the `else null` arm replaced, so an unknown path resolves to a class", () => {
    expectRejected(sub("    else null\n  end;", "    else 'peek'\n  end;"), {
      property: "A:",
      layer2: true,
    });
  });

  test("LIKE-based path matching, whose underscores are wildcards", () => {
    expectRejected(
      sub(
        "if v_container is distinct from 'rpc' then\n    return;\n  end if;",
        "if not (v_path like '%/rpc/%') then\n    return;\n  end if;"
      ),
      { property: "A:", layer2: true }
    );
  });

  test("the rpc-container guard dropped, widening the scope to same-named tables", () => {
    expectRejected(
      sub("  if v_container is distinct from 'rpc' then\n    return;\n  end if;\n\n", ""),
      { property: "A:", layer2: true }
    );
  });

  test("limiter work before the scope decision — unrelated Data API traffic pays", () => {
    expectRejected(
      sub(
        "  v_path := pg_catalog.current_setting('request.path', true);",
        "  perform private.prune_guardian_rate_limits();\n  v_path := pg_catalog.current_setting('request.path', true);"
      ),
      { property: "A:", layer2: true }
    );
  });

  test("an extra early return, which would be an unscoped bypass", () => {
    expectRejected(
      sub(
        "  v_method := pg_catalog.current_setting('request.method', true);",
        "  return;\n  v_method := pg_catalog.current_setting('request.method', true);"
      ),
      { property: "A:", layer2: true }
    );
  });
});

describe("B — method gate", () => {
  test("non-POST guardian traffic no longer refused (the GET bypass onto STABLE peek)", () => {
    expectRejected(
      sub("  if v_method is distinct from 'POST' then\n    raise sqlstate 'PGRST' using", "  if false then\n    raise sqlstate 'PGRST' using"),
      { property: "B:", layer2: true }
    );
  });

  test("a NULL method admitted instead of refused", () => {
    expectRejected(sub("if v_method is distinct from 'POST' then", "if v_method <> 'POST' then"), {
      property: "B:",
      layer2: true,
    });
  });

  test("OPTIONS refused, which would break the CORS preflight entirely", () => {
    expectRejected(sub("  if v_method = 'OPTIONS' then\n    return;\n  end if;\n\n", ""), {
      property: "B:",
      layer2: true,
    });
  });

  test("the delegation to the enforcer removed", () => {
    expectRejected(sub("  perform private.guardian_rate_limit_enforce(v_endpoint);", "  return;"), {
      property: "B:",
      layer2: true,
    });
  });
});

describe("the three mutations that defeated the previous contract", () => {
  // Regression suite, named for what it is. Each of these left every token
  // SUBSEQUENCE the old checker looked for intact, so the old checker reported
  // zero problems while the limiter was disabled. They are kept as their own
  // suite so that a future refactor of the contract cannot quietly lose them.
  //
  // Each case asserts BOTH that Layer 1b caught the structural change AND that
  // a named Layer 2 property fired — because a failure that only says "the
  // body differs" is correct but tells a reviewer nothing.

  test("1. `and false` appended to the threshold condition", () => {
    const problems = expectRejected(
      sub("if v_observed >= v_global_limit then", "if v_observed >= v_global_limit and false then"),
      { layer2: true }
    );
    assert.ok(problems.some((p) => p.startsWith("Layer 1b")), JSON.stringify(problems));
    assert.ok(
      problems.some((p) => p.startsWith("C:") && p.includes("global threshold condition")),
      `expected the global threshold to be named; got ${JSON.stringify(problems)}`
    );
  });

  test("2. `and false` appended to the global COUNT predicate", () => {
    const problems = expectRejected(
      sub(
        "    and r.request_at > v_now - v_global_window;",
        "    and r.request_at > v_now - v_global_window and false;"
      ),
      { layer2: true }
    );
    assert.ok(problems.some((p) => p.startsWith("Layer 1b")), JSON.stringify(problems));
    assert.ok(
      problems.some((p) => p.startsWith("C:") && p.includes("global COUNT query")),
      `expected the global COUNT query to be named; got ${JSON.stringify(problems)}`
    );
  });

  test("3. all three limits reassigned to 999999 before enforcement", () => {
    const problems = expectRejected(
      sub(
        "  v_ip := private.guardian_request_ip();",
        "  v_burst_limit := 999999;\n  v_sustained_limit := 999999;\n" +
          "  v_global_limit := 999999;\n  v_ip := private.guardian_request_ip();"
      ),
      { layer2: true }
    );
    assert.ok(problems.some((p) => p.startsWith("Layer 1b")), JSON.stringify(problems));
    for (const limit of ["v_burst_limit", "v_sustained_limit", "v_global_limit"]) {
      assert.ok(
        problems.some((p) => p.startsWith("C:") && p.includes(limit)),
        `expected ${limit} to be named as reassigned; got ${JSON.stringify(problems)}`
      );
    }
  });
});

describe("C — threshold and predicate completeness", () => {
  test("a decrement is still a forbidden reassignment", () => {
    expectRejected(sub("  v_ip := private.guardian_request_ip();",
      "  v_burst_limit := v_burst_limit - 1;\n  v_ip := private.guardian_request_ip();"),
      { property: "C:", layer2: true });
  });

  test("an approved assignment moved outside its endpoint branch", () => {
    expectRejected(sql => sub("    v_global_limit := 300;\n", "")(sql).replace(
      "  v_ip := private.guardian_request_ip();",
      "  v_global_limit := 300;\n  v_ip := private.guardian_request_ip();"),
      { property: "C:", layer2: true });
  });

  test("the window clock sampled before the advisory wait", () => {
    expectRejected(sub("v_now timestamptz;", "v_now timestamptz := pg_catalog.clock_timestamp();"),
      { property: "C:", layer2: true });
  });

  test("both endpoint policy bundles swapped", () => {
    expectRejected(sql => sql.replace(
      "    v_burst_limit := 10;\n    v_sustained_limit := 40;\n    v_global_limit := 300;",
      "    v_burst_limit := 5;\n    v_sustained_limit := 15;\n    v_global_limit := 100;"
    ).replace(
      "  elsif p_endpoint = 'redeem' then\n    v_burst_limit := 5;\n    v_sustained_limit := 15;\n    v_global_limit := 100;",
      "  elsif p_endpoint = 'redeem' then\n    v_burst_limit := 10;\n    v_sustained_limit := 40;\n    v_global_limit := 300;"
    ), { property: "C:", layer2: true });
  });
  test("`or true` in a threshold condition", () => {
    expectRejected(sub("if v_observed >= v_burst_limit then", "if v_observed >= v_burst_limit or true then"), {
      property: "C:",
      layer2: true,
    });
  });

  test("a conditional reassignment of a limit", () => {
    expectRejected(
      sub(
        "  v_ip := private.guardian_request_ip();",
        "  if p_endpoint = 'peek' then v_global_limit := 999999; end if;\n  v_ip := private.guardian_request_ip();"
      ),
      { property: "C:", layer2: true }
    );
  });

  test("an increment of a limit", () => {
    expectRejected(
      sub(
        "  v_ip := private.guardian_request_ip();",
        "  v_burst_limit := v_burst_limit + 100;\n  v_ip := private.guardian_request_ip();"
      ),
      { property: "C:", layer2: true }
    );
  });

  test("peek and redeem burst limits swapped", () => {
    const problems = expectRejected(
      (sql) => sql.replace("    v_burst_limit := 10;\n    v_sustained_limit := 40;", "    v_burst_limit := 5;\n    v_sustained_limit := 40;"),
      { layer2: true }
    );
    assert.ok(problems.some((p) => p.startsWith("C:")), JSON.stringify(problems));
  });

  test("the endpoint predicate omitted from the global COUNT", () => {
    expectRejected(
      sub(
        "  where r.endpoint = p_endpoint\n    and r.request_at > v_now - v_global_window;",
        "  where r.request_at > v_now - v_global_window;"
      ),
      { property: "C:", layer2: true }
    );
  });

  test("the time predicate omitted from the burst COUNT", () => {
    expectRejected(
      sub(
        "      and r.endpoint = p_endpoint\n      and r.request_at > v_now - v_burst_window;",
        "      and r.endpoint = p_endpoint;"
      ),
      { property: "C:", layer2: true }
    );
  });

  test("an extra predicate added to the sustained COUNT", () => {
    expectRejected(
      sub(
        "      and r.request_at > v_now - v_sustained_window;",
        "      and r.request_at > v_now - v_sustained_window\n      and r.endpoint <> p_endpoint;"
      ),
      { property: "C:", layer2: true }
    );
  });

  test("enforcement moved before the limit assignments", () => {
    expectRejected(
      sub(
        "  if p_endpoint = 'peek' then\n    v_burst_limit := 10;",
        "  if v_observed >= v_global_limit then raise sqlstate 'PGRST' using message = 'x', detail = 'y'; end if;\n  if p_endpoint = 'peek' then\n    v_burst_limit := 10;"
      ),
      { layer2: true }
    );
  });
});

describe("C — atomicity (the advisory locks)", () => {
  test("frozen isolation snapshots cannot bypass serialized counters", () => {
    expectRejected(sub("is distinct from 'read committed' then", "= 'read committed' then"),
      { property: "C:", layer2: true });
  });
  test("the global advisory lock removed, making the cap non-atomic again", () => {
    const problems = expectRejected(
      sub("  perform pg_catalog.pg_advisory_xact_lock(20261014, pg_catalog.hashtext(p_endpoint));\n", ""),
      { layer2: true }
    );
    assert.ok(
      problems.some((p) => p.startsWith("C:") && p.includes("GLOBAL advisory lock")),
      JSON.stringify(problems)
    );
  });

  test("the per-network advisory lock removed", () => {
    const problems = expectRejected(
      (sql) =>
        sql.replace(
          /    perform pg_catalog\.pg_advisory_xact_lock\(\n      20261015,[\s\S]*?\n    \);\n/,
          ""
        ),
      { layer2: true }
    );
    assert.ok(problems.some((p) => p.startsWith("C:")), JSON.stringify(problems));
  });

  test("the lock order inverted, which is the deadlock-prone ordering", () => {
    const problems = expectRejected(
      sub(
        "  perform pg_catalog.pg_advisory_xact_lock(20261014, pg_catalog.hashtext(p_endpoint));",
        "  perform pg_catalog.pg_advisory_xact_lock(20261015, pg_catalog.hashtext(p_endpoint));"
      ),
      { layer2: true }
    );
    assert.ok(problems.some((p) => p.startsWith("C:")), JSON.stringify(problems));
  });

  test("a session-scoped lock substituted for a transaction-scoped one", () => {
    // `pg_advisory_lock` is held until the SESSION ends, not the transaction.
    // In a pooled connection that leaks the lock to the next request and
    // eventually wedges the endpoint class permanently.
    expectRejected(
      sub("perform pg_catalog.pg_advisory_xact_lock(20261014,", "perform pg_catalog.pg_advisory_lock(20261014,"),
      { layer2: true }
    );
  });
});

describe("A — the encoded-path bypass", () => {
  test("raw segment comparison restored (the original bypass)", () => {
    const problems = expectRejected(
      sub("if v_container is distinct from 'rpc' then", "if v_segments[v_count - 1] is distinct from 'rpc' then"),
      { layer2: true }
    );
    assert.ok(problems.some((p) => p.startsWith("A:")), JSON.stringify(problems));
  });

  test("the decode of the target segment removed", () => {
    expectRejected(
      sub(
        "    v_resource := private.guardian_decode_path_segment(v_segments[v_count]);",
        "    v_resource := v_segments[v_count];"
      ),
      { property: "A:", layer2: true }
    );
  });

  test("a malformed escape resolved instead of refused", () => {
    expectRejected(
      sub(
        "    if private.guardian_path_segment_malformed(v_segments[v_count - 1]) then\n      raise sqlstate 'PGRST' using",
        "    if false then\n      raise sqlstate 'PGRST' using"
      ),
      { property: "A:", layer2: true }
    );
  });

  test("the target-encoding check ungated, so unrelated paths get refused", () => {
    expectRejected(
      sub(
        "    if v_container = 'rpc'\n       and private.guardian_path_segment_malformed(v_segments[v_count]) then",
        "    if private.guardian_path_segment_malformed(v_segments[v_count]) then"
      ),
      { property: "A:", layer2: true }
    );
  });

  test("the decoder made multi-pass, reopening double-encoding", () => {
    // Re-scanning decoded output would make `%2570eek…` resolve to
    // `peek_guardian_request` here while PostgREST sees `%70eek…` and routes
    // nowhere — a disagreement in the other direction.
    expectRejected(
      sub(
        "      v_decoded := v_decoded || pg_catalog.chr(v_byte);\n      v_index := v_index + 3;",
        "      v_decoded := private.guardian_decode_path_segment(v_decoded || pg_catalog.chr(v_byte));\n      v_index := v_index + 3;"
      ),
      { layer2: true }
    );
  });

  test("the non-ASCII guard dropped from the decoder", () => {
    expectRejected(
      sub("      if v_byte = 0 or v_byte >= 128 then\n        return null;\n      end if;\n", ""),
      { layer2: true }
    );
  });

  test("the hex class narrowed to uppercase only", () => {
    // WAI accepts a-f as well as A-F, so `%5f` must decode exactly like `%5F`.
    expectRejected(
      (sql) => sql.replace(/\^\[0-9A-Fa-f\]\{2\}\$/g, "^[0-9A-F]{2}$"),
      { layer2: true }
    );
  });
});

describe("C — policy values and the boundary operator", () => {
  test("a silently permissive peek burst limit", () => {
    expectRejected(sub("v_burst_limit := 10;", "v_burst_limit := 10000;"), {
      property: "C:",
      layer2: true,
    });
  });

  test("a silently permissive redeem sustained limit", () => {
    expectRejected(sub("v_sustained_limit := 15;", "v_sustained_limit := 1500;"), {
      property: "C:",
      layer2: true,
    });
  });

  test("the global circuit breaker widened", () => {
    expectRejected(sub("v_global_limit := 300;", "v_global_limit := 300000;"), {
      property: "C:",
      layer2: true,
    });
  });

  test("a shortened window, which multiplies the effective allowance", () => {
    expectRejected(sub("v_sustained_window interval := '1 hour';", "v_sustained_window interval := '1 second';"), {
      property: "C:",
      layer2: true,
    });
  });

  test("`>` instead of `>=`, allowing one more call per window than approved", () => {
    expectRejected(sub("if v_observed >= v_burst_limit then", "if v_observed > v_burst_limit then"), {
      property: "C:",
      layer2: true,
    });
  });

  test("an opportunistic prune horizon shorter than the sustained window", () => {
    expectRejected(sub("and r.request_at < v_now - interval '2 hours';", "and r.request_at < v_now - interval '1 minute';"), {
      property: "C:",
      layer2: true,
    });
  });

  test("the prune retention floor removed", () => {
    expectRejected(
      sub("if p_retention is null or p_retention < interval '1 hour' then", "if p_retention is null then"),
      { property: "C:", layer2: true }
    );
  });
});

describe("D — fail-closed ordering", () => {
  test("an early return inside the enforcer", () => {
    expectRejected(
      sub("  v_ip := private.guardian_request_ip();", "  return;\n  v_ip := private.guardian_request_ip();"),
      { property: "D:", layer2: true }
    );
  });

  test("the unknown-endpoint arm falling through instead of refusing", () => {
    expectRejected(
      sub(
        "    raise sqlstate 'PGRST' using\n      message = pg_catalog.json_build_object(\n        'message', 'Request refused.'\n      )::text,",
        "    v_burst_limit := 1000000;\n    v_sustained_limit := 1000000;\n    v_global_limit := 1000000;\n    perform pg_catalog.json_build_object(\n        'message', 'Request refused.'\n      )::text,"
      ),
      { layer2: true }
    );
  });

  test("the global cap moved behind the client-address branch", () => {
    expectRejected(sub("  where r.endpoint = p_endpoint\n    and r.request_at > v_now - v_global_window;", "  where r.bucket_key = v_key and r.endpoint = p_endpoint\n    and r.request_at > v_now - v_global_window;"), {
      property: "D:",
      layer2: true,
    });
  });

  test("the recording INSERT removed, so no window ever fills", () => {
    expectRejected(
      sub(
        "  insert into private.guardian_rate_limits (bucket_key, endpoint, request_at)\n  values (v_key, p_endpoint, v_now);",
        ""
      ),
      { property: "D:", layer2: true }
    );
  });
});

describe("E — IP model", () => {
  test("the spoofable x-forwarded-for promoted ahead of cf-connecting-ip", () => {
    expectRejected(
      sub(
        "v_candidate := pg_catalog.btrim(coalesce(v_headers ->> 'cf-connecting-ip', ''));",
        "v_candidate := pg_catalog.btrim(pg_catalog.split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1));"
      ),
      { property: "E:", layer2: true }
    );
  });

  test("an unreviewed header added to the trust chain", () => {
    expectRejected(
      sub("coalesce(v_headers ->> 'x-real-ip', '')", "coalesce(v_headers ->> 'x-client-ip', '')"),
      { property: "E:", layer2: true }
    );
  });

  test("a different x-forwarded-for hop trusted", () => {
    expectRejected(
      sub("coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)", "coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 2)"),
      { property: "E:", layer2: true }
    );
  });

  test("`when others`, which hides an internal failure as a missing header", () => {
    expectRejected(
      sub("    when invalid_text_representation then\n      return null;\n  end;\n\n  if v_headers is null then", "    when others then\n      return null;\n  end;\n\n  if v_headers is null then"),
      { property: "E:", layer2: true }
    );
  });

  test("the IP derivation raising instead of returning NULL", () => {
    expectRejected(
      sub("  if v_candidate = '' then\n    return null;\n  end if;", "  if v_candidate = '' then\n    raise exception 'no client address';\n  end if;"),
      { property: "E:", layer2: true }
    );
  });

  test("hashing the full address instead of the truncated network", () => {
    expectRejected(
      sub(
        "         pg_catalog.host(\n           pg_catalog.network(\n             pg_catalog.set_masklen(\n               p_ip,\n               case when pg_catalog.family(p_ip) = 4 then 24 else 56 end\n             )\n           )\n         ),",
        "         pg_catalog.host(p_ip),"
      ),
      { property: "E:", layer2: true }
    );
  });

  test("an IPv6 masklen a /64 holder can evade", () => {
    expectRejected(
      sub("case when pg_catalog.family(p_ip) = 4 then 24 else 56 end", "case when pg_catalog.family(p_ip) = 4 then 32 else 128 end"),
      { property: "E:", layer2: true }
    );
  });

  test("the salt dropped from the digest, making the key enumerable", () => {
    expectRejected(
      sub("    s.salt\n    || pg_catalog.convert_to(", "    pg_catalog.convert_to("),
      { property: "E:", layer2: true }
    );
  });
});

describe("F — non-storage and no dynamic SQL", () => {
  test("the raw token stored alongside the counter", () => {
    const problems = expectRejected(
      sub(
        "create or replace function private.guardian_rate_limit_enforce(p_endpoint text)",
        "create or replace function private.guardian_rate_limit_enforce(p_endpoint text, p_token text)"
      )
    );
    assert.ok(problems.some((p) => p.startsWith("F:")), JSON.stringify(problems));
  });

  test("a reference to the participation table", () => {
    const problems = expectRejected(
      sub(
        "  v_ip := private.guardian_request_ip();",
        "  perform pg_catalog.count(*) from public.athlete_participation;\n  v_ip := private.guardian_request_ip();"
      )
    );
    assert.ok(problems.some((p) => p.startsWith("F:")), JSON.stringify(problems));
  });

  test("dynamic SQL inside a body, which puts the whole contract out of reach", () => {
    expectRejected(
      sub(
        "  insert into private.guardian_rate_limits (bucket_key, endpoint, request_at)\n  values (v_key, p_endpoint, v_now);",
        "  execute 'insert into private.guardian_rate_limits (bucket_key, endpoint, request_at) values ($1, $2, $3)';"
      ),
      { property: "F:", layer2: true }
    );
  });
});

describe("I — prune safety", () => {
  test("the opportunistic prune losing its bucket scope, so it deletes other buckets", () => {
    expectRejected(
      sub("  where r.bucket_key = v_key\n    and r.request_at < v_now - interval '2 hours';", "  where r.request_at < v_now - interval '2 hours';"),
      { property: "I:", layer2: true }
    );
  });

  test("the global prune losing its time horizon, truncating live counters", () => {
    expectRejected(
      sub("  delete from private.guardian_rate_limits r\n  where r.request_at < pg_catalog.clock_timestamp() - p_retention;", "  delete from private.guardian_rate_limits r;"),
      { property: "I:", layer2: true }
    );
  });
});

describe("J — the arming migration", () => {
  test("a third statement sharing the global arming step", () => {
    expectRejected(
      sub(
        "notify pgrst, 'reload config';",
        "grant usage on schema private to anon;\n\nnotify pgrst, 'reload config';"
      ),
      { property: "J:", target: "arm" }
    );
  });

  test("a different function registered in the global hook slot", () => {
    expectRejected(
      sub("= 'public.data_api_pre_request'", "= 'public.something_else'"),
      { property: "J:", target: "arm" }
    );
  });

  test("the hook registered on a different role", () => {
    expectRejected(sub("alter role authenticator set", "alter role postgres set"), {
      property: "J:",
      target: "arm",
    });
  });

  test("the config reload dropped, leaving arming time indeterminate", () => {
    expectRejected(sub("\nnotify pgrst, 'reload config';", ""), { property: "J:", target: "arm" });
  });
});

describe("B — the method gate is required even with VOLATILE guardian RPCs", () => {
  test("removing the gate leaves read-only GET/HEAD calls unlimitable regardless of volatility", () => {
    // GET/HEAD always run read-only, including for VOLATILE functions. Peek
    // can succeed without a write, so only the armed method gate refuses it.
    expectRejected(
      sub(
        "  if v_method is distinct from 'POST' then\n    raise sqlstate 'PGRST' using",
        "  if false then\n    raise sqlstate 'PGRST' using"
      ),
      { property: "B:", layer2: true }
    );
  });

  test("POST still reaches the limiter after the gate", () => {
    expectRejected(
      sub(
        "  perform private.guardian_rate_limit_enforce(v_endpoint);",
        "  if v_method = 'POST' then return; end if;\n  perform private.guardian_rate_limit_enforce(v_endpoint);"
      ),
      { property: "A:", layer2: true }
    );
  });
});

describe("the policy constants are a real second copy", () => {
  test("the dispatcher role set is the approved A1 enumeration", () => {
    assert.deepEqual(DISPATCHER_EXECUTE_ROLES, ["anon", "authenticated", "service_role"]);
    assert.ok(
      !DISPATCHER_EXECUTE_ROLES.includes("public"),
      "PUBLIC was explicitly rejected by FOUNDER DECISION A1"
    );
    assert.ok(
      !DISPATCHER_EXECUTE_ROLES.includes("authenticator"),
      "PostgREST calls db_pre_request after the role switch, so authenticator is not the role " +
        "that needs EXECUTE; if a deployment proves otherwise that is a stop-and-report finding"
    );
  });

  test("RATE_LIMIT_POLICY matches the reviewed pilot values", () => {
    assert.deepEqual(RATE_LIMIT_POLICY.peek, { burst: 10, sustained: 40, global: 300 });
    assert.deepEqual(RATE_LIMIT_POLICY.redeem, { burst: 5, sustained: 15, global: 100 });
    assert.deepEqual(RATE_LIMIT_POLICY.masklen, { ipv4: 24, ipv6: 56 });
    assert.deepEqual(RATE_LIMIT_POLICY.headerPreference, [
      "cf-connecting-ip",
      "x-real-ip",
      "x-forwarded-for",
    ]);
  });

  test("redeem is never more permissive than peek", () => {
    // Redeem is terminal and writes permanent evidence; peek is read-only.
    // A policy edit that inverted this would be a real regression and is not
    // something any individual threshold assertion above would notice.
    assert.ok(RATE_LIMIT_POLICY.redeem.burst <= RATE_LIMIT_POLICY.peek.burst);
    assert.ok(RATE_LIMIT_POLICY.redeem.sustained <= RATE_LIMIT_POLICY.peek.sustained);
    assert.ok(RATE_LIMIT_POLICY.redeem.global <= RATE_LIMIT_POLICY.peek.global);
  });
});
