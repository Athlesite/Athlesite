/**
 * Structural contract for the Phase 1b enforcement migration.
 *
 * The byte-pinned digest in scripts/sql-contract.mjs already fails on ANY edit to
 * this migration. This module answers the different question the digest cannot:
 * *what* the migration asserts, in terms a reviewer can read. If the digest fails,
 * you re-review; if these checks fail, something specific about the authorization
 * model changed and the message says which part.
 *
 * It is also the thing that keeps phase1b-authz-model.mjs honest. That model mirrors
 * these policies in JavaScript; this contract asserts the real SQL still matches the
 * shape the model assumes.
 *
 * Every executable statement must match an approved token sequence, including
 * the complete Boolean expressions. Comments and formatting are ignored; quoted
 * contents stay opaque and case-sensitive. This is a narrow allowlist, not a
 * general SQL parser or a proof of runtime RLS enforcement.
 */
import { readFileSync } from "node:fs";

export const PHASE_1B_MIGRATION =
  "supabase/migrations/20261012000001_phase1b_participation_enforcement.sql";

/**
 * The six policies this migration must create, and nothing else.
 *
 * `usingExpr` / `checkExpr`:
 *   - an array of operands joined by OR, in exactly the approved composition
 *   - null means the clause must be ABSENT
 *   - the literal string "true" means the clause must be exactly a bare `true`
 */
export const EXPECTED_POLICIES = [
  {
    name: "Participation required to insert profile",
    relation: "public.athlete_profiles",
    command: "insert",
    gate: "retention",
    usingExpr: null,
    checkExpr: ["public.participation_allows_retention()"],
  },
  {
    name: "Participation required to update profile",
    relation: "public.athlete_profiles",
    command: "update",
    gate: "retention",
    usingExpr: ["public.participation_allows_retention()"],
    checkExpr: ["public.participation_allows_retention()"],
  },
  {
    name: "Publication requires adult approved participation on insert",
    relation: "public.athlete_profiles",
    command: "insert",
    gate: "publication",
    usingExpr: null,
    checkExpr: ["is_published is not true", "public.participation_allows_publication()"],
  },
  {
    name: "Publication requires adult approved participation on update",
    relation: "public.athlete_profiles",
    command: "update",
    gate: "publication",
    // Deliberately a bare `true`: this gate constrains only the NEW is_published
    // value, via WITH CHECK. Row targeting is already decided by the permissive
    // owner-identity policy and by the retention gate.
    usingExpr: "true",
    checkExpr: ["is_published is not true", "public.participation_allows_publication()"],
  },
  {
    name: "Participation required to insert athlete media",
    relation: "storage.objects",
    command: "insert",
    gate: "retention",
    usingExpr: null,
    checkExpr: ["bucket_id <> 'athlete-media'", "public.participation_allows_retention()"],
  },
  {
    name: "Participation required to update athlete media",
    relation: "storage.objects",
    command: "update",
    gate: "retention",
    usingExpr: ["bucket_id <> 'athlete-media'", "public.participation_allows_retention()"],
    checkExpr: ["bucket_id <> 'athlete-media'", "public.participation_allows_retention()"],
  },
];

/** Normalizes whitespace so formatting is irrelevant but semantics are not. */
function squash(text) {
  return text.replace(/\s+/g, " ").replace(/\s*([().])\s*/g, "$1").trim().toLowerCase();
}

/** Tokenize only the reviewed syntax; reject unknown or unterminated constructs.
 * Quoted strings/identifiers and tagged dollar quotes are opaque, including any
 * comment markers, parentheses or semicolons inside them. Block comments nest.
 */
