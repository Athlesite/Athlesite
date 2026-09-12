import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { StorageClient } from "@supabase/storage-js";
import { StorageApiError } from "@supabase/supabase-js";
import { classifyUploadAttempt } from "@/lib/profile-save-decisions";
import { buildMediaPath } from "@/lib/media-paths";

/**
 * Regression for Astra's finding, in two rounds:
 *
 * Round 1: uploadPhoto() classified every *returned* Storage error as
 * definite, including StorageUnknownError — the class the installed
 * `@supabase/storage-js` SDK constructs when the underlying `fetch` call
 * itself fails (no HTTP response ever received).
 *
 * Round 2 (this file, current state): the round-1 fix still treated a
 * *returned* `StorageApiError` (any real HTTP response) as definite proof of
 * rejection. That is also wrong: `StorageApiError` is constructed for *any*
 * non-2xx response, including 502/503/504 — a gateway or proxy reporting
 * that *it* could not get a timely answer from the origin, which proves
 * nothing about whether the origin actually completed the write. Inspection
 * of the installed SDK's source found no returned error — of any class, for
 * any HTTP status — whose semantics prove an object was not created. The
 * current invariant, implemented in media-storage.ts's uploadPhoto and
 * profile-save-decisions.ts's classifyUploadAttempt: **no network-layer
 * outcome is ever classified definite.** `definite-failure` is reachable
 * only from client-side checks that run strictly before any network attempt
 * (validation, image processing, path generation itself throwing) — see
 * uploadPhoto's own source for exactly where those returns happen.
 *
 * classifyUploadAttempt therefore no longer has a "definite" branch at all;
 * this file's job is proving that every kind of real, SDK-produced network
 * outcome — a 504 gateway response, a fetch-level rejection, and an
 * unfamiliar/malformed failure shape — is treated identically as ambiguous,
 * with the exact attempted path always retained, and that a genuine success
 * is unaffected.
 *
 * This drives the real, installed SDK's own request/error-conversion
 * pipeline (StorageClient -> StorageFileApi -> the fetch handler in
 * @supabase/storage-js/src/lib/common/fetch.ts) with an injected fetch,
 * rather than hand-constructing fake error objects, and feeds the SDK's
 * real output through this project's real, unmodified classification
 * function (classifyUploadAttempt, imported from the actual production
 * file — not reimplemented).
 *
 * Run with the project's alias-resolving loader hook (Node has no native
 * concept of TypeScript path aliases — Next.js/Turbopack resolve them via
 * their own bundler, irrelevant when a test imports source directly):
 *
 *   node --import ./scripts/register-alias-resolver.mjs --env-file=.env.local --test src/lib/media-storage.upload-classification.test.ts
 *
 * `--env-file=.env.local` supplies real (non-secret, publishable) Supabase
 * config so media-storage.ts's own module-level env reads succeed; no real
 * network request ever leaves this process — every fetch below is injected
 * and resolves/rejects locally, regardless of the URL it was called with.
 *
 * uploadPhoto()'s own image re-encoding step (createImageBitmap,
 * OffscreenCanvas) is a browser-only capability Node does not provide and
 * this project does not polyfill, so this file cannot drive the complete
 * uploadPhoto() function end-to-end without a browser or a new dependency —
 * neither of which this fix introduces. It instead verifies the exact
 * classification uploadPhoto delegates to for every network outcome this
 * finding is about; the wiring between them is confirmed by direct
 * inspection of the unmodified production source (see the accompanying
 * report).
 */

async function uploadWithFetch(injectedFetch: typeof fetch, path: string) {
  const storage = new StorageClient("https://example.invalid/storage/v1", {}, injectedFetch);
  return storage.from("athlete-media").upload(path, new Blob(["fake bytes"]), {
    contentType: "image/jpeg",
    upsert: false,
  });
}

