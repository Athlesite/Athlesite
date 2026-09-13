import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  signOutAndGetRedirectPath,
  navigateAfterSignOut,
  SIGNED_OUT_DESTINATION,
} from "@/components/edit-profile/sign-out";

describe("signOutAndGetRedirectPath", () => {
  test("calls the supplied sign-out function exactly once", async () => {
    let calls = 0;
    await signOutAndGetRedirectPath(async () => {
      calls += 1;
    });
    assert.equal(calls, 1);
  });

  test("resolves to the public homepage, never back to an auth-gated route", async () => {
    const destination = await signOutAndGetRedirectPath(async () => {});
    assert.equal(destination, "/");
    assert.equal(destination, SIGNED_OUT_DESTINATION);
  });

  test("awaits the sign-out call before resolving — the session is cleared before navigation is reported", async () => {
    const order: string[] = [];
    await signOutAndGetRedirectPath(async () => {
      order.push("sign-out-started");
      await new Promise((resolve) => setTimeout(resolve, 0));
      order.push("sign-out-finished");
    });
    order.push("resolved");
    assert.deepEqual(order, ["sign-out-started", "sign-out-finished", "resolved"]);
  });

  test("a rejected sign-out call propagates rather than being swallowed", async () => {
    await assert.rejects(
      () =>
        signOutAndGetRedirectPath(async () => {
          throw new Error("network down");
        }),
      /network down/
    );
  });

  test("with no argument, it reaches the project's real signOutCurrentUser — not a second auth implementation", async () => {
    // signOutCurrentUser (src/lib/supabase/auth.ts) builds the real Supabase
    // browser client, which reads NEXT_PUBLIC_SUPABASE_URL and throws this
    // exact, real configuration error the moment it's missing — before any
    // network or DOM access. This test runs with no env configured (see
    // package.json's `test` script — no --env-file), so only the genuine
    // helper, not a stub standing in for it, could produce this failure.
    await assert.rejects(() => signOutAndGetRedirectPath(), /Missing NEXT_PUBLIC_SUPABASE_URL/);
  });
});

describe("navigateAfterSignOut", () => {
  test("navigates via location.replace — a history-preserving method would leave /edit-profile reachable via Back/bfcache", () => {
    const calls: string[] = [];
    const fakeLocation = {
      replace(url: string) {
        calls.push(url);
      },
    };

    navigateAfterSignOut(SIGNED_OUT_DESTINATION, fakeLocation);

    assert.deepEqual(calls, ["/"], "replace must be called exactly once, with the public homepage");
  });

  test("calls replace exactly once per navigation, with the exact destination passed through unchanged", () => {
    let replaceCalls = 0;
    let lastArg: string | undefined;
    const fakeLocation = {
      replace(url: string) {
        replaceCalls += 1;
        lastArg = url;
      },
    };

    navigateAfterSignOut("/some-other-destination", fakeLocation);

    assert.equal(replaceCalls, 1);
    assert.equal(lastArg, "/some-other-destination");
  });
});
