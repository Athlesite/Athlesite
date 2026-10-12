/**
 * The canonical-UUID-format check used by participation-census.sql, mirrored here
 * in JavaScript so it is directly unit-testable.
 *
 * There is no local Postgres in this environment (confirmed: no `supabase` CLI, no
 * linked local stack — see the Guardian-First Participation Phase 1a report), so
 * the real SQL regex cannot be executed against a real `::uuid` cast as part of
 * this test suite. This module exists so the VALIDATION LOGIC can be proven correct
 * in isolation, and `participation-sql-contract.test.mjs` separately asserts the
 * .sql file contains this exact pattern string — tying the two together so they
 * cannot silently drift apart.
 *
 * Exactly 8-4-4-4-12 hex digits with hyphens required at exactly those four
 * positions and nowhere else. A string matching this pattern is unconditionally
 * accepted by PostgreSQL's text-to-uuid cast, so validating with this regex FIRST
 * means the cast that follows in the SQL can never throw — see that file's own
 * comment for the full reasoning, including the "36 hyphens" and "wrong hyphen
 * placement" inputs that a looser `{36}`-length-only pattern would wrongly accept
 * and then crash on.
 */
import { stripSqlComments } from "./participation-sql-contract.mjs";

export const CANONICAL_UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The exact source text of CANONICAL_UUID_PATTERN, for the SQL cross-check. */
export const CANONICAL_UUID_PATTERN_SOURCE = CANONICAL_UUID_PATTERN.source;

/**
 * Whether `segment` is a syntactically valid UUID in the canonical 8-4-4-4-12
 * hyphenated form. Says nothing about whether that UUID exists in `auth.users` —
 * see participation-census.sql's section 5c, a separate, later check that is only
 * ever reached for a segment this function has already approved.
 */
export function isCanonicalUuidFormat(segment) {
  if (typeof segment !== "string") return false;
  return CANONICAL_UUID_PATTERN.test(segment);
}

/**
 * The exact set of coverage-affecting count names, and which side of the Phase 1b
 * go/no-go line each one sits on.
 *
 * "Blocking": any non-zero value means NO-GO. "Informational": these may be any
 * value, including non-zero, and the cutover is still a GO — they describe the
 * population, not a defect in it. Keeping this as one explicit table, rather than
 * leaving "which counts matter" implicit in prose, is the fix for the finding this
 * checkpoint exists to close: a reader (or a future refactor) must not be able to
 * quietly drop a blocking count into the informational set, or vice versa, without
 * changing a line that says so in exactly one place.
 */
export const BLOCKING_COUNTS = [
  "missing_first_segment_count",
  "non_uuid_first_segment_count",
  "orphaned_media_owner_count",
  "owners_missing_participation_count",
  "owners_participation_not_approved_count",
];

export const INFORMATIONAL_COUNTS = [
  "profile_owner_count",
  "media_owner_count",
  "profile_owners_without_media",
  "media_only_owner_count",
];

/**
 * Derives the Phase 1b go/no-go decision from a complete set of census counts.
 *
 * Takes the counts directly — not raw fixture data — so this is the one function
 * both a founder (pasting real numbers read back from the SQL Editor) and a test
 * (computing expected numbers from `computeCensusCoverage` below) can call to get
 * the same decision from the same rule. `missing_first_segment_count` and
 * `non_uuid_first_segment_count` ∈ BLOCKING_COUNTS are included deliberately even
 * though Phase 1a's own architecture treats malformed paths as a cleanup
 * precondition rather than a participation question — they are still a reason the
 * cutover's own census isn't trustworthy yet, so they still block GO.
 *
 * Throws on a missing or non-numeric required count rather than silently treating
 * `undefined` as zero — a founder transcription gap must surface as an error, not
 * as an accidental GO.
 */
export function evaluateGoNoGo(counts) {
  const blockingReasons = [];

  for (const name of BLOCKING_COUNTS) {
    const value = counts[name];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`evaluateGoNoGo: missing or non-numeric required count "${name}"`);
    }
    if (value !== 0) {
      blockingReasons.push({ count: name, value });
    }
  }

  return {
    decision: blockingReasons.length === 0 ? "GO" : "NO-GO",
    blockingReasons,
  };
}

