// Rapid, person-like interaction test. Every click must land; the preview must end in sync.
module.exports = async (t) => {
  const gap = () => 50 + Math.random() * 150;
  const problems = [];
  // The preview must catch up with the last click. A new font pairing waits on Google Fonts, so
  // allow up to 6 s and report how long it took (slow = worth a look, never = a bug).
  const insync = async (label) => {
    const t0 = Date.now();
    let r;
    do {
      await t.sleep(400);
      r = await t.ev(`
        const f=document.querySelector('.pv-frame.is-front');
        const actual=(f._html||'').replace(/<style id="studio-css">[\\s\\S]*?<\\/style>/,'').replace(' class="studio-settle"','');
        const expected=Athlesite.renderSite(Athlesite.studio.photos.resolve(Athlesite.studio.store.get()),{intro:'never',prompts:!document.body.classList.contains('is-visitor')});
        const screens=document.querySelectorAll('.panel-screens .screen').length;
        return {same: actual===expected, screens, look: Athlesite.studio.store.get().design.look, body: f.contentDocument.body.className};`);
    } while (!r.same && Date.now() - t0 < 6000);
    if (!r.same) problems.push(label + ': preview out of sync (' + r.body + ' vs ' + r.look + ')');
    if (r.screens !== 1) problems.push(label + ': ' + r.screens + ' panel screens left');
    t.log(label, r.same ? 'in sync' : 'OUT OF SYNC', 'after', Date.now() - t0, 'ms; screens', r.screens);
  };
  const checked = (sel) => t.ev(`const b=document.querySelector(${JSON.stringify(sel)});return b&&b.getAttribute('aria-checked')`);

  await t.ev(`localStorage.clear()`);
  await t.ev(`location.href = location.pathname + '?a=maya'`);
  await t.sleep(3000);

  // 1. Looks, rapid
  await t.clickSel('.design-open'); await t.sleep(gap());
  const looks = ['highlight', 'portrait', 'prospect', 'cinematic', 'editorial', 'highlight', 'prospect'];
  for (const l of looks) { await t.clickSel(`.look-cards [data-v=${l}]`); if (await checked(`.look-cards [data-v=${l}]`) !== 'true') problems.push('look click missed ' + l); await t.sleep(gap()); }
  await insync('looks');

  // 2. Palettes, fonts, photo — rapid
  for (let i = 0; i < 8; i++) {
    const ids = await t.ev(`return [...document.querySelectorAll('.swatch-list [role=radio]')].map(b=>b.dataset.v)`);
    const v = ids[i % ids.length];
    await t.clickSel(`.swatch-list [data-v=${v}]`);
    if (await checked(`.swatch-list [data-v=${v}]`) !== 'true') problems.push('palette click missed ' + v);
    await t.sleep(gap());
  }
  for (let i = 0; i < 6; i++) {
    const ids = await t.ev(`return [...document.querySelectorAll('.font-cards [role=radio]')].map(b=>b.dataset.v)`);
    const v = ids[i % ids.length];
    await t.clickSel(`.font-cards [data-v="${v}"]`);
    if (await checked(`.font-cards [data-v="${v}"]`) !== 'true') problems.push('font click missed ' + v);
    await t.sleep(gap());
  }
  for (const v of ['mono', 'duotone', 'color', '', 'duotone']) {
    await t.clickSel(`.block .seg [data-v="${v}"]`);
    if (await checked(`.block .seg [data-v="${v}"]`) !== 'true') problems.push('photo click missed ' + v);
    await t.sleep(gap());
  }
  await insync('palette/fonts/photo');

  // 3. Navigation spam: back, open design, back, open stats, back, open cover...
  for (const sel of ['.back', '.design-open', '.back', '.sec-row[data-key=stats] .sec-open', '.back', '.sec-row[data-key=cover] .sec-open', '.back', '.sec-row[data-key=gallery] .sec-open', '.back']) {
    await t.clickSel(sel); await t.sleep(40 + Math.random() * 80);
  }
  await insync('navigation');
  t.log('title after nav', await t.ev(`return document.querySelector('.panel-title h2').textContent`));

  // 4. Hide and show film via the eye
  await t.clickSel('.sec-row[data-key=film] .eye'); await t.sleep(gap());
  await insync('hide film');
  t.log('film on page after hide', await t.ev(`return !!document.querySelector('.pv-frame.is-front').contentDocument.getElementById('film')`));
  await t.clickSel('.sec-row[data-key=film] .eye');
  await insync('show film');

  // 5. Keyboard reorder: stats up twice
  const before = await t.ev(`return Athlesite.studio.effectiveOrder(Athlesite.studio.store.get()).join(',')`);
  await t.ev(`document.querySelector('.sec-row[data-key=stats] .grip').focus()`);
  await t.key('ArrowUp'); await t.sleep(80); await t.key('ArrowUp'); await t.sleep(80);
  const after = await t.ev(`return Athlesite.studio.effectiveOrder(Athlesite.studio.store.get()).join(',')`);
  t.log('keyboard reorder', before, '->', after, 'focus on', await t.ev(`return document.activeElement.closest('.sec-row')?.dataset.key`));
  await insync('keyboard reorder');
  const pageOrder = await t.ev(`return [...document.querySelector('.pv-frame.is-front').contentDocument.querySelectorAll('main > section[data-section]')].map(s=>s.dataset.section).join(',')`);
  t.log('page order', pageOrder);

  // 6. Drag reorder: details grip up three rows
  const g = await t.rect('.sec-row[data-key=details] .grip');
  const rowH = await t.ev(`const r=[...document.querySelectorAll('.sec-list .sec-row')];return r[1].getBoundingClientRect().top-r[0].getBoundingClientRect().top`);
  await t.drag(g.x, g.y, g.x, g.y - rowH * 3, 14);
  await t.sleep(200);
  t.log('after drag', await t.ev(`return Athlesite.studio.effectiveOrder(Athlesite.studio.store.get()).join(',')`));
  t.log('dom list', await t.ev(`return [...document.querySelectorAll('.sec-list .sec-row')].map(r=>r.dataset.key).join(',')`));
  await insync('drag reorder');
  await t.shot('t3-after-drag');

  // 7. Remix spam
  for (let i = 0; i < 6; i++) { await t.clickSel('.design-card [data-remix]'); await t.sleep(30 + Math.random() * 100); }
  await insync('remix spam');

  // 8. Device spam
  for (let i = 0; i < 5; i++) { await t.clickSel(`#device-slot [data-v=${i % 2 ? 'desktop' : 'phone'}]`); await t.sleep(30 + Math.random() * 90); }
  await t.sleep(800);
  t.log('device', await t.ev(`return document.querySelector('#device-slot [aria-checked=true]').dataset.v + ' / viewport phone=' + document.querySelector('.pv-viewport').classList.contains('is-phone') + ' opacity=' + getComputedStyle(document.querySelector('.pv-anim')).opacity`));

  // 9. Visitor mode: no edit outlines; then back
  await t.clickSel('#mode-slot [data-v=visitor]');
  await t.sleep(1500);
  t.log('visitor picks', await t.ev(`return document.querySelector('.pv-frame.is-front').contentDocument.querySelectorAll('[data-studio-pick]').length`));
  await t.clickSel('#mode-slot [data-v=edit]');
  await t.sleep(1500);
  t.log('edit picks', await t.ev(`return document.querySelector('.pv-frame.is-front').contentDocument.querySelectorAll('[data-studio-pick]').length`));

  // 10. Play opening
  await t.clickSel('#play');
  await t.sleep(900);
  t.log('opening running', await t.ev(`return document.querySelector('.pv-frame.is-front').contentDocument.documentElement.className`));
  await t.shot('t3-opening');
  await t.sleep(3500);

  // 11. Undo everything back to the start, then reload and check persistence
  let n = 0; while (await t.ev(`return Athlesite.studio.store.canUndo()`) && n < 200) { await t.ev(`Athlesite.studio.store.undo()`); n++; }
  t.log('undo steps', n, 'look', await t.ev(`return Athlesite.studio.store.get().design.look`));
  await t.ev(`Athlesite.studio.store.redo();Athlesite.studio.store.redo();`);
  const want = await t.ev(`return JSON.stringify(Athlesite.studio.store.get())`);
  await t.sleep(700);
  await t.ev(`location.href = location.pathname`);
  await t.sleep(3000);
  t.log('persisted after reload', (await t.ev(`return JSON.stringify(Athlesite.studio.store.get())`)) === want);

  t.log('PROBLEMS', problems.length ? problems : 'none');
};
