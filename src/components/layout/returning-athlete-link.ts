/**
 * Where the site-wide "returning athlete" entry point sends someone.
 *
 * `/edit-profile` already resolves both states on its own — see its page
 * component: no session shows the inline OTP sign-in gate in place, an
 * authenticated owner goes straight to their editable profile. Header and
 * MobileNav therefore need no auth check of their own; both just point here,
 * unconditionally, for every visitor — this is a UI entry point, not an
 * authorization decision; the route's own server-side getUser() check is
 * what actually decides which experience renders.
 *
 * Kept as an exported constant, not inlined twice, so the one thing this
 * checkpoint adds — a route non-technical athletes can actually find — is
 * directly testable without a rendering framework this project does not
 * have (see save-state.ts for the same reasoning applied to component
 * logic). See returning-athlete-link.test.ts.
 */
export const RETURNING_ATHLETE_PATH = "/edit-profile";
