import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PINNED_MIGRATIONS,
  PUBLIC_PROJECTION,
  sha256Hex,
  validateMigrationDigests,
  validateSqlContract,
} from "./sql-contract.mjs";

/**
 * Regression tests for the 5D.7 migration hash contract.
 *
 * Every case below is a change that must invalidate the digest. Most were bypasses Codex
 * found against the three earlier guards — keyword matching, structural decomposition, and
 * a hand-written canonicaliser — each of which had to reason about SQL and could therefore
 * be out-reasoned. A byte hash cannot be: the tests read as trivial, and that is the whole
 * argument for the design.
 *
 * They are kept explicit rather than collapsed into one "any change fails" test for two
 * reasons: they document the specific attacks this boundary is known to face, and they
 * would fail loudly if anyone reintroduced normalisation of comments, whitespace, case,
 * literals, or line endings.
 *
 * These prove byte-level change detection only. They do not prove the SQL is correct, and
 * they say nothing about runtime privileges — `postgres` owns both functions and bypasses
 * RLS regardless. Runtime behaviour is proven only by the gated live acceptance harness.
 */

const RPC = PINNED_MIGRATIONS[0];
const MEDIA = PINNED_MIGRATIONS[1];
const REVOKE = PINNED_MIGRATIONS[2];
const SEARCH_PATH = PINNED_MIGRATIONS[3];

const realBytes = Object.fromEntries(PINNED_MIGRATIONS.map(({ path }) => [path, readFileSync(path)]));
const REPOSITORY_SQL = readFileSync("src/lib/profile-repository.ts", "utf8");

/** Applies a byte-level mutation to one pinned file, leaving the others intact. */
function withMutation(target, mutate) {
  const original = realBytes[target.path].toString("utf8");
  const mutated = mutate(original);
  assert.notEqual(mutated, original, `mutation did not change ${target.path}`);
  return { ...realBytes, [target.path]: Buffer.from(mutated, "utf8") };
}

/** Asserts a mutation is rejected by the digest contract, naming the right file. */
function expectDigestRejected(target, mutate, label) {
  const problems = validateMigrationDigests(withMutation(target, mutate));
  assert.ok(problems.length > 0, `${label} did NOT invalidate the digest`);
  assert.ok(
    problems.some((p) => p.includes("BYTES CHANGED") && p.includes(target.path)),
    `${label} failed for the wrong reason: ${problems.join(" | ")}`
  );
}

// ──────────────────────────────────────────────────────────── baseline ──

describe("5D.7 migration hash contract — baseline", () => {
  test("the working-tree migrations match their recorded digests", () => {
    assert.deepEqual(validateMigrationDigests(realBytes), []);
  });

  test("every pinned digest is a full SHA-256 hex string and byte length is recorded", () => {
    for (const { path, sha256, bytes } of PINNED_MIGRATIONS) {
      assert.match(sha256, /^[0-9a-f]{64}$/, `bad digest format for ${path}`);
      assert.equal(realBytes[path].length, bytes, `recorded byte length is stale for ${path}`);
    }
  });

  test("every reviewed security-sensitive migration is pinned", () => {
    const paths = PINNED_MIGRATIONS.map((m) => m.path).join("\n");
    assert.match(paths, /20260928000001_add_published_profile_rpc\.sql/);
    assert.match(paths, /20260928000002_scope_media_reads_to_referenced_hero\.sql/);
    assert.match(paths, /20260928000003_restrict_profile_table_reads\.sql/);
    assert.match(paths, /20260929000001_harden_set_updated_at_search_path\.sql/);
    assert.equal(PINNED_MIGRATIONS.length, 4);
  });

  test("the three 5D.7 digests are unchanged by the 5D.8 addition", () => {
    // Guards against a careless edit to the contract silently re-pinning 5D.7.
    const byPath = Object.fromEntries(PINNED_MIGRATIONS.map((m) => [m.path, m]));
    const expected = {
      "supabase/migrations/20260928000001_add_published_profile_rpc.sql":
        ["2096aec79c699a3544f8a82152a080ea7a2139959c163ce603a0e5a0c433860b", 5103],
      "supabase/migrations/20260928000002_scope_media_reads_to_referenced_hero.sql":
        ["fe622ce390e4d0d5378fadd998c19bf6b0e8b42f4ad3b9e389f93e70589910f5", 9334],
      "supabase/migrations/20260928000003_restrict_profile_table_reads.sql":
        ["6903dc426408a41ef0d22ce410e392a97cca7fb6f571e236ccdef5178c3e5610", 3966],
    };
    for (const [path, [sha, bytes]] of Object.entries(expected)) {
      assert.equal(byPath[path]?.sha256, sha, `5D.7 digest changed for ${path}`);
      assert.equal(byPath[path]?.bytes, bytes, `5D.7 byte length changed for ${path}`);
    }
  });

  test("the migrations contain no CR bytes, so the digest is stable across platforms", () => {
    // .gitattributes pins *.sql to eol=lf. Without that, a Windows checkout with
    // core.autocrlf=true would produce different bytes and every digest would fail in CI.
    for (const { path } of PINNED_MIGRATIONS) {
      assert.equal(realBytes[path].includes(0x0d), false, `${path} contains a CR byte`);
    }
  });

  test("a missing file is reported rather than silently skipped", () => {
    const problems = validateMigrationDigests({ ...realBytes, [RPC.path]: null });
    assert.ok(problems.some((p) => /file not provided/.test(p)));
  });
});

