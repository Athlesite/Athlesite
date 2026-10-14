/**
 * Byte-for-byte hash pinning for this project's reviewed security-sensitive migrations.
 *
 * The set is whatever PINNED_MIGRATIONS lists — not a fixed count — and any migration that
 * changes an access boundary, a grant, a policy, or a function's execution context belongs
 * in it. It currently runs from the 5D.7 access-boundary migrations through the Phase 2
 * guardian bearer RPCs and the Phase 2 readiness rate limiter; read the list, not this
 * sentence, since prose about a count goes stale the moment one is added.
 *
 * ── WHY IT IS A HASH, AFTER THREE FAILED ATTEMPTS ────────────────────────────────
 *
 * Three successive guards were rejected in review, each for the same underlying reason.
 * The first asserted that keywords were present or absent; Codex bypassed it with a
 * private column aliased as a public one, `row_to_json(p)::text`, and attributes moved
 * into a comment. The second decomposed the SQL structurally; Codex bypassed that by
 * appending executable statements the decomposition never inspected. The third
 * canonicalised the SQL with a hand-written lexer; Codex bypassed that too, because
 * PostgreSQL's lexical rules — nested block comments, dollar-quote tags, unterminated
 * comments, escape-string syntax — are richer than any checker short of a real parser.
 *
 * Each fix was an escalation toward writing a PostgreSQL parser. That is the wrong
 * destination. So this does not read the SQL at all: it hashes the raw bytes of each
 * reviewed migration and compares against a digest recorded here. There is nothing to
 * out-reason, because nothing is being reasoned about.
 *
 * Nothing is normalised. Not comments, not whitespace, not case, not quoted identifiers,
 * not string literals. Not line endings either — which is why `.gitattributes` pins
 * `*.sql` to `eol=lf`: a raw-byte digest is only meaningful if every checkout produces
 * identical bytes, and this repository is developed on Windows with `core.autocrlf=true`
 * while CI runs on Linux.
 *
 * ── DELIBERATELY BRITTLE ─────────────────────────────────────────────────────────
 *
 * ANY change to these files fails the contract, including a typo fix in a comment or a
 * reflowed line. That is the intended behaviour, not a limitation: updating the digest is
 * a small, obvious, reviewable diff that forces a second look at a security boundary. If
 * you are here because the hash failed, the question to answer is "has this migration been
 * re-reviewed?", not "how do I make the check pass".
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────────
 *
 * Not runtime isolation, and not proof that the SQL is safe. It proves only that the
 * bytes are the reviewed bytes. Whether those bytes are *correct* is established by human
 * review and by the live acceptance harness. `postgres` owns both public functions, so at
 * runtime they bypass RLS and can read every column of `athlete_profiles` — an accepted
 * consequence of Option A recorded in docs/ai/DECISIONS.md.
 *
 * The reviewed migration files themselves, plus these digests, are the security source of
 * truth.
 */
import { createHash } from "node:crypto";

/**
 * The pinned migrations. `sha256` is over the exact raw bytes of the file as checked out
 * (LF line endings, enforced by .gitattributes).
 *
 * To update one deliberately: change the migration, re-run `npm run check:columns`, and
 * copy the reported actual digest here in the same commit. Both halves land in one diff so
 * a reviewer sees the SQL change and the digest change together.
 */
