import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { resetAgeBlockForNewDocument } from "@/lib/age-gate-session";
import { AGE_GATE_MINOR_HEADING } from "@/lib/age-gate-copy";
import { render, type Harness } from "@/test-support/render";
import { navigations, resetNavigations } from "@/test-support/next-stubs/navigation";
import {
  installFakeSupabase,
  setFakeSupabase,
  uninstallFakeSupabase,
} from "@/test-support/next-stubs/supabase-ssr";
import {
  ADULT_YEAR,
  MINOR_YEAR,
  advanceToPreview,
  answerAge,
  backTowardsAge,
  clickButton,
  onAgeStep,
  onAthleteInfoStep,
  startOnboarding,
  typeOtpEmail,
} from "@/test-support/onboarding-driver";

/**
 * Rendered tests for where the age gate and the OTP flow meet.
 *
 * The lock that freezes an age answer reads OTP state, so the two cannot be tested
 * apart: a reducer test can say what `hasOtpSendStarted` returns, but only a mounted
 * wizard can say whether an athlete can actually still walk back to the gate. The
 * reducer-level cases live in otp-age-lock.test.ts; these drive the real hook, the real
 * `lib/supabase/auth` helpers and the real reducer, with only the SDK faked.
 *
 * The signed-in cases are here because of a real bug this file was written to pin down.
 * An existing session made the lock engage before the gate had ever been answered, so a
 * signed-in athlete got a dead Continue button and a Back button that jumped them *past*
 * the gate into Athlete Info. A session proves an account exists and says nothing at all
 * about age.
 */

const SESSION_USER = { id: "signed-in-user", email: "returning@example.invalid" };
const OTP_EMAIL = "new-athlete@example.invalid";

beforeEach(() => {
  resetAgeBlockForNewDocument();
  resetNavigations();
  installFakeSupabase();
});

afterEach(() => {
  uninstallFakeSupabase();
  resetAgeBlockForNewDocument();
});

/** Walks an unauthenticated athlete through the gate as an adult and on to Preview. */
async function reachPreviewAsAdult(harness: Harness): Promise<void> {
  await startOnboarding(harness);
  await answerAge(harness, ADULT_YEAR);
  assert.ok(onAthleteInfoStep(harness), "an adult should reach Athlete Info");
  await advanceToPreview(harness);
}

/** Sends a code from Preview and settles the result. */
async function sendCode(harness: Harness): Promise<void> {
  await typeOtpEmail(harness, OTP_EMAIL);
  await clickButton(harness, "Send code");
}

describe("authenticated initialization — a session is not an age answer", () => {
  test("a signed-in athlete still has to answer the gate", async () => {
    setFakeSupabase({ user: SESSION_USER, profileExists: false });
    const harness = await render(createElement(OnboardingWizard));
    await startOnboarding(harness);

    assert.ok(onAgeStep(harness), "the gate must be offered to a signed-in athlete");

    // Continue without a complete answer must not advance. This is the symptom that
    // exposed the bug: the lock made the handler return early, so nothing happened at
    // all and the button looked broken.
    await clickButton(harness, "Continue");
    assert.ok(onAgeStep(harness), "an incomplete answer must not advance past the gate");
    assert.ok(!onAthleteInfoStep(harness));

    await harness.unmount();
  });

  test("a signed-in athlete cannot reach Athlete Info without answering", async () => {
    setFakeSupabase({ user: SESSION_USER, profileExists: false });
    const harness = await render(createElement(OnboardingWizard));
    await startOnboarding(harness);
    assert.ok(onAgeStep(harness));

    // Back from the gate goes to Welcome. Under the bug the navigation floor was already
    // raised to Athlete Info, so Back moved *forwards* past the unanswered gate.
    await clickButton(harness, "Back");
    assert.ok(!onAthleteInfoStep(harness), "Back must never cross an unanswered gate");
    assert.match(harness.text(), /Step 1 of 7/, "it should land back on Welcome");

    await harness.unmount();
  });

  test("a signed-in athlete who answers as a minor is blocked", async () => {
    setFakeSupabase({ user: SESSION_USER, profileExists: false });
    const harness = await render(createElement(OnboardingWizard));
    await startOnboarding(harness);
    await answerAge(harness, MINOR_YEAR);

    assert.match(
      harness.text(),
      new RegExp(AGE_GATE_MINOR_HEADING.slice(0, 30), "i"),
      "an existing account must not exempt an athlete from the gate"
    );
    await harness.unmount();
  });

  test("a signed-in adult passes and the gate then locks", async () => {
    setFakeSupabase({ user: SESSION_USER, profileExists: false });
    const harness = await render(createElement(OnboardingWizard));
    await startOnboarding(harness);
    await answerAge(harness, ADULT_YEAR);

    assert.ok(onAthleteInfoStep(harness), "an adult with a session continues normally");

    // Now both halves of the lock hold: an accepted adult answer, and an account that
    // already exists. The gate closes behind them.
    assert.ok(
      !(await backTowardsAge(harness)),
      "with an answer given and an account present, Age must not reopen"
    );
    assert.ok(onAthleteInfoStep(harness), "Athlete Info is the floor");
    await harness.unmount();
  });
});

