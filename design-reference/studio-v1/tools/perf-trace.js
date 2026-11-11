// Steps for drive.js: record a Chrome performance trace while something happens, then list the
// main-thread work behind each long frame (what kind of work, how long, where in the run).
// Env: Q = query for site.html (default a=jordan&look=cinematic&intro=never), ACT = opening|scroll,
//      CPU = slow-down factor, MIN = smallest task to list in ms (default 30)
module.exports = async (t) => {
  const cpu = +process.env.CPU || 1, act = process.env.ACT || 'scroll', MIN = +process.env.MIN || 30;
  await t.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const events = [];
  let done;
  const complete = new Promise((r) => (done = r));
  t.on('Tracing.dataCollected', (p) => events.push(...p.value));
  t.on('Tracing.tracingComplete', () => done());
  const q = process.env.Q || 'a=jordan&look=cinematic&intro=never';
  if (act === 'scroll') {
    await t.ev(`location.href = location.pathname + '?${q}&r=' + Math.random()`);
    await t.sleep(3000);
  }
  await t.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,v8.execute', transferMode: 'ReportEvents' });
  const t0 = Date.now();
  if (act === 'opening') {
    await t.ev(`location.href = location.pathname + '?${q.replace('intro=never', 'intro=always')}&r=' + Math.random()`);
    await t.sleep(4500);
  } else {
    const p = await t.ev(`return { x: innerWidth / 2, y: innerHeight / 2, h: document.documentElement.scrollHeight }`);
    const steps = Math.min(220, Math.ceil(p.h / 60));
    for (let i = 0; i < steps; i++) { await t.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: p.x, y: p.y, deltaX: 0, deltaY: 60 }); await t.sleep(16); }
    await t.sleep(600);
  }
  await t.send('Tracing.end');
  await complete;
  // Main-thread renderer events: the thread that runs RunTask for the page.
  const tasks = events.filter((e) => e.name === 'RunTask' && e.ph === 'X' && e.dur > MIN * 1000);
  const byThread = new Map();
  tasks.forEach((e) => byThread.set(e.tid, (byThread.get(e.tid) || 0) + e.dur));
  const main = [...byThread.entries()].sort((a, b) => b[1] - a[1])[0];
  const start = Math.min(...events.filter((e) => e.ts).map((e) => e.ts));
  const inside = (outer) => events.filter((e) => e.tid === outer.tid && e.ph === 'X' && e.ts >= outer.ts && e.ts + (e.dur || 0) <= outer.ts + outer.dur && e !== outer && e.dur > 2000);
  t.log(`trace: ${events.length} events over ${Date.now() - t0}ms, cpu ${cpu}×, ${act} ${q}`);
  tasks.filter((e) => !main || e.tid === main[0]).forEach((e) => {
    const kids = inside(e).filter((k) => !['RunTask', 'ThreadControllerImpl::RunTask'].includes(k.name));
    const agg = new Map();
    kids.forEach((k) => {
      const name = k.name + (k.args && k.args.data && k.args.data.url ? ' ' + String(k.args.data.url).split('/').pop().slice(0, 40) : '') + (k.args && k.args.data && k.args.data.functionName ? ' ' + k.args.data.functionName : '');
      agg.set(name, (agg.get(name) || 0) + k.dur);
    });
    const top = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, d]) => `${n} ${(d / 1000).toFixed(0)}ms`).join(', ');
    t.log(`  at ${((e.ts - start) / 1000).toFixed(0)}ms: task ${(e.dur / 1000).toFixed(0)}ms — ${top}`);
  });
  // Off the main thread: image decodes, raster and GPU work that can also hold up a frame.
  const names = new Map(events.filter((e) => e.ph === 'M' && e.name === 'thread_name').map((e) => [e.tid, e.args.name]));
  const other = events.filter((e) => e.ph === 'X' && e.dur > MIN * 1000 && (!main || e.tid !== main[0]) && !/RunTask|ThreadControllerImpl|ThreadPool_RunTask/.test(e.name));
  other.sort((a, b) => b.dur - a.dur).slice(0, 10).forEach((e) => t.log(`  other thread (${names.get(e.tid) || e.tid}) at ${((e.ts - start) / 1000).toFixed(0)}ms: ${e.name} ${(e.dur / 1000).toFixed(0)}ms`));
};