export const PINNED_MIGRATIONS = [
  {
    label: "migration A — exact-slug public read RPC + ACL",
    path: "supabase/migrations/20260928000001_add_published_profile_rpc.sql",
    // Re-pinned 2026-09-29: comment-only correction replacing a stale reference to the
    // deleted private-column body scanner. Executable SQL verified byte-identical before
    // and after by diffing with comment lines removed; every changed line was a comment.
    sha256: "2096aec79c699a3544f8a82152a080ea7a2139959c163ce603a0e5a0c433860b",
    bytes: 5103,
  },
  {
    label: "migration C — media helper + ACL + Storage policy",
    path: "supabase/migrations/20260928000002_scope_media_reads_to_referenced_hero.sql",
    sha256: "fe622ce390e4d0d5378fadd998c19bf6b0e8b42f4ad3b9e389f93e70589910f5",
    bytes: 9334,
  },
  {
    label: "migration B — drop shared policy + revoke anon",
    path: "supabase/migrations/20260928000003_restrict_profile_table_reads.sql",
    // Re-pinned 2026-09-29, same comment-only correction and same verification as A.
    // Migration C was not touched and its digest is deliberately unchanged.
    sha256: "6903dc426408a41ef0d22ce410e392a97cca7fb6f571e236ccdef5178c3e5610",
    bytes: 3966,
  },
  {
    label: "migration D (5D.8) — pin empty search_path on set_updated_at()",
    path: "supabase/migrations/20260929000001_harden_set_updated_at_search_path.sql",
    // Added 2026-09-29 (Checkpoint 5D.8). Executable content is a single statement:
    //   alter function public.set_updated_at() set search_path = '';
    // Digest computed after its comments were finalised, so a later comment edit fails
    // this contract — which is the intended behaviour, not a limitation.
    sha256: "c1c3c4f2c1779b4f46b0170471df6641024a8505c50b8f6def4ccca585e75bab",
    bytes: 3049,
  },
  {
    label: "migration E (Phase 1b) — participation enforcement policies",
    path: "supabase/migrations/20261012000001_phase1b_participation_enforcement.sql",
    // Added 2026-10-12 (Guardian-First Participation Phase 1b). This migration is
    // exactly six `create policy ... as restrictive` statements plus their comments:
    // a retention gate on athlete_profiles INSERT/UPDATE, the interim
    // minor-publication gate on the same two operations, and a bucket-scoped
    // retention gate on storage.objects INSERT/UPDATE. It changes an access boundary,
    // which is precisely what this set is for.
    //
    // What the digest does NOT tell you is which authorization properties the SQL
    // asserts; scripts/phase1b-policy-contract.mjs does that, and will name the
    // specific gate if one is weakened. The two layers are complementary: this one
    // fails on any byte change at all, that one explains what changed in the model.
    // Re-pinned during review for comment-only corrections to NULL semantics and
    // UPDATE WITH CHECK inheritance. All six executable statements are unchanged.
    sha256: "74dd681bb3003c95669028943d142c8bc97d51754f8583cb683affca74ca8f7a",
    bytes: 15148,
  },
  {
    label: "migration F (Phase 2) — guardian bearer peek/redeem RPCs + partial unique index",
    path: "supabase/migrations/20261013000001_guardian_bearer_peek_redeem.sql",
    // Added 2026-10-13 (Guardian-First Participation Phase 2). Pinned only after an
    // independent security review's required fixes were applied and re-verified:
    // terms/privacy evidence versions copied from the request-pinned columns (not
    // NULL), clock_timestamp() for the post-lock expiry re-check (not the stale
    // transaction-start now()), canonical base64url validation on the 43rd character,
    // and an explicit revoke from `public, authenticated` before granting `anon`
    // EXECUTE. scripts/guardian-sql-contract.mjs independently proves the specific
    // authorization properties (token-hash binding, row locking, decision allowlist,
    // exhaustive grant/revoke enumeration); this pin is the belt-and-braces byte-level
    // guard alongside it, exactly like migration E's own pair above.
    sha256: "4119fee5a154acbdd1ac6240a2b65140b314dd4ea443e0bd16433e9406157c0a",
    bytes: 22467,
  },
  {
    label: "migration G (Phase 2 readiness) — guardian rate-limit infrastructure + pre-request hook",
    path: "supabase/migrations/20261014000001_guardian_rate_limit_infrastructure.sql",
    // Added 2026-10-13 (Phase 2 production readiness). This migration introduces the
    // function that PostgREST will call on EVERY Data API request, so it changes an
    // execution context for the whole project and belongs in this set by the rule in
    // the docblock above. It is INERT until 20261014000003 registers it.
    //
    // Infrastructure, private helpers and the public dispatcher, with EXECUTE
    // enumerated to anon/authenticated/service_role and PUBLIC revoked.
    //
    // As with migration E, the digest says nothing about WHICH authorization properties
    // the SQL asserts. scripts/guardian-rate-limit-contract.mjs does that — path scope,
    // method gate, threshold values, fail-closed ordering, the truncate-before-hash IP
    // model, the exhaustive ACL set, and prune scoping — and will name the specific
    // property if one is weakened. This pin is the belt-and-braces byte-level guard
    // beside it.
    // Re-pinned 2026-10-13 for FOUNDER DECISION A1 (the dispatcher's EXECUTE grant is
    // enumerated to anon/authenticated/service_role with PUBLIC explicitly revoked,
    // replacing the rejected grant-to-PUBLIC design) and for the method-gate rationale
    // rewritten around PostgREST choosing read-only vs read/write by VOLATILITY rather
    // than by HTTP method. Re-pinned at implementer handoff for single-pass path
    // decoding and atomic advisory locking, with the clock sampled AFTER waiting,
    // and safe refusal of frozen transaction snapshots.
    // The arming pin also incorporates Claude's already-present comment corrections.
    sha256: "6c5d7e081e7a82f413dcb46ed56bbe3ee52e0ab78d079ca2baa37612b64cb964",
    bytes: 61311,
  },
  {
    label: "migration H (Phase 2 readiness) — peek_guardian_request STABLE -> VOLATILE",
    path: "supabase/migrations/20261014000002_peek_guardian_request_volatile.sql",
    // Added 2026-10-13 (FOUNDER DECISION A6). One `alter function ... volatile` plus a
    // refreshed comment. It is pinned because it changes the EXECUTION CONTEXT of a
    // reviewed SECURITY DEFINER function, which is exactly what this set is for.
    //
    // It is also a CORRECTNESS prerequisite for arming, not hardening: PostgREST picks a
    // read-only or read/write transaction from the called function's volatility, not from
    // the HTTP method, so with peek left STABLE a legitimate POST peek runs read-only and
    // the pre-request limiter's INSERT raises 25006 — breaking every peek rather than
    // merely leaving it unlimited.
    //
    // Note the DELIBERATE divergence this creates: 20261013000001 still says `stable` in
    // its (byte-pinned) text, while the deployed catalog says `volatile`.
    // scripts/guardian-sql-contract.mjs keeps asserting the word `stable` in that file's
    // bytes and points here in its failure message, so nobody resolves the apparent
    // contradiction by editing an applied, reviewed migration.
    sha256: "817f14d9515f9d02cc0356751f7b6ad87289b6f3dcb296247cd921ee954efa90",
    bytes: 8204,
  },
  {
    label: "migration I (Phase 2 readiness) — ARM the global PostgREST pre-request hook",
    path: "supabase/migrations/20261014000003_arm_guardian_rate_limit_pre_request.sql",
    // Renumbered from ...0002 so that arming stays STRICTLY LAST, after the peek
    // volatility change it depends on. Its bytes are unchanged by the renumbering.
    // Added 2026-10-13. Two statements, and this is the highest-blast-radius file in the
    // repository: `alter role authenticator set pgrst.db_pre_request` changes the
    // behaviour of every Data API request in the project, and `notify pgrst` makes that
    // take effect at commit. It is alone in its own migration precisely so that arming
    // is a one-statement diff and disarming is a one-statement forward correction.
    //
    // A digest change here is never cosmetic. If this hash fails, the question is "who
    // changed what the global hook points at, and was it re-reviewed?".
    sha256: "bdde52bddb223cc686ab1d09783691e5e6b01c1bd4a2b9975130766104a5a04f",
    bytes: 6686,
  },
];

