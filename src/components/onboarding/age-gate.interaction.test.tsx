import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { AgeBlocked } from "@/components/onboarding/steps/AgeBlocked";
import { resetAgeBlockForNewDocument } from "@/lib/age-gate-session";
import { AGE_GATE_MINOR_HEADING, AGE_GATE_UNDER_13_HEADING } from "@/lib/age-gate-copy";
import { render, type Harness } from "@/test-support/render";
import { deepStrings, findComponentHookStates, holdsPhotoState } from "@/test-support/react-state";
import {
  ADULT_YEAR,
  MINOR_YEAR,
  UNDER_13_YEAR,
  answerAge,
  backTowardsAge,
  clickButton,
  fillAthleteInfo,
  onAgeStep,
  setValue,
  startOnboarding,
  typeOtpEmail,
} from "@/test-support/onboarding-driver";

/**
 * Rendered interaction tests for the age gate.
 *
 * These exist because the behaviour they cover lives in *mounted component state* and
 * cannot be observed any other way: data collected before a Back-navigation, blob URLs
 * held by a live tree, and a fresh wizard reading module state after a client-side
 * navigation. A source-level check would assert the shape of the code rather than what
 * it does.
 *
 * Everything else in this feature stays in plain `.ts` modules tested without a DOM —
 * that remains the right default. See age-eligibility.test.ts and otp-age-lock.test.ts.
 */

/** Values distinctive enough that finding one anywhere in state is unambiguous. */
const MARKER_NAME = "Zephyrine-Quillfeather";
const MARKER_EMAIL = "zephyrine-quillfeather@example.invalid";

/** Object URLs created during a test, so revocation can be asserted. */
let created: string[];
let revoked: string[];
let originalCreate: typeof URL.createObjectURL;
let originalRevoke: typeof URL.revokeObjectURL;

beforeEach(() => {
  resetAgeBlockForNewDocument();
  created = [];
  revoked = [];
  originalCreate = URL.createObjectURL;
  originalRevoke = URL.revokeObjectURL;
  let counter = 0;
  URL.createObjectURL = () => {
    const url = `blob:test/${(counter += 1)}`;
    created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
});

afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  resetAgeBlockForNewDocument();
});

/** Every string held anywhere in the wizard's own hook state. */
function wizardStateStrings(harness: Harness): string[] {
  const states = findComponentHookStates(harness.container, "OnboardingWizard");
  return states.flatMap((state) => deepStrings(state));
}

/** Whether the wizard still holds a picked file or a photo preview anywhere. */
function wizardHoldsPhoto(harness: Harness): boolean {
  return findComponentHookStates(harness.container, "OnboardingWizard").some(holdsPhotoState);
}

/**
 * Picks a photo in every slot the Media step offers.
 *
 * Both slots, deliberately: the wizard keeps `profilePhoto` and `actionPhoto` as
 * separate state with separate cleanup, so filling only one would leave the other's
 * handling unexercised.
 */
