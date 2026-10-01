/**
 * Complete, recursive enumeration of one owner's Storage namespace.
 *
 * ── WHY NOT `{uid}/hero` + `{uid}/profile` ───────────────────────────────────────
 *
 * Those two folders are the *current application convention*, not a definition of what the
 * athlete owns. Anything that ever wrote into `{uid}/...` — a legacy path, a root-level
 * file, a folder from a future feature, a hand-uploaded object — is still the athlete's data
 * and must be found. So completeness is defined as the whole `{uid}/` namespace, discovered
 * by recursive traversal rather than by assuming a shape.
 *
 * Nothing here filters by extension, UUID shape, slot name, or path depth.
 *
 * ── UNKNOWN IS NOT EMPTY ─────────────────────────────────────────────────────────
 *
 * A malformed, non-array, or partially-understood response makes the enumeration
 * INCOMPLETE. It never degrades to "the folder is empty", because in a deletion workflow
 * "empty" is the signal that authorises the next destructive step. An unreadable folder must
 * stop the operation, not silently satisfy it.
 *
 * ── ENUMERATE FULLY, THEN DELETE ─────────────────────────────────────────────────
 *
 * Callers must complete enumeration before deleting anything. Offset pagination over a
 * shrinking collection skips entries: delete page 1 and the old page 2 slides into its
 * place. This module therefore only ever reads.
 *
 * The `list` function is injected so pagination, recursion, folder detection, and
 * malformed-response handling are all testable without a network or a project.
 */

/**
 * Distinguishes an object from a folder placeholder, accepting ONLY shapes we can classify
 * confidently.
 *
 * `@supabase/storage-js` documents, for `list()`: `name` is always present; `id` and
 * `metadata` are **explicitly null** for folders. So the two acceptable shapes are:
 *
 *   folder  ->  id === null            AND metadata === null
 *   object  ->  id is a non-empty str  AND metadata is a non-null object
 *
 * A *missing* field is deliberately NOT equivalent to an explicit `null`. `{name}` alone
 * tells us nothing about whether that entry is a file we must delete or a folder we must
 * descend into, and in a deletion workflow guessing either way is unacceptable: guess
 * "folder" and we skip a real object; guess "object" and we never recurse. So anything other
 * than the two shapes above is malformed, which makes the enumeration incomplete and stops
 * the operation.
 */
function classifyEntry(entry) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return { kind: "malformed" };
  if (!Object.prototype.hasOwnProperty.call(entry, "name")) return { kind: "malformed" };

  const name = entry.name;
  if (typeof name !== "string" || name === "") return { kind: "malformed" };
  if (name.includes("/") || name.includes("\\")) return { kind: "malformed" };
  if (name === "." || name === "..") return { kind: "malformed" };

  // Both fields must be PRESENT; absence is not null.
  const hasId = Object.prototype.hasOwnProperty.call(entry, "id");
  const hasMetadata = Object.prototype.hasOwnProperty.call(entry, "metadata");
  if (!hasId || !hasMetadata) return { kind: "malformed" };

  const idIsNull = entry.id === null;
  const idIsString = typeof entry.id === "string" && entry.id !== "";
  const metaIsNull = entry.metadata === null;
  const metaIsObject = entry.metadata !== null && typeof entry.metadata === "object" && !Array.isArray(entry.metadata);

  if (idIsNull && metaIsNull) return { kind: "folder", name };
  if (idIsString && metaIsObject) return { kind: "object", name };
  // Mixed or unrecognised signals: do not guess which it is.
  return { kind: "malformed" };
}

/**
 * Recursively enumerates every object under `rootPrefix`.
 *
 * @param {object} args
 * @param {(prefix: string, opts: {limit: number, offset: number}) => Promise<unknown>} args.list
 *        Returns the raw list payload for one page. Must not throw for an empty folder.
 * @param {string} args.rootPrefix  e.g. the owner uid
 * @param {number} [args.pageSize]  entries per page
 * @param {number} [args.maxDepth]  guard against pathological nesting
 * @param {number} [args.maxEntries] guard against unbounded growth
 * @returns {Promise<{complete: boolean, keys: string[], folders: string[], problems: string[], pages: number}>}
 */
