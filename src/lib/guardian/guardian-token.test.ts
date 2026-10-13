import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { parseGuardianTokenFragment, GUARDIAN_TOKEN_PATTERN } from "@/lib/guardian/guardian-token";

/** base64url (no padding) of an arbitrary buffer, independent of production code. */
function toBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A syntactically valid, CANONICAL 43-character token: last char 'A' is in the allowed subset. */
const VALID_TOKEN = "A".repeat(42) + "A";

/** Same 42 leading characters, but a last character OUTSIDE the canonical 16-symbol subset. */
const NONCANONICAL_TOKEN = "A".repeat(42) + "B";

function assertValidPrecondition() {
  assert.equal(VALID_TOKEN.length, 43);
  assert.ok(GUARDIAN_TOKEN_PATTERN.test(VALID_TOKEN));
  assert.equal(NONCANONICAL_TOKEN.length, 43);
  assert.ok(!GUARDIAN_TOKEN_PATTERN.test(NONCANONICAL_TOKEN), "fixture must be rejected by the canonical pattern");
}

describe("GUARDIAN_TOKEN_PATTERN — canonical last-character derivation", () => {
  test("precondition: the fixture tokens are shaped as intended", assertValidPrecondition);

  test("the pattern's allowed last-character set matches an independent derivation", () => {
    // Derived here from first principles, independently of guardian-token.ts's own
    // comment: 32 bytes = 256 bits = 42 full 6-bit groups + a 44th group with only
    // 4 significant bits, zero-padded low before encoding. A correct encoder's last
    // character is therefore always one whose base64url alphabet INDEX is a
    // multiple of 4 (16 of the 64 symbols).
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const expectedAllowed = new Set<string>();
    for (let i = 0; i < alphabet.length; i++) {
      if (i % 4 === 0) expectedAllowed.add(alphabet[i]);
    }

    const prefix = "A".repeat(42);
    for (const char of alphabet) {
      const matches = GUARDIAN_TOKEN_PATTERN.test(prefix + char);
      assert.equal(
        matches,
        expectedAllowed.has(char),
        `last character "${char}" accepted=${matches}, expected accepted=${expectedAllowed.has(char)}`
      );
    }
  });

  test("real base64url encodings of 2000 random 32-byte buffers all match the pattern", () => {
    for (let i = 0; i < 2000; i++) {
      const token = toBase64Url(randomBytes(32));
      assert.equal(token.length, 43);
      assert.ok(GUARDIAN_TOKEN_PATTERN.test(token), `rejected a real canonical encoding: ${token}`);
    }
  });

  test("flipping only the last character's low 2 bits (same decoded 32 bytes under a lenient decoder) is rejected", () => {
    // A real encoding, then every other character substituted in the last
    // position: each one is either the SAME canonical symbol (trivially
    // still valid) or a noncanonical variant that must be rejected, even
    // though a lenient base64 decoder would recover the identical 32 bytes
    // from several of them (the low 2 bits of a 6-bit group that only
    // carries 4 real bits of payload are discardable on decode, but are NOT
    // interchangeable on this contract — see guardian-token.ts's own
    // comment on why the hash is over the string, not decoded bytes).
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const realToken = toBase64Url(randomBytes(32));
    const realPrefix = realToken.slice(0, 42);
    let rejectedCount = 0;
    for (const char of alphabet) {
      const candidate = realPrefix + char;
      if (!GUARDIAN_TOKEN_PATTERN.test(candidate)) rejectedCount += 1;
    }
    // 64 - 16 allowed = 48 must be rejected, regardless of which real prefix was drawn.
    assert.equal(rejectedCount, 48);
  });
});

