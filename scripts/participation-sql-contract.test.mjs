import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PARTICIPATION_MIGRATIONS,
  EXPECTED_FUNCTIONS,
  validateFunctionHardening,
  validateAllFunctionHardening,
  validateParticipationTableGrants,
  validateStateConsistencyChecks,
  validateEvidenceTableContract,
  validateRecordAcceptanceBundleHistoricalIdempotency,
  validateParticipationSqlContract,
} from "./participation-sql-contract.mjs";

/**
 * Static-contract tests for the Guardian-First Participation Phase 1a migrations.
 *
 * These are textual assertions over the reviewed SQL, not a live database
 * introspection — see participation-sql-contract.mjs's own docblock for why. Each
 * "mutation" test proves the check actually reads the SQL rather than trivially
 * passing: it feeds a deliberately broken in-memory copy of one migration and
 * asserts the check catches the specific break.
 */

const realBytes = Object.fromEntries(
  Object.values(PARTICIPATION_MIGRATIONS).map((path) => [path, readFileSync(path)])
);

/** Returns a bytesByPath map with one migration replaced by mutated text. */
function withMutation(path, mutate) {
  const original = realBytes[path].toString("utf8");
  const mutated = mutate(original);
  assert.notEqual(mutated, original, `mutation did not change ${path}`);
  return { ...realBytes, [path]: Buffer.from(mutated, "utf8") };
}

describe("participation SQL contract — baseline (the real migrations)", () => {
  test("the working-tree migrations satisfy the full contract", () => {
    assert.deepEqual(validateParticipationSqlContract(), []);
  });

  test("every expected function is present and hardened", () => {
    assert.deepEqual(validateAllFunctionHardening(), []);
  });

  test("exactly six functions are expected, matching the architecture", () => {
    assert.equal(Object.keys(EXPECTED_FUNCTIONS).length, 6);
  });
});

describe("participation SQL contract — table grants (mutation-tested)", () => {
  test("missing the table revoke is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.table, (sql) =>
      sql.replace(
        "revoke all on table public.athlete_participation from anon, authenticated;",
        "-- revoke removed"
      )
    );
    const problems = validateParticipationTableGrants(mutated);
    assert.ok(problems.some((p) => p.includes("no executable revoke-all")));
  });

  test("commenting out the revoke (leaving the words present, just not executable) is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.table, (sql) =>
      sql.replace(
        "revoke all on table public.athlete_participation from anon, authenticated;",
        "-- revoke all on table public.athlete_participation from anon, authenticated;"
      )
    );
    const problems = validateParticipationTableGrants(mutated);
    assert.ok(
      problems.some((p) => p.includes("no executable revoke-all")),
      "a commented-out revoke must not satisfy the check merely because the words are still in the file"
    );
  });

  test("a stray grant on athlete_participation is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.table, (sql) =>
      sql + "\ngrant select on table public.athlete_participation to authenticated;\n"
    );
    const problems = validateParticipationTableGrants(mutated);
    assert.ok(problems.some((p) => p.includes("a grant statement exists")));
  });

  test("removing RLS enablement is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.table, (sql) =>
      sql.replace("alter table public.athlete_participation enable row level security;", "")
    );
    const problems = validateParticipationTableGrants(mutated);
    assert.ok(problems.some((p) => p.includes("no executable ENABLE ROW LEVEL SECURITY")));
  });

  test("commenting out RLS enablement (BLOCKER 1, case 2) is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.table, (sql) =>
      sql.replace(
        "alter table public.athlete_participation enable row level security;",
        "-- alter table public.athlete_participation enable row level security;"
      )
    );
    const problems = validateParticipationTableGrants(mutated);
    assert.ok(
      problems.some((p) => p.includes("no executable ENABLE ROW LEVEL SECURITY")),
      "a commented-out ENABLE ROW LEVEL SECURITY must not satisfy the check — the old " +
        "bare regex matched the phrase even inside a comment"
    );
  });
});

