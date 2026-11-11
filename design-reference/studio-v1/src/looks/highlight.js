/* Highlight — loud on purpose. Giant number, scoreboard stats, high contrast. */
(function () {
  const A = window.Athlesite;

  A.registerLook({
    id: 'highlight',
    name: 'Highlight',
    line: 'Loud on purpose. A giant number and stats like a scoreboard.',
    fonts: 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800;900&family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap',
    types: [
      { id: 'scoreboard', label: 'Scoreboard', note: 'Heavy, tall, tight' },
      { id: 'stadium', label: 'Stadium', note: 'Squared-off, digital', fonts: 'https://fonts.googleapis.com/css2?family=Teko:wght@600&family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap', vars: { '--display': '"Teko",Impact,sans-serif', '--d-weight': '600', '--d-scale': '1.06' } },
      { id: 'arena', label: 'Arena', note: 'Wide signage letters', fonts: 'https://fonts.googleapis.com/css2?family=Bungee&family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap', vars: { '--display': '"Bungee",Impact,sans-serif', '--d-weight': '400', '--d-scale': '.56' } },
    ],
    covers: [{ id: 'number', label: 'Big number' }, { id: 'block', label: 'Color block', mirror: 'always' }, { id: 'center', label: 'Center poster' }], // cover layouts; the first is the default
    order: ['stats', 'film', 'milestones', 'gallery', 'story', 'details'],
    palettes: [
      { id: 'blaze',    label: 'Blaze',    dark: true, bg: '#0B0B0C', surface: '#161618', ink: '#FFFFFF', muted: '#9A9AA0', line: '#2A2A2E', accent: '#FF5A1F', onAccent: '#0B0B0C' },
      { id: 'volt',     label: 'Volt',     dark: true, bg: '#0A0B08', surface: '#151711', ink: '#FFFFFF', muted: '#9A9D92', line: '#272A22', accent: '#D4FF3A', onAccent: '#0A0B08' },
      { id: 'electric', label: 'Electric', dark: true, bg: '#05070F', surface: '#0E1220', ink: '#FFFFFF', muted: '#8F96AA', line: '#1E2436', accent: '#3D6BFF', onAccent: '#FFFFFF' },
      { id: 'crimson',  label: 'Crimson',  dark: true, bg: '#0C0809', surface: '#181012', ink: '#FFFFFF', muted: '#A39195', line: '#2C1F22', accent: '#F0284A', onAccent: '#FFFFFF' },
      { id: 'daylight', label: 'Daylight', bg: '#EFEDE6', surface: '#FFFFFF', ink: '#0B0B0C', muted: '#6A6A66', line: '#D6D3CA', accent: '#FF5A1F', onAccent: '#0B0B0C' },
    ],

    hero(c) {
      const { esc } = c.h;
      const big = c.d.jerseyNumber || c.initials;
      const tiles = c.featured.slice(0, 3);
      return `<section class="hero" data-section="hero">
        ${c.photo ? `<div class="hero-media"><img src="${esc(c.photo.url)}" decoding="async" alt="${esc(c.photo.alt)}" style="${c.photo.style}" data-field="heroPhoto"></div><div class="hero-shade" aria-hidden="true"></div>` : ''}
        <div class="hero-big ${c.photo && c.d.heroPhotoPositionX > 0.55 ? 'is-left' : ''}" data-len="${String(big).length}" aria-hidden="true">${esc(big)}</div>
        <div class="wrap hero-inner">
          <p class="hero-tag">${c.h.items([c.d.position, c.year.short, c.d.schoolOrTeam].filter(Boolean), '<b class="sep" aria-hidden="true">/</b>')}</p>
          <h1 class="hero-name" data-field="name"><span>${esc(c.first)}</span> <span>${esc(c.last)}</span></h1>
          ${c.d.tagline ? `<p class="hero-tagline" data-field="tagline">${esc(c.d.tagline)}</p>` : ''}
          ${tiles.length ? `<dl class="hero-board">${tiles.map((s) => `<div${c.h.item('stats', s)}><dd>${esc(s.value)}</dd><dt>${esc(s.label)}</dt></div>`).join('')}</dl>` : ''}
        </div>
      </section>`;
    },

    // Opening: the slam. The number crashes onto the color, the name punches in, the color wipes off.
    intro(c) {
      const { esc } = c.h;
      return {
        steps: 'p1:0,p2:520,out:1450',
        stage: `<span class="i-num">${esc(c.d.jerseyNumber || c.initials)}</span><span class="i-flash"></span>`,
      };
    },

    sections: {
      nav(c, D) { return D.nav(c); },

      stats(c) {
        const { esc } = c.h;
        const items = c.d.stats.filter((s) => s.value);
        return `<section class="sec s-stats" id="stats" data-section="stats"><div class="wrap">
          <h2 class="sec-title" data-reveal>${esc(c.titles.stats)}</h2>
          <dl class="board">${items.map((s, i) => `<div class="tile" data-reveal${c.h.item('stats', s)}><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd>${s.context ? `<p>${esc(s.context)}</p>` : ''}<span class="tile-n">${String(i + 1).padStart(2, '0')}</span></div>`).join('')}</dl>
        </div></section>`;
      },

      milestones(c) {
        const { esc } = c.h;
        const items = c.d.milestones.filter((m) => m.title);
        const run = items.map((m) => `<span>${esc(m.title)}</span><i>${esc(m.year)}</i>`).join('');
        return `<section class="s-milestones" id="milestones" data-section="milestones">
          <h2 class="sr-only">${esc(c.titles.milestones)}</h2>
          <div class="ticker" aria-hidden="true"><div class="ticker-track">${run}${run}${run}${run}</div></div>
          <div class="wrap"><ol class="ms-cards">${items.map((m) => `<li data-reveal${c.h.item('milestones', m)}><span class="ms-year">${esc(m.year)}</span><span class="ms-title">${esc(m.title)}</span>${m.detail ? `<span class="ms-detail">${esc(m.detail)}</span>` : ''}</li>`).join('')}</ol></div>
        </section>`;
      },

      story(c) {
        const { esc, paragraphs } = c.h;
        const [opening, ...more] = paragraphs(c.d.bio);
        // Shout one line, not a paragraph: a long opening keeps only its first sentence big.
        const split = opening.length > 90 && opening.match(/^(.{20,140}?[.!?])\s+(.+)$/s);
        const first = split ? split[1] : opening;
        const rest = split ? [split[2], ...more] : more;
        return `<section class="sec s-story" id="story" data-section="story"><div class="wrap">
          <h2 class="sec-title" data-reveal>${esc(c.titles.story)}</h2>
          <p class="story-shout" data-reveal data-field="bio">${esc(first)}</p>
          ${rest.length ? `<div class="story-rest">${rest.map((p) => `<p data-reveal>${esc(p)}</p>`).join('')}</div>` : ''}
        </div></section>`;
      },

      footer(c, D) {
        const { esc } = c.h;
        return `<footer class="foot" data-section="footer">
          <p class="foot-name" aria-hidden="true">${esc(c.d.lastName || c.name)}${c.d.jerseyNumber ? `<span>${esc(c.d.jerseyNumber)}</span>` : ''}</p>
          <div class="wrap"><div class="foot-row">
            ${D.socials(c)}${D.credit(c)}
          </div></div>
        </footer>`;
      },
    },
  });
})();
