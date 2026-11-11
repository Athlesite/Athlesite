/*
 * Athlesite Studio — content editors for each section (step 2).
 *
 * S.editors[key]() returns the blocks for that section's screen, built from the field controls in
 * fields.js. Wording is plain and second person; everything is optional, and anything empty simply
 * doesn't show on the page. The sport catalog only ever suggests (ticked items are what the athlete
 * chose), per Willy: "not everyone will need a sports catalog section".
 */
(function () {
  const A = window.Athlesite, S = A.studio, store = S.store, F = S.fields;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const norm = (s) => String(s || '').trim().toLowerCase();
  const T = (o) => F.Text(o), Sel = (o) => F.Select(o);

  // — Layout helpers —
  /** A titled block of controls. */
  function group(title, hint, controls) {
    const el = h(`<section class="block"><header><h3>${esc(title)}</h3>${hint ? `<p>${esc(hint)}</p>` : ''}</header><div class="block-body"></div></section>`);
    const body = el.querySelector('.block-body');
    controls.forEach((c) => body.appendChild(c.el));
    return { el, sync: (p, ch) => controls.forEach((c) => c.sync && c.sync(p, ch)) };
  }
  /** Controls side by side (they wrap on a narrow panel). */
  function row(controls) {
    const el = h('<div class="field-row"></div>');
    controls.forEach((c) => el.appendChild(c.el));
    return { el, sync: (p, ch) => controls.forEach((c) => c.sync(p, ch)) };
  }
  /** Shown only when a test passes (college-only fields, NIL details when NIL is on…). */
  function when(test, c) {
    return { el: c.el, sync(p, ch) { const on = !!test(p); c.el.hidden = !on; if (on) c.sync(p, ch); } };
  }
  /** A segmented choice bound to a path. */
  function choice({ label, path, options, wrap, field }) {
    const wrapEl = h(`<div class="field" data-fieldkey="${esc(field || path)}"><p class="field-label">${esc(label)}</p></div>`);
    const seg = S.ui.Seg({ label, wrap, onPick: (v) => store.commit((p) => F.set(p, path, v), { kind: 'content', key: null }) });
    seg.items(options);
    wrapEl.appendChild(seg.el);
    return { el: wrapEl, input: seg.el, sync: (p) => seg.set(String(F.get(p, path) ?? '')) };
  }
  /** An on/off switch bound to a path. */
  function toggle({ label, path, field }) {
    const sw = S.ui.Switch({ label, onToggle: (on) => store.commit((p) => F.set(p, path, on), { kind: 'content', key: null }) });
    sw.el.dataset.fieldkey = field || path;
    return { el: sw.el, input: sw.el, sync: (p) => sw.set(!!F.get(p, path)) };
  }
  /** A small static note inside a block. */
  const note = (text) => ({ el: h(`<p class="hint">${esc(text)}</p>`), sync() {} });

  const sportOptions = () => Object.entries(A.SPORT_CATALOG)
    .sort(([a], [b]) => (a === 'other') - (b === 'other'))
    .map(([id, x]) => ({ id, label: x.label === 'Other' ? 'Another sport' : x.label }));
  const sportOf = (p) => A.SPORT_CATALOG[p.data.sport] || A.SPORT_CATALOG.other;
  const suggestions = (p) => A.suggestFor(p.data.sport, p.data.position, p.data.level);

  /** What a pasted link will do on the page, said before it's published. */
  function linkNote(url, kind = 'video') {
    const u = String(url || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) return 'Paste the whole link, starting with https://';
    if (!A.links.safeLink(u)) return 'That doesn’t look like a web link yet, so it won’t show.';
    if (kind === 'video') return `Opens on ${A.links.platformOf(u) === 'Video' ? new URL(u).hostname.replace(/^www\./, '') : A.links.platformOf(u)}.`;
    return `Shows as “${A.links.siteOf(u)}”.`;
  }
  const words = (s) => (String(s || '').trim() ? String(s).trim().split(/\s+/).length : 0);

  // ———————————————————————————— Photos ————————————————————————————
  const P = () => S.photos;
  /** Read picked files into stored photos; tells the athlete when one can't be opened. */
  async function readFiles(files) {
    const out = [];
    for (const f of files) {
      if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|avif|heic)$/i.test(f.name)) continue;
      try { out.push(Object.assign(await P().add(f), { name: f.name })); }
      catch (e) { S.announce && S.announce(`Couldn’t open ${f.name}. Try a JPG or PNG.`); alertNote(`Couldn’t open “${f.name}”. Try a JPG or PNG (iPhone photos: Settings › Camera › Formats › Most Compatible).`); }
    }
    return out;
  }
  let alertNote = () => {};
  const smallNote = (src, img) => {
    const size = P().sizeOf(src) || (img && img.naturalWidth ? { w: img.naturalWidth, h: img.naturalHeight } : null);
    return size && Math.max(size.w, size.h) < P().SMALL ? `This photo is small (${size.w}×${size.h}), so it may look soft on big screens. A bigger one looks sharper.` : '';
  };
  /** A file button (label + hidden input) that also accepts dropped files. */
  function fileButton(text, multiple, onFiles) {
    const el = h(`<label class="btn file-btn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg><span>${esc(text)}</span><input type="file" accept="image/*"${multiple ? ' multiple' : ''} class="sr-only"></label>`);
    const input = el.querySelector('input');
    input.addEventListener('change', async () => { const files = [...input.files]; input.value = ''; if (files.length) onFiles(await readFiles(files)); });
    return { el, input, setText: (t) => (el.querySelector('span').textContent = t) };
  }
  /** Drop photos onto an area. */
  function dropZone(area, onFiles) {
    area.addEventListener('dragover', (e) => { if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) { e.preventDefault(); area.classList.add('is-drop'); } });
    area.addEventListener('dragleave', () => area.classList.remove('is-drop'));
    area.addEventListener('drop', async (e) => { e.preventDefault(); area.classList.remove('is-drop'); const files = [...e.dataTransfer.files]; if (files.length) onFiles(await readFiles(files)); });
  }

  /**
   * The cover photo: upload, then tap or drag on it to choose what stays in frame, zoom, and see the
   * crop on a computer and on a phone side by side (same object-position + scale as the page).
   */
  function coverPhoto() {
    const el = h(`<div class="photo-edit" data-fieldkey="heroPhoto">
      <div class="photo-stage" hidden><img alt=""><span class="focus-dot" aria-hidden="true"></span></div>
      <div class="photo-empty"><p>No cover photo yet. A tall, well-lit photo of you in action or in uniform works best.</p></div>
      <div class="crops" hidden aria-hidden="true">
        <figure><div class="crop crop-wide"><img alt=""></div><figcaption>Computer</figcaption></figure>
        <figure><div class="crop crop-tall"><img alt=""></div><figcaption>Phone</figcaption></figure>
      </div>
      <label class="zoom" hidden><span>Zoom</span><input type="range" min="1" max="1.8" step="0.01"></label>
      <p class="photo-warn" hidden></p>
      <div class="photo-buttons"></div>
    </div>`);
    const stage = el.querySelector('.photo-stage'), stageImg = stage.querySelector('img'), dot = stage.querySelector('.focus-dot');
    const empty = el.querySelector('.photo-empty'), crops = el.querySelector('.crops'), zoomLabel = el.querySelector('.zoom'), zoom = zoomLabel.querySelector('input');
    const warn = el.querySelector('.photo-warn'), buttons = el.querySelector('.photo-buttons');
    const setPhoto = (r) => {
      if (!r) return;
      store.commit((p) => { p.data.heroPhotoUrl = r.ref; p.data.heroPhotoPositionX = 0.5; p.data.heroPhotoPositionY = 0.35; p.data.heroPhotoZoom = 1; }, { kind: 'content', key: null });
      S.announce && S.announce('Cover photo added. Tap the photo to choose what stays in frame.');
    };
    const up = fileButton('Upload a photo', false, (list) => setPhoto(list[0]));
    const remove = h('<button type="button" class="btn">Remove</button>');
    remove.addEventListener('click', () => store.commit((p) => { p.data.heroPhotoUrl = ''; }, { kind: 'content', key: null }));
    buttons.append(up.el, remove);
    alertNote = (t) => { warn.textContent = t; warn.hidden = false; };
    dropZone(el, (list) => setPhoto(list[0]));

    // Focus point: where you tap is what the page keeps in view at every screen shape.
    const focusAt = (e) => {
      const r = stageImg.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      store.commit((p) => { p.data.heroPhotoPositionX = +x.toFixed(3); p.data.heroPhotoPositionY = +y.toFixed(3); }, { kind: 'content', key: 'photo-focus' });
    };
    stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); focusAt(e); stage.classList.add('is-dragging'); });
    stage.addEventListener('pointermove', (e) => { if (stage.hasPointerCapture(e.pointerId)) focusAt(e); });
    stage.addEventListener('pointerup', () => stage.classList.remove('is-dragging'));
    // Keyboard: arrows nudge the focus point.
    stage.tabIndex = 0;
    stage.setAttribute('role', 'slider');
    stage.setAttribute('aria-label', 'Focus point: arrow keys move what stays in frame');
    stage.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, -0.02], ArrowDown: [0, 0.02] }[e.key];
      if (!d) return;
      e.preventDefault();
      store.commit((p) => { p.data.heroPhotoPositionX = Math.min(1, Math.max(0, +(p.data.heroPhotoPositionX + d[0]).toFixed(3))); p.data.heroPhotoPositionY = Math.min(1, Math.max(0, +(p.data.heroPhotoPositionY + d[1]).toFixed(3))); }, { kind: 'content', key: 'photo-focus' });
    });
    zoom.addEventListener('input', () => store.commit((p) => { p.data.heroPhotoZoom = +zoom.value; }, { kind: 'content', key: 'photo-zoom' }));
    stageImg.addEventListener('load', () => { const n = smallNote(store.get().data.heroPhotoUrl, stageImg); warn.textContent = n; warn.hidden = !n; });

    return {
      el,
      sync(p) {
        const d = p.data, src = P().url(d.heroPhotoUrl), has = !!d.heroPhotoUrl;
        stage.hidden = crops.hidden = zoomLabel.hidden = !has;
        empty.hidden = has;
        remove.hidden = !has;
        up.setText(has ? 'Replace photo' : 'Upload a photo');
        if (!has) { warn.hidden = true; return; }
        el.querySelectorAll('img').forEach((img) => { if (src && img.getAttribute('src') !== src) img.src = src; });
        const x = d.heroPhotoPositionX * 100, y = d.heroPhotoPositionY * 100;
        dot.style.left = x + '%'; dot.style.top = y + '%';
        stage.setAttribute('aria-valuetext', `${Math.round(x)}% across, ${Math.round(y)}% down`);
        crops.querySelectorAll('img').forEach((img) => { img.style.objectPosition = `${x}% ${y}%`; img.style.transformOrigin = `${x}% ${y}%`; img.style.transform = `scale(${d.heroPhotoZoom})`; });
        if (document.activeElement !== zoom) zoom.value = d.heroPhotoZoom;
      },
    };
  }

  /** Gallery photos: add several at once (or drop them), then caption, describe, order or remove. */
  /**
   * Focus points for photos in a list (gallery photos, video posters): pick a photo from the strip,
   * then tap, drag or use the arrow keys to choose what stays in frame; the previews show the shapes
   * the page crops it to. It sits outside the list (and the lists ignore x/y), so nothing rebuilds
   * under your finger while you drag.
   *   o: { items(p) → [{ i, src, label }], get(p, i) → item, crops: [{ cls, label }], key }
   * Stored on the item as x, y (0–1); unset = the middle.
   */
  function focusPicker(o) {
    const el = h(`<div class="focus-pick" hidden>
      <div class="focus-thumbs" role="radiogroup" aria-label="Choose a photo"></div>
      <div class="photo-stage"><img alt=""><span class="focus-dot" aria-hidden="true"></span></div>
      <div class="crops" aria-hidden="true">${o.crops.map((c) => `<figure><div class="crop ${c.cls}"><img alt=""></div><figcaption>${esc(c.label)}</figcaption></figure>`).join('')}</div>
    </div>`);
    const thumbs = el.querySelector('.focus-thumbs'), stage = el.querySelector('.photo-stage'), stageImg = stage.querySelector('img'), dot = stage.querySelector('.focus-dot');
    let sel = -1, lastKey = '';
    const xyOf = (it) => [typeof it.x === 'number' ? it.x : 0.5, typeof it.y === 'number' ? it.y : 0.5];
    const write = (x, y) => store.commit((p) => { const it = o.get(p, sel); if (it) { it.x = +Math.min(1, Math.max(0, x)).toFixed(3); it.y = +Math.min(1, Math.max(0, y)).toFixed(3); } }, { kind: 'content', key: `${o.key}-${sel}` });
    const focusAt = (e) => { const r = stageImg.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return; write((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); }; // (not until the photo has loaded)
    stage.addEventListener('pointerdown', (e) => { if (sel < 0) return; stage.setPointerCapture(e.pointerId); focusAt(e); stage.classList.add('is-dragging'); });
    stage.addEventListener('pointermove', (e) => { if (stage.hasPointerCapture(e.pointerId)) focusAt(e); });
    stage.addEventListener('pointerup', () => stage.classList.remove('is-dragging'));
    stage.tabIndex = 0;
    stage.setAttribute('role', 'slider');
    stage.setAttribute('aria-label', 'Focus point: arrow keys move what stays in frame');
    stage.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, -0.02], ArrowDown: [0, 0.02] }[e.key];
      if (!d || sel < 0) return;
      e.preventDefault();
      const [x, y] = xyOf(o.get(store.get(), sel));
      write(x + d[0], y + d[1]);
    });
    thumbs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      sel = +b.dataset.i;
      sync(store.get());
    });
    function sync(p) {
      const items = o.items(p).filter((x) => x.src);
      el.hidden = !items.length;
      if (!items.length) return;
      if (!items.some((x) => x.i === sel)) sel = items[0].i;
      const key = items.map((x) => x.i + ':' + x.src).join('|');
      if (key !== lastKey) {
        lastKey = key;
        thumbs.innerHTML = items.map((x) => `<button type="button" role="radio" data-i="${x.i}" aria-label="${esc(x.label)}"><img alt=""></button>`).join('');
        items.forEach((x) => { thumbs.querySelector(`[data-i="${x.i}"] img`).src = P().url(x.src); });
      }
      thumbs.querySelectorAll('[data-i]').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.i === sel)));
      const it = o.get(p, sel), src = P().url(it.src || it.poster);
      el.querySelectorAll('.photo-stage img, .crops img').forEach((img) => { if (src && img.getAttribute('src') !== src) img.src = src; });
      const [x, y] = xyOf(it);
      dot.style.left = x * 100 + '%'; dot.style.top = y * 100 + '%';
      stage.setAttribute('aria-valuetext', `${Math.round(x * 100)}% across, ${Math.round(y * 100)}% down`);
      el.querySelectorAll('.crops img').forEach((img) => { img.style.objectPosition = `${x * 100}% ${y * 100}%`; });
    }
    return { el, sync };
  }

  function galleryPhotos() {
    const list = F.List({
      path: 'data.gallery', field: 'gallery', itemName: 'Photo', noAdd: true, max: 24, ignore: ['x', 'y'],
      empty: 'No photos yet. Add a few: game action, team moments, training.',
      blank: () => ({ src: '', alt: '', caption: '' }),
      fields: [
        { key: 'caption', label: 'Caption (optional)', placeholder: 'Senior night', max: 60, wide: true },
        { key: 'alt', label: 'Describe it (for screen readers)', placeholder: 'Me and my teammates after the final', max: 140, wide: true },
      ],
      after: (row) => { row.classList.add('has-thumb'); row.insertAdjacentHTML('afterbegin', '<span class="row-thumb"><img alt=""></span>'); },
      each: (row, g) => { const img = row.querySelector('.row-thumb img'), src = P().url(g.src); if (src && img.getAttribute('src') !== src) img.src = src; },
      rowNote: (g) => (P().sizeOf(g.src) && Math.max(P().sizeOf(g.src).w, P().sizeOf(g.src).h) < P().SMALL ? 'Small photo: it may look soft when shown large.' : ''),
    });
    const add = fileButton('Add photos', true, (photos) => {
      if (!photos.length) return;
      store.commit((p) => { photos.forEach((r) => p.data.gallery.push({ src: r.ref, alt: '', caption: '' })); }, { kind: 'content', key: null });
      S.announce && S.announce(`${photos.length} photo${photos.length > 1 ? 's' : ''} added`);
    });
    const wrap = h('<div class="gallery-edit"></div>');
    wrap.append(add.el, list.el);
    dropZone(wrap, (photos) => photos.length && store.commit((p) => { photos.forEach((r) => p.data.gallery.push({ src: r.ref, alt: '', caption: '' })); }, { kind: 'content', key: null }));
    return { el: wrap, sync: (p, ch) => list.sync(p, ch) };
  }

  /** Optional poster for one video (else the page uses a gallery photo or the cover). */
  function posterControl(row, i) {
    const box = h('<div class="poster-ctl"><span class="row-thumb"><img alt=""></span><span class="poster-label">Poster</span></div>');
    const pick = fileButton('Add a poster', false, (list) => list[0] && store.commit((p) => { p.data.highlightLinks[i].poster = list[0].ref; }, { kind: 'content', key: null }));
    const clear = h('<button type="button" class="btn btn-quiet">Remove poster</button>');
    clear.addEventListener('click', () => store.commit((p) => { delete p.data.highlightLinks[i].poster; }, { kind: 'content', key: null }));
    box.append(pick.el, clear);
    row.querySelector('.row-fields').appendChild(box);
    box._pick = pick; box._clear = clear;
  }

  // ———————————————————————————— Cover ————————————————————————————
  function cover() {
    const year = new Date().getFullYear();
    const classYears = [{ id: '', label: 'Choose…' }, ...Array.from({ length: 7 }, (_, i) => String(year - 1 + i)).map((y) => ({ id: y, label: y }))];
    const college = A.LEVELS.college.details;
    const opts = (key) => [{ id: '', label: 'Choose…' }, ...college.find((x) => x.key === key).options.map((o) => ({ id: o, label: o }))];
    return [
      group('Cover photo', 'Tap or drag on the photo to choose what stays in frame on every screen.', [coverPhoto(),
        T({ label: 'Describe the photo (for screen readers)', path: 'data.heroPhotoAlt', max: 140, placeholder: 'Me before my last game of the season' })]),
      group('Name and sport', '', [
        row([
          T({ label: 'First name', path: 'data.firstName', field: 'name', max: 40, spell: false, autocomplete: 'given-name' }),
          T({ label: 'Last name', path: 'data.lastName', max: 40, spell: false, autocomplete: 'family-name' }),
        ]),
        Sel({ label: 'Sport', path: 'data.sport', options: sportOptions, hint: 'Sets the words on your page and the ideas in Stats and Details. It never adds anything for you.' }),
        row([
          T({ label: 'Position', path: 'data.position', max: 40, placeholder: 'Pick one or type your own', suggest: (p) => sportOf(p).positions.map((x) => x.label) }),
          when((p) => sportOf(p).number !== false, T({ label: 'Number', path: 'data.jerseyNumber', field: 'number', short: true, max: 3, inputmode: 'numeric', spell: false })),
        ]),
      ]),
      group('Where you play', '', [
        choice({ label: 'Level', path: 'data.level', options: [{ id: 'hs', label: 'High school' }, { id: 'college', label: 'College' }] }),
        T({ label: 'School or team', path: 'data.schoolOrTeam', max: 60, placeholder: 'Northview High School' }),
        when((p) => p.data.level !== 'college', Sel({ label: 'Class of', path: 'data.classYear', options: classYears, short: true })),
        when((p) => p.data.level === 'college', row([
          Sel({ label: 'Year', path: 'data.academicYear', options: opts('academicYear') }),
          Sel({ label: 'Eligibility left', path: 'data.eligibility', options: opts('eligibility') }),
        ])),
        when((p) => p.data.level === 'college', toggle({ label: 'Redshirt', path: 'data.redshirt' })),
      ]),
      group('Under your name', '', [
        T({ label: 'Headline', path: 'data.tagline', field: 'tagline', max: 90, placeholder: 'Driven by the chase. Focused on what’s next.', note: (p, v) => `${v.length} of 90 characters` }),
      ]),
    ];
  }

  // ———————————————————————————— Film ————————————————————————————
  function film() {
    return [group('Your videos', 'Paste links from Hudl, YouTube or Vimeo. Your first video is the big one.', [
      F.List({
        path: 'data.highlightLinks', field: 'film', itemName: 'Video', addLabel: 'Add a video', max: 8, ignore: ['x', 'y'],
        empty: 'No videos yet. Paste a Hudl, YouTube or Vimeo link to add one.',
        blank: () => ({ label: '', url: '' }),
        fields: [
          { key: 'label', label: 'Title', placeholder: 'Junior season highlights', max: 60 },
          { key: 'url', label: 'Link', placeholder: 'https://www.hudl.com/…', inputmode: 'url', spell: false, wide: true },
        ],
        rowNote: (x) => linkNote(x.url, 'video'),
        after: (row, i) => posterControl(row, i),
        each: (row, x) => {
          const box = row.querySelector('.poster-ctl'), img = box.querySelector('img'), src = x.poster ? P().url(x.poster) : '';
          box.classList.toggle('has-poster', !!x.poster);
          if (src && img.getAttribute('src') !== src) img.src = src;
          box._pick.setText(x.poster ? 'Change poster' : 'Add a poster (optional)');
          box._clear.hidden = !x.poster;
        },
      }),
    ]),
    group('Poster focus', 'For videos with a poster: tap what should stay in frame. The Reel shows posters tall, like a phone; the list shows them wide.', [
      focusPicker({
        key: 'poster-focus',
        items: (p) => p.data.highlightLinks.map((v, i) => ({ i, src: v.poster || '', label: v.label || `Video ${i + 1}` })),
        get: (p, i) => p.data.highlightLinks[i],
        crops: [{ cls: 'crop-916', label: 'Reel' }, { cls: 'crop-169', label: 'Wide' }],
      }),
    ])];
  }

  // ———————————————————————————— Stats ————————————————————————————
  function stats() {
    const has = (p, label) => p.data.stats.find((s) => norm(s.label) === norm(label));
    return [
      group('Your numbers', 'The first three also show on your cover. Leave one empty and it stays off the page.', [
        F.List({
          path: 'data.stats', field: 'stats', itemName: 'Number', addLabel: 'Add your own', max: 16,
          empty: 'No numbers yet. Tick an idea below or add your own.',
          blank: () => ({ label: '', value: '', context: '' }),
          fields: [
            { key: 'label', label: 'What', placeholder: 'Receiving yards', max: 40 },
            { key: 'value', label: 'Number', placeholder: '842', max: 14, spell: false },
            { key: 'context', label: 'When or where', placeholder: '2025 season', max: 40 },
          ],
          rowNote: (s, i) => (!String(s.value || '').trim() ? 'Empty, so it’s not on your page yet.' : i < 3 ? 'Also on your cover.' : ''),
        }),
      ]),
      group('Ideas for your sport', 'Only suggestions. Tick one to add it above, then fill in your number. “Common” ones are what most athletes at your position list.', [
        F.Checklist({
          label: 'Stats and measurables', field: 'stats-ideas',
          items: (p) => {
            const s = suggestions(p);
            return [...s.stats.map((x) => ({ key: x.key, label: x.label, common: x.checked, group: 'Season stats' })),
              ...s.measurables.map((x) => ({ key: x.key, label: x.label, common: x.checked, group: 'Measurables' }))];
          },
          isOn: (p, it) => !!has(p, it.label),
          add: (p, it) => { if (!has(p, it.label)) p.data.stats.push({ label: it.label, value: '', context: '' }); },
          remove: (p, it) => { p.data.stats = p.data.stats.filter((s) => !(norm(s.label) === norm(it.label) && !String(s.value || '').trim())); },
          canRemove: (p, it) => { const s = has(p, it.label); return !s || !String(s.value || '').trim(); },
        }),
      ]),
    ];
  }

  // ———————————————————————————— Story, your section, milestones ————————————————————————————
  function story() {
    return [group('Your story', 'Write it like you’d say it. A blank line starts a new paragraph.', [
      T({ label: 'About you', path: 'data.bio', field: 'bio', multiline: true, rows: 9, max: 2000, placeholder: 'Who you are as a player and a person, what drives you, what’s next.', note: (p, v) => `${words(v)} words${words(v) > 250 ? ' — the best pages keep it under 250' : ''}` }),
    ])];
  }

  function custom() {
    return [group('Your own section', 'Anything you want people to know: a cause, another sport, music, school. It shows once it has a title and words.', [
      T({ label: 'Title', path: 'data.custom.title', field: 'custom-title', max: 40, placeholder: 'Beyond the game' }),
      T({ label: 'Words', path: 'data.custom.body', field: 'custom-body', multiline: true, rows: 7, max: 1500, placeholder: 'A blank line starts a new paragraph.', note: (p, v) => `${words(v)} words` }),
    ])];
  }

  /**
   * Results (step 4): one row per meet, race or tournament. The columns are the sport's (Event ·
   * Mark · Meet · Date for track) unless the athlete renames them; sports without a results table get
   * a general one (anyone can use the section). A best mark can be flagged where the sport has a
   * badge for it ("PR"). The list is built for the columns as they are when the screen opens.
   */
  function results() {
    const setup = A.resultsSetup(store.get().data);
    const sport = A.SPORTS[store.get().data.sport];
    const list = F.List({
      path: 'data.results', field: 'results', itemName: 'Result', addLabel: 'Add a result', max: 60,
      empty: 'No results yet. Add a meet, race or tournament.',
      blank: () => ({ a: '', b: '', c: '', d: '', e: '', pb: false }),
      // The event takes the full width; the headline value (a mark, time or place) is short.
      fields: setup.columns.map((col, i) => ({ key: setup.keys[i], label: col, placeholder: setup.examples[i] || '', max: i === 0 ? 60 : 40, spell: i === 0, wide: i === 0, short: i === setup.key })),
      rowNote: (r) => (!setup.keys.some((k) => String(r[k] || '').trim()) ? 'Empty, so it’s not on your page yet.' : ''),
      after: setup.pb ? (row, i, fieldsEl) => {
        const lab = h(`<label class="row-check"><input type="checkbox"><span>Best mark (shows “${esc(setup.pb)}”)</span></label>`);
        const box = lab.querySelector('input');
        box.addEventListener('change', () => store.commit((p) => { if (p.data.results[i]) p.data.results[i].pb = box.checked; }, { kind: 'content', key: null }));
        fieldsEl.appendChild(lab);
      } : undefined,
      each: setup.pb ? (row, r) => { const box = row.querySelector('.row-check input'); if (box) box.checked = !!r.pb; } : undefined,
    });
    return [
      group('Your results', setup.fromSport
        ? `Meets, races and tournaments, best first. Your ${sport ? sport.label.toLowerCase() : 'sport'} table: ${setup.defaults.columns.join(' · ')}.`
        : 'For anything measured in results: tournaments, races, rankings. Leave the section empty and it stays off your page.', [
        T({ label: 'Section title', path: 'data.resultsTitle', field: 'results-title', max: 40, placeholder: setup.defaults.title }),
        list,
      ]),
      group('Column names', 'Rename a column if your results are different. Leave it blank for the usual name.', [
        row(setup.defaults.columns.map((col, i) => T({ label: `Column ${i + 1}`, path: `data.resultColumns.${i}`, field: `results-col-${i}`, max: 30, placeholder: col }))),
      ]),
    ];
  }

  function milestones() {
    return [group('Milestones', 'Awards, records, teams, camps, offers — newest first reads best.', [
      F.List({
        path: 'data.milestones', field: 'milestones', itemName: 'Milestone', addLabel: 'Add a milestone', max: 12,
        empty: 'Nothing yet. Add your first award, record or team.',
        blank: () => ({ year: String(new Date().getFullYear()), title: '', detail: '' }),
        fields: [
          { key: 'year', label: 'Year', placeholder: '2025', max: 9, spell: false, short: true },
          { key: 'title', label: 'What', placeholder: 'All-conference first team', max: 60, wide: true },
          { key: 'detail', label: 'Detail (optional)', placeholder: 'Central Ohio League', max: 90, wide: true },
        ],
        rowNote: (m) => (!String(m.title || '').trim() ? 'Needs a “What” to show.' : ''),
      }),
    ])];
  }

  // ———————————————————————————— NIL ————————————————————————————
  function nil() {
    const OFFERS = ['Instagram posts', 'TikTok videos', 'Appearances', 'Camps and clinics', 'Autographs', 'Local business promos', 'Product reviews', 'Speaking at schools'];
    return [
      group('NIL', 'Name, image and likeness: deals with brands and businesses. This section only shows on your page while it’s on.', [
        toggle({ label: 'I’m open to NIL deals', path: 'data.nilOpen', field: 'nil-open' }),
      ]),
      when((p) => p.data.nilOpen, group('Your pitch', '', [
        T({ label: 'What you’re looking for', path: 'data.nilInterests', field: 'nil-pitch', multiline: true, rows: 4, max: 400, placeholder: 'Local businesses and youth programs. I’m big in our community and love working with kids.', note: (p, v) => `${v.length} of 400 characters` }),
        // No "Autographs" idea for high schoolers: autographs of minors wait on the founders (parked).
        F.Chips({ label: 'What you can do', path: 'data.nilOffers', placeholder: 'Type one and press Enter', suggest: (p) => (p.data.level === 'college' ? OFFERS : OFFERS.filter((x) => x !== 'Autographs')) }),
      ])),
      when((p) => p.data.nilOpen, group('Your reach', 'Numbers brands look for. Keep them current.', [
        F.List({
          path: 'data.nilAudience', field: 'nil-reach', itemName: 'Number', addLabel: 'Add a number', max: 6,
          empty: 'Followers, views, camp sizes…',
          blank: () => ({ label: '', value: '' }),
          fields: [{ key: 'label', label: 'What', placeholder: 'Instagram followers', max: 40 }, { key: 'value', label: 'Number', placeholder: '6.8K', max: 12, spell: false }],
        }),
        F.Chips({ label: 'Brands you’ve worked with (optional)', path: 'data.nilPartners', placeholder: 'A brand or business' }),
      ])),
      when((p) => p.data.nilOpen, group('Inquiries', '', [
        choice({ label: 'Who handles them', path: 'data.nilContactRole', wrap: true, options: [{ id: '', label: 'Me' }, { id: 'parent', label: 'Parent or guardian' }, { id: 'agent', label: 'Agent' }, { id: 'school', label: 'School' }] }),
        T({ label: 'Where they go', path: 'data.nilContact', max: 120, spell: false, placeholder: 'Email or a link', note: (p, v) => (!v.trim() ? 'Empty: brands use your main contact (Details & contact).' : A.links.isEmail(v) ? 'Brands get an email with “NIL inquiry” and your name in the subject.' : linkNote(v, 'site')) }),
      ])),
    ];
  }

  // ———————————————————————————— Details & contact ————————————————————————————
  function details() {
    const ft = [{ id: '', label: '–' }, ...[4, 5, 6, 7].map((f) => ({ id: String(f), label: `${f} ft` }))];
    const inch = [{ id: '', label: '–' }, ...Array.from({ length: 12 }, (_, i) => ({ id: String(i), label: `${i} in` }))];
    const feet = (p) => (p.data.heightIn ? String(Math.floor(p.data.heightIn / 12)) : '');
    const inches = (p) => (p.data.heightIn ? String(p.data.heightIn % 12) : '');
    const setHeight = (p, f, i) => { const F_ = parseInt(f, 10), I = parseInt(i, 10) || 0; p.data.heightIn = Number.isFinite(F_) ? F_ * 12 + I : null; };
    const divisionOpts = [{ id: '', label: 'Choose…' }, ...A.LEVELS.college.details.find((x) => x.key === 'division').options.map((o) => ({ id: o, label: o }))];

    // The sport's own details (bats/throws, dominant foot, club team…), rebuilt when the sport changes.
    const sportBox = (() => {
      const el = h('<div class="sport-details"></div>');
      let sig = '', controls = [];
      return {
        el,
        sync(p, ch) {
          const list = (sportOf(p).details || []).filter((x) => !(p.data.level === 'college' && A.HS_ONLY_DETAILS && A.HS_ONLY_DETAILS.has(x.key)));
          const next = p.data.sport + ':' + p.data.level + ':' + list.map((x) => x.key).join(',');
          if (next !== sig) {
            sig = next;
            el.innerHTML = '';
            controls = list.map((x) => (x.options
              ? Sel({ label: x.label, path: `data.sportDetails.${x.key}`, short: true, options: [{ id: '', label: '–' }, ...x.options.map((o) => ({ id: o, label: o }))] })
              : T({ label: x.label, path: `data.sportDetails.${x.key}`, max: 60 })));
            controls.forEach((c) => el.appendChild(c.el));
            el.hidden = !controls.length;
          }
          controls.forEach((c) => c.sync(p, ch));
        },
      };
    })();

    // Recruiting profiles: paste the link; the name shown always comes from the link itself.
    const profileList = F.List({
      path: 'data.profileLinks', field: 'profiles', itemName: 'Profile', addLabel: 'Add a profile link', max: 10,
      empty: 'None yet. Add a recruiting or results profile (On3, 247Sports, MaxPreps, SwimCloud, Athletic.net, UTR…).',
      blank: () => ({ url: '' }),
      fields: [{ key: 'url', label: 'Link', inputmode: 'url', spell: false, wide: true, placeholder: (x) => (x.hint ? `Paste your ${x.hint} profile link` : 'https://…') }],
      rowNote: (x) => linkNote(x.url, 'site'),
    });
    const quick = (() => {
      const el = h('<div class="chip-suggest" aria-label="Quick add"></div>');
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-s]');
        if (!b) return;
        store.commit((p) => { p.data.profileLinks.push({ url: '', hint: b.dataset.s }); }, { kind: 'content', key: null });
        requestAnimationFrame(() => { const inputs = profileList.el.querySelectorAll('.list-row input'); if (inputs.length) inputs[inputs.length - 1].focus(); });
      });
      let sig = '';
      return {
        el,
        sync(p) {
          const have = p.data.profileLinks.map((l) => l.hint || A.links.siteOf(l.url));
          const left = suggestions(p).links.map((l) => l.label).filter((x) => !have.includes(x) && !['Team roster page'].includes(x));
          const next = left.join('|');
          if (next === sig) return;
          sig = next;
          el.innerHTML = left.length ? `<span>Quick add:</span>${left.map((x) => `<button type="button" class="chip-idea" data-s="${esc(x)}">+ ${esc(x)}</button>`).join('')}` : '';
        },
      };
    })();

    return [
      group('Recruiting', '', [
        when((p) => p.data.level !== 'college', choice({ label: 'Status', path: 'data.recruitingStatus', wrap: true, options: [{ id: 'undecided', label: 'Not saying' }, { id: 'open', label: 'Open to recruiting' }, { id: 'committed', label: 'Committed' }] })),
        when((p) => p.data.level !== 'college' && p.data.recruitingStatus === 'committed', T({ label: 'Committed to', path: 'data.committedTo', max: 60, placeholder: 'Ohio State' })),
        when((p) => p.data.level === 'college', toggle({ label: 'In the transfer portal', path: 'data.transferPortal' })),
        when((p) => p.data.level === 'college' && (!A.DRAFT_SPORTS || A.DRAFT_SPORTS.has(p.data.sport)), toggle({ label: 'Draft eligible', path: 'data.draftEligible' })),
        when((p) => p.data.level === 'college', row([Sel({ label: 'Division', path: 'data.division', options: divisionOpts }), T({ label: 'Conference', path: 'data.conference', max: 40, placeholder: 'Big Ten' })])),
        note('“Not open” never shows; only good news does.'),
      ]),
      group('Contact', 'The Contact buttons on your page use this.', [
        T({ label: 'How coaches reach you', path: 'data.recruitingContact', field: 'contact', max: 120, spell: false, placeholder: 'Email, or a link like your recruiting form', note: (p, v) => (!v.trim() ? 'Empty: your page has no Contact button.' : A.links.isEmail(v) ? 'Coaches get an email with your name in the subject.' : linkNote(v, 'site')) }),
      ]),
      group('About you', '', [
        row([T({ label: 'Hometown', path: 'data.city', max: 40, placeholder: 'Columbus' }), T({ label: 'State', path: 'data.state', max: 20, short: true, placeholder: 'OH' })]),
        row([
          Sel({ label: 'Height', path: 'data.heightIn', short: true, options: ft, read: feet, write: (p, v) => setHeight(p, v, inches(p)) }),
          Sel({ label: 'and', path: 'data.heightIn', short: true, options: inch, read: inches, write: (p, v) => setHeight(p, feet(p) || '5', v) }),
          T({ label: 'Weight (lb)', path: 'data.weightLb', short: true, max: 3, inputmode: 'numeric', spell: false, read: (p) => (p.data.weightLb ? String(p.data.weightLb) : ''), write: (p, v) => { const n = parseInt(v, 10); p.data.weightLb = Number.isFinite(n) && n > 0 ? n : null; } }),
        ]),
        row([T({ label: 'GPA', path: 'data.gpa', short: true, max: 5, inputmode: 'decimal', spell: false, placeholder: '3.8' }), T({ label: 'Intended major', path: 'data.intendedMajor', max: 40, placeholder: 'Kinesiology' })]),
        sportBox,
      ]),
      group('Find me on', 'Your recruiting and results profiles. The name shown always comes from the link itself, so it can’t be faked.', [quick, profileList]),
      group('Social', 'Just your handle, without the @.', [
        row([T({ label: 'Instagram', path: 'data.social.instagram', max: 40, spell: false }), T({ label: 'X', path: 'data.social.twitter', max: 40, spell: false })]),
        row([T({ label: 'TikTok', path: 'data.social.tiktok', max: 40, spell: false }), T({ label: 'YouTube', path: 'data.social.youtube', max: 40, spell: false })]),
        row([T({ label: 'Hudl', path: 'data.social.hudl', max: 60, spell: false }), T({ label: 'Website', path: 'data.social.website', max: 80, spell: false, placeholder: 'yourname.com' })]),
      ]),
    ];
  }

  function gallery() {
    return [
      group('Your photos', 'Drop photos here or add them. Your first photos lead. Uploads are resized for the web and kept on this device for now.', [galleryPhotos()]),
      group('What stays in frame', 'Pick a photo, then tap what matters most. Layouts crop photos differently, tall on phones and wide on computers; this keeps your subject in every one.', [
        focusPicker({
          key: 'gallery-focus',
          items: (p) => p.data.gallery.map((g, i) => ({ i, src: g.src, label: g.caption || `Photo ${i + 1}` })),
          get: (p, i) => p.data.gallery[i],
          crops: [{ cls: 'crop-45', label: 'Tall' }, { cls: 'crop-169', label: 'Wide' }],
        }),
      ]),
    ];
  }

  S.editors = { cover, film, stats, results, story, custom, milestones, gallery, nil, details };
  /** Photo pickers, shared with the first run. */
  S.photoInput = { readFiles, fileButton, dropZone };
  /** Page element (data-field) → the panel field that edits it. */
  S.fieldFor = { name: 'name', tagline: 'tagline', bio: 'bio', number: 'number', heroPhoto: 'heroPhoto' };
})();
