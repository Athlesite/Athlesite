/**
 * State machine for the inline email OTP flow.
 *
 * Deliberately pure: no Supabase calls, no timers, no Date.now(), no React.
 * Every input that varies (the current time, the result of a network call)
 * arrives as part of an action, so the whole flow can be reasoned about — and
 * later tested — by feeding it actions and reading the state back.
 *
 * The flow itself is recorded in docs/ai/DECISIONS.md § Auth & Ownership:
 * request a code, type it on the same screen, no callback route, no navigation.
 */

/** Seconds before a resend is offered again. Mirrors Supabase's own per-address limit. */
export const RESEND_COOLDOWN_SECONDS = 60;

export type OtpStatus =
  /** Checking for an existing session; nothing is shown yet. */
  | "checking"
  /** No session. Collecting the email address. */
  | "collectingEmail"
  /** signInWithOtp in flight. */
  | "sending"
  /** Code was sent. Collecting the code. */
  | "collectingCode"
  /** verifyOtp in flight. */
  | "verifying"
  /** Authenticated. */
  | "signedIn";

export type OtpState = {
  status: OtpStatus;
  email: string;
  code: string;
  /** Athlete-readable message only. Raw provider errors never reach here. */
  error: string | null;
  /** Email of the authenticated account, once signed in. */
  signedInEmail: string | null;
  /** When the last code was sent, for the resend cooldown. Epoch ms. */
  lastSentAt: number | null;
  /**
   * Whether a send has ever succeeded in this session, which means Supabase has
   * created the Auth account.
   *
   * Sticky on purpose, and distinct from `lastSentAt`: the cooldown stamp is cleared
   * whenever the athlete goes back to change the address, but changing the address does
   * not un-create the account that the previous send already made. The age lock reads
   * this, so it cannot be released by stepping back to the email field.
   */
  accountCreated: boolean;
};

export type OtpAction =
  | { type: "SESSION_CHECKED"; email: string | null }
  | { type: "EMAIL_CHANGED"; value: string }
  | { type: "CODE_CHANGED"; value: string }
  | { type: "SEND_STARTED" }
  | { type: "SEND_SUCCEEDED"; at: number }
  | { type: "SEND_FAILED"; message: string }
  | { type: "VERIFY_STARTED" }
  | { type: "VERIFY_SUCCEEDED"; email: string | null }
  | { type: "VERIFY_FAILED"; message: string }
  | { type: "CHANGE_EMAIL" }
  /**
   * Discard local OTP input. Used when onboarding is abandoned mid-flow — notably
   * when an age answer turns out to be blocked and every field collected in the
   * session has to go.
   */
  | { type: "RESET" };

export const initialOtpState: OtpState = {
  status: "checking",
  email: "",
  code: "",
  error: null,
  signedInEmail: null,
  lastSentAt: null,
  accountCreated: false,
};

export function otpReducer(state: OtpState, action: OtpAction): OtpState {
  switch (action.type) {
    case "SESSION_CHECKED":
      // An athlete who is already signed in never sees the OTP UI at all.
      return action.email
        ? {
            ...state,
            status: "signedIn",
            signedInEmail: action.email,
            error: null,
            accountCreated: true,
          }
        : { ...state, status: "collectingEmail" };

    case "EMAIL_CHANGED":
      // Typing clears the previous error rather than leaving stale red text.
      return { ...state, email: action.value, error: null };

    case "CODE_CHANGED":
      return { ...state, code: action.value, error: null };

    case "SEND_STARTED":
      return { ...state, status: "sending", error: null };

    case "SEND_SUCCEEDED":
      return {
        ...state,
        status: "collectingCode",
        code: "",
        error: null,
        lastSentAt: action.at,
        // The send succeeded, so shouldCreateUser: true has created the account.
        accountCreated: true,
      };

    case "SEND_FAILED":
      // Stay on the email field so the address can be corrected in place.
      return { ...state, status: "collectingEmail", error: action.message };

    case "VERIFY_STARTED":
      return { ...state, status: "verifying", error: null };

    case "VERIFY_SUCCEEDED":
      return {
        ...state,
        status: "signedIn",
        signedInEmail: action.email,
        code: "",
        error: null,
      };

    case "VERIFY_FAILED":
      // Keep the typed code: a wrong digit is easier to fix than to retype.
      return { ...state, status: "collectingCode", error: action.message };

    case "CHANGE_EMAIL":
      // Abandon the outstanding code and go back to the address field.
      return { ...state, status: "collectingEmail", code: "", error: null, lastSentAt: null };

    case "RESET":
      // Local input only. This cannot revoke a Supabase session that already exists,
      // so a signed-in state is preserved rather than faked away — the age lock
      // (hasOtpSendStarted) is what stops a blocked answer being reachable once an
      // account has been created. Clearing `code` and `error` still removes the
      // typed input, which is what a discarded session requires.
      return state.status === "signedIn"
        ? { ...state, code: "", error: null }
        : { ...initialOtpState, status: "collectingEmail" };

    default:
      return state;
  }
}

/** Seconds left before a resend is allowed. 0 when it is allowed now. */
export function resendSecondsRemaining(state: OtpState, now: number): number {
  if (state.lastSentAt == null) return 0;
  const elapsed = Math.floor((now - state.lastSentAt) / 1000);
  return Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed);
}

/** Whether the save/publish action should be allowed to proceed. */
export function isAuthenticated(state: OtpState): boolean {
  return state.status === "signedIn";
}

/**
 * Whether an OTP send has begun, or a session already exists.
 *
 * This is the age lock. `sendEmailOtp` calls `signInWithOtp({ shouldCreateUser: true })`,
 * so **the Auth account is created at send time, not at verify** — which means once a
 * send is under way, letting an athlete revisit the age gate would allow reclassifying
 * themselves after account creation had already started.
 *
 * A *failed* send is deliberately not counted: the request errored, so Supabase created
 * no user, and there is nothing yet to protect. `accountCreated` is only set on success,
 * and `sending` covers the in-flight window.
 *
 * It reads `accountCreated` rather than `lastSentAt` because CHANGE_EMAIL clears the
 * cooldown stamp so a new address can be sent immediately — correct for the cooldown,
 * but it must not hand back an unlocked age gate on a session that already has an
 * account behind it.
 */
export function hasOtpSendStarted(state: OtpState): boolean {
  return (
    state.accountCreated ||
    state.status === "sending" ||
    state.status === "collectingCode" ||
    state.status === "verifying" ||
    state.status === "signedIn"
  );
}

/** True while a network call is in flight, for disabling inputs. */
export function isBusy(state: OtpState): boolean {
  return state.status === "sending" || state.status === "verifying";
}

/**
 * Masks an email for display: j…n@example.com. The athlete needs to recognise
 * the address, not read it back in full, and it keeps a shoulder-surfer from
 * harvesting it off a shared screen.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain || local.length === 0) return email;
  if (local.length <= 2) return `${local[0]}…@${domain}`;
  return `${local[0]}…${local[local.length - 1]}@${domain}`;
}