/**
 * The 18-field application projection.
 *
 * This is an APPLICATION-CONSISTENCY check, not a SQL-safety check. It catches the
 * specific failure where the app's select list and the intended public projection drift
 * apart — which would break every profile page — and it proves nothing whatsoever about
 * whether the SQL is safe. Only the hashes plus human review speak to that.
 */
export const PUBLIC_PROJECTION = [
  "owner_user_id",
  "slug",
  "first_name",
  "last_name",
  "sport",
  "position",
  "class_year",
  "city",
  "state",
  "height_in",
  "weight_lb",
  "bio",
  "hero_photo_position_x",
  "hero_photo_position_y",
  "hero_photo_zoom",
  "hero_photo_path",
  "highlight_links",
  "is_published",
];

/** SHA-256 of raw bytes, hex. Accepts a Buffer/Uint8Array. */
export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Compares each pinned migration's raw bytes against its recorded digest.
 *
 * `bytesByPath` maps the paths in PINNED_MIGRATIONS to Buffers, so tests can supply
 * deliberately mutated bytes without touching the working tree.
 */
export function validateMigrationDigests(bytesByPath) {
  const problems = [];

  for (const { label, path, sha256, bytes } of PINNED_MIGRATIONS) {
    const content = bytesByPath[path];
    if (content === undefined || content === null) {
      problems.push(`${label}: file not provided to the contract check (${path})`);
      continue;
    }
    const actual = sha256Hex(content);
    if (actual !== sha256) {
      problems.push(
        `${label}: BYTES CHANGED (${path})\n` +
          `      expected sha256 ${sha256} (${bytes} bytes)\n` +
          `      actual   sha256 ${actual} (${content.length} bytes)\n` +
          "      These migrations are pinned byte-for-byte. If the change is intended and has\n" +
          "      been re-reviewed as a security change, update PINNED_MIGRATIONS in\n" +
          "      scripts/sql-contract.mjs in the same commit."
      );
    }
  }

  return problems;
}

/** Column names inside the app's PUBLIC_PROFILE_COLUMNS template literal. */
export function repositoryColumns(ts, problems) {
  const match = /const\s+PUBLIC_PROFILE_COLUMNS\s*=\s*`([^`]*)`/.exec(ts);
  if (!match) {
    problems.push("repository: no PUBLIC_PROFILE_COLUMNS template literal found");
    return [];
  }
  return match[1]
    .split(",")
    .map((p) => p.replace(/--.*$/gm, "").trim())
    .filter(Boolean);
}

/** Application projection parity. Says nothing about SQL safety — see PUBLIC_PROJECTION. */
export function validateProjectionParity(repositorySql, problems) {
  const appColumns = repositoryColumns(repositorySql ?? "", problems);
  const approved = new Set(PUBLIC_PROJECTION);
  const inApp = new Set(appColumns);

  for (const column of PUBLIC_PROJECTION) {
    if (!inApp.has(column)) problems.push(`approved public column never selected by the app: ${column}`);
  }
  for (const column of appColumns) {
    if (!approved.has(column)) {
      problems.push(`selected by the app but NOT in the approved projection: ${column}  <-- would break every profile page`);
    }
  }
  for (const column of new Set(appColumns)) {
    if (appColumns.filter((c) => c === column).length > 1) {
      problems.push(`duplicate column "${column}" in the app select list`);
    }
  }
  return appColumns;
}

/** The whole contract: pinned digests, then application parity. */
export function validateSqlContract({ bytesByPath, repositorySql }) {
  const problems = [...validateMigrationDigests(bytesByPath ?? {})];
  validateProjectionParity(repositorySql, problems);
  return { problems, publicColumns: [...PUBLIC_PROJECTION] };
}
