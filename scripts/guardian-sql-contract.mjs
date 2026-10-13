/**
 * Structural contract for the Guardian-First Participation Phase 2 migration
 * (guardian bearer peek/redeem).
 *
 * ── WHY THIS IS AN ALLOWLIST, NOT A BLACKLIST ───────────────────────────────
 *
 * Two earlier versions of this file were keyword/substring checkers, and an
 * independent review broke both. The second review demonstrated five mutations
 * that produced ZERO problems from the previous version:
 *
 *   1. `drop index public.athlete_participation_token_hash_unique;` appended
 *   2. `where ap.token_hash = v_hash or true` (OR-widened lookup)
 *   3. request Terms/Privacy sourced from the ADULT columns
 *      (`ap.terms_version`) instead of the request-pinned ones
 *   4. a `delete from public.participation_events ...` appended after the
 *      evidence INSERT
 *   5. the post-lock expiry check moved BEFORE the locking SELECT
 *
 * Every one of those is an ADDITION or a SUBSTITUTION. A checker built from
 * "these required strings are present" and "these known-bad strings are
 * absent" cannot see them: nothing required went missing, and the additions
 * were not on any blacklist. The lesson is the same one scripts/sql-contract.mjs
 * records after three failed guards — a checker that reasons about a subset of
 * the SQL can always be out-reasoned by SQL outside that subset.
 *
 * So this file inverts the model, the way scripts/phase1b-policy-contract.mjs
 * does for policies: it enumerates the COMPLETE approved executable shape of
 * the migration, and anything that is not exactly that fails. There is no
 * "unrecognized but tolerated" path. Concretely:
 *
 *   LAYER 1 — exhaustive statement allowlist (fails closed).
 *     The migration is tokenized (comments stripped, string literals opaque
 *     but exact, unknown characters throw) and split into top-level
 *     statements. The result must be EXACTLY the 9 approved statements, in
 *     order, each token-for-token identical to its approved form — function
 *     bodies included. An appended DROP/DELETE/UPDATE/INSERT/GRANT/REVOKE/
 *     ALTER/CREATE, a reordered body, an OR-widened predicate, or a swapped
 *     source column all fail here by construction, because none of them is
 *     the approved token sequence.
 *
 *   LAYER 2 — named property assertions (explains WHAT broke).
 *     Layer 1 alone would report "statement 5 does not match" for every
 *     mutation, which is true but useless to a reviewer. Layer 2 re-derives
 *     the security-relevant properties from the token stream — index shape,
 *     token-hash provenance, request-version provenance, lock/expiry
 *     ordering, evidence persistence, grant model — so a failure names the
 *     property that was violated. It is also the layer that keeps Layer 1
 *     honest: if someone updates an approved template carelessly, Layer 2
 *     still objects.
 *
 * What this is NOT: a PostgreSQL parser, and not proof of runtime behaviour.
 * Real row-lock concurrency, effective deployed ACLs, and RLS enforcement are
 * provable only by live acceptance against a real database.
 */
import { readFileSync } from "node:fs";

export const GUARDIAN_MIGRATION =
  "supabase/migrations/20261013000001_guardian_bearer_peek_redeem.sql";

export const EXPECTED_FUNCTIONS = {
  peek_guardian_request: { args: "text", executeTo: ["anon"] },
  redeem_guardian_request: { args: "text, text", executeTo: ["anon"] },
};

/** The canonical token-contract regex, shared by both functions. */
const CANONICAL_TOKEN_REGEX = "'^[A-Za-z0-9_-]{42}[048AEIMQUYcgkosw]$'";

// ════════════════════════════════════════════════════════════════════════════
// TOKENIZER
// ════════════════════════════════════════════════════════════════════════════

/**
 * The characters PostgreSQL treats as ending a `--` line comment.
 *
 * BOTH carriage return and line feed, which is the whole point of defining it
 * once here. PostgreSQL's own scanner ends a line comment at `[\n\r]` (its
 * `non_newline` character class excludes both), so `--\rgrant …` is a comment
 * followed by a LIVE GRANT. A previous version of this lexer searched only
 * for `\n`, so a CR-terminated comment swallowed the rest of the logical line
 * — and `realSql + "\n--\rgrant execute on function … to authenticated;"`
 * produced a token stream byte-identical to baseline, with zero problems
 * reported, while a real `grant … to authenticated` sat in the file.
 *
 * Centralised deliberately: the lexer has exactly one notion of "end of
 * line", so CR, LF and CRLF cannot drift apart between call sites.
 */
const LINE_TERMINATOR = /[\n\r]/;

/**
 * Index of the first line terminator at or after `from`, or `sql.length` when
 * the comment runs to EOF (a comment with no trailing newline is still a
 * comment, and consumes the rest of the input).
 *
 * Returns the index OF the terminator, not past it, so the caller's
 * whitespace handling consumes it — which makes CRLF a single whitespace run
 * rather than two separately-handled characters.
 */
function endOfLineComment(sql, from) {
  const match = LINE_TERMINATOR.exec(sql.slice(from));
  return match ? from + match.index : sql.length;
}

/** `$$` or `$tag$` — a dollar-quote delimiter. */
const DOLLAR_DELIMITER = /^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/;

/** Whether an emitted token is a dollar-quote delimiter. */
export function isDollarDelimiter(token) {
  return typeof token === "string" && new RegExp(`${DOLLAR_DELIMITER.source}$`).test(token);
}

