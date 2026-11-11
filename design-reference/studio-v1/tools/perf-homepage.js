// Steps for drive.js on ../homepage-v2/index.html: what reaches the screen while a person scrolls
// down into Section 02, watches the carousel drift, opens a card, scrolls its live page, steps to
// the next one, closes it, and scrolls on through Section 03.
// Per phase: frames the compositor presented vs dropped (Chrome's own frame reporter, the same
// numbers DevTools shows), tiles re-rastered (repaint pressure on the graphics chip) and the page's
// main-thread frame times. rAF times alone hide GPU-bound jank: the page keeps ticking at 120Hz while
// the graphics chip drops frames behind it.
// Run it the way Willy's laptop draws: DPR=1.5 at 1707×960 (150%, 120Hz, Intel Iris Xe):
//   DPR=1.5 node tools/drive.js tools/perf-homepage.js file:///…/homepage-v2/index.html <outDir> 1707 960
// Env: CPU=4 slows the CPU down; SKIP=s3 leaves out Section 03; ONLY=s3 runs only Section 03; ONLY=drift only
// scrolls in and drifts; RAST=1 counts re-rastered tiles (adds the 'cc' trace category); PRE='js' runs in the page first.
module.exports = async (t) => {
  const cpu = +process.env.CPU || 1;
  await t.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await t.sleep(1500);
  if (process.env.PRE) await t.ev(process.env.PRE); // an experiment to run in the page first (e.g. remove an effect)
  const events = []; let done; const complete = new Promise((r) => (done = r));
  t.on('Tracing.dataCollected', (p) => events.push(...p.value));
  t.on('Tracing.tracingComplete', () => done());
  const RECORD = `console.timeStamp('perf-phase'); window.__f = []; let last = performance.now();
    const tick = (now) => { window.__f.push(now - last); last = now; window.__raf = requestAnimationFrame(tick); }; window.__raf = requestAnimationFrame(tick); return 1`;
  const STOP = `cancelAnimationFrame(window.__raf); const f = window.__f.slice(2), s = f.slice().sort((a, b) => a - b), n = s.length;
    return { n, max: +(s[n - 1] || 0).toFixed(1), m120: f.filter((x) => x > 12.5).length }`;
  const phases = [];
  const phase = async (label, fn) => {
    await t.ev(RECORD);
    await fn();
    phases.push({ label, raf: await t.ev(STOP) });
  };
  const wheel = async (n, dy, gap = 16) => {
    const x = await t.ev('return innerWidth / 2'), y = await t.ev('return innerHeight / 2');
    for (let i = 0; i < n; i++) { await t.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); await t.sleep(gap); }
  };
  // Light categories only: 'cc' and 'gpu' make the trace itself the bottleneck. RAST=1 adds 'cc' for raster counts.
  await t.send('Tracing.start', { categories: 'benchmark,devtools.timeline' + (process.env.RAST ? ',cc' : '') + (process.env.LONG ? ',toplevel,disabled-by-default-devtools.timeline,v8.execute' : ''), transferMode: 'ReportEvents' });
  if (process.env.ONLY !== 's3') {
    // Start just above Section 02, then scroll into it like a person does.
    await t.ev(`scrollTo(0, document.getElementById('styles').offsetTop - innerHeight * 1.3); return 1`);
    await t.sleep(1200);
    await phase('scroll into Section 02', async () => { await wheel(14, 90, 60); await t.sleep(900); });
    await phase('carousel entrance + drift (5s)', async () => { await t.sleep(5000); });
    if (process.env.ONLY === 'drift') return finish();
    const mid = await t.ev(`const c = [...document.querySelectorAll('#carousel .card')].sort((a, b) => Math.abs(a.getBoundingClientRect().left + a.offsetWidth / 2 - innerWidth / 2) - Math.abs(b.getBoundingClientRect().left + b.offsetWidth / 2 - innerWidth / 2))[0].getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2 }`);
    await phase('open a card (3s)', async () => { await t.click(mid.x, mid.y); await t.sleep(3000); });
    await phase('scroll the live page (2s)', async () => {
      const f = await t.ev(`const r = document.getElementById('mScreen').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }`);
      for (let i = 0; i < 40; i++) { await t.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: f.x, y: f.y, deltaX: 0, deltaY: 60 }); await t.sleep(25); }
      await t.sleep(800);
    });
    await phase('next example (2.5s)', async () => { await t.key('ArrowRight'); await t.sleep(2500); });
    await phase('close (1.5s)', async () => { await t.key('Escape'); await t.sleep(1500); });
  } else {
    await t.ev(`scrollTo(0, document.getElementById('how').offsetTop - innerHeight); return 1`);
    await t.sleep(1200);
  }
  if (process.env.SKIP !== 's3') await phase('scroll through Section 03', async () => { await wheel(70, 100, 40); await t.sleep(800); });
  return finish();
  async function finish() {
  await t.send('Tracing.end');
  await complete;
  // Each phase starts with a console.timeStamp in the page, so its slice of the trace is exact.
  const starts = events.filter((e) => e.name === 'TimeStamp' && e.args && e.args.data && e.args.data.message === 'perf-phase').map((e) => e.ts).sort((x, y) => x - y);
  const last = events.reduce((m, e) => (e.ts > m ? e.ts : m), 0);
  const pn = new Map(events.filter((e) => e.ph === 'M' && e.name === 'process_name').map((e) => [e.pid, e.args.name]));
  const reports = events.filter((e) => e.name === 'PipelineReporter' && e.ph === 'b' && e.args && e.args.frame_reporter);
  // The page's own compositor is the one that reported the most frames.
  const byHost = new Map();
  reports.forEach((e) => { const k = e.pid + ':' + e.args.frame_reporter.layer_tree_host_id; byHost.set(k, (byHost.get(k) || 0) + 1); });
  const host = [...byHost.entries()].sort((a, b) => b[1] - a[1])[0];
  const raster = events.filter((e) => e.name === 'RasterTask' && e.ph === 'X');
  const paints = events.filter((e) => e.name === 'Paint' && e.ph === 'X');
  // Offscreen passes the compositor draws each frame (blend modes, masks, filters, backdrop blur): GPU fill cost.
  const surfaces = events.filter((e) => e.name === 'RenderSurfaceReasonCount' && e.args && 'total' in e.args);
  phases.forEach((ph, i) => {
    const a = starts[i] || 0, b = starts[i + 1] || last, secs = (b - a) / 1e6 || 1;
    const mine = reports.filter((e) => e.ts >= a && e.ts < b && host && e.pid + ':' + e.args.frame_reporter.layer_tree_host_id === host[0]);
    // One frame can be reported more than once (one report per pipeline stage it went through):
    // a frame counts as shown if any report says so.
    const RANK = { STATE_PRESENTED_ALL: 3, STATE_PRESENTED_PARTIAL: 2, STATE_DROPPED: 1 };
    const seq = new Map();
    mine.forEach((e) => { const f = e.args.frame_reporter, r = RANK[f.state] || 0; if (r > (seq.get(f.frame_sequence) || 0)) seq.set(f.frame_sequence, r); });
    const st = { presented: 0, partial: 0, dropped: 0 };
    seq.forEach((r) => { if (r === 3) st.presented++; else if (r === 2) st.partial++; else if (r === 1) st.dropped++; });
    if (process.env.DEBUG) { const m = new Map(); mine.forEach((e) => { const f = e.args.frame_reporter, k = [f.state, f.affects_smoothness, f.has_main_animation, f.has_compositor_animation, f.has_missing_content].join(' '); m.set(k, (m.get(k) || 0) + 1); }); t.log('   ' + JSON.stringify([...m])); }
    const tot = st.presented + st.partial + st.dropped;
    const r = raster.filter((e) => e.ts >= a && e.ts < b).length, p = paints.filter((e) => e.ts >= a && e.ts < b).length;
    const sf = surfaces.filter((e) => e.ts >= a && e.ts < b), sfAvg = sf.length ? +(sf.reduce((x, e) => x + e.args.total, 0) / sf.length).toFixed(1) : null;
    const reasons = new Map(); events.forEach((e) => { if (e.name === 'RenderSurfaceReasonCount' && e.ts >= a && e.ts < b && e.args && !('total' in e.args)) Object.keys(e.args).forEach((k) => reasons.set(k, (reasons.get(k) || 0) + e.args[k])); });
    ph.out = { tot, ...st, dropPct: +(100 * (st.dropped + st.partial) / Math.max(1, tot)).toFixed(1), rasterPerSec: Math.round(r / secs), paintsPerSec: Math.round(p / secs) };
    // LONG=1: the page's long main-thread tasks in this phase and what they were doing.
    if (process.env.LONG) events.filter((e) => e.name === 'RunTask' && e.ph === 'X' && e.dur > 25000 && e.ts >= a && e.ts < b && /Renderer/.test(pn.get(e.pid) || '')).forEach((e) => {
      const agg = new Map(); events.forEach((k) => { if (k.pid === e.pid && k.tid === e.tid && k.ph === 'X' && k !== e && k.ts >= e.ts && k.ts + (k.dur || 0) <= e.ts + e.dur && k.dur > 2000 && k.name !== 'RunTask') { const d = k.args && k.args.data || {}; const n = k.name + (d.url ? ' ' + String(d.url).split('/').pop().slice(0, 28) : '') + (d.functionName ? ' ' + d.functionName : ''); agg.set(n, (agg.get(n) || 0) + k.dur / 1000); } });
      t.log(`     long ${(e.dur / 1000).toFixed(0)}ms at +${((e.ts - a) / 1000).toFixed(0)}ms: ${[...agg.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([n, d]) => n + ' ' + d.toFixed(0)).join(', ')}`);
    });
    t.log(`${ph.label.padEnd(30)} frames ${String(tot).padStart(4)} (${Math.round(st.presented / secs)}/s shown)  dropped/partial ${String(st.dropped + st.partial).padStart(4)} (${ph.out.dropPct}%)  raster tiles/s ${String(ph.out.rasterPerSec).padStart(4)}  paints/s ${String(ph.out.paintsPerSec).padStart(4)}${sfAvg !== null ? `  surfaces/frame ${sfAvg} (${[...reasons.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k]) => k).join(', ')})` : ''}  | page rAF max ${ph.raf.max}ms, over 12.5ms ${ph.raf.m120}`);
  });
  }
};
