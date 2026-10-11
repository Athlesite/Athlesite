import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CANONICAL_UUID_PATTERN_SOURCE,
  isCanonicalUuidFormat,
  computeCensusCoverage,
  evaluateGoNoGo,
  validateCensusCoverageSql,
  BLOCKING_COUNTS,
  INFORMATIONAL_COUNTS,
} from "./participation-census-validation.mjs";
import { PARTICIPATION_MIGRATIONS, stripSqlComments } from "./participation-sql-contract.mjs";

const CENSUS_SQL_PATH = "scripts/participation-census.sql";

describe("isCanonicalUuidFormat — the exact cases the finding named", () => {
  test("36 hyphens is rejected (the old loose pattern's exact failure case)", () => {
    const thirtySixHyphens = "-".repeat(36);
    assert.equal(thirtySixHyphens.length, 36, "precondition: exactly 36 characters");
    assert.equal(isCanonicalUuidFormat(thirtySixHyphens), false);
  });

  test("wrong hyphen placement is rejected, even with otherwise-valid hex digits", () => {
    // 32 hex digits plus 4 hyphens = 36 characters, same length and alphabet as a
    // real UUID, but every hyphen sits one position right of where the canonical
    // 8-4-4-4-12 grouping requires. Verified by construction: strip the hyphens,
    // confirm 32 hex characters remain, then confirm the hyphen GROUPING is wrong.
    const misplaced = "0123456-789ab-cdef-0123-456789abcdef";
    const hexOnly = misplaced.replace(/-/g, "");
    assert.equal(hexOnly.length, 32, "precondition: 32 hex characters");
    assert.match(hexOnly, /^[0-9a-fA-F]{32}$/, "precondition: all valid hex digits");
    assert.notDeepEqual(
      misplaced.split("-").map((part) => part.length),
      [8, 4, 4, 4, 12],
      "precondition: this grouping is NOT the canonical 8-4-4-4-12 shape"
    );
    assert.equal(isCanonicalUuidFormat(misplaced), false);
  });

  test("a genuinely valid UUID is accepted", () => {
    assert.equal(isCanonicalUuidFormat("123e4567-e89b-12d3-a456-426614174000"), true);
    assert.equal(isCanonicalUuidFormat("00000000-0000-0000-0000-000000000000"), true);
    // Case-insensitive: Postgres's uuid type does not care about hex-digit case.
    assert.equal(isCanonicalUuidFormat("ABCDEF12-AB12-AB12-AB12-ABCDEF123456"), true);
  });

  test("a valid-format UUID that happens to be missing from auth.users is still format-valid", () => {
    // This function only answers the FORMAT question. Existence in auth.users is a
    // separate, later check in the census SQL (section 5c) that only ever runs
    // against a segment this function has already approved — see that file.
    const wellFormedButHypothetical = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    assert.equal(isCanonicalUuidFormat(wellFormedButHypothetical), true);
  });

  test("a missing or empty first segment is rejected", () => {
    assert.equal(isCanonicalUuidFormat(""), false);
    assert.equal(isCanonicalUuidFormat(null), false);
    assert.equal(isCanonicalUuidFormat(undefined), false);
  });

  test("never throws, for any input including pathological strings", () => {
    const pathological = [
      "", "-", "-".repeat(1000), "not-a-uuid-at-all",
      "123e4567e89b12d3a456426614174000", // valid chars, no hyphens
      "123e4567-e89b-12d3-a456-42661417400", // one char short
      "123e4567-e89b-12d3-a456-4266141740000", // one char long
      null, undefined, 12345, {}, [],
    ];
    for (const input of pathological) {
      assert.doesNotThrow(() => isCanonicalUuidFormat(input), `threw on: ${JSON.stringify(input)}`);
    }
  });
});

describe("the census SQL uses the exact same canonical pattern as this mirror", () => {
  test("participation-census.sql contains the canonical regex exactly 4 times in real code (5b, 5c, section 6, section 7)", () => {
    const sql = readFileSync(CENSUS_SQL_PATH, "utf8");
    // Comment-stripped first: sections 6/7's own commented-out DETAIL queries
    // (symmetrical with 5a/5b's existing detail queries) also quote this pattern,
    // so counting raw text would overcount. Only code occurrences are the
    // structural claim this test makes.
    const stripped = stripSqlComments(sql);
    const occurrences = stripped.split(CANONICAL_UUID_PATTERN_SOURCE).length - 1;
    assert.equal(
      occurrences,
      4,
      "expected the canonical UUID pattern in real code exactly 4 times (5b's " +
        "rejection, 5c's cast-safety precondition, and sections 6 and 7's coverage " +
        "unions) — found " + occurrences
    );
  });

  test("the OLD loose 36-character-only pattern no longer appears as live SQL", () => {
    const sql = readFileSync(CENSUS_SQL_PATH, "utf8");
    // Strip comments via the shared, CRLF-safe stripper — not a local `--.*$`
    // regex-replace. That naive form has a real bug on this file's CRLF line
    // endings: JS regex `.` does not match `\r` (it is a line terminator for
    // regex purposes), so `--.*$` cannot reach `$` (end of string) across a
    // trailing `\r`, and the whole match fails — leaving the "comment"
    // completely unstripped rather than removed. stripSqlComments strips
    // character-by-character up to `\n` specifically, so it has no such
    // anchoring problem on either line-ending convention.
    const codeOnly = stripSqlComments(sql);
    assert.doesNotMatch(
      codeOnly,
      /\^\[0-9a-fA-F-\]\{36\}\$/,
      "the loose length-only pattern this finding fixed must not have returned as code"
    );
  });

  test("the SQL's cast sites are both reached only after the canonical regex", () => {
    const sql = readFileSync(CENSUS_SQL_PATH, "utf8");
    // 5c's WHERE clause filters by the canonical pattern BEFORE the CTE's rows ever
    // reach the ::uuid cast two statements later — a textual proxy for "the cast is
    // only attempted on already-validated input", which is the actual safety
    // property being asserted.
    const castSite = sql.indexOf("f.owner_segment::uuid");
    assert.ok(castSite > -1, "expected the orphaned-owner cast to still exist");
    const precedingCte = sql.lastIndexOf("with first_segments as (", castSite);
    const ctePattern = sql.slice(precedingCte, castSite);
    assert.ok(
      ctePattern.includes(CANONICAL_UUID_PATTERN_SOURCE),
      "the cast's own CTE must filter by the canonical pattern before the cast runs"
    );
  });
});

