import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GUARDIAN_MIGRATION,
  EXPECTED_STATEMENTS,
  sqlTokens,
  splitStatements,
  validateGuardianSqlContract,
  validateGuardianFunctionHardening,
  validateGuardianMigrationContract,
} from "./guardian-sql-contract.mjs";

/**
 * Mutation tests for the Phase 2 guardian structural contract.
 *
 * Each case mutates the REAL migration one attack at a time and proves the
 * contract rejects it. Two earlier versions of the checker were defeated by
 * mutations that ADDED or SUBSTITUTED SQL rather than removing a required
 * string, so the emphasis here is deliberately on additions and substitutions:
 * appended DDL/DML, OR-widened predicates, swapped source columns, reordered
 * control flow, and extra grants.
 */

const realSql = readFileSync(GUARDIAN_MIGRATION, "utf8");

function run(sql) {
  return validateGuardianSqlContract({ [GUARDIAN_MIGRATION]: Buffer.from(sql, "utf8") });
}

/**
 * Literal find/replace, expressed as a mutate function.
 *
 * MUST go through a replacement FUNCTION, never a replacement string.
 * `String.prototype.replace` treats `$$` in a replacement STRING as an escape
 * for one literal `$` — and every function body in this migration is wrapped
 * in `$$ ... $$`. A replacement containing `$$` therefore silently becomes
 * `$`, corrupting the dollar-quoting instead of applying the intended
 * mutation. The test then "passes" because it broke the tokenizer, not
 * because the contract caught the attack it claims to test. This bug was
 * live in the first draft of this file and is exactly the kind of vacuous
 * pass the `assert.notEqual` precondition below exists to surface.
 */
function sub(find, replacement) {
  return (sql) => sql.replace(find, () => replacement);
}

/** Mutates, asserts the mutation landed, asserts the contract rejects it. */
function expectRejected(mutate, { expect } = {}) {
  const mutated = mutate(realSql);
  assert.notEqual(
    mutated,
    realSql,
    "mutation did not apply — the snippet it searches for is stale, so this test would pass vacuously"
  );
  // A mutation must never pass by breaking the tokenizer: that would prove
  // nothing about the property under test. Every case below must be rejected
  // for a STRUCTURAL reason, with the sole exception of the tokenizer's own
  // fail-closed test, which asserts the opposite deliberately.
  const problems = run(mutated);
  assert.ok(
    problems.length > 0,
    "MUTATION NOT CAUGHT — the contract reported zero problems for this mutation"
  );
  assert.ok(
    !problems.some((p) => p.includes("could not be tokenized")),
    `mutation broke the tokenizer instead of exercising the property under test — the ` +
      `replacement probably mangled a $$ delimiter (use sub()). Problems: ${JSON.stringify(problems)}`
  );
  if (expect) {
    assert.ok(
      problems.some((p) => p.includes(expect)),
      `caught, but not for the named reason "${expect}". Problems: ${JSON.stringify(problems, null, 2)}`
    );
  }
  return problems;
}

// ════════════════════════════════════════════════════════════════════ baseline

describe("guardian SQL contract — baseline", () => {
  test("the real migration passes the full contract with zero problems", () => {
    assert.deepEqual(validateGuardianSqlContract(), []);
  });

  test("the real migration passes the hardening and structural layers independently", () => {
    assert.deepEqual(validateGuardianFunctionHardening(), []);
    assert.deepEqual(validateGuardianMigrationContract(), []);
  });

  test("the migration is exactly the 9 approved executable statements", () => {
    const statements = splitStatements(sqlTokens(realSql));
    assert.equal(statements.length, 9);
    assert.equal(EXPECTED_STATEMENTS.length, 9);
  });

  test("the tokenizer fails closed on syntax it does not recognize", () => {
    // A contract that silently skips what it cannot parse is not a contract.
    assert.throws(() => sqlTokens("select ` backtick `;"), /unsupported SQL token/);
    assert.throws(() => sqlTokens("select 'unterminated"), /unterminated string literal/);
    assert.throws(() => sqlTokens("/* unterminated"), /unterminated block comment/);
    assert.throws(() => splitStatements(sqlTokens("as $$ begin end;")), /unterminated dollar-quoted/);

    const problems = run(`${realSql}\nselect \` nope \`;\n`);
    assert.ok(problems.some((p) => p.includes("could not be tokenized")));
  });
});

