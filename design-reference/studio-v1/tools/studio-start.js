// Steps for drive.js on studio.html: step 3. A brand-new athlete goes through the first run (level +
// class, name, sport, position + number, cover photo; then into the editor in Cinematic), then the page is
// saved to a file, a new page is started and abandoned, the file is opened back (photos come back,
// one undo step), a broken file is refused, and ?start&from=<example> starts from that example's design.
// Env PHOTOS = folder with big.jpg (tools/make-test-photos.js), OUT = a scratch folder for files.
// Must print PROBLEMS none.
const fs = require('fs'), path = require('path');
module.exports = async (t) => {
  const problems = [];
  const expect = (label, ok, got) => { t.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got: ' + JSON.stringify(got))); if (!ok) problems.push(label); };
  const setFiles = async (sel, files) => {
    const r = await t.send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(sel)})` });
    await t.send('DOM.enable');
    await t.send('DOM.setFileInputFiles', { files, objectId: r.result.result.objectId });
  };
  const data = () => t.ev(`return Athlesite.studio.store.get().data`);
  const q = (sel) => t.ev(`const e = document.querySelector(${JSON.stringify(sel)}); return e ? (e.textContent || '').trim() : null`);
  const type = (text) => t.send('Input.insertText', { text });
  const enter = async () => { for (const type of ['keyDown', 'keyUp']) await t.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: String.fromCharCode(13) } : {}) }); };
  const out = process.env.OUT;
  fs.mkdirSync(out, { recursive: true });

  // A brand-new visitor: nothing saved, no photos.
  await t.ev(`localStorage.clear(); indexedDB.deleteDatabase('athlesite-studio-photos'); setTimeout(() => location.href = location.pathname, 50); return 1`);
  await t.sleep(3200);
  expect('first run opens when nothing is saved', !!(await t.ev(`return document.querySelector('.fr.is-in')`)), 'no first run');
  expect('no "Back to my page" for a new athlete', !(await t.ev(`return document.querySelector('.fr-cancel')`)), 'cancel shown');
  await t.shot('start-1');

  // 1 · Level + class
  await t.clickSel('.fr-choice[data-v=hs]'); await t.sleep(350);
  await t.shot('start-1b');
  await t.clickSel('.fr-chip[data-y="2028"]'); await t.sleep(700);
  // 2 · Name
  expect('name step focuses First name', await t.ev(`return document.activeElement && document.activeElement.name === 'first'`), 'focus elsewhere');
  expect('Continue waits for a first name', await t.ev(`return document.querySelector('.fr-form .btn-go').disabled`), 'enabled');
  await type('Riley');
  await t.clickSel('.fr-form input[name=last]');
  await type('Okonkwo-Brandt');
  await t.shot('start-2');
  await enter(); await t.sleep(700);
  // 3 · Sport (greets them by name)
  expect('sport question uses their name', /Riley/.test(await q('.fr-q')), await q('.fr-q'));
  expect('pickleball is offered', !!(await t.ev(`return document.querySelector('.fr-chip[data-v=pickleball]')`)), 'missing');
  await t.shot('start-3');
  await t.clickSel('.fr-chip[data-v=basketball]'); await t.sleep(700);
  // 4 · Position + number
  await t.clickSel('.fr-pos [data-v="Point guard"]'); await t.sleep(150);
  await t.clickSel('.fr-form input[name=num]');
  await type('3');
  await t.shot('start-4');
  await t.clickSel('.fr-form .btn-go'); await t.sleep(700);
  // 5 · Photo
  await setFiles('.fr input[type=file]', [path.join(process.env.PHOTOS, 'big.jpg')]);
  await t.sleep(1800);
  expect('photo shows in the first run', await t.ev(`const i = document.querySelector('.fr-drop-shot img'); await i.decode().catch(() => {}); return i.naturalWidth > 0`), 'no photo');
  expect('the photo step is the last of five', /Step 5 of 5/.test(await q('.fr-eyebrow')), await q('.fr-eyebrow'));
  await t.shot('start-5');
  await t.clickSel('.fr-next'); await t.sleep(2200); // Build my page
  // "Build my page": no look picker (Willy, session 4); "Create your own" starts in Cinematic
  expect('first run closes', !(await t.ev(`return document.querySelector('.fr')`)), 'still open');
  expect('starts in Cinematic', (await t.ev(`return Athlesite.studio.store.get().design.look`)) === 'cinematic', await t.ev(`return Athlesite.studio.store.get().design.look`));
  expect('page shows in the preview', /look-cinematic/.test(await t.ev(`return document.querySelector('.pv-frame.is-front').contentDocument.body.className`)), 'not cinematic');
  expect('a tip points at the other looks', /four more looks/.test((await q('.panel-hint')) || ''), await q('.panel-hint'));
  await t.shot('start-6');
  const d = await data();
  expect('profile has what they entered', d.firstName === 'Riley' && d.lastName === 'Okonkwo-Brandt' && d.sport === 'basketball' && d.position === 'Point guard' && d.jerseyNumber === '3' && d.classYear === '2028' && d.level === 'hs', d);
  expect('nothing from the catalog filled in', d.stats.length === 0 && d.highlightLinks.length === 0 && !d.bio, { stats: d.stats.length });
  expect('photo kept as a stored reference', /^idb:/.test(d.heroPhotoUrl), d.heroPhotoUrl);
  expect('a fresh page has no undo history', !(await t.ev(`return Athlesite.studio.store.canUndo()`)), 'can undo');
  await t.sleep(600);
  expect('saved on this device', /Riley/.test(await t.ev(`return localStorage.getItem('athlesite-studio-v1') || ''`)), 'not saved');
  await t.shot('start-7');

  // Save to a file (the download is caught and written to OUT)
  await t.ev(`window.__saved = null; const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { const a = this; fetch(a.href).then((r) => r.text()).then((x) => (window.__saved = { name: a.download, text: x })); } else click.call(this); }; return 1`);
  await t.clickSel('#file-btn'); await t.sleep(200);
  await t.shot('start-menu');
  await t.clickSel('#file-menu [data-act=save]'); await t.sleep(1500);
  const saved = await t.ev(`return window.__saved`);
  expect('save makes a file named after them', saved && saved.name === 'riley-okonkwo-brandt.athlesite.json', saved && saved.name);
  const file = saved ? JSON.parse(saved.text) : {};
  expect('the file is a page file with the photo inside it', file.athlesite === 'page' && file.version === 1 && /^data:image\/(webp|jpeg);base64,/.test(file.profile.data.heroPhotoUrl), file.profile && file.profile.data.heroPhotoUrl.slice(0, 30));
  expect('toast confirms the save', /Saved riley-okonkwo-brandt/.test(await q('#toast')), await q('#toast'));
  const fileOnDisk = path.join(out, saved.name);
  fs.writeFileSync(fileOnDisk, saved.text);

  // Start a new page, then change your mind
  await t.clickSel('#file-btn'); await t.sleep(200);
  await t.clickSel('#file-menu [data-act=new]'); await t.sleep(900);
  expect('start a new page opens the first run', !!(await t.ev(`return document.querySelector('.fr.is-in')`)), 'no first run');
  await t.clickSel('.fr-cancel'); await t.sleep(700);
  expect('back to my page keeps the page', (await data()).firstName === 'Riley' && !(await t.ev(`return document.querySelector('.fr')`)), 'changed');

  // Open the file over another page: replaces it as one undo step, photo comes back
  await t.ev(`const s = Athlesite.studio.store; s.commit((d) => { d.data.firstName = 'Someone'; d.data.heroPhotoUrl = ''; }, { kind: 'content' }); return 1`);
  await setFiles('#open-file', [fileOnDisk]);
  await t.sleep(2600);
  const d2 = await data();
  expect('opened page is back', d2.firstName === 'Riley' && d2.sport === 'basketball', d2.firstName);
  expect('its photo is stored on this device again', /^idb:/.test(d2.heroPhotoUrl), d2.heroPhotoUrl);
  expect('its photo shows on the page', await t.ev(`const doc = document.querySelector('.pv-frame.is-front').contentDocument; const i = doc.querySelector('.hero img'); if (!i) return false; await i.decode().catch(() => {}); return i.naturalWidth > 0`), 'no photo');
  expect('toast confirms the open', /Opened Riley Okonkwo-Brandt/.test(await q('#toast')), await q('#toast'));
  await t.ev(`Athlesite.studio.store.undo(); return 1`); await t.sleep(400);
  expect('undo brings the previous page back', (await data()).firstName === 'Someone', (await data()).firstName);
  await t.ev(`Athlesite.studio.store.redo(); return 1`); await t.sleep(400);

  // A broken file is refused with a friendly message
  const bad = path.join(out, 'broken.athlesite.json');
  fs.writeFileSync(bad, '{ not json');
  await setFiles('#open-file', [bad]);
  await t.sleep(900);
  expect('broken file refused, page untouched', (await data()).firstName === 'Riley' && /couldn’t be read/.test(await q('#toast')), await q('#toast'));
  const notPage = path.join(out, 'other.json');
  fs.writeFileSync(notPage, JSON.stringify({ hello: 'world' }));
  await setFiles('#open-file', [notPage]);
  await t.sleep(900);
  expect('a JSON file that isn’t a page is refused', /isn’t an Athlesite page/.test(await q('#toast')), await q('#toast'));

  // The homepage's "Start with this style": ?start&from=<example> with a page already saved. The new
  // page gets that example's whole design, never its words or photos. (A test athlete stands in for
  // an example here: Devon, Highlight.)
  await t.sleep(700);
  const devon = await t.ev(`return Athlesite.normalizeProfile(Athlesite.ATHLETES.devon).design`);
  await t.ev(`setTimeout(() => location.href = location.pathname + '?start=1&from=devon', 30); return 1`);
  await t.sleep(3000);
  expect('?start opens the first run over a saved page', !!(await t.ev(`return document.querySelector('.fr.is-in .fr-cancel')`)), 'no first run');
  await t.clickSel('.fr-choice[data-v=college]'); await t.sleep(300);
  await t.clickSel('.fr-chip[data-y=Junior]'); await t.sleep(700);
  await type('Sam');
  await enter(); await t.sleep(700);
  await t.clickSel('.fr-chip[data-v=pickleball]'); await t.sleep(700);
  expect('pickleball has no number field', !(await t.ev(`return document.querySelector('.fr-form input[name=num]')`)), 'number shown');
  await t.clickSel('.fr-skip'); await t.sleep(700);
  expect('replacing warns on the last step, with a save link', !!(await t.ev(`return document.querySelector('.fr-replace .fr-save')`)), 'no note');
  await t.shot('start-8');
  await t.clickSel('.fr-skip'); await t.sleep(2200); // Skip and build my page
  const d3 = await data(), g3 = await t.ev(`return Athlesite.studio.store.get().design`);
  expect('college athlete saved with their year', d3.level === 'college' && d3.academicYear === 'Junior' && d3.sport === 'pickleball' && d3.firstName === 'Sam', d3);
  expect('the example’s whole design carried over', ['look', 'palette', 'accent', 'type', 'photo', 'layout', 'order', 'intro'].every((k) => JSON.stringify(g3[k]) === JSON.stringify(devon[k])), { got: g3, want: devon });
  expect('none of the example’s words or photos came along', !d3.heroPhotoUrl && !d3.stats.length && !d3.bio && !d3.gallery.length && d3.lastName === '', d3);
  expect('the tip names the style it came from', /Devon Carter’s style \(Highlight\)/.test((await q('.panel-hint')) || ''), await q('.panel-hint'));
  expect('replacing a page is one undo step', await t.ev(`return Athlesite.studio.store.canUndo()`), 'no undo');
  await t.clickSel('.panel-hint .link-btn'); await t.sleep(700);
  expect('the tip opens Design and goes away', /Design/i.test(await q('.panel-title h2')) && !(await t.ev(`return document.querySelector('.panel-hint:not([hidden])')`)), await q('.panel-title h2'));
  t.log('PROBLEMS ' + (problems.length ? problems.join('; ') : 'none'));
};