// ────────────────────────────────── bypasses that must invalidate the hash ──

describe("5D.7 migration hash contract — Codex bypasses", () => {
  test("nested-comment wrapper bypass", () => {
    // The lexer-based guard mishandled nested block comments; PostgreSQL nests them, so
    // wrapping real SQL in /* /* */ */ changed what executed while the checker saw
    // something else. A byte hash has no opinion about nesting.
    expectDigestRejected(
      RPC,
      (sql) => `/* outer /* inner */ still a comment to the old lexer */\n${sql}`,
      "nested-comment wrapper"
    );
  });

  test("unterminated block comment", () => {
    expectDigestRejected(RPC, (sql) => `${sql}\n/* unterminated\n`, "unterminated block comment");
  });

  test("appended GRANT ALL ... TO PUBLIC", () => {
    expectDigestRejected(
      RPC,
      (sql) => `${sql}\ngrant all on function public.get_published_profile_by_slug(text) to public;\n`,
      "appended GRANT ALL TO PUBLIC"
    );
  });

  test("appended replacement function", () => {
    expectDigestRejected(
      MEDIA,
      (sql) =>
        `${sql}\ncreate or replace function public.is_publicly_referenced_media(object_name text)\n` +
        `returns boolean language sql security definer stable set search_path = '' as $x$ select true; $x$;\n`,
      "appended replacement function"
    );
  });

  test("appended ALTER FUNCTION ... SECURITY INVOKER", () => {
    expectDigestRejected(
      RPC,
      (sql) => `${sql}\nalter function public.get_published_profile_by_slug(text) security invoker;\n`,
      "appended ALTER FUNCTION SECURITY INVOKER"
    );
  });

  test("ACL change — revoke target weakened from public to anon", () => {
    expectDigestRejected(
      RPC,
      (sql) =>
        sql.replace(
          "revoke all on function public.get_published_profile_by_slug(text) from public;",
          "revoke all on function public.get_published_profile_by_slug(text) from anon;"
        ),
      "weakened revoke"
    );
  });

  test("ACL change — EXECUTE granted to public", () => {
    expectDigestRejected(
      RPC,
      (sql) =>
        sql.replace(
          "grant execute on function public.get_published_profile_by_slug(text) to anon, authenticated;",
          "grant execute on function public.get_published_profile_by_slug(text) to public;"
        ),
      "grant to public"
    );
  });

  test("RPC rename", () => {
    expectDigestRejected(
      RPC,
      (sql) => sql.replace("get_published_profile_by_slug(profile_slug text)", "get_published_profile_by_slug_other(profile_slug text)"),
      "renamed RPC"
    );
  });

  test('"position" changed to "POSITION"', () => {
    expectDigestRejected(RPC, (sql) => sql.replace('  "position" text,', '  "POSITION" text,'), "quoted identifier case");
  });

  test("'hero' changed to 'HERO'", () => {
    expectDigestRejected(MEDIA, (sql) => sql.replace(", 2) = 'hero'", ", 2) = 'HERO'"), "literal case");
  });

  test("quoted policy-name whitespace change", () => {
    expectDigestRejected(
      MEDIA,
      (sql) => sql.replace('"Read own media or publicly referenced hero"', '"Read own  media or publicly referenced hero"'),
      "policy name whitespace"
    );
  });

  test("dropped owner-folder binding (HIGH 1 regression)", () => {
    expectDigestRejected(
      MEDIA,
      (sql) => sql.replace("      and p.owner_user_id::text = pg_catalog.split_part(object_name, '/', 1)\n", ""),
      "dropped owner-folder binding"
    );
  });

  test("re-granted anon SELECT in migration B", () => {
    expectDigestRejected(
      REVOKE,
      (sql) => `${sql}\ngrant select (slug, first_name) on table public.athlete_profiles to anon;\n`,
      "re-granted anon SELECT"
    );
  });
});

