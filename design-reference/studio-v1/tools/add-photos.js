// Adds photos to the homepage examples (the AI photos from PHOTO-PROMPTS.md, or any others).
//   node tools/add-photos.js <folder> [--dry]
// <folder> holds one folder per athlete, named like the example (e.g. incoming/aaliyah-grant/).
// In it, name each file after its place on the page (.jpg, .jpeg, .png or .webp):
//   cover      the cover photo
//   photo-N    gallery photo N (photo-2 replaces the second photo; a number past the end adds one)
//   film-N     the thumbnail of video N (only for videos the page already has)
// Each file is converted with Chrome's own encoder (headless Chrome; WebP quality .86; the cover at
// most 2000px on its long side, the rest 1600px) to assets/img/examples/<slug>-<name>.webp and put
// on the page in examples/<slug>.json: the cover with the focus point its cover layout needs, gallery
// photos with alt text (both from tools/photo-shots.js), video thumbnails. A replaced photo starts
// from the middle again (its old focus point is dropped). Then examples/examples.js is rebuilt, so
// cards.html, site.html?ex=, the Studio and the homepage all show the new photos.
// --dry lists what would happen and changes nothing. Env CHROME overrides Chrome's path.
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const { rebuild } = require('./add-example.js');
const { ATHLETES } = require('./photo-shots.js');

const ROOT = path.resolve(__dirname, '..');
const EX = path.join(ROOT, 'examples'), IMG = path.join(ROOT, 'assets', 'img', 'examples');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const SLOT = /^(cover|photo-([1-9]\d?)|film-([1-9]\d?))$/;
const MAX_COVER = 2000, MAX_OTHER = 1600, QUALITY = 0.86;
const SMALL_COVER = 1600, SMALL_OTHER = 1200; // below this on the long side it may look soft
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** What's in the folder: per athlete, the files by slot (and anything that can't be used). */
function scan(folder) {
  const jobs = [], notes = [];
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error('no folder ' + folder);
  for (const slug of fs.readdirSync(folder).sort()) {
    const dir = path.join(folder, slug);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (!fs.existsSync(path.join(EX, slug + '.json'))) { notes.push(`${slug}/: no example called "${slug}" (examples/${slug}.json); skipped`); continue; }
    const bySlot = new Map();
    for (const f of fs.readdirSync(dir).sort()) {
      const ext = path.extname(f).toLowerCase(), name = path.basename(f, path.extname(f)).toLowerCase();
      if (!TYPES[ext] || !SLOT.test(name)) { notes.push(`${slug}/${f}: not a cover / photo-N / film-N picture; ignored`); continue; }
      if (bySlot.has(name)) { notes.push(`${slug}/${f}: there's already a ${name} (${path.basename(bySlot.get(name).file)}); ignored`); continue; }
      bySlot.set(name, { file: path.join(dir, f), type: TYPES[ext] });
    }
    // Cover first, then gallery photos and videos in number order.
    const order = (s) => (s === 'cover' ? 0 : (s.startsWith('photo') ? 100 : 200) + +s.split('-')[1]);
    for (const slot of [...bySlot.keys()].sort((a, b) => order(a) - order(b))) jobs.push({ slug, slot, ...bySlot.get(slot) });
  }
  return { jobs, notes };
}

