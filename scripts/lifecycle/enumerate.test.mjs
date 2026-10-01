import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { enumerateOwnerNamespace } from "./enumerate.mjs";

/**
 * Recursive owner-namespace enumeration.
 *
 * The property that matters most: an unreadable or malformed folder must make the whole
 * enumeration INCOMPLETE. If it degraded to "empty", the caller would read that as proof of
 * absence and proceed to the next destructive step on false evidence.
 */

const UID = "11111111-1111-4111-8111-111111111111";

/** Builds a fake Storage backend from a flat map of full key -> true. */
function fakeBackend(keys, { pageSize = 100 } = {}) {
  // Derive the folder tree from the flat key list, the way Storage does.
  const children = new Map(); // prefix -> Map(name -> {folder:boolean})
  const add = (prefix, name, isFolder) => {
    if (!children.has(prefix)) children.set(prefix, new Map());
    const bucket = children.get(prefix);
    if (!bucket.has(name) || !isFolder) bucket.set(name, { folder: isFolder });
  };
  for (const key of keys) {
    const parts = key.split("/");
    for (let i = 1; i < parts.length; i += 1) {
      const prefix = parts.slice(0, i).join("/");
      const name = parts[i];
      add(prefix, name, i < parts.length - 1);
    }
  }
  const calls = [];
  const list = async (prefix, { limit, offset }) => {
    calls.push({ prefix, limit, offset });
    const bucket = children.get(prefix);
    const entries = bucket ? [...bucket.entries()] : [];
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const page = entries.slice(offset, offset + limit);
    return page.map(([name, meta]) =>
      meta.folder
        ? { name, id: null, metadata: null }
        : { name, id: `id-${name}`, metadata: { size: 1, mimetype: "image/png" } }
    );
  };
  return { list, calls, pageSize };
}

describe("enumerateOwnerNamespace — completeness", () => {
  test("finds nested, root-level, and deeply nested objects", async () => {
    const keys = [
      `${UID}/hero/current.png`,
      `${UID}/hero/superseded.png`,
      `${UID}/profile/avatar.png`,
      `${UID}/legacy-root.png`,
      `${UID}/unexpected/deep/nested.bin`,
    ];
    const { list } = fakeBackend(keys);
    const r = await enumerateOwnerNamespace({ list, rootPrefix: UID, pageSize: 100 });
    assert.equal(r.complete, true);
    assert.deepEqual(r.keys.sort(), [...keys].sort());
  });

  test("root-level files are not missed", async () => {
    const { list } = fakeBackend([`${UID}/only-at-root.png`]);
    const r = await enumerateOwnerNamespace({ list, rootPrefix: UID });
    assert.deepEqual(r.keys, [`${UID}/only-at-root.png`]);
    assert.equal(r.complete, true);
  });

  test("an unexpected folder outside the app convention is traversed", async () => {
    const keys = [`${UID}/hero/a.png`, `${UID}/some-future-feature/x/y.dat`];
    const { list } = fakeBackend(keys);
    const r = await enumerateOwnerNamespace({ list, rootPrefix: UID });
    assert.equal(r.complete, true);
    assert.ok(r.keys.includes(`${UID}/some-future-feature/x/y.dat`));
    assert.ok(r.folders.includes(`${UID}/some-future-feature`));
  });

  test("no filtering by extension, slot name, or uuid shape", async () => {
    const keys = [
      `${UID}/hero/not-a-uuid.png`,
      `${UID}/notaslot/thing.tar.gz`,
      `${UID}/file-with-no-extension`,
    ];
    const { list } = fakeBackend(keys);
    const r = await enumerateOwnerNamespace({ list, rootPrefix: UID });
    assert.equal(r.keys.length, 3);
  });

  test("an empty namespace is complete with zero keys", async () => {
    const { list } = fakeBackend([]);
    const r = await enumerateOwnerNamespace({ list, rootPrefix: UID });
    assert.equal(r.complete, true);
    assert.deepEqual(r.keys, []);
  });
});

