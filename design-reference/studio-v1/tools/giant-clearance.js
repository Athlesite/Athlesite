// Steps for drive.js on site.html: on phones, the cover's giant decorative numbers and initials must
// clear the nav (gap below the Menu/Contact buttons) and must not sit on the cover's real text.
// Env: WHO=jordan,devon,…  LOOKS=cinematic,highlight  MIN=32 (smallest gap in px)
// usage: node tools/drive.js tools/giant-clearance.js file:///…/studio-v1/site.html <outDir> 390 844
module.exports = async (t) => {
  const who = (process.env.WHO || 'jordan,devon,maya,tyler,marcus,ava,sam').split(',');
  const looks = (process.env.LOOKS || 'cinematic,highlight,editorial,portrait,prospect').split(',');
  const MIN = +process.env.MIN || 32;
  let problems = 0, checked = 0;
  for (const look of looks) {
    const covers = await t.ev(`return window.Athlesite ? Athlesite.LOOKS[${JSON.stringify(look)}].covers.map((c) => c.id) : ['left']`);
    for (const a of who) for (const cover of covers) {
      await t.ev(`location.href = location.pathname + '?a=${a}&look=${look}&cover=${cover}&static=1&r=' + Math.random()`);
      await t.sleep(700);
      const r = await t.ev(`
        await document.fonts.ready;
        const nav = document.querySelector('.nav');
        const ctrls = nav ? [...nav.querySelectorAll('.nav-cta,.nav-menu,.nav-mark')].filter((e) => e.getClientRects().length) : [];
        const navBottom = Math.max(0, ...ctrls.map((e) => e.getBoundingClientRect().bottom));
        const cv = document.createElement('canvas').getContext('2d');
        const ink = (el) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || !el.getClientRects().length) return null;
          if (cs.visibility === 'hidden') return { hidden: true, text: el.textContent.trim() };
          cv.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
          const range = document.createRange(); range.selectNodeContents(el);
          let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
          for (const rr of range.getClientRects()) {
            const m = cv.measureText(el.textContent.trim());
            const base = rr.top + m.fontBoundingBoxAscent;
            top = Math.min(top, base - m.actualBoundingBoxAscent); bottom = Math.max(bottom, base + m.actualBoundingBoxDescent);
            left = Math.min(left, rr.left); right = Math.max(right, rr.right);
          }
          return top === Infinity ? null : { top, bottom, left, right, text: el.textContent.trim(), layered: cs.getPropertyValue('--fit').trim() === 'off' };
        };
        const giants = [...document.querySelectorAll('.hero-number,.hero-void span,.hero-big,.hero-monogram')].map(ink).filter(Boolean);
        const texts = [...document.querySelectorAll('.hero :is(.hero-kicker,.hero-name,.hero-meta,.hero-tag,.hero-tagline,.hero-actions,.hero-rubric,.hero-standfirst,.pr-kicker,.pr-line)')].filter((e) => e.getClientRects().length).map((e) => { const b = e.getBoundingClientRect(); return { cls: e.className.split(' ')[0], top: b.top, bottom: b.bottom, left: b.left, right: b.right }; });
        return giants.map((g) => g.hidden ? { g: g.text, hidden: true } : ({ g: g.text, layered: g.layered, top: Math.round(g.top), gap: Math.round(g.top - navBottom), navBottom: Math.round(navBottom),
          on: texts.filter((x) => x.left < g.right && x.right > g.left && x.top < g.bottom && x.bottom > g.top).map((x) => x.cls) }));`);
      for (const g of r) {
        checked++;
        if (g.hidden) { t.log(`aside ${look}/${cover}/${a} "${g.g}" no room on this screen, steps aside`); continue; }
        if (g.on.length && !g.layered) { problems++; t.log(`ON    ${look}/${cover}/${a} "${g.g}" sits behind: ${g.on.join(',')}`); continue; }
        const bad = g.gap < MIN;
        if (bad) problems++;
        if (bad || process.env.ALL) t.log(`${bad ? 'CLOSE' : 'ok   '} ${look}/${cover}/${a} "${g.g}" ink top ${g.top}, nav bottom ${g.navBottom}, gap ${g.gap}${g.on.length ? '  overlaps: ' + g.on.join(',') : ''}`);
        else if (g.on.length) t.log(`note  ${look}/${cover}/${a} "${g.g}" sits behind: ${g.on.join(',')}`);
      }
    }
  }
  t.log(`checked ${checked} giants, problems (too close to the nav, or behind the cover's words): ${problems}`);
};
