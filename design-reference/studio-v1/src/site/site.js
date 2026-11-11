/* Athlesite site — tiny runtime: reveal on scroll, sticky nav, active section. */
(function () {
  const root = document.documentElement;
  root.classList.add('js');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reveal: stagger siblings that enter together.
  const items = [...document.querySelectorAll('[data-reveal]')];
  let revealIO = null;
  if (reduced || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
  } else {
    const io = revealIO = new IntersectionObserver((entries) => {
      entries.filter((e) => e.isIntersecting).forEach((e, i) => {
        e.target.style.transitionDelay = Math.min(i * 70, 350) + 'ms';
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach((el) => io.observe(el));
  }

  // Hero entrance hook for looks that animate it.
  requestAnimationFrame(() => document.body.classList.add('is-ready'));

  // Fit: big one-line type (stat values, the footer name) shrinks just enough to fit its box,
  // instead of spilling into the next number or off the screen. CSS keeps these on one line.
  const FIT = '.foot-name,.tile dd,.hero-board dd,.hero-strip dd,.ed-figures dd,.pt-figures dd,.pr-keys dd,.sv-lead dd,.sv-rest dd,.sv-ledger dd,.nil-reach dd,.stat dd';
  // Every fit below measures everything first and only then writes, so the page is laid out once
  // per pass instead of once per element (that difference is most of a look switch in the Studio).
  function fitText() {
    const els = [...document.querySelectorAll(FIT)];
    els.forEach((el) => (el.style.fontSize = ''));
    const sizes = els.map((el) => {
      const w = el.clientWidth, over = w ? el.scrollWidth / w : 0;
      // (a little more air for the footer name: serif and outlined letters reach past their box)
      const room = el.classList.contains('foot-name') ? 0.965 : 0.985;
      // (the footer name may shrink further: a 35-letter name has to fit a 320px phone)
      return over > 1.005 - (0.985 - room) ? Math.max(el.classList.contains('foot-name') ? 0.3 : 0.5, room / over) * parseFloat(getComputedStyle(el).fontSize) : 0;
    });
    els.forEach((el, i) => { if (sizes[i]) el.style.fontSize = sizes[i] + 'px'; });
  }
  // Phones: the cover's giant number (or initials) lives in the gap between the nav and the cover's
  // words. When that gap is short (a small phone, a long kicker), it shrinks to fit, and steps aside
  // when there's no room at all. A layout that layers it behind the name on purpose opts out (--fit:off).
  const GIANTS = '.hero-number,.hero-void span,.hero-big';
  const HERO_TEXT = '.hero-kicker,.hero-tag,.hero-rubric,.hero-name,.hero-meta,.pr-kicker';
  let metrics = null;
  function inkTopBottom(el) {
    const cs = getComputedStyle(el), text = el.textContent.trim(), r = el.getClientRects()[0];
    if (!r || !text) return null;
    metrics = metrics || document.createElement('canvas').getContext('2d');
    metrics.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = metrics.measureText(text), range = document.createRange();
    range.selectNodeContents(el);
    const line = range.getClientRects()[0] || r, base = line.top + m.fontBoundingBoxAscent;
    return { top: base - m.actualBoundingBoxAscent, bottom: base + m.actualBoundingBoxDescent };
  }
  function fitGiants() {
    const els = [...document.querySelectorAll(GIANTS)];
    els.forEach((el) => { el.style.fontSize = ''; el.style.visibility = ''; });
    if (innerWidth > 820) return;
    const ctrls = [...document.querySelectorAll('.nav .nav-cta,.nav .nav-menu,.nav .nav-mark')].filter((e) => e.getClientRects().length);
    const navBottom = Math.max(64, ...ctrls.map((e) => e.getBoundingClientRect().bottom)) + scrollY;
    const gutter = parseFloat(getComputedStyle(document.querySelector('.nav') || document.body).paddingLeft) || 20;
    const maxW = document.documentElement.clientWidth - 2 * gutter;
    const writes = [];
    els.forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.getPropertyValue('--fit').trim() === 'off') return;
      const hero = el.closest('.hero');
      const words = hero && [...hero.querySelectorAll(HERO_TEXT)].filter((e) => e.getClientRects().length);
      const ink = inkTopBottom(el);
      if (!words || !words.length || !ink) return;
      const wordsTop = Math.min(...words.map((e) => e.getBoundingClientRect().top)) + scrollY;
      const top = ink.top + scrollY, h = ink.bottom - ink.top;
      const room = wordsTop - 28 - Math.max(top, navBottom + 40);
      // …and it stays inside the side margins.
      const w = el.getBoundingClientRect().width;
      const k = Math.min(room / h, w > maxW ? maxW / w : 1);
      if (k >= 1) return;
      writes.push(room < 64 ? () => (el.style.visibility = 'hidden') : () => (el.style.fontSize = parseFloat(cs.fontSize) * k + 'px'));
    });
    writes.forEach((w) => w());
  }
  // Item lines: a separator left hanging at the end of a line ("Wide receiver / '27 /") is hidden.
  function tidySeparators() {
    const seps = [...document.querySelectorAll('.sep')];
    // (visibility only: hiding one never changes where the lines break)
    const wraps = seps.map((s) => {
      const prev = s.previousElementSibling, next = s.nextElementSibling;
      return !!(prev && next && next.getBoundingClientRect().top > prev.getBoundingClientRect().top + 2);
    });
    seps.forEach((s, i) => s.classList.toggle('sep-wrap', wraps[i]));
  }
  // Names: a long one (a hyphenated last name, "Mary-Catherine") shrinks just enough to fit its column on a
  // phone instead of running off the screen. Names that fit keep the look's size. Runs before the opening
  // measures where the name lands (both wait for the fonts; this one was queued first).
  function fitNames() {
    const els = [...document.querySelectorAll('.hero-name:not(.intro-name)')];
    els.forEach((el) => (el.style.fontSize = ''));
    const sizes = els.map((el) => {
      // The widest line, measured directly: a centered name spills out both sides, which scrollWidth misses.
      // Room = the name's own box or its column, whichever is narrower (a flex item can grow past its column).
      const p = el.parentElement, ps = p ? getComputedStyle(p) : null;
      const col = p ? p.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight) : Infinity;
      const w = Math.min(el.clientWidth, col), widest = Math.max(el.scrollWidth, ...[...el.children].map((c) => c.getBoundingClientRect().width));
      const over = w ? widest / w : 0;
      return over > 1.01 ? Math.max(0.45, 0.97 / over) * parseFloat(getComputedStyle(el).fontSize) : 0;
    });
    els.forEach((el, i) => { if (sizes[i]) el.style.fontSize = sizes[i] + 'px'; });
  }
  // Desktop: a long name never runs into the cover's giant number ("Williamson" into a 13). The name shrinks
  // to end before the number; if that would take it under 60% of its size, the number shrinks instead (the
  // name matters more). A layout that layers the number behind the name on purpose opts out (--fit:off).
  function clearGiants(pass = 0) {
    if (innerWidth <= 820) return;
    const GAP = 28, writes = [];
    document.querySelectorAll(GIANTS).forEach((g) => {
      const cs = getComputedStyle(g);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.getPropertyValue('--fit').trim() === 'off') return;
      const name = g.closest('.hero') && g.closest('.hero').querySelector('.hero-name:not(.intro-name)');
      if (!name) return;
      // The text's own extent per line (a line can stretch to its column's full width; its letters don't).
      const gr = g.getBoundingClientRect(), parts = name.children.length ? [...name.children] : [name];
      const rs = parts.map((p) => { const rg = document.createRange(); rg.selectNodeContents(p); return rg.getBoundingClientRect(); }).filter((r) => r.width && r.bottom > gr.top && r.top < gr.bottom);
      if (!rs.length) return;
      const left = Math.min(...rs.map((r) => r.left)), right = Math.max(...rs.map((r) => r.right));
      const toRight = gr.left + gr.width / 2 > (left + right) / 2; // the number sits right of the name (or left)
      const room = toRight ? gr.left - GAP - left : right - (gr.right + GAP), w = right - left;
      if (room >= w || w <= 0) return;
      const nfs = parseFloat(getComputedStyle(name).fontSize), gfs = parseFloat(cs.fontSize);
      const k = Math.max(pass ? 0.85 : 0.6, room / w);
      writes.push(() => { name.style.fontSize = nfs * k + 'px'; });
      if (room / w < 0.6) {
        const nameEdge = toRight ? left + w * 0.6 + GAP : right - w * 0.6 - GAP;
        const gw = toRight ? gr.right - nameEdge : nameEdge - gr.left;
        writes.push(() => { g.style.fontSize = Math.max(0.35, gw / gr.width) * gfs + 'px'; });
      }
    });
    writes.forEach((w) => w());
    if (writes.length && pass < 2) clearGiants(pass + 1); // measure again: the letters don't shrink exactly in step
  }
  const fitAll = () => { fitNames(); fitText(); fitGiants(); clearGiants(); tidySeparators(); };
  // Before the fonts are in, sizes are about to change anyway: fit once they're ready.
  if (!document.fonts || document.fonts.status === 'loaded') fitAll();
  if (document.fonts) { document.fonts.ready.then(fitAll); document.fonts.addEventListener('loadingdone', () => requestAnimationFrame(fitAll)); }
  // …and once more after load: a display face can swap in after both of those (seen in Highlight).
  addEventListener('load', () => { setTimeout(fitAll, 400); setTimeout(fitAll, 1400); });
  let fitTimer = 0;
  addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitAll, 120); });

  // Opening animation (only when <head> decided to play it).
  const intro = document.querySelector('.intro');
  if (intro && root.classList.contains('intro-running')) playIntro(intro);
  else if (intro) intro.remove();

  async function playIntro(intro) {
    const real = document.querySelector('.hero-name');
    if (!real) return endIntro(intro, null);
    // Fonts change the name's size; measure only once they're in (or after a short wait).
    await Promise.race([document.fonts ? document.fonts.ready : null, new Promise((r) => setTimeout(r, 1200))]);
    fitAll(); // final sizes before anything is measured

    const rect = real.getBoundingClientRect();
    const name = cloneWithStyles(real);
    name.classList.add('intro-name');
    Object.assign(name.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px' });
    intro.appendChild(name);

    // Start with the letters centered on screen. The headline box can be much wider than its
    // text (left-aligned in a full-width column), so center and scale around the text itself.
    const ink = inkBox(real);
    // Center in the visible area (the stage doesn't cover the scrollbar's space).
    const vw = document.documentElement.clientWidth;
    const cs = getComputedStyle(intro);
    const want = parseFloat(cs.getPropertyValue('--intro-name-scale')) || 1;
    // A look can sit the name below the middle (phones stack a number above it).
    const cy = innerHeight * (parseFloat(cs.getPropertyValue('--intro-name-y')) || 0.5);
    const scale = Math.min(want, (vw * 0.88) / ink.width, (innerHeight * 0.5) / ink.height);
    const ox = ink.left - rect.left + ink.width / 2, oy = ink.top - rect.top + ink.height / 2;
    name.style.transformOrigin = `${ox}px ${oy}px`;
    name._home = { real, left: rect.left, top: rect.top };
    const dx = vw / 2 - (rect.left + ox), dy = cy - (rect.top + oy);
    name.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    // Tell the look where the centered name sits, so its supporting lines can hug it.
    intro.style.setProperty('--name-top', cy - (ink.height * scale) / 2 + 'px');
    intro.style.setProperty('--name-bottom', cy + (ink.height * scale) / 2 + 'px');
    intro.style.setProperty('--name-y', cy + 'px');
    // A number that lands on the cover hides the cover's own copy until it arrives.
    if (intro.querySelector('.i-num[data-land]') && numberTarget(intro.querySelector('.i-num[data-land]').textContent.trim())) root.classList.add('num-flight');

    // Review switches: ?introAt=p2 freezes at a step (or "out" mid-landing), ?introSlow=4 plays at quarter speed.
    const q = new URLSearchParams(location.search);
    const holdAt = q.get('introAt'), slow = Math.max(1, +q.get('introSlow') || 1);
    let steps = (intro.dataset.steps || 'out:1200').split(',').map((s) => s.split(':')).map(([n, t]) => [n.trim(), +t * slow]);
    if (holdAt) {
      const upto = steps.findIndex(([n]) => n === holdAt);
      steps.slice(0, upto + 1).forEach(([n]) => n !== 'out' && intro.classList.add('is-' + n));
      if (holdAt === 'out') { intro.classList.add('is-out'); name.style.transform = 'none'; }
      return;
    }
    const timers = [];
    let finished = false;
    const finish = (fast) => {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      steps.forEach(([n]) => n !== 'out' && intro.classList.add('is-' + n));
      if (fast) intro.classList.add('is-fast');
      land(intro, name, fast);
    };
    steps.forEach(([n, t]) => timers.push(setTimeout(() => (n === 'out' ? finish(false) : intro.classList.add('is-' + n)), t)));
    countUp(intro);

    // Any intent to get going skips straight to the page.
    const skip = () => finish(true);
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => addEventListener(ev, skip, { once: true, passive: true }));
  }

  /** Fly the copy onto the real headline while the look plays its exit, then hand over. */
  function land(intro, name, fast) {
    const dur = (fast ? 380 : 1000) * Math.max(1, +new URLSearchParams(location.search).get('introSlow') || 1);
    // All measuring happens first, while the page is still unchanged (cheap); the class changes
    // after it then cost one style pass in the next frame instead of a forced one right here.
    // Land exactly where the real headline is now: if anything moved it since the start
    // (late fonts, a layout change), aim there, so the hand-off never jumps.
    const home = name._home, now = home.real.getBoundingClientRect();
    const to = `translate(${now.left - home.left}px, ${now.top - home.top}px)`;
    const num = intro.querySelector('.i-num[data-land]');
    if (num) flyNumber(num, dur);
    intro.classList.add('is-out');
    root.classList.replace('intro-running', 'intro-landing'); // page scrolls, nav and cover entrances resume
    name.style.transition = `transform ${dur}ms cubic-bezier(.16,1,.3,1), color .45s`;
    requestAnimationFrame(() => { name.style.transform = to; });
    riseCoverDetails(fast);
    setTimeout(() => endIntro(intro, name), dur + 60);
  }

  /**
   * Where the opening's number belongs on the cover: the cover's giant number when this layout
   * shows one, otherwise the digits of "No. 14" in the details line. Null when neither is on screen.
   */
  function numberTarget(text) {
    if (!text) return null;
    const giant = [...document.querySelectorAll('.hero-number,.hero-void span')]
      .find((el) => el.textContent.trim() === text && el.getClientRects().length && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden');
    if (giant) return { el: giant, giant: true };
    for (const line of document.querySelectorAll('.hero-meta,.hero-kicker')) {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const at = n.textContent.indexOf(text);
        if (at < 0 || !/\d/.test(text)) continue;
        const range = document.createRange();
        range.setStart(n, at); range.setEnd(n, at + text.length);
        if (range.getClientRects().length) return { range, giant: false };
      }
    }
    return null;
  }

  /**
   * The opening's number flies onto its place in the cover, in step with the name. On a cover
   * with a giant number the two cross-fade once they line up (only the outline weight differs);
   * otherwise it shrinks into the "No. 14" of the details line as that line rises in.
   */
  function flyNumber(num, dur) {
    const target = numberTarget(num.textContent.trim());
    if (!target) return; // the look's own exit (a fade) plays instead
    // Measure the destination before anything starts moving.
    const to = target.giant ? inkBox(target.el) : boxOf(target.range.getClientRects());
    const from = inkBox(num); // where it is now, mid-drift
    const opacity = getComputedStyle(num).opacity;
    // Stand it still at the same spot under a transform we control, then glide that transform.
    num.style.transition = 'none';
    num.style.translate = 'none'; num.style.scale = 'none';
    num.style.transformOrigin = '0 0';
    const el = num.getBoundingClientRect(), base = inkBox(num);
    const map = (b) => {
      const s = b.height / base.height;
      return `translate(${b.left - el.left - s * (base.left - el.left)}px, ${b.top - el.top - s * (base.top - el.top)}px) scale(${s})`;
    };
    num.style.transform = map(from);
    num.style.opacity = opacity;
    void num.offsetWidth;
    num.classList.add('is-flying');
    const ease = 'cubic-bezier(.16,1,.3,1)';
    requestAnimationFrame(() => {
      num.style.transition = `transform ${dur}ms ${ease}, opacity ${Math.round(dur * 0.4)}ms ease ${Math.round(dur * (target.giant ? 0.55 : 0.4))}ms, -webkit-text-stroke-color ${dur}ms`;
      num.style.transform = map(to);
      num.style.opacity = '0';
      if (target.giant) {
        num.style.webkitTextStrokeColor = getComputedStyle(target.el).webkitTextStrokeColor;
        // The cover's number fades in underneath as the copy fades out, at the same spot.
        setTimeout(() => target.el.classList.add('is-handed'), dur * 0.55);
      }
    });
  }

  function boxOf(rects) {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const x of rects) { l = Math.min(l, x.left); t = Math.min(t, x.top); r = Math.max(r, x.right); b = Math.max(b, x.bottom); }
    return { left: l, top: t, width: r - l, height: b - t };
  }

  function endIntro(intro) {
    root.classList.remove('intro-running', 'intro-landing');
    root.classList.add('intro-played');
    intro.remove();
    document.dispatchEvent(new Event('athlesite:intro-done'));
  }

  /** The cover's supporting lines arrive one after another as the name lands. */
  function riseCoverDetails(fast) {
    const parts = document.querySelectorAll('.hero-kicker,.hero-rubric,.hero-tag,.pr-kicker,.hero-meta,.pr-line,.hero-tagline,.hero-standfirst,.hero-byline,.hero-rule,.hero-placard,.pr-chips,.pr-keys,.pr-actions,.hero-actions,.hero-strip,.hero-board');
    parts.forEach((el, i) => el.animate(
      [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
      { duration: 700, delay: (fast ? 60 : 260) + i * 70, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }
    ));
  }

  /** The box around the letters themselves (each text run measured on its own; stretched line boxes ignored). */
  function inkBox(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      range.selectNodeContents(n);
      for (const box of range.getClientRects()) {
        l = Math.min(l, box.left); t = Math.min(t, box.top); r = Math.max(r, box.right); b = Math.max(b, box.bottom);
      }
    }
    return l === Infinity ? el.getBoundingClientRect() : { left: l, top: t, width: r - l, height: b - t };
  }

  /** Copy with computed text styles inlined, so it matches the original outside its usual parents. */
  function cloneWithStyles(src) {
    const props = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-transform', 'color',
      'display', 'flex-direction', 'gap', 'padding-left', 'text-align', 'white-space', 'text-wrap', '-webkit-text-stroke'];
    const copy = (a, b) => {
      const cs = getComputedStyle(a);
      props.forEach((p) => b.style.setProperty(p, cs.getPropertyValue(p)));
      b.style.animation = 'none';
      [...a.children].forEach((child, i) => copy(child, b.children[i]));
    };
    const out = src.cloneNode(true);
    out.removeAttribute('data-field');
    out.setAttribute('aria-hidden', 'true'); // the real headline stays the one screen readers announce
    copy(src, out);
    return out;
  }

  /** Numbers marked data-count tick up from zero, keeping their format (".382", "1,284", "92 mph"). */
  function countUp(scope) {
    scope.querySelectorAll('[data-count]').forEach((el) => {
      const target = el.dataset.count;
      const m = target.match(/^([^\d.]*)(\d[\d,]*\.?\d*|\.\d+)(.*)$/);
      if (!m || target.includes(':')) return; // times like 2:09.80 stay as written
      const [, pre, num, post] = m;
      const value = parseFloat(num.replace(/,/g, ''));
      const decimals = (num.split('.')[1] || '').length;
      const start = performance.now(), dur = 900;
      const fmt = (v) => {
        let s = v.toFixed(decimals);
        if (num.includes(',')) s = Number(s).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        if (num.startsWith('.')) s = s.replace(/^0/, '');
        return pre + s + post;
      };
      const tick = (now) => {
        const t = Math.min(1, (now - start) / dur);
        el.textContent = fmt(value * (1 - Math.pow(1 - t, 3)));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  // — Nav —
  const nav = document.querySelector('.nav');
  const hero = document.querySelector('.hero');
  // The nav turns solid before anything on the cover (its words, the big number) can slide under
  // it, so text never sits on text. Cinematic's cover words also lift as you scroll (hence / 1.1).
  let solidAt = 40;
  function measureSolid() {
    if (!nav || !hero) return;
    const els = [...hero.querySelectorAll('h1,p,dl,.hero-actions,.hero-number,.hero-big,.hero-void span,.hero-monogram')]
      .filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.closest('.intro'));
    if (!els.length) return;
    const top = Math.min(...els.map((e) => e.getBoundingClientRect().top + scrollY));
    solidAt = Math.max(0, Math.min(hero.offsetHeight - 80, (top - nav.offsetHeight - 8) / 1.1));
  }
  if (nav) {
    // Solid once the cover's content reaches it, and always on screen: Contact is what a coach needs at any
    // point of the page (Willy, session 7; it used to tuck away while reading down).
    const onScroll = () => { nav.classList.toggle('is-stuck', scrollY > solidAt); };
    addEventListener('scroll', onScroll, { passive: true });
    measureSolid();
    onScroll();
    const remeasure = () => { measureSolid(); onScroll(); };
    if (document.fonts) document.fonts.ready.then(remeasure);
    addEventListener('resize', remeasure);
    // Once the cover's entrances have settled: after the opening if one plays (never mid-flight),
    // otherwise a moment after load.
    if (root.classList.contains('intro-running')) document.addEventListener('athlesite:intro-done', () => setTimeout(remeasure, 1200), { once: true });
    else setTimeout(remeasure, 2600);
  }

  // The marker slides to the section you're in, and follows the pointer while you browse the links.
  const navLinks = nav && nav.querySelector('.nav-links');
  let current = null;
  const links = navLinks ? [...navLinks.querySelectorAll('a')] : [];
  const ind = navLinks && navLinks.querySelector('.nav-ind');
  function place(a) {
    if (!ind) return;
    links.forEach((l) => l.classList.toggle('is-on', l === a));
    const showing = navLinks.classList.contains('has-ind');
    navLinks.classList.toggle('has-ind', !!a);
    if (!a || !a.offsetWidth) return;
    // Appearing from nothing: start under the link instead of sliding in from the last spot.
    if (!showing) ind.style.transition = 'none';
    ind.style.width = a.offsetWidth + 'px';
    ind.style.transform = `translateX(${a.offsetLeft}px)`;
    if (!showing) { void ind.offsetWidth; ind.style.transition = ''; }
  }
  if (navLinks) {
    links.forEach((a) => { a.addEventListener('mouseenter', () => place(a)); a.addEventListener('focus', () => place(a)); });
    navLinks.addEventListener('mouseleave', () => place(current));
    navLinks.addEventListener('focusout', (e) => { if (!navLinks.contains(e.relatedTarget)) place(current); });
    if ('IntersectionObserver' in window) {
      const spy = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          current = e.target === hero ? null : links.find((a) => a.getAttribute('href') === '#' + e.target.id) || null;
          links.forEach((a) => (a === current ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
          if (!navLinks.matches(':hover') && !navLinks.contains(document.activeElement)) place(current);
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      document.querySelectorAll('main > section[id]').forEach((s) => spy.observe(s));
      if (hero) spy.observe(hero);
    }
  }

  // When the sections don't fit beside the name and Contact, drop the name, then fold them into Menu.
  function fitNav() {
    if (!nav) return;
    nav.classList.remove('is-tight', 'is-compact', 'is-short');
    const over = () => nav.scrollWidth > nav.clientWidth + 1;
    if (innerWidth > 820 && navLinks) { // phones always use Menu (CSS)
      if (over()) nav.classList.add('is-tight');
      if (over()) nav.classList.add('is-compact');
    }
    if (over()) nav.classList.add('is-short'); // still too wide: the name becomes initials
    place(current);
  }
  fitNav();
  addEventListener('resize', fitNav);
  if (document.fonts) document.fonts.ready.then(fitNav);

  // Menu: the sections as a full-screen list in the look's headline type.
  const menuBtn = nav && nav.querySelector('.nav-menu');
  const sheet = document.getElementById('nav-sheet');
  if (menuBtn && sheet) {
    const focusables = () => [...sheet.querySelectorAll('a,button')];
    const open = () => {
      sheet.hidden = false;
      sheet.classList.remove('is-closing');
      sheet.classList.add('is-open');
      menuBtn.setAttribute('aria-expanded', 'true');
      root.classList.add('sheet-open');
      const first = sheet.querySelector('a');
      if (first) first.focus({ preventScroll: true });
    };
    const close = (leaving) => {
      if (sheet.hidden) return;
      menuBtn.setAttribute('aria-expanded', 'false');
      root.classList.remove('sheet-open');
      sheet.classList.remove('is-open');
      sheet.classList.add('is-closing');
      setTimeout(() => { sheet.hidden = true; sheet.classList.remove('is-closing'); if (!leaving) menuBtn.focus({ preventScroll: true }); }, reduced ? 0 : 260);
    };
    menuBtn.addEventListener('click', open);
    sheet.querySelector('.nav-close').addEventListener('click', () => close());
    sheet.addEventListener('click', (e) => { if (e.target.closest('a')) close(true); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    // Keep keyboard focus inside the sheet while it's open.
    sheet.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = focusables(), i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });
  }

  /*
   * Signature scroll moments: one per look, each built to hold up with an average phone photo.
   * Scroll-linked ones only write a CSS variable per frame (the look's CSS turns it into
   * transforms); one-shot ones play when their section comes into view. Off for reduced motion
   * and for still screenshots.
   */
  const look = (document.body.className.match(/\blook-(\w+)/) || [])[1];
  // data-still: set by test tools that render pages into frames (no URL to carry static=1).
  const still = reduced || /[?&]static=1/.test(location.search) || root.hasAttribute('data-still');
  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const scrubbers = [];
  let ticking = false;
  const scrub = () => { ticking = false; scrubbers.forEach((f) => f()); };
  const requestScrub = () => { if (!ticking) { ticking = true; requestAnimationFrame(scrub); } };
  /** Run once when an element is mostly on screen. */
  const onEnter = (els, fn, threshold = 0.45) => {
    if (!('IntersectionObserver' in window)) return els.forEach(fn);
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); fn(e.target); } }), { threshold });
    els.forEach((el) => io.observe(el));
  };

  if (!still) {
    // Cinematic — end of the scene: leaving the cover, the photo drifts slower than the page and
    // fades to black while the name lifts away.
    if (look === 'cinematic' && hero && hero.querySelector('.hero-media')) {
      hero.querySelector('.hero-media').insertAdjacentHTML('beforeend', '<i class="cine-fade" aria-hidden="true"></i>');
      hero.classList.add('has-credits');
      scrubbers.push(() => {
        const out = clamp01(scrollY / (hero.offsetHeight || 1));
        if (hero._out !== out) { hero._out = out; hero.style.setProperty('--out', out.toFixed(4)); }
      });
    }

    // Editorial — read-along: the story's opening paragraph lights up word by word as you read down it,
    // and the smaller paragraphs under it wait until it's fully read, then fade in (About, and the
    // athlete's own section, which shares this layout). Scrolling back up puts them away again.
    if (look === 'editorial') {
      document.querySelectorAll('.story-lead').forEach((p) => {
        const words = splitWords(p);
        if (words.length < 6) return;
        p.classList.add('is-reading');
        const rest = [...p.parentElement.children].filter((el) => el !== p);
        rest.forEach((el, i) => {
          if (revealIO) revealIO.unobserve(el);
          el.removeAttribute('data-reveal');
          el.classList.add('after-read');
          el.style.setProperty('--k', i);
        });
        scrubbers.push(() => {
          const r = p.getBoundingClientRect(), H = innerHeight;
          // At the very bottom of the page there's no scroll left to finish the sentence with.
          const end = scrollY + H >= root.scrollHeight - 4;
          const lit = end ? words.length : Math.round(clamp01((H * 0.85 - r.top) / (r.height + H * 0.35)) * words.length);
          if (p._lit === lit) return;
          p._lit = lit;
          words.forEach((w, i) => w.classList.toggle('is-lit', i < lit));
          rest.forEach((el) => el.classList.toggle('is-read', lit === words.length));
        });
      });
    }

    // Highlight — scoreboard: every digit spins up into place like a stadium board.
    if (look === 'highlight') {
      const dds = [...document.querySelectorAll('.s-stats .board dd, .s-stats .sv-lead dd, .s-stats .sv-ledger dd')].filter((dd) => /\d/.test(dd.textContent));
      dds.forEach((dd) => {
        const text = dd.textContent;
        const cells = [...text].map((ch, i) => (/\d/.test(ch)
          ? `<span class="odo" style="--d:${ch};--k:${i}"><span>${'0123456789'.repeat(2).split('').map((n) => `<i>${n}</i>`).join('')}</span></span>`
          : `<span class="odo-c">${esc(ch)}</span>`)).join('');
        dd.innerHTML = `<span class="sr-only">${esc(text)}</span><span class="odo-row" aria-hidden="true">${cells}</span>`;
      });
      onEnter(dds, (dd) => dd.classList.add('is-rolled'), 0.6);
    }

    // Portrait — walking up to the print: each photo below the cover grows from a matted print
    // to its full frame as you approach it (transforms only, so it stays smooth on phones).
    if (look === 'portrait') {
      document.querySelectorAll('.s-gallery figure, .film-poster').forEach((f) => {
        const img = f.querySelector('img');
        if (!img) return;
        let frame = f;
        if (f.tagName === 'FIGURE') { frame = document.createElement('span'); frame.className = 'print'; img.replaceWith(frame); frame.appendChild(img); }
        frame.classList.add('is-print');
        scrubbers.push(() => {
          const r = frame.getBoundingClientRect(), H = innerHeight;
          const near = clamp01((H - r.top) / (H * 0.65));
          if (frame._near !== near) { frame._near = near; frame.style.setProperty('--near', near.toFixed(3)); }
        });
      });
    }

    // Prospect — scout readout: stat rows print in one after another under a scan line, numbers counting up.
    if (look === 'prospect') {
      const table = document.querySelector('.pr-table');
      if (table) {
        const rows = [...table.querySelectorAll('tbody tr')];
        rows.forEach((tr, i) => tr.style.setProperty('--r', i));
        table.classList.add('will-scan');
        onEnter([table], () => {
          table.classList.add('is-scanning');
          rows.forEach((tr, i) => {
            const v = tr.children[1];
            if (!v) return;
            v.dataset.count = v.textContent;
            setTimeout(() => countUp(tr), 120 + i * 90);
          });
        }, 0.25);
      }
    }

    document.querySelectorAll('.reel').forEach(setupReel);
    document.querySelectorAll('.folio').forEach(setupFolio);

    if (scrubbers.length) {
      addEventListener('scroll', requestScrub, { passive: true });
      addEventListener('resize', requestScrub);
      scrub();
    }
  }
  document.querySelectorAll('.folio').forEach(setupLightbox);

  /*
   * Showcase sections, adapted from motionin's Cinema Reel (Film "Reel") and Folio (Gallery "Folio").
   * Both pin for a few screens and follow the page's own scroll position, eased like the originals
   * (those captured the wheel and looped forever; here the page always carries on after the last one).
   * Per frame they only write transforms and opacity, and they stop ticking once settled.
   */
  function ease(cur, target, k, dt) {
    return Math.abs(target - cur) < 0.0005 ? target : cur + (target - cur) * (1 - Math.pow(1 - k, dt / 16.67));
  }

  /** A ring that follows the pointer over a stage ("Scroll", "View"); mouse and trackpad only. */
  function pointerRing(area, label, size) {
    if (!area || !matchMedia('(hover: hover) and (pointer: fine)').matches) return null;
    const el = document.createElement('div');
    el.className = 'sc-cursor';
    el.setAttribute('aria-hidden', 'true');
    el.style.setProperty('--size', size + 'px');
    el.textContent = label;
    document.body.appendChild(el);
    const ring = { el, x: 0, y: 0, tx: 0, ty: 0, on: false, kick: null };
    area.addEventListener('pointermove', (e) => {
      const over = !e.target.closest('a,.reel-pip');
      if (!ring.on) { ring.x = e.clientX; ring.y = e.clientY; }
      ring.tx = e.clientX; ring.ty = e.clientY; ring.on = over;
      el.classList.toggle('is-on', over);
      if (ring.kick) ring.kick();
    });
    area.addEventListener('pointerleave', () => { ring.on = false; el.classList.remove('is-on'); });
    ring.step = (dt) => {
      ring.x = ease(ring.x, ring.tx, 0.22, dt); ring.y = ease(ring.y, ring.ty, 0.22, dt);
      el.style.transform = `translate3d(${ring.x.toFixed(1)}px,${ring.y.toFixed(1)}px,0)`;
      return ring.on && (Math.abs(ring.x - ring.tx) > 0.3 || Math.abs(ring.y - ring.ty) > 0.3);
    };
    return ring;
  }

  /** One rAF loop per section that runs only while something is still moving. */
  function ticker(step) {
    let raf = 0, last = 0;
    const frame = (now) => {
      const dt = last ? Math.min(64, now - last) : 16.67;
      last = now;
      raf = step(dt, now) ? requestAnimationFrame(frame) : 0;
      if (!raf) last = 0;
    };
    return () => { if (!raf) raf = requestAnimationFrame(frame); };
  }

  /**
   * Settling: when a scroll comes to rest between two items, the page glides on to the nearer one.
   * Only strictly inside the pinned stretch, so it never pulls anyone back who is scrolling out past
   * the first or last item (CSS scroll snapping did exactly that, so it isn't used).
   */
  function settle(get) {
    let timer = 0;
    const go = () => {
      const { top, step, n } = get();
      const p = (scrollY - top) / step, k = Math.round(p);
      if (p <= 0.04 || p >= n - 1 - 0.04 || Math.abs(p - k) < 0.02 || root.classList.contains('folio-open')) return;
      scrollTo({ top: top + k * step, behavior: reduced ? 'auto' : 'smooth' });
    };
    const later = () => { clearTimeout(timer); timer = setTimeout(go, 160); };
    addEventListener('scroll', later, { passive: true });
  }

  function setupReel(reel) {
    const stage = reel.querySelector('.reel-stage'), track = reel.querySelector('.reel-track');
    const slides = [...reel.querySelectorAll('.reel-slide')].map((el) => ({ el, img: el.querySelector('.reel-img'), content: el.querySelector('.reel-content'), o: -1, cy: 0, d: 1e9 }));
    const pips = [...reel.querySelectorAll('.reel-pip')], at = reel.querySelector('.reel-at');
    const n = slides.length;
    if (n < 2) return;
    reel.classList.add('is-live');
    let top = 0, H = 1, pitch = 1, slideH = 1;
    const measure = () => { H = stage.clientHeight || innerHeight; pitch = H * 0.85; slideH = H * 0.8; top = reel.getBoundingClientRect().top + scrollY; };
    measure();
    let pos = Math.max(0, Math.min(n - 1, (scrollY - top) / H)), active = -1, prev = -1;
    let entry = null, entered = false, scan = null;
    // The entrance: three fast loops through the reel under projector scanlines, braking onto the video
    // you're on. (No motion blur: a full-screen blur every frame stuttered on laptop graphics chips,
    // Willy's Iris Xe at 150% included; at this speed the eye blurs it anyway.)
    // scanlines, braking onto the video you're on. Once, the first time the reel fills the screen.
    const startEntrance = (now) => {
      entered = true;
      if (reduced) return;
      stage.insertAdjacentHTML('beforeend', '<div class="reel-scan"></div>');
      scan = stage.querySelector('.reel-scan');
      entry = { t0: now, dur: 1800, from: -3 * n };
    };
    const endEntrance = () => {
      stage.querySelectorAll('.reel-scan').forEach((x) => x.remove());
      scan = null;
      const landing = slides[Math.round(pos)];
      if (landing) landing.el.classList.add('is-revealed');
    };
    const ring = pointerRing(stage, 'Scroll', 104);
    const kick = ticker((dt, now) => {
      const target = Math.max(0, Math.min(n - 1, (scrollY - top) / H));
      pos = ease(pos, target, 0.11, dt);
      let show = pos, looping = false;
      if (entry) {
        const t = Math.min(1, (now - entry.t0) / entry.dur);
        show = pos + entry.from * Math.pow(1 - t, 3); // power3.out
        looping = t < 1;
        const speed = Math.pow(1 - t, 2);
        if (scan) scan.style.opacity = speed.toFixed(3);
        if (t >= 1) { entry = null; endEntrance(); }
      }
      const cur = Math.max(0, Math.min(n - 1, Math.round(show)));
      if (!looping && cur !== active) {
        prev = active; active = cur;
        pips.forEach((p, i) => { p.classList.toggle('is-on', i === active); p.toggleAttribute('aria-current', i === active); });
        if (at) at.textContent = String(active + 1).padStart(2, '0');
      }
      slides.forEach((s, i) => {
        let d = i - show;
        if (looping) { d = ((d % n) + n) % n; if (d > n / 2) d -= n; }
        if (Math.abs(d) > 1.6 && Math.abs(s.d) > 1.6) return; // off screen and staying there
        s.d = d;
        s.el.style.transform = `translate3d(0,${(d * pitch).toFixed(2)}px,0)`;
        s.img.style.transform = `translate3d(0,${(-d * pitch / 1.2).toFixed(2)}px,0)`;
        // Words: the arriving video's fade in once its frame is mostly in; the leaving one's race ahead.
        const dn = Math.abs(d) * pitch / slideH;
        let o = 0, y = 0;
        if (!entry && i === active) { const t = clamp01(1 - dn / 0.55); o = t * t * (3 - 2 * t); y = (1 - o) * 64 * Math.sign(d || 1); }
        else if (!entry && i === prev) { o = clamp01(1 - Math.max(0, dn - 0.6) / 0.6); y = -d * pitch * 0.42; }
        if (Math.abs(o - s.o) > 0.001 || Math.abs(y - s.cy) > 0.3) {
          s.o = o; s.cy = y;
          s.content.style.opacity = o.toFixed(3);
          s.content.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`;
          // Faded words don't take clicks, but stay in the Tab order (focus brings their video on).
          s.content.style.pointerEvents = o < 0.01 ? 'none' : '';
        }
      });
      const ringMoving = ring ? ring.step(dt) : false;
      return !!entry || Math.abs(target - pos) > 0.0005 || ringMoving;
    });
    if (ring) ring.kick = kick;
    addEventListener('resize', () => { measure(); kick(); });
    if (document.fonts) document.fonts.ready.then(() => { measure(); kick(); });
    scrubbers.push(() => {
      const r = stage.getBoundingClientRect();
      if (!entered && r.top < H * 0.35 && r.bottom > H * 0.6) startEntrance(performance.now());
      kick();
    });
    pips.forEach((p) => p.addEventListener('click', () => scrollTo({ top: top + +p.dataset.i * H, behavior: reduced ? 'auto' : 'smooth' })));
    // Keyboard: Tab onto a video's link and the reel brings that video on stage (it was hidden
    // before and focus dropped to the page when the reel moved on).
    reel.addEventListener('focusin', (e) => {
      const i = slides.findIndex((s) => s.el.contains(e.target));
      if (i < 0) return;
      measure();
      // No entrance loops under a focused link: it would spin out of view for two seconds.
      entered = true;
      if (entry) { entry = null; endEntrance(); }
      const go = () => scrollTo({ top: top + i * H, behavior: 'auto' });
      go(); requestAnimationFrame(go); // after the browser's own scroll-to-focus
      pos = i; kick();
    });
    settle(() => ({ top, step: H, n }));
    kick();
  }

  function setupFolio(folio) {
    const stage = folio.querySelector('.folio-stage');
    const rows = [...folio.querySelectorAll('.folio-row')].map((el) => ({ el, sub: el.querySelector('.folio-sub') }));
    const slots = [...folio.querySelectorAll('.folio-slot')];
    const at = folio.querySelector('.folio-at');
    const n = slots.length;
    if (n < 3) return;
    folio.classList.add('is-live');
    const phone = matchMedia('(max-width: 767px)');
    let top = 0, H = 1, step = 1, G = null;
    const measure = () => {
      H = stage.clientHeight || innerHeight;
      // The original's geometry: on desktop nine caption rows beside a photo 60% of the screen high;
      // phones stack the captions over the photos, meeting at the middle of the screen.
      G = phone.matches
        ? { step: 0.55, slot: 0.1, mid: 0.45, img: 0.38, pitch: 0.42, imgMid: 0.19 }
        : { step: 0.7, slot: 0.8 / 9, mid: 0.4, img: 0.6, pitch: 0.65, imgMid: 0.5 };
      step = H * G.step;
      top = folio.getBoundingClientRect().top + scrollY;
    };
    measure();
    let pos = Math.max(0, Math.min(n - 1, (scrollY - top) / step)), active = -1, entered = false;
    folio.goTo = (i) => scrollTo({ top: top + i * step, behavior: reduced ? 'auto' : 'smooth' });
    folio.current = () => active;
    const ring = pointerRing(folio.querySelector('.folio-images'), 'View', 76);
    const kick = ticker((dt) => {
      const target = Math.max(0, Math.min(n - 1, (scrollY - top) / step));
      pos = ease(pos, target, 0.14, dt);
      const a = Math.round(pos);
      if (a !== active) { active = a; if (at) at.textContent = String(a + 1).padStart(2, '0'); slots.forEach((s, i) => s.classList.toggle('is-current', i === a)); }
      rows.forEach((r, i) => {
        const dist = Math.abs(i - pos);
        const tc = Math.max(0, 1 - dist * 2), tt = Math.max(0, 1 - dist * 0.55), ts = Math.max(0, 1 - dist * 2.8);
        const y = (G.mid + (i - pos) * G.slot - G.slot / 2) * H;
        r.el.style.transform = `translate3d(0,${y.toFixed(2)}px,0) scale(${(0.9 + 0.1 * tt).toFixed(4)})`;
        r.el.style.opacity = (0.3 + 0.7 * tc).toFixed(3);
        if (r.sub) { r.sub.style.opacity = ts.toFixed(3); r.sub.style.transform = `translate3d(${((1 - ts) * -10).toFixed(1)}px,0,0)`; }
      });
      slots.forEach((s, i) => {
        const dist = Math.abs(i - pos);
        let o, k;
        if (dist < 1) { const t = 1 - dist; o = 0.78 + 0.22 * t; k = 0.93 + 0.07 * t; }
        else if (dist < 2) { const t = 2 - dist; o = 0.18 + 0.6 * t; k = 0.84 + 0.09 * t; }
        else { o = 0.18; k = 0.84; }
        const y = (G.imgMid - (i - pos) * G.pitch - G.img / 2) * H;
        s.style.transform = `translate3d(0,${y.toFixed(2)}px,0) scale(${k.toFixed(4)})`;
        s.style.opacity = o.toFixed(3);
      });
      const ringMoving = ring ? ring.step(dt) : false;
      return Math.abs(target - pos) > 0.0005 || ringMoving;
    });
    if (ring) ring.kick = kick;
    addEventListener('resize', () => { measure(); kick(); });
    if (document.fonts) document.fonts.ready.then(() => { measure(); kick(); });
    phone.addEventListener('change', () => { measure(); kick(); });
    scrubbers.push(() => {
      // A one-time arrival: captions and photos rise in as the folio first fills the screen.
      const r = stage.getBoundingClientRect();
      if (!entered && r.top < H * 0.5 && r.bottom > H * 0.5) {
        entered = true;
        [folio.querySelector('.folio-titles'), folio.querySelector('.folio-images')].forEach((el, k) => el.animate(
          [{ opacity: 0, transform: 'translateY(48px)' }, { opacity: 1, transform: 'none' }],
          { duration: 1100, delay: k * 90, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
      }
      kick();
    });
    // A caption that isn't the current one scrolls to it; the current one opens its photo.
    rows.forEach((r, i) => r.el.addEventListener('click', () => (i === active ? folio.open(i) : folio.goTo(i))));
    // Keyboard: Tab onto a photo and the folio brings it to the middle (others sit off stage).
    folio.addEventListener('focusin', (e) => {
      const b = e.target.closest('.folio-open');
      if (!b || root.classList.contains('folio-open')) return;
      const i = +b.dataset.i;
      measure();
      const go = () => scrollTo({ top: top + i * step, behavior: 'auto' });
      go(); requestAnimationFrame(go);
      pos = i; kick();
    });
    settle(() => ({ top, step, n }));
    kick();
  }

  /** Folio photos open large: the photo flies from the strip into place, and back on close. */
  function setupLightbox(folio) {
    const slots = [...folio.querySelectorAll('.folio-slot')];
    const titles = [...folio.querySelectorAll('.folio-t')];
    const n = slots.length;
    let box = null;
    const T = (ms) => (reduced ? 0 : ms);
    folio.open = (i) => {
      if (box) return;
      const slot = slots[i], img = slot.querySelector('img'), opener = slot.querySelector('.folio-open');
      const title = (titles[i] && titles[i].textContent) || `Photo ${i + 1}`;
      const from = slot.getBoundingClientRect();
      box = document.createElement('div');
      box.className = 'folio-detail';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', title);
      box.innerHTML = `<div class="folio-detail-scrim"></div>
        <div class="folio-detail-copy"><button type="button" class="folio-detail-back"><span aria-hidden="true">←</span> Back</button>
          <p class="folio-detail-no">${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}</p><h2></h2>${img.alt ? '<p class="folio-detail-alt"></p>' : ''}</div>
        <figure class="folio-detail-frame"><img alt=""></figure>
        <button type="button" class="folio-detail-close" aria-label="Close photo">×</button>`;
      box.querySelector('h2').textContent = title;
      if (img.alt) box.querySelector('.folio-detail-alt').textContent = img.alt;
      const big = box.querySelector('.folio-detail-frame img');
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      document.body.appendChild(box);
      root.classList.add('folio-open');
      const frame = box.querySelector('.folio-detail-frame'), to = frame.getBoundingClientRect();
      slot.style.visibility = 'hidden';
      frame.animate([{ transform: `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${from.width / to.width})` }, { transform: 'none' }], { duration: T(950), easing: 'cubic-bezier(.16,1,.3,1)' });
      box.querySelector('.folio-detail-scrim').animate([{ opacity: 0 }, { opacity: 1 }], { duration: T(450), easing: 'ease-out' });
      [...box.querySelectorAll('.folio-detail-copy>*,.folio-detail-close')].forEach((el, k) => el.animate(
        [{ opacity: 0, transform: 'translateY(24px)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
        { duration: T(900), delay: T(250 + k * 50), easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
      const close = () => {
        if (!box || box.closing) return;
        box.closing = true;
        const b = box, now = frame.getBoundingClientRect(), back = slot.getBoundingClientRect();
        [...b.querySelectorAll('.folio-detail-copy>*,.folio-detail-close')].forEach((el) => el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(14px)' }], { duration: T(350), easing: 'ease-in', fill: 'forwards' }));
        b.querySelector('.folio-detail-scrim').animate([{ opacity: 1 }, { opacity: 0 }], { duration: T(550), delay: T(250), easing: 'ease-in', fill: 'forwards' });
        const fly = frame.animate([{ transform: 'none' }, { transform: `translate(${back.left - now.left}px,${back.top - now.top}px) scale(${back.width / now.width})` }], { duration: T(850), delay: T(50), easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
        fly.finished.then(() => {
          slot.style.visibility = '';
          b.remove();
          if (box === b) box = null;
          root.classList.remove('folio-open');
          opener.focus({ preventScroll: true });
        });
      };
      box.addEventListener('click', (e) => { if (e.target.closest('.folio-detail-back,.folio-detail-close,.folio-detail-scrim')) close(); });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
        if (e.key === 'Tab') { // keep focus inside while it's open
          const f = [...box.querySelectorAll('button')], k = f.indexOf(document.activeElement);
          if (e.shiftKey && k <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && k === f.length - 1) { e.preventDefault(); f[0].focus(); }
        }
      });
      box.querySelector('.folio-detail-close').focus({ preventScroll: true });
    };
    slots.forEach((s, i) => {
      const btn = s.querySelector('.folio-open');
      btn.addEventListener('click', () => {
        // In the moving folio, a photo that isn't the current one comes to the middle first.
        if (folio.classList.contains('is-live') && folio.current() !== i) return folio.goTo(i);
        folio.open(i);
      });
      // Keyboard: tabbing onto a photo brings it to the middle.
      btn.addEventListener('focus', () => { if (folio.classList.contains('is-live') && folio.current() !== i && !box) folio.goTo(i); });
    });
  }

  /** Wrap each word of an element's text in a span (spaces stay as text), returning the spans. */
  function splitWords(el) {
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    nodes.forEach((n) => {
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        const w = document.createElement('span');
        w.className = 'w';
        w.textContent = part;
        out.push(w);
        frag.appendChild(w);
      });
      n.replaceWith(frag);
    });
    return out;
  }
})();