/**
 * Tokenizes SQL into the reviewed syntax only, and THROWS on anything it does
 * not recognize. Throwing is the fail-closed behaviour: an unparseable
 * construct is reported as a contract problem rather than silently skipped,
 * so novel syntax cannot slip past by being unrecognized.
 *
 * ── LEXICAL PRECEDENCE: DOLLAR BOUNDARIES COME FROM THE RAW STREAM ─────────
 *
 * This is the fix for a real bypass. A previous version applied comment rules
 * *while inside* a dollar-quoted body, so a line that merely LOOKED like a
 * comment could swallow the body's real closing delimiter:
 *
 *   -- $$; grant execute on function public.peek_guardian_request(text)
 *          to authenticated; do $$ begin end; --
 *
 * placed immediately before redeem's closing `$$`. PostgreSQL does not read
 * that as a comment at all: inside `$$ … $$` the content is a STRING, and the
 * ONLY thing that can end it is the matching delimiter — so the `$$` on that
 * line terminates the function body, and everything after it is top-level
 * SQL that really executes. The old lexer instead saw `--`, skipped to the
 * end of the line (consuming the real `$$`), and produced a token stream
 * byte-identical to baseline: zero problems reported, a `grant … to
 * authenticated` smuggled in.
 *
 * So boundaries are now resolved FIRST, from the raw character stream, with
 * no preprocessing:
 *
 *   NORMAL state      — PostgreSQL's own precedence: `--` and `/* *\/` are
 *                       comments, `'…'` strings and `"…"` identifiers are
 *                       scanned, and a dollar delimiter OPENS a body.
 *   DOLLAR body       — located by scanning the raw stream for the matching
 *                       tag and nothing else. Comment markers, semicolons and
 *                       other dollar-like text inside it cannot move or hide
 *                       that boundary, exactly as in PostgreSQL.
 *
 * The extracted body is then lexed recursively in NORMAL state, because a
 * plpgsql body genuinely IS source code — comments inside it are real
 * comments to plpgsql, and keeping them stripped is what lets the contract
 * inspect the body's executable shape. The delimiters are emitted as their
 * own tokens, so `splitStatements` can tell body content from top-level SQL.
 *
 * Other rules:
 * - String literals are single tokens, kept EXACT (including quotes and case):
 *   `'minor'`, `'pending'`, `'approve'` and the canonical token regex are all
 *   security-relevant values, so case-folding them would lose meaning.
 * - Identifiers and keywords are lowercased (SQL is case-insensitive there).
 * - `$` is deliberately NOT a word character here. PostgreSQL permits it in
 *   identifiers, but allowing it would let a word absorb the leading `$` of a
 *   delimiter (`as$$`), which is precisely the sort of boundary ambiguity this
 *   lexer exists to remove.
 */
export function sqlTokens(sql) {
  const tokens = [];
  let i = 0;

  while (i < sql.length) {
    const rest = sql.slice(i);

    const whitespace = rest.match(/^\s+/);
    if (whitespace) {
      i += whitespace[0].length;
      continue;
    }

    // NORMAL-state comment handling. This ordering mirrors PostgreSQL: at top
    // level a comment start really does win over a dollar delimiter, so
    // `-- $$ …` outside any body is inert. Inside a body these branches are
    // never reached — the body is consumed whole by the dollar branch below
    // and re-lexed separately.
    if (rest.startsWith("--")) {
      // Ends at the EARLIEST line terminator — CR or LF, not LF alone. See
      // `endOfLineComment`: a CR-only terminator was a real bypass.
      //
      // Resumes AT the terminator rather than past it, so the whitespace
      // branch above consumes it. That is what makes CR, LF and CRLF behave
      // identically with no special case: `\r\n` is consumed as one
      // whitespace run, so the SQL after it is lexed exactly once.
      i = endOfLineComment(sql, i);
      continue;
    }

    if (rest.startsWith("/*")) {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql.startsWith("/*", i)) {
          depth += 1;
          i += 2;
        } else if (sql.startsWith("*/", i)) {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      if (depth > 0) throw new Error("unterminated block comment");
      continue;
    }

    // A dollar quote opens a body whose end is found by a RAW scan for the
    // matching tag — never by anything comment-aware. Both `$$` and `$tag$`
    // go through the same path, so a tagged body is just as inspectable, and
    // a `$$` appearing inside a `$tag$` body is inert (and vice versa),
    // matching PostgreSQL's rule that only the matching tag closes a body.
    const opener = rest.match(DOLLAR_DELIMITER);
    if (opener) {
      const tag = opener[0];
      const bodyStart = i + tag.length;
      const bodyEnd = sql.indexOf(tag, bodyStart);
      if (bodyEnd === -1) throw new Error(`unterminated dollar-quoted string (${tag})`);
      tokens.push(tag);
      tokens.push(...sqlTokens(sql.slice(bodyStart, bodyEnd)));
      tokens.push(tag);
      i = bodyEnd + tag.length;
      continue;
    }

    if (sql[i] === "'") {
      const start = i;
      i += 1;
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        i += 1;
      }
      if (!closed) throw new Error("unterminated string literal");
      tokens.push(sql.slice(start, i));
      continue;
    }

    if (sql[i] === '"') {
      const start = i;
      i += 1;
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        i += 1;
      }
      if (!closed) throw new Error("unterminated quoted identifier");
      tokens.push(sql.slice(start, i));
      continue;
    }

    const operator = rest.match(/^(:=|!~~|!~|~~|>=|<=|<>|!=|\|\||::|[().,;=<>+\-*/%])/);
    if (operator) {
      tokens.push(operator[0]);
      i += operator[0].length;
      continue;
    }

    // No `$` in the word charset — see the docblock's last bullet.
    const word = rest.match(/^[A-Za-z_][A-Za-z_0-9]*/);
    if (word) {
      tokens.push(word[0].toLowerCase());
      i += word[0].length;
      continue;
    }

    const number = rest.match(/^\d+(\.\d+)?/);
    if (number) {
      tokens.push(number[0]);
      i += number[0].length;
      continue;
    }

    throw new Error(
      `unsupported SQL token at offset ${i}: ${JSON.stringify(rest.slice(0, 24))}`
    );
  }

  return tokens;
}

