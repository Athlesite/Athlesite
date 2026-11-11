/*
 * Athlesite Studio — profile model.
 *
 * A profile is { data, design }.
 *   data   — who the athlete is. Field names mirror AthleteProfileData in the
 *            product repo (src/lib/athlete-profile.ts) so this can be ported
 *            column-for-column. Fields marked NEW are proposals the repo does
 *            not have yet.
 *   design — how the page looks. Never mixed into data; maps to one JSON column.
 */
(function () {
  // Sport basics come from the catalog (src/sports.js, loaded first) so there is one list.
  const SPORTS = Object.fromEntries(Object.entries(window.Athlesite.SPORT_CATALOG).map(([key, x]) => [key, {
    label: x.label, number: x.number, statsTitle: x.words.stats, filmTitle: x.words.film, positions: x.positions.map((pos) => pos.label),
    positionWord: x.words.position || 'Position', // "Events" for a swimmer, "Weight class" for a wrestler
    results: x.results || null,
  }]));
  // Results table for a sport that doesn't define one (any athlete can use the section).
  const GENERIC_RESULTS = { title: 'Results', columns: ['Event', 'Result', 'Place', 'Date'], key: 1, examples: ['Spring Invitational', '1st', 'Gold', 'Apr 2026'] };
  const RESULT_KEYS = ['a', 'b', 'c', 'd', 'e']; // a result row stores its cells as { a, b, c, d, e } (up to five columns)

  const SECTIONS = {
    film:       'Film',
    stats:      'Stats',
    story:      'Story',
    milestones: 'Milestones',
    gallery:    'Gallery',
    details:    'Details',
    custom:     'Your section', // one free section with the athlete's own title and words
    nil:        'NIL',          // NEW: shows only when the athlete is open to NIL
    results:    'Results',      // NEW (step 4): times, marks and places, for sports measured that way
  };
  const DEFAULT_ORDER = ['film', 'stats', 'results', 'story', 'custom', 'milestones', 'gallery', 'nil', 'details'];

  function createEmptyProfile() {
    return {
      data: {
        // — mirrors AthleteProfileData —
        slug: '',
        firstName: '',
        lastName: '',
        sport: '',            // key of SPORTS
        position: '',
        classYear: '',
        schoolOrTeam: '',
        city: '',
        state: '',
        heightIn: null,
        weightLb: null,
        bio: '',
        heroPhotoPositionX: 0.5,  // 0–1 focal point
        heroPhotoPositionY: 0.3,
        heroPhotoZoom: 1,         // 1–1.8
        highlightLinks: [],       // [{ label, url, poster? }] — poster is NEW
        recruitingStatus: 'undecided', // 'open' | 'not_open' | 'undecided'
        recruitingContact: '',
        recruitingNotes: '',
        social: { instagram: '', twitter: '', tiktok: '', hudl: '', youtube: '', website: '' },
        nilOpen: false,
        nilContact: '',
        nilInterests: '',         // shown as their NIL pitch: what they're looking for
        // — NEW: the NIL section —
        nilOffers: [],            // ['Instagram posts', 'Camps and clinics', …]
        nilAudience: [],          // [{ label: 'Instagram followers', value: '12.4K' }]
        nilPartners: [],          // ['Linden Hardware', …] past or current partners
        nilContactRole: '',       // who handles NIL inquiries: '' (me) | 'parent' | 'agent' | 'school'
        // — NEW: recruiting and results profiles (On3, 247Sports, Rivals, ESPN, MaxPreps …) —
        profileLinks: [],         // [{ url }] — the site's name always comes from the link's own address
        // — NEW: not in the repo model yet —
        level: 'hs',              // 'hs' | 'college'
        academicYear: '',         // college: Freshman … Graduate (high school uses classYear)
        redshirt: false,
        eligibility: '',          // college: e.g. '2 years'
        division: '',             // college: e.g. 'NCAA Division I'
        conference: '',
        committedTo: '',          // high school: where they committed (recruitingStatus 'committed', NEW value)
        transferPortal: false,
        draftEligible: false,
        jerseyNumber: '',
        tagline: '',
        heroPhotoUrl: '',
        heroPhotoAlt: '',
        stats: [],        // [{ label, value, context }] — first three are featured
        milestones: [],   // [{ year, title, detail }]
        gallery: [],      // [{ src, alt, caption }]
        gpa: '',
        intendedMajor: '',
        custom: { title: '', body: '' }, // their own section, e.g. "Beyond the game"
        // — NEW (session 3, proposed in session 2; Willy said go ahead with step 2) —
        sportDetails: {}, // the sport catalog's extra details, e.g. { bats: 'Right', throws: 'Right', club: 'Ohio Elite' }
        // — NEW (session 4, step 4): the results table —
        results: [],        // [{ a, b, c, d, e, pb }] one row per result; cells follow the columns; pb = a best mark
        resultsTitle: '',   // their own title for the section ('' = the sport's, e.g. "Best times")
        resultColumns: [],  // their own names for the columns ('' at a position = the sport's name for it)
      },
      design: {
        look: 'cinematic',
        palette: '',          // palette id within the look; '' = the look's first
        accent: '',           // optional custom accent hex, overrides the palette's (kept readable)
        type: '',             // font pairing id within the look; '' = the look's first
        photo: '',            // 'color' | 'mono' | 'duotone'; '' = the look's default
        layout: { cover: '', stats: '', gallery: '', film: '', mirror: false }, // variation ids ('' = the look's default); mirror flips the cover
        order: null,          // null = the look's own order; an array once the athlete rearranges
        hidden: [],           // section keys the athlete turned off
        mark: { kind: 'initials', text: '' }, // brand kit grows this in step 3
        intro: true,          // the look's opening animation on each visit
      },
    };
  }

  /** Coerce any stored/imported object into a complete, safe profile. */
  function normalizeProfile(input) {
    const base = createEmptyProfile();
    const src = input && typeof input === 'object' ? input : {};
    const d = Object.assign({}, base.data, src.data || {});
    d.social = Object.assign({}, base.data.social, (src.data && src.data.social) || {});
    d.custom = Object.assign({}, base.data.custom, (src.data && src.data.custom) || {});
    // Sport details are plain short strings keyed by the catalog's detail keys.
    const sd = src.data && src.data.sportDetails;
    d.sportDetails = Object.fromEntries(Object.entries(sd && typeof sd === 'object' ? sd : {}).filter(([k, v]) => /^[a-z][a-zA-Z0-9]{0,30}$/.test(k) && typeof v === 'string').map(([k, v]) => [k, v.slice(0, 80)]));
    for (const k of ['highlightLinks', 'stats', 'milestones', 'gallery', 'nilOffers', 'nilAudience', 'nilPartners', 'profileLinks', 'results', 'resultColumns']) if (!Array.isArray(d[k])) d[k] = [];
    // Wrong types (an opened page file, a hand-edited one) become the right type's empty value,
    // so nothing downstream trips over a number, null or object where text belongs.
    for (const [k, v] of Object.entries(base.data)) {
      if (typeof v === 'string' && typeof d[k] !== 'string') d[k] = typeof d[k] === 'number' ? String(d[k]) : '';
      else if (typeof v === 'boolean') d[k] = d[k] === true;
    }
    for (const o of [d.social, d.custom]) for (const k of Object.keys(o)) if (typeof o[k] !== 'string') o[k] = '';
    for (const k of ['highlightLinks', 'stats', 'milestones', 'gallery', 'nilAudience', 'profileLinks']) d[k] = d[k].filter((x) => x && typeof x === 'object' && !Array.isArray(x));
    for (const k of ['nilOffers', 'nilPartners']) d[k] = d[k].filter((x) => typeof x === 'string');
    const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : typeof v === 'number' ? String(v) : '');
    d.results = d.results.filter((r) => r && typeof r === 'object' && !Array.isArray(r)).slice(0, 60)
      .map((r) => Object.assign(Object.fromEntries(RESULT_KEYS.map((k) => [k, str(r[k], 80)])), { pb: r.pb === true }));
    d.resultColumns = Array.from(d.resultColumns, (x) => str(x, 30)).slice(0, RESULT_KEYS.length);
    // Focus points on gallery photos and video posters (x, y from 0 to 1); anything else is dropped.
    for (const item of [...d.gallery, ...d.highlightLinks]) for (const k of ['x', 'y']) {
      if (typeof item[k] === 'number' && isFinite(item[k])) item[k] = clamp(item[k], 0, 1, 0.5); else delete item[k];
    }
    if (!['', 'parent', 'agent', 'school'].includes(d.nilContactRole)) d.nilContactRole = '';
    // Built-in photos that were renamed (session 3: PNG → WebP): pages saved before still find them.
    const moved = (src) => (typeof src === 'string' ? src.replace(/(assets\/img\/[a-z0-9-]+)\.png$/i, (m, base) => (MOVED.has(base.split('/').pop()) ? base + '.webp' : m)) : src);
    d.heroPhotoUrl = moved(d.heroPhotoUrl);
    d.gallery = d.gallery.map((g) => (g && typeof g === 'object' ? Object.assign({}, g, { src: moved(g.src) }) : g));
    d.highlightLinks = d.highlightLinks.map((x) => (x && typeof x === 'object' && x.poster ? Object.assign({}, x, { poster: moved(x.poster) }) : x));
    d.heroPhotoPositionX = clamp(Number(d.heroPhotoPositionX), 0, 1, 0.5);
    d.heroPhotoPositionY = clamp(Number(d.heroPhotoPositionY), 0, 1, 0.3);
    d.heroPhotoZoom = clamp(Number(d.heroPhotoZoom), 1, 1.8, 1);
    const g = Object.assign({}, base.design, src.design || {});
    if (Array.isArray(g.order)) {
      const known = new Set(DEFAULT_ORDER);
      g.order = g.order.filter((k) => known.delete(k)); // drops unknown keys and duplicates
      // Sections added since this order was saved go where they belong: NIL before the details, the rest at the end.
      known.forEach((k) => g.order = k === 'nil' ? withBefore(g.order, 'nil', 'details') : k === 'results' ? withAfter(g.order, 'results', 'stats') : [...g.order, k]);
    } else {
      g.order = null;
    }
    g.hidden = Array.isArray(g.hidden) ? g.hidden.filter((k) => k in SECTIONS) : [];
    g.mark = Object.assign({}, base.design.mark, g.mark || {});
    g.intro = g.intro !== false;
    g.layout = Object.assign({}, base.design.layout, g.layout || {});
    g.layout.mirror = g.layout.mirror === true;
    if (!['', 'color', 'mono', 'duotone'].includes(g.photo)) g.photo = '';
    if (typeof g.type !== 'string') g.type = '';
    return { data: d, design: g };
  }

  const MOVED = new Set(['jordan-bell', 'jordan-bell-back']);

  /** Insert key just after another section (or at the end if that one isn't there). */
  function withAfter(order, key, after) {
    const at = order.indexOf(after);
    return at < 0 ? [...order, key] : [...order.slice(0, at + 1), key, ...order.slice(at + 1)];
  }

  /**
   * The results table as it shows: the athlete's title and column names where they gave them,
   * otherwise their sport's (or a general table for sports without one).
   *   { title, columns, keys, key (index of the headline column), pb (badge text or ''), examples, fromSport }
   */
  function resultsSetup(d) {
    const sport = (d.sport && SPORTS[d.sport] && SPORTS[d.sport].results) || null;
    const base = sport || GENERIC_RESULTS;
    const columns = base.columns.map((c, i) => (d.resultColumns && d.resultColumns[i] && d.resultColumns[i].trim()) || c);
    return {
      title: (d.resultsTitle && d.resultsTitle.trim()) || base.title,
      columns, keys: RESULT_KEYS.slice(0, columns.length),
      key: Math.min(base.key || 1, columns.length - 1), pb: base.pb || '', examples: base.examples || [],
      defaults: { title: base.title, columns: base.columns.slice() }, fromSport: !!sport,
    };
  }

  /** Insert key just before another section (or at the end if that one isn't there). */
  function withBefore(order, key, before) {
    const at = order.indexOf(before);
    return at < 0 ? [...order, key] : [...order.slice(0, at), key, ...order.slice(at)];
  }

  function clamp(n, min, max, fallback) {
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
  }

  // — Derived values the renderer and editor share —

  const sportOf = (d) => SPORTS[d.sport] || SPORTS.other;
  const fullName = (d) => [d.firstName, d.lastName].filter(Boolean).join(' ').trim();
  const initials = (d) => ((d.firstName[0] || '') + (d.lastName[0] || '')).toUpperCase() || 'A';
  const location = (d) => [d.city, d.state].filter(Boolean).join(', ');

  function heightLabel(inches) {
    if (!Number.isFinite(inches) || inches <= 0) return '';
    return `${Math.floor(inches / 12)}′${inches % 12}″`;
  }

  /** True when a section has something real to show a visitor. */
  function sectionHasContent(key, d) {
    switch (key) {
      case 'film': return d.highlightLinks.some((h) => h.label || h.url);
      case 'stats': return d.stats.some((s) => s.value);
      case 'story': return !!d.bio.trim();
      case 'milestones': return d.milestones.some((m) => m.title);
      case 'gallery': return d.gallery.some((g) => g.src);
      case 'custom': return !!(String(d.custom.title).trim() && String(d.custom.body).trim());
      case 'results': return d.results.some((r) => RESULT_KEYS.some((k) => r[k] && String(r[k]).trim()));
      case 'details': return !!(d.schoolOrTeam || location(d) || d.heightIn || d.weightLb || d.gpa || d.recruitingContact || d.recruitingStatus === 'open' || d.division || d.academicYear || d.nilOpen || d.transferPortal || d.profileLinks.some((l) => l.url));
      // NIL shows only for athletes open to it, and only with something to say or a way to reach them.
      case 'nil': return !!(d.nilOpen && (String(d.nilInterests).trim() || d.nilContact || d.recruitingContact || d.nilOffers.length || d.nilAudience.some((a) => a.value)));
      default: return false;
    }
  }

  /** The full section order: the athlete's, or the look's with the sections it doesn't mention placed sensibly. */
  function fullOrder(profile, lookOrder = DEFAULT_ORDER) {
    let order = profile.design.order || lookOrder;
    // Their own section goes after the story, NIL just before the details.
    if (!order.includes('custom')) { const at = order.indexOf('story'); order = at < 0 ? [...order, 'custom'] : [...order.slice(0, at + 1), 'custom', ...order.slice(at + 1)]; }
    if (!order.includes('nil')) order = withBefore(order, 'nil', 'details');
    // Results go right after the stats.
    if (!order.includes('results')) order = withAfter(order, 'results', 'stats');
    return order;
  }

  /** Sections a visitor will see, in order. lookOrder is used until the athlete rearranges. */
  function visibleSections(profile, lookOrder = DEFAULT_ORDER) {
    return fullOrder(profile, lookOrder).filter((k) => !profile.design.hidden.includes(k) && sectionHasContent(k, profile.data));
  }

  window.Athlesite = Object.assign(window.Athlesite || {}, {
    SPORTS, SECTIONS, DEFAULT_ORDER,
    createEmptyProfile, normalizeProfile,
    sportOf, fullName, initials, location, heightLabel,
    sectionHasContent, visibleSections, fullOrder, resultsSetup, RESULT_KEYS,
  });
})();
