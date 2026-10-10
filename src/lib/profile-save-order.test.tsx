import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { createProfile } from "@/lib/profile-save";
import { createEmptyAthleteProfile } from "@/lib/athlete-profile";
import {
  ATTESTATION_VERSION,
  TERMS_VERSION,
  PRIVACY_VERSION,
} from "@/lib/participation";
import { render, click, type Harness } from "@/test-support/render";
import {
  installFakeSupabase,
  uninstallFakeSupabase,
  setFakeSupabase,
  resolveDeferredInitializer,
  rpcCallLog,
  storageUploadAttempts,
  profileWriteAttempts,
  orderedEventLog,
  type OrderedEvent,
} from "@/test-support/next-stubs/supabase-ssr";
import {
  ADULT_YEAR,
  answerAge,
  clickButton,
  fillAthleteInfo,
  startOnboarding,
} from "@/test-support/onboarding-driver";

/**
 * Save-order observability: proves CAUSAL ordering — that initialization must
 * genuinely RESOLVE, not merely be CALLED, before any participation pre-check,
 * Storage upload, or profile write can occur — rather than comparing the first
 * index of independent logs, which only proves two things both eventually
 * happened and says nothing about which one finished first.
 *
 * Two mutations Codex reproduced against the previous version of this file
 * illustrate exactly why index-comparison on separate logs is insufficient:
 *
 *   1. Calling `initializeAdultParticipation(...)` and starting `createProfile`
 *      WITHOUT truly awaiting the initializer first (fire-and-continue) still
 *      logs the initializer's RPC CALL before createProfile's own first RPC
 *      call — because logging happens at call time, not resolve time. An
 *      index-0 check on call order cannot distinguish "awaited" from "merely
 *      invoked first".
 *   2. Moving a profile INSERT before profile-save.ts's own participation
 *      pre-check: the old assertion searched `supabaseCalls` (which logs only
 *      `rpc:*` and auth calls) for an entry starting with "insert" — no such
 *      entry has EVER existed in that log, for any ordering, so the assertion
 *      was vacuously true regardless of what actually happened.
 *
 * The fix is `orderedEventLog` (src/test-support/next-stubs/supabase-ssr.ts): one
 * shared array that every RPC call, every RPC resolution, every Storage upload,
 * and every profile insert/update pushes into, in real chronological order. A
 * DEFERRED initializer response (`deferInitializerResponse: true` +
 * `resolveDeferredInitializer(...)`) lets a test pause mid-flight and assert
 * that nothing downstream has happened yet — the only way to prove an `await`
 * is real rather than decorative.
 *
 * This also exercises the REAL media-upload pipeline (stripImageMetadata ->
 * createImageBitmap -> canvas re-encode -> uploadPhoto -> Storage) with a real,
 * byte-bearing `File`, via two narrow jsdom polyfills — see
 * installImagePipelinePolyfills below.
 */

let originalCreateImageBitmap: unknown;
let originalGetContext: unknown;
let originalToBlob: unknown;
let originalCreateObjectURL: typeof URL.createObjectURL;
let originalRevokeObjectURL: typeof URL.revokeObjectURL;

beforeEach(() => {
  installFakeSupabase({ user: { id: "owner-1", email: "owner@example.invalid" } });
  originalCreateObjectURL = URL.createObjectURL;
  originalRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = () => "blob:test/fake";
  URL.revokeObjectURL = () => {};
});

