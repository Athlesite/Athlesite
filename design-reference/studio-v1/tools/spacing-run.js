// Steps for drive.js on tools/spacing.html: every athlete × look × font × cover, desktop and phone.
// Prints issues grouped by kind and place (decorative layering listed apart); writes all to $OUT.
// Env: ONLY=look1,look2 to limit looks; DEVICES=desktop,phone,small (small = a 360×740 phone).
const fs = require('fs');
module.exports = async (t) => {
  await t.ev('await new Promise((r) => { const w = () => (window.ready ? r() : setTimeout(w, 50)); w(); })');
  let combos = await t.ev('return combos()');
  if (process.env.ONLY) combos = combos.filter((c) => process.env.ONLY.split(',').includes(c.look));
  const sizes = { desktop: [1440, 900], phone: [390, 844], small: [360, 740], laptop: [1280, 720] };
  const devices = (process.env.DEVICES || 'desktop,phone').split(',');
  const all = [];
  for (const dev of devices) {
    const [w, h] = sizes[dev];
    for (let i = 0; i < combos.length; i += 15) {
      const batch = combos.slice(i, i + 15).map((c) => Object.assign({}, c, { w, h }));
      const res = await t.ev(`const out = []; for (const c of ${JSON.stringify(batch)}) { out.push({ c, issues: await runCombo(c) }); } return out;`);
      res.forEach(({ c, issues }) => issues.forEach((x) => all.push(Object.assign({ dev, combo: `${c.athlete}/${c.look}/${c.type}/${c.cover}${c.mirror ? '+mirror' : ''}${c.stats ? '/' + c.stats : ''}` }, x))));
    }
  }
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(all, null, 1));
  const groups = new Map();
  all.forEach((x) => {
    const key = `${x.deco ? '(decorative) ' : ''}${x.kind} | ${x.at.replace(/\d+/g, '#')} | ${x.dev}`;
    const g = groups.get(key) || { n: 0, worst: Infinity, ex: x };
    g.n++;
    if (x.px < g.worst) { g.worst = x.px; g.ex = x; }
    groups.set(key, g);
  });
  const rows = [...groups.entries()].sort((a, b) => (a[0].startsWith('(') - b[0].startsWith('(')) || b[1].n - a[1].n);
  t.log(`combos: ${combos.length} × ${devices.length} devices; issues: ${all.length} (${all.filter((x) => !x.deco).length} on real text); groups: ${rows.length}`);
  rows.forEach(([k, g]) => t.log(`${String(g.n).padStart(4)}  ${k}  worst ${g.worst}px  e.g. ${g.ex.combo} "${g.ex.text}"`));
};