describe("participation SQL contract — evidence table (mutation-tested)", () => {
  test("missing the events-table revoke is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.events, (sql) =>
      sql.replace(
        "revoke all on table public.participation_events from anon, authenticated;",
        "-- revoke removed"
      )
    );
    const problems = validateEvidenceTableContract(mutated);
    assert.ok(problems.some((p) => p.includes("no executable revoke-all")));
  });

  test("a stray UPDATE grant on participation_events is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.events, (sql) =>
      sql + "\ngrant update on table public.participation_events to authenticated;\n"
    );
    const problems = validateEvidenceTableContract(mutated);
    assert.ok(problems.some((p) => p.includes("a grant statement exists")));
  });

  test("losing NULLS NOT DISTINCT on the bundle index is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.events, (sql) =>
      sql.replace("nulls not distinct\n  where event_type", "where event_type")
    );
    const problems = validateEvidenceTableContract(mutated);
    assert.ok(problems.some((p) => p.includes("NULLS NOT DISTINCT")));
  });

  test("narrowing the bundle index to one event type is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.events, (sql) =>
      sql.replace(
        "where event_type in ('adult_attested', 'acceptance_recorded');",
        "where event_type in ('adult_attested');"
      )
    );
    const problems = validateEvidenceTableContract(mutated);
    assert.ok(problems.some((p) => p.includes("does not cover both")));
  });

  test("dropping a generation-bound index is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.events, (sql) =>
      sql.replace(/create unique index participation_events_delivery_unique[\s\S]*?;\n/, "")
    );
    const problems = validateEvidenceTableContract(mutated);
    assert.ok(problems.some((p) => p.includes("participation_events_delivery_unique")));
  });

  // The six specific weakenings the implementation prompt named, each proven to be
  // actually detected rather than assumed. The first two are the ones a loose
  // "does the index exist" presence check (the previous version of this test) would
  // NOT have caught — only inspecting the column list itself catches them.

  test("removing terms_version from the bundle index's column list is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.events, (sql) =>
      sql.replace(
        "on public.participation_events (owner_user_id, attestation_version, terms_version, privacy_version)",
        "on public.participation_events (owner_user_id, attestation_version, privacy_version)"
      )
    );
    const problems = validateEvidenceTableContract(mutated);
    assert.ok(
      problems.some((p) => p.includes('missing column "terms_version"')),
      `expected a terms_version-specific finding, got: ${JSON.stringify(problems)}`
    );
  });

  test("BLOCKER 1 case 5 — terms_version removed from the real column list but left in a nearby comment is still caught", () => {
    // The exact false-pass Codex found: the word "terms_version" is still
    // SOMEWHERE in the file (in a comment), but the real index statement no
    // longer includes it as a column. The old substring-presence check against
    // raw file text would have been satisfied by the comment; this one only ever
    // looks inside the extracted, comment-stripped column list.
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.events, (sql) =>
      sql.replace(
        "on public.participation_events (owner_user_id, attestation_version, terms_version, privacy_version)",
        "-- bundle columns: owner_user_id, attestation_version, terms_version, privacy_version\n" +
          "on public.participation_events (owner_user_id, attestation_version, privacy_version)"
      )
    );
    const problems = validateEvidenceTableContract(mutated);
    assert.ok(
      problems.some((p) => p.includes('missing column "terms_version"')),
      `a decoy comment must not hide the real column's absence, got: ${JSON.stringify(problems)}`
    );
  });

  test("terms_version named only inside a comment INSIDE the parens (between real columns) is still caught", () => {
    // Postgres permits a comment between column names inside the parens — this is
    // the specific trick that defeated a naive "comment-strip the whole file,
    // then regex the parens" approach if the comment-stripper itself were buggy:
    // the decoy sits INSIDE the very substring the column-list regex captures.
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.events, (sql) =>
      sql.replace(
        "on public.participation_events (owner_user_id, attestation_version, terms_version, privacy_version)",
        "on public.participation_events (\n    owner_user_id, attestation_version,\n" +
          "    -- terms_version intentionally omitted here\n    privacy_version\n  )"
      )
    );
    const problems = validateEvidenceTableContract(mutated);
    assert.ok(
      problems.some((p) => p.includes('missing column "terms_version"')),
      `a comment inside the parens must not satisfy the column check, got: ${JSON.stringify(problems)}`
    );
  });

  test("removing privacy_version from the bundle index's column list is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.events, (sql) =>
      sql.replace(
        "on public.participation_events (owner_user_id, attestation_version, terms_version, privacy_version)",
        "on public.participation_events (owner_user_id, attestation_version, terms_version)"
      )
    );
    const problems = validateEvidenceTableContract(mutated);
    assert.ok(
      problems.some((p) => p.includes('missing column "privacy_version"')),
      `expected a privacy_version-specific finding, got: ${JSON.stringify(problems)}`
    );
  });

  test("basis_code losing its CHECK allowlist is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.events, (sql) =>
      sql.replace(
        /basis_code text check \(basis_code is null or basis_code in \(\s*'founder_reset',\s*'founder_asserted_adult'\s*\)\),/,
        "basis_code text,"
      )
    );
    const problems = validateEvidenceTableContract(mutated);
    assert.ok(problems.some((p) => p.includes("basis_code has no closed-value CHECK allowlist")));
  });

  test("basis_code's allowlist missing one of the two required codes is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.events, (sql) =>
      sql.replace("'founder_asserted_adult'", "'something_else'")
    );
    const problems = validateEvidenceTableContract(mutated);
    assert.ok(problems.some((p) => p.includes("missing 'founder_asserted_adult'")));
  });
});