// ═══════════════════════════════════════════ the five second-review bypasses

describe("guardian SQL contract — the five mutations that defeated the previous checker", () => {
  test("[1] appended DROP INDEX is rejected", () => {
    expectRejected(sub(realSql, `${realSql}\ndrop index public.athlete_participation_token_hash_unique;\n`), {
      expect: "DROP",
    });
  });

  test("[2] token lookup widened with OR TRUE is rejected", () => {
    expectRejected(
      (sql) => sql.replace(/where ap\.token_hash = v_hash/g, () => "where ap.token_hash = v_hash or true"),
      { expect: "or true" }
    );
  });

  test("[3] request Terms/Privacy sourced from the ADULT columns is rejected", () => {
    expectRejected(
      sub(
        "    ap.request_terms_version, ap.request_privacy_version, ap.expires_at",
        "    ap.terms_version, ap.privacy_version, ap.expires_at"
      ),
      { expect: "PINNED versions" }
    );
  });

  test("[4] appended DELETE of the new evidence row is rejected", () => {
    expectRejected(
      sub(
        "  return v_new_status;\nend;\n$$;",
        "  delete from public.participation_events where owner_user_id = v_owner;\n" +
          "  return v_new_status;\nend;\n$$;"
      ),
      { expect: "DELETE" }
    );
  });

  test("[5] expiry check moved BEFORE the locking SELECT is rejected", () => {
    const expiryBlock =
      "  if v_expires_at is null or v_expires_at < clock_timestamp() then\n" +
      "    return 'unavailable';\n  end if;\n\n";
    const selectAnchor = "  select\n    ap.owner_user_id, ap.request_generation";
    expectRejected(
      (sql) =>
        sql.replace(expiryBlock, () => "").replace(selectAnchor, () => expiryBlock + selectAnchor),
      { expect: "BEFORE" }
    );
  });
});

// ═════════════════════════════════════════════════ the required mutation list