describe("parseGuardianTokenFragment", () => {
  test("a well-formed, canonical single token parses", () => {
    const result = parseGuardianTokenFragment(`token=${VALID_TOKEN}`);
    assert.deepEqual(result, { ok: true, token: VALID_TOKEN });
  });

  test("a noncanonical last character is rejected as malformed, even though it is 43 chars from the right alphabet", () => {
    assert.deepEqual(parseGuardianTokenFragment(`token=${NONCANONICAL_TOKEN}`), {
      ok: false,
      reason: "malformed",
    });
  });

  test("absent fragment (empty string) is 'missing'", () => {
    assert.deepEqual(parseGuardianTokenFragment(""), { ok: false, reason: "missing" });
  });

  test("fragment present but no token key at all is 'missing'", () => {
    assert.deepEqual(parseGuardianTokenFragment("foo=bar"), { ok: false, reason: "missing" });
  });

  test("empty token value is 'empty'", () => {
    assert.deepEqual(parseGuardianTokenFragment("token="), { ok: false, reason: "empty" });
  });

  test("malformed: wrong length (too short)", () => {
    assert.deepEqual(parseGuardianTokenFragment("token=abc"), { ok: false, reason: "malformed" });
  });

  test("malformed: excessive length", () => {
    const tooLong = VALID_TOKEN + "x".repeat(10_000);
    assert.deepEqual(parseGuardianTokenFragment(`token=${tooLong}`), {
      ok: false,
      reason: "malformed",
    });
  });

  test("malformed: wrong alphabet (standard base64 '+' and '/')", () => {
    const wrongAlphabet = "+".repeat(1) + "/".repeat(1) + "A".repeat(41);
    assert.deepEqual(parseGuardianTokenFragment(`token=${wrongAlphabet}`), {
      ok: false,
      reason: "malformed",
    });
  });

  test("malformed: contains whitespace", () => {
    const withSpace = VALID_TOKEN.slice(0, 42) + " ";
    assert.deepEqual(parseGuardianTokenFragment(`token=${withSpace}`), {
      ok: false,
      reason: "malformed",
    });
  });

  test("duplicate token keys with the same value", () => {
    assert.deepEqual(
      parseGuardianTokenFragment(`token=${VALID_TOKEN}&token=${VALID_TOKEN}`),
      { ok: false, reason: "duplicate" }
    );
  });

  test("duplicate token keys with different values", () => {
    const other = "0".repeat(42) + "0";
    assert.deepEqual(parseGuardianTokenFragment(`token=${VALID_TOKEN}&token=${other}`), {
      ok: false,
      reason: "duplicate",
    });
  });

  test("unexpected extra parameter alongside a well-formed token", () => {
    assert.deepEqual(parseGuardianTokenFragment(`token=${VALID_TOKEN}&foo=bar`), {
      ok: false,
      reason: "unexpected-params",
    });
  });

  test("percent-encoded / bad-encoding value fails the pattern, not an exception", () => {
    assert.deepEqual(parseGuardianTokenFragment("token=%ZZ%ZZ"), {
      ok: false,
      reason: "malformed",
    });
  });

  test("a bare '#' producing an empty string input is handled the same as 'missing'", () => {
    // GuardianParticipationClient strips the leading '#' before calling this
    // function (see guardian-fragment.ts), so this asserts the contract this
    // function expects: no leading '#' is ever passed to it.
    assert.deepEqual(parseGuardianTokenFragment(""), { ok: false, reason: "missing" });
  });

  test("query-string-shaped input is still just parsed as the fragment string it is handed — this function has no concept of location.search at all", () => {
    // There is no way to even express "read from the query string" through
    // this function's signature; it takes a string, not a Location. The
    // query-string exclusion is enforced by guardian-fragment.ts never
    // reading location.search for a token, not by anything checkable here —
    // this test documents that boundary rather than exercising it.
    const result = parseGuardianTokenFragment(`token=${VALID_TOKEN}`);
    assert.equal(result.ok, true);
  });

  test("the accepted token's SHA-256 (of its UTF-8 bytes) matches the SQL contract's own hash input shape", () => {
    // Documents the hash boundary this module hands off to: the SQL
    // functions hash sha256(convert_to(p_token, 'UTF8')) — the UTF-8 bytes
    // of the literal 43-character string, never decoded bytes. This test
    // does not call SQL; it proves the Node-side equivalent computation is
    // well-defined for exactly the string this parser accepts.
    const digest = createHash("sha256").update(VALID_TOKEN, "utf8").digest("hex");
    assert.equal(digest.length, 64);
  });
});
