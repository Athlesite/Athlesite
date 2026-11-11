// Steps for drive.js on studio.html: clicking things on the page opens their exact row (polish).
// A stat on the cover and in the stats section, a video, a milestone, a gallery photo (Jordan),
// a result row (Ava). On phones (run at 390×844 too) the sheet rises and the tapped thing stays in
// view above it. Must print PROBLEMS none.
module.exports = async (t) => {
  const problems = [];
  const expect = (label, ok, got) => { t.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got: ' + JSON.stringify(got))); if (!ok) problems.push(label); };
  const phone = await t.ev(`return innerWidth < 800`);
  // Where an element inside the preview is on the screen (the preview may be scaled).
  const at = (sel, nth = 0) => t.ev(`const f = document.querySelector('.pv-frame.is-front'), doc = f.contentDocument;
    const el = doc.querySelectorAll(${JSON.stringify(sel)})[${nth}]; if (!el) return null;
    const fr = f.getBoundingClientRect(), k = fr.width / f.offsetWidth, r = el.getBoundingClientRect();
    return { x: fr.left + (r.left + r.width / 2) * k, y: fr.top + (r.top + Math.min(r.height / 2, 30)) * k }`);
  const bring = (sel, nth = 0, block = 'center') => t.ev(`const doc = document.querySelector('.pv-frame.is-front').contentDocument; const el = doc.querySelectorAll(${JSON.stringify(sel)})[${nth}]; if (el) el.scrollIntoView({ block: '${block}' }); return !!el`);
  // (Waits for the page to stop moving first: pinned sections glide to rest after a scroll.)
  const pick = async (sel, nth = 0) => { await t.sleep(900); const p = await at(sel, nth); if (!p) return false; await t.click(p.x, p.y); await t.sleep(700); return true; };
  const focused = () => t.ev(`const a = document.activeElement; const f = a && a.closest('[data-fieldkey]'); return { key: f ? f.dataset.fieldkey : null, title: document.querySelector('.panel-title h2').textContent }`);
  const home = async () => { await t.ev(`const b = document.querySelector('.back'); if (b && !b.hidden) b.click(); if (innerWidth < 800) document.getElementById('panel').dataset.sheet = 'peek'; return 1`); await t.sleep(500); };

  await t.ev(`localStorage.clear(); setTimeout(() => location.href = location.pathname + '?a=jordan', 30); return 1`);
  await t.sleep(3400);

  // A stat on the cover (Cinematic's strip)
  if (!phone) {
    await pick('.hero-strip [data-item="stats:1"]');
    let f = await focused();
    expect('a cover stat opens Stats at that row', f.title === 'Stats' && f.key === 'data.stats.1.value', f);
    await home();
  }
  // A stat in the stats section
  await bring('#stats [data-item="stats:2"]');
  await t.sleep(300);
  await pick('#stats [data-item="stats:2"]');
  let f = await focused();
  expect('a stat in the section opens its row', f.title === 'Stats' && f.key === 'data.stats.2.value', f);
  await home();
  // A milestone
  await bring('[data-item="milestones:1"]', 0, phone ? 'start' : 'center');
  await t.sleep(300);
  await pick('[data-item="milestones:1"]');
  f = await focused();
  expect('a milestone opens its row', f.title === 'Milestones' && f.key === 'data.milestones.1.title', f);
  if (phone) {
    const vis = await t.ev(`const f = document.querySelector('.pv-frame.is-front'), el = f.contentDocument.querySelector('[data-item="milestones:1"]'); await new Promise((r) => setTimeout(r, 700)); const r = el.getBoundingClientRect(); const sheetTop = document.getElementById('panel').getBoundingClientRect().top; return { top: r.top, bottom: r.bottom, sheetTop, sheet: document.getElementById('panel').dataset.sheet }`);
    expect('on phones the sheet rises and the milestone stays above it', vis.sheet === 'half' && vis.top >= 0 && vis.bottom <= vis.sheetTop, vis);
  }
  await home();
  // A gallery photo
  await bring('[data-item="gallery:1"]');
  await t.sleep(300);
  await pick('[data-item="gallery:1"]');
  f = await focused();
  expect('a gallery photo opens its row', f.title === 'Gallery' && f.key === 'data.gallery.1.caption', f);
  await home();
  // A video
  await bring('[data-item="highlightLinks:0"]');
  await t.sleep(300);
  await pick('[data-item="highlightLinks:0"]');
  f = await focused();
  expect('a video opens its row', f.title === 'Film' && f.key === 'data.highlightLinks.0.label', f);
  await t.shot('picks-film');

  // A result row (Ava)
  await t.ev(`setTimeout(() => location.href = location.pathname + '?a=ava', 30); return 1`);
  await t.sleep(3400);
  // Phones: put the row low on the screen but still above the collapsed sheet (132px), where a thumb would tap it.
  if (phone) await t.ev(`const w = document.querySelector('.pv-frame.is-front').contentWindow, el = w.document.querySelector('[data-item="results:2"]'); const r = el.getBoundingClientRect(); w.scrollTo(0, w.scrollY + r.bottom - (w.innerHeight - 132 - 24)); return 1`);
  else await bring('[data-item="results:2"]');
  await t.sleep(300);
  await pick('[data-item="results:2"]');
  f = await focused();
  expect('a result row opens its row', f.title === 'Results' && f.key === 'data.results.2.a', f);
  if (phone) {
    const vis = await t.ev(`const f = document.querySelector('.pv-frame.is-front'), el = f.contentDocument.querySelector('[data-item="results:2"]'); await new Promise((r) => setTimeout(r, 700)); const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, sheetTop: document.getElementById('panel').getBoundingClientRect().top }`);
    expect('a row tapped low on the page scrolls up above the sheet', vis.top >= 0 && vis.bottom <= vis.sheetTop, vis);
  }
  await t.shot('picks-results');
  t.log('PROBLEMS ' + (problems.length ? problems.join('; ') : 'none'));
};
