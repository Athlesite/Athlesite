import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  participationAllowsRetention,
  participationAllowsPublication,
  participationStatus,
  authorizeProfile,
  authorizeMedia,
  mediaRetentionGateAllows,
  authorizeUnpublishOwnProfile,
  CALLERS,
} from "./phase1b-authz-model.mjs";

/**
 * The Phase 1b authorization matrix. Every case the checkpoint names is here.
 *
 * These assert the DECISION LOGIC, not PostgreSQL's enforcement of it — see the
 * model's own docblock. phase1b-policy-contract.test.mjs is what keeps the real
 * migration in lockstep with these assumptions.
 */

describe("Phase 1b — predicate semantics", () => {
  test("retention is status=approved for EITHER bracket (an approved minor may retain)", () => {
    assert.equal(participationAllowsRetention(CALLERS.adultApproved), true);
    assert.equal(participationAllowsRetention(CALLERS.minorApproved), true);
  });

  test("retention is false for pending, declined, revoked, and no row", () => {
    assert.equal(participationAllowsRetention(CALLERS.minorPending), false);
    assert.equal(participationAllowsRetention(CALLERS.minorDeclined), false);
    assert.equal(participationAllowsRetention(CALLERS.revoked), false);
    assert.equal(participationAllowsRetention(CALLERS.noRow), false);
  });

  test("publication is strictly narrower than retention: adult AND approved only", () => {
    assert.equal(participationAllowsPublication(CALLERS.adultApproved), true);
    assert.equal(
      participationAllowsPublication(CALLERS.minorApproved),
      false,
      "an APPROVED minor must still be denied publication in this interim phase"
    );
    assert.equal(participationAllowsPublication(CALLERS.minorPending), false);
    assert.equal(participationAllowsPublication(CALLERS.revoked), false);
  });

  test("both predicates are false for an unauthenticated caller", () => {
    assert.equal(participationAllowsRetention(CALLERS.anonymous), false);
    assert.equal(participationAllowsPublication(CALLERS.anonymous), false);
  });

  test("participationStatus classifies a recorded minor distinctly from an adult", () => {
    assert.equal(participationStatus(CALLERS.adultApproved), "adult_approved");
    assert.equal(participationStatus(CALLERS.minorApproved), "minor_approved");
    assert.equal(participationStatus(CALLERS.minorPending), "minor_pending");
    assert.equal(participationStatus(CALLERS.revoked), "revoked");
    assert.equal(participationStatus(CALLERS.noRow), "absent");
  });
});

describe("Phase 1b — profile retention gate", () => {
  test("approved adult owner CAN create a profile", () => {
    const r = authorizeProfile({
      operation: "insert",
      caller: CALLERS.adultApproved,
      isOwnRow: true,
      newIsPublished: false,
    });
    assert.deepEqual(r, { allowed: true, reason: "allowed" });
  });

  test("approved adult owner CAN update a profile", () => {
    const r = authorizeProfile({
      operation: "update",
      caller: CALLERS.adultApproved,
      isOwnRow: true,
      newIsPublished: false,
    });
    assert.equal(r.allowed, true);
  });

  test("an owner with NO participation row cannot create or update retained data", () => {
    for (const operation of ["insert", "update"]) {
      const r = authorizeProfile({
        operation,
        caller: CALLERS.noRow,
        isOwnRow: true,
        newIsPublished: false,
      });
      assert.deepEqual(r, { allowed: false, reason: "retention_denied" }, operation);
    }
  });

  test("a REVOKED owner cannot create or update retained data", () => {
    for (const operation of ["insert", "update"]) {
      const r = authorizeProfile({
        operation,
        caller: CALLERS.revoked,
        isOwnRow: true,
        newIsPublished: false,
      });
      assert.deepEqual(r, { allowed: false, reason: "retention_denied" }, operation);
    }
  });

  test("minor/pending and minor/declined owners cannot write retained profile data", () => {
    for (const caller of [CALLERS.minorPending, CALLERS.minorDeclined]) {
      const r = authorizeProfile({
        operation: "update",
        caller,
        isOwnRow: true,
        newIsPublished: false,
      });
      assert.equal(r.allowed, false);
      assert.equal(r.reason, "retention_denied");
    }
  });

  test("an APPROVED minor CAN write retained profile data (retention, not publication)", () => {
    const r = authorizeProfile({
      operation: "update",
      caller: CALLERS.minorApproved,
      isOwnRow: true,
      newIsPublished: false,
    });
    assert.deepEqual(r, { allowed: true, reason: "allowed" });
  });
});

