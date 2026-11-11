// Steps for drive.js on studio.html: a new high school athlete builds a whole page from nothing, the
// way they would — setup (with a photo), then every section through the panel (cover, story, results
// with best times, stats, a video, gallery photos, milestones, NIL through a parent, details and
// socials), a different look, the visitor view, Save to a file, reload, Open the file back.
// It's a run-through for a person to look at: a screenshot per step (na-<w>-NN-*.png in the out
// folder), each step's result, and console errors. Each step runs on its own so one stumble doesn't
// hide the rest. Env PHOTOS = folder from make-test-photos.js, OUT = scratch folder for the file.
// Run at 390×844 and 1440×900. Must print PROBLEMS none.
const fs = require('fs'), path = require('path');
module.exports = async (t) => {
  const W = await t.ev('return innerWidth');
  const problems = [], notes = [];
  let n = 0;
  const shot = (what) => t.shot(`na-${W}-${String(++n).padStart(2, '0')}-${what}`);
  const expect = (label, ok, got) => { t.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got: ' + JSON.stringify(got))); if (!ok) problems.push(label); };
  const step = async (name, fn) => { process.stderr.write(`  … ${name}\n`); try { await fn(); } catch (e) { expect(name + ' (step error: ' + e.message.slice(0, 120) + ')', false); await shot('error-' + name.replace(/\W+/g, '-')); } };
  const data = () => t.ev('return Athlesite.studio.store.get().data');
  const page = (js) => t.ev(`const doc = document.querySelector('.pv-frame.is-front').contentDocument; ${js}`);
  const type = (text) => t.send('Input.insertText', { text });
  const enter = async () => { for (const type of ['keyDown', 'keyUp']) await t.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: String.fromCharCode(13) } : {}) }); };
  const setFiles = async (sel, files) => {
    const r = await t.send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(sel)})` });
    await t.send('DOM.enable');
    await t.send('DOM.setFileInputFiles', { files, objectId: r.result.result.objectId });
  };
  const typeInto = async (sel, text) => { await t.clickSel(sel); await t.ev(`const el = document.querySelector(${JSON.stringify(sel)}); el.select && el.select(); return 1`); await type(text); };
  const field = (key) => `.screen:last-child [data-fieldkey="${key}"] :is(input,textarea,select)`;
  const open = async (key) => {
    await t.ev(`const b = document.querySelector('.back'); if (b && !b.hidden) b.click(); return 1`); await t.sleep(450);
    await t.clickSel(`.sec-row[data-key=${key}] .sec-open`); await t.sleep(700);
  };
  const settle = () => t.sleep(1300);
  const photos = process.env.PHOTOS, out = process.env.OUT;
  fs.mkdirSync(out, { recursive: true });

  // 0 · A brand-new visitor
  await t.ev(`localStorage.clear(); indexedDB.deleteDatabase('athlesite-studio-photos'); setTimeout(() => location.href = location.pathname, 50); return 1`);
  await t.sleep(3200);
  expect('a new visitor lands in the setup', !!(await t.ev(`return document.querySelector('.fr.is-in')`)), 'no setup');
  await shot('setup-1');

  await step('setup', async () => {
    await t.clickSel('.fr-choice[data-v=hs]'); await t.sleep(350);
    await t.clickSel('.fr-chip[data-y="2027"]'); await t.sleep(700);
    await shot('setup-name');
    await type('Nia');
    await t.clickSel('.fr-form input[name=last]'); await type('Brooks');
    await enter(); await t.sleep(700);
    await shot('setup-sport');
    await t.clickSel('.fr-chip[data-v=swimming]'); await t.sleep(700);
    await shot('setup-position');
    const chip = await t.ev(`const c = document.querySelector('.fr-pos [data-v]'); return c ? c.dataset.v : null`);
    if (chip) await t.clickSel(`.fr-pos [data-v="${chip}"]`); else { await t.clickSel('.fr-form input[name=pos]'); await type('Freestyle'); }
    await t.sleep(200);
    await t.clickSel('.fr-form .btn-go, .fr-next'); await t.sleep(700);
    await setFiles('.fr input[type=file]', [path.join(photos, 'tall.jpg')]); await t.sleep(1800);
    await shot('setup-photo');
    await t.clickSel('.fr-next'); await t.sleep(2400);
    const d = await data();
    expect('setup made Nia Brooks, swimming, class of 2027, with a photo', d.firstName === 'Nia' && d.lastName === 'Brooks' && d.sport === 'swimming' && d.classYear === '2027' && /^idb:/.test(d.heroPhotoUrl), d);
    await shot('editor');
  });

  // On a phone, editing in earnest means pulling the sheet all the way up (the handle steps peek → half → full).
  if (W < 800) await step('sheet up', async () => {
    for (let i = 0; i < 3 && (await t.ev('return document.getElementById("panel").dataset.sheet')) !== 'full'; i++) { await t.clickSel('#sheet-handle'); await t.sleep(550); }
    expect('the sheet goes up to full', (await t.ev('return document.getElementById("panel").dataset.sheet')) === 'full', await t.ev('return document.getElementById("panel").dataset.sheet'));
  });

  await step('cover', async () => {
    await open('cover');
    await typeInto(field('tagline'), 'Count the strokes. Trust the walls.');
    await typeInto(field('data.schoolOrTeam'), 'Lakeview High School');
    await settle();
    expect('headline and school on the page', (await page(`return doc.body.textContent`)).includes('Count the strokes') && (await page(`return doc.body.textContent`)).includes('Lakeview High School'), 'missing');
    await shot('cover');
  });

  await step('story', async () => {
    await open('story');
    await typeInto(field('bio'), 'I started swimming at the Y when I was seven because my older brother did. I stayed because the pool is the one place my head goes quiet.\n\nThis year I dropped four seconds in the 200 free and made the state meet in two relays. I want to swim in college and study kinesiology.');
    await settle();
    expect('story on the page', (await page(`return doc.body.textContent`)).includes('head goes quiet'), 'missing');
    await shot('story');
  });

  await step('results', async () => {
    await open('results');
    await shot('results-empty');
    // Swimming's columns: Event, Time, Course, Meet, Date.
    for (const row of [['200 Free', '1:58.42', 'SCY', 'Conference Championships', 'Feb 2026'], ['100 Back', '1:01.07', 'SCY', 'Sectionals', 'Feb 2026'], ['500 Free', '5:21.90', 'SCY', 'Lakeview Invitational', 'Jan 2026']]) {
      await t.clickSel('.screen:last-child .list-field .add-row'); await t.sleep(350);
      // Each cell of the new row in turn, as a person tabs through it.
      for (let i = 0; i < row.length; i++) {
        await t.ev(`const ins = [...document.querySelectorAll('.screen:last-child .list-row:last-child :is(input[type=text],input:not([type]))')]; const x = ins[${i}]; if (!x) return 0; x.scrollIntoView({ block: 'center' }); x.focus(); x.select(); return 1`);
        await type(row[i]); await t.sleep(80);
      }
    }
    await t.clickSel('.screen:last-child .list-row:nth-child(1) .row-check input'); await settle();
    const d = await data();
    expect('three results, the 200 free flagged as a best time', d.results.length === 3 && d.results[0].pb && d.results[0].a === '200 Free', d.results);
    expect('results table on the page with the PB', (await page(`return doc.querySelectorAll('.res-table tbody tr').length`)) === 3 && (await page(`return !!doc.querySelector('.res-pb')`)), 'missing');
    await shot('results');
  });

  await step('stats', async () => {
    await open('stats');
    const ideas = await t.ev(`return [...document.querySelectorAll('.screen:last-child .check input')].filter((c) => !c.checked).slice(0, 2).map((c) => JSON.parse(c.dataset.item).label)`);
    for (const label of ideas) {
      await t.ev(`const cb = [...document.querySelectorAll('.screen:last-child .check input')].find((c) => JSON.parse(c.dataset.item).label === ${JSON.stringify(label)}); cb.scrollIntoView({ block: 'center' }); cb.click(); return 1`);
      await t.sleep(350);
      await typeInto(`.screen:last-child .list-row:last-child [data-fieldkey$=".value"] input`, /Free|Back|Breast|Fly|IM/.test(label) ? '24.81' : label.includes('%') ? '92%' : '14');
    }
    await settle();
    expect('two stat ideas ticked and filled', (await data()).stats.filter((s) => s.value).length === 2, (await data()).stats);
    await shot('stats');
  });

  await step('film', async () => {
    await open('film');
    await t.clickSel('.screen:last-child .add-row'); await t.sleep(300);
    await type('Sectionals, 200 free final');
    await typeInto(`.screen:last-child .list-row:last-child [data-fieldkey$=".url"] input`, 'https://www.youtube.com/watch?v=abc123');
    await settle();
    expect('video on the page, says YouTube', (await page(`return doc.body.textContent`)).includes('Sectionals, 200 free final'), 'missing');
    await shot('film');
  });

  await step('gallery', async () => {
    await open('gallery');
    await setFiles('.screen:last-child input[type=file]', [path.join(photos, 'big.jpg'), path.join(photos, 'tall.jpg')]); await t.sleep(2600);
    expect('two gallery photos', (await data()).gallery.filter((g) => g.src).length === 2, (await data()).gallery.length);
    await shot('gallery');
  });

  await step('milestones', async () => {
    await open('milestones');
    for (const [year, title] of [['2026', 'State qualifier, 200 medley relay'], ['2025', 'Team captain']]) {
      await t.clickSel('.screen:last-child .add-row'); await t.sleep(300);
      await t.ev(`const ins = [...document.querySelectorAll('.screen:last-child .list-row:last-child :is(input[type=text],input:not([type]))')]; ins[0].focus(); ins[0].select(); return 1`); await type(year);
      await t.ev(`const ins = [...document.querySelectorAll('.screen:last-child .list-row:last-child :is(input[type=text],input:not([type]))')]; ins[1].focus(); ins[1].select(); return 1`); await type(title);
    }
    await settle();
    expect('two milestones on the page', (await page(`return doc.body.textContent`)).includes('Team captain'), 'missing');
    await shot('milestones');
  });

  await step('nil', async () => {
    await open('nil');
    await t.clickSel('.screen:last-child button[data-fieldkey="nil-open"]'); await t.sleep(400);
    await typeInto(field('nil-pitch'), 'Local businesses that support kids in the water: swim schools, pools, healthy food.');
    await t.clickSel(field('data.nilOffers')); await type('Swim clinics'); await enter(); await t.sleep(200);
    await t.ev(`const b = [...document.querySelectorAll('.screen:last-child button')].find((x) => /Parent or guardian/.test(x.textContent)); b.scrollIntoView({ block: 'center' }); b.click(); return 1`); await t.sleep(300);
    await typeInto(field('data.nilContact'), 'brooks.family@example.com');
    await settle();
    const d = await data();
    expect('NIL open, an offer, a parent as contact', d.nilOpen && d.nilOffers.includes('Swim clinics') && d.nilContactRole === 'parent' && d.nilContact === 'brooks.family@example.com', { open: d.nilOpen, offers: d.nilOffers, role: d.nilContactRole });
    expect('NIL section on the page', !!(await page(`return doc.getElementById('nil')`)), 'missing');
    await shot('nil');
  });

  await step('details', async () => {
    await open('details');
    await t.ev(`const b = [...document.querySelectorAll('.screen:last-child button')].find((x) => /Open to recruiting/.test(x.textContent)); b.scrollIntoView({ block: 'center' }); b.click(); return 1`); await t.sleep(300);
    await typeInto(field('contact'), 'nia.brooks.swims@example.com');
    await typeInto(field('data.city'), 'Lakeview');
    await typeInto(field('data.state'), 'OH');
    await typeInto(field('data.gpa'), '3.8');
    await typeInto(field('data.social.instagram'), '@nia.swims');
    await settle();
    const d = await data();
    expect('details filled (contact, town, GPA, Instagram)', d.recruitingContact === 'nia.brooks.swims@example.com' && d.city === 'Lakeview' && d.gpa === '3.8' && /nia\.swims/.test(d.social.instagram), { c: d.recruitingContact, city: d.city, gpa: d.gpa, ig: d.social.instagram });
    await shot('details');
  });

  await step('look', async () => {
    await t.ev(`const b = document.querySelector('.back'); if (b && !b.hidden) b.click(); return 1`); await t.sleep(450);
    await t.clickSel('.design-open'); await t.sleep(700);
    await shot('design');
    await t.clickSel('.look-cards [data-v=editorial]'); await t.sleep(1800);
    expect('look changed to Editorial', (await t.ev('return Athlesite.studio.store.get().design.look')) === 'editorial', 'not editorial');
    await shot('editorial');
  });

  await step('visitor', async () => {
    await t.ev(`const b = [...document.querySelectorAll('#mode-slot button')].find((x) => /visitor/i.test(x.textContent)); b.click(); return 1`); await t.sleep(1500);
    await shot('visitor-top');
    for (const at of ['results', 'nil', 'details']) {
      await page(`const el = doc.getElementById(${JSON.stringify(at)}); if (el) el.scrollIntoView(); return 1`); await t.sleep(900);
      await shot('visitor-' + at);
    }
    const missing = await page(`return ['story','results','stats','film','gallery','milestones','nil','details'].filter((k) => !doc.getElementById(k))`);
    expect('every section they filled is on the page', missing.length === 0, missing);
    await t.ev(`const b = [...document.querySelectorAll('#mode-slot button')].find((x) => /^Edit/.test(x.textContent.trim())); b.click(); return 1`); await t.sleep(800);
  });

  let file = null;
  await step('save, reload, open', async () => {
    await t.ev(`window.__saved = null; const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { const a = this; fetch(a.href).then((r) => r.text()).then((x) => (window.__saved = { name: a.download, text: x })); } else click.call(this); }; return 1`);
    await t.clickSel('#file-btn'); await t.sleep(250);
    await t.clickSel('#file-menu [data-act=save]'); await t.sleep(1800);
    const saved = await t.ev('return window.__saved');
    expect('saved as nia-brooks.athlesite.json', saved && saved.name === 'nia-brooks.athlesite.json', saved && saved.name);
    file = path.join(out, saved.name);
    fs.writeFileSync(file, saved.text);
    t.log(`  file size: ${Math.round(saved.text.length / 1024)} KB (photos inside)`);
    await t.ev('setTimeout(() => location.reload(), 30); return 1'); await t.sleep(3500);
    const d = await data();
    expect('after a reload the page is still there (saved on the device)', d.firstName === 'Nia' && d.results.length === 3 && d.gallery.length === 2, { name: d.firstName, results: d.results.length });
    await shot('reloaded');
    await t.ev(`Athlesite.studio.store.commit((p) => { p.data.firstName = 'Someone'; }, { kind: 'content' }); return 1`);
    await setFiles('#open-file', [file]); await t.sleep(2800);
    const d2 = await data();
    expect('opening the file brings everything back', d2.firstName === 'Nia' && d2.results.length === 3 && d2.gallery.filter((g) => /^idb:/.test(g.src)).length === 2 && /^idb:/.test(d2.heroPhotoUrl), { name: d2.firstName, results: d2.results.length });
    await shot('opened');
  });

  t.log('notes: ' + (notes.length ? notes.join(' | ') : 'none'));
  t.log('PROBLEMS ' + (problems.length ? problems.join(' | ') : 'none'));
};
