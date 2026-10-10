import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createProfile, updateProfile } from "@/lib/profile-save";
import { createEmptyAthleteProfile } from "@/lib/athlete-profile";
import {
  installFakeSupabase,
  uninstallFakeSupabase,
  setFakeSupabase,
  supabaseCalls,
} from "@/test-support/next-stubs/supabase-ssr";

/**
 * `.tsx`, despite containing no JSX: it needs the `@supabase/ssr` test double, which
 * is scoped to the rendered-interaction `npm test` phase (register-alias-resolver-
 * rendered.mjs sets the opt-in flag that hook reads at module-RESOLVE time, before
 * any test code runs — see that file's own docblock). Extension is what selects the
 * loader, so this file has to be `.tsx` to reach the stub even though it renders
 * nothing.
 *
 * Guardian-First Participation, Phase 1a: the UX pre-check in profile-save.ts.
 *
 * This is explicitly NOT the enforcement layer — Phase 1a adds no restrictive RLS —
 * so these tests prove only that the pre-check fails fast and legibly before any
 * Storage upload is attempted, never that a bypass is impossible. No photos are
 * passed in any case here, so these tests pass regardless of whether the pre-check
 * short-circuits correctly BEFORE reaching Storage-upload code this fake does not
 * implement — the real assertion is on the returned result shape.
 */

const SIGNED_IN_USER = { id: "owner-1", email: "owner@example.invalid" };

beforeEach(() => {
  installFakeSupabase({ user: SIGNED_IN_USER });
});

afterEach(() => {
  uninstallFakeSupabase();
});

describe("createProfile — participation pre-check", () => {
  test("refuses with reason 'participation_required' when status is not adult_approved", async () => {
    setFakeSupabase({ participationStatus: "absent" });

    const result = await createProfile(createEmptyAthleteProfile(), { hero: null, profile: null });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "participation_required");
    }
  });

  test("calls participation_status before anything else write-related", async () => {
    setFakeSupabase({ participationStatus: "absent" });
    await createProfile(createEmptyAthleteProfile(), { hero: null, profile: null });

    const statusIndex = supabaseCalls.indexOf("rpc:participation_status");
    assert.ok(statusIndex !== -1, "expected the participation_status RPC to be called");

    // Nothing that would indicate an insert attempt happened after it, in this call.
    assert.ok(
      !supabaseCalls.slice(statusIndex + 1).some((c) => c.startsWith("insert")),
      "no insert should be attempted once the pre-check refuses"
    );
  });

  test("every minor/revoked/expired status is refused identically", async () => {
    for (const status of ["minor_pending", "minor_approved", "minor_declined", "revoked", "expired"]) {
      setFakeSupabase({ participationStatus: status });
      const result = await createProfile(createEmptyAthleteProfile(), { hero: null, profile: null });
      assert.equal(result.ok, false, `expected refusal for status=${status}`);
      if (!result.ok) {
        assert.equal(result.reason, "participation_required", `wrong reason for status=${status}`);
      }
    }
  });

  test("adult_approved passes the pre-check (proceeds to the ownership gate, not a participation refusal)", async () => {
    setFakeSupabase({ participationStatus: "adult_approved", profileExists: true });

    const result = await createProfile(createEmptyAthleteProfile(), { hero: null, profile: null });

    // profileExists: true makes checkOwnershipStatus report "exists", which
    // createProfile's ownership gate refuses — a DIFFERENT failure than
    // participation_required. Reaching that gate at all proves the pre-check passed.
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.notEqual(result.reason, "participation_required");
    }
  });
});

describe("updateProfile — participation pre-check", () => {
  test("refuses with reason 'participation_required' when status is not adult_approved", async () => {
    setFakeSupabase({ participationStatus: "minor_approved" });

    const result = await updateProfile(createEmptyAthleteProfile(), false);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "participation_required");
    }
  });

  test("calls participation_status before the media-ownership check", async () => {
    setFakeSupabase({ participationStatus: "revoked" });
    await updateProfile(createEmptyAthleteProfile(), false);

    assert.ok(supabaseCalls.includes("rpc:participation_status"));
  });
});
