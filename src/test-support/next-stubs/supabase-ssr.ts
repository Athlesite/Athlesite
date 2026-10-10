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
  /** Whether that row's `is_published` is true, when `profileExists` is true. */
  profilePublished: boolean;
  /** What `rpc("participation_status")` returns. */
  participationStatus: string;
  /** What `rpc("initialize_adult_participation", ...)` returns. */
  initializeAdultParticipationResult: string;
  /** What `rpc("record_acceptance_bundle", ...)` returns. */
  recordAcceptanceBundleResult: string;
  /** What `rpc("unpublish_own_profile")` returns. */
  unpublishOwnProfileResult: boolean;
  /** What `.storage.from(bucket).upload(...)` returns: null error means success. */
  storageUploadError: { message: string } | null;
  /** What `.from("athlete_profiles").insert(...).select("slug").single()` returns. */
  profileInsertResult: { slug: string } | { code: string; message: string };
  /** What `.from("athlete_profiles").update(...)....maybeSingle()` returns. */
  profileUpdateResult: { slug: string } | { code: string; message: string };
  /**
   * When true, `rpc("initialize_adult_participation", ...)` returns a promise
   * that does NOT settle until `resolveDeferredInitializer(...)` is called. This
   * is what lets a test pause mid-flight and assert that nothing downstream
   * (another RPC, a Storage upload, a profile insert/update) has happened yet —
   * proving causal ordering, not merely that two independent logs both ended up
   * non-empty by the time the whole async chain had finished.
   */
  deferInitializerResponse: boolean;
};

const DEFAULTS: SupabaseFakeConfig = {
  user: null,
  sendResult: { ok: true },
  verifyResult: { ok: true },
  verifiedUser: null,
  profileExists: false,
  profilePublished: false,
  participationStatus: "absent",
  initializeAdultParticipationResult: "initialized",
  recordAcceptanceBundleResult: "recorded",
  unpublishOwnProfileResult: true,
  storageUploadError: null,
  profileInsertResult: { slug: "fake-slug" },
  profileUpdateResult: { slug: "fake-slug" },
  deferInitializerResponse: false,
};

let config: SupabaseFakeConfig = { ...DEFAULTS };
let installed = false;
let restoreEnv: (() => void) | null = null;

/** Every auth call made through the fake, in order, for sequencing assertions. */
export const supabaseCalls: string[] = [];

/**
 * Every RPC call made through the fake, in order, WITH its exact arguments — not
 * just the name. This is what lets a test assert that the exact centralized
 * version constants (ATTESTATION_VERSION/TERMS_VERSION/PRIVACY_VERSION) reached the
 * RPC as its actual arguments, rather than merely that *some* call happened.
 */
export const rpcCallLog: Array<{ name: string; args: Record<string, unknown> }> = [];

/**
 * Every Storage upload attempt made through the fake, in order — bucket, path, and
 * whether the uploaded value was a real `File`/`Blob` with content, so a test can
 * prove an upload was (or deliberately was not) attempted, and with what.
 */
export const storageUploadAttempts: Array<{ bucket: string; path: string; byteLength: number }> = [];

/**
 * Every `athlete_profiles` insert/update attempt made through the fake, in order —
 * the operation kind and the row payload, so a test can prove a profile mutation
 * was (or deliberately was not) attempted.
 */
export const profileWriteAttempts: Array<{ kind: "insert" | "update"; row: unknown }> = [];

/**
 * ONE shared, strictly-ordered log across every observable side effect this fake
 * can produce: an RPC call starting, an RPC call resolving, a Storage upload
 * attempt, and a profile insert/update attempt. This is what makes causal
 * ordering provable rather than merely plausible — comparing the first index of
 * one independent array against the first index of another (the previous
 * version of these tests) can show that two things both happened, but cannot
 * show that one FINISHED before the other STARTED, which is the actual
 * guarantee "initialization must resolve before any mutation" requires. Every
 * other exported log above is kept too, unchanged, so existing tests built
 * against them keep working; this is the one new log the ordering tests read.
 */
export type OrderedEvent =
  | { type: "rpc:call"; name: string }
  | { type: "rpc:resolved"; name: string; data: unknown }
  | { type: "storage:upload"; bucket: string; path: string; byteLength: number }
  | { type: "profile:insert" | "profile:update"; row: unknown };

export const orderedEventLog: OrderedEvent[] = [];

/**
 * Resolves a currently-pending deferred `initialize_adult_participation` call
 * with `result`. Throws if no call is actually pending — a test asserting
 * "nothing happened while deferred" against a call that was never made would
 * otherwise silently prove nothing.
 */
let pendingInitializerResolve: ((value: { data: string; error: null }) => void) | null = null;

export function resolveDeferredInitializer(result: string): void {
  if (!pendingInitializerResolve) {
    throw new Error(
      "resolveDeferredInitializer() called with no deferred initialize_adult_participation " +
        "call pending. Set deferInitializerResponse: true and trigger the call first."
    );
  }
  const resolve = pendingInitializerResolve;
  pendingInitializerResolve = null;
  orderedEventLog.push({ type: "rpc:resolved", name: "initialize_adult_participation", data: result });
  resolve({ data: result, error: null });
}

