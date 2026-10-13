/**
 * State machine for the guardian participation approval page. Pure — no
 * Supabase calls, no timers, no DOM — mirroring otpMachine.ts's own
 * discipline: every input that varies arrives as part of an action, so the
 * whole flow is reasoned about, and tested, by feeding it actions and reading
 * state back.
 */

export type GuardianPendingRequest = {
  expiresAt: string;
  approvalBody: string;
};

export type GuardianDecision = "approve" | "decline";

export type GuardianPageStatus =
  /** Capturing and clearing the URL fragment; nothing rendered yet. */
  | "capturing"
  /** peek_guardian_request in flight. */
  | "checking"
  /** A valid, unexpired, fully-recognized minor/pending request — awaiting a decision. */
  | "valid_pending"
  /** redeem_guardian_request in flight. Buttons disabled; no duplicate submit possible. */
  | "submitting"
  /** Approved in THIS tab, just now. Never reconstructed on reopen. */
  | "approved"
  /** Declined in THIS tab, just now. Never reconstructed on reopen. */
  | "declined"
  /** The generic terminal state for every non-authorizing case: malformed token,
   * no match, wrong state, expired, superseded, consumed, or an unknown pinned
   * wording version. Deliberately undifferentiated — see the migration's own
   * "no token-existence oracle" note. */
  | "unavailable"
  /** A transport/network failure DURING peek. Distinct from "unavailable": the
   * link might still be valid, so the UI must not claim it is invalid. */
  | "peek_network_error"
  /** A transport/network failure DURING redeem. The decision may or may not
   * have reached the database — this is NOT "approved", NOT "declined", and
   * NOT "unavailable". A timeout here must never be read as proof of failure. */
  | "redeem_ambiguous";

export type GuardianPageState = {
  status: GuardianPageStatus;
  pending: GuardianPendingRequest | null;
  decisionInFlight: GuardianDecision | null;
};

export const initialGuardianPageState: GuardianPageState = {
  status: "capturing",
  pending: null,
  decisionInFlight: null,
};

export type GuardianPageAction =
  /** The fragment was captured and cleared; token parsing/format was invalid,
   * or no token was present at all. Collapses directly to the generic state —
   * this app never surfaces WHY a token was malformed to the guardian. */
  | { type: "TOKEN_INVALID" }
  /** The fragment yielded a well-formed token; peek is starting. */
  | { type: "TOKEN_CAPTURED" }
  /** peek_guardian_request returned a valid, unexpired minor/pending row whose
   * pinned wording versions all resolved (see guardian-copy.ts). */
  | { type: "PEEK_VALID"; pending: GuardianPendingRequest }
  /** peek_guardian_request returned no row, OR returned a row whose pinned
   * wording version this build does not recognize (fail-closed). */
  | { type: "PEEK_UNAVAILABLE" }
  /** The peek call itself failed to complete (network/transport). */
  | { type: "PEEK_NETWORK_ERROR" }
  /** The guardian clicked Approve or Decline. Only accepted from
   * "valid_pending" — see the reducer body for why this is itself the
   * double-click/duplicate-submission guard. */
  | { type: "SUBMIT"; decision: GuardianDecision }
  /** redeem_guardian_request returned a definite 'approved' or 'declined'. */
  | { type: "REDEEM_DECIDED"; decision: GuardianDecision }
  /** redeem_guardian_request returned a definite 'unavailable' (replay, lost
   * race, expired-at-redeem, generation mismatch, deleted owner, malformed). */
  | { type: "REDEEM_UNAVAILABLE" }
  /** The redeem call itself failed to complete (network/transport) — outcome
   * on the server is genuinely unknown. */
  | { type: "REDEEM_NETWORK_ERROR" };

export function guardianPageReducer(
  state: GuardianPageState,
  action: GuardianPageAction
): GuardianPageState {
  switch (action.type) {
    case "TOKEN_INVALID":
      // Only meaningful from "capturing" — once past it, a late/duplicate
      // capture (e.g. a Strict-Mode effect replay that was NOT already
      // suppressed upstream) must not be able to regress a resolved state.
      return state.status === "capturing" ? { ...state, status: "unavailable" } : state;

    case "TOKEN_CAPTURED":
      return state.status === "capturing" ? { ...state, status: "checking" } : state;

    case "PEEK_VALID":
      return state.status === "checking"
        ? { ...state, status: "valid_pending", pending: action.pending }
        : state;

    case "PEEK_UNAVAILABLE":
      return state.status === "checking" ? { ...state, status: "unavailable" } : state;

    case "PEEK_NETWORK_ERROR":
      return state.status === "checking" ? { ...state, status: "peek_network_error" } : state;

    case "SUBMIT":
      // THE double-click/duplicate-submission guard: only "valid_pending" ever
      // accepts a SUBMIT action. Once this transitions to "submitting", a
      // second click dispatches SUBMIT again, but the reducer is already past
      // "valid_pending" and this branch is simply skipped — no second
      // redeemGuardianRequest call is ever issued by code that respects this
      // state (see GuardianParticipationClient, which guards its click
      // handler on `status === "valid_pending"` for exactly this reason, with
      // this reducer as the backstop if that guard were ever removed).
      return state.status === "valid_pending"
        ? { ...state, status: "submitting", decisionInFlight: action.decision }
        : state;

    case "REDEEM_DECIDED":
      return state.status === "submitting"
        ? { ...state, status: action.decision === "approve" ? "approved" : "declined" }
        : state;

    case "REDEEM_UNAVAILABLE":
      return state.status === "submitting" ? { ...state, status: "unavailable" } : state;

    case "REDEEM_NETWORK_ERROR":
      return state.status === "submitting" ? { ...state, status: "redeem_ambiguous" } : state;

    default:
      return state;
  }
}
