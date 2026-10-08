import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveAgeEligibility,
  mayContinueOnboarding,
  isBlockedFromOnboarding,
  MINIMUM_PILOT_AGE,
  ADULT_AGE,
  type AgeEligibility,
} from "@/lib/age-eligibility";
import {
  AGE_GATE_MINOR_BODY,
  AGE_GATE_MINOR_HEADING,
  AGE_GATE_UNDER_13_BODY,
  AGE_GATE_UNDER_13_HEADING,
  AGE_GATE_EXPLANATION,
} from "@/lib/age-gate-copy";

/**
 * Age-gate behaviour.
 *
 * Boundary arithmetic is tested against an injected `today` rather than the real clock,
 * so "the day before a 13th birthday" is a fact rather than something that passes only
 * on certain days of the year.
 *
 * The UI assertions are **structural** — this project's `node:test` runner cannot
 * import TSX, so "the blocked screen has no way back into onboarding" is checked by
 * reading the source for onward controls rather than by rendering. Said plainly rather
 * than mocked: a rendered assertion here would be asserting a mock of React, not the
 * product. The repo already uses source-level checks for the same reason
 * (`check:columns`, `check:slugs`, and the storage guards in onboarding-storage.test.ts).
 */

const SRC = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

/** Source with comments stripped, so prose describing a rule is not mistaken for it. */
const readCode = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const on = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const dob = (y: number, m: number, d: number) => ({
  year: String(y),
  month: String(m),
  day: String(d),
});

describe("resolveAgeEligibility — threshold boundaries", () => {
  test("exactly 13 today → minor", () => {
    assert.equal(resolveAgeEligibility(dob(2013, 6, 15), on(2026, 6, 15)), "minor");
  });

  test("one day before the 13th birthday → under_13", () => {
    assert.equal(resolveAgeEligibility(dob(2013, 6, 15), on(2026, 6, 14)), "under_13");
  });

  test("exactly 18 today → adult", () => {
    assert.equal(resolveAgeEligibility(dob(2008, 6, 15), on(2026, 6, 15)), "adult");
  });

  test("one day before the 18th birthday → minor", () => {
    assert.equal(resolveAgeEligibility(dob(2008, 6, 15), on(2026, 6, 14)), "minor");
  });

  test("well under, well between, and well over", () => {
    assert.equal(resolveAgeEligibility(dob(2020, 1, 1), on(2026, 6, 15)), "under_13");
    assert.equal(resolveAgeEligibility(dob(2011, 1, 1), on(2026, 6, 15)), "minor");
    assert.equal(resolveAgeEligibility(dob(1990, 1, 1), on(2026, 6, 15)), "adult");
  });
});

describe("resolveAgeEligibility — within the current month", () => {
  test("birthday earlier this month has already happened", () => {
    // Born 2008-06-10, today 2026-06-20 → turned 18 ten days ago.
    assert.equal(resolveAgeEligibility(dob(2008, 6, 10), on(2026, 6, 20)), "adult");
  });

  test("birthday later this month has not happened yet", () => {
    // Born 2008-06-25, today 2026-06-20 → still 17.
    assert.equal(resolveAgeEligibility(dob(2008, 6, 25), on(2026, 6, 20)), "minor");
  });

  test("birthday later this year has not happened yet", () => {
    assert.equal(resolveAgeEligibility(dob(2008, 12, 1), on(2026, 6, 20)), "minor");
  });
});

describe("resolveAgeEligibility — leap-day birthdays", () => {
  // Convention: a 29 February birthday falls on 1 March in non-leap years, which is
  // the conservative direction — it never ages someone up early.
  test("28 Feb in a non-leap year: not yet 13", () => {
    assert.equal(resolveAgeEligibility(dob(2012, 2, 29), on(2025, 2, 28)), "under_13");
  });

  test("1 March in a non-leap year: now 13", () => {
    assert.equal(resolveAgeEligibility(dob(2012, 2, 29), on(2025, 3, 1)), "minor");
  });

  test("29 Feb in a leap year: 13 that day", () => {
    assert.equal(resolveAgeEligibility(dob(2012, 2, 29), on(2028, 2, 29)), "minor");
  });

  test("the same convention at the adult threshold", () => {
    assert.equal(resolveAgeEligibility(dob(2008, 2, 29), on(2026, 2, 28)), "minor");
    assert.equal(resolveAgeEligibility(dob(2008, 2, 29), on(2026, 3, 1)), "adult");
  });
});