// ───────────────────── changes that are harmless but must STILL fail ──

describe("5D.8 migration hash contract — set_updated_at search_path", () => {
  test("missing file/content is reported rather than silently skipped", () => {
    for (const absent of [null, undefined]) {
      const problems = validateMigrationDigests({ ...realBytes, [SEARCH_PATH.path]: absent });
      assert.ok(problems.some((p) => /file not provided/.test(p) && p.includes(SEARCH_PATH.path)),
        `expected a missing-file problem for ${JSON.stringify(absent)}`);
    }
  });

  test("altered search_path SQL invalidates the hash", () => {
    // The whole point of the migration: anything but an empty search_path must fail.
    for (const replacement of [
      "set search_path = public",
      "set search_path = pg_catalog",
      "set search_path = public, pg_catalog",
      "set search_path to ''",
    ]) {
      expectDigestRejected(SEARCH_PATH, (sql) => sql.replace("set search_path = ''", replacement),
        `altered search_path -> ${replacement}`);
    }
  });

  test("changing the EXECUTABLE target function invalidates the hash", () => {
    // Anchored on the full statement token, which occurs exactly once and only in the
    // executable SQL. Matching the bare `public.set_updated_at()` would hit the first
    // COMMENT occurrence (line 1 of the migration) instead, and the test would then pass
    // by proving comment-mutation rejection rather than executable-target drift.
    const original = realBytes[SEARCH_PATH.path].toString("utf8");
    const EXEC_TOKEN = "alter function public.set_updated_at()";
    assert.equal(
      original.split(EXEC_TOKEN).length - 1, 1,
      "expected the executable ALTER token to occur exactly once"
    );

    const executableOf = (sql) => sql.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim();
    const mutated = original.replace(EXEC_TOKEN, "alter function public.set_updated_at_other()");

    // Prove the mutation landed in the executable SQL, not in prose.
    assert.notEqual(executableOf(mutated), executableOf(original),
      "mutation did not change the executable SQL — it must not be a comment-only edit");
    assert.match(executableOf(mutated), /set_updated_at_other\(\)/);
    assert.doesNotMatch(executableOf(mutated), /alter function public\.set_updated_at\(\)/);

    expectDigestRejected(SEARCH_PATH, () => mutated, "renamed executable target function");
  });

  test("appended executable SQL invalidates the hash", () => {
    for (const [label, appended] of [
      ["CREATE OR REPLACE FUNCTION", "\ncreate or replace function public.set_updated_at()\nreturns trigger language plpgsql as $x$ begin return new; end; $x$;\n"],
      ["SECURITY DEFINER switch", "\nalter function public.set_updated_at() security definer;\n"],
      ["OWNER TO", "\nalter function public.set_updated_at() owner to postgres;\n"],
      ["GRANT to public", "\ngrant execute on function public.set_updated_at() to public;\n"],
      ["trigger DDL", "\ndrop trigger if exists set_athlete_profiles_updated_at on public.athlete_profiles;\n"],
      ["a second unrelated ALTER", "\nalter table public.athlete_profiles disable row level security;\n"],
    ]) {
      expectDigestRejected(SEARCH_PATH, (sql) => sql + appended, `appended ${label}`);
    }
  });

  test("a comment-only mutation invalidates the hash — brittleness is intentional", () => {
    expectDigestRejected(SEARCH_PATH,
      (sql) => sql.replace("-- Checkpoint 5D.8.", "-- Checkpoint 5D.8 (reworded)."),
      "comment-only change");
  });

  test("a whitespace-only mutation invalidates the hash", () => {
    expectDigestRejected(SEARCH_PATH,
      (sql) => sql.replace("  set search_path = '';", "   set search_path = '';"),
      "whitespace-only change");
  });

  test("a single-byte mutation invalidates the hash", () => {
    expectDigestRejected(SEARCH_PATH, (sql) => sql + " ", "trailing single byte");
  });

  test("a CRLF conversion invalidates the hash", () => {
    // Documents the .gitattributes dependency for this file too.
    expectDigestRejected(SEARCH_PATH, (sql) => sql.replace(/\n/g, "\r\n"), "CRLF conversion");
  });

  test("the pinned 5D.8 file is LF-only and matches its recorded byte length", () => {
    const bytes = realBytes[SEARCH_PATH.path];
    assert.equal(bytes.includes(0x0d), false, "5D.8 migration contains a CR byte");
    assert.equal(bytes.length, SEARCH_PATH.bytes);
  });

  test("the executable SQL is exactly the one approved statement", () => {
    const exec = realBytes[SEARCH_PATH.path].toString("utf8")
      .replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim();
    assert.equal(exec, "alter function public.set_updated_at() set search_path = '';");
  });
});

