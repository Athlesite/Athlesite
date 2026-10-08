/**
 * Reads a mounted component's own hook state, for assertions that the DOM cannot make.
 *
 * **Why this is needed.** When an age answer resolves to a blocked bracket the wizard
 * renders `AgeBlocked` instead of its steps, so every field, photo and OTP input simply
 * stops being on screen. That makes "the inputs are gone" a worthless assertion: it
 * passes identically whether the state was wiped or is still sitting in memory behind
 * the blocked screen. And there is no route back — `AgeBlocked` links home and nothing
 * re-renders the steps — so the state can never become visible again to be checked.
 *
 * The data really is unreachable through any product surface, which is the point of the
 * design and also exactly why proving it was cleared needs a test-only route. This reads
 * the hook chain out of React's committed fiber tree. Nothing is added to production
 * code: no debug export, no test-only prop, no window hook.
 *
 * **Cost of that choice.** It touches React internals (`__reactContainer$*`,
 * `stateNode.current`, `memoizedState`), which are private and could change in a future
 * React. It is written to fail loudly rather than silently pass if that happens — every
 * lookup throws when it cannot find what it expects, so a React upgrade produces an
 * obvious error instead of a green test asserting nothing.
 */

type Fiber = {
  type: unknown;
  child: Fiber | null;
  sibling: Fiber | null;
  memoizedState: HookNode | null;
};

type HookNode = {
  memoizedState: unknown;
  next: HookNode | null;
};

/** The container's root fiber, whose `stateNode.current` names the committed tree. */
function rootFiberFor(container: Element): { current: Fiber } {
  const key = Object.getOwnPropertyNames(container).find((name) =>
    name.startsWith("__reactContainer$")
  );
  if (!key) {
    throw new Error(
      "react-state: no __reactContainer$* key on the container. Either nothing was " +
        "rendered into it, or React's internal field naming has changed."
    );
  }
  const hostRoot = (container as unknown as Record<string, { stateNode: { current: Fiber } }>)[key];
  const fiberRoot = hostRoot?.stateNode;
  if (!fiberRoot?.current) {
    throw new Error("react-state: the container's root fiber has no committed tree.");
  }
  return fiberRoot;
}

/**
 * The hook states of the function component named `componentName`, in hook order.
 *
 * Searched downwards from the root's `current` pointer rather than upwards from a
 * rendered element, and that detail is the whole correctness of this file. React keeps
 * two fibers per component and swaps them on each render, and the `__reactFiber$*` key
 * on a DOM node can be left pointing at the **stale alternate**. Reading hooks from
 * whichever fiber a node happened to reference gave a snapshot that was sometimes an
 * update behind — which in a test asserting "this state was cleared" is the worst
 * possible failure mode, since it can report either a stale value that was in fact
 * cleared or a cleared value that is in fact still held. `stateNode.current` is the tree
 * React has actually committed, so there is no ambiguity.
 *
 * Positions are deliberately not part of the contract — callers should scan the whole
 * list rather than index into it, so adding a hook to the component does not silently
 * change what a test is looking at.
 */
export function findComponentHookStates(container: Element, componentName: string): unknown[] {
  const stack: Fiber[] = [rootFiberFor(container).current];

  // Iterative, and bounded: a cycle or an unexpectedly deep tree should fail the test
  // rather than hang the run.
  for (let visited = 0; stack.length > 0 && visited < 10_000; visited += 1) {
    const fiber = stack.pop()!;
    const type = fiber.type;

    if (typeof type === "function" && type.name === componentName) {
      const states: unknown[] = [];
      let hook: HookNode | null = fiber.memoizedState;
      for (let i = 0; hook && i < 200; i += 1) {
        states.push(hook.memoizedState);
        hook = hook.next;
      }
      return states;
    }

    if (fiber.sibling) stack.push(fiber.sibling);
    if (fiber.child) stack.push(fiber.child);
  }

  throw new Error(
    `react-state: no mounted function component named ${componentName} in the ` +
      "committed tree. Check the name, or whether the component is still rendered."
  );
}

/** An effect's internal record, which holds closures over render scope — not data. */
function isEffectRecord(value: object): boolean {
  return "create" in value && "deps" in value && "tag" in value;
}

/**
 * Every string reachable from `value`, including object keys.
 *
 * Effect records are skipped: their `create`/`destroy` closures capture the whole render
 * scope, so following them would report values that are merely *visible to* the
 * component rather than *held in* its state, and every assertion built on this would
 * become a false positive.
 */
export function deepStrings(value: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<unknown>();

  function walk(current: unknown, depth: number): void {
    if (depth > 12 || current == null) return;

    if (typeof current === "string") {
      found.push(current);
      return;
    }
    if (typeof current !== "object") return;
    if (seen.has(current)) return;
    seen.add(current);

    if (isEffectRecord(current)) return;

    if (Array.isArray(current)) {
      for (const item of current) walk(item, depth + 1);
      return;
    }

    for (const [key, item] of Object.entries(current)) {
      found.push(key);
      walk(item, depth + 1);
    }
  }

  walk(value, 0);
  return found;
}

/**
 * Whether anything reachable from `value` looks like a picked file or a photo preview.
 *
 * Matches the `PhotoPreview` shape (`{ file, fileName, objectUrl }`) and a `File`
 * itself, by structure rather than by `instanceof`: the harness swaps the global `File`
 * per rendered document, so an identity check would quietly never match.
 */
export function holdsPhotoState(value: unknown): boolean {
  const seen = new Set<unknown>();

  function walk(current: unknown, depth: number): boolean {
    if (depth > 12 || current == null || typeof current !== "object") return false;
    if (seen.has(current)) return false;
    seen.add(current);
    if (isEffectRecord(current)) return false;

    const record = current as Record<string, unknown>;
    if (typeof record.objectUrl === "string") return true;
    if (
      typeof record.name === "string" &&
      typeof record.size === "number" &&
      typeof record.type === "string"
    ) {
      return true;
    }

    if (Array.isArray(current)) {
      return current.some((item) => walk(item, depth + 1));
    }
    return Object.values(record).some((item) => walk(item, depth + 1));
  }

  return walk(value, 0);
}
