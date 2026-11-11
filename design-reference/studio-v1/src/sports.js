/*
 * Athlesite Studio — sport catalog (the "light layer").
 *
 * Picking a sport and position turns this into a checklist of suggestions. Nothing here is
 * mandatory: athletes untick, edit, or add their own. The catalog never decides how the page
 * looks, only what it is likely to say.
 *
 * Per sport:
 *   label, number (show a jersey number?), words { stats, film }
 *   positions    [{ id, label }]
 *   details      sport-specific profile facts, e.g. bats/throws [{ key, label, options? }]
 *   stats        [{ key, label, for, top }]   for: positions it suits ('*' = all)
 *                                             top: positions where it starts ticked
 *   measurables  same shape as stats (combine/testing numbers)
 *   links        recruiting/profile sites [{ key, label, top }]
 *   results      the results table for sports measured in times/places: { title, columns (≤5),
 *                key: the column that's the headline value, pb: badge for a best mark ('PR'),
 *                examples: placeholder values for the editor }
 */
(function () {
  const A = (window.Athlesite = window.Athlesite || {});

  // s('key', 'Label', for, top) — short form for stat/measurable entries.
  const s = (key, label, forPos = '*', top = []) => ({ key, label, for: forPos, top });
  const all = '*';      // suits every position
  const every = ['*'];  // ticked for every position

  const CATALOG = {
    football: {
      label: 'Football', number: true, words: { stats: 'Stats', film: 'Film' },
      positions: [
        { id: 'qb', label: 'Quarterback' }, { id: 'rb', label: 'Running back' }, { id: 'wr', label: 'Wide receiver' },
        { id: 'te', label: 'Tight end' }, { id: 'ol', label: 'Offensive line' }, { id: 'dl', label: 'Defensive line' },
        { id: 'lb', label: 'Linebacker' }, { id: 'cb', label: 'Cornerback' }, { id: 's', label: 'Safety' },
        { id: 'k', label: 'Kicker / Punter' }, { id: 'ath', label: 'Athlete' },
      ],
      details: [],
      stats: [
        s('pass_yds', 'Passing yards', ['qb'], ['qb']), s('comp_pct', 'Completion %', ['qb'], ['qb']),
        s('pass_td', 'Passing TDs', ['qb'], ['qb']), s('int_thrown', 'Interceptions thrown', ['qb']),
        s('rush_yds', 'Rushing yards', ['qb', 'rb', 'ath'], ['rb', 'ath']), s('ypc', 'Yards per carry', ['rb'], ['rb']),
        s('rush_td', 'Rushing TDs', ['qb', 'rb', 'ath'], ['rb']),
        s('rec', 'Receptions', ['rb', 'wr', 'te', 'ath'], ['wr', 'te']), s('rec_yds', 'Receiving yards', ['rb', 'wr', 'te', 'ath'], ['wr', 'te']),
        s('rec_td', 'Receiving TDs', ['wr', 'te', 'ath'], ['wr', 'te']), s('ypr', 'Yards per catch', ['wr', 'te']),
        s('all_purpose', 'All-purpose yards', ['rb', 'wr', 'ath', 'cb', 's'], ['ath']), s('total_td', 'Total TDs', ['ath', 'rb'], ['ath']),
        s('pancakes', 'Pancake blocks', ['ol', 'te'], ['ol']), s('sacks_allowed', 'Sacks allowed', ['ol'], ['ol']),
        s('tackles', 'Tackles', ['dl', 'lb', 'cb', 's'], ['dl', 'lb', 's']), s('tfl', 'Tackles for loss', ['dl', 'lb'], ['dl', 'lb']),
        s('sacks', 'Sacks', ['dl', 'lb'], ['dl', 'lb']), s('qb_hurries', 'QB hurries', ['dl', 'lb']),
        s('ints', 'Interceptions', ['lb', 'cb', 's'], ['cb', 's']), s('pbu', 'Pass breakups', ['cb', 's', 'lb'], ['cb', 's']),
        s('ff', 'Forced fumbles', ['dl', 'lb', 'cb', 's']),
        s('fg', 'Field goals (made/att)', ['k'], ['k']), s('fg_long', 'Long field goal', ['k'], ['k']),
        s('punt_avg', 'Punting average', ['k']), s('touchback_pct', 'Touchback %', ['k']),
        s('ret_yds', 'Return yards', ['rb', 'wr', 'cb', 's', 'ath']),
      ],
      measurables: [
        s('forty', '40-yard dash', all, ['qb', 'rb', 'wr', 'te', 'lb', 'cb', 's', 'ath']), s('shuttle', 'Pro shuttle (5-10-5)', all, ['rb', 'wr', 'cb', 's', 'lb']),
        s('vertical', 'Vertical jump', all, ['wr', 'cb', 's', 'rb']), s('broad', 'Broad jump', all),
        s('bench', 'Bench press', all, ['ol', 'dl']), s('squat', 'Squat', all, ['ol', 'dl']), s('clean', 'Power clean', all, ['ol', 'dl']),
      ],
      links: [{ key: 'hudl', label: 'Hudl', top: true }, { key: 'maxpreps', label: 'MaxPreps', top: true, level: 'hs' }, { key: '247', label: '247Sports', top: 'college' }, { key: 'on3', label: 'On3' }, { key: 'rivals', label: 'Rivals' }, { key: 'espn', label: 'ESPN recruiting', level: 'hs' }, { key: 'sportsref', label: 'Sports Reference', level: 'college' }],
    },

    basketball: {
      label: 'Basketball', number: true, words: { stats: 'Stats', film: 'Film' },
      positions: [{ id: 'pg', label: 'Point guard' }, { id: 'sg', label: 'Shooting guard' }, { id: 'sf', label: 'Small forward' }, { id: 'pf', label: 'Power forward' }, { id: 'c', label: 'Center' }],
      details: [{ key: 'club', label: 'Club / AAU team' }],
      stats: [
        s('ppg', 'Points per game', all, every), s('rpg', 'Rebounds per game', all, ['sf', 'pf', 'c']),
        s('apg', 'Assists per game', all, ['pg', 'sg']), s('spg', 'Steals per game', all, ['pg']), s('bpg', 'Blocks per game', all, ['pf', 'c']),
        s('fg_pct', 'Field goal %', all, ['pf', 'c']), s('three_pct', '3-point %', all, ['pg', 'sg', 'sf']), s('ft_pct', 'Free throw %', all),
      ],
      measurables: [s('wingspan', 'Wingspan', all, every), s('reach', 'Standing reach', all, ['pf', 'c']), s('vertical', 'Max vertical', all, ['pg', 'sg', 'sf'])],
      links: [{ key: 'hudl', label: 'Hudl', top: true }, { key: 'maxpreps', label: 'MaxPreps', top: true, level: 'hs' }, { key: '247', label: '247Sports', top: 'college' }, { key: 'on3', label: 'On3' }, { key: 'rivals', label: 'Rivals' }, { key: 'espn', label: 'ESPN recruiting', level: 'hs' }, { key: 'sportsref', label: 'Sports Reference', level: 'college' }],
    },

    baseball: {
      label: 'Baseball', number: true, words: { stats: 'Stats', film: 'Film' },
      positions: [
        { id: 'rhp', label: 'Pitcher (RHP)' }, { id: 'lhp', label: 'Pitcher (LHP)' }, { id: 'c', label: 'Catcher' }, { id: '1b', label: 'First base' },
        { id: '2b', label: 'Second base' }, { id: 'ss', label: 'Shortstop' }, { id: '3b', label: 'Third base' }, { id: 'of', label: 'Outfield' }, { id: 'util', label: 'Utility' },
      ],
      details: [{ key: 'bats', label: 'Bats', options: ['Right', 'Left', 'Switch'] }, { key: 'throws', label: 'Throws', options: ['Right', 'Left'] }, { key: 'club', label: 'Travel / showcase team' }],
      stats: [
        s('avg', 'Batting average', ['c', '1b', '2b', 'ss', '3b', 'of', 'util'], ['c', '1b', '2b', 'ss', '3b', 'of', 'util']),
        s('obp', 'On-base %', ['c', '1b', '2b', 'ss', '3b', 'of', 'util'], ['c', '1b', '2b', 'ss', '3b', 'of', 'util']),
        s('slg', 'Slugging %', ['c', '1b', '2b', 'ss', '3b', 'of', 'util'], ['1b', '3b', 'of']), s('hr', 'Home runs', ['c', '1b', '2b', 'ss', '3b', 'of', 'util']),
        s('rbi', 'RBIs', ['c', '1b', '2b', 'ss', '3b', 'of', 'util']), s('sb', 'Stolen bases', ['2b', 'ss', 'of', 'util'], ['ss', 'of']),
        s('era', 'ERA', ['rhp', 'lhp'], ['rhp', 'lhp']), s('k', 'Strikeouts', ['rhp', 'lhp'], ['rhp', 'lhp']),
        s('ip', 'Innings pitched', ['rhp', 'lhp'], ['rhp', 'lhp']), s('whip', 'WHIP', ['rhp', 'lhp'], ['rhp', 'lhp']), s('opp_avg', 'Opponent batting average', ['rhp', 'lhp']),
      ],
      measurables: [
        s('fb_velo', 'Fastball velocity', ['rhp', 'lhp'], ['rhp', 'lhp']), s('spin', 'Spin rate', ['rhp', 'lhp']), s('offspeed', 'Off-speed velocity', ['rhp', 'lhp']),
        s('exit_velo', 'Exit velocity', ['c', '1b', '2b', 'ss', '3b', 'of', 'util'], ['c', '1b', '2b', 'ss', '3b', 'of', 'util']),
        s('sixty', '60-yard dash', ['c', '1b', '2b', 'ss', '3b', 'of', 'util'], ['2b', 'ss', 'of', 'util']),
        s('if_velo', 'Infield velocity', ['1b', '2b', 'ss', '3b', 'util'], ['2b', 'ss', '3b']), s('of_velo', 'Outfield velocity', ['of', 'util'], ['of']),
        s('pop', 'Pop time', ['c'], ['c']), s('c_velo', 'Catcher velocity', ['c'], ['c']),
      ],
      links: [{ key: 'pg', label: 'Perfect Game', top: 'hs' }, { key: 'pbr', label: 'Prep Baseball Report', top: true, level: 'hs' }, { key: 'maxpreps', label: 'MaxPreps', level: 'hs' }, { key: 'hudl', label: 'Hudl' }],
    },

    softball: {
      label: 'Softball', number: true, words: { stats: 'Stats', film: 'Film' },
      positions: [
        { id: 'p', label: 'Pitcher' }, { id: 'c', label: 'Catcher' }, { id: '1b', label: 'First base' }, { id: '2b', label: 'Second base' },
        { id: 'ss', label: 'Shortstop' }, { id: '3b', label: 'Third base' }, { id: 'of', label: 'Outfield' }, { id: 'util', label: 'Utility' },
      ],
      details: [{ key: 'bats', label: 'Bats', options: ['Right', 'Left', 'Slapper', 'Switch'] }, { key: 'throws', label: 'Throws', options: ['Right', 'Left'] }, { key: 'club', label: 'Travel team' }],
      stats: [
        s('avg', 'Batting average', ['c', '1b', '2b', 'ss', '3b', 'of', 'util'], ['c', '1b', '2b', 'ss', '3b', 'of', 'util']),
        s('obp', 'On-base %', ['c', '1b', '2b', 'ss', '3b', 'of', 'util'], ['c', '1b', '2b', 'ss', '3b', 'of', 'util']),
        s('slg', 'Slugging %', ['c', '1b', '2b', 'ss', '3b', 'of', 'util']), s('hr', 'Home runs', ['c', '1b', '2b', 'ss', '3b', 'of', 'util']),
        s('rbi', 'RBIs', ['c', '1b', '2b', 'ss', '3b', 'of', 'util']), s('sb', 'Stolen bases', ['2b', 'ss', 'of', 'util'], ['of']),
        s('era', 'ERA', ['p'], ['p']), s('k', 'Strikeouts', ['p'], ['p']), s('ip', 'Innings pitched', ['p'], ['p']), s('whip', 'WHIP', ['p']),
      ],
      measurables: [
        s('pitch_speed', 'Pitch speed', ['p'], ['p']), s('exit_velo', 'Exit velocity', ['c', '1b', '2b', 'ss', '3b', 'of', 'util'], ['c', '1b', '2b', 'ss', '3b', 'of', 'util']),
        s('home_first', 'Home to first', ['c', '1b', '2b', 'ss', '3b', 'of', 'util'], ['2b', 'ss', 'of', 'util']),
        s('if_velo', 'Infield velocity', ['1b', '2b', 'ss', '3b', 'util'], ['ss', '3b']), s('of_velo', 'Outfield velocity', ['of', 'util'], ['of']), s('pop', 'Pop time', ['c'], ['c']),
      ],
      links: [{ key: 'eis', label: 'Extra Inning Softball', top: true, level: 'hs' }, { key: 'maxpreps', label: 'MaxPreps', level: 'hs' }, { key: 'hudl', label: 'Hudl' }],
    },

    soccer: {
      label: 'Soccer', number: true, words: { stats: 'Stats', film: 'Film' },
      positions: [{ id: 'gk', label: 'Goalkeeper' }, { id: 'd', label: 'Defender' }, { id: 'm', label: 'Midfielder' }, { id: 'f', label: 'Forward' }],
      details: [{ key: 'foot', label: 'Dominant foot', options: ['Right', 'Left', 'Both'] }, { key: 'club', label: 'Club team (ECNL, MLS NEXT, etc.)' }],
      stats: [
        s('goals', 'Goals', ['d', 'm', 'f'], ['m', 'f']), s('assists', 'Assists', ['d', 'm', 'f'], ['m', 'f']),
        s('minutes', 'Minutes played', all, ['d', 'm']), s('starts', 'Games started', all, ['d']), s('shots_on', 'Shots on target', ['m', 'f']),
        s('clean_sheets', 'Clean sheets', ['gk', 'd'], ['gk', 'd']), s('saves', 'Saves', ['gk'], ['gk']),
        s('gaa', 'Goals against average', ['gk'], ['gk']), s('save_pct', 'Save %', ['gk']),
      ],
      measurables: [s('sprint', '30m sprint', all), s('yoyo', 'Yo-Yo test level', all)],
      links: [{ key: 'hudl', label: 'Hudl', top: true }, { key: 'tds', label: 'TopDrawerSoccer', top: true }, { key: 'maxpreps', label: 'MaxPreps', level: 'hs' }],
    },

    volleyball: {
      label: 'Volleyball', number: true, words: { stats: 'Stats', film: 'Film' },
      positions: [
        { id: 's', label: 'Setter' }, { id: 'oh', label: 'Outside hitter' }, { id: 'opp', label: 'Opposite' },
        { id: 'mb', label: 'Middle blocker' }, { id: 'lib', label: 'Libero' }, { id: 'ds', label: 'Defensive specialist' },
      ],
      details: [{ key: 'hand', label: 'Dominant hand', options: ['Right', 'Left'] }, { key: 'club', label: 'Club team' }],
      stats: [
        s('kills', 'Kills', ['oh', 'opp', 'mb'], ['oh', 'opp', 'mb']), s('hit_pct', 'Hitting %', ['oh', 'opp', 'mb'], ['oh', 'opp', 'mb']),
        s('assists', 'Assists', ['s'], ['s']), s('digs', 'Digs', all, ['lib', 'ds', 'oh']), s('blocks', 'Blocks', ['mb', 'opp', 'oh', 's'], ['mb']),
        s('aces', 'Aces', all, ['s', 'lib', 'ds']), s('serve_rec', 'Serve receive rating', ['lib', 'ds', 'oh'], ['lib', 'ds']),
      ],
      measurables: [s('reach', 'Standing reach', all, ['oh', 'opp', 'mb', 's']), s('approach', 'Approach touch', all, ['oh', 'opp', 'mb']), s('block_touch', 'Block touch', all, ['mb', 'opp'])],
      links: [{ key: 'hudl', label: 'Hudl', top: true }, { key: 'maxpreps', label: 'MaxPreps', level: 'hs' }, { key: 'sportsrecruits', label: 'SportsRecruits', level: 'hs' }],
    },

    track: {
      label: 'Track & Field', number: false, words: { stats: 'Marks', film: 'Races', position: 'Events', ask: 'What are your events?' },
      positions: [
        { id: 'sprints', label: 'Sprints' }, { id: 'mid', label: 'Middle distance' }, { id: 'dist', label: 'Distance' }, { id: 'hurdles', label: 'Hurdles' },
        { id: 'jumps', label: 'Jumps' }, { id: 'throws', label: 'Throws' }, { id: 'multi', label: 'Multi-events' },
      ],
      details: [],
      stats: [
        s('100m', '100m', ['sprints', 'hurdles', 'multi'], ['sprints']), s('200m', '200m', ['sprints', 'multi'], ['sprints']), s('400m', '400m', ['sprints', 'mid', 'hurdles', 'multi'], ['sprints', 'mid']),
        s('800m', '800m', ['mid', 'dist', 'multi'], ['mid']), s('1600m', '1600m / Mile', ['mid', 'dist'], ['mid', 'dist']), s('3200m', '3200m / 2 Mile', ['dist'], ['dist']), s('xc5k', 'XC 5K', ['dist', 'mid'], ['dist']),
        s('110h', '110m / 100m hurdles', ['hurdles', 'multi'], ['hurdles']), s('300h', '300m / 400m hurdles', ['hurdles'], ['hurdles']),
        s('hj', 'High jump', ['jumps', 'multi'], ['jumps']), s('lj', 'Long jump', ['jumps', 'sprints', 'multi'], ['jumps']), s('tj', 'Triple jump', ['jumps']), s('pv', 'Pole vault', ['jumps', 'multi']),
        s('shot', 'Shot put', ['throws', 'multi'], ['throws']), s('discus', 'Discus', ['throws'], ['throws']), s('jav', 'Javelin', ['throws']),
        s('multi_pts', 'Decathlon / Heptathlon points', ['multi'], ['multi']),
      ],
      measurables: [],
      links: [{ key: 'athleticnet', label: 'Athletic.net', top: true, level: 'hs' }, { key: 'milesplit', label: 'MileSplit', top: true, level: 'hs' }, { key: 'tfrrs', label: 'TFRRS', top: true, level: 'college' }],
      results: { title: 'Results', columns: ['Event', 'Mark', 'Meet', 'Date'], key: 1, pb: 'PR', examples: ['400m', '48.92', 'State finals', 'May 2026'] },
    },

    swimming: {
      label: 'Swimming', number: false, words: { stats: 'Times', film: 'Races', position: 'Events', ask: 'What do you swim?' },
      positions: [
        { id: 'free', label: 'Freestyle' }, { id: 'back', label: 'Backstroke' }, { id: 'breast', label: 'Breaststroke' },
        { id: 'fly', label: 'Butterfly' }, { id: 'im', label: 'IM' }, { id: 'dist', label: 'Distance' },
      ],
      details: [{ key: 'club', label: 'Club team' }],
      stats: [
        s('50free', '50 Free', all, ['free']), s('100free', '100 Free', all, ['free']), s('200free', '200 Free', all, ['free', 'dist']),
        s('500free', '500 Free', ['free', 'dist', 'im'], ['dist']), s('1650free', '1650 Free', ['dist'], ['dist']),
        s('100back', '100 Back', all, ['back']), s('200back', '200 Back', ['back', 'im'], ['back']),
        s('100breast', '100 Breast', all, ['breast']), s('200breast', '200 Breast', ['breast', 'im'], ['breast']),
        s('100fly', '100 Fly', all, ['fly']), s('200fly', '200 Fly', ['fly', 'im'], ['fly']),
        s('200im', '200 IM', all, ['im']), s('400im', '400 IM', ['im', 'dist'], ['im']),
      ],
      measurables: [],
      links: [{ key: 'swimcloud', label: 'SwimCloud', top: true }],
      results: { title: 'Best times', columns: ['Event', 'Time', 'Course', 'Meet', 'Date'], key: 1, pb: 'PB', examples: ['200 free', '1:39.84', 'SCY', 'Sectionals', 'Feb 2026'] },
    },

    hockey: {
      label: 'Hockey', number: true, words: { stats: 'Stats', film: 'Film' },
      positions: [{ id: 'c', label: 'Center' }, { id: 'w', label: 'Wing' }, { id: 'd', label: 'Defense' }, { id: 'g', label: 'Goalie' }],
      details: [{ key: 'shoots', label: 'Shoots / catches', options: ['Left', 'Right'] }, { key: 'club', label: 'Team and level (e.g. 16U AAA)' }],
      stats: [
        s('gp', 'Games played', all), s('goals', 'Goals', ['c', 'w', 'd'], ['c', 'w']), s('assists', 'Assists', ['c', 'w', 'd'], ['c', 'w', 'd']),
        s('points', 'Points', ['c', 'w', 'd'], ['c', 'w', 'd']), s('plus_minus', 'Plus / minus', ['c', 'w', 'd'], ['d']), s('pim', 'Penalty minutes', ['c', 'w', 'd']),
        s('faceoff_pct', 'Faceoff %', ['c'], ['c']),
        s('gaa', 'Goals against average', ['g'], ['g']), s('sv_pct', 'Save %', ['g'], ['g']), s('wins', 'Wins', ['g'], ['g']), s('shutouts', 'Shutouts', ['g']),
      ],
      measurables: [],
      links: [{ key: 'eliteprospects', label: 'Elite Prospects', top: true }, { key: 'hudl', label: 'Hudl' }],
    },

    wrestling: {
      label: 'Wrestling', number: false, words: { stats: 'Record', film: 'Matches', position: 'Weight class', ask: 'What weight class?' },
      positions: [],
      details: [{ key: 'weight', label: 'Weight class' }, { key: 'club', label: 'Club' }],
      stats: [
        s('record', 'Record (W-L)', all, every), s('pins', 'Pins', all, every), s('win_pct', 'Win %', all),
        s('takedowns', 'Takedowns', all, every), s('tech_falls', 'Tech falls', all), s('majors', 'Major decisions', all),
      ],
      measurables: [],
      links: [{ key: 'trackwrestling', label: 'Trackwrestling', top: true }, { key: 'flo', label: 'FloWrestling', top: true }],
      results: { title: 'Results', columns: ['Tournament', 'Place', 'Weight', 'Date'], key: 1, examples: ['State championships', '3rd', '152 lb', 'Feb 2026'] },
    },

    lacrosse: {
      label: 'Lacrosse', number: true, words: { stats: 'Stats', film: 'Film' },
      positions: [
        { id: 'a', label: 'Attack' }, { id: 'm', label: 'Midfield' }, { id: 'd', label: 'Defense' },
        { id: 'lsm', label: 'Long-stick midfield' }, { id: 'fo', label: 'Faceoff' }, { id: 'g', label: 'Goalie' },
      ],
      details: [{ key: 'hand', label: 'Dominant hand', options: ['Right', 'Left', 'Both'] }, { key: 'club', label: 'Club team' }],
      stats: [
        s('goals', 'Goals', ['a', 'm', 'lsm'], ['a', 'm']), s('assists', 'Assists', ['a', 'm', 'lsm'], ['a', 'm']), s('points', 'Points', ['a', 'm'], ['a']),
        s('gb', 'Ground balls', all, ['m', 'd', 'lsm', 'fo']), s('ct', 'Caused turnovers', ['d', 'lsm', 'm'], ['d', 'lsm']),
        s('fo_pct', 'Faceoff %', ['fo', 'm'], ['fo']), s('fo_won', 'Faceoffs won', ['fo'], ['fo']),
        s('saves', 'Saves', ['g'], ['g']), s('sv_pct', 'Save %', ['g'], ['g']), s('gaa', 'Goals against average', ['g'], ['g']),
      ],
      measurables: [s('shot_speed', 'Shot speed', ['a', 'm'], ['a', 'm']), s('forty', '40-yard dash', all)],
      links: [{ key: 'hudl', label: 'Hudl', top: true }, { key: 'maxpreps', label: 'MaxPreps', level: 'hs' }],
    },

    rowing: {
      label: 'Rowing', number: false, words: { stats: 'Erg & results', film: 'Racing', position: 'Side or seat', ask: 'Which side or seat?' },
      positions: [{ id: 'port', label: 'Port' }, { id: 'star', label: 'Starboard' }, { id: 'scull', label: 'Sculler' }, { id: 'cox', label: 'Coxswain' }],
      details: [{ key: 'weight_class', label: 'Weight class', options: ['Openweight', 'Lightweight'] }, { key: 'club', label: 'Club / program' }],
      stats: [
        s('erg2k', '2k erg', ['port', 'star', 'scull'], ['port', 'star', 'scull']), s('erg6k', '6k erg', ['port', 'star', 'scull'], ['port', 'star', 'scull']),
        s('erg500', '500m erg', ['port', 'star', 'scull']), s('erg5k', '5k erg', ['port', 'star', 'scull']),
        s('crews', 'Crews coxed', ['cox'], ['cox']),
      ],
      measurables: [s('wingspan', 'Wingspan', ['port', 'star', 'scull'])],
      links: [{ key: 'concept2', label: 'Concept2 logbook', top: true }, { key: 'regattacentral', label: 'RegattaCentral', level: 'hs' }, { key: 'row2k', label: 'row2k', level: 'college' }],
      results: { title: 'Racing results', columns: ['Regatta', 'Event', 'Place', 'Time'], key: 2, examples: ['Head of the Charles', 'Youth 8+', '4th', '15:42.6'] },
    },

    // Not one of the twelve set up deeply; a sensible generic start.
    golf: { label: 'Golf', number: false, words: { stats: 'Scoring', film: 'Swing' }, positions: [], details: [{ key: 'handicap', label: 'Handicap index' }], stats: [s('scoring_avg', 'Scoring average', all, every), s('best_round', 'Best round', all, every)], measurables: [s('club_speed', 'Driver club speed', all)], links: [{ key: 'jgs', label: 'Junior Golf Scoreboard', top: true, level: 'hs' }], results: { title: 'Tournament results', columns: ['Tournament', 'Score', 'Place', 'Date'], key: 1, examples: ['Junior Invitational', '71 (−1)', 'T3', 'Jun 2026'] } },
    tennis: { label: 'Tennis', number: false, words: { stats: 'Record', film: 'Match play', position: 'Event', ask: 'Singles or doubles?' }, positions: [{ id: 'singles', label: 'Singles' }, { id: 'doubles', label: 'Doubles' }], details: [{ key: 'hand', label: 'Plays', options: ['Right-handed', 'Left-handed'] }], stats: [s('utr', 'UTR rating', all, every), s('record', 'Record (W-L)', all, every)], measurables: [], links: [{ key: 'utr', label: 'UTR', top: true }] },
    // Added session 4 (Willy). DUPR is the rating players, clubs and college teams go by.
    pickleball: { label: 'Pickleball', number: false, words: { stats: 'Ratings', film: 'Match play', position: 'Event', ask: 'Singles or doubles?' }, positions: [{ id: 'singles', label: 'Singles' }, { id: 'doubles', label: 'Doubles' }, { id: 'mixed', label: 'Mixed doubles' }], details: [{ key: 'hand', label: 'Plays', options: ['Right-handed', 'Left-handed'] }, { key: 'club', label: 'Club' }], stats: [s('dupr', 'DUPR rating', all, every), s('record', 'Record (W-L)', all, every), s('medals', 'Tournament medals', all)], measurables: [], links: [{ key: 'dupr', label: 'DUPR', top: true }], results: { title: 'Tournament results', columns: ['Tournament', 'Division', 'Place', 'Date'], key: 2, examples: ['State Games', '4.0 mixed', 'Gold', 'Jul 2026'] } },
    other: { label: 'Other', number: true, words: { stats: 'Stats', film: 'Film' }, positions: [], details: [], stats: [], measurables: [], links: [] },
  };

  /*
   * Competition level. High school and college athletes describe themselves differently:
   * graduating class vs academic year and eligibility, recruiting vs portal/NIL/draft.
   */
  const LEVELS = {
    hs: {
      label: 'High school',
      details: [],
      statuses: [{ key: 'recruiting', label: 'Open to recruiting' }, { key: 'committed', label: 'Committed' }, { key: 'nil', label: 'Open to NIL' }],
      links: [],
    },
    college: {
      label: 'College',
      details: [
        { key: 'division', label: 'Division', options: ['NCAA Division I', 'NCAA Division II', 'NCAA Division III', 'NAIA', 'NJCAA / Junior college', 'U SPORTS', 'Club'] },
        { key: 'conference', label: 'Conference' },
        { key: 'academicYear', label: 'Year', options: ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'] },
        { key: 'redshirt', label: 'Redshirt', options: ['Yes', 'No'] },
        { key: 'eligibility', label: 'Eligibility left', options: ['1 year', '2 years', '3 years', '4 years', '5 years'] },
      ],
      statuses: [{ key: 'portal', label: 'In the transfer portal' }, { key: 'nil', label: 'Open to NIL' }, { key: 'draft', label: 'Draft eligible' }],
      links: [{ key: 'roster', label: 'Team roster page', top: true }],
    },
  };

  /** True when an entry suits a position ('*' or listed). No position means everything suits. */
  const suits = (entry, pos) => !pos || entry.for === '*' || (Array.isArray(entry.for) && entry.for.includes(pos));
  const ticked = (entry, pos) => entry.top === '*' || (Array.isArray(entry.top) && (entry.top.includes('*') || (pos && entry.top.includes(pos))));

  /** Find a position by id or by its label (the profile stores the label). */
  function positionOf(sportKey, value) {
    const sport = CATALOG[sportKey];
    if (!sport || !value) return null;
    const v = String(value).toLowerCase().trim();
    return sport.positions.find((p) => p.id === v || p.label.toLowerCase() === v) || null;
  }

  /**
   * The checklist for a sport + position: every suitable item, with the common ones ticked.
   * Athletes see this as suggestions only.
   */
  function suggest(sportKey, position, levelKey = 'hs') {
    const sport = CATALOG[sportKey] || CATALOG.other;
    const level = LEVELS[levelKey] ? levelKey : 'hs';
    const pos = positionOf(sportKey, position)?.id || null;
    const pick = (list) => list.filter((e) => suits(e, pos)).map((e) => ({ key: e.key, label: e.label, checked: ticked(e, pos) }));
    // A link's `top` may be true (ticked at both levels) or a level key (ticked only there).
    const links = [...LEVELS[level].links, ...sport.links]
      .filter((l) => !l.level || l.level === level)
      .map((l) => ({ key: l.key, label: l.label, checked: l.top === true || l.top === level }));
    return {
      sport: sport.label,
      level,
      position: pos,
      words: sport.words,
      number: sport.number,
      details: [...LEVELS[level].details, ...sport.details],
      statuses: LEVELS[level].statuses,
      stats: pick(sport.stats),
      measurables: pick(sport.measurables),
      links,
      results: sport.results || null,
    };
  }

  A.SPORT_CATALOG = CATALOG;
  // Sports with a professional draft: only there does "Draft eligible" mean something (decided session 7).
  A.DRAFT_SPORTS = new Set(['football', 'basketball', 'baseball', 'hockey', 'soccer', 'lacrosse', 'softball', 'volleyball']);
  // Detail fields that only make sense for high school athletes (college players don't list a club team).
  A.HS_ONLY_DETAILS = new Set(['club']);
  A.LEVELS = LEVELS;
  A.suggestFor = suggest;
  A.positionOf = positionOf;
})();
