import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOtpRequest, sendDeletionOtp, confirmIdentity } from "./reauth.mjs";

/**
 * The critical property: a deletion re-auth must never be able to CREATE an account.
 * On a retry after the Auth user was deleted, a signup-enabled OTP would recreate it and the
 * tool would then "verify" a fresh empty user as proof of success.
 */
describe("buildOtpRequest — never creates a user", () => {
  test("sets create_user false", () => {
    const r = buildOtpRequest("someone@example.com");
    assert.equal(r.ok, true);
    assert.equal(r.body.create_user, false);
  });

  test("never emits a truthy signup flag under any key", () => {
    const r = buildOtpRequest("someone@example.com");
    for (const [k, v] of Object.entries(r.body)) {
      if (/create/i.test(k)) assert.equal(v, false, `${k} must be false`);
    }
    assert.equal("shouldCreateUser" in r.body, false, "must not use the app's signup-enabled option name");
  });

  test("rejects malformed addresses without contacting anything", () => {
    for (const bad of ["", "   ", "nope", "a@b", undefined, null, 42]) {
      assert.equal(buildOtpRequest(bad).ok, false);
    }
  });

  test("trims surrounding whitespace", () => {
    assert.equal(buildOtpRequest("  x@y.com  ").body.email, "x@y.com");
  });
});

describe("source-level guarantee", () => {
  test("no signup-enabling flag appears in EXECUTABLE source", () => {
    // Comments are stripped first: this file's docblock deliberately *mentions*
    // `shouldCreateUser: true` to explain why the app's helper is not reused, and scanning
    // raw text would flag that prose instead of real code.
    const raw = readFileSync(new URL("./reauth.mjs", import.meta.url), "utf8");
    const executable = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

    assert.ok(/create_user:\s*false/.test(executable), "the false flag must be present in code");
    assert.ok(!/shouldCreateUser:\s*true/.test(executable), "no signup-enabled option in code");
    assert.ok(!/create_user:\s*true/.test(executable), "no signup-enabled flag in code");
  });
});

describe("sendDeletionOtp", () => {
  test("posts create_user false and reports refusal for an unknown user", async () => {
    let seen = null;
    const fetchImpl = async (url, opts) => {
      seen = { url, body: JSON.parse(opts.body) };
      return { status: 400, json: async () => ({ error_code: "otp_disabled" }) };
    };
    const r = await sendDeletionOtp({
      fetchImpl,
      supabaseUrl: "https://example.test",
      anonKey: "k",
      email: "x@y.com",
    });
    assert.equal(seen.body.create_user, false);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "OTP_REQUEST_REFUSED");
  });

  test("reports ok on 200", async () => {
    const fetchImpl = async () => ({ status: 200, json: async () => ({}) });
    const r = await sendDeletionOtp({ fetchImpl, supabaseUrl: "https://example.test", anonKey: "k", email: "x@y.com" });
    assert.equal(r.ok, true);
  });
});

describe("confirmIdentity — failure is never 'probably fine'", () => {
  test("a non-200 is not validated", async () => {
    const fetchImpl = async () => ({ status: 403, json: async () => ({}) });
    const r = await confirmIdentity({ fetchImpl, supabaseUrl: "https://e.test", anonKey: "k", accessToken: "t" });
    assert.equal(r.authValidated, false);
  });

  test("a thrown request is not validated", async () => {
    const fetchImpl = async () => {
      throw new Error("network");
    };
    const r = await confirmIdentity({ fetchImpl, supabaseUrl: "https://e.test", anonKey: "k", accessToken: "t" });
    assert.equal(r.authValidated, false);
  });

  test("a 200 without an id is not validated", async () => {
    const fetchImpl = async () => ({ status: 200, json: async () => ({}) });
    const r = await confirmIdentity({ fetchImpl, supabaseUrl: "https://e.test", anonKey: "k", accessToken: "t" });
    assert.equal(r.authValidated, false);
  });

  test("a 200 with an id validates and returns that uid", async () => {
    const fetchImpl = async () => ({ status: 200, json: async () => ({ id: "abc" }) });
    const r = await confirmIdentity({ fetchImpl, supabaseUrl: "https://e.test", anonKey: "k", accessToken: "t" });
    assert.deepEqual(r, { authValidated: true, uid: "abc" });
  });
});
