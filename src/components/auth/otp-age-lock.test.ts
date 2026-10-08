import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  hasOtpSendStarted,
  initialOtpState,
  otpReducer,
  type OtpAction,
  type OtpState,
} from "@/components/auth/otpMachine";

/**
 * The two pieces of the OTP machine the age gate depends on.
 *
 * `hasOtpSendStarted` is the lock that stops an athlete revisiting the age step after
 * account creation has begun, and `RESET` is how a blocked answer discards OTP input
 * collected earlier in the session. Both are pure, so they are tested here by feeding
 * actions rather than through a rendered tree — the wizard's own interaction tests cover
 * the parts that only exist once mounted. See age-gate.interaction.test.tsx.
 */

/** Replays actions from the initial state. */
function run(...actions: OtpAction[]): OtpState {
  return actions.reduce(otpReducer, initialOtpState);
}

const SIGNED_OUT = run({ type: "SESSION_CHECKED", email: null });

describe("hasOtpSendStarted — the age lock", () => {
  test("no send yet leaves the age answer editable", () => {
    assert.equal(hasOtpSendStarted(initialOtpState), false, "while the session is checked");
    assert.equal(hasOtpSendStarted(SIGNED_OUT), false, "while collecting the email");
    assert.equal(
      hasOtpSendStarted(otpReducer(SIGNED_OUT, { type: "EMAIL_CHANGED", value: "a@b.test" })),
      false,
      "typing an address is not a send"
    );
  });

  test("a send in flight locks the age answer", () => {
    // signInWithOtp uses shouldCreateUser: true, so the account is created at send.
    // The lock has to engage before the call resolves, not after.
    const sending = run(
      { type: "SESSION_CHECKED", email: null },
      { type: "EMAIL_CHANGED", value: "a@b.test" },
      { type: "SEND_STARTED" }
    );
    assert.equal(sending.status, "sending");
    assert.equal(hasOtpSendStarted(sending), true);
  });

  test("a failed send does not lock, because no account was created", () => {
    const failed = run(
      { type: "SESSION_CHECKED", email: null },
      { type: "EMAIL_CHANGED", value: "a@b.test" },
      { type: "SEND_STARTED" },
      { type: "SEND_FAILED", message: "Something went wrong." }
    );
    assert.equal(failed.status, "collectingEmail");
    assert.equal(failed.lastSentAt, null, "a failed send must not stamp lastSentAt");
    assert.equal(hasOtpSendStarted(failed), false);
  });

  test("every state at or after a successful send locks", () => {
    const sent = run(
      { type: "SESSION_CHECKED", email: null },
      { type: "EMAIL_CHANGED", value: "a@b.test" },
      { type: "SEND_STARTED" },
      { type: "SEND_SUCCEEDED", at: 1_000 }
    );
    assert.equal(hasOtpSendStarted(sent), true, "collecting the code");
    assert.equal(
      hasOtpSendStarted(otpReducer(sent, { type: "VERIFY_STARTED" })),
      true,
      "verifying"
    );
    assert.equal(
      hasOtpSendStarted(otpReducer(sent, { type: "VERIFY_SUCCEEDED", email: "a@b.test" })),
      true,
      "signed in"
    );
    assert.equal(
      hasOtpSendStarted(otpReducer(sent, { type: "VERIFY_FAILED", message: "Wrong code." })),
      true,
      "a wrong code does not un-create the account"
    );
  });

  test("changing the email does not unlock the gate", () => {
    // The regression this guards: CHANGE_EMAIL clears lastSentAt so a new address can
    // be sent without waiting out the cooldown. That is right for the cooldown and
    // wrong for the lock — the previous send already created an Auth account, and
    // going back to the address field does not un-create it.
    const changed = run(
      { type: "SESSION_CHECKED", email: null },
      { type: "EMAIL_CHANGED", value: "a@b.test" },
      { type: "SEND_STARTED" },
      { type: "SEND_SUCCEEDED", at: 1_000 },
      { type: "CHANGE_EMAIL" }
    );
    assert.equal(changed.lastSentAt, null, "the cooldown stamp is cleared, as intended");
    assert.equal(changed.accountCreated, true, "but the account is still out there");
    assert.equal(hasOtpSendStarted(changed), true);
  });

  test("an athlete who arrives already signed in is locked from the start", () => {
    const resumed = run({ type: "SESSION_CHECKED", email: "a@b.test" });
    assert.equal(resumed.status, "signedIn");
    assert.equal(hasOtpSendStarted(resumed), true);
  });
});

describe("RESET — discarding OTP input with the rest of the session", () => {
  test("clears the address, the code, the error and the cooldown", () => {
    const sent = run(
      { type: "SESSION_CHECKED", email: null },
      { type: "EMAIL_CHANGED", value: "a@b.test" },
      { type: "SEND_STARTED" },
      { type: "SEND_SUCCEEDED", at: 1_000 },
      { type: "CODE_CHANGED", value: "12345678" },
      { type: "VERIFY_FAILED", message: "Wrong code." }
    );
    assert.equal(sent.email, "a@b.test", "precondition");
    assert.equal(sent.code, "12345678", "precondition");

    const reset = otpReducer(sent, { type: "RESET" });
    assert.equal(reset.email, "", "the address must not survive a discarded session");
    assert.equal(reset.code, "", "nor the typed code");
    assert.equal(reset.error, null);
    assert.equal(reset.lastSentAt, null);
    assert.equal(reset.signedInEmail, null);
    assert.equal(
      reset.accountCreated,
      false,
      "a discarded session starts over; the terminal age block, not this flag, is what " +
        "keeps a blocked athlete out"
    );
    assert.equal(
      reset.status,
      "collectingEmail",
      "not 'checking': there is nothing left to look up"
    );
  });

  test("a signed-in session is preserved rather than faked away", () => {
    // RESET is local state only. Pretending to be signed out while a real Supabase
    // session exists would be a lie the UI could act on; hasOtpSendStarted is what
    // keeps the blocked answer unreachable here.
    const signedIn = run(
      { type: "SESSION_CHECKED", email: null },
      { type: "EMAIL_CHANGED", value: "a@b.test" },
      { type: "SEND_STARTED" },
      { type: "SEND_SUCCEEDED", at: 1_000 },
      { type: "CODE_CHANGED", value: "12345678" },
      { type: "VERIFY_SUCCEEDED", email: "a@b.test" }
    );

    const reset = otpReducer(signedIn, { type: "RESET" });
    assert.equal(reset.status, "signedIn");
    assert.equal(reset.signedInEmail, "a@b.test");
    assert.equal(reset.code, "", "the typed code is still discarded");
    assert.equal(reset.error, null);
    assert.equal(hasOtpSendStarted(reset), true, "and the age gate stays locked");
  });

  test("resetting an untouched machine is a no-op worth nothing surprising", () => {
    const reset = otpReducer(SIGNED_OUT, { type: "RESET" });
    assert.equal(reset.status, "collectingEmail");
    assert.equal(reset.email, "");
    assert.equal(hasOtpSendStarted(reset), false);
  });
});
