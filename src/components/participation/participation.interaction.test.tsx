import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { AdultAttestationGate } from "@/components/participation/AdultAttestationGate";
import { VisibilityOnlyPanel } from "@/components/participation/VisibilityOnlyPanel";
import { ParticipationBlocked } from "@/components/participation/ParticipationBlocked";
import type { ParticipationStatus } from "@/lib/participation";
import { render } from "@/test-support/render";
import {
  installFakeSupabase,
  uninstallFakeSupabase,
  setFakeSupabase,
  supabaseCalls,
} from "@/test-support/next-stubs/supabase-ssr";
import { resetNavigations } from "@/test-support/next-stubs/navigation";
import {
  ADULT_YEAR,
  MINOR_YEAR,
  UNDER_13_YEAR,
  answerAge,
  clickButton,
} from "@/test-support/onboarding-driver";

/**
 * Rendered interaction tests for the Guardian-First Participation Phase 1a
 * components. These exist for the same reason age-gate.interaction.test.tsx does:
 * the behaviour under test — whether a privileged RPC is called from an explicit
 * click versus an effect, whether a blocked screen ever offers the adult path —
 * lives in mounted component state and cannot be observed any other way. The pure
 * routing decision itself is tested without a DOM in participation.test.ts.
 */

beforeEach(() => {
  resetNavigations();
  installFakeSupabase({ user: { id: "owner-1", email: "owner@example.invalid" } });
});

afterEach(() => {
  uninstallFakeSupabase();
});

describe("AdultAttestationGate", () => {
  test("renders the age question first, with no RPC call yet", async () => {
    const harness = await render(createElement(AdultAttestationGate, { publicationState: { exists: false, isPublished: false } }));
    assert.match(harness.text(), /date of birth/i);
    assert.ok(
      !supabaseCalls.some((c) => c.startsWith("rpc:")),
      "no participation RPC should be called before the athlete answers anything"
    );
    await harness.unmount();
  });

  test("a minor answer renders AgeBlocked AND keeps VisibilityOnlyPanel for a published owner", async () => {
    // exists: true, isPublished: true — this is the exact case the finding Codex
    // caught: a published owner who answers the gate as a minor must still be
    // able to reduce their public exposure, even though every other control
    // (the acceptance action, the gate itself) is gone.
    const harness = await render(
      createElement(AdultAttestationGate, { publicationState: { exists: true, isPublished: true } })
    );
    await answerAge(harness, MINOR_YEAR);

    assert.doesNotMatch(harness.text(), /date of birth/i);
    assert.ok(!harness.byText("button", "Confirm and continue"), "no acceptance action for a minor");
    assert.ok(
      harness.byText("button", "Make it private"),
      "a published owner must still see the visibility control after a minor answer"
    );
    assert.ok(
      !supabaseCalls.some((c) => c === "rpc:initialize_adult_participation"),
      "the initializer must never be reachable from a minor answer"
    );
    await harness.unmount();
  });

  test("an under-13 answer renders AgeBlocked too, and ALSO keeps VisibilityOnlyPanel for a published owner", async () => {
    const harness = await render(
      createElement(AdultAttestationGate, { publicationState: { exists: true, isPublished: true } })
    );
    await answerAge(harness, UNDER_13_YEAR);

    assert.doesNotMatch(harness.text(), /date of birth/i);
    assert.ok(!harness.byText("button", "Confirm and continue"));
    assert.ok(
      harness.byText("button", "Make it private"),
      "a published owner must still see the visibility control after an under-13 answer"
    );
    await harness.unmount();
  });

  test("an adult answer shows the acceptance statement, and STILL makes no RPC call until clicked", async () => {
    const harness = await render(createElement(AdultAttestationGate, { publicationState: { exists: false, isPublished: false } }));
    await answerAge(harness, ADULT_YEAR);

    assert.ok(harness.byText("button", "Confirm and continue"), "expected the acceptance panel");
    assert.ok(
      !supabaseCalls.some((c) => c === "rpc:initialize_adult_participation"),
      "resolving 'adult' must not itself call the initializer — only the explicit click does"
    );
    await harness.unmount();
  });

  test("clicking 'Confirm and continue' is the only thing that calls the initializer", async () => {
    setFakeSupabase({ initializeAdultParticipationResult: "initialized" });
    const harness = await render(createElement(AdultAttestationGate, { publicationState: { exists: false, isPublished: false } }));
    await answerAge(harness, ADULT_YEAR);

    await clickButton(harness, "Confirm and continue");

    assert.ok(
      supabaseCalls.includes("rpc:initialize_adult_participation"),
      "the explicit click must call the initializer"
    );
    await harness.unmount();
  });

  test("a refused initialization shows an error and does not pretend to proceed", async () => {
    setFakeSupabase({ initializeAdultParticipationResult: "refused" });
    const harness = await render(createElement(AdultAttestationGate, { publicationState: { exists: false, isPublished: false } }));
    await answerAge(harness, ADULT_YEAR);
    await clickButton(harness, "Confirm and continue");

    assert.match(harness.text(), /try again/i);
    await harness.unmount();
  });

  test("the visibility-only control is offered alongside the gate itself", async () => {
    const harness = await render(
      createElement(AdultAttestationGate, { publicationState: { exists: true, isPublished: true } })
    );
    assert.ok(harness.byText("button", "Make it private"), "expected the standalone unpublish control");
    await harness.unmount();
  });
});

