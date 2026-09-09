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

/** Ends the browser session. Present so a signed-in athlete can switch accounts. */
export async function signOutCurrentUser(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}
