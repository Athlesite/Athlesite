import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { render, click } from "@/test-support/render";
import { GuardianParticipationClient } from "@/app/guardian/participation/GuardianParticipationClient";
import {
  GUARDIAN_COPY_VERSION,
  GUARDIAN_REQUEST_TERMS_VERSION,
  GUARDIAN_REQUEST_PRIVACY_VERSION,
} from "@/lib/guardian/guardian-copy";
import type { GuardianPeekOutcome, GuardianRedeemOutcome } from "@/lib/guardian/guardian-repository";

/**
 * A syntactically valid, CANONICAL 43-character unpadded-base64url token,
 * matching GUARDIAN_TOKEN_PATTERN — the last character 'A' is in the
 * 16-symbol canonical subset (see guardian-token.ts's own comment).
 */
const TOKEN = "A".repeat(42) + "A";

const VALID_PEEK: GuardianPeekOutcome = {
  status: "valid",
  requestedAt: "2026-10-13T00:00:00Z",
  expiresAt: "2026-10-20T00:00:00Z",
  guardianCopyVersion: GUARDIAN_COPY_VERSION,
  requestTermsVersion: GUARDIAN_REQUEST_TERMS_VERSION,
  requestPrivacyVersion: GUARDIAN_REQUEST_PRIVACY_VERSION,
};

