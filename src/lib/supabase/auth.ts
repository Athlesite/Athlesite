import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Inline numeric email OTP.
 *
 * The athlete requests a code, receives it by email, and types it on the same
 * screen. No callback route, no magic-link navigation, no reload — see
 * docs/ai/DECISIONS.md § Auth & Ownership. That constraint exists because hero
 * and profile photo File/blob state lives in React memory during onboarding and
 * would be destroyed by navigating away.
 *
 * Every function here is browser-side and returns a discriminated result rather
 * than throwing, so callers can render an inline error without a try/catch at
 * every call site.
 */

export type AuthResult =
  | { ok: true }
  | { ok: false; message: string };

export type VerifyResult =
  | { ok: true; user: User }
  | { ok: false; message: string };

/**
 * Supabase error messages are aimed at developers and occasionally leak
 * implementation detail. Map the ones an athlete can actually hit to plain
 * language, and fall back to something calm rather than echoing the raw text.
 */
function friendlyMessage(raw: string | undefined, fallback: string): string {
  const message = (raw ?? "").toLowerCase();

  if (message.includes("rate limit") || message.includes("too many")) {
    return "Too many attempts. Wait about a minute, then try again.";
  }
  if (message.includes("expired")) {
    return "That code has expired. Request a new one.";
  }
  if (message.includes("invalid") && message.includes("token")) {
    return "That code isn't right. Check the email and try again.";
  }
  if (message.includes("invalid") && message.includes("email")) {
    return "That doesn't look like a valid email address.";
  }
  if (message.includes("failed to fetch") || message.includes("network")) {
    return "Couldn't reach Athlesite. Check your connection and try again.";
  }
  return fallback;
}

/** Cheap client-side format check, so an obvious typo doesn't spend a send. */
export function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Sends a numeric login code to `email`.
 *
 * `shouldCreateUser` is left at its default of true and stated explicitly: an
 * athlete signing up for the first time is the normal case, not the exception.
 *
 * `emailRedirectTo` is deliberately NOT set. Passing it would put a clickable
 * confirmation link in the email, and clicking it would navigate away from
 * onboarding — the exact failure this flow is designed to avoid.
 */
export async function sendEmailOtp(email: string): Promise<AuthResult> {
  const trimmed = email.trim();

  if (!isLikelyEmail(trimmed)) {
    return { ok: false, message: "That doesn't look like a valid email address." };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: { shouldCreateUser: true },
  });

  if (error) {
    return {
      ok: false,
      message: friendlyMessage(error.message, "Couldn't send your code. Try again."),
    };
  }

  return { ok: true };
}

/**
 * Exchanges the emailed numeric code for a session.
 *
 * `type: "email"` is the recorded decision, and is verified working against the
 * live project. Note that a brand-new address may emit a signup-type token
 * depending on Supabase version; if a new address fails here while an existing
 * address succeeds, that is the cause — report it rather than silently
 * switching type.
 *
 * Token length is deliberately not validated or assumed. The live project
 * issues 8-digit codes, not the 6 that most Supabase examples show, and the
 * length is a dashboard setting that can change without a code deploy. Pass the
 * token through and let the Auth server decide. Any UI built on this must not
 * hardcode a maxLength either.
 */
export async function verifyEmailOtp(email: string, token: string): Promise<VerifyResult> {
  const trimmedEmail = email.trim();
  // Codes get pasted with stray spaces surprisingly often.
  const trimmedToken = token.replace(/\s/g, "");

  if (!trimmedToken) {
    return { ok: false, message: "Enter the code from your email." };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: trimmedEmail,
    token: trimmedToken,
    type: "email",
  });

  if (error) {
    return {
      ok: false,
      message: friendlyMessage(error.message, "That code didn't work. Try again."),
    };
  }

  if (!data.user) {
    return { ok: false, message: "Signed in, but no account came back. Try again." };
  }

  return { ok: true, user: data.user };
}

/**
 * The signed-in user, or null.
 *
 * Uses getUser(), which revalidates with the Auth server, rather than
 * getSession(), which trusts whatever is in local storage/cookies.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

/**
 * A Supabase auth error as this function actually reads it — just the
 * message. Matches the shape of the real SDK's `AuthError` (which carries
 * more, e.g. `status`/`name`, none of which this function uses).
 */
type SignOutAuthError = { message?: string };