/**
 * Splits a token stream into top-level statements on `;`, never splitting on a
 * `;` that falls inside a dollar-quoted body — exactly as PostgreSQL would.
 *
 * Body nesting is tracked with a STACK keyed on the delimiter tag, not a
 * boolean: `sqlTokens` emits matched opener/closer tokens for both `$$` and
 * `$tag$`, so a `$$` sitting inside a `$x$` body (or vice versa) cannot be
 * mistaken for the end of the enclosing body. A boolean toggle would flip on
 * the inner delimiter and start treating body content as top-level SQL —
 * which is the same class of boundary confusion the lexer's own docblock
 * describes.
 */
export function splitStatements(tokens) {
  const statements = [];
  const openBodies = [];
  let current = [];

  for (const token of tokens) {
    if (isDollarDelimiter(token)) {
      if (openBodies[openBodies.length - 1] === token) openBodies.pop();
      else openBodies.push(token);
      current.push(token);
      continue;
    }
    if (token === ";" && openBodies.length === 0) {
      if (current.length) statements.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }

  if (openBodies.length > 0) throw new Error("unterminated dollar-quoted body");
  if (current.length) statements.push(current);
  return statements;
}

// ════════════════════════════════════════════════════════════════════════════
// LAYER 1 — THE COMPLETE APPROVED EXECUTABLE SHAPE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Every executable statement this migration may contain, in order.
 *
 * `sql` is the approved form; the migration's corresponding statement must
 * tokenize to an IDENTICAL sequence. This duplicates the migration's
 * executable SQL inside the checker on purpose — the same trade
 * phase1b-policy-contract.mjs makes with `approvedStatement()`. The duplication
 * IS the contract: the reviewed shape lives here, and the migration has to
 * match it. Comments and whitespace are not duplicated and are free to change
 * (scripts/sql-contract.mjs's byte pin is what covers those).
 *
 * `kind: "comment"` statements compare exactly up to `is`, after which any
 * non-empty run of string literals is accepted — COMMENT prose is inert, and
 * pinning it here would make every wording fix a contract failure for no
 * security gain.
 */
export const EXPECTED_STATEMENTS = [
  {
    label: "partial unique index on token_hash",
    kind: "exact",
    sql: `create unique index athlete_participation_token_hash_unique
            on public.athlete_participation (token_hash)
            where token_hash is not null`,
  },
  {
    label: "create peek_guardian_request",
    kind: "exact",
    sql: `create or replace function public.peek_guardian_request(p_token text)
          returns table (
            requested_at timestamptz,
            expires_at timestamptz,
            guardian_copy_version text,
            request_terms_version text,
            request_privacy_version text
          )
          language plpgsql
          security definer
          stable
          set search_path = ''
          as $$
          declare
            v_hash bytea;
          begin
            if p_token is null or length(p_token) <> 43
               or p_token !~ ${CANONICAL_TOKEN_REGEX} then
              return;
            end if;

            v_hash := pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8'));

            return query
            select
              ap.requested_at,
              ap.expires_at,
              ap.guardian_copy_version,
              ap.request_terms_version,
              ap.request_privacy_version
            from public.athlete_participation ap
            inner join auth.users u on u.id = ap.owner_user_id
            where ap.token_hash = v_hash
              and ap.bracket = 'minor'
              and ap.status = 'pending'
              and ap.request_generation >= 1
              and ap.expires_at is not null
              and ap.expires_at >= now()
            limit 1;
          end;
          $$`,
  },
  {
    label: "revoke peek_guardian_request from public, authenticated",
    kind: "exact",
    sql: "revoke all on function public.peek_guardian_request(text) from public, authenticated",
  },
  {
    label: "grant peek_guardian_request to anon",
    kind: "exact",
    sql: "grant execute on function public.peek_guardian_request(text) to anon",
  },
  {
    label: "comment on peek_guardian_request",
    kind: "comment",
    sql: "comment on function public.peek_guardian_request(text) is",
  },
  {
    label: "create redeem_guardian_request",
    kind: "exact",
    sql: `create or replace function public.redeem_guardian_request(p_token text, p_decision text)
          returns text
          language plpgsql
          security definer
          set search_path = ''
          as $$
          declare
            v_hash bytea;
            v_owner uuid;
            v_generation integer;
            v_guardian_copy_version text;
            v_request_terms_version text;
            v_request_privacy_version text;
            v_expires_at timestamptz;
            v_new_status text;
            v_event_type text;
            v_updated uuid;
          begin
            if p_decision is null or p_decision not in ('approve', 'decline') then
              return 'unavailable';
            end if;

            if p_token is null or length(p_token) <> 43
               or p_token !~ ${CANONICAL_TOKEN_REGEX} then
              return 'unavailable';
            end if;

            v_hash := pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8'));

            select
              ap.owner_user_id, ap.request_generation, ap.guardian_copy_version,
              ap.request_terms_version, ap.request_privacy_version, ap.expires_at
            into
              v_owner, v_generation, v_guardian_copy_version,
              v_request_terms_version, v_request_privacy_version, v_expires_at
            from public.athlete_participation ap
            inner join auth.users u on u.id = ap.owner_user_id
            where ap.token_hash = v_hash
              and ap.bracket = 'minor'
              and ap.status = 'pending'
            for update of ap;

            if not found then
              return 'unavailable';
            end if;

            if v_expires_at is null or v_expires_at < clock_timestamp() then
              return 'unavailable';
            end if;

            v_new_status := case p_decision when 'approve' then 'approved' else 'declined' end;
            v_event_type := case p_decision when 'approve' then 'guardian_approved' else 'guardian_declined' end;

            update public.athlete_participation
            set status = v_new_status,
                token_hash = null,
                decided_at = now(),
                updated_at = now()
            where owner_user_id = v_owner
              and token_hash = v_hash
              and status = 'pending'
            returning owner_user_id into v_updated;

            if v_updated is null then
              return 'unavailable';
            end if;

            insert into public.participation_events (
              owner_user_id, event_type, actor, actor_basis,
              request_generation, guardian_copy_version,
              terms_version, privacy_version, attestation_version
            ) values (
              v_owner, v_event_type, 'guardian_token', 'guardian_token_possession',
              v_generation, v_guardian_copy_version,
              v_request_terms_version, v_request_privacy_version, null
            );

            return v_new_status;
          end;
          $$`,
  },
  {
    label: "revoke redeem_guardian_request from public, authenticated",
    kind: "exact",
    sql: "revoke all on function public.redeem_guardian_request(text, text) from public, authenticated",
  },
  {
    label: "grant redeem_guardian_request to anon",
    kind: "exact",
    sql: "grant execute on function public.redeem_guardian_request(text, text) to anon",
  },
  {
    label: "comment on redeem_guardian_request",
    kind: "comment",
    sql: "comment on function public.redeem_guardian_request(text, text) is",
  },
];

const isStringLiteral = (token) => typeof token === "string" && token.startsWith("'");

/** Exhaustive, ordered statement comparison. This is the fail-closed layer. */
function validateStatementShape(statements, problems) {
  if (statements.length !== EXPECTED_STATEMENTS.length) {
    problems.push(
      `guardian: migration has ${statements.length} executable statement(s), expected exactly ` +
        `${EXPECTED_STATEMENTS.length}. Any added executable SQL — DROP, ALTER, DELETE, UPDATE, ` +
        `INSERT, GRANT, REVOKE, CREATE or otherwise — is rejected here by construction.`
    );
  }

  const count = Math.max(statements.length, EXPECTED_STATEMENTS.length);
  for (let index = 0; index < count; index += 1) {
    const expected = EXPECTED_STATEMENTS[index];
    const actual = statements[index];

    if (!expected) {
      problems.push(
        `guardian: unexpected extra executable statement at position ${index}: ` +
          `"${(actual ?? []).slice(0, 12).join(" ")}…"`
      );
      continue;
    }
    if (!actual) {
      problems.push(`guardian: missing expected statement at position ${index}: ${expected.label}`);
      continue;
    }

    const expectedTokens = sqlTokens(expected.sql);

    if (expected.kind === "comment") {
      const head = actual.slice(0, expectedTokens.length);
      if (JSON.stringify(head) !== JSON.stringify(expectedTokens)) {
        problems.push(
          `guardian: statement ${index} (${expected.label}) does not match its approved form`
        );
        continue;
      }
      const prose = actual.slice(expectedTokens.length);
      if (prose.length === 0 || !prose.every(isStringLiteral)) {
        problems.push(
          `guardian: statement ${index} (${expected.label}) must be followed only by string ` +
            `literal prose — found ${JSON.stringify(prose.filter((t) => !isStringLiteral(t)))}`
        );
      }
      continue;
    }

    if (JSON.stringify(actual) !== JSON.stringify(expectedTokens)) {
      problems.push(
        `guardian: statement ${index} (${expected.label}) does not match its approved token ` +
          `sequence — ${describeTokenDivergence(expectedTokens, actual)}`
      );
    }
  }
}

/** Names the first point of divergence, so a failure is actionable. */
function describeTokenDivergence(expected, actual) {
  const limit = Math.max(expected.length, actual.length);
  for (let i = 0; i < limit; i += 1) {
    if (expected[i] !== actual[i]) {
      const context = actual.slice(Math.max(0, i - 6), i).join(" ");
      return (
        `first difference at token ${i} (after "…${context}"): expected ` +
        `${JSON.stringify(expected[i] ?? "<end of statement>")}, found ` +
        `${JSON.stringify(actual[i] ?? "<end of statement>")}`
      );
    }
  }
  return "token sequences differ in length only";
}

// ════════════════════════════════════════════════════════════════════════════
// TOKEN-STREAM HELPERS (for Layer 2)
// ════════════════════════════════════════════════════════════════════════════

function findSeq(tokens, needleSql, from = 0) {
  const needle = Array.isArray(needleSql) ? needleSql : sqlTokens(needleSql);
  outer: for (let i = from; i <= tokens.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (tokens[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function countSeq(tokens, needleSql) {
  const needle = sqlTokens(needleSql);
  let count = 0;
  let from = 0;
  for (;;) {
    const at = findSeq(tokens, needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + 1;
  }
}

/** Tokens strictly between the first `startSql` after `from` and the next `endSql`. */
function between(tokens, startSql, endSql, from = 0) {
  const start = findSeq(tokens, startSql, from);
  if (start === -1) return null;
  const startTokens = sqlTokens(startSql);
  const afterStart = start + startTokens.length;
  const end = findSeq(tokens, endSql, afterStart);
  if (end === -1) return null;
  return tokens.slice(afterStart, end);
}

/** Splits a token run on top-level commas (ignoring commas inside parens). */
function splitTopLevelCommas(tokens) {
  const parts = [];
  let current = [];
  let depth = 0;
  for (const token of tokens) {
    if (token === "(") depth += 1;
    if (token === ")") depth -= 1;
    if (token === "," && depth === 0) {
      parts.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  if (current.length) parts.push(current);
  return parts.map((part) => part.join(" "));
}

/**
 * The token run between a function's body delimiters.
 *
 * Located by DELIMITER TOKEN rather than by searching for a literal `$$`, so
 * a body re-quoted with a tag is still found and still inspected (it will
 * then fail the statement allowlist on the delimiter tokens themselves,
 * rather than silently reporting "body could not be located").
 */
function functionBody(statements, name) {
  const statement = statements.find(
    (tokens) =>
      findSeq(tokens, `create or replace function public.${name}`) === 0 ||
      findSeq(tokens, `create function public.${name}`) === 0
  );
  if (!statement) return null;

  const first = statement.findIndex(isDollarDelimiter);
  if (first === -1) return null;
  const tag = statement[first];
  const last = statement.lastIndexOf(tag);
  if (last === first) return null;
  return statement.slice(first + 1, last);
}

// ════════════════════════════════════════════════════════════════════════════
// LAYER 2 — NAMED PROPERTY ASSERTIONS
// ════════════════════════════════════════════════════════════════════════════

/** B — the partial unique index on token_hash. */
function validateIndexContract(statements, problems) {
  const indexStatements = statements.filter(
    (tokens) => findSeq(tokens, "create") === 0 && tokens.includes("index")
  );

  if (indexStatements.length !== 1) {
    problems.push(
      `guardian: expected exactly 1 CREATE INDEX statement, found ${indexStatements.length}`
    );
    return;
  }

  const tokens = indexStatements[0];
  if (findSeq(tokens, "create unique index") !== 0) {
    problems.push(
      "guardian: the token_hash index is not UNIQUE — a non-unique index cannot make " +
        "\"at most one current request per token\" a database fact"
    );
  }
  if (findSeq(tokens, "athlete_participation_token_hash_unique") === -1) {
    problems.push("guardian: the token_hash index is not named athlete_participation_token_hash_unique");
  }
  if (findSeq(tokens, "on public.athlete_participation ( token_hash )") === -1) {
    problems.push(
      "guardian: the unique index is not on public.athlete_participation(token_hash)"
    );
  }
  if (findSeq(tokens, "where token_hash is not null") === -1) {
    problems.push(
      "guardian: the unique index has lost its `where token_hash is not null` predicate — " +
        "without it the index also constrains decided/adult rows, whose token_hash is always NULL"
    );
  }
}

/** C — token-hash provenance and lookup predicates. */
function validateTokenProvenance(name, body, problems, { lookupEnd }) {
  const approvedHash =
    "v_hash := pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8'))";

  if (findSeq(body, approvedHash) === -1) {
    problems.push(
      `guardian: ${name} does not compute v_hash as sha256(convert_to(p_token, 'UTF8')) — ` +
        `the hash input is not provably bound to the caller-supplied token`
    );
  }
  if (countSeq(body, "v_hash :=") !== 1) {
    problems.push(
      `guardian: ${name} assigns v_hash ${countSeq(body, "v_hash :=")} time(s) — exactly one ` +
        `assignment, from p_token, is permitted`
    );
  }
  if (countSeq(body, "sha256") !== 1 || countSeq(body, "convert_to") !== 1) {
    problems.push(`guardian: ${name} must contain exactly one sha256/convert_to pair`);
  }
  if (countSeq(body, "p_token") !== 4) {
    // null check, length check, regex check, convert_to argument.
    problems.push(
      `guardian: ${name} references p_token ${countSeq(body, "p_token")} time(s), expected 4 ` +
        `(null guard, length guard, canonical regex guard, hash input)`
    );
  }

  // The lookup predicate must be EXACTLY the approved conjunction: no OR, no
  // extra disjunct, no substituted variable, no boolean literal.
  const approvedLookup =
    name === "peek_guardian_request"
      ? "ap.token_hash = v_hash and ap.bracket = 'minor' and ap.status = 'pending' " +
        "and ap.request_generation >= 1 and ap.expires_at is not null and ap.expires_at >= now()"
      : "ap.token_hash = v_hash and ap.bracket = 'minor' and ap.status = 'pending'";

  const actualLookup = between(body, "where", lookupEnd);
  if (actualLookup === null) {
    problems.push(`guardian: ${name}'s token lookup WHERE clause could not be located`);
    return;
  }
  if (JSON.stringify(actualLookup) !== JSON.stringify(sqlTokens(approvedLookup))) {
    problems.push(
      `guardian: ${name}'s token lookup predicate is not the approved conjunction — found ` +
        `"${actualLookup.join(" ")}". An OR-widened, constant, or substituted predicate is ` +
        `rejected here; the lookup must bind ap.token_hash = v_hash and nothing looser.`
    );
  }
  if (actualLookup.includes("or") || actualLookup.includes("true") || actualLookup.includes("false")) {
    problems.push(
      `guardian: ${name}'s token lookup predicate contains OR / a boolean literal — this is the ` +
        `exact shape of an "or true" widening`
    );
  }
}

/**
 * D — request-version provenance.
 *
 * The locking SELECT's column list and its INTO variable list are aligned
 * POSITIONALLY and checked pair by pair, so sourcing a request version from
 * the adult-acceptance columns (`ap.terms_version`) rather than the
 * request-pinned ones (`ap.request_terms_version`) is caught by name — the
 * mutation that defeated the previous checker entirely.
 */
const APPROVED_SELECT_INTO = [
  ["ap.owner_user_id", "v_owner"],
  ["ap.request_generation", "v_generation"],
  ["ap.guardian_copy_version", "v_guardian_copy_version"],
  ["ap.request_terms_version", "v_request_terms_version"],
  ["ap.request_privacy_version", "v_request_privacy_version"],
  ["ap.expires_at", "v_expires_at"],
];

function validateVersionProvenance(body, problems) {
  const selectList = between(body, "select", "into");
  const intoList = between(body, "into", "from public.athlete_participation");

  if (selectList === null || intoList === null) {
    problems.push("guardian: redeem_guardian_request's SELECT … INTO could not be located");
    return;
  }

  const columns = splitTopLevelCommas(selectList);
  const variables = splitTopLevelCommas(intoList);

  if (columns.length !== APPROVED_SELECT_INTO.length || variables.length !== APPROVED_SELECT_INTO.length) {
    problems.push(
      `guardian: redeem_guardian_request's SELECT … INTO reads ${columns.length} column(s) into ` +
        `${variables.length} variable(s), expected ${APPROVED_SELECT_INTO.length} of each`
    );
    return;
  }

  for (let i = 0; i < APPROVED_SELECT_INTO.length; i += 1) {
    const [expectedColumn, expectedVariable] = APPROVED_SELECT_INTO[i];
    const actualColumn = columns[i].replace(/\s*\.\s*/g, ".");
    const actualVariable = variables[i];
    if (actualColumn !== expectedColumn || actualVariable !== expectedVariable) {
      problems.push(
        `guardian: redeem_guardian_request reads "${actualColumn}" into "${actualVariable}" at ` +
          `position ${i}, expected "${expectedColumn}" into "${expectedVariable}". The guardian ` +
          `request's PINNED versions (request_terms_version / request_privacy_version / ` +
          `guardian_copy_version) are the only legitimate source — the adult-acceptance columns ` +
          `(terms_version / privacy_version) are NULL for every minor row and must never be ` +
          `substituted here.`
      );
    }
  }
}

/** D (second half) + F — the evidence INSERT's exact column→value mapping. */
const APPROVED_EVIDENCE_MAPPING = [
  ["owner_user_id", "v_owner"],
  ["event_type", "v_event_type"],
  ["actor", "'guardian_token'"],
  ["actor_basis", "'guardian_token_possession'"],
  ["request_generation", "v_generation"],
  ["guardian_copy_version", "v_guardian_copy_version"],
  ["terms_version", "v_request_terms_version"],
  ["privacy_version", "v_request_privacy_version"],
  ["attestation_version", "null"],
];

function validateEvidenceInsert(body, problems) {
  const insertCount = countSeq(body, "insert into public.participation_events");
  if (insertCount !== 1) {
    problems.push(
      `guardian: redeem_guardian_request inserts evidence ${insertCount} time(s), expected exactly 1`
    );
    if (insertCount === 0) return;
  }

  const columnList = between(body, "insert into public.participation_events (", ")");
  const valuesList = between(body, "values (", ")");

  if (columnList === null || valuesList === null) {
    problems.push("guardian: the evidence INSERT's column/VALUES lists could not be located");
    return;
  }

  const columns = splitTopLevelCommas(columnList);
  const values = splitTopLevelCommas(valuesList);

  if (
    columns.length !== APPROVED_EVIDENCE_MAPPING.length ||
    values.length !== APPROVED_EVIDENCE_MAPPING.length
  ) {
    problems.push(
      `guardian: the evidence INSERT writes ${columns.length} column(s) with ${values.length} ` +
        `value(s), expected ${APPROVED_EVIDENCE_MAPPING.length} of each`
    );
    return;
  }

  for (let i = 0; i < APPROVED_EVIDENCE_MAPPING.length; i += 1) {
    const [expectedColumn, expectedValue] = APPROVED_EVIDENCE_MAPPING[i];
    if (columns[i] !== expectedColumn || values[i] !== expectedValue) {
      problems.push(
        `guardian: the evidence INSERT writes "${values[i]}" into "${columns[i]}" at position ` +
          `${i}, expected "${expectedValue}" into "${expectedColumn}". A NULL, a constant, or a ` +
          `substituted variable here silently destroys the evidence this decision rests on.`
      );
    }
  }
}

/**
 * E — control-flow ordering inside redeem.
 *
 * Asserted by token position, so moving the post-lock expiry re-check ABOVE
 * the locking SELECT (the mutation that defeated the previous checker) fails:
 * the expiry landmark would precede the `for update` landmark.
 */
function validateRedeemOrdering(body, problems) {
  const landmarks = [
    ["decision allowlist", "p_decision not in ( 'approve' , 'decline' )"],
    ["canonical token validation", `p_token !~ ${CANONICAL_TOKEN_REGEX}`],
    ["token hashing", "v_hash := pg_catalog.sha256"],
    ["token-bound row selection", "where ap.token_hash = v_hash"],
    ["row lock", "for update of ap"],
    ["post-lock fresh-time expiry re-check", "v_expires_at < clock_timestamp ( )"],
    ["terminal state mutation", "update public.athlete_participation"],
    ["token-hash clearing", "token_hash = null"],
    ["evidence insertion", "insert into public.participation_events"],
  ];

  const positions = landmarks.map(([label, needle]) => [label, findSeq(body, needle)]);

  for (const [label, at] of positions) {
    if (at === -1) {
      problems.push(`guardian: redeem_guardian_request is missing its ${label} step entirely`);
    }
  }
  if (positions.some(([, at]) => at === -1)) return;

  for (let i = 1; i < positions.length; i += 1) {
    const [previousLabel, previousAt] = positions[i - 1];
    const [label, at] = positions[i];
    if (at <= previousAt) {
      problems.push(
        `guardian: redeem_guardian_request's "${label}" step occurs BEFORE its "${previousLabel}" ` +
          `step. The approved order is: validate → hash → token-bound select → FOR UPDATE → ` +
          `post-lock clock_timestamp() revalidation → state mutation + token clearing → evidence ` +
          `insert. Authorizing against a time read before the lock wait is exactly the defect ` +
          `this ordering exists to prevent.`
      );
    }
  }

  if (findSeq(body, "v_expires_at < now ( )") !== -1) {
    problems.push(
      "guardian: redeem_guardian_request's expiry check uses now() — that is fixed at " +
        "transaction start and can be stale after a FOR UPDATE lock wait; clock_timestamp() " +
        "is required at the post-lock authorization point"
    );
  }
}

/** F — nothing anywhere may remove or rewrite the evidence this migration writes. */
function validateEvidenceImmutability(allTokens, problems) {
  for (const [label, needle] of [
    ["DELETE", "delete"],
    ["TRUNCATE", "truncate"],
    ["DROP", "drop"],
  ]) {
    if (allTokens.includes(needle)) {
      problems.push(
        `guardian: the migration contains a ${label} statement. Phase 2 adds evidence and an ` +
          `index; it never removes either, and participation_events is append-only by design ` +
          `(20261008000002 grants no UPDATE/DELETE to any role).`
      );
    }
  }
  if (countSeq(allTokens, "update public.participation_events") > 0) {
    problems.push("guardian: the migration updates participation_events — it is append-only");
  }
  if (countSeq(allTokens, "update public.athlete_participation") !== 1) {
    problems.push(
      `guardian: expected exactly 1 UPDATE of athlete_participation (redeem's terminal ` +
        `transition), found ${countSeq(allTokens, "update public.athlete_participation")}`
    );
  }
}

/** G — the grant/revoke model, enumerated exhaustively. */
const EXPECTED_ACL_STATEMENTS = [
  "revoke all on function public.peek_guardian_request(text) from public, authenticated",
  "grant execute on function public.peek_guardian_request(text) to anon",
  "revoke all on function public.redeem_guardian_request(text, text) from public, authenticated",
  "grant execute on function public.redeem_guardian_request(text, text) to anon",
];

function validateAclModel(statements, problems) {
  const aclStatements = statements.filter(
    (tokens) => tokens[0] === "grant" || tokens[0] === "revoke"
  );

  const expected = EXPECTED_ACL_STATEMENTS.map((sql) => JSON.stringify(sqlTokens(sql)));
  const seen = new Map();

  for (const tokens of aclStatements) {
    const key = JSON.stringify(tokens);
    if (!expected.includes(key)) {
      problems.push(
        `guardian: unexpected GRANT/REVOKE statement: "${tokens.join(" ")}". Only the four ` +
          `approved function-level ACL statements may appear — no table grant, no second role, ` +
          `no additional function.`
      );
      continue;
    }
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  for (let i = 0; i < expected.length; i += 1) {
    const count = seen.get(expected[i]) ?? 0;
    if (count === 0) {
      problems.push(`guardian: missing required ACL statement: "${EXPECTED_ACL_STATEMENTS[i]}"`);
    } else if (count > 1) {
      problems.push(
        `guardian: ACL statement appears ${count} times, expected once: "${EXPECTED_ACL_STATEMENTS[i]}"`
      );
    }
  }

  // Belt-and-braces, stated as its own property rather than inferred from the
  // enumeration above: no table-level grant, and the ROLE LIST (not the
  // statement as a whole) is what gets checked. Scoping matters — the schema
  // qualifier in `public.peek_guardian_request` is the token `public`, which a
  // whole-statement scan would misread as a grant to PUBLIC.
  for (const tokens of aclStatements) {
    const text = tokens.join(" ");
    const isGrant = tokens[0] === "grant";
    const separator = isGrant ? "to" : "from";
    const separatorAt = tokens.lastIndexOf(separator);

    if (findSeq(tokens, "on table") !== -1 || findSeq(tokens, "on all tables") !== -1) {
      problems.push(
        `guardian: table-level ${isGrant ? "GRANT" : "REVOKE"} present: "${text}" — Phase 2 adds ` +
          `no direct participation/events table privilege to any role`
      );
    }
    if (separatorAt === -1) {
      problems.push(`guardian: ACL statement has no ${separator.toUpperCase()} role list: "${text}"`);
      continue;
    }

    const roles = splitTopLevelCommas(tokens.slice(separatorAt + 1)).map((role) => role.trim());

    if (isGrant) {
      if (roles.join(",") !== "anon") {
        problems.push(
          `guardian: GRANT role list is [${roles.join(", ")}], expected exactly [anon] — ` +
            `guardian RPCs are anon-only, since the guardian transport never authenticates`
        );
      }
    } else if (roles.join(",") !== "public,authenticated") {
      problems.push(
        `guardian: REVOKE role list is [${roles.join(", ")}], expected exactly ` +
          `[public, authenticated] — revoking PUBLIC alone does not remove an explicit ` +
          `authenticated grant left behind by an earlier CREATE OR REPLACE`
      );
    }
  }
}

/** Function hardening: SECURITY DEFINER + pinned empty search_path + volatility. */
export function validateGuardianFunctionHardening(bytesByPath = null) {
  const sql = readMigration(bytesByPath);
  const problems = [];

  let statements;
  try {
    statements = splitStatements(sqlTokens(sql));
  } catch (error) {
    return [`guardian: migration could not be tokenized: ${error.message}`];
  }

  for (const [name, spec] of Object.entries(EXPECTED_FUNCTIONS)) {
    const statement = statements.find(
      (tokens) => findSeq(tokens, `create or replace function public.${name}`) === 0
    );
    if (!statement) {
      problems.push(`${name}: no "create or replace function public.${name}(" statement found`);
      continue;
    }
    const header = statement.slice(0, statement.indexOf("$$") === -1 ? undefined : statement.indexOf("$$"));
    if (findSeq(header, "security definer") === -1) {
      problems.push(`${name}: missing "security definer"`);
    }
    if (findSeq(header, "set search_path = ''") === -1) {
      problems.push(`${name}: missing "set search_path = ''"`);
    }
    if (findSeq(header, "language plpgsql") === -1) {
      problems.push(`${name}: not declared "language plpgsql"`);
    }
    if (header.includes("volatile")) {
      problems.push(`${name}: explicitly declared VOLATILE`);
    }
    if (name === "peek_guardian_request" && findSeq(header, "stable") === -1) {
      problems.push(`${name}: not declared STABLE — a read-only peek must not be volatile`);
    }
    if (spec.executeTo.join(",") !== "anon") {
      problems.push(`${name}: EXPECTED_FUNCTIONS declares a non-anon audience`);
    }
  }

  return problems;
}

function readMigration(bytesByPath) {
  return bytesByPath
    ? bytesByPath[GUARDIAN_MIGRATION].toString("utf8")
    : readFileSync(GUARDIAN_MIGRATION, "utf8");
}

/** Layer 1 + Layer 2 over the whole migration. */
export function validateGuardianMigrationContract(bytesByPath = null) {
  const sql = readMigration(bytesByPath);
  const problems = [];

  let allTokens;
  let statements;
  try {
    allTokens = sqlTokens(sql);
    statements = splitStatements(allTokens);
  } catch (error) {
    // Fail closed: an unparseable migration is a contract failure, never a pass.
    return [`guardian: migration could not be tokenized: ${error.message}`];
  }

  // ── LAYER 1 ──
  validateStatementShape(statements, problems);

  // ── LAYER 2 ──
  validateIndexContract(statements, problems);
  validateAclModel(statements, problems);
  validateEvidenceImmutability(allTokens, problems);

  // Out-of-scope surfaces, kept as explicit named properties.
  for (const forbidden of [
    "issue_guardian_request",
    "rotate_guardian_request",
    "record_guardian_delivery",
    "guardian_issuer",
    "service_role",
    "athlete_profiles",
    "storage",
  ]) {
    if (allTokens.includes(forbidden)) {
      problems.push(
        `guardian: migration references "${forbidden}" — out of scope for Phase 2 (no issuance, ` +
          `rotation, delivery, issuer role, service_role bypass, publication or media surface)`
      );
    }
  }

  const peek = functionBody(statements, "peek_guardian_request");
  const redeem = functionBody(statements, "redeem_guardian_request");

  if (!peek) {
    problems.push("guardian: peek_guardian_request body could not be located");
  } else {
    for (const verb of ["insert", "update", "delete", "merge"]) {
      if (peek.includes(verb)) {
        problems.push(
          `guardian: peek_guardian_request body contains "${verb}" — it must be strictly read-only`
        );
      }
    }
    validateTokenProvenance("peek_guardian_request", peek, problems, { lookupEnd: "limit 1" });
  }

  if (!redeem) {
    problems.push("guardian: redeem_guardian_request body could not be located");
  } else {
    validateTokenProvenance("redeem_guardian_request", redeem, problems, {
      lookupEnd: "for update of ap",
    });
    validateVersionProvenance(redeem, problems);
    validateEvidenceInsert(redeem, problems);
    validateRedeemOrdering(redeem, problems);
  }

  return problems;
}

/** Runs every Phase 2 SQL-contract check and returns the combined problem list. */
export function validateGuardianSqlContract(bytesByPath = null) {
  return [
    ...validateGuardianFunctionHardening(bytesByPath),
    ...validateGuardianMigrationContract(bytesByPath),
  ];
}
