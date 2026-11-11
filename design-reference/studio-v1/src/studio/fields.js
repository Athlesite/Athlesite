/*
 * Athlesite Studio — field controls for the content editors (step 2).
 *
 * Every control binds one value in the profile by its path ("data.firstName", "data.stats.2.value").
 * It commits as you type (a burst of typing on one field is one undo step, see store.js), and it
 * refreshes from the profile whenever the profile changes elsewhere — undo, Remix, another control —
 * except while you're typing in it, so the cursor never jumps.
 *
 * Each control returns { el, sync(p, change) } like the panel's other parts. `data-fieldkey` marks
 * the element so clicking that thing on the page can focus it (panel.focusField).
 */
(function () {
  const A = window.Athlesite, S = A.studio, store = S.store;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let uid = 0;
  const id = (p) => `${p}-${++uid}`;

  const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  function set(obj, path, v) {
    const ks = path.split('.'), last = ks.pop();
    const o = ks.reduce((o, k) => (o[k] == null ? (o[k] = {}) : o[k]), obj);
    o[last] = v;
  }
  /** Is this change one the given input just made (so it must not be overwritten)? */
  const own = (input, change) => document.activeElement === input && change && change.kind === 'content';
  const commit = (path, fn) => store.commit(fn, { kind: 'content', key: path });

  /**
   * Text box or text area.
   * opts: label, path, placeholder, hint, note(p) → dynamic hint, multiline, rows, type, inputmode,
   * max (maxlength), field (focus key), read(p) / write(p, value) to map other shapes, wide.
   */
  function Text(o) {
    const fid = id('f');
    const lid = o.suggest ? id('l') : '';
    const tag = o.multiline ? `<textarea id="${fid}" rows="${o.rows || 4}"` : `<input id="${fid}" type="${o.type || 'text'}"${o.inputmode ? ` inputmode="${o.inputmode}"` : ''}${lid ? ` list="${lid}"` : ''}`;
    const el = h(`<div class="field${o.short ? ' is-short' : ''}" data-fieldkey="${esc(o.field || o.path)}">
      <label class="field-label" for="${fid}">${esc(o.label)}</label>
      ${tag} ${o.placeholder ? `placeholder="${esc(o.placeholder)}"` : ''} ${o.max ? `maxlength="${o.max}"` : ''} autocomplete="${o.autocomplete || 'off'}" spellcheck="${o.spell === false ? 'false' : 'true'}"${o.multiline ? '></textarea>' : '>'}
      ${lid ? `<datalist id="${lid}"></datalist>` : ''}
      <small class="field-hint"${o.hint ? '' : ' hidden'}>${esc(o.hint || '')}</small>
    </div>`);
    const input = el.querySelector('input,textarea'), hint = el.querySelector('.field-hint'), dl = el.querySelector('datalist');
    let dsig = '';
    const read = o.read || ((p) => get(p, o.path) ?? '');
    const write = o.write || ((p, v) => set(p, o.path, v));
    input.addEventListener('input', () => commit(o.path, (p) => write(p, input.value)));
    // Text areas grow with what's written (no inner scroll bars in the panel).
    const grow = () => { if (!o.multiline) return; input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight + 2, 520) + 'px'; };
    input.addEventListener('input', grow);
    return {
      el, input,
      sync(p, change) {
        const v = String(read(p) ?? '');
        if (!own(input, change) && input.value !== v) { input.value = v; requestAnimationFrame(grow); }
        if (o.note) { const n = o.note(p, input.value); hint.textContent = n || o.hint || ''; hint.hidden = !hint.textContent; }
        if (dl) { const list = o.suggest(p) || [], next = list.join('|'); if (next !== dsig) { dsig = next; dl.innerHTML = list.map((x) => `<option value="${esc(x)}">`).join(''); } }
        if (o.placeholderFor) input.placeholder = o.placeholderFor(p) || '';
      },
    };
  }

  /** Native select (sports, positions, years): fast, accessible, right on phones. */
  function Select(o) {
    const fid = id('s');
    const el = h(`<div class="field${o.short ? ' is-short' : ''}" data-fieldkey="${esc(o.field || o.path)}">
      <label class="field-label" for="${fid}">${esc(o.label)}</label>
      <select id="${fid}"></select>
      <small class="field-hint"${o.hint ? '' : ' hidden'}>${esc(o.hint || '')}</small>
    </div>`);
    const sel = el.querySelector('select'), hint = el.querySelector('.field-hint');
    const read = o.read || ((p) => get(p, o.path) ?? '');
    const write = o.write || ((p, v) => set(p, o.path, v));
    let sig = '';
    sel.addEventListener('change', () => store.commit((p) => write(p, sel.value), { kind: 'content', key: null }));
    return {
      el, input: sel,
      sync(p) {
        const opts = typeof o.options === 'function' ? o.options(p) : o.options;
        const next = JSON.stringify(opts);
        if (next !== sig) {
          sig = next;
          sel.innerHTML = opts.map((x) => (x.group
            ? `<optgroup label="${esc(x.group)}">${x.items.map((y) => `<option value="${esc(y.id)}">${esc(y.label)}</option>`).join('')}</optgroup>`
            : `<option value="${esc(x.id)}">${esc(x.label)}</option>`)).join('');
        }
        const v = String(read(p) ?? '');
        if (sel.value !== v) sel.value = v;
        if (o.note) { hint.textContent = o.note(p) || o.hint || ''; hint.hidden = !hint.textContent; }
      },
    };
  }

  /**
   * A list of rows, each a few fields (videos, stats, milestones…). Rows can be added, removed and
   * moved up or down (buttons, so it works with a keyboard and on phones). Rows re-render only when
   * the list's length changes; values update in place.
   * opts: label, path (to the array), fields [{ key, label, placeholder, wide, multiline, inputmode }],
   * blank() → a new item, addLabel, empty (text when there are none), max, rowNote(item, i, p),
   * after(rowEl, i) to add extra controls to a row, field (focus key for the whole list).
   */
  function List(o) {
    const el = h(`<div class="list-field" data-fieldkey="${esc(o.field || o.path)}">
      <div class="list-rows"></div>
      <p class="list-empty" hidden>${esc(o.empty || 'Nothing here yet.')}</p>
      <button type="button" class="btn add-row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>${esc(o.addLabel || 'Add')}</button>
    </div>`);
    const rowsEl = el.querySelector('.list-rows'), addBtn = el.querySelector('.add-row'), emptyEl = el.querySelector('.list-empty');
    let rows = [], count = -1, last = null;
    const arr = (p) => get(p, o.path) || [];

    addBtn.addEventListener('click', () => {
      store.commit((p) => { const a = arr(p); a.push(o.blank()); set(p, o.path, a); }, { kind: 'content', key: null });
      // Focus the new row's first field.
      requestAnimationFrame(() => { const r = rows[rows.length - 1]; if (r) r.fields[0].input.focus(); });
    });

    function move(i, dir) {
      const j = i + dir;
      store.commit((p) => { const a = arr(p); if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; }, { kind: 'content', key: null });
      requestAnimationFrame(() => { const r = rows[j]; if (r) (r.el.querySelector(dir < 0 ? '.row-up' : '.row-down') || r.fields[0].input).focus(); });
    }
    function remove(i) {
      const label = (rows[i] && rows[i].fields[0].input.value) || 'row';
      store.commit((p) => { const a = arr(p); a.splice(i, 1); }, { kind: 'content', key: null });
      S.announce && S.announce(`Removed ${label}. Undo brings it back.`);
      requestAnimationFrame(() => { const r = rows[Math.min(i, rows.length - 1)]; (r ? r.fields[0].input : addBtn).focus(); });
    }

    function build(p) {
      rowsEl.innerHTML = '';
      rows = arr(p).map((item, i) => {
        const row = h(`<div class="list-row" role="group" aria-label="${esc(o.itemName || 'Item')} ${i + 1}">
          <div class="row-fields"></div>
          <div class="row-tools">
            <button type="button" class="icon-btn row-up" aria-label="Move up"${i === 0 ? ' disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button>
            <button type="button" class="icon-btn row-down" aria-label="Move down"${i === arr(p).length - 1 ? ' disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
            <button type="button" class="icon-btn row-remove" aria-label="Remove"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          </div>
          <small class="row-note" hidden></small>
        </div>`);
        const fieldsEl = row.querySelector('.row-fields');
        const fields = o.fields.map((f) => {
          const t = Text(Object.assign({}, f, { path: `${o.path}.${i}.${f.key}`, field: `${o.path}.${i}.${f.key}`, placeholder: typeof f.placeholder === 'function' ? f.placeholder(item, i) : f.placeholder }));
          if (f.wide) t.el.classList.add('is-wide');
          fieldsEl.appendChild(t.el);
          return t;
        });
        row.querySelector('.row-up').addEventListener('click', () => move(i, -1));
        row.querySelector('.row-down').addEventListener('click', () => move(i, 1));
        row.querySelector('.row-remove').addEventListener('click', () => remove(i));
        if (o.after) o.after(row, i, fieldsEl);
        rowsEl.appendChild(row);
        return { el: row, fields, note: row.querySelector('.row-note') };
      });
    }

    return {
      el,
      sync(p, change) {
        // o.ignore: keys edited elsewhere (a photo's focus point) that never need the rows rebuilt.
        const a = arr(p), json = JSON.stringify(a, o.ignore ? (k, v) => (o.ignore.includes(k) ? undefined : v) : undefined);
        // Typing in one of these rows only updates values; anything else that changed the list
        // (add, remove, move, undo, a checklist tick) rebuilds the rows.
        const typing = change && change.kind === 'content' && change.key && change.key.startsWith(o.path + '.');
        if (a.length !== count || (!typing && json !== last)) build(p);
        count = a.length; last = json;
        rows.forEach((r, i) => {
          r.fields.forEach((f) => f.sync(p, change));
          if (o.rowNote) { const n = o.rowNote(a[i], i, p); r.note.textContent = n || ''; r.note.hidden = !n; }
          if (o.each) o.each(r.el, a[i], i, p);
        });
        emptyEl.hidden = a.length > 0;
        addBtn.hidden = o.noAdd || (o.max ? a.length >= o.max : false);
      },
    };
  }

  /**
   * Short tags (what you can offer, past partners): type and press Enter, × to remove,
   * plus optional one-tap suggestions.
   */
  function Chips(o) {
    const fid = id('c');
    const el = h(`<div class="field chips-field" data-fieldkey="${esc(o.field || o.path)}">
      <label class="field-label" for="${fid}">${esc(o.label)}</label>
      <ul class="chips" aria-label="${esc(o.label)}"></ul>
      <div class="chip-add"><input id="${fid}" type="text" placeholder="${esc(o.placeholder || 'Type and press Enter')}" autocomplete="off"><button type="button" class="btn">Add</button></div>
      ${o.suggest ? '<div class="chip-suggest" aria-label="Suggestions"></div>' : ''}
      <small class="field-hint"${o.hint ? '' : ' hidden'}>${esc(o.hint || '')}</small>
    </div>`);
    const list = el.querySelector('.chips'), input = el.querySelector('input'), sug = el.querySelector('.chip-suggest');
    const arr = (p) => get(p, o.path) || [];
    const add = (text) => {
      const t = String(text || '').trim();
      if (!t) return;
      store.commit((p) => { const a = arr(p); if (!a.some((x) => x.toLowerCase() === t.toLowerCase())) a.push(t); set(p, o.path, a); }, { kind: 'content', key: null });
    };
    el.querySelector('.chip-add .btn').addEventListener('click', () => { add(input.value); input.value = ''; input.focus(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(input.value); input.value = ''; } });
    list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const i = +b.dataset.i;
      store.commit((p) => { arr(p).splice(i, 1); }, { kind: 'content', key: null });
      requestAnimationFrame(() => (list.querySelector(`[data-i="${Math.min(i, arr(store.get()).length - 1)}"]`) || input).focus());
    });
    if (sug) sug.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) add(b.dataset.s); });
    let sig = '';
    return {
      el, input,
      sync(p) {
        const a = arr(p), s = o.suggest ? (typeof o.suggest === 'function' ? o.suggest(p) : o.suggest) : [];
        const next = JSON.stringify([a, s]);
        if (next === sig) return;
        sig = next;
        list.innerHTML = a.map((x, i) => `<li><span>${esc(x)}</span><button type="button" data-i="${i}" aria-label="Remove ${esc(x)}">×</button></li>`).join('');
        if (sug) {
          const left = s.filter((x) => !a.some((y) => y.toLowerCase() === x.toLowerCase()));
          sug.innerHTML = left.length ? `<span>Ideas:</span>${left.map((x) => `<button type="button" class="chip-idea" data-s="${esc(x)}">+ ${esc(x)}</button>`).join('')}` : '';
        }
      },
    };
  }

  /**
   * Suggestions with checkboxes (the sport checklist): ticking adds the item, unticking removes it
   * (only while it's still empty, so nothing an athlete typed disappears). Nothing is ever forced.
   * opts: label, hint, items(p) → [{ key, label, group }], isOn(p, item), add(p, item), remove(p, item),
   * canRemove(p, item).
   */
  function Checklist(o) {
    const el = h(`<div class="checklist" data-fieldkey="${esc(o.field || '')}"><p class="field-label">${esc(o.label)}</p><div class="check-groups"></div><small class="field-hint"${o.hint ? '' : ' hidden'}>${esc(o.hint || '')}</small></div>`);
    const groups = el.querySelector('.check-groups');
    let sig = '';
    groups.addEventListener('change', (e) => {
      const cb = e.target.closest('input[type=checkbox]');
      if (!cb) return;
      const item = JSON.parse(cb.dataset.item);
      const p0 = store.get();
      if (!cb.checked && o.canRemove && !o.canRemove(p0, item)) { cb.checked = true; S.announce && S.announce(`${item.label} has something in it, so it stays. Remove it from the list below.`); return; }
      store.commit((p) => (cb.checked ? o.add(p, item) : o.remove(p, item)), { kind: 'content', key: null });
    });
    return {
      el,
      sync(p) {
        const items = o.items(p);
        const next = JSON.stringify(items);
        if (next !== sig) {
          sig = next;
          const byGroup = new Map();
          items.forEach((it) => byGroup.set(it.group || '', [...(byGroup.get(it.group || '') || []), it]));
          groups.innerHTML = [...byGroup.entries()].map(([g, list]) => `<fieldset class="check-group">${g ? `<legend>${esc(g)}</legend>` : ''}<div class="checks">${list.map((it) => {
            const cid = id('k');
            return `<label class="check" for="${cid}"><input id="${cid}" type="checkbox" data-item="${esc(JSON.stringify(it))}"><span>${esc(it.label)}</span>${it.common ? '<em>Common</em>' : ''}</label>`;
          }).join('')}</div></fieldset>`).join('');
        }
        groups.querySelectorAll('input[type=checkbox]').forEach((cb) => { cb.checked = !!o.isOn(p, JSON.parse(cb.dataset.item)); });
      },
    };
  }

  S.fields = { Text, Select, List, Chips, Checklist, get, set };
})();
