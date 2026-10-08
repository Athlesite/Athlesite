/**
 * Athlete-facing copy for the age gate.
 *
 * In a plain module rather than inside the `.tsx` step, for the same reason
 * `welcome-copy.ts` is: this project's `node:test` runner cannot import TSX, and this
 * is copy whose exact wording matters enough to assert directly. See
 * age-eligibility.test.ts.
 *
 * Three rules shaped this wording, and all three are easy to violate by accident:
 *
 * 1. **The two blocked states say different things.** Under-13 is a standing
 *    exclusion; 13–17 is a temporary implementation state while guardian approval is
 *    built. Reusing one message for both would either tell a 15-year-old they are
 *    permanently unwelcome, or imply to a 10-year-old that waiting for a feature will
 *    help.
 * 2. **Neither message invites a second attempt.** No "check your date", no "try
 *    again", no edit affordance. Nudging an athlete to re-enter a different birth date
 *    is the dark pattern this gate exists to avoid.
 * 3. **No legal or compliance vocabulary.** No COPPA, no "parental consent", no
 *    "verification", no statute names. An athlete and their family should not have to
 *    read policy language to understand a plain outcome.
 */

/** Asked before any profile field. States the minimisation truthfully. */
export const AGE_GATE_PROMPT = "What's your date of birth?";

export const AGE_GATE_EXPLANATION =
  "We ask so we know which parts of Athlesite you can use. We don't save your date of birth.";

/**
 * Under 13 — a standing exclusion, stated plainly and without blame.
 *
 * Deliberately offers no path onward and no mention of guardians: a guardian cannot
 * currently change this outcome, so hinting at one would be a false lead.
 */
export const AGE_GATE_UNDER_13_HEADING = "Athlesite isn't available for athletes under 13.";

export const AGE_GATE_UNDER_13_BODY =
  "Thanks for checking us out. We hope to see you here when you're older.";

/**
 * 13–17 — a temporary state, and said to be temporary.
 *
 * This is the honest description of where the product actually is: minor onboarding is
 * approved policy that is not built yet, and guardian approval is the thing being
 * built before it opens. It does not promise a date.
 */
export const AGE_GATE_MINOR_HEADING =
  "Athlesite accounts for athletes under 18 aren't available yet.";

export const AGE_GATE_MINOR_BODY =
  "We're building guardian approval before opening this part of the pilot. Thanks for your patience — we'd love to have you when it's ready.";