function sqlTokens(sql) {
  const tokens = [];
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) { i += whitespace[0].length; continue; }
    if (rest.startsWith("--")) {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    if (rest.startsWith("/*")) {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith("/*", i)) { depth++; i += 2; }
        else if (sql.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) throw new Error("unterminated block comment");
      continue;
    }
    const dollar = rest.match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/);
    if (dollar) {
      const end = sql.indexOf(dollar[0], i + dollar[0].length);
      if (end === -1) throw new Error("unterminated dollar quote");
      tokens.push(sql.slice(i, end + dollar[0].length));
      i = end + dollar[0].length;
      continue;
    }
    const escapeString = /^[eE]'/.test(rest);
    const quote = escapeString ? "'" : sql[i];
    if (quote === "'" || quote === '"') {
      const start = i;
      i += escapeString ? 2 : 1;
      let closed = false;
      while (i < sql.length) {
        if (escapeString && sql[i] === "\\") { i += 2; continue; }
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { i += 2; continue; }
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) throw new Error("unterminated quoted token");
      tokens.push(sql.slice(start, i));
      continue;
    }
    const token = rest.match(/^(?:[A-Za-z_][A-Za-z_0-9$]*|<>|[().,;=])/);
    if (!token) throw new Error(`unsupported SQL token at offset ${i}`);
    tokens.push(token[0].toLowerCase());
    i += token[0].length;
  }
  return tokens;
}

function approvedStatement(policy) {
  const expr = (value) => Array.isArray(value) ? value.join(" or ") : value;
  return `create policy "${policy.name}" on ${policy.relation} as restrictive ` +
    `for ${policy.command} to authenticated ` +
    (policy.usingExpr === null ? "" : `using (${expr(policy.usingExpr)}) `) +
    `with check (${expr(policy.checkExpr)})`;
}

/**
 * Extracts a balanced parenthesised expression starting at the first `(` after
 * `fromIndex`, by paren-depth counting. Returns null if there is none.
 */
function extractParenExpr(statement, fromIndex) {
  const open = statement.indexOf("(", fromIndex);
  if (open === -1) return null;
  let depth = 1;
  let i = open + 1;
  while (i < statement.length && depth > 0) {
    if (statement[i] === "(") depth += 1;
    else if (statement[i] === ")") depth -= 1;
    i += 1;
  }
  if (depth !== 0) return null;
  return statement.slice(open + 1, i - 1);
}

