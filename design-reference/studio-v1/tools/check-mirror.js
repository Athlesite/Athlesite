// Mirror: renders cleanly everywhere, applies only where safe, and never on centered covers.
global.window = {};
const dir = process.argv[2];
for (const f of ['sports.js', 'profile.js', 'color.js', 'render.js', 'looks/cinematic.js', 'looks/editorial.js', 'looks/highlight.js', 'looks/portrait.js', 'looks/prospect.js', 'athletes.js', 'remix.js']) require(dir + '/' + f);
const A = window.Athlesite;
let n = 0, applied = 0;
const problems = [];
for (const a of Object.keys(A.ATHLETES)) for (const l of Object.keys(A.LOOKS)) for (const cv of A.LOOKS[l].covers) {
  const p = structuredClone(A.ATHLETES[a]);
  Object.assign(p.design, { look: l, palette: '', layout: { cover: cv.id, stats: '', gallery: '', mirror: true } });
  const html = A.renderSite(p, { intro: 'always' });
  n++;
  const body = html.match(/<body class="([^"]*)"/)[1];
  const has = /\bmirror\b/.test(body);
  if (has) applied++;
  if (has && !cv.mirror) problems.push(`${a}/${l}/${cv.id}: mirrored a centered cover`);
  if (has && cv.mirror === 'subject-left' && p.data.heroPhotoUrl && p.data.heroPhotoPositionX >= 0.45) problems.push(`${a}/${l}/${cv.id}: mirrored over the athlete`);
  if (!new RegExp(`\\bcover-${cv.id}\\b`).test(body)) problems.push(`${a}/${l}/${cv.id}: cover class missing`);
}
console.log('mirror renders:', n, '| mirror applied:', applied, '| problems:', problems.length, problems.slice(0, 5));
// Stored profiles without the new field still load.
console.log('old profile mirror ->', A.normalizeProfile({ design: { layout: { cover: 'split' } } }).design.layout.mirror);