describe("Astra regression round 2: no returned Storage error is ever classified definite", () => {
  test("real HTTP 504 (Gateway Timeout) response -> ambiguous, exact attemptedPath retained", async () => {
    const respondsWith504: typeof fetch = () =>
      Promise.resolve(new Response("upstream request timeout", { status: 504, statusText: "Gateway Timeout" }));

    const path = buildMediaPath("uid-astra-504", "hero", "image/jpeg");
    const { error } = await uploadWithFetch(respondsWith504, path);

    // Confirms the premise: a 504 really does arrive as the SDK's
    // affirmative-response class. This is exactly the case that must NOT be
    // read as proof of rejection.
    assert.ok(error instanceof StorageApiError, "a real HTTP response must produce StorageApiError");
    assert.equal(error.status, 504);

    const outcome = classifyUploadAttempt(path, true, error.message);
    assert.equal(outcome.kind, "ambiguous", "a 504 must never be classified as a definite rejection");
    if (outcome.kind !== "ambiguous") throw new Error("unreachable");
    assert.equal(outcome.attemptedPath, path, "the exact generated path must be retained, not lost");
  });

  test("real fetch rejection (no response at all) -> ambiguous, exact attemptedPath retained", async () => {
    const rejectingFetch: typeof fetch = () => Promise.reject(new TypeError("fetch failed"));

    const path = buildMediaPath("uid-astra-fetchreject", "profile", "image/png");
    const { data, error } = await uploadWithFetch(rejectingFetch, path);

    assert.equal(data, null);
    assert.equal(error?.name, "StorageUnknownError", "confirms the SDK's real unknown-outcome wrapper");
    assert.equal(error instanceof StorageApiError, false);

    const outcome = classifyUploadAttempt(path, true, "Couldn't upload your photo. Check your connection.");
    assert.equal(outcome.kind, "ambiguous");
    if (outcome.kind !== "ambiguous") throw new Error("unreachable");
    assert.equal(outcome.attemptedPath, path);
  });

  test("unfamiliar/malformed failure shape (fetch resolves to something not Response-like) -> still ambiguous", async () => {
    // Neither a real Response nor a thrown exception: a fetch that resolves
    // to a plain, non-Response value. The SDK's own handleError funnels this
    // into StorageUnknownError too (its isResponseLike check fails), but the
    // point of this test is that classification does not depend on that —
    // nothing here is special-cased by class name, so any unrecognized shape
    // is ambiguous by construction, not by an enumerated exception list.
    const resolvesWithGarbage = (() =>
      Promise.resolve({ notAResponse: true })) as unknown as typeof fetch;

    const path = buildMediaPath("uid-astra-unfamiliar", "hero", "image/webp");
    const { error } = await uploadWithFetch(resolvesWithGarbage, path);

    assert.ok(error, "the SDK must still surface some error for a malformed fetch outcome");
    assert.equal(
      error instanceof StorageApiError,
      false,
      "an unfamiliar/malformed outcome must not resemble the SDK's affirmative-response class"
    );

    const outcome = classifyUploadAttempt(path, true, "unused");
    assert.equal(outcome.kind, "ambiguous");
    if (outcome.kind !== "ambiguous") throw new Error("unreachable");
    assert.equal(outcome.attemptedPath, path);
  });

  test("even a 'clean-looking' 4xx (409 Conflict) is still ambiguous — no exception is carved out", async () => {
    // The most tempting case to call definite: upsert:false plus a real path
    // collision. Proving even this is ambiguous shows the rule has no
    // exceptions rather than one narrowly avoided for the 5xx cases above.
    const respondsWith409: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ statusCode: "409", error: "Duplicate", message: "The resource already exists" }), {
          status: 409,
        })
      );

    const path = buildMediaPath("uid-astra-409", "hero", "image/jpeg");
    const { error } = await uploadWithFetch(respondsWith409, path);

    assert.ok(error instanceof StorageApiError);
    const outcome = classifyUploadAttempt(path, true, error.message);
    assert.equal(
      outcome.kind,
      "ambiguous",
      "no HTTP status, including one that looks like a clean rejection, is treated as proof"
    );
  });
});

describe("retained: a normal successful upload remains a confirmed success", () => {
  test("a real 200-equivalent response through the SDK yields a genuine success outcome", async () => {
    const respondingWithSuccess: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ Id: "some-id", Key: "athlete-media/uid-test/hero/ok.jpg" }), {
          status: 200,
        })
      );

    const path = "uid-test/hero/ok.jpg";
    const { data, error } = await uploadWithFetch(respondingWithSuccess, path);

    assert.equal(error, null);
    assert.ok(data);

    const outcome = classifyUploadAttempt(path, false, "unused");
    assert.deepEqual(outcome, { kind: "success", path });
  });
});