describe("resolveAgeEligibility — fails closed, and never resolves adult", () => {
  const today = on(2026, 6, 15);

  test("incomplete input is indeterminate", () => {
    assert.equal(resolveAgeEligibility({ year: "", month: "", day: "" }, today), null);
    assert.equal(resolveAgeEligibility({ year: "1990", month: "", day: "" }, today), null);
    assert.equal(resolveAgeEligibility({ year: "1990", month: "6", day: "" }, today), null);
  });

  test("impossible calendar dates are rejected, not silently shifted", () => {
    // `new Date(2025, 1, 30)` would roll over to 2 March without the round-trip check.
    assert.equal(resolveAgeEligibility(dob(2025, 2, 30), today), null);
    assert.equal(resolveAgeEligibility(dob(2025, 2, 29), today), null); // 2025 is not a leap year
    assert.equal(resolveAgeEligibility(dob(1990, 13, 1), today), null);
    assert.equal(resolveAgeEligibility(dob(1990, 6, 31), today), null); // June has 30 days
  });

  test("non-numeric and malformed input is indeterminate", () => {
    assert.equal(resolveAgeEligibility({ year: "abc", month: "6", day: "15" }, today), null);
    assert.equal(resolveAgeEligibility({ year: "1990.5", month: "6", day: "15" }, today), null);
    assert.equal(resolveAgeEligibility({ year: "-1990", month: "6", day: "15" }, today), null);
  });

  test("a future date of birth is indeterminate, not adult", () => {
    assert.equal(resolveAgeEligibility(dob(2030, 1, 1), today), null);
  });

  test("NO malformed input anywhere resolves as adult", () => {
    // The single most important property in this file: every rejection path must be
    // incapable of producing the one outcome that lets an athlete through.
    const malformed = [
      { year: "", month: "", day: "" },
      { year: "abc", month: "def", day: "ghi" },
      { year: "0", month: "0", day: "0" },
      { year: "1990", month: "13", day: "1" },
      { year: "2025", month: "2", day: "30" },
      { year: "3000", month: "1", day: "1" },
      { year: "1990.5", month: "6", day: "15" },
      { year: " ", month: " ", day: " " },
    ];
    for (const parts of malformed) {
      const result = resolveAgeEligibility(parts, today);
      assert.notEqual(result, "adult", `${JSON.stringify(parts)} must not resolve as adult`);
      assert.equal(mayContinueOnboarding(result), false);
    }
  });
});

describe("gate decisions", () => {
  test("only an adult may continue", () => {
    assert.equal(mayContinueOnboarding("adult"), true);
    assert.equal(mayContinueOnboarding("minor"), false);
    assert.equal(mayContinueOnboarding("under_13"), false);
    assert.equal(mayContinueOnboarding(null), false);
  });

  test("both blocked brackets are blocked; indeterminate is not", () => {
    assert.equal(isBlockedFromOnboarding("under_13"), true);
    assert.equal(isBlockedFromOnboarding("minor"), true);
    assert.equal(isBlockedFromOnboarding("adult"), false);
    // null means "could not decide" — the athlete stays on the gate rather than being
    // shown a blocked screen they did not earn.
    assert.equal(isBlockedFromOnboarding(null), false);
  });

  test("the two thresholds are the documented constants", () => {
    assert.equal(MINIMUM_PILOT_AGE, 13);
    assert.equal(ADULT_AGE, 18);
  });

  test("every bracket is handled by exactly one of continue/blocked", () => {
    const all: AgeEligibility[] = ["under_13", "minor", "adult"];
    for (const bracket of all) {
      assert.notEqual(
        mayContinueOnboarding(bracket),
        isBlockedFromOnboarding(bracket),
        `${bracket} must be exactly one of continue or blocked`
      );
    }
  });
});

describe("the two blocked messages are distinct and appropriate", () => {
  test("under-13 and minor copy differ", () => {
    assert.notEqual(AGE_GATE_UNDER_13_HEADING, AGE_GATE_MINOR_HEADING);
    assert.notEqual(AGE_GATE_UNDER_13_BODY, AGE_GATE_MINOR_BODY);
  });

  test("under-13 copy states the exclusion without offering a workaround", () => {
    const text = `${AGE_GATE_UNDER_13_HEADING} ${AGE_GATE_UNDER_13_BODY}`.toLowerCase();
    assert.match(text, /under 13/);
    // No guardian hint: a guardian cannot change this outcome today, so mentioning one
    // would be a false lead.
    assert.equal(text.includes("guardian"), false);
    assert.equal(text.includes("parent"), false);
  });

  test("minor copy states a temporary state and names what is being built", () => {
    const text = `${AGE_GATE_MINOR_HEADING} ${AGE_GATE_MINOR_BODY}`.toLowerCase();
    assert.match(text, /under 18/);
    assert.match(text, /yet/);
    assert.match(text, /guardian approval/);
  });

  test("neither message invites a second attempt at the date", () => {
    const all = [
      AGE_GATE_UNDER_13_HEADING,
      AGE_GATE_UNDER_13_BODY,
      AGE_GATE_MINOR_HEADING,
      AGE_GATE_MINOR_BODY,
    ]
      .join(" ")
      .toLowerCase();
    for (const nudge of ["try again", "check your date", "re-enter", "different date", "edit"]) {
      assert.equal(all.includes(nudge), false, `blocked copy must not say "${nudge}"`);
    }
  });

  test("no legal or compliance vocabulary is exposed to the athlete", () => {
    const all = [
      AGE_GATE_UNDER_13_HEADING,
      AGE_GATE_UNDER_13_BODY,
      AGE_GATE_MINOR_HEADING,
      AGE_GATE_MINOR_BODY,
      AGE_GATE_EXPLANATION,
    ]
      .join(" ")
      .toLowerCase();
    for (const jargon of ["coppa", "consent", "verification", "compliance", "statute", "legal"]) {
      assert.equal(all.includes(jargon), false, `athlete-facing copy must not say "${jargon}"`);
    }
  });
});