describe("sanity: this file exercises a real migration-adjacent path", () => {
  test("PARTICIPATION_MIGRATIONS is still importable (no accidental path drift)", () => {
    assert.ok(Object.keys(PARTICIPATION_MIGRATIONS).length > 0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// computeCensusCoverage / evaluateGoNoGo — fixture-based coverage tests
//
// There is no local Postgres (see this file's own header), so these prove the
// COVERAGE LOGIC against synthetic fixtures via computeCensusCoverage, the pure
// JS mirror of participation-census.sql's own queries — exactly the same
// relationship isCanonicalUuidFormat already has to section 5b. The real .sql
// file is checked separately, structurally, by validateCensusCoverageSql below.
// ════════════════════════════════════════════════════════════════════════════

const ZERO_COUNTS = {
  profile_owner_count: 0,
  media_owner_count: 0,
  profile_owners_without_media: 0,
  media_only_owner_count: 0,
  missing_first_segment_count: 0,
  non_uuid_first_segment_count: 0,
  orphaned_media_owner_count: 0,
  owners_missing_participation_count: 0,
  owners_participation_not_approved_count: 0,
};

// Each constant contains real hex LETTERS (a-f), not only digits — deliberately,
// because `.toUpperCase()` on an all-digit UUID like "11111111-...-1111" is a
// no-op (there is no letter to change case on), which would make any
// case-sensitivity test using it vacuously pass regardless of whether
// normalization actually works. A letter-bearing UUID is what makes "uppercase"
// and "lowercase" genuinely different strings denoting the same identity.
const ADULT_1 = "aaaaaaaa-1111-1111-1111-111111111111";
const ADULT_2 = "bbbbbbbb-2222-2222-2222-222222222222";
const MINOR_1 = "cccccccc-3333-3333-3333-333333333333";
const REVOKED_1 = "dddddddd-4444-4444-4444-444444444444";
const ORPHAN_1 = "eeeeeeee-5555-5555-5555-555555555555";

describe("computeCensusCoverage — empty state", () => {
  test("zero profiles, zero media, zero participation -> every count zero -> GO", () => {
    const counts = computeCensusCoverage({});
    assert.deepEqual(counts, ZERO_COUNTS);
    assert.deepEqual(evaluateGoNoGo(counts), { decision: "GO", blockingReasons: [] });
  });
});

describe("computeCensusCoverage — approved profile owner", () => {
  test("a profile owner with approved participation is fully covered -> GO", () => {
    const counts = computeCensusCoverage({
      profileOwnerIds: [ADULT_1],
      participationRows: [{ ownerUserId: ADULT_1, status: "approved" }],
      authUserIds: [ADULT_1],
    });
    assert.equal(counts.profile_owner_count, 1);
    assert.equal(counts.owners_missing_participation_count, 0);
    assert.equal(counts.owners_participation_not_approved_count, 0);
    assert.deepEqual(evaluateGoNoGo(counts), { decision: "GO", blockingReasons: [] });
  });
});

describe("computeCensusCoverage — approved media-only owner", () => {
  test("a media-only owner (valid canonical UUID, real auth user) with approved participation -> GO", () => {
    const counts = computeCensusCoverage({
      mediaObjectNames: [`${ADULT_1}/hero/photo.jpg`],
      participationRows: [{ ownerUserId: ADULT_1, status: "approved" }],
      authUserIds: [ADULT_1],
    });
    assert.equal(counts.profile_owner_count, 0);
    assert.equal(counts.media_owner_count, 1);
    assert.equal(counts.media_only_owner_count, 1, "media-only: no matching profile row");
    assert.equal(counts.owners_missing_participation_count, 0);
    assert.equal(counts.owners_participation_not_approved_count, 0);
    assert.deepEqual(evaluateGoNoGo(counts), { decision: "GO", blockingReasons: [] });
  });
});

describe("computeCensusCoverage — missing participation", () => {
  test("a valid profile owner with NO participation row -> NO-GO", () => {
    const counts = computeCensusCoverage({
      profileOwnerIds: [ADULT_1],
      authUserIds: [ADULT_1],
    });
    assert.equal(counts.owners_missing_participation_count, 1);
    assert.equal(counts.owners_participation_not_approved_count, 0, "not also double-counted as non-approved");
    const result = evaluateGoNoGo(counts);
    assert.equal(result.decision, "NO-GO");
    assert.deepEqual(result.blockingReasons, [
      { count: "owners_missing_participation_count", value: 1 },
    ]);
  });

  test("a valid media-only owner with NO participation row -> NO-GO", () => {
    const counts = computeCensusCoverage({
      mediaObjectNames: [`${ADULT_1}/hero/photo.jpg`],
      authUserIds: [ADULT_1],
    });
    assert.equal(counts.owners_missing_participation_count, 1);
    assert.equal(evaluateGoNoGo(counts).decision, "NO-GO");
  });
});

describe("computeCensusCoverage — non-approved participation", () => {
  test("an owner whose participation is 'revoked' -> NO-GO, and distinct from missing", () => {
    const counts = computeCensusCoverage({
      profileOwnerIds: [REVOKED_1],
      participationRows: [{ ownerUserId: REVOKED_1, status: "revoked" }],
      authUserIds: [REVOKED_1],
    });
    assert.equal(counts.owners_missing_participation_count, 0, "a row exists — this is not 'missing'");
    assert.equal(counts.owners_participation_not_approved_count, 1);
    const result = evaluateGoNoGo(counts);
    assert.equal(result.decision, "NO-GO");
    assert.deepEqual(result.blockingReasons, [
      { count: "owners_participation_not_approved_count", value: 1 },
    ]);
  });

  test("an owner whose participation is minor/'pending' (representable even though Phase 1a never writes it) -> NO-GO", () => {
    const counts = computeCensusCoverage({
      profileOwnerIds: [MINOR_1],
      participationRows: [{ ownerUserId: MINOR_1, status: "pending" }],
      authUserIds: [MINOR_1],
    });
    assert.equal(counts.owners_missing_participation_count, 0);
    assert.equal(counts.owners_participation_not_approved_count, 1);
    assert.equal(evaluateGoNoGo(counts).decision, "NO-GO");
  });

  test("an owner whose participation is 'declined' -> NO-GO", () => {
    const counts = computeCensusCoverage({
      profileOwnerIds: [MINOR_1],
      participationRows: [{ ownerUserId: MINOR_1, status: "declined" }],
      authUserIds: [MINOR_1],
    });
    assert.equal(counts.owners_participation_not_approved_count, 1);
    assert.equal(evaluateGoNoGo(counts).decision, "NO-GO");
  });
});

describe("computeCensusCoverage — mixed union (dedup)", () => {
  test("the same owner as both a profile owner and a media owner counts ONCE in coverage", () => {
    const counts = computeCensusCoverage({
      profileOwnerIds: [ADULT_1],
      mediaObjectNames: [`${ADULT_1}/hero/photo.jpg`, `${ADULT_1}/profile/pic.jpg`],
      authUserIds: [ADULT_1],
      // No participation row at all — if the union double-counted this owner,
      // owners_missing_participation_count would be 2, not 1.
    });
    assert.equal(counts.profile_owner_count, 1);
    assert.equal(counts.media_owner_count, 1, "two objects, same owner, one distinct media owner");
    assert.equal(counts.media_only_owner_count, 0, "has a profile row — not media-only");
    assert.equal(counts.profile_owners_without_media, 0);
    assert.equal(
      counts.owners_missing_participation_count,
      1,
      "ONE owner missing participation, not two, despite appearing in both sets"
    );
  });

  test("an approved owner in both sets contributes zero to either blocking count", () => {
    const counts = computeCensusCoverage({
      profileOwnerIds: [ADULT_1],
      mediaObjectNames: [`${ADULT_1}/hero/photo.jpg`],
      participationRows: [{ ownerUserId: ADULT_1, status: "approved" }],
      authUserIds: [ADULT_1],
    });
    assert.equal(counts.owners_missing_participation_count, 0);
    assert.equal(counts.owners_participation_not_approved_count, 0);
    assert.equal(evaluateGoNoGo(counts).decision, "GO");
  });
});

describe("computeCensusCoverage — malformed / orphaned paths", () => {
  test("a malformed (non-canonical) first segment is NO-GO but does not crash coverage", () => {
    assert.doesNotThrow(() =>
      computeCensusCoverage({ mediaObjectNames: ["not-a-uuid-at-all/hero/photo.jpg"] })
    );
    const counts = computeCensusCoverage({
      mediaObjectNames: ["not-a-uuid-at-all/hero/photo.jpg"],
    });
    assert.equal(counts.non_uuid_first_segment_count, 1);
    assert.equal(evaluateGoNoGo(counts).decision, "NO-GO");
    // A malformed owner cannot have a participation row and must NOT appear in
    // either coverage count — it is its own, separate NO-GO reason.
    assert.equal(counts.owners_missing_participation_count, 0);
    assert.equal(counts.owners_participation_not_approved_count, 0);
  });

  test("a missing first segment (object at bucket root) is NO-GO but does not crash coverage", () => {
    assert.doesNotThrow(() => computeCensusCoverage({ mediaObjectNames: ["bare-object.jpg"] }));
    const counts = computeCensusCoverage({ mediaObjectNames: ["bare-object.jpg"] });
    assert.equal(counts.missing_first_segment_count, 1);
    assert.equal(evaluateGoNoGo(counts).decision, "NO-GO");
    assert.equal(counts.owners_missing_participation_count, 0);
  });

  test("a canonical-format but orphaned (no auth.users row) owner is NO-GO but does not crash coverage, and is excluded from the coverage union", () => {
    assert.doesNotThrow(() =>
      computeCensusCoverage({ mediaObjectNames: [`${ORPHAN_1}/hero/photo.jpg`], authUserIds: [] })
    );
    const counts = computeCensusCoverage({
      mediaObjectNames: [`${ORPHAN_1}/hero/photo.jpg`],
      authUserIds: [], // ORPHAN_1 does not exist in auth.users
    });
    assert.equal(counts.orphaned_media_owner_count, 1);
    assert.equal(evaluateGoNoGo(counts).decision, "NO-GO");
    // Not double-counted: an orphaned owner can never have a participation row
    // (the FK cascades from auth.users), so folding it into "missing
    // participation" would report the same problem under a second name.
    assert.equal(
      counts.owners_missing_participation_count,
      0,
      "an orphaned owner must be excluded from the coverage union entirely"
    );
    assert.equal(counts.owners_participation_not_approved_count, 0);
  });
});

describe("computeCensusCoverage — coverage distinction (independence)", () => {
  test("missing-participation and non-approved are mutually exclusive per owner, and both independent of approved owners", () => {
    const counts = computeCensusCoverage({
      profileOwnerIds: [ADULT_1, ADULT_2, REVOKED_1],
      participationRows: [
        { ownerUserId: ADULT_1, status: "approved" },
        { ownerUserId: REVOKED_1, status: "revoked" },
        // ADULT_2 has no participation row at all.
      ],
      authUserIds: [ADULT_1, ADULT_2, REVOKED_1],
    });
    assert.equal(counts.owners_missing_participation_count, 1, "only ADULT_2");
    assert.equal(counts.owners_participation_not_approved_count, 1, "only REVOKED_1");
    // ADULT_1 (approved) contributes to neither.
    const result = evaluateGoNoGo(counts);
    assert.equal(result.decision, "NO-GO");
    assert.equal(result.blockingReasons.length, 2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BLOCKER 2 — UUID case normalization. Required fixtures, verbatim.
//
// A real Supabase Storage folder name is just text an uploader chose; nothing
// enforces lowercase. auth.users.id and athlete_participation.owner_user_id
// are native `uuid` columns, so Postgres always renders them canonical
// lowercase. Without normalizing the media-derived segment to match, identical
// real-world owners compare UNEQUAL as text, breaking dedup and coverage.
// ════════════════════════════════════════════════════════════════════════════

const UPPER = ADULT_1.toUpperCase();
// A genuine mixed-case variant of the SAME UUID as ADULT_1 — alternating case on
// its first hex group only. Hex is case-insensitive, so this denotes the exact
// same 128-bit value as ADULT_1, which is the whole point: fixture 2 needs a
// media-folder string that is case-DIFFERENT from, but identity-EQUAL to,
// ADULT_1. (The earlier version of this constant was a literal different UUID —
// "11111111-AAAA-..." vs ADULT_1's "aaaaaaaa-1111-...": different hex digits in
// two groups, not a case variant of the same value at all — which meant fixture
// 2 was never actually testing what its own name claimed.)
const MIXED = "AaAaAaAa-1111-1111-1111-111111111111";
assert.equal(
  MIXED.toLowerCase(),
  ADULT_1,
  "MIXED must be a case-variant of the exact same UUID as ADULT_1, not a different UUID"
);

describe("computeCensusCoverage — UUID case normalization (BLOCKER 2)", () => {
  test("fixture 1: uppercase media UUID + matching auth user + approved participation -> GO", () => {
    const counts = computeCensusCoverage({
      mediaObjectNames: [`${UPPER}/hero/photo.jpg`],
      participationRows: [{ ownerUserId: ADULT_1, status: "approved" }],
      authUserIds: [ADULT_1],
    });
    assert.equal(counts.orphaned_media_owner_count, 0, "uppercase must still match the lowercase auth user");
    assert.equal(counts.owners_missing_participation_count, 0);
    assert.equal(counts.owners_participation_not_approved_count, 0);
    assert.deepEqual(evaluateGoNoGo(counts), { decision: "GO", blockingReasons: [] });
  });

  test("fixture 2: mixed-case media UUID + matching profile owner -> one covered owner, not two", () => {
    const counts = computeCensusCoverage({
      profileOwnerIds: [ADULT_1],
      mediaObjectNames: [`${MIXED}/hero/photo.jpg`],
      authUserIds: [ADULT_1],
      // No participation row — if the union failed to dedupe the mixed-case
      // media owner against the lowercase profile owner, this would count 2.
    });
    assert.equal(
      counts.owners_missing_participation_count,
      1,
      "ONE covered owner, not two, despite the media segment being mixed-case"
    );
  });

  test("fixture 3: uppercase media UUID + non-approved participation -> NO-GO for non-approved, NOT missing/orphan", () => {
    const counts = computeCensusCoverage({
      mediaObjectNames: [`${UPPER}/hero/photo.jpg`],
      participationRows: [{ ownerUserId: ADULT_1, status: "revoked" }],
      authUserIds: [ADULT_1],
    });
    assert.equal(counts.orphaned_media_owner_count, 0);
    assert.equal(counts.owners_missing_participation_count, 0, "a row exists — not missing");
    assert.equal(counts.owners_participation_not_approved_count, 1);
    const result = evaluateGoNoGo(counts);
    assert.equal(result.decision, "NO-GO");
    assert.deepEqual(result.blockingReasons, [
      { count: "owners_participation_not_approved_count", value: 1 },
    ]);
  });

  test("fixture 4: uppercase media UUID + no participation -> NO-GO for missing participation ONLY", () => {
    const counts = computeCensusCoverage({
      mediaObjectNames: [`${UPPER}/hero/photo.jpg`],
      authUserIds: [ADULT_1],
    });
    assert.equal(counts.orphaned_media_owner_count, 0, "auth user exists — not orphaned");
    assert.equal(counts.owners_missing_participation_count, 1);
    assert.equal(counts.owners_participation_not_approved_count, 0);
    const result = evaluateGoNoGo(counts);
    assert.equal(result.decision, "NO-GO");
    assert.deepEqual(result.blockingReasons, [
      { count: "owners_missing_participation_count", value: 1 },
    ]);
  });

  test("fixture 5: a malformed non-UUID segment is unaffected by normalization and never reaches an unsafe cast", () => {
    // Normalization only ever applies AFTER isCanonicalUuidFormat approves a
    // segment (see normalizeUuidIdentity's own docblock) — a malformed string
    // has no UUID identity to normalize, so it must fall through to
    // non_uuid_first_segment_count exactly as before, case notwithstanding.
    assert.doesNotThrow(() =>
      computeCensusCoverage({ mediaObjectNames: ["NOT-A-UUID-AT-ALL/hero/photo.jpg"] })
    );
    const counts = computeCensusCoverage({
      mediaObjectNames: ["NOT-A-UUID-AT-ALL/hero/photo.jpg"],
    });
    assert.equal(counts.non_uuid_first_segment_count, 1);
    assert.equal(counts.orphaned_media_owner_count, 0);
    assert.equal(counts.owners_missing_participation_count, 0);
    assert.equal(counts.owners_participation_not_approved_count, 0);
  });

  test("uppercase auth.users id still matches a lowercase media folder (normalization is symmetric)", () => {
    const counts = computeCensusCoverage({
      mediaObjectNames: [`${ADULT_1}/hero/photo.jpg`], // lowercase
      authUserIds: [UPPER], // uppercase — same identity, opposite case from the media folder
      participationRows: [{ ownerUserId: ADULT_1, status: "approved" }],
    });
    assert.equal(counts.orphaned_media_owner_count, 0);
    assert.deepEqual(evaluateGoNoGo(counts), { decision: "GO", blockingReasons: [] });
  });
});

describe("evaluateGoNoGo — contract", () => {
  test("throws on a missing required count rather than silently treating it as zero", () => {
    assert.throws(() => evaluateGoNoGo({ ...ZERO_COUNTS, owners_missing_participation_count: undefined }));
  });

  test("throws on a non-numeric required count", () => {
    assert.throws(() => evaluateGoNoGo({ ...ZERO_COUNTS, orphaned_media_owner_count: "0" }));
  });

  test("BLOCKING_COUNTS and INFORMATIONAL_COUNTS partition the full count set with no overlap", () => {
    const all = [...BLOCKING_COUNTS, ...INFORMATIONAL_COUNTS];
    assert.equal(new Set(all).size, all.length, "no count name appears in both lists");
    assert.deepEqual(new Set(all), new Set(Object.keys(ZERO_COUNTS)));
  });

  test("an informational count may be non-zero and still produce GO", () => {
    const counts = { ...ZERO_COUNTS, profile_owner_count: 500, media_owner_count: 500 };
    assert.deepEqual(evaluateGoNoGo(counts), { decision: "GO", blockingReasons: [] });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// validateCensusCoverageSql — static structural checks on the real .sql file,
// mutation-tested so removal/weakening of either coverage query is caught.
// ════════════════════════════════════════════════════════════════════════════

describe("validateCensusCoverageSql — baseline and mutation tests", () => {
  const REAL_SQL = readFileSync(CENSUS_SQL_PATH, "utf8");

  test("the real census SQL satisfies the coverage contract", () => {
    assert.deepEqual(validateCensusCoverageSql(REAL_SQL), []);
  });

  test("removing the missing-participation query's NOT EXISTS is caught", () => {
    const mutated = REAL_SQL.replace(
      /select count\(\*\) as owners_missing_participation_count[\s\S]*?;/,
      "select count(*) as owners_missing_participation_count from coverage_union;"
    );
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(problems.some((p) => p.includes("NOT EXISTS")));
  });

  test("removing the non-approved query's status <> 'approved' condition is caught", () => {
    // \r?\n, not a literal \n: this file's working-copy line endings are CRLF.
    const mutated = REAL_SQL.replace(
      /join public\.athlete_participation p on p\.owner_user_id::text = c\.owner_id\r?\nwhere p\.status <> 'approved';/,
      "join public.athlete_participation p on p.owner_user_id::text = c.owner_id;"
    );
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(problems.some((p) => p.includes("no real status <>")));
  });

  test("commenting out the status condition (leaving the words present, statement still valid) is still caught", () => {
    // Commenting out the WHOLE line including its trailing `;` would leave the
    // statement with no terminator at all — not a representative mutation, and
    // not valid SQL either. This instead comments out only the condition itself
    // and keeps a bare `;` to terminate the statement validly — exactly what
    // "leave the words present, just make them inert" looks like in practice:
    // the resulting query still runs, it just no longer filters by status.
    const mutated = REAL_SQL.replace(
      "where p.status <> 'approved';",
      "-- where p.status <> 'approved'\n;"
    );
    assert.notEqual(mutated, REAL_SQL);
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(
      problems.some((p) => p.includes("no real status <>")),
      `a commented-out condition must not satisfy the check, got: ${JSON.stringify(problems)}`
    );
  });

  test("swapping media_owners_real for media_owners_canonical (re-admitting orphaned owners) is caught", () => {
    const mutated = REAL_SQL.replaceAll(
      "select owner_segment as owner_id from media_owners_real",
      "select owner_segment as owner_id from media_owners_canonical"
    );
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(problems.some((p) => p.includes("media_owners_real")));
  });

  test("deleting the missing-participation query entirely is caught", () => {
    const mutated = REAL_SQL.replace(
      /select count\(\*\) as owners_missing_participation_count[\s\S]*?;\r?\n\r?\n/,
      ""
    );
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(problems.some((p) => p.includes("no executable statement selecting owners_missing_participation_count")));
  });

  // BLOCKER 1 (repair pass) — four false-passes Codex independently reproduced
  // against the previous version of this validator. Each is applied to the REAL
  // SQL text here, not a synthetic fragment, so the regression test exercises
  // exactly the attack that was proven to slip through.

  test("BLOCKER 1 (repair) case 1 — UNION changed to UNION ALL is caught", () => {
    const mutated = REAL_SQL.replaceAll(/\bunion\b(?!\s+all)/gi, "union all");
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(
      problems.some((p) => p.includes("UNION ALL, not UNION")),
      `expected a UNION ALL finding, got: ${JSON.stringify(problems)}`
    );
  });

  test("BLOCKER 1 (repair) case 2 — coverage_union swapped to media_owners_canonical, with a decoy media_owners_real reference left elsewhere, is caught", () => {
    // The decoy: an unused reference to "media_owners_real" survives (inside a
    // comment-like trailing fragment appended to the same line) while the
    // ACTUAL select inside coverage_union now reads from the un-auth-verified
    // canonical set. A naive whole-statement substring check for
    // "media_owners_real" would be satisfied by the decoy; this one is not,
    // because it is scoped to the isolated coverage_union CTE body.
    const mutated = REAL_SQL.replaceAll(
      "select owner_segment as owner_id from media_owners_real",
      "select owner_segment as owner_id from media_owners_canonical /* media_owners_real */"
    );
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(
      problems.some((p) => p.includes("does not select FROM media_owners_real")),
      `expected a media_owners_real finding, got: ${JSON.stringify(problems)}`
    );
  });

  test("BLOCKER 1 (repair) case 3 — missing-participation replaced by literal 0 with required keywords hidden inside a STRING LITERAL is caught", () => {
    // Not a comment this time — the decoy keywords are genuine string-literal
    // CONTENT, which a comment-only strip preserves verbatim. Only blanking
    // string-literal contents (blankStringLiterals) defeats this.
    const re = /select count\(\*\) as owners_missing_participation_count[\s\S]*?;/;
    const mutated = REAL_SQL.replace(
      re,
      "select 0 as owners_missing_participation_count from (select " +
        "'not exists ( coverage_union public.athlete_participation )' as decoy) x;"
    );
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(
      problems.some((p) => p.includes("missing its NOT EXISTS anti-join")),
      `expected a NOT EXISTS finding, got: ${JSON.stringify(problems)}`
    );
    assert.ok(
      problems.some((p) => p.includes("does not reference public.athlete_participation")),
      `expected an athlete_participation finding, got: ${JSON.stringify(problems)}`
    );
  });

  test("BLOCKER 1 (repair) case 4 — AND FALSE appended to disable the non-approved condition is caught", () => {
    const mutated = REAL_SQL.replace(
      "where p.status <> 'approved';",
      "where p.status <> 'approved' and false;"
    );
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(
      problems.some((p) => p.includes("bare boolean literal")),
      `expected a bare-boolean-literal finding, got: ${JSON.stringify(problems)}`
    );
    // The required-condition substring is STILL present (that is the whole
    // point of this attack), so this specifically proves the boolean-literal
    // check is what catches it, not the substring-presence check alone.
    assert.match(REAL_SQL, /status\s*<>\s*'approved'/);
  });

  test("a legitimate 'approved' string literal does not itself trigger the boolean-literal or decoy checks", () => {
    // The flip side of case 3/4: the real file's own genuine use of a string
    // literal ('approved') and comparison operators must not be mistaken for
    // an attack. This is exactly the baseline test above, restated as an
    // explicit non-regression case for this pair of new checks specifically.
    const problems = validateCensusCoverageSql(REAL_SQL);
    assert.deepEqual(problems, []);
  });

  // BLOCKER 1 (second repair) — PostgreSQL dollar-quoted strings ($$...$$ and
  // tagged $foo$...$foo$) are a second decoy vector string-literal blanking
  // alone did not cover: before this fix, a dollar-quoted literal's contents
  // were read as live executable text by the structural checks, exactly as
  // an unblanked single-quoted string would be.

  test("BLOCKER 1 (second repair) case 1 — Codex's exact untagged dollar-quote decoy reproduction is caught", () => {
    // The exact reproduction from the finding: a literal 0, with every
    // required keyword hidden inside an UNTAGGED dollar-quoted string rather
    // than a single-quoted one.
    const re = /select count\(\*\) as owners_missing_participation_count[\s\S]*?;/;
    // A function replacer, not a string — String.replace's STRING replacement
    // form treats `$$` as an escape for a literal single `$` (same for `$&`,
    // $`, $', $1-$9), which would silently collapse this decoy's own `$$`
    // delimiters before it ever reached the validator. A function replacer's
    // return value is inserted verbatim, with no such reinterpretation.
    const mutated = REAL_SQL.replace(
      re,
      () =>
        "select 0 as owners_missing_participation_count\nfrom (\n" +
        "  select $$not exists ( coverage_union public.athlete_participation )$$ as decoy\n" +
        ") x;"
    );
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    assert.ok(mutated.includes("$$not exists"), "the decoy's $$ delimiters must survive the replace");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(
      problems.some((p) => p.includes("missing its NOT EXISTS anti-join")),
      `expected a NOT EXISTS finding, got: ${JSON.stringify(problems)}`
    );
    assert.ok(
      problems.some((p) => p.includes("does not reference public.athlete_participation")),
      `expected an athlete_participation finding, got: ${JSON.stringify(problems)}`
    );
  });

  test("BLOCKER 1 (second repair) case 2 — a TAGGED dollar-quote decoy ($foo$...$foo$) is caught the same way", () => {
    const re = /select count\(\*\) as owners_missing_participation_count[\s\S]*?;/;
    const mutated = REAL_SQL.replace(
      re,
      "select 0 as owners_missing_participation_count\nfrom (\n" +
        "  select $foo$not exists ( coverage_union public.athlete_participation )$foo$ as decoy\n" +
        ") x;"
    );
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(
      problems.some((p) => p.includes("missing its NOT EXISTS anti-join")),
      `expected a NOT EXISTS finding, got: ${JSON.stringify(problems)}`
    );
    assert.ok(
      problems.some((p) => p.includes("does not reference public.athlete_participation")),
      `expected an athlete_participation finding, got: ${JSON.stringify(problems)}`
    );
  });

  test("BLOCKER 1 (second repair) case 3 — a dollar-quote decoy standing in for the non-approved query's real join/condition is caught", () => {
    // Same style as case 3 of the first BLOCKER 1 repair pass (real content
    // removed, decoy keywords left behind) but using a dollar-quoted literal
    // instead of a single-quoted one as the hiding place.
    // Function replacer — see case 1's comment: a string replacement would
    // let `$$` collapse to a literal single `$` before the validator ever
    // saw the decoy.
    const mutated = REAL_SQL.replace(
      /join public\.athlete_participation p on p\.owner_user_id::text = c\.owner_id\r?\nwhere p\.status <> 'approved';/,
      () =>
        "where $$join public.athlete_participation p on p.owner_user_id::text = c.owner_id and p.status <> 'approved'$$ is not null;"
    );
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    assert.ok(mutated.includes("$$join"), "the decoy's $$ delimiters must survive the replace");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(
      problems.some((p) => p.includes("does not JOIN public.athlete_participation")),
      `expected a JOIN finding, got: ${JSON.stringify(problems)}`
    );
    assert.ok(
      problems.some((p) => p.includes("no real status <>")),
      `expected a status condition finding, got: ${JSON.stringify(problems)}`
    );
  });

  test("BLOCKER 1 (second repair) case 4 — valid real SQL containing no dollar-quote decoy still passes", () => {
    assert.deepEqual(validateCensusCoverageSql(REAL_SQL), []);
  });

  // BLOCKER 2 (follow-up finding) — orphaned_media_owner_count must
  // deduplicate by normalized UUID identity, not raw path text, or a
  // case-variant duplicate of the same real UUID is double-counted in SQL
  // while the JS mirror (which normalizes before counting) reports it once.

  test("orphan dedup (BLOCKER 2 follow-up) — reverting count(distinct f.owner_segment::uuid) to count(*) is caught", () => {
    const mutated = REAL_SQL.replace(
      "select count(distinct f.owner_segment::uuid) as orphaned_media_owner_count",
      "select count(*) as orphaned_media_owner_count"
    );
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(
      problems.some((p) => p.includes("does not deduplicate by normalized UUID identity")),
      `expected an orphan-dedup finding, got: ${JSON.stringify(problems)}`
    );
  });

  // FINAL BLOCKER — the approved-value check must be BOUND to the same
  // executable comparison it validates structurally, not a comparison found
  // in one place plus an independent 'approved' search elsewhere. Codex
  // reproduced two false-passes: a real `status <> 'revoked'` comparison
  // alongside an unrelated, inert `'approved'` substring hidden inside a
  // dollar-quoted literal — the old independent search found the decoy text
  // and wrongly passed, even though the ACTUAL executable comparison was
  // against 'revoked', not 'approved'.

  function statusDecoyMutation(decoyLiteral) {
    return REAL_SQL.replace(
      /join public\.athlete_participation p on p\.owner_user_id::text = c\.owner_id\r?\nwhere p\.status <> 'approved';/,
      () =>
        "join public.athlete_participation p on p.owner_user_id::text = c.owner_id\n" +
        "where p.status <> 'revoked'\n" +
        `  and length(${decoyLiteral}) > 0;`
    );
  }

  test("final blocker case 1 — real status <> 'revoked' plus an UNTAGGED dollar-quoted 'approved' decoy is caught (Codex's exact reproduction)", () => {
    const mutated = statusDecoyMutation("$$status <> 'approved'$$");
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(
      problems.some((p) => p.includes("not comparing against exactly 'approved'") && p.includes("revoked")),
      `expected a finding naming the real 'revoked' comparison, got: ${JSON.stringify(problems)}`
    );
  });

  test("final blocker case 2 — real status <> 'revoked' plus a TAGGED dollar-quoted 'approved' decoy is caught (Codex's exact reproduction)", () => {
    const mutated = statusDecoyMutation("$foo$status <> 'approved'$foo$");
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(
      problems.some((p) => p.includes("not comparing against exactly 'approved'") && p.includes("revoked")),
      `expected a finding naming the real 'revoked' comparison, got: ${JSON.stringify(problems)}`
    );
  });

  test("final blocker case 3 — real status <> 'revoked' plus an ORDINARY unrelated single-quoted 'approved' decoy is caught", () => {
    const mutated = statusDecoyMutation("'status <> ''approved'''");
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(
      problems.some((p) => p.includes("not comparing against exactly 'approved'") && p.includes("revoked")),
      `expected a finding naming the real 'revoked' comparison, got: ${JSON.stringify(problems)}`
    );
  });

  test("final blocker case 4 — p.status = 'approved' (wrong operator, not <>) is caught", () => {
    const mutated = REAL_SQL.replace("where p.status <> 'approved';", "where p.status = 'approved';");
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(
      problems.some((p) => p.includes("has no real status <> '...' condition")),
      `expected a missing-comparison finding (wrong operator), got: ${JSON.stringify(problems)}`
    );
  });

  test("final blocker case 5 — the correct p.status <> 'approved' passes", () => {
    assert.deepEqual(validateCensusCoverageSql(REAL_SQL), []);
  });

  // TWO FINAL DEFECTS — (1) the exact-comparison check was anchored on the
  // structural side but still read its VALUE via an unanchored, case-
  // insensitive substring test, so `status <> 'approved''revoked'` (one
  // escaped literal) and `status <> 'APPROVED'` both slipped through; (2)
  // the literal-preserving companion statement was found by an INDEPENDENT
  // `with ... ;` search over unblanked text, so a `;` inside a dollar-quoted
  // literal (invisible to the structural search, which blanks it) could
  // truncate that independent search and produce a false "missing status
  // condition" finding on an otherwise-correct statement.

  function withRealStatusCondition(condition) {
    return REAL_SQL.replace("where p.status <> 'approved';", () => `where ${condition};`);
  }

  test("two final defects case 1 — p.status <> 'approved''revoked' (escaped extra content) is caught", () => {
    const mutated = withRealStatusCondition("p.status <> 'approved''revoked'");
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(
      problems.some((p) => p.includes("does not consist of EXACTLY status <> '...'")),
      `expected an exact-match finding, got: ${JSON.stringify(problems)}`
    );
  });

  test("two final defects case 2 — p.status <> 'APPROVED' (wrong case) is caught", () => {
    const mutated = withRealStatusCondition("p.status <> 'APPROVED'");
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.ok(
      problems.some((p) => p.includes("not comparing against exactly 'approved' (lowercase)")),
      `expected a case-sensitivity finding, got: ${JSON.stringify(problems)}`
    );
  });

  test("two final defects case 3 — where length($$;$$) > 0 and p.status <> 'approved'; passes (Codex's exact reproduction)", () => {
    const mutated = withRealStatusCondition("length($$;$$) > 0\n  and p.status <> 'approved'");
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.deepEqual(
      problems,
      [],
      `a semicolon hidden inside a dollar-quoted literal must not truncate the literal-preserving ` +
        `statement extraction, got: ${JSON.stringify(problems)}`
    );
  });

  test("two final defects case 4 — a TAGGED dollar-quote containing ; before the real predicate passes", () => {
    const mutated = withRealStatusCondition("length($tag$;$tag$) > 0\n  and p.status <> 'approved'");
    assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
    const problems = validateCensusCoverageSql(mutated);
    assert.deepEqual(
      problems,
      [],
      `a semicolon hidden inside a TAGGED dollar-quoted literal must not truncate the literal-preserving ` +
        `statement extraction, got: ${JSON.stringify(problems)}`
    );
  });

  test("two final defects case 5 — the correct plain p.status <> 'approved' still passes", () => {
    assert.deepEqual(validateCensusCoverageSql(REAL_SQL), []);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BLOCKER 2 (follow-up) — orphan-count case-variant parity, required fixtures.
//
// SQL's section 5c now dedupes orphan owners by normalized UUID identity
// (count(distinct f.owner_segment::uuid)), matching computeCensusCoverage's
// own normalize-then-Set dedup. These fixtures prove the JS mirror's side of
// that parity; the SQL side is proven structurally above.
// ════════════════════════════════════════════════════════════════════════════

describe("computeCensusCoverage — orphan count case-variant parity (BLOCKER 2 follow-up)", () => {
  test("the same orphaned UUID under two different-case storage paths counts once, not twice", () => {
    const counts = computeCensusCoverage({
      mediaObjectNames: [`${ORPHAN_1}/hero/a.jpg`, `${ORPHAN_1.toUpperCase()}/hero/b.jpg`],
      authUserIds: [], // ORPHAN_1 is absent from auth.users under either case
    });
    assert.equal(
      counts.orphaned_media_owner_count,
      1,
      "one real UUID under two case-variant paths must count as one orphan, not two"
    );
    assert.equal(evaluateGoNoGo(counts).decision, "NO-GO");
  });

  test("two genuinely different orphan UUIDs still count as two", () => {
    const ORPHAN_2 = "ffffffff-6666-6666-6666-666666666666";
    const counts = computeCensusCoverage({
      mediaObjectNames: [`${ORPHAN_1}/hero/a.jpg`, `${ORPHAN_2}/hero/b.jpg`],
      authUserIds: [],
    });
    assert.equal(counts.orphaned_media_owner_count, 2);
  });

  test("a malformed (non-UUID) path never enters orphan counting, case notwithstanding", () => {
    const counts = computeCensusCoverage({
      mediaObjectNames: ["NOT-A-UUID/hero/a.jpg"],
      authUserIds: [],
    });
    assert.equal(counts.orphaned_media_owner_count, 0);
    assert.equal(counts.non_uuid_first_segment_count, 1);
  });
});