/** Headless Chrome with one blank page; convert(buffer, type, max) → { w0, h0, w, h, webp: Buffer }. */
async function chrome() {
  const port = 9500 + Math.floor(Math.random() * 400);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'athlesite-photos-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 80 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(250); } }
  if (!targets) { proc.kill(); throw new Error('Chrome did not start (' + CHROME + ')'); }
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const convert = async (buf, type, max) => {
    const r = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
      const blob = await (await fetch('data:${type};base64,${buf.toString('base64')}')).blob();
      const bmp = await createImageBitmap(blob);
      const k = Math.min(1, ${max} / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h);
      return { w0: bmp.width, h0: bmp.height, w, h, data: c.toDataURL('image/webp', ${QUALITY}) };
    })()` });
    const v = r.result && r.result.result && r.result.result.value;
    if (!v || !/^data:image\/webp;base64,/.test(v.data)) throw new Error((r.result && r.result.exceptionDetails && (r.result.exceptionDetails.exception || {}).description) || 'Chrome could not read this picture');
    return { w0: v.w0, h0: v.h0, w: v.w, h: v.h, webp: Buffer.from(v.data.split(',')[1], 'base64') };
  };
  const close = async () => {
    try {
      const b = new WebSocket(version.webSocketDebuggerUrl);
      await new Promise((r, j) => { b.addEventListener('open', r); b.addEventListener('error', j); });
      b.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
      await sleep(600);
    } catch { /* fall through to kill */ }
    ws.close(); proc.kill();
    for (let i = 0; i < 10; i++) { try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(300); } }
  };
  return { convert, close };
}

/** Puts one converted photo on the page (the example's data); returns a line for the summary. */
function place(d, slug, slot, rel, shot) {
  if (slot === 'cover') {
    const [x, y] = shot.focus || [0.5, 0.3];
    Object.assign(d, { heroPhotoUrl: rel, heroPhotoAlt: shot.alt || d.heroPhotoAlt || '', heroPhotoPositionX: x, heroPhotoPositionY: y, heroPhotoZoom: 1 });
    return `cover (focus ${Math.round(x * 100)}% ${Math.round(y * 100)}%)`;
  }
  const n = +slot.split('-')[1];
  if (slot.startsWith('photo')) {
    const old = d.gallery[n - 1];
    const item = { src: rel, alt: shot.alt || (old && old.alt) || '', caption: (old && old.caption) || '' };
    if (old) { d.gallery[n - 1] = item; return `gallery photo ${n} (replaced)`; }
    d.gallery.push(item);
    return `gallery photo ${d.gallery.length}${d.gallery.length !== n ? ` (added at the end; ${slot} asked for ${n})` : ' (added)'}`;
  }
  const video = d.highlightLinks[n - 1];
  if (!video) return null;
  video.poster = rel; delete video.x; delete video.y;
  return `thumbnail for video ${n} ("${video.label || 'untitled'}")`;
}

async function main() {
  const args = process.argv.slice(2), dry = args.includes('--dry');
  const folder = args.find((a) => !a.startsWith('--'));
  if (!folder) { console.log('usage: node tools/add-photos.js <folder> [--dry]   (one folder per athlete inside; see PHOTO-PROMPTS.md)'); process.exit(1); }
  const { jobs, notes } = scan(path.resolve(folder));
  notes.forEach((n) => console.log('  note: ' + n));
  if (!jobs.length) { console.log('No photos to add.'); return; }
  if (dry) { jobs.forEach((j) => console.log(`  would add ${j.slug}/${path.basename(j.file)} → ${j.slot}`)); return; }

  fs.mkdirSync(IMG, { recursive: true });
  const browser = await chrome();
  const pages = new Map(); // slug → profile, written once at the end
  const lines = new Map();
  let added = 0;
  try {
    for (const j of jobs) {
      if (!pages.has(j.slug)) {
        const profile = JSON.parse(fs.readFileSync(path.join(EX, j.slug + '.json'), 'utf8'));
        // Example files leave out empty lists (the page fills them in), so start them here.
        for (const k of ['gallery', 'highlightLinks']) if (!Array.isArray(profile.data[k])) profile.data[k] = [];
        pages.set(j.slug, profile);
      }
      const d = pages.get(j.slug).data;
      const shot = ((ATHLETES.find((a) => a.slug === j.slug) || { shots: [] }).shots.find((s) => s.file === j.slot)) || {};
      const say = (s) => lines.set(j.slug, (lines.get(j.slug) || []).concat(s));
      if (j.slot.startsWith('film') && !d.highlightLinks[+j.slot.split('-')[1] - 1]) { say(`${j.slot}: the page has no video ${j.slot.split('-')[1]}; skipped`); continue; }
      let out;
      try { out = await browser.convert(fs.readFileSync(j.file), j.type, j.slot === 'cover' ? MAX_COVER : MAX_OTHER); }
      catch (e) { say(`${j.slot}: couldn't read ${path.basename(j.file)} (${e.message}); skipped`); continue; }
      // A gallery photo past the end is added as the next one, and its file is named for that place.
      const n = +j.slot.split('-')[1];
      const name = `${j.slug}-${j.slot.startsWith('photo') && n > d.gallery.length ? `photo-${d.gallery.length + 1}` : j.slot}`;
      for (const f of fs.readdirSync(IMG)) if (path.basename(f, path.extname(f)) === name) fs.unlinkSync(path.join(IMG, f));
      fs.writeFileSync(path.join(IMG, name + '.webp'), out.webp);
      const where = place(d, j.slug, j.slot, `assets/img/examples/${name}.webp`, shot);
      const long = Math.max(out.w0, out.h0), small = long < (j.slot === 'cover' ? SMALL_COVER : SMALL_OTHER);
      say(`${j.slot}: ${out.w0}×${out.h0} → ${out.w}×${out.h}, ${Math.round(out.webp.length / 1024)} KB → ${where}${small ? `  ⚠ only ${long}px on its long side, may look soft` : ''}`);
      added++;
    }
  } finally { await browser.close(); }
  for (const [slug, profile] of pages) fs.writeFileSync(path.join(EX, slug + '.json'), JSON.stringify(profile, null, 2) + '\n');
  for (const [slug, l] of lines) console.log(`${slug}\n  ${l.join('\n  ')}`);
  console.log(`${added} photo${added === 1 ? '' : 's'} added to ${pages.size} example${pages.size === 1 ? '' : 's'}.`);
  rebuild();
  console.log('Check them: cards.html, site.html?ex=<athlete>, ../homepage-v2/index.html (Section 02).');
}

main().catch((e) => { console.error('add-photos: ' + e.message); process.exit(1); });
