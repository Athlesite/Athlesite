/*
 * Athlesite Studio — wiring: top bar, preview, panel, keyboard, and the phone bottom sheet.
 */
(function () {
  const A = window.Athlesite, S = A.studio, store = S.store;
  const $ = (s) => document.querySelector(s);
  const narrow = () => innerWidth < 800;

  // Screen-reader announcements (moves, remixes, undo).
  const live = $('#studio-live');
  const announce = (msg) => { live.textContent = ''; setTimeout(() => (live.textContent = msg), 30); };
  S.announce = announce;

  // — Phone: the panel is a bottom sheet (peek / half / full) —
  const panelEl = $('#panel'), handle = $('#sheet-handle');
  const SHEET = ['peek', 'half', 'full'];
  let onSheet = null; // set once the preview exists
  // How much of the page each sheet height covers (the preview keeps picked things above it).
  const sheetCover = (state) => (!narrow() ? 0 : state === 'full' ? innerHeight : state === 'half' ? innerHeight * 0.52 : 132);
  function setSheet(state) {
    panelEl.dataset.sheet = state;
    if (onSheet) onSheet(state);
    panelEl.style.transform = '';
    handle.setAttribute('aria-expanded', String(state !== 'peek'));
    handle.setAttribute('aria-label', state === 'full' ? 'Show less of the tools' : 'Show more tools');
  }
  handle.addEventListener('click', () => {
    if (handle._dragged) { handle._dragged = false; return; }
    const i = SHEET.indexOf(panelEl.dataset.sheet);
    setSheet(i === SHEET.length - 1 ? 'peek' : SHEET[i + 1]);
  });
  // Keyboard on phones: Tab into a tool that's below the lowered sheet and the sheet rises to full,
  // then the tool scrolls into view. Only for Tab: tapping the page also focuses a field, and that
  // keeps its own half-height sheet (the tapped thing stays above it).
  let tabbedAt = 0;
  addEventListener('keydown', (e) => { if (e.key === 'Tab') tabbedAt = performance.now(); }, true);
  panelEl.addEventListener('focusin', (e) => {
    if (!narrow() || performance.now() - tabbedAt > 400 || e.target === handle || panelEl.dataset.sheet === 'full') return;
    if (e.target.getBoundingClientRect().bottom <= innerHeight - 4) return;
    setSheet('full');
    setTimeout(() => e.target.isConnected && e.target.scrollIntoView({ block: 'nearest' }), 380);
  });
  // The on-screen keyboard on phones covers the bottom of the screen, where a half or peek sheet keeps
  // its fields. While someone types in the tools, the sheet rises to full and the field scrolls to just
  // above the keyboard; when the keyboard goes away, the sheet goes back to where it was.
  const vv = window.visualViewport;
  let sheetBeforeKeys = '';
  const isField = (el) => el && panelEl.contains(el) && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=file]),textarea,select,[contenteditable=true]');
  const keyboardUp = () => vv && vv.height < innerHeight * 0.8;
  function keepFieldAboveKeys() {
    if (!narrow() || !vv) return;
    const el = document.activeElement;
    if (keyboardUp() && isField(el)) {
      if (panelEl.dataset.sheet !== 'full') { sheetBeforeKeys = panelEl.dataset.sheet; setSheet('full'); }
      // After the sheet has risen: bring the field up just above the keyboard, inside its own screen.
      setTimeout(() => {
        if (!el.isConnected || document.activeElement !== el) return;
        const screen = el.closest('.screen'), r = el.getBoundingClientRect(), bottom = vv.offsetTop + vv.height - 16;
        if (screen && r.bottom > bottom) screen.scrollTop += r.bottom - bottom;
        else if (screen && r.top < vv.offsetTop + 64) screen.scrollTop -= vv.offsetTop + 64 - r.top;
      }, 460);
    } else if (!keyboardUp() && sheetBeforeKeys) {
      setSheet(sheetBeforeKeys);
      sheetBeforeKeys = '';
    }
  }
  if (vv) vv.addEventListener('resize', keepFieldAboveKeys);
  panelEl.addEventListener('focusin', (e) => { if (isField(e.target) && keyboardUp()) keepFieldAboveKeys(); });
  // Drag the handle; let go and it snaps to the nearest height.
  handle.addEventListener('pointerdown', (e) => {
    if (!narrow()) return;
    handle.setPointerCapture(e.pointerId);
    const y0 = e.clientY, H = panelEl.offsetHeight;
    const start = new DOMMatrix(getComputedStyle(panelEl).transform).m42;
    panelEl.classList.add('is-dragging');
    const move = (ev) => {
      const y = Math.min(H - 96, Math.max(0, start + ev.clientY - y0));
      if (Math.abs(ev.clientY - y0) > 4) handle._dragged = true;
      panelEl.style.transform = `translateY(${y}px)`;
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      panelEl.classList.remove('is-dragging');
      if (!handle._dragged) return;
      const y = new DOMMatrix(getComputedStyle(panelEl).transform).m42, visible = H - y;
      const snaps = { peek: 132, half: innerHeight * 0.52, full: H };
      setSheet(Object.keys(snaps).reduce((a, b) => (Math.abs(snaps[b] - visible) < Math.abs(snaps[a] - visible) ? b : a)));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });

  // — Preview and panel —
  // data-item lists on the page → the section that edits them and the field to put the cursor in.
  const ITEM_SECTION = { stats: 'stats', highlightLinks: 'film', results: 'results', milestones: 'milestones', gallery: 'gallery' };
  const ITEM_FIELD = { stats: 'value', highlightLinks: 'label', results: 'a', milestones: 'title', gallery: 'caption' };
  const preview = S.createPreview($('#canvas'), {
    onPick: ({ section, field, item }) => {
      if (narrow() && panelEl.dataset.sheet === 'peek') setSheet('half');
      // A stat, video, result, milestone or photo opens its own row (even when it was clicked on the cover).
      const [list, index] = item ? item.split(':') : [];
      if (ITEM_SECTION[list]) {
        // What they tapped is on screen already: don't scroll to the section, only keep it above the sheet.
        panel.go('section:' + ITEM_SECTION[list], { focusTitle: false, scroll: false });
        panel.focusField(`data.${list}.${index}.${ITEM_FIELD[list]}`);
        preview.reveal(item);
      } else {
        panel.go('section:' + section, { focusTitle: false, scroll: narrow() });
        if (field) panel.focusField((S.fieldFor && S.fieldFor[field]) || field);
      }
    },
    onKey: (e) => keys(e),
    onReady: () => document.body.classList.add('is-ready'),
  });
  const panel = S.createPanel($('#panel-inner'), { preview, announce });
  onSheet = (state) => preview.setInset(sheetCover(state));
  onSheet(panelEl.dataset.sheet);
  addEventListener('resize', () => onSheet(panelEl.dataset.sheet));

  // — Top bar —
  const device = S.ui.Seg({ label: 'Preview size', onPick: (v) => preview.setDevice(v) });
  device.items([{ id: 'desktop', label: 'Desktop' }, { id: 'phone', label: 'Phone' }]);
  device.set('desktop', true);
  $('#device-slot').append(device.el);

  let sheetBeforeVisit = '';
  const showMode = (v) => {
    preview.setMode(v); document.body.classList.toggle('is-visitor', v === 'visitor');
    // Phones: a visitor sees the page, not the tools. The sheet drops to its handle and comes back
    // to where it was on Edit (a full sheet used to cover the whole page in visitor view).
    if (narrow()) {
      if (v === 'visitor') { sheetBeforeVisit = panelEl.dataset.sheet; setSheet('peek'); }
      else if (sheetBeforeVisit) { setSheet(sheetBeforeVisit); sheetBeforeVisit = ''; }
    }
    announce(v === 'visitor' ? 'Viewing as a visitor: only what your published page shows. Clicks work like on your real page.' : 'Editing. Click anything on your page to change it.');
  };
  const mode = S.ui.Seg({ label: 'Preview mode', onPick: showMode });
  mode.items([{ id: 'edit', label: 'Edit' }, { id: 'visitor', label: 'View as visitor', short: 'Visitor' }]);
  mode.set('edit', true);
  $('#mode-slot').append(mode.el);

  $('#play').addEventListener('click', () => preview.play());
  $('#undo').addEventListener('click', () => { if (store.undo()) announce('Undone'); });
  $('#redo').addEventListener('click', () => { if (store.redo()) announce('Redone'); });

  const saveEl = $('#save-state');
  store.onSaveState((s) => {
    saveEl.dataset.state = s;
    saveEl.textContent = s === 'error' ? 'Couldn’t save on this device' : s === 'saving' ? 'Saving…' : 'Saved on this device';
  });

  // — Toast: a short confirmation (saved, opened) or problem, also read out to screen readers —
  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(msg, { error = false } = {}) {
    clearTimeout(toastTimer);
    toastEl.hidden = true;
    toastEl.textContent = msg;
    toastEl.classList.toggle('is-error', error);
    void toastEl.offsetWidth;
    toastEl.hidden = false;
    announce(msg);
    toastTimer = setTimeout(() => (toastEl.hidden = true), error ? 6000 : 3600);
  }
  S.toast = toast;

  // — Publish: the link name, a look as a visitor, then live (publish.js) —
  S.publish.attach($('#publish-btn'), {
    get: () => store.get(),
    setSlug: (slug) => store.commit((d) => { d.data.slug = slug; }, { kind: 'content', key: 'slug' }),
    visit: () => { mode.set('visitor'); showMode('visitor'); },
    subscribe: store.subscribe,
  });

  // — File: save the page to a file, open one, start a new page (files.js, firstrun.js) —
  const fileBtn = $('#file-btn'), fileMenu = $('#file-menu'), fileInput = $('#open-file');
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  fileMenu.querySelectorAll('kbd[data-key]').forEach((k) => (k.textContent = (mac ? '⌘' : 'Ctrl ') + k.dataset.key));
  const items = () => [...fileMenu.querySelectorAll('[role=menuitem]')];
  function menu(open, focusFirst) {
    fileMenu.hidden = !open;
    fileBtn.setAttribute('aria-expanded', String(open));
    if (open && focusFirst) items()[0].focus();
  }
  fileBtn.addEventListener('click', () => menu(fileMenu.hidden, true));
  fileMenu.addEventListener('keydown', (e) => {
    const list = items(), i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); menu(false); fileBtn.focus(); }
    else if (e.key === 'Tab') menu(false);
  });
  document.addEventListener('pointerdown', (e) => { if (!fileMenu.hidden && !e.target.closest('.menu-wrap')) menu(false); });
  fileMenu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    menu(false);
    ({ save: savePage, open: () => fileInput.click(), new: () => startFirstRun({ replacing: true }) })[b.dataset.act]();
  });

  async function savePage() {
    try { toast(`Saved ${await S.files.save(store.get())}. Open it any time with File › Open.`); }
    catch (e) { toast('Couldn’t save the file. Try again.', { error: true }); }
  }

  /** Is there a page worth keeping on screen right now (so opening a file should be undoable)? */
  const hasPage = () => !!(A.fullName(store.get().data) || store.canUndo());
  let afterOpen = null; // set while the first run is open: closes it once a file opens
  async function openPage(file) {
    let res;
    try { res = await S.files.open(file); }
    catch (e) { toast(e.friendly ? e.message : 'That file couldn’t be opened.', { error: true }); return; }
    const name = A.fullName(res.profile.data) || 'the page';
    if (afterOpen) { const close = afterOpen; afterOpen = null; close(); store.load(res.profile); }
    else if (hasPage()) store.commit((d) => { d.data = res.profile.data; d.design = res.profile.design; }, { kind: 'load' });
    else store.load(res.profile);
    panel.go('home', { back: true, focusTitle: false });
    toast(`Opened ${name}${res.dropped ? ` (${res.dropped} photo${res.dropped > 1 ? 's' : ''} couldn’t be read)` : ''}.${store.canUndo() ? ' Undo brings your page back.' : ''}`);
  }
  fileInput.addEventListener('change', () => { const f = fileInput.files[0]; fileInput.value = ''; if (f) openPage(f); });
  // Drop a page file anywhere on the editor. (Photo drop zones handle photos themselves.)
  addEventListener('dragover', (e) => { if (!e.defaultPrevented && [...e.dataTransfer.items].some((i) => i.kind === 'file')) e.preventDefault(); });
  addEventListener('drop', (e) => {
    if (e.defaultPrevented) return;
    e.preventDefault(); // never let the browser navigate away to a dropped file
    const f = [...e.dataTransfer.files].find(S.files.looksLikePageFile);
    if (f) openPage(f);
    else if (e.dataTransfer.files.length) toast('To add photos, drop them on a photo spot in the panel (Cover or Gallery).');
  });

  // — First run: a new page (no saved page, ?start, or File › Start a new page) —
  // ?from=<example> starts from that homepage example's whole design ("Start with this style"):
  // look, colors, fonts, cover and layouts, photo treatment, section order. Never its words or photos.
  // (A test athlete's key works too, for testing.) ?look=<look> starts in that look's defaults.
  // Otherwise "Create your own" starts in Cinematic.
  const DESIGN_KEYS = ['look', 'palette', 'accent', 'type', 'photo', 'layout', 'order', 'intro'];
  function startingDesign({ from = '', look = '' } = {}) {
    const src = exampleOf(from) || (A.ATHLETES[from] ? A.normalizeProfile(A.ATHLETES[from]) : null);
    if (src) return { design: Object.fromEntries(DESIGN_KEYS.map((k) => [k, structuredClone(src.design[k])])), name: A.fullName(src.data) };
    return { design: { look: A.LOOKS[look] ? look : 'cinematic' }, name: '' };
  }
  // ?slug=<name>: the link they claimed on the homepage, cleaned to the product's rule (a letter first,
  // then a–z, 0–9 and single hyphens, 3–30). Only a suggestion: it's checked again at Publish.
  const cleanSlug = (v) => { const s = String(v || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/--+/g, '-').replace(/^[^a-z]+/, '').slice(0, 30).replace(/-+$/, ''); return s.length >= 3 ? s : ''; };
  function startFirstRun({ replacing = false, from = '', look = '', slug = '', account = false } = {}) {
    menu(false);
    const start = startingDesign({ from, look });
    const run = S.firstRun.open({
      replacing, design: start.design, account,
      onDone: (p) => {
        afterOpen = null;
        if (cleanSlug(slug)) p.data.slug = cleanSlug(slug);
        if (replacing) store.commit((d) => { d.data = p.data; d.design = p.design; }, { kind: 'load' });
        else store.load(p);
        panel.go('home', { back: true, focusTitle: false });
        // One tip, on the panel's home screen, about where the other looks are. On phones the
        // sheet rises halfway so the tip (and the tools) can be seen, with the page above it.
        if (narrow()) setSheet('half');
        const lookName = A.LOOKS[p.design.look].name;
        panel.hint({
          text: start.name ? `Your page starts in ${start.name}’s style (${lookName}). Make it yours in Design: other looks, colors, fonts and layouts.` : `Your page starts in ${lookName}. There are four more looks to try, plus colors, fonts and layouts.`,
          action: 'Try the other looks',
        });
        announce('Your page is ready. Click anything on it to change it.');
      },
      onOpenFile: (close) => { afterOpen = close; fileInput.click(); },
      onCancel: () => { afterOpen = null; },
    });
    return run;
  }

  // Internal only: swap in a fictional test athlete to try the editor with different content.
  // Also the homepage examples (examples/examples.js, made with tools/add-example.js), to edit one.
  const pick = $('#test-athlete');
  if (!new URLSearchParams(location.search).has('dev')) pick.closest('.test-pick').remove(); // live: never shown
  const EXAMPLES = A.EXAMPLES || {};
  const exampleOf = (k) => (EXAMPLES[k] ? A.normalizeProfile(EXAMPLES[k]) : null);
  if (pick.isConnected) pick.insertAdjacentHTML('beforeend', `<optgroup label="Test athletes">${A.CAST.map(([k, name, note]) => `<option value="${k}">${name} (${note})</option>`).join('')}</optgroup>`
    + (Object.keys(EXAMPLES).length ? `<optgroup label="Homepage examples">${Object.keys(EXAMPLES).map((k) => `<option value="ex:${k}">${A.fullName(exampleOf(k).data) || k}</option>`).join('')}</optgroup>` : ''));
  if (pick.isConnected) pick.addEventListener('change', () => {
    const k = pick.value;
    pick.value = '';
    const p = k.startsWith('ex:') ? exampleOf(k.slice(3)) : A.ATHLETES[k] ? structuredClone(A.ATHLETES[k]) : null;
    if (!p) return;
    store.load(p);
    panel.go('home', { back: true, focusTitle: false });
    announce(`Loaded ${k.startsWith('ex:') ? 'example' : 'test athlete'} ${A.fullName(p.data)}`);
  });

  function syncBar() {
    $('#undo').disabled = !store.canUndo();
    $('#redo').disabled = !store.canRedo();
  }

  // — Keyboard: undo/redo anywhere (including inside the page preview), Escape goes back —
  function keys(e) {
    if (document.body.classList.contains('has-fr')) return; // the first run is on top; it has its own keys
    const mod = e.ctrlKey || e.metaKey;
    const typing = e.target && e.target.closest && e.target.closest('input[type=text],input:not([type]),textarea,[contenteditable]');
    if (mod && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); if (!document.querySelector('.fr')) savePage(); return; }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); fileInput.click(); return; }
    if (mod && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey ? store.redo() : store.undo()) announce(e.shiftKey ? 'Redone' : 'Undone'); return; }
    if (mod && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); if (store.redo()) announce('Redone'); return; }
    if (e.key === 'Escape' && panel.screen && panel.screen !== 'home' && !typing && !e.target.closest?.('select')) { panel.go('home', { back: true }); }
  }
  addEventListener('keydown', keys);

  // — Start: ?a=<athlete> loads a test athlete; otherwise the last saved page; with no saved page
  //   (or ?start, e.g. the homepage's "Start with this style" with ?look=…) the first run —
  store.subscribe((p, change) => {
    // While typing, the page catches up a moment after you pause instead of rebuilding per key.
    preview.update(p, { delay: change && change.kind === 'content' && change.key ? 320 : 0 });
    panel.sync(p, change);
    syncBar();
  });
  // A stored photo that finishes loading redraws the page and the panel's thumbnails.
  S.photos.onLoaded(() => { preview.update(store.get()); panel.sync(store.get(), { kind: 'photos' }); });
  const q = new URLSearchParams(location.search);
  const saved = store.readSaved();
  const example = exampleOf(q.get('ex'));
  const fresh = !A.ATHLETES[q.get('a')] && !example && (!saved || q.has('start'));
  if (example) store.load(example);
  else if (A.ATHLETES[q.get('a')]) store.load(structuredClone(A.ATHLETES[q.get('a')]));
  else if (saved) store.load(saved, { save: false });
  else store.load(A.createEmptyProfile(), { save: false }); // nothing is saved until the first run ends
  // Photos the saved page no longer uses are cleared out (no undo history exists yet at this point).
  // A first run's own uploads aren't in any page yet, so this runs before it starts.
  S.photos.cleanup(S.photos.refsIn(saved || store.get()).concat(S.photos.refsIn(store.get())));
  panel.go('home', { focusTitle: false });
  if (q.get('device') === 'phone') { preview.setDevice('phone'); device.set('phone', true); }
  if (fresh) startFirstRun({ replacing: !!saved, from: q.get('from') || '', look: q.get('look') || '', slug: q.get('slug') || '', account: !saved && q.get('account') !== '0' });
})();
