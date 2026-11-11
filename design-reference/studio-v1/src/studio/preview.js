/*
 * Athlesite Studio — the live preview.
 *
 * Two frames sit on top of each other. A change renders into the hidden one; once its fonts
 * are in and it's scrolled to the same spot as the visible one, it fades in over it. So a
 * design change never flashes white, never jumps to the top, and rapid clicks just collapse
 * into the newest render (the newest always wins). No View Transitions API: it put an overlay
 * over the page that swallowed clicks mid-animation.
 */
(function () {
  const A = window.Athlesite;
  const SIZES = { desktop: [1440, 900], phone: [390, 844] };
  const PHONE_BEZEL = 12.5; // the phone body drawn around the screen (studio.css .is-phone), in screen px
  const PHONE_CORNER = 30;  // the scroll indicator stays this far from the screen's rounded corners
  const FADE = 180;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Injected into every preview page. "settle" finishes entrance animations instantly while a
  // new frame is prepared, so only the cross-fade moves; reveal-on-scroll still works after.
  const SETTLE_CSS = `html.studio-settle *,html.studio-settle *::before,html.studio-settle *::after{transition:none!important;animation-duration:1ms!important;animation-delay:0s!important}
html{scroll-behavior:auto!important;scrollbar-width:none}
html.studio-tint *,html.studio-tint *::before,html.studio-tint *::after{transition:background-color .35s ease,color .35s ease,border-color .35s ease,fill .35s ease,stroke .35s ease,outline-color .35s ease!important}`;
  // A color-only change (palette, accent) differs from the visible page only in these two tags,
  // so it can be applied in place: no reload, and the colors glide.
  const PALETTE_RE = /<style>(:root\{[^<]*\})<\/style>/;
  const ICON_RE = /<link rel="icon" href="[^"]*">/;
  const THEME_RE = /<meta name="theme-color" content="[^"]*">/;
  const withoutColors = (html) => html.replace(PALETTE_RE, '').replace(ICON_RE, '').replace(THEME_RE, '');
  // Edit mode only: show what can be clicked, and what is being edited.
  const EDIT_CSS = `[data-studio-pick]{cursor:pointer}
[data-studio-pick]:hover{outline:2px solid rgba(37,99,235,.45);outline-offset:-2px}
[data-studio-pick].studio-active{outline:2px solid #2563EB;outline-offset:-2px}
[data-studio-pick] [data-item]{cursor:pointer}
[data-studio-pick] [data-item]:hover{outline:2px solid rgba(37,99,235,.5);outline-offset:3px}
.studio-empty{padding:clamp(28px,4vw,48px) 0}
.studio-empty-box{display:grid;gap:6px;padding:clamp(22px,3vw,34px);border:1.5px dashed color-mix(in srgb,var(--ink) 28%,transparent);border-radius:18px;background:color-mix(in srgb,var(--ink) 3%,transparent);color:var(--ink);font:400 15px/1.45 var(--sans,system-ui,sans-serif);transition:border-color .2s,background .2s}
.studio-empty-box strong{font-size:17px;font-weight:600}
.studio-empty-box span{color:var(--muted)}
.studio-empty:hover .studio-empty-box{border-color:#2563EB;background:color-mix(in srgb,#2563EB 6%,transparent)}`;

  function create(host, { onPick, onKey, onReady } = {}) {
    host.innerHTML = `<div class="pv-anim"><div class="pv-viewport">`
      + `<iframe class="pv-frame is-front" title="Your page" tabindex="0"></iframe>`
      + `<iframe class="pv-frame" title="Your page (loading)" tabindex="-1" aria-hidden="true" inert></iframe>`
      + `<i class="pv-thumb" aria-hidden="true"></i></div></div>`;
    const viewport = host.querySelector('.pv-viewport'), anim = host.querySelector('.pv-anim');
    const thumb = host.querySelector('.pv-thumb');
    let [front, back] = host.querySelectorAll('iframe');
    let device = 'desktop', mode = 'edit', active = null;
    let gen = 0, latest = null, pendingIntro = false, fading = null, firstPaint = true;
    let rafId = 0, loading = false, tintTimer = 0;

    // — Sizing: a 1440-wide desktop (scaled to fit) or a 390×844 phone. On a narrow screen the
    //   page simply fills the canvas at its real width. —
    function layout() {
      const W = host.clientWidth, H = host.clientHeight;
      const narrow = innerWidth < 800;
      let w, h, scale;
      if (narrow) { w = W; h = H; scale = 1; }
      else if (device === 'phone') { [w, h] = SIZES.phone; scale = Math.min(1, (H - 48) / (h + 2 * PHONE_BEZEL), (W - 48) / (w + 2 * PHONE_BEZEL)); }
      else { w = SIZES.desktop[0]; scale = Math.min(1, (W - 48) / w); h = Math.max(560, (H - 48) / scale); }
      viewport.classList.toggle('is-phone', device === 'phone' && !narrow);
      viewport.classList.toggle('is-fill', narrow);
      viewport.style.setProperty('--pv-s', scale);
      Object.assign(viewport.style, {
        width: w + 'px', height: h + 'px', transform: `scale(${scale})`,
        left: Math.round((W - w * scale) / 2) + 'px',
        top: narrow ? '0px' : Math.round(Math.max(24, (H - h * scale) / 2)) + 'px',
      });
    }

    // — Where the visitor is on the page, as "this section, this far in", so it survives a re-render. —
    function anchorOf(frame) {
      const doc = frame.contentDocument, win = frame.contentWindow;
      if (!doc || !doc.body) return null;
      const y = win.scrollY;
      if (y < 4) return { top: true };
      let best = null;
      doc.querySelectorAll('[data-section]').forEach((el) => {
        if (el.dataset.section === 'nav') return;
        const top = el.getBoundingClientRect().top + y;
        if (top <= y + 1) best = { key: el.dataset.section, offset: y - top };
      });
      const max = doc.documentElement.scrollHeight - win.innerHeight;
      return Object.assign(best || {}, { ratio: max > 0 ? y / max : 0 });
    }

    function restore(frame, anchor) {
      const doc = frame.contentDocument, win = frame.contentWindow;
      if (!win) return;
      if (!anchor || anchor.top || !doc) return win.scrollTo(0, 0);
      const el = anchor.key && doc.querySelector(`[data-section="${anchor.key}"]`);
      if (el) {
        const top = el.getBoundingClientRect().top + win.scrollY;
        win.scrollTo(0, top + Math.min(anchor.offset, Math.max(0, el.offsetHeight - 40)));
      } else {
        win.scrollTo(0, anchor.ratio * (doc.documentElement.scrollHeight - win.innerHeight));
      }
    }

    // — Rendering —
    // A color change is applied at once. Anything else builds a whole new page (a new document,
    // fonts, first layout: tens of ms on the main thread the panel shares), so it waits until the
    // click's own feedback in the panel has painted and settled a little; rapid clicks fold into one.
    const SETTLE_MS = 50;
    let buildTimer = 0, buildDelay = SETTLE_MS;
    function update(profile, opts = {}) {
      latest = profile;
      if (opts.intro) pendingIntro = true;
      cancelAnimationFrame(rafId);
      clearTimeout(buildTimer);
      buildDelay = opts.delay || SETTLE_MS;
      rafId = requestAnimationFrame(() => renderNow(false));
    }

    function renderNow(build) {
      if (!latest) return;
      const playing = pendingIntro;
      // Visitor view shows what a visitor gets: only the fields a published page may show (public-view.js),
      // as the product's 'view as visitor' must use the same projection as the public page.
      const shown = mode === 'visitor' && A.publicView ? A.publicView(latest) : latest;
      // Photos stored on this device become object URLs just for this render.
      let html = A.renderSite(A.studio.photos ? A.studio.photos.resolve(shown) : shown, { intro: playing ? 'always' : 'never', prompts: mode === 'edit' });
      html = html.replace('</head>', `<style id="studio-css">${SETTLE_CSS}${mode === 'edit' ? EDIT_CSS : ''}</style></head>`);
      // The opening keeps its own motion; everything else settles while the new frame is prepared.
      if (!playing) html = html.replace('<html lang="en">', '<html lang="en" class="studio-settle">');
      if (!playing && !loading && front._html && withoutColors(front._html) === withoutColors(html) && recolor(html)) return;
      if (!build && !reduced()) { buildTimer = setTimeout(() => renderNow(true), buildDelay); return; }
      const my = ++gen;
      pendingIntro = false;
      // A frame still fading out can't be reused mid-fade: finish that fade now.
      if (fading) { clearTimeout(fading.timer); fading.done(); snap(front); }
      const target = back;
      loading = true;
      target._html = html;
      target.onload = () => { if (my === gen) prepare(target, my, playing); };
      target.srcdoc = html;
    }

    async function prepare(frame, my, playing) {
      const doc = frame.contentDocument, win = frame.contentWindow;
      wire(frame);
      // Fonts change heights; wait for them (briefly) so the scroll lands on the same spot.
      await Promise.race([doc.fonts ? doc.fonts.ready : null, new Promise((r) => setTimeout(r, 700))]);
      if (my !== gen) return;
      settleDip(); // a jump still under way lands first, so the new page opens at its destination
      restore(frame, playing ? { top: true } : anchorOf(front));
      markActive(frame);
      // Two frames for reveal-on-scroll to catch what's now on screen, while still settled.
      await new Promise((r) => win.requestAnimationFrame(() => win.requestAnimationFrame(r)));
      if (my !== gen) return;
      doc.documentElement.classList.remove('studio-settle');
      loading = false;
      swap(frame);
    }

    function swap(next) {
      const prev = front;
      if (firstPaint || reduced()) snap(next);
      front = next; back = prev;
      front.classList.add('is-front');
      front.removeAttribute('aria-hidden'); front.inert = false; front.tabIndex = 0; front.title = 'Your page';
      back.classList.remove('is-front');
      back.setAttribute('aria-hidden', 'true'); back.inert = true; back.tabIndex = -1; back.title = 'Your page (loading)';
      // New frame fades in on top; the old one stays solid underneath until the fade is done.
      back.classList.add('is-leaving');
      const leaving = back;
      const done = () => { leaving.classList.remove('is-leaving'); fading = null; };
      fading = { done, timer: setTimeout(done, firstPaint || reduced() ? 0 : FADE + 30) };
      if (firstPaint) { firstPaint = false; onReady && onReady(); }
    }

    /** Apply a color-only change to the visible page in place. */
    function recolor(html) {
      const doc = front.contentDocument;
      const style = doc && [...doc.head.querySelectorAll('style:not(#studio-css)')].find((x) => x.textContent.startsWith(':root{--bg'));
      const css = html.match(PALETTE_RE), icon = html.match(/<link rel="icon" href="([^"]*)">/);
      if (!style || !css) return false;
      const apply = () => {
        style.textContent = css[1];
        const link = doc.head.querySelector('link[rel="icon"]');
        if (link && icon) link.setAttribute('href', icon[1].replace(/&amp;/g, '&'));
        const meta = doc.head.querySelector('meta[name="theme-color"]'), want = html.match(/<meta name="theme-color" content="([^"]*)">/);
        if (meta && want) meta.setAttribute('content', want[1]);
      };
      front._html = html;
      if (reduced()) { apply(); return true; }
      // The page cross-fades from its old colors to the new ones as one picture (a view transition
      // inside the preview, run by the GPU) instead of animating every color on every element,
      // which repainted the whole page each frame. Older browsers: the per-element glide.
      if (doc.startViewTransition) {
        try { if (front._vt) front._vt.skipTransition(); } catch (e) {}
        front._vt = doc.startViewTransition(apply);
        return true;
      }
      doc.documentElement.classList.add('studio-tint');
      clearTimeout(tintTimer);
      tintTimer = setTimeout(() => doc.documentElement.classList.remove('studio-tint'), 420);
      apply();
      return true;
    }

    /** Jump a frame straight to its resting opacity (no fade). */
    function snap(frame) {
      frame.classList.add('pv-snap');
      void frame.offsetWidth;
      requestAnimationFrame(() => requestAnimationFrame(() => frame.classList.remove('pv-snap')));
    }

    // — The scroll indicator: follows the visible page, fades out once scrolling stops. —
    let thumbTimer = 0;
    function showThumb(frame) {
      if (frame !== front) return;
      const win = frame.contentWindow, doc = frame.contentDocument;
      const H = win.innerHeight, S = doc.documentElement.scrollHeight;
      if (S <= H + 1) return;
      const pad = viewport.classList.contains('is-phone') ? PHONE_CORNER : 0;
      const th = Math.max(36, ((H - 2 * pad) * H) / S), y = pad + ((H - 2 * pad - th) * win.scrollY) / (S - H);
      thumb.style.height = th + 'px';
      thumb.style.transform = `translateY(${y}px)`;
      thumb.classList.add('is-on');
      clearTimeout(thumbTimer);
      thumbTimer = setTimeout(() => thumb.classList.remove('is-on'), 700);
    }

    // — Clicks and keys inside the page —
    function wire(frame) {
      const doc = frame.contentDocument;
      if (!doc) return;
      frame.contentWindow.addEventListener('scroll', () => showThumb(frame), { passive: true });
      if (mode === 'edit') {
        doc.querySelectorAll('[data-section]').forEach((el) => {
          const key = el.dataset.section;
          if (key !== 'nav') el.setAttribute('data-studio-pick', key === 'hero' ? 'cover' : key);
        });
      }
      doc.addEventListener('click', (e) => {
        const a = e.target.closest('a[href]');
        const href = a && a.getAttribute('href');
        // In-page links scroll the preview (a srcdoc page would otherwise navigate the frame away).
        if (href && href.startsWith('#')) {
          e.preventDefault();
          if (mode === 'visitor') {
            const t = href === '#top' ? doc.body : doc.getElementById(href.slice(1));
            if (t) t.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' });
            return;
          }
        }
        if (mode !== 'edit') return;
        if (a) e.preventDefault(); // while editing, links don't leave the page
        const pick = e.target.closest('[data-studio-pick]');
        if (!pick) return;
        const field = e.target.closest('[data-field]'), item = e.target.closest('[data-item]');
        onPick && onPick({ section: pick.dataset.studioPick, field: field ? field.dataset.field : null, item: item ? item.dataset.item : null });
      });
      doc.addEventListener('keydown', (e) => onKey && onKey(e));
    }

    function markActive(frame) {
      const doc = frame.contentDocument;
      if (!doc) return;
      doc.querySelectorAll('.studio-active').forEach((el) => el.classList.remove('studio-active'));
      if (!active || mode !== 'edit') return;
      const el = doc.querySelector(`[data-studio-pick="${active}"]`);
      if (el) el.classList.add('studio-active');
    }

    // Phones: how much of the page the tools sheet covers at the bottom (app.js keeps it current),
    // so "on screen" means above the sheet.
    let inset = 0;
    const visibleH = (win) => Math.max(120, win.innerHeight - inset);

    /** Highlight a section and bring it into view (when it's opened from the panel). */
    function setActive(key, { scroll = true } = {}) {
      active = key;
      markActive(front);
      if (!key || !scroll) return;
      const doc = front.contentDocument, win = front.contentWindow;
      const el = doc && doc.querySelector(`[data-studio-pick="${key}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Only scroll when it isn't already comfortably on screen.
      if (r.top < -40 || r.top > visibleH(win) * 0.6) glideTo(Math.max(0, r.top + win.scrollY - (key === 'cover' ? 0 : 24)));
    }

    // Near: a smooth scroll. Far: the page dips to its own background, jumps, and comes back. A long
    // smooth scroll ran through every section in between (the film reel's full-screen videos included)
    // faster than a laptop can draw them, and looked broken.
    let dip = null; // { frame, top, anim }
    function glideTo(top) {
      const win = front.contentWindow;
      settleDip();
      if (reduced()) return win.scrollTo(0, top);
      if (Math.abs(top - win.scrollY) < visibleH(win) * 1.2) return win.scrollTo({ top, behavior: 'smooth' });
      const frame = front, doc = frame.contentDocument;
      viewport.style.backgroundColor = getComputedStyle(doc.body).backgroundColor !== 'rgba(0, 0, 0, 0)' ? getComputedStyle(doc.body).backgroundColor : getComputedStyle(doc.documentElement).backgroundColor;
      const anim = frame.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' });
      dip = { frame, top, anim };
      anim.onfinish = settleDip;
    }
    /** A dip still fading out lands now: jump to its spot and fade back in. */
    function settleDip() {
      if (!dip) return;
      const { frame, top, anim } = dip;
      dip = null;
      anim.onfinish = null;
      if (frame.contentWindow) frame.contentWindow.scrollTo(0, top);
      const from = +getComputedStyle(frame).opacity;
      anim.cancel();
      frame.animate([{ opacity: from }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    }

    /** Keep one item ("stats:2") in view above the sheet, near the top of what's visible. */
    function reveal(item) {
      const doc = front.contentDocument, win = front.contentWindow;
      const el = doc && item && doc.querySelector(`[data-item="${CSS.escape(item)}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect(), H = visibleH(win);
      if (r.top >= 8 && r.bottom <= H - 8) return;
      glideTo(Math.max(0, r.top + win.scrollY - Math.min(H * 0.25, 120)));
    }

    /** Desktop ↔ phone: the page dips out, takes its new size, and settles back in at the same spot. */
    let deviceToken = 0;
    function setDevice(next) {
      if (next === device) return;
      const my = ++deviceToken;
      const apply = () => {
        const anchor = anchorOf(front);
        device = next;
        layout();
        restore(front, anchor);
      };
      anim.getAnimations().forEach((a) => a.cancel());
      if (reduced()) return apply();
      const out = anim.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.985)' }], { duration: 120, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' });
      out.onfinish = () => {
        if (my !== deviceToken) return;
        apply();
        out.cancel();
        anim.animate([{ opacity: 0, transform: 'scale(.97) translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
      };
    }

    function setMode(next) {
      if (next === mode) return;
      mode = next;
      if (latest) { cancelAnimationFrame(rafId); clearTimeout(buildTimer); renderNow(true); }
    }

    addEventListener('resize', layout);
    layout();
    return {
      update, setDevice, setMode, setActive, reveal, layout,
      setInset(px) { inset = Math.max(0, px || 0); },
      play: () => latest && update(latest, { intro: true }),
      get device() { return device; },
      get mode() { return mode; },
      frame: () => front,
    };
  }

  A.studio = Object.assign(A.studio || {}, { createPreview: create });
})();
