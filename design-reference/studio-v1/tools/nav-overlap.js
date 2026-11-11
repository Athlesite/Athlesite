// Steps for drive.js on site.html: while the nav is see-through (top of the page), nothing on the
// cover (words, buttons, stats, the giant number) may slide under it. Scrolls each look × cover in
// small steps and checks every frame where the nav is visible and not yet solid.
// Env: WHO=jordan,devon  LOOKS=…  usage: node tools/drive.js tools/nav-overlap.js file:///…/site.html <out> 390 844
module.exports = async (t) => {
  const who = (process.env.WHO || 'jordan,devon,ava').split(',');
  const looks = (process.env.LOOKS || 'cinematic,editorial,highlight,portrait,prospect').split(',');
  let problems = 0, checked = 0;
  for (const look of looks) {
    const covers = await t.ev(`return Athlesite.LOOKS[${JSON.stringify(look)}].covers.map((c) => c.id)`);
    for (const a of who) for (const cover of covers) {
      await t.ev(`location.href = location.pathname + '?a=${a}&look=${look}&cover=${cover}&intro=never&r=' + Math.random()`);
      await t.sleep(2900); // entrances settle and the nav re-measures
      const r = await t.ev(`
        document.documentElement.style.scrollBehavior = 'auto';
        const nav = document.querySelector('.nav'), hero = document.querySelector('.hero');
        if (!nav || !hero) return [];
        const bad = [];
        const sel = 'h1,p,dl,.hero-actions,.hero-number,.hero-big,.hero-void span,.hero-monogram';
        for (let y = 0; y < hero.offsetHeight; y += 12) {
          scrollTo(0, y);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          if (nav.classList.contains('is-stuck') || nav.classList.contains('is-away')) continue;
          const bg = getComputedStyle(nav).backgroundColor.match(/[\\d.]+/g) || [];
          if (bg.length === 3 || +bg[3] >= 0.8) continue; // this look's nav has its own solid bar
          const nb = nav.getBoundingClientRect();
          const hit = [...hero.querySelectorAll(sel)].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && +getComputedStyle(e).opacity > 0.05)
            .find((e) => { const b = e.getBoundingClientRect(); return b.top < nb.bottom && b.bottom > nb.top && b.width > 0; });
          if (hit) { bad.push({ y, what: hit.className || hit.tagName }); break; }
        }
        scrollTo(0, 0);
        return bad;`);
      checked++;
      if (r.length) { problems++; t.log(`UNDER ${look}/${cover}/${a}: "${r[0].what}" under a see-through nav at scroll ${r[0].y}`); }
    }
  }
  t.log(`checked ${checked} covers, content under a see-through nav: ${problems}`);
};
