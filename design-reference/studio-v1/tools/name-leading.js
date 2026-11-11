// Gap (in em) between line 1's lowest descender and line 2's tallest letter for two-line serif names.
module.exports = async (t) => {
  const cases = [['editorial', ''], ['editorial', 'warm'], ['editorial', 'classic'], ['portrait', ''], ['portrait', 'fashion'], ['portrait', 'heritage']];
  for (const [look, type] of cases) {
    await t.ev(`location.href = location.pathname + '?a=jordan&look=${look}&type=${type}&static=1&r=' + Math.random()`);
    await t.sleep(2500);
    const r = await t.ev(`
      await document.fonts.ready;
      const h = document.querySelector('.hero-name');
      const cs1 = getComputedStyle(h), cs2 = getComputedStyle(h.querySelector('em') || h.lastElementChild);
      const fs = parseFloat(getComputedStyle(h).fontSize), lh = parseFloat(getComputedStyle(h).lineHeight) / fs;
      const ctx = document.createElement('canvas').getContext('2d');
      const m = (cs, txt) => { ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + fs + 'px ' + cs.fontFamily; return ctx.measureText(txt); };
      const out = {};
      for (const [first, last] of [['Jordan','Bell'],['Maya','Rodriguez'],['Tyler','Brooks'],['Gage','Lyons'],['Jaylen','Kelly']]) {
        const d = m(cs1, first).actualBoundingBoxDescent / fs, up = m(cs2, last).actualBoundingBoxAscent / fs;
        out[first + ' ' + last] = +(lh - d - up).toFixed(3);
      }
      return { font: cs1.fontFamily.split(',')[0], lh: +lh.toFixed(2), gaps: out };`);
    t.log(look, type || '(default)', JSON.stringify(r));
  }
};
