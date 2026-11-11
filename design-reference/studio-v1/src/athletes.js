/*
 * Fictional test athletes. Every person, school, stat and handle here is made up.
 * Photos are AI-generated. Each athlete stresses something different:
 *   Jordan — the full kit (film, stats, gallery, recruiting)
 *   Maya   — story-heavy, no gallery
 *   Tyler  — stat-heavy, academics, recruiting-first
 *   Devon  — college: redshirt junior in the transfer portal; loud, action photo
 *   Marcus — sparse: very little content on purpose
 *   Ava    — no photo, no film, non-ball sport
 *   Bare   — name and sport only: the page a brand-new athlete sees
 */
(function () {
  const { normalizeProfile } = window.Athlesite;
  const img = (name) => `assets/img/${name}`;

  const ATHLETES = {
    jordan: {
      data: {
        slug: 'jordanbell', firstName: 'Jordan', lastName: 'Bell', sport: 'football', position: 'Wide receiver',
        jerseyNumber: '14', classYear: '2027', schoolOrTeam: 'Northview High School', city: 'Columbus', state: 'OH',
        heightIn: 73, weightLb: 185, gpa: '3.6', intendedMajor: 'Sports management',
        tagline: 'Driven by the chase. Focused on what’s next.',
        bio: 'The work happens long before the lights come on. I’m a wide receiver who brings the same energy to the classroom, the weight room, and every snap.\n\nI grew up running routes in the street with my older brother, and I still play like I’m trying to catch him. Still learning. Always competing.',
        heroPhotoUrl: img('jordan-bell.webp'), heroPhotoAlt: 'Jordan Bell on the sideline under stadium lights, towel over his shoulders',
        heroPhotoPositionX: 0.55, heroPhotoPositionY: 0.3,
        highlightLinks: [
          { label: 'Junior season highlights', url: 'https://www.hudl.com/' },
          { label: 'Summer camp reel', url: 'https://www.youtube.com/' },
        ],
        stats: [
          { label: 'Receiving yards', value: '842', context: '2025 season' },
          { label: 'Receptions', value: '54', context: '2025 season' },
          { label: 'Touchdowns', value: '9', context: '2025 season' },
          { label: '40-yard dash', value: '4.42', context: 'Laser timed, June 2025' },
          { label: 'Vertical', value: '36″', context: 'June 2025' },
        ],
        milestones: [
          { year: '2025', title: 'All-region first team', detail: 'Led the conference in yards after catch.' },
          { year: '2025', title: 'Team captain', detail: 'Voted by teammates as a junior.' },
          { year: '2024', title: 'Varsity letter', detail: '' },
        ],
        gallery: [
          { src: img('jordan-bell-back.webp'), alt: 'Jordan from behind, number 14, under the lights', caption: 'Friday night, week 9' },
          { src: img('team-line.webp'), alt: 'Northview players crouched in a line on the field', caption: 'Senior night' },
          { src: img('jordan-bell.webp'), alt: 'Jordan on the sideline under the stadium lights, towel over his shoulders', caption: 'Between series' },
        ],
        custom: {
          title: 'Beyond the game',
          body: 'Summers I help run a reading program for kids at the Linden rec center. Most of them come for the football drills after. I’m fine with that.\n\nI also make the playlist for the locker room. Nobody has complained yet.',
        },
        recruitingStatus: 'open', recruitingContact: 'coach.harris@example.com',
        social: { instagram: 'jordanbell', twitter: '', tiktok: '', hudl: 'jordanbell14', youtube: '', website: '' },
        // Fictional profile addresses on the real recruiting sites (they won't resolve).
        profileLinks: [
          { url: 'https://www.on3.com/db/jordan-bell-example/' }, { url: 'https://247sports.com/player/jordan-bell-example/' },
          { url: 'https://n.rivals.com/content/prospects/2027/jordan-bell-example' }, { url: 'https://www.espn.com/college-sports/football/recruiting/player/_/id/000000/jordan-bell' },
          { url: 'https://www.maxpreps.com/oh/columbus/northview/athletes/jordan-bell-example/' },
        ],
        // High school NIL: open, handled by a parent.
        nilOpen: true, nilContactRole: 'parent', nilContact: 'bell.family@example.com',
        nilInterests: 'Local businesses that show up for Columbus kids: training gear, food spots, anything that gets more kids into the game.',
        nilOffers: ['Instagram posts', 'Youth camps and clinics', 'Store appearances', 'Product reviews'],
        nilAudience: [{ label: 'Instagram followers', value: '6.8K' }, { label: 'Hudl highlight views', value: '41K' }, { label: 'Average post reach', value: '12K' }],
      },
      design: { look: 'cinematic', palette: 'night' },
    },

    maya: {
      data: {
        slug: 'mayarodriguez', firstName: 'Maya', lastName: 'Rodriguez', sport: 'soccer', position: 'Midfielder',
        jerseyNumber: '8', classYear: '2026', schoolOrTeam: 'Westlake High School', city: 'Austin', state: 'TX',
        heightIn: 66, tagline: 'The player. The teammate. The person.',
        bio: 'I started playing at four because my sister did, and I kept playing because the field was the one place I never had to think about anything else.\n\nI’m a box-to-box midfielder. I like the ugly parts of the game: winning the second ball, the run nobody tracks, the pass before the assist. Off the field I coach a U8 team on Saturdays and I’m pretty sure they teach me more than I teach them.\n\nI want to play in college somewhere that takes both the game and the classroom seriously.',
        heroPhotoUrl: img('maya-rodriguez.webp'), heroPhotoAlt: 'Maya Rodriguez standing on a soccer field in a green kit',
        heroPhotoPositionX: 0.7, heroPhotoPositionY: 0.25,
        highlightLinks: [{ label: 'Fall 2025 highlights', url: 'https://www.youtube.com/' }],
        stats: [
          { label: 'Goals', value: '14', context: '2025 season' },
          { label: 'Assists', value: '11', context: '2025 season' },
          { label: 'Minutes', value: '1,620', context: '2025 season' },
        ],
        milestones: [
          { year: '2025', title: 'District MVP', detail: 'District 26-6A.' },
          { year: '2024', title: 'ECNL showcase selection', detail: '' },
        ],
        recruitingStatus: 'open', recruitingContact: 'maya.rodriguez@example.com', gpa: '3.9',
        social: { instagram: 'maya.rod8', twitter: '', tiktok: '', hudl: '', youtube: '', website: '' },
      },
      design: { look: 'editorial', palette: 'pitch' },
    },

    tyler: {
      data: {
        slug: 'tylerbrooks', firstName: 'Tyler', lastName: 'Brooks', sport: 'baseball', position: 'Shortstop',
        jerseyNumber: '6', classYear: '2027', schoolOrTeam: 'Kearney High School', city: 'Kearney', state: 'NE',
        heightIn: 72, weightLb: 175, gpa: '3.8', intendedMajor: 'Engineering',
        tagline: 'Glove first. Bat that keeps getting louder.',
        bio: 'Shortstop, right-handed. I take pride in making the routine play every time and the hard one when it matters. Two-year varsity starter.',
        heroPhotoUrl: img('tyler-brooks.webp'), heroPhotoAlt: 'Tyler Brooks on the infield holding his glove',
        heroPhotoPositionX: 0.68, heroPhotoPositionY: 0.2,
        highlightLinks: [
          { label: 'Infield defense — spring 2025', url: 'https://www.youtube.com/' },
          { label: 'Batting practice, front view', url: 'https://www.youtube.com/' },
        ],
        stats: [
          { label: 'Batting average', value: '.382', context: '2025 season' },
          { label: 'On-base %', value: '.471', context: '2025 season' },
          { label: 'Stolen bases', value: '18', context: '2025 season' },
          { label: 'Exit velocity', value: '92 mph', context: 'Showcase, Aug 2025' },
          { label: '60-yard dash', value: '6.8', context: 'Showcase, Aug 2025' },
          { label: 'Infield velo', value: '84 mph', context: 'Showcase, Aug 2025' },
        ],
        milestones: [
          { year: '2025', title: 'All-conference first team', detail: '' },
          { year: '2025', title: 'Academic all-state', detail: '' },
        ],
        recruitingStatus: 'open', recruitingContact: 'tbrooks.baseball@example.com',
        recruitingNotes: 'Available for summer camps in July. Playing showcase ball with Nebraska Prospects 17U.',
        social: { instagram: '', twitter: 'tbrooks6', tiktok: '', hudl: '', youtube: '', website: '' },
      },
      design: { look: 'prospect', palette: 'chalk' },
    },

    devon: {
      data: {
        slug: 'devoncarter', firstName: 'Devon', lastName: 'Carter', sport: 'football', position: 'Wide receiver',
        level: 'college', academicYear: 'Junior', redshirt: true, eligibility: '2 years',
        division: 'NCAA Division I (FCS)', conference: 'Southern Shore Conference', transferPortal: true, nilOpen: true,
        jerseyNumber: '1', schoolOrTeam: 'Lakeshore State University', city: 'Tampa', state: 'FL',
        heightIn: 71, weightLb: 178, tagline: 'Go up and get it.',
        bio: 'Every ball in the air is mine. Three-year starter, return man, and the first one at Saturday film. Two years of eligibility left and ready for the next room.',
        heroPhotoUrl: img('devon-carter.webp'), heroPhotoAlt: 'Devon Carter, number 1, diving for a catch under stadium lights',
        heroPhotoPositionX: 0.5, heroPhotoPositionY: 0.35,
        highlightLinks: [{ label: 'Senior season — every catch', url: 'https://www.hudl.com/' }],
        stats: [
          { label: 'Receiving yards', value: '1,284', context: '2025 season' },
          { label: 'Touchdowns', value: '16', context: '2025 season' },
          { label: '40-yard dash', value: '4.39', context: 'Laser timed' },
          { label: 'Kick return avg', value: '27.4', context: '2025 season' },
        ],
        milestones: [
          { year: '2025', title: 'All-conference first team', detail: '' },
          { year: '2025', title: 'Conference offensive player of the year', detail: '' },
          { year: '2024', title: 'Conference champions', detail: '' },
        ],
        recruitingContact: 'devon.carter.wr@example.com',
        social: { instagram: 'devon.one', twitter: 'devoncarter1', tiktok: '', hudl: 'devoncarter', youtube: '', website: '' },
        profileLinks: [{ url: 'https://247sports.com/player/devon-carter-example/' }, { url: 'https://www.on3.com/db/devon-carter-example/' }],
        // College NIL with an agent and past partners.
        nilContactRole: 'agent', nilContact: 'nil@carter-sports.example.com',
        nilInterests: 'Brands built for speed and the people who chase it. Footwear, recovery, and anything Lakeshore fans already love.',
        nilOffers: ['Instagram and TikTok', 'Autograph signings', 'Appearances', 'Football camps'],
        nilPartners: ['Lakeshore Pizza Co.', 'Harbor Fitness', 'Shoreline Auto'],
        nilAudience: [{ label: 'Instagram followers', value: '48.2K' }, { label: 'TikTok followers', value: '112K' }, { label: 'Game-day story views', value: '30K+' }, { label: 'Engagement rate', value: '7.4%' }],
      },
      design: { look: 'highlight', palette: 'blaze' },
    },

    marcus: {
      data: {
        slug: 'marcushill', firstName: 'Marcus', lastName: 'Hill', sport: 'football', position: 'Linebacker',
        jerseyNumber: '44', classYear: '2027', schoolOrTeam: 'Ridgeview High School', city: 'Akron', state: 'OH',
        heightIn: 74, weightLb: 225,
        tagline: 'Quiet. Prepared. Everywhere.',
        heroPhotoUrl: img('marcus-hill.webp'), heroPhotoAlt: 'Marcus Hill in a dark helmet, looking past the camera',
        heroPhotoPositionX: 0.6, heroPhotoPositionY: 0.3,
        stats: [
          { label: 'Tackles', value: '112', context: '2025' },
          { label: 'Tackles for loss', value: '18', context: '2025' },
          { label: 'Sacks', value: '7', context: '2025' },
        ],
        recruitingStatus: 'undecided',
      },
      design: { look: 'portrait', palette: 'gallery' },
    },

    ava: {
      data: {
        slug: 'avachen', firstName: 'Ava', lastName: 'Chen', sport: 'track', position: '400m / 800m',
        classYear: '2026', schoolOrTeam: 'Marin Catholic', city: 'Kentfield', state: 'CA',
        tagline: 'One more lap than yesterday.',
        bio: 'I run the 400 and the 800, and I anchor our 4×400. I like races that hurt a little at the end, because that’s where they’re decided.',
        stats: [
          { label: '400m', value: '54.12', context: 'PR · CIF NCS, May 2025' },
          { label: '800m', value: '2:09.80', context: 'PR · Arcadia Invitational' },
          { label: '4×400 split', value: '53.6', context: 'Anchor leg' },
        ],
        milestones: [
          { year: '2025', title: 'CIF State finalist, 400m', detail: '' },
          { year: '2024', title: 'NCS champion, 4×400 relay', detail: '' },
        ],
        // Step 4: the results table (track: Event · Mark · Meet · Date; best marks wear "PR")
        results: [
          { a: '400m', b: '54.12', c: 'CIF NCS Championships', d: 'May 2025', pb: true },
          { a: '800m', b: '2:09.80', c: 'Arcadia Invitational', d: 'Apr 2025', pb: true },
          { a: '400m', b: '54.71', c: 'CIF State Championships', d: 'May 2025' },
          { a: '4×400 relay', b: '3:51.40', c: 'NCS Championships', d: 'May 2024' },
          { a: '200m', b: '25.08', c: 'Marin County Championships', d: 'Apr 2025' },
        ],
        recruitingStatus: 'open', recruitingContact: 'ava.chen.runs@example.com', gpa: '4.0', intendedMajor: 'Biology',
        social: { instagram: 'ava.runs', twitter: '', tiktok: '', hudl: '', youtube: '', website: '' },
      },
      design: { look: 'editorial', palette: 'porcelain' },
    },

    bare: {
      data: { slug: 'samtaylor', firstName: 'Sam', lastName: 'Taylor', sport: 'basketball' },
      design: { look: 'cinematic' },
    },
  };

  const CAST = [
    ['jordan', 'Jordan Bell', 'Football'],
    ['maya', 'Maya Rodriguez', 'Soccer'],
    ['tyler', 'Tyler Brooks', 'Baseball'],
    ['devon', 'Devon Carter', 'Football, college'],
    ['marcus', 'Marcus Hill', 'Football'],
    ['ava', 'Ava Chen', 'Track, no photo'],
    ['bare', 'Sam Taylor', 'Name + sport only'],
  ];

  window.Athlesite.ATHLETES = Object.fromEntries(Object.entries(ATHLETES).map(([k, v]) => [k, normalizeProfile(v)]));
  window.Athlesite.CAST = CAST;
})();
