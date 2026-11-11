// Steps for drive.js on studio.html: focus points for gallery photos and video posters (polish).
// Opens the Jordan Bell example (2 gallery photos, a poster on the first video, the Reel), picks a
// gallery photo, taps a spot, drags, nudges with arrow keys; checks the page keeps that spot in frame,
// the list didn't rebuild under the drag, undo works; then the same for the poster in the Reel.
// Must print PROBLEMS none.
module.exports = async (t) => {
  const problems = [];
  const expect = (label, ok, got) => { t.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got: ' + JSON.stringify(got))); if (!ok) problems.push(label); };
  const page = (js) => t.ev(`const doc = document.querySelector('.pv-frame.is-front').contentDocument; ${js}`);
  const data = () => t.ev(`return Athlesite.studio.store.get().data`);
  const open = async (key) => { await t.ev(`const b = document.querySelector('.back'); if (b && !b.hidden) b.click(); return 1`); await t.sleep(450); await t.clickSel(`.sec-row[data-key=${key}] .sec-open`); await t.sleep(700); };
  const stageAt = (fx, fy) => t.ev(`const img = document.querySelector('.screen:last-child .focus-pick .photo-stage img'); img.scrollIntoView({ block: 'center' }); await img.decode().catch(() => {}); await new Promise((r) => setTimeout(r, 120)); const r = img.getBoundingClientRect(); return { x: r.left + r.width * ${fx}, y: r.top + r.height * ${fy} }`);

  await t.ev(`localStorage.clear(); setTimeout(() => location.href = location.pathname + '?ex=jordan-bell', 30); return 1`);
  await t.sleep(3400);
  if (await t.ev(`return innerWidth < 800`)) await t.ev(`document.getElementById('panel').dataset.sheet = 'full'; return 1`);

  // Gallery
  await open('gallery');
  expect('focus picker shows the gallery photos', (await t.ev(`return document.querySelectorAll('.screen:last-child .focus-thumbs button').length`)) === 2, await t.ev(`return document.querySelectorAll('.screen:last-child .focus-thumbs button').length`));
  await t.clickSel('.screen:last-child .focus-thumbs button[data-i="1"]'); await t.sleep(200);
  await t.ev(`window.__row = document.querySelector('.screen:last-child .list-row'); return 1`);
  const a = await stageAt(0.8, 0.3);
  await t.click(a.x, a.y); await t.sleep(200);
  const b = await stageAt(0.75, 0.25);
  await t.drag(a.x, a.y, b.x, b.y, 8); await t.sleep(200);
  await t.ev(`document.querySelector('.screen:last-child .focus-pick .photo-stage').focus(); return 1`);
  await t.key('ArrowRight'); await t.sleep(100);
  let d = await data();
  expect('the second photo got the focus point', Math.abs(d.gallery[1].x - 0.77) < 0.03 && Math.abs(d.gallery[1].y - 0.25) < 0.03, d.gallery[1]);
  expect('the first photo is untouched', d.gallery[0].x === undefined, d.gallery[0]);
  expect('the list didn’t rebuild under the drag', await t.ev(`return window.__row === document.querySelector('.screen:last-child .list-row')`), 'rebuilt');
  await t.sleep(900);
  const style = await page(`const imgs = [...doc.querySelectorAll('#gallery img')]; return imgs.map((i) => i.getAttribute('style') || '')`);
  expect('the page keeps that spot in frame', style.some((s) => /object-position:\s*7\d(\.\d)?% 2\d(\.\d)?%/.test(s)), style);
  await t.shot('focus-gallery');
  await t.ev(`Athlesite.studio.store.undo(); return 1`); await t.sleep(300);
  d = await data();
  expect('one undo step for the whole drag', d.gallery[1].x === undefined || Math.abs(d.gallery[1].x - 0.77) > 0.01, d.gallery[1]);
  await t.ev(`Athlesite.studio.store.redo(); return 1`);

  // Poster (first video), shown tall in the Reel
  await open('film');
  expect('poster focus lists the one video with a poster', (await t.ev(`return document.querySelectorAll('.screen:last-child .focus-thumbs button').length`)) === 1, 'other');
  const p = await stageAt(0.3, 0.6);
  await t.click(p.x, p.y); await t.sleep(1000);
  d = await data();
  expect('the poster got the focus point', Math.abs(d.highlightLinks[0].x - 0.3) < 0.03 && Math.abs(d.highlightLinks[0].y - 0.6) < 0.03, d.highlightLinks[0]);
  const ps = await page(`const s = doc.getElementById('film'); return [...s.querySelectorAll('img')].map((i) => i.getAttribute('style') || '')`);
  expect('the film shows the poster at that spot', ps.some((s) => /object-position:\s*30% 60%/.test(s)), ps);
  await t.shot('focus-poster');
  t.log('PROBLEMS ' + (problems.length ? problems.join('; ') : 'none'));
};
