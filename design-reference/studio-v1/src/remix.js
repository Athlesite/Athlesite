/*
 * Athlesite Studio — Remix.
 *
 * One tap rolls a fresh design within the athlete's look (or across looks, if they ask).
 * Every option is built to work with every other, so any roll still looks good; Remix just
 * makes sure the result is noticeably different from what they had.
 */
(function () {
  const A = window.Athlesite;

  const pick = (list, rng) => list[Math.floor(rng() * list.length) % list.length];

  /** A small seeded generator, so a remix can be repeated (teammate tests, examples). */
  function seeded(seed) {
    let s = (seed >>> 0) || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  /** What changed between two designs, counted across the choices Remix makes. */
  function difference(a, b) {
    const keys = ['look', 'palette', 'type', 'photo', 'accent'];
    let n = keys.filter((k) => (a[k] || '') !== (b[k] || '')).length;
    for (const k of ['cover', 'stats', 'gallery', 'film']) if ((a.layout?.[k] || '') !== (b.layout?.[k] || '')) n++;
    if (!!a.layout?.mirror !== !!b.layout?.mirror) n++;
    return n;
  }

  /**
   * Remix a profile's design.
   *   changeLook: also roll the look itself
   *   seed:       repeatable result
   *   photoColors: accent candidates already pulled from the athlete's photo (optional)
   */
  function remix(profile, { changeLook = false, seed, photoColors = [] } = {}) {
    const rng = seed === undefined ? Math.random : seeded(seed);
    const d = profile.data, current = profile.design;
    const lookIds = Object.keys(A.LOOKS);
    const stats = d.stats.filter((s) => s.value).length, photos = d.gallery.filter((g) => g.src).length;
    const videos = d.highlightLinks.filter((x) => x.label || x.url).length;

    for (let attempt = 0; attempt < 24; attempt++) {
      const look = A.LOOKS[changeLook ? pick(lookIds, rng) : current.look] || A.LOOKS.cinematic;
      const next = Object.assign({}, current, {
        look: look.id,
        palette: pick(look.palettes, rng).id,
        type: pick(look.types || [{ id: '' }], rng).id,
        layout: {
          cover: pick(look.covers || [{ id: '' }], rng).id,
          // Variations that need content only come up when the athlete has it.
          stats: pick(stats >= 3 ? ['', 'spotlight', 'ledger'] : stats >= 1 ? ['', 'ledger'] : [''], rng),
          gallery: pick(photos >= 3 ? ['', 'strip', 'feature', 'folio'] : photos >= 2 ? ['', 'strip', 'feature'] : [''], rng),
          // The reel is a big moment: offered now and then, never forced (Cinematic's own film is the reel).
          film: videos >= 2 ? pick(look.filmLayout === 'reel' ? ['', '', 'list'] : ['', '', 'reel'], rng) : '',
          mirror: rng() < 0.5,
        },
        // Mostly the look's own photo treatment, sometimes a twist.
        photo: pick(['', '', '', 'mono', 'duotone'], rng),
        // A custom accent from their photo now and then; otherwise the palette's own.
        accent: photoColors.length && rng() < 0.3 ? pick(photoColors, rng) : '',
      });
      if (difference(current, next) >= 2) return next;
    }
    return current;
  }

  A.remix = remix;
  A.designDifference = difference;
})();
