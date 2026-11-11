// Steps for drive.js on studio.html: step 2's photos. Env PHOTOS = folder with big.jpg, small.jpg,
// tall.jpg (make them with tools/make-test-photos.js). Uploads a cover photo, sets its focus point
// and zoom, checks the small-photo warning, adds gallery photos and a video poster, then reloads and
// checks everything is still there (photos live in IndexedDB). Must print PROBLEMS none.
const path = require('path');
module.exports = async (t) => {
  const dir = process.env.PHOTOS, file = (n) => path.join(dir, n);
  const problems = [];
  const expect = (label, ok, got) => { t.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got: ' + JSON.stringify(got))); if (!ok) problems.push(label); };
  const page = (js) => t.ev(`const doc = document.querySelector('.pv-frame.is-front').contentDocument; ${js}`);
  const setFiles = async (sel, names) => {
    const r = await t.send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(sel)})` });
    await t.send('DOM.enable');
    await t.send('DOM.setFileInputFiles', { files: names.map(file), objectId: r.result.result.objectId });
  };
  const open = async (key) => { await t.ev(`const b = document.querySelector('.back'); if (b && !b.hidden) b.click(); return 1`); await t.sleep(450); await t.clickSel(`.sec-row[data-key=${key}] .sec-open`); await t.sleep(600); };
  const loaded = (sel) => page(`const imgs = [...doc.querySelectorAll(${JSON.stringify(sel)})]; await Promise.all(imgs.map((i) => i.decode().catch(() => {}))); return imgs.map((i) => ({ src: i.getAttribute('src').slice(0, 5), ok: i.naturalWidth > 0 }))`);

  await t.ev(`localStorage.clear(); location.href = location.pathname + '?a=maya'`);
  await t.sleep(3200);

  // Cover: upload a big photo
  await open('cover');
  await setFiles('.screen:last-child .photo-edit input[type=file]', ['big.jpg']);
  await t.sleep(1800);
  const hero = await loaded('.hero img, .hero-media img, .hero-photo img');
  expect('uploaded cover photo shows on the page', hero.length && hero[0].src === 'blob:' && hero[0].ok, hero);
  expect('no small-photo warning for a big photo', await t.ev(`return document.querySelector('.screen:last-child .photo-warn').hidden`), 'warning shown');
  const ref = await t.ev(`return Athlesite.studio.store.get().data.heroPhotoUrl`);
  expect('profile keeps a stored reference, not the image', /^idb:/.test(ref), ref);
  // Focus point: click near the right of the photo
  const st = await t.ev(`const r = document.querySelector('.screen:last-child .photo-stage img').getBoundingClientRect(); return { x: r.left + r.width * 0.8, y: r.top + r.height * 0.4 }`);
  await t.click(st.x, st.y);
  await t.sleep(900);
  const fx = await t.ev(`return Athlesite.studio.store.get().data.heroPhotoPositionX`);
  expect('tapping the photo moves the focus point', Math.abs(fx - 0.8) < 0.03, fx);
  expect('the page uses the new focus point', /80(\.\d+)?% /.test(await page(`return (doc.querySelector('.hero img').getAttribute('style') || '')`)), await page(`return doc.querySelector('.hero img').getAttribute('style')`));
  await t.ev(`const z = document.querySelector('.screen:last-child .zoom input'); z.value = 1.4; z.dispatchEvent(new Event('input', { bubbles: true })); return 1`);
  await t.sleep(900);
  expect('zoom reaches the page', /scale\(1\.4\)/.test(await page(`return doc.querySelector('.hero img').getAttribute('style')`)), await page(`return doc.querySelector('.hero img').getAttribute('style')`));
  await t.shot('photos-cover');
  // A small photo gets a gentle warning
  await setFiles('.screen:last-child .photo-edit input[type=file]', ['small.jpg']);
  await t.sleep(1600);
  expect('small photo gets a warning', /small/.test(await t.ev(`const w = document.querySelector('.screen:last-child .photo-warn'); return w.hidden ? '' : w.textContent`)), 'no warning');
  await setFiles('.screen:last-child .photo-edit input[type=file]', ['tall.jpg']);
  await t.sleep(1400);

  // Gallery: add three at once
  await open('gallery');
  const before = await t.ev(`return Athlesite.studio.store.get().data.gallery.length`);
  await setFiles('.screen:last-child .gallery-edit input[type=file]', ['big.jpg', 'small.jpg', 'tall.jpg']);
  await t.sleep(2200);
  const after = await t.ev(`return Athlesite.studio.store.get().data.gallery.length`);
  expect('three photos added to the gallery', after === before + 3, [before, after]);
  expect('their thumbnails show in the panel', (await t.ev(`const imgs = [...document.querySelectorAll('.screen:last-child .row-thumb img')]; await Promise.all(imgs.map((i) => i.decode().catch(() => {}))); return imgs.filter((i) => i.naturalWidth > 0).length`)) === after, 'thumbs missing');
  await page(`doc.getElementById('gallery') && doc.getElementById('gallery').scrollIntoView(); return 1`);
  await t.sleep(600);
  const gal = await loaded('#gallery img');
  expect('gallery photos load on the page', gal.length >= 3 && gal.every((g) => g.ok), gal);
  await t.shot('photos-gallery');

  // Film poster on the first video
  await open('film');
  await setFiles('.screen:last-child .list-row:first-child .poster-ctl input[type=file]', ['big.jpg']);
  await t.sleep(1500);
  expect('poster saved on the video', /^idb:/.test(await t.ev(`return Athlesite.studio.store.get().data.highlightLinks[0].poster || ''`)), 'no poster');
  await t.shot('photos-film');

  // Reload: everything comes back from this device
  await t.sleep(800);
  await t.ev(`setTimeout(() => { location.href = location.pathname; }, 30); return 1`); // no ?a=, so the saved page opens
  await t.sleep(3800);
  const hero2 = await loaded('.hero img, .hero-media img, .hero-photo img');
  expect('after reload the cover photo is back', hero2.length && hero2[0].ok && hero2[0].src === 'blob:', hero2);
  expect('after reload the gallery is intact', (await t.ev(`return Athlesite.studio.store.get().data.gallery.length`)) === after, 'lost photos');
  t.log('PROBLEMS ' + (problems.length ? problems.join('; ') : 'none'));
};