describe("the age lock across the OTP send", () => {
  test("before any send, Back still reaches the gate", async () => {
    const harness = await render(createElement(OnboardingWizard));
    await reachPreviewAsAdult(harness);

    // No send yet, so no Auth account exists and there is nothing to protect.
    assert.ok(
      await backTowardsAge(harness),
      "an athlete may still correct their age answer before account creation"
    );
    await harness.unmount();
  });

  test("after a successful send, Back cannot reach the gate", async () => {
    const harness = await render(createElement(OnboardingWizard));
    await reachPreviewAsAdult(harness);
    await sendCode(harness);

    assert.match(harness.text(), /Enter the code we emailed you/i, "the send should succeed");

    // `signInWithOtp` runs with shouldCreateUser, so the account exists as of that send.
    assert.ok(
      !(await backTowardsAge(harness)),
      "the age answer is frozen once account creation has begun"
    );
    assert.ok(onAthleteInfoStep(harness), "but profile fields stay editable");
    await harness.unmount();
  });

  test("a failed send does not lock the gate", async () => {
    const harness = await render(createElement(OnboardingWizard));
    await reachPreviewAsAdult(harness);

    setFakeSupabase({ sendResult: { ok: false, message: "Email rate limit exceeded" } });
    await sendCode(harness);

    assert.ok(
      harness.all("input[type=email]").length > 0,
      "a failed send leaves the athlete on the address field"
    );
    // No user was created, so there is nothing for the lock to protect.
    assert.ok(
      await backTowardsAge(harness),
      "a failed send must not freeze the age answer"
    );
    await harness.unmount();
  });

  test("changing the email after a successful send does not unlock the gate", async () => {
    const harness = await render(createElement(OnboardingWizard));
    await reachPreviewAsAdult(harness);
    await sendCode(harness);

    // This clears the resend cooldown so a different address can be used immediately.
    // It does not un-create the account the first send already made.
    await clickButton(harness, "Use a different email");
    assert.ok(
      harness.all("input[type=email]").length > 0,
      "precondition: back on the address field"
    );

    assert.ok(
      !(await backTowardsAge(harness)),
      "an account still exists, so the age answer stays frozen"
    );
    await harness.unmount();
  });

  test("a blocked answer given before any send still discards the session", async () => {
    const harness = await render(createElement(OnboardingWizard));
    await reachPreviewAsAdult(harness);
    await typeOtpEmail(harness, OTP_EMAIL);

    assert.ok(await backTowardsAge(harness));
    await answerAge(harness, MINOR_YEAR);

    assert.match(harness.text(), new RegExp(AGE_GATE_MINOR_HEADING.slice(0, 30), "i"));
    assert.doesNotMatch(harness.text(), new RegExp(OTP_EMAIL), "the typed address is gone");
    await harness.unmount();
  });
});

describe("the ownership check runs once, not in a loop", () => {
  /**
   * Guards the router double as much as the wizard. `useRouter` previously returned a
   * fresh object on every render, and the ownership effect lists the router in its
   * dependencies — so the effect re-fired on every render, re-issuing its lookups and
   * making authenticated behaviour impossible to observe. One redirect, not many, is the
   * observable form of that fix.
   */
  test("an existing owner is redirected exactly once", async () => {
    setFakeSupabase({ user: SESSION_USER, profileExists: true });
    const harness = await render(createElement(OnboardingWizard));
    await startOnboarding(harness);
    await answerAge(harness, ADULT_YEAR);

    const redirects = navigations.filter((n) => n.href === "/edit-profile");
    assert.equal(redirects.length, 1, `expected one redirect, got ${navigations.length}`);
    await harness.unmount();
  });
});
