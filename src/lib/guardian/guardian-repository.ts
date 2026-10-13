"use client";

import { createGuardianClient } from "@/lib/guardian/guardian-supabase-client";
import type { GuardianDecision } from "@/lib/guardian/guardian-state";

/**
 * Browser calls onto the two Phase 2 guardian RPCs
 * (peek_guardian_request / redeem_guardian_request). Every function here
 * distinguishes a TRANSPORT failure (network/config/anything that means the
 * call never completed) from a DEFINITE server answer — collapsing those
 * together would let a timeout during redeem be read as proof of failure,
 * which the founder decisions explicitly forbid.
 *
 * The token is a parameter on every call here, passed in by the caller
 * (GuardianParticipationClient, which holds it only in a ref/state — never in
 * any browser storage, per guardian-fragment.ts). Nothing in this file logs
 * it, and no error path below ever includes it in a thrown value or a
 * console call.
 *
 * Thin and untested-by-design, matching the existing convention
 * (participation-repository.ts's own docblock): everything with real
 * decision logic — token parsing, fragment handling, the page's state
 * machine, the copy fail-closed gate — is pulled out into pure modules that
 * ARE tested. This file is exercised indirectly by anything that mocks
 * `createGuardianClient`, and directly only by live acceptance against a real
 * project.
 */

export type GuardianPeekOutcome =
  | {
      status: "valid";
      requestedAt: string | null;
      expiresAt: string;
      guardianCopyVersion: string | null;
      requestTermsVersion: string | null;
      requestPrivacyVersion: string | null;
    }
  | { status: "unavailable" }
  | { status: "network_error" };

type PeekRow = {
  requested_at: string | null;
  expires_at: string;
  guardian_copy_version: string | null;
  request_terms_version: string | null;
  request_privacy_version: string | null;
};

/**
 * Calls `peek_guardian_request`. Never mutates anything server-side.
 *
 * Wrapped in try/catch, not just an `{ error }` check on the RPC result:
 * `createGuardianClient()` itself can THROW synchronously (missing/invalid
 * `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` —
 * `getSupabaseUrl`/`getSupabasePublishableKey` in `@/lib/supabase/env`
 * throw rather than return undefined), and that throw happens INSIDE this
 * `async function`, which turns it into a REJECTED promise rather than a
 * value this function's own `if (error)` branch would ever see. A caller
 * that does `peekGuardianRequest(token).then(...)` with no `.catch()` (see
 * GuardianParticipationClient) would then hit an unhandled rejection: the
 * `.then()` callback never runs, `dispatch` is never called, and the page
 * is stuck on "checking" forever with no visible error. This function must
 * never reject — every failure mode, config included, resolves to a safe
 * state the caller can act on.
 */
export async function peekGuardianRequest(token: string): Promise<GuardianPeekOutcome> {
  try {
    const supabase = createGuardianClient();
    const { data, error } = await supabase.rpc("peek_guardian_request", { p_token: token });

    if (error) {
      return { status: "network_error" };
    }

    const row = (Array.isArray(data) ? data[0] : data) as PeekRow | null | undefined;
    if (!row) {
      return { status: "unavailable" };
    }

    return {
      status: "valid",
      requestedAt: row.requested_at,
      expiresAt: row.expires_at,
      guardianCopyVersion: row.guardian_copy_version,
      requestTermsVersion: row.request_terms_version,
      requestPrivacyVersion: row.request_privacy_version,
    };
  } catch {
    // Configuration error or any other synchronous throw. Never logged with
    // the thrown value — it could be an SDK error object whose shape is not
    // reviewed here, and this file's own contract is to log nothing at all.
    return { status: "network_error" };
  }
}

export type GuardianRedeemOutcome = "approved" | "declined" | "unavailable" | "network_error";

/**
 * Calls `redeem_guardian_request`. Must only ever be invoked from an explicit
 * guardian button click — see GuardianParticipationClient, which gates this
 * call on its own state being exactly `valid_pending` before dispatching
 * `SUBMIT`, with guardianPageReducer's own transition guard as the backstop.
 */
export async function redeemGuardianRequest(
  token: string,
  decision: GuardianDecision
): Promise<GuardianRedeemOutcome> {
  try {
    const supabase = createGuardianClient();
    const { data, error } = await supabase.rpc("redeem_guardian_request", {
      p_token: token,
      p_decision: decision === "approve" ? "approve" : "decline",
    });

    if (error) {
      // Transport failure: the server may or may not have committed a
      // decision. This is NEVER mapped to "unavailable" — that would claim a
      // definite negative answer this call did not actually receive.
      return "network_error";
    }

    if (data === "approved" || data === "declined" || data === "unavailable") {
      return data;
    }

    // An unrecognized response shape is treated the same as the server's own
    // generic refusal — fail closed, never optimistic.
    return "unavailable";
  } catch {
    // Same reasoning as peekGuardianRequest's try/catch: client construction
    // (or anything else) can throw synchronously, and that must become the
    // SAME ambiguous "network_error" outcome a mid-flight transport failure
    // would — never "unavailable" (a false definite negative) and never a
    // rejected promise (which would strand the caller's .then() unresolved).
    return "network_error";
  }
}