describe("enumerateOwnerNamespace — pagination", () => {
  test("pages a single folder to exhaustion", async () => {
    const keys = Array.from({ length: 25 }, (_, i) => `${UID}/hero/f${String(i).padStart(3, "0")}.png`);
    const { list, calls } = fakeBackend(keys);
    const r = await enumerateOwnerNamespace({ list, rootPrefix: UID, pageSize: 10 });
    assert.equal(r.complete, true);
    assert.equal(r.keys.length, 25, "every entry across pages must be found");
    const heroCalls = calls.filter((c) => c.prefix === `${UID}/hero`);
    assert.ok(heroCalls.length >= 3, `expected >=3 pages for 25 entries at pageSize 10, got ${heroCalls.length}`);
    assert.deepEqual(heroCalls.map((c) => c.offset).slice(0, 3), [0, 10, 20]);
  });

  test("an exact-multiple page count still terminates and finds everything", async () => {
    const keys = Array.from({ length: 20 }, (_, i) => `${UID}/hero/f${String(i).padStart(3, "0")}.png`);
    const { list } = fakeBackend(keys);
    const r = await enumerateOwnerNamespace({ list, rootPrefix: UID, pageSize: 10 });
    assert.equal(r.keys.length, 20);
    assert.equal(r.complete, true);
  });

  test("requests deterministic ordering-friendly paging (offsets advance monotonically)", async () => {
    const keys = Array.from({ length: 30 }, (_, i) => `${UID}/hero/f${String(i).padStart(3, "0")}.png`);
    const { list, calls } = fakeBackend(keys);
    await enumerateOwnerNamespace({ list, rootPrefix: UID, pageSize: 10 });
    const offsets = calls.filter((c) => c.prefix === `${UID}/hero`).map((c) => c.offset);
    for (let i = 1; i < offsets.length; i += 1) assert.ok(offsets[i] > offsets[i - 1]);
  });
});

describe("enumerateOwnerNamespace — UNKNOWN is never EMPTY", () => {
  test("a thrown list makes enumeration incomplete, not empty", async () => {
    const list = async () => {
      throw new Error("permission denied");
    };
    const r = await enumerateOwnerNamespace({ list, rootPrefix: UID });
    assert.equal(r.complete, false);
    assert.deepEqual(r.keys, []);
    assert.ok(r.problems.some((p) => /threw/.test(p)));
  });

  test("a non-array payload makes enumeration incomplete", async () => {
    const list = async () => ({ error: "nope" });
    const r = await enumerateOwnerNamespace({ list, rootPrefix: UID });
    assert.equal(r.complete, false);
    assert.ok(r.problems.some((p) => /non-array/.test(p)));
  });

  test("a malformed entry makes enumeration incomplete", async () => {
    const list = async (prefix, { offset }) =>
      offset === 0 ? [{ name: "", id: "x", metadata: {} }] : [];
    const r = await enumerateOwnerNamespace({ list, rootPrefix: UID, pageSize: 10 });
    assert.equal(r.complete, false);
    assert.ok(r.problems.some((p) => /malformed/.test(p)));
  });

  test("mixed folder/object signals are malformed rather than guessed", async () => {
    // id present but metadata null: cannot tell if object or folder.
    const list = async (prefix, { offset }) =>
      offset === 0 ? [{ name: "ambiguous", id: "id-1", metadata: null }] : [];
    const r = await enumerateOwnerNamespace({ list, rootPrefix: UID, pageSize: 10 });
    assert.equal(r.complete, false);
    assert.equal(r.keys.length, 0);
  });

  test("an entry name containing a slash is malformed, not silently joined", async () => {
    const list = async (prefix, { offset }) =>
      offset === 0 ? [{ name: "a/b.png", id: "id", metadata: {} }] : [];
    const r = await enumerateOwnerNamespace({ list, rootPrefix: UID, pageSize: 10 });
    assert.equal(r.complete, false);
  });

  test("failure deep in the tree still marks the whole enumeration incomplete", async () => {
    const good = fakeBackend([`${UID}/hero/a.png`, `${UID}/deep/b.png`]);
    const list = async (prefix, opts) => {
      if (prefix === `${UID}/deep`) throw new Error("denied");
      return good.list(prefix, opts);
    };
    const r = await enumerateOwnerNamespace({ list, rootPrefix: UID });
    assert.equal(r.complete, false, "one unreadable subfolder must fail the whole enumeration");
    assert.ok(r.keys.includes(`${UID}/hero/a.png`));
  });

  test("a missing rootPrefix is incomplete", async () => {
    const r = await enumerateOwnerNamespace({ list: async () => [], rootPrefix: "" });
    assert.equal(r.complete, false);
  });

  test("pathological nesting is bounded and reported, not silently truncated", async () => {
    // A folder that always reports one more folder inside it.
    const list = async (prefix, { offset }) =>
      offset === 0 ? [{ name: "deeper", id: null, metadata: null }] : [];
    const r = await enumerateOwnerNamespace({ list, rootPrefix: UID, pageSize: 10, maxDepth: 3 });
    assert.equal(r.complete, false);
    assert.ok(r.problems.some((p) => /max depth/.test(p)));
  });
});

