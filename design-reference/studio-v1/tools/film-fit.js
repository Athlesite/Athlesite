// How tall is each section compared with the screen? (Jordan, every look). Film is measured in its
// list layout (FILM=reel for the reel, which is meant to be one full screen per video).
module.exports = async (t) => {
  const looks = ['cinematic', 'editorial', 'highlight', 'portrait', 'prospect'];
  const secs = (process.env.SECS || 'film').split(',');
  for (const look of looks) {
    await t.ev(`location.href = location.pathname + '?a=${process.env.WHO || 'jordan'}&look=${look}&film=${process.env.FILM || 'list'}&static=1&r=' + Math.random()`);
    await t.sleep(1800);
    const r = await t.ev(`
      await document.fonts.ready;
      const vh = innerHeight;
      return ${JSON.stringify(secs)}.map((k) => {
        const s = document.getElementById(k); if (!s) return k + ': none';
        const poster = s.querySelector('.film-poster');
        const pr = poster && poster.getBoundingClientRect();
        return k + ': ' + Math.round(s.offsetHeight) + 'px of ' + vh + (pr ? ' (poster ' + Math.round(pr.width) + 'x' + Math.round(pr.height) + ')' : '');
      }).join(' | ');`);
    t.log(look, r);
  }
};