async function pickPhotos(harness: Harness): Promise<void> {
  const fileInputs = harness.all<HTMLInputElement>("input[type=file]");
  assert.equal(fileInputs.length, 2, "expected the profile and action photo slots");

  for (const [index, fileInput] of fileInputs.entries()) {
    const file = new window.File(["bytes"], `photo-${index}.jpg`, { type: "image/jpeg" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    await harness.interact(() =>
      fileInput.dispatchEvent(new window.Event("change", { bubbles: true }))
    );
  }
}

describe("age gate — adult path", () => {
  test("an adult passes the gate and reaches Athlete Info", async () => {
    const harness = await render(createElement(OnboardingWizard));
    await startOnboarding(harness);

    assert.ok(onAgeStep(harness), "should be on the age step");
    await answerAge(harness, ADULT_YEAR);

    assert.match(harness.text(), /First name/i, "an adult should reach Athlete Info");
    assert.ok(!onAgeStep(harness));
    await harness.unmount();
  });
});

describe("age gate — re-answering as blocked discards the session", () => {
  test("profile data entered as an adult is cleared when re-answering as a minor", async () => {
    const harness = await render(createElement(OnboardingWizard));
    await startOnboarding(harness);
    await answerAge(harness, ADULT_YEAR);

    const input = harness.all<HTMLInputElement>("input[type=text]")[0];
    assert.ok(input, "expected a text input on Athlete Info");
    await harness.interact(() => setValue(input, MARKER_NAME));
    assert.equal(
      harness.all<HTMLInputElement>("input[type=text]")[0].value,
      MARKER_NAME,
      "precondition: the name should have been captured"
    );

    await clickButton(harness, "Back");
    assert.ok(onAgeStep(harness));
    await answerAge(harness, MINOR_YEAR);

    assert.match(harness.text(), new RegExp(AGE_GATE_MINOR_HEADING.slice(0, 30), "i"));
    assert.doesNotMatch(harness.text(), new RegExp(MARKER_NAME));
    assert.equal(harness.all("input[type=text]").length, 0, "no profile fields should remain");
    await harness.unmount();
  });

  /**
   * The assertion that matters, and the one the earlier version of this file got wrong.
   *
   * Checking that the old inputs are off screen proves nothing: the wizard renders
   * `AgeBlocked` *instead of* its steps, so every field disappears whether the state
   * behind it was wiped or is still sitting in memory. This reads the wizard's own hook
   * state and fails if any of the four resets in `discardOnboardingSession` is removed:
   *
   * - drop `setProfile(createEmptyAthleteProfile())` and the marker name survives
   * - drop `otp.reset()` and the typed email survives
   * - drop `setProfilePhoto(null)` and a `File` plus its preview survive
   * - drop the `revokeObjectURL` calls and the blob is never released
   *
   * The photo pair is caught twice over, via the revoke bookkeeping across unmount. The
   * blob must be released by the time the block renders, and releasing it again on
   * unmount would mean the preview was still referenced — which is exactly what a
   * missing `setProfilePhoto(null)` looks like. Note the explicit revoke in
   * `discardOnboardingSession` is redundant with the `[profilePhoto]` cleanup effect, so
   * these assertions deliberately pin "the blob is released, once, and not again"
   * rather than which of the two did it.
   */
  test("the mounted state is really cleared, not just hidden behind the blocked screen", async () => {
    const harness = await render(createElement(OnboardingWizard));
    await startOnboarding(harness);
    await answerAge(harness, ADULT_YEAR);

    // Athlete Info: a distinctive name, then the rest of the required fields.
    await fillAthleteInfo(harness);
    const firstName = harness.all<HTMLInputElement>("input[type=text]")[0];
    await harness.interact(() => setValue(firstName, MARKER_NAME));

    // Media: pick a photo, which creates a File and a blob URL.
    await clickButton(harness, "Continue");
    await pickPhotos(harness);
    assert.equal(created.length, 2, "precondition: an object URL per photo slot");

    // On to Preview, and type an address without sending it.
    for (let step = 0; step < 3; step += 1) {
      // Media -> Recruiting -> Brand & Links -> Preview; none of them gate Continue.
      await clickButton(harness, "Continue");
    }
    await typeOtpEmail(harness, MARKER_EMAIL);

    // Everything is genuinely in state before the blocked answer.
    const before = wizardStateStrings(harness);
    assert.ok(before.includes(MARKER_NAME), "precondition: the name is held in state");
    assert.ok(before.includes(MARKER_EMAIL), "precondition: the email is held in state");
    assert.ok(wizardHoldsPhoto(harness), "precondition: the photo is held in state");

    // No send has begun, so the gate is still reachable. Answer as under 13.
    assert.ok(await backTowardsAge(harness), "Back should still reach Age before any send");
    await answerAge(harness, UNDER_13_YEAR);
    assert.match(harness.text(), new RegExp(AGE_GATE_UNDER_13_HEADING.slice(0, 30), "i"));

    const after = wizardStateStrings(harness);
    assert.ok(
      !after.includes(MARKER_NAME),
      "setProfile(createEmptyAthleteProfile()) must clear the entered profile"
    );
    assert.ok(!after.includes(MARKER_EMAIL), "otp.reset() must clear the typed address");
    assert.ok(
      !wizardHoldsPhoto(harness),
      "the photo File and its preview must be dropped from state"
    );

    // Exact, not "at least once": the cleanup effects are the only path to revocation
    // (see the docblock on discardOnboardingSession). Two revokes for one URL would mean
    // a second call site has reappeared; zero would mean the effect stopped firing.
    for (const url of created) {
      assert.equal(
        revoked.filter((r) => r === url).length,
        1,
        `${url} must be revoked exactly once`
      );
    }
    assert.equal(revoked.length, created.length, "and nothing else revoked");

    await harness.unmount();
    assert.equal(
      revoked.length,
      created.length,
      "nothing more is revoked on unmount; a further revoke would mean the preview " +
        "was still referenced by state"
    );
  });

  test("a chosen photo is cleared and its object URL revoked", async () => {
    const harness = await render(createElement(OnboardingWizard));
    await startOnboarding(harness);
    await answerAge(harness, ADULT_YEAR);

    await fillAthleteInfo(harness);
    await clickButton(harness, "Continue");
    await pickPhotos(harness);

    assert.equal(created.length, 2, "precondition: an object URL per photo slot");
    assert.equal(revoked.length, 0, "precondition: nothing revoked yet");

    await clickButton(harness, "Back");
    await clickButton(harness, "Back");
    assert.ok(onAgeStep(harness));
    await answerAge(harness, UNDER_13_YEAR);

    assert.match(harness.text(), new RegExp(AGE_GATE_UNDER_13_HEADING.slice(0, 30), "i"));
    for (const url of created) {
      assert.equal(
        revoked.filter((r) => r === url).length,
        1,
        `${url} must be revoked exactly once when the reference is dropped`
      );
    }
    assert.ok(!wizardHoldsPhoto(harness), "and the File must not be retained");
    assert.equal(harness.all("input[type=file]").length, 0, "no photo field should remain");

    await harness.unmount();
    assert.equal(revoked.length, created.length, "and nothing is left to revoke on unmount");
  });
});

describe("age gate — the block survives client-side navigation", () => {
  test("a fresh wizard in the same document stays blocked", async () => {
    const first = await render(createElement(OnboardingWizard));
    await startOnboarding(first);
    await answerAge(first, UNDER_13_YEAR);
    assert.match(first.text(), new RegExp(AGE_GATE_UNDER_13_HEADING.slice(0, 30), "i"));
    await first.unmount();

    // AgeBlocked links home with the client router, and Home links back here — which
    // mounts a brand-new wizard without a document reload. It must still be blocked.
    const second = await render(createElement(OnboardingWizard));
    assert.match(
      second.text(),
      new RegExp(AGE_GATE_UNDER_13_HEADING.slice(0, 30), "i"),
      "a remounted wizard in the same document must stay blocked"
    );
    assert.equal(second.all("select").length, 0, "the age form must not be offered again");
    await second.unmount();
  });

  test("a new document resets the block", async () => {
    const first = await render(createElement(OnboardingWizard));
    await startOnboarding(first);
    await answerAge(first, MINOR_YEAR);
    assert.match(first.text(), new RegExp(AGE_GATE_MINOR_HEADING.slice(0, 30), "i"));
    await first.unmount();

    // A full reload discards the module instance. This stands in for that.
    resetAgeBlockForNewDocument();

    const fresh = await render(createElement(OnboardingWizard));
    await startOnboarding(fresh);
    assert.ok(onAgeStep(fresh), "a new document should offer the gate again");
    await fresh.unmount();
  });
});

describe("AgeBlocked — no route back into onboarding", () => {
  test("offers only a link home, for either reason", async () => {
    for (const reason of ["under_13", "minor"] as const) {
      const harness = await render(createElement(AgeBlocked, { reason }));
      const links = harness.all<HTMLAnchorElement>("a");
      assert.equal(links.length, 1, "exactly one link");
      assert.equal(links[0].getAttribute("href"), "/");
      assert.equal(harness.all("button").length, 0, "no buttons that could advance");
      assert.equal(harness.all("select").length, 0, "no date form to re-answer");
      await harness.unmount();
    }
  });

  test("the two reasons render different headings", async () => {
    const under13 = await render(createElement(AgeBlocked, { reason: "under_13" }));
    const under13Text = under13.text();
    await under13.unmount();

    const minor = await render(createElement(AgeBlocked, { reason: "minor" }));
    const minorText = minor.text();
    await minor.unmount();

    assert.notEqual(under13Text, minorText);
    assert.match(under13Text, /under 13/i);
    assert.match(minorText, /under 18/i);
  });
});
