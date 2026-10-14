/**
 * Structural contract for the Phase 2 production-readiness migrations — the
 * PostgREST pre-request guardian rate limiter.
 *
 *   20261014000001_guardian_rate_limit_infrastructure.sql   (inert; builds it)
 *   20261014000002_peek_guardian_request_volatile.sql       (the prerequisite)
 *   20261014000003_arm_guardian_rate_limit_pre_request.sql  (arms it, globally)
 *
 * The middle one is one `alter function` and is a CORRECTNESS prerequisite, not
 * hardening: PostgREST picks a read-only or read/write transaction from the
 * HTTP method and called function's volatility, so with
 * `peek_guardian_request` left STABLE a legitimate POST peek would run
 * read-only and the limiter's INSERT would raise 25006 — breaking every peek.
 * Its contract (property K) is the one that keeps arming from ever shipping
 * without it.
 *
 * ── WHY THIS FILE EXISTS AT ALL, GIVEN THE BYTE PIN ─────────────────────────
 *
 * Both migrations are also pinned byte-for-byte in scripts/sql-contract.mjs.
 * That pin is the layer with nothing to out-reason: any change to either file
 * fails it. What it cannot do is say WHAT changed, or object when a digest is
 * updated carelessly alongside a real weakening. This file is the layer that
 * names the property.
 *
 * The pairing is the same one this repository already uses for Phase 1b
 * (digest + phase1b-policy-contract.mjs) and Phase 2 (digest +
 * guardian-sql-contract.mjs), and the reasoning in both of those docblocks
 * applies here unchanged.
 *
 * ── THE MODEL: EXHAUSTIVE ALLOWLIST, FAIL CLOSED ────────────────────────────
 *
 * LAYER 1 — the complete approved statement set.
 *   The migration is tokenized by the lexer in guardian-sql-contract.mjs
 *   (imported, not duplicated: a security lexer with two copies has two
 *   behaviours), then split into top-level statements. Each statement is
 *   reduced to a DESCRIPTOR — its exact token sequence with dollar-quoted body
 *   content collapsed to `<body>` — and the resulting list must be EXACTLY
 *   APPROVED_STATEMENTS, in order, string-for-string.
 *
 *   So nothing can be appended, removed, reordered, or retargeted: not a
 *   `grant ... to anon`, not a second `alter role`, not a `drop index`, not a
 *   `create policy`, not an extra column, not a changed function signature,
 *   not a changed `security`/`search_path`/`volatility` clause, not a widened
 *   index. There is no "unrecognized but tolerated" path, and an input the
 *   lexer cannot read is reported as a problem rather than skipped.
 *
 * LAYER 1b — the complete approved body of every function.
 *   Each function body must equal its APPROVED_BODIES entry token-for-token.
 *
 *   This layer exists because the previous version of this contract did NOT
 *   have it, and an independent review broke it with three mutations that each
 *   left every token SUBSEQUENCE the checker looked for intact:
 *
 *     1. `if v_observed >= v_global_limit and false then`  — the threshold
 *        comparison still present, now unreachable
 *     2. `and false` appended to the global COUNT predicate — the predicate
 *        still present, now matching nothing
 *     3. all three limit variables reassigned to 999999 after their approved
 *        assignment and before enforcement
 *
 *   Each disables the limiter completely while reporting zero problems from a
 *   subsequence checker. That is the whole lesson: a contract that reasons
 *   about PART of the executable text can always be out-reasoned by text
 *   outside that part. So the contract now covers ALL of it, and the three
 *   mutations above fail by construction rather than by special case — as does
 *   any other weakening, including ones nobody has thought of.
 *
 *   What remains uncovered is only the string literals of `comment on`
 *   statements, which are documentation. The byte pin guards their text.
 *
 * LAYER 2 — named property assertions.
 *   Layers 1 and 1b would report "the body of X differs" for every mutation,
 *   which is true but useless to a reviewer. Layer 2 re-derives the
 *   security-relevant properties so a failure names what was violated, and it
 *   keeps the baseline honest: if someone regenerates APPROVED_BODIES
 *   carelessly, Layer 2 still objects. Its assertions match CONTIGUOUS token
 *   runs, never subsequences — `if v_observed >= v_global_limit then raise`
 *   requires `then` immediately after the variable, so `and false` fails here
 *   too and the failure says which threshold broke.
 *   See PROPERTIES below, and one mutation per property in the test file.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 *
 * Not a PostgreSQL parser, and not evidence of runtime behaviour. It cannot
 * know what `request.path` actually contains on a deployed Supabase project,
 * whether `cf-connecting-ip` is forgeable there, whether PostgREST runs the
 * hook for OPTIONS, or whether a threshold is the right number. Those are
 * live-acceptance items, enumerated in docs/ai/RUNBOOK-phase2-acceptance.md,
 * and no amount of static checking substitutes for them.
 */
import { readFileSync } from "node:fs";
import { sqlTokens, splitStatements, isDollarDelimiter } from "./guardian-sql-contract.mjs";
import { APPROVED_STATEMENTS, APPROVED_BODIES } from "./guardian-rate-limit-approved.mjs";

export const RATE_LIMIT_MIGRATION =
  "supabase/migrations/20261014000001_guardian_rate_limit_infrastructure.sql";

export const VOLATILITY_MIGRATION =
  "supabase/migrations/20261014000002_peek_guardian_request_volatile.sql";

export const ARM_MIGRATION =
  "supabase/migrations/20261014000003_arm_guardian_rate_limit_pre_request.sql";

/**
 * The roles PostgREST switches into before calling `db_pre_request`, and
 * therefore the complete set that needs EXECUTE on the dispatcher.
 *
 * FOUNDER DECISION A1 chose this enumeration over granting PUBLIC. Adding a
 * role here is a deliberate, reviewed act — which is the whole point, and why
 * this list is asserted exhaustively in both directions below.
 */
export const DISPATCHER_EXECUTE_ROLES = ["anon", "authenticated", "service_role"];

/**
 * The approved pilot policy, in one place.
 *
 * This is the SECOND copy of these numbers; the migration's plpgsql literals
 * are the first and are what actually runs. Duplication is the point —
 * property C below asserts the two agree, so changing a threshold in the SQL
 * without changing it here (or the reverse) fails the contract, and both
 * halves land in one reviewable diff. docs/ai/RUNBOOK-phase2-acceptance.md § A2
 * records the reasoning and the founder-approval requirement.
 */
export const RATE_LIMIT_POLICY = {
  peek: { burst: 10, sustained: 40, global: 300 },
  redeem: { burst: 5, sustained: 15, global: 100 },
  windows: { burst: "1 minute", sustained: "1 hour", global: "5 minutes" },
  retention: "2 hours",
  retentionFloor: "1 hour",
  masklen: { ipv4: 24, ipv6: 56 },
  headerPreference: ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"],
  endpoints: {
    peek_guardian_request: "peek",
    redeem_guardian_request: "redeem",
  },
};

/**
 * The properties Layer 2 proves. Named here so a review has a checklist and
 * so the test file can assert one mutation per property.
 */
export const PROPERTIES = [
  "A — path scope: exactly two guardian RPC names, matched by equality, under an 'rpc' segment",
  "A — zero-I/O fast path: nothing in `private` is reached before the scope decision",
  "B — method gate: OPTIONS returns, anything other than POST is refused",
  "C — policy values: thresholds, windows, retention and masklens match RATE_LIMIT_POLICY",
  "C — boundary operator: limits compare with >=, never >",
  "D — fail-closed ordering: every refusal precedes the only INSERT; enforce has no early return",
  "E — IP model: header preference order, leftmost XFF element, truncate-before-hash",
  "E — IP derivation never raises and catches only invalid_text_representation",
  "F — non-storage: no token, token hash, request body, email, or athlete object is referenced",
  "F — no dynamic SQL anywhere in any body",
  "G — ACL: exhaustive grant/revoke set; nothing granted to anon/authenticated/service_role",
  "H — hardening: every function SECURITY DEFINER with an empty search_path; RLS on both tables",
  "H — every call inside a body is schema-qualified",
  "I — prune safety: both deletes are scoped to the limiter table and to a time horizon",
  "J — arming migration is exactly the two approved statements",
  "K — peek is made VOLATILE by the smallest safe statement, touching nothing else",
  "G — dispatcher EXECUTE is exactly anon/authenticated/service_role, with PUBLIC revoked",
];

