// Steps for drive.js on site.html: what reaches the screen while a visitor wheels down an athlete page,
// per look. Like perf-homepage.js: frames shown vs dropped (Chrome's frame reporter, counted once per
// frame), tiles re-rastered (RAST=1), offscreen passes per frame (blur, blend, masks) and their reasons,
// and the page's long main-thread tasks (LONG=1).
// Run it the way Willy's laptop draws: DPR=1.5 at 1707×960, or HEADED=1 in a real window.
//   DPR=1.5 node tools/drive.js tools/perf-page.js file:///…/studio-v1/site.html <outDir> 1707 960
// Env: LOOKS=cinematic,editorial,… (default all five), EX=jordan-bell (an example) or A=jordan (a test
// athlete), CSS='…' (a style added first, for experiments), Q='&film=list' (extra query), STEPS (wheel steps, default to the page's end), CPU=4.
module.exports = async (t) => {
  const cpu = +process.env.CPU || 1;
  await t.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const looks = (process.env.LOOKS || 'cinematic,editorial,highlight,portrait,prospect').split(',');
  const who = process.env.A ? `a=${process.env.A}` : `ex=${process.env.EX || 'jordan-bell'}`;
  const events = []; let done; const complete = new Promise((r) => (done = r));
  t.on('Tracing.dataCollected', (p) => events.push(...p.value));
  t.on('Tracing.tracingComplete', () => done());
  const base = await t.ev('return location.href.split("?")[0]');
  const runs = [];
  await t.send('Tracing.start', { categories: 'benchmark,devtools.timeline' + (process.env.RAST ? ',cc' : '') + (process.env.LONG ? ',toplevel,disabled-by-default-devtools.timeline' : ''), transferMode: 'ReportEvents' });
  for (const look of looks) {
    await t.ev(`location.href = ${JSON.stringify(base)} + '?${who}&look=${look}&intro=never${process.env.Q || ''}&r=' + Math.random(); return 1`);
    await t.sleep(2600);
    // CSS='…' adds a style to the page first (an experiment: switch one effect off and compare).
    if (process.env.CSS) await t.ev('const s = document.createElement("style"); s.textContent = ' + JSON.stringify(process.env.CSS) + '; document.head.append(s); return 1');
    const p = await t.ev(`return { x: innerWidth / 2, y: innerHeight / 2, h: document.documentElement.scrollHeight }`);
    const steps = +process.env.STEPS || Math.min(240, Math.ceil(p.h / 70));
    // WHERE=1: where on the page the dropped frames fall (scroll position → section), from an in-page log.
    const secs0 = await t.ev(`window.__sy = []; const log = (now) => { window.__sy.push([now, scrollY]); window.__syr = requestAnimationFrame(log); }; window.__syr = requestAnimationFrame(log);
      window.__secs = [...document.querySelectorAll('[data-section]')].filter((e) => e.dataset.section !== 'nav').map((e) => [e.dataset.section, e.getBoundingClientRect().top + scrollY]);
      console.timeStamp('perf-phase'); window.__t0 = performance.now(); return 1`);
    void secs0;
    const t0 = Date.now();
    for (let i = 0; i < steps; i++) { await t.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: p.x, y: p.y, deltaX: 0, deltaY: 70 }); await t.sleep(16); }
    await t.sleep(700);
    await t.ev(`console.timeStamp('perf-end'); return 1`);
    const where = await t.ev(`cancelAnimationFrame(window.__syr); return { t0: window.__t0, sy: window.__sy, secs: window.__secs, H: innerHeight }`);
    runs.push({ look, secs: (Date.now() - t0) / 1000, where });
  }
  await t.send('Tracing.end');
  await complete;
  const stamps = (m) => events.filter((e) => e.name === 'TimeStamp' && e.args && e.args.data && e.args.data.message === m).map((e) => e.ts).sort((a, b) => a - b);
  const starts = stamps('perf-phase'), ends = stamps('perf-end');
  const reports = events.filter((e) => e.name === 'PipelineReporter' && e.ph === 'b' && e.args && e.args.frame_reporter);
  const raster = events.filter((e) => e.name === 'RasterTask' && e.ph === 'X');
  const surfaces = events.filter((e) => e.name === 'RenderSurfaceReasonCount' && e.args);
  const pn = new Map(events.filter((e) => e.ph === 'M' && e.name === 'process_name').map((e) => [e.pid, e.args.name]));
  const RANK = { STATE_PRESENTED_ALL: 3, STATE_PRESENTED_PARTIAL: 2, STATE_DROPPED: 1 };
  let total = 0, bad = 0;
  runs.forEach((r, i) => {
    const a = starts[i], b = ends[i];
    const mine = reports.filter((e) => e.ts >= a && e.ts < b);
    // The page's own compositor: the host that reported most frames in this run.
    const byHost = new Map(); mine.forEach((e) => { const k = e.pid + ':' + e.args.frame_reporter.layer_tree_host_id; byHost.set(k, (byHost.get(k) || 0) + 1); });
    const host = [...byHost.entries()].sort((x, y) => y[1] - x[1])[0];
    const seq = new Map();
    mine.filter((e) => host && e.pid + ':' + e.args.frame_reporter.layer_tree_host_id === host[0]).forEach((e) => { const f = e.args.frame_reporter, k = RANK[f.state] || 0; if (k > (seq.get(f.frame_sequence) || 0)) seq.set(f.frame_sequence, k); });
    let shown = 0, drop = 0; seq.forEach((k) => { if (k === 3) shown++; else if (k) drop++; });
    total += shown + drop; bad += drop;
    if (process.env.WHERE && r.where) {
      // Dropped frames by the section at the middle of the screen at that moment.
      const ts0 = a, w = r.where, bySec = new Map();
      const frameTs = new Map(); mine.forEach((e) => { const fs = e.args.frame_reporter.frame_sequence; if (!frameTs.has(fs)) frameTs.set(fs, e.ts); });
      seq.forEach((k, fsq) => {
        if (k === 3 || !k) return;
        const pt = w.t0 + (frameTs.get(fsq) - ts0) / 1000;
        let y = 0; for (const [tt, yy] of w.sy) { if (tt > pt) break; y = yy; }
        const mid = y + w.H / 2; let name = 'top'; for (const [n, top] of w.secs) if (top <= mid) name = n;
        bySec.set(name, (bySec.get(name) || 0) + 1);
      });
      t.log('     dropped by section: ' + [...bySec.entries()].sort((x, y) => y[1] - x[1]).map(([n, c]) => n + ' ' + c).join(', '));
    }
    const secs = (b - a) / 1e6;
    const sf = surfaces.filter((e) => e.ts >= a && e.ts < b && 'total' in e.args), sfAvg = sf.length ? (sf.reduce((x, e) => x + e.args.total, 0) / sf.length).toFixed(1) : '-';
    const reasons = new Map(); surfaces.forEach((e) => { if (e.ts >= a && e.ts < b && !('total' in e.args)) Object.keys(e.args).forEach((k) => reasons.set(k, (reasons.get(k) || 0) + e.args[k])); });
    const rs = raster.filter((e) => e.ts >= a && e.ts < b).length;
    t.log(`${r.look.padEnd(10)} frames ${String(shown + drop).padStart(5)} (${Math.round(shown / secs)}/s shown)  dropped ${String(drop).padStart(4)} (${(100 * drop / Math.max(1, shown + drop)).toFixed(1)}%)${process.env.RAST ? `  raster tiles/s ${Math.round(rs / secs)}  surfaces/frame ${sfAvg} (${[...reasons.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k]) => k).join(', ')})` : ''}`);
    if (process.env.LONG) events.filter((e) => e.name === 'RunTask' && e.ph === 'X' && e.dur > 20000 && e.ts >= a && e.ts < b && /Renderer/.test(pn.get(e.pid) || '')).slice(0, 6).forEach((e) => {
      const agg = new Map(); events.forEach((k) => { if (k.pid === e.pid && k.tid === e.tid && k.ph === 'X' && k !== e && k.ts >= e.ts && k.ts + (k.dur || 0) <= e.ts + e.dur && k.dur > 2000 && k.name !== 'RunTask') agg.set(k.name, (agg.get(k.name) || 0) + k.dur / 1000); });
      t.log(`     long ${(e.dur / 1000).toFixed(0)}ms at +${((e.ts - a) / 1000).toFixed(0)}ms: ${[...agg.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([n, d]) => n + ' ' + d.toFixed(0)).join(', ')}`);
    });
  });
  t.log(`TOTAL dropped ${bad} of ${total} (${(100 * bad / Math.max(1, total)).toFixed(1)}%), cpu ${cpu}×, ${who}`);
};
