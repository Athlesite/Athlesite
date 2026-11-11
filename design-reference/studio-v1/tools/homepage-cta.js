// Steps for drive.js on ../homepage-v2/index.html: the "Create your Athlesite" buttons and the claim
// form lead into the Studio setup. Nav button → setup; claim with a too-short name → a note, no move;
// claim "riley-morgan" ("jordanbell" is an example's name, so taken) → setup, and once the setup is done the new page keeps that link name.
// Run at 1440×900 and 390×844 (on phones the nav button is the only one in the bar). Must print PROBLEMS none.
const passAccount = require('./account-steps');
module.exports = async (t) => {
  const problems = [];
  const expect = (label, ok, got) => { t.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got: ' + JSON.stringify(got))); if (!ok) problems.push(label); };
  const home = await t.ev('return location.href');
  const back = async () => { await t.ev(`location.href = ${JSON.stringify(home)}; return 1`); await t.sleep(2200); };
  await t.sleep(800);

  // The buttons point at the setup (hero button and nav button).
  const hrefs = await t.ev(`return [...document.querySelectorAll('a.btn')].filter((a) => /Create your Athlesite/.test(a.textContent)).map((a) => a.getAttribute('href'))`);
  expect('every "Create your Athlesite" button goes to the Studio setup', hrefs.length >= 2 && hrefs.every((h) => h === '../studio-v1/studio.html?start=1'), hrefs);

  // Nav button, clicked like a person.
  await t.ev(`localStorage.clear(); return 1`);
  await t.clickSel('.nav a.btn');
  await t.sleep(3200);
  expect('nav button opens the Studio setup', await t.ev(`return /studio\\.html\\?start=1$/.test(location.href) && !!document.querySelector('.fr.is-in')`), await t.ev('return location.href'));

  // Claim form: too short stays put with a note.
  await back();
  await t.ev(`document.getElementById('claim').scrollIntoView(); return 1`);
  await t.sleep(600);
  await t.clickSel('#claimInput');
  await t.send('Input.insertText', { text: 'jb' });
  await t.clickSel('#claimForm button[type=submit]');
  await t.sleep(600);
  expect('a 2-letter link gets a note and stays on the homepage', await t.ev(`return /index\\.html/.test(location.href) && /3–30/.test(document.getElementById('claimNote').textContent)`), await t.ev(`return [location.href, document.getElementById('claimNote').textContent]`));

  // Claim a real name: into the setup, finish it, the page keeps the link name.
  await t.ev(`const i = document.getElementById('claimInput'); i.value = ''; i.dispatchEvent(new Event('input')); return 1`);
  await t.clickSel('#claimInput');
  await t.send('Input.insertText', { text: 'Riley Morgan!' });
  await t.clickSel('#claimForm button[type=submit]');
  await t.sleep(3200);
  expect('claiming opens the setup with the link name', await t.ev(`return /studio\\.html\\?start=1&slug=riley-morgan$/.test(location.href) && !!document.querySelector('.fr.is-in')`), await t.ev('return location.href'));
  await passAccount(t);
  await t.clickSel('.fr-choice[data-v=hs]'); await t.sleep(500);
  await t.clickSel('.fr-skip[data-y=""]'); await t.sleep(700);
  await t.send('Input.insertText', { text: 'Jordan' }); await t.sleep(150);
  await t.clickSel('.fr-form .btn-go'); await t.sleep(700);
  await t.clickSel('.fr-skip'); await t.sleep(700);
  await t.clickSel('.fr-skip'); await t.sleep(700);
  await t.clickSel('.fr-skip'); await t.sleep(2000);
  expect('the new page keeps the claimed link name', (await t.ev(`return Athlesite.studio.store.get().data.slug`)) === 'riley-morgan', await t.ev(`return Athlesite.studio.store.get().data.slug`));
  expect('…and it is saved with the page', /"slug":"riley-morgan"/.test(await t.ev(`return localStorage.getItem('athlesite-studio-v1') || ''`)), 'not saved');

  // A hand-made bad link name never reaches the page.
  await t.ev(`localStorage.clear(); location.href = location.pathname + '?start=1&slug=' + encodeURIComponent('<b>x</b>'); return 1`);
  await t.sleep(3000);
  await passAccount(t);
  await t.clickSel('.fr-choice[data-v=hs]'); await t.sleep(500);
  await t.clickSel('.fr-skip[data-y=""]'); await t.sleep(700);
  await t.send('Input.insertText', { text: 'Sam' }); await t.sleep(150);
  await t.clickSel('.fr-form .btn-go'); await t.sleep(700);
  for (let i = 0; i < 3; i++) { await t.clickSel('.fr-skip'); await t.sleep(700); }
  await t.sleep(1200);
  expect('a bad link name is cleaned ("bxb") or dropped', ['bxb', ''].includes(await t.ev(`return Athlesite.studio.store.get().data.slug`)), await t.ev(`return Athlesite.studio.store.get().data.slug`));
  t.log('PROBLEMS ' + (problems.length ? problems.join('; ') : 'none'));
};