describe("participation SQL contract — state-consistency CHECKs (mutation-tested)", () => {
  test("the real migration satisfies every required clause in every state shape", () => {
    assert.deepEqual(validateStateConsistencyChecks(), []);
  });

  test("weakening the adult shape (dropping request_generation = 0) is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.table, (sql) =>
      sql.replace("and request_generation = 0\n", "")
    );
    const problems = validateStateConsistencyChecks(mutated);
    assert.ok(
      problems.some(
        (p) =>
          p.includes("athlete_participation_adult_approved_shape") &&
          p.includes("request_generation = 0")
      )
    );
  });

  test("weakening the minor/pending shape (dropping token_hash is not null) is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.table, (sql) => {
      // Target the occurrence inside the pending-shape constraint specifically —
      // "token_hash is not null" appears only there among the four constraints
      // (the decided/revoked shapes require token_hash is NULL instead), so a
      // plain replace is unambiguous.
      return sql.replace("and token_hash is not null\n", "");
    });
    const problems = validateStateConsistencyChecks(mutated);
    assert.ok(
      problems.some(
        (p) =>
          p.includes("athlete_participation_minor_pending_shape") &&
          p.includes("token_hash is not null")
      )
    );
  });

  test("weakening the minor-decided shape (dropping decided_at is not null) is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.table, (sql) => {
      // "decided_at is not null" appears in both the minor-decided shape and the
      // revoked shape; replacing only the FIRST occurrence targets the
      // minor-decided constraint, which is declared first in the file.
      return sql.replace("decided_at is not null", "true /* decided_at check removed */");
    });
    const problems = validateStateConsistencyChecks(mutated);
    assert.ok(
      problems.some(
        (p) =>
          p.includes("athlete_participation_minor_decided_shape") &&
          p.includes("decided_at is not null")
      )
    );
  });

  test("weakening the revoked shape (dropping bracket = 'minor') is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.table, (sql) =>
      sql.replace("bracket = 'minor'\n      and guardian_email is not null", "guardian_email is not null")
    );
    const problems = validateStateConsistencyChecks(mutated);
    assert.ok(
      problems.some(
        (p) => p.includes("athlete_participation_revoked_shape") && p.includes("bracket = 'minor'")
      )
    );
  });

  test("deleting an entire shape constraint is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.table, (sql) =>
      sql.replace(
        /constraint athlete_participation_revoked_shape check \([\s\S]*?\n  \)\n\);/,
        ")\n);"
      )
    );
    const problems = validateStateConsistencyChecks(mutated);
    assert.ok(problems.some((p) => p.includes("athlete_participation_revoked_shape not found")));
  });

  test("BLOCKER 1 case 1 — appending 'or true' to the adult shape is caught", () => {
    // The exact attack a substring-presence check cannot see: nothing required is
    // removed, something that defeats the whole expression is ADDED. Appended
    // just before the constraint's closing paren, so every required clause is
    // still textually present and would have passed the old validator cleanly.
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.table, (sql) =>
      sql.replace(
        "and privacy_version is not null\n    )\n  ),\n\n  constraint athlete_participation_minor_pending_shape",
        "and privacy_version is not null\n      or true\n    )\n  ),\n\n  constraint athlete_participation_minor_pending_shape"
      )
    );
    const problems = validateStateConsistencyChecks(mutated);
    assert.ok(
      problems.some(
        (p) => p.includes("athlete_participation_adult_approved_shape") && p.includes("bare boolean literal")
      ),
      `expected a bare-boolean-literal finding for the adult shape, got: ${JSON.stringify(problems)}`
    );
  });

  test("'or true' inside a comment does NOT trigger the bare-boolean-literal finding", () => {
    // The flip side of the same fix: comments must be stripped before this check
    // runs, or a legitimate comment mentioning "true" (e.g. explaining what an
    // attack would look like) would itself be a false positive.
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.table, (sql) =>
      sql.replace(
        "constraint athlete_participation_adult_approved_shape check (",
        "-- note: must never contain 'or true' anywhere\n  constraint athlete_participation_adult_approved_shape check ("
      )
    );
    const problems = validateStateConsistencyChecks(mutated);
    assert.ok(
      !problems.some(
        (p) => p.includes("athlete_participation_adult_approved_shape") && p.includes("bare boolean literal")
      ),
      "a comment mentioning 'true' must not itself trigger the finding"
    );
  });
});