describe("guardian SQL contract — required mutation matrix", () => {
  test("make the unique index non-unique", () => {
    expectRejected(
      sub(
        "create unique index athlete_participation_token_hash_unique",
        "create index athlete_participation_token_hash_unique"
      ),
      { expect: "not UNIQUE" }
    );
  });

  test("remove the index's partial predicate", () => {
    expectRejected(
      sub(
        "  on public.athlete_participation (token_hash)\n  where token_hash is not null;",
        "  on public.athlete_participation (token_hash);"
      ),
      { expect: "where token_hash is not null" }
    );
  });

  test("hash a constant instead of p_token", () => {
    expectRejected(
      (sql) =>
        sql.replace(
          /v_hash := pg_catalog\.sha256\(pg_catalog\.convert_to\(p_token, 'UTF8'\)\);/g,
          () => "v_hash := pg_catalog.sha256(pg_catalog.convert_to('fixed-not-the-token', 'UTF8'));"
        ),
      { expect: "not provably bound" }
    );
  });

  test("hash an alternate variable instead of p_token", () => {
    expectRejected(
      sub(
        "v_hash := pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8'));\n\n  -- Lock the one matching row",
        "v_hash := pg_catalog.sha256(pg_catalog.convert_to(p_decision, 'UTF8'));\n\n  -- Lock the one matching row"
      ),
      { expect: "not provably bound" }
    );
  });

  test("source request Terms from the wrong column", () => {
    expectRejected(
      sub(
        "    ap.request_terms_version, ap.request_privacy_version, ap.expires_at",
        "    ap.terms_version, ap.request_privacy_version, ap.expires_at"
      ),
      { expect: "request_terms_version" }
    );
  });

  test("source request Privacy from the wrong column", () => {
    expectRejected(
      sub(
        "    ap.request_terms_version, ap.request_privacy_version, ap.expires_at",
        "    ap.request_terms_version, ap.privacy_version, ap.expires_at"
      ),
      { expect: "request_privacy_version" }
    );
  });

  test("evidence Terms version written as NULL", () => {
    expectRejected(
      sub(
        "    v_request_terms_version, v_request_privacy_version, null\n  );",
        "    null, v_request_privacy_version, null\n  );"
      ),
      { expect: "terms_version" }
    );
  });

  test("evidence Privacy version written as NULL", () => {
    expectRejected(
      sub(
        "    v_request_terms_version, v_request_privacy_version, null\n  );",
        "    v_request_terms_version, null, null\n  );"
      ),
      { expect: "privacy_version" }
    );
  });

  test("evidence owner written as NULL", () => {
    expectRejected(
      sub(
        "    v_owner, v_event_type, 'guardian_token', 'guardian_token_possession',",
        "    null, v_event_type, 'guardian_token', 'guardian_token_possession',"
      ),
      { expect: "owner_user_id" }
    );
  });

  test("evidence generation written as a constant", () => {
    expectRejected(
      sub(
        "    v_generation, v_guardian_copy_version,\n    v_request_terms_version",
        "    1, v_guardian_copy_version,\n    v_request_terms_version"
      ),
      { expect: "request_generation" }
    );
  });

  test("remove the row lock", () => {
    expectRejected(sub("  for update of ap;", "  ;"), { expect: "row lock" });
  });

  test("replace clock_timestamp() with now() at the post-lock authorization point", () => {
    expectRejected(
      sub(
        "if v_expires_at is null or v_expires_at < clock_timestamp() then",
        "if v_expires_at is null or v_expires_at < now() then"
      ),
      { expect: "clock_timestamp" }
    );
  });

  test("omit the token-hash clearing", () => {
    expectRejected(
      sub(
        "  set status = v_new_status,\n      token_hash = null,\n      decided_at = now(),",
        "  set status = v_new_status,\n      decided_at = now(),"
      ),
      { expect: "token-hash clearing" }
    );
  });

  test("add a direct table SELECT grant to anon", () => {
    expectRejected(
      sub(realSql, `${realSql}\ngrant select on table public.athlete_participation to anon;\n`),
      { expect: "table-level GRANT" }
    );
  });

  test("add an authenticated EXECUTE grant", () => {
    expectRejected(
      sub(
        realSql,
        `${realSql}\ngrant execute on function public.peek_guardian_request(text) to authenticated;\n`
      ),
      { expect: "expected exactly [anon]" }
    );
  });

  test("add a PUBLIC EXECUTE grant", () => {
    expectRejected(
      sub(
        realSql,
        `${realSql}\ngrant execute on function public.redeem_guardian_request(text, text) to public;\n`
      ),
      { expect: "expected exactly [anon]" }
    );
  });

  test("widen an existing grant's role list to include authenticated", () => {
    expectRejected(
      sub(
        "grant execute on function public.peek_guardian_request(text) to anon;",
        "grant execute on function public.peek_guardian_request(text) to anon, authenticated;"
      ),
      { expect: "expected exactly [anon]" }
    );
  });

  test("weaken a revoke back to PUBLIC only", () => {
    expectRejected(
      sub(
        "revoke all on function public.peek_guardian_request(text) from public, authenticated;",
        "revoke all on function public.peek_guardian_request(text) from public;"
      ),
      { expect: "expected exactly" }
    );
  });
});

// ════════════════════════════════════════ appended executable SQL, by class

