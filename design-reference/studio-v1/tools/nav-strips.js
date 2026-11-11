// Nav strips for every look: over the cover, and scrolled into Stats (marker under the active link).
const fs = require('fs'), path = require('path');
module.exports = async (t) => {
  const out = process.env.OUT;
  const looks = (process.env.LOOKS || 'cinematic,editorial,highlight,portrait,prospect').split(',');
  const who = process.env.WHO || 'jordan';
  const W = +process.env.W || 1440;
  const strip = async (name, h = 80) => { const y = await t.ev('return scrollY');
    const s = await t.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y, width: W, height: h, scale: 1 } });
    fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(s.result.data, 'base64'));
  };
  for (const look of looks) {
    await t.ev(`location.href = location.pathname + '?a=${who}&look=${look}&intro=never${process.env.EXTRA || ''}&r=' + Math.random()`);
    await t.sleep(2200);
    const info = await t.ev(`return {cls: document.querySelector('.nav').className, sw: document.querySelector('.nav').scrollWidth, cw: document.querySelector('.nav').clientWidth}`);
    t.log(look, JSON.stringify(info));
    await strip(`${look}-top`);
    // scroll into stats; nav will tuck away going down, so scroll up a little to bring it back
    await t.ev(`const s=document.getElementById('stats')||document.querySelector('main section[id]');scrollTo(0,s.offsetTop+200);`);
    await t.sleep(400);
    await t.ev(`scrollBy(0,-60)`);
    await t.sleep(900);
    t.log('  active', await t.ev(`const a=document.querySelector('.nav-links a[aria-current]');const n=document.querySelector('.nav');return (a?a.textContent:'none')+' away='+n.classList.contains('is-away')+' stuck='+n.classList.contains('is-stuck')`));
    await strip(`${look}-stuck`);
    if (process.env.SHEET) {
      await t.clickSel('.nav-menu');
      await t.sleep(900);
      await t.shot(`${look}-sheet`);
      await t.key('Escape');
      await t.sleep(500);
      t.log('  sheet closed', await t.ev(`return document.getElementById('nav-sheet').hidden + ' focus=' + document.activeElement.className`));
    }
  }
};