// ════════════════════════════════════════════════════════════════════════════
// LAYER 1 — THE COMPLETE APPROVED STATEMENT SET
// ════════════════════════════════════════════════════════════════════════════
/**
 * The complete approved executable shape of the infrastructure migration —
 * every top-level statement, and every function body — re-exported from
 * scripts/guardian-rate-limit-approved.mjs.
 *
 * That file carries the long generated token strings and the warning about
 * regenerating them. They are re-exported here so callers and tests have one
 * import, and so this file reads as the contract rather than as a transcript.
 */
export { APPROVED_STATEMENTS, APPROVED_BODIES };

/**
 * The volatility migration, complete.
 *
 * Two statements: the `alter function`, and a refreshed comment. `alter
 * function ... volatile` specifically — NOT `create or replace function`,
 * which would restate the body and risk drift from 20261013000001's reviewed
 * text while also becoming a second definition of a function this migration
 * has no business redefining. The allowlist is what makes that distinction
 * enforced rather than merely intended.
 */
export const APPROVED_VOLATILITY_STATEMENTS = [
  "alter function public . peek_guardian_request ( text ) volatile",
  "comment on function public . peek_guardian_request ( text ) is <str> <str> <str> <str> <str> <str> <str> <str> <str>",
];

/** The arming migration, complete. Two statements, and there is no third. */
export const APPROVED_ARM_STATEMENTS = [
  "alter role authenticator set pgrst . db_pre_request = 'public.data_api_pre_request'",
  "notify pgrst , 'reload config'",
];

// ════════════════════════════════════════════════════════════════════════════
// TOKEN HELPERS
// ════════════════════════════════════════════════════════════════════════════

const isStringLiteral = (token) => typeof token === "string" && token.startsWith("'");

/**
 * A statement's descriptor: exact tokens, with dollar-body content collapsed.
 *
 * The delimiters themselves are kept, so "has a body" is part of the
 * descriptor and a function cannot lose its body without Layer 1 noticing.
 */
function descriptor(statement) {
  const out = [];
  let inBody = false;
  for (const token of statement) {
    if (isDollarDelimiter(token)) {
      if (!inBody) {
        out.push(token, "<body>");
        inBody = true;
      } else {
        out.push(token);
        inBody = false;
      }
      continue;
    }
    if (!inBody) out.push(token);
  }
  return out;
}

/** Comment literals are documentation, not executable shape — see the docblock. */
function maskCommentLiterals(statement, tokens) {
  if (statement[0] !== "comment") return tokens;
  return tokens.map((token) => (isStringLiteral(token) ? "<str>" : token));
}

/** The tokens strictly inside a statement's dollar-quoted body. */
function bodyTokens(statement) {
  const out = [];
  let inBody = false;
  for (const token of statement) {
    if (isDollarDelimiter(token)) {
      inBody = !inBody;
      continue;
    }
    if (inBody) out.push(token);
  }
  return out;
}

