/**
 * Versioned guardian-facing copy registry.
 *
 * Centralized here for the same reason src/lib/participation.ts centralizes
 * ATTESTATION_VERSION/TERMS_VERSION/PRIVACY_VERSION: one place a version bump
 * happens, one place a test can assert against. These are a SEPARATE
 * namespace from the adult-acceptance bundle versions — a guardian request is
 * pinned at issuance time to `guardian_copy_version`,
 * `request_terms_version`, and `request_privacy_version`
 * (athlete_participation, 20261008000001), never to the adult bundle.
 *
 * ── PILOT / NON-LEGAL-FINAL ─────────────────────────────────────────────
 *
 * This wording has NOT been reviewed by counsel (docs/ai/NOW.md § Blocked on
 * legal review: "Adequacy and terminology of email-based guardian approval
 * for 13-17"). `isPilotNonFinal: true` on every entry is not decoration — it
 * is the explicit acknowledgment that this is placeholder pilot copy, exactly
 * like the existing ATTESTATION_VERSION/TERMS_VERSION/PRIVACY_VERSION
 * placeholders it sits alongside. Do not remove that flag to make this look
 * more final than it is.
 *
 * ── FAIL CLOSED ON UNKNOWN VERSIONS ─────────────────────────────────────
 *
 * `peek_guardian_request` returns whatever `guardian_copy_version`,
 * `request_terms_version`, and `request_privacy_version` were pinned on the
 * row — values this registry does not control and cannot assume are always
 * current. `resolveGuardianCopy` returns `null` for anything not in this
 * registry, and the page treats a `null` resolution as the generic
 * unavailable state (founder decision: "Unknown or unsupported wording
 * versions must fail closed. Do not silently substitute the newest
 * wording.").
 */

export type GuardianCopyEntry = {
  /** The approval screen's body copy, shown before either decision button. */
  approvalBody: string;
  /** Always true today. See the module docblock. */
  isPilotNonFinal: true;
};

/**
 * The one guardian-copy version this checkpoint defines. Phase 2 issues no
 * tokens itself, so nothing in production can reference this yet — it exists
 * so the registry, and the fail-closed behavior around it, are both
 * reviewable and testable now, and so a future issuer (Phase 3) has an
 * existing version to pin new requests to rather than inventing one
 * unreviewed.
 */
export const GUARDIAN_COPY_VERSION = "2026-10-13-pilot";
export const GUARDIAN_REQUEST_TERMS_VERSION = "2026-10-13-pilot";
export const GUARDIAN_REQUEST_PRIVACY_VERSION = "2026-10-13-pilot";

/**
 * A `Map`, deliberately — NOT a plain object/`Record`, even a frozen one.
 *
 * `peek_guardian_request` returns `guardian_copy_version` as an arbitrary
 * string the caller does not control the shape of. A plain object's bracket
 * lookup (`registry[version]`) resolves INHERITED properties too:
 * `registry["toString"]` would return `Object.prototype.toString` (a
 * function — truthy, and not `undefined`), and `registry["constructor"]` or
 * `registry["__proto__"]` resolve similarly, every one of them defeating the
 * `?? null` fallback this module exists to guarantee. `Map.prototype.get`
 * has no prototype chain to leak through — a key that was never explicitly
 * `set` always returns `undefined`, full stop. See guardian-copy.test.ts for
 * explicit cases on exactly `constructor`, `toString`, and `__proto__`.
 */
const GUARDIAN_COPY_REGISTRY: ReadonlyMap<string, GuardianCopyEntry> = new Map([
  [
    GUARDIAN_COPY_VERSION,
    Object.freeze({
      approvalBody:
        "Your approval lets this athlete keep the information they've entered in their " +
        "Athlesite profile. It does not publish anything — their profile stays private " +
        "until a separate approval step, not part of this page, allows publishing.",
      isPilotNonFinal: true as const,
    }),
  ],
]);

const GUARDIAN_TERMS_REGISTRY: ReadonlySet<string> = new Set([GUARDIAN_REQUEST_TERMS_VERSION]);
const GUARDIAN_PRIVACY_REGISTRY: ReadonlySet<string> = new Set([GUARDIAN_REQUEST_PRIVACY_VERSION]);

/**
 * Resolves a guardian-copy version to its display content, or `null` if
 * unrecognized. `Map.get` on a key that was never `set` — including every
 * `Object.prototype` member name (`constructor`, `toString`, `__proto__`,
 * `hasOwnProperty`, …) — returns `undefined`, never an inherited value; see
 * the registry's own comment for why that matters here specifically.
 */
export function resolveGuardianCopy(version: string | null | undefined): GuardianCopyEntry | null {
  if (!version) return null;
  return GUARDIAN_COPY_REGISTRY.get(version) ?? null;
}

/** Whether a pinned Terms version is one this build knows how to represent. */
export function isKnownGuardianTermsVersion(version: string | null | undefined): boolean {
  return Boolean(version) && GUARDIAN_TERMS_REGISTRY.has(version as string);
}

/** Whether a pinned Privacy version is one this build knows how to represent. */
export function isKnownGuardianPrivacyVersion(version: string | null | undefined): boolean {
  return Boolean(version) && GUARDIAN_PRIVACY_REGISTRY.has(version as string);
}

/**
 * The single fail-closed gate the guardian page calls before rendering any
 * approval content: all three pinned versions must resolve to something this
 * build recognizes, or the whole peek result is treated as unavailable.
 */
export function isFullyKnownGuardianRequest(versions: {
  guardianCopyVersion: string | null;
  requestTermsVersion: string | null;
  requestPrivacyVersion: string | null;
}): boolean {
  return (
    resolveGuardianCopy(versions.guardianCopyVersion) !== null &&
    isKnownGuardianTermsVersion(versions.requestTermsVersion) &&
    isKnownGuardianPrivacyVersion(versions.requestPrivacyVersion)
  );
}
