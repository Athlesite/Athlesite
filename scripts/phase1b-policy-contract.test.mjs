import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PHASE_1B_MIGRATION,
  EXPECTED_POLICIES,
  validatePhase1bPolicyContract,
  validatePhase1bFromDisk,
} from "./phase1b-policy-contract.mjs";

const REAL_SQL = readFileSync(PHASE_1B_MIGRATION, "utf8");

/** Asserts a mutation changed something AND produced a finding matching `needle`. */
function expectCaught(mutated, needle) {
  assert.notEqual(mutated, REAL_SQL, "mutation did not change anything");
  const problems = validatePhase1bPolicyContract(mutated);
  assert.ok(
    problems.some((p) => p.includes(needle)),
    `expected a finding containing ${JSON.stringify(needle)}, got: ${JSON.stringify(problems, null, 2)}`
  );
}

describe("Phase 1b policy contract — baseline", () => {
  test("the real migration satisfies the authorization contract", () => {
    assert.deepEqual(validatePhase1bFromDisk(), []);
  });

  test("the migration file exists and is non-trivial", () => {
    assert.ok(REAL_SQL.length > 2000);
  });

  test("the contract covers all six expected policies", () => {
    assert.equal(EXPECTED_POLICIES.length, 6);
    for (const p of EXPECTED_POLICIES) {
      assert.ok(REAL_SQL.includes(`"${p.name}"`), `migration must define "${p.name}"`);
    }
  });

  test("the migration is LF-only, so its pinned digest is platform-stable", () => {
    assert.equal(
      (REAL_SQL.match(/\r\n/g) || []).length,
      0,
      ".gitattributes pins *.sql to eol=lf; a CRLF byte would change the digest in CI"
    );
  });
});

describe("Phase 1b policy contract — restrictive-ness cannot be weakened", () => {
  test("changing AS RESTRICTIVE to AS PERMISSIVE is caught", () => {
    expectCaught(REAL_SQL.replaceAll("as restrictive", "as permissive"), "not AS RESTRICTIVE");
  });

  test("removing AS RESTRICTIVE entirely is caught (policies default to permissive)", () => {
    expectCaught(REAL_SQL.replaceAll("as restrictive\n", ""), "not AS RESTRICTIVE");
  });
});

describe("Phase 1b policy contract — the retention gate cannot be removed", () => {
  test("replacing the retention predicate with a bare true is caught", () => {
    const mutated = REAL_SQL.replaceAll(
      "with check (public.participation_allows_retention());",
      "with check (true);"
    );
    expectCaught(mutated, "weakened to a bare");
  });

  test("swapping the retention predicate for the publication predicate is caught", () => {
    const mutated = REAL_SQL.replace(
      "with check (public.participation_allows_retention());",
      "with check (public.participation_allows_publication());"
    );
    expectCaught(mutated, "must stay separate");
  });

  test("dropping the USING clause from the profile update retention gate is caught", () => {
    const mutated = REAL_SQL.replace(
      "using (public.participation_allows_retention())\nwith check (public.participation_allows_retention());",
      "with check (public.participation_allows_retention());"
    );
    expectCaught(mutated, "missing its USING clause");
  });
});

describe("Phase 1b policy contract — the publication gate cannot be removed", () => {
  test("removing the publication predicate is caught", () => {
    const mutated = REAL_SQL.replaceAll(
      "  is_published is not true\n  or public.participation_allows_publication()\n",
      "  is_published is not true\n"
    );
    expectCaught(mutated, "participation_allows_publication");
  });

  test("changing `is not true` to `= false` is caught (NULL would become UNKNOWN)", () => {
    const mutated = REAL_SQL.replaceAll("is_published is not true", "is_published = false");
    expectCaught(mutated, "is_published is not true");
  });

  test("weakening the publication WITH CHECK to a bare true is caught", () => {
    const mutated = REAL_SQL.replaceAll(
      "with check (\n  is_published is not true\n  or public.participation_allows_publication()\n);",
      "with check (true);"
    );
    expectCaught(mutated, "weakened to a bare");
  });
});

