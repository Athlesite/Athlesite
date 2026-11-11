/*
 * Athlesite Studio — Publish.
 *
 * The last step of the flow: choose the link name, see what visitors will get, publish. A page is
 * private until this explicit action (the product's rule), and the link name is chosen here, near
 * publish, rather than at the very start (CFul's porting response, 2026-11-10). The "Claim it" name from
 * the homepage arrives as a suggestion only.
 *
 * Link names follow the product exactly (src/lib/athlete-profile.ts on main): a letter first, then a–z,
 * 0–9 and hyphens, 3–30 long, no "--", and not a reserved name. Adults only for now, so there is no
 * guardian step here; for minors that approval comes before publishing, on the exact public version.
 *
 * After publishing, edits are a private draft until "Publish changes" (CFul, 2026-11-10: athletes edit,
 * try designs and preview without it showing publicly). Only what visitors would see counts as a change:
 * the public fields and the design, compared through public-view.js, so editing a private section (stats,
 * gallery…) changes nothing public. For a minor, a public change would go to the guardian first.
 *
 * Prototype: nothing goes to a server. The example pages' names count as taken, and the published state
 * lives in memory only (no device storage of anything new).
 *
 *   S.publish.attach(button, { get(), setSlug(slug), visit(), subscribe(fn) })
 */