describe("participation SQL contract — function hardening (mutation-tested)", () => {
  const TARGET = "initialize_adult_participation";
  const SPEC = EXPECTED_FUNCTIONS[TARGET];

  test("removing 'security definer' from one function is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.functions, (sql) => {
      // Remove only the first occurrence, which belongs to the target function —
      // the file defines it before any other function. The replacement must not
      // itself contain the phrase "security definer", or the check would still see
      // it and the mutation would not actually test anything.
      return sql.replace("security definer", "volatile");
    });
    const sql = mutated[PARTICIPATION_MIGRATIONS.functions].toString("utf8");
    const problems = validateFunctionHardening(sql, TARGET, SPEC);
    assert.ok(problems.some((p) => p.includes('missing "security definer"')));
  });

  test("removing the pinned search_path from one function is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.functions, (sql) =>
      sql.replace("set search_path = ''", "-- search_path not pinned")
    );
    const sql = mutated[PARTICIPATION_MIGRATIONS.functions].toString("utf8");
    const problems = validateFunctionHardening(sql, TARGET, SPEC);
    assert.ok(problems.some((p) => p.includes("missing \"set search_path = ''\"")));
  });

  test("removing the PUBLIC revoke on one function is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.functions, (sql) =>
      sql.replace(
        `revoke all on function public.${TARGET}(text, text, text) from public;`,
        "-- revoke removed"
      )
    );
    const sql = mutated[PARTICIPATION_MIGRATIONS.functions].toString("utf8");
    const problems = validateFunctionHardening(sql, TARGET, SPEC);
    assert.ok(problems.some((p) => p.includes("no executable") && p.includes("revoke all")));
  });

  test("commenting out the PUBLIC revoke, leaving the words present (BLOCKER 1, case 3), is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.functions, (sql) =>
      sql.replace(
        `revoke all on function public.${TARGET}(text, text, text) from public;`,
        `-- revoke all on function public.${TARGET}(text, text, text) from public;`
      )
    );
    const sql = mutated[PARTICIPATION_MIGRATIONS.functions].toString("utf8");
    const problems = validateFunctionHardening(sql, TARGET, SPEC);
    assert.ok(
      problems.some((p) => p.includes("no executable") && p.includes("revoke all")),
      "a commented-out revoke must not satisfy the check merely because the words are still in the file"
    );
  });

  test("a SECOND grant statement adding anon, left for the first grant to stay 'clean', is caught (BLOCKER 1, case 4)", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.functions, (sql) =>
      sql.replace(
        `grant execute on function public.${TARGET}(text, text, text) to authenticated;`,
        `grant execute on function public.${TARGET}(text, text, text) to authenticated;\n` +
          `grant execute on function public.${TARGET}(text, text, text) to anon;`
      )
    );
    const sql = mutated[PARTICIPATION_MIGRATIONS.functions].toString("utf8");
    const problems = validateFunctionHardening(sql, TARGET, SPEC);
    assert.ok(
      problems.some((p) => p.includes("broadened") && p.includes("anon")),
      "a second, additional grant statement must be inspected too, not only the first " +
        `one found — got: ${JSON.stringify(problems)}`
    );
  });

  test("granting EXECUTE to anon on an owner-derived function is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.functions, (sql) =>
      sql.replace(
        `grant execute on function public.${TARGET}(text, text, text) to authenticated;`,
        `grant execute on function public.${TARGET}(text, text, text) to authenticated, anon;`
      )
    );
    const sql = mutated[PARTICIPATION_MIGRATIONS.functions].toString("utf8");
    const problems = validateFunctionHardening(sql, TARGET, SPEC);
    assert.ok(problems.some((p) => p.includes("broadened") && p.includes("anon")));
  });

  test("broadening the audience with any unexpected role, not just anon, is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.functions, (sql) =>
      sql.replace(
        `grant execute on function public.${TARGET}(text, text, text) to authenticated;`,
        `grant execute on function public.${TARGET}(text, text, text) to authenticated, service_role;`
      )
    );
    const sql = mutated[PARTICIPATION_MIGRATIONS.functions].toString("utf8");
    const problems = validateFunctionHardening(sql, TARGET, SPEC);
    assert.ok(problems.some((p) => p.includes("broadened") && p.includes("service_role")));
  });

  // FINAL BLOCKER: grant/revoke scanning previously stopped at the next CREATE
  // FUNCTION statement, so a grant appended ANYWHERE past that boundary — after
  // a later function, or at the very end of the file — fell into some OTHER
  // function's statement block (or no function's block at all, if it was the
  // last one) and was never inspected for the function it actually names. Each
  // case below places the same extra "to anon" grant at a different distance
  // from TARGET's own CREATE statement; all five must be caught identically,
  // because a GRANT statement names its target in its own text and does not
  // need to be adjacent to that target's CREATE to be real, executable SQL.

  test("BLOCKER (final) case 1 — an extra anon grant immediately adjacent to the function's own grant is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.functions, (sql) =>
      sql.replace(
        `grant execute on function public.${TARGET}(text, text, text) to authenticated;`,
        `grant execute on function public.${TARGET}(text, text, text) to authenticated;\n` +
          `grant execute on function public.${TARGET}(text, text, text) to anon;`
      )
    );
    const sql = mutated[PARTICIPATION_MIGRATIONS.functions].toString("utf8");
    const problems = validateFunctionHardening(sql, TARGET, SPEC);
    assert.ok(
      problems.some((p) => p.includes("broadened") && p.includes("anon")),
      `expected a broadened-audience finding, got: ${JSON.stringify(problems)}`
    );
  });

  test("BLOCKER (final) case 2 — an extra anon grant placed after a LATER function's definition is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.functions, (sql) => {
      const marker = "create or replace function public.record_acceptance_bundle(";
      const idx = sql.indexOf(marker);
      assert.ok(idx !== -1, "expected to find record_acceptance_bundle's CREATE statement");
      const extraGrant =
        `\ngrant execute on function public.${TARGET}(text, text, text) to anon;\n\n`;
      // Inserted right before record_acceptance_bundle's own CREATE — i.e.
      // physically inside what used to be a LATER function's "block", which is
      // exactly the gap: TARGET's own per-function block never reached this far.
      return sql.slice(0, idx) + extraGrant + sql.slice(idx);
    });
    const sql = mutated[PARTICIPATION_MIGRATIONS.functions].toString("utf8");
    const problems = validateFunctionHardening(sql, TARGET, SPEC);
    assert.ok(
      problems.some((p) => p.includes("broadened") && p.includes("anon")),
      `expected a broadened-audience finding, got: ${JSON.stringify(problems)}`
    );
  });

  test("BLOCKER (final) case 3 — an extra anon grant appended at migration EOF is caught (Codex's exact reproduction)", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.functions, (sql) =>
      sql + `\ngrant execute on function public.${TARGET}(text, text, text) to anon;\n`
    );
    const sql = mutated[PARTICIPATION_MIGRATIONS.functions].toString("utf8");
    const problems = validateFunctionHardening(sql, TARGET, SPEC);
    assert.ok(
      problems.some((p) => p.includes("broadened") && p.includes("anon")),
      `expected a broadened-audience finding, got: ${JSON.stringify(problems)}`
    );
  });

  test("BLOCKER (final) case 4 — the SAME EOF grant, commented out, must NOT be flagged", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.functions, (sql) =>
      sql + `\n-- grant execute on function public.${TARGET}(text, text, text) to anon;\n`
    );
    const sql = mutated[PARTICIPATION_MIGRATIONS.functions].toString("utf8");
    const problems = validateFunctionHardening(sql, TARGET, SPEC);
    assert.ok(
      !problems.some((p) => p.includes("broadened")),
      `a commented-out EOF grant must not be flagged, got: ${JSON.stringify(problems)}`
    );
  });

  test("BLOCKER (final) case 5 — an anon grant at EOF for a DIFFERENT function signature does not contaminate TARGET", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.functions, (sql) =>
      sql + `\ngrant execute on function public.record_acceptance_bundle(text, text, text) to anon;\n`
    );
    const sql = mutated[PARTICIPATION_MIGRATIONS.functions].toString("utf8");

    // TARGET (initialize_adult_participation) must see no broadening at all —
    // the extra grant names a different function.
    const targetProblems = validateFunctionHardening(sql, TARGET, SPEC);
    assert.ok(
      !targetProblems.some((p) => p.includes("broadened")),
      `a grant for a different function must not contaminate TARGET, got: ${JSON.stringify(targetProblems)}`
    );

    // record_acceptance_bundle itself, however, SHOULD see the broadening — this
    // is the real false-pass Codex found, now visible on the function it
    // actually names.
    const otherProblems = validateFunctionHardening(
      sql,
      "record_acceptance_bundle",
      EXPECTED_FUNCTIONS.record_acceptance_bundle
    );
    assert.ok(
      otherProblems.some((p) => p.includes("broadened") && p.includes("anon")),
      `expected record_acceptance_bundle itself to see the broadening, got: ${JSON.stringify(otherProblems)}`
    );
  });

  test("renaming a function so it is not found at all is caught", () => {
    const sql = realBytes[PARTICIPATION_MIGRATIONS.functions].toString("utf8");
    const problems = validateFunctionHardening(sql, "does_not_exist_function", SPEC);
    assert.ok(problems.some((p) => p.includes("no \"create or replace function")));
  });
});

