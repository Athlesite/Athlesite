// The photo shot list for the 15 homepage examples: one character sheet per athlete (the same
// person in every picture) and every photo their page uses: the cover (framed for their cover
// layout), three gallery photos, and one thumbnail per video on their page.
//
// One source for two things:
//   node tools/photo-shots.js      writes PHOTO-PROMPTS.md (ready-to-paste AI image prompts)
//   tools/add-photos.js            reads each file's alt text and starting focus point from here
//
// Rules for every photo (EXAMPLES.md): fictional people only, no logos or marks, no text except the
// jersey number, a real-photo look. Sizes: cover ≥2400px on the long side if the tool allows.
const fs = require('fs'), path = require('path');

const STYLE = 'Photorealistic sports photography, shot by a professional team photographer on a full-frame camera. Natural skin texture, real fabric, sweat and grass or dirt where they belong; no plastic retouching, no illustration, no CGI look.';
const FICTIONAL = 'The athlete is a fictional person and must not resemble any real athlete or celebrity.';
const noText = (num) => num
  ? `No logos, brand marks, school or team names, sponsor patches or readable signs anywhere (uniform, shoes, equipment, walls, scoreboards). No text or lettering except jersey numbers; the athlete's own number is ${num} and must read exactly "${num}". No watermark.`
  : 'No logos, brand marks, school or team names, sponsor patches, numbers or readable signs anywhere (clothing, shoes, equipment, walls, scoreboards). No text or lettering at all. No watermark.';
const SHAPES = {
  '3:2': 'Landscape photo, 3:2.',
  '4:5': 'Vertical portrait photo, 4:5.',
  '16:9': 'Wide 16:9 frame.',
  '3:1': 'Very wide banner photo, 3:1.',
  '1:1': 'Square photo, 1:1.',
};
// A video thumbnail is a paused frame of game video, not a posed photo.
const FILM = 'A frame from game video, the kind you would pause on in a highlight reel: real broadcast or sideline-camera look, slight motion blur, no on-screen graphics, score bug or captions.';

/**
 * Per athlete: who they are (sheet), what they wear (kit), the number that may appear (num), and
 * the shots. A shot: file (the name to save it as), shape, scene, alt text for the page, and for
 * the cover its focus point [x, y] (where the face is, 0–1), matching the cover layout's framing.
 * done: true = the page already has this photo (listed for the record, no prompt needed).
 */
