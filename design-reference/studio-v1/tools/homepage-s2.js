// Steps for drive.js on the homepage (homepage-v2/index.html), Section 02 with the real examples:
// the 15 cards (names, photos, fit, neighbours differ), the carousel's frame times, opening a card
// (the live page in the phone, info, links, the rest of the page inert), next/prev and rapid
// stepping, Escape, opening a side card, the keyboard, reduced motion, and "Start with this style"
// landing in the Studio's setup. Run at 1440×900 and 390×844. Must print PROBLEMS none.
// node tools/drive.js tools/homepage-s2.js file:///C:/Users/conno/projects/Athlesite/athlesite-design/homepage-v2/index.html <outDir> 1440 900
const ORDER = ['Jordan Bell', 'Maya Rodriguez', 'Aaliyah Grant', 'Grace Nakamura', 'Cole Bennett', 'Sofia Lindqvist', 'Liam Kowalski', 'Ethan Whitaker', 'Owen Castellanos', 'Priya Raman', 'Imani Wallace', 'Hannah Mercer', 'Kenzie Morales', 'Mateo Ruiz', 'Tyler Brooks'];
const SLUG = (name) => name.toLowerCase().replace(/ /g, '-');
const PAGE = (name) => `../studio-v1/site.html?ex=${SLUG(name)}&embed=1`; // what the phone loads
module.exports = async (t) => {
  const problems = [];
  const expect = (label, ok, got) => { t.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got: ' + JSON.stringify(got))); if (!ok) problems.push(label); };
  const W = await t.ev(`return innerWidth`), H = await t.ev(`return innerHeight`);
  const tag = W < 640 ? 'phone' : 'desk';
  // The card nearest the middle of the screen (its name), and how many cards are hidden (one is "in" the phone).
  const middle = () => t.ev(`const cs=[...document.querySelectorAll('#carousel .card')];return cs.map(e=>({e,r:e.getBoundingClientRect()})).sort((a,b)=>Math.abs(a.r.left+a.r.width/2-innerWidth/2)-Math.abs(b.r.left+b.r.width/2-innerWidth/2))[0].e.getAttribute('aria-label').split(',')[0]`);
  const hidden = () => t.ev(`return [...document.querySelectorAll('#carousel .card')].filter(e=>e.style.visibility==='hidden').map(e=>e.getAttribute('aria-label').split(',')[0])`);
  const modal = () => t.ev(`const m=document.getElementById('modal'),f=document.getElementById('mFrame');return {open:m.classList.contains('is-open'),title:document.getElementById('modalTitle').textContent,style:document.getElementById('modalStyle').textContent,items:[...document.querySelectorAll('#modalList li')].map(l=>l.textContent),src:f.getAttribute('src'),screen:+getComputedStyle(document.getElementById('mScreen')).opacity,start:document.getElementById('modalStart').getAttribute('href'),full:document.getElementById('modalFull').getAttribute('href'),fullTarget:document.getElementById('modalFull').target,note:document.getElementById('modalNote').textContent,mainInert:document.querySelector('main').inert,navInert:document.getElementById('nav').inert,focus:document.activeElement&&(document.activeElement.id||document.activeElement.className)}`);
  // Frame times: rAF intervals for ms milliseconds; a frame over 20ms missed a 60fps beat.
  const frames = (ms) => t.ev(`return await new Promise(r=>{const out=[];let last=performance.now();const t0=last;const f=n=>{out.push(n-last);last=n;if(n-t0<${ms})requestAnimationFrame(f);else r({n:out.length,missed:out.filter(x=>x>20).length,worst:Math.round(Math.max(...out))})};requestAnimationFrame(f)})`);
  const startFrames = () => t.ev(`window.__ft=[];let last=performance.now();const f=n=>{__ft.push(n-last);last=n;if(__ft.length<400)requestAnimationFrame(f)};requestAnimationFrame(f);return 1`);
  const readFrames = () => t.ev(`const o=window.__ft.splice(0);window.__ft.length=400;return {n:o.length,missed:o.filter(x=>x>20).length,worst:Math.round(Math.max(...o))}`);

  // 1 · The cards
  await t.ev(`document.getElementById('styles').scrollIntoView({block:'start'}); return 1`);
  await t.sleep(2600);
  const info = await t.ev(`await document.fonts.ready;await Promise.all([...document.querySelectorAll('#carousel img')].map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r})));
    const cs=[...document.querySelectorAll('#carousel .card')];
    return cs.map(e=>{const n=e.querySelector('.ac-name'),ac=e.querySelector('.ac');
      const rows=new Map();[...(n?n.children:[])].forEach(s=>{const r=rows.get(s.offsetTop)||[1e9,-1e9];rows.set(s.offsetTop,[Math.min(r[0],s.offsetLeft),Math.max(r[1],s.offsetLeft+s.offsetWidth)])});
      const widest=Math.max(0,...[...rows.values()].map(([a,b])=>b-a));
      return {label:e.getAttribute('aria-label'),name:n?n.textContent.replace(/\\s+/g,' ').trim():'',look:ac?[...ac.classList].find(c=>/^ac-(cinematic|editorial|highlight|portrait|prospect)$/.test(c)):'',
        tag:(e.querySelector('.card-tag')||{}).textContent||'',fits:!n||widest<=n.clientWidth+1,
        imgs:[...e.querySelectorAll('img')].map(i=>({ok:i.naturalWidth>0,src:i.getAttribute('src')})),w:e.offsetWidth,h:e.offsetHeight}})`);
  expect('15 cards, one per example', info.length === 15, info.length);
  expect('cards in the planned order (Jordan in the middle, looks alternate)', info.map((c) => c.label.split(',')[0]).join('|') === ORDER.join('|'), info.map((c) => c.label.split(',')[0]));
  expect('every card shows its athlete\'s name', info.every((c) => c.name && c.label.toLowerCase().startsWith(c.name.toLowerCase().replace(/ /g, ' '))), info.filter((c) => !c.name).map((c) => c.label));
  expect('every name fits its card', info.every((c) => c.fits), info.filter((c) => !c.fits).map((c) => c.name));
  expect('neighbouring cards are different looks (round the loop too)', info.every((c, i) => c.look !== info[(i + 1) % info.length].look), info.map((c) => c.look));
  expect('every style label reads "<Look> · <Sport>"', info.every((c) => /^\w+ · .+/.test(c.tag)), info.map((c) => c.tag));
  const imgs = info.flatMap((c) => c.imgs);
  expect('example photos load from studio-v1 (Jordan, Maya, Tyler)', imgs.length >= 3 && imgs.every((i) => i.ok && i.src.startsWith('../studio-v1/')), imgs);
  expect(`card size ${W < 640 ? '250×350' : W < 1024 ? '290×400' : '340×460'}`, info.every((c) => c.w === (W < 640 ? 250 : W < 1024 ? 290 : 340) && c.h === (W < 640 ? 350 : W < 1024 ? 400 : 460)), info[0]);
  expect('Jordan starts in the middle', (await middle()) === 'Jordan Bell', await middle());
  const copy = await t.ev(`return document.querySelector('#styles .sec-head > p').textContent`);
  expect('copy says fifteen', /fifteen/.test(copy), copy);
  await t.shot(`s2-${tag}-1-cards`);

  // 2 · Smoothness while the carousel drifts on its own
  await t.sleep(1200);
  const drift = await frames(3000);
  expect(`carousel drift: ${drift.missed} of ${drift.n} frames over 20ms (worst ${drift.worst}ms)`, drift.missed <= Math.max(2, drift.n * 0.03), drift);

  // 3 · Open the middle card
  await t.ev(`window.scrollTo(0, document.getElementById('styles').offsetTop); return 1`);
  await t.sleep(300);
  // Wait for a resting moment: click the card right in the middle.
  const mid = await t.ev(`const cs=[...document.querySelectorAll('#carousel .card')].map(e=>({e,r:e.getBoundingClientRect()})).sort((a,b)=>Math.abs(a.r.left+a.r.width/2-innerWidth/2)-Math.abs(b.r.left+b.r.width/2-innerWidth/2));const r=cs[0].r;return {x:r.left+r.width/2,y:r.top+r.height/2,name:cs[0].e.getAttribute('aria-label').split(',')[0]}`);
  await startFrames();
  await t.click(mid.x, mid.y);
  await t.sleep(260); await t.shot(`s2-${tag}-2-opening`);
  await t.sleep(2600);
  const openFt = await readFrames();
  let m = await modal();
  expect('opens the card that was clicked', m.open && m.title === mid.name, m);
  expect('the live page loads in the phone', m.src === PAGE(mid.name) && m.screen === 1, m);
  expect('info: style · sport, four lines about their choices', /style · /.test(m.style) && m.items.length === 4, m);
  expect('"Start with this style" → the Studio setup with this design', m.start === `../studio-v1/studio.html?start=1&from=${SLUG(mid.name)}`, m.start);
  expect('"See the full page" → the page, in a new tab', m.full === `../studio-v1/site.html?ex=${SLUG(mid.name)}` && m.fullTarget === '_blank', m);
  expect('the rest of the homepage is inert while open', m.mainInert && m.navInert, m);
  expect('focus goes to Close', m.focus === 'modalClose', m.focus);
  expect('only the opened card is hidden behind the glass', JSON.stringify(await hidden()) === JSON.stringify([mid.name]), await hidden());
  // The first open in a fresh browser profile pays one-time costs (GPU warm-up, the live page's own
  // script; HANDOFF §0.3 Task 4), and the frame count depends on the display rate, so the bar is a
  // share of the frames: 5%, or 6 frames, whichever is more. A real regression misses far more.
  expect(`opening: ${openFt.missed} of ${openFt.n} frames over 20ms (worst ${openFt.worst}ms)`, openFt.missed <= Math.max(6, Math.round(openFt.n * 0.05)), openFt);
  const box = await t.ev(`const p=document.getElementById('mPhone').getBoundingClientRect(),s=document.getElementById('mScreen').getBoundingClientRect(),b=document.getElementById('modalStart').getBoundingClientRect(),m=document.getElementById('modal');return {top:p.top,bottom:p.bottom,left:p.left,right:p.right,sw:s.width,sh:s.height,start:b.bottom,scroll:m.scrollHeight-m.clientHeight,prev:document.getElementById('modalPrev').getBoundingClientRect().right,next:document.getElementById('modalNext').getBoundingClientRect().left}`);
  expect('the phone fits on screen', box.top >= 0 && box.bottom <= H && box.left >= 0 && box.right <= W, box);
  expect('the phone\'s screen is a 390×844 page shape', Math.abs(box.sw / box.sh - 390 / 844) < 0.01, box);
  expect('the arrows don\'t touch the phone', box.prev < box.left && box.next > box.right, box);
  expect('"Start with this style" is on screen (or a short scroll away)', box.start <= H || box.scroll < 200, box);
  await t.shot(`s2-${tag}-3-open`);

  // 4 · Next, then previous twice (wraps round)
  const at = ORDER.indexOf(mid.name);
  await t.clickSel('#modalNext');
  await t.sleep(2400);
  m = await modal();
  const next = ORDER[(at + 1) % 15];
  expect('→ shows the next example', m.title === next && m.src === PAGE(next) && m.screen === 1, m);
  expect('→ the carousel follows behind the glass', (await middle()) === next && JSON.stringify(await hidden()) === JSON.stringify([next]), [await middle(), await hidden()]);
  await t.shot(`s2-${tag}-4-next`);
  await t.clickSel('#modalPrev'); await t.sleep(500);
  await t.clickSel('#modalPrev'); await t.sleep(2400);
  m = await modal();
  const prev = ORDER[(at + 14) % 15];
  expect('← ← wraps round to the one before', m.title === prev && m.src === PAGE(prev) && (await middle()) === prev, [m.title, await middle()]);

  // 5 · Rapid: four quick → (keyboard)
  for (let i = 0; i < 4; i++) { await t.key('ArrowRight'); await t.sleep(60); }
  await t.sleep(2600);
  m = await modal();
  const four = ORDER[(at + 14 + 4) % 15];
  expect('four quick → land on the fourth, page and all', m.title === four && m.src === PAGE(four) && m.screen === 1, m);
  expect('four quick →: carousel and hidden card agree', (await middle()) === four && JSON.stringify(await hidden()) === JSON.stringify([four]), [await middle(), await hidden()]);

  // 6 · Escape closes; the card flies home to the middle
  await t.key('Escape');
  await t.sleep(250); await t.shot(`s2-${tag}-5-closing`);
  await t.sleep(900);
  m = await modal();
  expect('Escape closes', !m.open, m);
  expect('closed: page unloaded, homepage usable again, no card hidden', m.src === 'about:blank' && !m.mainInert && (await hidden()).length === 0, m);
  expect('closed: focus on the card in the middle', (await t.ev(`return (document.activeElement.getAttribute('aria-label')||'').split(',')[0]`)) === four && (await middle()) === four, await t.ev(`return document.activeElement.getAttribute('aria-label')`));

  // 7 · Open a card from the side: it glides to the middle while open
  const side = await t.ev(`const cs=[...document.querySelectorAll('#carousel .card')].map(e=>({e,r:e.getBoundingClientRect()})).filter(o=>o.r.left>innerWidth/2+20&&o.r.right<innerWidth+40).sort((a,b)=>a.r.left-b.r.left);const o=cs[0];return o?{x:Math.min(innerWidth-8,o.r.left+o.r.width/2),y:o.r.top+o.r.height/2,name:o.e.getAttribute('aria-label').split(',')[0]}:null`);
  if (side) {
    await t.click(side.x, side.y); await t.sleep(2200);
    m = await modal();
    expect('a side card opens itself', m.title === side.name, [m.title, side.name]);
    await t.clickSel('#modalClose'); await t.sleep(1100);
    expect('…and is in the middle after closing', (await middle()) === side.name && !(await modal()).open, await middle());
  }

  // 8 · Keyboard only: Enter opens the focused card, → steps, Escape closes
  await t.ev(`const cs=[...document.querySelectorAll('#carousel .card')].map(e=>({e,r:e.getBoundingClientRect()})).sort((a,b)=>Math.abs(a.r.left+a.r.width/2-innerWidth/2)-Math.abs(b.r.left+b.r.width/2-innerWidth/2));cs[0].e.focus({preventScroll:true});return 1`);
  const kb = await middle();
  await t.key('Enter'); await t.sleep(1800);
  m = await modal();
  expect('Enter on a card opens it', m.open && m.title === kb, m.title);
  await t.key('ArrowRight'); await t.sleep(1500);
  expect('→ in the open card steps', (await modal()).title === ORDER[(ORDER.indexOf(kb) + 1) % 15], (await modal()).title);
  await t.key('Escape'); await t.sleep(1200);
  expect('Escape closes (keyboard)', !(await modal()).open);

  // 8b · The carousel is one Tab stop; → moves focus card to card, the carousel follows and holds still
  const stops = await t.ev(`return [...document.querySelectorAll('#carousel .card')].filter(c=>c.tabIndex===0).length`);
  expect('the carousel is one Tab stop', stops === 1, stops);
  await t.ev(`const h=document.querySelector('#styles .sec-head h2');h.setAttribute('tabindex','-1');h.focus();return 1`);
  let first = null;
  for (let i = 0; i < 6 && !first; i++) { await t.key('Tab'); await t.sleep(120); first = await t.ev(`const a=document.activeElement;return a.classList.contains('card')?a.getAttribute('aria-label').split(',')[0]:null`); }
  expect('Tab reaches a card', !!first, first);
  if (first) {
    await t.key('ArrowRight'); await t.sleep(1400);
    const nextKb = ORDER[(ORDER.indexOf(first) + 1) % 15];
    const focused = await t.ev(`return document.activeElement.getAttribute('aria-label').split(',')[0]`);
    expect('→ moves focus to the next card and brings it to the middle', focused === nextKb && (await middle()) === nextKb, [focused, await middle(), nextKb]);
    await t.sleep(4200);
    expect('while a card has keyboard focus the carousel holds still', (await middle()) === nextKb, await middle());
    await t.key('ArrowLeft'); await t.sleep(200); await t.key('ArrowLeft'); await t.sleep(1500);
    const back2 = ORDER[(ORDER.indexOf(nextKb) + 13) % 15];
    expect('← ← moves back two (wrapping)', (await t.ev(`return document.activeElement.getAttribute('aria-label').split(',')[0]`)) === back2 && (await middle()) === back2, [await middle(), back2]);
  }
  await t.ev(`document.activeElement.blur(); return 1`);

  // 9 · Reduced motion: no flights, the page still shows
  await t.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await t.ev(`location.reload(); return 1`); await t.sleep(2500);
  await t.ev(`document.getElementById('styles').scrollIntoView({block:'start'}); return 1`); await t.sleep(800);
  const rm = await t.ev(`const cs=[...document.querySelectorAll('#carousel .card')].map(e=>({e,r:e.getBoundingClientRect()})).sort((a,b)=>Math.abs(a.r.left+a.r.width/2-innerWidth/2)-Math.abs(b.r.left+b.r.width/2-innerWidth/2));const r=cs[0].r;return {x:r.left+r.width/2,y:r.top+r.height/2,op:getComputedStyle(cs[0].e).opacity}`);
  expect('reduced motion: cards are there at once', +rm.op === 1, rm);
  await t.click(rm.x, rm.y); await t.sleep(1800);
  m = await modal();
  expect('reduced motion: opens, page shows', m.open && m.screen === 1, m);
  await t.key('Escape'); await t.sleep(150);
  expect('reduced motion: closes at once', !(await modal()).open);
  await t.send('Emulation.setEmulatedMedia', { features: [] });

  // 10 · "Start with this style" lands in the Studio's setup with that design
  await t.ev(`location.reload(); return 1`); await t.sleep(2500);
  await t.ev(`document.getElementById('styles').scrollIntoView({block:'start'}); return 1`); await t.sleep(2600);
  const c0 = await t.ev(`const cs=[...document.querySelectorAll('#carousel .card')].map(e=>({e,r:e.getBoundingClientRect()})).sort((a,b)=>Math.abs(a.r.left+a.r.width/2-innerWidth/2)-Math.abs(b.r.left+b.r.width/2-innerWidth/2));const r=cs[0].r;return {x:r.left+r.width/2,y:r.top+r.height/2,name:cs[0].e.getAttribute('aria-label').split(',')[0]}`);
  await t.click(c0.x, c0.y); await t.sleep(1500);
  await t.clickSel('#modalStart'); await t.sleep(3200);
  const studio = await t.ev(`return {path:location.pathname.split('/').slice(-2).join('/'),q:location.search,fr:!!document.querySelector('.fr.is-in')}`);
  expect('"Start with this style" opens the Studio setup', studio.path === 'studio-v1/studio.html' && studio.q === `?start=1&from=${SLUG(c0.name)}` && studio.fr, studio);
  await t.shot(`s2-${tag}-6-studio`);

  t.log('PROBLEMS ' + (problems.length ? problems.join(' | ') : 'none'));
};
