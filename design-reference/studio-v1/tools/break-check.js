// Steps for drive.js on break.html: worst-case data against every look × cover at desktop, phone and
// small phone. Reports per state: the page scrolling sideways, text spilling past the screen edge, raw
// "undefined"/"NaN"/"null", "1 videos"-style plurals, and card text spilling out of the card. Screenshots of
// each cover and card go to the out folder (bk-<data>-<look>-<cover>-<w>.png) for a person to look at.
// Env DATA=worst,short,one,empty  LOOKS=…  WIDTHS=1440,390,320  SHOTS=1
module.exports = async (t) => {
  const base = await t.ev('return location.href.split("?")[0]');
  const datas = (process.env.DATA || 'worst,short,one,empty').split(','), widths = (process.env.WIDTHS || '1440,390,320').split(',').map(Number);
  const looks = (process.env.LOOKS || 'cinematic,editorial,highlight,portrait,prospect').split(',');
  const found = new Map();
  const note = (key, where) => { if (!found.has(key)) found.set(key, []); found.get(key).push(where); };
  for (const look of looks) {
    const covers = await t.ev(`return (Athlesite.LOOKS[${JSON.stringify(look)}].covers || []).map((c) => c.id)`);
    for (const data of datas) for (const cover of (data === 'worst' ? covers : [''])) for (const w of widths) {
      await t.send('Emulation.setDeviceMetricsOverride', { width: Math.max(w + 400, 800), height: 1000, deviceScaleFactor: 1, mobile: false });
      await t.ev(`location.href = ${JSON.stringify(base)} + '?' + new URLSearchParams({ data: '${data}', look: '${look}', cover: '${cover}', w: '${w}' }); return 1`);
      await t.sleep(1700);
      const r = await t.ev(`const f = document.getElementById('page'), d = f.contentDocument, W = f.contentWindow.innerWidth, out = [];
        await new Promise((ok) => setTimeout(ok, 400));
        if (d.documentElement.scrollWidth > W + 1) out.push('page scrolls sideways by ' + (d.documentElement.scrollWidth - W) + 'px');
        const name = (el) => (el.tagName.toLowerCase() + '.' + [...el.classList].slice(0, 2).join('.')).replace(/\\.$/, '');
        d.querySelectorAll('body *').forEach((el) => {
          if (!el.childNodes.length || el.closest('[aria-hidden=true],.sr-only,.reel,.folio,.gv-strip,.intro,script,style')) return;
          const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          if (!hasText) return;
          const cs = d.defaultView.getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return;
          // Screen-reader-only text (the skip link before focus, a phone table's headings) is clipped on purpose.
          for (let p = el; p && p.nodeType === 1; p = p.parentElement) if (d.defaultView.getComputedStyle(p).clip === 'rect(0px, 0px, 0px, 0px)') return;
          const b = el.getBoundingClientRect(); if (!b.width) return;
          if (b.right > W + 1 || b.left < -1) out.push('text past the screen edge: ' + name(el) + ' "' + el.textContent.trim().slice(0, 40) + '"');
          else if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'visible' && cs.textOverflow !== 'ellipsis') out.push('text clipped in its box: ' + name(el) + ' "' + el.textContent.trim().slice(0, 40) + '"');
        });
        const txt = d.body.innerText;
        (txt.match(/\\b(undefined|NaN|null|\\[object Object\\])\\b/g) || []).forEach((m) => out.push('raw value shown: ' + m));
        (txt.match(/\\b1 (videos|photos|milestones|numbers|results|offers|words|years|partners)\\b/gi) || []).forEach((m) => out.push('plural: "' + m + '"'));
        const card = document.getElementById('card'), cb = card.getBoundingClientRect();
        card.querySelectorAll('*').forEach((el) => { const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); if (!hasText || el.closest('[aria-hidden=true]')) return; const b = el.getBoundingClientRect(); if (b.width && (b.right > cb.right + 1 || b.left < cb.left - 1 || b.bottom > cb.bottom + 1)) out.push('card text spills: ' + name(el) + ' "' + el.textContent.trim().slice(0, 30) + '"'); });
        return [...new Set(out)].slice(0, 12)`);
      r.forEach((x) => note(x.replace(/"[^"]*"$/, '').trim() + (x.match(/"[^"]*"$/) ? ' ' + x.match(/"[^"]*"$/)[0] : ''), `${data}/${look}/${cover || '-'}/${w}`));
      if (process.env.SHOTS && (w !== 1440 || true)) {
        await t.ev(`window.scrollTo(0, 0); return 1`);
        await t.shot(`bk-${data}-${look}-${cover || 'd'}-${w}`);
      }
    }
  }
  if (!found.size) t.log('nothing broke');
  [...found.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) => t.log(`${String(v.length).padStart(3)}× ${k}\n      e.g. ${v.slice(0, 4).join(', ')}`));
};