/** Waits a macrotask so queued promise callbacks (peek/redeem) have settled. */
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("GuardianParticipationClient — mount and redeem gating", () => {
  test("peek is called on mount with a valid token, but redeem is NEVER called just from mounting", async () => {
    let peekCalls = 0;
    let redeemCalls = 0;
    const harness = await render(
      <GuardianParticipationClient
        initialFragment={`token=${TOKEN}`}
        peekImpl={async () => {
          peekCalls += 1;
          return VALID_PEEK;
        }}
        redeemImpl={async (): Promise<GuardianRedeemOutcome> => {
          redeemCalls += 1;
          return "approved";
        }}
      />
    );
    await flush();

    assert.equal(peekCalls, 1, "peek must run automatically on a valid mount");
    assert.equal(redeemCalls, 0, "redeem must never run just from loading the page");
    await harness.unmount();
  });

  test("a missing/malformed token never calls peek or redeem, and renders the generic unavailable state", async () => {
    let peekCalls = 0;
    const harness = await render(
      <GuardianParticipationClient
        initialFragment=""
        peekImpl={async () => {
          peekCalls += 1;
          return { status: "unavailable" } as GuardianPeekOutcome;
        }}
      />
    );
    await flush();

    assert.equal(peekCalls, 0, "a malformed/missing token must short-circuit before any peek call");
    assert.ok(harness.text().includes("no longer available"));
    await harness.unmount();
  });

  test("private approval content is never shown before peek resolves successfully", async () => {
    let resolvePeek: ((value: GuardianPeekOutcome) => void) | undefined;
    const harness = await render(
      <GuardianParticipationClient
        initialFragment={`token=${TOKEN}`}
        peekImpl={() =>
          new Promise<GuardianPeekOutcome>((resolve) => {
            resolvePeek = resolve;
          })
        }
      />
    );

    // Still waiting on peek: no approval body, no decision buttons.
    assert.equal(harness.all("button").length, 0);
    assert.ok(!harness.text().includes("Approve"));

    await harness.interact(() => resolvePeek?.(VALID_PEEK));
    assert.ok(harness.text().includes("Approve"));
    await harness.unmount();
  });

  test("clicking Approve calls redeem exactly once and shows the approved confirmation", async () => {
    let redeemCalls = 0;
    const harness = await render(
      <GuardianParticipationClient
        initialFragment={`token=${TOKEN}`}
        peekImpl={async () => VALID_PEEK}
        redeemImpl={async (): Promise<GuardianRedeemOutcome> => {
          redeemCalls += 1;
          return "approved";
        }}
      />
    );
    await flush();

    const approveButton = harness.all("button").find((b) => b.textContent === "Approve");
    assert.ok(approveButton, "expected an Approve button once peek resolves");
    await harness.interact(() => click(approveButton));
    await flush();

    assert.equal(redeemCalls, 1);
    assert.ok(harness.text().includes("Approved"));
    await harness.unmount();
  });

  test("double-clicking Decline calls redeem exactly once — the synchronous guard, not just the state transition", async () => {
    let redeemCalls = 0;
    const harness = await render(
      <GuardianParticipationClient
        initialFragment={`token=${TOKEN}`}
        peekImpl={async () => VALID_PEEK}
        redeemImpl={async (): Promise<GuardianRedeemOutcome> => {
          redeemCalls += 1;
          // Deliberately slow, so both clicks land before the first resolves —
          // this is what proves the guard is synchronous, not merely "the
          // button disappeared before the second click could happen".
          await new Promise((resolve) => setTimeout(resolve, 10));
          return "declined";
        }}
      />
    );
    await flush();

    const declineButton = harness.all("button").find((b) => b.textContent === "Decline");
    assert.ok(declineButton);

    // Two synchronous clicks in the same interaction, before any re-render.
    await harness.interact(() => {
      click(declineButton);
      click(declineButton);
    });
    // Waits for the deliberately slow redeemImpl to settle, wrapped directly in
    // act() (not harness.interact(), which does not await a returned promise)
    // so the resulting state update is attributed to this await correctly.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    assert.equal(redeemCalls, 1, "a rapid double-click must issue exactly one redeem call");
    await harness.unmount();
  });

  test("a redeem transport failure shows the ambiguous state, never 'approved' or 'unavailable'", async () => {
    const harness = await render(
      <GuardianParticipationClient
        initialFragment={`token=${TOKEN}`}
        peekImpl={async () => VALID_PEEK}
        redeemImpl={async (): Promise<GuardianRedeemOutcome> => "network_error"}
      />
    );
    await flush();

    const approveButton = harness.all("button").find((b) => b.textContent === "Approve");
    await harness.interact(() => click(approveButton));
    await flush();

    const text = harness.text();
    assert.ok(text.includes("couldn't confirm"));
    assert.ok(!text.includes("Approved"));
    assert.ok(!text.includes("no longer available"));
    await harness.unmount();
  });

  test("an unknown pinned wording version fails closed to unavailable, even though the token itself was valid", async () => {
    const harness = await render(
      <GuardianParticipationClient
        initialFragment={`token=${TOKEN}`}
        peekImpl={async (): Promise<GuardianPeekOutcome> => ({
          ...VALID_PEEK,
          guardianCopyVersion: "some-future-unreviewed-version",
        })}
      />
    );
    await flush();

    assert.ok(harness.text().includes("no longer available"));
    assert.equal(harness.all("button").length, 0);
    await harness.unmount();
  });

  test("a peek network failure is distinct from 'unavailable'", async () => {
    const harness = await render(
      <GuardianParticipationClient
        initialFragment={`token=${TOKEN}`}
        peekImpl={async (): Promise<GuardianPeekOutcome> => ({ status: "network_error" })}
      />
    );
    await flush();

    const text = harness.text();
    assert.ok(text.includes("Couldn't load this link"));
    assert.ok(!text.includes("no longer available"));
    await harness.unmount();
  });
});

