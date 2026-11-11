# Homepage examples: plan and photo shot list

The real example pages that replace the five placeholder cards in homepage-v2 **Section 02**
("Same ambition. *Your own* look.").

## What Section 02 is (measured 2026-10-10)

- A 3D "momentum" carousel of portrait cards. Each card is **340×460** on desktop (290×400 on
  tablets, 250×350 on phones), with rounded 18px corners, a shadow and a small tag chip
  ("Cinematic · Football"). Drag, swipe or wait (it drifts on its own).
- Clicking a card opens it to **473×640** (about 324×439 on phones) next to the style name,
  athlete name, a one-line description, four bullets and **"Start with this style"**.
- It's a teaser (Willy): "showcase some of the cool designs already made … what they could do and
  could look like." So the set should show **range**: every look, every cover layout, many
  colors, fonts and photo treatments, many sports.

## What a card is

A card is not a screenshot. Real pages don't crop to 3:4 (Portrait loses the name, Prospect gets
too small to read; see the comparison in the session-4 notes). `src/card.js` builds each card
from the athlete's real page: photo and focus point, name, number, key numbers, and the look's
colors and fonts. It follows the athlete's own choices the same way their page does: **cover layout
(all 15), mirror, colors and accent, font pairing, photo treatment**. Two athletes in the same
look get different cards. Review them at the real sizes in **`cards.html`**. (Shareable cards for
clients are parked for after v1.)

"Start with this style" links to `studio.html?start=1&from=<example slug>`: after the setup
questions, the new page starts in **that example's whole design** (look, colors, fonts, cover and
layouts, photo treatment, section order), never its words or photos. The homepage's main "Create
your Athlesite" buttons are **not wired yet** (Willy, 2026-10-11); when they are, they'd go to
`studio.html?start=1` (starts in Cinematic) or a sign-up step first (to discuss).

**On the homepage (wired 2026-10-11, session 5):** Section 02 loads these examples straight from
`examples/examples.js` and draws each card with `card.js`, so a rebuilt example shows up there by
itself. The "<Look> · <Sport>" label sits under each card. Opening a card shows the athlete's live
page (`site.html?ex=<slug>&embed=1`) in the homepage phone, with "Start with this style" and "See the
full page". Test: `tools/homepage-s2.js`.

## The lineup: one per sport, each on a different cover layout

15 sports, 15 cover layouts, so the carousel shows all of them. Names are fictional. Levels mix
high school (HS) and college. Colors and fonts are varied on purpose.

| # | Sport | Athlete | Level | Position, number | Look · cover | Colors · fonts | Photos we have |
|---|---|---|---|---|---|---|---|
| 1 | Football | Jordan Bell | HS, class of 2027 | Wide receiver, #14 | Cinematic · Left-aligned | Night game · Blockbuster | cover, back shot, team line |
| 2 | Soccer | Maya Rodriguez | HS, 2026 | Midfielder, #8 | Editorial · Split | Pitch green · Feature | cover |
| 3 | Baseball | Tyler Brooks | HS, 2027 | Shortstop, #6 | Prospect · Profile card | Chalk · Standard | cover |
| 4 | Basketball | Aaliyah Grant | College, junior | Point guard, #11 | Highlight · Big number | Electric · Scoreboard | none |
| 5 | Softball | Kenzie Morales | HS, 2027 | Pitcher, #21 | Highlight · Color block | Crimson · Stadium | none |
| 6 | Lacrosse | Owen Castellanos | HS, 2026 | Attack, #22 | Highlight · Center poster | Volt · Arena | none |
| 7 | Hockey | Liam Kowalski | College, sophomore | Center, #19 | Cinematic · Center stage | Gold standard · Velocity | none |
| 8 | Track & field | Imani Wallace | HS, 2026 | Sprints (200m / 400m) | Cinematic · Split screen | Black cherry · Premiere | none |
| 9 | Volleyball | Sofia Lindqvist | College, senior | Outside hitter, #7 | Editorial · Magazine cover | Porcelain · Classic | none |
| 10 | Rowing | Hannah Mercer | College, junior | Port (8+) | Editorial · Headline | Clay court · Warm | none |
| 11 | Wrestling | Mateo Ruiz | HS, 2027 | 152 lb | Portrait · Side by side | Charcoal · Fashion | none |
| 12 | Swimming | Grace Nakamura | College, sophomore | Freestyle / IM | Portrait · Photo first (color photo) | Gallery white · Gallery | none |
| 13 | Golf | Ethan Whitaker | HS, 2028 | (none) | Portrait · Centered | Bone · Heritage | none |
| 14 | Tennis | Priya Raman | HS, 2027 | Singles | Prospect · Banner | Field · Technical | none |
| 15 | Pickleball | Cole Bennett | College (club) | Doubles | Prospect · Compact | Navy · Grotesk | none |

Nothing here is fixed. Swap names, sports or looks freely. The only rule worth keeping is
"every card different".

## Photos: what each athlete needs

About **6 photos per athlete**, all of the **same person** (same face, hair, build and uniform):

1. **Cover**: framed for that athlete's cover layout (see the table below). At least 2400px on
   the long side.
2. **Gallery** (3): one action shot, one team/sideline/bench moment, one candid or training shot.
   Mix landscape and portrait.
3. **Video thumbnails** (2): 16:9 action frames, as if a highlight video was paused.

Jordan already has a cover, a back shot and a team line. Maya and Tyler only have a cover. Everyone
else needs all six.

### Cover framing by layout