/** The first storage.foldername(name)[1]-equivalent segment, or null if there is none. */
function firstPathSegment(objectName) {
  if (typeof objectName !== "string" || objectName === "") return null;
  const slashIndex = objectName.indexOf("/");
  // No slash at all means the object sits at the bucket root — storage.foldername
  // returns an empty array for that, which is exactly "no first segment", the same
  // outcome as an explicitly empty segment.
  if (slashIndex === -1) return null;
  const segment = objectName.slice(0, slashIndex);
  return segment === "" ? null : segment;
}

/**
 * Replaces the CONTENTS of every single-quoted string literal AND every
 * PostgreSQL dollar-quoted literal — `$$...$$` or a tagged form such as
 * `$foo$...$foo$` — with spaces (preserving the delimiters and overall
 * length), after comments have already been stripped. This is what lets the
 * structural keyword checks below treat a decoy — e.g. `select 0 ... from
 * (select 'not exists coverage_union public.athlete_participation' as decoy)
 * x`, or the dollar-quoted equivalent `select $$not exists ( coverage_union
 * public.athlete_participation )$$ as decoy` — as having NONE of those
 * keywords as real SQL tokens, exactly as a comment-only strip already does
 * for `--` comments. It must run AFTER `stripSqlComments`, never before: a
 * `'` or `$` inside a `--` comment must not be mistaken for the start of a
 * real literal once the comment is gone.
 *
 * Dollar-quote handling: PostgreSQL's dollar-quote delimiter is `$`, an
 * OPTIONAL tag made of identifier characters, then `$` again — the same
 * delimiter (same tag, or no tag) closes it. The delimiter actually found at
 * the open is the only one searched for to close it — exactly how Postgres
 * itself parses it — so dollar-quoted content is never treated as executable
 * SQL by this function or by any caller; it is blanked precisely so it
 * CANNOT satisfy a structural check, the same as a single-quoted string.
 *
 * Only ever used for STRUCTURAL checks (does this statement contain a real
 * NOT EXISTS, a real reference to athlete_participation, a real UNION, …).
 * Checks that need to read an actual literal VALUE — `status <> 'approved'` —
 * use the comment-stripped-but-not-literal-blanked text instead, via the
 * `stripped` variable in `validateCensusCoverageSql` below.
 */
