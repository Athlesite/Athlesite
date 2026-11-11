/*
 * Athlesite Studio — the tool panel.
 *
 * One panel, one navigator. Home lists the design card and every section of the page; picking
 * one (here or on the page itself) slides to its screen, Back slides home. Controls are built
 * once per screen and updated in place, so selection pills slide instead of redrawing.
 */
(function () {
  const A = window.Athlesite;
  const S = A.studio, store = S.store;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE = 'cubic-bezier(.22,1,.36,1)';

  const LOOK_IDS = ['cinematic', 'editorial', 'highlight', 'portrait', 'prospect'];
  // Each look's own headline face (its first font pairing), for samples in the panel.
  const LOOK_FONT = {
    cinematic: { family: '"Anton",Impact,sans-serif', weight: 400 },
    editorial: { family: '"Instrument Serif",Georgia,serif', weight: 400 },
    highlight: { family: '"Big Shoulders Display",Impact,sans-serif', weight: 800 },
    portrait: { family: '"Cormorant Garamond",Georgia,serif', weight: 500 },
    prospect: { family: '"Geist",system-ui,sans-serif', weight: 600 },
  };
  function typeFont(lookId, t) {
    const v = (t && t.vars) || {}, base = LOOK_FONT[lookId];
    return { family: v['--display'] || v['--serif'] || v['--sans'] || base.family, weight: v['--d-weight'] || base.weight, style: v['--d-style'] || 'normal' };
  }
  const fontStyle = (f) => `font-family:${esc(f.family)};font-weight:${esc(f.weight)};font-style:${esc(f.style || 'normal')}`;

  // Font files for every pairing of a look, loaded into the Studio so the samples are real.
  const loadedFonts = new Set();
  function loadLookFonts(look) {
    [look.fonts, ...(look.types || []).map((t) => t.fonts)].filter(Boolean).forEach((href) => {
      if (loadedFonts.has(href)) return;
      loadedFonts.add(href);
      document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
    });
  }

  const SECTION_NAMES = { cover: 'Cover', film: 'Film', stats: 'Stats', results: 'Results', story: 'Story', custom: 'Your section', milestones: 'Milestones', gallery: 'Gallery', nil: 'NIL', details: 'Details & contact' };
  const lookOf = (p) => A.LOOKS[p.design.look] || A.LOOKS.cinematic;

  /** The order the athlete sees in the navigator: the same one the page uses (profile.js fullOrder). */
  function effectiveOrder(p) {
    const order = A.fullOrder(p, lookOf(p).order).slice();
    A.DEFAULT_ORDER.forEach((k) => { if (!order.includes(k)) order.push(k); });
    return order;
  }

  function sectionStatus(key, d) {
    const n = (list, one, many) => (list.length === 1 ? `1 ${one}` : `${list.length} ${many}`);
    if (!A.sectionHasContent(key, d)) return '';
    switch (key) {
      case 'film': return n(d.highlightLinks.filter((x) => x.label || x.url), 'video', 'videos');
      case 'stats': return n(d.stats.filter((s) => s.value), 'number', 'numbers');
      case 'results': return n(d.results.filter((r) => A.RESULT_KEYS.some((k) => String(r[k] || '').trim())), 'result', 'results');
      case 'story': return `${d.bio.trim().split(/\s+/).length} words`;
      case 'custom': return `${String(d.custom.body).trim().split(/\s+/).length} words`;
      case 'milestones': return n(d.milestones.filter((m) => m.title), 'milestone', 'milestones');
      case 'gallery': return n(d.gallery.filter((g) => g.src), 'photo', 'photos');
      case 'details': return [d.schoolOrTeam, A.location(d)].filter(Boolean).join(' · ') || 'Filled in';
      case 'nil': return ['Open to NIL', d.nilOffers.length && n(d.nilOffers, 'offer', 'offers')].filter(Boolean).join(' · ');
      default: return '';
    }
  }

  /**
   * "Pull colors from my photo". Needs a readable image: uploads work anywhere; a local file
   * opened from file:// can't be read, and then there are simply no suggestions.
   */
  const photoColors = new Map();
  function colorsFor(url, done) {
    if (!url) return done([]);
    if (photoColors.has(url)) return done(photoColors.get(url));
    const img = new Image();
    img.onload = () => { let c = []; try { c = A.color.colorsFromImage(img, 4); } catch (e) {} photoColors.set(url, c); done(c); };
    img.onerror = () => { photoColors.set(url, []); done([]); };
    img.src = url;
  }

  // ———————————————————————————————— Controls ————————————————————————————————

  /** Arrow keys move through a radio group, like native radios. */
  function radioKeys(el, pick) {
    el.addEventListener('keydown', (e) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(e.key in keys)) return;
      const items = [...el.querySelectorAll('[role=radio]:not(:disabled)')];
      const i = items.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const next = items[(i + keys[e.key] + items.length) % items.length];
      next.focus();
      pick(next, true); // from the keyboard: no slide (keyboard actions never animate)
    });
  }
  // Only the checked option (or the first) is a tab stop.
  function rovingTabs(el) {
    const items = [...el.querySelectorAll('[role=radio]')];
    const on = items.find((b) => b.getAttribute('aria-checked') === 'true') || items[0];
    items.forEach((b) => (b.tabIndex = b === on ? 0 : -1));
  }

  /** Segmented choice with a pill that slides under the selected option. */
  function Seg({ label, onPick, wrap = false }) {
    const el = h(`<div class="seg${wrap ? ' seg-wrap' : ''}" role="radiogroup" aria-label="${esc(label)}"><span class="pill" aria-hidden="true"></span></div>`);
    const pill = el.querySelector('.pill');
    let value = '', sig = '';
    function place(instant) {
      const on = el.querySelector('[aria-checked=true]');
      if (!on || !on.offsetWidth) { pill.style.opacity = 0; return; }
      if (instant || reduced()) pill.style.transition = 'none';
      pill.style.opacity = 1;
      pill.style.width = on.offsetWidth + 'px';
      pill.style.height = on.offsetHeight + 'px';
      pill.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
      if (instant || reduced()) { void pill.offsetWidth; pill.style.transition = ''; }
    }
    function set(v, instant) {
      value = v || '';
      el.querySelectorAll('[role=radio]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === value)));
      rovingTabs(el);
      place(instant);
    }
    function items(list) {
      const next = JSON.stringify(list);
      if (next === sig) return;
      const fresh = !!sig;
      sig = next;
      el.querySelectorAll('[role=radio]').forEach((b) => b.remove());
      el.insertAdjacentHTML('beforeend', list.map((it, i) => `<button type="button" role="radio" data-v="${esc(it.id)}" aria-checked="false" style="--i:${i}"${it.disabled ? ' disabled' : ''}${it.title ? ` title="${esc(it.title)}"` : ''}${it.short ? ` aria-label="${esc(it.label)}"` : ''}>${it.short ? `<span class="seg-long">${esc(it.label)}</span><span class="seg-short" aria-hidden="true">${esc(it.short)}</span>` : esc(it.label)}</button>`).join(''));
      if (fresh && !reduced()) { el.classList.remove('is-new'); void el.offsetWidth; el.classList.add('is-new'); }
      set(value, true);
    }
    const choose = (b, instant) => { if (b.disabled) return; set(b.dataset.v, instant); onPick(b.dataset.v); };
    el.addEventListener('click', (e) => { const b = e.target.closest('[role=radio]'); if (b) choose(b); });
    radioKeys(el, choose);
    new ResizeObserver(() => place(true)).observe(el);
    return { el, set, items };
  }

  /** A list of option cards (looks, fonts, palettes). Selection rings animate in CSS. */
  function Cards({ label, className, onPick, render }) {
    const el = h(`<div class="${className}" role="radiogroup" aria-label="${esc(label)}"></div>`);
    let value = '', sig = '';
    function set(v) {
      value = v || '';
      el.querySelectorAll('[role=radio]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === value)));
      rovingTabs(el);
    }
    function items(list) {
      const next = JSON.stringify(list);
      if (next === sig) return;
      const fresh = !!sig;
      sig = next;
      el.innerHTML = list.map((it, i) => `<button type="button" role="radio" data-v="${esc(it.id)}" aria-checked="false" style="--i:${i}">${render(it)}</button>`).join('');
      if (fresh && !reduced()) { el.classList.remove('is-new'); void el.offsetWidth; el.classList.add('is-new'); }
      set(value);
    }
    const choose = (b) => { set(b.dataset.v); onPick(b.dataset.v); };
    el.addEventListener('click', (e) => { const b = e.target.closest('[role=radio]'); if (b) choose(b); });
    radioKeys(el, choose);
    return { el, set, items };
  }

  /** On/off switch. */
  function Switch({ label, onToggle }) {
    const el = h(`<button type="button" class="switch" role="switch" aria-checked="false"><span class="switch-label">${esc(label)}</span><span class="switch-track" aria-hidden="true"><span></span></span></button>`);
    el.addEventListener('click', () => { if (el.disabled) return; const on = el.getAttribute('aria-checked') !== 'true'; el.setAttribute('aria-checked', String(on)); onToggle(on); });
    return { el, set: (on) => el.setAttribute('aria-checked', String(!!on)), disable: (off) => (el.disabled = !!off) };
  }

  const block = (title, hint) => h(`<section class="block"><header><h3>${esc(title)}</h3>${hint ? `<p>${esc(hint)}</p>` : ''}</header><div class="block-body"></div></section>`);

  // ———————————————————————————————— Panel ————————————————————————————————

  function create(root, { preview, announce, onScreen }) {
    root.innerHTML = `
      <div class="panel-head">
        <button type="button" class="icon-btn back" aria-label="Back to all sections" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div class="panel-title"><small></small><h2 tabindex="-1"></h2></div>
      </div>
      <div class="panel-screens"></div>`;
    const screensEl = root.querySelector('.panel-screens');
    const backBtn = root.querySelector('.back');
    const titleEl = root.querySelector('.panel-title h2'), kickerEl = root.querySelector('.panel-title small');
    let current = null; // { id, el, sync, title, kicker }
    let anims = [];

    const builders = { home: buildHome, design: buildDesign };

    function screenFor(id) {
      if (builders[id]) return builders[id]();
      if (id.startsWith('section:')) return buildSection(id.slice(8));
      return buildHome();
    }

    /** Slide to a screen. Forward slides in from the right, back from the left. Any click mid-slide lands. */
    // scroll: false when the section was picked on the page (it's already in view; don't move it).
    function go(id, { back = false, focusTitle = true, scroll = true } = {}) {
      if (current && current.id === id) { current.sync(store.get(), { kind: 'nav' }); return; }
      anims.forEach((a) => a.finish());
      const next = screenFor(id);
      next.id = id;
      next.el.classList.add('screen');
      screensEl.appendChild(next.el);
      next.sync(store.get(), { kind: 'nav' });
      const prev = current;
      current = next;
      backBtn.hidden = id === 'home';
      setTitle(next);
      if (prev) {
        prev.el.inert = true;
        const dx = back ? -1 : 1;
        if (reduced()) { prev.el.remove(); }
        else {
          // The old screen is gone before the new one shows: when both faded at once, the two screens'
          // words sat on top of each other for a quarter of a second.
          const a1 = next.el.animate([{ transform: `translateX(${dx * 24}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, delay: 70, easing: EASE, fill: 'backwards' });
          const a2 = prev.el.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dx * 12}px)`, opacity: 0 }], { duration: 120, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
          anims = [a1, a2];
          a2.onfinish = () => prev.el.remove();
          a2.oncancel = () => prev.el.remove();
        }
        if (focusTitle) titleEl.focus({ preventScroll: true });
      }
      const section = id.startsWith('section:') ? id.slice(8) : null;
      preview.setActive(section, { scroll });
      onScreen && onScreen(id);
    }

    function setTitle(s) {
      titleEl.textContent = s.title;
      kickerEl.textContent = s.kicker || '';
      kickerEl.hidden = !s.kicker;
    }

    backBtn.addEventListener('click', () => go('home', { back: true }));

    function sync(p, change) {
      if (!current) return;
      current.sync(p, change);
      if (current.retitle) setTitle(current);
    }

    // A one-time tip on the home screen (after the first run): where to try the other looks.
    // It goes away when dismissed or once they open Design.
    let tip = null; // { text, action }
    function hint(next) {
      tip = next;
      const el = screensEl.querySelector('.panel-hint');
      if (el) fillHint(el);
    }
    function fillHint(el) {
      el.hidden = !tip;
      if (!tip) { el.innerHTML = ''; return; }
      el.innerHTML = `<p>${esc(tip.text)}</p><button type="button" class="link-btn" data-act="go">${esc(tip.action)}</button><button type="button" class="icon-btn" data-act="x" aria-label="Dismiss tip"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    }

    // ———— Home: the design card and the section navigator ————
    function buildHome() {
      const el = h(`<div>
        <div class="panel-hint" role="note" hidden></div>
        <div class="design-card">
          <button type="button" class="design-open">
            <span class="design-look"></span>
            <span class="design-meta"></span>
            <span class="design-swatches" aria-hidden="true"></span>
            <span class="design-go">Design <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></span>
          </button>
          <button type="button" class="btn btn-remix" data-remix="look"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>Remix</button>
        </div>
        <h3 class="list-head">Sections <small>Drag to reorder</small></h3>
        <div class="sec-cover"></div>
        <ol class="sec-list" aria-label="Sections, in page order"></ol>
        <p class="list-note">Empty sections stay off your page until you add something to them.</p>
      </div>`);
      const list = el.querySelector('.sec-list');
      const rows = new Map();
      const coverRow = rowFor('cover', true);
      el.querySelector('.sec-cover').appendChild(coverRow);

      el.querySelector('.design-open').addEventListener('click', () => { hint(null); go('design'); });
      const tipEl = el.querySelector('.panel-hint');
      fillHint(tipEl);
      tipEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        hint(null);
        if (b.dataset.act === 'go') go('design');
      });
      el.querySelector('[data-remix]').addEventListener('click', (e) => remix(false, e.currentTarget));

      function rowFor(key, fixed) {
        const row = h(`<li class="sec-row${fixed ? ' is-fixed' : ''}" data-key="${key}">
          ${fixed ? '<span class="grip grip-fixed" aria-hidden="true"></span>' : `<button type="button" class="grip" aria-label="Move ${esc(SECTION_NAMES[key])}" aria-describedby="studio-grip-help"><svg class="solid" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></button>`}
          <button type="button" class="sec-open"><span class="sec-name"></span><span class="sec-status"></span></button>
          ${fixed ? '' : `<button type="button" class="icon-btn eye" aria-pressed="false"><svg class="eye-on" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><svg class="eye-off" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.9 9.9 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg></button>`}
        </li>`);
        row.querySelector('.sec-open').addEventListener('click', () => go('section:' + key));
        const eye = row.querySelector('.eye');
        if (eye) eye.addEventListener('click', () => {
          const hide = !store.get().design.hidden.includes(key);
          store.commit((p) => { p.design.hidden = hide ? [...p.design.hidden, key] : p.design.hidden.filter((k) => k !== key); }, { kind: 'sections' });
          announce(`${SECTION_NAMES[key]} ${hide ? 'hidden from' : 'shown on'} your page`);
        });
        const grip = row.querySelector('.grip:not(.grip-fixed)');
        if (grip) {
          grip.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            move(key, e.key === 'ArrowUp' ? -1 : 1);
            grip.focus();
          });
          grip.addEventListener('pointerdown', (e) => startDrag(e, row));
        }
        return row;
      }

      function fillRow(row, key, p, titles) {
        const d = p.data, hidden = p.design.hidden.includes(key), has = key === 'cover' || A.sectionHasContent(key, d);
        // Their own section shows its title only once they've written one (the page's fallback is just "More").
        const name = SECTION_NAMES[key], title = key === 'custom' ? d.custom.title : titles[key];
        // Sections a published page can't show yet say so, so nothing they add there surprises them later.
        const lock = (A.PRIVATE_SECTIONS || []).includes(key) ? '<span class="sec-lock" title="Only you can see this section for now. It isn’t on published pages yet.">Private</span>' : '';
        row.querySelector('.sec-name').innerHTML = `${esc(name)}${title && key !== 'cover' && !name.toLowerCase().includes(title.toLowerCase()) ? `<em>“${esc(title)}”</em>` : ''}${lock}`;
        row.querySelector('.sec-status').textContent = key === 'cover'
          ? (d.heroPhotoUrl ? 'Photo, name and headline' : 'Name and headline, no photo yet')
          : hidden ? 'Hidden from visitors' : has ? sectionStatus(key, d) : 'Empty';
        row.classList.toggle('is-hidden', hidden);
        row.classList.toggle('is-empty', !has && !hidden);
        const eye = row.querySelector('.eye');
        if (eye) { eye.setAttribute('aria-pressed', String(hidden)); eye.setAttribute('aria-label', `${hidden ? 'Show' : 'Hide'} ${name}`); eye.title = hidden ? 'Show on your page' : 'Hide from your page'; }
      }

      /** Rebuild the list in order, moving existing rows (focus survives) and gliding them (FLIP). */
      function syncList(p, animate) {
        const order = effectiveOrder(p), titles = A.sectionTitles(p);
        const first = new Map([...rows].map(([k, r]) => [k, r.getBoundingClientRect().top]));
        rows.forEach((r) => { r.style.transform = ''; r.style.transition = ''; r.classList.remove('is-dragging', 'is-shifting'); });
        order.forEach((k) => {
          if (!rows.has(k)) rows.set(k, rowFor(k, false));
          const r = rows.get(k);
          fillRow(r, k, p, titles);
          list.appendChild(r);
        });
        fillRow(coverRow, 'cover', p, titles);
        if (!animate || reduced()) return;
        rows.forEach((r, k) => {
          const was = first.get(k);
          if (was === undefined) return;
          const dy = was - r.getBoundingClientRect().top;
          if (Math.abs(dy) > 1) r.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 360, easing: EASE });
        });
      }

      function move(key, dir) {
        const order = effectiveOrder(store.get());
        const i = order.indexOf(key), j = i + dir;
        if (j < 0 || j >= order.length) return;
        [order[i], order[j]] = [order[j], order[i]];
        store.commit((p) => { p.design.order = order; }, { kind: 'order' });
        announce(`${SECTION_NAMES[key]} moved to position ${j + 1} of ${order.length}`);
      }

      // Drag by the grip: the row follows the pointer, the others make room.
      function startDrag(e, row) {
        if (e.button !== 0) return;
        e.preventDefault();
        const grip = e.currentTarget;
        grip.setPointerCapture(e.pointerId);
        const items = [...list.children];
        const from = items.indexOf(row);
        const rects = items.map((r) => r.getBoundingClientRect());
        const gap = items.length > 1 ? rects[1].top - rects[0].top : rects[0].height;
        const y0 = e.clientY;
        let to = from, moved = false;
        row.classList.add('is-dragging');
        items.forEach((r) => r !== row && r.classList.add('is-shifting'));
        const onMove = (ev) => {
          const dy = ev.clientY - y0;
          if (Math.abs(dy) > 3) moved = true;
          row.style.transform = `translateY(${dy}px)`;
          const mid = rects[from].top + rects[from].height / 2 + dy;
          to = from;
          rects.forEach((r, i) => { if (i < from && mid < r.top + r.height / 2) to = Math.min(to, i); if (i > from && mid > r.top + r.height / 2) to = Math.max(to, i); });
          items.forEach((r, i) => {
            if (r === row) return;
            const shift = (from < to && i > from && i <= to) ? -gap : (from > to && i >= to && i < from) ? gap : 0;
            r.style.transform = shift ? `translateY(${shift}px)` : '';
          });
        };
        const onUp = () => {
          grip.removeEventListener('pointermove', onMove);
          grip.removeEventListener('pointerup', onUp);
          grip.removeEventListener('pointercancel', onUp);
          if (!moved || to === from) { syncList(store.get(), true); return; }
          const order = items.map((r) => r.dataset.key);
          order.splice(to, 0, order.splice(from, 1)[0]);
          if (!store.commit((p) => { p.design.order = order; }, { kind: 'order' })) syncList(store.get(), true);
          announce(`${SECTION_NAMES[row.dataset.key]} moved to position ${to + 1} of ${order.length}`);
        };
        grip.addEventListener('pointermove', onMove);
        grip.addEventListener('pointerup', onUp);
        grip.addEventListener('pointercancel', onUp);
      }

      function syncCard(p) {
        const look = lookOf(p), pal = look.palettes.find((x) => x.id === p.design.palette) || look.palettes[0];
        const type = (look.types || []).find((t) => t.id === p.design.type) || (look.types || [])[0];
        loadLookFonts(look);
        const name = el.querySelector('.design-look');
        name.textContent = look.name;
        name.style.cssText = fontStyle(typeFont(look.id, type));
        el.querySelector('.design-meta').textContent = [pal.label, type && type.label, p.design.accent ? 'Your color' : ''].filter(Boolean).join(' · ');
        const accent = p.design.accent && /^#[0-9a-f]{6}$/i.test(p.design.accent) ? A.color.readableAccent(p.design.accent, pal.bg, pal.ink) : pal.accent;
        el.querySelector('.design-swatches').innerHTML = `<i style="background:${pal.bg}"></i><i style="background:${pal.ink}"></i><i style="background:${accent}"></i>`;
      }

      return {
        el, title: 'Your page', kicker: '',
        sync(p, change) {
          syncCard(p);
          syncList(p, change && (change.kind === 'order' || change.kind === 'history' || change.kind === 'design'));
        },
      };
    }

    // ———— Design: look, remix, color, fonts, photo, opening ————
    // The homepage examples, in the order of the homepage's wheel.
    const EX_ORDER = ['jordan-bell', 'maya-rodriguez', 'aaliyah-grant', 'grace-nakamura', 'cole-bennett', 'sofia-lindqvist', 'liam-kowalski', 'ethan-whitaker', 'owen-castellanos', 'priya-raman', 'imani-wallace', 'hannah-mercer', 'kenzie-morales', 'mateo-ruiz', 'tyler-brooks'];
    // What "use this style" copies: the whole design (the same keys "Start with this style" copies), never
    // the example's words, photos or hidden sections.
    const STYLE_KEYS = ['look', 'palette', 'accent', 'type', 'photo', 'layout', 'order', 'intro'];
    function buildDesign() {
      const el = h('<div></div>');

      // Styles from real pages: liked one on the homepage's wheel? Put its whole design on your page.
      const EX = A.EXAMPLES || {}, exKeys = [...EX_ORDER.filter((k) => EX[k]), ...Object.keys(EX).filter((k) => !EX_ORDER.includes(k))];
      let bStyles = null;
      if (exKeys.length && A.renderCard) {
        bStyles = block('Styles from real pages', 'Like one? Use its whole design on your page. Your words and photos stay.');
        const strip = h('<div class="style-strip"></div>');
        exKeys.forEach((k) => {
          const ex = A.normalizeProfile(structuredClone(EX[k])), c = A.cardContext(ex);
          const href = A.cardFonts && A.cardFonts(ex);
          if (href && !loadedFonts.has(href)) { loadedFonts.add(href); document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href })); }
          strip.insertAdjacentHTML('beforeend', `<div class="style-item"><button type="button" class="style-card" data-ex="${esc(k)}" aria-label="Use ${esc(c.name)}’s style: ${esc(c.look.name)}, ${esc(c.palette.label)}"><span class="style-card-art" aria-hidden="true">${A.renderCard(ex).replace(/<img class="ac-ph"/g, '<img loading="lazy" class="ac-ph"')}</span><span class="style-card-label">${esc(ex.data.firstName || c.name)} · ${esc(c.look.name)}</span></button><a class="style-full" href="site.html?ex=${encodeURIComponent(k)}" target="_blank" rel="noopener" aria-label="See ${esc(c.name)}’s full page (opens a new tab)">See the full page <span aria-hidden="true">↗</span></a></div>`);
        });
        strip.addEventListener('click', (e) => {
          const b = e.target.closest('[data-ex]');
          if (!b) return;
          const src = A.normalizeProfile(structuredClone(EX[b.dataset.ex])), who = src.data.firstName || A.fullName(src.data);
          store.commit((p) => { STYLE_KEYS.forEach((k) => { p.design[k] = structuredClone(src.design[k]); }); }, { kind: 'design', key: 'example' });
          announce(`Your page now uses ${who}’s style. Undo brings yours back.`);
          if (S.toast) S.toast(`Now in ${who}’s style. Undo brings yours back.`);
        });
        // Names fit their cards once the cards are on screen and their fonts are in.
        const fit = () => { if (strip.isConnected && A.fitCards) A.fitCards(strip); };
        requestAnimationFrame(() => requestAnimationFrame(fit));
        if (document.fonts) document.fonts.ready.then(fit);
        bStyles.querySelector('.block-body').append(strip);
      }

      const looks = Cards({
        label: 'Look', className: 'look-cards',
        onPick: (id) => {
          store.commit((p) => {
            if (p.design.look === id) return;
            const look = A.LOOKS[id];
            // Palette, fonts and cover belong to a look; the athlete's own color, layouts and photo choice carry over.
            p.design.look = id; p.design.palette = look.palettes[0].id; p.design.type = ''; p.design.layout.cover = '';
          }, { kind: 'design', key: 'look' });
          announce(`Look: ${A.LOOKS[id].name}`);
        },
        render: (it) => `<span class="look-name" style="${fontStyle(LOOK_FONT[it.id])}">${esc(it.label)}</span><span class="look-line">${esc(it.line)}</span><span class="look-dots" aria-hidden="true">${it.dots.map((c) => `<i style="background:${c}"></i>`).join('')}</span>`,
      });
      LOOK_IDS.forEach((id) => loadLookFonts(A.LOOKS[id]));
      looks.items(LOOK_IDS.map((id) => { const L = A.LOOKS[id]; return { id, label: L.name, line: L.line, dots: L.palettes.map((x) => x.accent) }; }));
      const b1 = block('Look', 'Each look has its own cover, sections and opening.');
      b1.querySelector('.block-body').append(looks.el);

      const remixRow = h(`<div class="remix-row">
        <button type="button" class="btn btn-remix" data-remix="look"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>Remix</button>
        <button type="button" class="btn" data-remix="all">Remix everything</button>
      </div>`);
      remixRow.querySelector('[data-remix=look]').addEventListener('click', (e) => remix(false, e.currentTarget));
      remixRow.querySelector('[data-remix=all]').addEventListener('click', (e) => remix(true, e.currentTarget));
      b1.querySelector('.block-body').append(remixRow, h('<p class="hint">Remix rolls a fresh combination in this look. Remix everything can change the look too. Undo brings back what you had.</p>'));

      // Color
      const palettes = Cards({
        label: 'Color', className: 'swatch-list',
        onPick: (id) => store.commit((p) => { p.design.palette = id; p.design.accent = ''; }, { kind: 'design', key: 'palette' }),
        render: (it) => `<i class="sw" style="--sw-bg:${it.bg};--sw-accent:${it.accent}" aria-hidden="true"></i><span>${esc(it.label)}</span>`,
      });
      const accentRow = h(`<div class="accent-row">
        <span class="accent-label">Your own color</span>
        <div class="accent-dots" role="group" aria-label="Colors from your photo"></div>
        <label class="wheel" title="Pick any color"><input type="color" aria-label="Pick any color"></label>
        <button type="button" class="link-btn accent-clear">Use the palette color</button>
      </div>`);
      const accentNote = h('<p class="hint accent-note" aria-live="polite"></p>');
      const wheel = accentRow.querySelector('input');
      wheel.addEventListener('input', () => store.commit((p) => { p.design.accent = wheel.value.toUpperCase(); }, { kind: 'design', key: 'accent' }));
      accentRow.querySelector('.accent-clear').addEventListener('click', () => store.commit((p) => { p.design.accent = ''; }, { kind: 'design', key: 'accent-clear' }));
      accentRow.querySelector('.accent-dots').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b) store.commit((p) => { p.design.accent = b.dataset.c; }, { kind: 'design', key: 'accent-photo' });
      });
      const b2 = block('Color');
      b2.querySelector('.block-body').append(palettes.el, accentRow, accentNote);

      // Fonts
      const fonts = Cards({
        label: 'Fonts', className: 'font-cards',
        onPick: (id) => store.commit((p) => { p.design.type = id; }, { kind: 'design', key: 'type' }),
        render: (it) => `<span class="font-sample" style="${fontStyle(it.font)}">${esc(it.sample)}</span><span class="font-label">${esc(it.label)}</span><span class="font-note">${esc(it.note || '')}</span>`,
      });
      const b3 = block('Fonts');
      b3.querySelector('.block-body').append(fonts.el);

      // Photo treatment
      const photo = Seg({ label: 'Photo treatment', onPick: (v) => store.commit((p) => { p.design.photo = v; }, { kind: 'design', key: 'photo' }) });
      const b4 = block('Photo', 'How your photos are colored across the page.');
      b4.querySelector('.block-body').append(photo.el);

      // Opening
      const intro = Switch({ label: 'Play the opening when someone visits', onToggle: (on) => store.commit((p) => { p.design.intro = on; }, { kind: 'design', key: 'intro' }) });
      const play = h(`<button type="button" class="btn"><svg class="solid" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>Play it now</button>`);
      play.addEventListener('click', () => preview.play());
      const b5 = block('Opening', 'Plays once per visit and skips on any tap.');
      b5.querySelector('.block-body').append(intro.el, play);

      el.append(...[bStyles, b1, b2, b3, b4, b5].filter(Boolean));

      return {
        el, title: 'Design', kicker: '',
        sync(p) {
          const look = lookOf(p);
          loadLookFonts(look);
          looks.set(look.id);
          palettes.items(look.palettes.map((x) => ({ id: x.id, label: x.label, bg: x.bg, accent: x.accent })));
          palettes.set(p.design.accent ? '' : (p.design.palette || look.palettes[0].id));
          const types = look.types || [];
          const sample = p.data.lastName || p.data.firstName || 'Aa';
          fonts.items(types.map((t) => ({ id: t.id, label: t.label, note: t.note, sample, font: typeFont(look.id, t) })));
          fonts.set(p.design.type || (types[0] && types[0].id));
          const lookTone = { color: 'Color', mono: 'B&W', duotone: 'Duotone' }[look.photo || 'color'];
          photo.items([{ id: '', label: `Look default (${lookTone})` }, { id: 'color', label: 'Color' }, { id: 'mono', label: 'B&W' }, { id: 'duotone', label: 'Duotone' }]);
          photo.set(p.design.photo || '');
          intro.set(p.design.intro);
          // Accent: the athlete's color, nudged to stay readable; say so when it was.
          const pal = look.palettes.find((x) => x.id === p.design.palette) || look.palettes[0];
          const a = p.design.accent;
          accentRow.classList.toggle('has-accent', !!a);
          if (a) wheel.value = a.toLowerCase();
          const shown = a ? A.color.readableAccent(a, pal.bg, pal.ink) : '';
          accentNote.textContent = a && shown.toUpperCase() !== a.toUpperCase() ? `Adjusted to ${shown} so it stays readable on this background.` : '';
          colorsFor(S.photos ? S.photos.url(p.data.heroPhotoUrl) : p.data.heroPhotoUrl, (colors) => {
            const dots = accentRow.querySelector('.accent-dots');
            const sig = colors.join(',') + '|' + a;
            if (dots.dataset.sig === sig) return;
            dots.dataset.sig = sig;
            dots.innerHTML = colors.map((c) => `<button type="button" data-c="${c}" style="--sw:${c}" aria-pressed="${c === a}" title="From your photo: ${c}" aria-label="Color from your photo ${c}"></button>`).join('');
            accentRow.classList.toggle('has-photo-colors', colors.length > 0);
          });
        },
      };
    }

    // ———— One section ————
    function buildSection(key) {
      const el = h('<div></div>');
      const screen = { el, kicker: SECTION_NAMES[key], title: SECTION_NAMES[key], retitle: true };
      const parts = [];

      // Content first (step 2): the section's own fields, from editors.js.
      if (S.editors && S.editors[key]) S.editors[key]().forEach((part) => parts.push(part.el ? Object.assign(part.el, { _part: part }) : part));
      if (key === 'cover') {
        const cover = Seg({ label: 'Cover layout', wrap: true, onPick: (v) => store.commit((p) => { p.design.layout.cover = v; }, { kind: 'design', key: 'cover' }) });
        const mirror = Switch({ label: 'Mirror: swap the sides', onToggle: (on) => store.commit((p) => { p.design.layout.mirror = on; }, { kind: 'design', key: 'mirror' }) });
        const mirrorNote = h('<p class="hint"></p>');
        const b = block('Layout', 'Three ways to open your page in this look.');
        b.querySelector('.block-body').append(cover.el, mirror.el, mirrorNote);
        parts.push(b);
        screen.sync = (p) => {
          const look = lookOf(p), covers = look.covers || [];
          cover.items(covers.map((c) => ({ id: c.id, label: c.label })));
          const id = p.design.layout.cover || (covers[0] && covers[0].id);
          cover.set(id);
          const c = covers.find((x) => x.id === id);
          mirror.set(p.design.layout.mirror);
          mirror.disable(!c || !c.mirror);
          const applies = c && (c.mirror === 'always' || (c.mirror === 'subject-left' && (!p.data.heroPhotoUrl || p.data.heroPhotoPositionX < 0.45)));
          mirrorNote.textContent = !c || !c.mirror ? 'This cover has no left and right sides to swap.'
            : c.mirror === 'subject-left' && !applies ? 'This cover puts text over your photo, so Mirror only applies when you stand on the left of it (it never covers you).'
            : 'Swaps the photo and text sides on wider screens (phones stack the cover). Your photo itself is never flipped.';
          screen.title = 'Cover';
          screen.kicker = '';
        };
      } else {
        if (key === 'stats' || key === 'gallery' || key === 'film') {
          const REEL = 'Each video full screen, one per scroll, like a cinema reel.';
          const opts = {
            stats: [{ id: '', label: 'Signature' }, { id: 'spotlight', label: 'Spotlight' }, { id: 'ledger', label: 'Ledger' }],
            gallery: [{ id: '', label: 'Signature' }, { id: 'strip', label: 'Strip' }, { id: 'feature', label: 'Feature' }, { id: 'folio', label: 'Folio' }],
          }[key];
          const notes = {
            stats: { '': 'The look’s own design for your numbers.', spotlight: 'Your first number huge, the rest listed beside it.', ledger: 'One clean row per number.' },
            gallery: { '': 'The look’s own photo layout.', strip: 'A row your visitors swipe sideways.', feature: 'Your first photo big, the rest share a row.', folio: 'Captions on one side, photos on the other, moving as visitors scroll; tapping a photo opens it large.' },
            film: { '': 'The look’s own design for your videos.', list: 'Your first video big, the rest listed beside it.', reel: REEL },
          }[key];
          const seg = Seg({ label: `${SECTION_NAMES[key]} layout`, onPick: (v) => store.commit((p) => { p.design.layout[key] = v; }, { kind: 'design', key: 'layout-' + key }) });
          if (opts) seg.items(opts);
          const note = h('<p class="hint"></p>');
          const b = block('Layout');
          b.querySelector('.block-body').append(seg.el, note);
          parts.push(b);
          parts.push({ sync: (p) => {
            let v = p.design.layout[key] || '', text;
            if (key === 'film') {
              // Cinematic's own film is the reel; elsewhere the reel is the alternative.
              const own = lookOf(p).filmLayout === 'reel';
              seg.items(own ? [{ id: '', label: 'Reel' }, { id: 'list', label: 'List' }] : [{ id: '', label: 'Signature' }, { id: 'reel', label: 'Reel' }]);
              if (v === (own ? 'reel' : 'list')) v = '';
              const reel = own ? v === '' : v === 'reel';
              const videos = p.data.highlightLinks.filter((x) => x.label || x.url).length;
              text = reel ? REEL + (videos < 2 ? ' It needs two or more videos; until then they show as a list.' : '') : own ? notes.list : notes[v];
            } else {
              text = notes[v];
              if (v === 'folio' && p.data.gallery.filter((g) => g.src).length < 3) text += ' It needs three or more photos; until then the look’s own layout shows.';
            }
            seg.set(v);
            note.textContent = text;
          } });
        }
        const show = Switch({ label: 'Show on my page', onToggle: (on) => store.commit((p) => { p.design.hidden = on ? p.design.hidden.filter((k) => k !== key) : [...p.design.hidden, key]; }, { kind: 'sections' }) });
        const showNote = h('<p class="hint"></p>');
        const b = block('Visibility');
        b.querySelector('.block-body').append(show.el, showNote);
        parts.push(b);
        parts.push({ sync: (p) => {
          const hidden = p.design.hidden.includes(key), has = A.sectionHasContent(key, p.data);
          show.set(!hidden);
          showNote.textContent = hidden ? 'Hidden. Your content is kept; turn this back on any time.'
            : has ? sectionStatus(key, p.data) + ' on your page.'
            : 'This section is empty, so visitors won’t see it yet.';
        } });
        screen.sync = (p) => {
          const t = A.sectionTitles(p)[key];
          screen.title = t || SECTION_NAMES[key];
          screen.kicker = t && t.toLowerCase() !== SECTION_NAMES[key].toLowerCase() ? SECTION_NAMES[key] : '';
        };
      }
      parts.forEach((x) => x.nodeType && el.append(x));
      const base = screen.sync;
      screen.sync = (p, change) => { base(p, change); parts.forEach((x) => { if (x.sync) x.sync(p, change); else if (x._part) x._part.sync(p, change); }); };
      return screen;
    }

    function laterNote(text) { return h(`<p class="later"><span>Next step</span>${esc(text)}</p>`); }

    // ———— Remix ————
    function remix(changeLook, btn) {
      const p = store.get();
      const done = (colors) => {
        const next = A.remix(p, { changeLook, photoColors: colors });
        store.commit((d) => { d.design = Object.assign({}, d.design, next); }, { kind: 'design', key: null });
        const look = A.LOOKS[next.look];
        announce(`Remixed: ${look.name}, ${look.palettes.find((x) => x.id === next.palette).label}`);
      };
      if (btn && !reduced()) btn.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-4deg) scale(.96)' }, { transform: 'none' }], { duration: 300, easing: EASE });
      colorsFor(S.photos ? S.photos.url(p.data.heroPhotoUrl) : p.data.heroPhotoUrl, done);
    }

    /** Bring a field into view and focus it (clicking that thing on the page). */
    function focusField(key) {
      if (!current || !key) return;
      const target = current.el.querySelector(`[data-fieldkey="${CSS.escape(key)}"]`);
      if (!target) return;
      const input = target.matches('input,textarea,select,button') ? target : target.querySelector('input,textarea,select,[role=radio],button');
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
        if (input) input.focus({ preventScroll: true });
        if (!reduced()) target.animate([{ backgroundColor: 'rgba(37,99,235,.12)' }, { backgroundColor: 'rgba(37,99,235,0)' }], { duration: 1200, easing: 'ease-out' });
      });
    }

    return { go, sync, focusField, hint, get screen() { return current && current.id; } };
  }

  S.createPanel = create;
  S.effectiveOrder = effectiveOrder;
  S.ui = { Seg, Switch };
})();