/**
 * Installs the fake and the env values `createClient()` requires.
 *
 * The URL and key are obvious non-secrets that reach no network: the fake never
 * constructs a real client. Returns nothing; call `uninstallFakeSupabase` in teardown.
 */
export function installFakeSupabase(overrides: Partial<SupabaseFakeConfig> = {}): void {
  config = { ...DEFAULTS, ...overrides };
  supabaseCalls.length = 0;
  rpcCallLog.length = 0;
  storageUploadAttempts.length = 0;
  profileWriteAttempts.length = 0;
  orderedEventLog.length = 0;
  pendingInitializerResolve = null;
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
  rpcCallLog.length = 0;
  storageUploadAttempts.length = 0;
  profileWriteAttempts.length = 0;
  orderedEventLog.length = 0;
  pendingInitializerResolve = null;
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

    // `athlete_profiles` reads AND writes. Reads (select/eq/maybeSingle) cover
    // `checkOwnershipStatus` and `getOwnPublicationState` as before. Writes
    // (insert/update) are new: they record the attempt in profileWriteAttempts —
    // BEFORE resolving — so a test can prove a mutation was attempted at all,
    // independent of whether it succeeded, and assert on the exact row payload.
    // No table-name parameter: this fake models only athlete_profiles, the one
    // table any Phase 1a code path reads or writes through this method.
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: config.profileExists
              ? { owner_user_id: config.user?.id, is_published: config.profilePublished }
              : null,
            error: null,
          }),
        }),
      }),

      insert: (row: unknown) => {
        profileWriteAttempts.push({ kind: "insert", row });
        orderedEventLog.push({ type: "profile:insert", row });
        return {
          select: () => ({
            single: async () => {
              if ("code" in config.profileInsertResult) {
                return { data: null, error: config.profileInsertResult };
              }
              return { data: config.profileInsertResult, error: null };
            },
          }),
        };
      },

      update: (row: unknown) => {
        profileWriteAttempts.push({ kind: "update", row });
        orderedEventLog.push({ type: "profile:update", row });
        return {
          eq: () => ({
            select: () => ({
              maybeSingle: async () => {
                if ("code" in config.profileUpdateResult) {
                  return { data: null, error: config.profileUpdateResult };
                }
                return { data: config.profileUpdateResult, error: null };
              },
            }),
          }),
        };
      },
    }),

    // Storage. Only `upload` is modeled — createProfile/updateProfile's own
    // pre-checks are what every Phase 1a participation test actually exercises;
    // nothing in this repo reads a signed URL through this fake. The byte length
    // is read from the uploaded value (a real File/Blob in the tests that pass
    // one) so a test can assert real content was actually attempted, not a
    // zero-byte placeholder.
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, fileOrBlob: { size?: number } | undefined) => {
          const byteLength = typeof fileOrBlob?.size === "number" ? fileOrBlob.size : 0;
          storageUploadAttempts.push({ bucket, path, byteLength });
          orderedEventLog.push({ type: "storage:upload", bucket, path, byteLength });
          if (config.storageUploadError) {
            return { data: null, error: config.storageUploadError };
          }
          return { data: { path }, error: null };
        },
      }),
    },

    // Guardian-First Participation, Phase 1a RPCs. Every call is recorded twice:
    // in supabaseCalls (name only, matching this fake's original logging — kept
    // for the tests already written against it) and in rpcCallLog (name AND the
    // exact arguments), which is what lets a test prove the centralized version
    // constants reached the RPC as its actual call arguments.
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      supabaseCalls.push(`rpc:${name}`);
      rpcCallLog.push({ name, args });
      orderedEventLog.push({ type: "rpc:call", name });

      // The deferred branch: the call is logged as STARTED, but the returned
      // promise does not settle — and therefore `await`ing it in the real
      // application code does not return — until a test calls
      // resolveDeferredInitializer(). Everything that runs after that `await` in
      // handleSaveAndComplete (createProfile's own pre-check RPC, the Storage
      // upload, the profile insert) is provably blocked for as long as this
      // promise is pending, because JavaScript's single-threaded await ordering
      // guarantees it — there is no other way for that code to reach those
      // calls before this promise resolves.
      if (name === "initialize_adult_participation" && config.deferInitializerResponse) {
        return new Promise((resolve) => {
          pendingInitializerResolve = resolve;
        });
      }

      let data: unknown;
      switch (name) {
        case "participation_status":
          data = config.participationStatus;
          break;
        case "initialize_adult_participation":
          data = config.initializeAdultParticipationResult;
          break;
        case "record_acceptance_bundle":
          data = config.recordAcceptanceBundleResult;
          break;
        case "unpublish_own_profile":
          data = config.unpublishOwnProfileResult;
          break;
        default:
          return { data: null, error: authError(`unexpected rpc: ${name}`) };
      }

      orderedEventLog.push({ type: "rpc:resolved", name, data });
      return { data, error: null };
    },
  };
}

export function createBrowserClient() {
  return createFakeClient();
}

export function createServerClient() {
  return createFakeClient();
}
