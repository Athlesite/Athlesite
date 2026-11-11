/* Editorial — a magazine feature. Serif headlines, room to breathe, the person first. */
(function () {
  const A = window.Athlesite;

  // Numbered rubric used as every section head: "01 — About"
  const head = (c, key) => {
    const n = String(c.sections.indexOf(key) + 1).padStart(2, '0');
    return `<header class="ed-head" data-reveal><span class="ed-num">${n}</span><h2 class="sec-title">${c.h.esc(c.titles[key])}</h2></header>`;
  };

  // Magazine lead-in: the drop cap stays outside, the rest of the first word goes in small capitals.
  const leadIn = (text, esc) => {
    const m = String(text).match(/^(\W*\w)(\S*)([\s\S]*)$/);
    return m && m[2] ? `${esc(m[1])}<span class="lead-in">${esc(m[2])}</span>${esc(m[3])}` : esc(text);
  };

  A.registerLook({
    id: 'editorial',
    name: 'Editorial',
    heading: head, // shared section variations use the numbered rubric too
    navMark: 'name', // a masthead signs with the full name
    line: 'A magazine feature. Serif headlines, the person first.',
    fonts: 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap',
    types: [
      { id: 'feature', label: 'Feature', note: 'Sharp, modern magazine serif' },
      { id: 'warm', label: 'Warm', note: 'Soft, friendly serif', fonts: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;1,400&family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap', vars: { '--serif': '"Fraunces",Georgia,serif', '--d-scale': '.84', '--name-lh': '1.02' } },
      { id: 'classic', label: 'Classic', note: 'Glossy, high-contrast serif', fonts: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;1,400&family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap', vars: { '--serif': '"Playfair Display",Georgia,serif', '--d-scale': '.8', '--name-lh': '1.05' } },
    ],
    covers: [{ id: 'split', label: 'Split', mirror: 'always' }, { id: 'cover', label: 'Magazine cover', mirror: 'subject-left' }, { id: 'stacked', label: 'Headline', mirror: 'always' }], // cover layouts; the first is the default
    order: ['story', 'stats', 'film', 'gallery', 'milestones', 'details'],
    titles: (d) => ({ story: d.firstName ? `About ${d.firstName}` : 'About', stats: 'By the numbers', details: 'The details' }),
    palettes: [
      { id: 'pitch',     label: 'Pitch green',   bg: '#F2F0E8', surface: '#FBFAF5', ink: '#14170F', muted: '#6B6D63', line: '#D9D6CA', accent: '#1F6B45', onAccent: '#F6F4EC' },
      { id: 'porcelain', label: 'Porcelain',     bg: '#F4F5F6', surface: '#FFFFFF', ink: '#111418', muted: '#676D75', line: '#DADDE1', accent: '#2346C8', onAccent: '#FFFFFF' },
      { id: 'clay',      label: 'Clay court',    bg: '#F3ECE3', surface: '#FAF6F0', ink: '#1E1610', muted: '#7A6B5E', line: '#E0D4C5', accent: '#B4502A', onAccent: '#FBF7F1' },
      { id: 'evening',   label: 'Evening edition', dark: true, bg: '#121315', surface: '#1A1B1E', ink: '#EEEAE2', muted: '#97938B', line: '#2B2C30', accent: '#E3B562', onAccent: '#121315' },
    ],

    hero(c) {
      const { esc } = c.h;
      const rubric = [c.d.position, c.year.long].filter(Boolean);
      const byline = [c.d.schoolOrTeam, A.location(c.d), c.d.jerseyNumber && `No. ${c.d.jerseyNumber}`].filter(Boolean);
      return `<section class="hero ${c.photo ? '' : 'hero-type'}" data-section="hero">
        <div class="wrap hero-grid">
          <div class="hero-copy">
            <p class="hero-rubric">${c.h.items([c.sportName, ...rubric].filter(Boolean), '<span class="sep" aria-hidden="true">·</span>')}</p>
            <h1 class="hero-name" data-field="name">${esc(c.first)} <em>${esc(c.last)}</em></h1>
            ${c.d.tagline ? `<p class="hero-standfirst" data-field="tagline">${esc(c.d.tagline)}</p>` : ''}
            ${byline.length ? `<p class="hero-byline">${byline.map((b) => `<span>${esc(b)}</span>`).join('<i aria-hidden="true">/</i>')}</p>` : ''}
          </div>
          ${c.photo ? `<figure class="hero-figure">
            <div class="hero-photo"><img src="${esc(c.photo.url)}" decoding="async" alt="${esc(c.photo.alt)}" style="${c.photo.style}" data-field="heroPhoto"></div>
            <figcaption>${esc(c.name)}${c.d.schoolOrTeam ? `, ${esc(c.d.schoolOrTeam)}` : ''}</figcaption>
          </figure>` : ''}
        </div>
      </section>`;
    },

    // Opening: a magazine cover. The issue line and rule set, the name inks in, the page turns up.
    intro(c) {
      const { esc } = c.h;
      const issue = [c.sportName, c.d.position, c.year.long].filter(Boolean);
      return {
        steps: 'p1:0,p2:380,p3:1100,out:1750',
        stage: `<div class="i-mast"><p class="i-issue">${c.h.items(issue, '<i class="sep" aria-hidden="true">·</i>')}</p><span class="i-rule"></span></div>
          ${c.d.tagline ? `<p class="i-standfirst">${esc(c.d.tagline)}</p>` : ''}`,
      };
    },

    sections: {
      story(c) {
        const { esc, paragraphs } = c.h;
        const ps = paragraphs(c.d.bio);
        return `<section class="sec s-story" id="story" data-section="story"><div class="wrap ed-cols">
          ${head(c, 'story')}
          <div class="story-body" data-field="bio">${ps.map((p, i) => (i === 0 ? `<p class="story-lead" data-reveal>${leadIn(p, esc)}</p>` : `<p data-reveal>${esc(p)}</p>`)).join('')}</div>
        </div></section>`;
      },

      stats(c) {
        const { esc } = c.h;
        const items = c.d.stats.filter((s) => s.value);
        return `<section class="sec s-stats" id="stats" data-section="stats"><div class="wrap">
          ${head(c, 'stats')}
          <dl class="ed-figures" data-count="${items.length}">${items.map((s) => `<div data-reveal${c.h.item('stats', s)}><dd>${esc(s.value)}</dd><dt>${esc(s.label)}</dt>${s.context ? `<p>${esc(s.context)}</p>` : ''}</div>`).join('')}</dl>
        </div></section>`;
      },

      // (Function replacements, so a "$" in a title can't act as a replace pattern.)
      film(c, D) { return D.film(c).replace(/<h2 class="sec-title" data-reveal>.*?<\/h2>/, () => head(c, 'film')); },
      gallery(c, D) { return D.gallery(c).replace(/<h2 class="sec-title" data-reveal>.*?<\/h2>/, () => head(c, 'gallery')); },
      results(c, D) { return D.results(c).replace(/<h2 class="sec-title" data-reveal>.*?<\/h2>/, () => head(c, 'results')); },

      milestones(c) {
        const { esc } = c.h;
        return `<section class="sec s-milestones" id="milestones" data-section="milestones"><div class="wrap ed-cols">
          ${head(c, 'milestones')}
          <ol class="ed-ms">${c.d.milestones.filter((m) => m.title).map((m) => `<li data-reveal${c.h.item('milestones', m)}><span class="ms-year">${esc(m.year)}</span><div><p class="ms-title">${esc(m.title)}</p>${m.detail ? `<p class="ms-detail">${esc(m.detail)}</p>` : ''}</div></li>`).join('')}</ol>
        </div></section>`;
      },

      details(c, D) {
        const { esc } = c.h;
        return `<section class="sec s-details" id="details" data-section="details"><div class="wrap ed-cols">
          ${head(c, 'details')}
          <div class="ed-details">
            <dl class="facts" data-reveal>${c.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
            ${D.contactCard(c)}
          </div>
        </div></section>`;
      },

      footer(c, D) {
        const { esc } = c.h;
        return `<footer class="foot" data-section="footer"><div class="wrap">
          <p class="foot-name">${esc(c.first)} <em>${esc(c.last)}</em></p>
          <div class="foot-row">
            ${D.socials(c)}${D.credit(c)}
          </div>
        </div></footer>`;
      },
    },
  });
})();
