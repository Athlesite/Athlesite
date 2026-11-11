// Render every combination of the freedom-system choices in Node and sanity-check Remix and color.
global.window = {};
const dir = process.argv[2];
for (const f of ['sports.js', 'profile.js', 'color.js', 'render.js', 'looks/cinematic.js', 'looks/editorial.js', 'looks/highlight.js', 'looks/portrait.js', 'looks/prospect.js', 'athletes.js', 'remix.js']) require(dir + '/' + f);
const A = window.Athlesite;
const j = A.ATHLETES.jordan;

console.log('custom paragraphs:', j.data.custom.body.split(/\n\s*\n/).length, '| cinematic sections:', A.visibleSections(j, A.LOOKS.cinematic.order).join(','));

let n = 0;
const errs = [];
for (const a of Object.keys(A.ATHLETES)) {
  for (const l of Object.keys(A.LOOKS)) {
    const L = A.LOOKS[l];
    for (const t of L.types) for (const cv of L.covers) for (const st of ['', 'spotlight', 'ledger']) for (const g of ['', 'strip', 'feature', 'folio']) for (const fl of ['', 'reel', 'list']) for (const ph of ['', 'color', 'mono', 'duotone']) {
      const p = structuredClone(A.ATHLETES[a]);
      Object.assign(p.design, { look: l, palette: '', type: t.id, photo: ph, layout: { cover: cv.id, stats: st, gallery: g, film: fl } });
      try {
        const html = A.renderSite(p, { intro: 'always' });
        n++;
        const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
        if (/undefined|NaN|\[object/.test(visible)) errs.push(`${a}/${l}/${t.id}/${cv.id}/${st}/${g}/${fl}/${ph}`);
      } catch (e) { errs.push(`${a}/${l}: ${e.message}`); }
    }
  }
}
console.log('rendered', n, 'combinations; problems:', errs.length, errs.slice(0, 4));

const r = A.remix(j, { seed: 7 });
console.log('remix (seed 7):', JSON.stringify({ look: r.look, palette: r.palette, type: r.type, photo: r.photo, layout: r.layout }), '| changes:', A.designDifference(j.design, r));
let minDiff = 99;
for (let s = 1; s <= 200; s++) minDiff = Math.min(minDiff, A.designDifference(j.design, A.remix(j, { seed: s })));
console.log('remix: fewest changes over 200 rolls =', minDiff);

console.log('yellow on gallery-white ->', A.color.readableAccent('#FFE600', '#FAFAF8', '#141414'), '(contrast', A.color.contrast(A.color.readableAccent('#FFE600', '#FAFAF8', '#141414'), '#FAFAF8').toFixed(2) + ')');
console.log('navy on black ->', A.color.readableAccent('#0B1F4D', '#07090C', '#F4F5F7'), '| text on lime:', A.color.textOn('#D4FF3A'), '| text on navy:', A.color.textOn('#0B1F4D'));
