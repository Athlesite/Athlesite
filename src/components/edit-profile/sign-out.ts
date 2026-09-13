import { signOutCurrentUser } from "@/lib/supabase/auth";

/**
 * Where a signed-out athlete lands.
 *
 * The public homepage — never `/edit-profile` itself, which is the one route
 * this checkpoint requires session state to visibly disappear from. Landing
 * back on it immediately after signing out would also re-trigger its own
 * inline OTP gate on the very page the athlete just asked to leave.
 */
export const SIGNED_OUT_DESTINATION = "/";

/**
 * Ends the athlete's session and reports where they should be sent next.
 *
 * Split out of EditProfileForm's click handler so the two things this
 * checkpoint actually changes — which auth helper is called, and what path a
 * signed-out athlete lands on — are directly testable without a DOM or a
 * mocked next/navigation router (see sign-out.test.ts). This project has no
 * component-test framework (see save-state.ts's own docblock for the same
 * reasoning), so the handler itself is not unit tested and stays a thin,
 * by-inspection wrapper around this function and navigateAfterSignOut below.
 *
 * `signOut` defaults to the project's real, existing signOutCurrentUser
 * (src/lib/supabase/auth.ts) — never reimplemented here. It is injectable
 * only so a test can supply a fake and observe the call, the same pattern
 * uploadPhoto's own tests use for its network dependency. Rejects rather
 * than swallowing a failure: signOutCurrentUser resolves only when it has
 * positive evidence the browser's local session is gone (whether signOut()
 * itself reported clean success, or reported an error that a follow-up
 * session check positively confirmed was immaterial), and throws in every
 * other case — including when that follow-up check is itself inconclusive
 * — see its own docblock for the full decision. Either way, this function
 * must not report a destination (and a caller must not navigate anywhere)
 * unless that resolves.
 */
export async function signOutAndGetRedirectPath(
  signOut: () => Promise<void> = signOutCurrentUser
): Promise<string> {
  await signOut();
  return SIGNED_OUT_DESTINATION;
}

/** The minimal slice of `Location` this needs — real enough to assert on in a test, without a DOM. */
type ReplaceableLocation = Pick<Location, "replace">;

/**
 * Navigates to `destination` via `location.replace`, never `location.href`/
 * `assign` or `router.push`.
 *
 * `replace` overwrites the current history entry instead of pushing a new
 * one. `href`/`assign` would leave a `/edit-profile` entry in history that
 * the browser's back-forward cache (bfcache) could restore on Back without a
 * fresh request — a real risk here specifically, since /edit-profile is the
 * one route this checkpoint requires session state to disappear from.
 *
 * `location` is injectable (defaulting to the real `window.location`) so
 * this exact method choice is directly assertable in a test, without a DOM —
 * see sign-out.test.ts.
 */
export function navigateAfterSignOut(
  destination: string,
  location: ReplaceableLocation = window.location
): void {
  location.replace(destination);
}
