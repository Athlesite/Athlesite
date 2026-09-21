import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  heroHeadline,
  heroMeta,
  nilClaim,
  recruitingClaim,
  recruitingFacts,
  showNilSection,
  usableHighlights,
  type RecruitingPosture,
} from "@/components/profile/profile-display";
import { createEmptyAthleteProfile, toAthleteProfileView } from "@/lib/athlete-profile";

function viewOf(overrides: Partial<Parameters<typeof toAthleteProfileView>[0]> = {}) {
  return toAthleteProfileView({ ...createEmptyAthleteProfile(), ...overrides });
}

const OPEN: RecruitingPosture = { recruitingStatus: "open", nilOpen: true };
const NOT_OPEN: RecruitingPosture = { recruitingStatus: "not_open", nilOpen: false };
const UNDECIDED: RecruitingPosture = { recruitingStatus: "undecided", nilOpen: false };

/**
 * Checkpoint 5D.3: before this change every profile asserted, hardcoded, that
 * the athlete "is open to recruiting conversations" and "is open to NIL and
 * business partnerships" — regardless of what they had actually chosen, and
 * on a page about a minor. A public profile cannot know either value
 * (neither column is in the anonymous 18), so it must say nothing rather
 * than guess.
 */
describe("recruiting claims", () => {
  test("no posture (a real public profile) -> no claim at all", () => {
    assert.equal(recruitingClaim("Jordan Bell", undefined), null);
  });

  test("no posture -> not the opposite claim either; silence, not a negative", () => {
    const claim = recruitingClaim("Jordan Bell", undefined);
    assert.equal(claim, null);
    // Guards against a "fix" that renders a fabricated default instead.
    assert.doesNotMatch(String(claim), /open|not currently/i);
  });

  test("open -> states it, naming the athlete", () => {
    const claim = recruitingClaim("Jordan Bell", OPEN);
    assert.match(String(claim), /^Jordan Bell is open to recruiting conversations/);
  });

  test("not_open -> states that truthfully, never the reverse", () => {
    const claim = recruitingClaim("Jordan Bell", NOT_OPEN);
    assert.match(String(claim), /not currently seeking/);
    assert.doesNotMatch(String(claim), /is open to/);
  });

  test("undecided -> no claim; a default and a real answer are indistinguishable", () => {
    assert.equal(recruitingClaim("Jordan Bell", UNDECIDED), null);
  });

  test("falls back to a neutral subject rather than an empty name", () => {
    assert.match(String(recruitingClaim("   ", OPEN)), /^This athlete is open/);
  });
});

describe("NIL section", () => {
  test("no posture (a real public profile) -> section omitted entirely", () => {
    assert.equal(showNilSection(undefined), false);
    assert.equal(nilClaim("Jordan Bell", undefined), null);
  });

  test("nilOpen true -> section shown, states openness", () => {
    assert.equal(showNilSection(OPEN), true);
    assert.match(String(nilClaim("Jordan Bell", OPEN)), /is open to NIL and business partnerships/);
  });

  test("nilOpen false -> section shown, states the opposite truthfully", () => {
    assert.equal(showNilSection(NOT_OPEN), true);
    const claim = String(nilClaim("Jordan Bell", NOT_OPEN));
    assert.match(claim, /not currently taking NIL/);
    assert.doesNotMatch(claim, /is open to NIL/);
  });
});

describe("no public-profile copy invents or placeholds", () => {
  /** Everything a real public profile could render from these rules. */
  const publicCopy = [
    recruitingClaim("Jordan Bell", undefined),
    nilClaim("Jordan Bell", undefined),
    recruitingFacts(viewOf({ firstName: "Jordan", lastName: "Bell", position: "WR" })),
    heroHeadline(viewOf({ sport: "Football", position: "WR" })),
    heroMeta(viewOf({ classYear: "2027", city: "Round Rock", state: "TX" })),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  test("contains no 'available soon' placeholder", () => {
    assert.doesNotMatch(publicCopy, /available soon/i);
  });

  test("contains no 'sample placeholder' language", () => {
    assert.doesNotMatch(publicCopy, /sample placeholder/i);
  });

  test("contains no hardcoded 'is open to' recruiting or NIL claim", () => {
    assert.doesNotMatch(publicCopy, /is open to/i);
  });
});

describe("defensive formatting — no dangling separators or stranded labels", () => {
  test("hero headline drops empty parts instead of joining them", () => {
    assert.equal(heroHeadline(viewOf({ sport: "Football", position: "" })), "Football");
    assert.equal(heroHeadline(viewOf({ sport: "", position: "WR" })), "WR");
    assert.equal(heroHeadline(viewOf({ sport: "", position: "" })), "");
  });

  test("hero meta never emits a stranded 'Class of'", () => {
    assert.equal(heroMeta(viewOf({ classYear: "", city: "Austin", state: "TX" })), "Austin, TX");
    assert.equal(heroMeta(viewOf({ classYear: "2027", city: "", state: "" })), "Class of 2027");
    assert.equal(heroMeta(viewOf({ classYear: "", city: "", state: "" })), "");
    assert.doesNotMatch(heroMeta(viewOf({ classYear: "", city: "Austin", state: "TX" })), /Class of/);
  });

  test("recruiting facts drop empty parts", () => {
    assert.equal(recruitingFacts(viewOf({ position: "WR", classYear: "" })), "WR");
    assert.equal(recruitingFacts(viewOf()), "");
    assert.doesNotMatch(recruitingFacts(viewOf({ position: "WR" })), /·/);
  });
});

describe("highlights", () => {
  const withUrls = [
    { label: "Reel", url: "https://youtube.com/watch?v=abc" },
    { label: "Empty slot", url: "" },
    { label: "Film", url: "https://hudl.com/x" },
  ];

  test("a real profile drops entries with no usable URL", () => {
    const visible = usableHighlights(withUrls);
    assert.equal(visible.length, 2);
    assert.deepEqual(
      visible.map((h) => h.label),
      ["Reel", "Film"]
    );
  });

  test("whitespace-only URLs count as unusable", () => {
    assert.equal(usableHighlights([{ label: "Blank", url: "   " }]).length, 0);
  });

  test("the labelled fictional example keeps its empty demo slots", () => {
    assert.equal(usableHighlights(withUrls, { example: true }).length, 3);
  });

  test("an all-empty real profile yields nothing to render", () => {
    assert.equal(usableHighlights([{ label: "A", url: "" }, { label: "B", url: "" }]).length, 0);
  });
});
