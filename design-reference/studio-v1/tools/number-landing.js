// Steps for drive.js on site.html: the opening's number must land exactly on the cover's number
// (or the "No. 14" in the details line when the cover has no giant number), with no jump.
// Tracks the flying number every frame. Env: LOOK=cinematic, COVERS=left,center,split, WHO=jordan,
// EXTRA="&design=…" for Mirror etc. Run with SCROLLBARS=1 for Windows widths.
module.exports = async (t) => {
  const covers = (process.env.COVERS || 'left,center,split').split(',');
  for (const who of (process.env.WHO || 'jordan').split(',')) for (const cover of covers) {
    await t.ev(`location.href = location.pathname + '?a=${who}&look=${process.env.LOOK || 'cinematic'}&cover=${cover}&intro=always${process.env.EXTRA || ''}&r=' + Math.random()`);
    await t.sleep(120);
    const r = await t.ev(`
      const t0 = performance.now(), out = [];
      const box = (rects) => { let l = 1e9, tp = 1e9, rr = -1e9, b = -1e9; for (const x of rects) { l = Math.min(l, x.left); tp = Math.min(tp, x.top); rr = Math.max(rr, x.right); b = Math.max(b, x.bottom); } return l > 1e8 ? null : [+l.toFixed(1), +tp.toFixed(1), +(rr - l).toFixed(1), +(b - tp).toFixed(1)]; };
      const textBox = (el) => { if (!el) return null; const g = document.createRange(); g.selectNodeContents(el); return box(g.getClientRects()); };
      const metaBox = (num) => { for (const line of document.querySelectorAll('.hero-meta')) { const w = document.createTreeWalker(line, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { const i = n.textContent.indexOf(num); if (i >= 0) { const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + num.length); return box(g.getClientRects()); } } } return null; };
      await new Promise((done) => {
        const tick = () => {
          const fly = document.querySelector('.i-num');
          const real = [...document.querySelectorAll('.hero-number,.hero-void span')].find((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden');
          out.push({ t: Math.round(performance.now() - t0), cls: document.documentElement.className, fly: fly && textBox(fly), flyO: fly && +getComputedStyle(fly).opacity, real: real && textBox(real), realO: real && +getComputedStyle(real).opacity, meta: fly && metaBox(fly.textContent.trim()) });
          if (performance.now() - t0 < 6000) requestAnimationFrame(tick); else done();
        };
        requestAnimationFrame(tick);
      });
      return out;`);
    const landing = r.filter((x) => x.cls.includes('intro-landing') && x.fly);
    const last = landing.slice(-1)[0];
    const after = r.filter((x) => x.cls.includes('intro-played'));
    if (!last) { t.log(`${cover}/${who}: no number in the opening`); continue; }
    const target = last.real || last.meta, kind = last.real ? 'giant' : 'meta';
    const d = target && last.fly ? last.fly.map((v, i) => +(v - target[i]).toFixed(1)) : null;
    // The first frame with the copy faded below 0.5: how far from the target was it then?
    const half = landing.find((x) => x.flyO < 0.5);
    const dHalf = half && target ? half.fly.map((v, i) => +(v - target[i]).toFixed(1)) : null;
    const realMoves = after.filter((x, i) => i && JSON.stringify(x.real) !== JSON.stringify(after[i - 1].real)).length;
    const realStart = landing[0] && landing[0].real, realEnd = after[0] && after[0].real;
    t.log(`${cover}/${who}: lands on ${kind}; last frame off by [x,y,w,h] ${JSON.stringify(d)}; when half faded ${JSON.stringify(dHalf)}; cover number moved during landing ${JSON.stringify(realStart) !== JSON.stringify(realEnd)}; moves after ${realMoves}; real opacity at end ${after[0] && after[0].realO}`);
  }
};
