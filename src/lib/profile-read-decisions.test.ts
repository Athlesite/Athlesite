import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  decidePublicReadStep,
  stepMayReadTableDirectly,
  type PublicReadStep,
} from "@/lib/profile-read-decisions";

/**
 * These cover the part of Checkpoint 5D.7's access boundary that is expressible
 * without a database. The policies and grants themselves need a live acceptance
 * run; what can be pinned here is the branching that decides which of the two
 * read paths a request is allowed to take — and specifically that an anonymous
 * request can never reach the one that touches the table.
 */
describe("decidePublicReadStep", () => {
  test("a published row resolves immediately, without a second query", () => {
    assert.equal(
      decidePublicReadStep({ publishedRowFound: true, hasLocalSession: false }),
      "resolved"
    );
    assert.equal(
      decidePublicReadStep({ publishedRowFound: true, hasLocalSession: true }),
      "resolved"
    );
  });

  test("nothing published + a session -> try the owner's own row (unpublished preview)", () => {
    assert.equal(
      decidePublicReadStep({ publishedRowFound: false, hasLocalSession: true }),
      "try-owner-preview"
    );
  });

  test("nothing published + no session -> 404 without touching the table", () => {
    assert.equal(
      decidePublicReadStep({ publishedRowFound: false, hasLocalSession: false }),
      "not-found"
    );
  });

  /**
   * The security invariant, asserted exhaustively rather than by example: across
   * every possible input, a caller with no session is never routed to the step
   * that issues a direct `athlete_profiles` read. After migration
   * 20260928000003 such a read would be refused by the database anyway — this
   * keeps it from being attempted in the first place, so "anon never reads the
   * table" is true in the application layer too and not only in Postgres.
   */
  test("no sessionless input can ever reach a direct table read", () => {
    for (const publishedRowFound of [true, false]) {
      const step = decidePublicReadStep({ publishedRowFound, hasLocalSession: false });
      assert.equal(
        stepMayReadTableDirectly(step),
        false,
        `sessionless publishedRowFound=${publishedRowFound} routed to "${step}"`
      );
    }
  });

  test("an owner preview is the only step permitted to read the table directly", () => {
    const steps: PublicReadStep[] = ["resolved", "try-owner-preview", "not-found"];
    const permitted = steps.filter(stepMayReadTableDirectly);
    assert.deepEqual(permitted, ["try-owner-preview"]);
  });

  test("every input maps to a known step — no undefined fallthrough", () => {
    const seen = new Set<PublicReadStep>();
    for (const publishedRowFound of [true, false]) {
      for (const hasLocalSession of [true, false]) {
        const step = decidePublicReadStep({ publishedRowFound, hasLocalSession });
        assert.ok(
          step === "resolved" || step === "try-owner-preview" || step === "not-found",
          `unexpected step "${step}"`
        );
        seen.add(step);
      }
    }
    // All three branches are reachable; none is dead code.
    assert.equal(seen.size, 3);
  });
});
