import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveSiteUrl, DEFAULT_SITE_URL, SITE_URL_ENV } from "@/lib/site-url";

/**
 * `metadataBase` is resolved from NEXT_PUBLIC_SITE_URL at build time. The
 * branch that matters is the malformed one: quietly falling back to localhost
 * there would ship production pages advertising http://localhost:3000, which
 * nothing would catch until someone read the HTML.
 */
describe("resolveSiteUrl", () => {
  test("unset -> localhost, so local dev and a bare build need no configuration", () => {
    assert.equal(resolveSiteUrl(undefined).toString(), new URL(DEFAULT_SITE_URL).toString());
  });

  test("empty or whitespace-only is treated as unset", () => {
    assert.equal(resolveSiteUrl("").origin, "http://localhost:3000");
    assert.equal(resolveSiteUrl("   ").origin, "http://localhost:3000");
  });

  test("a valid production origin is used as given", () => {
    assert.equal(resolveSiteUrl("https://athlesite.com").origin, "https://athlesite.com");
  });

  test("surrounding whitespace is tolerated", () => {
    assert.equal(resolveSiteUrl("  https://athlesite.com  ").origin, "https://athlesite.com");
  });

  test("normalizes to the origin — a stray path, query or trailing slash cannot leak in", () => {
    for (const raw of [
      "https://athlesite.com/",
      "https://athlesite.com/some/path",
      "https://athlesite.com/?utm=x",
      "https://athlesite.com/#frag",
    ]) {
      assert.equal(resolveSiteUrl(raw).toString(), "https://athlesite.com/", `for ${raw}`);
    }
  });

  test("a malformed value THROWS rather than silently falling back", () => {
    for (const raw of ["athlesite.com", "not a url", "https://", "//athlesite.com"]) {
      assert.throws(() => resolveSiteUrl(raw), new RegExp(SITE_URL_ENV), `expected throw for ${raw}`);
    }
  });

  test("a non-http(s) protocol is a configuration mistake, not an origin", () => {
    for (const raw of ["file:///tmp/site", "ftp://athlesite.com", "javascript:alert(1)"]) {
      assert.throws(() => resolveSiteUrl(raw), new RegExp(SITE_URL_ENV), `expected throw for ${raw}`);
    }
  });

  test("the error names the variable and the safe fallback, so the fix is obvious", () => {
    try {
      resolveSiteUrl("athlesite.com");
      assert.fail("expected a throw");
    } catch (e) {
      const message = (e as Error).message;
      assert.match(message, /NEXT_PUBLIC_SITE_URL/);
      assert.match(message, /localhost:3000/);
    }
  });

  test("no Supabase or preview hostname is baked in as a default", () => {
    const fallback = resolveSiteUrl(undefined).toString();
    assert.doesNotMatch(fallback, /supabase/i);
    assert.doesNotMatch(fallback, /vercel/i);
    assert.doesNotMatch(fallback, /athlesite\.com/i);
  });
});
