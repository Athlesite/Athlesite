// Headless Chrome driver: real mouse/keyboard input, console + exception capture, screenshots.
// usage: node drive.js <steps.js> <url> <outDir> [width] [height] [port]
// env: SCROLLBARS=1 shows Windows scrollbars; GPU=1 draws with the real graphics card (for frame timing);
//      DPR=1.5 draws at that pixel density (Willy's laptop: 1707×1067 CSS px at 150%, 120Hz, Iris Xe);
//      HEADED=1 opens a real window on the screen (real display rate and pixel density; no size override)
// steps.js: module.exports = async (t) => { ... }  with t = { ev, shot, sleep, click, clickSel, key, rect, drag, log, send, on }
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const [,, stepsFile, url, outDir, wArg, hArg, portArg] = process.argv;
const W = +wArg || 1440, H = +hArg || 900, port = +portArg || 9341;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = path.join(outDir, 'profile-' + port);
fs.mkdirSync(outDir, { recursive: true });
const proc = spawn(CHROME, [...(process.env.HEADED ? ['--window-position=0,0'] : ['--headless=new']), `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, ...(process.env.DPR ? [`--force-device-scale-factor=${process.env.DPR}`] : []), '--no-first-run', '--no-default-browser-check', ...(process.env.SCROLLBARS ? [] : ['--hide-scrollbars']), ...(process.env.GPU ? ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] : []), 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logs = [];
(async () => {
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  const listeners = new Map(); // CDP events for steps: t.on('Tracing.dataCollected', fn)
  const on = (method, fn) => listeners.set(method, (listeners.get(method) || []).concat(fn));
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method && listeners.has(d.method)) listeners.get(d.method).forEach((fn) => fn(d.params));
    if (d.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) logs.push(d.params.type.toUpperCase() + ' ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon/.test(d.params.entry.url || '')) logs.push('LOG ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  if (!process.env.HEADED) await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: +process.env.DPR || 1, mobile: W < 800 });
  await send('Page.navigate', { url });
  await sleep(2500);
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };
  const shot = async (name) => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(s.result.data, 'base64')); };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const rect = (sel) => ev(`const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'nearest'});await new Promise(r=>setTimeout(r,60));const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}`);
  const clickSel = async (sel) => { const r = await rect(sel); if (!r) throw new Error('no element ' + sel); await click(r.x, r.y); return r; };
  const key = async (k, mods = 0, code) => {
    const vk = { Escape: 27, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Tab: 9, Enter: 13, z: 90, y: 89 }[k] || 0;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: code || k, windowsVirtualKeyCode: vk, modifiers: mods });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: code || k, windowsVirtualKeyCode: vk, modifiers: mods });
  };
  const drag = async (x0, y0, x1, y1, steps = 12) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
    for (let i = 1; i <= steps; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps, button: 'left', buttons: 1 }); await sleep(16); }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
  };
  const out = [];
  const log = (...a) => out.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  try { await require(path.resolve(stepsFile))({ ev, shot, sleep, click, clickSel, key, rect, drag, log, send, on }); }
  catch (e) { out.push('STEP ERROR ' + e.message); }
  console.log(out.join('\n'));
  console.log('--- console/exceptions: ' + (logs.length ? '\n' + logs.join('\n') : 'none'));
  ws.close(); proc.kill(); process.exit(0);
})().catch((e) => { console.error(e); proc.kill(); process.exit(1); });
