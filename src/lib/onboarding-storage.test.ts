import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  purgeOnboardingBrowserStorage,
  ONBOARDING_STORAGE_KEYS,
} from "@/lib/onboarding-storage";

/**
 * Pre-auth onboarding state is memory-only, and the keys earlier builds wrote are
 * removed on onboarding entry.
 *
 * Two kinds of assertion live here, and the distinction matters:
 *
 * 1. **Behavioural** — `purgeOnboardingBrowserStorage` is driven against a fake
 *    `Storage`, injected the way `sign-out.ts` injects `location`. No DOM needed.
 * 2. **Structural** — "nothing writes personal data to browser storage" is a
 *    property of which call sites exist, not of a function's return value. Mocking
 *    React to prove a keystroke writes nothing would assert the mock, not the
 *    product, so these are source-level checks instead. The repo already uses
 *    source/SQL parity checks for the same reason (`check:columns`,
 *    `check:slugs`).
 */

const SRC = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

/**
 * Source with comments stripped.
 *
 * The storage-mechanism guard below has to read *code*, not prose: this module's
 * own docblock names `sessionStorage` and IndexedDB precisely to say it does not
 * use them, and a naive substring check flags that documentation as a violation.
 * (It did, on first run.)
 */
const readCode = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Minimal in-memory `Storage` stand-in: real enough to reindex on delete. */
function fakeStore(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    key(i: number) {
      return Array.from(map.keys())[i] ?? null;
    },
    getItem(k: string) {
      return map.has(k) ? (map.get(k) as string) : null;
    },
    removeItem(k: string) {
      map.delete(k);
    },
    snapshot() {
      return Object.fromEntries(map);
    },
  };
}

describe("purgeOnboardingBrowserStorage — removes Athlesite onboarding keys", () => {
  test("removes both current draft keys", () => {
    const store = fakeStore({
      [ONBOARDING_STORAGE_KEYS.draft]: '{"firstName":"Jordan","city":"Austin"}',
      [ONBOARDING_STORAGE_KEYS.draftStep]: "4",
    });
    const removed = purgeOnboardingBrowserStorage(store);
    assert.deepEqual(removed.sort(), [
      ONBOARDING_STORAGE_KEYS.draft,
      ONBOARDING_STORAGE_KEYS.draftStep,
    ].sort());
    assert.deepEqual(store.snapshot(), {});
  });

  test("removes every legacy per-slug profile key, not just the first", () => {
    const prefix = ONBOARDING_STORAGE_KEYS.legacyProfilePrefix;
    const store = fakeStore({
      [`${prefix}jordan-bell`]: '{"firstName":"Jordan"}',
      [`${prefix}alex-stone`]: '{"firstName":"Alex"}',
      [`${prefix}sam-reed`]: '{"firstName":"Sam"}',
    });
    const removed = purgeOnboardingBrowserStorage(store);
    assert.equal(removed.length, 3);
    assert.deepEqual(store.snapshot(), {});
  });

  test("removes draft and legacy keys together in one pass", () => {
    const prefix = ONBOARDING_STORAGE_KEYS.legacyProfilePrefix;
    const store = fakeStore({
      [ONBOARDING_STORAGE_KEYS.draft]: "{}",
      [ONBOARDING_STORAGE_KEYS.draftStep]: "2",
      [`${prefix}jordan-bell`]: "{}",
    });
    assert.equal(purgeOnboardingBrowserStorage(store).length, 3);
    assert.deepEqual(store.snapshot(), {});
  });
});

describe("purgeOnboardingBrowserStorage — leaves everything else alone", () => {
  test("preserves unrelated third-party keys", () => {
    const store = fakeStore({
      [ONBOARDING_STORAGE_KEYS.draft]: "{}",
      "theme-preference": "dark",
      "sb-auth-token": "session-value",
      "some-other-app:state": "keep me",
    });
    purgeOnboardingBrowserStorage(store);
    assert.deepEqual(store.snapshot(), {
      "theme-preference": "dark",
      "sb-auth-token": "session-value",
      "some-other-app:state": "keep me",
    });
  });

  test("preserves athlesite-prefixed keys this module does not own", () => {
    // Deliberately narrow: clearing everything under `athlesite:` would destroy
    // state written by code this module knows nothing about.
    const store = fakeStore({
      "athlesite:some-future-feature": "keep me",
      "athlesite:onboarding:draft": "{}",
    });
    purgeOnboardingBrowserStorage(store);
    assert.deepEqual(store.snapshot(), { "athlesite:some-future-feature": "keep me" });
  });

  test("no-op on an empty store, and reports nothing removed", () => {
    const store = fakeStore();
    assert.deepEqual(purgeOnboardingBrowserStorage(store), []);
  });

  test("idempotent — a second purge removes nothing and throws nothing", () => {
    const store = fakeStore({ [ONBOARDING_STORAGE_KEYS.draft]: "{}" });
    assert.equal(purgeOnboardingBrowserStorage(store).length, 1);
    assert.deepEqual(purgeOnboardingBrowserStorage(store), []);
  });
});

describe("purgeOnboardingBrowserStorage — degrades safely", () => {
  test("returns [] when there is no store (SSR, or storage access blocked)", () => {
    assert.deepEqual(purgeOnboardingBrowserStorage(null), []);
  });

  test("a throwing store never propagates, and reports only what it removed", () => {
    const store = {
      length: 1,
      key: () => {
        throw new Error("SecurityError: storage blocked");
      },
      getItem: () => null,
      removeItem: () => {},
    };
    assert.deepEqual(purgeOnboardingBrowserStorage(store), []);
  });
});

describe("onboarding never writes personal data to browser storage (structural)", () => {
  test("the storage module exposes no write/save API", () => {
    const src = readCode("lib/onboarding-storage.ts");
    for (const banned of ["setItem", "saveDraft", "loadDraft", "saveDraftStep", "loadDraftStep"]) {
      assert.equal(
        new RegExp(`\\b${banned}\\b`).test(src),
        false,
        `onboarding-storage.ts must not reference ${banned}`
      );
    }
  });

  test("the wizard imports only the purge, never a load or save", () => {
    const src = readCode("components/onboarding/OnboardingWizard.tsx");
    assert.match(src, /purgeOnboardingBrowserStorage\(\)/);
    for (const banned of ["loadDraft", "saveDraft", "loadDraftStep", "saveDraftStep"]) {
      assert.equal(new RegExp(`\\b${banned}\\b`).test(src), false, `wizard must not call ${banned}`);
    }
  });

  test("no source file writes to localStorage, sessionStorage, or IndexedDB", () => {
    // Guards the whole stated direction: the fix is "no browser persistence",
    // not "a different browser store". A future reviewer adding sessionStorage
    // as a convenience trips this.
    const files = [
      "lib/onboarding-storage.ts",
      "components/onboarding/OnboardingWizard.tsx",
      "components/onboarding/steps/PreviewStep.tsx",
      "components/onboarding/steps/AthleteInfoStep.tsx",
      "components/onboarding/steps/MediaStep.tsx",
      "components/onboarding/steps/RecruitingStep.tsx",
      "components/onboarding/steps/BrandLinksStep.tsx",
      "components/onboarding/steps/WelcomeStep.tsx",
    ];
    for (const rel of files) {
      const src = readCode(rel);
      for (const banned of ["sessionStorage", "indexedDB", ".setItem("]) {
        assert.equal(src.includes(banned), false, `${rel} must not use ${banned}`);
      }
    }
  });
});
