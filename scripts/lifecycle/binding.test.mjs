import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  REFUSAL,
  environmentFingerprint,
  bindOperation,
  validateBinding,
  isExactlyOwnedPath,
  classifyPaths,
} from "./binding.mjs";

/**
 * Identity binding and path containment.
 *
 * The two failure modes these exist to prevent are both quiet ones: retargeting a deletion
 * at an innocent athlete because a slug was reused, and treating a prefix-sharing folder
 * (`<uid>2/...`) as owned because the check used startsWith.
 */

const UID = "11111111-1111-4111-8111-111111111111";
const UID2 = "22222222-2222-4222-8222-222222222222";
const ROW = "33333333-3333-4333-8333-333333333333";
const ENV = "abcdef0123456789";
const OP = "op-abcdef123456";

const observed = (over = {}) => ({
  authValidated: true,
  environment: ENV,
  uid: UID,
  profileRowId: ROW,
  ...over,
});

describe("environmentFingerprint", () => {
  test("is stable, non-empty, and does not contain the URL", () => {
    const url = "https://exampleref.supabase.co";
    const fp = environmentFingerprint(url);
    assert.match(fp, /^[0-9a-f]{16}$/);
    assert.equal(fp, environmentFingerprint(url));
    assert.ok(!fp.includes("exampleref"), "fingerprint must not leak the project ref");
  });

  test("different environments produce different fingerprints", () => {
    assert.notEqual(
      environmentFingerprint("https://one.supabase.co"),
      environmentFingerprint("https://two.supabase.co")
    );
  });

  test("missing or blank input yields null", () => {
    for (const bad of [undefined, null, "", "   ", 42]) {
      assert.equal(environmentFingerprint(bad), null);
    }
  });
});

describe("bindOperation", () => {
  test("binds environment + uid + operation id", () => {
    const { binding, refusal } = bindOperation({ environment: ENV, uid: UID, profileRowId: ROW, operationId: OP });
    assert.equal(refusal, undefined);
    assert.equal(binding.environment, ENV);
    assert.equal(binding.uid, UID);
    assert.equal(binding.profileRowId, ROW);
  });

  test("a null profile row id is legitimate (row already absent)", () => {
    const { binding } = bindOperation({ environment: ENV, uid: UID, profileRowId: null, operationId: OP });
    assert.equal(binding.profileRowId, null);
  });

  test("refuses a missing or malformed uid", () => {
    for (const bad of [undefined, null, "", "not-a-uuid", 7]) {
      const { refusal } = bindOperation({ environment: ENV, uid: bad, operationId: OP });
      assert.equal(refusal, REFUSAL.UID_MISSING, `expected refusal for uid ${JSON.stringify(bad)}`);
    }
  });

  test("refuses a missing environment fingerprint", () => {
    const { refusal } = bindOperation({ environment: "", uid: UID, operationId: OP });
    assert.equal(refusal, REFUSAL.ENVIRONMENT_MISMATCH);
  });

  test("refuses a malformed profile row id", () => {
    const { refusal } = bindOperation({ environment: ENV, uid: UID, profileRowId: "nope", operationId: OP });
    assert.equal(refusal, REFUSAL.PROFILE_ROW_UNEXPECTED);
  });

  test("slug is recorded but is not part of the target", () => {
    const { binding } = bindOperation({ environment: ENV, uid: UID, operationId: OP, requestedSlug: "some-slug" });
    assert.equal(binding.requestedSlugAtBindTime, "some-slug");
    // The target is environment + uid only.
    assert.deepEqual(
      Object.keys(binding).filter((k) => k !== "requestedSlugAtBindTime").sort(),
      ["environment", "operationId", "profileRowId", "uid"]
    );
  });
});