(function () {
  const A = window.Athlesite, S = A.studio;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const SLUG_PATTERN = /^[a-z][a-z0-9-]{2,29}$/;
  const RESERVED = new Set(['get-started', 'edit-profile', 'athletes', 'jordan-bell', 'example', 'api', 'admin', 'login', 'signup',
    'onboarding', 'guardian', 'privacy', 'terms', 'about', 'contact', 'support', 'help', 'pricing', 'blog', 'resources', 'account',
    'settings', 'dashboard', 'recruiting', 'nil', 'www', 'app']);
  const slugify = (v) => String(v || '').toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  // While typing: lowercase, spaces become hyphens, anything else that can't be in a link is dropped.
  const typed = (v) => String(v || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 30);
  const taken = () => new Set(Object.values(A.EXAMPLES || {}).map((x) => x.data && x.data.slug).filter(Boolean));

  function check(slug) {
    if (!slug) return { ok: false, msg: 'Choose a link name.' };
    if (!SLUG_PATTERN.test(slug) || slug.includes('--')) return { ok: false, msg: 'Use 3–30 lowercase letters, numbers and hyphens, starting with a letter.' };
    if (RESERVED.has(slug)) return { ok: false, msg: 'That name is reserved for Athlesite. Try another.' };
    if (taken().has(slug)) {
      const alt = [2, 3, 4, 5].map((n) => `${slug.slice(0, 28)}-${n}`).find((s) => !taken().has(s) && !RESERVED.has(s));
      return { ok: false, msg: `That one’s taken. Try ${alt}.`, alt };
    }
    return { ok: true, msg: `athlesite.com/${slug} is available.` };
  }

  // What a visitor gets (the product's public fields) and what the athlete filled in that stays private.
  function whatShows(p) {
    const d = p.data, filled = (v) => Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());
    const shown = [
      ['Your name', filled(d.firstName)], ['Sport and position', filled(d.sport) || filled(d.position)],
      ['Class year', filled(d.classYear)], ['City and state', filled(d.city) || filled(d.state)],
      ['Height and weight', d.heightIn || d.weightLb], ['Bio', filled(d.bio)], ['Cover photo', filled(d.heroPhotoUrl)],
      ['Film links', filled(d.highlightLinks)],
    ].filter((x) => x[1]).map((x) => x[0]);
    const hidden = [
      ['stats', filled(d.stats)], ['results', filled(d.results)], ['milestones', filled(d.milestones)], ['gallery', filled(d.gallery)],
      ['contact', filled(d.recruitingContact)], ['social links', Object.values(d.social || {}).some(filled)],
      ['recruiting profiles', filled(d.profileLinks)], ['school or team', filled(d.schoolOrTeam)], ['number', filled(d.jerseyNumber)],
      ['tagline', filled(d.tagline)], ['GPA and major', filled(d.gpa) || filled(d.intendedMajor)], ['NIL', d.nilOpen || filled(d.nilOffers)],
    ].filter((x) => x[1]).map((x) => x[0]);
    return { shown, hidden };
  }

  function attach(button, { get, setSlug, visit, subscribe }) {
    let live = '', published = ''; // the link name, and what visitors see on it (while the Studio is open)
    const publicKey = () => JSON.stringify(A.publicView(get()));
    const pending = () => !!live && publicKey() !== published;
    const dlg = document.createElement('dialog');
    dlg.className = 'pub';
    dlg.setAttribute('aria-labelledby', 'pub-title');
    document.body.append(dlg);
    const syncButton = () => {
      const changes = pending();
      button.classList.toggle('is-live', !!live && !changes);
      // Phones have room for one short word: there it's 'Publish' plus a dot for waiting changes.
      button.innerHTML = !live ? 'Publish' : changes ? '<span class="seg-long">Publish changes</span><span class="seg-short" aria-hidden="true">Publish<b class="pub-dot"></b></span>' : '<i aria-hidden="true"></i>Published';
      if (changes) button.setAttribute('aria-label', 'Publish changes'); else button.removeAttribute('aria-label');
    };
    syncButton();
    if (subscribe) subscribe(() => { if (live) syncButton(); });

    const closeBtn = '<button type="button" class="icon-btn pub-x" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
    const goVisit = (msg) => { dlg.close(); visit(); S.toast && S.toast(msg); };
    const publishNow = () => { published = publicKey(); syncButton(); };

    function showSetup() {
      const p = get(), d = p.data;
      const suggestion = d.slug || slugify(`${d.firstName} ${d.lastName}`);
      const { shown, hidden } = whatShows(p);
      dlg.innerHTML = `<div class="pub-card">
        <div class="pub-head"><h2 id="pub-title">Publish your page</h2>${closeBtn}</div>
        <p class="pub-sub">Choose your link, check what visitors will see, then publish. You can unpublish any time.</p>
        <label class="pub-label" for="pub-slug">Your link</label>
        <div class="pub-link"><span aria-hidden="true">athlesite.com/</span><input id="pub-slug" value="${esc(suggestion)}" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="pub-check"></div>
        <p class="pub-check" id="pub-check" aria-live="polite"></p>
        <h3 class="pub-h">What visitors will see</h3>
        ${shown.length ? `<ul class="pub-list">${shown.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="pub-note">Only your name so far. Add more in the editor any time.</p>'}
        ${hidden.length ? `<p class="pub-note">Private for now, only you can see: ${esc(hidden.join(', '))}.</p>` : ''}
        <button type="button" class="link-btn pub-visit">See it as a visitor</button>
        <div class="pub-actions"><button type="button" class="btn btn-go pub-go">Publish</button><button type="button" class="fr-skip pub-cancel">Not yet</button></div>
        <p class="pub-proto">Prototype: nothing goes online. The example pages’ names count as taken.</p>
      </div>`;
      const input = dlg.querySelector('#pub-slug'), out = dlg.querySelector('.pub-check'), go = dlg.querySelector('.pub-go');
      const sync = () => {
        const v = typed(input.value);
        if (v !== input.value) input.value = v;
        const r = check(v);
        out.textContent = r.msg;
        out.classList.toggle('is-ok', r.ok);
        input.setAttribute('aria-invalid', String(!r.ok));
        go.disabled = !r.ok || !d.firstName.trim();
        return r;
      };
      input.addEventListener('input', sync);
      sync();
      dlg.querySelector('.pub-visit').addEventListener('click', () => goVisit('This is your page as a visitor sees it.'));
      dlg.querySelector('.pub-cancel').addEventListener('click', () => dlg.close());
      go.addEventListener('click', () => {
        if (!sync().ok) return;
        setSlug(input.value);
        live = input.value;
        publishNow();
        showLive('Your page is live');
      });
    }

    // A published page: either up to date, or with changes that are still private.
    function showLive(title) {
      const changes = pending();
      dlg.innerHTML = `<div class="pub-card">
        <div class="pub-head"><h2 id="pub-title">${title || (changes ? 'Publish your changes?' : 'Your page is published')}</h2>${closeBtn}</div>
        <p class="pub-sub">${changes ? 'Your page is live. The changes you’ve made since are private until you publish them.' : 'Anyone with your link can view it. New changes stay private until you publish them.'}</p>
        <div class="pub-live"><span class="pub-url">athlesite.com/${esc(live)}</span><button type="button" class="btn pub-copy">Copy link</button></div>
        ${changes ? '<button type="button" class="link-btn pub-visit">See the changes as a visitor</button>' : ''}
        <div class="pub-actions">${changes ? '<button type="button" class="btn btn-go pub-go">Publish changes</button><button type="button" class="fr-skip pub-later">Not yet</button>' : '<button type="button" class="btn btn-go pub-done">Done</button>'}<button type="button" class="fr-skip pub-unpub">Unpublish</button></div>
      </div>`;
      // The dialog sits above the toasts, so the button itself says it worked.
      const copy = dlg.querySelector('.pub-copy');
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(`https://athlesite.com/${live}`); copy.textContent = 'Link copied'; }
        catch (e) { copy.textContent = 'Select the link to copy it'; }
        setTimeout(() => { if (copy.isConnected) copy.textContent = 'Copy link'; }, 2400);
      });
      const on = (sel, fn) => { const b = dlg.querySelector(sel); if (b) b.addEventListener('click', fn); };
      on('.pub-visit', () => goVisit('This is how visitors will see your page once you publish.'));
      on('.pub-go', () => { publishNow(); showLive('Your changes are live'); });
      on('.pub-later', () => dlg.close());
      on('.pub-done', () => dlg.close());
      on('.pub-unpub', () => {
        live = ''; published = '';
        syncButton();
        dlg.close();
        S.toast && S.toast('Unpublished. Only you can see your page now.');
      });
      (dlg.querySelector('.pub-go') || dlg.querySelector('.pub-done')).focus();
    }

    dlg.addEventListener('click', (e) => {
      if (e.target.closest('.pub-x') || e.target === dlg) dlg.close(); // the close button, or a click on the backdrop
    });
    button.addEventListener('click', () => {
      if (live) showLive(); else showSetup();
      dlg.showModal();
      if (!live) { const i = dlg.querySelector('#pub-slug'); i.focus(); i.select(); }
    });
  }

  S.publish = { attach, check, slugify };
})();
