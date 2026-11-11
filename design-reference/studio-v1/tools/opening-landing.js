// Track the flying name and the real headline every frame through the landing.
module.exports = async (t) => {
  const looks = (process.env.LOOKS || 'cinematic').split(',');
  for (const look of looks) {
    await t.ev(`location.href = location.pathname + '?a=${process.env.WHO || 'jordan'}&look=${look}${process.env.EXTRA || ''}&intro=always&r=' + Math.random()`);
    await t.sleep(150);
    const r = await t.ev(`
      const out = []; const t0 = performance.now();
      const real = () => document.querySelector('.hero-name:not(.intro-name)');
      const fly = () => document.querySelector('.intro-name');
      const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [+r.left.toFixed(2), +r.top.toFixed(2), +r.width.toFixed(2), +r.height.toFixed(2)]; };
      await new Promise((done) => {
        const tick = () => {
          const f = fly(), rl = real();
          out.push({ t: Math.round(performance.now() - t0), cls: document.documentElement.className.replace(/\\bjs\\b/, '').trim(), fly: box(f), flyT: f && getComputedStyle(f).transform, real: box(rl), sbw: innerWidth - document.documentElement.clientWidth });
          if (performance.now() - t0 < 6500) requestAnimationFrame(tick); else done();
        };
        requestAnimationFrame(tick);
      });
      return out;`);
    // Summarize: scrollbar width changes, the last fly frames, first real frames after, and any movement of real after hand-off.
    const sb = [...new Set(r.map((x) => x.sbw))];
    const lastFly = r.filter((x) => x.fly).slice(-1)[0];
    const after = r.filter((x) => !x.fly && x.cls.includes('intro-played'));
    const realMoves = after.length ? after.filter((x, i) => i && JSON.stringify(x.real) !== JSON.stringify(after[i - 1].real)).length : -1;
    // when does the fly name get within 1px and 0.5px of its final spot
    const fin = lastFly && lastFly.fly;
    const within = (px) => { const f = r.find((x) => x.fly && fin && Math.abs(x.fly[0] - fin[0]) < px && Math.abs(x.fly[1] - fin[1]) < px && x.cls.includes('intro-landing')); return f && f.t; };
    const landStart = (r.find((x) => x.cls.includes('intro-landing')) || {}).t;
    t.log(look, 'scrollbar widths', sb, 'landing starts', landStart, 'within 2px at', within(2), 'within .5px at', within(0.5), 'hand-off at', after[0] && after[0].t);
    t.log('  last fly', lastFly && lastFly.fly, 'real at hand-off', after[0] && after[0].real, 'real moves after hand-off', realMoves);
    t.log('  real during landing (first/last)', JSON.stringify((r.find((x) => x.cls.includes('intro-landing')) || {}).real), JSON.stringify((r.filter((x) => x.cls.includes('intro-landing')).slice(-1)[0] || {}).real));
  }
};