/** Index of the first occurrence of `needle` (a token array) at or after `from`. */
function findSeq(tokens, needle, from = 0) {
  for (let i = from; i <= tokens.length - needle.length; i += 1) {
    let hit = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (tokens[i + j] !== needle[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return i;
  }
  return -1;
}

const countSeq = (tokens, needle) => {
  let total = 0;
  let at = findSeq(tokens, needle);
  while (at !== -1) {
    total += 1;
    at = findSeq(tokens, needle, at + 1);
  }
  return total;
};

const has = (tokens, sql) => findSeq(tokens, sqlTokens(sql)) !== -1;
const at = (tokens, sql, from = 0) => findSeq(tokens, sqlTokens(sql), from);
const occurrences = (tokens, sql) => countSeq(tokens, sqlTokens(sql));

/**
 * LAYER 1b — every function body, token-for-token.
 *
 * This is the layer that makes a weakening inside a body impossible rather
 * than merely unlikely. It compares the COMPLETE token sequence, so an added
 * `and false`, an appended predicate, a later reassignment, a reordered
 * statement, or a swapped constant all fail — including mutations nobody has
 * enumerated. The named Layer 2 checks below exist to explain WHICH property
 * broke; this one exists so that nothing can get past at all.
 */
function validateApprovedBodies(statements, problems) {
  const seen = new Set();

  for (const statement of statements) {
    const body = bodyTokens(statement);
    if (body.length === 0) continue;

    const at = statement.indexOf("function");
    if (at === -1) {
      problems.push("Layer 1b: a dollar-quoted body appears outside a function definition");
      continue;
    }
    const name = `${statement[at + 1]}.${statement[at + 3]}`;
    seen.add(name);

    const approved = APPROVED_BODIES[name];
    if (approved === undefined) {
      problems.push(
        `Layer 1b: ${name} has a body but no approved baseline — a function was added, or renamed, ` +
          "without re-review"
      );
      continue;
    }

    const actual = body.join(" ");
    if (actual !== approved) {
      // Name the first divergence: "the body differs" is true but unhelpful.
      const expectedTokens = approved.split(" ");
      let i = 0;
      while (i < expectedTokens.length && i < body.length && expectedTokens[i] === body[i]) i += 1;
      problems.push(
        `Layer 1b: the body of ${name} is not its approved form.\n` +
          `      first divergence at token ${i + 1}\n` +
          `      expected: …${expectedTokens.slice(Math.max(0, i - 6), i + 8).join(" ")}…\n` +
          `      actual:   …${body.slice(Math.max(0, i - 6), i + 8).join(" ")}…`
      );
    }
  }

  for (const name of Object.keys(APPROVED_BODIES)) {
    if (!seen.has(name)) {
      problems.push(`Layer 1b: approved function body missing from the migration: ${name}`);
    }
  }
}

/** Body of the named function, or null when Layer 1 has already failed. */
function functionBody(statements, name) {
  for (const statement of statements) {
    if (findSeq(statement, sqlTokens(`function ${name}`)) !== -1) return bodyTokens(statement);
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// LAYER 2 — NAMED PROPERTIES
// ════════════════════════════════════════════════════════════════════════════

/** A — the path scope, and the zero-I/O fast path ahead of it. */
function validateScope(dispatcher, problems) {
  if (!dispatcher) return;

  // The endpoint allowlist is a CASE over exactly the two approved names.
  for (const [rpc, klass] of Object.entries(RATE_LIMIT_POLICY.endpoints)) {
    if (!has(dispatcher, `when '${rpc}' then '${klass}'`)) {
      problems.push(
        `A: the pre-request dispatcher no longer maps '${rpc}' to endpoint class '${klass}'`
      );
    }
  }
  if (!has(dispatcher, "else null")) {
    problems.push("A: the endpoint CASE has no `else null` arm — an unknown path would not resolve to NULL");
  }
  const whens = occurrences(dispatcher, "when");
  if (whens !== Object.keys(RATE_LIMIT_POLICY.endpoints).length) {
    problems.push(
      `A: the dispatcher's endpoint CASE has ${whens} WHEN arms; exactly ` +
        `${Object.keys(RATE_LIMIT_POLICY.endpoints).length} are approved — a third arm would widen the scope`
    );
  }

  // The `rpc` segment guard, and the NULL-safe comparison that makes a missing
  // segment fall out rather than evaluate to NULL (and so to "not taken").
  if (!has(dispatcher, "if v_container is distinct from 'rpc' then return")) {
    problems.push(
      "A: the 'rpc' container-segment guard is missing or no longer uses `is distinct from` + bare return"
    );
  }

  // ── Percent-decoding: the fix for the raw-vs-decoded routing bypass.
  //
  // PostgREST routes on the DECODED path (`pathInfo`) but exposes the RAW one
  // (`rawPathInfo`) as `request.path`, so comparing raw segments is bypassed
  // by `/rpc/%70eek_guardian_request`. These assertions are what keep the
  // dispatcher deciding on decoded segments.
  if (!has(dispatcher, "if pg_catalog . strpos ( v_path , '%' ) = 0 then")) {
    problems.push(
      "A: the dispatcher no longer branches on whether the path contains a `%`. That branch is what " +
        "keeps the no-encoding fast path free while still decoding anything that could be encoded."
    );
  }
  for (const segment of ["v_count - 1", "v_count"]) {
    if (!has(dispatcher, `private . guardian_decode_path_segment ( v_segments [ ${segment} ] )`)) {
      problems.push(
        `A: the dispatcher does not percent-decode v_segments[${segment}]. PostgREST routes on the ` +
          "decoded path, so an undecoded comparison is bypassed by `%70eek_guardian_request`."
      );
    }
    if (!has(dispatcher, `private . guardian_path_segment_malformed ( v_segments [ ${segment} ] )`)) {
      problems.push(
        `A: the dispatcher does not check v_segments[${segment}] for a malformed escape. A malformed ` +
          "escape leaves the routed target undetermined, and must be refused rather than resolved."
      );
    }
  }
  // Both malformed-escape checks must refuse, not return: an undetermined
  // target under `rpc` could be a guardian RPC.
  if (occurrences(dispatcher, "then raise sqlstate 'PGRST'") < 3) {
    problems.push(
      "A: a malformed-escape check no longer refuses. Both path-encoding checks and the method gate " +
        "must raise, so an undetermined guardian target is never admitted unlimited."
    );
  }
  // The container segment is resolved BEFORE the target segment, which is what
  // stops a malformed escape on a non-RPC path from being refused.
  const containerCheck = at(dispatcher, "private . guardian_path_segment_malformed ( v_segments [ v_count - 1 ] )");
  const targetCheck = at(dispatcher, "private . guardian_path_segment_malformed ( v_segments [ v_count ] )");
  if (containerCheck !== -1 && targetCheck !== -1 && containerCheck > targetCheck) {
    problems.push(
      "A: the target segment's encoding is checked before the container segment's. That ordering would " +
        "refuse `/athlete%profiles`, which is not an RPC path at all — broad blocking of unrelated traffic."
    );
  }
  // The target check is gated on the container actually being `rpc`, for the
  // same reason.
  if (!has(dispatcher, "if v_container = 'rpc' and private . guardian_path_segment_malformed ( v_segments [ v_count ] ) then")) {
    problems.push(
      "A: the target-segment encoding check is not gated on `v_container = 'rpc'`, so a malformed escape " +
        "on a non-RPC path would be refused instead of ignored"
    );
  }

  // Pattern matching is forbidden here: every one of these function names
  // contains `_`, which is a single-character wildcard in LIKE.
  for (const operator of ["like", "ilike", "similar", "~", "!~", "~~", "!~~"]) {
    if (dispatcher.includes(operator)) {
      problems.push(
        `A: the dispatcher uses pattern matching (\`${operator}\`) for path scoping — ` +
          "`_` is a LIKE wildcard, so `%/rpc/peek_guardian_request` also matches `/rpc/peekXguardianXrequest`"
      );
    }
  }

  // The zero-I/O fast path: the scope decision must be reached before anything
  // in `private` is touched. Everything before the endpoint guard is GUC reads
  // and in-memory string work.
  const endpointGuard = at(dispatcher, "if v_endpoint is null then return");
  if (endpointGuard === -1) {
    problems.push("A: the dispatcher has no `if v_endpoint is null then return` guard — non-guardian traffic would fall through");
  } else {
    // Nothing that touches the limiter may be reached before the scope
    // decision. The two percent-decode helpers ARE reached — they have to be,
    // since the decision depends on them — and they are the only `private`
    // objects allowed here: both are IMMUTABLE, read no table, and Layer 1
    // pins those declarations.
    const PRE_DECISION_PRIVATE_ALLOWLIST = new Set([
      "guardian_path_segment_malformed",
      "guardian_decode_path_segment",
    ]);
    const prefix = dispatcher.slice(0, endpointGuard);
    for (let i = 0; i < prefix.length; i += 1) {
      if (prefix[i] !== "private" || prefix[i + 1] !== ".") continue;
      const object = prefix[i + 2];
      if (!PRE_DECISION_PRIVATE_ALLOWLIST.has(object)) {
        problems.push(
          `A: the dispatcher reaches \`private.${object}\` BEFORE deciding whether the request is a ` +
            "guardian RPC. Only the two IMMUTABLE percent-decode helpers may run there; anything else " +
            "means unrelated Data API traffic performs limiter work."
        );
      }
    }
    // Still no I/O before the decision: the decoders are pure string work, so
    // no query of any kind belongs in the prefix.
    for (const verb of ["select", "insert", "update", "delete"]) {
      if (prefix.includes(verb)) {
        problems.push(
          `A: the dispatcher performs \`${verb}\` before the scope decision — the fast path must do zero I/O`
        );
      }
    }
    // `perform` appears only for the decode helpers' callers? No: they are
    // called in expressions, not via PERFORM. A PERFORM before the decision
    // would be a procedure call with side effects.
    if (prefix.includes("perform")) {
      problems.push(
        "A: the dispatcher uses `perform` before the scope decision. The decode helpers are called in " +
          "expressions; a PERFORM here would be a side-effecting call on the fast path."
      );
    }
  }

  // Five early returns, all bare: the four scope ones plus OPTIONS.
  const bareReturns = occurrences(dispatcher, "return ;");
  if (bareReturns !== 5) {
    problems.push(
      `A: the dispatcher has ${bareReturns} bare \`return;\` statements; exactly 5 are approved ` +
        "(null path, too-few segments, non-rpc segment, unknown endpoint, OPTIONS)"
    );
  }
}

/** B — the method gate. */
function validateMethodGate(dispatcher, problems) {
  if (!dispatcher) return;

  if (!has(dispatcher, "if v_method = 'OPTIONS' then return")) {
    problems.push(
      "B: OPTIONS is no longer allowed through untouched — refusing a CORS preflight would break the " +
        "guardian page outright instead of rate-limiting it"
    );
  }
  if (!has(dispatcher, "if v_method is distinct from 'POST' then raise")) {
    problems.push(
      "B: non-POST guardian traffic is no longer refused. GET/HEAD run read-only regardless of " +
        "volatility; logically read-only peek can succeed, but the limiter " +
        "cannot record anything — ignoring non-POST leaves an unlimited path onto the peek RPC. " +
        "The comparison must also be `is distinct from`, so a NULL method is refused rather than admitted."
    );
  }
  if (occurrences(dispatcher, "perform private . guardian_rate_limit_enforce ( v_endpoint )") !== 1) {
    problems.push(
      "B: the dispatcher does not delegate exactly once to private.guardian_rate_limit_enforce(v_endpoint)"
    );
  }
}

/** C — the policy values, and the boundary operator. */
function validatePolicyValues(enforce, prune, infrastructureTokens, problems) {
  if (!enforce) return;

  for (const klass of ["peek", "redeem"]) {
    const limits = RATE_LIMIT_POLICY[klass];
    const branch = at(enforce, `p_endpoint = '${klass}'`);
    if (branch === -1) {
      problems.push(`C: no policy branch for endpoint class '${klass}'`);
      continue;
    }
    const assignments = [
      ["burst", `v_burst_limit := ${limits.burst}`],
      ["sustained", `v_sustained_limit := ${limits.sustained}`],
      ["global", `v_global_limit := ${limits.global}`],
    ];
    for (const [label, sql] of assignments) {
      const found = at(enforce, sql, branch);
      // Must appear AFTER this class's test and BEFORE the next class's.
      const nextBranch = klass === "peek" ? at(enforce, "p_endpoint = 'redeem'") : enforce.length;
      if (found === -1 || found > (nextBranch === -1 ? enforce.length : nextBranch)) {
        problems.push(
          `C: the ${klass} ${label} limit is not ${limits[label]} — RATE_LIMIT_POLICY and the ` +
            "migration's own literals disagree, so one of them was changed alone"
        );
      }
    }
  }

  const windows = [
    ["burst", `v_burst_window interval := '${RATE_LIMIT_POLICY.windows.burst}'`],
    ["sustained", `v_sustained_window interval := '${RATE_LIMIT_POLICY.windows.sustained}'`],
    ["global", `v_global_window interval := '${RATE_LIMIT_POLICY.windows.global}'`],
  ];
  for (const [label, sql] of windows) {
    if (!has(enforce, sql)) {
      problems.push(`C: the ${label} window is no longer '${RATE_LIMIT_POLICY.windows[label]}'`);
    }
  }

  // ── The threshold conditions, COMPLETE and contiguous.
  //
  // `if v_observed >= v_<x>_limit then raise` as one unbroken token run. The
  // trailing `then raise` is what makes this immune to the mutation that beat
  // the previous version: `and false` between the variable and `then` breaks
  // the run, so `if v_observed >= v_global_limit and false then raise` fails
  // here and names the threshold it disabled. A `>` for `>=` fails too.
  for (const limit of ["global", "burst", "sustained"]) {
    if (!has(enforce, `if v_observed >= v_${limit}_limit then raise sqlstate 'PGRST'`)) {
      problems.push(
        `C: the ${limit} threshold condition is not exactly ` +
          `\`if v_observed >= v_${limit}_limit then raise sqlstate 'PGRST'\`. An added boolean ` +
          "conjunct or disjunct, or `>` for `>=`, changes or removes the cap while leaving the " +
          "comparison visibly present."
      );
    }
  }
  if (occurrences(enforce, "if v_observed >=") !== 3) {
    problems.push(
      "C: expected exactly 3 limit comparisons (global, burst, sustained) in the enforcer"
    );
  }

  // ── Each limit variable is assigned EXACTLY twice: once in the peek branch,
  // once in the redeem branch. A third assignment is a reassignment, which is
  // how the reviewed mutation set disabled all three caps (`:= 999999`) while
  // leaving the approved assignments in place.
  for (const limit of ["burst", "sustained", "global"]) {
    const assignments = occurrences(enforce, `v_${limit}_limit :=`);
    if (assignments !== 2) {
      problems.push(
        `C: v_${limit}_limit is assigned ${assignments} times; exactly 2 are approved (one per ` +
          "endpoint-class branch). A further assignment — unconditional, conditional, or an " +
          "increment — overrides the approved constant before enforcement reads it."
      );
    }
    // Nothing may modify a limit after the branch that sets it. The only
    // approved occurrences are the DECLARE, the two assignments, and the one
    // threshold comparison.
    const total = occurrences(enforce, `v_${limit}_limit`);
    if (total !== 4) {
      problems.push(
        `C: v_${limit}_limit appears ${total} times; exactly 4 are approved (the DECLARE, two ` +
          "assignments, and one threshold comparison). Any further mention is an unreviewed use of a " +
          "limit value — a reassignment, an increment, or a second comparison."
      );
    }
  }

  // ── Assignment strictly before enforcement, enforcement strictly before the
  // insert. Order is the other half of "the limits are the approved ones".
  const lastAssignment = Math.max(
    ...["burst", "sustained", "global"].map((l) => {
      let position = -1;
      let cursor = at(enforce, `v_${l}_limit :=`);
      while (cursor !== -1) {
        position = cursor;
        cursor = at(enforce, `v_${l}_limit :=`, cursor + 1);
      }
      return position;
    })
  );
  const firstComparison = at(enforce, "if v_observed >=");
  const insertPosition = at(enforce, "insert into private . guardian_rate_limits");
  if (lastAssignment === -1 || firstComparison === -1) {
    problems.push("C: could not locate the limit assignments or the threshold comparisons");
  } else if (lastAssignment > firstComparison) {
    problems.push(
      "C: a limit is assigned AFTER enforcement begins, so the value the comparison used is not " +
        "the value the migration appears to set"
    );
  }
  if (insertPosition !== -1 && firstComparison > insertPosition) {
    problems.push("C: enforcement begins after the INSERT — the request is recorded before it is checked");
  }

  // ── The COUNT predicates, COMPLETE and contiguous.
  //
  // Each window query is pinned whole, so an appended `and false` (which makes
  // the count always 0 and the cap unreachable), a dropped endpoint predicate
  // (which merges classes), or a dropped time predicate (which counts rows
  // outside the window) all fail.
  const countQueries = [
    [
      "global",
      "select pg_catalog . count ( * ) into v_observed from private . guardian_rate_limits r " +
        "where r . endpoint = p_endpoint and r . request_at > v_now - v_global_window ;",
    ],
    [
      "burst",
      "select pg_catalog . count ( * ) into v_observed from private . guardian_rate_limits r " +
        "where r . bucket_key = v_key and r . endpoint = p_endpoint and r . request_at > v_now - v_burst_window ;",
    ],
    [
      "sustained",
      "select pg_catalog . count ( * ) into v_observed from private . guardian_rate_limits r " +
        "where r . bucket_key = v_key and r . endpoint = p_endpoint and r . request_at > v_now - v_sustained_window ;",
    ],
  ];
  for (const [label, sql] of countQueries) {
    if (!has(enforce, sql)) {
      problems.push(
        `C: the ${label} COUNT query is not exactly its approved form. An extra predicate, a ` +
          "missing endpoint predicate, or a missing time predicate each changes what is counted " +
          "while leaving a plausible-looking query in place."
      );
    }
  }
  if (occurrences(enforce, "select pg_catalog . count ( * ) into v_observed") !== 3) {
    problems.push("C: expected exactly 3 window COUNT queries in the enforcer");
  }

  // ── Atomicity: both advisory locks, in the fixed order, before any count.
  const globalLock = at(enforce, "perform pg_catalog . pg_advisory_xact_lock ( 20261014 , pg_catalog . hashtext ( p_endpoint ) )");
  const isolationGate = at(enforce, "if pg_catalog.current_setting('transaction_isolation') is distinct from 'read committed' then raise sqlstate 'PGRST'");
  if (isolationGate === -1 || isolationGate > globalLock) {
    problems.push("C: refuse frozen transaction snapshots before locking; atomic counts require READ COMMITTED");
  }
  if (!has(enforce, "perform pg_catalog.pg_advisory_xact_lock(20261014, pg_catalog.hashtext(p_endpoint)); v_now := pg_catalog.clock_timestamp();") ||
      occurrences(enforce, "v_now :=") !== 1 || !has(enforce, "v_now timestamptz ;")) {
    problems.push("C: the window clock must be assigned exactly once, immediately AFTER the global lock, so waiting requests cannot insert backdated counters");
  }
  const networkLock = at(
    enforce,
    "perform pg_catalog . pg_advisory_xact_lock ( 20261015 , pg_catalog . hashtext ( p_endpoint || ':' || pg_catalog . encode ( v_key , 'hex' ) ) )"
  );
  if (globalLock === -1) {
    problems.push(
      "C: the GLOBAL advisory lock is missing. Without it, count/compare/insert is not atomic and " +
        "concurrent requests all observe N-1 and all succeed — the approved cap becomes a suggestion."
    );
  }
  if (networkLock === -1) {
    problems.push("C: the per-network advisory lock is missing, so the per-network caps are not atomic");
  }
  if (globalLock !== -1 && networkLock !== -1 && globalLock > networkLock) {
    problems.push(
      "C: the network lock is acquired BEFORE the global lock. The order must be global-then-network " +
        "on every path, or two transactions can hold the pair in opposite order and deadlock."
    );
  }
  if (globalLock !== -1 && firstComparison !== -1 && globalLock > firstComparison) {
    problems.push("C: the global cap is counted before its lock is held, which is the non-atomic bug again");
  }

  // Retention: the opportunistic prune horizon, the global prune default, and
  // the floor that stops a cron misconfiguration resetting live windows.
  if (!has(enforce, `r . request_at < v_now - interval '${RATE_LIMIT_POLICY.retention}'`)) {
    problems.push(
      `C: the opportunistic prune horizon is no longer '${RATE_LIMIT_POLICY.retention}' — a horizon ` +
        "shorter than the sustained window would silently reset live limits"
    );
  }
  if (!has(infrastructureTokens, `p_retention interval default interval '${RATE_LIMIT_POLICY.retention}'`)) {
    problems.push(`C: prune_guardian_rate_limits no longer defaults to '${RATE_LIMIT_POLICY.retention}'`);
  }
  if (prune && !has(prune, `p_retention < interval '${RATE_LIMIT_POLICY.retentionFloor}'`)) {
    problems.push(
      `C: the prune retention floor is no longer '${RATE_LIMIT_POLICY.retentionFloor}' — pruning inside ` +
        "an active window resets live rate limits and looks like nothing at all"
    );
  }
}

/** D — fail-closed ordering inside the enforcer. */
function validateFailClosedOrdering(enforce, problems) {
  if (!enforce) return;

  const insertAt = at(enforce, "insert into private . guardian_rate_limits");
  if (insertAt === -1) {
    problems.push("D: the enforcer no longer records anything — every window would stay empty and nothing would ever be limited");
    return;
  }

  if (occurrences(enforce, "insert into") !== 1) {
    problems.push("D: the enforcer contains more than one INSERT");
  }

  // The global cap is evaluated for EVERY guardian request, before the
  // per-network branch, and so is the one control a spoofed or absent
  // forwarding header cannot evade.
  const globalCount = at(enforce, "where r . endpoint = p_endpoint");
  const ipBranch = at(enforce, "if v_ip is null then");
  if (globalCount === -1) {
    problems.push("D: the global per-endpoint cap COUNT is gone — nothing survives a spoofed forwarding header");
  } else if (ipBranch !== -1 && globalCount > ipBranch) {
    problems.push(
      "D: the global cap is evaluated AFTER the client-address branch, so a request with no derivable " +
        "address would skip it — the global cap must bind unconditionally"
    );
  }

  // Every refusal precedes the only write.
  const raises = [];
  let raiseAt = at(enforce, "raise sqlstate 'PGRST'");
  while (raiseAt !== -1) {
    raises.push(raiseAt);
    raiseAt = at(enforce, "raise sqlstate 'PGRST'", raiseAt + 1);
  }
  if (raises.length !== 5) {
    problems.push(
      `D: expected 5 PGRST refusals in the enforcer (unknown class, isolation, global, burst, sustained); found ${raises.length}`
    );
  }
  for (const position of raises) {
    if (position > insertAt) {
      problems.push(
        "D: a refusal is raised AFTER the INSERT — rejected requests must leave no row, both so a caller " +
          "who stops is released when the window rolls off and so a caller who does not cannot amplify " +
          "their own attack into unbounded writes"
      );
      break;
    }
  }

  // No early exit: the only ways out are a refusal or the counted INSERT. An
  // early `return` would be an unlimited path that still looks limited.
  if (enforce.includes("return")) {
    problems.push(
      "D: the enforcer contains a `return` — it must have no early exit, or an endpoint class could " +
        "reach the RPC without being counted"
    );
  }

  // The unreachable `else` arm refuses rather than falling through.
  const elseAt = at(enforce, "else raise sqlstate 'PGRST'");
  if (elseAt === -1) {
    problems.push(
      "D: an unrecognised endpoint class no longer refuses. It is unreachable from the dispatcher today, " +
        "but a future second caller must not obtain an unlimited path by passing an unknown class."
    );
  }
}

/** E — the IP model. */
function validateIpModel(bucketKey, requestIp, problems) {
  if (requestIp) {
    // Preference order, each step strictly after the previous one.
    let cursor = 0;
    for (const header of RATE_LIMIT_POLICY.headerPreference) {
      const found = at(requestIp, `'${header}'`, cursor);
      if (found === -1) {
        problems.push(
          `E: header '${header}' is no longer consulted, or no longer in the approved preference order ` +
            `(${RATE_LIMIT_POLICY.headerPreference.join(" then ")})`
        );
        break;
      }
      cursor = found + 1;
    }

    // Any header literal other than the three approved ones is a new, unreviewed trust assumption.
    const approved = new Set(RATE_LIMIT_POLICY.headerPreference.map((h) => `'${h}'`));
    for (const token of requestIp) {
      if (!isStringLiteral(token)) continue;
      // `'request.headers'` is the GUC name, `''` the blank-candidate test,
      // `','` the x-forwarded-for separator. Everything else would be a new
      // header this function trusts, which is a new trust assumption.
      if (token === "'request.headers'" || token === "''" || token === "','") continue;
      if (!approved.has(token)) {
        problems.push(`E: the IP derivation reads an unapproved request header literal: ${token}`);
      }
    }

    // Leftmost x-forwarded-for element.
    if (!has(requestIp, "pg_catalog . split_part ( coalesce ( v_headers - > > 'x-forwarded-for' , '' ) , ',' , 1 )")) {
      problems.push(
        "E: the x-forwarded-for fallback no longer takes element 1. Taking a different element changes " +
          "which hop is trusted, which is the whole substance of the spoofing question"
      );
    }

    // Never raises: the caller decides the policy response to "no address".
    if (requestIp.includes("raise")) {
      problems.push(
        "E: the IP derivation raises. It must return NULL instead and let guardian_rate_limit_enforce " +
          "decide — raising here would hard-fail every guardian request on any header surprise"
      );
    }

    // Narrow handlers only. `when others` would swallow a genuine internal
    // failure and report it as "no client address".
    const handlers = occurrences(requestIp, "exception when invalid_text_representation then return null");
    if (handlers !== 2) {
      problems.push(
        `E: expected exactly 2 \`when invalid_text_representation\` handlers (the json cast and the inet ` +
          `cast); found ${handlers}`
      );
    }
    if (has(requestIp, "when others")) {
      problems.push("E: the IP derivation catches `when others`, masking genuine internal failures as a missing header");
    }
  }

  if (bucketKey) {
    // Truncation happens BEFORE hashing, inside the sha256 argument, so the
    // full address never reaches the digest input.
    const hashAt = at(bucketKey, "pg_catalog . sha256 (");
    const truncateAt = at(bucketKey, "pg_catalog . set_masklen (");
    if (hashAt === -1 || truncateAt === -1 || truncateAt < hashAt) {
      problems.push(
        "E: the client network is no longer truncated inside the sha256 argument — if the full address " +
          "reaches the digest, the stored key identifies a host rather than a /24 or /56"
      );
    }
    if (!has(bucketKey, `then ${RATE_LIMIT_POLICY.masklen.ipv4} else ${RATE_LIMIT_POLICY.masklen.ipv6} end`)) {
      problems.push(
        `E: the truncation masklens are no longer /${RATE_LIMIT_POLICY.masklen.ipv4} (IPv4) and ` +
          `/${RATE_LIMIT_POLICY.masklen.ipv6} (IPv6). A longer IPv6 prefix is evaded by any caller ` +
          "holding an ordinary /64 allocation."
      );
    }
    if (!has(bucketKey, "pg_catalog . family ( p_ip ) = 4")) {
      problems.push("E: the IPv4/IPv6 family test is gone, so one family would be truncated with the other's masklen");
    }
    // The salt must be part of the digest input.
    if (!has(bucketKey, "s . salt ||")) {
      problems.push(
        "E: the per-database salt is no longer part of the bucket key digest — an unsalted hash of a /24 " +
          "is enumerable by anyone who obtains a limiter row"
      );
    }
  }
}

/** F — what must never be stored or referenced, and no dynamic SQL. */
const FORBIDDEN_IDENTIFIERS = [
  "p_token",
  "token_hash",
  "token",
  "guardian_email",
  "athlete_participation",
  "participation_events",
  "athlete_profiles",
  "owner_user_id",
  "storage",
  "auth",
  // `service_role` is NOT in this list, because FOUNDER DECISION A1 makes it a
  // legitimate grantee of the dispatcher. It is confined instead: the check
  // below allows it in exactly one statement — the dispatcher grant — and
  // nowhere else, so it still cannot appear inside a function body or a
  // `private` grant.
  "pg_sleep",
  "dblink",
  "http",
];

function validateNonStorage(statements, allTokens, problems) {
  // Identifier tokens only: string literals are excluded deliberately, because
  // the reviewed comments legitimately contain the WORD "token" while
  // referencing nothing. Hiding a real reference in a literal would require
  // dynamic SQL, which the next check forbids outright.
  const identifiers = allTokens.filter((token) => !isStringLiteral(token));
  for (const forbidden of FORBIDDEN_IDENTIFIERS) {
    if (identifiers.includes(forbidden)) {
      problems.push(
        `F: the limiter migration references \`${forbidden}\`. This surface stores a salted network hash, ` +
          "an endpoint class and a timestamp — nothing that can tie a counter row to a token, a guardian, " +
          "or an athlete"
      );
    }
  }

  // The three Data API roles may appear ONLY in the dispatcher grant. Anywhere
  // else — a `private` grant, a function body, a second grant — would be a new
  // surface for a role that is supposed to reach exactly one object here.
  for (const statement of statements) {
    const isDispatcherGrant =
      findSeq(statement, sqlTokens("grant execute on function public . data_api_pre_request")) === 0;
    if (isDispatcherGrant) continue;
    for (const role of DISPATCHER_EXECUTE_ROLES) {
      if (statement.includes(role)) {
        problems.push(
          `F: \`${role}\` appears outside the dispatcher grant: ${statement.slice(0, 10).join(" ")}… ` +
            "These three roles may hold EXECUTE on public.data_api_pre_request() and nothing else " +
            "in this migration."
        );
      }
    }
  }

  // Dynamic SQL, inside bodies only (`grant execute on function` legitimately
  // uses the word at top level).
  for (const statement of statements) {
    const body = bodyTokens(statement);
    for (const forbidden of ["execute", "format", "quote_ident", "quote_literal"]) {
      if (body.includes(forbidden)) {
        problems.push(
          `F: \`${forbidden}\` appears inside a function body. Dynamic SQL would put the whole of Layer 1 ` +
            "out of reach, because the executed text is not in the token stream"
        );
      }
    }
  }

  // The limiter table's columns are exactly the three approved ones.
  const table = statements.find(
    (st) => findSeq(st, sqlTokens("create table if not exists private . guardian_rate_limits")) !== -1
  );
  if (table) {
    const approvedColumns = ["bucket_key", "endpoint", "request_at"];
    for (const column of approvedColumns) {
      if (!table.includes(column)) problems.push(`F: the limiter table no longer has a \`${column}\` column`);
    }
    if (!has(table, "bucket_key bytea not null , endpoint text not null , request_at timestamptz not null ,")) {
      problems.push(
        "F: the limiter table's column list no longer begins with exactly (bucket_key bytea, endpoint " +
          "text, request_at timestamptz)"
      );
    }
    // Prefix matching alone is not enough: a column APPENDED after the three
    // approved ones leaves that prefix intact. So the statement's whole
    // identifier vocabulary is pinned — any new column name, or any new type,
    // is a word that does not appear here, and a fourth column is a new
    // category of retained data that needs its own privacy review rather than
    // a passing contract.
    const APPROVED_TABLE_VOCABULARY = new Set([
      "create", "table", "if", "not", "exists", "private", "guardian_rate_limits",
      "bucket_key", "bytea", "null", "endpoint", "text", "request_at", "timestamptz",
      "constraint", "guardian_rate_limits_endpoint_check", "check", "in",
      "guardian_rate_limits_bucket_key_length", "pg_catalog", "length",
    ]);
    for (const token of table) {
      if (!/^[a-z_][a-z_0-9]*$/.test(token)) continue;
      if (APPROVED_TABLE_VOCABULARY.has(token)) continue;
      problems.push(
        `F: the limiter table definition introduces \`${token}\`. The approved shape is exactly three ` +
          "columns — a salted network hash, an endpoint class and a timestamp — and anything else stored " +
          "beside a guardian's request is a new category of retained data"
      );
    }
  }

  // Every write in the migration targets an approved object.
  const APPROVED_WRITE_TARGETS = [
    "insert into private . guardian_rate_limit_salt",
    "insert into private . guardian_rate_limits",
    "delete from private . guardian_rate_limits",
  ];
  for (const verb of [
    ["insert", "insert into"],
    ["delete", "delete from"],
    ["update", "update"],
  ]) {
    const [label, lead] = verb;
    let cursor = at(allTokens, lead);
    while (cursor !== -1) {
      const window = allTokens.slice(cursor, cursor + 8).join(" ");
      if (!APPROVED_WRITE_TARGETS.some((target) => window.startsWith(target))) {
        problems.push(
          `F: an unapproved ${label.toUpperCase()} target: "${window}". The only objects this migration ` +
            "may write are private.guardian_rate_limit_salt (once) and private.guardian_rate_limits"
        );
      }
      cursor = at(allTokens, lead, cursor + 1);
    }
  }
}

/** G — the complete ACL model. */
const APPROVED_ACL_STATEMENTS = [
  "revoke all on schema private from public",
  "revoke all on function private . guardian_rate_limit_bucket_key ( inet ) from public",
  "revoke all on function private . guardian_request_ip ( ) from public",
  "revoke all on function private . guardian_rate_limit_enforce ( text ) from public",
  "revoke all on function private . prune_guardian_rate_limits ( interval ) from public",
  "revoke all on function private . guardian_path_segment_malformed ( text ) from public",
  "revoke all on function private . guardian_decode_path_segment ( text ) from public",
  "revoke all on function public . data_api_pre_request ( ) from public",
  `grant execute on function public . data_api_pre_request ( ) to ${DISPATCHER_EXECUTE_ROLES.join(" , ")}`,
];

function validateAclModel(statements, allTokens, problems) {
  const acl = statements
    .filter((st) => st[0] === "grant" || st[0] === "revoke")
    .map((st) => st.join(" "));

  if (acl.length !== APPROVED_ACL_STATEMENTS.length) {
    problems.push(
      `G: the migration has ${acl.length} grant/revoke statements; exactly ${APPROVED_ACL_STATEMENTS.length} are approved`
    );
  }
  for (const approved of APPROVED_ACL_STATEMENTS) {
    if (!acl.includes(approved)) problems.push(`G: approved ACL statement missing: ${approved}`);
  }
  for (const actual of acl) {
    if (!APPROVED_ACL_STATEMENTS.includes(actual)) problems.push(`G: unapproved ACL statement: ${actual}`);
  }

  // The ONLY grant in this migration is EXECUTE on the dispatcher, to exactly
  // the three Data API roles (FOUNDER DECISION A1). Nothing in `private` may
  // be granted to anyone, and no grant may target a table.
  const grants = statements.filter((st) => st[0] === "grant");
  if (grants.length !== 1) {
    problems.push(`G: expected exactly 1 GRANT statement; found ${grants.length}`);
  }
  for (const statement of grants) {
    if (statement.includes("private")) {
      problems.push(
        `G: a grant targets \`private\`. Guardian limiter internals are reachable only as the ` +
          "SECURITY DEFINER owner; granting a request role USAGE or EXECUTE there would expose " +
          `limiter rows: ${statement.join(" ")}`
      );
    }
    if (statement.includes("table")) {
      problems.push(`G: a grant targets a table: ${statement.join(" ")}`);
    }
    if (statement.includes("authenticator")) {
      problems.push(
        "G: the dispatcher is granted to `authenticator`. PostgREST calls db_pre_request AFTER " +
          "switching into the request's effective role, so `authenticator` is not the role that " +
          "needs EXECUTE. If a deployed project proves otherwise, that is a STOP-AND-REPORT " +
          "finding (RUNBOOK § A1), not a grant to add quietly."
      );
    }
  }

  // The dispatcher grant, exhaustively, in both directions: every approved
  // role present, and no role beyond them. A1's whole value is that a future
  // Data API role must be added deliberately, which only holds if an
  // accidental extra grantee fails here.
  const dispatcherGrant = grants.find(
    (st) => findSeq(st, sqlTokens("grant execute on function public . data_api_pre_request")) === 0
  );
  if (!dispatcherGrant) {
    problems.push("G: no `grant execute on function public.data_api_pre_request` statement");
  } else {
    const granted = dispatcherGrant
      .slice(dispatcherGrant.indexOf("to") + 1)
      .filter((token) => token !== ",");
    const expected = DISPATCHER_EXECUTE_ROLES.join(",");
    if (granted.join(",") !== expected) {
      problems.push(
        `G: the dispatcher EXECUTE grantees are [${granted.join(", ")}], expected exactly ` +
          `[${DISPATCHER_EXECUTE_ROLES.join(", ")}]. FOUNDER DECISION A1 chose this enumeration ` +
          "over PUBLIC so that a new Data API role needs a reviewed grant; widening it back to " +
          "`public` would admit every future role implicitly."
      );
    }
    if (granted.includes("public")) {
      problems.push(
        "G: the dispatcher is granted to PUBLIC. This was explicitly rejected (FOUNDER DECISION A1) " +
          "— it trades project-wide future-role exposure for skipping one configuration step."
      );
    }
  }

  // PUBLIC must be revoked from the dispatcher, not merely left ungranted:
  // PostgreSQL's default for a new function is EXECUTE to PUBLIC, and
  // `create or replace function` does not reset an existing ACL.
  if (!has(allTokens, "revoke all on function public . data_api_pre_request ( ) from public")) {
    problems.push(
      "G: PUBLIC is not explicitly revoked from the dispatcher. PostgreSQL grants EXECUTE to " +
        "PUBLIC by default on a new function, so omitting the revoke leaves the rejected A1 " +
        "design in place on any database where this migration runs."
    );
  }

  // No RLS policy is created here, and RLS is never disabled.
  if (has(allTokens, "create policy")) {
    problems.push("G: the migration creates an RLS policy. Both limiter tables are deliberately policy-free — RLS on with no policy means no row is readable by anyone but the owner");
  }
  if (has(allTokens, "disable row level security")) {
    problems.push("G: the migration disables row level security");
  }
  if (has(allTokens, "force row level security")) {
    problems.push(
      "G: the migration FORCEs row level security, which would apply RLS to the table owner too — the " +
        "SECURITY DEFINER functions run as the owner and would read zero rows, silently disabling every limit"
    );
  }
}

/** H — function hardening, RLS, and schema qualification. */
/**
 * Every function the migration defines, and whether it is SECURITY DEFINER.
 *
 * The two percent-decode helpers are deliberately SECURITY INVOKER: they are
 * pure string functions that read no table and need no privilege at all, so
 * giving them the owner's rights would be privilege for nothing. They are
 * still reachable only from inside `private` (revoked from PUBLIC, and the
 * schema has no USAGE grant), and they are still required to pin an empty
 * search_path like everything else here.
 *
 * Asserted as a map rather than a list so that making a decoder SECURITY
 * DEFINER, or making one of the others SECURITY INVOKER, both fail.
 */
const APPROVED_FUNCTIONS = {
  "private . guardian_rate_limit_bucket_key": { definer: true },
  "private . guardian_request_ip": { definer: true },
  "private . guardian_rate_limit_enforce": { definer: true },
  "private . prune_guardian_rate_limits": { definer: true },
  "private . guardian_path_segment_malformed": { definer: false },
  "private . guardian_decode_path_segment": { definer: false },
  "public . data_api_pre_request": { definer: true },
};

/**
 * Names that may legitimately be followed by `(` inside a body without a
 * schema qualifier.
 *
 * `bit` is a TYPE name in the cast `('x' || hex)::bit(8)`, not a function
 * call. `coalesce` and `values` are grammar constructs. Everything else must
 * be schema-qualified, because an unqualified call under an empty search_path
 * either fails at runtime or resolves somewhere unreviewed.
 */
const UNQUALIFIED_CALL_ALLOWLIST = new Set(["coalesce", "values", "bit"]);

function validateHardening(statements, allTokens, problems) {
  const definitions = statements.filter((st) => findSeq(st, sqlTokens("create or replace function")) === 0);

  const approvedNames = Object.keys(APPROVED_FUNCTIONS);
  if (definitions.length !== approvedNames.length) {
    problems.push(
      `H: the migration defines ${definitions.length} functions; exactly ${approvedNames.length} are approved`
    );
  }
  for (const name of approvedNames) {
    const definition = definitions.find((st) => findSeq(st, sqlTokens(`function ${name}`)) !== -1);
    if (!definition) {
      problems.push(`H: approved function missing: ${name}`);
      continue;
    }
    const isDefiner = has(definition, "security definer");
    if (APPROVED_FUNCTIONS[name].definer && !isDefiner) {
      problems.push(`H: ${name} is not SECURITY DEFINER`);
    }
    if (!APPROVED_FUNCTIONS[name].definer && isDefiner) {
      problems.push(
        `H: ${name} is SECURITY DEFINER but is approved as SECURITY INVOKER. It is a pure string ` +
          "function that reads nothing; running it with the owner's rights would be privilege for nothing."
      );
    }
    if (!has(definition, "set search_path = ''")) {
      problems.push(
        `H: ${name} does not pin an empty search_path (docs/ai/DECISIONS.md § Every function in \`public\` ` +
          "pins an empty search_path)"
      );
    }
  }

  for (const table of ["private . guardian_rate_limit_salt", "private . guardian_rate_limits"]) {
    if (!has(allTokens, `alter table ${table} enable row level security`)) {
      problems.push(`H: row level security is not enabled on ${table}`);
    }
  }

  // Every call inside a body is schema-qualified. With an empty search_path an
  // unqualified call to anything outside pg_catalog fails at runtime; more to
  // the point, a qualified call cannot be hijacked by a same-named object in
  // another schema.
  for (const statement of statements) {
    const body = bodyTokens(statement);
    for (let i = 0; i < body.length; i += 1) {
      if (body[i + 1] !== "(") continue;
      if (!/^[a-z_][a-z_0-9]*$/.test(body[i])) continue;
      if (body[i - 1] === ".") continue;
      if (UNQUALIFIED_CALL_ALLOWLIST.has(body[i])) continue;
      // plpgsql/SQL keywords that are followed by a parenthesis.
      if (["if", "elsif", "while", "case", "in", "exists", "not", "and", "or", "returns", "select", "count"].includes(body[i])) {
        continue;
      }
      problems.push(
        `H: unqualified call \`${body[i]}(\` inside a function body — every call must be schema-qualified ` +
          "under an empty search_path"
      );
    }
  }
}

/** I — prune safety. */
function validatePruneSafety(enforce, prune, allTokens, problems) {
  const deletes = occurrences(allTokens, "delete from");
  if (deletes !== 2) {
    problems.push(`I: expected exactly 2 DELETE statements (opportunistic and global prune); found ${deletes}`);
  }

  if (enforce) {
    if (
      !has(
        enforce,
        `delete from private . guardian_rate_limits r where r . bucket_key = v_key and r . request_at < v_now - interval '${RATE_LIMIT_POLICY.retention}'`
      )
    ) {
      problems.push(
        "I: the opportunistic prune is no longer scoped to BOTH this caller's bucket_key AND a time " +
          "horizon. Dropping either predicate lets one guardian request delete another bucket's live counters"
      );
    }
  }

  if (prune) {
    if (!has(prune, "delete from private . guardian_rate_limits r where r . request_at < pg_catalog . clock_timestamp ( ) - p_retention")) {
      problems.push(
        "I: the global prune is no longer scoped to `request_at < now - p_retention` on the limiter table alone"
      );
    }
    if (!has(prune, "if p_retention is null or p_retention <")) {
      problems.push("I: the global prune no longer refuses a NULL or too-short retention");
    }
  }
}

/**
 * K — the volatility migration: the smallest safe statement, and nothing else.
 *
 * The risks this guards are specific. Using `create or replace function` would
 * restate a reviewed body from a second place. Targeting `redeem` would change
 * a function that is already correct. Declaring `stable` or `immutable` would
 * reintroduce the 25006 failure on every POST peek. Touching the owner, the
 * ACL, the search_path or the signature would alter the surface 20261013000001
 * was reviewed as.
 */
function validateVolatilityMigration(sql, problems) {
  let statements;
  let tokens;
  try {
    tokens = sqlTokens(sql);
    statements = splitStatements(tokens);
  } catch (error) {
    problems.push(`K: the volatility migration could not be tokenized: ${error.message}`);
    return;
  }

  const actual = statements.map((st) => maskCommentLiterals(st, descriptor(st)).join(" "));
  if (actual.length !== APPROVED_VOLATILITY_STATEMENTS.length) {
    problems.push(
      `K: the volatility migration has ${actual.length} statements; exactly ` +
        `${APPROVED_VOLATILITY_STATEMENTS.length} are approved (the alter function, and its comment)`
    );
  }
  for (let i = 0; i < Math.max(actual.length, APPROVED_VOLATILITY_STATEMENTS.length); i += 1) {
    if (actual[i] !== APPROVED_VOLATILITY_STATEMENTS[i]) {
      problems.push(
        `K: volatility statement ${i + 1} is not the approved statement.\n` +
          `      expected: ${APPROVED_VOLATILITY_STATEMENTS[i] ?? "(none)"}\n` +
          `      actual:   ${actual[i] ?? "(none)"}`
      );
    }
  }

  // Named assertions on top of the allowlist, so a failure says what broke.
  if (!has(tokens, "alter function public . peek_guardian_request ( text ) volatile")) {
    problems.push(
      "K: peek_guardian_request is not made VOLATILE. PostgREST picks a read-only or read/write " +
        "transaction from both HTTP method and volatility, so leaving peek STABLE means a " +
        "legitimate POST peek runs read-only and the limiter's INSERT raises 25006 — every peek " +
        "fails, rather than merely going unlimited."
    );
  }
  if (has(tokens, "create or replace function")) {
    problems.push(
      "K: the volatility migration uses `create or replace function`. It must use `alter function " +
        "... volatile`, the smallest statement that changes only `provolatile` — restating the body " +
        "here would duplicate reviewed text from 20261013000001 and invite drift."
    );
  }
  for (const forbidden of ["stable", "immutable"]) {
    if (tokens.includes(forbidden)) {
      problems.push(
        `K: the volatility migration mentions \`${forbidden}\` in executable SQL — the deployed ` +
          "peek must be VOLATILE for the limiter to be able to record a POST"
      );
    }
  }
  if (tokens.includes("redeem_guardian_request")) {
    problems.push(
      "K: the volatility migration touches redeem_guardian_request. Redeem is already VOLATILE " +
        "(no volatility clause in 20261013000001, and VOLATILE is the default) and is correct as-is."
    );
  }
  // Nothing may change the surface 20261013000001 was reviewed as.
  for (const forbidden of ["owner", "security", "search_path", "grant", "revoke", "drop", "returns"]) {
    if (tokens.includes(forbidden)) {
      problems.push(
        `K: the volatility migration contains \`${forbidden}\`. It may change exactly one attribute ` +
          "— volatility — and must not touch the body, owner, grants, search_path, or signature."
      );
    }
  }
}

/** J — the arming migration, complete and alone. */
function validateArmMigration(sql, problems) {
  let statements;
  try {
    statements = splitStatements(sqlTokens(sql));
  } catch (error) {
    problems.push(`J: the arming migration could not be tokenized: ${error.message}`);
    return;
  }

  const actual = statements.map((st) => st.join(" "));
  if (actual.length !== APPROVED_ARM_STATEMENTS.length) {
    problems.push(
      `J: the arming migration has ${actual.length} statements; exactly ${APPROVED_ARM_STATEMENTS.length} are ` +
        "approved. This file sets a PROJECT-WIDE PostgREST hook; anything else sharing it would be armed " +
        "by the same irreversible-feeling step and could not be reverted independently."
    );
  }
  for (let i = 0; i < Math.max(actual.length, APPROVED_ARM_STATEMENTS.length); i += 1) {
    if (actual[i] !== APPROVED_ARM_STATEMENTS[i]) {
      problems.push(
        `J: arming statement ${i + 1} is not the approved statement.\n` +
          `      expected: ${APPROVED_ARM_STATEMENTS[i] ?? "(none)"}\n` +
          `      actual:   ${actual[i] ?? "(none)"}`
      );
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ════════════════════════════════════════════════════════════════════════════

function read(bytesByPath, path) {
  if (bytesByPath && Object.prototype.hasOwnProperty.call(bytesByPath, path)) {
    const value = bytesByPath[path];
    return value === null || value === undefined ? null : value.toString("utf8");
  }
  return readFileSync(path, "utf8");
}

/** Layer 1 + Layer 2 over both migrations. Returns a list of problems. */
export function validateGuardianRateLimitContract(bytesByPath = null) {
  const problems = [];

  const infrastructureSql = read(bytesByPath, RATE_LIMIT_MIGRATION);
  if (infrastructureSql === null) {
    problems.push(`the infrastructure migration was not provided to the contract check (${RATE_LIMIT_MIGRATION})`);
  } else {
    let statements;
    let allTokens;
    try {
      allTokens = sqlTokens(infrastructureSql);
      statements = splitStatements(allTokens);
    } catch (error) {
      problems.push(`the infrastructure migration could not be tokenized: ${error.message}`);
      statements = null;
    }

    if (statements) {
      // ── Layer 1
      const actual = statements.map((st) => maskCommentLiterals(st, descriptor(st)).join(" "));
      if (actual.length !== APPROVED_STATEMENTS.length) {
        problems.push(
          `Layer 1: the migration has ${actual.length} top-level statements; exactly ` +
            `${APPROVED_STATEMENTS.length} are approved. An added statement is the mutation class that ` +
            "defeated two earlier generations of this project's SQL checkers."
        );
      }
      for (let i = 0; i < Math.max(actual.length, APPROVED_STATEMENTS.length); i += 1) {
        if (actual[i] !== APPROVED_STATEMENTS[i]) {
          problems.push(
            `Layer 1: statement ${i + 1} is not its approved form.\n` +
              `      expected: ${APPROVED_STATEMENTS[i] ?? "(no statement approved at this position)"}\n` +
              `      actual:   ${actual[i] ?? "(statement missing)"}`
          );
        }
      }

      // ── Layer 1b
      validateApprovedBodies(statements, problems);

      // ── Layer 2
      const dispatcher = functionBody(statements, "public . data_api_pre_request");
      const enforce = functionBody(statements, "private . guardian_rate_limit_enforce");
      const bucketKey = functionBody(statements, "private . guardian_rate_limit_bucket_key");
      const requestIp = functionBody(statements, "private . guardian_request_ip");
      const prune = functionBody(statements, "private . prune_guardian_rate_limits");

      validateScope(dispatcher, problems);
      validateMethodGate(dispatcher, problems);
      validatePolicyValues(enforce, prune, allTokens, problems);
      validateFailClosedOrdering(enforce, problems);
      validateIpModel(bucketKey, requestIp, problems);
      validateNonStorage(statements, allTokens, problems);
      validateAclModel(statements, allTokens, problems);
      validateHardening(statements, allTokens, problems);
      validatePruneSafety(enforce, prune, allTokens, problems);
    }
  }

  const volatilitySql = read(bytesByPath, VOLATILITY_MIGRATION);
  if (volatilitySql === null) {
    problems.push(
      `the peek-volatility migration was not provided to the contract check (${VOLATILITY_MIGRATION}). ` +
        "Arming the hook without it breaks every POST peek with 25006."
    );
  } else {
    validateVolatilityMigration(volatilitySql, problems);
  }

  const armSql = read(bytesByPath, ARM_MIGRATION);
  if (armSql === null) {
    problems.push(`the arming migration was not provided to the contract check (${ARM_MIGRATION})`);
  } else {
    validateArmMigration(armSql, problems);
  }

  return problems;
}
