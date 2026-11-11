# Studio test tools

**Everything at once:** `node tools/run-all.js` (all Node checks and every drive.js test below, one after
the other, each on its own port, one line per test; ~35 min). `--quick` skips the two long sweeps (spacing,
a11y over every palette); `--only=studio-start,homepage-s2` runs some. Logs in `<tmp>/athlesite-run-all/`.
Timing checks (opening-landing, number-landing, perf-*) stay manual: they need a quiet machine.

Node 24 (built-in `fetch` and `WebSocket`) plus the installed Chrome. No packages to install.
Run from anywhere; pass absolute paths. `CHROME` below is
`C:/Program Files/Google/Chrome/Application/chrome.exe` and `PROFILE` is any empty scratch folder.

| Script | Use |
|---|---|
| `serve.js <studio-v1 dir> <port>` | Tiny static server; logs 404s. Optional: pages also work as `file://` |
| `check-freedom.js <studio-v1/src>` | Renders every athlete × look × font × cover × layout × photo combination in Node; must print `problems: 0` |
| `check-mirror.js <studio-v1/src>` | Mirror only applies where it is safe |
| `check-links.js <studio-v1/src>` | Recruiting profiles + NIL contact: hostile links never render, look-alike domains never get a trusted name, NIL hidden when off. Must print `problems: 0` |
| `cdp-run.js CHROME PROFILE <url> <script.js> [shotPrefix]` | Opens a page in headless Chrome, runs a script in it, prints the result, optional screenshot |
| `cdp-full.js CHROME PROFILE <url> <out.png> [waitMs] [width]` | Full-page screenshot (env `H` sets window height) |
| `cdp-sheet.js CHROME PROFILE <out.png> <cols> <w> <h> <scale> "<url>\|<label>" ...` | Contact sheet of many pages side by side |
| `sports-rapid.js` | Script for `cdp-run.js` on `sports.html`: rapid clicks, every one must land |

Example: `node tools/cdp-run.js CHROME PROFILE file:///C:/Users/conno/projects/Athlesite/athlesite-design/studio-v1/sports.html tools/sports-rapid.js`

## Studio editor tests

