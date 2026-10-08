/**
 * Shared steps for driving the onboarding wizard in a rendered test.
 *
 * Extracted so the age-gate and OTP interaction tests drive the wizard the same way:
 * the thing under test is the wizard's behaviour, and two tests disagreeing about how
 * to reach the Media step is noise, not coverage.
 */

import type { Harness } from "@/test-support/render";

const CURRENT_YEAR = new Date().getFullYear();

/** A birth year comfortably past 18, so it stays adult however the clock moves. */
export const ADULT_YEAR = String(CURRENT_YEAR - 30);
/** Mid-teens: a minor, but over 13. */
export const MINOR_YEAR = String(CURRENT_YEAR - 15);
/** Under 13. */
export const UNDER_13_YEAR = String(CURRENT_YEAR - 8);

/**
 * Sets a controlled field's value the way React's change tracking requires.
 *
 * React installs its own `value` accessor on the node and uses it to dedupe change
 * events, so a plain assignment is swallowed. Calling the *prototype* setter writes the
 * real value while leaving React's cached copy stale, which is what makes the dispatched
 * event register as a genuine change.
 */
export function setValue(node: Element, value: string): void {
  const prototype =
    node.tagName === "SELECT"
      ? window.HTMLSelectElement.prototype
      : node.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;

  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(node, value);
  node.dispatchEvent(
    new window.Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true })
  );
}

/** Clicks the button whose label is exactly `label`, failing loudly if it is absent. */
export async function clickButton(harness: Harness, label: string): Promise<void> {
  const button = harness.byText<HTMLButtonElement>("button", label);
  if (!button) {
    throw new Error(
      `clickButton(${label}): no such button. Present: ${harness
        .all("button")
        .map((b) => JSON.stringify((b.textContent ?? "").trim()))
        .join(", ")}`
    );
  }
  await harness.interact(() => button.dispatchEvent(new window.Event("click", { bubbles: true })));
}

/** Whether the age gate is the step currently on screen. */
export function onAgeStep(harness: Harness): boolean {
  return /date of birth/i.test(harness.text());
}

/** Whether Athlete Info is the step currently on screen. */
export function onAthleteInfoStep(harness: Harness): boolean {
  return /First name/i.test(harness.text());
}

/** Advances past Welcome onto the age step. */
export async function startOnboarding(harness: Harness): Promise<void> {
  const next = harness
    .all<HTMLButtonElement>("button")
    .find((b) => /next|start|begin|create/i.test(b.textContent ?? ""));
  const target = next ?? harness.all<HTMLButtonElement>("button")[0];
  await harness.interact(() =>
    target.dispatchEvent(new window.Event("click", { bubbles: true }))
  );
}

/** Answers the age gate with the given birth year and submits it. */
export async function answerAge(harness: Harness, year: string): Promise<void> {
  const selects = harness.all<HTMLSelectElement>("select");
  if (selects.length !== 3) {
    throw new Error(
      `answerAge: expected month/day/year selects on the age step, found ${selects.length}`
    );
  }
  await harness.interact(() => setValue(selects[0], "6"));
  await harness.interact(() => setValue(selects[1], "15"));
  await harness.interact(() => setValue(selects[2], year));
  await clickButton(harness, "Continue");
}

/**
 * Satisfies Athlete Info's nine required fields so Continue advances.
 *
 * Every text field gets the same value: "testathlete" is simultaneously a valid
 * username (lowercase, 3-30 chars, unreserved) and a non-empty string, which is all the
 * other required fields check. The optional height/weight fields reject it and stay
 * empty, which is fine — they do not gate Continue. Selects take their first real option.
 *
 * The selector is `input:not([type=file])`, not `input[type=text]`: `UsernameField`
 * renders its input with **no** `type` attribute, so a type-qualified selector silently
 * skips the one field whose validation is strictest.
 */
export async function fillAthleteInfo(harness: Harness): Promise<void> {
  for (const input of harness.all<HTMLInputElement>("input:not([type=file])")) {
    await harness.interact(() => setValue(input, "testathlete"));
  }
  for (const select of harness.all<HTMLSelectElement>("select")) {
    const option = Array.from(select.options).find((o) => o.value !== "");
    if (option) await harness.interact(() => setValue(select, option.value));
  }
}

/**
 * From Athlete Info, walks forward to Preview.
 *
 * Media, Recruiting and Brand & Links collect nothing required, so each is a single
 * Continue. Fails loudly rather than silently stopping short if a step starts gating.
 */
export async function advanceToPreview(harness: Harness): Promise<void> {
  await fillAthleteInfo(harness);
  for (const step of ["Media", "Recruiting", "Brand & Links", "Preview"]) {
    await clickButton(harness, "Continue");
    if (onAthleteInfoStep(harness)) {
      throw new Error(`advanceToPreview: Continue did not leave Athlete Info for ${step}`);
    }
  }
  if (!harness.all("input[type=email]").length) {
    throw new Error("advanceToPreview: expected the email field on Preview");
  }
}

/** Clicks Back until the age step is reached, or until it is clearly unreachable. */
export async function backTowardsAge(harness: Harness, attempts = 8): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    if (onAgeStep(harness)) return true;
    const back = harness.byText<HTMLButtonElement>("button", "Back");
    if (!back) return false;
    await clickButton(harness, "Back");
  }
  return onAgeStep(harness);
}

/** Types an address into Preview's OTP field without sending it. */
export async function typeOtpEmail(harness: Harness, email: string): Promise<void> {
  const field = harness.all<HTMLInputElement>("input[type=email]")[0];
  if (!field) throw new Error("typeOtpEmail: no email field on screen");
  await harness.interact(() => setValue(field, email));
}
