// Steps for drive.js: the screenshots behind homepage Section 03 ("From athlete to Athlesite"), taken
// from the real Studio and the real athlete page on a phone, so the homepage shows the real thing.
// Jordan Bell (the homepage's athlete) goes through the real setup, then his real example page in the
// editor, the visibility and publish controls, and his page as a visitor opens the link.
// Writes WebP files + how.js (the frame list and where each tap lands, which the homepage loads) into OUT
// (default ../homepage-v2/assets/img/how).
// Run at the phone size, 1.5× pixels (sharp enough for the homepage phone at 2×, light to load):
//   DPR=1.5 node tools/drive.js tools/how-shots.js file:///…/studio-v1/studio.html <scratch> 390 844
// Re-run whenever the Studio or the athlete page changes.
const fs = require('fs'), path = require('path');
module.exports = async (t) => {
  const OUT = process.env.OUT || path.resolve(__dirname, '../../homepage-v2/assets/img/how');
  const STUDIO = path.resolve(__dirname, '..');
  fs.mkdirSync(OUT, { recursive: true });
  const frames = [];
  const problems = [];
  const shot = async (name, tap) => {
    await t.sleep(80);
    const s = await t.send('Page.captureScreenshot', { format: 'webp', quality: 86 });
    fs.writeFileSync(path.join(OUT, name + '.webp'), Buffer.from(s.result.data, 'base64'));
    // tap: where the next tap lands (CSS px of the 390×844 screen), so the homepage can show it.
    let at = null;
    if (tap) {
      at = await t.ev(`const e = document.querySelector(${JSON.stringify(tap)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: +(100 * (r.left + r.width / 2) / innerWidth).toFixed(2), y: +(100 * (r.top + r.height / 2) / innerHeight).toFixed(2) }`);
      if (!at) problems.push('no tap target ' + tap + ' on ' + name);
    }
    frames.push({ name, tap: at });
    t.log('shot ' + name + (at ? ` tap ${at.x}%,${at.y}%` : ''));
  };
  const type = (text) => t.send('Input.insertText', { text });
  const setFiles = async (sel, files) => {
    const r = await t.send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(sel)})` });
    await t.send('DOM.enable');
    await t.send('DOM.setFileInputFiles', { files, objectId: r.result.result.objectId });
  };
  // Scroll the tools sheet so an element sits near its top: the sheet scrolls inside .screen, so a plain
  // scrollIntoView can leave it below the phone's edge (the "Styles from real pages" strip pushed the looks down).
  const toView = (sel) => t.ev(`const s = document.querySelector('.screen'), c = document.querySelector(${JSON.stringify(sel)}); if (!s || !c) return 0; s.scrollTop += c.getBoundingClientRect().top - s.getBoundingClientRect().top - 56; return 1`);
  // No blinking caret or focus ring frozen mid-blink in a still picture, and no prototype-only notes
  // (the Publish dialog's "Prototype: nothing goes online") in pictures of the product.
  const calm = () => t.ev(`if (!document.getElementById('how-calm')) document.head.insertAdjacentHTML('beforeend', '<style id="how-calm">*{caret-color:transparent!important}:focus-visible{outline:none!important}.pub-proto{display:none!important}</style>'); return 1`);

  // ———— 1 · Create: the real setup ————
  await t.ev(`localStorage.clear(); indexedDB.deleteDatabase('athlesite-studio-photos'); setTimeout(() => location.href = location.pathname + '?start=1&account=0', 50); return 1`);
  await t.sleep(3200);
  await calm();
  await t.clickSel('.fr-choice[data-v=hs]'); await t.sleep(700);
  await shot('create-1', '.fr-chip[data-y="2027"]');
  await t.clickSel('.fr-chip[data-y="2027"]'); await t.sleep(800);
  await calm();
  await type('Jordan'); await t.sleep(150);
  await shot('create-2');
  await t.clickSel('.fr-form input[name=last]');
  await type('Bell'); await t.sleep(150);
  await shot('create-3', '.fr-form .btn-go');
  await t.clickSel('.fr-form .btn-go'); await t.sleep(800);
  await shot('create-4', '.fr-chip[data-v=football]');
  await t.clickSel('.fr-chip[data-v=football]'); await t.sleep(800);
  await t.clickSel('.fr-pos [data-v="Wide receiver"]'); await t.sleep(200);
  await t.clickSel('.fr-form input[name=num]');
  await type('14'); await t.sleep(150);
  await shot('create-5', '.fr-form .btn-go');
  await t.clickSel('.fr-form .btn-go'); await t.sleep(800);
  await setFiles('.fr input[type=file]', [path.join(STUDIO, 'assets/img/jordan-bell.webp')]);
  await t.sleep(1800);
  await t.ev(`await document.querySelector('.fr-drop-shot img').decode().catch(() => {}); return 1`);
  await shot('create-6', '.fr-next');

  // ———— 2 · Personalize: his real example page in the editor ————
  await t.ev(`localStorage.clear(); setTimeout(() => location.href = location.pathname + '?ex=jordan-bell', 50); return 1`);
  await t.sleep(4200);
  await calm();
  const sheet = async (want) => { for (let i = 0; i < 4 && (await t.ev('return document.getElementById("panel").dataset.sheet')) !== want; i++) { await t.clickSel('#sheet-handle'); await t.sleep(600); } };
  // The page with the tools at half height, then Design.
  await sheet('half');
  await t.ev(`document.querySelector('.panel-hint')?.querySelector('[data-act=x]')?.click(); return 1`);
  await t.sleep(400);
  await shot('style-1', '.design-open');
  await t.clickSel('.design-open'); await t.sleep(1200);
  await toView('.look-cards'); await t.sleep(400);
  await shot('style-2', '.look-cards [data-v=editorial]');
  // Editorial, Highlight, then back to Cinematic (the look of his page everywhere else on the homepage),
  // with its colors in view.
  for (const [i, look, next] of [[3, 'editorial', 'highlight'], [4, 'highlight', 'cinematic']]) {
    await t.clickSel(`.look-cards [data-v=${look}]`); await t.sleep(1600);
    await toView('.look-cards'); await t.sleep(300);
    await shot('style-' + i, `.look-cards [data-v=${next}]`);
  }
  await t.clickSel('.look-cards [data-v=cinematic]'); await t.sleep(1600);
  await t.ev(`const s = document.querySelector('.screen'), c = document.querySelector('.swatch-list'); s.scrollTop += c.getBoundingClientRect().top - s.getBoundingClientRect().top - 56; return 1`);
  await t.sleep(500);
  await shot('style-5');

  // ———— 3 · Publish: what's public, then going live ————
  await t.ev(`localStorage.clear(); setTimeout(() => location.href = location.pathname + '?ex=jordan-bell', 50); return 1`);
  await t.sleep(4200);
  await calm();
  await sheet('half');
  await t.ev(`document.querySelector('.panel-hint')?.querySelector('[data-act=x]')?.click(); return 1`);
  // Scroll the sections list so the last ones (NIL, Details & contact) are in view.
  await t.ev(`const s = document.querySelector('.screen'); s.scrollTop = s.scrollHeight; return 1`);
  await t.sleep(500);
  await shot('live-1', '.sec-row[data-key=details] .eye');
  await t.clickSel('.sec-row[data-key=details] .eye'); await t.sleep(1400);
  await shot('live-2', '#publish-btn');
  // The Studio's real Publish (publish.js): choose the link, see what visitors get, publish. The prototype
  // counts every example's link as taken, his own included; this is his page, so his link is freed for the
  // picture (the product checks names against other athletes, not the page being published).
  await t.ev(`const ex = window.Athlesite.EXAMPLES['jordan-bell']; if (ex && ex.data) ex.data.slug = ''; return 1`);
  await t.clickSel('#publish-btn'); await t.sleep(900);
  await t.ev(`const i = document.querySelector('#pub-slug'); i.value = 'jordanbell'; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); return 1`);
  await t.sleep(600);
  if (await t.ev(`return document.querySelector('.pub-go').disabled`)) problems.push('Publish refused jordanbell: ' + await t.ev(`return document.querySelector('.pub-check').textContent`));
  await shot('live-3', '.pub-go');
  await t.clickSel('.pub-go'); await t.sleep(1000);
  await shot('live-4');

  // ———— 4 · Share: his link, opened on someone else's phone ————
  // The opening, held where his name fills the screen, then the settled page (the homepage scrolls it).
  const site = 'file:///' + path.join(STUDIO, 'site.html').split(path.sep).join('/') + '?ex=jordan-bell&embed=1';
  await t.send('Page.navigate', { url: site + '&introAt=p3' });
  // Wait until the held intro is really drawn (fonts in, name placed): a fixed wait caught a black frame.
  for (let i = 0; i < 40 && !(await t.ev(`return !!document.querySelector('.intro.is-p3') && document.fonts.status === 'loaded'`).catch(() => false)); i++) await t.sleep(200);
  await t.sleep(600);
  await shot('share-1');
  await t.send('Page.navigate', { url: site + '&static=1' });
  await t.sleep(2600);
  await t.ev(`document.querySelectorAll('img').forEach((i) => (i.loading = 'eager')); await Promise.race([Promise.all([...document.images].map((i) => i.decode().catch(() => {}))), new Promise((r) => setTimeout(r, 4000))]); return 1`);
  // The top of the page, about three screens tall, as one picture.
  const H = await t.ev(`return Math.min(document.documentElement.scrollHeight, innerHeight * 3.2)`);
  const s = await t.send('Page.captureScreenshot', { format: 'webp', quality: 82, captureBeyondViewport: true, clip: { x: 0, y: 0, width: 390, height: H, scale: 1 } });
  fs.writeFileSync(path.join(OUT, 'share-page.webp'), Buffer.from(s.result.data, 'base64'));
  frames.push({ name: 'share-page', tall: +(H / 844).toFixed(3) });
  t.log('shot share-page ' + H + 'px tall');

  const made = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(OUT, 'how.js'), `// Made by studio-v1/tools/how-shots.js on ${made}. Don't edit: re-run the tool.
window.ATHLESITE_HOW = ${JSON.stringify({ made, screen: [390, 844], frames })};
`);
  t.log('PROBLEMS ' + (problems.length ? problems.join('; ') : 'none'));
};
