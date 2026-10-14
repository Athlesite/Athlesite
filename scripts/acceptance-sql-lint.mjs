/**
 * Static checks over the Phase 2 acceptance SQL.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * The acceptance SQL has never been executed — `psql` is unavailable on the
 * authoring machine — so its first run will also be its first syntax check.
 * That is recorded honestly in the runbook rather than worked around, but it
 * does mean a whole class of mistake can sit in the tree unnoticed, and an
 * independent review found exactly that: two files called
 * `pg_catalog.unnest(a, b)`, which is not a function that exists.
 *
 * Multi-argument `unnest` is special GRAMMAR. It is valid only as a bare
 * `UNNEST(a, b)` in a FROM clause, and cannot be schema-qualified — so the
 * qualified two-argument form resolves to nothing and fails at parse time. The
 * fix is `ROWS FROM (pg_catalog.unnest(a), pg_catalog.unnest(b))`, which takes
 * ordinary single-argument calls that CAN be qualified.
 *
 * This file cannot replace running the SQL. What it can do is make the
 * specific mistakes already found impossible to reintroduce, and keep the
 * runner and the files from drifting apart. Each check below is here because
 * something real went wrong, not on general principle.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const ACCEPTANCE_DIR = "supabase/acceptance";

/** Every `.sql` file in the acceptance directory, sorted. */
export function acceptanceFiles(dir = ACCEPTANCE_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/** Strips `--` line comments so the checks below look only at live SQL. */
export function withoutComments(sql) {
  return sql
    .split(/\r?\n/)
    .map((line) => {
      const at = line.indexOf("--");
      // Crude but adequate: a `--` inside a string literal would be truncated
      // too. These checks only ever ask "is this construct absent", so losing
      // some text can produce a false PASS but never a false FAIL, and the
      // constructs being looked for never appear inside literals here.
      return at === -1 ? line : line.slice(0, at);
    })
    .join("\n");
}

/**
 * A schema-qualified call with two or more arguments to a function that only
 * exists in its multi-argument form as grammar.
 *
 * Matches `pg_catalog.unnest(` and then scans for a top-level comma before the
 * matching close paren, so nested calls such as
 * `pg_catalog.unnest(pg_catalog.string_to_array(x, ','))` are NOT flagged —
 * their comma is inside a nested paren.
 */
export function qualifiedMultiArgUnnest(sql) {
  const findings = [];
  const needle = "pg_catalog.unnest(";
  let from = 0;

  for (;;) {
    const start = sql.indexOf(needle, from);
    if (start === -1) break;
    let depth = 1;
    let i = start + needle.length;
    let topLevelComma = false;
    while (i < sql.length && depth > 0) {
      const c = sql[i];
      if (c === "(") depth += 1;
      else if (c === ")") depth -= 1;
      else if (c === "," && depth === 1) topLevelComma = true;
      i += 1;
    }
    if (topLevelComma) {
      findings.push(sql.slice(start, Math.min(i, start + 80)));
    }
    from = start + needle.length;
  }
  return findings;
}

/** The complete lint. Returns a list of problems. */
export function validateAcceptanceSql({ files, read } = {}) {
  const problems = [];
  const names = files ?? acceptanceFiles();
  const load = read ?? ((name) => readFileSync(path.join(ACCEPTANCE_DIR, name), "utf8"));

  for (const name of names) {
    const raw = load(name);
    const sql = withoutComments(raw);

    if (/\b(?:do|as)\s+\$(?!\$|[a-z_])/i.test(sql)) {
      problems.push(`${name}: malformed dollar-quote opener; use a complete matching dollar delimiter`);
    }

    // ── 1. The exact mistake review found.
    for (const finding of qualifiedMultiArgUnnest(sql)) {
      problems.push(
        `${name}: schema-qualified multi-argument unnest — "${finding.replace(/\s+/g, " ")}". ` +
          "Multi-argument UNNEST is grammar, not a function, and cannot be qualified. Use " +
          "ROWS FROM (pg_catalog.unnest(a), pg_catalog.unnest(b))."
      );
    }

    // ── 2. `extract(... from ...)` is grammar too, and equally unqualifiable.
    if (/pg_catalog\.extract\s*\(/.test(sql)) {
      problems.push(
        `${name}: pg_catalog.extract(...) — EXTRACT is grammar and cannot be schema-qualified. ` +
          "Use pg_catalog.date_part('epoch', …)."
      );
    }

    // ── 3. `current_user` / `session_user` are keywords, not functions.
    for (const keyword of ["current_user", "session_user", "current_schema"]) {
      if (sql.includes(`pg_catalog.${keyword}`)) {
        problems.push(
          `${name}: pg_catalog.${keyword} — ${keyword} is an SQL keyword, not a schema-qualifiable function`
        );
      }
    }

    // ── 4. The search_path expectation review found wrong.
    //
    // `SET search_path = ''` serializes into proconfig as `search_path=""`,
    // because search_path is GUC_LIST_QUOTE. Asserting the bare `search_path=`
    // form ALONE would fail against a correctly hardened function.
    if (sql.includes("'search_path='")) {
      problems.push(
        `${name}: accepts the incorrect proconfig entry 'search_path='. ` +
          'PostgreSQL stores an empty search_path quoted; require exactly search_path="".'
      );
    }

    // ── 5. A loosened search_path check is worse than a wrong one.
    if (/search_path=%'/.test(sql) && !/like 'search_path=%'\s*\n?\s*limit/.test(sql)) {
      // `like 'search_path=%'` is legitimate when it is EXTRACTING the entry to
      // compare exactly; it is not legitimate as the comparison itself.
      if (!/cfg like 'search_path=%'/.test(sql) && !/s like 'search_path=%'/.test(sql)) {
        problems.push(
          `${name}: uses a prefix match as the search_path ASSERTION. That accepts ` +
            "search_path=public and every other non-empty value — the one thing the assertion exists " +
            "to rule out. Extract the entry, then compare exactly."
        );
      }
    }

    // ── 6. The drill must not reset and restore inside one transaction.
    if (/reset\s+pgrst\.db_pre_request/i.test(sql) && /set\s+pgrst\.db_pre_request/i.test(sql)) {
      problems.push(
        `${name}: resets AND restores pgrst.db_pre_request in the same file. The rollback drill has ` +
          "to be separately committed operations driven by the runner, or PostgREST never observes " +
          "the disarmed state and the drill proves nothing."
      );
    }

    // Auth identities must be created by the single ownership-registering helper.
    if (/insert\s+into\s+auth\.users/i.test(sql) && name !== "00-setup.sql") {
      problems.push(`${name}: auth fixture insertion bypasses the run ownership ledger`);
    }
    if (name === "00-setup.sql") {
      const firstDdl = sql.indexOf("create schema phase2_acceptance");
      const preflight = sql.slice(0, firstDdl);
      if (firstDdl < 0 || !preflight.includes("PHASE2 PREFLIGHT STOP — fixture-ID collision") ||
          !preflight.includes("if exists (select 1 from auth.users)") ||
          !preflight.includes("nspname = 'phase2_acceptance'") ||
          /\b(create|drop|insert|update|delete|alter|truncate)\s+(schema|table|into|from)/i.test(preflight)) {
        problems.push(`${name}: read-only collision/isolation preflight must precede all mutation`);
      }
      const creator = sql.match(/function phase2_acceptance\.ensure_fixture_user[\s\S]*?as \$\$([\s\S]*?)\$\$/)?.[1] ?? "";
      if (!creator.includes("returning id, created_at") ||
          !creator.includes("insert into phase2_acceptance.fixture") ||
          !creator.includes("u.created_at = f.user_created_at") ||
          !creator.includes("f.run_id = pg_catalog.current_setting('phase2_acceptance.run_id')::uuid") ||
          /on\s+conflict/i.test(creator)) {
        problems.push(`${name}: fixture creator must register successful inserts atomically and never adopt an existing identity`);
      }
    }
    if (name === "99-teardown.sql" &&
        (!sql.includes("cleanup run ID does not own this acceptance schema") ||
         !sql.includes("where run_id = pg_catalog.current_setting('phase2_acceptance.run_id')::uuid") ||
         !sql.includes("and created_at = v_fixture.user_created_at"))) {
      problems.push(`${name}: cleanup must verify the current run and the created identity`);
    }

    // ── 7. No exception handler may wrap the hook mutation, for the same
    // reason: swallowing a failed restore lets a run report success with the
    // project disarmed.
    if (/pgrst\.db_pre_request/i.test(sql) && /exception\s+when/i.test(sql)) {
      problems.push(
        `${name}: combines a pgrst.db_pre_request mutation with an exception handler. A handler can ` +
          "let the disarmed state commit after a failed restore."
      );
    }
  }

  return problems;
}
