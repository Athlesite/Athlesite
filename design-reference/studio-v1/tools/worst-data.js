// Worst-case athletes for tools/break.html (dev only: never loaded by site.html or the Studio).
// Every value is realistic or at the editor's own limit (src/studio/editors.js `max`), so a break here is a
// break a real athlete can cause. Shapes match src/athletes.js.
(function () {
  const A = window.Athlesite;
  const words = (n, seed) => { const w = 'I started running at nine because my older cousin needed someone to chase. By high school it was the only hour of the day that made sense: the track at six in the morning, the coach with the stopwatch, the long walk home. People think speed is talent; mine was built one rep at a time, in the cold, with nobody watching. '.split(' '); let out = []; for (let i = 0; out.join(' ').length < n; i++) out.push(w[(i + seed) % w.length]); return out.join(' ').slice(0, n).trim(); };
  const worst = {
    data: {
      slug: 'marycatherinewisniewskakowalczyk', firstName: 'Mary-Catherine', lastName: 'Wiśniewska-Kowalczyk', sport: 'football',
      position: 'Defensive back / special teams gunner', jerseyNumber: '100', level: 'college', academicYear: 'Graduate', redshirt: true,
      eligibility: '1 year', division: 'NCAA Division I FCS', conference: 'Southwestern Athletic Conference',
      schoolOrTeam: 'St. Mary’s Preparatory Academy of the Sacred Heart', city: 'Rancho Santa Margarita', state: 'California',
      heightIn: 79, weightLb: 285, tagline: 'First one in, last one out. Every rep counts, every snap matters, every single day.',
      heroPhotoUrl: 'assets/img/examples/imani-wallace-cover.webp', heroPhotoAlt: words(140, 3),
      bio: words(2000, 0),
      highlightLinks: Array.from({ length: 8 }, (_, i) => ({ label: ['Senior season: every interception, pass breakup and return', 'Spring game', 'Junior day camp — 40, shuttle, broad jump', 'vs. Northwestern State (Homecoming, double overtime)', 'Pick six', 'All-conference reel 2025', 'Special teams: every kick coverage tackle of the season', 'Film study'][i], url: 'https://www.hudl.com/video/3/12345678/' + 'a'.repeat(24) })),
      stats: [
        { label: 'Tackles', value: '1,284', context: 'Career, all competitions' },
        { label: 'Pass breakups per game in conference play', value: '4.42', context: 'Senior season, conference games only' },
        { label: 'Int', value: '9', context: '' },
        { label: 'Forty-yard dash (laser timed)', value: '4.38', context: 'Pro day, March 2026' },
        { label: 'Vertical', value: '41.5″', context: '' },
        { label: 'Snaps', value: '2,048,000', context: 'Typo check' },
        { label: 'Kick return average', value: '28.7 yds', context: 'Two seasons' },
        { label: 'GPA', value: '3.97', context: 'Kinesiology' },
      ],
      milestones: Array.from({ length: 12 }, (_, i) => ({ year: ['2025–26', '2025', '2024', '2023–24', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016'][i], title: ['First-team All-Southwestern Athletic Conference (defense and return)', 'Team captain', 'Academic All-American', 'Transferred', 'Walk-on', 'MVP', 'Two-way starter', 'Varsity', 'JV', 'Started playing', 'Camp', 'Flag'][i], detail: i % 3 === 0 ? words(90, i) : '' })),
      gallery: [
        { src: 'assets/img/examples/imani-wallace-photo-1.webp', alt: words(140, 5), caption: 'After the conference final with my mom, my dad and my grandmother' },
        { src: 'assets/img/examples/imani-wallace-photo-2.webp', alt: 'Spikes', caption: '' },
        { src: 'assets/img/examples/imani-wallace-photo-3.webp', alt: 'Running the curve', caption: 'Rounding the bend' },
      ],
      recruitingContact: 'bartholomew.fitzgerald@northwind-industries-holdings.example.com', transferPortal: true, draftEligible: true,
      nilOpen: true, nilInterests: words(400, 7), nilContactRole: 'agent', nilContact: 'https://www.northwind-sports-representation-group.example.com/athletes/contact',
      nilOffers: ['Instagram posts', 'TikTok videos', 'Appearances', 'Camps and clinics', 'Local business promos', 'Product reviews', 'Speaking at schools', 'Podcast guest spots', 'Youth football clinics with my former high school coaches'],
      nilAudience: [{ label: 'Instagram followers', value: '1,284,000' }, { label: 'TikTok', value: '12.4K' }, { label: 'Camp kids coached', value: '300+' }, { label: 'YouTube subscribers', value: '1' }, { label: 'Newsletter', value: '0' }, { label: 'Monthly podcast listeners (average)', value: '48,210' }],
      nilPartners: ['Rancho Santa Margarita Family Dentistry & Orthodontics', 'Linden Hardware', 'Bright Futures Tutoring'],
      custom: { title: 'Beyond the game: family, faith and food', body: words(1500, 11) },
      gpa: '3.97', intendedMajor: 'Kinesiology and Exercise Science',
      social: { instagram: 'mary.catherine.wisniewska.kowalczyk', twitter: 'mcwk_db100', tiktok: 'marycatherinewk', hudl: 'mary-catherine-wisniewska-kowalczyk', youtube: 'MaryCatherineWiśniewskaKowalczyk', website: 'https://www.marycatherinewisniewskakowalczyk-athlete.example.com' },
      profileLinks: [{ url: 'https://www.on3.com/db/mary-catherine-wisniewska-kowalczyk-123456/' }, { url: 'https://247sports.com/player/mary-catherine-wisniewska-kowalczyk-46123456/' }, { url: 'https://www.maxpreps.com/ca/rancho-santa-margarita/st-marys-prep/athletes/mary-catherine-wisniewska-kowalczyk/' }],
    },
    design: { look: 'cinematic' },
  };
  // Short everything: one-letter last name, two-letter first, number 0, a single stat, no photo.
  const short = {
    data: { slug: 'jol', firstName: 'Jo', lastName: 'L', sport: 'swimming', position: 'IM', jerseyNumber: '0', level: 'hs', classYear: '2027', schoolOrTeam: 'Eli', city: 'Ada', state: 'OK',
      stats: [{ label: '100 Fly', value: '58.1', context: '' }], tagline: 'Fast.', bio: 'I swim.', milestones: [{ year: '2025', title: 'State', detail: '' }] },
    design: { look: 'cinematic' },
  };
  // Exactly one of everything (plurals: "1 video", "1 photo", "1 milestone").
  const one = {
    data: { slug: 'ninaokafor', firstName: 'Nina', lastName: 'Okafor', sport: 'basketball', position: 'Guard', jerseyNumber: '1', level: 'hs', classYear: '2028',
      stats: [{ label: 'Points', value: '1', context: 'per game' }], highlightLinks: [{ label: 'Highlights', url: 'https://youtu.be/dQw4w9WgXcQ' }],
      milestones: [{ year: '2025', title: 'Varsity', detail: '' }], gallery: [{ src: 'assets/img/examples/aaliyah-grant-photo-1.webp', alt: 'Shooting', caption: '' }],
      results: [{ a: 'Free throws', b: '1', c: '', d: '', e: '', pb: true }], nilOpen: true, nilOffers: ['Camps'], nilAudience: [{ label: 'Followers', value: '1' }], nilPartners: ['Pat’s Pizza'] },
    design: { look: 'cinematic' },
  };
  // Name only: the very first page a new athlete has after the setup (no sport, nothing else).
  const empty = { data: { slug: 'x', firstName: 'Xi', lastName: '' }, design: { look: 'cinematic' } };
  A.WORST = { worst, short, one, empty };
})();