describe("enumerateOwnerNamespace — resource ceilings are global (MED 11)", () => {
  /**
   * A backend with a wide, deep tree and a counter, so a test can prove that hitting a ceiling
   * actually stops the traversal rather than merely ending one folder's pagination.
   */
  function countingBackend({ breadth = 4, depth = 4 } = {}) {
    let listCalls = 0;
    const prefixes = new Set();
    const list = async (prefix) => {
      listCalls += 1;
      prefixes.add(prefix);
      const level = prefix.split("/").length - 1;
      if (level >= depth) {
        return Array.from({ length: breadth }, (_, i) => ({
          name: `file-${i}.png`,
          id: `id-${level}-${i}`,
          metadata: { size: 1 },
        }));
      }
      return Array.from({ length: breadth }, (_, i) => ({ name: `dir-${level}-${i}`, id: null, metadata: null }));
    };
    return {
      list,
      get listCalls() {
        return listCalls;
      },
      get prefixes() {
        return prefixes;
      },
    };
  }

  test("the unbounded tree is genuinely large, so the limits below mean something", async () => {
    const backend = countingBackend({ breadth: 3, depth: 3 });
    const r = await enumerateOwnerNamespace({ list: backend.list, rootPrefix: UID, pageSize: 100 });
    assert.equal(r.complete, true);
    assert.ok(backend.listCalls > 20, `expected a big traversal, saw ${backend.listCalls} list calls`);
  });

  test("a tiny maxEntries stops the traversal instead of only breaking one page loop", async () => {
    const backend = countingBackend({ breadth: 3, depth: 3 });
    const r = await enumerateOwnerNamespace({ list: backend.list, rootPrefix: UID, pageSize: 100, maxEntries: 4 });
    assert.equal(r.complete, false, "a bounded traversal is never complete");
    assert.equal(r.ceilingHit, true);
    assert.ok(
      backend.listCalls < 10,
      `hitting the ceiling must stop dequeuing folders, but ${backend.listCalls} list calls were made`
    );
    assert.ok(r.problems.some((p) => /unexplored/.test(p)), "the unexplored remainder must be reported");
  });

  test("a tiny maxFolders stops the traversal", async () => {
    const backend = countingBackend({ breadth: 3, depth: 3 });
    const r = await enumerateOwnerNamespace({ list: backend.list, rootPrefix: UID, pageSize: 100, maxFolders: 2 });
    assert.equal(r.complete, false);
    assert.equal(r.ceilingHit, true);
    assert.ok(backend.listCalls < 10, `saw ${backend.listCalls} list calls after the folder ceiling`);
  });

  test("a tiny maxPages stops the traversal", async () => {
    const backend = countingBackend({ breadth: 3, depth: 3 });
    const r = await enumerateOwnerNamespace({ list: backend.list, rootPrefix: UID, pageSize: 100, maxPages: 3 });
    assert.equal(r.complete, false);
    assert.equal(r.ceilingHit, true);
    assert.ok(backend.listCalls <= 6, `saw ${backend.listCalls} list calls after the page ceiling`);
  });

  test("queued folders are left UNEXPLORED once a ceiling is hit", async () => {
    const backend = countingBackend({ breadth: 4, depth: 3 });
    const r = await enumerateOwnerNamespace({ list: backend.list, rootPrefix: UID, pageSize: 100, maxEntries: 5 });
    assert.equal(r.complete, false);
    // Only the shallowest prefixes can have been visited; nothing deep should have been reached.
    const deepest = Math.max(...[...backend.prefixes].map((p) => p.split("/").length));
    assert.ok(deepest <= 2, `traversal continued to depth ${deepest} after the ceiling`);
  });

  test("hitting a ceiling can never yield complete: true", async () => {
    const backend = countingBackend({ breadth: 2, depth: 5 });
    for (const limits of [{ maxEntries: 1 }, { maxFolders: 1 }, { maxPages: 1 }, { maxDepth: 0 }]) {
      const r = await enumerateOwnerNamespace({ list: backend.list, rootPrefix: UID, pageSize: 100, ...limits });
      assert.equal(r.complete, false, `${JSON.stringify(limits)} must not report a complete traversal`);
    }
  });

  test("a traversal comfortably inside every ceiling is complete and reports no ceiling", async () => {
    const backend = countingBackend({ breadth: 2, depth: 2 });
    const r = await enumerateOwnerNamespace({
      list: backend.list,
      rootPrefix: UID,
      pageSize: 100,
      maxEntries: 10000,
      maxFolders: 2000,
      maxPages: 5000,
    });
    assert.equal(r.complete, true);
    assert.equal(r.ceilingHit, false);
  });

  test("a missing rootPrefix reports the full result shape, not a partial object", async () => {
    const r = await enumerateOwnerNamespace({ list: async () => [], rootPrefix: "" });
    assert.equal(r.complete, false);
    assert.equal(r.ceilingHit, false);
    assert.equal(r.malformedCount, 0);
    assert.deepEqual(r.keys, []);
  });
});

