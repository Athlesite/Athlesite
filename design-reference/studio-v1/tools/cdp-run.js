// Drive headless Chrome over the DevTools protocol: open a URL, evaluate a script, print the result.
const { spawn } = require('child_process');
const [,, chrome, profile, url, scriptFile, shotPrefix] = process.argv;
const fs = require('fs');
const port = 9333;
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1440,900', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
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
  await send('Page.navigate', { url });
  await sleep(2500);
  const res = await send('Runtime.evaluate', { expression: fs.readFileSync(scriptFile, 'utf8'), awaitPromise: true, returnByValue: true, timeout: 300000 });
  console.log(JSON.stringify(res.result?.result?.value ?? res.result ?? res, null, 1));
  if (shotPrefix) { const shot = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(shotPrefix + '.png', Buffer.from(shot.result.data, 'base64')); }
  ws.close(); proc.kill(); process.exit(0);
})().catch((e) => { console.error(e); proc.kill(); process.exit(1); });
