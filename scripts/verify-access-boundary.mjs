/**
 * Live acceptance harness for the Checkpoint 5D.7 access boundary.
 *
 * NOT part of CI, and not part of `npm test`. Every assertion is about Postgres grants,
 * RLS policies, and Storage policies, so none of it can run without a real project and
 * real fixtures — hence the gate below rather than wiring into any default script.
 *
 * ── FIXTURE MODEL ────────────────────────────────────────────────────────────────
 *
 * `athlete_profiles.owner_user_id` is UNIQUE, so one account owns at most one profile.
 * Three separate accounts are required:
 *
 *   A — owner of a PUBLISHED profile. Supplies the legitimate public read, the currently
 *       referenced hero, a deliberately superseded hero object, and a profile-slot object
 *       that must never become publicly readable.
 *   B — owner of an UNPUBLISHED profile with its own hero object. Nothing of B's may be
 *       publicly readable at all.
 *   C — an unrelated signed-in athlete owning their OWN profile, which must start
 *       **PUBLISHED** and must have its own hero object. Used as the signed-in stranger and
 *       as the attacker in the cross-owner forgery tests. The published requirement is
 *       asserted exactly in preconditions: the forgery tests set `is_published = true`, so
 *       an unpublished original would be restored to a state the model does not describe.
 *       C must have a real hero path because the forgery overwrites it and the original has
 *       to be restorable. C having a profile at all also prevents a false pass, since a
 *       signed-in user with none would read zero rows for a trivial reason.
 *
 * ── WHAT IT WRITES, AND HOW IT IS RESTORED ───────────────────────────────────────
 *
 * Four reversible values: A `is_published`, A `hero_photo_path`, C `is_published`, C
 * `hero_photo_path`. Every original is read and verified in preconditions, and the
 * restoration obligation is registered BEFORE the mutating request is sent — because the
 * server may commit while the response is lost, which would otherwise leave a mutation
 * unrestored. Restoration runs in `finally`, each value independently, asserting the write
 * status, that exactly one intended row changed, and then re-reading and comparing to the
 * captured original.
 *
 * It creates nothing and deletes nothing. Fixture creation and deletion stay manual and
 * founder-approved.
 *
 * ── DIAGNOSTIC POLICY ────────────────────────────────────────────────────────────
 *
 * Output is restricted to an allowlist: the assertion identifier, an internal diagnostic
 * code, HTTP status and its class, and small integer counts. Nothing response- or
 * provider-controlled is printed — no provider error objects or messages, no response
 * keys, no object paths, no URLs, hostnames, project refs, tokens or keys. A sanitized
 * top-level handler prevents an uncaught exception leaking a raw message.
 *
 * ── DENIAL SHAPES ARE ENDPOINT-SPECIFIC ──────────────────────────────────────────
 *
 * "Denied" is not a single shape, and accepting any 4xx would let unrelated failures look
 * like correct policy. Each endpoint has an explicit expectation:
 *
 *   - anon reading the table after migration B has no privilege at all, so PostgREST must
 *     report a privilege error (`42501`), not merely an empty result.
 *   - an authenticated stranger DOES hold the table grant, so RLS filters rows and the
 *     correct answer is `200` with an empty array — not a 4xx.
 *   - Storage signing must issue no `signedURL`; the exact status mapping is the provider's
 *     and is recorded as a value to pin after the first live run.
 *
 *   Usage (after fixtures exist):
 *     ATHLESITE_LIVE_ACCEPTANCE=1 node scripts/verify-access-boundary.mjs
 *
 * Access tokens are supplied rather than obtained here: this project authenticates with
 * inline numeric email OTP and has no password grant, so there is no non-interactive
 * sign-in to script (docs/ai/DECISIONS.md § Inline numeric email OTP).
 */

import { resolveSignedObjectUrl } from "./signed-url.mjs";
import { classifyArrayArgumentResponse, classifyStorageList } from "./response-contracts.mjs";

const BUCKET = "athlete-media";

/** The only diagnostic codes this harness may emit. */
const CODE = {
  OK: "OK",
  NETWORK_FAILURE: "NETWORK_FAILURE",
  HTTP_STATUS_UNEXPECTED: "HTTP_STATUS_UNEXPECTED",
  HTTP_SERVER_ERROR: "HTTP_SERVER_ERROR",
  BODY_INVALID_JSON: "BODY_INVALID_JSON",
  BODY_EMPTY: "BODY_EMPTY",
  BODY_NULL: "BODY_NULL",
  BODY_NOT_ARRAY: "BODY_NOT_ARRAY",
  BODY_NOT_OBJECT: "BODY_NOT_OBJECT",
  BODY_NOT_OBJECT_LIST: "BODY_NOT_OBJECT_LIST",
  ROW_COUNT_UNEXPECTED: "ROW_COUNT_UNEXPECTED",
  FIELD_SET_UNEXPECTED: "FIELD_SET_UNEXPECTED",
  OBJECT_SET_UNEXPECTED: "OBJECT_SET_UNEXPECTED",
  BOOLEAN_UNEXPECTED: "BOOLEAN_UNEXPECTED",
  PRIVILEGE_CODE_UNEXPECTED: "PRIVILEGE_CODE_UNEXPECTED",
  SIGNED_URL_ISSUED_UNEXPECTEDLY: "SIGNED_URL_ISSUED_UNEXPECTEDLY",
  SIGNED_URL_MISSING: "SIGNED_URL_MISSING",
  OBJECT_NOT_DOWNLOADABLE: "OBJECT_NOT_DOWNLOADABLE",
  POLICY_ALLOWED_UNEXPECTEDLY: "POLICY_ALLOWED_UNEXPECTEDLY",
  AUTH_CREDENTIAL_INVALID: "AUTH_CREDENTIAL_INVALID",
  AUTH_IDENTITY_MISMATCH: "AUTH_IDENTITY_MISMATCH",
  WRITE_ROW_COUNT_UNEXPECTED: "WRITE_ROW_COUNT_UNEXPECTED",
  WRITE_VALUE_NOT_APPLIED: "WRITE_VALUE_NOT_APPLIED",
  WRITE_WRONG_ROW: "WRITE_WRONG_ROW",
  FIXTURE_PRECONDITION_FAILED: "FIXTURE_PRECONDITION_FAILED",
  ORIGINAL_VALUE_MISSING: "ORIGINAL_VALUE_MISSING",
  RESTORATION_FAILED: "RESTORATION_FAILED",
  RESTORATION_UNVERIFIED: "RESTORATION_UNVERIFIED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
};

