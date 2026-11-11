// Steps for drive.js: an accessibility audit of athlete pages, the Studio, or the homepage.
//   MODE=site    every look × palette (Jordan, Ava) + custom accents through color.js; start URL = site.html
//   MODE=page    just the start URL (any page: studio.html, ../homepage-v2/index.html …)
//   TABS=40      also walk that many Tab presses and check each stop is named and visibly focused
//   ONLY=editorial,portrait   limit MODE=site to some looks
// For every page: text contrast (WCAG: 4.5:1, 3:1 for large text; text over photos and gradients is
// counted, not measured), names on every control, alt on every image, one h1, no skipped heading
// levels, landmarks, lang, duplicate ids. Prints one line per page and the distinct problems.
// Must print PROBLEMS none (or only known, listed exceptions).
const AUDIT = String.raw`(() => {
  const parse = (s) => {
    let m = /^rgba?\(([^)]+)\)$/.exec(s);
    if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    m = /^color\(srgb ([^)]+)\)$/.exec(s);
    if (m) { const p = m[1].split(/[\s/]+/).filter(Boolean).map(parseFloat); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; }
    return null;
  };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (top, under, a = top[3]) => [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
  const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const hidden = (el) => !!el.closest('[aria-hidden="true"],[hidden],[inert],.intro');
  const shown = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const desc = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const out = { checked: 0, photo: 0, gradient: 0, contrast: [], names: [], alts: [], doc: [] };

  // What is painted under the middle of the text: the elements below it at that point (siblings
  // too, not just parents), composited down to the first solid color. A photo or video below it
  // means the background varies (counted, not measured); so does a gradient.
  document.documentElement.style.scrollBehavior = 'auto';
  // Colors are read at rest: no transitions while the audit scrolls things into view. And every
  // layer counts when looking under the text (sliding pills and shades often ignore the pointer).
  if (!document.getElementById('a11y-still')) document.head.insertAdjacentHTML('beforeend', '<style id="a11y-still">*,*::before,*::after{transition:none!important;pointer-events:auto!important}</style>');
  const PIC = /^(IMG|VIDEO|PICTURE|CANVAS|IFRAME|svg)$/;
  const below = (el) => {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + Math.min(r.width / 2, 8))), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const stack = document.elementsFromPoint(x, y);
    const at = stack.findIndex((e) => e === el || el.contains(e));
    return { r, stack: at < 0 ? stack : stack.slice(at) };
  };
  const background = (stack) => {
    const layers = [];
    for (const e of stack) {
      if (PIC.test(e.tagName)) return 'photo';
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return 'gradient';
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) { const o = opacityOf(e); layers.push([c[0], c[1], c[2], c[3] * o]); if (c[3] * o >= 0.999) break; }
    }
    let base = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const opacityOf = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  for (const el of document.body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OPTION'].includes(el.tagName)) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (!own || hidden(el) || !shown(el)) continue;
    const cs = getComputedStyle(el), r0 = el.getBoundingClientRect();
    if (cs.clip !== 'auto' || cs.clipPath.startsWith('inset(50%') || (r0.width <= 2 && r0.height <= 2)) continue; // screen-reader-only text
    const o = opacityOf(el);
    if (o < 0.05) continue;
    const look = below(el);
    if (look.r.bottom <= 0 || look.r.top >= innerHeight || look.r.right <= 0 || look.r.left >= innerWidth) continue; // parked off screen (a skip link)
    out.checked++;
    const bg = background(look.stack);
    if (bg === 'photo') { out.photo++; continue; }
    if (bg === 'gradient') { out.gradient++; continue; }
    const fg = parse(cs.color);
    if (!fg) continue;
    const ink = over(fg, bg, fg[3] * o);
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5, got = ratio(ink, bg);
    if (got < need - 0.005) out.contrast.push({ el: desc(el), text: own.slice(0, 32), size: Math.round(size * 10) / 10, weight, fg: hex(ink), bg: hex(bg), ratio: Math.round(got * 100) / 100, need });
  }

  // Every control has a name.
  const nameOf = (el) => {
    const by = el.getAttribute('aria-labelledby');
    if (by) return by.split(/\s+/).map((id) => (document.getElementById(id) || {}).textContent || '').join(' ').trim();
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
    if (el.matches('input,select,textarea')) {
      const lab = (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) || el.closest('label');
      if (lab) return lab.textContent.trim();
      return (el.getAttribute('title') || '').trim();
    }
    const t = (el.innerText || el.textContent || '').trim();
    if (t) return t;
    const img = el.querySelector('img[alt]');
    return ((img && img.alt) || el.getAttribute('title') || '').trim();
  };
  const controls = document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=radio],[role=switch],[role=checkbox],[role=slider],[tabindex]:not([tabindex="-1"])');
  for (const el of controls) {
    if (hidden(el) || !shown(el) || el.disabled) continue;
    if (!nameOf(el)) out.names.push(desc(el) + (el.getAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : ''));
  }
  for (const img of document.querySelectorAll('img')) if (!img.hasAttribute('alt') && !hidden(img)) out.alts.push(desc(img) + ' ' + (img.getAttribute('src') || '').split('/').pop().slice(0, 40));
  document.getElementById('a11y-still').remove(); // the page behaves normally again (Tab walk, clicks)

  // The document.
  if (!document.documentElement.lang) out.doc.push('no lang on <html>');
  if (!document.title.trim()) out.doc.push('no <title>');
  const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => !hidden(h));
  const h1 = heads.filter((h) => h.tagName === 'H1').length;
  if (h1 !== 1) out.doc.push(h1 + ' h1 elements');
  let prev = 0;
  for (const h of heads) { const n = +h.tagName[1]; if (prev && n > prev + 1) out.doc.push('heading jumps h' + prev + '→h' + n + ' (' + h.textContent.trim().slice(0, 24) + ')'); prev = n; }
  if (!document.querySelector('main,[role=main]')) out.doc.push('no <main>');
  const ids = [...document.querySelectorAll('[id]')].map((e) => e.id), dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) out.doc.push('duplicate ids: ' + [...new Set(dup)].slice(0, 5).join(', '));
  return out;
})()`;

