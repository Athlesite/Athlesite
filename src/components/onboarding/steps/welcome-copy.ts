/**
 * Athlete-facing copy for the onboarding Welcome step.
 *
 * Pulled out of WelcomeStep.tsx (a .tsx file, and therefore outside what
 * this project's plain node:test runner can import — see save-state.ts's
 * own docblock for the same reason its logic lives in a plain module) so
 * the exact wording can be asserted directly.
 *
 * This checkpoint's fix, in two rounds. Round 1: the original copy claimed
 * data was "stored only on this device and browser" with "no account or
 * backend behind it" — both false once profiles began saving to a real
 * account and became anonymously readable once published (docs/ai/NOW.md).
 * Round 2: the round-1 rewrite introduced two new inaccuracies — it implied
 * the local draft disappears "when you finish" (nothing in the product
 * clears it; onboarding's own draft cache is left in place deliberately,
 * see onboarding-storage.ts), and it said the emailed code itself "makes
 * your profile live" (the code only creates/signs into the account; going
 * live is a separate, explicit save/publish action — see
 * DECISIONS.md § Publishing). This copy states, truthfully and without
 * exposing "Supabase" as a name an athlete has no reason to know: a draft
 * is kept in this browser while building, nothing is public while building,
 * the emailed code only handles the account, and publishing is its own
 * explicit step. See welcome-copy.test.ts.
 */
export const WELCOME_INTRO_COPY =
  "This is an early preview build. While you're building your profile, your answers are kept as a draft in this browser, and nothing is public. A quick email code creates or signs you into your Athlesite account, and your profile only goes live once you save and publish it. You're helping shape what Athlesite becomes.";
