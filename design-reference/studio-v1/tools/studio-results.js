// Steps for drive.js on studio.html: step 4, the results table, used like a person would.
// Ava (track): the table shows with "PR" on her best marks; flag another, add a result by typing,
// rename a column and the title, hide and show the section, undo. Jordan (football, no results in
// his sport): no results prompt on his page, but the section works if he adds one (general table).
// Phones (run at 390×844 too): rows fold into two lines. Must print PROBLEMS none.
module.exports = async (t) => {
  const problems = [];
  const expect = (label, ok, got) => { t.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got: ' + JSON.stringify(got))); if (!ok) problems.push(label); };
  const type = (text) => t.send('Input.insertText', { text });
  const page = (js) => t.ev(`const doc = document.querySelector('.pv-frame.is-front').contentDocument; ${js}`);
  const table = () => page(`const s = doc.getElementById('results'); if (!s) return null;
    return { title: s.querySelector('.sec-title').textContent.trim(), head: [...s.querySelectorAll('thead th')].map((x) => x.textContent.trim()),
      rows: [...s.querySelectorAll('tbody tr')].map((r) => r.querySelector('.res-ev').textContent.trim() + '|' + r.querySelector('.res-key').textContent.trim()),
      pb: s.querySelectorAll('.res-pb').length, metaShown: getComputedStyle(s.querySelector('.res-meta')).display !== 'none', moreShown: getComputedStyle(s.querySelector('td.res-more')).display !== 'none' }`);
  const settle = () => t.sleep(1100);
  const open = async (key) => { await t.ev(`const b = document.querySelector('.back'); if (b && !b.hidden) b.click(); return 1`); await t.sleep(450); await t.clickSel(`.sec-row[data-key=${key}] .sec-open`); await t.sleep(700); };
  const phone = await t.ev(`return innerWidth < 800`);
  if (phone) t.log('(phone: the panel is a bottom sheet)');

  await t.ev(`localStorage.clear(); setTimeout(() => location.href = location.pathname + '?a=ava', 30); return 1`);
  await t.sleep(3200);
  if (phone) await t.ev(`document.getElementById('panel').dataset.sheet = 'full'; return 1`);
  let tb = await table();
  expect('Ava’s results show on her page', tb && tb.rows.length === 5 && tb.pb === 2, tb);
  expect('the track columns', tb && tb.head.join(',') === 'Event,Mark,Meet,Date', tb && tb.head);
  expect('the list says how many', /5 results/.test(await t.ev(`return document.querySelector('.sec-row[data-key=results] .sec-status').textContent`)), await t.ev(`return document.querySelector('.sec-row[data-key=results] .sec-status').textContent`));
  if (phone) expect('phones fold rows into two lines', tb && tb.metaShown && !tb.moreShown, tb);
  else expect('desktop shows every column', tb && !tb.metaShown && tb.moreShown, tb);

  await open('results');
  await t.shot('results-editor');
  // Flag the third result as a best mark
  await t.clickSel('.screen:last-child .list-row:nth-child(3) .row-check input'); await settle();
  expect('a new best mark gets its badge', (await table()).pb === 3, (await table()).pb);
  // Add a result by typing
  await t.clickSel('.screen:last-child .list-field .add-row'); await t.sleep(300);
  await type('1600m');
  await t.clickSel('.screen:last-child .list-row:last-child input[id][maxlength="40"]'); // the Mark field
  await type('5:02.33');
  await settle();
  tb = await table();
  expect('a typed result shows', tb.rows.includes('1600m|5:02.33'), tb.rows);
  // Rename a column and the title
  await t.clickSel('.screen:last-child [data-fieldkey="results-col-1"] input');
  await type('Time');
  await t.clickSel('.screen:last-child [data-fieldkey="results-title"] input');
  await type('Season results');
  await settle();
  tb = await table();
  expect('renamed column shows', tb.head[1] === 'Time', tb.head);
  expect('their title shows', /Season results/.test(tb.title), tb.title);
  await t.shot('results-page');
  // Hide and show the section from the list
  await t.ev(`document.querySelector('.back').click(); return 1`); await t.sleep(500);
  await t.clickSel('.sec-row[data-key=results] .eye'); await settle();
  expect('hidden from the page', !(await table()), 'still there');
  await t.clickSel('.sec-row[data-key=results] .eye'); await settle();
  expect('shown again', !!(await table()), 'missing');
  // Undo walks it back
  for (let i = 0; i < 6; i++) await t.ev(`Athlesite.studio.store.undo(); return 1`);
  await settle();
  expect('undo brings the old title back', !/Season results/.test((await table()).title), (await table()).title);

  // Jordan: football has no results table, so no prompt on his page; the section still works
  await t.ev(`setTimeout(() => location.href = location.pathname + '?a=jordan', 30); return 1`);
  await t.sleep(3200);
  if (phone) await t.ev(`document.getElementById('panel').dataset.sheet = 'full'; return 1`);
  expect('no results prompt for football', !(await page(`return doc.querySelector('.studio-empty[data-section=results]')`)), 'prompt shown');
  expect('the section is in his list anyway', !!(await t.ev(`return document.querySelector('.sec-row[data-key=results]')`)), 'missing');
  await open('results');
  await t.clickSel('.screen:last-child .list-field .add-row'); await t.sleep(300);
  await type('Ohio 7-on-7 Showcase');
  await settle();
  tb = await table();
  expect('a general table appears when he adds one', tb && tb.head.join(',') === 'Event,Result,Place,Date' && tb.rows.length === 1, tb);
  expect('no best-mark box where the sport has no badge', !(await t.ev(`return document.querySelector('.screen:last-child .row-check')`)), 'box shown');
  t.log('PROBLEMS ' + (problems.length ? problems.join('; ') : 'none'));
};