describe("structural guarantees (source-level — the runner cannot import TSX)", () => {
  test("class_year is never consulted by eligibility", () => {
    const src = readCode("lib/age-eligibility.ts");
    assert.equal(src.includes("class_year"), false);
    assert.equal(src.includes("classYear"), false);
  });

  test("the age gate introduces no browser-persistence path", () => {
    for (const rel of [
      "lib/age-eligibility.ts",
      "lib/age-gate-copy.ts",
      "components/onboarding/steps/AgeGateStep.tsx",
      "components/onboarding/steps/AgeBlocked.tsx",
    ]) {
      const src = readCode(rel);
      for (const banned of ["localStorage", "sessionStorage", "indexedDB", "document.cookie"]) {
        assert.equal(src.includes(banned), false, `${rel} must not use ${banned}`);
      }
    }
  });

  test("the date of birth is never reported upward out of the gate", () => {
    // The step hands back only a resolved bracket, so no caller can persist the date
    // even by accident.
    const src = readCode("components/onboarding/steps/AgeGateStep.tsx");
    assert.match(src, /onResolved\(eligibility\)/);
    assert.equal(/onResolved\(\s*\{/.test(src), false, "must not pass the date parts upward");
  });

  test("the blocked screen offers no onward action back into onboarding", () => {
    const src = readCode("components/onboarding/steps/AgeBlocked.tsx");
    // No wizard navigation of any kind.
    for (const banned of ["onNext", "goNext", "onBack", "goBack", "setStepIndex"]) {
      assert.equal(src.includes(banned), false, `AgeBlocked must not reference ${banned}`);
    }
    // The only link is home.
    assert.match(src, /href="\/"/);
  });

  test("blocked state is terminal — the wizard returns it instead of the step switch", () => {
    const src = readCode("components/onboarding/OnboardingWizard.tsx");
    assert.match(src, /if \(isBlockedFromOnboarding\(ageEligibility\)\) \{\s*return <AgeBlocked/);
  });

  test("only an adult advances past the gate", () => {
    const src = readCode("components/onboarding/OnboardingWizard.tsx");
    assert.match(src, /if \(mayContinueOnboarding\(eligibility\)\) goNext\(\);/);
  });

  test("neither the bracket nor the date is persisted by the wizard", () => {
    const src = readCode("components/onboarding/OnboardingWizard.tsx");
    assert.equal(src.includes("ageEligibility: "), false, "must not go into a saved payload");
    assert.equal(/setItem\(/.test(src), false);
  });
});

describe("step order after inserting Age", () => {
  const wizard = readCode("components/onboarding/OnboardingWizard.tsx");

  test("Age sits between Welcome and Athlete Info", () => {
    const labels = wizard.match(/const STEP_LABELS = \[([\s\S]*?)\];/);
    assert.ok(labels, "STEP_LABELS not found");
    const order = Array.from(labels[1].matchAll(/"([^"]+)"/g)).map((m) => m[1]);
    assert.deepEqual(order, [
      "Welcome",
      "Age",
      "Athlete Info",
      "Media",
      "Recruiting",
      "Brand & Links",
      "Preview",
    ]);
    assert.equal(order.indexOf("Age"), 1);
    // The gate must precede every step that collects a profile field.
    assert.ok(order.indexOf("Age") < order.indexOf("Athlete Info"));
  });

  test("Athlete Info still resolves correctly for the slug-collision jump", () => {
    // ATHLETE_INFO_STEP is derived via indexOf, so it self-adjusts — this pins that it
    // still points at the right step rather than a stale literal.
    assert.match(wizard, /STEP_LABELS\.indexOf\("Athlete Info"\)/);
  });

  test("every label has a matching render branch", () => {
    const rendered = new Set(
      Array.from(wizard.matchAll(/stepIndex === (\d+)/g)).map((m) => Number(m[1]))
    );
    for (let i = 0; i < 7; i += 1) {
      assert.ok(rendered.has(i), `no render branch for step ${i}`);
    }
  });
});
