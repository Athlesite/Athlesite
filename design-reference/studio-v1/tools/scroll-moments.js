// Scroll moments: mid-motion and settled frames per look, plus correctness checks.
module.exports = async (t) => {
  const go = async (look, who = 'jordan') => { await t.ev(`location.href = location.pathname + '?a=${who}&look=${look}&intro=never&r=' + Math.random()`); await t.sleep(2200); };
  const smooth = async (to, steps = 10) => { for (let i = 1; i <= steps; i++) { await t.ev(`scrollTo(0, ${to} * ${i} / ${steps})`); await t.sleep(30); } };

  // Cinematic
  await go('cinematic');
  const hh = await t.ev(`return document.querySelector('.hero').offsetHeight`);
  await smooth(Math.round(hh * 0.45));
  await t.sleep(200);
  t.log('cinematic --out', await t.ev(`return getComputedStyle(document.querySelector('.hero')).getPropertyValue('--out')`));
  await t.shot('m-cinematic-mid');

  // Editorial: story lead half read, then fully read
  await go('editorial');
  const top = await t.ev(`const p=document.querySelector('.story-lead');return p.getBoundingClientRect().top+scrollY`);
  await smooth(Math.round(top - 900 * 0.55));
  await t.sleep(700);
  t.log('editorial lit', await t.ev(`const w=document.querySelectorAll('.story-lead .w');return document.querySelectorAll('.story-lead .w.is-lit').length+'/'+w.length`));
  await t.shot('m-editorial-mid');
  await t.ev(`scrollBy(0, 500)`); await t.sleep(800);
  t.log('editorial lit after', await t.ev(`const w=document.querySelectorAll('.story-lead .w');return document.querySelectorAll('.story-lead .w.is-lit').length+'/'+w.length`));
  t.log('editorial text intact', await t.ev(`const p=document.querySelector('.story-lead');return p.textContent===Athlesite_bio_first`).catch(() => 'n/a'));

  // Highlight: stats reels
  await go('highlight');
  const st = await t.ev(`return document.getElementById('stats').offsetTop`);
  await smooth(st - 60);
  await t.sleep(650);
  await t.shot('m-highlight-mid');
  await t.sleep(2600);
  await t.shot('m-highlight-end');
  t.log('highlight reels', await t.ev(`return [...document.querySelectorAll('.board dd')].map(dd=>{const sr=dd.querySelector('.sr-only').textContent;const shown=[...dd.querySelectorAll('.odo-row > span')].map(s=>{if(s.classList.contains('odo-c'))return s.textContent;const strip=s.firstElementChild;const m=new DOMMatrix(getComputedStyle(strip).transform);const h=s.getBoundingClientRect().height;return strip.children[Math.round(-m.m42/h)].textContent}).join('');return sr+'='+shown}).join(' ')`));

  // Portrait: gallery approaching
  await go('portrait');
  const gt = await t.ev(`return document.getElementById('gallery').offsetTop`);
  await smooth(gt - 500);
  await t.sleep(400);
  t.log('portrait --near', await t.ev(`return [...document.querySelectorAll('.is-print')].map(f=>getComputedStyle(f).getPropertyValue('--near')).join(',')`));
  await t.shot('m-portrait-mid');
  await t.ev(`scrollBy(0, 450)`); await t.sleep(500);
  await t.shot('m-portrait-near');

  // Prospect: table scan
  await go('prospect');
  const pt = await t.ev(`return document.querySelector('.pr-table').getBoundingClientRect().top + scrollY`);
  await smooth(pt - 300);
  await t.sleep(420);
  await t.shot('m-prospect-mid');
  await t.sleep(1800);
  await t.shot('m-prospect-end');
  t.log('prospect values', await t.ev(`return [...document.querySelectorAll('.pr-table tbody tr')].map(tr=>tr.children[1].textContent+'|'+tr.children[1].dataset.count).join('  ')`));
};
