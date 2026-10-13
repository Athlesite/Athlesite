/**
 * Fragment capture and cleanup — pure, injectable, no real DOM required.
 *
 * Required flow (founder decision): capture the fragment, then immediately
 * strip it from the address bar via `history.replaceState` — BEFORE any
 * network request — preserving pathname and search. The token must never
 * reach `localStorage`, `sessionStorage`, a cookie, or a query string; this
 * module never writes to any of those, and never reads `location.search` for
 * a token either.
 *
 * Takes `location`/`history`-like ports rather than `window` directly so this
 * is testable with plain objects (mirrors the ports pattern already used by
 * the account-deletion orchestrator) and so a real browser's `window.location`
 * / `window.history` can be passed in unchanged from the one call site.
 */

export type GuardianLocationLike = {
  hash: string;
  pathname: string;
  search: string;
};

export type GuardianHistoryLike = {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
  /**
   * The browser's current history-state object for this entry. Read, never
   * written, by this module — see `captureAndClearFragment`'s own comment
   * for why it must be passed through unchanged rather than replaced with
   * `null`.
   */
  state: unknown;
};

/**
 * Captures the raw fragment (without its leading `#`) and clears it from the
 * address bar in the same call, before returning. Pathname and search are
 * preserved exactly; only the hash is removed.
 *
 * Passes `history.state` BACK into `replaceState` UNCHANGED, rather than
 * `null`. `history.replaceState(data, ...)` sets the CURRENT entry's state to
 * exactly `data` — passing `null` would discard whatever Next's own router
 * (or any other code on the page) had already stored there for this entry,
 * which is real, functioning navigation state belonging to code that has
 * nothing to do with this fragment. This function's only job is removing the
 * fragment; it has no basis for forming an opinion about anyone else's
 * history state, so it leaves it exactly as found.
 *
 * Idempotent in the sense that matters for React Strict Mode's effect replay:
 * calling this a second time after the first call already cleared the hash
 * simply returns the empty string and performs an equivalent no-op
 * `replaceState` to the same URL (and the same, by-then-already-preserved
 * state). The CALLER is responsible for not treating that second, empty
 * capture as "no token was ever present" — see
 * `GuardianParticipationClient`'s one-shot ref guard, which calls this
 * exactly once per mount and ignores any Strict-Mode re-invocation entirely
 * rather than relying on this function's own idempotence to paper over it.
 */
export function captureAndClearFragment(
  location: GuardianLocationLike,
  history: GuardianHistoryLike
): string {
  const raw = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;

  history.replaceState(history.state, "", location.pathname + location.search);

  return raw;
}