describe("guardian SQL contract — every class of appended executable SQL fails", () => {
  // The critical property: it does not matter whether the appended statement
  // resembles anything this contract knows about. Anything outside the
  // approved 9-statement shape is rejected because it is not in the allowlist.
  const appended = {
    DROP: "drop index public.athlete_participation_token_hash_unique;",
    "DROP FUNCTION": "drop function public.peek_guardian_request(text);",
    ALTER: "alter table public.athlete_participation add column sneaky text;",
    "ALTER FUNCTION": "alter function public.redeem_guardian_request(text, text) security invoker;",
    DELETE: "delete from public.participation_events where true;",
    UPDATE: "update public.athlete_participation set status = 'approved';",
    INSERT:
      "insert into public.participation_events (owner_user_id, event_type, actor, actor_basis) " +
      "values (null, 'guardian_approved', 'guardian_token', 'guardian_token_possession');",
    GRANT: "grant usage on schema public to anon;",
    REVOKE: "revoke all on function public.peek_guardian_request(text) from anon;",
    CREATE: "create index athlete_participation_extra on public.athlete_participation (status);",
    "CREATE FUNCTION":
      "create or replace function public.sneaky() returns void language sql as $x$ select 1 $x$;",
    "CREATE POLICY":
      'create policy "sneaky" on public.athlete_participation for select to anon using (true);',
    TRUNCATE: "truncate table public.participation_events;",
    "COMMENT ON TABLE": "comment on table public.athlete_participation is 'x';",
    "SET ROLE": "set role postgres;",
  };

  for (const [label, statement] of Object.entries(appended)) {
    test(`appended ${label} is rejected`, () => {
      expectRejected(sub(realSql, `${realSql}\n${statement}\n`));
    });
  }

  test("re-quoting an approved function body with a TAGGED dollar quote is rejected", () => {
    // Tagged quotes are valid PostgreSQL and tokenize fine (the whole region
    // becomes one opaque token), so this is rejected by the statement
    // allowlist rather than by a parse error — the body is no longer
    // inspectable, which must never be treated as "nothing to object to".
    expectRejected((sql) =>
      sql
        .replace("as $$\ndeclare\n  v_hash bytea;\nbegin", () => "as $body$\ndeclare\n  v_hash bytea;\nbegin")
        .replace("  limit 1;\nend;\n$$;", () => "  limit 1;\nend;\n$body$;")
    );
  });

  test("an appended statement is rejected even when byte-identical to an approved one", () => {
    // Duplication matters: two identical grants are not the approved shape.
    expectRejected(
      sub(realSql, `${realSql}\ngrant execute on function public.peek_guardian_request(text) to anon;\n`),
      { expect: "expected exactly" }
    );
  });
});

// ═════════════════════════ dollar-quote / comment boundary precedence

