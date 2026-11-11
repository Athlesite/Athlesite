// Steps for drive.js on studio.html: the live Studio has no test dropdown (only ?dev=1); Design shows the 15
// homepage examples as "Styles from real pages"; using one puts its whole design on the page and keeps the
// athlete's own words; one undo brings their design back. Run at 1440x900 and 390x844. Must print PROBLEMS none.
module.exports = async (t) => {
  const P = [];
  const expect = (l, ok, got) => { t.log((ok ? 'ok   ' : 'FAIL ') + l + (ok ? '' : ' got ' + JSON.stringify(got))); if (!ok) P.push(l); };
  await t.ev(`localStorage.clear(); location.href = location.pathname + '?a=jordan'; return 1`);
  await t.sleep(3500);
  expect('no test dropdown in the live Studio', !(await t.ev('return document.querySelector(".test-pick")')), 'shown');
  const W = await t.ev('return innerWidth');
  if (W < 800) for (let i = 0; i < 3 && (await t.ev('return document.getElementById("panel").dataset.sheet')) !== 'full'; i++) { await t.clickSel('#sheet-handle'); await t.sleep(600); }
  await t.clickSel('.design-open'); await t.sleep(1500);
  expect('15 styles in Design', (await t.ev('return document.querySelectorAll(".style-card").length')) === 15, await t.ev('return document.querySelectorAll(".style-card").length'));
  await t.shot('styles-' + W);
  await t.clickSel('.style-card[data-ex=aaliyah-grant]'); await t.sleep(1800);
  const d = await t.ev('const p = Athlesite.studio.store.get(); return { look: p.design.look, palette: p.design.palette, name: p.data.firstName, cover: p.design.layout.cover }');
  expect('page takes Aaliyah’s design, keeps Jordan’s words', d.look === 'highlight' && d.palette === 'electric' && d.name === 'Jordan', d);
  expect('the Look cards follow', (await t.ev('return document.querySelector(".look-cards [aria-checked=true]").dataset.v')) === 'highlight', 'not');
  await t.shot('styles-applied-' + W);
  await t.ev('document.getElementById("undo").click(); return 1'); await t.sleep(1200);
  expect('one undo brings his own design back', (await t.ev('return Athlesite.studio.store.get().design.look')) === 'cinematic', await t.ev('return Athlesite.studio.store.get().design.look'));
  await t.ev(`location.href = location.pathname + '?a=jordan&dev=1'; return 1`); await t.sleep(2500);
  expect('dev=1 shows the test dropdown', !!(await t.ev('return document.querySelector(".test-pick")')), 'missing');
  t.log('PROBLEMS ' + (P.length ? P.join('; ') : 'none'));
};
