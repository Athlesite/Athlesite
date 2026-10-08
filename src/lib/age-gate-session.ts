/**
 * Document-lifetime memory of an age-gate block.
 *
 * **Why this exists.** `AgeBlocked` links home with Next's client router, and Home →
 * "Create Your Athlesite" mounts a *fresh* `OnboardingWizard` without a document
 * reload. React state dies with the old component, so a blocked athlete could answer
 * again immediately. This module holds the block somewhere that survives a remount but
 * not a reload.
 *
 * **Why a module-level variable.** Next's client router keeps the JavaScript module
 * registry alive across client-side navigations within one loaded document, so this
 * binding persists exactly as long as the document does. A hard reload, a new tab, or a
 * different browser gets a fresh module instance and therefore a fresh gate — which is
 * the approved behaviour, not a loophole being tolerated.
 *
 * **Why not storage.** `localStorage`, `sessionStorage`, IndexedDB, cookies and a server
 * record are all deliberately excluded. Persisting a "blocked" marker would mean storing
 * data about a child Athlesite has just declined to serve, which contradicts the merged
 * pre-auth privacy fix. Memory-only is the whole point.
 *
 * **Server-side safety.** Nothing here is ever written during a server render: the only
 * caller is a client event handler. A server module instance therefore stays `null`
 * across requests, so this can never leak one visitor's state into another's. Reads
 * during SSR return `null`, matching the client's first render of a freshly loaded
 * document, so there is no hydration mismatch.
 */

import type { AgeEligibility } from "@/lib/age-eligibility";

/** The two brackets that block onboarding. `adult` is never remembered. */
type BlockedBracket = Exclude<AgeEligibility, "adult">;

let blockedBracket: BlockedBracket | null = null;

/**
 * Records that this document's onboarding is blocked.
 *
 * Called only from a client event handler, never during render.
 */
export function rememberAgeBlock(bracket: BlockedBracket): void {
  blockedBracket = bracket;
}

/**
 * The remembered block for this document, or `null` if there is none.
 *
 * A newly mounted wizard reads this so a client-side navigation away and back stays
 * blocked.
 */
export function rememberedAgeBlock(): BlockedBracket | null {
  return blockedBracket;
}

/**
 * Clears the remembered block.
 *
 * A real full document reload does this for free by discarding the module instance —
 * this function exists so that behaviour is directly assertable, by letting a test
 * stand in for "a new document" without spawning a browser.
 */
export function resetAgeBlockForNewDocument(): void {
  blockedBracket = null;
}