const ATHLETES = [
  {
    slug: 'jordan-bell', name: 'Jordan Bell', sport: 'Football', layout: 'Cinematic · Left-aligned', num: '14',
    sheet: 'a 17-year-old high school wide receiver, 6 ft 1, lean and athletic, light-brown skin, dark tightly curled hair (short on the sides, curls on top), dark-brown eyes, a faint smudge of eye black under his eyes on game nights',
    kit: 'a black football jersey with white numbers 14, black pants, a matte black helmet with no decals, plain white receiver gloves',
    note: 'His cover (the towel shot) and the back shot are already on the page. Photo 2 replaces the "team line" picture, which shows team wordmarks and helmet logos and is too small (680×383).',
    shots: [
      { file: 'cover', done: true, alt: 'Jordan Bell on the sideline after a night game' },
      { file: 'photo-1', done: true, alt: 'Jordan from behind, number 14, under the lights' },
      { file: 'photo-2', shape: '3:2', alt: 'Jordan in the pre-game huddle with his teammates', scene: 'Pre-game huddle on the sideline under stadium lights: Jordan and five teammates in black jerseys, helmets on, arms over each other\'s shoulders; Jordan faces the camera three-quarters, eyes intense. Teammates wear other numbers (7, 22, 81, 3); only Jordan wears 14. Night sky, floodlight flare, shallow depth of field on Jordan.' },
      { file: 'photo-3', shape: '3:2', alt: 'Jordan leaping for a catch over a defender', scene: 'Night game action: Jordan leaping high near the sideline, catching the ball with both hands over a defender in a white jersey and helmet. Stadium lights behind, dark sky, frozen motion, shot from a low angle with a long lens.' },
      { file: 'photo-4', shape: '4:5', alt: 'Jordan running a route at practice', scene: 'Practice at golden hour on an empty grass field: Jordan in a plain white practice jersey with black number 14 and black shorts, no helmet, cutting hard around an orange cone, low warm sun behind him, long shadows.' },
      { file: 'film-1', shape: '16:9', alt: 'Junior season highlights', scene: `${FILM} High school football at night, filmed from high in the stands: Jordan (black jersey, 14) sprinting past a defender in white down the sideline, the ball in the air toward him.` },
      { file: 'film-2', shape: '16:9', alt: 'Summer camp reel', scene: `${FILM} A daytime summer football camp: Jordan in a plain heather-gray T-shirt and black shorts, no helmet, catching a pass between two cones; other campers in colored mesh pinnies wait in line behind.` },
    ],
  },
  {
    slug: 'maya-rodriguez', name: 'Maya Rodriguez', sport: 'Soccer', layout: 'Editorial · Split', num: '8',
    sheet: 'a 17-year-old high school soccer midfielder, 5 ft 6, athletic, light olive-tan skin, long dark-brown hair pulled back in a high ponytail, brown eyes, a natural, composed look',
    kit: 'a forest-green soccer jersey with a white number 8, white shorts, green socks, black cleats with no logos',
    note: 'Her cover is already on the page.',
    shots: [
      { file: 'cover', done: true, alt: 'Maya Rodriguez on the field' },
      { file: 'photo-1', shape: '3:2', alt: 'Maya taking a first touch with a defender closing in', scene: 'Game action on a grass field in late-afternoon sun: Maya taking a first touch off her thigh, eyes on the ball, an opponent in a navy jersey closing in from behind. Shot from the sideline with a long lens, grass spray, warm backlight.' },
      { file: 'photo-2', shape: '3:2', alt: 'Maya celebrating a goal with her teammates', scene: 'Goal celebration: Maya hugging two teammates in matching green jerseys on the field, all laughing, one teammate jumping on her back. Golden-hour light, stadium lights just switching on behind.' },
      { file: 'photo-3', shape: '4:5', alt: 'Maya lacing her cleats before a game', scene: 'Before a game, sitting on a team bench by the field, Maya tying her cleats, ponytail falling over one shoulder, focused. Soft overcast light, teammates blurred in the background.' },
      { file: 'film-1', shape: '16:9', alt: 'Fall 2025 highlights', scene: `${FILM} High school soccer at dusk filmed from the sideline: Maya (green, 8) striking a long pass across the field, players in green and navy around her, field lights on.` },
    ],
  },
  {
    slug: 'tyler-brooks', name: 'Tyler Brooks', sport: 'Baseball', layout: 'Prospect · Profile card', num: '6',
    sheet: 'a 17-year-old high school shortstop, 6 ft, lean, fair skin with a sun tan, dark-brown wavy hair under a plain black cap, hazel eyes, light stubble',
    kit: 'a black button-front baseball jersey with thin white piping and a white number 6 on the back, light-gray pants with dirt stains, black socks, a worn brown leather glove with no brand marks',
    note: 'His cover is already on the page.',
    shots: [
      { file: 'cover', done: true, alt: 'Tyler Brooks at shortstop' },
      { file: 'photo-1', shape: '3:2', alt: 'Tyler turning a double play at second base', scene: 'Daytime game action at second base: Tyler mid-throw while turning a double play, leaping over a sliding runner in a white uniform, dust flying off the dirt infield. Shot from the first-base side with a long lens, frozen motion.' },
      { file: 'photo-2', shape: '3:2', alt: 'Tyler and his teammates on the dugout rail', scene: 'In the dugout: Tyler and three teammates in black jerseys leaning on the dugout rail, watching the field, sunflower seeds and helmets on the bench. Late-afternoon light, shallow depth of field on Tyler.' },
      { file: 'photo-3', shape: '4:5', alt: 'Tyler in the batting cage', scene: 'Batting practice in a net cage at sunset: Tyler in a plain black batting helmet, mid-swing, ball just leaving the bat, the net glowing in warm backlight.' },
      { file: 'film-1', shape: '16:9', alt: 'Infield defense, spring 2025', scene: `${FILM} High school baseball, filmed from behind home plate: Tyler (black jersey) ranging deep into the hole at shortstop to backhand a ground ball, dust kicking up.` },
      { file: 'film-2', shape: '16:9', alt: 'Batting practice, front view', scene: `${FILM} Batting practice filmed from behind a pitcher's protective screen: Tyler in a black batting helmet at the plate, mid-swing, front view, outfield fence behind him.` },
    ],
  },
  {
    slug: 'aaliyah-grant', name: 'Aaliyah Grant', sport: 'Basketball', layout: 'Highlight · Big number', num: '11',
    sheet: 'a 20-year-old college point guard, 5 ft 8, lean and quick, deep-brown skin, long black box braids tied up in a high bun, brown eyes, calm and focused',
    kit: 'a royal-blue basketball jersey and shorts with white trim and a white number 11, plain white sneakers with no logos',
    shots: [
      { file: 'cover', shape: '3:2', focus: [0.32, 0.3], alt: 'Aaliyah Grant pushing the ball up the court', scene: 'Aaliyah mid-dribble pushing the ball up the court in a dark arena, shot from a low angle. She fills the LEFT third of the frame, looking ahead; the right half is dark, empty arena (a giant number is laid over it on her page).', light: 'Hard spotlight from above, deep shadows, high contrast' },
      { file: 'photo-1', shape: '3:2', alt: 'Aaliyah driving past a defender for a layup', scene: 'Game action: Aaliyah driving past a defender in a white jersey and rising for a layup, ball high in one hand, arena lights, crowd blurred dark behind. Shot from the baseline.' },
      { file: 'photo-2', shape: '3:2', alt: 'Aaliyah talking in the timeout huddle', scene: 'Timeout huddle: Aaliyah in the middle of four teammates in blue, talking and pointing at a play, teammates listening, sweat on their faces. Courtside angle, warm arena light.' },
      { file: 'photo-3', shape: '4:5', alt: 'Aaliyah shooting alone in an empty gym', scene: 'Early morning in an empty gym: Aaliyah in a plain gray hoodie and blue shorts holding a ball on her hip, sunlight streaming through high windows across the court, quiet and calm.' },
      { file: 'film-1', shape: '16:9', alt: 'Junior season, every assist', scene: `${FILM} College basketball from the baseline camera: Aaliyah (blue, 11) throwing a no-look pass to a cutting teammate, defenders in white turning.` },
      { file: 'film-2', shape: '16:9', alt: 'Conference tournament run', scene: `${FILM} A wide broadcast frame of a packed arena during a tournament game (crowd blurred, nothing readable): Aaliyah bringing the ball up the court, teammates in blue spreading out.` },
    ],
  },
  {
    slug: 'kenzie-morales', name: 'Kenzie Morales', sport: 'Softball', layout: 'Highlight · Color block', num: '21',
    sheet: 'a 17-year-old high school softball pitcher, 5 ft 9, tall and strong, medium tan skin, dark-brown hair in a long braid under a visor, dark eyes, intense focus',
    kit: 'a crimson-red softball jersey with a white number 21, white pants, a black visor, black socks, a plain black glove with no brand marks',
    shots: [
      { file: 'cover', shape: '3:2', focus: [0.68, 0.3], alt: 'Kenzie Morales releasing a pitch', scene: 'Kenzie at the release point of a windmill pitch, arm whipping through, front leg striding. She fills the RIGHT half of the frame; the left half is plain, out-of-focus background (a solid color panel covers it on her page).', light: 'Bright late-afternoon sun from the side, crisp shadows, high contrast' },
      { file: 'photo-1', shape: '3:2', alt: 'Kenzie fielding a bunt off the mound', scene: 'Game action: Kenzie lunging off the pitching circle to field a bunt, glove reaching for the ball, dirt spraying, a batter in navy running in the background.' },
      { file: 'photo-2', shape: '3:2', alt: 'Kenzie with her infield in the circle', scene: 'Mound visit: Kenzie and four infielders in crimson gathered in the pitching circle, gloves over their mouths, talking strategy, catcher with mask pushed up. Daylight, shallow depth of field.' },
      { file: 'photo-3', shape: '4:5', alt: 'Kenzie laughing with her catcher in the bullpen', scene: 'Bullpen at sunset: Kenzie laughing with her catcher between warm-up pitches, ball in her hand, chain-link fence behind glowing in warm light.' },
      { file: 'film-1', shape: '16:9', alt: 'Junior season pitching', scene: `${FILM} High school softball filmed from the center-field camera, looking past Kenzie (crimson, 21) mid-windup toward home plate, a batter in navy waiting.` },
      { file: 'film-2', shape: '16:9', alt: 'Riseball and changeup, slow motion', scene: `${FILM} A slow-motion side view at the release: the ball just leaving Kenzie's hand, motion blur on her arm, dirt lifting at her stride foot.` },
    ],
  },
  {
    slug: 'owen-castellanos', name: 'Owen Castellanos', sport: 'Lacrosse', layout: 'Highlight · Center poster', num: '22',
    sheet: 'an 18-year-old high school lacrosse attackman, 5 ft 10, compact and strong, light-tan skin, short dark-brown hair, brown eyes, determined',
    kit: 'a black lacrosse jersey with a neon volt-yellow number 22, black shorts, a black helmet with a volt-yellow face mask, black gloves, a plain lacrosse stick with a white head and no brand marks',
    shots: [
      { file: 'cover', shape: '3:2', focus: [0.5, 0.32], alt: 'Owen Castellanos winding up to shoot', scene: 'Owen centered in the frame, cradling the stick and winding up to shoot, helmet on, eyes visible through the mask. Dramatic, poster-like, symmetrical composition.', light: 'Stadium lights behind him at night, rim light, dark surroundings' },
      { file: 'photo-1', shape: '3:2', alt: 'Owen dodging behind the goal', scene: 'Game action: Owen dodging hard around the back of the goal, low angle from the turf, a defender in white sliding to him, rubber turf pellets spraying.' },
      { file: 'photo-2', shape: '3:2', alt: 'Owen and his teammates celebrating a goal', scene: 'Teammates in black jerseys mobbing Owen after a goal, sticks raised, helmets knocking together, night game under lights.' },
      { file: 'photo-3', shape: '4:5', alt: 'Owen restringing his stick on the bench', scene: 'Helmet off, sitting on the team bench restringing his stick head, concentrating, hair damp. Soft dusk light, teammates blurred behind.' },
      { file: 'film-1', shape: '16:9', alt: 'Senior season highlights', scene: `${FILM} High school lacrosse filmed from the end line: Owen (black, 22) shooting on goal, the goalie in white reaching.` },
      { file: 'film-2', shape: '16:9', alt: 'Feeds from X', scene: `${FILM} Filmed from the press box: Owen behind the goal passing to a teammate cutting toward the crease, defenders turning their heads.` },
    ],
  },
  {
    slug: 'liam-kowalski', name: 'Liam Kowalski', sport: 'Hockey', layout: 'Cinematic · Center stage', num: '19',
    sheet: 'a 20-year-old college hockey center, 6 ft, solidly built, fair skin with flushed cheeks, short light-brown hair (damp after a shift), blue-gray eyes, light stubble',
    kit: 'a black hockey jersey with gold sleeve stripes and a gold number 19, a black helmet with a clear half visor, black gloves, black pants, black stick tape, no logos',
    shots: [
      { file: 'cover', shape: '3:2', focus: [0.5, 0.28], alt: 'Liam Kowalski in the rink tunnel', scene: 'Liam centered, waist-up, helmet off and held under one arm, standing in a dark rink tunnel, face in the upper third of the frame. The lower part of the frame is dark and quiet (his name goes there on his page).', light: 'A single overhead light catching the sweat, cold ice haze behind' },
      { file: 'photo-1', shape: '3:2', alt: 'Liam taking a faceoff', scene: 'Game action at ice level: Liam crouched over a faceoff dot against a center in white, stick blades down, the puck just dropping, ice shavings in the air.' },
      { file: 'photo-2', shape: '3:2', alt: 'Liam and his teammates on the bench', scene: 'The team bench: Liam and teammates in black leaning over the boards, watching the play, Liam with a towel around his neck, steam on the glass.' },
      { file: 'photo-3', shape: '4:5', alt: 'Liam skating alone at an early practice', scene: 'Early morning skate on an empty rink: Liam alone in a plain gray practice jersey, gliding with a puck, empty seats dark behind, a cold blue light.' },
      { file: 'film-1', shape: '16:9', alt: 'Sophomore season goals', scene: `${FILM} College hockey filmed from the press box: Liam (black, 19) snapping a wrist shot from the slot, the goalie in white dropping.` },
      { file: 'film-2', shape: '16:9', alt: 'Faceoff wins, every zone', scene: `${FILM} A tight overhead frame of a faceoff: two centers crouched, Liam in black winning the draw back to a teammate.` },
    ],
  },
  {
    slug: 'imani-wallace', name: 'Imani Wallace', sport: 'Track & Field', layout: 'Cinematic · Split screen', num: '',
    sheet: 'an 18-year-old high school sprinter, 5 ft 7, a powerful sprinter\'s build, dark-brown skin, hair in a sleek high bun, brown eyes, focused',
    kit: 'a deep-red racing singlet and black sprint briefs, red track spikes with no brand marks, no race bib',
    shots: [
      { file: 'cover', shape: '4:5', focus: [0.5, 0.3], alt: 'Imani Wallace on the track after a race', scene: 'Imani centered, three-quarter length, standing on a red running track at night just after a race, chest rising, hands on her hips, looking straight ahead.', light: 'Stadium light behind her, rim light on her shoulders, dark background' },
      { file: 'photo-1', shape: '3:2', alt: 'Imani coming off the curve in the 200 meters', scene: 'Race action: Imani coming off the curve in a 200m race, leaning into the turn, low angle from the infield, background blurred with motion.' },
      { file: 'photo-2', shape: '3:2', alt: 'Imani hugging her relay teammates', scene: 'Relay teammates in matching red singlets hugging Imani on the infield grass after a 4×400 relay, all breathing hard and smiling, evening light.' },
      { file: 'photo-3', shape: '4:5', alt: 'Imani setting her starting blocks', scene: 'Kneeling on the track to set her starting blocks before a race, focused on the pedals, soft morning light, empty lanes behind.' },
      { file: 'film-1', shape: '16:9', alt: 'State finals, 400m', scene: `${FILM} A track meet filmed from the stands: Imani (red singlet) pulling ahead down the home straight of the 400m, other runners in other colors behind her.` },
      { file: 'film-2', shape: '16:9', alt: 'Indoor season, 200m', scene: `${FILM} An indoor banked track: Imani driving out of the starting blocks, low and powerful, arena lights overhead.` },
    ],
  },
  {
    slug: 'sofia-lindqvist', name: 'Sofia Lindqvist', sport: 'Volleyball', layout: 'Editorial · Magazine cover', num: '7',
    sheet: 'a 22-year-old college volleyball outside hitter, 6 ft 1, tall and athletic, fair skin, long straight light-blonde hair in a high ponytail, blue eyes, composed',
    kit: 'a royal-blue volleyball jersey with a white number 7, black athletic shorts, black knee pads, white shoes with no logos',
    shots: [
      { file: 'cover', shape: '3:2', focus: [0.7, 0.3], alt: 'Sofia Lindqvist in the gym, ball on her hip', scene: 'Sofia standing in the RIGHT third of the frame in a bright, airy gym, a volleyball on her hip, relaxed and confident, looking at the camera. Calm, empty pale wall on the left and below her, like a magazine cover with room for a headline.', light: 'Soft daylight from high windows, gentle shadows' },
      { file: 'photo-1', shape: '3:2', alt: 'Sofia hitting over the block', scene: 'Game action at the net: Sofia airborne, arm cocked back to spike, two blockers in white with hands up across the net, gym lights.' },
      { file: 'photo-2', shape: '3:2', alt: 'Sofia and her team in a huddle', scene: 'Between points: Sofia and five teammates in blue in a tight circle, hands together in the middle, smiling and shouting.' },
      { file: 'photo-3', shape: '4:5', alt: 'Sofia laughing on the bench', scene: 'On the team bench, laughing with a teammate, an ice bag on her shoulder, warm side light, teammates blurred.' },
      { file: 'film-1', shape: '16:9', alt: 'Senior season kills', scene: `${FILM} College volleyball filmed from the end line: Sofia (blue, 7) hitting over a two-person block.` },
      { file: 'film-2', shape: '16:9', alt: 'Serve receive, conference play', scene: `${FILM} A low sideline frame: Sofia passing a serve, arms out in a platform, eyes on the ball.` },
    ],
  },
  {
    slug: 'hannah-mercer', name: 'Hannah Mercer', sport: 'Rowing', layout: 'Editorial · Headline', num: '',
    sheet: 'a 21-year-old college rower, 5 ft 11, long-limbed with strong shoulders, fair skin with freckles, auburn hair in a single braid, green-gray eyes, steady',
    kit: 'a terracotta-red rowing unisuit with cream trim; oar blades painted plain terracotta with no lettering',
    shots: [
      { file: 'cover', shape: '16:9', focus: [0.5, 0.35], alt: 'Hannah Mercer rowing at sunrise', scene: 'A wide shot: Hannah centered, in the boat mid-stroke on a calm river at sunrise, face in the upper half of the frame, teammates\' shoulders softly blurred in front of and behind her, mist on the water.', light: 'Low golden sunrise light, soft haze' },
      { file: 'photo-1', shape: '3:2', alt: 'Hannah\'s eight at full pressure', scene: 'The eight at full pressure, photographed from the coach\'s motorboat: rowers in terracotta in sync, water spraying off the blades, Hannah in the middle seats.' },
      { file: 'photo-2', shape: '3:2', alt: 'Hannah and her crew carrying the boat to the dock', scene: 'At dawn, Hannah and her crew carrying the long racing shell overhead down to the dock, mist on the river, everyone in matching terracotta.' },
      { file: 'photo-3', shape: '4:5', alt: 'Hannah on the rowing machine in the boathouse', scene: 'In a boathouse full of racked boats: Hannah on an indoor rowing machine with no brand marks, mid-stroke, breathing hard, window light.' },
      { file: 'film-1', shape: '16:9', alt: 'Spring racing, first varsity eight', scene: `${FILM} A race filmed from a launch alongside the boat: eight rowers in terracotta, buoy line in the water, spray off the blades.` },
    ],
  },
  {
    slug: 'mateo-ruiz', name: 'Mateo Ruiz', sport: 'Wrestling', layout: 'Portrait · Side by side', num: '',
    sheet: 'a 17-year-old high school wrestler, 5 ft 8, compact and muscular, medium-brown skin, short black hair with faded sides, dark eyes, a slightly thickened left ear, serious',
    kit: 'a charcoal-gray wrestling singlet with thin gold trim and no lettering, black wrestling shoes, black headgear when wrestling',
    note: 'His page shows photos in black and white.',
    shots: [
      { file: 'cover', shape: '4:5', focus: [0.5, 0.3], alt: 'Mateo Ruiz, portrait', scene: 'A portrait: Mateo centered, waist-up, standing against a plain dark-gray backdrop, arms relaxed at his sides, calm and serious, looking just past the camera.', light: 'One soft light from the side (it will be shown in black and white)' },
      { file: 'photo-1', shape: '3:2', alt: 'Mateo shooting a double-leg takedown', scene: 'Match action on a gym mat: Mateo shooting a double-leg takedown on an opponent in a white singlet, both low, muscles tense, gym lights above.' },
      { file: 'photo-2', shape: '3:2', alt: 'Mateo drilling with his teammates', scene: 'The wrestling room: Mateo and teammates drilling in pairs on padded mats, the coach watching in the background, steam and sweat, overhead fluorescent light.' },
      { file: 'photo-3', shape: '4:5', alt: 'Mateo sitting alone before a match', scene: 'Before a match: Mateo sitting alone at the edge of the mat, hood of a plain black sweatshirt up, plain headphones around his neck, staring ahead.' },
      { file: 'film-1', shape: '16:9', alt: 'State tournament, all matches', scene: `${FILM} A tournament match filmed from mat level: two wrestlers in the referee's position, Mateo in charcoal on top, bleachers blurred behind.` },
    ],
  },
  {
    slug: 'grace-nakamura', name: 'Grace Nakamura', sport: 'Swimming', layout: 'Portrait · Photo first (color)', num: '',
    sheet: 'a 19-year-old college swimmer, 5 ft 9, long and lean with broad shoulders, light skin with warm undertones, straight black shoulder-length hair, dark-brown eyes, quiet confidence',
    kit: 'a navy competition swimsuit with no logos, a plain white silicone swim cap, mirrored goggles',
    shots: [
      { file: 'cover', shape: '4:5', focus: [0.5, 0.3], alt: 'Grace Nakamura on the pool deck', scene: 'A portrait: Grace centered, chest-up on the pool deck, cap and goggles in one hand, hair wet, a plain pale tiled wall behind her, calm and direct.', light: 'Soft daylight from a high window, clean and bright' },
      { file: 'photo-1', shape: '3:2', alt: 'Grace swimming butterfly', scene: 'Race action from the deck: Grace mid-butterfly stroke breaking the surface, head up, arms sweeping forward, water spraying.' },
      { file: 'photo-2', shape: '3:2', alt: 'Grace cheering her relay teammates', scene: 'Relay teammates in navy suits cheering at the edge of the pool as a teammate touches the wall, Grace leaning over the lane, shouting.' },
      { file: 'photo-3', shape: '4:5', alt: 'Grace on the bleachers before the final', scene: 'Sitting on the pool bleachers in a plain navy team parka with no text, cap and goggles in her hands, quiet before a final, warm natatorium light.' },
      { file: 'film-1', shape: '16:9', alt: 'Conference meet, 400 IM final', scene: `${FILM} A pool filmed from above the lanes during a final: swimmers in lane lines, Grace in the middle lane swimming breaststroke, a white cap.` },
    ],
  },
  {
    slug: 'ethan-whitaker', name: 'Ethan Whitaker', sport: 'Golf', layout: 'Portrait · Centered', num: '',
    sheet: 'a 16-year-old high school golfer, 5 ft 11, slim, fair skin, short sandy-brown hair, blue eyes, calm',
    kit: 'a navy polo shirt, khaki trousers, a white cap and a white glove with no logos, a plain golf bag with no markings',
    note: 'His page shows photos in black and white.',
    shots: [
      { file: 'cover', shape: '4:5', focus: [0.5, 0.32], alt: 'Ethan Whitaker, portrait on the course', scene: 'A portrait: Ethan centered, chest-up, a club resting over his shoulder, looking at the camera, a softly blurred green fairway behind him.', light: 'Soft overcast light (it will be shown in black and white)' },
      { file: 'photo-1', shape: '3:2', alt: 'Ethan at the top of his backswing', scene: 'On a tee box in early morning mist: Ethan at the top of his backswing, balanced, the fairway stretching away behind him.' },
      { file: 'photo-2', shape: '3:2', alt: 'Ethan walking the fairway with his teammates', scene: 'A high school team match: Ethan walking down a fairway with two teammates, carrying their bags, talking, long morning shadows.' },
      { file: 'photo-3', shape: '4:5', alt: 'Ethan reading a putt', scene: 'Crouched behind his ball on the green, reading a putt, the flag blurred in the background.' },
      { file: 'film-1', shape: '16:9', alt: 'Swing, down the line and face on', scene: `${FILM} Swing video shot down the line from behind: Ethan at impact on a driving range, the ball just leaving the club face.` },
    ],
  },
  {
    slug: 'priya-raman', name: 'Priya Raman', sport: 'Tennis', layout: 'Prospect · Banner', num: '',
    sheet: 'a 17-year-old high school tennis player, 5 ft 6, fit and quick, medium-brown skin, long dark hair in a single braid, dark-brown eyes, focused',
    kit: 'a white tennis top and skirt with forest-green trim, a white visor, white shoes with no logos, a plain racquet with no markings',
    shots: [
      { file: 'cover', shape: '3:1', focus: [0.75, 0.42], alt: 'Priya Raman hitting a forehand', scene: 'A very wide banner: Priya in the RIGHT third of the frame hitting a forehand on a blue-green hard court, her face in the middle band of the frame, open court and empty space to the left.', light: 'Bright midday sun, crisp shadow on the court' },
      { file: 'photo-1', shape: '3:2', alt: 'Priya stretching for a backhand', scene: 'Match action: Priya stretching wide for a two-handed backhand, sliding on the hard court, ball on her strings, shot from courtside with a long lens.' },
      { file: 'photo-2', shape: '3:2', alt: 'Priya and her teammates between matches', scene: 'A high school team match: Priya and three teammates in green warm-up jackets with no text, sitting on a courtside bench between matches, laughing.' },
      { file: 'photo-3', shape: '4:5', alt: 'Priya practicing her serve at sunset', scene: 'Serve practice at sunset: Priya at the top of her ball toss, a basket of balls beside her, long warm light across the court.' },
      { file: 'film-1', shape: '16:9', alt: 'Match play, sectional final', scene: `${FILM} A tennis match filmed from high behind the baseline: Priya hitting a forehand, her opponent across the net in navy.` },
    ],
  },
  {
    slug: 'cole-bennett', name: 'Cole Bennett', sport: 'Pickleball', layout: 'Prospect · Compact', num: '',
    sheet: 'a 20-year-old college club pickleball player, 6 ft, athletic, light-tan skin, short curly dark-blond hair, brown eyes, an easy smile',
    kit: 'a navy performance T-shirt with no text, white shorts, white shoes with no logos, a plain paddle with no brand marks, plain sunglasses pushed up on his head',
    shots: [
      { file: 'cover', shape: '1:1', focus: [0.5, 0.38], alt: 'Cole Bennett, headshot on the court', scene: 'A square headshot: Cole\'s head and shoulders centered, smiling, an outdoor pickleball court softly blurred behind him (his page shows it as a small circle).', light: 'Warm desert evening light' },
      { file: 'photo-1', shape: '3:2', alt: 'Cole lunging for a dink at the kitchen line', scene: 'Match action on an outdoor court in bright sun: Cole lunging low at the kitchen line to dink the ball, paddle face open, his doubles partner ready behind him.' },
      { file: 'photo-2', shape: '3:2', alt: 'Cole and his doubles partner fist-bumping', scene: 'Between points: Cole and his doubles partner (in a matching navy shirt) fist-bumping at the net, both grinning.' },
      { file: 'photo-3', shape: '4:5', alt: 'Cole courtside between games', scene: 'Sitting courtside on a cooler between games, a plain sweatband on his wrist, drinking from a plain water bottle, sun low behind him.' },
      { file: 'film-1', shape: '16:9', alt: 'Tournament doubles, gold medal match', scene: `${FILM} A doubles rally filmed from an elevated camera behind the baseline: four players, Cole (navy) at the kitchen line punching a volley.` },
    ],
  },
];

