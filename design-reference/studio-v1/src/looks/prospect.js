/* Prospect — data first. A clean spec sheet a coach can read in ten seconds. */
(function () {
  const A = window.Athlesite;

  A.registerLook({
    id: 'prospect',
    name: 'Prospect',
    line: 'Data first. A spec sheet a coach reads in ten seconds.',
    fonts: 'https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap',
    types: [
      { id: 'standard', label: 'Standard', note: 'Clean and neutral' },
      { id: 'technical', label: 'Technical', note: 'Tight sans, coder mono', fonts: 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400..700&family=JetBrains+Mono:wght@400;500&display=swap', vars: { '--sans': '"Inter Tight",system-ui,sans-serif', '--mono': '"JetBrains Mono",ui-monospace,monospace' } },
      { id: 'grotesk', label: 'Grotesk', note: 'Quirky, characterful', fonts: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400..700&family=Space+Mono:wght@400;700&display=swap', vars: { '--sans': '"Space Grotesk",system-ui,sans-serif', '--mono': '"Space Mono",ui-monospace,monospace' } },
    ],
    covers: [{ id: 'card', label: 'Profile card', mirror: 'always' }, { id: 'banner', label: 'Banner' }, { id: 'compact', label: 'Compact', mirror: 'always' }], // cover layouts; the first is the default
    order: ['stats', 'film', 'details', 'story', 'milestones', 'gallery'],
    titles: () => ({ details: 'Profile' }),
    palettes: [
      { id: 'chalk',  label: 'Chalk',  bg: '#F5F6F4', surface: '#FFFFFF', ink: '#0E1116', muted: '#5F6670', line: '#DDE1E4', accent: '#2563EB', onAccent: '#FFFFFF' },
      { id: 'field',  label: 'Field',  bg: '#F3F4EF', surface: '#FFFFFF', ink: '#10140F', muted: '#626858', line: '#DCDFD3', accent: '#2F7D4F', onAccent: '#FFFFFF' },
      { id: 'maroon', label: 'Maroon', bg: '#F6F3F2', surface: '#FFFFFF', ink: '#161012', muted: '#6E6264', line: '#E4DCDB', accent: '#8C1D2F', onAccent: '#FFFFFF' },
      { id: 'navy',   label: 'Navy', dark: true, bg: '#0C1320', surface: '#131C2B', ink: '#EAF0F7', muted: '#8B97A8', line: '#22304A', accent: '#5AA2FF', onAccent: '#0C1320' },
    ],

    hero(c) {
      const { esc } = c.h;
      const keys = [
        ...c.featured.map((s) => [s.value, s.label]),
        c.d.heightIn && [A.heightLabel(c.d.heightIn), 'Height'],
        c.d.weightLb && [`${c.d.weightLb}`, 'Weight (lb)'],
        c.d.gpa && [c.d.gpa, 'GPA'],
      ].filter(Boolean).slice(0, 6);
      // Up to four numbers sit in one row; five or six wrap to three columns, the last cell filling the row.
      const cols = keys.length <= 4 ? keys.length : 3;
      const span = keys.length % cols ? cols - (keys.length % cols) + 1 : 1;
      const chips = [...c.statuses, c.d.level === 'college' && c.d.division, c.d.jerseyNumber && `No. ${c.d.jerseyNumber}`, A.location(c.d)].filter(Boolean);
      // Without a photo the header runs full width with a small initials badge, not an empty frame.
      return `<section class="hero" data-section="hero"><div class="wrap hero-grid${c.photo ? '' : ' is-solo'}">
        ${c.photo ? `<figure class="pr-photo"><img src="${esc(c.photo.url)}" decoding="async" alt="${esc(c.photo.alt)}" style="${c.photo.style}" data-field="heroPhoto"></figure>` : ''}
        <div class="pr-main">
          <p class="pr-kicker">${c.photo ? '' : `<span class="pr-badge" aria-hidden="true">${esc(c.initials)}</span>`}${c.h.items(c.kicker, '<i class="sep" aria-hidden="true">·</i>')}</p>
          <h1 class="hero-name" data-field="name">${esc(c.name)}</h1>
          <p class="pr-line">${c.h.items([c.d.position, c.d.schoolOrTeam].filter(Boolean), '<i class="sep" aria-hidden="true">—</i>')}</p>
          ${chips.length ? `<ul class="pr-chips">${chips.map((x, i) => `<li${i < c.statuses.length ? ' class="is-on"' : ''}>${esc(x)}</li>`).join('')}</ul>` : ''}
          ${keys.length ? `<dl class="pr-keys" style="--cols:${cols}">${keys.map(([v, l], i) => `<div${i === keys.length - 1 && span > 1 ? ` style="--span:${span}"` : ''}><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
          <div class="pr-actions">
            ${c.contact ? `<a class="btn btn-accent" href="${esc(c.contact)}">Contact</a>` : ''}
            ${c.sections.includes('film') ? `<a class="btn btn-ghost" href="#film">Watch ${esc(c.titles.film.toLowerCase())}</a>` : ''}
          </div>
        </div>
      </div></section>`;
    },

    // Opening: a scout readout. Quick on purpose; coaches are busy.
    intro(c) {
      const { esc } = c.h;
      const nums = c.featured.slice(0, 3);
      return {
        steps: 'p1:0,out:1250',
        stage: `<p class="i-label">${c.kicker.length ? c.h.items(c.kicker, '<i class="sep" aria-hidden="true">·</i>') : 'Athlete profile'}</p>
          <div class="i-bar"><i></i></div>
          ${nums.length ? `<dl class="i-nums">${nums.map((s) => `<div><dd data-count="${esc(s.value)}">${esc(s.value)}</dd><dt>${esc(s.label)}</dt></div>`).join('')}</dl>` : ''}`,
      };
    },

    sections: {
      stats(c) {
        const { esc } = c.h;
        return `<section class="sec s-stats" id="stats" data-section="stats"><div class="wrap">
          <h2 class="sec-title">${esc(c.titles.stats)}</h2>
          <table class="pr-table"><thead><tr><th>Measure</th><th>Value</th><th>Context</th></tr></thead><tbody>
          ${c.d.stats.filter((s) => s.value).map((s) => `<tr${c.h.item('stats', s)}><td>${esc(s.label)}</td><td>${esc(s.value)}</td><td>${esc(s.context)}</td></tr>`).join('')}
          </tbody></table>
        </div></section>`;
      },
      film(c) {
        const { esc, platformOf } = c.h;
        return `<section class="sec s-film" id="film" data-section="film"><div class="wrap">
          <h2 class="sec-title">${esc(c.titles.film)}</h2>
          <ul class="pr-film">${c.d.highlightLinks.filter((x) => x.label || x.url).map((x) => `<li${c.h.item('highlightLinks', x)}><a ${x.url ? `href="${esc(x.url)}" target="_blank" rel="noopener"` : ''}><span class="pr-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span><span><strong>${esc(x.label || 'Highlights')}</strong><small>${esc(platformOf(x.url) || 'Video')} ↗</small></span></a></li>`).join('')}</ul>
        </div></section>`;
      },
      details(c, D) {
        const { esc } = c.h;
        return `<section class="sec s-details" id="details" data-section="details"><div class="wrap">
          <h2 class="sec-title">${esc(c.titles.details)}</h2>
          <div class="pr-details">
            <dl class="facts">${c.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
            ${D.contactCard(c)}
          </div>
        </div></section>`;
      },
      footer(c, D) {
        const { esc } = c.h;
        return `<footer class="foot" data-section="footer"><div class="wrap">
          <div class="foot-row"><p class="foot-name">${esc(c.name)}</p>${D.socials(c)}${D.credit(c)}</div>
        </div></footer>`;
      },
    },
  });
})();