describe("Phase 1b — owner read/delete stay available (no data hostage)", () => {
  test("a revoked owner can STILL read their own profile", () => {
    const r = authorizeProfile({ operation: "select", caller: CALLERS.revoked, isOwnRow: true });
    assert.deepEqual(r, { allowed: true, reason: "ungated_by_phase1b" });
  });

  test("a revoked owner can STILL delete their own profile", () => {
    const r = authorizeProfile({ operation: "delete", caller: CALLERS.revoked, isOwnRow: true });
    assert.deepEqual(r, { allowed: true, reason: "ungated_by_phase1b" });
  });

  test("an owner with no participation row can still read and delete their own data", () => {
    assert.equal(
      authorizeProfile({ operation: "select", caller: CALLERS.noRow, isOwnRow: true }).allowed,
      true
    );
    assert.equal(
      authorizeProfile({ operation: "delete", caller: CALLERS.noRow, isOwnRow: true }).allowed,
      true
    );
  });

  test("a revoked owner can still read and DELETE their own media", () => {
    for (const operation of ["select", "delete"]) {
      const r = authorizeMedia({
        operation,
        caller: CALLERS.revoked,
        role: "authenticated",
        isOwnFolder: true,
      });
      assert.equal(r.allowed, true, operation);
    }
  });
});

describe("Phase 1b — interim minor-publication restriction", () => {
  test("an APPROVED minor cannot set is_published = true", () => {
    const r = authorizeProfile({
      operation: "update",
      caller: CALLERS.minorApproved,
      isOwnRow: true,
      newIsPublished: true,
    });
    assert.deepEqual(
      r,
      { allowed: false, reason: "publication_denied" },
      "must deny for PUBLICATION specifically — the minor passes retention"
    );
  });

  test("an approved minor cannot create an already-published row either", () => {
    const r = authorizeProfile({
      operation: "insert",
      caller: CALLERS.minorApproved,
      isOwnRow: true,
      newIsPublished: true,
    });
    assert.deepEqual(r, { allowed: false, reason: "publication_denied" });
  });

  test("an approved minor CAN still set is_published = false (reducing exposure is never gated)", () => {
    const r = authorizeProfile({
      operation: "update",
      caller: CALLERS.minorApproved,
      isOwnRow: true,
      newIsPublished: false,
    });
    assert.equal(r.allowed, true);
  });

  test("no recorded-minor state can reach publication eligibility in this phase", () => {
    for (const caller of [CALLERS.minorApproved, CALLERS.minorPending, CALLERS.minorDeclined]) {
      assert.equal(
        participationAllowsPublication(caller),
        false,
        `minor state ${participationStatus(caller)} must not be publication-eligible`
      );
      assert.equal(
        authorizeProfile({ operation: "update", caller, isOwnRow: true, newIsPublished: true }).allowed,
        false
      );
    }
  });

  test("adult approved publication still works — consistent with explicit Publish", () => {
    const r = authorizeProfile({
      operation: "update",
      caller: CALLERS.adultApproved,
      isOwnRow: true,
      newIsPublished: true,
    });
    assert.deepEqual(r, { allowed: true, reason: "allowed" });
  });

  test("creation is unpublished by default, so the insert publication gate is satisfied trivially", () => {
    // src/lib/db-mappers.ts toAthleteProfileRow always sets is_published false.
    const r = authorizeProfile({
      operation: "insert",
      caller: CALLERS.adultApproved,
      isOwnRow: true,
      newIsPublished: false,
    });
    assert.equal(r.allowed, true);
  });
});

