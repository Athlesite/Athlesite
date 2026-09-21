import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  athleteDisplayUrl,
  athleteRoutePath,
  createEmptyAthleteProfile,
  isReservedSlug,
  isValidSlugFormat,
  toAthleteProfileView,
  PUBLIC_HOST,
} from "@/lib/athlete-profile";

/**
 * Checkpoint 5D.3: athlete profiles moved to the canonical root `/{slug}`,
 * and the URL the product *shows* an athlete must be the URL that actually
 * resolves. Before this change the product displayed `athlesite.com/{slug}`
 * while serving `/athletes/{slug}` — an athlete who copied what they were
 * shown got a link that did not work.
 */
describe("canonical athlete URLs", () => {
  test("routePath is the slug at the root, with no prefix", () => {
    assert.equal(athleteRoutePath("jordan-bell"), "/jordan-bell");
    assert.equal(athleteRoutePath("maya"), "/maya");
  });

  test("displayUrl is the public host plus the route path", () => {
    assert.equal(athleteDisplayUrl("jordan-bell"), "athlesite.com/jordan-bell");
  });

  test("displayUrl and routePath agree — the invariant the old mismatch broke", () => {
    for (const slug of ["jordan-bell", "maya", "a1b2c3", "x-y-z"]) {
      assert.equal(
        athleteDisplayUrl(slug),
        `${PUBLIC_HOST}${athleteRoutePath(slug)}`,
        `displayUrl must be PUBLIC_HOST + routePath for "${slug}"`
      );
    }
  });

  test("no generated athlete URL carries the retired /athletes prefix", () => {
    assert.doesNotMatch(athleteRoutePath("jordan-bell"), /\/athletes\//);
    assert.doesNotMatch(athleteDisplayUrl("jordan-bell"), /\/athletes\//);
  });

  test("toAthleteProfileView reports both, and they agree there too", () => {
    const view = toAthleteProfileView({ ...createEmptyAthleteProfile(), slug: "jordan-bell" });

    assert.equal(view.routePath, "/jordan-bell");
    assert.equal(view.displayUrl, "athlesite.com/jordan-bell");
    assert.equal(view.displayUrl, `${PUBLIC_HOST}${view.routePath}`);
  });
});

/**
 * Root-level profiles mean a reserved name is the only thing keeping a future
 * route from shadowing an athlete's already-shared link. `npm run check:slugs`
 * covers routes that exist today; these cover the forward-looking entries a
 * machine check cannot know about.
 */
describe("reserved root slugs", () => {
  const mustBeReserved = [
    // Existing application routes.
    "get-started",
    "edit-profile",
    "athletes",
    "jordan-bell",
    "example",
    "api",
    "admin",
    "login",
    "signup",
    "onboarding",
    // Added in Checkpoint 5D.3 for the root-slug move.
    "privacy",
    "terms",
    "about",
    "contact",
    "support",
    "help",
    "pricing",
    "blog",
    "resources",
    "account",
    "settings",
    "dashboard",
    "recruiting",
    "nil",
    "www",
    "app",
  ];

  for (const slug of mustBeReserved) {
    test(`"${slug}" is reserved and cannot be claimed as a username`, () => {
      assert.equal(isReservedSlug(slug), true);
    });
  }

  test("the pre-5D.3 reservations all survived the expansion", () => {
    for (const slug of ["get-started", "edit-profile", "athletes", "jordan-bell", "example"]) {
      assert.equal(isReservedSlug(slug), true, `${slug} must not have been dropped`);
    }
  });

  test("an ordinary athlete username is still available", () => {
    assert.equal(isReservedSlug("jordan"), false);
    assert.equal(isReservedSlug("maya-torres"), false);
    assert.equal(isValidSlugFormat("maya-torres"), true);
  });
});
