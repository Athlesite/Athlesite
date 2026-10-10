/**
 * Static contract checks over the Guardian-First Participation Phase 1a migrations.
 *
 * There is no local Postgres in this environment to introspect `pg_proc` against
 * (`proconfig`, `prosecdef`, `proacl`), so this reads the migration SQL as text. But
 * "as text" does not mean "as a bag of substrings" — every structural check below
 * first strips comments and splits the file into real top-level SQL statements (see
 * `stripSqlComments` and `splitTopLevelStatements`), then inspects the STATEMENTS
 * that remain. This is the fix for a class of false-pass Codex found in the
 * substring-only version of this file:
 *
 *   - a comment that happens to mention a required word (e.g. "-- terms_version
 *     intentionally omitted") used to satisfy a `sql.includes(...)` check even
 *     though the real column was gone
 *   - `ENABLE ROW LEVEL SECURITY` or `REVOKE ... FROM PUBLIC` commented OUT still
 *     matched a bare regex, because the regex never excluded comments
 *   - a SECOND, additional `GRANT EXECUTE ... TO anon` statement went unseen
 *     because the old code only ever inspected the FIRST grant line it found
 *   - `OR TRUE` appended to a CHECK constraint still passed, because the checker
 *     only confirmed required substrings were PRESENT — it never asked whether
 *     something that defeats the whole expression had been ADDED
 *
 * What this still is NOT: a general-purpose SQL parser. It does not understand
 * expression precedence, cannot evaluate arbitrary boolean algebra, and does not
 * resolve schema/type information. It is a small, deterministic statement splitter
 * (comment-aware, string-literal-aware, dollar-quote-aware) plus a set of checks
 * written against the ACTUAL STATEMENTS it recovers — sufficient to catch every
 * attack named above without the cost of a real parser, and no further than that.
 * Runtime behaviour is proven only by the live acceptance matrix (Phase 1b and
 * later); this proves the REVIEWED FILE encodes the intended structure.
 *
 * Deliberately NOT the 5D.7 byte-hash contract (scripts/sql-contract.mjs). That
 * mechanism pins specific migrations whose *exact bytes* define the public
 * projection boundary — a narrower, stricter tool for a narrower problem.
 */
import { readFileSync } from "node:fs";

export const PARTICIPATION_MIGRATIONS = {
  table: "supabase/migrations/20261008000001_create_athlete_participation.sql",
  events: "supabase/migrations/20261008000002_create_participation_events.sql",
  functions: "supabase/migrations/20261008000003_create_participation_functions.sql",
};

/** Every function this migration set defines, and who may EXECUTE it. */
export const EXPECTED_FUNCTIONS = {
  initialize_adult_participation: {
    args: "text, text, text",
    executeTo: ["authenticated"],
  },
  record_acceptance_bundle: {
    args: "text, text, text",
    executeTo: ["authenticated"],
  },
  participation_status: {
    args: "",
    executeTo: ["authenticated"],
  },
  participation_allows_retention: {
    args: "",
    executeTo: ["authenticated"],
  },
  participation_allows_publication: {
    args: "",
    executeTo: ["authenticated"],
  },
  unpublish_own_profile: {
    args: "",
    executeTo: ["authenticated"],
  },
};

function readText(path) {
  return readFileSync(path, "utf8");
}

// ════════════════════════════════════════════════════════════════════════════
// COMMENT STRIPPING AND STATEMENT SPLITTING
//
// One shared scanner state machine underlies both: it tracks whether the cursor
// is inside a single-quoted string literal (handling the `''` escaped-quote
// convention) or inside a `$$ ... $$` dollar-quoted block (used for every
// function body in this migration set). Comments are only ever comments OUTSIDE
// a string literal; a dollar-quoted body is not opaque to this scanner — its
// content is genuine SQL/plpgsql, and comments inside it are stripped exactly
// like comments anywhere else, which is what lets `extractFunctionBlock` inspect
// a function body's real statements rather than its unstripped source text.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Removes every `--...` line comment and `/* ... *\/` block comment, leaving
 * everything else — including the contents of string literals and dollar-quoted
 * function bodies — intact and at the same character offsets it would occupy if
 * the comment text were blanked rather than deleted (comments are replaced with
 * spaces, not removed, so no downstream offset-sensitive logic shifts).
 */