describe("Phase 1b — media retention gate", () => {
  test("approved owner CAN upload and update media", () => {
    for (const operation of ["insert", "update"]) {
      const r = authorizeMedia({
        operation,
        caller: CALLERS.adultApproved,
        role: "authenticated",
        isOwnFolder: true,
      });
      assert.deepEqual(r, { allowed: true, reason: "allowed" }, operation);
    }
  });

  test("non-approved and revoked owners CANNOT upload or update media", () => {
    for (const caller of [CALLERS.noRow, CALLERS.revoked, CALLERS.minorPending, CALLERS.minorDeclined]) {
      for (const operation of ["insert", "update"]) {
        const r = authorizeMedia({ operation, caller, role: "authenticated", isOwnFolder: true });
        assert.deepEqual(r, { allowed: false, reason: "retention_denied" });
      }
    }
  });

  test("an approved minor may upload media (retention), since publication is a separate gate", () => {
    const r = authorizeMedia({
      operation: "insert",
      caller: CALLERS.minorApproved,
      role: "authenticated",
      isOwnFolder: true,
    });
    assert.equal(r.allowed, true);
  });

  test("other buckets pass the restrictive gate but have no permissive authorization", () => {
    for (const caller of Object.values(CALLERS)) {
      assert.equal(mediaRetentionGateAllows(caller, "some-future-bucket"), true);
      for (const operation of ["select", "insert", "update", "delete"]) {
        for (const isOwnFolder of [false, true]) {
          const r = authorizeMedia({
            operation, caller, role: "authenticated", isOwnFolder,
            isPubliclyReferencedHero: true, bucketId: "some-future-bucket",
          });
          assert.equal(r.allowed, false, `${operation}, ${caller.uid}, own=${isOwnFolder}`);
          assert.equal(r.reason, operation !== "select" && !caller.uid
            ? "no_identity" : "other_bucket_no_policy");
        }
      }
    }
  });

  test("anon cannot access unrelated buckets through a public hero or own folder", () => {
    for (const operation of ["select", "insert", "update", "delete"]) {
      assert.equal(authorizeMedia({
        operation, caller: CALLERS.anonymous, role: "anon", isOwnFolder: true,
        isPubliclyReferencedHero: true, bucketId: "some-future-bucket",
      }).allowed, false);
    }
  });

  test("the isolated restrictive gate still requires retention for athlete-media", () => {
    for (const caller of Object.values(CALLERS)) {
      assert.equal(mediaRetentionGateAllows(caller), participationAllowsRetention(caller));
    }
  });
});

describe("Phase 1b — stale token is blocked by live state, not JWT identity", () => {
  test("a deleted Auth user holding a valid-looking token fails retention", () => {
    assert.equal(
      participationAllowsRetention(CALLERS.staleToken),
      false,
      "the row still says adult/approved — only the auth.users existence check catches this"
    );
  });

  test("stale-token Storage writes are denied even with an approved participation row", () => {
    for (const operation of ["insert", "update"]) {
      const r = authorizeMedia({
        operation,
        caller: CALLERS.staleToken,
        role: "authenticated",
        isOwnFolder: true,
      });
      assert.deepEqual(r, { allowed: false, reason: "retention_denied" }, operation);
    }
  });

  test("stale-token profile writes are denied the same way", () => {
    const r = authorizeProfile({
      operation: "update",
      caller: CALLERS.staleToken,
      isOwnRow: true,
      newIsPublished: false,
    });
    assert.deepEqual(r, { allowed: false, reason: "retention_denied" });
  });

  test("stale-token publication is denied too", () => {
    assert.equal(participationAllowsPublication(CALLERS.staleToken), false);
  });
});

describe("Phase 1b — no cross-owner access", () => {
  test("an approved adult cannot write ANOTHER owner's profile", () => {
    for (const operation of ["insert", "update", "select", "delete"]) {
      const r = authorizeProfile({
        operation,
        caller: CALLERS.adultApproved,
        isOwnRow: false,
        newIsPublished: false,
      });
      assert.deepEqual(
        r,
        { allowed: false, reason: "not_owner" },
        `${operation} must fail on owner identity BEFORE any participation question`
      );
    }
  });

  test("an approved adult cannot write into another owner's media folder", () => {
    for (const operation of ["insert", "update", "delete"]) {
      const r = authorizeMedia({
        operation,
        caller: CALLERS.adultApproved,
        role: "authenticated",
        isOwnFolder: false,
      });
      assert.deepEqual(r, { allowed: false, reason: "not_owner" }, operation);
    }
  });

  test("participation eligibility never substitutes for ownership", () => {
    // The permissive owner-identity layer is checked first, so being approved
    // confers nothing on someone else's row.
    assert.equal(
      authorizeProfile({
        operation: "update",
        caller: CALLERS.adultApproved,
        isOwnRow: false,
        newIsPublished: false,
      }).reason,
      "not_owner"
    );
  });
});