describe("guardian SQL contract — dollar-quote boundary precedence", () => {
  /**
   * These exist because of a real bypass. A previous lexer applied comment
   * rules while INSIDE a dollar-quoted body, so a line that merely looked
   * like a comment could swallow the body's real closing `$$` — and the
   * resulting token stream was byte-identical to baseline, so the contract
   * reported zero problems while a `grant … to authenticated` executed.
   *
   * PostgreSQL does not read that line as a comment at all: inside `$$ … $$`
   * the content is a string, and only the matching delimiter can end it. So
   * the `$$` on the injected line really does terminate the function body,
   * and everything after it really is top-level SQL.
   *
   * The tests below therefore assert BOTH directions, which is the only way
   * to show the lexer follows PostgreSQL rather than just rejecting more:
   *   - text that genuinely executes must be REJECTED
   *   - text that is genuinely inert must still PASS
   * A checker that rejected both would be useless; one that accepted both is
   * the bug this replaced.
   */

  /** Injected immediately before redeem's real closing `$$`. */
  const beforeClosing = (payload) =>
    sub("  return v_new_status;\nend;\n$$;", `  return v_new_status;\nend;\n${payload}\n$$;`);

  test("[1] the exact reported payload (hidden GRANT to authenticated) is rejected", () => {
    const problems = expectRejected(
      beforeClosing(
        "-- $$; grant execute on function public.peek_guardian_request(text) to authenticated; do $$ begin end; --"
      ),
      { expect: "expected exactly 9" }
    );
    // Not merely "something is off": the smuggled grant must surface as a
    // real ACL violation, named.
    assert.ok(
      problems.some((p) => p.includes("GRANT role list is [authenticated]")),
      `the smuggled grant was not named as an ACL violation: ${JSON.stringify(problems, null, 2)}`
    );
  });

  test("[2] the same style hiding a DROP INDEX is rejected", () => {
    const problems = expectRejected(
      beforeClosing(
        "-- $$; drop index public.athlete_participation_token_hash_unique; do $$ begin end; --"
      ),
      { expect: "expected exactly 9" }
    );
    assert.ok(problems.some((p) => p.includes("DROP statement")));
  });

  test("[3] the same style hiding a DELETE of guardian decision evidence is rejected", () => {
    const problems = expectRejected(
      beforeClosing("-- $$; delete from public.participation_events where true; do $$ begin end; --"),
      { expect: "expected exactly 9" }
    );
    assert.ok(problems.some((p) => p.includes("DELETE statement")));
  });

  test("[4] a TAGGED-delimiter variant is rejected when the body is tagged to match", () => {
    // Re-quote redeem's body with `$x$` AND smuggle via `$x$`. Inside a `$x$`
    // body only `$x$` can close it, so this really does terminate the body
    // early and execute the grant — unlike a `$x$` inside a `$$` body, which
    // is inert (asserted separately below).
    expectRejected(
      (sql) =>
        sql
          .replace(
            "set search_path = ''\nas $$\ndeclare\n  v_hash bytea;\n  v_owner uuid;",
            () => "set search_path = ''\nas $x$\ndeclare\n  v_hash bytea;\n  v_owner uuid;"
          )
          .replace(
            "  return v_new_status;\nend;\n$$;",
            () =>
              "  return v_new_status;\nend;\n-- $x$; grant execute on function " +
              "public.peek_guardian_request(text) to authenticated; do $x$ begin end; --\n$x$;"
          ),
      { expect: "expected exactly 9" }
    );
  });

  test("[5] a top-level line comment containing fake dollar delimiters stays inert", () => {
    // Outside any body, PostgreSQL's comment rule wins — so this must NOT be
    // treated as opening a body (which would swallow the rest of the file and
    // break every downstream check) and must NOT be rejected.
    const mutated = realSql.replace(
      "-- peek_guardian_request — read-only, consumes nothing.",
      () =>
        "-- peek_guardian_request — read-only, consumes nothing.\n" +
        "-- $$ $x$ ; drop index public.athlete_participation_token_hash_unique; $$ $x$"
    );
    assert.notEqual(mutated, realSql, "precondition: the comment must be inserted");
    assert.deepEqual(
      run(mutated),
      [],
      "a top-level comment containing dollar-like text is inert in PostgreSQL and must pass"
    );
  });

  test("[6] comment markers inside a dollar body remain body text for boundary purposes", () => {
    // A `--` inside the body is a real plpgsql comment (inert), and critically
    // it must NOT hide the body's closing delimiter. Inserting one with NO
    // dollar text must pass; the paired case where it DOES carry a `$$` is
    // test [1], which must fail. Same insertion point, opposite outcomes —
    // that contrast is the proof the boundary is raw-stream derived.
    const inert = realSql.replace(
      "  return v_new_status;\nend;\n$$;",
      () => "  return v_new_status;\n  -- a plain comment; with a semicolon and no dollar text\nend;\n$$;"
    );
    assert.notEqual(inert, realSql, "precondition: the comment must be inserted");
    assert.deepEqual(run(inert), [], "a plain comment inside the body is inert and must pass");
  });

  test("[6b] a TAGGED fake delimiter inside a $$-quoted body is inert", () => {
    // Only the matching tag closes a body, so `$x$` inside `$$ … $$` is just
    // body text — and the line it sits on is a genuine plpgsql comment.
    const inert = realSql.replace(
      "  return v_new_status;\nend;\n$$;",
      () => "  return v_new_status;\n  -- $x$ drop index public.athlete_participation_token_hash_unique; $x$\nend;\n$$;"
    );
    assert.notEqual(inert, realSql, "precondition: the comment must be inserted");
    assert.deepEqual(run(inert), [], "a non-matching tagged delimiter inside a $$ body is inert");
  });

  test("[7] nested block comments containing dollar-like text stay inert, and unterminated ones fail closed", () => {
    const inert = realSql.replace(
      "-- peek_guardian_request — read-only, consumes nothing.",
      () => "/* outer /* inner $$ $x$ ; drop index foo; */ still a comment */"
    );
    assert.notEqual(inert, realSql, "precondition: the block comment must be inserted");
    assert.deepEqual(run(inert), [], "a nested block comment with dollar-like text is inert");

    // Fail closed rather than silently truncating.
    const problems = run(`${realSql}\n/* unterminated $$ \n`);
    assert.ok(problems.some((p) => p.includes("unterminated block comment")));
  });

  test("[8] a line comment with dollar-like text outside any body does not open a body", () => {
    // Proven structurally rather than by outcome alone: the token stream must
    // be unchanged from baseline, which is only true if no body was opened.
    const mutated = `-- $$ not a body $$ $x$ nor this $x$\n${realSql}`;
    assert.notEqual(mutated, realSql, "precondition");
    assert.deepEqual(sqlTokens(mutated), sqlTokens(realSql));
    assert.deepEqual(run(mutated), []);
  });

  test("an unterminated dollar quote fails closed instead of silently consuming the file", () => {
    const problems = run(`${realSql}\ndo $nope$ begin end;\n`);
    assert.ok(
      problems.some((p) => p.includes("unterminated dollar-quoted string")),
      `expected a fail-closed lexer error, got: ${JSON.stringify(problems)}`
    );
  });

  test("semicolons inside a dollar body are never treated as statement separators", () => {
    // The approved bodies are full of semicolons; if any were read as a
    // top-level separator the statement count would blow past 9.
    const statements = splitStatements(sqlTokens(realSql));
    assert.equal(statements.length, 9);
    const redeem = statements.find((s) => s.includes("redeem_guardian_request"));
    assert.ok(redeem.filter((t) => t === ";").length > 10, "redeem's body semicolons stayed inside its statement");
  });
});