export function stripSqlComments(sql) {
  let out = "";
  let i = 0;
  let inSingleQuote = false;
  let inDollarQuote = false;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inSingleQuote) {
      out += ch;
      if (ch === "'") {
        // `''` is an escaped quote, not the end of the string — consume both
        // characters so the following iteration does not re-toggle state.
        if (next === "'") {
          out += next;
          i += 2;
          continue;
        }
        inSingleQuote = false;
      }
      i += 1;
      continue;
    }

    if (inDollarQuote) {
      if (ch === "-" && next === "-") {
        while (i < sql.length && sql[i] !== "\n") {
          out += " ";
          i += 1;
        }
        continue;
      }
      if (ch === "/" && next === "*") {
        out += "  ";
        i += 2;
        while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) {
          out += sql[i] === "\n" ? "\n" : " ";
          i += 1;
        }
        if (i < sql.length) {
          out += "  ";
          i += 2;
        }
        continue;
      }
      if (ch === "$" && next === "$") {
        inDollarQuote = false;
        out += "$$";
        i += 2;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }

    // Not inside any quoted region.
    if (ch === "'") {
      inSingleQuote = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "$" && next === "$") {
      inDollarQuote = true;
      out += "$$";
      i += 2;
      continue;
    }
    if (ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) {
        out += sql[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      if (i < sql.length) {
        out += "  ";
        i += 2;
      }
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/**
 * Splits comment-stripped SQL into top-level statements (semicolon-terminated),
 * never splitting on a `;` that falls inside a single-quoted string or inside a
 * `$$ ... $$` dollar-quoted function body — so a `CREATE FUNCTION ... AS $$
 * ... many statements separated by ; ... $$ LANGUAGE plpgsql;` is returned as
 * ONE statement, exactly as Postgres itself would see it. Each returned string
 * includes its own trailing `;` (or none, for a dangling final fragment).
 */
export function splitTopLevelStatements(strippedSql) {
  const statements = [];
  let current = "";
  let inSingleQuote = false;
  let inDollarQuote = false;
  let i = 0;

  while (i < strippedSql.length) {
    const ch = strippedSql[i];
    const next = strippedSql[i + 1];

    current += ch;

    if (inSingleQuote) {
      if (ch === "'") {
        if (next === "'") {
          current += next;
          i += 2;
          continue;
        }
        inSingleQuote = false;
      }
      i += 1;
      continue;
    }

    if (inDollarQuote) {
      if (ch === "$" && next === "$") {
        current += next;
        inDollarQuote = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      i += 1;
      continue;
    }
    if (ch === "$" && next === "$") {
      current += next;
      inDollarQuote = true;
      i += 2;
      continue;
    }
    if (ch === ";") {
      // Drop the trailing `;` itself from the pushed statement: every caller's
      // regex matches the statement's own grammar (e.g. "revoke ... from
      // public"), and a dangling semicolon would otherwise have to be
      // special-cased in every one of them.
      statements.push(current.slice(0, -1).trim());
      current = "";
      i += 1;
      continue;
    }

    i += 1;
  }

  if (current.trim()) statements.push(current.trim());
  return statements.filter(Boolean);
}

/** Collapses internal whitespace runs to single spaces, for stable regex matching. */
function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function escapeForRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ════════════════════════════════════════════════════════════════════════════
// STATEMENT-LEVEL EXTRACTION
// ════════════════════════════════════════════════════════════════════════════

/**
 * Finds the one `CREATE [OR REPLACE] FUNCTION public.NAME(...) ... $$ ... $$
 * LANGUAGE ...;` statement for `name`, plus every statement that follows it up
 * to (but not including) the next `CREATE FUNCTION` statement — exactly the
 * REVOKE/GRANT/COMMENT lines that harden this one function. Operates on the
 * STATEMENT LIST already produced by `splitTopLevelStatements` on
 * comment-stripped SQL, so a commented-out decoy can never be mistaken for it.
 */
function extractFunctionStatements(statements, name) {
  const createIndex = statements.findIndex((stmt) =>
    new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`, "i").test(stmt)
  );
  if (createIndex === -1) return null;

  const nextCreateIndex = statements.findIndex(
    (stmt, idx) => idx > createIndex && /create\s+(or\s+replace\s+)?function\s+public\./i.test(stmt)
  );
  const endIndex = nextCreateIndex === -1 ? statements.length : nextCreateIndex;
  return statements.slice(createIndex, endIndex);
}

/**
 * Extracts one named `constraint NAME check (...)` block's full parenthesised
 * body, by paren-depth counting from the first `(` after `check`. Expects
 * comment-stripped input — see the module-level scanner above — so a comment
 * placed INSIDE the parens (between column names, which Postgres permits) can
 * never inject fake content into the extracted body.
 */
function extractConstraintBody(strippedSql, constraintName) {
  const marker = `constraint ${constraintName} check`;
  const start = strippedSql.indexOf(marker);
  if (start === -1) return null;

  const openParenIndex = strippedSql.indexOf("(", start + marker.length);
  if (openParenIndex === -1) return null;

  let depth = 1;
  let i = openParenIndex + 1;
  while (i < strippedSql.length && depth > 0) {
    if (strippedSql[i] === "(") depth += 1;
    else if (strippedSql[i] === ")") depth -= 1;
    i += 1;
  }
  return strippedSql.slice(openParenIndex + 1, i - 1);
}

/**
 * True if `expression` contains a bare boolean literal (`true`/`false`) as a
 * keyword — not inside a string literal, not as a substring of a longer
 * identifier. This is the structural defence against "OR TRUE" (or "AND
 * FALSE", or any other injected literal): none of this migration set's real
 * CHECK constraints has any legitimate reason to contain the bare keyword, so
 * its mere presence is itself the finding. Checking for the literal is
 * deliberately simpler than, and strictly sufficient in place of, evaluating
 * the expression's boolean structure — there is no way to make an expression
 * unconditionally true without writing `true` (or an equivalent always-true
 * comparison this scanner does not need to anticipate, because nothing in this
 * schema's real constraints ever compares a column to itself or to a numeric
 * tautology either).
 */
function containsBareBooleanLiteral(expression) {
  return /(^|[^a-zA-Z0-9_'])(true|false)([^a-zA-Z0-9_']|$)/i.test(expression);
}

// ════════════════════════════════════════════════════════════════════════════
// FUNCTION HARDENING
// ════════════════════════════════════════════════════════════════════════════

/**
 * Validates one function's statements for the full hardening contract:
 *   - `security definer` and `set search_path = ''` inside the CREATE statement
 *   - at least one real `REVOKE ALL ... FROM PUBLIC` statement
 *   - the UNION of every `GRANT EXECUTE ... TO <roles>` statement for this
 *     function equals EXACTLY the expected audience — catches both a missing
 *     expected role and an extra granted role, and catches an extra role hidden
 *     in a SECOND grant statement the previous version never looked at.
 * `sql` is raw (un-stripped) source; this function strips comments and splits
 * into statements itself, so every caller gets the same structural guarantee
 * regardless of whether it remembers to pre-process.
 */
export function validateFunctionHardening(sql, name, { args, executeTo }) {
  const problems = [];
  const stripped = stripSqlComments(sql);
  const statements = splitTopLevelStatements(stripped);
  const block = extractFunctionStatements(statements, name);

  if (!block) {
    problems.push(`${name}: no "create or replace function public.${name}(" statement found`);
    return problems;
  }

  const createStatement = block[0];

  if (!/security\s+definer/i.test(createStatement)) {
    problems.push(`${name}: missing "security definer"`);
  }

  if (!/set\s+search_path\s*=\s*''/i.test(createStatement)) {
    problems.push(`${name}: missing "set search_path = ''"`);
  }

  // GRANT/REVOKE scanning is deliberately over the WHOLE FILE's statement list
  // (`statements`), never the per-function `block` slice above. This is the fix
  // for the false-pass Codex proved: `extractFunctionStatements` scopes a
  // function's block to "its own CREATE through the next CREATE FUNCTION", so a
  // grant appended after a LATER function — including one simply appended at
  // end-of-file, after the LAST function in the migration — falls inside some
  // OTHER function's block (or no function's block, if it is the last one) and
  // was invisible to the very function it names. A GRANT or REVOKE statement
  // names its target function in its own text; it does not need to be
  // physically adjacent to that function's CREATE statement to be real SQL that
  // affects it, so the scan must not assume adjacency either. Matching is still
  // exact on the function's name AND argument signature, so a grant for a
  // different overload or a different function never contaminates this one.
  const argsEscaped = escapeForRegex(normalizeWhitespace(args));

  const revokePattern = new RegExp(
    `^revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\(${argsEscaped}\\)\\s+from\\s+public$`,
    "i"
  );
  const revokeStatements = statements
    .map(normalizeWhitespace)
    .filter((stmt) => revokePattern.test(stmt));
  if (revokeStatements.length === 0) {
    problems.push(
      `${name}: no executable "revoke all on function public.${name}(${args}) from public" statement found`
    );
  }

  // Every GRANT EXECUTE statement for this exact function signature, ANYWHERE
  // in the file — adjacent to its own CREATE, after some other function's
  // CREATE, or at the very end of the migration. The UNION of their audiences
  // is what is compared against the expected set.
  const grantPattern = new RegExp(
    `^grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\(${argsEscaped}\\)\\s+to\\s+(.+)$`,
    "i"
  );
  const actualAudience = new Set();
  let grantStatementCount = 0;
  for (const rawStatement of statements) {
    const normalized = normalizeWhitespace(rawStatement);
    const match = grantPattern.exec(normalized);
    if (match) {
      grantStatementCount += 1;
      for (const role of match[1].split(",").map((r) => r.trim()).filter(Boolean)) {
        actualAudience.add(role);
      }
    }
  }

  if (grantStatementCount === 0) {
    problems.push(`${name}: no executable "grant execute on function public.${name}(${args}) to ...;" statement found`);
  } else {
    const expectedAudience = new Set(executeTo);
    for (const role of expectedAudience) {
      if (!actualAudience.has(role)) {
        problems.push(`${name}: missing "grant execute ... to ${role}"`);
      }
    }
    for (const role of actualAudience) {
      if (!expectedAudience.has(role)) {
        problems.push(
          `${name}: grant audience is broadened — "${role}" is granted EXECUTE (across ` +
            `${grantStatementCount} grant statement${grantStatementCount > 1 ? "s" : ""} found anywhere ` +
            `in the migration) but is not an expected audience`
        );
      }
    }
  }

  return problems;
}

/** Validates every function in EXPECTED_FUNCTIONS against the functions migration. */
export function validateAllFunctionHardening(bytesByPath = null) {
  const sql = bytesByPath
    ? bytesByPath[PARTICIPATION_MIGRATIONS.functions].toString("utf8")
    : readText(PARTICIPATION_MIGRATIONS.functions);

  const problems = [];
  for (const [name, spec] of Object.entries(EXPECTED_FUNCTIONS)) {
    problems.push(...validateFunctionHardening(sql, name, spec));
  }
  return problems;
}

// ════════════════════════════════════════════════════════════════════════════
// record_acceptance_bundle — HISTORICAL IDEMPOTENCY
// ════════════════════════════════════════════════════════════════════════════

/**
 * Validates that `record_acceptance_bundle` checks the owner's full evidence
 * HISTORY — scoped to that owner specifically — before deciding a bundle is
 * new, not just the current-state row and not some other owner's history.
 *
 * This is the behavioural fix for finding 2 (A -> B -> A idempotency), plus the
 * owner-scoping check Codex separately found missing: without
 * `e.owner_user_id = v_uid` in the lookup, the query would match ANY owner's
 * historical bundle, not only the caller's own — a cross-owner information
 * leak dressed up as an idempotency check.
 */
export function validateRecordAcceptanceBundleHistoricalIdempotency(bytesByPath = null) {
  const sql = bytesByPath
    ? bytesByPath[PARTICIPATION_MIGRATIONS.functions].toString("utf8")
    : readText(PARTICIPATION_MIGRATIONS.functions);

  const problems = [];
  const stripped = stripSqlComments(sql);
  const statements = splitTopLevelStatements(stripped);
  const block = extractFunctionStatements(statements, "record_acceptance_bundle");

  if (!block) {
    problems.push("record_acceptance_bundle: function not found at all");
    return problems;
  }

  const body = normalizeWhitespace(block[0]);

  if (!/select\s+1\s+from\s+public\.participation_events\s+e/i.test(body)) {
    problems.push(
      "record_acceptance_bundle: does not query public.participation_events at all — " +
        "idempotency cannot be checked against history if history is never read"
    );
  }

  if (!/e\.owner_user_id\s*=\s*v_uid/i.test(body)) {
    problems.push(
      "record_acceptance_bundle: the evidence-history lookup does not scope to " +
        "e.owner_user_id = v_uid — without this it checks EVERY owner's history, not just the caller's"
    );
  }

  if (!/e\.event_type\s+in\s*\(\s*'adult_attested'\s*,\s*'acceptance_recorded'\s*\)/i.test(body)) {
    problems.push(
      "record_acceptance_bundle: the evidence-history lookup does not cover both " +
        "adult_attested and acceptance_recorded event types"
    );
  }

  for (const column of ["e.attestation_version", "e.terms_version", "e.privacy_version"]) {
    if (!body.includes(column)) {
      problems.push(
        `record_acceptance_bundle: the evidence-history lookup does not compare ${column}`
      );
    }
  }

  return problems;
}

// ════════════════════════════════════════════════════════════════════════════
// athlete_participation — TABLE GRANTS, RLS, STATE-CONSISTENCY CHECKS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Validates the current-state table migration's no-grant posture, operating on
 * real executable statements: RLS must be enabled via an actual (not commented
 * out) `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statement, and the required
 * `REVOKE ALL ... FROM anon, authenticated` must exist as a real statement too.
 */
export function validateParticipationTableGrants(bytesByPath = null) {
  const sql = bytesByPath
    ? bytesByPath[PARTICIPATION_MIGRATIONS.table].toString("utf8")
    : readText(PARTICIPATION_MIGRATIONS.table);

  const stripped = stripSqlComments(sql);
  const statements = splitTopLevelStatements(stripped).map(normalizeWhitespace);

  const problems = [];

  const hasRevoke = statements.some((stmt) =>
    /^revoke\s+all\s+on\s+table\s+public\.athlete_participation\s+from\s+anon,\s*authenticated$/i.test(
      stmt
    )
  );
  if (!hasRevoke) {
    problems.push("athlete_participation: no executable revoke-all-from-anon,authenticated statement found");
  }

  const hasForbiddenGrant = statements.some((stmt) =>
    /^grant\s+(select|insert|update|delete)/i.test(stmt)
  );
  if (hasForbiddenGrant) {
    problems.push("athlete_participation: a grant statement exists — Phase 1a must add none");
  }

  const hasRls = statements.some((stmt) =>
    /^alter\s+table\s+public\.athlete_participation\s+enable\s+row\s+level\s+security$/i.test(stmt)
  );
  if (!hasRls) {
    problems.push("athlete_participation: no executable ENABLE ROW LEVEL SECURITY statement found");
  }

  return problems;
}

/**
 * The exact set of field-level clauses each state-consistency constraint must
 * contain, keyed by constraint name. Checked as a literal substring of that
 * constraint's COMMENT-STRIPPED body, specific enough that removing or
 * loosening any one clause is caught — and, combined with
 * `containsBareBooleanLiteral`, an ADDED `or true`/`and false` is caught too,
 * which substring presence alone cannot see (nothing was removed).
 */
const REQUIRED_STATE_SHAPE_CLAUSES = {
  athlete_participation_adult_approved_shape: [
    "status = 'approved'",
    "guardian_email is null",
    "token_hash is null",
    "request_generation = 0",
    "requested_at is null",
    "expires_at is null",
    "decided_at is null",
    "guardian_copy_version is null",
    "request_terms_version is null",
    "request_privacy_version is null",
    "last_issued_at is null",
    "last_delivery_outcome is null",
    "last_delivery_at is null",
    "attestation_version is not null",
    "terms_version is not null",
    "privacy_version is not null",
  ],
  athlete_participation_minor_pending_shape: [
    "guardian_email is not null",
    "token_hash is not null",
    "request_generation >= 1",
    "requested_at is not null",
    "expires_at is not null",
    "decided_at is null",
    "guardian_copy_version is not null",
    "request_terms_version is not null",
    "request_privacy_version is not null",
    "attestation_version is null",
    "terms_version is null",
    "privacy_version is null",
  ],
  athlete_participation_minor_decided_shape: [
    "guardian_email is not null",
    "token_hash is null",
    "request_generation >= 1",
    "requested_at is not null",
    "expires_at is not null",
    "decided_at is not null",
    "guardian_copy_version is not null",
    "request_terms_version is not null",
    "request_privacy_version is not null",
    "attestation_version is null",
    "terms_version is null",
    "privacy_version is null",
  ],
  athlete_participation_revoked_shape: [
    "bracket = 'minor'",
    "guardian_email is not null",
    "token_hash is null",
    "request_generation >= 1",
    "requested_at is not null",
    "expires_at is not null",
    "decided_at is not null",
    "guardian_copy_version is not null",
    "request_terms_version is not null",
    "request_privacy_version is not null",
    "attestation_version is null",
    "terms_version is null",
    "privacy_version is null",
  ],
};

/**
 * Validates every state-consistency CHECK constraint on athlete_participation:
 * every required clause must be present (catches removal/weakening), and no
 * bare boolean literal may appear anywhere in the body (catches an `OR TRUE`-
 * style addition that a substring-presence check alone would miss, because
 * nothing required was removed).
 */
export function validateStateConsistencyChecks(bytesByPath = null) {
  const sql = bytesByPath
    ? bytesByPath[PARTICIPATION_MIGRATIONS.table].toString("utf8")
    : readText(PARTICIPATION_MIGRATIONS.table);

  const stripped = stripSqlComments(sql);
  const problems = [];

  for (const [constraintName, requiredClauses] of Object.entries(REQUIRED_STATE_SHAPE_CLAUSES)) {
    const body = extractConstraintBody(stripped, constraintName);
    if (body === null) {
      problems.push(`athlete_participation: constraint ${constraintName} not found at all`);
      continue;
    }

    if (containsBareBooleanLiteral(body)) {
      problems.push(
        `athlete_participation: ${constraintName} contains a bare boolean literal ` +
          `(true/false) — this is exactly the shape of an "OR TRUE" weakening that ` +
          `would make the whole constraint vacuous`
      );
    }

    for (const clause of requiredClauses) {
      if (!body.includes(clause)) {
        problems.push(`athlete_participation: ${constraintName} is missing clause "${clause}"`);
      }
    }
  }

  return problems;
}

// ════════════════════════════════════════════════════════════════════════════
// participation_events — APPEND-ONLY POSTURE, UNIQUE INDEXES, basis_code
// ════════════════════════════════════════════════════════════════════════════

/** Validates the evidence table migration's append-only posture and unique indexes. */
export function validateEvidenceTableContract(bytesByPath = null) {
  const sql = bytesByPath
    ? bytesByPath[PARTICIPATION_MIGRATIONS.events].toString("utf8")
    : readText(PARTICIPATION_MIGRATIONS.events);

  const stripped = stripSqlComments(sql);
  const statements = splitTopLevelStatements(stripped).map(normalizeWhitespace);

  const problems = [];

  const hasRevoke = statements.some((stmt) =>
    /^revoke\s+all\s+on\s+table\s+public\.participation_events\s+from\s+anon,\s*authenticated$/i.test(
      stmt
    )
  );
  if (!hasRevoke) {
    problems.push("participation_events: no executable revoke-all-from-anon,authenticated statement found");
  }

  const hasForbiddenGrant = statements.some((stmt) =>
    /^grant\s+(select|insert|update|delete)/i.test(stmt)
  );
  if (hasForbiddenGrant) {
    problems.push("participation_events: a grant statement exists — append-only requires none");
  }

  const hasRls = statements.some((stmt) =>
    /^alter\s+table\s+public\.participation_events\s+enable\s+row\s+level\s+security$/i.test(stmt)
  );
  if (!hasRls) {
    problems.push("participation_events: no executable ENABLE ROW LEVEL SECURITY statement found");
  }

  // The bundle-unique index, as one real statement — located by scanning the
  // STATEMENT list (comment-stripped, so a decoy comment anywhere, including
  // between column names inside the parens, can never be mistaken for code).
  const bundleIndexStatement = statements.find((stmt) =>
    /^create\s+unique\s+index\s+participation_events_bundle_unique\s+on\s+public\.participation_events/i.test(
      stmt
    )
  );

  if (!bundleIndexStatement) {
    problems.push("participation_events: no executable bundle-unique index statement found");
  } else {
    if (!/nulls\s+not\s+distinct/i.test(bundleIndexStatement)) {
      problems.push("participation_events: bundle uniqueness index is not NULLS NOT DISTINCT");
    }
    if (!/where\s+event_type\s+in\s*\(\s*'adult_attested'\s*,\s*'acceptance_recorded'\s*\)/i.test(bundleIndexStatement)) {
      problems.push(
        "participation_events: bundle uniqueness index does not cover both adult_attested and acceptance_recorded"
      );
    }

    // The EXACT column list, as actual column names split on commas — not a
    // substring search, which a decoy comment inside the parens could satisfy
    // without the real column being present. `(` is matched non-greedily so this
    // captures only the index's column list, not the `where` clause's own parens.
    const columnsMatch = /on\s+public\.participation_events\s*\(([^)]*)\)/i.exec(bundleIndexStatement);
    if (!columnsMatch) {
      problems.push("participation_events: could not locate the bundle-unique index's column list at all");
    } else {
      const actualColumns = new Set(
        columnsMatch[1]
          .split(",")
          .map((col) => col.trim())
          .filter(Boolean)
      );
      for (const requiredColumn of ["owner_user_id", "attestation_version", "terms_version", "privacy_version"]) {
        if (!actualColumns.has(requiredColumn)) {
          problems.push(
            `participation_events: bundle uniqueness index is missing column "${requiredColumn}" — ` +
              `this is exactly how a "Terms removed" or "Privacy removed" weakening would look`
          );
        }
      }
    }
  }

  // basis_code must be closed-valued: a CHECK allowlist, not unrestricted text.
  // Checked against the comment-stripped text directly (not a statement split,
  // since this CHECK is a column constraint inside the CREATE TABLE statement,
  // not its own top-level statement) — comment-stripping alone is what defeats
  // a decoy comment claiming an allowlist exists.
  if (!/basis_code\s+text\s+check\s*\(\s*basis_code\s+is\s+null\s+or\s+basis_code\s+in\s*\(/i.test(stripped)) {
    problems.push("participation_events: basis_code has no closed-value CHECK allowlist");
  }
  for (const code of ["founder_reset", "founder_asserted_adult"]) {
    if (!stripped.includes(`'${code}'`)) {
      problems.push(`participation_events: basis_code allowlist is missing '${code}'`);
    }
  }

  for (const indexName of [
    "participation_events_issuance_unique",
    "participation_events_delivery_unique",
    "participation_events_decision_unique",
  ]) {
    const hasIndex = statements.some((stmt) =>
      new RegExp(`^create\\s+unique\\s+index\\s+${indexName}\\s+on\\s+public\\.participation_events`, "i").test(
        stmt
      )
    );
    if (!hasIndex) {
      problems.push(`participation_events: missing generation-bound index ${indexName}`);
    }
  }

  return problems;
}

/** Runs every Phase 1a SQL-contract check and returns the combined problem list. */
export function validateParticipationSqlContract(bytesByPath = null) {
  return [
    ...validateParticipationTableGrants(bytesByPath),
    ...validateStateConsistencyChecks(bytesByPath),
    ...validateEvidenceTableContract(bytesByPath),
    ...validateAllFunctionHardening(bytesByPath),
    ...validateRecordAcceptanceBundleHistoricalIdempotency(bytesByPath),
  ];
}
