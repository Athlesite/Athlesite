/* Cinematic — film first. Dark, full-bleed, condensed type, the numbers up front. */
(function () {
  const A = window.Athlesite;

  A.registerLook({
    id: 'cinematic',
    name: 'Cinematic',
    line: 'Film first. Dark, full-bleed, the numbers up front.',
    fonts: 'https://fonts.googleapis.com/css2?family=Anton&family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap',
    // Font pairings: same layout, different voice. Scale evens out wider or narrower faces.
    types: [
      { id: 'blockbuster', label: 'Blockbuster', note: 'Tall condensed headlines' },
      { id: 'velocity', label: 'Velocity', note: 'Slanted, fast, athletic', fonts: 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,800&family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap', vars: { '--display': '"Barlow Condensed",Impact,sans-serif', '--d-weight': '800', '--d-style': 'italic', '--d-scale': '1' } },
      { id: 'premiere', label: 'Premiere', note: 'Serif credits, red-carpet', fonts: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap', vars: { '--display': '"DM Serif Display",Georgia,serif', '--d-weight': '400', '--d-scale': '.74' } },
    ],
    covers: [{ id: 'left', label: 'Left-aligned', mirror: 'subject-left' }, { id: 'center', label: 'Center stage' }, { id: 'split', label: 'Split screen', mirror: 'always' }], // cover layouts; the first is the default
    order: ['film', 'stats', 'story', 'milestones', 'gallery', 'details'],
    filmLayout: 'reel', // with two or more videos, Film opens as the cinema reel (src/render.js filmReel)
    palettes: [
      { id: 'night',  label: 'Night game',    dark: true, bg: '#07090C', surface: '#10141A', ink: '#F4F5F7', muted: '#8B93A1', line: '#1F252E', accent: '#6EA2FF', onAccent: '#07090C' },
      { id: 'cherry', label: 'Black cherry',  dark: true, bg: '#0B0708', surface: '#170F11', ink: '#F7F2F2', muted: '#A08E91', line: '#2A1E21', accent: '#FF4D5E', onAccent: '#0B0708' },
      { id: 'forest', label: 'Deep forest',   dark: true, bg: '#060A08', surface: '#0E1511', ink: '#F1F5F2', muted: '#8A9A90', line: '#1C2721', accent: '#45D483', onAccent: '#060A08' },
      { id: 'gold',   label: 'Gold standard', dark: true, bg: '#0A0907', surface: '#15130F', ink: '#F6F3EC', muted: '#A39C8C', line: '#29251D', accent: '#F2C14E', onAccent: '#0A0907' },
    ],

    hero(c) {
      const { esc } = c.h;
      const strip = [
        ...c.featured.map((s) => [s.value, s.label, s]),
        ...(c.featured.length < 4 && c.d.heightIn ? [[A.heightLabel(c.d.heightIn), 'Height']] : []),
      ].slice(0, 4);
      const hasFilm = c.sections.includes('film');
      return `<section class="hero" data-section="hero">
        ${c.photo
          ? `<div class="hero-media"><img src="${esc(c.photo.url)}" decoding="async" alt="${esc(c.photo.alt)}" style="${c.photo.style}" data-field="heroPhoto"></div><div class="hero-shade" aria-hidden="true"></div>`
          : `<div class="hero-void" aria-hidden="true"><span>${esc(c.d.jerseyNumber || c.initials)}</span></div>`}
        ${c.photo && c.d.jerseyNumber ? `<div class="hero-number" aria-hidden="true">${esc(c.d.jerseyNumber)}</div>` : ''}
        <div class="wrap hero-inner">
          ${c.kicker.length ? `<p class="hero-kicker"><span aria-hidden="true"></span><span class="kick">${c.h.items(c.kicker, '<i class="sep" aria-hidden="true">/</i>')}</span></p>` : ''}
          <h1 class="hero-name" data-field="name"><span>${esc(c.first)}</span> <span class="accent">${esc(c.last)}</span></h1>
          ${c.meta.length ? `<p class="hero-meta">${c.meta.map((m) => `<span>${esc(m)}</span>`).join('')}</p>` : ''}
          ${c.d.tagline ? `<p class="hero-tagline" data-field="tagline">${esc(c.d.tagline)}</p>` : ''}
          ${hasFilm || c.contact ? `<div class="hero-actions">
            ${hasFilm ? `<a class="btn btn-light" href="#film"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>Watch ${esc(c.titles.film.toLowerCase())}</a>` : ''}
            ${c.contact ? `<a class="btn btn-ghost" href="${esc(c.contact)}">Contact</a>` : ''}
          </div>` : ''}
        </div>
        ${strip.length ? `<dl class="hero-strip wrap">${strip.map(([v, l, s]) => `<div${s ? c.h.item('stats', s) : ''}><dd>${esc(v)}</dd><dt>${esc(l)}</dt></div>`).join('')}</dl>` : ''}
      </section>`;
    },

    // Opening: a trailer. Letterbox, a line of light, the name rises through it, the bars open onto the photo.
    intro(c) {
      const { esc } = c.h;
      return {
        steps: 'p1:0,p2:450,p3:1050,out:1900',
        stage: `<div class="i-bars"></div>
          ${c.d.jerseyNumber ? `<span class="i-num" data-land>${esc(c.d.jerseyNumber)}</span>` : ''}
          <span class="i-line"></span>
          ${c.kicker.length ? `<p class="i-credit">${c.h.items(c.kicker, '<i class="sep" aria-hidden="true">/</i>')}</p>` : ''}`,
      };
    },

    sections: {
      footer(c, D) {
        const { esc } = c.h;
        return `<footer class="foot" data-section="footer"><div class="wrap">
          <p class="foot-name" aria-hidden="true">${esc(c.first)} <span>${esc(c.last)}</span></p>
          <div class="foot-row">
            ${D.socials(c)}${D.credit(c)}
          </div>
        </div></footer>`;
      },
    },
  });
})();
