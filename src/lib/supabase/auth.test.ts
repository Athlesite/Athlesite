import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { signOutCurrentUser } from "@/lib/supabase/auth";

/**
 * signOutCurrentUser may report success — and, upstream, trigger navigation
 * away from /edit-profile — only when it has positive evidence the local
 * session is no longer usable. Absence of proof (a session check that is
 * itself inconclusive) is a failure, not a success. See the function's own
 * docblock for the full decision and why an earlier version of this
 * function got that backwards.
 *
 * Every fake client below mirrors the real SDK's documented response
 * envelope exactly — `signOut()` resolving `{ error }`, `getSession()`
 * resolving `{ data: { session }, error }` — rather than a shape invented
 * for the test, since it is specifically that envelope shape (an error
 * returned rather than thrown, a session field that can independently be
 * null or populated) that this function's branching depends on.
 *
 * `createSupabaseClient` is the injectable seam that lets these run without
 * a live Supabase project; the real createClient() default is exercised by
 * the "no argument" test at the bottom, which needs no client at all since
 * it fails before one is ever constructed.
 */
describe("signOutCurrentUser", () => {
  test("1. clean sign-out success — signOut() resolves { error: null } -> resolves", async () => {
    let getSessionCalls = 0;
    await assert.doesNotReject(() =>
      signOutCurrentUser(() => ({
        auth: {
          signOut: async () => ({ error: null }),
          getSession: async () => {
            getSessionCalls += 1;
            return { data: { session: null }, error: null };
          },
        },
      }))
    );
    // A confirmed success needs no follow-up check at all.
    assert.equal(getSessionCalls, 0);
  });

  test("2. returned sign-out error + getSession() { session: null, error: null } -> resolves (positive evidence the local session is gone)", async () => {
    await assert.doesNotReject(() =>
      signOutCurrentUser(() => ({
        auth: {
          signOut: async () => ({ error: { message: "server_error: global logout endpoint unreachable" } }),
          getSession: async () => ({ data: { session: null }, error: null }),
        },
      }))
    );
  });

  test("3. returned sign-out error + getSession() shows a session still exists -> rejects with a sanitized error", async () => {
    const fakeSession = { access_token: "fake", user: { id: "athlete-1" } };

    await assert.rejects(
      () =>
        signOutCurrentUser(() => ({
          auth: {
            signOut: async () => ({ error: { message: "invalid_grant: session not found" } }),
            getSession: async () => ({ data: { session: fakeSession }, error: null }),
          },
        })),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        // The raw provider message must never reach an athlete.
        assert.doesNotMatch(err.message, /invalid_grant/);
        assert.equal(err.message, "Couldn't sign out. Try again.");
        return true;
      }
    );
  });

  test("4. thrown signOut() -> rejects, without a follow-up session check", async () => {
    let getSessionCalls = 0;

    await assert.rejects(
      () =>
        signOutCurrentUser(() => ({
          auth: {
            signOut: async () => {
              throw new Error("fetch failed");
            },
            getSession: async () => {
              getSessionCalls += 1;
              return { data: { session: null }, error: null };
            },
          },
        })),
      /fetch failed/
    );

    // signOut() never returned at all, so there is no "did it clear
    // locally despite an error" question to resolve — see docblock.
    assert.equal(getSessionCalls, 0);
  });

  test("5. returned sign-out error + getSession() throws -> rejects with a sanitized error (no positive evidence of sign-out)", async () => {
    await assert.rejects(
      () =>
        signOutCurrentUser(() => ({
          auth: {
            signOut: async () => ({ error: { message: "server_error: session not found" } }),
            getSession: async () => {
              throw new Error("network unreachable");
            },
          },
        })),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.doesNotMatch(err.message, /session not found|network unreachable/);
        assert.equal(err.message, "Couldn't sign out. Try again.");
        return true;
      }
    );
  });

  test("6. returned sign-out error + getSession() returns its own non-null error -> rejects with a sanitized error", async () => {
    await assert.rejects(
      () =>
        signOutCurrentUser(() => ({
          auth: {
            signOut: async () => ({ error: { message: "server_error: session not found" } }),
            getSession: async () => ({ data: { session: null }, error: { message: "storage unavailable" } }),
          },
        })),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.doesNotMatch(err.message, /session not found|storage unavailable/);
        assert.equal(err.message, "Couldn't sign out. Try again.");
        return true;
      }
    );
  });

  test("7. with no argument, it reaches the project's real createClient() — not a second implementation", async () => {
    // The real createClient() (src/lib/supabase/client.ts) reads
    // NEXT_PUBLIC_SUPABASE_URL and throws this exact, real configuration
    // error the moment it's missing — before any network or DOM access.
    // This test runs with no env configured (see package.json's `test`
    // script — no --env-file), so only the genuine default, not a stub,
    // could produce this failure.
    await assert.rejects(() => signOutCurrentUser(), /Missing NEXT_PUBLIC_SUPABASE_URL/);
  });
});