const PUBLIC_FIELDS = [
  "owner_user_id", "slug", "first_name", "last_name", "sport", "position",
  "class_year", "city", "state", "height_in", "weight_lb", "bio",
  "hero_photo_position_x", "hero_photo_position_y", "hero_photo_zoom",
  "hero_photo_path", "highlight_links", "is_published",
];

const PRIVATE_FIELDS = [
  "id", "school_or_team", "profile_photo_path", "recruiting_status",
  "recruiting_contact", "recruiting_notes", "social_instagram", "social_twitter",
  "social_tiktok", "social_hudl", "social_youtube", "social_website",
  "nil_open", "nil_contact", "nil_interests", "created_at", "updated_at",
];

/** 18 public + 17 private = the complete owner full-row field set. */
const ALL_FIELDS = [...PUBLIC_FIELDS, ...PRIVATE_FIELDS];

/** PostgreSQL insufficient-privilege SQLSTATE. */
const PG_INSUFFICIENT_PRIVILEGE = "42501";

/**
 * Statuses accepted for a refused Storage signing call. The provider's mapping is not
 * contractual; what IS contractual is that no `signedURL` comes back. Pin this to the
 * single observed status after the first live run.
 */
const SIGN_REFUSAL_STATUSES = [400, 401, 403, 404];

// Argument-rejection statuses and codes live in response-contracts.mjs, alongside the
// classifier that uses them, so both are covered by the same synthetic tests.

if (process.env.ATHLESITE_LIVE_ACCEPTANCE !== "1") {
  console.error(
    "\n  Refusing to run: this harness talks to the live Athlete project.\n" +
      "  Set ATHLESITE_LIVE_ACCEPTANCE=1 once fixtures exist, and only with founder approval.\n"
  );
  process.exit(2);
}

const cfg = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,

  aToken: process.env.ACCEPTANCE_A_TOKEN,
  aSlug: process.env.ACCEPTANCE_A_SLUG,
  aUserId: process.env.ACCEPTANCE_A_USER_ID,
  aHero: process.env.ACCEPTANCE_A_HERO_PATH,
  aSuperseded: process.env.ACCEPTANCE_A_SUPERSEDED_PATH,
  aProfilePhoto: process.env.ACCEPTANCE_A_PROFILE_PHOTO_PATH,

  bToken: process.env.ACCEPTANCE_B_TOKEN,
  bSlug: process.env.ACCEPTANCE_B_SLUG,
  bUserId: process.env.ACCEPTANCE_B_USER_ID,
  bHero: process.env.ACCEPTANCE_B_HERO_PATH,

  cToken: process.env.ACCEPTANCE_C_TOKEN,
  cSlug: process.env.ACCEPTANCE_C_SLUG,
  cUserId: process.env.ACCEPTANCE_C_USER_ID,
  cHero: process.env.ACCEPTANCE_C_HERO_PATH,
};

const missing = Object.entries(cfg).filter(([, v]) => !v).map(([k]) => k);
if (missing.length > 0) {
  console.error(`\n  Missing required configuration: ${missing.join(", ")}\n`);
  console.error("  See the fixture model in this file's header for what each value is.\n");
  process.exit(2);
}

// ──────────────────────────────────────────────────────────── reporting ──

let passed = 0;
const failures = [];

const statusClass = (s) => (s === 0 || s === undefined ? "none" : `${Math.floor(s / 100)}xx`);

/** The only output path. `detail` may carry allowlisted keys only. */
function report(id, ok, code = CODE.OK, detail = {}) {
  const allowed = ["status", "expectedStatus", "expected", "actual"];
  const parts = Object.entries(detail)
    .filter(([k, v]) => allowed.includes(k) && v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === "object" ? "[omitted]" : String(v).slice(0, 24)}`);
  if (detail.status !== undefined) parts.push(`class=${statusClass(detail.status)}`);

  const line = `${id} [${code}]${parts.length ? ` ${parts.join(" ")}` : ""}`;
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${line}`);
  } else {
    failures.push(line);
    console.log(`  ✗ ${line}`);
  }
}

// ──────────────────────────────────────────────────────────── transport ──

/**
 * Returns a discriminated result. A network fault, an HTTP error, an empty body, a JSON
 * `null`, invalid JSON, a successful zero-row array, and an object body are seven
 * different states and none collapses into `[]`.
 */
