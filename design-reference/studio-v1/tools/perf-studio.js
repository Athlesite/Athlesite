// Steps for drive.js on studio.html: frame times in the editor while doing what people do — switch
// looks, colors, fonts, open and close screens, Remix, switch device, drag a section. Measured in the
// editor window (the panel's motion) and reported per action group, with the main-thread long
// frames (LoAF) and the script behind them. A frame over 20ms missed a 60fps vsync.
// Env: CPU=4 to slow the CPU down. usage: node tools/drive.js tools/perf-studio.js file:///…/studio.html <outDir>
module.exports = async (t) => {
  const cpu = +process.env.CPU || 1;
  await t.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await t.ev(`localStorage.clear(); location.href = location.pathname + '?a=jordan'`);
  await t.sleep(3500);
  const RECORD = `window.__f = []; window.__loaf = []; let last = performance.now();
    const tick = (now) => { window.__f.push(now - last); last = now; window.__raf = requestAnimationFrame(tick); }; window.__raf = requestAnimationFrame(tick);
    try { window.__po && window.__po.disconnect(); window.__po = new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__loaf.push({ d: Math.round(e.duration), s: (e.scripts || []).sort((a, b) => b.duration - a.duration).slice(0, 2).map((s) => (s.invoker || '?').slice(0, 50) + ' ' + Math.round(s.duration) + 'ms').join(' | '), style: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0) }))); window.__po.observe({ type: 'long-animation-frame' }); } catch (e) {}
    return 1;`;
  const STOP = `cancelAnimationFrame(window.__raf); const f = window.__f.slice(2).sort((a, b) => a - b), n = f.length, miss = f.filter((x) => x > 20).length;
    return { n, p95: +f[Math.floor(n * 0.95)].toFixed(1), max: +f[n - 1].toFixed(1), miss, pct: +(100 * miss / n).toFixed(1), loaf: window.__loaf.sort((a, b) => b.d - a.d).slice(0, 3) };`;
  const results = [];
  const group = async (label, fn) => {
    await t.sleep(500);
    await t.ev(RECORD);
    await fn();
    await t.sleep(900); // let the last change land
    const r = await t.ev(STOP);
    results.push([label, r]);
    t.log(`${label.padEnd(26)} ${String(r.n).padStart(4)} frames  p95 ${r.p95}ms  max ${r.max}ms  missed ${r.miss} (${r.pct}%)${r.loaf.length ? '\n' + r.loaf.map((l) => `      long ${l.d}ms (style+layout ${l.style}ms) ${l.s}`).join('\n') : ''}`);
  };
  const pause = (ms) => t.sleep(ms);
  await group('open Design screen', async () => { await t.clickSel('.design-open'); await pause(600); });
  await group('switch looks ×5', async () => { for (const l of ['highlight', 'portrait', 'prospect', 'editorial', 'cinematic']) { await t.clickSel(`.look-cards [data-v=${l}]`); await pause(450); } });
  await group('colors ×6', async () => { const ids = await t.ev(`return [...document.querySelectorAll('.swatch-list [role=radio]')].map((b) => b.dataset.v)`); for (let i = 0; i < 6; i++) { await t.clickSel(`.swatch-list [data-v=${ids[i % ids.length]}]`); await pause(350); } });
  await group('fonts ×3', async () => { const ids = await t.ev(`return [...document.querySelectorAll('.font-cards [role=radio]')].map((b) => b.dataset.v)`); for (let i = 0; i < 3; i++) { await t.clickSel(`.font-cards [data-v="${ids[(i + 1) % ids.length]}"]`); await pause(700); } });
  await group('back to sections', async () => { await t.clickSel('.back'); await pause(600); });
  await group('open + close a section ×3', async () => { for (const k of ['stats', 'gallery', 'nil']) { await t.clickSel(`.sec-row[data-key=${k}] .sec-open`); await pause(450); await t.clickSel('.back'); await pause(450); } });
  await group('hide + show a section', async () => { await t.clickSel('.sec-row[data-key=story] .eye'); await pause(500); await t.clickSel('.sec-row[data-key=story] .eye'); await pause(500); });
  await group('drag a section', async () => {
    const a = await t.rect('.sec-row[data-key=gallery] .grip'), b = await t.rect('.sec-row[data-key=stats] .grip');
    await t.drag(a.x, a.y, b.x, b.y, 24); await pause(600);
  });
  await group('Remix ×4', async () => { for (let i = 0; i < 4; i++) { await t.clickSel('.btn-remix'); await pause(500); } });
  await group('desktop ↔ phone ×2', async () => { for (const d of ['Phone', 'Desktop', 'Phone', 'Desktop']) { const r = await t.ev(`const b = [...document.querySelectorAll('#device-slot [role=radio]')].find((x) => x.textContent.includes('${d}')); const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }`); await t.click(r.x, r.y); await pause(600); } });
  await group('scroll the preview', async () => {
    const f = await t.ev(`const q = document.querySelector('.pv-viewport').getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }`);
    for (let i = 0; i < 80; i++) { await t.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: f.x, y: f.y, deltaX: 0, deltaY: 80 }); await pause(16); }
  });
  await group('play the opening', async () => { await t.clickSel('#play'); await pause(4200); });
  const all = results.reduce((a, [, r]) => ({ n: a.n + r.n, miss: a.miss + r.miss }), { n: 0, miss: 0 });
  t.log(`TOTAL ${all.n} frames, missed ${all.miss} (${(100 * all.miss / all.n).toFixed(1)}%), cpu ${cpu}×`);
};