// ═════════════════════════════ line-comment termination (CR / LF / CRLF)

describe("guardian SQL contract — line-comment termination", () => {
  /**
   * PostgreSQL ends a `--` comment at the first CR **or** LF — its scanner's
   * `non_newline` class excludes both. A previous version of this lexer
   * searched only for `\n`, so `--\rgrant …` read as one long comment and
   * swallowed a live GRANT: the token stream came out byte-identical to
   * baseline, statement count stayed 9, and the contract reported nothing.
   *
   * As with the dollar-boundary cases above, these assert BOTH directions —
   * SQL that really executes must be rejected, text that is really inert must
   * still pass — because only the pair shows the lexer follows PostgreSQL
   * instead of merely rejecting more.
   */

  const CR_GRANT = "grant execute on function public.peek_guardian_request(text) to authenticated;";

  test("[1] the exact CR-terminated comment hiding a GRANT to authenticated is rejected", () => {
    const problems = expectRejected(sub(realSql, `${realSql}\n--\r${CR_GRANT}\n`), {
      expect: "expected exactly 9",
    });
    // The GRANT must become VISIBLE, not merely make something look odd.
    assert.ok(
      problems.some((p) => p.includes("GRANT role list is [authenticated]")),
      `the CR-hidden grant was not named as an ACL violation: ${JSON.stringify(problems, null, 2)}`
    );
    // And it must be visible as a real statement, not absorbed into another.
    const statements = splitStatements(sqlTokens(`${realSql}\n--\r${CR_GRANT}\n`));
    assert.equal(statements.length, 10, "the hidden GRANT must appear as its own statement");
  });

  test("[2] a CR-terminated comment hiding a DROP INDEX is rejected", () => {
    const problems = expectRejected(
      sub(realSql, `${realSql}\n--\rdrop index public.athlete_participation_token_hash_unique;\n`),
      { expect: "expected exactly 9" }
    );
    assert.ok(problems.some((p) => p.includes("DROP statement")));
  });

  test("[3] a CR-terminated comment hiding a DELETE of decision evidence is rejected", () => {
    const problems = expectRejected(
      sub(
        realSql,
        `${realSql}\n--\rdelete from public.participation_events where owner_user_id is not null;\n`
      ),
      { expect: "expected exactly 9" }
    );
    assert.ok(problems.some((p) => p.includes("DELETE statement")));
  });

  test("[4] CRLF terminates the comment and the following SQL is visible exactly once", () => {
    const mutated = `${realSql}\n-- a trailing note\r\n${CR_GRANT}\n`;
    assert.notEqual(mutated, realSql, "precondition");

    const statements = splitStatements(sqlTokens(mutated));
    assert.equal(statements.length, 10, "CRLF must yield exactly one extra statement, not two");

    const grantStatements = statements.filter(
      (s) => s[0] === "grant" && s.includes("authenticated")
    );
    assert.equal(grantStatements.length, 1, "the GRANT must be lexed exactly once");
    assert.ok(run(mutated).some((p) => p.includes("GRANT role list is [authenticated]")));
  });

  test("[5] a plain LF-terminated comment keeps its existing inert behaviour", () => {
    const mutated = `${realSql}\n-- an ordinary trailing comment, LF terminated\n`;
    assert.notEqual(mutated, realSql, "precondition");
    assert.deepEqual(run(mutated), [], "an LF comment adds no executable SQL");
    assert.deepEqual(sqlTokens(mutated), sqlTokens(realSql), "and contributes no tokens");
  });

  test("[6] a comment running to EOF with no newline stays inert", () => {
    const mutated = `${realSql}\n-- comment with no trailing newline`;
    assert.notEqual(mutated, realSql, "precondition");
    assert.deepEqual(run(mutated), []);
    assert.deepEqual(sqlTokens(mutated), sqlTokens(realSql));
  });

  test("[7] a CR inside a quoted string terminates nothing outside the string", () => {
    // The CR stays part of the literal; the statement structure is untouched.
    assert.deepEqual(sqlTokens("select 'a\rb';"), ["select", "'a\rb'", ";"]);
    assert.equal(splitStatements(sqlTokens("select 'a\rb';")).length, 1);
  });

  test("[8] a CR inside a dollar body neither closes it nor splits the statement", () => {
    assert.deepEqual(sqlTokens("do $$ a\rb $$;"), ["do", "$$", "a", "b", "$$", ";"]);
    assert.equal(splitStatements(sqlTokens("do $$ a\rb $$;")).length, 1);

    // A CR-terminated comment INSIDE a body is a real plpgsql comment, so the
    // SQL after it is body content — still inside the body, still one
    // statement, and the body's own delimiters are intact.
    const tokens = sqlTokens("do $$ begin -- x\rselect 1; end $$;");
    assert.deepEqual(tokens, ["do", "$$", "begin", "select", "1", ";", "end", "$$", ";"]);
    assert.equal(splitStatements(tokens).length, 1);
  });

  test("[9] a CR inside a block comment does not escape the comment", () => {
    assert.deepEqual(sqlTokens("/* a\rb */ select 1;"), ["select", "1", ";"]);
    assert.deepEqual(sqlTokens("/* a\r\nb */ select 1;"), ["select", "1", ";"]);
  });

  test("[10] mixed LF / CR / CRLF input tokenizes deterministically", () => {
    const mixed = "-- a\rselect 1;\n-- b\r\nselect 2;\n-- c\nselect 3;";
    assert.deepEqual(sqlTokens(mixed), [
      "select", "1", ";",
      "select", "2", ";",
      "select", "3", ";",
    ]);
    assert.equal(splitStatements(sqlTokens(mixed)).length, 3);
    // Deterministic across repeated lexing of the same input.
    assert.deepEqual(sqlTokens(mixed), sqlTokens(mixed));
  });

  test("the real migration contains no CR bytes, so none of this changes its lexing", () => {
    assert.equal(realSql.includes("\r"), false);
  });
});

