/*
 * Athlesite Studio — first run (step 3).
 *
 * A new athlete answers a few quick questions, one per screen, then lands in the editor on their
 * page:  1 level (+ class year)  2 name  3 sport  4 position + number  5 cover photo
 * Only the first name is required; everything else can be skipped. Nothing from the sport
 * catalog is filled in for them (decision #67): the editor offers it as ideas afterwards.
 * There's no look picker here (Willy, session 4): the look is easier to judge on the real page in
 * the editor, so a page starts in Cinematic ("Create your own") or in the design of the homepage
 * example they chose ("Start with this style"), and the editor shows a tip about the other looks.
 *
 *   S.firstRun.open({ replacing, design, account, onDone(profile), onOpenFile(), onCancel() })
 * replacing: a page already exists (shows "Back to my page"; finishing replaces it, undoable).
 * design: the design to start from (an example's), or nothing for Cinematic.
 * account: a new athlete first passes the age check and makes an account (email code + terms),
 *   before any profile question: the product's order (CFul's porting response, 2026-11-10) in its own
 *   words (src/lib/age-gate-copy.ts, src/components/auth/InlineOtpForm.tsx on product main). In this
 *   prototype no email is sent, any code works, and nothing is saved, the date of birth least of all.
 */
(function () {
  const A = window.Athlesite, S = A.studio;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPORTS = Object.keys(A.SPORT_CATALOG).filter((k) => k !== 'other');
  const STEPS = 5;

  // High school classes still to graduate (a school year turns over in the summer).
  const classYears = () => { const n = new Date(), y = n.getFullYear() + (n.getMonth() >= 6 ? 1 : 0); return [y, y + 1, y + 2, y + 3]; };
  const COLLEGE_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const HOME = '../homepage-v2/index.html';

  // As the product shows an address it sent a code to: first and last letter (maskEmail, otpMachine.ts).
  const maskEmail = (email) => {
    const [local, domain] = String(email).trim().split('@');
    if (!domain || !local) return email;
    return local.length <= 2 ? `${local[0]}…@${domain}` : `${local[0]}…${local[local.length - 1]}@${domain}`;
  };
  // A real calendar date, not in the future; and the age it gives today.
  const realDate = (y, m, d) => {
    if (!y || !m || !d || y < 1900) return false;
    const t = new Date(y, m - 1, d);
    return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d && t <= new Date();
  };
  const ageOn = (y, m, d) => {
    const now = new Date(), had = now.getMonth() + 1 > m || (now.getMonth() + 1 === m && now.getDate() >= d);
    return now.getFullYear() - y - (had ? 0 : 1);
  };

  function open({ replacing = false, design = null, account = false, onDone, onOpenFile, onCancel } = {}) {
    const st = { level: '', year: '', first: '', last: '', sport: '', position: '', number: '', photo: null, email: '' };
    const PRE = account ? 3 : 0, TOTAL = PRE + STEPS;
    const root = h(`<div class="fr" role="dialog" aria-modal="true" aria-label="Start your page">
      <header class="fr-top">
        <div class="brand"><img src="assets/brand/athlesite-mark-on-light.svg" alt="Athlesite"><span>Studio</span></div>
        <div class="fr-progress" role="progressbar" aria-label="Progress" aria-valuemin="1" aria-valuemax="${TOTAL}"><i></i></div>
        <div class="fr-top-end">
          <button type="button" class="link-btn fr-open">Open a page file</button>
          ${replacing ? '<button type="button" class="btn fr-cancel">Back to my page</button>' : ''}
        </div>
      </header>
      <div class="fr-stage"></div>
    </div>`);
    const stage = root.querySelector('.fr-stage'), bar = root.querySelector('.fr-progress');
    // The editor behind the setup is out of reach (Tab, clicks, screen readers) until it closes;
    // the live region and toasts stay so messages still reach the athlete.
    const behind = [...document.body.children].filter((el) => !el.inert && !el.matches('script,#studio-live,.toast'));
    behind.forEach((el) => { el.inert = true; });
    document.body.append(root);
    document.body.classList.add('has-fr');
    // Opening the visit (studio.html's fr-boot): already on screen, no fade. From the editor: a quick fade in.
    if (document.documentElement.classList.contains('fr-boot')) root.classList.add('is-in');
    else requestAnimationFrame(() => root.classList.add('is-in'));

    let at = -1;
    const close = (then) => {
      removeEventListener('keydown', onKey);
      behind.forEach((el) => { el.inert = false; });
      root.classList.remove('is-in');
      root.classList.add('is-out');
      document.body.classList.remove('has-fr');
      document.documentElement.classList.remove('fr-boot'); // the editor shows as the setup fades out
      setTimeout(() => root.remove(), reduced() ? 0 : 420);
      if (then) then();
    };
    const onKey = (e) => {
      if (e.key === 'Escape' && replacing) { e.preventDefault(); close(onCancel); }
    };
    addEventListener('keydown', onKey);
    root.querySelector('.fr-open').addEventListener('click', () => onOpenFile && onOpenFile(() => close()));
    const cancel = root.querySelector('.fr-cancel');
    if (cancel) cancel.addEventListener('click', () => close(onCancel));

    // — The page their answers make, in the design it starts from —
    function draft() {
      const p = A.createEmptyProfile(), d = p.data;
      Object.assign(d, {
        level: st.level || 'hs', firstName: st.first.trim(), lastName: st.last.trim(), sport: st.sport,
        position: st.position.trim(), jerseyNumber: st.number.trim(),
        heroPhotoUrl: st.photo ? st.photo.ref : '',
      });
      if (d.level === 'college') d.academicYear = st.year; else d.classYear = st.year;
      p.design = Object.assign(p.design, design ? structuredClone(design) : { look: 'cinematic' });
      return A.normalizeProfile(p);
    }
    const finish = () => close(() => onDone && onDone(draft()));

    // — Steps —
    // Step 1 holds Back's place (invisible, desktop only) so the question sits at the same height on every step.
    const head = (i, q, sub) => `${i > 0 ? '<button type="button" class="fr-back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>Back</button>' : '<span class="fr-back fr-back-ghost" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>Back</span>'}
      <p class="fr-eyebrow">${i === 0 ? 'Let’s build your page' : `Step ${i + 1} of ${STEPS}`}</p>
      <h1 class="fr-q" tabindex="-1">${q}</h1>${sub ? `<p class="fr-sub">${sub}</p>` : ''}`;
    // The account screens have no Back: once the age is answered it's closed for the session (as in
    // the product), and the code screen offers "Use a different email" instead.
    const headA = (eyebrow, q, sub) => `<span class="fr-back fr-back-ghost" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>Back</span>
      <p class="fr-eyebrow">${eyebrow}</p>
      <h1 class="fr-q" tabindex="-1">${q}</h1>${sub ? `<p class="fr-sub">${sub}</p>` : ''}`;
    const to = (s) => go(PRE + s); // setup steps are numbered from their own first question

    // — Account: age, email, code + terms —
    const accountSteps = [
      // Age, before anything else. Only its answer is used, and the form forgets the date at once.
      () => {
        const el = h(`<div class="fr-step">${headA('Before we start', 'What’s your date of birth?', 'We ask so we know which parts of Athlesite you can use. We don’t save your date of birth.')}
          <form class="fr-form" novalidate>
            <div class="field-row fr-dob">
              <label class="field"><span class="field-label">Month</span><select name="m"><option value="">Month</option>${MONTHS.map((n, k) => `<option value="${k + 1}">${n}</option>`).join('')}</select></label>
              <label class="field is-short"><span class="field-label">Day</span><input name="d" inputmode="numeric" maxlength="2" placeholder="Day" autocomplete="off"></label>
              <label class="field is-short"><span class="field-label">Year</span><input name="y" inputmode="numeric" maxlength="4" placeholder="Year" autocomplete="off"></label>
            </div>
            <p class="fr-error" role="alert" hidden></p>
            <div class="fr-actions"><button type="submit" class="btn btn-go" disabled>Continue</button></div>
          </form>
        </div>`);
        const f = el.querySelector('form'), btn = f.querySelector('.btn-go'), err = f.querySelector('.fr-error');
        const sync = () => {
          for (const k of ['d', 'y']) f[k].value = f[k].value.replace(/\D/g, '');
          btn.disabled = !(f.m.value && f.d.value && f.y.value.length === 4);
          err.hidden = true;
        };
        f.addEventListener('input', sync);
        f.addEventListener('change', sync);
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const y = +f.y.value, m = +f.m.value, d = +f.d.value;
          if (!realDate(y, m, d)) { err.textContent = 'That doesn’t look like a real date. Please check the day and month.'; err.hidden = false; return; }
          const age = ageOn(y, m, d);
          f.reset();
          if (age < 13) blocked('child'); else if (age < 18) blocked('minor'); else go(1);
        });
        el._focus = () => f.m.focus({ preventScroll: true });
        return el;
      },
      // Email: where the code goes, and how they get back in later.
      () => {
        const el = h(`<div class="fr-step">${headA('Your account', 'What’s your email?', 'We’ll email you a code to confirm it’s you. This is how you get back in to edit your page later.')}
          <form class="fr-form" novalidate>
            <label class="field"><span class="field-label">Email</span><input name="email" type="email" inputmode="email" autocomplete="email" spellcheck="false" autocapitalize="none" placeholder="you@example.com" value="${esc(st.email)}"></label>
            <p class="fr-error" role="alert" hidden></p>
            <div class="fr-actions"><button type="submit" class="btn btn-go" disabled>Send code</button></div>
          </form>
        </div>`);
        const f = el.querySelector('form'), btn = f.querySelector('.btn-go'), err = f.querySelector('.fr-error');
        const sync = () => { st.email = f.email.value; btn.disabled = !st.email.trim(); err.hidden = true; };
        f.addEventListener('input', sync);
        sync();
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(st.email.trim())) {
            err.textContent = 'Enter your email address, like you@example.com.'; err.hidden = false; f.email.focus(); return;
          }
          btn.disabled = true; btn.textContent = 'Sending…';
          setTimeout(() => { sentAt = Date.now(); go(2); }, 500); // the prototype only pretends to send
        });
        el._focus = () => f.email.focus({ preventScroll: true });
        return el;
      },
      // Code, and the adult terms: the account exists once both are done.
      () => {
        const el = h(`<div class="fr-step">${headA('Your account', 'Enter the code we emailed you', `Sent to ${esc(maskEmail(st.email))}. It may take a minute — check spam too.`)}
          <form class="fr-form" novalidate>
            <label class="field"><span class="field-label">Code</span><input name="code" class="fr-code" inputmode="numeric" autocomplete="one-time-code" spellcheck="false" placeholder="Paste or type your code"></label>
            <label class="fr-check"><input type="checkbox" name="terms"><span>I confirm I’m 18 or older and agree to Athlesite’s Terms and Privacy Policy.</span></label>
            <div class="fr-actions"><button type="submit" class="btn btn-go" disabled>Verify</button><button type="button" class="fr-skip fr-change">Use a different email</button><button type="button" class="fr-skip fr-resend"></button></div>
            <p class="fr-proto">Prototype: no email is sent, and any code works.</p>
          </form>
        </div>`);
        const f = el.querySelector('form'), btn = f.querySelector('.btn-go'), resend = f.querySelector('.fr-resend');
        const sync = () => { btn.disabled = !(f.code.value.trim() && f.terms.checked); };
        f.addEventListener('input', sync);
        f.addEventListener('change', sync);
        const tick = () => {
          if (at !== 2) return; // stops once they leave the code screen
          const left = Math.ceil(30 - (Date.now() - sentAt) / 1000);
          resend.disabled = left > 0;
          resend.textContent = left > 0 ? `Resend in ${left}s` : 'Resend code';
          if (left > 0) setTimeout(tick, 1000);
        };
        tick();
        resend.addEventListener('click', () => { sentAt = Date.now(); tick(); announce('A new code is on its way.'); });
        f.querySelector('.fr-change').addEventListener('click', () => go(1));
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          if (btn.disabled) return;
          btn.disabled = true; btn.textContent = 'Checking…';
          setTimeout(() => { S.session = { email: st.email.trim() }; to(0); }, 500);
        });
        el._focus = () => f.code.focus({ preventScroll: true });
        return el;
      },
    ];
    let sentAt = 0;
    const announce = (msg) => { const live = document.getElementById('studio-live'); if (live) live.textContent = msg; };

    // Under 18: the product's two messages, no second attempt, no way round (age-gate-copy.ts).
    function blocked(kind) {
      const minor = kind === 'minor';
      const el = h(`<div class="fr-step fr-blocked"><span class="fr-back fr-back-ghost" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>Back</span>
        <h1 class="fr-q" tabindex="-1">${minor ? 'Athlesite accounts for athletes under 18 aren’t available yet.' : 'Athlesite isn’t available for athletes under 13.'}</h1>
        <p class="fr-sub">${minor ? 'We’re building guardian approval before opening this part of the pilot. Thanks for your patience — we’d love to have you when it’s ready.' : 'Thanks for checking us out. We hope to see you here when you’re older.'}</p>
        <div class="fr-actions"><a class="fr-skip" href="${HOME}">Back to Athlesite</a></div>
      </div>`);
      root.classList.add('is-blocked');
      stage.replaceChildren(el);
      el.querySelector('.fr-q').focus({ preventScroll: true });
    }

    const setup = [
      // 1 · Level, then the class year
      () => {
        const el = h(`<div class="fr-step">${head(0, 'Where do you play?', 'About a minute. Everything can be changed later.')}
          <div class="fr-choices" role="group" aria-label="Level">
            <button type="button" class="fr-choice" data-v="hs"><b>High school</b><span>Class year, recruiting</span></button>
            <button type="button" class="fr-choice" data-v="college"><b>College</b><span>Eligibility, NIL, the portal</span></button>
          </div>
          <div class="fr-years" hidden><p class="fr-label"></p><div class="fr-chips"></div></div>
        </div>`);
        const years = el.querySelector('.fr-years');
        const showYears = () => {
          const college = st.level === 'college';
          years.hidden = false;
          years.querySelector('.fr-label').textContent = college ? 'What year are you in?' : 'What’s your class?';
          const list = college ? COLLEGE_YEARS : classYears().map(String);
          years.querySelector('.fr-chips').innerHTML = list.map((y) => `<button type="button" class="fr-chip${st.year === y ? ' is-on' : ''}" data-y="${esc(y)}">${college ? esc(y) : `Class of ${esc(y)}`}</button>`).join('') + '<button type="button" class="fr-skip" data-y="">Skip</button>';
          years.classList.remove('is-new'); void years.offsetWidth; years.classList.add('is-new');
        };
        el.querySelectorAll('.fr-choice').forEach((b) => {
          b.classList.toggle('is-on', b.dataset.v === st.level);
          b.addEventListener('click', () => {
            if (st.level !== b.dataset.v) st.year = '';
            st.level = b.dataset.v;
            el.querySelectorAll('.fr-choice').forEach((x) => x.classList.toggle('is-on', x === b));
            showYears();
            const first = years.querySelector('.fr-chip');
            if (first) first.focus({ preventScroll: true });
          });
        });
        years.addEventListener('click', (e) => {
          const b = e.target.closest('[data-y]');
          if (!b) return;
          st.year = b.dataset.y;
          to(1);
        });
        if (st.level) showYears();
        return el;
      },
      // 2 · Name
      () => {
        const el = h(`<div class="fr-step">${head(1, 'What’s your name?', 'The way you want it on your page.')}
          <form class="fr-form" novalidate>
            <div class="field-row">
              <label class="field"><span class="field-label">First name</span><input name="first" autocomplete="given-name" maxlength="40" spellcheck="false"></label>
              <label class="field"><span class="field-label">Last name</span><input name="last" autocomplete="family-name" maxlength="40" spellcheck="false"></label>
            </div>
            <div class="fr-actions"><button type="submit" class="btn btn-go" disabled>Continue</button></div>
          </form>
        </div>`);
        const f = el.querySelector('form'), go_ = f.querySelector('.btn-go');
        f.first.value = st.first; f.last.value = st.last;
        const sync = () => { st.first = f.first.value; st.last = f.last.value; go_.disabled = !st.first.trim(); };
        f.addEventListener('input', sync);
        f.addEventListener('submit', (e) => { e.preventDefault(); sync(); if (st.first.trim()) to(2); else f.first.focus(); });
        sync();
        el._focus = () => f.first.focus({ preventScroll: true });
        return el;
      },
      // 3 · Sport
      () => {
        const el = h(`<div class="fr-step">${head(2, `What do you play${st.first.trim() ? ', ' + esc(st.first.trim()) : ''}?`, 'Your page will suggest stats and links for it. Nothing gets filled in for you.')}
          <div class="fr-chips fr-sports">${SPORTS.map((k) => `<button type="button" class="fr-chip${st.sport === k ? ' is-on' : ''}" data-v="${k}">${esc(A.SPORT_CATALOG[k].label)}</button>`).join('')}<button type="button" class="fr-chip${st.sport === 'other' ? ' is-on' : ''}" data-v="other">Something else</button></div>
          <div class="fr-actions"><button type="button" class="fr-skip">Skip</button></div>
        </div>`);
        el.querySelector('.fr-sports').addEventListener('click', (e) => {
          const b = e.target.closest('[data-v]');
          if (!b) return;
          if (st.sport !== b.dataset.v) { st.position = ''; }
          st.sport = b.dataset.v;
          to(3);
        });
        el.querySelector('.fr-skip').addEventListener('click', () => { st.sport = ''; st.position = ''; to(3); });
        return el;
      },
      // 4 · Position (catalog suggestions or their own words) + number
      () => {
        const sport = A.SPORT_CATALOG[st.sport];
        const positions = sport ? sport.positions : [];
        const number = !sport || sport.number;
        const custom = st.position && !positions.some((p) => p.label === st.position);
        const el = h(`<div class="fr-step">${head(3, (sport && sport.words.ask) || (positions.length ? 'What position?' : 'Position, event or weight class?'), 'Optional. Leave anything blank you’d rather add later.')}
          <form class="fr-form" novalidate>
            ${positions.length ? `<div class="fr-chips fr-pos" role="group" aria-label="${esc((sport && sport.words.position) || 'Positions')}">${positions.map((p) => `<button type="button" class="fr-chip${st.position === p.label ? ' is-on' : ''}" data-v="${esc(p.label)}" aria-pressed="${st.position === p.label}">${esc(p.label)}</button>`).join('')}</div>` : ''}
            <div class="field-row">
              <label class="field"><span class="field-label">${positions.length ? 'Or in your own words' : esc((sport && sport.words.position) || 'Position or event')}</span><input name="pos" maxlength="40" autocomplete="off" value="${custom ? esc(st.position) : ''}" placeholder="${positions.length ? 'However you’d put it' : 'e.g. 400m, 152 lb, goalie'}"></label>
              ${number ? `<label class="field is-short"><span class="field-label">Number</span><input name="num" inputmode="numeric" autocomplete="off" maxlength="3" value="${esc(st.number)}" placeholder="14"></label>` : ''}
            </div>
            <div class="fr-actions"><button type="submit" class="btn btn-go">Continue</button><button type="button" class="fr-skip">Skip</button></div>
          </form>
        </div>`);
        const f = el.querySelector('form');
        const chips = el.querySelector('.fr-pos');
        if (chips) chips.addEventListener('click', (e) => {
          const b = e.target.closest('[data-v]');
          if (!b) return;
          const on = st.position !== b.dataset.v;
          st.position = on ? b.dataset.v : '';
          f.pos.value = '';
          chips.querySelectorAll('[data-v]').forEach((x) => { x.classList.toggle('is-on', on && x === b); x.setAttribute('aria-pressed', String(on && x === b)); });
        });
        f.pos.addEventListener('input', () => {
          st.position = f.pos.value;
          if (chips) chips.querySelectorAll('[data-v]').forEach((x) => { x.classList.remove('is-on'); x.setAttribute('aria-pressed', 'false'); });
        });
        if (f.num) f.num.addEventListener('input', () => { f.num.value = f.num.value.replace(/[^0-9]/g, '').slice(0, 3); st.number = f.num.value; });
        f.addEventListener('submit', (e) => { e.preventDefault(); to(4); });
        el.querySelector('.fr-skip').addEventListener('click', () => { st.position = ''; st.number = ''; to(4); });
        return el;
      },
      // 5 · Cover photo (optional), then into the editor
      () => {
        const el = h(`<div class="fr-step">${head(4, 'Add a cover photo?', 'A game shot or a portrait. It goes at the top of your page; you can change it any time.')}
          <div class="fr-drop">
            <div class="fr-drop-shot"${st.photo ? '' : ' hidden'}><img alt="Your cover photo"></div>
            <div class="fr-drop-say"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg><span>Drop a photo here</span></div>
          </div>
          <p class="fr-note" hidden></p>
          <div class="fr-actions"><button type="button" class="btn btn-go fr-next"${st.photo ? '' : ' hidden'}>Build my page<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button><span class="fr-pick"></span><button type="button" class="fr-skip"></button></div>
          ${replacing ? '<p class="fr-replace">This replaces the page saved on this device (Undo brings it back). <button type="button" class="link-btn fr-save">Save a copy first</button></p>' : ''}
        </div>`);
        const shot = el.querySelector('.fr-drop-shot'), img = shot.querySelector('img'), note = el.querySelector('.fr-note');
        const goBtn = el.querySelector('.fr-next'), skip = el.querySelector('.fr-skip');
        const show = () => {
          shot.hidden = !st.photo;
          el.querySelector('.fr-drop').classList.toggle('has-photo', !!st.photo);
          if (st.photo) img.src = st.photo.url;
          goBtn.hidden = !st.photo;
          skip.textContent = st.photo ? 'Remove photo' : 'Skip and build my page';
          picker.setText(st.photo ? 'Choose another' : 'Choose a photo');
          picker.el.classList.toggle('btn-go', !st.photo); // one dark button at a time: the next thing to do
          note.hidden = !(st.photo && st.photo.small);
          note.textContent = 'This photo is on the small side, so it may look soft on big screens. A larger one will look sharper.';
        };
        const take = (files) => {
          const f = files[0];
          if (!f) return;
          st.photo = { ref: f.ref, url: S.photos.url(f.ref), small: f.small };
          show();
          goBtn.focus({ preventScroll: true });
        };
        const picker = S.photoInput.fileButton('Choose a photo', false, take);
        el.querySelector('.fr-pick').append(picker.el);
        S.photoInput.dropZone(el.querySelector('.fr-drop'), take);
        goBtn.addEventListener('click', finish);
        skip.addEventListener('click', () => { if (st.photo) { st.photo = null; show(); } else finish(); });
        const save = el.querySelector('.fr-save');
        if (save) save.addEventListener('click', () => S.files && S.files.save(S.store.get()));
        show();
        el._focus = () => picker.el.querySelector('input').focus({ preventScroll: true });
        return el;
      },
    ];
    const steps = [...(account ? accountSteps : []), ...setup];

    function go(i) {
      if (i === at) return;
      const dir = i > at ? 1 : -1, old = stage.firstElementChild;
      at = i;
      const el = steps[i]();
      bar.style.setProperty('--p', (i + 1) / TOTAL);
      root.classList.toggle('is-account', i < PRE);
      bar.setAttribute('aria-valuenow', String(i + 1));
      const back = el.querySelector('.fr-back');
      if (back) back.addEventListener('click', () => go(i - 1));
      const enter = () => {
        stage.append(el);
        if (!reduced()) el.animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
        stage.scrollTop = 0;
        (el._focus || (() => el.querySelector('.fr-q').focus({ preventScroll: true })))();
      };
      if (!old || reduced()) { if (old) old.remove(); enter(); return; }
      old.style.pointerEvents = 'none';
      old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${dir * -20}px)` }], { duration: 150, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' }).onfinish = () => { old.remove(); enter(); };
    }
    go(0);
    return { close };
  }

  S.firstRun = { open };
})();
