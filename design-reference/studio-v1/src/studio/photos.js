/*
 * Athlesite Studio — the athlete's own photos (step 2).
 *
 * Uploads are shrunk to at most 1600px on the long side and stored as WebP (JPEG where the browser
 * can't write WebP) in IndexedDB; the profile only keeps a reference, "idb:<id>", so the saved page
 * in localStorage stays small. Before rendering, the preview swaps references for object URLs
 * (resolve). Works from file:// too (tested). In the real app uploads go to storage instead
 * (Supabase Storage policies are CFul's area) and the references become https URLs.
 */
(function () {
  const A = window.Athlesite, S = A.studio;
  const DB = 'athlesite-studio-photos', STORE = 'photos', MAX = 1600, SMALL = 1200;
  const urls = new Map();   // ref → object URL (loaded)
  const sizes = new Map();  // ref → { w, h } of the photo as uploaded
  const waiting = new Map(); // ref → Promise while loading
  const listeners = new Set();
  let dbp = null;

  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => { const t = d.transaction(STORE, mode); const out = fn(t.objectStore(STORE)); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); });
  };

  const isRef = (s) => typeof s === 'string' && s.startsWith('idb:');

  /** Read a photo file, shrink it, store it; resolves to { ref, w, h, small }. */
  async function add(file) {
    let bmp;
    try { bmp = await createImageBitmap(file); } catch (e) { throw new Error('unreadable'); }
    const w = bmp.width, h = bmp.height, k = Math.min(1, MAX / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    let blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.86));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const ref = 'idb:' + id;
    await tx('readwrite', (s) => s.put({ blob, w, h }, id));
    urls.set(ref, URL.createObjectURL(blob));
    sizes.set(ref, { w, h });
    return { ref, w, h, small: Math.max(w, h) < SMALL };
  }

  /** The URL to show a photo now ('' while a stored one is still loading; listeners hear when it lands). */
  function url(src) {
    if (!isRef(src)) return src || '';
    if (urls.has(src)) return urls.get(src);
    load(src);
    return '';
  }
  function load(ref) {
    if (urls.has(ref) || waiting.has(ref)) return waiting.get(ref);
    const p = tx('readonly', (s) => s.get(ref.slice(4))).then((rec) => {
      waiting.delete(ref);
      if (rec && rec.blob) { urls.set(ref, URL.createObjectURL(rec.blob)); sizes.set(ref, { w: rec.w, h: rec.h }); listeners.forEach((fn) => fn(ref)); }
    }).catch(() => waiting.delete(ref));
    waiting.set(ref, p);
    return p;
  }

  /** Every photo reference in a profile (cover, gallery, video posters). */
  function refsIn(p) {
    const d = p.data;
    return [d.heroPhotoUrl, ...d.gallery.map((g) => g.src), ...d.highlightLinks.map((x) => x.poster)].filter(isRef);
  }

  /** A copy of the profile with stored photos swapped for loaded URLs, for rendering. */
  function resolve(p) {
    if (!refsIn(p).length) return p;
    const q = structuredClone(p), d = q.data;
    d.heroPhotoUrl = url(d.heroPhotoUrl);
    d.gallery = d.gallery.map((g) => Object.assign({}, g, { src: url(g.src) }));
    d.highlightLinks = d.highlightLinks.map((x) => (x.poster ? Object.assign({}, x, { poster: url(x.poster) }) : x));
    return q;
  }

  /** Size of a photo as uploaded (stored photos), or null (built-in / web photos: measure the image). */
  const sizeOf = (src) => sizes.get(src) || null;

  /** The stored file behind a reference (for saving a page file), or null. */
  async function blobOf(ref) {
    if (!isRef(ref)) return null;
    try { const rec = await tx('readonly', (s) => s.get(ref.slice(4))); return (rec && rec.blob) || null; } catch (e) { return null; }
  }

  /** Forget stored photos the saved page no longer uses (run at start, when there's no undo history). */
  async function cleanup(keep) {
    try {
      const keepIds = new Set(keep.filter(isRef).map((r) => r.slice(4)));
      const keys = await tx('readonly', (s) => s.getAllKeys());
      const drop = (keys || []).filter((k) => !keepIds.has(k));
      if (drop.length) await tx('readwrite', (s) => drop.forEach((k) => s.delete(k)));
    } catch (e) { /* storage unavailable: nothing to clean */ }
  }

  S.photos = { add, url, resolve, refsIn, isRef, sizeOf, blobOf, cleanup, SMALL, onLoaded: (fn) => listeners.add(fn) };
})();
