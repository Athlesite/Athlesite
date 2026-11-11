/*
 * Athlesite Studio — editor state.
 *
 * One profile ({ data, design }) is the whole truth; the panel and the preview only read it.
 * Every change goes through commit(), which keeps undo/redo and autosaves on this device.
 * A burst of changes to one thing (typing in a field, dragging a color) is one undo step.
 */
(function () {
  const A = window.Athlesite;
  const KEY = 'athlesite-studio-v1';
  const LIMIT = 100;       // undo steps kept
  const MERGE_MS = 900;    // changes to the same thing within this window share one undo step

  let profile = A.normalizeProfile(A.createEmptyProfile());
  let undoStack = [], redoStack = [];
  let lastKey = null, lastAt = 0;
  const listeners = new Set();
  let saveTimer = null, saveState = 'saved';

  const snapshot = (p) => structuredClone(p);

  function emit(change) { listeners.forEach((fn) => fn(profile, change)); }

  /**
   * Change the profile. `fn` edits a draft in place. Options:
   *   key   — changes with the same key in quick succession merge into one undo step
   *   kind  — 'design' | 'data' | 'order' … passed to listeners so they can redraw only what changed
   */
  function commit(fn, { key = null, kind = 'design' } = {}) {
    const before = snapshot(profile);
    const draft = snapshot(profile);
    fn(draft);
    const next = A.normalizeProfile(draft);
    if (JSON.stringify(next) === JSON.stringify(profile)) return false;
    const now = Date.now();
    const merge = key && key === lastKey && now - lastAt < MERGE_MS;
    if (!merge) {
      undoStack.push(before);
      if (undoStack.length > LIMIT) undoStack.shift();
    }
    redoStack = [];
    lastKey = key; lastAt = now;
    profile = next;
    scheduleSave();
    emit({ kind, key });
    return true;
  }

  function undo() {
    if (!undoStack.length) return false;
    redoStack.push(snapshot(profile));
    profile = undoStack.pop();
    lastKey = null;
    scheduleSave();
    emit({ kind: 'history', key: 'undo' });
    return true;
  }

  function redo() {
    if (!redoStack.length) return false;
    undoStack.push(snapshot(profile));
    profile = redoStack.pop();
    lastKey = null;
    scheduleSave();
    emit({ kind: 'history', key: 'redo' });
    return true;
  }

  /** Replace everything (open a file, load a test athlete). Clears history. */
  function load(p, { save = true } = {}) {
    profile = A.normalizeProfile(snapshot(p));
    undoStack = []; redoStack = []; lastKey = null;
    if (save) scheduleSave(0);
    emit({ kind: 'load' });
  }

  // — Autosave on this device —
  const statusListeners = new Set();
  function setSaveState(s) { saveState = s; statusListeners.forEach((fn) => fn(s)); }

  function scheduleSave(delay = 400) {
    clearTimeout(saveTimer);
    setSaveState('saving');
    saveTimer = setTimeout(writeNow, delay);
  }

  function writeNow() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), profile }));
      setSaveState('saved');
    } catch (e) {
      // Full storage (big photos) or storage blocked: say so instead of failing silently.
      setSaveState('error');
    }
  }

  function readSaved() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      return raw && raw.profile ? A.normalizeProfile(raw.profile) : null;
    } catch (e) { return null; }
  }

  // Leaving the page never loses the last change.
  addEventListener('pagehide', () => { if (saveState === 'saving') { clearTimeout(saveTimer); writeNow(); } });

  A.studio = Object.assign(A.studio || {}, {
    store: {
      get: () => profile,
      commit, undo, redo, load, readSaved,
      canUndo: () => undoStack.length > 0,
      canRedo: () => redoStack.length > 0,
      subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
      onSaveState: (fn) => { statusListeners.add(fn); fn(saveState); },
    },
  });
})();
