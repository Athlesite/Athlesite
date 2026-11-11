// Steps for drive.js on site.html: frame times through the opening and a real wheel scroll down the
// whole page (scroll moments, reveals, nav), per look. A frame over 20ms missed a 60fps vsync.
// Env: LOOKS=…, WHO=jordan, CPU=4 (slow the CPU down 4×, roughly an average phone), COVER=…
// usage: node tools/drive.js tools/perf-site.js file:///…/site.html <outDir> 390 844
module.exports = async (t) => {
  const looks = (process.env.LOOKS || 'cinematic,editorial,highlight,portrait,prospect').split(',');
  const cpu = +process.env.CPU || 1;
  await t.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const RECORD = `
    window.__f = []; window.__loaf = [];
    let last = performance.now();
    const tick = (now) => { window.__f.push(now - last); last = now; window.__raf = requestAnimationFrame(tick); };
    window.__raf = requestAnimationFrame(tick);
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__loaf.push({ d: Math.round(e.duration), block: Math.round(e.blockingDuration || 0), s: (e.scripts || []).map((s) => (s.invoker || '') + ' ' + Math.round(s.duration) + 'ms').slice(0, 3).join(' | ') }))).observe({ type: 'long-animation-frame', buffered: false }); } catch (e) {}
    return true;`;
  const STOP = `cancelAnimationFrame(window.__raf); const f = window.__f.slice(2).sort((a, b) => a - b);
    const n = f.length, miss = f.filter((x) => x > 20).length;
    return { frames: n, p50: +f[Math.floor(n * 0.5)].toFixed(1), p95: +f[Math.floor(n * 0.95)].toFixed(1), max: +f[n - 1].toFixed(1), missed: miss, pct: +(100 * miss / n).toFixed(1), loaf: window.__loaf.sort((a, b) => b.d - a.d).slice(0, 3) };`;
  const fmt = (r) => `${r.frames} frames, p50 ${r.p50}ms p95 ${r.p95}ms max ${r.max}ms, missed ${r.missed} (${r.pct}%)${r.loaf.length ? '  long frames: ' + r.loaf.map((l) => `${l.d}ms${l.s ? ' [' + l.s + ']' : ''}`).join('; ') : ''}`;
  for (const look of looks) {
    // 1) the opening, from load to hand-off
    await t.ev(`location.href = location.pathname + '?a=${process.env.WHO || 'jordan'}&look=${look}${process.env.COVER ? '&cover=' + process.env.COVER : ''}&intro=always&r=' + Math.random()`);
    // record from the moment the opening starts moving (page load itself is measured apart)
    await t.ev(`await new Promise((r) => { const w = () => (document.querySelector('.intro.is-p1') || !document.querySelector('.intro') ? r() : setTimeout(w, 5)); w(); }); return 1`);
    await t.ev(RECORD);
    await t.sleep(3300);
    const open = await t.ev(STOP);
    // 2) a wheel scroll down the page, like a visitor reading
    await t.sleep(300);
    const p = await t.ev(`return { x: innerWidth / 2, y: innerHeight / 2, h: document.documentElement.scrollHeight }`);
    await t.ev(RECORD);
    const steps = Math.min(220, Math.ceil(p.h / 60));
    for (let i = 0; i < steps; i++) { await t.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: p.x, y: p.y, deltaX: 0, deltaY: 60 }); await t.sleep(16); }
    await t.sleep(600);
    const scroll = await t.ev(STOP);
    t.log(`${look} (cpu ${cpu}×)\n  opening: ${fmt(open)}\n  scroll:  ${fmt(scroll)}`);
  }
};
