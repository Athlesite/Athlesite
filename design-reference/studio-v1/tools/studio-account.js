// Steps for drive.js on studio.html: the account screens before the setup and the Publish step.
// - Opening in the setup (?start=1, a new athlete) never shows the editor first, not even for a frame.
// - A new athlete answers the date of birth first; a non-date is caught; 13–17 and under 13 get the
//   product's own messages with no way round; the date isn't left anywhere on the page.
// - Email, then code + terms: Verify waits for both; then the setup's first question.
// - Visitor view shows only what a published page may show (no Stats, no Contact).
// - Publish: a reserved name, a taken name and a bad name are refused; an available one publishes. After
//   that a private edit (stats) changes nothing public, a public edit (bio) waits for "Publish changes",
//   the editor marks the six private sections, and Unpublish takes it all back.
// Run at 1440x900 and 390x844. Must print PROBLEMS none.
module.exports = async (t) => {
  const P = [];
  const expect = (l, ok, got) => { t.log((ok ? 'ok   ' : 'FAIL ') + l + (ok ? '' : ' got ' + JSON.stringify(got))); if (!ok) P.push(l); };
  const set = (sel, val) => t.ev(`const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(val)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return 1`);
  const q = () => t.ev(`const h = document.querySelector('.fr-q'); return h ? h.textContent : ''`);
  const dob = async (m, d, y) => { await set('select[name=m]', String(m)); await set('input[name=d]', String(d)); await set('input[name=y]', String(y)); };
  const fresh = async (extra = '') => { await t.ev(`localStorage.clear(); setTimeout(() => location.href = location.pathname + '?start=1${extra}', 30); return 1`); await t.sleep(3000); };
  const W = await t.ev('return innerWidth');
  const thisYear = new Date().getFullYear();

  // — No editor flash: from the first frame, a visit that opens in the setup shows only the setup —
  await t.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const t0 = performance.now(); let leaks = 0;
    const tick = () => { const bar = document.querySelector('.bar'), fr = document.querySelector('.fr');
      if (bar && getComputedStyle(bar).visibility !== 'hidden' && bar.getBoundingClientRect().height > 0 && !(fr && +getComputedStyle(fr).opacity > 0.99)) leaks++;
      if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else window.__leaks = leaks; };
    requestAnimationFrame(tick); })();` });

  // — Age —
  await fresh();
  expect('no frame of the editor before the setup', (await t.ev('return window.__leaks')) === 0, await t.ev('return window.__leaks'));
  expect('a new athlete is asked their date of birth first', (await q()) === 'What’s your date of birth?', await q());
  expect('Continue waits for a whole date', await t.ev(`return document.querySelector('.fr-form .btn-go').disabled`), 'enabled');
  await dob(2, 30, 2001); await t.clickSel('.fr-form .btn-go'); await t.sleep(400);
  expect('a date that doesn’t exist is caught', (await t.ev(`return document.querySelector('.fr-error').textContent`)).startsWith('That doesn’t look like a real date'), 'no error');
  await dob(5, 3, thisYear - 15); await t.clickSel('.fr-form .btn-go'); await t.sleep(600);
  expect('13–17: the product’s message', (await q()) === 'Athlesite accounts for athletes under 18 aren’t available yet.', await q());
  expect('…with no second attempt and no date left on the page', await t.ev(`return !document.querySelector('input[name=y]') && !document.querySelector('.fr-blocked button') && document.querySelector('.fr-blocked a').textContent === 'Back to Athlesite'`), 'retry or date');
  await t.shot('blocked-minor-' + W);
  await fresh();
  await dob(5, 3, thisYear - 10); await t.clickSel('.fr-form .btn-go'); await t.sleep(600);
  expect('under 13: its own message', (await q()) === 'Athlesite isn’t available for athletes under 13.', await q());

  // — Email, code + terms —
  await fresh();
  await dob(6, 15, 1998); await t.clickSel('.fr-form .btn-go'); await t.sleep(700);
  expect('then the email', (await q()) === 'What’s your email?', await q());
  await set('input[name=email]', 'not-an-email'); await t.clickSel('.fr-form .btn-go'); await t.sleep(300);
  expect('a bad email is caught', !(await t.ev(`return document.querySelector('.fr-error').hidden`)), 'no error');
  await set('input[name=email]', 'riley.morgan@example.com'); await t.clickSel('.fr-form .btn-go'); await t.sleep(1100);
  expect('then the code, sent to a masked address', (await t.ev(`return document.querySelector('.fr-sub').textContent`)).startsWith('Sent to r…n@example.com.'), await t.ev(`return document.querySelector('.fr-sub').textContent`));
  await set('input[name=code]', '20481937');
  expect('Verify waits for the terms', await t.ev(`return document.querySelector('.fr-form .btn-go').disabled`), 'enabled');
  await t.ev(`const c = document.querySelector('input[name=terms]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); return 1`);
  await t.shot('code-' + W);
  await t.clickSel('.fr-form .btn-go'); await t.sleep(1200);
  expect('then the setup’s first question', (await q()) === 'Where do you play?', await q());
  expect('nothing was saved yet', await t.ev(`return localStorage.getItem('athlesite-studio-v1') === null`), 'saved');

  // — Visitor view and Publish, on a full example page —
  await t.ev(`localStorage.clear(); setTimeout(() => location.href = location.pathname + '?ex=aaliyah-grant', 30); return 1`); await t.sleep(3500);
  await t.ev(`document.querySelector('[data-v=visitor]').click(); return 1`); await t.sleep(2200);
  const vis = await t.ev(`const f = document.querySelector('#canvas iframe.is-front') || document.querySelector('#canvas iframe'); const d = f.contentDocument; return { stats: !!d.querySelector('[data-section=stats]'), contact: !!d.querySelector('.nav-cta'), hero: !!d.querySelector('[data-section=hero]') }`);
  expect('visitor view: only what a published page shows', vis.hero && !vis.stats && !vis.contact, vis);
  await t.ev(`document.querySelector('[data-v=edit]').click(); return 1`); await t.sleep(800);
  await t.clickSel('#publish-btn'); await t.sleep(700);
  const slug = (v) => t.ev(`const i = document.querySelector('#pub-slug'); i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event('input', { bubbles: true })); return { v: i.value, msg: document.querySelector('.pub-check').textContent, go: !document.querySelector('.pub-go').disabled }`);
  const taken = await slug('aaliyahgrant');
  expect('a taken name is refused, with another to try', !taken.go && taken.msg.startsWith('That one’s taken. Try aaliyahgrant-2'), taken);
  const reserved = await slug('pricing');
  expect('a reserved name is refused', !reserved.go && reserved.msg.startsWith('That name is reserved'), reserved);
  const bad = await slug('9lives');
  expect('a name must start with a letter', !bad.go, bad);
  const typed = await slug('Aaliyah Grant 11!');
  expect('typing is cleaned to a link name', typed.v === 'aaliyah-grant-11' && typed.go, typed);
  expect('private things are named as private', /Private for now/.test(await t.ev(`return document.querySelector('.pub-card').textContent`)), 'missing');
  await t.shot('publish-' + W);
  await t.clickSel('.pub-go'); await t.sleep(600);
  const live = await t.ev(`return { title: document.querySelector('#pub-title').textContent, url: document.querySelector('.pub-url').textContent, bar: document.querySelector('#publish-btn').textContent, slug: Athlesite.studio.store.get().data.slug }`);
  expect('publishing goes live at the chosen link', live.title === 'Your page is live' && live.url === 'athlesite.com/aaliyah-grant-11' && live.bar === 'Published' && live.slug === 'aaliyah-grant-11', live);
  await t.shot('live-' + W);
  // After publishing, edits stay private until "Publish changes"; only what visitors see counts.
  await t.clickSel('.pub-done'); await t.sleep(400);
  const bar = () => t.ev(`const b = document.querySelector('#publish-btn'); return b.getAttribute('aria-label') || b.textContent`); // its accessible name
  await t.ev(`Athlesite.studio.store.commit((p) => { p.data.stats = [...p.data.stats, { label: 'Steals', value: '2.1' }]; }, { kind: 'content' }); return 1`); await t.sleep(300);
  expect('a private edit (stats) leaves the page published as is', (await bar()) === 'Published', await bar());
  await t.ev(`Athlesite.studio.store.commit((p) => { p.data.bio = 'New bio for the test.'; }, { kind: 'content' }); return 1`); await t.sleep(300);
  expect('a public edit (bio) waits for “Publish changes”', (await bar()) === 'Publish changes', await bar());
  await t.clickSel('#publish-btn'); await t.sleep(600);
  expect('…which explains the changes are private until published', (await t.ev(`return document.querySelector('#pub-title').textContent`)) === 'Publish your changes?', await t.ev(`return document.querySelector('#pub-title').textContent`));
  await t.shot('changes-' + W);
  await t.clickSel('.pub-go'); await t.sleep(500);
  expect('publishing the changes brings it up to date', (await bar()) === 'Published' && (await t.ev(`return document.querySelector('#pub-title').textContent`)) === 'Your changes are live', await bar());
  expect('the editor marks the six private sections', (await t.ev(`return document.querySelectorAll('.sec-row .sec-lock').length`)) === 6, await t.ev(`return document.querySelectorAll('.sec-row .sec-lock').length`));
  await t.clickSel('.pub-unpub'); await t.sleep(500);
  expect('unpublish takes it back', (await t.ev(`return document.querySelector('#publish-btn').textContent`)) === 'Publish' && !(await t.ev(`return document.querySelector('dialog.pub').open`)), 'still live');
  expect('no sideways scroll', !(await t.ev('return document.documentElement.scrollWidth > innerWidth')), 'scrolls');
  t.log('PROBLEMS ' + (P.length ? P.join('; ') : 'none'));
};