describe("5D.7 migration hash contract — brittleness is intentional", () => {
  test("an ordinary comment change fails by design", () => {
    expectDigestRejected(MEDIA, (sql) => sql.replace("-- Checkpoint 5D.7, migration 2 of 3.", "-- Checkpoint 5D.7 (migration 2 of 3)."), "comment change");
  });

  test("an ordinary whitespace change fails by design", () => {
    expectDigestRejected(RPC, (sql) => sql.replace("  limit 1;", "   limit 1;"), "whitespace change");
  });

  test("a trailing newline change fails by design", () => {
    expectDigestRejected(REVOKE, (sql) => `${sql}\n`, "trailing newline");
  });

  test("a CRLF conversion fails by design", () => {
    // Documents why .gitattributes must pin eol=lf: unpinned, this is what CI would see.
    expectDigestRejected(REVOKE, (sql) => sql.replace(/\n/g, "\r\n"), "CRLF conversion");
  });
});

// ───────────────────────────────────── application projection parity ──

describe("application projection parity", () => {
  test("the app select list matches the approved 18-field projection", () => {
    const { problems } = validateSqlContract({ bytesByPath: realBytes, repositorySql: REPOSITORY_SQL });
    assert.deepEqual(problems, []);
  });

  test("the approved projection is exactly 18 columns", () => {
    assert.equal(PUBLIC_PROJECTION.length, 18);
    assert.equal(new Set(PUBLIC_PROJECTION).size, 18);
  });

  test("the app selecting a column outside the approved projection is rejected", () => {
    const mutated = REPOSITORY_SQL.replace(
      "  hero_photo_path, highlight_links, is_published",
      "  hero_photo_path, highlight_links, is_published, school_or_team"
    );
    assert.notEqual(mutated, REPOSITORY_SQL, "repository mutation did not apply");
    const { problems } = validateSqlContract({ bytesByPath: realBytes, repositorySql: mutated });
    assert.ok(problems.some((p) => /NOT in the approved projection: school_or_team/.test(p)));
  });

  test("the app dropping an approved column is rejected", () => {
    const mutated = REPOSITORY_SQL.replace("  height_in, weight_lb, bio,", "  height_in, weight_lb,");
    assert.notEqual(mutated, REPOSITORY_SQL, "repository mutation did not apply");
    const { problems } = validateSqlContract({ bytesByPath: realBytes, repositorySql: mutated });
    assert.ok(problems.some((p) => /never selected by the app: bio/.test(p)));
  });

  test("a missing PUBLIC_PROFILE_COLUMNS literal is reported", () => {
    const { problems } = validateSqlContract({ bytesByPath: realBytes, repositorySql: "const other = 1;" });
    assert.ok(problems.some((p) => /no PUBLIC_PROFILE_COLUMNS template literal/.test(p)));
  });
});

// ──────────────────────────────────────────────────── digest primitive ──

describe("sha256Hex", () => {
  test("matches a known SHA-256 vector", () => {
    assert.equal(
      sha256Hex(Buffer.from("abc", "utf8")),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  test("a single-byte difference changes the digest", () => {
    assert.notEqual(sha256Hex(Buffer.from("hero")), sha256Hex(Buffer.from("herp")));
  });
});
