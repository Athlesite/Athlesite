import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { captureAndClearFragment } from "@/lib/guardian/guardian-fragment";

/** A minimal fake `history` that records every `replaceState` call it receives. */
function fakeHistory(initialState: unknown = null) {
  const calls: Array<{ data: unknown; unused: string; url: string | URL | null | undefined }> = [];
  return {
    calls,
    state: initialState,
    replaceState(data: unknown, unused: string, url?: string | URL | null) {
      calls.push({ data, unused, url });
      this.state = data;
    },
  };
}

describe("captureAndClearFragment", () => {
  test("captures the fragment without its leading '#'", () => {
    const history = fakeHistory();
    const raw = captureAndClearFragment(
      { hash: "#token=abc123", pathname: "/guardian/participation", search: "" },
      history
    );
    assert.equal(raw, "token=abc123");
  });

  test("clears the hash via replaceState, preserving pathname and search exactly", () => {
    const history = fakeHistory();
    captureAndClearFragment(
      { hash: "#token=abc123", pathname: "/guardian/participation", search: "?x=1" },
      history
    );
    assert.equal(history.calls.length, 1);
    assert.equal(history.calls[0].url, "/guardian/participation?x=1");
  });

  test("the replaceState call happens before the function returns — capture-then-clear ordering", () => {
    const history = fakeHistory();
    // If cleanup happened asynchronously or after some later step, a caller
    // reading history.calls immediately after this call (as this test does)
    // would see nothing yet. Asserting the call is already recorded proves
    // the clear is synchronous and complete by the time this function
    // returns, which is what "before any network request" actually requires.
    captureAndClearFragment({ hash: "#token=xyz", pathname: "/p", search: "" }, history);
    assert.equal(history.calls.length, 1);
  });

  test("an already-empty hash (second call after a prior clear) captures empty and still issues an equivalent no-op replaceState", () => {
    const history = fakeHistory();
    const raw = captureAndClearFragment({ hash: "", pathname: "/guardian/participation", search: "" }, history);
    assert.equal(raw, "");
    assert.equal(history.calls.length, 1);
    assert.equal(history.calls[0].url, "/guardian/participation");
  });

  test("a hash with no leading '#' (defensive — real browsers always include it) is passed through unchanged", () => {
    const history = fakeHistory();
    const raw = captureAndClearFragment({ hash: "token=noHash", pathname: "/p", search: "" }, history);
    assert.equal(raw, "token=noHash");
  });

  test("never reads location.search for a token — only preserves it verbatim in the rewritten URL", () => {
    const history = fakeHistory();
    // The fragment is the ONLY source of the token this function (or anything
    // built on it) ever reads from. This test asserts the preserved search
    // string is passed through byte-for-byte, never parsed or altered —
    // there is no code path here that could extract a "token" key from it.
    captureAndClearFragment(
      { hash: "#token=real", pathname: "/guardian/participation", search: "?token=decoy&x=1" },
      history
    );
    assert.equal(history.calls[0].url, "/guardian/participation?token=decoy&x=1");
  });

  describe("history.state preservation (P3 fix)", () => {
    test("an existing history.state object is passed back unchanged, never replaced with null", () => {
      const existingState = { nextRouterState: "some-opaque-next-internal-value", scroll: 42 };
      const history = fakeHistory(existingState);
      captureAndClearFragment({ hash: "#token=secret", pathname: "/p", search: "" }, history);
      assert.equal(history.calls[0].data, existingState);
      assert.notEqual(history.calls[0].data, null);
    });

    test("a null history.state (nothing was ever pushed) is preserved as null — not fabricated into something else", () => {
      const history = fakeHistory(null);
      captureAndClearFragment({ hash: "#token=secret", pathname: "/p", search: "" }, history);
      assert.equal(history.calls[0].data, null);
    });

    test("a populated Next-router-shaped state object survives the fragment cleanup intact", () => {
      // Representative of what next/navigation's client router stores on the
      // history entry — this module must never know or care about its shape,
      // only that it is not its place to discard it.
      const nextLikeState = { __NA: true, tree: ["", {}], url: "/guardian/participation" };
      const history = fakeHistory(nextLikeState);
      captureAndClearFragment(
        { hash: "#token=abc", pathname: "/guardian/participation", search: "" },
        history
      );
      assert.deepEqual(history.calls[0].data, nextLikeState);
    });
  });
});