describe("Phase 1b policy contract — complete Boolean composition mutations", () => {
  test("retention predicate OR true is rejected in every retention clause", () => {
    for (const policy of EXPECTED_POLICIES.filter((p) => p.gate === "retention")) {
      const start = REAL_SQL.indexOf(`create policy "${policy.name}"`);
      const end = REAL_SQL.indexOf(";", start);
      const body = REAL_SQL.slice(start, end);
      // Mutate each occurrence separately, including UPDATE USING and WITH CHECK.
      for (const match of body.matchAll(/public\.participation_allows_retention\(\)/g)) {
        const at = start + match.index;
        expectCaught(REAL_SQL.slice(0, at) + match[0] + " OR true" +
          REAL_SQL.slice(at + match[0].length), "complete approved Boolean composition");
      }
    }
  });

  test("Storage bucket OR changed to AND is rejected in all three clauses", () => {
    const pattern = /bucket_id <> 'athlete-media'\n  or public\.participation_allows_retention\(\)/g;
    const matches = [...REAL_SQL.matchAll(pattern)];
    assert.equal(matches.length, 3);
    for (const match of matches) {
      expectCaught(REAL_SQL.slice(0, match.index) + match[0].replace("\n  or ", "\n  and ") +
        REAL_SQL.slice(match.index + match[0].length), "complete approved Boolean composition");
    }
  });

  test("publication OR changed to AND is rejected in both WITH CHECK clauses", () => {
    const pattern = /is_published is not true\n  or public\.participation_allows_publication\(\)/g;
    const matches = [...REAL_SQL.matchAll(pattern)];
    assert.equal(matches.length, 2);
    for (const match of matches) {
      expectCaught(REAL_SQL.slice(0, match.index) + match[0].replace("\n  or ", "\n  and ") +
        REAL_SQL.slice(match.index + match[0].length), "complete approved Boolean composition");
    }
  });

  test("appended DELETE FROM public.athlete_profiles is rejected", () => {
    expectCaught(REAL_SQL + "\nDELETE FROM public.athlete_profiles;\n", "unexpected executable statement");
  });
});

describe("Phase 1b policy contract — lexical boundaries and statement allowlist", () => {
  test("nested and line comments may contain decoy SQL without affecting policies", () => {
    const decorated = REAL_SQL.replace("with check (public.participation_allows_retention());",
      "with /* outer /* inner ; DELETE FROM public.athlete_profiles; */ still comment */ " +
      "check (public.participation_allows_retention());");
    assert.deepEqual(validatePhase1bPolicyContract(decorated +
      "\n-- DELETE FROM public.athlete_profiles; $tag$ ' /*\n"), []);
  });

  test("quoted string and dollar-quote decoys cannot replace a real policy", () => {
    const start = REAL_SQL.indexOf('create policy "Participation required to insert profile"');
    const end = REAL_SQL.indexOf(";", start);
    const policy = REAL_SQL.slice(start, end + 1);
    for (const wrapped of [
      `select '${policy.replaceAll("'", "''")}';`,
      `select $$${policy} -- opaque /* ) ; $$;`,
      `select $review$${policy} -- opaque /* ) ; $review$;`,
    ]) {
      expectCaught(REAL_SQL.slice(0, start) + wrapped + REAL_SQL.slice(end + 1),
        "unexpected executable statement");
    }
  });

  test("appended statements with quoted semicolons stay executable and are rejected", () => {
    for (const extra of ["select 'it''s ; -- /*';", "select $$ ; -- /* $$;",
      "select $tag$ ; -- /* $tag$;", "select E'escaped\\' ; --';"]) {
      expectCaught(REAL_SQL + "\n" + extra, "unexpected executable statement");
    }
  });

  test("unterminated quotes and nested comments fail closed", () => {
    for (const extra of ["/* outer /* inner */", "'unfinished", '"unfinished', "$tag$unfinished"]) {
      expectCaught(REAL_SQL + "\n" + extra, "unterminated");
    }
  });

  test("bucket string case is significant even though keyword case and spacing are not", () => {
    expectCaught(REAL_SQL.replaceAll("'athlete-media'", "'ATHLETE-MEDIA'"),
      "complete approved Boolean composition");
    assert.deepEqual(validatePhase1bPolicyContract(REAL_SQL.replaceAll("with check (",
      "WITH   CHECK (")), []);
  });

  test("duplicate approved policies and extra trailing clauses are rejected", () => {
    const start = REAL_SQL.indexOf('create policy "Participation required to insert profile"');
    const end = REAL_SQL.indexOf(";", start);
    expectCaught(REAL_SQL + "\n" + REAL_SQL.slice(start, end + 1), "unexpected executable statement");
    expectCaught(REAL_SQL.slice(0, end) + " using (true)" + REAL_SQL.slice(end),
      "unexpected executable statement");
  });
});

describe("Phase 1b policy contract — bucket scoping cannot become global", () => {
  test("switching the storage scope to bucket_id = 'athlete-media' is caught", () => {
    const mutated = REAL_SQL.replaceAll(
      "bucket_id <> 'athlete-media'\n  or public.participation_allows_retention()",
      "bucket_id = 'athlete-media'\n  and public.participation_allows_retention()"
    );
    expectCaught(mutated, "denies writes to every other bucket");
  });

  test("removing the bucket scope entirely is caught", () => {
    const mutated = REAL_SQL.replaceAll(
      "  bucket_id <> 'athlete-media'\n  or public.participation_allows_retention()\n",
      "  public.participation_allows_retention()\n"
    );
    expectCaught(mutated, "must scope with");
  });
});

