// Steps for drive.js on studio.html: step 2's content editors, used like a person would — typing,
// adding rows, ticking ideas, pasting links, undo, clicking the page to jump to a field. Each check
// reads the live preview. Must print PROBLEMS none. Screenshots: content-<section>.png.
module.exports = async (t) => {
  const problems = [];
  const expect = (label, ok, got) => { t.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got: ' + JSON.stringify(got))); if (!ok) problems.push(label); };
  const page = (js) => t.ev(`const doc = document.querySelector('.pv-frame.is-front').contentDocument; ${js}`);
  const settle = () => t.sleep(1300);
  const typeInto = async (sel, text, clear = true) => {
    await t.clickSel(sel);
    if (clear) await t.ev(`const el = document.querySelector(${JSON.stringify(sel)}); el.select && el.select(); return 1`);
    await t.send('Input.insertText', { text });
  };
  const open = async (key) => { await t.ev(`document.querySelector('.back:not([hidden])') && document.querySelector('.back').click(); return 1`); await t.sleep(450); await t.clickSel(`.sec-row[data-key=${key}] .sec-open`); await t.sleep(600); };
  const field = (key) => `.screen:last-child [data-fieldkey="${key}"] :is(input,textarea,select)`;

  await t.ev(`localStorage.clear(); location.href = location.pathname + '?a=jordan'`);
  await t.sleep(3200);

  // Cover: headline and name
  await open('cover');
  await t.shot('content-cover');
  await typeInto(field('tagline'), 'Every snap, every rep.');
  await settle();
  expect('headline reaches the page', (await page(`return doc.querySelector('.hero-tagline').textContent`)) === 'Every snap, every rep.', await page(`return doc.querySelector('.hero-tagline').textContent`));
  await typeInto(field('name'), 'Jayden');
  await settle();
  expect('first name reaches the page', /Jayden/.test(await page(`return doc.querySelector('.hero-name').textContent`)), await page(`return doc.querySelector('.hero-name').textContent`));
  // one undo step per typing burst: undo (with focus out of the field) restores Jordan
  await t.ev(`document.activeElement.blur(); return 1`);
  await t.key('z', 2, 'KeyZ');
  await settle();
  expect('undo brings the name back', /Jordan/.test(await page(`return doc.querySelector('.hero-name').textContent`)), await page(`return doc.querySelector('.hero-name').textContent`));

  // Film: add a video with a link
  await open('film');
  await t.clickSel('.screen:last-child .add-row');
  await t.sleep(300);
  await t.send('Input.insertText', { text: 'Playoff run' });
  const urlSel = `.screen:last-child .list-row:last-child [data-fieldkey$=".url"] input`;
  await typeInto(urlSel, 'https://www.youtube.com/watch?v=abc');
  await settle();
  expect('new video note says where it plays', /YouTube/.test(await t.ev(`return document.querySelector('.screen:last-child .list-row:last-child .row-note').textContent`)), await t.ev(`return document.querySelector('.screen:last-child .list-row:last-child .row-note').textContent`));
  expect('third video on the page', (await page(`return doc.querySelectorAll('.reel-slide, .film-list li').length`)) >= 3, await page(`return doc.querySelectorAll('.reel-slide, .film-list li').length`));
  await t.shot('content-film');

  // Stats: tick an idea, fill its number
  await open('stats');
  const idea = await t.ev(`const cb = [...document.querySelectorAll('.screen:last-child .check input')].find((c) => !c.checked); if (!cb) return null; cb.scrollIntoView({ block: 'center' }); return JSON.parse(cb.dataset.item).label`);
  await t.ev(`const cb = [...document.querySelectorAll('.screen:last-child .check input')].find((c) => !c.checked); cb.click(); return 1`);
  await t.sleep(400);
  const lastValue = `.screen:last-child .list-row:last-child [data-fieldkey$=".value"] input`;
  expect('ticked idea added a row', (await t.ev(`return document.querySelector('.screen:last-child .list-row:last-child input').value`)) === idea, await t.ev(`return document.querySelector('.screen:last-child .list-row:last-child input').value`));
  await typeInto(lastValue, '12');
  await settle();
  expect('new number on the page', (await page(`return doc.body.textContent`)).includes(idea), idea);
  await t.shot('content-stats');

  // Details: quick-add On3 and paste a profile link
  await open('details');
  await t.ev(`const b = [...document.querySelectorAll('.screen:last-child .chip-idea')].find((x) => /On3|247|Rivals|ESPN/.test(x.textContent)); b && b.click(); return !!b`);
  await t.sleep(400);
  const profileSel = `.screen:last-child [data-fieldkey="profiles"] .list-row:last-child input`;
  await typeInto(profileSel, 'https://www.on3.com/db/jordan-bell-99/');
  await settle();
  expect('profile link note names the site', /On3/.test(await t.ev(`return document.querySelector('.screen:last-child [data-fieldkey="profiles"] .list-row:last-child .row-note').textContent`)), await t.ev(`return document.querySelector('.screen:last-child [data-fieldkey="profiles"] .list-row:last-child .row-note').textContent`));
  await t.shot('content-details');

  // NIL off then on
  await open('nil');
  await t.clickSel('.screen:last-child [data-fieldkey="nil-open"]');
  await settle();
  expect('NIL off hides the section', !(await page(`return !!doc.getElementById('nil')`)), 'still there');
  await t.clickSel('.screen:last-child [data-fieldkey="nil-open"]');
  await settle();
  expect('NIL on shows it again', await page(`return !!doc.getElementById('nil')`), 'missing');
  await t.shot('content-nil');

  // Story word count
  await open('story');
  await t.shot('content-story');

  // Click the name on the page: Cover opens with the first name focused
  await t.ev(`document.querySelector('.back').click(); return 1`);
  await t.sleep(450);
  const r = await t.ev(`const f = document.querySelector('.pv-frame.is-front'), v = f.getBoundingClientRect(), s = v.width / f.contentWindow.innerWidth; f.contentWindow.scrollTo(0, 0); const n = f.contentDocument.querySelector('.hero-name').getBoundingClientRect(); return { x: v.left + (n.left + 40) * s, y: v.top + (n.top + n.height / 2) * s }`);
  await t.sleep(300);
  await t.click(r.x, r.y);
  await t.sleep(900);
  expect('clicking the name focuses First name', (await t.ev(`return document.activeElement && document.activeElement.closest('[data-fieldkey]') && document.activeElement.closest('[data-fieldkey]').dataset.fieldkey`)) === 'name', await t.ev(`return document.activeElement && document.activeElement.outerHTML.slice(0, 80)`));

  t.log('PROBLEMS ' + (problems.length ? problems.join('; ') : 'none'));
};