describe("GuardianParticipationClient — the REAL fragment-capture path (no initialFragment seam)", () => {
  // Every test above injects `initialFragment`, which proves the component's OWN
  // capture/parse/gate logic but says nothing about whether it is actually wired to
  // real `window.location`/`window.history` — a regression there (e.g. reverting to
  // reading `window.location.search` instead of `.hash`) would pass every test above
  // unchanged. These tests render with a REAL jsdom URL (via `render`'s `url` option)
  // and omit `initialFragment` entirely, so the component's default branch
  // (`captureAndClearFragment(window.location, window.history)`) is what actually runs.

  test("a real #token=... URL is captured, parsed, and peeked through the real window APIs", async () => {
    let peekCalls = 0;
    let receivedToken: string | undefined;
    const harness = await render(
      <GuardianParticipationClient
        peekImpl={async (token) => {
          peekCalls += 1;
          receivedToken = token;
          return VALID_PEEK;
        }}
      />,
      { url: `http://localhost/guardian/participation#token=${TOKEN}` }
    );
    await flush();

    assert.equal(peekCalls, 1, "the real fragment must still reach peek exactly once");
    assert.equal(receivedToken, TOKEN, "the exact token from window.location.hash must reach peek");
    assert.ok(harness.text().includes("Approve"));
    await harness.unmount();
  });

  test("cleanup happens BEFORE networking: the hash is already gone from window.location even while peek is still pending", async () => {
    let resolvePeek: ((value: GuardianPeekOutcome) => void) | undefined;
    const harness = await render(
      <GuardianParticipationClient
        peekImpl={() =>
          new Promise<GuardianPeekOutcome>((resolve) => {
            resolvePeek = resolve;
          })
        }
      />,
      { url: `http://localhost/guardian/participation?x=1#token=${TOKEN}` }
    );

    // The mount effect has already run (render() awaits a React `act()`), but the
    // injected peekImpl's promise is deliberately still unresolved. If the real
    // address bar still showed the fragment at this instant, cleanup would NOT have
    // happened "before any network request" — it would merely be racing it.
    assert.equal(window.location.hash, "", "the fragment must already be cleared");
    assert.equal(window.location.pathname, "/guardian/participation", "pathname must be preserved");
    assert.equal(window.location.search, "?x=1", "the query string must be preserved exactly");

    await harness.interact(() => resolvePeek?.(VALID_PEEK));
    assert.ok(harness.text().includes("Approve"));
    await harness.unmount();
  });

  test("a real URL with no fragment at all renders the generic unavailable state without ever calling peek", async () => {
    let peekCalls = 0;
    const harness = await render(
      <GuardianParticipationClient
        peekImpl={async () => {
          peekCalls += 1;
          return VALID_PEEK;
        }}
      />,
      { url: "http://localhost/guardian/participation" }
    );
    await flush();

    assert.equal(peekCalls, 0);
    assert.ok(harness.text().includes("no longer available"));
    await harness.unmount();
  });

  test("a token placed in the query string instead of the fragment is never read — query-string tokens are explicitly rejected", async () => {
    let peekCalls = 0;
    const harness = await render(
      <GuardianParticipationClient
        peekImpl={async () => {
          peekCalls += 1;
          return VALID_PEEK;
        }}
      />,
      { url: `http://localhost/guardian/participation?token=${TOKEN}` }
    );
    await flush();

    assert.equal(peekCalls, 0, "a query-string token must never reach peek");
    assert.ok(harness.text().includes("no longer available"));
    // The query string itself is left untouched — this component has no fragment to
    // clear in this scenario, and clearing a query string is not its job at all.
    assert.equal(window.location.search, `?token=${TOKEN}`);
    await harness.unmount();
  });

  test("real browser history.state is preserved across the fragment cleanup (P3 fix, end to end)", async () => {
    // Simulates a history entry Next's own client router (or anything else on the
    // page) had already populated before this component's mount effect runs. Seeded
    // via render()'s own `historyState` option — jsdom's window is recreated fresh
    // inside render(), so setting it on `window` beforehand would set it on a
    // window this test's component never actually mounts into.
    const priorState = { simulatedRouterState: true };
    const harness = await render(
      <GuardianParticipationClient peekImpl={async () => VALID_PEEK} />,
      { url: `http://localhost/guardian/participation#token=${TOKEN}`, historyState: priorState }
    );
    await flush();

    // jsdom's history.state getter returns a structured-clone of whatever was set,
    // so this must be a value-equality check, not a reference check.
    assert.deepEqual(window.history.state, priorState);
    await harness.unmount();
  });
});
