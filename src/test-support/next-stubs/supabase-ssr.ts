/**
 * Test double for `@supabase/ssr`.
 *
 * This is the project's single seam to the Supabase SDK: `lib/supabase/client.ts`,
 * `server.ts` and `session.ts` are the only files that import it. Replacing it here
 * means a rendered test drives the **real** `useInlineOtp`, the real `lib/supabase/auth`
 * helpers and the real `otpMachine` reducer, with only the network call faked. Stubbing
 * any higher layer would have meant asserting against a reimplementation of the thing
 * under test.
 *
 * Inert unless a test installs it. `createClient()` reads `NEXT_PUBLIC_SUPABASE_*` and
 * throws when they are absent, which is the normal state under `node --test` — so every
 * test that does not call `installFakeSupabase` keeps the unconfigured behaviour it had
 * before this file existed, and `lib/supabase/auth.test.ts` keeps injecting its own
 * client as it always did.
 *
 * Mapped in by scripts/alias-resolver-hook.mjs, which is test-time only — the Next
 * build never sees this file.
 */

type FakeUser = { id: string; email: string };

type SupabaseFakeConfig = {
  /** The signed-in user `auth.getUser()` reports, or null for a signed-out visitor. */
  user: FakeUser | null;
  /** What `auth.signInWithOtp()` returns. "ok" creates the account; "error" does not. */
  sendResult: { ok: true } | { ok: false; message: string };
  /** What `auth.verifyOtp()` returns. On success the session becomes `verifiedUser`. */
  verifyResult: { ok: true } | { ok: false; message: string };
  /** The user a successful verify signs in as. Defaults to the address verified. */
  verifiedUser: FakeUser | null;
  /** Whether `athlete_profiles` already holds a row for the signed-in owner. */
  profileExists: boolean;
};

const DEFAULTS: SupabaseFakeConfig = {
  user: null,
  sendResult: { ok: true },
  verifyResult: { ok: true },
  verifiedUser: null,
  profileExists: false,
};

let config: SupabaseFakeConfig = { ...DEFAULTS };
let installed = false;
let restoreEnv: (() => void) | null = null;

/** Every auth call made through the fake, in order, for sequencing assertions. */
export const supabaseCalls: string[] = [];

/**
 * Installs the fake and the env values `createClient()` requires.
 *
 * The URL and key are obvious non-secrets that reach no network: the fake never
 * constructs a real client. Returns nothing; call `uninstallFakeSupabase` in teardown.
 */
export function installFakeSupabase(overrides: Partial<SupabaseFakeConfig> = {}): void {
  config = { ...DEFAULTS, ...overrides };
  supabaseCalls.length = 0;
  installed = true;

  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";

  restoreEnv = () => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  };
}

/** Removes the fake and restores the environment, so other tests see no Supabase. */
export function uninstallFakeSupabase(): void {
  config = { ...DEFAULTS };
  installed = false;
  supabaseCalls.length = 0;
  restoreEnv?.();
  restoreEnv = null;
}

/** Changes the fake mid-test, e.g. to make the next send fail. */
export function setFakeSupabase(overrides: Partial<SupabaseFakeConfig>): void {
  config = { ...config, ...overrides };
}

/** The user the fake currently reports as signed in. */
export function fakeSignedInUser(): FakeUser | null {
  return config.user;
}

function authError(message: string) {
  // The real SDK returns an error object rather than throwing, and `auth.ts` branches
  // on exactly that envelope.
  return { message, name: "AuthApiError", status: 400 };
}

function createFakeClient() {
  if (!installed) {
    // A module that reached for a client without installing the fake is a test bug,
    // not a condition to paper over.
    throw new Error(
      "@supabase/ssr test double used without installFakeSupabase(). " +
        "Call it in the test's setup, or leave Supabase unconfigured."
    );
  }

  return {
    auth: {
      getUser: async () => {
        supabaseCalls.push("getUser");
        return { data: { user: config.user }, error: null };
      },

      getSession: async () => {
        supabaseCalls.push("getSession");
        return {
          data: { session: config.user ? { user: config.user } : null },
          error: null,
        };
      },

      signInWithOtp: async ({ email }: { email: string }) => {
        supabaseCalls.push(`signInWithOtp:${email}`);
        if (!config.sendResult.ok) {
          return { data: null, error: authError(config.sendResult.message) };
        }
        // shouldCreateUser defaults to true, so a successful send is the moment the
        // Auth account comes into existence. Nothing is signed in yet.
        return { data: { user: null, session: null }, error: null };
      },

      verifyOtp: async ({ email }: { email: string }) => {
        supabaseCalls.push(`verifyOtp:${email}`);
        if (!config.verifyResult.ok) {
          return { data: { user: null }, error: authError(config.verifyResult.message) };
        }
        const user = config.verifiedUser ?? { id: "fake-user-id", email };
        config.user = user;
        return { data: { user, session: { user } }, error: null };
      },

      signOut: async () => {
        supabaseCalls.push("signOut");
        config.user = null;
        return { error: null };
      },
    },

    // Only the read chain `checkOwnershipStatus` uses. Enough to keep the wizard's
    // ownership effect from landing in its fail-closed "unknown" branch.
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: config.profileExists ? { owner_user_id: config.user?.id } : null,
            error: null,
          }),
        }),
      }),
    }),
  };
}

export function createBrowserClient() {
  return createFakeClient();
}

export function createServerClient() {
  return createFakeClient();
}