describe("enumerateOwnerNamespace — budgets are TRUE hard maximums, not thresholds", () => {
  /** Counts requests precisely, so "never exceeded" can be asserted rather than approximated. */
  function requestCounter({ breadth = 3, depth = 3, pageSize = 100 } = {}) {
    let requests = 0;
    const list = async (prefix) => {
      requests += 1;
      const level = prefix.split("/").length - 1;
      if (level >= depth) {
        return Array.from({ length: breadth }, (_, i) => ({
          name: `f-${i}.png`,
          id: `id-${level}-${i}`,
          metadata: { size: 1 },
        }));
      }
      return Array.from({ length: breadth }, (_, i) => ({ name: `d-${level}-${i}`, id: null, metadata: null }));
    };
    return {
      list,
      pageSize,
      get requests() {
        return requests;
      },
    };
  }

  test("maxPages: 1 issues EXACTLY one request, not two", async () => {
    // The previous behaviour checked the budget after the request, so `maxPages: 1` still issued a
    // second one before refusing. For destructive tooling the configured number is the number.
    const backend = requestCounter();
    const r = await enumerateOwnerNamespace({ list: backend.list, rootPrefix: UID, pageSize: 100, maxPages: 1 });
    assert.equal(backend.requests, 1, `expected exactly 1 request, saw ${backend.requests}`);
    assert.equal(r.pages, 1);
    assert.equal(r.complete, false);
    assert.equal(r.ceilingHit, true);
  });

  test("pages never exceed maxPages for a range of values", async () => {
    for (const maxPages of [1, 2, 3, 5, 8]) {
      const backend = requestCounter();
      const r = await enumerateOwnerNamespace({ list: backend.list, rootPrefix: UID, pageSize: 100, maxPages });
      assert.ok(backend.requests <= maxPages, `maxPages ${maxPages}: issued ${backend.requests} requests`);
      assert.equal(r.pages, backend.requests);
      assert.ok(r.pages <= maxPages, `maxPages ${maxPages}: recorded ${r.pages} pages`);
    }
  });

  test("recorded entries never exceed maxEntries", async () => {
    for (const maxEntries of [1, 2, 3, 7, 11]) {
      const backend = requestCounter();
      const r = await enumerateOwnerNamespace({ list: backend.list, rootPrefix: UID, pageSize: 100, maxEntries });
      const recorded = r.keys.length + r.folders.length + r.malformedCount;
      assert.ok(recorded <= maxEntries, `maxEntries ${maxEntries}: recorded ${recorded}`);
      assert.equal(r.complete, false);
    }
  });

  test("folders never exceed maxFolders", async () => {
    for (const maxFolders of [1, 2, 4]) {
      const backend = requestCounter();
      const r = await enumerateOwnerNamespace({ list: backend.list, rootPrefix: UID, pageSize: 100, maxFolders });
      assert.ok(r.folders.length <= maxFolders, `maxFolders ${maxFolders}: recorded ${r.folders.length}`);
      assert.equal(r.complete, false);
    }
  });

  test("a ceiling stops the traversal immediately, leaving the queue unexplored", async () => {
    const backend = requestCounter({ breadth: 4, depth: 4 });
    const r = await enumerateOwnerNamespace({ list: backend.list, rootPrefix: UID, pageSize: 100, maxEntries: 2 });
    assert.equal(r.ceilingHit, true);
    assert.equal(r.complete, false);
    assert.ok(backend.requests <= 2, `traversal continued after the ceiling: ${backend.requests} requests`);
  });

  test("a traversal within budget issues no more requests than it needs and completes", async () => {
    const backend = requestCounter({ breadth: 2, depth: 1 });
    const r = await enumerateOwnerNamespace({
      list: backend.list,
      rootPrefix: UID,
      pageSize: 100,
      maxPages: 100,
      maxEntries: 100,
      maxFolders: 100,
    });
    assert.equal(r.complete, true);
    assert.equal(r.ceilingHit, false);
    assert.equal(r.pages, backend.requests);
  });
});

