import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  GUARDIAN_COPY_VERSION,
  GUARDIAN_REQUEST_TERMS_VERSION,
  GUARDIAN_REQUEST_PRIVACY_VERSION,
  resolveGuardianCopy,
  isKnownGuardianTermsVersion,
  isKnownGuardianPrivacyVersion,
  isFullyKnownGuardianRequest,
} from "@/lib/guardian/guardian-copy";

describe("guardian copy registry — fail closed on unknown versions", () => {
  test("the current pinned version resolves and is marked pilot/non-final", () => {
    const entry = resolveGuardianCopy(GUARDIAN_COPY_VERSION);
    assert.ok(entry);
    assert.equal(entry?.isPilotNonFinal, true);
    assert.equal(typeof entry?.approvalBody, "string");
    assert.ok((entry?.approvalBody.length ?? 0) > 0);
  });

  test("an unknown version resolves to null — never substituted with the current one", () => {
    assert.equal(resolveGuardianCopy("1999-01-01-made-up"), null);
  });

  test("null/undefined/empty-string versions all resolve to null", () => {
    assert.equal(resolveGuardianCopy(null), null);
    assert.equal(resolveGuardianCopy(undefined), null);
    assert.equal(resolveGuardianCopy(""), null);
  });

  test("known terms/privacy versions are recognized", () => {
    assert.equal(isKnownGuardianTermsVersion(GUARDIAN_REQUEST_TERMS_VERSION), true);
    assert.equal(isKnownGuardianPrivacyVersion(GUARDIAN_REQUEST_PRIVACY_VERSION), true);
  });

  test("unknown terms/privacy versions are rejected", () => {
    assert.equal(isKnownGuardianTermsVersion("not-a-real-version"), false);
    assert.equal(isKnownGuardianPrivacyVersion("not-a-real-version"), false);
    assert.equal(isKnownGuardianTermsVersion(null), false);
    assert.equal(isKnownGuardianPrivacyVersion(undefined), false);
  });

  describe("isFullyKnownGuardianRequest — the one gate the page calls", () => {
    const valid = {
      guardianCopyVersion: GUARDIAN_COPY_VERSION,
      requestTermsVersion: GUARDIAN_REQUEST_TERMS_VERSION,
      requestPrivacyVersion: GUARDIAN_REQUEST_PRIVACY_VERSION,
    };

    test("all three known -> true", () => {
      assert.equal(isFullyKnownGuardianRequest(valid), true);
    });

    test("any single unknown field fails the whole gate closed", () => {
      assert.equal(
        isFullyKnownGuardianRequest({ ...valid, guardianCopyVersion: "unknown" }),
        false
      );
      assert.equal(
        isFullyKnownGuardianRequest({ ...valid, requestTermsVersion: "unknown" }),
        false
      );
      assert.equal(
        isFullyKnownGuardianRequest({ ...valid, requestPrivacyVersion: "unknown" }),
        false
      );
    });

    test("all three null (defensive against a malformed row) fails closed", () => {
      assert.equal(
        isFullyKnownGuardianRequest({
          guardianCopyVersion: null,
          requestTermsVersion: null,
          requestPrivacyVersion: null,
        }),
        false
      );
    });
  });
});
