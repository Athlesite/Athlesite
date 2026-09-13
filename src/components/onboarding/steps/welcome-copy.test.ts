import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { WELCOME_INTRO_COPY } from "@/components/onboarding/steps/welcome-copy";

describe("WELCOME_INTRO_COPY", () => {
  test("no longer claims no account or backend exists, or that data stays only on this device", () => {
    const lower = WELCOME_INTRO_COPY.toLowerCase();
    assert.equal(lower.includes("no account"), false);
    assert.equal(lower.includes("no backend"), false);
    assert.equal(lower.includes("there's no account or backend"), false);
    assert.equal(lower.includes("stored only on this device"), false);
    assert.equal(lower.includes("this device and browser"), false);
  });

  test("does not claim the draft disappears once onboarding is finished — nothing in the product deletes it", () => {
    const lower = WELCOME_INTRO_COPY.toLowerCase();
    assert.equal(lower.includes("until you finish"), false);
    assert.equal(lower.includes("when you finish"), false);
    assert.equal(lower.includes("once you finish"), false);
  });

  test("does not claim the email code itself makes the profile live — that is a separate, explicit save/publish step", () => {
    const lower = WELCOME_INTRO_COPY.toLowerCase();
    // The exact wrong phrasing this round's fix removes: attributing "goes
    // live"/"public" directly to the code's own action rather than to a
    // later, explicit save/publish step.
    assert.equal(lower.includes("code creates your athlesite account and makes"), false);
    assert.equal(lower.includes("code makes your profile live"), false);
    assert.equal(lower.includes("code makes your profile public"), false);
  });

  test("says a draft is kept in the browser while building, truthfully scoped to that period", () => {
    const lower = WELCOME_INTRO_COPY.toLowerCase();
    assert.match(lower, /draft/);
    assert.match(lower, /browser/);
    assert.match(lower, /while you're building/);
  });

  test("says nothing is public while building", () => {
    assert.match(WELCOME_INTRO_COPY.toLowerCase(), /nothing is public/);
  });

  test("says an email code creates or signs into the account", () => {
    const lower = WELCOME_INTRO_COPY.toLowerCase();
    assert.match(lower, /email code/);
    assert.match(lower, /account/);
  });

  test("says the profile goes live only once explicitly saved and published", () => {
    const lower = WELCOME_INTRO_COPY.toLowerCase();
    assert.match(lower, /profile/);
    assert.match(lower, /only goes live once you save and publish/);
  });

  test("does not name Supabase — implementation jargon an athlete has no reason to see here", () => {
    assert.equal(WELCOME_INTRO_COPY.toLowerCase().includes("supabase"), false);
  });
});