| Cover layout | Shape | Where the athlete goes |
|---|---|---|
| Cinematic · Left-aligned (Jordan) | Landscape 3:2 | Right of center (face about 60–70% across), head in the top third, dark background. The name sits on the left. |
| Cinematic · Center stage (Liam) | Landscape 3:2 | Centered, face in the upper third, darker space low in the frame for the name. |
| Cinematic · Split screen (Imani) | Landscape or 4:5 | Centered. The photo fills one half of the page and the top half of the card. |
| Editorial · Split (Maya) | Portrait 4:5 | Centered, natural light, a little room above the head. |
| Editorial · Magazine cover (Sofia) | Landscape 3:2 | On the right, with calm space on the left and bottom for the headline, like a magazine cover. |
| Editorial · Headline (Hannah) | Wide 16:9 | Centered, face in the upper half. Shown as a wide strip under the headline. |
| Highlight · Big number (Aaliyah) | Landscape 3:2 | One side of the frame, leaving the other side for a giant jersey number. High-contrast action. |
| Highlight · Color block (Kenzie) | Landscape 3:2 | Right half (the left is a solid color panel on desktop; on the card the photo is the top half). |
| Highlight · Center poster (Owen) | Landscape 3:2 | Centered, dramatic, poster-like. |
| Portrait · Side by side (Mateo) | Portrait 4:5 | Centered, simple background. Shown black and white. |
| Portrait · Photo first (Grace) | Portrait 4:5 | Centered, simple background. Shown in color. |
| Portrait · Centered (Ethan) | Portrait 4:5 or square | Centered, simple background. Black and white. |
| Prospect · Profile card (Tyler) | Portrait 4:5 | Head and shoulders or three-quarter body, clean background. |
| Prospect · Banner (Priya) | Wide 3:1 | On the right, face in the middle band (the page shows a wide strip). |
| Prospect · Compact (Cole) | Square | Headshot (it shows as a small circle). |

### Rules for every photo (licensing and trust)

- **Fictional people only.** No resemblance to real athletes or celebrities.
- **No real logos or marks:** no team, school, league (NCAA, NFL…) or brand logos (no swooshes,
  stripes, wordmarks), and no real stadium signs. Plain uniforms in each athlete's colors.
- **No text in the picture** except jersey numbers, which must match the table.
- **Real photography look,** not illustration. Check hands, faces, balls and equipment for AI
  mistakes.
- Keep the homepage FAQ true ("fictional demonstrations… images are illustrative").
- The free stock-photo sites aren't a substitute: their people are real and identifiable, usually
  without a model release, and putting a made-up name and stats on them on a page that sells
  Athlesite reads as an endorsement, which those licenses forbid.

## Status (2026-10-11)

All 15 example **pages are built** (`examples/<slug>.json`, first draft from `tools/make-examples.js`):
words, stats, milestones, results tables (track, swimming, wrestling, rowing, golf, pickleball), NIL
for Jordan, Aaliyah, Kenzie, Sofia and Cole, own sections for Jordan, Aaliyah and Hannah. Fictional
throughout; no social handles, recruiting-profile links or video URLs (they'd point at real people or
dead pages). **Photos:** Jordan, Maya and Tyler use the built-in ones; the other 12 need all of theirs.
See them at the homepage sizes in `cards.html` and as pages at `site.html?ex=<slug>`.

**Making the photos:** `PHOTO-PROMPTS.md` has a ready-to-paste AI image prompt for every photo the
pages use (80: 12 covers, 45 gallery photos, 23 video thumbnails), each athlete's description repeated
in every prompt so it stays the same person, and how to use them. It's generated from
`tools/photo-shots.js` (`node tools/photo-shots.js`); change shots there.

**When photos arrive:** save each one under its name from `PHOTO-PROMPTS.md` (`cover`, `photo-1`,
`film-1` …; .jpg, .png or .webp) in a folder per athlete, `incoming/<slug>/` (e.g.
`incoming/aaliyah-grant/cover.jpg`), then run `node tools/add-photos.js incoming`. It converts them
with Chrome (WebP .86; cover ≤2000px, the rest ≤1600px) to `assets/img/examples/<slug>-<name>.webp`,
puts them on the page (the cover with the focus point its layout needs, gallery photos with alt text,
video thumbnails), rebuilds `examples/examples.js`, and warns about small or unreadable files. `--dry`
shows what it would do. `incoming/` isn't committed (`.gitignore`). Then check `cards.html`,
`site.html?ex=<slug>` and the homepage. (Or in the Studio: `studio.html?ex=<slug>`, add photos,
File › Save, `add-example.js`.)

## How an example gets made

1. Photos go in a folder per athlete (any names; e.g. `incoming/aaliyah-grant/`).
2. In the Studio: **File › Start a new page**, go through the first run, fill every section
   (story, stats, film, gallery, milestones, NIL if it fits, details), set the look, cover,
   colors and fonts from the table, and check desktop and phone.
3. **File › Save to a file** → `aaliyah-grant.athlesite.json`.
4. `node tools/add-example.js aaliyah-grant.athlesite.json`: the photos become files in
   `assets/img/examples/`, the page becomes `examples/aaliyah-grant.json`, and
   `examples/examples.js` is rebuilt.
5. Check it in `cards.html` (homepage sizes) and `site.html?ex=aaliyah-grant` (the full page).
   To change it later: `studio.html?ex=aaliyah-grant` (or the Studio's test-athlete menu,
   "Homepage examples"), edit, save, run step 4 again.
6. Nothing else: homepage Section 02 reads `examples/examples.js`, so the new photos show there too.

Claude can draft every athlete's words and numbers (bio, stats, milestones, NIL) so they're
believable for the level and sport. Willy edits.
