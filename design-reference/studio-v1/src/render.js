/*
 * Athlesite Studio — site renderer.
 *
 * renderSite(profile, opts) → a complete HTML document for the athlete's page.
 * The document is self-describing: it pulls its fonts, base.css, the look's
 * CSS, and site.js, and carries the palette as CSS custom properties.
 *
 * Each look (src/looks/*.js) registers { meta, palettes, order, hero, sections }.
 * A look overrides any section renderer it wants; the rest fall back to the
 * shared defaults below. Every element a future editor can click carries
 * data-section / data-field.
 */
(function () {
  const A = window.Athlesite;
  const LOOKS = (A.LOOKS = A.LOOKS || {});

  // — helpers —
  /** A line of items ("Wide receiver / '27 / Northview") that wraps between items, never inside one;
   *  the separator sticks to the item before it, and site.js hides one left at the end of a line. */
  const items = (list, sep) => list.map((x) => `<span class="it">${esc(x)}</span>`).join(`&nbsp;${sep} `);
  const dotItems = (list) => items(list.filter(Boolean), '<i class="sep" aria-hidden="true">·</i>');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paragraphs = (text) => String(text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

  // Athlete-entered URLs reach visitors' browsers, so only web links pass (no javascript:, data: HTML, etc.).
  const safeLink = (u) => (/^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#][^\s]*)?$/i.test(String(u || '').trim()) ? String(u).trim() : '');
  // Images may also be local paths, uploaded data URLs, or (in the Studio's preview only) the object
  // URLs of photos stored on this device — a blob: URL can only point at this page's own data.
  const safeImage = (u) => {
    const s = String(u || '').trim();
    return /^(https?:\/\/|blob:[\w:/.-]+$|data:image\/(png|jpe?g|webp|gif|avif);base64,|(\.{0,2}\/)?[\w-]+(\/[\w.-]+)*\.(png|jpe?g|webp|gif|avif|svg)$)/i.test(s) ? s : '';
  };

  function platformOf(url) {
    const u = String(url || '').toLowerCase();
    if (u.includes('hudl.com')) return 'Hudl';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
    if (u.includes('vimeo.com')) return 'Vimeo';
    if (u.includes('instagram.com')) return 'Instagram';
    if (u.includes('tiktok.com')) return 'TikTok';
    return u ? 'Video' : '';
  }

  const SOCIAL = [
    ['instagram', 'Instagram', (h) => `https://instagram.com/${encodeURIComponent(h)}`],
    ['twitter', 'X', (h) => `https://x.com/${encodeURIComponent(h)}`],
    ['tiktok', 'TikTok', (h) => `https://tiktok.com/@${encodeURIComponent(h)}`],
    ['hudl', 'Hudl', (h) => `https://www.hudl.com/profile/${h.split('/').map(encodeURIComponent).join('/')}`],
    ['youtube', 'YouTube', (h) => `https://youtube.com/@${encodeURIComponent(h)}`],
    ['website', 'Website', (h) => safeLink(/^https?:/i.test(h) ? h : `https://${h}`)],
  ];
  // People paste their profile link as often as their handle. A link on that platform's own site
  // is cut down to the handle; the link is always rebuilt on the platform's domain above, so a
  // pasted link can't point anywhere else.
  const SOCIAL_HOSTS = { instagram: /(^|\.)instagram\.com$/, twitter: /(^|\.)(x|twitter)\.com$/, tiktok: /(^|\.)tiktok\.com$/, youtube: /(^|\.)youtube\.com$/, hudl: /(^|\.)hudl\.com$/ };
  function handleOf(key, raw) {
    let h = String(raw || '').trim();
    if (SOCIAL_HOSTS[key] && /^(https?:\/\/)?([\w-]+\.)*[\w-]+\.[a-z]{2,}\//i.test(h)) {
      try {
        const u = new URL(/^https?:\/\//i.test(h) ? h : `https://${h}`);
        if (SOCIAL_HOSTS[key].test(u.hostname.toLowerCase())) {
          const parts = u.pathname.split('/').filter(Boolean);
          h = key === 'hudl' ? parts.slice(parts[0] === 'profile' ? 1 : 0).join('/') : parts[0] || '';
        }
      } catch (e) { /* not a link after all: keep it as a handle */ }
    }
    return h.replace(/^@/, '');
  }
  function socialLinks(d) {
    return SOCIAL.filter(([k]) => d.social[k]).map(([k, label, url]) => {
      const handle = handleOf(k, d.social[k]);
      return { key: k, label, handle, url: handle ? url(handle) : '' };
    }).filter((s) => s.url);
  }

  function photoStyle(d) {
    const x = Math.round(d.heroPhotoPositionX * 100), y = Math.round(d.heroPhotoPositionY * 100);
    return `object-position:${x}% ${y}%;transform-origin:${x}% ${y}%;transform:scale(${d.heroPhotoZoom})`;
  }

  function contactHref(d) {
    const c = d.recruitingContact.trim();
    if (!c) return '';
    if (isEmail(c)) return `mailto:${c}?subject=${encodeURIComponent(A.fullName(d) ? `About ${A.fullName(d)}` : 'Hello')}`;
    return safeLink(c);
  }

  /** NIL inquiries: their NIL contact (email or link), else their main contact, with a subject brands can't miss. */
  function nilHref(d) {
    const c = String(d.nilContact || '').trim();
    const subject = encodeURIComponent(`NIL inquiry: ${A.fullName(d) || 'partnership'}`);
    if (c) return isEmail(c) ? `mailto:${c}?subject=${subject}` : safeLink(c);
    const main = d.recruitingContact.trim();
    return isEmail(main) ? `mailto:${main}?subject=${subject}` : safeLink(main);
  }

  /*
   * Recruiting and results profiles. The name shown always comes from the link's own address, so a
   * link can only say "On3" if it really goes to on3.com; anything else shows its plain domain.
   */
  const PROFILE_SITES = [
    ['On3', 'on3.com'], ['247Sports', '247sports.com'], ['Rivals', 'rivals.com'], ['ESPN', 'espn.com'],
    ['MaxPreps', 'maxpreps.com'], ['Hudl', 'hudl.com'], ['NCSA', 'ncsasports.org'], ['SportsRecruits', 'sportsrecruits.com'],
    ['Perfect Game', 'perfectgame.org'], ['Prep Baseball', 'prepbaseballreport.com'], ['Extra Inning Softball', 'extrainningsoftball.com'],
    ['TopDrawerSoccer', 'topdrawersoccer.com'], ['Athletic.net', 'athletic.net'], ['MileSplit', 'milesplit.com'], ['TFRRS', 'tfrrs.org'],
    ['SwimCloud', 'swimcloud.com'], ['Elite Prospects', 'eliteprospects.com'], ['Trackwrestling', 'trackwrestling.com'],
    ['FloWrestling', 'flowrestling.org'], ['Sports Reference', 'sports-reference.com'], ['Concept2', 'concept2.com'], ['row2k', 'row2k.com'],
  ];
  function profiles(d) {
    return d.profileLinks.map((l) => l.url).filter(Boolean).map((url) => {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      const site = PROFILE_SITES.find(([, domain]) => host === domain || host.endsWith('.' + domain));
      return { label: site ? site[0] : host, url };
    });
  }

  /** The sport's name for the page, or '' when they skipped it or chose "Something else" (never "Other"). */
  const sportName = (d) => (d.sport && d.sport !== 'other' && A.SPORTS[d.sport] ? A.SPORTS[d.sport].label : '');

  /** Facts for details/spec views, in a stable order, empty ones dropped. */
  function facts(d) {
    return [
      ['Sport', sportName(d)],
      [(A.SPORTS[d.sport] && A.SPORTS[d.sport].positionWord) || 'Position', d.position],
      ['Number', d.jerseyNumber && `No. ${d.jerseyNumber}`],
      ...(d.level === 'college'
        ? [['Year', yearLabels(d).long], ['Eligibility', d.eligibility && `${d.eligibility} left`], ['School', d.schoolOrTeam], ['Division', d.division], ['Conference', d.conference]]
        : [['Class', d.classYear], ['School', d.schoolOrTeam]]),
      // The sport's own details (bats/throws, dominant foot, club team…), in the catalog's order.
      ...(A.SPORT_CATALOG[d.sport] || A.SPORT_CATALOG.other || { details: [] }).details.filter((x) => !(d.level === 'college' && A.HS_ONLY_DETAILS && A.HS_ONLY_DETAILS.has(x.key))).map((x) => [x.label, (d.sportDetails || {})[x.key]]),
      ['Hometown', A.location(d)],
      ['Height', A.heightLabel(d.heightIn)],
      ['Weight', d.weightLb ? `${d.weightLb} lb` : ''],
      ['GPA', d.gpa],
      ['Intended major', d.intendedMajor],
    ].filter(([, v]) => v);
  }

  /** Poster for a film card: its own poster, else the first gallery photo, else the cover at its focal point. */
  /** A gallery photo's or poster's focus point as object-position ('' = the middle). Numbers only. */
  function focusStyle(item) {
    if (!item || (typeof item.x !== 'number' && typeof item.y !== 'number')) return '';
    const x = Math.round((typeof item.x === 'number' ? item.x : 0.5) * 1000) / 10, y = Math.round((typeof item.y === 'number' ? item.y : 0.5) * 1000) / 10;
    return ` style="object-position:${x}% ${y}%"`;
  }

  function filmPoster(c, item) {
    // Their poster with its focus point; otherwise the first gallery photo with that one's.
    const own = item.poster ? item : null, g = own ? null : c.d.gallery.find((x) => x.src);
    const src = own ? own.poster : g && g.src;
    if (src) return `<img src="${esc(src)}" decoding="async" alt="" loading="lazy"${focusStyle(own || g)}>`;
    if (c.photo) return `<img src="${esc(c.photo.url)}" decoding="async" alt="" loading="lazy" style="${c.photo.style}">`;
    return '';
  }

  // Only "open" is worth announcing; "not open" is not the same as committed, so it shows nothing.
  const COLLEGE_SHORT = { Freshman: 'Fr.', Sophomore: 'So.', Junior: 'Jr.', Senior: 'Sr.', Graduate: 'Gr.' };

  /** How the athlete's year reads: "Class of 2027" in high school, "Redshirt junior" in college. */
  function yearLabels(d) {
    if (d.level === 'college') {
      if (!d.academicYear) return { long: '', short: '' };
      return {
        long: (d.redshirt ? `Redshirt ${d.academicYear.toLowerCase()}` : d.academicYear),
        short: (d.redshirt ? 'RS ' : '') + (COLLEGE_SHORT[d.academicYear] || d.academicYear),
      };
    }
    return d.classYear ? { long: `Class of ${d.classYear}`, short: `’${String(d.classYear).slice(-2)}` } : { long: '', short: '' };
  }

  /**
   * Status badges worth announcing. Only positive, opt-in statuses show: "not open" is not
   * the same as committed, so it shows nothing.
   */
  function statuses(d) {
    const out = [];
    if (d.level === 'college') {
      if (d.transferPortal) out.push('In the transfer portal');
      if (d.draftEligible && (!A.DRAFT_SPORTS || A.DRAFT_SPORTS.has(d.sport))) out.push('Draft eligible');
    } else if (d.recruitingStatus === 'open') out.push('Open to recruiting');
    else if (d.recruitingStatus === 'committed') out.push(d.committedTo ? `Committed to ${d.committedTo}` : 'Committed');
    if (d.nilOpen) out.push('Open to NIL');
    return out;
  }

  // — context passed to every renderer —
  /** A copy of the data with every URL passed through the allow-lists, so no template can forget. */
  function cleanData(raw) {
    return Object.assign({}, raw, {
      heroPhotoUrl: safeImage(raw.heroPhotoUrl),
      highlightLinks: raw.highlightLinks.map((h) => Object.assign({}, h, { url: safeLink(h.url), poster: safeImage(h.poster) })),
      gallery: raw.gallery.map((g) => Object.assign({}, g, { src: safeImage(g.src) })),
      profileLinks: raw.profileLinks.map((l) => ({ url: safeLink(l && l.url) })),
    });
  }

  function buildContext(profile, opts) {
    const d = cleanData(profile.data), design = profile.design;
    const look = LOOKS[design.look] || LOOKS.cinematic;
    const palette = look.palettes.find((p) => p.id === design.palette) || look.palettes[0];
    const type = (look.types || []).find((t) => t.id === design.type) || (look.types || [])[0] || {};
    const sport = A.sportOf(d);
    const name = A.fullName(d) || 'Your Name';
    const sections = A.visibleSections({ data: d, design }, look.order);
    const featured = d.stats.filter((s) => s.value).slice(0, 3);
    const titles = Object.assign(
      { film: sport.filmTitle, stats: sport.statsTitle, results: A.resultsSetup(d).title, story: 'About', milestones: 'Milestones', gallery: 'Gallery', details: 'Details', custom: d.custom.title || 'More', nil: d.firstName ? `Work with ${d.firstName}` : 'Work with me' },
      look.titles ? look.titles(d, sport) : {}
    );
    // Short labels where a section's title is too long for the nav.
    const navTitles = Object.assign({}, titles, { nil: 'NIL', results: 'Results' });
    return {
      d, design, look, palette, type, sport, name, sections, featured, titles, navTitles, opts,
      results: A.resultsSetup(d),
      nilContact: nilHref(d),
      profiles: profiles(d),
      first: d.firstName || 'Your', last: d.lastName || 'Name',
      initials: A.initials(d),
      photo: d.heroPhotoUrl ? { url: d.heroPhotoUrl, alt: d.heroPhotoAlt || name, style: photoStyle(d) } : null,
      contact: contactHref(d),
      socials: socialLinks(d),
      facts: facts(d),
      statuses: statuses(d),
      year: yearLabels(d),
      sportName: sportName(d),
      kicker: [sportName(d), yearLabels(d).long].filter(Boolean),
      meta: [d.position, d.jerseyNumber && `No. ${d.jerseyNumber}`, d.schoolOrTeam].filter(Boolean),
      // data-item="stats:2": which entry of which list an element shows (the Studio opens that row).
      h: { esc, items, paragraphs, platformOf, isEmail, focus: focusStyle, item: (list, obj) => { const i = (d[list] || []).indexOf(obj); return i < 0 ? '' : ' data-item="' + list + ':' + i + '"'; } },
    };
  }

  // — shared default section renderers (looks override what makes them distinct) —
  const DEFAULTS = {
    /**
     * Nav: the athlete's mark, the sections in one capsule with a marker that slides to the
     * section you're in (site.js), and Contact as the one solid button. On phones the sections
     * fold into a Menu sheet. Looks that sign with the full name set navMark: 'name'.
     */
    nav(c) {
      const links = c.sections.map((k) => `<a href="#${k}">${esc(c.navTitles[k])}</a>`).join('');
      const byName = c.look.navMark === 'name';
      const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>';
      return `<header class="nav" data-section="nav">
        <a class="nav-mark" href="#top" aria-label="${esc(c.name)}, top of page">${byName ? `<span class="nm-full">${esc(c.name)}</span><span class="nm-short">${esc(c.initials)}</span>` : esc(c.initials)}</a>
        ${byName ? '' : `<span class="nav-name" aria-hidden="true">${esc(c.name)}</span>`}
        ${links ? `<nav class="nav-links" aria-label="Sections"><span class="nav-ind" aria-hidden="true"></span>${links}</nav>` : ''}
        ${links ? `<button class="nav-menu" type="button" aria-expanded="false" aria-controls="nav-sheet"><span class="nav-menu-icon" aria-hidden="true"></span>Menu</button>` : ''}
        ${c.contact ? `<a class="nav-cta" href="${esc(c.contact)}">Contact${arrow}</a>` : ''}
      </header>
      ${links ? `<div class="nav-sheet" id="nav-sheet" role="dialog" aria-modal="true" aria-label="Sections" hidden>
        <button class="nav-close" type="button" aria-label="Close menu"></button>
        <ol class="nav-sheet-list">${c.sections.map((k, i) => `<li style="--i:${i}"><a href="#${k}"><span class="nav-sheet-n">${String(i + 1).padStart(2, '0')}</span>${esc(c.titles[k])}</a></li>`).join('')}</ol>
        ${c.contact ? `<a class="nav-sheet-cta" href="${esc(c.contact)}">Contact ${esc(c.first)}${arrow}</a>` : ''}
      </div>` : ''}`;
    },

    film(c) {
      const items = c.d.highlightLinks.filter((x) => x.label || x.url);
      const [lead, ...rest] = items;
      const poster = filmPoster(c, lead);
      return `<section class="sec s-film" id="film" data-section="film">
        <div class="wrap">
          <h2 class="sec-title" data-reveal>${esc(c.titles.film)}</h2>
          <div class="film-body">
            <a class="film-lead" ${lead.url ? `href="${esc(lead.url)}" target="_blank" rel="noopener"` : ''} data-reveal${c.h.item('highlightLinks', lead)}>
              <span class="film-poster">${poster}<span class="film-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></span>
              <span class="film-caption"><strong>${esc(lead.label || 'Highlights')}</strong>${lead.url ? `<small>Watch on ${esc(platformOf(lead.url))} ↗</small>` : ''}</span>
            </a>
            ${rest.length ? `<ul class="film-list">${rest.map((x, i) => `<li data-reveal${c.h.item('highlightLinks', x)}><a ${x.url ? `href="${esc(x.url)}" target="_blank" rel="noopener"` : ''}><span class="film-index">${String(i + 2).padStart(2, '0')}</span><span class="film-label">${esc(x.label || 'Highlights')}</span><span class="film-platform">${esc(platformOf(x.url))} ↗</span></a></li>`).join('')}</ul>` : ''}
          </div>
        </div>
      </section>`;
    },

    stats(c) {
      const items = c.d.stats.filter((s) => s.value);
      return `<section class="sec s-stats" id="stats" data-section="stats">
        <div class="wrap">
          <h2 class="sec-title" data-reveal>${esc(c.titles.stats)}</h2>
          <dl class="stat-grid">${items.map((s) => `<div class="stat" data-reveal${c.h.item('stats', s)}><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd>${s.context ? `<p class="stat-context">${esc(s.context)}</p>` : ''}</div>`).join('')}</dl>
        </div>
      </section>`;
    },

    story(c) {
      const [first, ...rest] = paragraphs(c.d.bio);
      return `<section class="sec s-story" id="story" data-section="story">
        <div class="wrap story-grid">
          <h2 class="sec-title" data-reveal>${esc(c.titles.story)}</h2>
          <div class="story-body" data-field="bio">
            <p class="story-lead" data-reveal>${esc(first)}</p>
            ${rest.map((p) => `<p data-reveal>${esc(p)}</p>`).join('')}
          </div>
        </div>
      </section>`;
    },

    /**
     * Results (step 4): times, marks and places for sports measured that way. The headline column
     * (the mark, time or place; the sport says which) is set large, and a best mark carries the
     * sport's badge ("PR"). On phones each row folds into two lines: the event with the rest of the
     * row under it (res-meta), and the headline value on the right.
     */
    results(c) {
      const R = c.results;
      const rows = c.d.results.filter((r) => R.keys.some((k) => r[k] && String(r[k]).trim()));
      const rest = R.keys.map((k, i) => i).filter((i) => i !== 0 && i !== R.key);
      const badge = (r) => (r.pb && R.pb ? `<span class="res-pb">${esc(R.pb)}</span>` : '');
      return `<section class="sec s-results" id="results" data-section="results">
        <div class="wrap">
          <h2 class="sec-title" data-reveal>${esc(c.titles.results)}</h2>
          <table class="res-table" data-reveal>
            <thead><tr>${R.columns.map((col, i) => `<th scope="col"${i === R.key ? ' class="res-key"' : i ? ' class="res-more"' : ''}>${esc(col)}</th>`).join('')}</tr></thead>
            <tbody>${rows.map((r) => `<tr${r.pb && R.pb ? ' class="is-pb"' : ''}${c.h.item('results', r)}>${R.keys.map((k, i) => (i === 0
              ? `<th scope="row"><span class="res-ev">${esc(r[k])}</span><span class="res-meta">${esc(rest.map((j) => r[R.keys[j]]).filter(Boolean).join(' · '))}</span></th>`
              : i === R.key ? `<td class="res-key">${esc(r[k])}${badge(r)}</td>` : `<td class="res-more">${esc(r[k])}</td>`)).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      </section>`;
    },

    milestones(c) {
      const items = c.d.milestones.filter((m) => m.title);
      return `<section class="sec s-milestones" id="milestones" data-section="milestones">
        <div class="wrap">
          <h2 class="sec-title" data-reveal>${esc(c.titles.milestones)}</h2>
          <ol class="ms-list">${items.map((m) => `<li data-reveal${c.h.item('milestones', m)}><span class="ms-year">${esc(m.year)}</span><span class="ms-title">${esc(m.title)}</span>${m.detail ? `<span class="ms-detail">${esc(m.detail)}</span>` : ''}</li>`).join('')}</ol>
        </div>
      </section>`;
    },

    gallery(c) {
      const items = c.d.gallery.filter((g) => g.src);
      return `<section class="sec s-gallery" id="gallery" data-section="gallery">
        <div class="wrap">
          <h2 class="sec-title" data-reveal>${esc(c.titles.gallery)}</h2>
          <div class="gallery-grid" data-count="${items.length}">${items.map((g) => `<figure data-reveal${c.h.item('gallery', g)}><img${focusStyle(g)} src="${esc(g.src)}" decoding="async" alt="${esc(g.alt)}" loading="lazy">${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}</figure>`).join('')}</div>
        </div>
      </section>`;
    },

    details(c) {
      return `<section class="sec s-details" id="details" data-section="details">
        <div class="wrap details-grid">
          <h2 class="sec-title" data-reveal>${esc(c.titles.details)}</h2>
          <dl class="facts" data-reveal>${c.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
          ${DEFAULTS.contactCard(c)}
        </div>
      </section>`;
    },

    contactCard(c) {
      if (!c.statuses.length && !c.contact && !c.d.recruitingNotes && !c.profiles.length) return '';
      return `<div class="contact-card" data-reveal>
        ${c.statuses.map((s) => `<p class="contact-status"><i aria-hidden="true"></i>${esc(s)}</p>`).join('')}
        ${c.d.recruitingNotes ? `<p class="contact-notes">${esc(c.d.recruitingNotes)}</p>` : ''}
        ${c.contact ? `<a class="btn btn-accent" href="${esc(c.contact)}">Get in touch</a><p class="contact-line">${esc(c.d.recruitingContact)}</p>` : ''}
        ${DEFAULTS.profiles(c)}
      </div>`;
    },

    /** "Find Jordan on": their recruiting and results profiles, named by each link's real address. */
    profiles(c) {
      if (!c.profiles.length) return '';
      return `<div class="profiles"><p class="profiles-label">Find ${esc(c.first)} on</p>
        <ul>${c.profiles.map((p) => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.label)}<span aria-hidden="true">↗</span></a></li>`).join('')}</ul>
      </div>`;
    },

    /**
     * NIL, for athletes open to partnerships: their pitch, what they can do, who they've worked
     * with, their reach, and one clear way to start a conversation (and who it goes to, which
     * matters for high school athletes whose parents usually handle deals).
     */
    nil(c) {
      const d = c.d;
      const reach = d.nilAudience.filter((a) => a && a.value);
      const offers = d.nilOffers.filter(Boolean);
      const partners = d.nilPartners.filter(Boolean);
      const handler = { parent: 'my parent or guardian', agent: 'my agent', school: 'my school’s compliance office' }[d.nilContactRole];
      const pitch = String(d.nilInterests || '').trim();
      return `<section class="sec s-nil" id="nil" data-section="nil"><div class="${c.look.sectionWrap || 'wrap'}">
        ${DEFAULTS.heading(c, 'nil')}
        <div class="nil-grid">
          <div class="nil-main">
            <p class="nil-flag" data-reveal><i aria-hidden="true"></i>Open to NIL partnerships</p>
            ${pitch ? `<p class="nil-pitch" data-reveal data-field="nilInterests">${esc(pitch)}</p>` : ''}
            ${offers.length ? `<div class="nil-offers" data-reveal><h3>What I can do</h3><ul>${offers.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>` : ''}
            ${partners.length ? `<div class="nil-partners" data-reveal><h3>Worked with</h3><p>${items(partners, '<span class="sep" aria-hidden="true">·</span>')}</p></div>` : ''}
          </div>
          <div class="nil-side">
            ${reach.length ? `<dl class="nil-reach" data-reveal>${reach.map((a) => `<div><dd>${esc(a.value)}</dd><dt>${esc(a.label)}</dt></div>`).join('')}</dl>` : ''}
            ${c.nilContact ? `<div class="nil-cta" data-reveal><a class="btn btn-accent" href="${esc(c.nilContact)}">Start a conversation <span aria-hidden="true">↗</span></a>${handler ? `<p>NIL inquiries are handled by ${handler}.</p>` : ''}</div>` : ''}
          </div>
        </div>
      </div></section>`;
    },

    /**
     * The athlete's own section ("Beyond the game"): drawn with the look's story design so it
     * belongs on the page, but with their title and words, under its own id.
     */
    custom(c) {
      const story = (c.look.sections && c.look.sections.story) || DEFAULTS.story;
      const sections = c.sections.map((k) => (k === 'custom' ? 'story' : k === 'story' ? '_story' : k)); // numbered heads count the right slot
      const c2 = Object.assign({}, c, {
        d: Object.assign({}, c.d, { bio: c.d.custom.body }),
        titles: Object.assign({}, c.titles, { story: c.d.custom.title }),
        sections,
      });
      return story(c2, DEFAULTS)
        .replace('id="story" data-section="story"', 'id="custom" data-section="custom"')
        .replace('class="sec s-story"', 'class="sec s-story s-custom"')
        .replace('data-field="bio"', 'data-field="custom.body"');
    },

    // — Shared section variations. They borrow the look's own heading and wrapper. —
    heading(c, key) {
      return c.look.heading ? c.look.heading(c, key) : `<h2 class="sec-title" data-reveal>${esc(c.titles[key])}</h2>`;
    },

    /** Stats, "Spotlight": the headline number huge, the rest as a tidy list beside it. */
    statsSpotlight(c) {
      const [lead, ...rest] = c.d.stats.filter((s) => s.value);
      return `<section class="sec s-stats sv" id="stats" data-section="stats"><div class="${c.look.sectionWrap || 'wrap'}">
        ${DEFAULTS.heading(c, 'stats')}
        <div class="sv-spotlight">
          <dl class="sv-lead" data-reveal${c.h.item('stats', lead)}><dd>${esc(lead.value)}</dd><dt>${esc(lead.label)}</dt>${lead.context ? `<p>${esc(lead.context)}</p>` : ''}</dl>
          ${rest.length ? `<dl class="sv-rest" data-reveal>${rest.map((s) => `<div${c.h.item('stats', s)}><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join('')}</dl>` : ''}
        </div>
      </div></section>`;
    },

    /** Stats, "Ledger": one clean row per number, value on the right. */
    statsLedger(c) {
      return `<section class="sec s-stats sv" id="stats" data-section="stats"><div class="${c.look.sectionWrap || 'wrap'}">
        ${DEFAULTS.heading(c, 'stats')}
        <dl class="sv-ledger">${c.d.stats.filter((s) => s.value).map((s) => `<div data-reveal${c.h.item('stats', s)}><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd>${s.context ? `<p>${esc(s.context)}</p>` : ''}</div>`).join('')}</dl>
      </div></section>`;
    },

    /** Gallery, "Strip" (swipe sideways) or "Feature" (one big, the rest below). */
    galleryVariant(c, kind) {
      const items = c.d.gallery.filter((g) => g.src);
      // Photos always get the wide frame; a look with a narrow text column keeps its heading there.
      const narrow = (c.look.sectionWrap || '').includes('narrow');
      return `<section class="sec s-gallery" id="gallery" data-section="gallery">${narrow ? `<div class="wrap narrow">${DEFAULTS.heading(c, 'gallery')}</div>` : ''}<div class="wrap">
        ${narrow ? '' : DEFAULTS.heading(c, 'gallery')}
        <div class="gv-${kind}">${items.map((g) => `<figure data-reveal${c.h.item('gallery', g)}><img${focusStyle(g)} src="${esc(g.src)}" decoding="async" alt="${esc(g.alt)}" loading="lazy">${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}</figure>`).join('')}</div>
      </div></section>`;
    },

    /**
     * Film, "Reel" (adapted from motionin's Cinema Reel): every video gets a full-screen framed
     * still; scrolling the page moves the reel one video per screen (site.js pins and drives it, and
     * the page carries on after the last one, so nobody gets trapped). Without JavaScript, with
     * reduced motion and in still screenshots it's a plain stack of the same frames.
     */
    filmReel(c) {
      const items = c.d.highlightLinks.filter((x) => x.label || x.url);
      const photos = c.d.gallery.filter((g) => g.src);
      const n = items.length, no = (i) => String(i + 1).padStart(2, '0');
      const slides = items.map((x, i) => {
        // Poster: the video's own, else the gallery photos in turn, else the cover photo.
        const from = x.poster ? x : photos.length ? photos[i % photos.length] : null;
        const src = x.poster || (from ? from.src : '');
        const img = src ? `<img src="${esc(src)}" decoding="async" alt="" loading="lazy"${focusStyle(from)}>`
          : c.photo ? `<img src="${esc(c.photo.url)}" decoding="async" alt="" loading="lazy" style="${c.photo.style}">` : '';
        // The title sets on two lines, split at the middle word, like a festival poster.
        const words = (x.label || 'Highlights').trim().split(/\s+/), cut = Math.ceil(words.length / 2);
        const title = [words.slice(0, cut), words.slice(cut)].filter((w) => w.length).map((w) => `<span>${esc(w.join(' '))}</span>`).join(' ');
        const platform = x.url ? platformOf(x.url) : '';
        return `<article class="reel-slide" style="--i:${i}"${c.h.item('highlightLinks', x)}>
          <div class="reel-frame">
            <div class="reel-img">${img}</div>
            <div class="reel-content">
              <p class="reel-top"><span class="reel-no">${no(i)}</span>${platform || c.d.position ? `<span class="reel-eyebrow">${dotItems([platform && `On ${platform}`, c.d.position])}</span>` : ''}</p>
              <div class="reel-bottom">
                <div class="reel-main">
                  ${c.kicker.length ? `<p class="reel-kicker">${dotItems(c.kicker)}</p>` : ''}
                  <h3 class="reel-title">${title}</h3>
                  <p class="reel-meta">${dotItems([c.name, c.d.jerseyNumber && `No. ${c.d.jerseyNumber}`])}</p>
                </div>
                ${x.url ? `<a class="reel-watch" href="${esc(x.url)}" target="_blank" rel="noopener">Watch on ${esc(platform)} <span aria-hidden="true">↗</span></a>` : ''}
              </div>
            </div>
          </div>
        </article>`;
      }).join('');
      return `<section class="sec s-film film-reel" id="film" data-section="film">
        <div class="wrap">${DEFAULTS.heading(c, 'film')}</div>
        <div class="reel" style="--n:${n}">
          <div class="reel-stage">
            <div class="reel-track">${slides}</div>
            <div class="reel-pips"><span class="reel-at" aria-hidden="true">01</span>${items.map((x, i) => `<button type="button" class="reel-pip" data-i="${i}" aria-label="Go to video ${i + 1} of ${n}"><i></i></button>`).join('')}<span aria-hidden="true">${no(n - 1)}</span></div>
          </div>
        </div>
      </section>`;
    },

    /**
     * Gallery, "Folio" (adapted from motionin's Folio): captions on one side, photos on the other,
     * moving in opposite directions and meeting on the current one as the page scrolls; tap the
     * current photo to open it large. A plain grid without JavaScript or with reduced motion.
     */
    galleryFolio(c) {
      const items = c.d.gallery.filter((g) => g.src);
      const n = items.length, no = (i) => String(i + 1).padStart(2, '0');
      return `<section class="sec s-gallery gallery-folio" id="gallery" data-section="gallery">
        <div class="wrap">${DEFAULTS.heading(c, 'gallery')}</div>
        <div class="folio" style="--n:${n}">
          <div class="folio-stage">
            <ol class="folio-titles" aria-hidden="true">${items.map((g, i) => `<li class="folio-row" data-i="${i}"><span class="folio-t">${esc(g.caption || `Photo ${no(i)}`)}</span><span class="folio-sub">${no(i)} / ${no(n - 1)}</span></li>`).join('')}</ol>
            <div class="folio-images">${items.map((g, i) => `<figure class="folio-slot" data-i="${i}"${c.h.item('gallery', g)}><button type="button" class="folio-open" data-i="${i}" aria-label="Open photo ${i + 1} of ${n}${g.caption ? ': ' + esc(g.caption) : ''}"><img${focusStyle(g)} src="${esc(g.src)}" decoding="async" alt="${esc(g.alt)}" loading="lazy"></button>${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}</figure>`).join('')}</div>
            <p class="folio-count" aria-hidden="true"><span class="folio-at">01</span> / ${no(n - 1)}</p>
          </div>
        </div>
      </section>`;
    },

    /** Social links as "Instagram @handle"; the website shows its domain. */
    socials(c) {
      if (!c.socials.length) return '<span></span>';
      return `<ul class="foot-social">${c.socials.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}<span class="foot-handle">${s.key === 'website' ? esc(s.handle.replace(/^https?:\/\//, '')) : '@' + esc(s.key === 'hudl' ? s.handle.split('/').pop() : s.handle)}</span></a></li>`).join('')}</ul>`;
    },

    /** The page's last word: contact (a coach who read to the end shouldn't have to scroll back up), back to
     *  the top, and the credit. Footer Design review, session 7. */
    credit(c) {
      const contact = c && c.contact ? `<a class="foot-link" href="${esc(c.contact)}">Contact ${esc(c.first)} <span aria-hidden="true">↗</span></a>` : '';
      return `<div class="foot-end">${contact}<a class="foot-link" href="#top">Back to top <span aria-hidden="true">↑</span></a><a class="foot-credit" href="https://athlesite.com" target="_blank" rel="noopener">Built with Athlesite</a></div>`;
    },

    footer(c) {
      return `<footer class="foot" data-section="footer">
        <div class="wrap">
          <p class="foot-name">${esc(c.name)}</p>
          <div class="foot-row">${DEFAULTS.socials(c)}${DEFAULTS.credit(c)}</div>
        </div>
      </footer>`;
    },
  };

  function paletteCSS(c) { return `:root{${paletteDecls(c)}}`; }
  /** The page's colors and font-pairing settings as CSS declarations (also used by the cards). */
  function paletteDecls(c) {
    const p = Object.assign({}, c.palette);
    // Any color the athlete picks is kept readable on their background (3:1, enough for big type
    // and graphics), and the text that sits on it is chosen to match.
    if (c.design.accent && /^#[0-9a-f]{6}$/i.test(c.design.accent) && A.color) {
      p.accent = A.color.readableAccent(c.design.accent, p.bg, p.ink);
      p.onAccent = A.color.textOn(p.accent, p.dark ? p.bg : p.ink, p.dark ? p.ink : p.bg);
    }
    // Small text always reads (WCAG AA, 4.5:1), whatever the palette or the athlete's color: muted
    // text; the accent as small text (--accent-text: nudged toward the ink just far enough, also on
    // accent-tinted chips; the true accent stays for big type and graphics); text on the accent.
    p.accentText = p.accent;
    if (A.color) {
      const C = A.color;
      p.muted = C.readableOn(p.muted, [p.bg, p.surface], p.ink);
      p.accentText = C.readableOn(p.accent, [p.bg, p.surface, C.mix(p.surface, p.accent, 0.12)], p.ink);
      if (C.contrast(p.onAccent, p.accent) < 4.5) p.onAccent = C.textOn(p.accent, p.dark ? p.bg : p.ink, p.dark ? p.ink : p.bg);
    }
    // The font pairing's settings ride along (they only use a fixed set of CSS variables).
    const typeVars = Object.entries(c.type.vars || {}).filter(([k]) => /^--[a-z-]+$/.test(k)).map(([k, v]) => `${k}:${v}`);
    return ['bg', 'surface', 'ink', 'muted', 'line', 'accent', 'accentText', 'onAccent']
      .map((k) => `--${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${p[k]}`).concat(typeVars).join(';');
  }

  /** Browser-tab icon: the athlete's initials on their accent color. */
  function favicon(c) {
    const accent = (c.design.accent && /^#[0-9a-f]{6}$/i.test(c.design.accent)) ? c.design.accent : c.palette.accent;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${accent}"/><text x="32" y="42" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="26" fill="${c.palette.onAccent}">${esc(c.initials)}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  /*
   * Opening animation. Modes: 'session' (real sites: once per visit, not on reloads),
   * 'always' (previews), 'never'. The decision runs in <head> before first paint so the
   * page never flashes; site.js plays the look's choreography and hands the name off
   * into the real headline.
   */
  function introParts(c, mode) {
    if (!c.design.intro || mode === 'never' || !c.look.intro) return { head: '', body: '' };
    const key = JSON.stringify(`athlesite-intro-${c.d.slug || c.name}`).replace(/</g, '\\u003c');
    const head = `<script>(function(){var m=${JSON.stringify(mode)},k=${key},d=document.documentElement;
if(matchMedia('(prefers-reduced-motion: reduce)').matches||location.hash||/[?&]static=1/.test(location.search))return;
try{if(m==='session'){if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1')}}catch(e){}
d.classList.add('intro-running')})()</script>`;
    const { steps, stage } = c.look.intro(c);
    const body = `<div class="intro" data-steps="${esc(steps)}"><div class="intro-stage" aria-hidden="true">${stage}</div><button class="intro-skip" type="button">Skip intro</button></div>`;
    return { head, body };
  }

  const PROMPTS = {
    film: ['Add your film', 'Paste a Hudl, YouTube or Vimeo link.'],
    stats: ['Add your numbers', 'Stats and measurables, with ideas for your sport.'],
    story: ['Tell your story', 'Who you are as a player and a person.'],
    custom: ['Add your own section', 'A cause, another sport, music, school: anything you want people to know.'],
    results: ['Add your results', 'Times, marks and places. Mark your best ones.'],
    milestones: ['Add milestones', 'Awards, records, teams, camps, offers.'],
    gallery: ['Add photos', 'Game action, team moments, training.'],
    nil: ['Open to NIL?', 'Turn it on to show brands how to work with you.'],
    details: ['Add your details', 'School, contact, measurables and recruiting profiles.'],
  };
  /** Editor-only placeholder for an empty section: click it to start filling it in. */
  function emptyPrompt(c, key) {
    const [title, line] = PROMPTS[key] || ['Add this section', ''];
    return `<section class="sec studio-empty" data-section="${key}"><div class="wrap"><div class="studio-empty-box"><strong>+ ${esc(title)}</strong><span>${esc(line)} Only you see this until it has something in it.</span></div></div></section>`;
  }

  function renderSite(profile, opts = {}) {
    const c = buildContext(profile, opts);
    const L = c.look;
    const intro = introParts(c, opts.intro || 'session');
    const layout = c.design.layout || {};
    // Film: '' is the look's own (Cinematic's own is the reel), 'list' the classic list, 'reel' the reel.
    const filmLayout = layout.film === 'list' ? '' : layout.film || L.filmLayout || '';
    const part = (key) => {
      if (key === 'stats' && layout.stats === 'spotlight') return DEFAULTS.statsSpotlight(c);
      if (key === 'stats' && layout.stats === 'ledger') return DEFAULTS.statsLedger(c);
      if (key === 'gallery' && (layout.gallery === 'strip' || layout.gallery === 'feature')) return DEFAULTS.galleryVariant(c, layout.gallery);
      // The reel needs two or more videos and the folio three or more photos; otherwise the look's own.
      if (key === 'film' && filmLayout === 'reel' && c.d.highlightLinks.filter((x) => x.label || x.url).length >= 2) return DEFAULTS.filmReel(c);
      if (key === 'gallery' && layout.gallery === 'folio' && c.d.gallery.filter((g) => g.src).length >= 3) return DEFAULTS.galleryFolio(c);
      return L.sections && L.sections[key] ? L.sections[key](c, DEFAULTS) : DEFAULTS[key](c);
    };
    // Body classes carry the athlete's choices to the look's stylesheet.
    const cover = (L.covers || []).find((v) => v.id === layout.cover);
    // A photo class only when the athlete departs from the look's own treatment, so each
    // look keeps its signature (Portrait's black-and-white, Highlight's punch) by default.
    const lookTone = L.photo || 'color', tone = ['color', 'mono', 'duotone'].includes(c.design.photo) ? c.design.photo : lookTone;
    const activeCover = cover || (L.covers || [])[0];
    const mirrorable = activeCover && (activeCover.mirror === 'always' || (activeCover.mirror === 'subject-left' && (!c.photo || c.d.heroPhotoPositionX < 0.45)));
    const choices = [activeCover ? `cover-${activeCover.id}` : '', layout.mirror && mirrorable ? 'mirror' : '', tone !== lookTone ? `photo-${tone}` : ''].filter(Boolean).join(' ');
    const base = opts.base || '';
    const body = [
      // Keyboard users jump past the nav; hidden until it has focus.
      '<a class="skip-link" href="#top">Skip to content</a>',
      part('nav'),
      `<main id="top">`,
      L.hero(c, DEFAULTS),
      // The Studio's edit mode also places a prompt where each empty section would go (never on real pages).
      ...(opts.prompts
        ? A.fullOrder({ data: c.d, design: c.design }, L.order).filter((k) => !c.design.hidden.includes(k))
          // The results prompt only for sports measured in times and places (anyone can still add the section from the list).
          .filter((k) => k !== 'results' || c.results.fromSport || c.sections.includes(k))
          .map((k) => (c.sections.includes(k) ? part(k) : emptyPrompt(c, k)))
        : c.sections.map(part)),
      `</main>`,
      part('footer'),
    ].join('\n');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="${esc(c.palette.bg)}"><meta name="color-scheme" content="${c.palette.dark ? 'dark' : 'light'}">
<title>${esc(c.name)}${c.d.position ? ' · ' + esc(c.d.position) : ''}</title>
${base ? `<base href="${esc(base)}">` : ''}
<link rel="icon" href="${favicon(c)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${c.type.fonts || L.fonts}">
<link rel="stylesheet" href="src/site/base.css">
<link rel="stylesheet" href="src/site/${L.id}.css">
${/class="(reel|folio)"/.test(body) ? '<link rel="stylesheet" href="src/site/showcase.css">' : ''}
<style>${paletteCSS(c)}</style>
${intro.head}
</head><body class="look-${L.id}${c.palette.dark ? ' is-dark' : ''}${c.photo ? '' : ' no-photo'} ${choices}">
${intro.body}
${body}
<script src="src/site/site.js"></script>
</body></html>`;
  }

  A.renderSite = renderSite;
  /**
   * What a cover card (card.js) needs from the page: the same cleaned data, colors, fonts and
   * photo framing, so a card always matches the page it stands for.
   */
  A.cardContext = (profile) => {
    const c = buildContext(profile, {});
    const lookTone = c.look.photo || 'color';
    return Object.assign(c, {
      vars: paletteDecls(c),
      fonts: c.type.fonts || c.look.fonts,
      tone: ['color', 'mono', 'duotone'].includes(c.design.photo) ? c.design.photo : lookTone,
    });
  };
  /** The page's own link rules, so the editor can say what a link will do before it's published. */
  A.links = {
    safeLink, isEmail, platformOf,
    /** "On3" for an on3.com link, otherwise the plain domain; '' when it isn't a usable link. */
    siteOf(url) {
      const u = safeLink(url);
      if (!u) return '';
      const host = new URL(u).hostname.toLowerCase().replace(/^www./, '');
      const site = PROFILE_SITES.find(([, domain]) => host === domain || host.endsWith('.' + domain));
      return site ? site[0] : host;
    },
    SITES: PROFILE_SITES,
  };
  /** Section titles as this athlete's page shows them (sport words + look titles), for the editor. */
  A.sectionTitles = (profile) => buildContext(profile, {}).titles;
  A.registerLook = (look) => { LOOKS[look.id] = look; };
})();
