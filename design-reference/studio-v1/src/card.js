/*
 * Athlesite — cover cards.
 *
 * A portrait card (about 3:4) per look, built from the athlete's real page: the cover photo and
 * its focus point, name, number, key stats, and the look's own fonts and colors. Real covers
 * don't crop to this shape (Portrait loses the name, Prospect gets too small to read), so each
 * look's cover is recomposed for it, the way a magazine makes a cover from a feature.
 *
 * Where cards show:
 *   - the homepage's examples carousel (homepage-v2 Section 02): 340×460 cards, 290×400 on tablets,
 *     250×350 on phones; an opened card flies into the homepage phone, then the live page replaces it
 *   - cards.html, the internal review page
 *   (The Studio's setup used them to pick a look until Willy dropped that screen in session 4.)
 * Every size inside a card is in cqw (card widths), so one design works at every size.
 *
 *   A.renderCard(profile, { look })  HTML for one card; the host gives it a width and height
 *   A.cardFonts(profile, { look })   the stylesheet URL for that card's fonts (load it once)
 *   A.fitCards(root)                 after fonts load: shrinks any name line that still overflows
 */
(function () {
  const A = window.Athlesite;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** The profile as it would look in another look (that look's own palette, fonts and cover). */
  function inLook(profile, look) {
    if (!look || look === profile.design.look) return profile;
    const design = Object.assign({}, profile.design, { look, palette: '', type: '', photo: '', layout: Object.assign({}, profile.design.layout, { cover: '', mirror: false }) });
    return { data: profile.data, design };
  }

  const photo = (c) => (c.photo ? `<img class="ac-ph" src="${esc(c.photo.url)}" alt="" decoding="async" style="${c.photo.style}">` : '');
  /** Up to n numbers for the card: the featured stats first, then height and weight. */
  function numbers(c, n) {
    const out = c.featured.map((s) => [s.value, s.label]);
    if (out.length < n && c.d.heightIn) out.push([A.heightLabel(c.d.heightIn), 'Height']);
    if (out.length < n && c.d.weightLb) out.push([String(c.d.weightLb), 'Weight']);
    return out.slice(0, n);
  }
  // Each phrase stays whole ("Class of 2026" never breaks); lines break between phrases.
  const join = (list, sep) => list.filter(Boolean).map((x) => `<span class="ac-it">${esc(x)}</span>`).join(`<i class="ac-sep" aria-hidden="true">${sep}</i><wbr>`);
  const twoLines = (c, tag = 'span') => `<span>${esc(c.first)}</span> <${tag}>${esc(c.last)}</${tag}>`;

  const CARDS = {
    // Film first: the photo fills the card, the number stands behind in outline, name and numbers at the foot.
    cinematic(c) {
      const strip = numbers(c, 3);
      const num = c.d.jerseyNumber;
      return `${photo(c)}<i class="ac-shade" aria-hidden="true"></i>
        ${c.photo ? (num ? `<span class="ac-num" aria-hidden="true">${esc(num)}</span>` : '') : `<span class="ac-void" aria-hidden="true">${esc(num || c.initials)}</span>`}
        <div class="ac-body">
          ${c.kicker.length ? `<p class="ac-kicker"><i aria-hidden="true"></i>${join(c.kicker, '/')}</p>` : ''}
          <p class="ac-name">${twoLines(c, 'b')}</p>
          ${strip.length ? `<dl class="ac-strip">${strip.map(([v, l]) => `<div><dd>${esc(v)}</dd><dt>${esc(l)}</dt></div>`).join('')}</dl>` : ''}
        </div>`;
    },
    // A magazine feature: words on the left, the portrait on the right, a byline rule at the foot.
    editorial(c) {
      const byline = [c.d.schoolOrTeam, c.d.jerseyNumber && `No. ${c.d.jerseyNumber}`];
      return `${c.photo ? `<div class="ac-fig">${photo(c)}<i class="ac-shade" aria-hidden="true"></i></div>` : ''}
        <div class="ac-copy">
          <p class="ac-rubric">${join([c.sportName, c.d.position, c.year.long], '·')}</p>
          <p class="ac-name">${twoLines(c, 'em')}</p>
          ${c.d.tagline ? `<p class="ac-stand">${esc(c.d.tagline)}</p>` : ''}
        </div>
        ${byline.some(Boolean) ? `<p class="ac-foot">${join(byline, '/')}</p>` : ''}`;
    },
    // Loud: the number the size of the card, the name in caps, three stats like a scoreboard.
    highlight(c) {
      const big = c.d.jerseyNumber || c.initials;
      const tiles = numbers(c, 3);
      return `${photo(c)}<i class="ac-shade" aria-hidden="true"></i>
        <span class="ac-big${c.photo && c.d.heroPhotoPositionX > 0.55 ? ' is-left' : ''}" data-len="${String(big).length}" aria-hidden="true">${esc(big)}</span>
        <div class="ac-body">
          <p class="ac-tag">${join([c.d.position, c.year.short, c.d.schoolOrTeam], '/')}</p>
          <p class="ac-name">${twoLines(c)}</p>
          ${tiles.length ? `<dl class="ac-board">${tiles.map(([v, l]) => `<div><dd>${esc(v)}</dd><dt>${esc(l)}</dt></div>`).join('')}</dl>` : ''}
        </div>`;
    },
    // A gallery print: one matted portrait, the name in a serif, a small placard beside it.
    portrait(c) {
      const lines = [c.d.position, c.year.long, c.d.schoolOrTeam].filter(Boolean);
      return `<div class="ac-mat">${c.photo ? photo(c) : `<span class="ac-mono" aria-hidden="true">${esc(c.initials)}</span>`}</div>
        <div class="ac-cap">
          <p class="ac-name">${twoLines(c, 'em')}</p>
          ${lines.length ? `<p class="ac-placard">${lines.map(esc).join('<br>')}</p>` : ''}
        </div>`;
    },
    // A spec sheet: photo band, name and line, the status chips, then the numbers a coach scans for.
    prospect(c) {
      const keys = [...numbers(c, 5), c.d.gpa && [c.d.gpa, 'GPA']].filter(Boolean).slice(0, 6); // the banner cover shows four
      const chips = [...c.statuses, c.d.jerseyNumber && `No. ${c.d.jerseyNumber}`].filter(Boolean).slice(0, 2);
      return `${c.photo ? `<div class="ac-band">${photo(c)}</div>` : ''}
        <div class="ac-main">
          <p class="ac-kicker">${c.photo ? '' : `<span class="ac-badge" aria-hidden="true">${esc(c.initials)}</span>`}${join(c.kicker, '·')}</p>
          <p class="ac-name"><span>${esc(c.name)}</span></p>
          ${c.d.position || c.d.schoolOrTeam ? `<p class="ac-line">${join([c.d.position, c.d.schoolOrTeam], '—')}</p>` : ''}
          ${chips.length ? `<p class="ac-chips">${chips.map((x, i) => `<span${i < c.statuses.length ? ' class="is-on"' : ''}>${esc(x)}</span>`).join('')}</p>` : ''}
          ${keys.length ? `<dl class="ac-keys">${keys.map(([v, l]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
        </div>`;
    },
  };

  function renderCard(profile, opts = {}) {
    const c = A.cardContext(inLook(profile, opts.look));
    const id = CARDS[c.look.id] ? c.look.id : 'cinematic';
    // The athlete's own choices make their card theirs, as on the page: cover layout and mirror
    // here; colors, accent, fonts and photo treatment ride in with the page's variables.
    const layout = c.design.layout || {};
    const covers = c.look.covers || [];
    const cover = covers.find((v) => v.id === layout.cover) || covers[0] || { id: 'default' };
    const mirror = layout.mirror && (cover.mirror === 'always' || (cover.mirror === 'subject-left' && (!c.photo || c.d.heroPhotoPositionX < 0.45)));
    // The longest line of the name sets a first-guess size before fonts load (fitCards refines it).
    const oneLine = id === 'prospect' || (id === 'editorial' && cover.id === 'stacked') || (id === 'portrait' && cover.id === 'center');
    const len = oneLine ? c.name.length : Math.max(c.first.length, c.last.length, 3);
    const cls = ['ac', `ac-${id}`, `ac-cv-${cover.id}`, mirror ? 'is-mirror' : '', c.palette.dark ? 'is-dark' : '', c.photo ? '' : 'no-photo', `ac-tone-${c.tone}`].filter(Boolean).join(' ');
    return `<div class="${cls}" style="${esc(c.vars)};--len:${len}" role="img" aria-label="${esc(`${c.name}, ${c.look.name} look`)}">${CARDS[id](c)}</div>`;
  }

  const cardFonts = (profile, opts = {}) => A.cardContext(inLook(profile, opts.look)).fonts;

  /**
   * Names are long or short; every line of a card's name must fit its column. Reads every card
   * first, then writes, so a row of cards is laid out once. Uses layout sizes (offsetWidth), so it
   * works while a card is scaled or turned in 3D.
   */
  function fitCards(root = document) {
    const names = [...root.querySelectorAll('.ac-name')];
    names.forEach((el) => (el.style.fontSize = ''));
    // Sizes are written in card widths (cqw), so they stay right when the card is resized later.
    const sizes = names.map((el) => {
      const room = el.clientWidth, card = el.closest('.ac').clientWidth;
      // A name is one or two lines depending on the cover: measure each row of its parts.
      const rows = new Map();
      [...el.children].forEach((s) => {
        const r = rows.get(s.offsetTop) || [Infinity, -Infinity];
        rows.set(s.offsetTop, [Math.min(r[0], s.offsetLeft), Math.max(r[1], s.offsetLeft + s.offsetWidth)]);
      });
      const widest = Math.max(0, ...[...rows.values()].map(([a, b]) => b - a));
      return room && card && widest > room ? (parseFloat(getComputedStyle(el).fontSize) * (room / widest) * 0.98 * 100) / card : 0;
    });
    names.forEach((el, i) => { if (sizes[i]) el.style.fontSize = sizes[i].toFixed(3) + 'cqw'; });
  }

  A.renderCard = renderCard;
  A.cardFonts = cardFonts;
  A.fitCards = fitCards;
  A.CARD_LOOKS = Object.keys(CARDS);
})();
