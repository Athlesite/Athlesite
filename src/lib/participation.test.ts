import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTESTATION_VERSION,
  TERMS_VERSION,
  PRIVACY_VERSION,
  isGatedParticipationStatus,
  resolveEditProfileRoute,
  type ParticipationStatus,
} from "@/lib/participation";

const ALL_STATUSES: ParticipationStatus[] = [
  "absent",
  "adult_approved",
  "minor_pending",
  "minor_approved",
  "minor_declined",
  "revoked",
  "expired",
];

describe("version constants", () => {
  test("every version is a non-empty string", () => {
    for (const v of [ATTESTATION_VERSION, TERMS_VERSION, PRIVACY_VERSION]) {
      assert.equal(typeof v, "string");
      assert.ok(v.trim().length > 0);
    }
  });
});

describe("isGatedParticipationStatus", () => {
  test("adult_approved is the only ungated status", () => {
    for (const status of ALL_STATUSES) {
      assert.equal(isGatedParticipationStatus(status), status !== "adult_approved");
    }
  });
});

describe("resolveEditProfileRoute", () => {
  test("no session always routes to sign-in, regardless of status or profile", () => {
    for (const status of ALL_STATUSES) {
      for (const hasProfile of [true, false]) {
        assert.equal(
          resolveEditProfileRoute({ hasSession: false, status, hasProfile }),
          "sign-in"
        );
      }
    }
  });

  test("session + absent participation -> attestation-gate, regardless of profile", () => {
    // A profile existing alongside an absent participation row is a real pre-gate
    // state (an owner who created a profile before this checkpoint existed) — the
    // gate must still apply.
    assert.equal(
      resolveEditProfileRoute({ hasSession: true, status: "absent", hasProfile: false }),
      "attestation-gate"
    );
    assert.equal(
      resolveEditProfileRoute({ hasSession: true, status: "absent", hasProfile: true }),
      "attestation-gate"
    );
  });

  test("session + adult_approved + no profile -> onboarding-redirect", () => {
    assert.equal(
      resolveEditProfileRoute({ hasSession: true, status: "adult_approved", hasProfile: false }),
      "onboarding-redirect"
    );
  });

  test("session + adult_approved + has profile -> editor", () => {
    assert.equal(
      resolveEditProfileRoute({ hasSession: true, status: "adult_approved", hasProfile: true }),
      "editor"
    );
  });

  test("every minor/revoked/expired status routes to blocked, regardless of profile", () => {
    const blockedStatuses: ParticipationStatus[] = [
      "minor_pending",
      "minor_approved",
      "minor_declined",
      "revoked",
      "expired",
    ];
    for (const status of blockedStatuses) {
      for (const hasProfile of [true, false]) {
        assert.equal(
          resolveEditProfileRoute({ hasSession: true, status, hasProfile }),
          "blocked",
          `expected blocked for status=${status} hasProfile=${hasProfile}`
        );
      }
    }
  });

  test("every status produces a defined route for both profile states", () => {
    for (const status of ALL_STATUSES) {
      for (const hasProfile of [true, false]) {
        const route = resolveEditProfileRoute({ hasSession: true, status, hasProfile });
        assert.ok(
          ["sign-in", "attestation-gate", "blocked", "onboarding-redirect", "editor"].includes(route)
        );
      }
    }
  });
});
