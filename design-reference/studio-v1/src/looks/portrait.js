/* Portrait — quiet confidence. Gallery-white, one striking portrait, nothing extra. */
(function () {
  const A = window.Athlesite;

  const label = (c, key) => `<h2 class="sec-title" data-reveal>${c.h.esc(c.titles[key])}</h2>`;

  A.registerLook({
    id: 'portrait',
    name: 'Portrait',
    heading: label, sectionWrap: 'wrap narrow',
    navMark: 'name', // signs with the full name, like a gallery placard
    photo: 'mono', // black-and-white by default; athletes can switch to color // shared variations keep the narrow gallery column
    line: 'Quiet confidence. Gallery-white, one portrait, nothing extra.',
    fonts: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Geist:wght@300..600&family=Geist+Mono:wght@400&display=swap',
    types: [
      { id: 'gallery', label: 'Gallery', note: 'Graceful old-style serif' },
      { id: 'fashion', label: 'Fashion', note: 'High-contrast, editorial', fonts: 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,wght@0,400;1,400&family=Geist:wght@300..600&family=Geist+Mono:wght@400&display=swap', vars: { '--serif': '"Bodoni Moda",Georgia,serif', '--d-scale': '.82', '--name-lh': '1.07' } },
      { id: 'heritage', label: 'Heritage', note: 'Classic book serif', fonts: 'https://fonts.googleapis.com/css2?family=Libre+Caslon+Display&family=Geist:wght@300..600&family=Geist+Mono:wght@400&display=swap', vars: { '--serif': '"Libre Caslon Display",Georgia,serif', '--d-scale': '.9', '--name-lh': '1.03' } },
    ],
    covers: [{ id: 'side', label: 'Side by side', mirror: 'always' }, { id: 'photo', label: 'Photo first', mirror: 'always' }, { id: 'center', label: 'Centered' }], // cover layouts; the first is the default
    order: ['story', 'gallery', 'stats', 'milestones', 'film', 'details'],
    titles: () => ({ details: 'Particulars' }),
    palettes: [
      { id: 'gallery',  label: 'Gallery white', bg: '#FAFAF8', surface: '#F2F1ED', ink: '#141414', muted: '#7C7B77', line: '#E4E2DC', accent: '#A8834C', onAccent: '#FFFFFF' },
      { id: 'bone',     label: 'Bone',          bg: '#EEEAE1', surface: '#E6E1D6', ink: '#1A1814', muted: '#7A746A', line: '#D9D3C6', accent: '#7D5C35', onAccent: '#FFFFFF' },
      { id: 'charcoal', label: 'Charcoal', dark: true, bg: '#131313', surface: '#1B1B1B', ink: '#ECEAE5', muted: '#8C8A85', line: '#2A2A2A', accent: '#C9A86A', onAccent: '#131313' },
    ],

    hero(c) {
      const { esc } = c.h;
      const lines = [c.d.position, c.year.long, c.d.schoolOrTeam, A.location(c.d)].filter(Boolean);
      return `<section class="hero" data-section="hero">
        <div class="wrap hero-grid">
          <div class="hero-copy">
            <h1 class="hero-name" data-field="name">${esc(c.first)} <em>${esc(c.last)}</em></h1>
            <span class="hero-rule" aria-hidden="true"></span>
            ${lines.length ? `<p class="hero-placard">${lines.map(esc).join('<br>')}</p>` : ''}
          </div>
          ${c.photo ? `<figure class="hero-photo"><img src="${esc(c.photo.url)}" decoding="async" alt="${esc(c.photo.alt)}" style="${c.photo.style}" data-field="heroPhoto"></figure>` : `<div class="hero-monogram" aria-hidden="true">${esc(c.initials)}</div>`}
          ${c.d.tagline ? `<p class="hero-tagline" data-field="tagline">${esc(c.d.tagline)}</p>` : ''}
        </div>
      </section>`;
    },

    // Opening: an exhibition. A gold hairline, the monogram, then the name; the room fades into the page.
    intro(c) {
      const { esc } = c.h;
      return {
        steps: 'p1:0,p2:450,p3:1350,out:2250',
        stage: `<span class="i-mark">${esc(c.initials)}</span><span class="i-hair"></span>`,
      };
    },

    sections: {
      story(c) {
        const { esc, paragraphs } = c.h;
        return `<section class="sec s-story" id="story" data-section="story"><div class="wrap narrow">
          ${label(c, 'story')}
          <div class="story-body" data-field="bio">${paragraphs(c.d.bio).map((p, i) => `<p ${i === 0 ? 'class="story-lead"' : ''} data-reveal>${esc(p)}</p>`).join('')}</div>
        </div></section>`;
      },

      stats(c) {
        const { esc } = c.h;
        return `<section class="sec s-stats" id="stats" data-section="stats"><div class="wrap narrow">
          ${label(c, 'stats')}
          <dl class="pt-figures">${c.d.stats.filter((s) => s.value).map((s) => `<div data-reveal${c.h.item('stats', s)}><dd>${esc(s.value)}</dd><dt>${esc(s.label)}</dt>${s.context ? `<p>${esc(s.context)}</p>` : ''}</div>`).join('')}</dl>
        </div></section>`;
      },

      milestones(c) {
        const { esc } = c.h;
        return `<section class="sec s-milestones" id="milestones" data-section="milestones"><div class="wrap narrow">
          ${label(c, 'milestones')}
          <ol class="pt-ms">${c.d.milestones.filter((m) => m.title).map((m) => `<li data-reveal${c.h.item('milestones', m)}><span class="ms-title">${esc(m.title)}</span><span class="ms-year">${esc(m.year)}</span>${m.detail ? `<span class="ms-detail">${esc(m.detail)}</span>` : ''}</li>`).join('')}</ol>
        </div></section>`;
      },

      gallery(c) {
        const { esc } = c.h;
        return `<section class="sec s-gallery" id="gallery" data-section="gallery">
          <div class="wrap narrow">${label(c, 'gallery')}</div>
          <div class="wrap"><div class="pt-wall">${c.d.gallery.filter((g) => g.src).map((g, i) => `<figure data-reveal${c.h.item('gallery', g)}><img${c.h.focus(g)} src="${esc(g.src)}" decoding="async" alt="${esc(g.alt)}" loading="lazy"><figcaption><span>${String(i + 1).padStart(2, '0')}</span>${esc(g.caption || '')}</figcaption></figure>`).join('')}</div>
        </div></section>`;
      },

      film(c, D) {
        // Narrow label like every other section; the film itself keeps a wider frame.
        return D.film(c).replace(/<div class="wrap">\s*<h2 class="sec-title" data-reveal>(.*?)<\/h2>/,
          (m, title) => `<div class="wrap narrow"><h2 class="sec-title" data-reveal>${title}</h2></div><div class="wrap pt-film">`);
      },

      details(c, D) {
        const { esc } = c.h;
        return `<section class="sec s-details" id="details" data-section="details"><div class="wrap narrow">
          ${label(c, 'details')}
          <dl class="facts" data-reveal>${c.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
          ${D.contactCard(c)}
        </div></section>`;
      },

      footer(c, D) {
        const { esc } = c.h;
        return `<footer class="foot" data-section="footer"><div class="wrap">
          <p class="foot-name">${esc(c.first)} <em>${esc(c.last)}</em></p>
          ${D.socials(c)}${D.credit(c)}
        </div></footer>`;
      },
    },
  });
})();
