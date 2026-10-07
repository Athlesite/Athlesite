/**
 * Onboarding's relationship with browser storage: there isn't one any more.
 *
 * **Pre-authentication onboarding state is memory-only.** The wizard holds the
 * in-progress profile in React state and nothing else. A refresh or a closed tab
 * therefore loses unsaved pre-auth progress, which is a deliberate trade.
 *
 * **Why the previous draft cache was removed.** It wrote the whole
 * `AthleteProfileData` — real name, school, city, biography — to `localStorage` on
 * every keystroke, *before an account existed*, and nothing in the product ever
 * removed it. On a shared device (a school Chromebook is the realistic case) the
 * next person could land on `/get-started` and have a previous athlete's draft
 * restored into the form. Because most pilot athletes are expected to be minors,
 * that was recorded as a pilot blocker rather than a convenience feature.
 *
 * **What replaces it: nothing.** No `sessionStorage`, no IndexedDB, no cookie, no
 * URL/query parameter. Substituting another browser store would move the same
 * personal data to a different shelf. Once the athlete authenticates, durable data
 * goes through the existing database save path (`profile-save.ts`) — there is no
 * second browser persistence layer.
 *
 * This module survives only to own the *removal* of what earlier builds left behind.
 */

/** Current draft keys. Written by no code path; removed on onboarding entry. */
const DRAFT_KEY = "athlesite:onboarding:draft";
const DRAFT_STEP_KEY = "athlesite:onboarding:step";

/**
 * Pre-Supabase profile store, one key per slug (`athlesite:athlete:<slug>`),
 * holding a complete profile. The functions that wrote it were deleted when
 * profiles moved to the database, but the keys were never cleaned up — so a
 * browser used before that migration can still be holding full profiles.
 */
const LEGACY_PROFILE_KEY_PREFIX = "athlesite:athlete:";

/**
 * The minimal slice of `Storage` this needs — real enough to assert on in a test,
 * without a DOM. Mirrors the injectable pattern in `sign-out.ts`.
 */
type PurgeableStore = Pick<Storage, "length" | "key" | "getItem" | "removeItem">;

function defaultStore(): PurgeableStore | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Accessing localStorage itself can throw (blocked cookies, some private modes).
    return null;
  }
}

/**
 * Removes every Athlesite-owned onboarding key this project has ever written, so
 * stale personal data cannot be restored into the form or left sitting on a shared
 * device. Returns the keys actually removed, which is what makes the behaviour
 * directly assertable.
 *
 * **Scoped deliberately.** Only the two draft keys and the
 * `athlesite:athlete:` prefix are touched. `localStorage` is shared across
 * everything on the origin, so clearing it wholesale — or removing every
 * `athlesite:`-prefixed key — could destroy state this module does not own and did
 * not write.
 *
 * Safe to call repeatedly, during SSR, and when storage is unavailable.
 */
export function purgeOnboardingBrowserStorage(
  store: PurgeableStore | null = defaultStore()
): string[] {
  if (!store) return [];

  const removed: string[] = [];
  try {
    // Collect before removing: `removeItem` reindexes the store, so deleting
    // during an index walk silently skips entries.
    const doomed: string[] = [];

    for (const key of [DRAFT_KEY, DRAFT_STEP_KEY]) {
      if (store.getItem(key) !== null) doomed.push(key);
    }

    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key !== null && key.startsWith(LEGACY_PROFILE_KEY_PREFIX)) doomed.push(key);
    }

    for (const key of doomed) {
      store.removeItem(key);
      removed.push(key);
    }
  } catch {
    // A storage failure must never break onboarding. Report what was removed
    // before the failure rather than claiming success for the whole purge.
  }

  return removed;
}

/** Exported for tests and for anything auditing which keys this project claims. */
export const ONBOARDING_STORAGE_KEYS = {
  draft: DRAFT_KEY,
  draftStep: DRAFT_STEP_KEY,
  legacyProfilePrefix: LEGACY_PROFILE_KEY_PREFIX,
} as const;