export async function enumerateOwnerNamespace({
  list,
  rootPrefix,
  pageSize = 100,
  maxDepth = 12,
  maxEntries = 10000,
  maxFolders = 2000,
  maxPages = 5000,
}) {
  const keys = [];
  const folders = [];
  const problems = [];
  let pages = 0;
  let complete = true;
  let malformedCount = 0;
  // A single flag, checked at BOTH loop levels. A per-page break is not a ceiling: the inner loop
  // stops but the outer loop keeps dequeuing folders, so the traversal carries on doing exactly the
  // work the limit was meant to prevent.
  let ceilingHit = false;

  if (typeof rootPrefix !== "string" || rootPrefix === "") {
    return {
      complete: false,
      keys: [],
      folders: [],
      problems: ["rootPrefix missing"],
      pages: 0,
      malformedCount: 0,
      ceilingHit: false,
    };
  }

  /**
   * The budgets are TRUE HARD MAXIMUMS, checked BEFORE the action that would exceed them.
   *
   * Checking afterwards is a refusal threshold, not a ceiling: `maxPages: 1` would still issue a
   * second request before noticing. For destructive tooling the configured number is the number,
   * so `pages` never exceeds `maxPages`, `folders` never exceeds `maxFolders`, and the recorded
   * entry total never exceeds `maxEntries`.
   */
  const entriesRecorded = () => keys.length + folders.length + malformedCount;
  const wouldExceedEntries = () => entriesRecorded() + 1 > maxEntries;
  const wouldExceedFolders = () => folders.length + 1 > maxFolders;
  const wouldExceedPages = () => pages + 1 > maxPages;

  /** Records a ceiling once, so the traversal unwinds through a single flag. */
  const hitCeiling = (reason) => {
    complete = false;
    ceilingHit = true;
    problems.push(reason);
  };

  const queue = [{ prefix: rootPrefix, depth: 0 }];
  const seenPrefixes = new Set();

  while (queue.length > 0) {
    // Stop dequeuing entirely once any ceiling is hit; the remaining queue is left unexplored and
    // the result is INCOMPLETE, which is what forbids the caller from acting on it.
    if (ceilingHit) {
      problems.push(`traversal stopped with ${queue.length} folder(s) unexplored`);
      break;
    }
    const { prefix, depth } = queue.shift();
    if (seenPrefixes.has(prefix)) continue;
    seenPrefixes.add(prefix);

    if (depth > maxDepth) {
      complete = false;
      problems.push(`max depth exceeded at ${prefix}`);
      continue;
    }

    let offset = 0;
    // Page through this one folder to exhaustion before moving on.
    for (;;) {
      // Budget check BEFORE the request, so the configured page count is never exceeded.
      if (wouldExceedPages()) {
        hitCeiling(`max pages (${maxPages}) reached before requesting ${prefix} at offset ${offset}`);
        break;
      }

      // The ATTEMPT consumes the budget, counted before the call and never rolled back. Counting
      // only successes would let a backend that fails every request burn through any number of them:
      // each throw would leave the count untouched, so the ceiling would never be reached and the
      // traversal would keep asking. A hard maximum has to bound attempts, not outcomes.
      pages += 1;

      let payload;
      try {
        payload = await list(prefix, { limit: pageSize, offset });
      } catch {
        // A thrown error is never "empty" — the folder's contents are unknown.
        complete = false;
        problems.push(`list threw for ${prefix} at offset ${offset}`);
        break;
      }

      if (!Array.isArray(payload)) {
        complete = false;
        problems.push(`non-array payload for ${prefix} at offset ${offset}`);
        break;
      }

      for (const entry of payload) {
        // Checked before recording, so the entry total never exceeds the configured maximum.
        // Malformed entries count too: otherwise a backend returning endless unclassifiable pages
        // could spin indefinitely without ever tripping the limit.
        if (wouldExceedEntries()) {
          hitCeiling(`max entries (${maxEntries}) reached under ${prefix}`);
          break;
        }
        const classified = classifyEntry(entry);
        if (classified.kind === "malformed") {
          complete = false;
          malformedCount += 1;
          problems.push(`malformed entry under ${prefix}`);
          continue;
        }
        const full = `${prefix}/${classified.name}`;
        if (classified.kind === "folder") {
          if (wouldExceedFolders()) {
            hitCeiling(`max folders (${maxFolders}) reached at ${full}`);
            break;
          }
          folders.push(full);
          queue.push({ prefix: full, depth: depth + 1 });
        } else {
          keys.push(full);
        }
      }
      if (ceilingHit) break;

      // A short page means this folder is exhausted.
      if (payload.length < pageSize) break;
      offset += pageSize;
    }
  }

  // Deterministic ordering, so inventories and diffs are stable across runs.
  keys.sort();
  folders.sort();
  // `maxDepth`, `maxEntries`, `maxFolders` and `maxPages` are REFUSAL SAFETY BOUNDS, not truncation
  // limits: hitting any of them sets complete=false, so a bounded traversal can never be mistaken
  // for an exhaustive one. There is no path by which reaching a limit yields complete=true.
  return { complete, keys, folders, problems, pages, malformedCount, ceilingHit };
}

/**
 * Builds the injectable `list` for a real Supabase Storage client.
 *
 * Deterministic ordering is requested explicitly; without it, offset pagination over an
 * unordered collection can both repeat and skip entries.
 */
export function makeStorageLister({ fetchImpl, supabaseUrl, anonKey, accessToken, bucket }) {
  return async function list(prefix, { limit, offset }) {
    const response = await fetchImpl(`${supabaseUrl}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prefix,
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
    });
    if (!response.ok) {
      // Surfaced to the caller as a thrown error so it becomes INCOMPLETE, never "empty".
      throw new Error(`list failed with status ${response.status}`);
    }
    return response.json();
  };
}
