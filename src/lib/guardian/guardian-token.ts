/**
 * Guardian bearer token — fragment parsing. Pure, no DOM, no Supabase.
 *
 * This is the single gate between an arbitrary string an attacker can put in a
 * URL and a value this app will ever hash and send to the database (see
 * peek_guardian_request/redeem_guardian_request in
 * supabase/migrations/20261013000001_guardian_bearer_peek_redeem.sql, which
 * independently re-validates the same shape server-side — this module is a
 * client-side fast-fail, never the enforcement layer).
 *
 * The token contract (binding for Phase 3 issuance too): a 256-bit (32-byte)
 * random value, encoded as CANONICAL, UNPADDED BASE64URL, exactly 43
 * characters. Query-string tokens are never accepted — this module only ever
 * sees the fragment string handed to it by guardian-fragment.ts, which never
 * reads `location.search`.
 */

/**
 * Canonical, unpadded base64url for exactly 32 bytes.
 *
 * NOT simply "43 characters from the base64url alphabet". 32 bytes = 256
 * bits = 42 full 6-bit groups (252 bits) plus a 44th group holding only the
 * remaining 4 bits, zero-padded on the low end before encoding — so a
 * CORRECT encoder's last character always comes from the 16-symbol subset of
 * the 64-symbol alphabet whose index is a multiple of 4, never the full
 * alphabet. The other 48 characters in that position would decode a
 * low-order 2 bits that a real 32-byte encoding can never have set, i.e.
 * they describe a string that LOOKS like a 32-byte base64url token but that
 * no canonical encoder would ever produce.
 *
 * This is not a cosmetic tightening: the SQL contract
 * (20261013000001_guardian_bearer_peek_redeem.sql) hashes the literal
 * 43-character STRING, not 32 decoded bytes, so two different strings that
 * would decode to the same 32 bytes under a lenient decoder are, under this
 * contract, two unrelated hash inputs. Accepting noncanonical strings here
 * would accept tokens that can never have been produced by this project's
 * own encoder and can never match anything redeemable — a contract gap, not
 * a security bypass, but one worth closing so client and server agree
 * exactly on what a valid token looks like.
 *
 * The 16-symbol last-character set (derived from the base64url alphabet
 * `A-Za-z0-9-_` at every index `i` where `i % 4 === 0`, verified empirically
 * against 2000 random 32-byte encodings in guardian-token.test.ts):
 * `0 4 8 A E I M Q U Y c g k o s w`.
 */
export const GUARDIAN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{42}[048AEIMQUYcgkosw]$/;

export type GuardianTokenParseFailureReason =
  /** The fragment was empty — nothing was ever appended after '#'. */
  | "missing"
  /** A `token` key was present but its value was empty. */
  | "empty"
  /** `token` was present together with at least one other, unexpected key. */
  | "unexpected-params"
  /** The `token` key appeared more than once. */
  | "duplicate"
  /** No `token` key at all, or the value does not match the required shape
   * (wrong length, wrong alphabet, or otherwise malformed). */
  | "malformed";

export type GuardianTokenParseResult =
  | { ok: true; token: string }
  | { ok: false; reason: GuardianTokenParseFailureReason };

/**
 * Parses a raw URL fragment — the substring after `#`, with no leading `#`
 * itself — for exactly one `token=<43-char-base64url>` parameter.
 *
 * Deliberately strict in both directions: an extra parameter, a duplicate
 * `token`, or a value of the wrong shape are all refused rather than
 * tolerated, because every one of those is an observable the page's UI must
 * not expose differently (see the migration's own "no token-existence
 * oracle" note) — but at THIS layer, before any network call, distinguishing
 * them is purely for test coverage and developer diagnosis. The caller must
 * still collapse every `ok: false` into the same generic "unavailable"/
 * "malformed" UI state.
 */
export function parseGuardianTokenFragment(rawFragment: string): GuardianTokenParseResult {
  if (rawFragment.length === 0) {
    return { ok: false, reason: "missing" };
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(rawFragment);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const uniqueKeys = new Set(params.keys());

  if (!uniqueKeys.has("token")) {
    return { ok: false, reason: "missing" };
  }
  if (uniqueKeys.size !== 1) {
    return { ok: false, reason: "unexpected-params" };
  }

  const values = params.getAll("token");
  if (values.length > 1) {
    return { ok: false, reason: "duplicate" };
  }

  const token = values[0];
  if (token === undefined || token.length === 0) {
    return { ok: false, reason: "empty" };
  }

  if (!GUARDIAN_TOKEN_PATTERN.test(token)) {
    return { ok: false, reason: "malformed" };
  }

  return { ok: true, token };
}
