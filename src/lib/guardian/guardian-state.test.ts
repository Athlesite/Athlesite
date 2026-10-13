import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  guardianPageReducer,
  initialGuardianPageState,
  type GuardianPageAction,
  type GuardianPageState,
} from "@/lib/guardian/guardian-state";

const PENDING = { expiresAt: "2026-10-20T00:00:00Z", approvalBody: "Approve this?" };

function at(status: GuardianPageState["status"], extra: Partial<GuardianPageState> = {}): GuardianPageState {
  return { status, pending: null, decisionInFlight: null, ...extra };
}

describe("guardianPageReducer", () => {
  test("initial state is 'capturing'", () => {
    assert.equal(initialGuardianPageState.status, "capturing");
  });

  test("capturing -> unavailable on TOKEN_INVALID", () => {
    const next = guardianPageReducer(initialGuardianPageState, { type: "TOKEN_INVALID" });
    assert.equal(next.status, "unavailable");
  });

  test("capturing -> checking on TOKEN_CAPTURED", () => {
    const next = guardianPageReducer(initialGuardianPageState, { type: "TOKEN_CAPTURED" });
    assert.equal(next.status, "checking");
  });

  test("checking -> valid_pending on PEEK_VALID, carrying the pending payload", () => {
    const next = guardianPageReducer(at("checking"), { type: "PEEK_VALID", pending: PENDING });
    assert.equal(next.status, "valid_pending");
    assert.deepEqual(next.pending, PENDING);
  });

  test("checking -> unavailable on PEEK_UNAVAILABLE", () => {
    const next = guardianPageReducer(at("checking"), { type: "PEEK_UNAVAILABLE" });
    assert.equal(next.status, "unavailable");
  });

  test("checking -> peek_network_error on PEEK_NETWORK_ERROR", () => {
    const next = guardianPageReducer(at("checking"), { type: "PEEK_NETWORK_ERROR" });
    assert.equal(next.status, "peek_network_error");
  });

  describe("SUBMIT — the double-submission guard", () => {
    test("valid_pending -> submitting on SUBMIT, recording the decision in flight", () => {
      const next = guardianPageReducer(at("valid_pending", { pending: PENDING }), {
        type: "SUBMIT",
        decision: "approve",
      });
      assert.equal(next.status, "submitting");
      assert.equal(next.decisionInFlight, "approve");
    });

    test("SUBMIT is a no-op from every other state — this is what makes a duplicate click safe", () => {
      for (const status of [
        "capturing",
        "checking",
        "submitting",
        "approved",
        "declined",
        "unavailable",
        "peek_network_error",
        "redeem_ambiguous",
      ] as const) {
        const before = at(status);
        const after = guardianPageReducer(before, { type: "SUBMIT", decision: "approve" });
        assert.deepEqual(after, before, `SUBMIT should be a no-op from "${status}"`);
      }
    });
  });

  describe("redeem outcomes — only reachable from 'submitting'", () => {
    test("submitting -> approved on REDEEM_DECIDED(approve)", () => {
      const next = guardianPageReducer(at("submitting", { decisionInFlight: "approve" }), {
        type: "REDEEM_DECIDED",
        decision: "approve",
      });
      assert.equal(next.status, "approved");
    });

    test("submitting -> declined on REDEEM_DECIDED(decline)", () => {
      const next = guardianPageReducer(at("submitting", { decisionInFlight: "decline" }), {
        type: "REDEEM_DECIDED",
        decision: "decline",
      });
      assert.equal(next.status, "declined");
    });

    test("submitting -> unavailable on REDEEM_UNAVAILABLE (replay, expired-at-redeem, lost race, etc.)", () => {
      const next = guardianPageReducer(at("submitting"), { type: "REDEEM_UNAVAILABLE" });
      assert.equal(next.status, "unavailable");
    });

    test("submitting -> redeem_ambiguous on REDEEM_NETWORK_ERROR — never approved/declined/unavailable", () => {
      const next = guardianPageReducer(at("submitting"), { type: "REDEEM_NETWORK_ERROR" });
      assert.equal(next.status, "redeem_ambiguous");
    });

    test("every redeem-outcome action is a no-op outside 'submitting'", () => {
      for (const status of [
        "capturing",
        "checking",
        "valid_pending",
        "approved",
        "declined",
        "unavailable",
        "peek_network_error",
        "redeem_ambiguous",
      ] as const) {
        const before = at(status, status === "valid_pending" ? { pending: PENDING } : {});
        const actions: GuardianPageAction[] = [
          { type: "REDEEM_DECIDED", decision: "approve" },
          { type: "REDEEM_UNAVAILABLE" },
          { type: "REDEEM_NETWORK_ERROR" },
        ];
        for (const action of actions) {
          const after = guardianPageReducer(before, action);
          assert.deepEqual(after, before, `${action.type} should be a no-op from "${status}"`);
        }
      }
    });
  });

  test("a terminal state (approved/declined/unavailable) never regresses on any later action", () => {
    for (const terminal of ["approved", "declined", "unavailable"] as const) {
      const state = at(terminal);
      for (const action of [
        { type: "TOKEN_INVALID" as const },
        { type: "TOKEN_CAPTURED" as const },
        { type: "PEEK_UNAVAILABLE" as const },
        { type: "PEEK_NETWORK_ERROR" as const },
        { type: "SUBMIT" as const, decision: "approve" as const },
        { type: "REDEEM_UNAVAILABLE" as const },
      ]) {
        assert.deepEqual(guardianPageReducer(state, action), state);
      }
    }
  });
});