describe("Phase 1b — anon/public media read is not broadened", () => {
  test("anon can read ONLY a publicly referenced hero", () => {
    const ok = authorizeMedia({
      operation: "select",
      caller: CALLERS.anonymous,
      role: "anon",
      isOwnFolder: false,
      isPubliclyReferencedHero: true,
    });
    assert.deepEqual(ok, { allowed: true, reason: "publicly_referenced_hero" });
  });

  test("anon cannot read a non-referenced object", () => {
    const r = authorizeMedia({
      operation: "select",
      caller: CALLERS.anonymous,
      role: "anon",
      isOwnFolder: false,
      isPubliclyReferencedHero: false,
    });
    assert.deepEqual(r, { allowed: false, reason: "not_readable" });
  });

  test("anon has no media WRITE path at all, in any participation state", () => {
    for (const operation of ["insert", "update", "delete"]) {
      const r = authorizeMedia({
        operation,
        caller: CALLERS.anonymous,
        role: "anon",
        isOwnFolder: true,
      });
      assert.deepEqual(r, { allowed: false, reason: "not_authenticated" }, operation);
    }
  });

  test("anon has no profile path at all (policy dropped in 20260928000003, no grant)", () => {
    const r = authorizeProfile({ operation: "select", caller: CALLERS.anonymous, isOwnRow: false });
    assert.equal(r.allowed, false);
  });

  test("Phase 1b adds no SELECT gate, so an owner's own-folder read is unchanged", () => {
    const r = authorizeMedia({
      operation: "select",
      caller: CALLERS.revoked,
      role: "authenticated",
      isOwnFolder: true,
    });
    assert.deepEqual(r, { allowed: true, reason: "own_folder" });
  });
});

describe("Phase 1b — unpublish_own_profile stays an independent escape hatch", () => {
  test("usable in EVERY participation state, including revoked and minor/declined", () => {
    for (const key of ["adultApproved", "minorApproved", "minorPending", "minorDeclined", "revoked", "noRow"]) {
      const r = authorizeUnpublishOwnProfile(CALLERS[key]);
      assert.deepEqual(
        r,
        { allowed: true, reason: "ungated_by_participation" },
        `must remain available for ${key}`
      );
    }
  });

  test("it does not depend on retention eligibility", () => {
    assert.equal(participationAllowsRetention(CALLERS.revoked), false);
    assert.equal(authorizeUnpublishOwnProfile(CALLERS.revoked).allowed, true);
  });

  test("but still requires a live Auth identity — a deleted user cannot call it", () => {
    assert.deepEqual(authorizeUnpublishOwnProfile(CALLERS.staleToken), {
      allowed: false,
      reason: "auth_user_absent",
    });
    assert.deepEqual(authorizeUnpublishOwnProfile(CALLERS.anonymous), {
      allowed: false,
      reason: "no_identity",
    });
  });

  test("the deadlock it resolves: a published owner who becomes minor/approved", () => {
    // Profile updates are blocked while is_published stays true...
    assert.equal(
      authorizeProfile({
        operation: "update",
        caller: CALLERS.minorApproved,
        isOwnRow: true,
        newIsPublished: true,
      }).allowed,
      false
    );
    // ...and this is the way out, without needing an operator.
    assert.equal(authorizeUnpublishOwnProfile(CALLERS.minorApproved).allowed, true);
    // After unpublishing, ordinary retention writes work again.
    assert.equal(
      authorizeProfile({
        operation: "update",
        caller: CALLERS.minorApproved,
        isOwnRow: true,
        newIsPublished: false,
      }).allowed,
      true
    );
  });
});
