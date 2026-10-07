/**
 * Athlete-facing copy for the onboarding Welcome step.
 *
 * Pulled out of WelcomeStep.tsx (a .tsx file, and therefore outside what
 * this project's plain node:test runner can import — see save-state.ts's
 * own docblock for the same reason its logic lives in a plain module) so
 * the exact wording can be asserted directly.
 *
 * This copy has been corrected three times, each time because it described
 * storage behaviour the product did not actually have.
 *
 * - **Round 1.** The original claimed data was "stored only on this device and
 *   browser" with "no account or backend behind it" — both false once profiles
 *   began saving to a real account and became anonymously readable once published.
 * - **Round 2.** That rewrite implied the local draft disappeared "when you
 *   finish" (nothing cleared it), and said the emailed code itself "makes your
 *   profile live" (the code only handles the account; publishing is separate).
 * - **Round 3, this one.** Round 2 told athletes "your answers are kept as a draft
 *   in this browser". That became false when pre-auth draft persistence was
 *   removed: nothing is written to the browser any more, so a refresh loses
 *   unsaved progress. Promising a saved draft and then silently losing it is worse
 *   than saying plainly that nothing is saved yet — so the copy now carries that
 *   warning instead, which is also the only UX mitigation this change needs.
 *
 * It states, truthfully and without exposing "Supabase" as a name an athlete has
 * no reason to know: nothing is saved while building, refreshing starts over,
 * nothing is public, the emailed code only handles the account, and publishing is
 * its own explicit step. See welcome-copy.test.ts.
 */
export const WELCOME_INTRO_COPY =
  "This is an early preview build. While you're building your profile, your answers stay in this tab only — nothing is saved yet and nothing is public, so refreshing or closing the tab will start you over. A quick email code creates or signs you into your Athlesite account, and your profile only goes live once you save and publish it. You're helping shape what Athlesite becomes.";
