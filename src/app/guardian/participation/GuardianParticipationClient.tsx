"use client";

import { useEffect, useReducer, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { captureAndClearFragment } from "@/lib/guardian/guardian-fragment";
import { parseGuardianTokenFragment } from "@/lib/guardian/guardian-token";
import { isFullyKnownGuardianRequest, resolveGuardianCopy } from "@/lib/guardian/guardian-copy";
import { peekGuardianRequest, redeemGuardianRequest } from "@/lib/guardian/guardian-repository";
import {
  guardianPageReducer,
  initialGuardianPageState,
  type GuardianDecision,
} from "@/lib/guardian/guardian-state";

/**
 * The guardian participation approval page's interactive body.
 *
 * Fragment handling, in order, exactly once per real page load:
 *   1. capture `window.location.hash` and immediately clear it via
 *      `history.replaceState` (guardian-fragment.ts) — BEFORE any network call
 *   2. parse the captured value for exactly one well-formed token
 *      (guardian-token.ts)
 *   3. only then call `peek_guardian_request` — never on a malformed/missing
 *      token, which goes straight to the generic unavailable state
 *
 * The token itself lives only in `tokenRef` — a plain ref, never React state
 * (so it is never logged by a state-inspecting devtool), never written to any
 * browser storage, and never included in a URL this component constructs.
 *
 * `capturedRef` makes the mount effect run its fragment-capture-and-clear
 * exactly once even under React Strict Mode's deliberate double-invocation of
 * effects in development: the SECOND invocation sees `capturedRef.current`
 * already `true` and returns immediately, before touching the fragment a
 * second time (which would otherwise just capture the empty string the first
 * call already cleared, misread as "missing token").
 */
export type GuardianParticipationClientProps = {
  /**
   * Test-only seam. When provided, bypasses reading `window.location`/
   * `window.history` entirely and uses this raw fragment string (no leading
   * `#`) instead — so a unit test can exercise capture/peek/redeem gating
   * without controlling jsdom's real URL. Production code never passes this;
   * the real page always reads the real fragment via
   * `captureAndClearFragment(window.location, window.history)`.
   */
  initialFragment?: string;
  /** Test-only seam for injecting a fake peek implementation. */
  peekImpl?: typeof peekGuardianRequest;
  /** Test-only seam for injecting a fake redeem implementation. */
  redeemImpl?: typeof redeemGuardianRequest;
};

export function GuardianParticipationClient({
  initialFragment,
  peekImpl = peekGuardianRequest,
  redeemImpl = redeemGuardianRequest,
}: GuardianParticipationClientProps = {}) {
  const [state, dispatch] = useReducer(guardianPageReducer, initialGuardianPageState);
  const tokenRef = useRef<string | null>(null);
  const capturedRef = useRef(false);
  // Synchronous double-click guard. `state.status` alone is NOT enough here:
  // two click events dispatched in the same tick (a genuine rapid
  // double-click, or a test firing both synchronously) both close over the
  // SAME stale `state` from the render that is still current when both
  // handlers run, since React has not yet re-rendered between them. A plain
  // ref flips synchronously on the very first call, so the second one sees
  // it immediately — before any `dispatch` or network call — regardless of
  // whether React has re-rendered yet. The reducer's own SUBMIT guard (only
  // accepted from "valid_pending") is a correct backstop against a STATE
  // regression, but it cannot stop a second `redeemImpl` call from being
  // ISSUED, because `dispatch` is fire-and-forget and this function does not
  // inspect the reducer's result.
  const submittedRef = useRef(false);

  useEffect(() => {
    if (capturedRef.current) return;
    capturedRef.current = true;

    const rawFragment =
      initialFragment !== undefined
        ? initialFragment
        : captureAndClearFragment(window.location, window.history);
    const parsed = parseGuardianTokenFragment(rawFragment);

    if (!parsed.ok) {
      dispatch({ type: "TOKEN_INVALID" });
      return;
    }

    tokenRef.current = parsed.token;
    dispatch({ type: "TOKEN_CAPTURED" });

    peekImpl(parsed.token).then((outcome) => {
      if (outcome.status === "network_error") {
        dispatch({ type: "PEEK_NETWORK_ERROR" });
        return;
      }
      if (outcome.status === "unavailable") {
        dispatch({ type: "PEEK_UNAVAILABLE" });
        return;
      }

      // Fail closed on any pinned wording version this build does not
      // recognize, rather than silently substituting current/newest copy.
      if (
        !isFullyKnownGuardianRequest({
          guardianCopyVersion: outcome.guardianCopyVersion,
          requestTermsVersion: outcome.requestTermsVersion,
          requestPrivacyVersion: outcome.requestPrivacyVersion,
        })
      ) {
        dispatch({ type: "PEEK_UNAVAILABLE" });
        return;
      }

      const copy = resolveGuardianCopy(outcome.guardianCopyVersion);
      // isFullyKnownGuardianRequest already proved this is non-null; the
      // fallback is unreachable but keeps this branch total rather than
      // trusting an invariant silently.
      if (!copy) {
        dispatch({ type: "PEEK_UNAVAILABLE" });
        return;
      }

      dispatch({
        type: "PEEK_VALID",
        pending: { expiresAt: outcome.expiresAt, approvalBody: copy.approvalBody },
      });
    }).catch(() => {
      // Defense in depth: peekImpl (the real implementation) already never
      // rejects — see its own try/catch — but this still protects against an
      // injected implementation (tests) or a future regression that removes
      // that guarantee. Without this, a rejected promise here would leave
      // `.then()`'s callback never running and the page stuck on "checking"
      // forever, which is exactly the failure this review found.
      dispatch({ type: "PEEK_NETWORK_ERROR" });
    });
    // Deliberately mount-only: `initialFragment`, `peekImpl`, and `redeemImpl`
    // are a test-only seam that a real page render never changes across
    // re-renders (the production defaults are stable module-level function
    // references), and the fragment must only ever be captured once per real
    // page load — see capturedRef and its own comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDecision(decision: GuardianDecision) {
    // Explicit-action gate, duplicated deliberately: this is the FIRST line of
    // defense against a double-click issuing two redeem calls (the reducer's
    // own SUBMIT guard, only accepting it from "valid_pending", is the
    // second). A click that arrives after this guard already flipped the
    // status away from "valid_pending" is a no-op here, before any network
    // call is even attempted.
    if (submittedRef.current) return;
    if (state.status !== "valid_pending") return;
    const token = tokenRef.current;
    if (!token) return;

    submittedRef.current = true;
    dispatch({ type: "SUBMIT", decision });

    redeemImpl(token, decision).then((outcome) => {
      if (outcome === "network_error") {
        dispatch({ type: "REDEEM_NETWORK_ERROR" });
        return;
      }
      if (outcome === "unavailable") {
        dispatch({ type: "REDEEM_UNAVAILABLE" });
        return;
      }
      dispatch({ type: "REDEEM_DECIDED", decision: outcome === "approved" ? "approve" : "decline" });
    }).catch(() => {
      // Same defense-in-depth reasoning as the peek call above. Deliberately
      // dispatches the AMBIGUOUS outcome, never "unavailable" — a rejection
      // here means the decision's fate is genuinely unknown, not a definite
      // negative, and REDEEM_NETWORK_ERROR is the only action that reflects
      // that (see guardianPageReducer).
      dispatch({ type: "REDEEM_NETWORK_ERROR" });
    });
  }

  switch (state.status) {
    case "capturing":
    case "checking":
      return <GuardianMessage heading="Checking your link" body="One moment…" />;

    case "valid_pending":
      return (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Guardian approval requested
          </h1>
          <p className="mt-4 text-base text-muted-foreground">{state.pending?.approvalBody}</p>
          <p className="mt-6 text-xs uppercase tracking-wide text-muted-foreground/70">
            This is pilot wording and has not received final legal review.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button type="button" onClick={() => handleDecision("approve")}>
              Approve
            </Button>
            <Button type="button" variant="secondary" onClick={() => handleDecision("decline")}>
              Decline
            </Button>
          </div>
        </div>
      );

    case "submitting":
      return (
        <GuardianMessage
          heading="Submitting your decision"
          body="Please wait — this only takes a moment."
        />
      );

    case "approved":
      return (
        <GuardianMessage
          heading="Approved"
          body="Thank you. Your approval has been recorded for this request."
        />
      );

    case "declined":
      return (
        <GuardianMessage
          heading="Declined"
          body="Your decision has been recorded. This link cannot be used again."
        />
      );

    case "peek_network_error":
      return (
        <GuardianMessage
          heading="Couldn't load this link"
          body="We weren't able to check this link just now. Reloading the page from the original link you were sent may help."
        />
      );

    case "redeem_ambiguous":
      return (
        <GuardianMessage
          heading="We couldn't confirm your decision"
          body="Your decision may or may not have been received — we weren't able to confirm either way. Please do not submit again; if you're unsure, contact the athlete directly."
        />
      );

    case "unavailable":
    default:
      return (
        <GuardianMessage
          heading="This guardian link is no longer available"
          body="It may have already been used, expired, or is no longer valid."
        />
      );
  }
}

function GuardianMessage({ heading, body }: { heading: string; body: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{heading}</h1>
      <p className="mt-4 text-base text-muted-foreground">{body}</p>
    </div>
  );
}