describe("Phase 1b policy contract — SELECT and DELETE must stay ungated", () => {
  test("adding a restrictive SELECT gate is caught", () => {
    const mutated =
      REAL_SQL +
      `\ncreate policy "Participation required to read profile"\n` +
      `on public.athlete_profiles\nas restrictive\nfor select\nto authenticated\n` +
      `using (public.participation_allows_retention());\n`;
    expectCaught(mutated, "deliberately ungated");
  });

  test("adding a restrictive DELETE gate is caught", () => {
    const mutated =
      REAL_SQL +
      `\ncreate policy "Participation required to delete media"\n` +
      `on storage.objects\nas restrictive\nfor delete\nto authenticated\n` +
      `using (public.participation_allows_retention());\n`;
    expectCaught(mutated, "deliberately ungated");
  });

  test("widening a gate to FOR ALL is caught, because it would cover SELECT and DELETE", () => {
    const mutated = REAL_SQL.replace("for insert\nto authenticated", "for all\nto authenticated");
    expectCaught(mutated, "FOR ALL");
  });
});

describe("Phase 1b policy contract — additive-only cutover", () => {
  test("adding a DROP POLICY is caught", () => {
    const mutated =
      `drop policy "Owner can update own profile" on public.athlete_profiles;\n` + REAL_SQL;
    expectCaught(mutated, "purely additive");
  });

  test("adding an ALTER POLICY is caught", () => {
    const mutated =
      REAL_SQL + `\nalter policy "Owner can update own profile" on public.athlete_profiles using (true);\n`;
    expectCaught(mutated, "purely additive");
  });

  test("adding a GRANT is caught", () => {
    const mutated = REAL_SQL + `\ngrant select on table public.athlete_participation to authenticated;\n`;
    expectCaught(mutated, "changes policies only");
  });

  test("adding a service_role reference is caught", () => {
    const mutated = REAL_SQL + `\ncreate policy "svc" on public.athlete_profiles as restrictive for insert to service_role with check (true);\n`;
    expectCaught(mutated, "service_role");
  });

  test("disabling RLS is caught", () => {
    const mutated = REAL_SQL + `\nalter table public.athlete_profiles disable row level security;\n`;
    expectCaught(mutated, "row level security");
  });
});

describe("Phase 1b policy contract — role scoping", () => {
  test("widening a gate's roles to include anon is caught", () => {
    const mutated = REAL_SQL.replace("for insert\nto authenticated", "for insert\nto anon, authenticated");
    expectCaught(mutated, "expected exactly");
  });
});

describe("Phase 1b policy contract — removal of any single policy is caught", () => {
  for (const want of EXPECTED_POLICIES) {
    test(`deleting "${want.name}" is caught`, () => {
      // Remove from the policy's own CREATE through its terminating semicolon.
      const start = REAL_SQL.indexOf(`create policy "${want.name}"`);
      assert.notEqual(start, -1, "policy not found in migration");
      const end = REAL_SQL.indexOf(";", start);
      const mutated = REAL_SQL.slice(0, start) + REAL_SQL.slice(end + 1);
      expectCaught(mutated, want.name);
    });
  }
});

describe("Phase 1b policy contract — legitimate constructs are not false-flagged", () => {
  test("the intentional bare `using (true)` on the publication update gate passes", () => {
    // This is the one place a bare true is correct: the gate constrains only the
    // NEW is_published value via WITH CHECK. It must not be reported as weakening.
    const problems = validatePhase1bFromDisk();
    assert.deepEqual(problems, []);
    assert.ok(
      REAL_SQL.includes("using (true)"),
      "the publication update gate is expected to carry a deliberate bare using (true)"
    );
  });

  test("replacing that deliberate `using (true)` with a predicate is also caught", () => {
    // It must be exactly `true` — conflating row targeting into this gate would
    // duplicate the retention question and change denial attribution.
    const mutated = REAL_SQL.replace(
      "using (true)",
      "using (public.participation_allows_publication())"
    );
    expectCaught(mutated, "must be exactly a bare");
  });

  test("comments mentioning a predicate do not satisfy a requirement", () => {
    // Strip the retention predicate from executable SQL but leave every comment
    // (which mentions it many times) intact.
    const mutated = REAL_SQL.replaceAll(
      "with check (public.participation_allows_retention());",
      "with check (true);"
    );
    const problems = validatePhase1bPolicyContract(mutated);
    assert.ok(
      problems.length > 0,
      "comment text mentioning the predicate must not satisfy the structural check"
    );
  });
});