afterEach(() => {
  uninstallFakeSupabase();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

/** Installs the two missing jsdom browser APIs the real image pipeline needs. */
function installImagePipelinePolyfills(): () => void {
  originalCreateImageBitmap = (globalThis as Record<string, unknown>).createImageBitmap;
  (globalThis as Record<string, unknown>).createImageBitmap = async () => ({
    width: 32,
    height: 32,
    close() {},
  });
  (window as unknown as Record<string, unknown>).createImageBitmap = (
    globalThis as Record<string, unknown>
  ).createImageBitmap;

  const canvasProto = window.HTMLCanvasElement.prototype as unknown as {
    getContext: unknown;
    toBlob: unknown;
  };
  originalGetContext = canvasProto.getContext;
  originalToBlob = canvasProto.toBlob;

  canvasProto.getContext = () => ({ drawImage: () => {} });
  canvasProto.toBlob = function toBlob(
    this: HTMLCanvasElement,
    callback: (blob: Blob | null) => void,
    type?: string
  ) {
    callback(new window.Blob(["a-real-re-encoded-jpeg-payload"], { type: type ?? "image/jpeg" }));
  };

  return () => {
    (globalThis as Record<string, unknown>).createImageBitmap = originalCreateImageBitmap;
    (window as unknown as Record<string, unknown>).createImageBitmap = originalCreateImageBitmap;
    canvasProto.getContext = originalGetContext;
    canvasProto.toBlob = originalToBlob;
  };
}

/** A real File with real, non-empty, allowed-type content — not a placeholder. */
function realPhotoFile(name: string): File {
  const bytes = new Uint8Array(2048);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 256;
  return new window.File([bytes], name, { type: "image/jpeg" });
}

/** Walks to Media and picks a real photo in the profile-photo slot only. */
async function pickRealProfilePhoto(harness: Harness): Promise<void> {
  const fileInputs = harness.all<HTMLInputElement>("input[type=file]");
  assert.ok(fileInputs.length >= 1, "expected at least one photo slot on Media");
  const file = realPhotoFile("profile.jpg");
  Object.defineProperty(fileInputs[0], "files", { value: [file], configurable: true });
  await harness.interact(() =>
    fileInputs[0].dispatchEvent(new window.Event("change", { bubbles: true }))
  );
}

/** Drives the wizard from the start to Preview, with one real photo picked and accepted. */
async function reachPreviewReadyToSave(harness: Harness): Promise<HTMLButtonElement> {
  await startOnboarding(harness);
  await answerAge(harness, ADULT_YEAR);
  await fillAthleteInfo(harness);
  await clickButton(harness, "Continue"); // Athlete Info -> Media
  await pickRealProfilePhoto(harness);
  for (let i = 0; i < 3; i += 1) await clickButton(harness, "Continue"); // -> Preview

  const checkbox = harness.all<HTMLInputElement>("input[type=checkbox]")[0];
  assert.ok(checkbox, "expected the adult-acceptance checkbox on Preview");
  // checkbox.click() — the native method, not render.tsx's click() helper. Toggling
  // `.checked` is the browser's default action for a checkbox click, which jsdom
  // only runs for a "trusted" click; a dispatched untrusted Event never flips
  // `.checked`, so React's own change-detection would never see it.
  await harness.interact(() => checkbox.click());

  const saveButton = harness
    .all<HTMLButtonElement>("button")
    .find((b) => /save/i.test(b.textContent ?? ""));
  assert.ok(saveButton, "expected the Save button on Preview");
  assert.equal(saveButton.disabled, false, "expected Save to be enabled after accepting");
  return saveButton;
}

/** Yields several real microtask turns, for an async chain with no timers to settle. */
async function flushMicrotasks(turns = 6): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** True if any event of this type exists anywhere in the given slice of the log. */
function hasEvent(events: OrderedEvent[], predicate: (e: OrderedEvent) => boolean): boolean {
  return events.some(predicate);
}

describe("save order — initialization must RESOLVE, not merely be called, before any mutation", () => {
  test("while deferred: initializer has started but NOT resolved, and zero downstream calls have happened", async () => {
    setFakeSupabase({
      deferInitializerResponse: true,
      initializeAdultParticipationResult: "initialized",
      participationStatus: "adult_approved",
      profileExists: false,
    });

    const harness = await render(createElement(OnboardingWizard));
    const restorePolyfills = installImagePipelinePolyfills();
    const saveButton = await reachPreviewReadyToSave(harness);

    await harness.interact(() => click(saveButton));

    // The initializer has STARTED...
    assert.ok(
      hasEvent(orderedEventLog, (e) => e.type === "rpc:call" && e.name === "initialize_adult_participation"),
      "expected the initializer to have been called"
    );
    // ...but has NOT resolved, because its response is deferred.
    assert.ok(
      !hasEvent(orderedEventLog, (e) => e.type === "rpc:resolved" && e.name === "initialize_adult_participation"),
      "the initializer must not have resolved yet — its response is deferred"
    );

    // Nothing downstream — not the participation pre-check RPC, not a Storage
    // upload, not a profile insert — has been reached. If the application code
    // awaited the initializer only loosely (fire-and-continue), these would
    // already be non-empty at this point even though the initializer has not
    // resolved.
    assert.ok(
      !hasEvent(orderedEventLog, (e) => e.type === "rpc:call" && e.name === "participation_status"),
      "the participation pre-check must not run before the initializer resolves"
    );
    assert.equal(storageUploadAttempts.length, 0, "zero Storage upload attempts while pending");
    assert.equal(profileWriteAttempts.length, 0, "zero profile write attempts while pending");

    // Now let it resolve, and prove everything downstream follows. Wrapped in
    // interact() so React's resulting state updates (saving -> navigating) are
    // flushed under act(), not left to warn about an un-acted update.
    await harness.interact(async () => {
      resolveDeferredInitializer("initialized");
      await flushMicrotasks();
    });

    assert.ok(
      hasEvent(orderedEventLog, (e) => e.type === "rpc:resolved" && e.name === "initialize_adult_participation"),
      "expected the initializer to have resolved after resolveDeferredInitializer"
    );
    assert.ok(storageUploadAttempts.length > 0, "expected a real upload attempt after resolution");
    assert.ok(storageUploadAttempts[0].byteLength > 0, "expected real, non-zero bytes to be uploaded");
    assert.ok(profileWriteAttempts.length > 0, "expected a profile insert attempt after resolution");
    assert.equal(profileWriteAttempts[0].kind, "insert");

    // The actual causal-ordering proof: find the initializer's OWN resolve event
    // and confirm every Storage/profile event in the whole log occurs AFTER it,
    // by index in the single shared log — not by comparing separate arrays.
    const resolveIndex = orderedEventLog.findIndex(
      (e) => e.type === "rpc:resolved" && e.name === "initialize_adult_participation"
    );
    const laterEvents = orderedEventLog.slice(resolveIndex + 1);
    assert.ok(
      hasEvent(laterEvents, (e) => e.type === "storage:upload"),
      "the Storage upload must appear strictly after the initializer's resolve event in the shared log"
    );
    assert.ok(
      hasEvent(laterEvents, (e) => e.type === "profile:insert"),
      "the profile insert must appear strictly after the initializer's resolve event in the shared log"
    );
    assert.ok(
      !hasEvent(orderedEventLog.slice(0, resolveIndex), (e) => e.type === "storage:upload" || e.type === "profile:insert"),
      "no Storage upload or profile insert may appear BEFORE the initializer's resolve event"
    );

    restorePolyfills();
    await harness.unmount();
  });

  test("a refused initialization (deferred, then resolved as refused) results in zero uploads and zero writes", async () => {
    setFakeSupabase({
      deferInitializerResponse: true,
      participationStatus: "absent",
    });

    const harness = await render(createElement(OnboardingWizard));
    const restorePolyfills = installImagePipelinePolyfills();
    const saveButton = await reachPreviewReadyToSave(harness);

    await harness.interact(() => click(saveButton));
    assert.equal(storageUploadAttempts.length, 0, "precondition: nothing has happened yet");
    assert.equal(profileWriteAttempts.length, 0, "precondition: nothing has happened yet");

    await harness.interact(async () => {
      resolveDeferredInitializer("refused");
      await flushMicrotasks();
    });

    assert.ok(
      rpcCallLog.some((c) => c.name === "initialize_adult_participation"),
      "the initializer must still have been called (and refused)"
    );
    assert.equal(
      storageUploadAttempts.length,
      0,
      "a refused initialization must result in zero upload attempts, even though a " +
        "real photo was picked and Save was pressed"
    );
    assert.equal(
      profileWriteAttempts.length,
      0,
      "a refused initialization must result in zero profile insert or update attempts"
    );
    assert.match(harness.text(), /try again/i, "expected a visible failure message");

    restorePolyfills();
    await harness.unmount();
  });

  test("the exact centralized version constants are the exact initializer RPC arguments", async () => {
    setFakeSupabase({ initializeAdultParticipationResult: "initialized" });

    const harness = await render(createElement(OnboardingWizard));
    const saveButton = await reachPreviewReadyToSave(harness);
    await harness.interact(() => click(saveButton));

    const initializeCall = rpcCallLog.find((c) => c.name === "initialize_adult_participation");
    assert.ok(initializeCall, "expected the initializer to have been called");

    // The exact argument names the RPC declares (see
    // 20261008000003_create_participation_functions.sql) and the exact centralized
    // constants the acceptance UI is supposed to use — not a re-derived or
    // hand-typed copy of them, so this test fails if the call site and the
    // constants module ever drift apart.
    assert.deepEqual(initializeCall.args, {
      p_attestation_version: ATTESTATION_VERSION,
      p_terms_version: TERMS_VERSION,
      p_privacy_version: PRIVACY_VERSION,
    });

    await harness.unmount();
  });
});

describe("save order — createProfile's own participation pre-check precedes its writes", () => {
  // Independent of the wizard: calls createProfile() directly, so this is
  // sensitive to a reordering INSIDE profile-save.ts itself (the second mutation
  // Codex reproduced) — moving the profile insert ahead of the
  // getParticipationStatus() pre-check — which the wizard-level tests above
  // cannot see, because the wizard already stops the flow earlier when the
  // initializer itself refuses.

  test("participation_status is called, and resolves, before any profile insert is attempted", async () => {
    setFakeSupabase({ participationStatus: "adult_approved", profileExists: false });

    await createProfile(createEmptyAthleteProfile(), { hero: null, profile: null });

    const statusResolveIndex = orderedEventLog.findIndex(
      (e) => e.type === "rpc:resolved" && e.name === "participation_status"
    );
    assert.ok(statusResolveIndex !== -1, "expected participation_status to have resolved");

    const insertIndex = orderedEventLog.findIndex((e) => e.type === "profile:insert");
    assert.ok(insertIndex !== -1, "expected a profile insert to have been attempted");

    assert.ok(
      statusResolveIndex < insertIndex,
      `participation_status must resolve BEFORE the profile insert — status resolved at ` +
        `index ${statusResolveIndex}, insert attempted at index ${insertIndex}`
    );
  });

  test("a non-adult-approved status means zero profile insert is ever attempted", async () => {
    setFakeSupabase({ participationStatus: "minor_pending" });

    const result = await createProfile(createEmptyAthleteProfile(), { hero: null, profile: null });

    assert.equal(result.ok, false);
    assert.equal(
      orderedEventLog.filter((e) => e.type === "profile:insert").length,
      0,
      "no profile insert may be attempted when the pre-check refuses"
    );
  });
});
