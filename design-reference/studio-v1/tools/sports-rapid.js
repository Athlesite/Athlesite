(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const R = { clicks: 0, missed: [], misaligned: [], heightOff: [] };
  const pressed = (row) => document.querySelector(`${row} button[aria-pressed=true]`);
  const pillOk = (row) => { const r = document.querySelector(row), on = pressed(row), p = r.querySelector('.pill'); if (!on) return true; const a = p.getBoundingClientRect(), b = on.getBoundingClientRect(); return Math.abs(a.left - b.left) < 1.5 && Math.abs(a.width - b.width) < 1.5 && Math.abs(a.top - b.top) < 1.5; };
  const clickAndCheck = async (sel, row, gap) => {
    const b = document.querySelector(sel); b.click(); R.clicks++;
    if (pressed(row) !== document.querySelector(sel)) R.missed.push(sel);
    await sleep(gap);
  };
  const sports = [...document.querySelectorAll('#sports button')].map((b) => b.dataset.sport);
  for (const gap of [60, 120, 250]) {
    for (const sport of sports) {
      await clickAndCheck(`[data-sport="${sport}"]`, '#sports', gap);
      const pos = [...document.querySelectorAll('#positions button')].map((b) => b.dataset.pos).slice(0, 4);
      for (const p of pos) await clickAndCheck(`#positions [data-pos="${p}"]`, '#positions', gap);
    }
    await clickAndCheck('[data-level="college"]', '#levels', gap);
    await clickAndCheck('[data-level="hs"]', '#levels', gap);
  }
  await sleep(700); // let everything settle
  for (const row of ['#levels', '#sports', '#positions']) if (!pillOk(row)) R.misaligned.push(row);
  document.querySelectorAll('.card').forEach((c) => { const h = c.getBoundingClientRect().height; c.style.height = ''; if (Math.abs(c.getBoundingClientRect().height - h) > 1) R.heightOff.push(c.dataset.card); });
  return R;
})()