/** The ready-to-paste prompt for one shot. Names stay out of prompts (tools like to print them). */
function promptFor(a, s) {
  const first = a.name.split(' ')[0];
  const scene = s.scene.replace(new RegExp(`\\b${first}\\b`, 'g'), (m, at, str) => (at === 0 || /[.!?]\s$/.test(str.slice(0, at)) ? 'The athlete' : 'the athlete'));
  return [
    STYLE,
    SHAPES[s.shape],
    `The athlete: ${a.sheet}. Wearing ${a.kit}.`,
    scene,
    s.light ? s.light + '.' : '',
    FICTIONAL,
    noText(a.num),
  ].filter(Boolean).join(' ');
}

function markdown() {
  const todo = ATHLETES.flatMap((a) => a.shots.filter((s) => !s.done));
  const out = [];
  out.push(`# Photo prompts for the 15 homepage examples

Generated by \`node tools/photo-shots.js\` from \`tools/photo-shots.js\` (edit there, not here).
**${todo.length} prompts**: ${todo.filter((s) => s.file === 'cover').length} covers, ${todo.filter((s) => s.file.startsWith('photo')).length} gallery photos and ${todo.filter((s) => s.file.startsWith('film')).length} video thumbnails.
Rules: \`EXAMPLES.md\` (fictional people, no logos or marks, no text except the jersey number).

## How to use them

1. **Make each athlete's cover first.** Run the cover prompt a few times and pick the best: the
   right face, a believable body, the right number, nothing written anywhere.
2. **Keep it the same person.** For every other shot of that athlete, give your image tool the
   chosen cover as a reference image (its "reference image", "character reference" or "use this
   person" feature) and paste the prompt. Every prompt repeats the athlete's description, so even
   without a reference the person stays close. Never use a photo of a real person as a reference.
3. **Check every picture** before keeping it: hands (five fingers), faces in the background, the
   jersey number (right digits, right order, nothing else written), the ball / stick / racquet /
   paddle / oar, the uniform colors, no logos or swooshes, no extra limbs. If anything is off, run it
   again.
4. **Shape:** each prompt names its shape (3:2, 4:5, 16:9, 3:1, 1:1). If your tool has an aspect
   setting, set it to match (in Midjourney add \`--ar 3:2\` etc.). Bigger is better: the cover at least
   2400px on its long side if the tool allows, the rest at least 1600px.
5. **Save each picture under the name shown** (\`cover\`, \`photo-1\`, \`film-1\` …, as .jpg, .png or .webp)
   in a folder per athlete: \`studio-v1/incoming/<athlete>/\`, e.g. \`incoming/aaliyah-grant/cover.jpg\`.
   You don't need all of them at once: any you add are used, the rest stay as they are.
6. **Run** \`node tools/add-photos.js incoming\` (from \`studio-v1\`). It converts them, puts them on the
   pages (cover with its focus point, gallery, video thumbnails, alt text) and rebuilds the examples.
   Then look at \`cards.html\`, \`site.html?ex=<athlete>\` and the homepage; fine-tune a focus point in
   the Studio (\`studio.html?ex=<athlete>\`) if a face sits too close to an edge.

| Athlete | Sport | Cover layout | Prompts |
|---|---|---|---|
${ATHLETES.map((a) => `| [${a.name}](#${a.slug}) | ${a.sport} | ${a.layout} | ${a.shots.filter((s) => !s.done).length} |`).join('\n')}
`);
  for (const a of ATHLETES) {
    out.push(`---

## ${a.name}
<a id="${a.slug}"></a>

**${a.sport} · ${a.layout}** · folder \`incoming/${a.slug}/\`

- **Who:** ${a.sheet}.
- **Wears:** ${a.kit}.
- **Number in pictures:** ${a.num ? a.num + ' (teammates may show their own numbers; nothing else written)' : 'none (nothing written at all)'}.${a.note ? `\n- **Note:** ${a.note}` : ''}
`);
    for (const s of a.shots) {
      if (s.done) { out.push(`**\`${s.file}\`** — already on the page (${s.alt}).\n`); continue; }
      out.push(`**\`${s.file}\`** · ${s.shape} · ${s.alt}

\`\`\`text
${promptFor(a, s)}
\`\`\`
`);
    }
  }
  return out.join('\n');
}

module.exports = { ATHLETES, promptFor };

if (require.main === module) {
  const file = path.resolve(__dirname, '..', 'PHOTO-PROMPTS.md');
  fs.writeFileSync(file, markdown());
  const n = ATHLETES.flatMap((a) => a.shots.filter((s) => !s.done)).length;
  console.log(`PHOTO-PROMPTS.md: ${n} prompts for ${ATHLETES.length} athletes`);
}