async function api(path, { credential = cfg.anonKey, method = "GET", body, headers = {} } = {}) {
  let response;
  let text;
  try {
    response = await fetch(`${cfg.url}${path}`, {
      method,
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    text = await response.text();
  } catch {
    // Not inspected: provider and runtime messages routinely embed the hostname.
    return { kind: "network", code: CODE.NETWORK_FAILURE, status: 0 };
  }

  const status = response.status;
  if (text.trim() === "") return { kind: "empty", code: CODE.BODY_EMPTY, status, ok: response.ok };

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { kind: "invalid-json", code: CODE.BODY_INVALID_JSON, status, ok: response.ok };
  }

  if (json === null) return { kind: "null", code: CODE.BODY_NULL, status, ok: response.ok };
  if (Array.isArray(json)) return { kind: "array", status, ok: response.ok, rows: json };
  if (typeof json === "object") return { kind: "object", status, ok: response.ok, value: json };
  return { kind: "scalar", status, ok: response.ok, value: json };
}

const rpcProfile = (slug, credential) =>
  api("/rest/v1/rpc/get_published_profile_by_slug", { credential, method: "POST", body: { profile_slug: slug } });

const rpcMedia = (objectName, credential) =>
  api("/rest/v1/rpc/is_publicly_referenced_media", { credential, method: "POST", body: { object_name: objectName } });

const table = (query, credential) => api(`/rest/v1/athlete_profiles?${query}`, { credential });

const patchOwnRow = (credential, slug, payload) =>
  api(`/rest/v1/athlete_profiles?slug=eq.${encodeURIComponent(slug)}`, {
    credential,
    method: "PATCH",
    body: payload,
    headers: { Prefer: "return=representation" },
  });

const sign = (path, credential) =>
  api(`/storage/v1/object/sign/${BUCKET}/${path}`, { credential, method: "POST", body: { expiresIn: 60 } });

const listSlot = (folder, slot, credential) =>
  api(`/storage/v1/object/list/${BUCKET}`, { credential, method: "POST", body: { prefix: `${folder}/${slot}`, limit: 100 } });

const whoami = (credential) => api("/auth/v1/user", { credential });

/**
 * Downloads a signed object. Returns a byte count, never the URL — a signed URL carries
 * the project ref and a bearer token.
 *
 * Resolution is delegated to resolveSignedObjectUrl because the relative form returned by
 * Storage is relative to `/storage/v1`, not to the project origin; getting that wrong 404s
 * in a way that looks exactly like a correct access denial.
 */
async function downloadSigned(signedValue) {
  const absolute = resolveSignedObjectUrl(cfg.url, signedValue);
  if (absolute === null) return { ok: false, status: 0, bytes: 0, unresolved: true };
  try {
    const response = await fetch(absolute);
    if (!response.ok) return { ok: false, status: response.status, bytes: 0 };
    const buffer = await response.arrayBuffer();
    return { ok: true, status: response.status, bytes: buffer.byteLength };
  } catch {
    return { ok: false, status: 0, bytes: 0 };
  }
}

// ──────────────────────────────────────────────────────────── assertions ──

function expectArrayStatus(id, r, expectedStatus, expectedRows) {
  if (r.kind === "network") return report(id, false, r.code);
  if (r.status !== expectedStatus) {
    return report(id, false, CODE.HTTP_STATUS_UNEXPECTED, { status: r.status, expectedStatus });
  }
  if (r.kind !== "array") return report(id, false, r.code ?? CODE.BODY_NOT_ARRAY, { status: r.status });
  if (r.rows.length !== expectedRows) {
    return report(id, false, CODE.ROW_COUNT_UNEXPECTED, { expected: expectedRows, actual: r.rows.length, status: r.status });
  }
  report(id, true, CODE.OK, { status: r.status });
}

/**
 * anon reading the table: no privilege exists after migration B, so PostgREST must report
 * a privilege error. An empty array here would mean the grant still exists.
 */
function expectTablePrivilegeDenied(id, r) {
  if (r.kind === "network") return report(id, false, r.code);
  if (r.status >= 500) return report(id, false, CODE.HTTP_SERVER_ERROR, { status: r.status });
  if (![401, 403].includes(r.status)) return report(id, false, CODE.HTTP_STATUS_UNEXPECTED, { status: r.status, expectedStatus: 403 });
  if (r.kind !== "object") return report(id, false, r.code ?? CODE.BODY_NOT_OBJECT, { status: r.status });
  if (r.value.code !== PG_INSUFFICIENT_PRIVILEGE) {
    return report(id, false, CODE.PRIVILEGE_CODE_UNEXPECTED, { status: r.status, expected: PG_INSUFFICIENT_PRIVILEGE });
  }
  report(id, true, CODE.OK, { status: r.status });
}

/**
 * An authenticated stranger DOES hold the table grant, so the correct denial is RLS
 * filtering: HTTP 200 with an empty array. A 4xx here would be a different bug.
 */
function expectRowsFilteredOut(id, r) {
  if (r.kind === "network") return report(id, false, r.code);
  if (r.status !== 200) return report(id, false, CODE.HTTP_STATUS_UNEXPECTED, { status: r.status, expectedStatus: 200 });
  if (r.kind !== "array") return report(id, false, r.code ?? CODE.BODY_NOT_ARRAY, { status: r.status });
  if (r.rows.length !== 0) return report(id, false, CODE.POLICY_ALLOWED_UNEXPECTEDLY, { expected: 0, actual: r.rows.length });
  report(id, true, CODE.OK, { status: r.status });
}

/** A refused signing call: an expected client-error status AND no signedURL issued. */
function expectSignRefused(id, r) {
  if (r.kind === "network") return report(id, false, r.code);
  if (r.status >= 500) return report(id, false, CODE.HTTP_SERVER_ERROR, { status: r.status });
  if (r.kind === "object" && typeof r.value.signedURL === "string" && r.value.signedURL !== "") {
    return report(id, false, CODE.SIGNED_URL_ISSUED_UNEXPECTEDLY, { status: r.status });
  }
  if (!SIGN_REFUSAL_STATUSES.includes(r.status)) {
    return report(id, false, CODE.HTTP_STATUS_UNEXPECTED, { status: r.status, expectedStatus: "4xx" });
  }
  report(id, true, CODE.OK, { status: r.status });
}

/** A successful signing call: 200, object body, non-empty string signedURL. `200 {}` fails. */
function expectSigned(id, r) {
  if (r.kind === "network") return report(id, false, r.code);
  if (r.status !== 200) return report(id, false, CODE.HTTP_STATUS_UNEXPECTED, { status: r.status, expectedStatus: 200 });
  if (r.kind !== "object") return report(id, false, r.code ?? CODE.BODY_NOT_OBJECT, { status: r.status });
  if (typeof r.value.signedURL !== "string" || r.value.signedURL === "") {
    return report(id, false, CODE.SIGNED_URL_MISSING, { status: r.status });
  }
  report(id, true, CODE.OK, { status: r.status });
  return r.value.signedURL;
}

function expectPublicProjection(id, r) {
  if (r.kind === "network") return report(id, false, r.code);
  if (r.status !== 200) return report(id, false, CODE.HTTP_STATUS_UNEXPECTED, { status: r.status, expectedStatus: 200 });
  if (r.kind !== "array") return report(id, false, r.code ?? CODE.BODY_NOT_ARRAY, { status: r.status });
  if (r.rows.length !== 1) return report(id, false, CODE.ROW_COUNT_UNEXPECTED, { expected: 1, actual: r.rows.length });
  const row = r.rows[0];
  if (row === null || typeof row !== "object") return report(id, false, CODE.BODY_NOT_OBJECT_LIST);
  const keys = Object.keys(row);
  const want = new Set(PUBLIC_FIELDS);
  const extra = keys.filter((k) => !want.has(k)).length;
  const absent = PUBLIC_FIELDS.filter((k) => !keys.includes(k)).length;
  if (extra !== 0 || absent !== 0) {
    return report(id, false, CODE.FIELD_SET_UNEXPECTED, { expected: PUBLIC_FIELDS.length, actual: keys.length });
  }
  report(id, true, CODE.OK, { status: r.status });
}

function expectFullRow(id, r) {
  if (r.kind === "network") return report(id, false, r.code);
  if (r.status !== 200) return report(id, false, CODE.HTTP_STATUS_UNEXPECTED, { status: r.status, expectedStatus: 200 });
  if (r.kind !== "array") return report(id, false, r.code ?? CODE.BODY_NOT_ARRAY, { status: r.status });
  if (r.rows.length !== 1) return report(id, false, CODE.ROW_COUNT_UNEXPECTED, { expected: 1, actual: r.rows.length });
  const keys = Object.keys(r.rows[0] ?? {});
  const absent = ALL_FIELDS.filter((f) => !keys.includes(f)).length;
  const extra = keys.filter((k) => !ALL_FIELDS.includes(k)).length;
  if (absent !== 0 || extra !== 0) {
    return report(id, false, CODE.FIELD_SET_UNEXPECTED, { expected: ALL_FIELDS.length, actual: keys.length });
  }
  report(id, true, CODE.OK, { status: r.status });
}

/**
 * Exact object-name set from a Storage list call.
 *
 * Element validation uses only fields the installed @supabase/storage-js documents as
 * dependable for `list()`: `name` is "always present", while `id` and `metadata` are
 * "null for folders". So a real object record is `name` non-empty plus a non-null `id`
 * and `metadata`. Nothing else is asserted — `bucket_id` in particular is documented as
 * "NOT returned by list() operations".
 *
 * Folder placeholders should not arise for these calls at all: every list here uses the
 * prefix `{uid}/{slot}`, and this project's paths are exactly `{uid}/{slot}/{uuid}.{ext}`
 * (buildMediaPath), so nothing nests below a slot. The id/metadata check is therefore a
 * tripwire for an unexpected shape rather than a folder filter — if it ever fires, the
 * assumption above has changed and the listing assertions need revisiting.
 *
 * Duplicate names are rejected outright: a Set comparison alone would silently tolerate
 * them, and two entries for one name would mean the endpoint is not behaving as assumed.
 */
function expectObjectNames(id, r, expectedNames) {
  const verdict = classifyStorageList(r, expectedNames);
  report(id, verdict.ok, verdict.reason, {
    status: r.status,
    expected: verdict.expected,
    actual: verdict.actual,
  });
}

function expectBoolean(id, r, expected) {
  if (r.kind === "network") return report(id, false, r.code);
  if (r.status !== 200) return report(id, false, CODE.HTTP_STATUS_UNEXPECTED, { status: r.status, expectedStatus: 200 });
  if (r.kind !== "scalar" || typeof r.value !== "boolean") {
    return report(id, false, r.code ?? CODE.BOOLEAN_UNEXPECTED, { status: r.status });
  }
  if (r.value !== expected) return report(id, false, CODE.BOOLEAN_UNEXPECTED, { expected, actual: r.value });
  report(id, true, CODE.OK, { status: r.status });
}

/**
 * A write must return exactly one representation row, for the intended profile, with every
 * intended field applied. A `200 []` fails immediately — that is the false positive that
 * would let a forgery test "pass" without the forgery ever being written.
 *
 * Returns true only when fully verified, so callers can skip dependent assertions.
 */
function expectWriteApplied(id, r, { ownerId, slug, fields }) {
  if (r.kind === "network") return report(id, false, r.code), false;
  if (r.status !== 200) {
    report(id, false, CODE.HTTP_STATUS_UNEXPECTED, { status: r.status, expectedStatus: 200 });
    return false;
  }
  if (r.kind !== "array") {
    report(id, false, r.code ?? CODE.BODY_NOT_ARRAY, { status: r.status });
    return false;
  }
  if (r.rows.length !== 1) {
    report(id, false, CODE.WRITE_ROW_COUNT_UNEXPECTED, { expected: 1, actual: r.rows.length, status: r.status });
    return false;
  }
  const row = r.rows[0];
  if (row?.owner_user_id !== ownerId || row?.slug !== slug) {
    report(id, false, CODE.WRITE_WRONG_ROW, { status: r.status });
    return false;
  }
  for (const [field, value] of Object.entries(fields)) {
    if (row[field] !== value) {
      report(id, false, CODE.WRITE_VALUE_NOT_APPLIED, { status: r.status, expected: field });
      return false;
    }
  }
  report(id, true, CODE.OK, { status: r.status });
  return true;
}

// ──────────────────────────────────────────── restoration bookkeeping ──

const restorations = [];

/** Registered BEFORE the mutating request, so a lost response still leaves an obligation. */
function willMutate(id, credential, slug, ownerId, field, originalValue) {
  restorations.push({ id, credential, slug, ownerId, field, originalValue });
}

async function restoreAll() {
  console.log("\n  restoring fixture state");
  if (restorations.length === 0) {
    console.log("    nothing was mutated");
    return;
  }
  for (const entry of restorations) {
    try {
      const write = await patchOwnRow(entry.credential, entry.slug, { [entry.field]: entry.originalValue });
      const applied = expectWriteApplied(`R-${entry.id} restore write`, write, {
        ownerId: entry.ownerId,
        slug: entry.slug,
        fields: { [entry.field]: entry.originalValue },
      });
      if (!applied) continue;

      const check = await table(`select=${entry.field}&slug=eq.${encodeURIComponent(entry.slug)}`, entry.credential);
      if (check.kind === "network") {
        report(`R-${entry.id} readback`, false, check.code);
        continue;
      }
      if (check.status !== 200) {
        report(`R-${entry.id} readback`, false, CODE.HTTP_STATUS_UNEXPECTED, { status: check.status, expectedStatus: 200 });
        continue;
      }
      if (check.kind !== "array" || check.rows.length !== 1) {
        report(`R-${entry.id} readback`, false, CODE.RESTORATION_UNVERIFIED, { status: check.status });
        continue;
      }
      const restored = check.rows[0][entry.field] === entry.originalValue;
      report(`R-${entry.id} readback`, restored, restored ? CODE.OK : CODE.RESTORATION_FAILED, { status: check.status });
    } catch {
      report(`R-${entry.id}`, false, CODE.RESTORATION_FAILED);
    }
  }
}

// ───────────────────────────────────────────── fixture preconditions ──

async function validateFixtures() {
  const problems = [];
  const captured = {};
  const note = (what) => problems.push(what);

  if (new Set([cfg.aUserId, cfg.bUserId, cfg.cUserId]).size !== 3) note("A/B/C must be three distinct accounts");

  // Credentials must be provably valid, so later denials mean policy and not a bad token.
  for (const [label, token, expectedId] of [
    ["A", cfg.aToken, cfg.aUserId],
    ["B", cfg.bToken, cfg.bUserId],
    ["C", cfg.cToken, cfg.cUserId],
  ]) {
    const me = await whoami(token);
    if (me.kind === "network") note(`${label}: ${CODE.NETWORK_FAILURE}`);
    else if (me.status !== 200) note(`${label}: ${CODE.AUTH_CREDENTIAL_INVALID} status=${me.status}`);
    else if (me.kind !== "object") note(`${label}: ${CODE.BODY_NOT_OBJECT}`);
    else if (me.value.id !== expectedId) note(`${label}: ${CODE.AUTH_IDENTITY_MISMATCH}`);
  }

  const fetchRow = (token, slug) =>
    table(
      `select=owner_user_id,slug,is_published,hero_photo_path,profile_photo_path&slug=eq.${encodeURIComponent(slug)}`,
      token
    );

  const readFixture = async (label, token, slug) => {
    const r = await fetchRow(token, slug);
    if (r.kind === "network") return note(`${label}: ${CODE.NETWORK_FAILURE}`), null;
    if (r.status !== 200) return note(`${label}: ${CODE.HTTP_STATUS_UNEXPECTED} status=${r.status}`), null;
    if (r.kind !== "array" || r.rows.length !== 1) return note(`${label}: ${CODE.ROW_COUNT_UNEXPECTED}`), null;
    return r.rows[0];
  };

  const a = await readFixture("A", cfg.aToken, cfg.aSlug);
  if (a) {
    if (a.owner_user_id !== cfg.aUserId) note("A: token does not own A's slug");
    if (a.is_published !== true) note("A: fixture must start PUBLISHED (exact true)");
    if (a.hero_photo_path !== cfg.aHero) note("A: configured hero path is not the stored hero");
    if (a.profile_photo_path !== cfg.aProfilePhoto) note("A: configured profile-photo path is not the stored one");
    captured.aPublished = a.is_published;
    captured.aHero = a.hero_photo_path;
  }

  const b = await readFixture("B", cfg.bToken, cfg.bSlug);
  if (b) {
    if (b.owner_user_id !== cfg.bUserId) note("B: token does not own B's slug");
    if (b.is_published !== false) note("B: fixture must start UNPUBLISHED (exact false)");
    if (b.hero_photo_path !== cfg.bHero) note("B: configured hero must equal the stored hero object");
  }

  const c = await readFixture("C", cfg.cToken, cfg.cSlug);
  if (c) {
    if (c.owner_user_id !== cfg.cUserId) note("C: token does not own C's slug");
    // The fixture model defines C as owning a PUBLISHED profile. Asserted exactly rather
    // than merely "is a boolean", so the fixture definition and the test's assumptions
    // cannot drift apart — the forgery tests publish C, and restoring to an unpublished
    // original would silently leave C in a different state than the model describes.
    if (c.is_published !== true) note("C: fixture must start PUBLISHED (exact true)");
    if (c.hero_photo_path !== cfg.cHero) note("C: configured hero path is not the stored hero");
    captured.cPublished = c.is_published;
    captured.cHero = c.hero_photo_path;
  }

  // Media objects must be proven to EXIST and be readable — a bare 200 on signing is not
  // enough, so each is signed and then actually downloaded.
  for (const [label, path, token] of [
    ["A hero", cfg.aHero, cfg.aToken],
    ["A superseded", cfg.aSuperseded, cfg.aToken],
    ["A profile-slot", cfg.aProfilePhoto, cfg.aToken],
    ["B hero", cfg.bHero, cfg.bToken],
    ["C hero", cfg.cHero, cfg.cToken],
  ]) {
    const signed = await sign(path, token);
    if (signed.kind === "network") {
      note(`${label}: ${CODE.NETWORK_FAILURE}`);
      continue;
    }
    if (signed.status !== 200 || signed.kind !== "object" || typeof signed.value.signedURL !== "string" || signed.value.signedURL === "") {
      note(`${label}: ${CODE.SIGNED_URL_MISSING} status=${signed.status}`);
      continue;
    }
    const download = await downloadSigned(signed.value.signedURL);
    if (download.unresolved) {
      note(`${label}: ${CODE.SIGNED_URL_MISSING} (signedURL could not be resolved to an absolute URL)`);
    } else if (!download.ok || download.bytes === 0) {
      note(`${label}: ${CODE.OBJECT_NOT_DOWNLOADABLE} status=${download.status}`);
    }
  }

  // Path shape: the owner-folder and hero-slot bindings depend on it.
  const shaped = (p, owner, slot) => p.split("/").length === 3 && p.startsWith(`${owner}/${slot}/`);
  if (!shaped(cfg.aHero, cfg.aUserId, "hero")) note("A hero path is not {A}/hero/{file}");
  if (!shaped(cfg.aSuperseded, cfg.aUserId, "hero")) note("A superseded path is not {A}/hero/{file}");
  if (cfg.aSuperseded === cfg.aHero) note("A superseded path must differ from A's current hero");
  if (!shaped(cfg.aProfilePhoto, cfg.aUserId, "profile")) note("A profile-photo path is not {A}/profile/{file}");
  if (!shaped(cfg.bHero, cfg.bUserId, "hero")) note("B hero path is not {B}/hero/{file}");
  if (!shaped(cfg.cHero, cfg.cUserId, "hero")) note("C hero path is not {C}/hero/{file}");

  // Every value the matrix may overwrite must have an unambiguous captured original.
  if (typeof captured.aPublished !== "boolean") note(`A is_published: ${CODE.ORIGINAL_VALUE_MISSING}`);
  if (typeof captured.aHero !== "string" || captured.aHero === "") note(`A hero_photo_path: ${CODE.ORIGINAL_VALUE_MISSING}`);
  if (typeof captured.cPublished !== "boolean") note(`C is_published: ${CODE.ORIGINAL_VALUE_MISSING}`);
  if (typeof captured.cHero !== "string" || captured.cHero === "") note(`C hero_photo_path: ${CODE.ORIGINAL_VALUE_MISSING}`);

  return { problems, captured };
}

// ─────────────────────────────────────────────────────────────── main ──

async function main() {
  console.log("\n  Checkpoint 5D.7 — live access boundary acceptance\n");

  const { problems, captured } = await validateFixtures();
  if (problems.length > 0) {
    console.error(`  [${CODE.FIXTURE_PRECONDITION_FAILED}] refusing to run the matrix:\n`);
    for (const p of problems) console.error(`    - ${p}`);
    console.error("\n  A green run against bad fixtures proves nothing. Fix the fixtures first.\n");
    process.exit(2);
  }
  console.log("  fixtures OK — identities verified, states exact, media downloadable, originals captured\n");

  try {
    // ── anon: the legitimate public read. Also proves the anon key works, so later anon
    //    denials are policy and not a bad credential.
    {
      const r = await rpcProfile(cfg.aSlug, cfg.anonKey);
      expectArrayStatus("01 anon RPC published slug", r, 200, 1);
      expectPublicProjection("02 anon RPC exact 18-field projection", r);
    }

    // ── anon: unpublished and nonexistent are indistinguishable
    {
      const unpublished = await rpcProfile(cfg.bSlug, cfg.anonKey);
      const nonexistent = await rpcProfile("definitely-not-a-real-slug-5d7", cfg.anonKey);
      expectArrayStatus("03 anon RPC unpublished slug", unpublished, 200, 0);
      expectArrayStatus("04 anon RPC nonexistent slug", nonexistent, 200, 0);
      const identical = unpublished.status === nonexistent.status && unpublished.kind === nonexistent.kind;
      report("05 unpublished and nonexistent identical", identical, identical ? CODE.OK : CODE.HTTP_STATUS_UNEXPECTED);
    }

    // ── anon: no table privilege at all
    expectTablePrivilegeDenied("06 anon table select=*", await table("select=*", cfg.anonKey));
    expectTablePrivilegeDenied("07 anon table public column", await table("select=first_name", cfg.anonKey));
    expectTablePrivilegeDenied("08 anon bulk enumeration", await table("select=slug&limit=1000", cfg.anonKey));
    expectTablePrivilegeDenied("09 anon table private column", await table("select=recruiting_contact", cfg.anonKey));

    // ── anon: the RPC cannot be coerced into listing
    for (const [i, probe] of ["%", "_", "*", "%%", "' or 1=1 --"].entries()) {
      expectArrayStatus(`10.${i + 1} anon RPC pattern-shaped slug`, await rpcProfile(probe, cfg.anonKey), 200, 0);
    }
    {
      const arrayArg = await api("/rest/v1/rpc/get_published_profile_by_slug", {
        method: "POST",
        body: { profile_slug: [cfg.aSlug, cfg.bSlug] },
      });
      // THE SECURITY PROPERTY UNDER TEST: array-shaped input must never create
      // multi-value lookup behaviour — no array lookup, no multiple-slug lookup, no
      // wildcard, no enumeration. Classification lives in response-contracts.mjs so the
      // accept/reject boundary is unit tested against synthetic responses; in particular a
      // bare `{}` with a 4xx no longer counts as an argument rejection.
      const verdict = classifyArrayArgumentResponse(arrayArg);
      report("11 anon RPC array-shaped argument", verdict.ok, verdict.reason, {
        status: arrayArg.status,
        actual: verdict.actual,
      });
    }

    // ── an unrelated signed-in athlete: holds the grant, so denial is RLS row filtering
    {
      const viaRpc = await rpcProfile(cfg.aSlug, cfg.cToken);
      expectArrayStatus("12 C RPC A's published slug", viaRpc, 200, 1);
      expectPublicProjection("13 C RPC exact 18-field projection", viaRpc);

      for (const [i, field] of PRIVATE_FIELDS.entries()) {
        expectRowsFilteredOut(
          `14.${i + 1} C cannot read A private column`,
          await table(`select=${field}&slug=eq.${encodeURIComponent(cfg.aSlug)}`, cfg.cToken)
        );
      }

      const own = await table("select=owner_user_id", cfg.cToken);
      expectArrayStatus("15 C table select returns exactly one row", own, 200, 1);
      const isOwn = own.kind === "array" && own.rows[0]?.owner_user_id === cfg.cUserId;
      report("16 the row C sees is C's own", isOwn, isOwn ? CODE.OK : CODE.AUTH_IDENTITY_MISMATCH);

      expectRowsFilteredOut("17 C cannot see B's unpublished row", await table(`select=slug&slug=eq.${encodeURIComponent(cfg.bSlug)}`, cfg.cToken));
      expectArrayStatus("18 C RPC on B's unpublished slug", await rpcProfile(cfg.bSlug, cfg.cToken), 200, 0);
    }

    // ── owners keep what they need
    {
      expectFullRow("19 A full row is the complete 35-field set", await table("select=*", cfg.aToken));
      expectArrayStatus("20 RPC refuses B's own unpublished row", await rpcProfile(cfg.bSlug, cfg.bToken), 200, 0);
      expectArrayStatus("21 B previews own unpublished row via table", await table(`select=slug&slug=eq.${encodeURIComponent(cfg.bSlug)}`, cfg.bToken), 200, 1);

      willMutate("22", cfg.aToken, cfg.aSlug, cfg.aUserId, "is_published", captured.aPublished);
      expectWriteApplied("22 A can write their own row", await patchOwnRow(cfg.aToken, cfg.aSlug, { is_published: true }), {
        ownerId: cfg.aUserId,
        slug: cfg.aSlug,
        fields: { is_published: true },
      });
    }

    // ── media: only the currently referenced hero, only in its owner's folder
    {
      expectSigned("23 anon signs A current hero", await sign(cfg.aHero, cfg.anonKey));
      expectBoolean("24 helper: A current hero is public", await rpcMedia(cfg.aHero, cfg.anonKey), true);

      expectSignRefused("25 anon signs A superseded hero", await sign(cfg.aSuperseded, cfg.anonKey));
      expectBoolean("26 helper: A superseded hero not public", await rpcMedia(cfg.aSuperseded, cfg.anonKey), false);

      expectSignRefused("27 anon signs A profile-slot object", await sign(cfg.aProfilePhoto, cfg.anonKey));
      expectBoolean("28 helper: A profile-slot not public", await rpcMedia(cfg.aProfilePhoto, cfg.anonKey), false);

      expectSignRefused("29 anon signs B unpublished hero", await sign(cfg.bHero, cfg.anonKey));
      expectBoolean("30 helper: B hero not public", await rpcMedia(cfg.bHero, cfg.anonKey), false);

      expectObjectNames("31 anon lists A hero slot: only current hero", await listSlot(cfg.aUserId, "hero", cfg.anonKey), [cfg.aHero.split("/").pop()]);
      expectObjectNames("32 anon lists A profile slot: nothing", await listSlot(cfg.aUserId, "profile", cfg.anonKey), []);
      expectObjectNames("33 anon lists B hero slot: nothing", await listSlot(cfg.bUserId, "hero", cfg.anonKey), []);
      expectObjectNames("34 A lists own hero slot: current and superseded", await listSlot(cfg.aUserId, "hero", cfg.aToken), [
        cfg.aHero.split("/").pop(),
        cfg.aSuperseded.split("/").pop(),
      ]);
      expectSigned("35 A signs own superseded object", await sign(cfg.aSuperseded, cfg.aToken));
    }

    // ── HIGH 1 regression: cross-owner forgery by an unrelated athlete.
    //    The forgery WRITE is fully verified first; otherwise a 200 [] would leave the
    //    forgery unwritten and the denial assertions would pass for the wrong reason.
    {
      willMutate("36h", cfg.cToken, cfg.cSlug, cfg.cUserId, "hero_photo_path", captured.cHero);
      willMutate("36p", cfg.cToken, cfg.cSlug, cfg.cUserId, "is_published", captured.cPublished);

      for (const [i, victimPath] of [cfg.aSuperseded, cfg.aProfilePhoto, cfg.bHero].entries()) {
        const forged = expectWriteApplied(
          `36.${i + 1}w forgery write applied`,
          await patchOwnRow(cfg.cToken, cfg.cSlug, { hero_photo_path: victimPath, is_published: true }),
          { ownerId: cfg.cUserId, slug: cfg.cSlug, fields: { hero_photo_path: victimPath, is_published: true } }
        );
        if (!forged) continue;

        expectSignRefused(`36.${i + 1} C cannot expose foreign object by forgery`, await sign(victimPath, cfg.anonKey));
        expectBoolean(`37.${i + 1} helper refuses forged foreign reference`, await rpcMedia(victimPath, cfg.anonKey), false);
      }
    }

    // ── same-owner profile-slot forgery: the hero-slot binding must still refuse
    {
      willMutate("38h", cfg.aToken, cfg.aSlug, cfg.aUserId, "hero_photo_path", captured.aHero);
      const forged = expectWriteApplied(
        "38w same-owner forgery write applied",
        await patchOwnRow(cfg.aToken, cfg.aSlug, { hero_photo_path: cfg.aProfilePhoto, is_published: true }),
        { ownerId: cfg.aUserId, slug: cfg.aSlug, fields: { hero_photo_path: cfg.aProfilePhoto, is_published: true } }
      );
      if (forged) {
        expectSignRefused("38 same-owner profile-slot stays private", await sign(cfg.aProfilePhoto, cfg.anonKey));
        expectBoolean("39 helper refuses same-owner profile-slot", await rpcMedia(cfg.aProfilePhoto, cfg.anonKey), false);
      }
    }

    // ── unpublishing cuts off profile and hero
    {
      const reset = await patchOwnRow(cfg.aToken, cfg.aSlug, { hero_photo_path: captured.aHero });
      const ready = expectWriteApplied("40 A's hero reset before the unpublish test", reset, {
        ownerId: cfg.aUserId,
        slug: cfg.aSlug,
        fields: { hero_photo_path: captured.aHero },
      });

      if (ready) {
        willMutate("41p", cfg.aToken, cfg.aSlug, cfg.aUserId, "is_published", captured.aPublished);
        const off = await patchOwnRow(cfg.aToken, cfg.aSlug, { is_published: false });
        if (expectWriteApplied("41 unpublish A", off, { ownerId: cfg.aUserId, slug: cfg.aSlug, fields: { is_published: false } })) {
          expectArrayStatus("42 unpublished: anon RPC returns nothing", await rpcProfile(cfg.aSlug, cfg.anonKey), 200, 0);
          expectSignRefused("43 unpublished: hero not signable by anon", await sign(cfg.aHero, cfg.anonKey));
          expectBoolean("44 unpublished: helper says hero not public", await rpcMedia(cfg.aHero, cfg.anonKey), false);
        }
      }
    }
  } finally {
    await restoreAll();
  }

  console.log(`\n  ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error("\n  FAILURES:");
    for (const f of failures) console.error(`    - ${f}`);
    console.error("\n  Every line here is an access boundary. Do not treat a failure as cosmetic.\n");
    process.exit(1);
  }
  console.log("  Access boundary verified. Fixture deletion is manual and needs founder approval.\n");
}

// Sanitized top level: an uncaught exception must not print a raw message, which can embed
// the request URL or provider detail.
try {
  await main();
} catch {
  console.error(`\n  [${CODE.INTERNAL_ERROR}] the harness aborted before completing.`);
  console.error("  Diagnostics are suppressed by policy. Re-run with fixtures verified.\n");
  process.exit(1);
}