| Script | Use |
|---|---|
| `drive.js <steps.js> <url> <outDir> [w] [h] [port]` | Headless Chrome with real mouse/keyboard input; prints console errors and exceptions. Steps get `ev, click, clickSel, key, drag, shot, sleep, log` |
| `studio-content.js` | Step 2 content editors used like a person: typing (one undo step per burst), adding a video (link note), ticking a stat idea and filling it, quick-adding a profile link ("Shows as On3"), NIL off/on, clicking the name on the page focuses First name. Must print `PROBLEMS none` |
| `studio-photos.js` | Step 2 photos: env `PHOTOS` = folder made by `make-test-photos.js` (run it on `about:blank` with `OUT_DIR`). Cover upload, focus point by tap, zoom, small-photo warning, three gallery photos at once, a video poster, reload keeps them all. Must print `PROBLEMS none` |
| `studio-rapid.js` | Steps for `drive.js` on `studio.html`: rapid clicks on looks, colors, fonts, photo, navigation spam, hide/show, keyboard + drag reorder, Remix spam, device spam, visitor mode, opening, undo all, reload. Must print `PROBLEMS none` and no console errors |
| `studio-start.js` | Step 3, end to end (38 checks): a new athlete's first run (level + class, name, sport, position + number, photo; starts in Cinematic with the tip), Save to a file (caught and written to env `OUT`), Start a new page → Back to my page, Open the file over another page (photo comes back, one undo step), broken and non-page files refused, `?start=1&from=devon` copies that page's whole design and none of its words or photos; the tip names it and opens Design. Env `PHOTOS` (as above), `OUT`. Run at 1440×900 and 390×844. Must print `PROBLEMS none` |
| `studio-picks.js` | Clicking things on the page opens their exact row: a cover stat, a stat, a milestone, a gallery photo, a video in the Reel (Jordan), a result row (Ava). On phones the sheet rises to half and the tapped thing stays above it. Run at 1440×900 and 390×844. Must print `PROBLEMS none` |
| `studio-focus.js` | Focus points for gallery photos and video posters on the Jordan Bell example: pick a photo, tap, drag, arrow keys; the page keeps that spot (object-position), the list doesn't rebuild under the drag, one undo step; then the poster in the Reel. 9 checks, run at 1440×900 and 390×844. Must print `PROBLEMS none` |
| `studio-keys.js` | Phones (390×844): the on-screen keyboard never covers the field being typed in. Fakes a keyboard by shrinking `visualViewport.height`: the half sheet rises to full, the field sits above the keyboard, and the sheet goes back to half when the keyboard goes. Must print `PROBLEMS none`; still worth a check on a real iPhone and Android |
| `perf-page.js` | Steps for `drive.js` on `site.html`: what reaches the screen while wheeling down an athlete page, per look (frames shown vs dropped, `RAST=1` raster + offscreen passes, `WHERE=1` dropped frames by section, `LONG=1` long tasks, `CSS='…'` an experiment). Run at `DPR=1.5 … 1707 960`. A busy laptop swings the numbers: compare old and new code back to back |
| `new-athlete.js` | The new-athlete run-through: a fresh high school swimmer builds a whole page through the UI the way a person would (setup with a photo; on phones the sheet pulled up; cover, story, a results table with a best time, stats, a video, two gallery photos, milestones, NIL through a parent, details and Instagram; a new look; the visitor view; Save to a file, reload, Open the file). Screenshot per step (`na-<w>-NN-*.png`) for a person to look through. Env `PHOTOS`, `OUT`. Run at 390×844 and 1440×900. Must print `PROBLEMS none` |
| `studio-results.js` | Step 4, the results table (15 checks): Ava's table with her PRs, flag another best mark, add a result by typing, rename a column and the title, hide/show, undo; Jordan (football) gets no prompt but a general table if he adds a result. Run at 1440×900 and 390×844 (rows fold into two lines). Must print `PROBLEMS none` |

## Homepage examples