describe("validateBinding", () => {
  const { binding } = bindOperation({ environment: ENV, uid: UID, profileRowId: ROW, operationId: OP });

  test("accepts a matching observation", () => {
    assert.deepEqual(validateBinding(binding, observed()), { ok: true });
  });

  test("refuses when auth was not positively validated", () => {
    // A failed getUser() is never read as 'probably fine'.
    for (const v of [false, undefined, null, "true"]) {
      const r = validateBinding(binding, observed({ authValidated: v }));
      assert.equal(r.ok, false);
      assert.equal(r.refusal, REFUSAL.AUTH_VALIDATION_FAILED);
    }
  });

  test("refuses an environment mismatch", () => {
    const r = validateBinding(binding, observed({ environment: "0000000000000000" }));
    assert.equal(r.refusal, REFUSAL.ENVIRONMENT_MISMATCH);
  });

  test("refuses a uid mismatch", () => {
    const r = validateBinding(binding, observed({ uid: UID2 }));
    assert.equal(r.refusal, REFUSAL.UID_MISMATCH);
  });

  test("refuses an unexpected profile row id", () => {
    const r = validateBinding(binding, observed({ profileRowId: "44444444-4444-4444-8444-444444444444" }));
    assert.equal(r.refusal, REFUSAL.PROFILE_ROW_UNEXPECTED);
  });

  test("a profile row that is absent is fine — deletion may already have happened", () => {
    assert.deepEqual(validateBinding(binding, observed({ profileRowId: null })), { ok: true });
  });

  test("a row appearing after binding to none is concurrent activity, not a match", () => {
    const { binding: noRow } = bindOperation({ environment: ENV, uid: UID, profileRowId: null, operationId: OP });
    const r = validateBinding(noRow, observed({ profileRowId: ROW }));
    assert.equal(r.refusal, REFUSAL.CONCURRENT_ACTIVITY);
  });

  test("a changed slug does NOT retarget or invalidate the operation", () => {
    // Slug is absent from the observation entirely; the binding still validates.
    const r = validateBinding(binding, observed());
    assert.equal(r.ok, true);
  });

  test("a reused slug cannot retarget: same slug, different uid still refuses", () => {
    // The scenario: the athlete's slug was freed and another athlete took it. The observation
    // carries the OTHER athlete's uid. The target must not move.
    const r = validateBinding(binding, observed({ uid: UID2, profileRowId: null }));
    assert.equal(r.refusal, REFUSAL.UID_MISMATCH);
  });
});

describe("isExactlyOwnedPath", () => {
  test("accepts nested, deeply nested, and root-level owner objects", () => {
    assert.equal(isExactlyOwnedPath(`${UID}/hero/a.png`, UID), true);
    assert.equal(isExactlyOwnedPath(`${UID}/profile/b.webp`, UID), true);
    assert.equal(isExactlyOwnedPath(`${UID}/legacy.png`, UID), true, "root-level file must count as owned");
    assert.equal(isExactlyOwnedPath(`${UID}/a/b/c/d.png`, UID), true, "unexpected nesting must count as owned");
    assert.equal(isExactlyOwnedPath(`${UID}/weird folder/x.bin`, UID), true, "no extension/convention filtering");
  });

  test("REJECTS a prefix-sharing foreign uid — the startsWith trap", () => {
    assert.equal(isExactlyOwnedPath(`${UID}2/hero/a.png`, UID), false);
    assert.equal(isExactlyOwnedPath(`${UID}-extra/hero/a.png`, UID), false);
    // Sanity: the naive check this guards against would have accepted it.
    assert.equal(`${UID}2/hero/a.png`.startsWith(UID), true);
  });

  test("rejects a different uid", () => {
    assert.equal(isExactlyOwnedPath(`${UID2}/hero/a.png`, UID), false);
  });

  test("rejects a bare uid with no object", () => {
    assert.equal(isExactlyOwnedPath(UID, UID), false);
    assert.equal(isExactlyOwnedPath(`${UID}/`, UID), false);
  });

  test("rejects traversal-like and ambiguous structures", () => {
    for (const bad of [
      `${UID}/../${UID2}/x.png`,
      `${UID}/./x.png`,
      `${UID}//x.png`,
      `/${UID}/x.png`,
      `${UID}\\hero\\x.png`,
      `..${UID}/x.png`,
    ]) {
      assert.equal(isExactlyOwnedPath(bad, UID), false, `expected rejection for ${JSON.stringify(bad)}`);
    }
  });

  test("rejects control characters (built programmatically, never literal in source)", () => {
    for (const code of [0x00, 0x09, 0x0a, 0x0d, 0x1f, 0x7f]) {
      const bad = `${UID}/hero/a${String.fromCharCode(code)}.png`;
      assert.equal(isExactlyOwnedPath(bad, UID), false, `expected rejection for char code ${code}`);
    }
  });

  test("rejects non-strings and empty input", () => {
    for (const bad of [undefined, null, "", 0, {}, []]) {
      assert.equal(isExactlyOwnedPath(bad, UID), false);
    }
    assert.equal(isExactlyOwnedPath(`${UID}/hero/a.png`, ""), false);
  });
});

describe("classifyPaths", () => {
  test("separates owned, foreign, and ambiguous", () => {
    const keys = [
      `${UID}/hero/a.png`,
      `${UID}/legacy.png`,
      `${UID}2/hero/b.png`,
      `${UID2}/hero/c.png`,
      `${UID}/../x.png`,
      "",
    ];
    const { owned, foreign, ambiguous } = classifyPaths(keys, UID);
    assert.deepEqual(owned, [`${UID}/hero/a.png`, `${UID}/legacy.png`]);
    assert.deepEqual(foreign.sort(), [`${UID}2/hero/b.png`, `${UID2}/hero/c.png`].sort());
    assert.equal(ambiguous.length, 2);
  });

  test("a non-array input yields empty buckets rather than throwing", () => {
    const r = classifyPaths(null, UID);
    assert.deepEqual(r, { owned: [], foreign: [], ambiguous: [] });
  });
});