describe("participation SQL contract — record_acceptance_bundle historical idempotency (mutation-tested)", () => {
  test("the real migration checks evidence history, not just the current row", () => {
    assert.deepEqual(validateRecordAcceptanceBundleHistoricalIdempotency(), []);
  });

  test("reverting to a current-row-only comparison (the exact A->B->A bug) is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.functions, (sql) => {
      const start = sql.indexOf("  -- THE FIX for the finding Codex caught");
      const end = sql.indexOf("  -- A genuinely new bundle");
      const replacement =
        "  if v_attestation_version = p_attestation_version\n" +
        "     and v_terms_version = p_terms_version\n" +
        "     and v_privacy_version = p_privacy_version then\n" +
        "    return 'already_recorded';\n" +
        "  end if;\n\n";
      return sql.slice(0, start) + replacement + sql.slice(end);
    });
    const problems = validateRecordAcceptanceBundleHistoricalIdempotency(mutated);
    assert.ok(
      problems.some((p) => p.includes("does not query public.participation_events at all")),
      `expected the missing-history-query finding, got: ${JSON.stringify(problems)}`
    );
  });

  test("narrowing the historical lookup to only adult_attested is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.functions, (sql) =>
      sql.replace(
        "e.event_type in ('adult_attested', 'acceptance_recorded')",
        "e.event_type in ('adult_attested')"
      )
    );
    const problems = validateRecordAcceptanceBundleHistoricalIdempotency(mutated);
    assert.ok(problems.some((p) => p.includes("does not cover both")));
  });

  test("dropping terms_version from the historical comparison is caught", () => {
    // \r?\n rather than a literal \n: this migration's working-copy line endings
    // are CRLF (git's core.autocrlf on this platform — see the "LF will be
    // replaced by CRLF" warnings throughout this session), so a plain string
    // replace on "\n" alone would silently never match.
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.functions, (sql) =>
      sql.replace(/\s*and e\.terms_version = p_terms_version\r?\n/, "\n")
    );
    const problems = validateRecordAcceptanceBundleHistoricalIdempotency(mutated);
    assert.ok(problems.some((p) => p.includes("does not compare e.terms_version")));
  });

  test("BLOCKER 1 case 6 — removing the owner_user_id predicate from the historical lookup is caught", () => {
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.functions, (sql) =>
      sql.replace(/\s*where e\.owner_user_id = v_uid\r?\n/, "\n  where true\n")
    );
    const problems = validateRecordAcceptanceBundleHistoricalIdempotency(mutated);
    assert.ok(
      problems.some((p) => p.includes("e.owner_user_id = v_uid")),
      `expected an owner-scoping finding, got: ${JSON.stringify(problems)}`
    );
  });

  test("the real migration's historical lookup checks the real statement, not a decoy comment", () => {
    // Belt-and-braces: a comment mentioning "e.owner_user_id = v_uid" placed near
    // the (actually broken) lookup must not satisfy the check — comment-stripping
    // happens before this function ever looks at the text.
    const mutated = withMutation(PARTICIPATION_MIGRATIONS.functions, (sql) =>
      sql.replace(
        "where e.owner_user_id = v_uid",
        "-- scoped correctly: e.owner_user_id = v_uid\n    where true"
      )
    );
    const problems = validateRecordAcceptanceBundleHistoricalIdempotency(mutated);
    assert.ok(
      problems.some((p) => p.includes("e.owner_user_id = v_uid")),
      `a decoy comment must not satisfy the owner-scoping check, got: ${JSON.stringify(problems)}`
    );
  });
});

describe("participation SQL contract — no bracket='minor' writer in Phase 1a", () => {
  test("the only INSERT ... into athlete_participation ... values(...) writes bracket 'adult'", () => {
    const sql = readFileSync(PARTICIPATION_MIGRATIONS.functions, "utf8");

    // Scoped to INSERT statements into athlete_participation specifically — reading
    // and comparing bracket (participation_status() does exactly that, legitimately,
    // for a minor/* row that Phase 3 will eventually create) is not the same as
    // writing one, and must not trip this check.
    const insertBlocks = [
      ...sql.matchAll(/insert into public\.athlete_participation\s*\([\s\S]*?\)\s*values\s*\([\s\S]*?\);/g),
    ].map((m) => m[0]);

    assert.ok(insertBlocks.length > 0, "expected at least one INSERT into athlete_participation");

    for (const block of insertBlocks) {
      assert.ok(
        !/'minor'/.test(block),
        `an INSERT into athlete_participation writes a 'minor' bracket literal in Phase 1a: ${block}`
      );
    }
  });
});