describe("enumerateOwnerNamespace — a FAILED request still consumes the hard budget", () => {
  /**
   * A backend whose requests can be made to throw, counting every attempt.
   *
   * Counting attempts rather than successes is the whole point: a backend that fails every call must
   * not be able to burn through an unbounded number of requests because none of them "counted".
   */
  function flakyBackend({ failOn = () => false, breadth = 3, depth = 3 } = {}) {
    const attempts = [];
    const list = async (prefix, { offset }) => {
      const n = attempts.length + 1;
      attempts.push({ n, prefix, offset });
      if (failOn(n, prefix)) throw new Error(`simulated failure on request ${n}`);
      const level = prefix.split("/").length - 1;
      if (level >= depth) {
        return Array.from({ length: breadth }, (_, i) => ({
          name: `f-${i}.png`,
          id: `id-${n}-${i}`,
          metadata: { size: 1 },
        }));
      }
      return Array.from({ length: breadth }, (_, i) => ({ name: `d-${level}-${i}`, id: null, metadata: null }));
    };
    return {
      list,
      attempts,
      get count() {
        return attempts.length;
      },
    };
  }

  test("maxPages: 1 with a THROWING first request issues exactly one request", async () => {
    const backend = flakyBackend({ failOn: () => true });
    const r = await enumerateOwnerNamespace({ list: backend.list, rootPrefix: UID, pageSize: 100, maxPages: 1 });
    assert.equal(backend.count, 1, `expected exactly 1 attempt, saw ${backend.count}`);
    assert.equal(r.complete, false);
    assert.equal(r.pages, 1, "the failed attempt is counted");
  });

  test("first request succeeds, second throws, and no third request is issued", async () => {
    const backend = flakyBackend({ failOn: (n) => n === 2, breadth: 3, depth: 3 });
    const r = await enumerateOwnerNamespace({ list: backend.list, rootPrefix: UID, pageSize: 100, maxPages: 2 });
    assert.equal(backend.count, 2, `expected exactly 2 attempts, saw ${backend.count}`);
    assert.equal(r.complete, false);
    assert.ok(r.problems.some((p) => /list threw/.test(p)), "the failure is reported");
  });

  test("queued folders cannot exceed the request maximum through repeated failures", async () => {
    // The root succeeds and enqueues several folders; every subsequent request throws. Without
    // counting attempts, each throw would leave the budget untouched and the traversal would keep
    // asking for folder after folder.
    const backend = flakyBackend({ failOn: (n) => n > 1, breadth: 5, depth: 3 });
    const r = await enumerateOwnerNamespace({ list: backend.list, rootPrefix: UID, pageSize: 100, maxPages: 3 });
    assert.ok(backend.count <= 3, `expected at most 3 attempts, saw ${backend.count}`);
    assert.equal(r.complete, false);
    assert.ok(r.folders.length > 0, "the root did enqueue folders, so the bound was actually tested");
  });

  test("attempts never exceed maxPages for a range of values, with every request failing", async () => {
    for (const maxPages of [1, 2, 3, 5, 9]) {
      const backend = flakyBackend({ failOn: () => true });
      const r = await enumerateOwnerNamespace({ list: backend.list, rootPrefix: UID, pageSize: 100, maxPages });
      assert.ok(backend.count <= maxPages, `maxPages ${maxPages}: made ${backend.count} attempts`);
      assert.equal(r.complete, false);
    }
  });

  test("a mix of failures and successes still respects the maximum", async () => {
    for (const maxPages of [2, 4, 6]) {
      const backend = flakyBackend({ failOn: (n) => n % 2 === 0, breadth: 4, depth: 4 });
      const r = await enumerateOwnerNamespace({ list: backend.list, rootPrefix: UID, pageSize: 100, maxPages });
      assert.ok(backend.count <= maxPages, `maxPages ${maxPages}: made ${backend.count} attempts`);
      assert.equal(r.pages, backend.count, "recorded pages match attempts");
      assert.equal(r.complete, false);
    }
  });

  test("a failed request does not mark the traversal complete", async () => {
    const backend = flakyBackend({ failOn: (n) => n === 1 });
    const r = await enumerateOwnerNamespace({ list: backend.list, rootPrefix: UID, pageSize: 100, maxPages: 50 });
    assert.equal(r.complete, false, "an unreadable folder is never an empty one");
    assert.deepEqual(r.keys, []);
  });
});