/** Parses one `create policy` statement into its structural parts. */
function parsePolicy(statement) {
  const nameMatch = statement.match(/create\s+policy\s+"([^"]+)"/i);
  if (!nameMatch) return null;

  const relMatch = statement.match(/\bon\s+([a-z_]+\s*\.\s*[a-z_]+)/i);
  const cmdMatch = statement.match(/\bfor\s+(select|insert|update|delete|all)\b/i);
  const rolesMatch = statement.match(/\bto\s+([a-z_,\s]+?)(?=\s+(?:using|with\s+check)\b|\s*$)/i);

  const usingIdx = statement.search(/\busing\s*\(/i);
  const checkIdx = statement.search(/\bwith\s+check\s*\(/i);

  return {
    name: nameMatch[1],
    relation: relMatch ? relMatch[1].replace(/\s/g, "").toLowerCase() : null,
    restrictive: /\bas\s+restrictive\b/i.test(statement),
    permissive: /\bas\s+permissive\b/i.test(statement),
    command: cmdMatch ? cmdMatch[1].toLowerCase() : null,
    roles: rolesMatch
      ? rolesMatch[1].split(",").map((r) => r.trim().toLowerCase()).filter(Boolean).sort()
      : [],
    usingExpr: usingIdx === -1 ? null : extractParenExpr(statement, usingIdx),
    checkExpr: checkIdx === -1 ? null : extractParenExpr(statement, checkIdx),
  };
}

/**
 * Validates the Phase 1b migration's authorization contract. Returns a list of
 * problem strings; empty means compliant.
 */
export function validatePhase1bPolicyContract(sql) {
  const problems = [];
  let tokens;
  try {
    tokens = sqlTokens(sql);
  } catch (error) {
    return [`phase1b: ${error.message}`];
  }
  const statementTokens = [];
  let current = [];
  for (const token of tokens) {
    if (token === ";") {
      if (current.length) statementTokens.push(current);
      current = [];
    } else current.push(token);
  }
  if (current.length) statementTokens.push(current);
  const statements = statementTokens.map((s) => s.join(" "));
  const stripped = statements.join("; ");

  // Match the ENTIRE statement, not just its recognizable clauses. This rejects
  // added operators, extra clauses, duplicate policies and arbitrary extra SQL.
  const remaining = new Map(EXPECTED_POLICIES.map((p) => [
    JSON.stringify(sqlTokens(approvedStatement(p))), p.name,
  ]));
  for (const statement of statementTokens) {
    const key = JSON.stringify(statement);
    if (!remaining.delete(key)) {
      problems.push("phase1b: unexpected executable statement or Boolean composition: " +
        statement.join(" "));
    }
  }
  for (const name of remaining.values()) {
    problems.push(`phase1b: policy "${name}" does not match its complete approved Boolean composition`);
  }

  // ── Additive-only: no existing policy may be dropped or altered here. This is
  // what makes the cutover have no more-permissive window.
  for (const forbidden of ["drop policy", "alter policy", "drop function", "alter function"]) {
    if (new RegExp(forbidden.replace(" ", "\\s+"), "i").test(stripped)) {
      problems.push(
        `phase1b: migration contains "${forbidden}" — Phase 1b must be purely additive, ` +
          `because dropping or recreating a policy opens a window where writes are more permissive`
      );
    }
  }

  // ── No schema/grant surface changes. Phase 1a already granted EXECUTE on both
  // predicates to authenticated; Phase 1b needs no grant of its own.
  for (const forbidden of ["create table", "alter table", "create function", "grant ", "revoke "]) {
    if (new RegExp(`\\b${forbidden.trim().replace(" ", "\\s+")}\\b`, "i").test(stripped)) {
      problems.push(
        `phase1b: migration contains "${forbidden.trim()}" — Phase 1b changes policies only`
      );
    }
  }

  // ── No service_role bypass, and no RLS disabling.
  if (/service_role/i.test(stripped)) {
    problems.push("phase1b: migration references service_role — no bypass may be introduced");
  }
  if (/disable\s+row\s+level\s+security/i.test(stripped)) {
    problems.push("phase1b: migration disables row level security");
  }

  const policyStatements = statements.filter((s) => /create\s+policy/i.test(s));
  const parsed = policyStatements.map(parsePolicy).filter(Boolean);

  if (parsed.length !== EXPECTED_POLICIES.length) {
    problems.push(
      `phase1b: expected exactly ${EXPECTED_POLICIES.length} create-policy statements, found ${parsed.length}`
    );
  }

  // ── Every policy must be RESTRICTIVE. A permissive policy here would GRANT access
  // rather than gate it, which is the opposite of this migration's purpose.
  for (const p of parsed) {
    if (!p.restrictive) {
      problems.push(
        `phase1b: policy "${p.name}" is not AS RESTRICTIVE — a permissive policy would ` +
          `ADD access instead of gating it`
      );
    }
    if (p.permissive) {
      problems.push(`phase1b: policy "${p.name}" is declared AS PERMISSIVE`);
    }
    if (p.roles.join(",") !== "authenticated") {
      problems.push(
        `phase1b: policy "${p.name}" targets roles [${p.roles.join(", ")}] — expected exactly ` +
          `"authenticated", the only role with a write path today`
      );
    }
  }

  // ── SELECT and DELETE must NOT be gated, so a participation lapse never traps an
  // owner's own data. This is a deliberate design property, so it is asserted.
  for (const p of parsed) {
    if (p.command === "select" || p.command === "delete") {
      problems.push(
        `phase1b: policy "${p.name}" gates ${p.command.toUpperCase()} — SELECT and DELETE are ` +
          `deliberately ungated so a participation problem cannot hold an owner's data hostage`
      );
    }
    if (p.command === "all") {
      problems.push(
        `phase1b: policy "${p.name}" uses FOR ALL, which would gate SELECT and DELETE too`
      );
    }
  }

  // ── Each expected policy must be present with the right shape.
  for (const want of EXPECTED_POLICIES) {
    const got = parsed.find((p) => p.name === want.name);
    if (!got) {
      problems.push(`phase1b: expected policy "${want.name}" is missing`);
      continue;
    }
    if (got.relation !== want.relation) {
      problems.push(
        `phase1b: policy "${want.name}" is on ${got.relation}, expected ${want.relation}`
      );
    }
    if (got.command !== want.command) {
      problems.push(
        `phase1b: policy "${want.name}" is FOR ${got.command}, expected ${want.command}`
      );
    }

    for (const [clause, wanted, actual] of [
      ["USING", want.usingExpr, got.usingExpr],
      ["WITH CHECK", want.checkExpr, got.checkExpr],
    ]) {
      if (wanted === null) {
        if (actual !== null) {
          problems.push(
            `phase1b: policy "${want.name}" has an unexpected ${clause} clause`
          );
        }
        continue;
      }
      if (actual === null) {
        problems.push(`phase1b: policy "${want.name}" is missing its ${clause} clause`);
        continue;
      }
      const squashed = squash(actual);
      if (wanted === "true") {
        if (squashed !== "true") {
          problems.push(
            `phase1b: policy "${want.name}" ${clause} must be exactly a bare "true" ` +
              `(it constrains only the new is_published value), found: ${JSON.stringify(actual)}`
          );
        }
        continue;
      }
      // A bare `true` anywhere a real predicate is required is the canonical
      // weakening, so it is rejected explicitly rather than only by token absence.
      if (squashed === "true") {
        problems.push(
          `phase1b: policy "${want.name}" ${clause} has been weakened to a bare "true"`
        );
        continue;
      }
      for (const token of wanted) {
        if (!squashed.includes(squash(token))) {
          problems.push(
            `phase1b: policy "${want.name}" ${clause} does not contain required expression ` +
              `${JSON.stringify(token)} — found: ${JSON.stringify(actual.trim())}`
          );
        }
      }
    }
  }

  // ── Bucket scoping must use the `<>` form. The `=` + AND form would deny writes
  // to every OTHER bucket, turning a scoped gate into a global one.
  for (const p of parsed.filter((x) => x.relation === "storage.objects")) {
    for (const [clause, expr] of [
      ["USING", p.usingExpr],
      ["WITH CHECK", p.checkExpr],
    ]) {
      if (expr === null) continue;
      const s = squash(expr);
      if (!s.includes("bucket_id <> 'athlete-media'")) {
        problems.push(
          `phase1b: storage policy "${p.name}" ${clause} must scope with ` +
            `bucket_id <> 'athlete-media' so other buckets stay ungated`
        );
      }
      if (/bucket_id\s*=\s*'athlete-media'/.test(s)) {
        problems.push(
          `phase1b: storage policy "${p.name}" ${clause} uses bucket_id = 'athlete-media' — ` +
            `in a RESTRICTIVE policy that denies writes to every other bucket`
        );
      }
    }
  }

  // ── The two gates must stay distinct. Mixing the publication predicate into a
  // retention gate (or vice versa) would silently change who may retain or publish.
  for (const want of EXPECTED_POLICIES) {
    const got = parsed.find((p) => p.name === want.name);
    if (!got) continue;
    const body = squash((got.usingExpr || "") + " " + (got.checkExpr || ""));
    const hasRetention = body.includes("participation_allows_retention");
    const hasPublication = body.includes("participation_allows_publication");
    if (want.gate === "retention" && hasPublication) {
      problems.push(
        `phase1b: retention policy "${want.name}" references participation_allows_publication — ` +
          `the two gates must stay separate`
      );
    }
    if (want.gate === "publication" && hasRetention) {
      problems.push(
        `phase1b: publication policy "${want.name}" references participation_allows_retention — ` +
          `the two gates must stay separate`
      );
    }
  }

  return problems;
}

/** Reads the real migration from disk and validates it. */
export function validatePhase1bFromDisk(path = PHASE_1B_MIGRATION) {
  return validatePhase1bPolicyContract(readFileSync(path, "utf8"));
}
