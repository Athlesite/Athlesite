/**
 * Age eligibility for the invited pilot.
 *
 * Three thresholds matter and they are all stated as constants, because the one
 * that is most likely to change — the self-consent age — is pending legal review
 * (`NOW.md` § Blocked on legal review). Moving it should be a one-line change here,
 * not a hunt through branching logic.
 *
 * **What this module is not.** It computes eligibility from a date the athlete typed.
 * It is a normal-product-path control, not verified age assurance: nothing here stops
 * an athlete entering a false date. See `DECISIONS.md` for the honest limitation
 * statement that belongs with this feature.
 *
 * **The date of birth never leaves the call.** `resolveAgeEligibility` takes the parts,
 * returns a bracket, and keeps nothing. No caller should store the input, and nothing
 * in this module persists anything — see age-eligibility.test.ts, which pins that.
 *
 * **`class_year` is never consulted.** It is self-reported, routinely wrong, and a
 * graduating senior may still be 17 — so adulthood is never inferred from it
 * (`DECISIONS.md` § Minor participation is guardian-first).
 */

/** Below this age, Athlesite is not available at all. */
export const MINIMUM_PILOT_AGE = 13;

/** At or above this age an athlete consents for themselves. Pending legal review. */
export const ADULT_AGE = 18;

/**
 * The three semantic outcomes.
 *
 * - `under_13` — prohibited from the pilot.
 * - `minor` — 13 to 17. Identified, and currently blocked at the gate because
 *   guardian participation approval is approved policy but not yet built.
 * - `adult` — 18+. Proceeds through normal onboarding.
 */
export type AgeEligibility = "under_13" | "minor" | "adult";

/** Raw select values, as the UI holds them: strings, possibly empty. */
export type DateOfBirthParts = {
  year: string;
  month: string;
  day: string;
};

/**
 * Is this a real calendar date, not merely three numbers?
 *
 * Built by round-tripping through `Date`: `new Date(2025, 1, 30)` silently becomes
 * 2 March, so comparing the parts back out is what rejects 30 February rather than
 * quietly shifting it.
 */
function toRealDate(year: number, month: number, day: number): Date | null {
  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }
  return candidate;
}

/**
 * Completed years between `birth` and `today`.
 *
 * Leap-day convention, stated because it is a real decision rather than an accident:
 * someone born 29 February has not had a birthday on 28 February of a non-leap year —
 * the month/day comparison below treats `(2, 28) < (2, 29)` as "not yet" — so they
 * reach each threshold on 1 March. That is the conservative direction at a legal
 * boundary: it never ages someone up early.
 */
function completedYears(birth: Date, today: Date): number {
  let age = today.getFullYear() - birth.getFullYear();

  const monthDelta = today.getMonth() - birth.getMonth();
  const dayDelta = today.getDate() - birth.getDate();
  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  return age;
}

/**
 * Resolves typed date-of-birth parts to an eligibility bracket.
 *
 * Returns **`null` for anything indeterminate** — incomplete, non-numeric, not a real
 * calendar date, or in the future. `null` is not a bracket and must never be treated
 * as one: it means "cannot determine", and the caller's job is to keep the athlete
 * where they are rather than guess. Critically, **no invalid input path can return
 * `adult`**, which is the property the tests pin hardest.
 *
 * `today` is injectable so boundary behaviour is directly assertable without freezing
 * the system clock — the same pattern `sign-out.ts` uses for `location`.
 */
export function resolveAgeEligibility(
  parts: DateOfBirthParts,
  today: Date = new Date()
): AgeEligibility | null {
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  // Empty strings coerce to 0, so this also covers incomplete input.
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year <= 0 || month <= 0 || day <= 0) return null;

  const birth = toRealDate(year, month, day);
  if (birth === null) return null;

  // A birth date in the future is nonsense, not an adult.
  if (birth.getTime() > today.getTime()) return null;

  const age = completedYears(birth, today);
  if (age < 0) return null;
  if (age < MINIMUM_PILOT_AGE) return "under_13";
  if (age < ADULT_AGE) return "minor";
  return "adult";
}

/** Whether this bracket may continue through onboarding today. Only adults may. */
export function mayContinueOnboarding(eligibility: AgeEligibility | null): boolean {
  return eligibility === "adult";
}

/**
 * Whether a resolved bracket is blocked from onboarding.
 *
 * A type predicate rather than a plain boolean so the caller's `reason` narrows to the
 * two blocked brackets. TypeScript cannot narrow a union through an ordinary function
 * return, and the alternative — re-comparing the literals at the call site — would put
 * the same policy in two places.
 *
 * `null` (indeterminate) is deliberately **not** blocked: it means the gate could not
 * decide, so the athlete stays on the gate rather than being shown a blocked message
 * they did not earn.
 */
export function isBlockedFromOnboarding(
  eligibility: AgeEligibility | null
): eligibility is Exclude<AgeEligibility, "adult"> {
  return eligibility === "under_13" || eligibility === "minor";
}