/**
 * The minimal slice of the Supabase client signOutCurrentUser needs.
 *
 * Kept narrow and local, rather than typed against the full SupabaseClient/
 * GoTrueClient shape, so a test can supply a plain fake object without
 * satisfying (or casting past) dozens of unrelated auth methods this
 * function never touches. The real client returned by createClient()
 * satisfies this structurally, no cast required. `getSession()`'s return
 * shape mirrors the real SDK's documented envelope — `{ data: { session },
 * error }`, where `session` is `null` once nothing is stored locally —
 * because that exact shape is what the fail-safe logic below depends on.
 */
type SignOutClient = {
  auth: {
    signOut: () => Promise<{ error: SignOutAuthError | null }>;
    getSession: () => Promise<{
      data: { session: unknown | null };
      error: SignOutAuthError | null;
    }>;
  };
};

/**
 * Ends the browser session. Present so a signed-in athlete can switch
 * accounts, including on a device someone else uses next.
 *
 * The governing rule: this function may resolve (report success, and
 * upstream trigger navigation away from /edit-profile) **only when it has
 * positive evidence that the local session is no longer usable.** Absence
 * of proof is not proof of sign-out — it is treated as a failure, so the
 * athlete stays on the page with a recoverable error rather than being
 * navigated away while a session might still be live.
 *
 * `supabase.auth.signOut()` returning `{ error }` does not by itself prove
 * the athlete is still signed in — the installed SDK can clear the local
 * session and still return an auxiliary/server-side error (e.g. the global
 * sign-out endpoint call failing after the local session was already
 * wiped). So an `error` from `signOut()` is never trusted on its own: it is
 * followed by a direct check of `getSession()`, the SDK's own read of local
 * session storage — the only source that can actually supply the positive
 * evidence the rule above requires.
 *
 * Four outcomes:
 *  - **No error from `signOut()`** — positive evidence of success on its
 *    own. Resolve.
 *  - **Error from `signOut()`, but `getSession()` cleanly reports
 *    `{ data: { session: null }, error: null }`** — positive evidence the
 *    local session is gone despite the auxiliary error. Resolve.
 *  - **Error from `signOut()`, and `getSession()` reports a session still
 *    exists** — direct evidence sign-out did *not* complete. Throw.
 *  - **Error from `signOut()`, and the follow-up `getSession()` call itself
 *    is inconclusive** — it throws, or resolves with its own non-null
 *    `error` — there is no positive evidence either way, which the
 *    governing rule above treats as failure, not success. Throw. (This
 *    deliberately supersedes an earlier version of this function that
 *    resolved here instead, reasoning that resolving was the "safer"
 *    default; the safe default the product actually wants is the opposite —
 *    require evidence, never assume it.)
 *
 * A thrown/rejected `signOut()` call (e.g. the initial network request
 * never reaching the Auth server at all) is treated as an ordinary
 * exception and propagates unchanged, without a follow-up session check:
 * unlike a *returned* `{ error }`, nothing here indicates `signOut()` ever
 * reached far enough to have changed local session state one way or the
 * other, so there is no specific "did it actually clear locally" question
 * this function can usefully resolve — the caller's existing recoverable
 * error handling is the correct behavior, unchanged from before this fix.
 *
 * Every thrown error here is a sanitized, athlete-safe message — the raw
 * Supabase error text is never surfaced to a caller.
 *
 * `createSupabaseClient` defaults to the project's real createClient() — an
 * injectable seam purely for testing these branches without a live
 * Supabase project (see auth.test.ts), never a second sign-out
 * implementation. Every branch above ultimately calls the same, one real
 * `supabase.auth.signOut()`/`getSession()`.
 */
export async function signOutCurrentUser(
  createSupabaseClient: () => SignOutClient = createClient
): Promise<void> {
  const supabase = createSupabaseClient();
  const { error } = await supabase.auth.signOut();

  if (!error) {
    return;
  }

  const notProvenSignedOut = () =>
    new Error(friendlyMessage(error.message, "Couldn't sign out. Try again."));

  let sessionCheck: Awaited<ReturnType<SignOutClient["auth"]["getSession"]>>;
  try {
    sessionCheck = await supabase.auth.getSession();
  } catch {
    // The session check itself is inconclusive — no positive evidence of
    // sign-out, so this is a failure, not a success. See docblock.
    throw notProvenSignedOut();
  }

  if (sessionCheck.error) {
    // Same reasoning as the thrown case immediately above: an error here
    // answers nothing about whether the local session is actually gone.
    throw notProvenSignedOut();
  }

  if (sessionCheck.data.session === null) {
    // Positive evidence: the local session is genuinely gone despite
    // signOut()'s own auxiliary error.
    return;
  }

  // A session demonstrably still exists — this is a real, confirmed failure.
  throw notProvenSignedOut();
}