function blankStringLiterals(strippedSql) {
  let out = "";
  let i = 0;
  let inSingleQuote = false;
  let dollarTag = null;

  while (i < strippedSql.length) {
    const ch = strippedSql[i];

    if (inSingleQuote) {
      if (ch === "'") {
        if (strippedSql[i + 1] === "'") {
          out += "  ";
          i += 2;
          continue;
        }
        inSingleQuote = false;
        out += "'";
        i += 1;
        continue;
      }
      out += ch === "\n" ? "\n" : " ";
      i += 1;
      continue;
    }

    if (dollarTag !== null) {
      if (strippedSql.startsWith(dollarTag, i)) {
        out += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      out += ch === "\n" ? "\n" : " ";
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === "$") {
      const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(strippedSql.slice(i));
      if (match) {
        dollarTag = match[0];
        out += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    out += ch;
    i += 1;
  }

  return out;
}

/**
 * True if `text` contains a bare boolean literal (`true`/`false`) as a keyword —
 * not as part of a longer identifier. Mirrors `containsBareBooleanLiteral` in
 * participation-sql-contract.mjs (kept as an independent copy rather than a
 * shared import, since this file already imports only `stripSqlComments` from
 * that module and the two check genuinely different SQL files for the same
 * underlying reason). Neither census coverage query has any legitimate reason
 * to contain this keyword anywhere, so its presence is itself the finding — the
 * structural fix for an appended `AND FALSE` or `OR TRUE` that a substring-
 * presence check on the REQUIRED condition alone would never see, because
 * nothing required was removed.
 */
function containsBareBooleanLiteral(text) {
  return /(^|[^a-zA-Z0-9_'])(true|false)([^a-zA-Z0-9_']|$)/i.test(text);
}

/**
 * Isolates a named `<cteName> as ( ... )` CTE body within `statement`, by
 * paren-depth counting from the first `(` after the CTE name — the same
 * approach `extractConstraintBody` in participation-sql-contract.mjs uses.
 * Returns `null` if the CTE is not found at all (a missing CTE is reported by
 * its own caller-side check, not here).
 */
function extractNamedCteBody(statement, cteName) {
  const marker = statement.search(new RegExp(`${cteName}\\s+as\\s*\\(`, "i"));
  if (marker === -1) return null;
  const openParenIndex = statement.indexOf("(", marker);
  if (openParenIndex === -1) return null;

  let depth = 1;
  let i = openParenIndex + 1;
  while (i < statement.length && depth > 0) {
    if (statement[i] === "(") depth += 1;
    else if (statement[i] === ")") depth -= 1;
    i += 1;
  }
  return statement.slice(openParenIndex + 1, i - 1);
}

/**
 * Validates that `participation-census.sql` actually contains the two coverage
 * queries — as real, EXECUTABLE SQL structure, not as a comment or a string
 * literal claiming they exist. Returns a list of problem strings; empty means
 * compliant.
 *
 * This is the SQL-side counterpart to `computeCensusCoverage`: that function
 * proves the LOGIC is correct against fixtures; this proves the REAL FILE still
 * contains that logic. Every structural check below runs against
 * `structuralOnly` — comments stripped AND string-literal contents blanked —
 * so neither a decoy comment nor a decoy string literal can satisfy a
 * structural requirement. The one check that needs to read a real literal VALUE
 * (`status <> 'approved'`) uses `stripped` (comments stripped only) instead,
 * since blanking would destroy the very literal it needs to find.
 */
export function validateCensusCoverageSql(sql) {
  const stripped = stripSqlComments(sql);
  const structuralOnly = blankStringLiterals(stripped);
  const problems = [];

  const missingParticipationStatement = [...structuralOnly.matchAll(/select[\s\S]*?;/gi)].find(
    (m) => /owners_missing_participation_count/i.test(m[0])
  )?.[0];

  if (!missingParticipationStatement) {
    problems.push("census: no executable statement selecting owners_missing_participation_count");
  } else {
    if (!/not\s+exists\s*\(/i.test(missingParticipationStatement)) {
      problems.push(
        "census: owners_missing_participation_count statement is missing its NOT EXISTS anti-join"
      );
    }
    if (!/public\.athlete_participation/i.test(missingParticipationStatement)) {
      problems.push(
        "census: owners_missing_participation_count statement does not reference public.athlete_participation"
      );
    }
    if (!/coverage_union/i.test(missingParticipationStatement)) {
      problems.push(
        "census: owners_missing_participation_count statement does not use the shared coverage_union"
      );
    }
    if (containsBareBooleanLiteral(missingParticipationStatement)) {
      problems.push(
        "census: owners_missing_participation_count statement contains a bare boolean literal " +
          "(true/false) — this is exactly the shape of an inert AND FALSE/OR TRUE weakening"
      );
    }
  }

  // FIX for the finding Codex caught: the literal-preserving companion
  // statement used to be found by an INDEPENDENT `stripped.matchAll(...)`
  // call — a second, separate lazy `with ... ;` search over the unblanked
  // text. A `;` inside a dollar-quoted literal (e.g. `length($$;$$) > 0`) is
  // invisible to `structuralOnly`'s search (blanked away, so it cannot
  // terminate the statement early) but very much visible to a SEPARATE
  // search over `stripped` — so the independent re-split would stop at that
  // fake semicolon and return a truncated, wrong statement. The fix: find
  // the statement ONCE, in `structuralOnly`, and derive the literal-
  // preserving companion by slicing `stripped` at that SAME match's
  // absolute index and length — never by re-finding/re-splitting it. This is
  // sound because `blankStringLiterals` never changes string length, so
  // `structuralOnly` and `stripped` are character-for-character the same
  // length and a match's absolute offset in one is the identical offset in
  // the other.
  const notApprovedMatch = [...structuralOnly.matchAll(/with[\s\S]*?;/gi)].find((m) =>
    /owners_participation_not_approved_count/i.test(m[0])
  );
  const notApprovedStatement = notApprovedMatch?.[0];
  const notApprovedStatementWithLiterals = notApprovedMatch
    ? stripped.slice(notApprovedMatch.index, notApprovedMatch.index + notApprovedMatch[0].length)
    : undefined;

  if (!notApprovedStatement) {
    problems.push("census: no executable statement selecting owners_participation_not_approved_count");
  } else {
    if (!/join\s+public\.athlete_participation/i.test(notApprovedStatement)) {
      problems.push(
        "census: owners_participation_not_approved_count statement does not JOIN public.athlete_participation"
      );
    }
    // BOUND check — the structural match and the value read are the SAME
    // comparison, not two independent searches. The previous version checked
    // (1) "does some status <> '...' shape exist structurally" and (2) "does
    // the string 'approved' appear anywhere in the unblanked statement" as
    // two separate questions — which a decoy defeats by supplying a REAL
    // `status <> 'revoked'` comparison (satisfying check 1 on its own) plus
    // an unrelated, inert `'approved'` substring elsewhere, e.g. inside
    // `length($$status <> 'approved'$$) > 0` (satisfying check 2 on its own,
    // via text that is not even the comparison check 1 found).
    //
    // The fix: find the comparison structurally first, then read its
    // right-hand-side VALUE from the exact same character range — never an
    // independent search. This is sound because blankStringLiterals never
    // changes string length (every quoted/dollar-quoted character is
    // replaced one-for-one with a space, or copied through unchanged for a
    // matched delimiter), so `notApprovedStatement` (blanked) and
    // `notApprovedStatementWithLiterals` (unblanked) are character-for-
    // character the same length, and a match's offset in one is the
    // identical offset in the other.
    const comparisonMatch = /status\s*<>\s*'[^']*'/i.exec(notApprovedStatement);
    if (!comparisonMatch) {
      problems.push(
        "census: owners_participation_not_approved_count statement has no real status <> '...' " +
          "condition (string-literal-blanked and dollar-quote-blanked structure shows none) — a " +
          "decoy hiding this text inside a string or dollar-quoted literal must not satisfy this check"
      );
    } else {
      const start = comparisonMatch.index;
      const end = start + comparisonMatch[0].length;
      const realComparisonText = (notApprovedStatementWithLiterals ?? "").slice(start, end);
      // FULLY ANCHORED (^...$) against the EXACT slice, not an unanchored
      // substring search — fix for the finding Codex caught: an unanchored
      // `/status\s*<>\s*'approved'/i.test(...)` only has to match a PREFIX of
      // realComparisonText, so `status <> 'approved''revoked'` (one escaped
      // literal whose real value is "approved'revoked") would still "pass"
      // by matching just its first 'approved'-shaped portion and ignoring
      // the rest. Anchoring both ends forces the WHOLE matched range — the
      // same range comparisonMatch found structurally — to be nothing but
      // this one exact comparison, with no leftover concatenated/escaped
      // content on either side.
      //
      // The literal's VALUE is captured and compared with strict `!==`, not
      // read via a second case-insensitive regex test — this is what keeps
      // 'APPROVED' from passing: the `i` flag below only makes the `status`
      // keyword and `<>` operator match case-insensitively (reasonable
      // formatting slack), never the captured literal content itself, which
      // is compared as plain, case-sensitive JS string equality.
      const exactMatch = /^status\s*<>\s*'([^']*)'$/i.exec(realComparisonText);
      if (!exactMatch) {
        problems.push(
          "census: owners_participation_not_approved_count statement's status comparison does not " +
            `consist of EXACTLY status <> '...' with nothing else concatenated or escaped onto it ` +
            `(found: ${JSON.stringify(realComparisonText)})`
        );
      } else if (exactMatch[1] !== "approved") {
        problems.push(
          "census: owners_participation_not_approved_count statement's status comparison is not " +
            `comparing against exactly 'approved' (lowercase) — found: ${JSON.stringify(realComparisonText)}`
        );
      }
    }
    if (!/coverage_union/i.test(notApprovedStatement)) {
      problems.push(
        "census: owners_participation_not_approved_count statement does not use the shared coverage_union"
      );
    }
    if (containsBareBooleanLiteral(notApprovedStatement)) {
      problems.push(
        "census: owners_participation_not_approved_count statement contains a bare boolean literal " +
          "(true/false) — this is exactly the shape of an inert AND FALSE/OR TRUE weakening, such as " +
          "appending AND FALSE to disable the status <> 'approved' condition without removing it"
      );
    }
  }

  // Both queries must build coverage_union FROM media_owners_real, not
  // media_owners_canonical, and via UNION (not UNION ALL) — checked specifically
  // within the coverage_union CTE's own isolated body (paren-depth-counted, not
  // text-sliced), so neither a decoy reference elsewhere in the statement nor a
  // CTE's own declaration name (which contains the substring "media_owners_real"
  // regardless of whether anything actually selects from it) can satisfy either
  // check.
  for (const [label, statement] of [
    ["owners_missing_participation_count", missingParticipationStatement],
    ["owners_participation_not_approved_count", notApprovedStatement],
  ]) {
    if (!statement) continue;

    const unionCteBody = extractNamedCteBody(statement, "coverage_union");
    if (unionCteBody === null) {
      problems.push(`census: ${label} statement has no isolable coverage_union CTE body`);
      continue;
    }

    if (!/from\s+media_owners_real/i.test(unionCteBody)) {
      problems.push(
        `census: ${label} statement's coverage_union does not select FROM media_owners_real ` +
          `(auth.users-verified) — an orphaned owner would be double-counted`
      );
    }

    // UNION, not UNION ALL — isolated to the CTE body specifically, so this
    // cannot be satisfied by a legitimate "union" elsewhere in the statement
    // (there is none today, but the check should not depend on that staying
    // true) and cannot miss a UNION ALL that lives inside this exact CTE.
    if (!/\bunion\b/i.test(unionCteBody)) {
      problems.push(`census: ${label} statement's coverage_union does not use UNION at all`);
    } else if (/\bunion\s+all\b/i.test(unionCteBody)) {
      problems.push(
        `census: ${label} statement's coverage_union uses UNION ALL, not UNION — this would let the ` +
          `same owner (profile row AND media row) be counted twice toward a blocking total`
      );
    }

    // BLOCKER 2's SQL-side fix, checked structurally: media_owners_real's own
    // SELECT must cast owner_segment through ::uuid and back to ::text, not
    // select the raw path text. Isolated to media_owners_real's OWN CTE body
    // (not coverage_union's, which only ever references it by name) — the same
    // paren-depth isolation as above, for the same reason: a decoy comment or a
    // reference elsewhere in the statement must not be able to satisfy this.
    // Reverting to `select m.owner_segment` (raw text) is exactly the
    // regression this check exists to catch: it reintroduces the case-sensitive
    // identity bug BLOCKER 2 fixed, where an uppercase media folder for the
    // same real UUID as a lowercase athlete_profiles/athlete_participation
    // owner_user_id fails to dedupe or match in coverage_union above.
    const realCteBody = extractNamedCteBody(statement, "media_owners_real");
    if (realCteBody === null) {
      problems.push(`census: ${label} statement has no isolable media_owners_real CTE body`);
    } else if (!/select\s*\(\s*m\.owner_segment\s*::\s*uuid\s*\)\s*::\s*text/i.test(realCteBody)) {
      problems.push(
        `census: ${label} statement's media_owners_real CTE does not normalize owner_segment ` +
          `through (::uuid)::text — a raw-case media folder for the same real UUID as a ` +
          `lowercase athlete_profiles/athlete_participation owner would fail to dedupe or match`
      );
    }
  }

  // BLOCKER 2 (follow-up finding) — the orphaned_media_owner_count statement
  // (section 5c) must deduplicate by normalized UUID identity, not by raw
  // path text, or a case-variant duplicate of the same real UUID would be
  // double-counted here while the JS mirror (which normalizes before
  // counting) reports it once — the two sides would disagree on a real
  // census run. Isolated the same way as the coverage queries above: matched
  // directly against `structuralOnly` (this statement has no legitimate
  // string literal to preserve, so there is no need for a literal-preserving
  // variant here), with a bare-boolean-literal check for the same inert-
  // predicate-injection reason as the coverage queries.
  const orphanStatement = [...structuralOnly.matchAll(/with[\s\S]*?;/gi)].find((m) =>
    /orphaned_media_owner_count/i.test(m[0])
  )?.[0];

  if (!orphanStatement) {
    problems.push("census: no executable statement selecting orphaned_media_owner_count");
  } else {
    if (!/count\s*\(\s*distinct\s+f\.owner_segment\s*::\s*uuid\s*\)/i.test(orphanStatement)) {
      problems.push(
        "census: orphaned_media_owner_count statement does not deduplicate by normalized UUID " +
          "identity (count(distinct f.owner_segment::uuid)) — a case-variant duplicate of the same " +
          "real UUID would be counted twice here while the JS mirror counts it once"
      );
    }
    if (!/not\s+exists\s*\(/i.test(orphanStatement)) {
      problems.push("census: orphaned_media_owner_count statement is missing its NOT EXISTS anti-join");
    }
    if (containsBareBooleanLiteral(orphanStatement)) {
      problems.push(
        "census: orphaned_media_owner_count statement contains a bare boolean literal (true/false)"
      );
    }
  }

  return problems;
}

/**
 * Computes every census count — the five Phase 1a owner/path counts plus the two
 * Phase 1b coverage counts — from plain fixture data, as a pure function. This is
 * what makes the SQL's logic testable without a live Postgres: it is a direct,
 * side-by-side mirror of participation-census.sql's own queries, kept in lockstep
 * by the fixture-based tests in participation-census-validation.test.mjs, in
 * exactly the way `isCanonicalUuidFormat` mirrors section 5b.
 *
 * Inputs:
 *   - profileOwnerIds: string[] — athlete_profiles.owner_user_id values
 *   - mediaObjectNames: string[] — storage.objects.name values for bucket_id =
 *     'athlete-media' (the full object path; only the first segment is used)
 *   - participationRows: { ownerUserId: string, status: string }[]
 *   - authUserIds: string[] — auth.users.id values
 */
/**
 * Normalizes a string to lowercase UUID identity, mirroring the SQL-side fix: a
 * value is normalized only after it is already known to be a valid UUID — for a
 * canonical-format segment, casting through `::uuid::text` in Postgres always
 * yields lowercase, regardless of input case, because `uuid` is a 128-bit binary
 * type with no case of its own; the text form is purely an output convention.
 * `.toLowerCase()` on an already-canonical-format string is the exact JS
 * equivalent of that round-trip, for the same reason: case has no bearing on
 * which 128-bit value the string denotes.
 *
 * Applying this to a non-UUID string would be meaningless (and is never done
 * here) — callers normalize only after `isCanonicalUuidFormat` has already
 * approved the input, identically to where the SQL applies its own `::uuid` cast.
 */
function normalizeUuidIdentity(value) {
  return value.toLowerCase();
}

export function computeCensusCoverage({
  profileOwnerIds = [],
  mediaObjectNames = [],
  participationRows = [],
  authUserIds = [],
}) {
  // Identity sets used for coverage/orphan comparisons are normalized to
  // lowercase UUID identity — see normalizeUuidIdentity. `profileOwnerIds` and
  // `authUserIds` are real `uuid`-typed columns in Postgres, so they are already
  // canonical lowercase in practice; normalizing them here too is a defensive
  // no-op for real data and keeps fixtures honest about exercising mixed-case
  // input on EITHER side, not just the media-path side.
  const authUserIdSet = new Set(authUserIds.map(normalizeUuidIdentity));
  const profileOwnerIdSet = new Set(profileOwnerIds.map(normalizeUuidIdentity));
  // Raw (un-normalized), deduplicated — used only by the two informational,
  // SQL-section-3/4-equivalent counts below, which intentionally compare RAW
  // text with no case normalization, matching the SQL exactly.
  const profileOwnerIdSetRaw = new Set(profileOwnerIds);

  // Section 5: owner/path classification, exactly mirroring the SQL's own three
  // classes — missing segment, present-but-malformed, canonical-but-orphaned.
  // Segments are kept in their ORIGINAL case here: missing_first_segment_count
  // and non_uuid_first_segment_count describe raw path shapes, not owner
  // identity, and a non-canonical segment cannot be normalized at all (there is
  // no UUID to round-trip through).
  const firstSegments = mediaObjectNames.map(firstPathSegment);
  const missingFirstSegmentCount = firstSegments.filter((s) => s === null).length;

  const presentSegments = firstSegments.filter((s) => s !== null);
  const distinctPresentSegments = new Set(presentSegments);

  const nonUuidFirstSegmentCount = [...distinctPresentSegments].filter(
    (s) => !isCanonicalUuidFormat(s)
  ).length;

  // THE NORMALIZATION POINT (BLOCKER 2's fix): canonical-format segments are
  // normalized to lowercase UUID identity HERE, immediately after
  // `isCanonicalUuidFormat` has approved them — the same "validate, then
  // normalize" ordering the SQL side uses (section 5b's regex, then section
  // 6/7's `::uuid::text` cast). Every downstream owner-identity comparison
  // (orphan check, coverage union, participation lookup) uses this normalized
  // set, so an uppercase media folder and a lowercase `auth.users`/
  // `athlete_participation` row for the SAME UUID are recognized as the SAME
  // owner, not two different text strings that happen to collide in meaning.
  const canonicalSegmentsNormalized = new Set(
    [...distinctPresentSegments].filter(isCanonicalUuidFormat).map(normalizeUuidIdentity)
  );

  const orphanedMediaOwners = [...canonicalSegmentsNormalized].filter(
    (s) => !authUserIdSet.has(s)
  );
  const orphanedMediaOwnerCount = orphanedMediaOwners.length;

  // Real (canonical AND exists in auth.users) media owners, as normalized
  // identity — the only ones that can possibly have a participation row, and
  // the only ones the coverage union admits.
  const realMediaOwners = [...canonicalSegmentsNormalized].filter((s) => authUserIdSet.has(s));

  const mediaOwnerCount = distinctPresentSegments.size;

  // media_only_owner_count and profile_owners_without_media: mirrors SQL
  // sections 3/4, which compare the RAW media segment against
  // `owner_user_id::text` with no case normalization of their own. Left
  // intentionally un-normalized here to match that SQL exactly — these two
  // counts are INFORMATIONAL (describe the population; never block Phase 1b —
  // see INFORMATIONAL_COUNTS), so a mixed-case duplicate can at most make an
  // already-covered owner look like two distinct, uncorrelated entries in a
  // count that has no go/no-go consequence. BLOCKER 2 is scoped to the
  // BLOCKING counts (orphan/coverage), which are fixed above.
  const mediaOnlyOwnerCount = [...distinctPresentSegments].filter(
    (s) => !profileOwnerIdSetRaw.has(s)
  ).length;

  const profileOwnersWithoutMedia = [...profileOwnerIdSetRaw].filter(
    (id) => !distinctPresentSegments.has(id)
  ).length;

  // Sections 6/7: the coverage union — NORMALIZED profile owners, union
  // NORMALIZED real media owners, deduplicated exactly as SQL's `union`
  // deduplicates once both sides carry the same (lowercase) UUID identity.
  const coverageUnion = new Set([...profileOwnerIdSet, ...realMediaOwners]);

  const participationByOwner = new Map(
    participationRows.map((r) => [normalizeUuidIdentity(r.ownerUserId), r.status])
  );

  let ownersMissingParticipationCount = 0;
  let ownersParticipationNotApprovedCount = 0;
  for (const ownerId of coverageUnion) {
    if (!participationByOwner.has(ownerId)) {
      ownersMissingParticipationCount += 1;
    } else if (participationByOwner.get(ownerId) !== "approved") {
      ownersParticipationNotApprovedCount += 1;
    }
  }

  return {
    profile_owner_count: profileOwnerIdSet.size,
    media_owner_count: mediaOwnerCount,
    profile_owners_without_media: profileOwnersWithoutMedia,
    media_only_owner_count: mediaOnlyOwnerCount,
    missing_first_segment_count: missingFirstSegmentCount,
    non_uuid_first_segment_count: nonUuidFirstSegmentCount,
    orphaned_media_owner_count: orphanedMediaOwnerCount,
    owners_missing_participation_count: ownersMissingParticipationCount,
    owners_participation_not_approved_count: ownersParticipationNotApprovedCount,
  };
}