// What has focus, its name, and whether it shows a focus ring (outline or box-shadow).
const FOCUS = String.raw`(() => {
  let el = document.activeElement;
  if (!el || el === document.body) return { body: true };
  if (el.tagName === 'IFRAME') return { iframe: el.title || el.src.split('/').pop().slice(0, 30) };
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.outlineColor)) || cs.boxShadow !== 'none';
  const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('title') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const tag = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '');
  return { tag, name, ring, onScreen: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width > 0 };
})()`;

module.exports = async (t) => {
  const mode = process.env.MODE || 'page', tabs = +process.env.TABS || 0;
  const W = await t.ev('return innerWidth');
  const base = await t.ev('return location.href.split("?")[0]');
  const pages = [];
  if (mode === 'site') {
    const looks = await t.ev('return Object.values(Athlesite.LOOKS).map((l) => ({ id: l.id, palettes: l.palettes.map((p) => p.id) }))');
    const only = (process.env.ONLY || '').split(',').filter(Boolean);
    const accents = ['#FFE14D', '#C6FF3A', '#28E0FF', '#FF5FB0', '#FF8A1F', '#7B3FE4', '#B9BEC6', '#1A1A1A'];
    for (const l of looks.filter((x) => !only.length || only.includes(x.id))) {
      for (const p of l.palettes) for (const a of ['jordan', 'ava']) pages.push([`${l.id}/${p} ${a}`, `${base}?a=${a}&look=${l.id}&palette=${p}&static=1`]);
      for (const p of [l.palettes[0], l.palettes[l.palettes.length - 1]]) for (const c of accents) pages.push([`${l.id}/${p} accent ${c}`, `${base}?a=jordan&look=${l.id}&palette=${p}&accent=${encodeURIComponent(c)}&static=1`]);
    }
  } else pages.push([process.env.LABEL || base.split('/').pop(), await t.ev('return location.href')]);

  const seen = new Map(); // distinct problems → pages
  const note = (kind, key, page) => { const k = kind + ' ' + key; if (!seen.has(k)) seen.set(k, []); seen.get(k).push(page); };
  for (const [label, url] of pages) {
    if (mode === 'site') { await t.ev(`location.href = ${JSON.stringify(url)}; return 1`); await t.sleep(1700); }
    await t.ev('await document.fonts.ready; return 1');
    // Scroll through once so lazy content and reveals are in their final state.
    await t.ev('const H = document.documentElement.scrollHeight; for (let y = 0; y < H; y += innerHeight) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } scrollTo(0, 0); await new Promise((r) => setTimeout(r, 200)); return 1');
    const r = await t.ev('return ' + AUDIT);
    r.contrast.forEach((c) => note('contrast', `${c.el} "${c.text}" ${c.size}px/${c.weight} ${c.fg} on ${c.bg} = ${c.ratio} (needs ${c.need})`, label));
    r.names.forEach((n) => note('no name', n, label));
    r.alts.forEach((n) => note('no alt', n, label));
    r.doc.forEach((n) => note('document', n, label));
    t.log(`${label} [${W}]: ${r.checked} text, ${r.photo} on photos, ${r.gradient} on gradients · contrast ${r.contrast.length} · names ${r.names.length} · alt ${r.alts.length} · doc ${r.doc.length}`);
  }
  if (tabs) {
    await t.ev('scrollTo(0, 0); document.activeElement && document.activeElement.blur && document.activeElement.blur(); return 1');
    const stops = [];
    for (let i = 0; i < tabs; i++) { await t.key('Tab'); await t.sleep(120); stops.push(await t.ev('return ' + FOCUS)); }
    stops.forEach((s, i) => {
      const line = s.body ? '(page)' : s.iframe ? `iframe "${s.iframe}"` : `${s.tag} "${s.name}"${s.ring ? '' : '  ⚠ no focus ring'}${s.onScreen ? '' : '  ⚠ off screen'}`;
      t.log(`  tab ${String(i + 1).padStart(2)}: ${line}`);
      if (s.tag && !s.ring) note('focus', `no visible focus ring: ${s.tag} "${s.name}"`, 'tab ' + (i + 1));
      if (s.tag && !s.name) note('focus', `focus stop without a name: ${s.tag}`, 'tab ' + (i + 1));
    });
  }
  t.log(`--- ${seen.size} distinct problem(s)`);
  for (const [k, where] of seen) t.log(`${k}   [${where.length}× e.g. ${where.slice(0, 3).join('; ')}]`);
  t.log('PROBLEMS ' + (seen.size ? seen.size : 'none'));
};
