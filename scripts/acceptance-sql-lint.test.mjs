import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ACCEPTANCE_DIR,
  acceptanceFiles,
  qualifiedMultiArgUnnest,
  validateAcceptanceSql,
  withoutComments,
} from "./acceptance-sql-lint.mjs";

/**
 * Tests for the acceptance-SQL lint.
 *
 * Both halves matter. The baseline proves the committed files are clean; the
 * synthetic cases prove the lint would actually have caught the mistakes an
 * independent review found, rather than passing because it looks for the wrong
 * thing. A lint with no failing test is indistinguishable from `return []`.
 */

describe("acceptance SQL lint — baseline", () => {
  test("every committed acceptance file passes", () => {
    assert.deepEqual(validateAcceptanceSql(), []);
  });

  test("the acceptance directory is non-trivial and every runner step exists", () => {
    const files = acceptanceFiles();
    assert.ok(files.length >= 13, `expected the full acceptance set, found ${files.length}`);

    // The runner names its files as string literals; drift between the two
    // would show up only at run time, on a database, which is the worst place
    // to find it.
    const runner = readFileSync("scripts/phase2-acceptance.mjs", "utf8");
    const referenced = [...runner.matchAll(/"(\d\d-[a-z0-9-]+\.sql)"/g)].map((m) => m[1]);
    assert.ok(referenced.length >= 13, `the runner should name every step; found ${referenced.length}`);
    for (const name of referenced) {
      assert.ok(files.includes(name), `the runner references a missing acceptance file: ${name}`);
    }
    for (const name of files) {
      assert.ok(
        referenced.includes(name),
        `${name} exists but no runner step references it — it would never run`
      );
    }
  });

  test("the two-session parts come in pairs", () => {
    const files = acceptanceFiles();
    for (const [a, b] of [
      ["10-concurrency-a.sql", "11-concurrency-b.sql"],
      ["12-limiter-atomic-a.sql", "13-limiter-atomic-b.sql"],
      ["20-lockwait-a.sql", "21-lockwait-b.sql"],
    ]) {
      assert.ok(files.includes(a) && files.includes(b), `${a} / ${b} must both exist`);
    }
  });
});

describe("the mistakes review found are now caught", () => {
  const stub = (sql) => validateAcceptanceSql({ files: ["stub.sql"], read: () => sql });

  test("schema-qualified two-argument unnest", () => {
    const problems = stub(
      "select * from pg_catalog.unnest(p.proargnames, p.proargmodes) as a(name, mode);"
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0], /multi-argument unnest/);
  });

  test("the same call spanning lines", () => {
    const problems = stub(
      "select * from pg_catalog.unnest(\n  p.proargnames,\n  p.proargmodes\n) with ordinality;"
    );
    assert.equal(problems.length, 1);
  });

  test("a single-argument qualified unnest is fine", () => {
    assert.deepEqual(stub("select * from pg_catalog.unnest(p.proargmodes) as a(mode);"), []);
  });

  test("a nested comma inside a single-argument unnest is not a false positive", () => {
    assert.deepEqual(
      stub("select * from pg_catalog.unnest(pg_catalog.string_to_array(x, '/')) as s;"),
      []
    );
  });

  test("the valid ROWS FROM replacement is accepted", () => {
    assert.deepEqual(
      stub(
        "select * from rows from (pg_catalog.unnest(a), pg_catalog.unnest(b)) with ordinality as t(x, y, n);"
      ),
      []
    );
  });

  test("the bare `search_path=` expectation, which would fail against correct SQL", () => {
    const problems = stub("select x where cfg = 'search_path=';");
    assert.equal(problems.length, 1);
    assert.match(problems[0], /stores an empty search_path quoted/);
  });

  test("accepting both forms weakens the exact representation check", () => {
    assert.equal(stub("select x where cfg in ('search_path=\"\"', 'search_path=');").length, 1);
  });

  test("the exact quoted empty representation is accepted", () => {
    assert.deepEqual(stub("select x where cfg = 'search_path=\"\"';"), []);
  });

  test("a prefix match used as the search_path assertion", () => {
    const problems = stub("select 1 where p.proconfig::text like 'search_path=%';");
    assert.ok(problems.some((p) => /prefix match as the search_path ASSERTION/.test(p)), problems);
  });

  test("reset and restore of the hook in one file", () => {
    const problems = stub(
      "alter role authenticator reset pgrst.db_pre_request;\n" +
        "alter role authenticator set pgrst.db_pre_request = 'public.data_api_pre_request';"
    );
    assert.ok(problems.some((p) => /separately committed/.test(p)), problems);
  });

  test("an exception handler wrapped around a hook mutation", () => {
    const problems = stub(
      "do $$ begin\n  execute 'alter role authenticator reset pgrst.db_pre_request';\n" +
        "exception when others then null;\nend $$;"
    );
    assert.ok(problems.some((p) => /exception handler/.test(p)), problems);
  });

  test("pg_catalog.extract, which is unqualifiable grammar", () => {
    const problems = stub("select pg_catalog.extract(epoch from now());");
    assert.ok(problems.some((p) => /EXTRACT is grammar/.test(p)), problems);
  });

  test("pg_catalog.current_user, which is a keyword", () => {
    const problems = stub("select pg_catalog.current_user;");
    assert.ok(problems.some((p) => /current_user is an SQL keyword/.test(p)), problems);
  });

  test("comments cannot hide a finding, and cannot create one", () => {
    // A finding inside a comment is not a finding: the SQL does not run it.
    assert.deepEqual(stub("-- pg_catalog.unnest(a, b) was wrong; see ROWS FROM\nselect 1;"), []);
  });
});