// ═══════════════════════════════════════════════════ additional hardening

describe("guardian SQL contract — hardening and scope properties", () => {
  test("removing the search_path pin is rejected", () => {
    expectRejected(
      sub(
        "language plpgsql\nsecurity definer\nset search_path = ''\nas $$\ndeclare\n  v_hash bytea;\n  v_owner uuid;",
        "language plpgsql\nsecurity definer\nas $$\ndeclare\n  v_hash bytea;\n  v_owner uuid;"
      ),
      { expect: "search_path" }
    );
  });

  test("dropping SECURITY DEFINER is rejected", () => {
    expectRejected(
      sub(
        "language plpgsql\nsecurity definer\nstable\nset search_path = ''",
        "language plpgsql\nstable\nset search_path = ''"
      ),
      { expect: "security definer" }
    );
  });

  test("making peek VOLATILE (dropping STABLE) is rejected", () => {
    expectRejected(
      sub(
        "language plpgsql\nsecurity definer\nstable\nset search_path = ''",
        "language plpgsql\nsecurity definer\nset search_path = ''"
      ),
      { expect: "STABLE" }
    );
  });

  test("a write inside peek is rejected", () => {
    expectRejected(
      sub(
        "  limit 1;\nend;\n$$;",
        "  limit 1;\n  update public.athlete_participation set status = status where false;\nend;\n$$;"
      ),
      { expect: "read-only" }
    );
  });

  test("widening the canonical token regex to the full alphabet is rejected", () => {
    expectRejected(
      (sql) =>
        sql.replace(/\^\[A-Za-z0-9_-\]\{42\}\[048AEIMQUYcgkosw\]\$/g, () => "^[A-Za-z0-9_-]{43}$"),
      { expect: "approved token" }
    );
  });

  test("dropping the auth.users join (deleted-owner check) is rejected", () => {
    expectRejected((sql) =>
      sql.replace(/  inner join auth\.users u on u\.id = ap\.owner_user_id\n/g, () => "")
    );
  });

  test("relaxing the UPDATE's WHERE clause is rejected", () => {
    expectRejected(
      sub(
        "  where owner_user_id = v_owner\n    and token_hash = v_hash\n    and status = 'pending'\n  returning owner_user_id into v_updated;",
        "  where owner_user_id = v_owner\n  returning owner_user_id into v_updated;"
      )
    );
  });

  test("relaxing the decision allowlist is rejected", () => {
    expectRejected(
      sub(
        "if p_decision is null or p_decision not in ('approve', 'decline') then",
        "if p_decision is null then"
      ),
      { expect: "decision allowlist" }
    );
  });

  test("renaming peek into an out-of-scope Phase 3 issuance RPC is rejected", () => {
    expectRejected(
      sub(
        "create or replace function public.peek_guardian_request(p_token text)",
        "create or replace function public.issue_guardian_request(p_token text)"
      ),
      { expect: "issue_guardian_request" }
    );
  });

  test("touching athlete_profiles (publication) from redeem is rejected", () => {
    expectRejected(
      sub(
        "  return v_new_status;\nend;\n$$;",
        "  update public.athlete_profiles set is_published = true where owner_user_id = v_owner;\n" +
          "  return v_new_status;\nend;\n$$;"
      ),
      { expect: "athlete_profiles" }
    );
  });

  test("a comment-only edit does NOT fail the structural contract (the byte pin covers prose)", () => {
    // Deliberate complement to scripts/sql-contract.mjs's byte pin: this layer
    // is about executable shape, so prose changes must pass here and fail there.
    // Asserting it keeps the two layers' responsibilities distinct and honest.
    const mutated = realSql.replace(
      "-- peek_guardian_request — read-only, consumes nothing.",
      () => "-- peek_guardian_request — read-only, consumes nothing (reworded)."
    );
    assert.notEqual(mutated, realSql, "precondition: the comment edit must apply");
    assert.deepEqual(run(mutated), []);
  });

  test("a whitespace-only edit does NOT fail the structural contract", () => {
    const mutated = realSql.replace(
      "  v_hash := pg_catalog.sha256(",
      () => "   v_hash := pg_catalog.sha256("
    );
    assert.notEqual(mutated, realSql, "precondition: the whitespace edit must apply");
    assert.deepEqual(run(mutated), []);
  });
});
