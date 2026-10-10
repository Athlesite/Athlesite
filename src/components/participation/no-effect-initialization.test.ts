import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Static guard, independent of the rendered test in participation.interaction.test.tsx.
 *
 * That rendered test proves the *current* behaviour; this one proves it the opposite
 * way, by reading the actual source: no `useEffect` body anywhere in the three
 * participation components may call one of the privileged RPC wrappers. Keeping both
 * means a future refactor that reintroduces an effect-based call is caught even if it
 * somehow kept the rendered test green (e.g. by also calling the RPC from the click
 * handler, leaving a redundant effect call that happens to be idempotent in the test's
 * particular sequence).
 */

const PRIVILEGED_CALLS = [
  "initializeAdultParticipation(",
  "recordAcceptanceBundle(",
  "unpublishOwnProfile(",
];

const FILES = [
  "src/components/participation/AdultAcceptancePanel.tsx",
  "src/components/participation/AdultAttestationGate.tsx",
  "src/components/participation/VisibilityOnlyPanel.tsx",
];

/** Extracts every `useEffect(() => { ... }, [...])` body from a source file. */
function extractEffectBodies(source: string): string[] {
  const bodies: string[] = [];
  const pattern = /useEffect\(\s*\(\s*\)\s*=>\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source))) {
    const bodyStart = match.index + match[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") depth -= 1;
      i += 1;
    }
    bodies.push(source.slice(bodyStart, i - 1));
  }

  return bodies;
}

describe("no privileged participation RPC is ever called from a useEffect body", () => {
  for (const file of FILES) {
    test(file, () => {
      const source = readFileSync(file, "utf8");
      const effectBodies = extractEffectBodies(source);

      for (const body of effectBodies) {
        for (const call of PRIVILEGED_CALLS) {
          assert.ok(
            !body.includes(call),
            `${file}: a useEffect body calls ${call} — initialization/writes must come ` +
              `only from an explicit user action`
          );
        }
      }
    });
  }

  test("the extractor itself finds at least one useEffect in files that have one", () => {
    // Guards against the extractor silently finding zero effects everywhere, which
    // would make every assertion above vacuously true.
    const gateSource = readFileSync("src/components/participation/AdultAttestationGate.tsx", "utf8");
    assert.ok(
      extractEffectBodies(gateSource).length > 0,
      "expected AdultAttestationGate to contain at least one useEffect (its router.refresh effect)"
    );
  });
});
