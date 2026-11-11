// Writes the 15 homepage examples (EXAMPLES.md lineup) as examples/<slug>.json, then run
// `node tools/add-example.js --rebuild`. usage: node tools/make-examples.js <studio-v1 dir>
// This is the first draft of their words and numbers (session 4). From here on, edit an example in the
// Studio (studio.html?ex=<slug>), save the file and run add-example.js; running this script again would
// overwrite those edits.
// Everything here is fictional: people, schools, events, numbers. No social handles or recruiting-
// profile links (a made-up handle can belong to a real person; profile links would be dead pages on
// real sites). Videos have titles but no links yet. Photos: Jordan, Maya and Tyler use the built-in
// ones; everyone else gets Willy's photos later (cover, gallery, video thumbnails).
const fs = require('fs'), path = require('path');
const root = process.argv[2];
const img = (n) => `assets/img/${n}`;
const film = (...labels) => labels.map((label) => ({ label, url: '' }));
const st = (label, value, context = '') => ({ label, value, context });
const ms = (year, title, detail = '') => ({ year, title, detail });
const r = (a, b, c = '', d = '', e = '', pb = false) => ({ a, b, c, d, e, pb });

const EX = {
  'jordan-bell': {
    data: {
      slug: 'jordanbell', firstName: 'Jordan', lastName: 'Bell', sport: 'football', position: 'Wide receiver', jerseyNumber: '14',
      level: 'hs', classYear: '2027', schoolOrTeam: 'Northview High School', city: 'Columbus', state: 'OH',
      heightIn: 73, weightLb: 185, gpa: '3.6', intendedMajor: 'Sports management',
      tagline: 'Driven by the chase. Focused on what’s next.',
      bio: 'The work happens long before the lights come on. I’m a wide receiver who brings the same energy to the classroom, the weight room, and every snap.\n\nI grew up running routes in the street with my older brother, and I still play like I’m trying to catch him. Still learning. Always competing.',
      heroPhotoUrl: img('jordan-bell.webp'), heroPhotoAlt: 'Jordan Bell on the sideline under stadium lights, towel over his shoulders', heroPhotoPositionX: 0.55, heroPhotoPositionY: 0.3,
      highlightLinks: [{ label: 'Junior season highlights', url: '', poster: img('jordan-bell-back.webp') }, { label: 'Summer camp reel', url: '' }],
      stats: [st('Receiving yards', '842', '2025 season'), st('Receptions', '54', '2025 season'), st('Touchdowns', '9', '2025 season'), st('40-yard dash', '4.42', 'Laser timed, June 2025'), st('Vertical', '36″', 'June 2025')],
      milestones: [ms('2025', 'All-region first team', 'Led the conference in yards after catch.'), ms('2025', 'Team captain', 'Voted by teammates as a junior.'), ms('2024', 'Varsity letter')],
      gallery: [{ src: img('jordan-bell-back.webp'), alt: 'Jordan from behind, number 14, under the lights', caption: 'Friday night, week 9' }, { src: img('team-line.webp'), alt: 'Northview players crouched in a line on the field', caption: 'Senior night' }],
      custom: { title: 'Beyond the game', body: 'Summers I help run a reading program for kids at the Linden rec center. Most of them come for the football drills after. I’m fine with that.\n\nI also make the playlist for the locker room. Nobody has complained yet.' },
      recruitingStatus: 'open', recruitingContact: 'coach.harris@example.com',
      nilOpen: true, nilContactRole: 'parent', nilContact: 'bell.family@example.com',
      nilInterests: 'Local businesses that show up for Columbus kids: training gear, food spots, anything that gets more kids into the game.',
      nilOffers: ['Instagram posts', 'Youth camps and clinics', 'Store appearances', 'Product reviews'],
      nilAudience: [{ label: 'Instagram followers', value: '6.8K' }, { label: 'Highlight views', value: '41K' }, { label: 'Average post reach', value: '12K' }],
    },
    design: { look: 'cinematic', palette: 'night', type: 'blockbuster', layout: { cover: 'left', film: 'reel', gallery: 'folio' } },
  },

  'maya-rodriguez': {
    data: {
      slug: 'mayarodriguez', firstName: 'Maya', lastName: 'Rodriguez', sport: 'soccer', position: 'Midfielder', jerseyNumber: '8',
      level: 'hs', classYear: '2026', schoolOrTeam: 'Westlake High School', city: 'Austin', state: 'TX', heightIn: 66, gpa: '3.9', intendedMajor: 'Kinesiology',
      tagline: 'The player. The teammate. The person.',
      bio: 'I started playing at four because my sister did, and I kept playing because the field was the one place I never had to think about anything else.\n\nI’m a box-to-box midfielder. I like the ugly parts of the game: winning the second ball, the run nobody tracks, the pass before the assist. Off the field I coach a U8 team on Saturdays, and I’m pretty sure they teach me more than I teach them.\n\nI want to play in college somewhere that takes both the game and the classroom seriously.',
      heroPhotoUrl: img('maya-rodriguez.webp'), heroPhotoAlt: 'Maya Rodriguez standing on a soccer field in a green kit', heroPhotoPositionX: 0.7, heroPhotoPositionY: 0.25,
      highlightLinks: film('Fall 2025 highlights'),
      stats: [st('Goals', '14', '2025 season'), st('Assists', '11', '2025 season'), st('Minutes played', '1,620', '2025 season'), st('Shots on target', '31', '2025 season')],
      milestones: [ms('2025', 'District MVP', 'Voted by the district’s coaches.'), ms('2025', 'Team captain'), ms('2024', 'Regional showcase selection')],
      sportDetails: { foot: 'Right', club: 'Hill Country FC' },
      recruitingStatus: 'open', recruitingContact: 'maya.rodriguez@example.com',
    },
    design: { look: 'editorial', palette: 'pitch', type: 'feature', layout: { cover: 'split', stats: 'ledger' } },
  },

  'tyler-brooks': {
    data: {
      slug: 'tylerbrooks', firstName: 'Tyler', lastName: 'Brooks', sport: 'baseball', position: 'Shortstop', jerseyNumber: '6',
      level: 'hs', classYear: '2027', schoolOrTeam: 'Kearney High School', city: 'Kearney', state: 'NE', heightIn: 72, weightLb: 175, gpa: '3.8', intendedMajor: 'Engineering',
      tagline: 'Glove first. Bat that keeps getting louder.',
      bio: 'Shortstop, right-handed. I take pride in making the routine play every time and the hard one when it matters. Two-year varsity starter.\n\nI keep a notebook on every pitcher I face. My coach says it’s a little much. My on-base percentage says otherwise.',
      heroPhotoUrl: img('tyler-brooks.webp'), heroPhotoAlt: 'Tyler Brooks on the infield holding his glove', heroPhotoPositionX: 0.68, heroPhotoPositionY: 0.2,
      highlightLinks: film('Infield defense, spring 2025', 'Batting practice, front view'),
      stats: [st('Batting average', '.382', '2025 season'), st('On-base %', '.471', '2025 season'), st('Stolen bases', '18', '2025 season'), st('Exit velocity', '92 mph', 'Showcase, Aug 2025'), st('60-yard dash', '6.8', 'Showcase, Aug 2025'), st('Infield velo', '84 mph', 'Showcase, Aug 2025')],
      milestones: [ms('2025', 'All-conference first team'), ms('2025', 'Academic all-state')],
      sportDetails: { bats: 'Right', throws: 'Right', club: 'Prairie Prospects 17U' },
      recruitingStatus: 'open', recruitingContact: 'tbrooks.baseball@example.com',
      recruitingNotes: 'Available for summer camps in July.',
    },
    design: { look: 'prospect', palette: 'chalk', type: 'standard', layout: { cover: 'card' } },
  },

  'aaliyah-grant': {
    data: {
      slug: 'aaliyahgrant', firstName: 'Aaliyah', lastName: 'Grant', sport: 'basketball', position: 'Point guard', jerseyNumber: '11',
      level: 'college', academicYear: 'Junior', eligibility: '2 years', division: 'NCAA Division I', schoolOrTeam: 'Harbor City University', city: 'Baltimore', state: 'MD', heightIn: 68,
      tagline: 'Pace, poise, and the next pass.',
      bio: 'I’ve run the point since I was nine, at a rec center where the older guys only let me play if I passed. I still think the best play is the one that makes someone else look good.\n\nThree years in, I lead us in assists and steals, and I’m the one who calls the defense. I’m studying statistics, which mostly means I can tell you exactly how many times I’ve been fouled without a whistle.',
      highlightLinks: film('Junior season, every assist', 'Conference tournament run'),
      stats: [st('Points per game', '16.4', '2025–26'), st('Assists per game', '6.1', '2025–26'), st('3-point %', '38.2%', '2025–26'), st('Steals per game', '2.1', '2025–26'), st('Free throw %', '84.0%', '2025–26')],
      milestones: [ms('2026', 'All-conference second team'), ms('2026', 'Conference assists leader'), ms('2024', 'All-freshman team')],
      custom: { title: 'Off the court', body: 'Tuesday nights I tutor middle schoolers in math at the branch library down the street from our arena. Half of them come for the math. The other half want to know what it’s like to play on TV.\n\nBoth are good reasons to show up.' },
      recruitingContact: 'aaliyah.grant@example.com',
      nilOpen: true, nilContactRole: '', nilContact: 'aaliyah.grant.nil@example.com',
      nilInterests: 'Women’s sports brands, Baltimore businesses, and anything that gets more girls on a court.',
      nilOffers: ['Instagram and TikTok', 'Youth clinics', 'Appearances', 'Product reviews'],
      nilAudience: [{ label: 'Instagram followers', value: '21.4K' }, { label: 'TikTok followers', value: '58K' }, { label: 'Engagement rate', value: '8.1%' }],
      nilPartners: ['Harbor Sneaker Co.', 'Fells Point Coffee'],
    },
    design: { look: 'highlight', palette: 'electric', type: 'scoreboard', layout: { cover: 'number' } },
  },

  'kenzie-morales': {
    data: {
      slug: 'kenziemorales', firstName: 'Kenzie', lastName: 'Morales', sport: 'softball', position: 'Pitcher', jerseyNumber: '21',
      level: 'hs', classYear: '2027', schoolOrTeam: 'Sienna Ridge High School', city: 'Katy', state: 'TX', heightIn: 69, gpa: '3.7', intendedMajor: 'Nursing',
      tagline: 'Every pitch has a plan.',
      bio: 'I pitch like I’m playing chess: set it up early, finish it late. My riseball gets the strikeouts, but my changeup is the one I’m proudest of.\n\nWhen I’m not in the circle I’m in the cage. I hit third in our lineup and I’ll take the bat out of nobody’s hands.',
      highlightLinks: film('Junior season pitching', 'Riseball and changeup, slow motion'),
      stats: [st('ERA', '1.12', '2026 season'), st('Strikeouts', '214', '2026 season'), st('WHIP', '0.84', '2026 season'), st('Batting average', '.356', '2026 season'), st('Home runs', '9', '2026 season')],
      milestones: [ms('2026', 'District pitcher of the year'), ms('2026', 'Perfect game', '15 strikeouts in the district opener.'), ms('2025', 'All-state second team')],
      sportDetails: { bats: 'Right', throws: 'Right', club: 'Gulf Coast Heat 16U' },
      recruitingStatus: 'committed', committedTo: 'Gulf Coast University', recruitingContact: 'kenzie.morales@example.com',
      nilOpen: true, nilContactRole: 'parent', nilContact: 'morales.family@example.com',
      nilInterests: 'Katy businesses and softball brands that back girls’ sports.',
      nilOffers: ['Instagram posts', 'Pitching lessons and clinics', 'Store appearances'],
      nilAudience: [{ label: 'Instagram followers', value: '9.2K' }, { label: 'Pitching video views', value: '120K' }],
    },
    design: { look: 'highlight', palette: 'crimson', type: 'stadium', layout: { cover: 'block', stats: 'spotlight' } },
  },

  'owen-castellanos': {
    data: {
      slug: 'owencastellanos', firstName: 'Owen', lastName: 'Castellanos', sport: 'lacrosse', position: 'Attack', jerseyNumber: '22',
      level: 'hs', classYear: '2026', schoolOrTeam: 'Harbor Point High School', city: 'Annapolis', state: 'MD', heightIn: 70, weightLb: 172, gpa: '3.5', intendedMajor: 'Business',
      tagline: 'Feed the crease. Finish the chance.',
      bio: 'Lefty attackman. I live behind the cage, where I can see the whole field, and I’d rather throw the assist than take the shot if the shot isn’t mine.\n\nI started in a backyard with a rebounder my dad built out of a garage door. It still works. So do I.',
      highlightLinks: film('Senior season highlights', 'Feeds from X'),
      stats: [st('Goals', '61', '2026 season'), st('Assists', '38', '2026 season'), st('Points', '99', '2026 season'), st('Ground balls', '42', '2026 season'), st('Shooting %', '44%', '2026 season')],
      milestones: [ms('2026', 'All-county first team'), ms('2026', '100-point career milestone', 'Reached in week 3.'), ms('2025', 'County champions')],
      sportDetails: { hand: 'Left', club: 'Chesapeake Elite' },
      recruitingStatus: 'open', recruitingContact: 'owen.castellanos@example.com',
    },
    design: { look: 'highlight', palette: 'volt', type: 'arena', layout: { cover: 'center', stats: 'ledger' } },
  },

  'liam-kowalski': {
    data: {
      slug: 'liamkowalski', firstName: 'Liam', lastName: 'Kowalski', sport: 'hockey', position: 'Center', jerseyNumber: '19',
      level: 'college', academicYear: 'Sophomore', eligibility: '3 years', division: 'NCAA Division I', schoolOrTeam: 'Northern Lakes University', city: 'Duluth', state: 'MN', heightIn: 72, weightLb: 190,
      tagline: 'Win the draw. Win the shift.',
      bio: 'Two-way center. I take the big draws, kill penalties, and still find the net. Before college I played two years of junior hockey, eight hours from home, and it taught me how to be a pro before anyone was paying me like one.\n\nOff the ice I’m an engineering major and the guy who fixes everyone’s skate blades.',
      highlightLinks: film('Sophomore season goals', 'Faceoff wins, every zone'),
      stats: [st('Goals', '14', '2025–26'), st('Assists', '22', '2025–26'), st('Points', '36', '2025–26'), st('Plus / minus', '+18', '2025–26'), st('Faceoff %', '56.3%', '2025–26')],
      milestones: [ms('2025', 'Conference all-rookie team'), ms('2024', 'Junior league champions', 'Upper Midwest Junior League.'), ms('2024', 'Team captain', 'Junior hockey, final season.')],
      sportDetails: { shoots: 'Left' },
      recruitingContact: 'liam.kowalski@example.com',
    },
    design: { look: 'cinematic', palette: 'gold', type: 'velocity', layout: { cover: 'center', film: 'reel', gallery: 'folio' } },
  },

  'imani-wallace': {
    data: {
      slug: 'imaniwallace', firstName: 'Imani', lastName: 'Wallace', sport: 'track', position: 'Sprints (200m / 400m)',
      level: 'hs', classYear: '2026', schoolOrTeam: 'Eastfield High School', city: 'Atlanta', state: 'GA', heightIn: 67, gpa: '3.8', intendedMajor: 'Psychology',
      tagline: 'The last hundred meters are mine.',
      bio: 'I run the 200 and the 400, and I anchor our 4×400. My coach calls the last hundred meters “the honest part.” That’s where I like to race.\n\nI got faster the year I stopped looking at the girl next to me. Now I only look at the clock.',
      highlightLinks: film('State finals, 400m', 'Indoor season, 200m'),
      stats: [st('400m', '52.88', 'PR, state finals'), st('200m', '23.41', 'PR, region meet'), st('4×400 split', '52.1', 'Anchor leg')],
      results: [
        r('400m', '52.88', 'State Championships', 'May 2026', '', true),
        r('200m', '23.41', 'Region 4 Championships', 'Apr 2026', '', true),
        r('400m', '53.40', 'Region 4 Championships', 'Apr 2026'),
        r('4×400 relay', '3:46.02', 'State Championships', 'May 2026'),
        r('300m (indoor)', '38.65', 'Indoor State Meet', 'Feb 2026', '', true),
      ],
      milestones: [ms('2026', 'State runner-up, 400m'), ms('2026', 'Region champion, 200m and 400m'), ms('2025', 'Team captain')],
      recruitingStatus: 'open', recruitingContact: 'imani.wallace@example.com',
    },
    design: { look: 'cinematic', palette: 'cherry', type: 'premiere', layout: { cover: 'split' } },
  },

  'sofia-lindqvist': {
    data: {
      slug: 'sofialindqvist', firstName: 'Sofia', lastName: 'Lindqvist', sport: 'volleyball', position: 'Outside hitter', jerseyNumber: '7',
      level: 'college', academicYear: 'Senior', eligibility: '1 year', division: 'NCAA Division I', schoolOrTeam: 'Pacific Crest University', city: 'San Diego', state: 'CA', heightIn: 73,
      tagline: 'Six rotations. One mindset.',
      bio: 'I grew up in a family of swimmers and found volleyball by accident in seventh grade, when a coach asked the tall new girl if she wanted to try. I never left the gym.\n\nI play all six rotations. I care about the dig as much as the kill, and I’m the one talking to the setter between every point. Senior year, one more run.',
      highlightLinks: film('Senior season kills', 'Serve receive, conference play'),
      stats: [st('Kills per set', '4.1', '2025 season'), st('Hitting %', '.312', '2025 season'), st('Digs per set', '2.8', '2025 season'), st('Aces', '41', '2025 season'), st('Blocks', '58', '2025 season')],
      milestones: [ms('2025', 'All-conference first team'), ms('2025', 'Conference player of the week', 'Three times.'), ms('2024', 'Conference champions')],
      sportDetails: { hand: 'Right' },
      recruitingContact: 'sofia.lindqvist@example.com',
      nilOpen: true, nilContactRole: '', nilContact: 'sofia.lindqvist.nil@example.com',
      nilInterests: 'Beach and lifestyle brands, San Diego shops, and anything that grows the women’s game.',
      nilOffers: ['Instagram posts', 'Camps and clinics', 'Appearances', 'Photo shoots'],
      nilAudience: [{ label: 'Instagram followers', value: '33.6K' }, { label: 'Average story views', value: '9K' }],
      nilPartners: ['Crestline Surf', 'Mission Acai Bar'],
    },
    design: { look: 'editorial', palette: 'porcelain', type: 'classic', layout: { cover: 'cover', gallery: 'feature' } },
  },

  'hannah-mercer': {
    data: {
      slug: 'hannahmercer', firstName: 'Hannah', lastName: 'Mercer', sport: 'rowing', position: 'Port',
      level: 'college', academicYear: 'Junior', eligibility: '2 years', division: 'NCAA Division I', schoolOrTeam: 'Riverbend College', city: 'Philadelphia', state: 'PA', heightIn: 71,
      tagline: 'Long pull. Quiet boat.',
      bio: 'I walked on as a freshman who had never touched an oar. Three years later I row in the first varsity eight, usually in the engine room, where the work is loud and nobody sees it.\n\nRowing is the only sport where you race backwards and trust everyone behind you. I love that about it.',
      highlightLinks: film('Spring racing, first varsity eight'),
      stats: [st('2k erg', '6:58.4', 'Feb 2026'), st('6k erg', '22:31.0', 'Dec 2025'), st('Height', '5′11″')],
      results: [
        r('Riverbend Head Race', 'Varsity 8+', '2nd', '15:42.6'),
        r('Conference Championships', 'First varsity 8+', '1st', '6:21.4'),
        r('Spring Sprints', 'First varsity 8+', '3rd', '6:24.9'),
        r('Lake Wallace Invitational', 'Varsity 4+', '1st', '7:12.3'),
      ],
      milestones: [ms('2026', 'Conference champions, first varsity eight'), ms('2025', 'Moved up to the first varsity eight'), ms('2024', 'Walked on as a novice')],
      custom: { title: 'Why rowing', body: 'I came to college to study architecture and walked past a boathouse on my second day. A coach was standing outside holding a sign that said “Tall? Come row.” I am, so I did.\n\nIt’s the best accident that has ever happened to me.' },
      sportDetails: { weight_class: 'Openweight' },
      recruitingContact: 'hannah.mercer@example.com',
    },
    design: { look: 'editorial', palette: 'clay', type: 'warm', layout: { cover: 'stacked' } },
  },

  'mateo-ruiz': {
    data: {
      slug: 'mateoruiz', firstName: 'Mateo', lastName: 'Ruiz', sport: 'wrestling', position: '152 lb',
      level: 'hs', classYear: '2027', schoolOrTeam: 'Saguaro Ridge High School', city: 'Tucson', state: 'AZ', heightIn: 68, weightLb: 152, gpa: '3.4', intendedMajor: 'Criminal justice',
      tagline: 'Hand fight. Head position. Finish.',
      bio: 'I started wrestling because I was the smallest kid in my class and tired of it. I kept wrestling because it’s the only sport where everything is on you.\n\nI’m a top-position wrestler: I like to ride, and I like the third period, when everybody else is tired.',
      highlightLinks: film('State tournament, all matches'),
      stats: [st('Record (W-L)', '41-3', '2025–26'), st('Pins', '22', '2025–26'), st('Win %', '93%', '2025–26'), st('Takedowns', '168', '2025–26')],
      results: [
        r('State Championships', '3rd', '152 lb', 'Feb 2026'),
        r('Sectional Championships', '1st', '152 lb', 'Feb 2026'),
        r('Desert Classic', '1st', '152 lb', 'Jan 2026'),
        r('Holiday Invitational', '2nd', '145 lb', 'Dec 2025'),
      ],
      milestones: [ms('2026', 'State placer, 152 lb', 'Third place.'), ms('2026', 'Sectional champion'), ms('2025', '100th career win')],
      sportDetails: { weight: '152 lb', club: 'Valley Wrestling Club' },
      recruitingStatus: 'open', recruitingContact: 'mateo.ruiz@example.com',
    },
    design: { look: 'portrait', palette: 'charcoal', type: 'fashion', layout: { cover: 'side' } },
  },

  'grace-nakamura': {
    data: {
      slug: 'gracenakamura', firstName: 'Grace', lastName: 'Nakamura', sport: 'swimming', position: 'Freestyle / IM',
      level: 'college', academicYear: 'Sophomore', eligibility: '3 years', division: 'NCAA Division I', schoolOrTeam: 'Bayview University', city: 'Seattle', state: 'WA', heightIn: 69,
      tagline: 'Count the strokes. Trust the walls.',
      bio: 'Middle-distance freestyle and the 400 IM. I like the races long enough to need a plan and short enough that the plan has to work.\n\nI’ve been in the water at 5 a.m. since I was eleven. It’s still my favorite part of the day.',
      highlightLinks: film('Conference meet, 400 IM final'),
      stats: [st('200 Free', '1:46.92', 'SCY, conference meet'), st('500 Free', '4:41.30', 'SCY, conference meet'), st('400 IM', '4:12.05', 'SCY, conference meet')],
      results: [
        r('200 Free', '1:46.92', 'SCY', 'Conference Championships', 'Feb 2026', true),
        r('500 Free', '4:41.30', 'SCY', 'Conference Championships', 'Feb 2026', true),
        r('400 IM', '4:12.05', 'SCY', 'Conference Championships', 'Feb 2026', true),
        r('400 Free', '4:16.88', 'LCM', 'Summer Nationals', 'Jul 2025'),
      ],
      milestones: [ms('2026', 'Conference finalist in three events'), ms('2025', 'Summer nationals qualifier'), ms('2025', 'Academic all-conference')],
      sportDetails: { club: 'Puget Sound Aquatics' },
      recruitingContact: 'grace.nakamura@example.com',
    },
    design: { look: 'portrait', palette: 'gallery', type: 'gallery', photo: 'color', layout: { cover: 'photo' } },
  },

  'ethan-whitaker': {
    data: {
      slug: 'ethanwhitaker', firstName: 'Ethan', lastName: 'Whitaker', sport: 'golf',
      level: 'hs', classYear: '2028', schoolOrTeam: 'Briar Creek High School', city: 'Charlotte', state: 'NC', heightIn: 71, gpa: '4.0', intendedMajor: 'Economics',
      tagline: 'Fairways, greens, patience.',
      bio: 'I learned the game from my grandfather on a nine-hole course with more geese than golfers. He taught me to play the shot in front of me and forget the last one.\n\nI hit it straight more than I hit it far, and I’m working on both. Sophomore, three years of high school golf to go.',
      highlightLinks: film('Swing, down the line and face on'),
      stats: [st('Scoring average', '72.4', '2025 season'), st('Best round', '66', 'Spring Invitational'), st('Fairways hit', '71%', '2025 season')],
      results: [
        r('Spring Invitational', '66 (−6)', '1st', 'Apr 2026'),
        r('Conference Championship', '142 (−2)', 'T3', 'May 2026'),
        r('Junior Classic', '145 (+1)', '7th', 'Jun 2025'),
        r('Regional Qualifier', '73 (+1)', '5th', 'Apr 2025'),
      ],
      milestones: [ms('2026', 'Conference medalist runner-up'), ms('2026', 'First tournament win'), ms('2025', 'Varsity as a freshman')],
      sportDetails: { handicap: '+1.2' },
      recruitingStatus: 'open', recruitingContact: 'ethan.whitaker@example.com',
    },
    design: { look: 'portrait', palette: 'bone', type: 'heritage', layout: { cover: 'center' } },
  },

  'priya-raman': {
    data: {
      slug: 'priyaraman', firstName: 'Priya', lastName: 'Raman', sport: 'tennis', position: 'Singles',
      level: 'hs', classYear: '2027', schoolOrTeam: 'Westbrook High School', city: 'San Jose', state: 'CA', heightIn: 66, gpa: '3.95', intendedMajor: 'Computer science',
      tagline: 'Point by point.',
      bio: 'Counterpuncher with a forehand I’m allowed to be proud of. I win long rallies and I don’t mind three-setters.\n\nNumber one singles for three seasons. I study the match charts my dad keeps on every opponent, and I’ve started keeping my own.',
      highlightLinks: film('Match play, sectional final'),
      stats: [st('UTR rating', '11.2', 'Mar 2026'), st('Record (W-L)', '28-4', '2025–26'), st('Sectional ranking', '#14', 'Girls 18s')],
      milestones: [ms('2026', 'League singles champion'), ms('2025', 'All-league first team'), ms('2024', 'Number one singles as a freshman')],
      sportDetails: { hand: 'Right-handed' },
      recruitingStatus: 'open', recruitingContact: 'priya.raman@example.com',
    },
    design: { look: 'prospect', palette: 'field', type: 'technical', layout: { cover: 'banner' } },
  },

  'cole-bennett': {
    data: {
      slug: 'colebennett', firstName: 'Cole', lastName: 'Bennett', sport: 'pickleball', position: 'Doubles',
      level: 'college', academicYear: 'Sophomore', division: 'Club', schoolOrTeam: 'Copper State University', city: 'Tempe', state: 'AZ', heightIn: 72,
      tagline: 'Patience at the kitchen line.',
      bio: 'I played tennis until I picked up a paddle at my aunt’s community center and never put it down. Doubles is my game: soft hands, patient dinks, and a partner I trust.\n\nI help run our club team and teach a beginner clinic on Sunday mornings. Half the regulars are retirees, and they are ruthless.',
      highlightLinks: film('Tournament doubles, gold medal match'),
      stats: [st('DUPR rating', '5.12', 'Mar 2026'), st('Record (W-L)', '46-11', '2025–26'), st('Tournament medals', '9', 'Since 2024')],
      results: [
        r('State Games', '5.0 men’s doubles', 'Gold', 'Jul 2026'),
        r('Desert Open', '4.5 mixed doubles', 'Silver', 'Mar 2026'),
        r('Collegiate Club Championships', 'Men’s doubles', 'Bronze', 'Nov 2025'),
        r('Valley Classic', '4.5 men’s doubles', 'Gold', 'Oct 2025'),
      ],
      milestones: [ms('2026', 'State Games gold, men’s doubles'), ms('2025', 'Club team captain'), ms('2024', 'First tournament medal')],
      sportDetails: { hand: 'Right-handed', club: 'Copper State Pickleball Club' },
      recruitingContact: 'cole.bennett@example.com',
      nilOpen: true, nilContactRole: '', nilContact: 'cole.bennett@example.com',
      nilInterests: 'Paddle and apparel brands, and local clubs that want to grow the game with younger players.',
      nilOffers: ['Instagram and TikTok', 'Clinics', 'Product reviews'],
      nilAudience: [{ label: 'TikTok followers', value: '14.7K' }, { label: 'Average video views', value: '22K' }],
    },
    design: { look: 'prospect', palette: 'navy', type: 'grotesk', layout: { cover: 'compact' } },
  },
};

const dir = path.join(root, 'examples');
fs.mkdirSync(dir, { recursive: true });
for (const [slug, p] of Object.entries(EX)) fs.writeFileSync(path.join(dir, slug + '.json'), JSON.stringify(p, null, 2) + '\n');
console.log('wrote', Object.keys(EX).length, 'examples');
