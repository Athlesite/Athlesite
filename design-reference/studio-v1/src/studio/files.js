/*
 * Athlesite Studio — page files (step 3).
 *
 * Save downloads the whole page as one file, "<name>.athlesite.json":
 *   { athlesite: 'page', version: 1, savedAt, profile }
 * Photos stored on this device ("idb:" references, photos.js) are written into the file as data
 * URLs, so the file is complete on its own: open it on another computer and everything is there.
 * Photos that are links (the built-in test photos under assets/) stay links.
 *
 * Open reads such a file back: checks it, puts its photos back into this device's photo store
 * (each one re-encoded through a canvas, so only real images get in), and returns a clean
 * profile (normalizeProfile). This is how the homepage examples get made and passed around.
 * In the real app this becomes "export / import"; pages themselves live in the database.
 */
(function () {
  const A = window.Athlesite, S = A.studio;
  const VERSION = 1;
  const MAX_FILE = 60 * 1024 * 1024;   // a page with a few dozen big photos is well under this
  const MAX_PHOTO = 15 * 1024 * 1024;  // per photo, decoded
  const DATA_URL = /^data:image\/(webp|jpeg|png|gif|avif);base64,([A-Za-z0-9+/=\s]+)$/;

  /** Every photo slot in a profile, as [get, set] pairs. */
  function photoSlots(d) {
    return [
      [() => d.heroPhotoUrl, (v) => (d.heroPhotoUrl = v)],
      ...d.gallery.map((g) => [() => g.src, (v) => (g.src = v)]),
      ...d.highlightLinks.map((x) => [() => x.poster || '', (v) => (x.poster = v)]),
    ];
  }

  const toDataURL = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });

  const fileNameFor = (p) => {
    const base = A.fullName(p.data).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return (base || 'my-page') + '.athlesite.json';
  };

  /** Download the page as one self-contained file. Resolves to the file name. */
  async function save(profile) {
    const p = structuredClone(profile);
    for (const [get, set] of photoSlots(p.data)) {
      const v = get();
      if (!S.photos.isRef(v)) continue;
      const blob = await S.photos.blobOf(v);
      set(blob ? await toDataURL(blob) : '');
    }
    const json = JSON.stringify({ athlesite: 'page', version: VERSION, savedAt: new Date().toISOString(), profile: p });
    const name = fileNameFor(profile);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return name;
  }

  /** A friendly error the editor can show as is. */
  const problem = (msg) => Object.assign(new Error(msg), { friendly: true });

  /** Is this dropped/chosen file worth trying as a page file? */
  const looksLikePageFile = (f) => f && (/\.json$/i.test(f.name) || f.type === 'application/json');

  /**
   * Read a page file. Resolves to { profile, dropped } where dropped counts photos that couldn't
   * be read (they're left out). Throws an Error with .friendly = true for anything else.
   */
  async function open(file) {
    if (!looksLikePageFile(file)) throw problem('That isn’t a page file. Page files end in .athlesite.json.');
    if (file.size > MAX_FILE) throw problem('That file is too big to be a page file.');
    let obj;
    try { obj = JSON.parse(await file.text()); } catch (e) { throw problem('That file couldn’t be read as a page file.'); }
    const raw = obj && obj.athlesite === 'page' ? obj.profile : obj && obj.data && obj.design ? obj : null;
    if (!raw || typeof raw !== 'object' || !raw.data || typeof raw.data !== 'object') throw problem('That file isn’t an Athlesite page.');
    if (obj.version > VERSION) throw problem('That page was saved by a newer Studio. Update and try again.');

    // Clean first (right types, known shapes), then bring the photos back into this device's store.
    const draft = A.normalizeProfile(raw);
    let dropped = 0;
    for (const [get, set] of photoSlots(draft.data)) {
      const v = get();
      if (typeof v !== 'string' || !v) continue;
      if (v.startsWith('data:')) {
        const ref = await restore(v);
        if (!ref) dropped++;
        set(ref || '');
      } else if (S.photos.isRef(v) && !(await S.photos.blobOf(v))) {
        set(''); dropped++; // a photo stored on some other device
      }
    }
    return { profile: A.normalizeProfile(draft), dropped };
  }

  /** A data URL from a page file → a stored photo reference, or '' if it isn't a readable image. */
  async function restore(dataUrl) {
    const m = DATA_URL.exec(dataUrl);
    if (!m) return '';
    try {
      const bin = atob(m[2].replace(/\s+/g, ''));
      if (bin.length > MAX_PHOTO) return '';
      const bytes = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
      const { ref } = await S.photos.add(new Blob([bytes], { type: 'image/' + m[1] }));
      return ref;
    } catch (e) { return ''; }
  }

  S.files = { save, open, looksLikePageFile, fileNameFor };
})();
