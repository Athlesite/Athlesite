// Steps for drive.js on ../homepage-v2/index.html: Section 03 ("From athlete to Athlesite") shows the
// real Studio and the real page (screenshots from tools/how-shots.js). Scrolls through it and checks
// each step's frames come up in order and loaded, one frame at a time, taps land inside the screen,
// the "Link copied" toast in Share, the page scrolling in Share, nothing loaded before the section is
// near, the phone and the words fit on a phone screen, and reduced motion. Run at 1440×900 and 390×844.
// Must print PROBLEMS none.
module.exports = async (t) => {
  const problems = [];
  const expect = (label, ok, got) => { t.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got: ' + JSON.stringify(got))); if (!ok) problems.push(label); };
  await t.sleep(1200);
  const frames = await t.ev(`return ((window.ATHLESITE_HOW || {}).frames || []).map((f) => f.name)`);
  const want = ['create-1', 'create-2', 'create-3', 'create-4', 'create-5', 'create-6', 'style-1', 'style-2', 'style-3', 'style-4', 'style-5', 'live-1', 'live-2', 'live-3', 'live-4', 'share-1', 'share-page'];
  expect('the screenshot list has every frame', want.every((n) => frames.includes(n)), frames);
  expect('only the first frame loads with the page', (await t.ev(`return [...document.querySelectorAll('#howScreen img')].filter((i) => i.getAttribute('src')).length`)) <= 1, await t.ev(`return [...document.querySelectorAll('#howScreen img')].filter((i) => i.getAttribute('src')).map((i) => i.src.split('/').pop())`));

  const at = async (p) => {
    await t.ev(`const h = document.getElementById('how'); window.scrollTo({ top: h.offsetTop + ${p} * (h.offsetHeight - innerHeight), behavior: 'instant' }); return 1`);
    await t.sleep(650);
    return t.ev(`const on = [...document.querySelectorAll('#howScreen .hf.is-on')];
      const scr = document.getElementById('howScreen').getBoundingClientRect(), tap = document.querySelector('#howScreen .tap'), tr = tap.getBoundingClientRect();
      const step = [...document.querySelectorAll('.step')].findIndex((s) => s.classList.contains('is-active'));
      return { step, on: on.map((i) => i.src.split('/').pop().replace('.webp', '')), loaded: on.every((i) => i.complete && i.naturalWidth > 0),
        visible: [...document.querySelectorAll('#howScreen .hf')].filter((i) => +getComputedStyle(i).opacity > 0.01).length,
        tap: tap.classList.contains('is-on'), tapInside: tr.left + tr.width / 2 >= scr.left && tr.right - tr.width / 2 <= scr.right && tr.top + tr.height / 2 >= scr.top && tr.bottom - tr.height / 2 <= scr.bottom,
        toast: document.querySelector('#howScreen .hf-toast').classList.contains('is-on'),
        pageY: (() => { const pg = document.querySelector('#howScreen .hf-page'); return pg ? new DOMMatrix(getComputedStyle(pg).transform).m42 : null; })() }`);
  };
  // Every step, a few points each: [scroll progress, step, frame]
  const CHECKS = [[0.01, 0, 'create-1'], [0.09, 0, 'create-3'], [0.2, 0, 'create-5'], [0.245, 0, 'create-6'],
    [0.26, 1, 'style-1'], [0.36, 1, 'style-3'], [0.49, 1, 'style-5'],
    [0.51, 2, 'live-1'], [0.6, 2, 'live-2'], [0.74, 2, 'live-4'],
    [0.775, 3, 'live-4'], [0.82, 3, 'share-1'], [0.9, 3, 'share-page'], [0.99, 3, 'share-page']];
  let tapSeen = 0, tapOut = 0, pageYs = [];
  for (const [p, step, frame] of CHECKS) {
    const r = await at(p);
    expect(`at ${Math.round(p * 100)}%: step ${step + 1}, frame ${frame}`, r.step === step && r.on.length === 1 && r.on[0] === frame && r.loaded, r);
    if (r.visible > 1) expect(`at ${Math.round(p * 100)}%: one frame on screen once settled`, false, r.visible);
    if (r.tap) { tapSeen++; if (!r.tapInside) tapOut++; }
    if (p === 0.775) expect('Share starts with "Link copied"', r.toast, r);
    if (frame === 'share-page') pageYs.push(r.pageY);
  }
  // Taps: the second half of a frame with a tap
  const tapAt = await at(0.023); // create-1's second half (6 frames in the first quarter)
  expect('a tap shows where the next touch lands', tapAt.tap && tapAt.tapInside, tapAt);
  expect('taps always land inside the screen', tapOut === 0, tapOut);
  expect('Share scrolls down his page', pageYs.length === 2 && pageYs[1] < pageYs[0] - 50, pageYs);
  expect('all frames loaded by now', await t.ev(`return [...document.querySelectorAll('#howScreen img')].every((i) => i.complete && i.naturalWidth > 0)`), 'some missing');

  // Phones: the phone and the step's words both fit on the screen.
  if (await t.ev('return innerWidth < 800')) {
    const fit = await at(0.3);
    const box = await t.ev(`const ph = document.querySelector('.how .phone').getBoundingClientRect(), st = document.querySelector('.step.is-active').getBoundingClientRect(); return { phoneTop: ph.top, phoneBottom: ph.bottom, textTop: st.top, textBottom: st.bottom, h: innerHeight }`);
    expect('phone: the phone sits above the words, both on screen', box.phoneTop >= 0 && box.phoneBottom <= box.textTop && box.textBottom <= box.h, box);
    void fit;
  }

  // Reduced motion: the last step, no tap.
  await t.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await t.ev(`location.reload(); return 1`);
  await t.sleep(2500);
  const rm = await at(0.3);
  expect('reduced motion: a still frame, no tap', rm.on.length === 1 && !rm.tap, rm);
  t.log('PROBLEMS ' + (problems.length ? problems.join('; ') : 'none'));
};
