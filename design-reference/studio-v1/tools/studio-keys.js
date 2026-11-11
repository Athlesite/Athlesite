// Steps for drive.js on studio.html at 390×844: the phone keyboard never covers the field being typed in.
// Headless Chrome has no on-screen keyboard, so this fakes one the way a phone reports it: the visual
// viewport shrinks (window.visualViewport.height) and fires "resize". With a field focused in a half sheet,
// the sheet must rise to full and the field sit above the keyboard; when the keyboard goes, the sheet
// returns to half. Must print PROBLEMS none. Still check on a real phone (iOS and Android differ).
module.exports = async (t) => {
  const problems = [];
  const expect = (label, ok, got) => { t.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got: ' + JSON.stringify(got))); if (!ok) problems.push(label); };
  await t.ev(`localStorage.clear(); location.href = location.pathname + '?ex=jordan-bell'; return 1`);
  await t.sleep(4000);
  const sheet = () => t.ev('return document.getElementById("panel").dataset.sheet');
  for (let i = 0; i < 3 && (await sheet()) !== 'half'; i++) { await t.clickSel('#sheet-handle'); await t.sleep(600); }
  expect('the sheet starts at half', (await sheet()) === 'half', await sheet());
  await t.clickSel('.sec-row[data-key=stats] .sec-open'); await t.sleep(900);
  // The last text field in Stats: low in the sheet, where a keyboard would cover it.
  await t.ev(`const f = [...document.querySelectorAll('.screen input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=file])')].filter((i) => i.offsetParent).pop(); f.focus({ preventScroll: true }); window.__f = f; return 1`);
  const KB = 520; // what's left above a typical phone keyboard on an 844px screen
  await t.ev(`Object.defineProperty(VisualViewport.prototype, 'height', { configurable: true, get: () => ${KB} }); visualViewport.dispatchEvent(new Event('resize')); return 1`);
  await t.sleep(900);
  expect('keyboard up: the sheet rises to full', (await sheet()) === 'full', await sheet());
  const r = await t.ev(`const r = window.__f.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, focused: document.activeElement === window.__f }`);
  expect('keyboard up: the field sits above the keyboard', r.bottom <= KB - 8 && r.top >= 0 && r.focused, r);
  await t.ev(`delete VisualViewport.prototype.height; Object.defineProperty(VisualViewport.prototype, 'height', { configurable: true, get: () => innerHeight }); visualViewport.dispatchEvent(new Event('resize')); return 1`);
  await t.sleep(700);
  expect('keyboard down: the sheet goes back to half', (await sheet()) === 'half', await sheet());
  t.log('PROBLEMS ' + (problems.length ? problems.join('; ') : 'none'));
};