| Script | Use |
|---|---|
| `homepage-s2.js` | Steps for `drive.js` on `../homepage-v2/index.html`: Section 02 with the real examples. 15 cards (planned order, names fit, photos load from studio-v1, neighbours differ in look), drift frame times, opening a card (the live page in the phone, info, both links, the rest of the page inert, focus on Close), → and ← ← (wraps), four quick →, Escape (focus back on the middle card), a side card, keyboard only, reduced motion, and "Start with this style" landing in the Studio setup. Run at 1440×900 and 390×844. Must print `PROBLEMS none` |
| `homepage-s3.js` | Steps for `drive.js` on `../homepage-v2/index.html`: Section 03 shows the real Studio and page. Each step's frames in order and loaded, one frame at a time, taps inside the screen, "Link copied" at the start of Share, the page scrolling in Share, nothing loaded before the section is near, phone + words fit on a phone, reduced motion. Run at 1440×900 and 390×844. Must print `PROBLEMS none` |
| `homepage-cta.js` | Steps for `drive.js` on `../homepage-v2/index.html`: every "Create your Athlesite" button goes to the Studio setup; "Claim it" with a too-short name shows a note; claiming a name opens the setup and the finished page keeps it as its link name (`data.slug`, saved); a hand-made bad name is cleaned. Run at 1440×900 and 390×844. Must print `PROBLEMS none` |
| `how-shots.js` | Steps for `drive.js` on `studio.html` at **390×844 with `DPR=1.5`**: the screenshots behind homepage Section 03, taken from the real Studio and page (Jordan Bell through the setup, his example page in the editor switching looks, hiding a section, the publish switch, then his page opening). Writes `../homepage-v2/assets/img/how/*.webp` + `how.js` (frames and tap spots). **Re-run whenever the Studio or the athlete page changes.** `DPR=1.5 node tools/drive.js tools/how-shots.js file:///…/studio-v1/studio.html <scratch> 390 844` |
| `perf-homepage.js` | Steps for `drive.js` on the homepage: what reaches the screen while scrolling into Section 02, the drift, opening a card, its live page, the next one, closing, Section 03 — frames shown vs dropped (Chrome's frame reporter), tiles re-rastered (`RAST=1`), offscreen passes per frame, long main-thread tasks (`LONG=1`). Run like Willy's laptop: `DPR=1.5 … 1707 960`, or `HEADED=1 … 1707 1000` in a real window (most faithful). `ONLY=drift`, `SKIP=s3`, `PRE='js'` (an experiment) |
| `photo-shots.js` | The photo shot list for the 15 examples (a character sheet per athlete, every cover / gallery / video-thumbnail shot with its alt text and the cover's focus point). `node tools/photo-shots.js` writes `PHOTO-PROMPTS.md` |
| `add-photos.js <folder> [--dry]` | Node + headless Chrome. `<folder>/<slug>/cover\|photo-N\|film-N.(jpg\|png\|webp)` → WebP (Chrome's encoder, .86; cover ≤2000px, others ≤1600px) in `assets/img/examples/<slug>-<name>.webp`, wired into `examples/<slug>.json` (cover + focus for its layout, gallery photo N or the next one, video N's thumbnail, alt text from `photo-shots.js`), then `examples/examples.js` rebuilt. Notes unknown athletes, wrong names, duplicates, unreadable files, missing videos, small photos |
| `add-example.js <page.athlesite.json> [slug]` | Node. A page file saved from the Studio → `examples/<slug>.json` + its photos as files in `assets/img/examples/` + rebuilt `examples/examples.js` (what `site.html?ex=`, `studio.html?ex=` and `cards.html` load). `--rebuild` only rebuilds. Same file again replaces the example. Plan and shot list: `EXAMPLES.md` |

Example: `node tools/drive.js tools/studio-rapid.js file:///C:/Users/conno/projects/Athlesite/athlesite-design/studio-v1/studio.html <scratch dir>`
`drive.js` hides scrollbars unless `SCROLLBARS=1` (use it for anything about layout widths on Windows).
`drive.js` draws at 1× unless `DPR=1.5` (**Willy's laptop: 2560×1600 at 150% = 1707×1067 CSS px, 120Hz, Intel Iris Xe**;
graphics-heavy effects cost about 3× what they cost at 1×). `HEADED=1` opens a real window on the screen instead of headless
(real display rate and pixel density): the most faithful way to measure smoothness.
**Two `drive.js` runs at once need different ports** (the 6th argument, default 9341): on the same
port the second run's steps go into the first run's page and both fail in confusing ways.

## Athlete-site checks (steps for `drive.js` on `site.html`)

All take the page URL `file:///C:/Users/conno/projects/Athlesite/athlesite-design/studio-v1/site.html`.

| Script | Use |
|---|---|
| `opening-landing.js` | Tracks the flying name and the real headline every frame through the opening. Env `LOOKS=cinematic,editorial,…`, `WHO=jordan`. Run with `SCROLLBARS=1`. "real moves after hand-off 0" and identical last-fly/real boxes = no jump |
| `scroll-moments.js` | Each look's signature scroll moment mid-motion and settled (screenshots `m-*.png`), and checks the Highlight reels and Prospect count-up land on the exact values |
| `film-fit.js` | Section heights vs screen height per look. Env `SECS=film,stats,…`, `WHO`, `FILM` (default `list`; the reel is one full screen per video by design). Film must be ≤ screen height − 72px |
| `nav-strips.js` | Nav strips per look at the top and scrolled into a section (marker under the active link). Env `OUT` dir, `W`, `SHEET=1` also opens/closes the phone Menu sheet |
| `name-leading.js` | Gap in em between line 1's tails and line 2's capitals for two-line serif names, per font pairing (must be positive) |

| `number-landing.js` | Cinematic's opening number flies onto the cover's giant number (or the "No. 14" in the details line when that cover has none). Env `COVERS`, `WHO`, `EXTRA`. Last frame must be within ~0.5px of the target, "moves after 0" |
| `giant-clearance.js` | Phones: every giant decorative number/initials clears the nav buttons (env `MIN`, default 32px; we hold 40) and never sits behind the cover's words unless the layout layers it on purpose (`--fit:off`). Run at 390×844 and 360×740. Must print `problems … 0` |
| `nav-overlap.js` | While the nav is still see-through, nothing on the cover slides under it (scrolls every look × cover). Must print `… see-through nav: 0` |

`opening-landing.js` takes `EXTRA="&film=list"` (any extra query). Run the opening checks one at a time:
four headless Chromes at once starve each other of frames and give false "late" landings.

## Smoothness (60fps)

| Script | Use |
|---|---|
| `perf-site.js` | Frame times through each look's opening and a real wheel scroll down the page. Env `LOOKS`, `CPU=4` (CPU slowed 4×, roughly an average phone). A frame over 20ms missed a 60fps beat. Run each look 2–3×: the first run in a fresh profile includes one-time GPU shader compiles a real visitor's browser already has |
| `perf-studio.js` | Frame times in the editor per action (looks, colors, fonts, screens, drag, Remix, device, scrolling the preview, opening), with the long frames and their scripts. Env `CPU` |
| `perf-trace.js` | Records a Chrome trace during the opening (`ACT=opening`) or a scroll and lists what each long task was doing (layout, script, GPU…). Env `Q` (site.html query), `CPU`, `MIN` |

`drive.js` env `GPU=1` is no longer needed: headless Chrome already draws with the real graphics card here.

## Accessibility

| Script | Use |
|---|---|
| `a11y-audit.js` | Steps for `drive.js`. `MODE=site` (start URL = `site.html`): every look × palette for Jordan and Ava plus 8 custom accents on two palettes per look; `MODE=page`: just the start URL (`studio.html?ex=jordan-bell`, `studio.html?start=1`, `../homepage-v2/index.html`). Per page: text contrast measured against what is actually painted under the text (WCAG AA 4.5:1, 3:1 for large text; text on photos/gradients counted, not measured), a name on every control, alt on every image, one h1, no skipped heading levels, `<main>`, lang, duplicate ids. `TABS=n` also walks n Tab presses (name, visible focus ring, on screen). Env `ONLY=look,look`. Must print `PROBLEMS none` (site: desktop and 390×844; the homepage's own sections are known, see HANDOFF §0.3 Q2) |

## Typography and spacing check

| Script | Use |
|---|---|
| `spacing.html` + `spacing-run.js` | Renders every athlete × look × font × cover (stats layouts and Mirror rotated in) at desktop and phone, and measures the real ink of every line of text: lines or words touching/overlapping, outlined letters touching (pixel test), text cut off by a container, text off screen, pages that scroll sideways. Decorative layers (giant numbers, the ticker band) are listed apart. Real text should report ~0 |

Run: `OUT=<file.json> node tools/drive.js tools/spacing-run.js file:///C:/Users/conno/projects/Athlesite/athlesite-design/studio-v1/tools/spacing.html <scratch dir> 1500 1000`
(env `ONLY=highlight,editorial` limits looks; `DEVICES=desktop,phone,small` adds a 360×740 phone; ~9 minutes for all three). Last run 2026-10-09: 1 note on
real text (a 14px gap under a 260px Spotlight number, fine); decorative = Highlight's deliberate
layered numbers (Center poster, Color block, ghosted when sharing the name's side) and the ticker band.