describe("qualifiedMultiArgUnnest directly", () => {
  test("finds every occurrence, not just the first", () => {
    const sql =
      "select pg_catalog.unnest(a, b); select pg_catalog.unnest(c); select pg_catalog.unnest(d, e);";
    assert.equal(qualifiedMultiArgUnnest(sql).length, 2);
  });

  test("the real acceptance files contain none in LIVE SQL", () => {
    // Comment-stripped, deliberately: 01-acl.sql and 03-replay-… both DOCUMENT
    // the invalid form in a comment explaining why ROWS FROM is used instead.
    // Flagging that prose would be a false positive, and deleting the
    // explanation to satisfy a lint would be the wrong fix.
    for (const name of acceptanceFiles()) {
      const sql = withoutComments(readFileSync(path.join(ACCEPTANCE_DIR, name), "utf8"));
      assert.deepEqual(
        qualifiedMultiArgUnnest(sql),
        [],
        `${name} still contains a qualified multi-argument unnest`
      );
    }
  });
});

describe("fixture ownership regressions", () => {
  const check = (name, mutate) => validateAcceptanceSql({
    files: [name], read: () => mutate(readFileSync(path.join(ACCEPTANCE_DIR, name), "utf8")),
  });

  test("a dollar delimiter damaged by string replacement is rejected", () => {
    assert.ok(check("99-teardown.sql", sql => sql.replace("do $$", () => "do $"))
      .some(p => p.includes("dollar-quote")));
  });

  test("preflight cannot tolerate existing users", () => {
    assert.ok(check("00-setup.sql", sql => sql.replace(
      "if exists (select 1 from auth.users)", "if false"
    )).some(p => p.includes("preflight")));
  });

  test("schema mutation cannot precede the collision guard", () => {
    assert.ok(check("00-setup.sql", sql => "drop table phase2_acceptance.fixture;\n" + sql)
      .some(p => p.includes("preflight")));
  });

  test("collision-tolerant fixture creation is rejected", () => {
    assert.ok(check("00-setup.sql", sql => sql.replace("returning id, created_at",
      "on conflict (id) do nothing returning id, created_at"))
      .some(p => p.includes("never adopt")));
  });

  test("a direct auth insert in another acceptance file cannot evade registration", () => {
    assert.ok(check("03-replay-uniqueness-owner.sql", sql => sql + "\ninsert into auth.users (id) values (null);")
      .some(p => p.includes("bypasses")));
  });

  test("cleanup cannot omit the identity creation timestamp", () => {
    assert.ok(check("99-teardown.sql", sql => sql.replace("and created_at = v_fixture.user_created_at", ""))
      .some(p => p.includes("cleanup")));
  });
});
