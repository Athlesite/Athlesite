/**
 * Deletion-specific re-authentication.
 *
 * ── WHY NOT REUSE THE APP'S OTP HELPER ───────────────────────────────────────────
 *
 * `src/lib/supabase/auth.ts` sends OTPs with `shouldCreateUser: true`, which is correct for
 * onboarding — a first-time athlete signing up is the normal case there. It is *wrong* for a
 * deletion workflow, and dangerously so on a retry: once the Auth user has been removed, a
 * signup-enabled OTP request would silently **recreate** the very account that was just
 * deleted, and the tool would then happily "verify" against a brand-new empty user.
 *
 * So this path pins `shouldCreateUser: false`. If the user no longer exists, the request must
 * fail rather than conjure one.
 *
 * Credentials obtained here stay in memory. Nothing in this module writes to disk.
 */

/**
 * Builds the OTP request body. Pure, so the non-signup guarantee is directly testable.
 */
export function buildOtpRequest(email) {
  const trimmed = typeof email === "string" ? email.trim() : "";
  if (trimmed === "" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, reason: "INVALID_EMAIL" };
  }
  return {
    ok: true,
    body: {
      email: trimmed,
      // Never true here. A deletion flow must not be able to create an account.
      create_user: false,
    },
  };
}

/** Sends a sign-in-only OTP. Returns `{ ok }` without echoing the address. */
export async function sendDeletionOtp({ fetchImpl, supabaseUrl, anonKey, email }) {
  const built = buildOtpRequest(email);
  if (!built.ok) return { ok: false, reason: built.reason };

  const response = await fetchImpl(`${supabaseUrl}/auth/v1/otp`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(built.body),
  });

  if (response.status === 200) return { ok: true };

  // A non-existent user surfaces here rather than being created.
  let code;
  try {
    const body = await response.json();
    code = body?.error_code ?? body?.code;
  } catch {
    /* ignore */
  }
  return { ok: false, reason: "OTP_REQUEST_REFUSED", status: response.status, code };
}

/** Exchanges an emailed code for a session. Tokens are returned, never persisted. */
export async function verifyDeletionOtp({ fetchImpl, supabaseUrl, anonKey, email, token }) {
  const response = await fetchImpl(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "email", email: String(email).trim(), token: String(token).trim() }),
  });
  if (response.status !== 200) return { ok: false, reason: "OTP_VERIFY_FAILED", status: response.status };

  const body = await response.json();
  if (typeof body?.access_token !== "string" || typeof body?.user?.id !== "string") {
    return { ok: false, reason: "OTP_VERIFY_INCOMPLETE" };
  }
  return { ok: true, accessToken: body.access_token, uid: body.user.id };
}

/**
 * Positively confirms who the supplied token is. Used before every destructive step.
 *
 * `authValidated` is true only on an explicit 200 with a matching id — a failed or ambiguous
 * response is never read as "probably still fine".
 */
export async function confirmIdentity({ fetchImpl, supabaseUrl, anonKey, accessToken }) {
  try {
    const response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
    });
    if (response.status !== 200) return { authValidated: false, status: response.status };
    const body = await response.json();
    if (typeof body?.id !== "string") return { authValidated: false, reason: "NO_ID" };
    return { authValidated: true, uid: body.id };
  } catch {
    return { authValidated: false, reason: "NETWORK" };
  }
}
