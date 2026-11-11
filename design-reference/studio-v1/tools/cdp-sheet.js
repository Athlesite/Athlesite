// Build a contact sheet of site.html variants (iframes) and save one full-page screenshot.
// usage: node cdp-sheet.js <chrome> <profileDir> <out.png> <cols> <width> <height> <scale> <url1|label1> <url2|label2> ...
const { spawn } = require('child_process');
const fs = require('fs');
const [,, chrome, profile, out, colsArg, wArg, hArg, scaleArg, ...items] = process.argv;
const cols = +colsArg, W = +wArg, H = +hArg, scale = +scaleArg;
const port = 9334;
const tile = (u) => { const [url, label] = u.split('|'); return `<figure><div class="t"><iframe src="${url}" style="width:${W}px;height:${H}px;transform:scale(${scale})"></iframe></div><figcaption>${label || ''}</figcaption></figure>`; };
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:16px;background:#e9e6df;font:600 13px system-ui}main{display:grid;grid-template-columns:repeat(${cols},${Math.round(W * scale)}px);gap:16px 14px}figure{margin:0}.t{width:${Math.round(W * scale)}px;height:${Math.round(H * scale)}px;overflow:hidden;border-radius:6px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2)}iframe{border:0;transform-origin:top left}figcaption{padding:6px 2px}</style><main>${items.map(tile).join('')}</main>`;
const sheetFile = out.replace(/\.png$/, '.html');
fs.writeFileSync(sheetFile, html);
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1700,2600', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable');
  await send('Page.navigate', { url: 'file:///' + sheetFile.replace(/\\/g, '/') });
  await sleep(6000 + items.length * 250);
  const m = await send('Page.getLayoutMetrics');
  const size = m.result.cssContentSize || m.result.contentSize;
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 } });
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('saved', out, Math.round(size.width) + 'x' + Math.round(size.height));
  ws.close(); proc.kill(); process.exit(0);
})().catch((e) => { console.error(e); proc.kill(); process.exit(1); });