describe("VisibilityOnlyPanel", () => {
  test("renders nothing when no profile exists", async () => {
    const harness = await render(createElement(VisibilityOnlyPanel, { exists: false, isPublished: false }));
    assert.equal(harness.text().trim(), "");
    await harness.unmount();
  });

  test("an unpublished profile shows a neutral message and no action", async () => {
    const harness = await render(createElement(VisibilityOnlyPanel, { exists: true, isPublished: false }));
    assert.match(harness.text(), /isn't public/i);
    assert.ok(!harness.byText("button", "Make it private"));
    await harness.unmount();
  });

  test("a published profile offers Make it private, with a confirm step", async () => {
    const harness = await render(createElement(VisibilityOnlyPanel, { exists: true, isPublished: true }));
    assert.match(harness.text(), /public right now/i);
    assert.ok(harness.byText("button", "Make it private"));
    await harness.unmount();
  });

  test("confirming calls unpublish_own_profile and nothing else, and reports success", async () => {
    setFakeSupabase({ unpublishOwnProfileResult: true });
    const harness = await render(createElement(VisibilityOnlyPanel, { exists: true, isPublished: true }));

    await clickButton(harness, "Make it private");
    assert.match(harness.text(), /you'll need to finish the age check/i);

    await clickButton(harness, "Yes, make it private");

    assert.ok(supabaseCalls.includes("rpc:unpublish_own_profile"));
    assert.match(harness.text(), /now private/i);
    await harness.unmount();
  });

  test("a failed unpublish shows an error and stays in the confirm step", async () => {
    setFakeSupabase({ unpublishOwnProfileResult: false });
    const harness = await render(createElement(VisibilityOnlyPanel, { exists: true, isPublished: true }));

    await clickButton(harness, "Make it private");
    await clickButton(harness, "Yes, make it private");

    assert.match(harness.text(), /try again/i);
    assert.doesNotMatch(harness.text(), /now private/i);
    await harness.unmount();
  });

  test("cancel returns to the plain published state without calling anything", async () => {
    const harness = await render(createElement(VisibilityOnlyPanel, { exists: true, isPublished: true }));
    await clickButton(harness, "Make it private");
    await clickButton(harness, "Cancel");

    assert.ok(!supabaseCalls.includes("rpc:unpublish_own_profile"));
    assert.ok(harness.byText("button", "Make it private"), "back to the un-confirmed state");
    await harness.unmount();
  });
});

describe("ParticipationBlocked — never offers the adult path", () => {
  const STATUSES: Array<Exclude<ParticipationStatus, "absent" | "adult_approved">> = [
    "minor_pending",
    "minor_approved",
    "minor_declined",
    "revoked",
    "expired",
  ];

  for (const status of STATUSES) {
    test(`${status}: renders a distinct message and no acceptance action`, async () => {
      const harness = await render(
        createElement(ParticipationBlocked, {
          status,
          publicationState: { exists: true, isPublished: true },
        })
      );

      assert.ok(harness.text().trim().length > 0, "expected some message");
      assert.ok(
        !harness.byText("button", "Confirm and continue"),
        `${status} must never offer the adult acceptance action`
      );
      assert.ok(!harness.all("select").length, `${status} must never offer the age form`);
      // Every blocked state still offers the standalone visibility control.
      assert.ok(harness.byText("button", "Make it private"));
      await harness.unmount();
    });
  }

  test("every status produces a different heading", async () => {
    const texts = new Map<string, string>();
    for (const status of STATUSES) {
      const harness = await render(
        createElement(ParticipationBlocked, {
          status,
          publicationState: { exists: false, isPublished: false },
        })
      );
      texts.set(status, harness.text());
      await harness.unmount();
    }
    const unique = new Set(texts.values());
    assert.equal(unique.size, STATUSES.length, "expected a distinct message per status");
  });
});
