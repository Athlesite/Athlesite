/**
 * The edit form's save/refresh transaction lock, as a small explicit state
 * machine rather than a single boolean.
 *
 * A single `saving` boolean cannot distinguish "the write is in flight" from
 * "the write committed but this component's own baseline (currentMedia,
 * signed URLs) is still pre-save, waiting for router.refresh() to deliver a
 * fresh record" — and `router.refresh()` itself returns void, so there is no
 * promise to await for that second phase. Collapsing both into one boolean
 * either re-enables Save too early (a second save could submit an
 * already-superseded path as "current", orphaning what the first save just
 * committed) or never distinguishes the two for the athlete, who sees
 * "Saving…" long after the write actually finished.
 *
 * Kept as a pure, dependency-free module (like profile-save-decisions.ts and
 * profile-update-decisions.ts) so the transition rules — including "a second
 * save is impossible until the fresh record arrives" — are testable directly
 * (see save-state.test.ts), without a component-test framework this project
 * does not have.
 */
export type EditProfileSaveState = "idle" | "saving" | "awaiting-refresh";

/** Whether Save and the media controls may currently be interacted with. */
export function isEditable(state: EditProfileSaveState): boolean {
  return state === "idle";
}

/** The state to enter the moment a save attempt begins. */
export function afterSaveStarted(): EditProfileSaveState {
  return "saving";
}

/**
 * The state to enter once updateProfile's promise resolves.
 *
 * A failure always returns to "idle" immediately — nothing committed, so
 * there is no fresher server state to wait for. A success that touched no
 * media also returns to "idle" immediately, for the same reason: this
 * component's own baseline was never stale to begin with. A success that
 * touched media moves to "awaiting-refresh": the DB commit is real, but
 * `currentMedia`/the signed URLs this component holds are still the
 * pre-save baseline until router.refresh() delivers a fresh record.
 */
export function afterSaveSettled(outcome: { ok: true; mediaTouched: boolean } | { ok: false }): EditProfileSaveState {
  if (!outcome.ok) return "idle";
  return outcome.mediaTouched ? "awaiting-refresh" : "idle";
}

/**
 * The state once the server-confirmed refreshed record actually arrives
 * (see EditProfileForm's record.updatedAt-keyed effect). This is the only
 * path back to "idle" from "awaiting-refresh" — nothing else may re-enable
 * Save or the media controls while a media-touching save's fresh baseline
 * is still in transit.
 */
export function afterFreshRecordArrived(): EditProfileSaveState {
  return "idle";
}

/** What the Save button should say, so "still completing" never looks frozen. */
export function saveButtonLabel(state: EditProfileSaveState): string {
  if (state === "saving") return "Saving…";
  if (state === "awaiting-refresh") return "Finishing up…";
  return "Save changes";
}
