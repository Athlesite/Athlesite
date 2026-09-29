import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveSignedObjectUrl } from "./signed-url.mjs";

/**
 * The bug these cover: Storage returns `signedURL` relative to the *Storage API base*
 * (`/storage/v1`), not to the project origin. Resolving against the origin drops
 * `/storage/v1`, the fetch 404s, and in an access-boundary harness that is
 * indistinguishable from a correct denial — so it would manufacture false passes.
 *
 * Pure and local: these run in `npm test` and never contact anything.
 */
const PROJECT = "https://example-project.supabase.co";
const RELATIVE = "/object/sign/athlete-media/uid/hero/abc.jpg?token=xyz";

describe("resolveSignedObjectUrl", () => {
  test("a relative /object/sign path resolves against the STORAGE base, not the origin", () => {
    assert.equal(
      resolveSignedObjectUrl(PROJECT, RELATIVE),
      `${PROJECT}/storage/v1${RELATIVE}`
    );
  });

  test("the resolved URL contains /storage/v1 exactly once", () => {
    const resolved = resolveSignedObjectUrl(PROJECT, RELATIVE);
    assert.equal(resolved.split("/storage/v1").length - 1, 1);
  });

  test("an absolute signed URL is returned unchanged", () => {
    const absolute = `${PROJECT}/storage/v1${RELATIVE}`;
    assert.equal(resolveSignedObjectUrl(PROJECT, absolute), absolute);
    const http = "http://localhost:54321/storage/v1/object/sign/b/o.jpg?token=t";
    assert.equal(resolveSignedObjectUrl(PROJECT, http), http);
  });

  test("a trailing slash on the project URL does not double up", () => {
    assert.equal(
      resolveSignedObjectUrl(`${PROJECT}/`, RELATIVE),
      `${PROJECT}/storage/v1${RELATIVE}`
    );
  });

  test("a project URL that already ends in /storage/v1 is not duplicated", () => {
    assert.equal(
      resolveSignedObjectUrl(`${PROJECT}/storage/v1`, RELATIVE),
      `${PROJECT}/storage/v1${RELATIVE}`
    );
  });

  test("malformed or missing values return null rather than a guessed URL", () => {
    for (const bad of [undefined, null, "", "   ", 42, {}, [], true]) {
      assert.equal(resolveSignedObjectUrl(PROJECT, bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
  });

  test("a relative value without a leading slash is malformed, not guessed at", () => {
    assert.equal(resolveSignedObjectUrl(PROJECT, "object/sign/b/o.jpg?token=t"), null);
  });

  test("malformed absolute values are rejected rather than concatenated", () => {
    // These pass a naive /^https?:\/\// prefix test but are NOT parsable URLs, and handing
    // one to fetch() would throw from inside an assertion.
    for (const bad of ["http://", "https://", "https:// /x", "http:// "]) {
      assert.equal(resolveSignedObjectUrl(PROJECT, bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
  });

  test("a triple-slash value parses to a host and is accepted, by design", () => {
    // Documented rather than special-cased. WHATWG collapses the extra slash, so
    // `http:///object/sign/a` parses as host "object", path "/sign/a" — a structurally
    // valid http URL. The contract is "parsable by new URL with an http(s) protocol", and
    // this meets it. Adding host validation would be a design change, and it is not needed:
    // a bogus host simply fails to resolve at fetch time, which the caller reports as
    // OBJECT_NOT_DOWNLOADABLE. It fails safe rather than silently passing an assertion.
    assert.equal(new URL("http:///object/sign/a").host, "object");
    assert.equal(resolveSignedObjectUrl(PROJECT, "http:///object/sign/a"), "http:///object/sign/a");
  });

  test("non-http(s) schemes are rejected", () => {
    for (const bad of ["ftp://host/object/sign/a", "file:///etc/passwd", "javascript:alert(1)", "data:text/plain,hi"]) {
      assert.equal(resolveSignedObjectUrl(PROJECT, bad), null, `expected null for ${bad}`);
    }
  });

  test("an arbitrary rooted path is NOT a signing endpoint and is rejected", () => {
    for (const bad of ["/foo/bar", "/", "/object", "/object/signature/x", "/storage/v1/object/list/b"]) {
      assert.equal(resolveSignedObjectUrl(PROJECT, bad), null, `expected null for ${bad}`);
    }
  });

  test("an already /storage/v1-prefixed signing path resolves without doubling", () => {
    const prefixed = `/storage/v1${RELATIVE}`;
    assert.equal(resolveSignedObjectUrl(PROJECT, prefixed), `${PROJECT}/storage/v1${RELATIVE}`);
    assert.equal(resolveSignedObjectUrl(`${PROJECT}/storage/v1`, prefixed), `${PROJECT}/storage/v1${RELATIVE}`);
  });

  test("a valid absolute http URL is returned unchanged", () => {
    const http = "http://127.0.0.1:54321/storage/v1/object/sign/b/o.jpg?token=t";
    assert.equal(resolveSignedObjectUrl(PROJECT, http), http);
  });

  test("a missing project URL returns null for a relative value", () => {
    assert.equal(resolveSignedObjectUrl("", RELATIVE), null);
    assert.equal(resolveSignedObjectUrl(undefined, RELATIVE), null);
  });

  test("an absolute value still resolves even without a project URL", () => {
    const absolute = `${PROJECT}/storage/v1${RELATIVE}`;
    assert.equal(resolveSignedObjectUrl("", absolute), absolute);
  });

  test("the query string is preserved verbatim — the token must survive", () => {
    const resolved = resolveSignedObjectUrl(PROJECT, RELATIVE);
    assert.ok(resolved.endsWith("?token=xyz"));
  });
});
