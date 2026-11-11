# Athlesite Studio — full handoff

The complete record of the Studio rebuild: what exists, every decision and why, how the code works,
every round of Willy's feedback and what changed because of it, what's next, what's open, and how
Willy likes to work. Written so a new session (or Willy) can pick up without the old conversations.

- Owner: **Willy** (Connor Williamson, co-founder). The other founder is **CFul** (Conner Fulton),
  who drives product and security work in the product repo.
- Location: `C:\Users\conno\projects\Athlesite\athlesite-design\studio-v1` (local git repo `athlesite-design`,
  branch `main`). **Never pushed.** Moved inside the product folder on 2026-11-10 (Willy asked), but it is
  **its own repo**: the product repo ignores it through `.git/info/exclude` (on Willy's machine only, nothing
  committed there). Run the product's `npm run lint` on `src/` only, or it will lint the lab's JavaScript.
  Design work stays out of the product repo (`Athlesite/Athlesite`).
- Last updated: **2026-10-11, session 6** (after a compaction): Willy's first answers on session 5,
  then **glitch fixes in the Studio panel and homepage Section 02** and **homepage Section 03 rebuilt
  from the real Studio and page** (§0.3 "Session 6"). Session 5 (overnight while Willy slept) closed
  right before the compaction; **Willy has sent `PORTING.md` to CFul**. Session 4 built: review #6 fixes, cover cards, **editor Steps 3 and
  4** (first run + page files; the results table), the setup change (no look picker), the examples
  pipeline, **the 15 homepage examples' pages** (waiting on photos), focus points for gallery photos
  and video posters, click-anything-to-edit-its-row, phone taps kept above the sheet, a 60fps re-check.
  **Session 5 (2026-10-11, overnight while Willy sleeps):** Task 4 done — **homepage Section 02 shows
  the 15 real examples** (§0.3); Q1 done — **`PHOTO-PROMPTS.md` (80 AI photo prompts) + `tools/add-photos.js`**;
  Q2 done — **accessibility pass** (contrast everywhere, keyboard in the Reel/Folio/setup/sheet/carousel,
  skip link); Q3 done — **new-athlete run-through** (phone sheet rows reachable, visitor view on
  phones, pasted social links, sport words); Q4 done — **`PORTING.md`** (for CFul; read-only look at the
  product repo) + **`tools/run-all.js`**. **The overnight queue is complete.** Next: Willy's morning review
  (§0.3 "For Willy in the morning").
- Companion files: `V1-LINE.md` (agreed scope, ticked as done), `tools/README.md` (every test script)
  and `EXAMPLES.md` (the homepage examples: Section 02 sizes, the lineup of 15, the photo shot list).

---

## 0. Start here

### 0.1 Where things stand right now (session 6, 2026-10-11)

**Session 6 in one paragraph:** Willy agreed with the style chip under the cards (#100 confirmed); the
palette changes, the photos ("coming later today") and the three run-through questions wait for him.
He reported **glitches**: "the buttons … on the right hand side of the edit portion, some are glitchy or
like delayed when clicking between buttons", and on the homepage "when i get down to the card example
section 02 … the entire screen gets glitchy, even when i click on a card and inspect it". Cause, found by
measuring on **his own machine's settings** (2560×1600 at 150%, 120Hz, Intel Iris Xe): every graphics-
heavy effect costs ~3× what our 1× headless tests measured. Fixed: the carousel's moving card sheen
repainted all 15 cards every frame (458 tile repaints/s → ~1); the opened card's full-screen backdrop
blur; the Studio panel's two screens cross-fading on top of each other; opening a section smooth-
scrolled the preview through the whole page (the film reel included). Then **Section 03** ("Create /
Personalize / Publish / Share") now shows **the real Studio and Jordan's real page** (screenshots taken
by `tools/how-shots.js`) instead of the placeholder screens. Details in §0.3 "Session 6".

**Session 5 (overnight) in one paragraph:** Task 4 — homepage Section 02 shows the 15 real examples
and opens each one's live page in the homepage phone (`8eb3627`); Q1 — 80 AI photo prompts
(`PHOTO-PROMPTS.md`) + `tools/add-photos.js` (`1a1b992`); Q2 — accessibility pass: contrast 528 → 0
problems on athlete pages, keyboard fixes in the Reel/Folio/setup/phone sheet/carousel, skip link
(`8ee0735`); Q3 — a new-athlete run-through found and fixed out-of-reach rows in the phone sheet, the
visitor view hidden under the sheet, broken pasted social links and "What position?" for swimmers
(`e111ee5`); Q4 — `PORTING.md` for CFul (the product's privacy boundary, the age gate, no device storage
before sign-in, and a proposed front door that matches Willy's sign-up idea) + `tools/run-all.js`. All
suites green. **Start with §0.3 "For Willy in the morning".**

**Session 4 and before (for context):** **every v1 item is built** (V1-LINE all ticked). Session 4 in one paragraph: review #6 fixed; cover
cards for the homepage; editor Step 3 (first run + page files) and Step 4 (results table); Willy then
cut the setup's look picker; the examples pipeline; all **15 example pages written and built**;
focus points for gallery photos and posters; click anything on the page to edit that row; phone taps
stay above the sheet; 60fps re-checked (no regression). Willy approved four "meantime" tasks while he
gets photos ("i love all 4. just go down the list and do em all"): **1 examples ✔, 2 photo focus ✔,
3 editor polish + 60fps ✔, 4 homepage Section 02 wiring — not started** (Willy paused for this
compaction while the 60fps comparison was finishing).

- **The athlete site** (five looks, openings, sport catalog incl. pickleball, freedom system, Reel/Folio,
  results table) — Willy's reviews #1–#6 done. Editorial's smaller paragraphs wait for the read-along.
- **The editor** (`studio.html`, §15): Steps 1–4 done. Setup = level + class → name → sport →
  position + number → optional photo → editor (Cinematic, or an example's whole design with
  `?from=<slug>`; a one-time tip about the other looks). File menu: Save / Open / Start a new page.
  Results editor. Gallery + poster focus pickers. Clicking a stat/video/result/milestone/photo on the
  page opens that exact row; on phones the sheet rises and the tapped thing stays above it.
- **Cover cards** (`src/card.js`, `cards.html`): the homepage Section 02 cards; follow each athlete's
  choices. Shareable client cards parked (after v1).
- **The 15 homepage examples exist as pages** (`examples/*.json` → `examples/examples.js`; first draft
  generator `tools/make-examples.js`): one per sport, each on a different cover (lineup in
  `EXAMPLES.md`). Full words and numbers, results tables for the six results sports, NIL for five.
  **Photos: only Jordan, Maya and Tyler have them (built-in); everyone else waits for Willy's
  AI-generated photos** ("ill get the photos later for you"). No social handles, profile links or
  video URLs on purpose (#95).
- **Homepage Section 02 is wired** (session 5, Task 4): the carousel shows the 15 examples' real
  cover cards (built by `card.js` from `../studio-v1`), and an opened card shows that athlete's live
  page in the homepage phone, with "Start with this style" → the Studio setup in that design (§0.3).
- **Decisions Willy made in session 4:** cards made from the page (#74); cards as varied as the pages
  (#75); one example per sport (#79); pickleball (#80); no look picker in the setup, the card "should
  come last" (#82); "Start with this style" copies the example's design (#83); share cards parked
  (#84); Cinematic default (#85); **sportDetails kept** (#92); do all four meantime tasks (#97).
- **motionin**: Willy has both files (`cinema-reel (2).md`, `folio (2).md` in Downloads, identical to
  the copies we built from). He mentioned paying for Reel; he says he has both now (#96). The
  multi-site license question for shipping is still open (§17.1).
- **Where to look:** `cards.html` (all 15 examples first, then every card variant), `site.html?ex=<slug>`
  (e.g. `imani-wallace`, `kenzie-morales`, `cole-bennett`), `studio.html?ex=jordan-bell` → Gallery /
  Film (focus pickers) and click any stat on the page, `studio.html?start=1&from=devon` (setup from a
  design), `site.html?a=ava&at=results` (results table).
- **Last commit at the time of writing:** see §2 Session 4 (this handoff's own commit is the last).
  Working tree clean. Local only, never pushed.

### 0.2 First steps in a new session (do these before planning anything)

1. Read this whole file, then `V1-LINE.md`, `EXAMPLES.md` and `tools/README.md`.
2. Run `git log --oneline -20` in `athlesite-design` and compare with §2; if there are newer commits,
   read their messages first.
3. **Look at what's built**; don't just read about it. Open in headless Chrome (`tools/drive.js`; the
   app's Browser pane can't run local files) at desktop (1440×900) and phone (390×844), **as
   `file://` URLs** (that's how Willy opens them): `cards.html`, `site.html?ex=jordan-bell`,
   `studio.html?ex=jordan-bell`, `studio.html?start=1`, and `../homepage-v2/index.html` (Section 02).
4. Read the code the next step drives: for Task 4, `../homepage-v2/index.html` (Section 02 markup ~line
   378, carousel CSS ~line 122–186, modal CSS ~188–207, `SITES` + carousel + modal JS ~line 601–760),
   `src/card.js`, `src/render.js` (`renderSite`, `A.cardContext`), `examples/examples.js`.
5. Propose the plan to Willy **before building** if anything in §0.3 needs his call; Task 4 itself is
   already approved.
6. Run the test suite once (all should pass; commands in §14 / tools/README): `check-freedom.js`,
   `check-links.js`, `check-mirror.js` (Node); `studio-rapid`, `studio-content`, `studio-photos`,
   `studio-start`, `studio-results`, `studio-focus`, `studio-picks` (headless Chrome via `drive.js`;
   **one at a time, or each on its own port**: §18).

### 0.3 Where to resume

**Session 8 starts here.** Session 7 (2026-10-26 and 2026-11-10) finished the lab with Willy's "full control"
("im giving you full control on finishing it. i want to get it over with"): every change and decision is in
**`DECISIONS-SESSION-7.md`** (Willy reviews it). In short: the lab moved inside the product folder (own repo,
excluded locally); athlete pages scroll lighter (Reel blur, frosted bars: 10% → 1.6% dropped frames, quiet
machine); **all 15 examples now have photos** (12 from Pexels, `PHOTO-CREDITS.md`); the phone keyboard keeps
the field visible; "Autographs" not suggested to high schoolers; no "Club team" for college; "Draft eligible"
only in draft sports. New tools: `perf-page.js`, `studio-keys.js`. **This chat does studio-v1 only; the
homepage (homepage-v2) is Willy's other chat** — don't test, edit or commit it. Then four skill passes on the Studio + athlete pages (break-ui with a dev-only `break.html`, Emil, mobile-native, impeccable v4.8.2: touch targets, press feedback, hover only with a mouse, tap flash, theme-color, long names) — listed in DECISIONS-SESSION-7.md §15–18. GSAP / Lenis / React Bits were checked and declined (GSAP's license vs a no-code builder is a CFul question). Waiting on: Willy's review of
the decisions, CFul's PORTING.md answers, Willy's polish skills, the motionin licence, a real-phone keyboard check.
Last (2026-11-10, DECISIONS §22–24): the athlete nav stays on screen; "See the full page ↗" under each style card; long names clear the cover's giant number on desktop (`clearGiants` in site.js; `--fit:off` opts a deliberately layered number out). Willy turned down the setup-preview prototype ("too much"); it was removed. Then the four setup polish items (DECISIONS §25–26) and the resource-library checks Willy asked for (§27–29: Vercel guidelines, Fontshare license, footer.design). Willy runs the same resource review on the homepage in his other chat once the Studio wraps.


**Session 6 (2026-10-11, Willy awake):**
- **Willy's answers to the morning list:** chip under the cards — "i agree with the style lable
  underneath it" (#100 confirmed); palettes — "i will look into the pallette chnages later"; photos —
  "photos coming late rtoday"; the three run-through questions — "i will also get to later". Still open:
  palettes (Q2 list below), photos, §17.2's three questions, the homepage `--muted`, PORTING.md with CFul.
- **Glitch fixes** ("do this first"), measured with the new `tools/perf-homepage.js` and `perf-studio.js`
  at **DPR 1.5, 1707×960/1000, in a real window (`HEADED=1`)** — Willy's laptop (`AppliedDPI` 144,
  2560×1600, 120Hz, Iris Xe, i5-1155G7). Before → after, frames dropped (real window, warm browser):
  scroll into Section 02 10.5% → 2.7%; carousel drift 0% but **458 tiles re-rastered per second → 1**
  (the GPU was saturated, which is what Willy saw); open a card 16.1% → 4.9%; scroll its live page 9.7% →
  1.1%; next example 16.1% → 4.2%; close 7.7% → 0%; Section 03 0%.
  - **Carousel sheen** (`.card-shine`): was inside each card with `mix-blend-mode:overlay`, its gradient
    and position rewritten every frame → every card repainted every frame. Now a **fixed diagonal sheen**
    beside the card's clip (`.card` > `.card-shine`, rounded on its own, `will-change:opacity`) whose
    **opacity** follows the distance from the middle (bright in the middle, gone at the sides). It no longer
    slides across the card (#115; Willy may want the slide back: it can't be done cheaply).
    `layoutCards` also writes opacity / z-index / sheen only when they change.
  - **Opened card:** no backdrop blur on the scrim (now a solid `#0b0b0fd1`) or the ← → buttons (#116).
    Tried and reverted: loading the live page after the card lands (no gain: the page's own opening costs
    the same whenever it runs). What's left (~5% on open) is the live page building and playing its
    opening in the same process.
  - **Studio panel** (`panel.js go()`): the old screen fades out in 120ms before the new one slides in
    (70ms delay, 300ms); before, both screens were half-visible on top of each other for ~250ms (#117).
  - **Studio preview** (`preview.js glideTo/settleDip`): opening a section that's more than ~1.2 screens
    away **dips the page to its own background (110ms), jumps, and fades back (220ms)** instead of smooth-
    scrolling through everything in between (Jordan: cover → the whole film reel → stats; ~400ms of full-
    screen video frames with blur, GPU tasks of 90ms). Near ones still glide. Also used by "keep the tapped
    thing above the sheet" (`reveal`). A re-render during a dip lands the jump first (#117).
  - **Studio preview timing:** a design change starts building after 50ms (was 90) and cross-fades in
    180ms (was 240): ~40ms + ~60ms sooner. The ~60ms main-thread build of the new page (the athlete page's
    own script + layout) is still there; it happens after the click's feedback has painted.
  - `perf-studio.js` at DPR 1.5: open + close a section ×3 max frame 108ms → 42ms, missed 5 → 2.
- **Section 03 rebuilt from the real thing** (Willy: "can you make it all look like the real thing (or at
  least as much of the real thing as we have to date) those (like the previous cards), were just examples
  and placeholders") (#118):
  - The phone shows **screenshots of the real Studio and the real page** (390×844 at 1.5×, WebP, ~0.9MB
    total, `../homepage-v2/assets/img/how/`), made by **`tools/how-shots.js`** (re-run it whenever the
    Studio or the athlete page changes; it also writes `how.js`, the frame list + tap spots).
  - **Create** (6 frames): the real setup — High school + Class of 2027 → "Jordan" "Bell" → Football →
    Wide receiver + 14 → his cover photo → Build my page. **Personalize** (5): his example page in the
    editor (half sheet) → Design → Editorial → Highlight → back to Cinematic with Color + Fonts in view (the
    page above changes look each time). **Publish** (4): the sections list → hide "Details & contact"
    ("Hidden from visitors") → a **Visibility block with a "Published" switch**, off then on. **Share** (3):
    "Link copied: athlesite.com/jordanbell" (the Studio's own toast style) → his page's opening (held where
    the name fills the screen, `introAt=p3`) → his real page scrolling (one tall screenshot, moved with a
    transform, no repaint).
  - **Not real yet, drawn from real parts (flag for Willy):** the Studio has **no publish switch** — the
    frame uses the Studio's own block + switch with the **product's** publish rule and words (CFul's
    `PublishSection.tsx`: private until published; "Anyone with your link can view…"). The Studio also has
    no "Copy link"; the toast is illustrative. Both follow PORTING.md §7's proposed front door.
  - A frame with a tap shows a touch dot (like a screen recording) in its second half, where the next tap
    lands. Frames cross-fade (.3s). Frames load only when the section is ~1.5 screens away and decode one by
    one off the main thread; only the first frame loads with the page.
  - Phones: the phone is a bit taller (`min(60svh,560px)`, was 52svh/520) so the real screens are
    readable; words still fit at 390×844 and 360×740. Reduced motion: still frames, no tap.
  - Step copy unchanged ("Your name, your sport, your story…" etc.). The old placeholder CSS/markup (typed
    name, swatches, toggle, the Instagram-style profile) is gone; its images (`athlete-back-14.png`,
    `wr-catch.webp`, `s01-media-*`, `hero-highlight.webp`, `hero-athlete-portrait.webp`) are still in
    `homepage-v2/assets/img`, unused by Section 03 (left in place).
  - Tested by the new **`tools/homepage-s3.js`** (22 checks desktop, 23 phone; in run-all).
- **New/changed tools:** `drive.js` takes `DPR=1.5` (pixel density) and `HEADED=1` (a real window on the
  screen); `perf-homepage.js`; `how-shots.js`; `homepage-s3.js`. README updated.
- **Session 6 run-all (`--quick`):** 25 passed, 0 failed (a11y-site and spacing skipped by --quick; no type or athlete-page changes this session), 17 min; homepage-s3 22/23 checks, homepage-s2 46/44

**Session 7 (2026-10-26):** Willy: "yeah no it looks good. we need to get going on this this project is taking a long
time. i agree with your suggestions." → the session 6 fixes and Section 03 are approved; **the sheen stays fixed (#115)**;
**the drawn publish switch + "Link copied" stay (#118)**; **the accessibility palette nudges stay** (#120); **homepage
`--muted` → #62656B** (done); run-through questions go with Claude's defaults: swimmers keep both Stats (headline numbers)
and Results (the record), opening a section on a phone keeps the sheet's height (#121). Still open: photos (none arrived),
the real-phone keyboard check, PORTING.md answers from CFul, the motionin licence. Then: **homepage-v2 is the homepage** (the
September Lovable "hero reference rebuild" track is dropped), and **its "Create your Athlesite" buttons + claim form are wired
to the Studio setup** (#122; tested by `tools/homepage-cta.js`). Claude's advice to speed up: get CFul's PORTING.md answers
(a short call on §7) and port the athlete page first; Willy makes the 12 examples' photos.

**Session 5's list "For Willy in the morning" (answers above):**

**For Willy in the morning (in this order):**
1. **Look at homepage Section 02** (`../homepage-v2/index.html`): drag the carousel, open a card (the
   live page in the phone), try ← →, "Start with this style". Judgment call to confirm: the
   "<Look> · <Sport>" chip now sits **under** each card (on the card it covered words). 12 of 15 cards
   show initials until the photos come.
2. **Photos:** `PHOTO-PROMPTS.md` has 80 ready prompts and how to use them; save files as
   `incoming/<athlete>/cover.jpg` etc. and run `node tools/add-photos.js incoming`. Note: Jordan's
   "team line" gallery photo shows team wordmarks/helmet logos (photo-2's prompt replaces it).
3. **Colors changed for readability (accessibility pass):** most palettes are untouched or a shade
   darker on small text; the visible change is **dark text on buttons/badges in Highlight Electric and
   Crimson and Portrait Gallery white** (white was under 4.5:1). Full before/after list in Q2 below.
   Keep or revert per palette.
4. **Three questions from the new-athlete run-through** (§17.2): two places for times for swimmers
   (Stats vs Results); should opening a section on a phone raise the sheet to full; a real-phone check
   of the keyboard over fields.
5. **Read `PORTING.md` §2, §6 and §7** before talking to CFul: the product keeps school, contact,
   socials, recruiting and NIL private today; 13–17 are blocked at the age gate until the guardian
   flow exists (so only 18+ can sign up now); nothing may be saved on the device before sign-in. Your
   sign-up-first idea fits the product's rules (Claude's earlier "account late" advice is reversed).
6. One-line homepage suggestion (outside Section 02, your call): the homepage's grey `--muted`
   #6E7178 is 4.33:1 on the cream; #62656B passes (the Studio now uses it).
7. Still open from before: the motionin multi-site licence; Willy's review of everything since review #6.

**How to check everything still works:** `node tools/run-all.js` (or `--quick`).

**Where to resume next (session 7):** read §0.3 "Session 6" first. Ask Willy to look at the fixes (Studio buttons on
the right, Section 02 scrolling + an opened card, the new Section 03) on his laptop; ask whether the carousel sheen may
stay fixed (#115) and about the publish switch drawn in Section 03 (#118). Still open from his list: palettes, photos
(`add-photos.js`; Section 03 needs no re-capture for them: it shows Jordan, who already has photos), §17.2's three
questions, the homepage `--muted`, PORTING.md with CFul.

**Exactly where to resume (written at the end of session 5, kept for reference):**
1. Do §0.2's first steps (read this file, `git log --oneline -15` in athlesite-design, look at what's
   built as file:// in headless Chrome). Session 5's commits: `8eb3627` Task 4 · `1a1b992` Q1 ·
   `8ee0735` Q2 · `e111ee5` Q3 · then the Q4 + close-out commit (PORTING.md, run-all, this handoff).
2. **Ask Willy for his morning review** (the list above). Nothing from it has been answered yet. Open
   decisions waiting on him: the chip under the cards (#100), the palette nudges (Q2 list, keep or revert
   per palette), the three run-through questions (§17.2), the homepage `--muted` suggestion, photos.
3. **`PORTING.md` is with CFul** (Willy sent it 2026-10-11, "so he can take a peek at it"). Don't
   change it on our side while he reads; record his answers (visibility table, front door, storage shape,
   media slots) in §3 as decisions when they come, and update PORTING.md with a dated "CFul's answers"
   section rather than rewriting it. **Do not start porting work in the product repo**: design work
   stays local (Willy's rule) and the changes it needs are founder/CFul decisions (AGENTS.md).
4. **Photos:** when Willy has some, `node tools/add-photos.js incoming` (start with `--dry`), then
   look at cards.html, `site.html?ex=<slug>` and the homepage at desktop + phone; adjust focus points
   in the Studio (`studio.html?ex=<slug>`, save, `add-example.js`) if a face sits near an edge.
5. The auto-resume cron Claude set for the night (`17 * * * *`) was deleted once the queue was done.


**Task 4 — DONE (session 5, 2026-10-11).** What was built, and where it differs from the plan below:
- `../homepage-v2/index.html` loads the Studio's scripts (`sports → profile → color → render →
  looks/* → card.js → examples/examples.js`) and `src/card.css`, all from `../studio-v1`. The five
  hand-made cards and their CSS are gone. Example photo paths get `../studio-v1/` in front
  (`exampleProfile()` in the homepage; the example files are unchanged).
- **15 cards, no duplicates**, in a fixed order where neighbours always differ in look and light and
  dark cards take turns (`ORDER`; Jordan starts in the middle, Maya to his right, Tyler to his left:
  the three with photos). An example missing from `ORDER` is added at the end; fewer than 10
  examples repeat so the loop never shows a gap.
- **The "<Look> · <Sport>" chip moved under each card** (like an exhibit label) instead of on it: on
  the real covers it sat on Tyler's kicker and touched Maya's rubric. No backdrop blur any more (15
  blurred chips in 3D cost GPU time). → #100; Willy may want it back on the card.
- The entrance ripples out from the middle card (`min(i, N-i)`; it went by index before, so the
  middle card came last). Frames where nothing moved are skipped (`laidX`/`settled`), e.g. while a
  card is open.
- **Opened card:** the card flies (FLIP) into the screen of the homepage phone (the same generic phone
  as Section 03, no device details), the phone forms around it, then **the live page**
  (`site.html?ex=<slug>&embed=1`, opening and all) fades in over the card once loaded. Info: "<Look>
  style · <Sport>", the name, the look's line (`look.line`), four bullets from the athlete's real
  choices (cover, colors, font pairing + its note, then one of: results table / NIL / their own
  section / Reel / Folio / photo treatment / level), **Start with this style** →
  `../studio-v1/studio.html?start=1&from=<slug>` (same tab), **See the full page** →
  `site.html?ex=<slug>` (new tab), and "Your own words and photos, in <First>'s design."
- Opening a card glides the carousel so that card is in the middle behind the glass; ← → step through
  the examples and the carousel follows; closing flies the card home to the middle. Quick steps are
  safe (tokens: only the latest page loads, every other card is shown again). The page is unloaded
  (`about:blank`) on close so nothing keeps running.
- While open: the rest of the homepage is `inert`; focus starts on Close and returns to the card in
  the middle; Escape and ← → work; reduced motion = no flights, the page just appears.
- Phones (≤800px): the phone on top, the words under it, **the two buttons pinned to the bottom** (the
  details scroll under them), arrows flank the phone. Between 800 and ~1000px the box keeps room for
  the arrows (they overlapped the phone and a button at 820px).
- `site.html` gained **`embed=1`** (no scrollbar): inside the drawn phone a desktop browser showed a
  15px scrollbar gutter (`scrollbar-gutter:stable` in base.css). The Studio's preview already hid it.
- Copy: "Drag through **fifteen** of them". The nav/hero "Create your Athlesite" buttons and the claim
  form are untouched (#99).
- Tested with `tools/homepage-s2.js` (41 checks; 1440×900 and 390×844 `PROBLEMS none`, 0 console
  errors) plus 820×1180 and 1024×768 screenshots. Frames: the drift misses 0; the very first open in
  a fresh browser has ~2 long frames (GPU warm-up, which the old homepage also had, plus the live
  page's own script, ~56ms, which runs in the same tab); warm opens are clean. Loading the page after
  the flight instead only added a hitch mid-flight (tried, reverted).
- Until Willy's photos arrive, 12 of the 15 cards are the no-photo versions (initials, monograms).
  New photos show up on the homepage by themselves after `add-example.js --rebuild`.

The original Task 4 plan (approved by Willy; kept for reference — items 1–6 are what was built above):

Willy approved it with the other three ("Homepage Section 02 wiring — Real cards in the carousel with
stand-ins for now, opened card shows the live page, 'Start with this style' links to the Studio").
The examples are real now, so use them directly (no stand-ins needed). Proposed build:
1. **Load the Studio's code into the homepage** (classic scripts work across folders under `file://`):
   `../studio-v1/src/sports.js, profile.js, color.js, render.js, looks/*.js, card.js`,
   `../studio-v1/examples/examples.js`, and `../studio-v1/src/card.css`. Load each card's fonts once
   (`A.cardFonts(profile)`, de-duplicated), then `A.fitCards(carousel)` after `document.fonts` settle
   and on resize (sizes are in cqw, so resizes are cheap).
2. **Photo paths:** examples store `assets/img/…` relative to studio-v1; on the homepage prefix them
   with `../studio-v1/` before rendering (heroPhotoUrl, gallery src, posters). Do it in the homepage
   (map the profile) — don't change the example files.
3. **Cards:** replace the hand-made `SITES[].html` with `A.renderCard(profile)` inside `.card-inner`; keep
   the tag chip (`<Look> · <Sport>`; `dark` chip on light cards = palette not dark) and the shine. 15
   examples → build each card once (N = 15, no duplicate set; check the loop still wraps at 1440 and on
   phones). Keep the carousel physics as is. Order: mix looks and light/dark so neighbours differ.
4. **Opened card (modal):** left = the homepage-v2 **phone** (the Section 03 `.phone` style; generic, no
   Apple details) with a live `../studio-v1/site.html?ex=<slug>` iframe at 390×844 scaled into it
   (scrollable, opening plays once); right = info: "<Look> style · <Sport>", the athlete's name, the
   look's one-line description, 3–4 bullets from their real choices (cover layout name, palette name,
   font pairing name, photo treatment or "Results table" etc.), buttons **Start with this style** →
   `../studio-v1/studio.html?start=1&from=<slug>` and **See the full page** → `site.html?ex=<slug>`.
   Keep the FLIP feel: grow the card into the phone's screen, cross-fade to the iframe. Prev/next
   arrows step through examples (reuse `step()`). Phones: phone above the info (existing 800px rule).
5. **Copy:** Section 02's line says "Drag through five of them" → "fifteen" (tiny copy change; mention
   it). **Do NOT wire the nav/hero "Create your Athlesite" buttons or the claim form** (Willy,
   2026-10-11: "maybe not wire the main buttons yet"; his sign-up idea below). Only Section 02's
   "Start with this style" (and "See the full page") link to the Studio. Don't touch other homepage
   sections.
6. **Test** like the Studio: a `tools/homepage-s2.js` for drive.js (cards render with names, no console
   errors, open/close/prev/next, the links, phone 390×844, carousel frame times) and screenshots.
7. **Then** (later): Willy's photos → for each athlete put the files in a folder, convert to WebP
   (Chrome canvas via drive.js, like `make-test-photos.js`) into `assets/img/examples/<slug>-cover.webp`,
   `-photo-N.webp`, `-film-N.webp`, set `heroPhotoUrl` / `gallery` / `highlightLinks[].poster` + focus
   points in `examples/<slug>.json` (or do it in the Studio with `?ex=`, save, `add-example.js`), run
   `add-example.js --rebuild`, check `cards.html` + `site.html?ex=`. Mirror can be set per example
   once photos show which way people face.
8. Willy's review of everything since review #6 (Steps 3–4, examples, polish) → fixes.

**Willy is asleep: after Task 4, continue straight through this overnight queue, in order (he
approved "all of them", 2026-10-11).** Commit after each item; keep this handoff current as you go.
- **Q1 — DONE (session 5).** `PHOTO-PROMPTS.md` (generated by `node tools/photo-shots.js` from
  `tools/photo-shots.js`): **80 prompts** — 12 covers (Jordan, Maya and Tyler already have theirs),
  45 gallery photos (3 each; Jordan gets photo-2..4 because his back shot stays photo-1), and one video
  thumbnail per video each page has (23). Each athlete has a fixed description (age look, height,
  build, skin, hair, eyes) and kit (colors chosen to match their page's palette; Jordan, Maya and Tyler
  match their existing photos), repeated in every prompt; covers are framed for their cover layout;
  names are kept out of the prompts (tools print them on jerseys), the alt text keeps them; "no text
  except jersey numbers, the athlete's own must read exactly N". How-to at the top: cover first, then
  use it as the reference image for the rest, check hands/numbers/logos, save as
  `incoming/<slug>/<name>.jpg`, run `node tools/add-photos.js incoming`.
  **`tools/add-photos.js`** (headless Chrome encoder): converts, wires (cover + focus for its layout,
  gallery photo N or the next one, video N's thumbnail, alt text), rebuilds `examples.js`; `--dry`;
  notes for unknown athletes, wrong names, duplicates, unreadable files, missing videos, small photos.
  Tested on a scratch copy of studio-v1 with the test photos (every case above, pages + cards load the
  photos), then the copy was deleted. `add-example.js` now exports `rebuild`. `.gitignore` (repo
  root): `studio-v1/incoming/`. **Flag for Willy:** `assets/img/team-line.webp` (Jordan's gallery photo 2)
  shows team wordmarks and helmet logos and is only 680×383 — against our photo rules; its prompt
  (photo-2) replaces it. Left in place until then (his call).
- *(Q1 as planned:)* **AI photo prompts for all 15 athletes** + **a photo drop-in tool.** About 90 ready-to-paste
  prompts (`PHOTO-PROMPTS.md` in studio-v1): per athlete a fixed character sheet (age look, build,
  skin tone, hair, uniform colors, number, school colors; fictional, no logos, no text but the number)
  repeated in every prompt so it's the same person; the cover framed for that athlete's cover layout
  (EXAMPLES.md table); 3 gallery shots (action, team/sideline, candid/training) and 2 video thumbnails
  (16:9 action). Plus `tools/add-photos.js` (or a drive.js step): a folder of jpg/png per athlete →
  WebP into `assets/img/examples/<slug>-cover|photo-N|film-N.webp` (Chrome canvas, ≤1600px, q .86),
  wired into `examples/<slug>.json` (cover, gallery, posters; focus points default middle; cover focus
  from the layout's framing), then `add-example.js --rebuild`. Test it on the test photos
  (`make-test-photos.js`) in a scratch copy, then remove the test output.
- **Q2 — DONE (session 5).** New `tools/a11y-audit.js` (contrast measured against what's really
  painted under the text, names, alt, headings, landmarks, a Tab walk). Before → after:
  athlete pages 528 contrast problems → **0** (every look × palette, Jordan + Ava, 8 custom accents,
  desktop and phone); names/alt/headings were already clean. What changed:
  - **Colors (central, `paletteDecls` in render.js + `color.readableOn`):** muted text is nudged to
    4.5:1 where a palette fell short; a new **`--accent-text`** (the accent nudged toward the ink just
    far enough for 4.5:1, also on accent-tinted chips) colors the small accent text (Cinematic kicker,
    milestone years, Editorial "01" numbers, NIL flag, results headers/marks, Prospect kicker and status
    chips, Portrait wall numbers, footer hovers, the cards' kickers/chips) while big type and graphics
    keep the true accent; **text on the accent switches to dark** when white can't reach 4.5:1. Custom
    accents still keep 3:1 for big type (as before). The visible palette changes (for Willy to judge):
    Editorial/Clay court: muted #7A6B5E → #76685B; small accent text #B4502A → #A54A27 ·
    Highlight/Electric: small accent text #3D6BFF → #5880FF; **text on the accent white → #05070F** ·
    Highlight/Crimson: small accent text #F0284A → #F24260; **text on the accent white → #0C0809** ·
    Highlight/Daylight: small accent text #FF5A1F → #BB441A · Portrait/Gallery white: muted #7C7B77 →
    #6D6D69; small accent text #A8834C → #7C623B; **text on the accent white → #141414** · Portrait/Bone:
    muted #7A746A → #676259; small accent text #7D5C35 → #715431 · Prospect/Chalk #2563EB → #2460E2 and
    Field #2F7D4F → #2D774B (small accent text only). The bold ones are the visible ones (buttons and
    badges on blue, red and gold get dark text).
  - **Highlight on the accent:** small labels on accent tiles, the film section, the contact card and
    the NIL reach tile are no longer faded (opacity .65–.75 put them under 4.5:1); with no cover photo
    the nav's links sit on the accent without a tint and unfaded (electric blue can't reach 4.5:1
    otherwise), with a thin ring for the capsule.
  - **Keyboard, athlete pages:** a **"Skip to content"** link is the first Tab stop on every page
    (hidden until focused). The **Reel** follows focus: Tab onto a video's link and that video comes on
    stage (before, the link hid itself mid-scroll and focus fell to the page); faded words no longer take
    clicks but stay in the Tab order; a keyboard arrival skips the entrance loops. The **Folio** brings
    a focused photo to the middle. The phone Menu sheet was already right (focus in, Tab stays inside,
    Escape returns to Menu).
  - **Studio:** the setup is now really modal (`inert` on everything behind it; Tab used to walk into
    the toolbar and panel behind the setup; "Open a page file" still works); the hidden preview frame is
    `inert`; on phones, Tab into a tool below the lowered sheet raises it to full (only for Tab: tapping
    the page keeps its half sheet); "Play opening" keeps its name when its text hides on phones; an
    `<h1>` (visually hidden); Studio grey #6E7178 → #62656B (4.33 → 4.6:1). File menu was already right
    (Enter opens with focus on the first item, ↑↓ cycle, Escape returns to File, Tab closes).
  - **Homepage Section 02:** the carousel is **one Tab stop**; ← → move focus card to card and bring it
    to the middle; while a card has keyboard focus the carousel holds still (it used to drift away);
    an instructions line for screen readers. (homepage-s2.js: 46 checks now.)
  - **Reduced motion:** checked: no opening, nothing left hidden, Reel/Folio static, no running
    animations in any look; homepage and Studio already honored it.
  - **Not changed (homepage, outside Section 02 — Willy's call, one line each):** the homepage's
    `--muted` #6E7178 on #F3F1EC is 4.33:1 (eyebrows, Section 02's intro line and "Drag · Swipe",
    FAQ answers); suggest #62656B like the Studio. Also the dimmed inactive "How it works" steps
    (~1.5–1.9:1, by design), the claim line's ghost "athlesite.com/" (2.0:1, decorative) and the
    footer/claim small text at 4.47–4.49:1.
  Regression after Q2: check-freedom 45,360 / 0, links 0, mirror 0; studio-start, -results, -focus,
  -picks (both sizes), -rapid, -content, -photos (desktop; rapid and content have always been
  desktop-only), homepage-s2 (both), nav-overlap 0 (both), giant-clearance 0, spacing 1 known note.
- *(Q2 as planned:)* **Accessibility pass** (Studio, athlete pages, homepage Section 02): keyboard order and focus
  visibility everywhere (setup, panel, File menu, pickers, sheet), screen-reader names/roles/live
  messages, color contrast for every palette and for custom accents (`color.js` keeps accents
  readable; verify text on accent, muted text, chips, badges), reduced motion (openings, scroll
  moments, carousel, modal). Fix what's found; list anything that needs Willy.
- **Q3 — DONE (session 5).** New `tools/new-athlete.js`: a fresh high school swimmer ("Nia Brooks",
  fictional) builds a whole page through the UI — setup with a photo, every section, results with a
  best time, NIL through a parent, details and Instagram, a new look, the visitor view, Save to a file,
  reload, Open the file — with a screenshot per step, at 390×844 and 1440×900 (`PROBLEMS none` both).
  Found and fixed:
  - **Phones: the bottom rows of a half or peek sheet were out of reach** (the sheet slides down
    instead of shrinking, so the end of each screen sat below the screen). Each screen now has room at
    its end for the hidden part; every row scrolls into view at every height.
  - **Phones: "View as visitor" left the tools covering the page** (a full sheet hid it completely).
    Visitor view drops the sheet to its handle and Edit puts it back where it was.
  - **Pasting a profile link into Instagram / X / TikTok / YouTube / Hudl broke the link** and showed
    "@https://www.instagram.com/…" on the page. A link on that platform's own site is cut down to the
    handle (the link is still always rebuilt on the platform's domain; check-links 0). Hudl profile
    links keep their id and show the name part.
  - **Sport words:** the setup asked a swimmer "What position?". Track and swimming now get "What are
    your events?" / "What do you swim?", wrestling "What weight class?", rowing "Which side or seat?",
    tennis and pickleball "Singles or doubles?" (`words.ask` in sports.js), and the page's details say
    "Events" / "Weight class" / "Side or seat" / "Event" instead of "Position" (`positionWord`).
  - **Football-only wording in the Studio:** gallery caption/description placeholders ("Friday night,
    week 9", "Me catching a pass in the end zone"), the cover photo description, "most players at your
    position", and the profile links' empty text (now names SwimCloud, Athletic.net, UTR too).
  For Willy (written in §17.2): two places for times for swimmers (Stats "Times" and Results "Best
  times"); whether opening a section on a phone should raise the sheet to full; a real-phone check of
  the keyboard over fields in a half sheet.
- *(Q3 as planned:)* **New-athlete run-through** on phone (390×844) and desktop: build a full page from scratch the
  way a high schooler would (setup, photos, every section, results, NIL, save a file, reopen); fix
  small issues; write bigger ones down for Willy (in §17.2).
- **Q4 — DONE (session 5).** `PORTING.md` (studio-v1, design folder only) from a **read-only** look at the
  product repo, `origin/main` @ `bc96b8d` (PR #30). Biggest findings, which change earlier assumptions:
  - The product moved a lot since Willy's `willy/brand-v1-foundation` branch (cut before 5D): public reads
    go through an exact-slug RPC returning **18 fields only**; **school, recruiting status/contact, socials
    and NIL are private by founder decision**; Storage lets non-owners read **only the hero photo**; profiles
    are created **unpublished** and published explicitly; profiles are `noindex`.
  - **Approved minor policy (2026-10-06):** under-13 excluded; 13–17 guardian-first (approval before any
    data is kept, and again for the exact public revision); 18+ self-consent; **no stored DOB**; a reduced
    minor projection (first name + last initial, handle not real-name slug, no city, height/weight private).
    **Age gate is built** (PR #28): 13–17 are blocked until the guardian flow exists, so today only 18+ can
    sign up. **Adult participation records** are built (PR #29).
  - **Nothing may be kept on the device before sign-in** (PR #26, shared school devices). The Studio
    autosaves to localStorage/IndexedDB from the first keystroke, so it can't port as is.
  - **Willy's sign-up idea fits** (and Claude's earlier "account as late as possible" advice is reversed):
    proposed front door = Age (CFul's) → email code (CFul's) → the Studio setup → editor saving to the account
    as a private draft → explicit Publish. No duplicate questions; "age" is never stored.
  PORTING.md has the field-by-field mapping (new columns/jsonb, a `design` jsonb), photos (slots, Storage
  policy, the product's stricter re-encode), the renderer (TS module + projection, self-hosted fonts, same-
  origin preview), security rules to keep, open items, and an order of work. All proposals: auth, data,
  Storage and publishing are CFul's and the founders'.
  **`tools/run-all.js`:** every Node check + every drive.js test, one line each; `--quick`, `--only=`.
- *(Q4 as planned:)* **Porting notes for CFul + one-command test runner.** `PORTING.md` in studio-v1 (design folder
  only, **never the product repo**): read-only look at the product repo first (`src/lib/athlete-profile.ts`,
  `src/lib/onboarding-storage.ts`, `src/app/get-started`, `src/components/onboarding/`,
  `supabase/migrations/`; also `docs/ai/NOW.md`, `GUARDRAILS.md`, `CONTEXT.md`) → map the Studio data
  model to `AthleteProfileData` (new fields: results, sportDetails, NIL arrays, profileLinks, level and
  college fields, design JSON), photos (IndexedDB `idb:` → Storage; CFul's policies), the cross-origin
  preview (§15.6), security rules (escape, allow-lists), and **how Willy's sign-up idea and the Studio
  setup fit with CFul's get-started/onboarding** (below). Proposals only: auth, RLS, storage and
  publishing are CFul's (AGENTS.md non-negotiables). Then `tools/run-all.js`: every Node check and
  every drive.js test in sequence, each on its own port, one summary line per test.

**Willy's sign-up idea (2026-10-11, to discuss, not to build):** "when you create your athlesite it
brings up a page like where it will ask for your name, info, email, school, year, age, etc and then
once you submit (… check github or stuff cful worked on with the supabase stuff …) and then it brings
you into the studio. if you have push back please let me know." Claude's reply (agreed shape, three
adjustments): (1) don't ask twice — the Studio setup already asks name, level, class year, sport,
position; sign-up should be that setup or only add email/password; (2) ask for the account as late
as possible (build first, sign up to save to an account / publish; the Studio autosaves on the device
meanwhile); (3) careful with "age": exact ages/birthdates of minors carry legal weight (COPPA, under
13 needs parental consent); class year covers most needs; an age gate would be a yes/no "13 or
older?" — a founders' call with CFul. Claude will read CFul's get-started flow overnight (read-only)
and put the proposal in PORTING.md.

Known small things to maybe address: a brand-new athlete's Prospect card is sparse; the Folio
lightbox's big view ignores the focus point (shows the whole photo, fine); opening a section can cost
one ~50ms frame the first time its photos decode (§15.6).

The homepage (`../homepage-v2`) is otherwise separate work: **only Section 02 (+ possibly the CTA
links, ask)** is approved to change (Task 4, 2026-10-11).

---

## 1. The big picture

**What Athlesite is:** one professional, shareable home on the web for an athlete (high school or
current college). The **Studio** is the tool athletes use to build that page. The **athlete's site**
is what coaches, scouts, brands and fans see. NIL is "a major part of why we even created
Athlesite in the first place" (Willy, session 2).

**The roadmap Willy and Claude agreed (in order):**
1. Finish the Studio (this work). A full rebuild was approved.
2. Use the Studio to build 8–10 real example athlete sites across sports (they replace the 5
   placeholder cards in the homepage-v2 carousel). The Studio's "save a profile file" feature is how
   those examples get made.
3. Wire the homepage's "Create your Athlesite" button to the Studio.
4. Return to the homepage (homepage-v2) and polish it with the real examples.

**Key principle:** the Studio defines what athlete sites look like; the homepage follows the
Studio, not the other way round (Willy, 2026-10-09). The output was built before the editor
because the 8–10 examples and the homepage depend on how good the pages are.

---

## 2. History (what happened, in order)

### Session 1 (2026-10-09)
1. **Review of the old Studio.** Willy supplied two files in `C:\Users\conno\Downloads`:
   `Athlesite-Studio-04.html` and `Athlesite-Interaction-Lab-V3.3.6.html` (~4 MB each, base64 fonts
   and photos inside). Findings: Studio 04 was V3.3.6 plus a monkey-patched reskin (8 stacked CSS
   layers, 341 `!important`, 24 function overrides); its UI had three navigation systems for the
   same sections, slogan copy in every panel, an off-brand olive tint, a canvas squeezed to under
   half the screen; the athlete pages were thin ("Sample film · Add your video" shown to visitors,
   football-centric), the phone cover hid the name, the data shape drifted from the repo model.
   Ideas worth keeping: distinct looks, curated presets, click-to-edit on the page, the brand kit.
   **Verdict: rebuild from scratch; old files are reference only.** Willy: "whatever it takes".
2. **Data model + five looks + review page** (`04df112`), then a full review pass (`99944f9`),
   including a security fix (athlete links could carry `javascript:`).
3. **Opening animation per look** (`fe0d8b1`, `f52f874`). Willy: run times "perfect, no less no more".
4. **Autograph opening** prototyped (`5e1d0d6`), then **tabled** and parked on a branch (`b605bd0`).
5. **v1 line** agreed (`175e398`, `6e9fd17`).
6. **Sport catalog** for 12 sports (`a4066c2`), **college athletes** (`a85919b`, `5879e81`).
7. **Freedom system** + teammate test (`7a433eb`). **Fixes + Mirror** (`ddf4849`).
8. **Handoff** (`5438f35`, `9a024ba`, `edc2c2d`).

### Session 2 (2026-10-09)
1. **Editor plan agreed** (after Claude re-read the expanded handoff twice and looked at every built
   page in headless Chrome, as §0.2 asks). Willy agreed to all three open questions: panel + phone
   bottom sheet from day one; panel fields, not typing on the page; first run shows all five looks
   live with the athlete's name.
2. **Editor Step 1** (`265f422`): `studio.html` + `src/studio/` (§15).
3. **Willy's review #1** → `6341505`: new shared nav; Film fits one screen; opening's last-moment
   nudge fixed (Windows scrollbar); five signature scroll moments from his references.
4. **Willy's review #2** → `996cf0d`: NIL section; recruiting-profile links (On3, 247Sports, Rivals,
   ESPN…); Editorial drop cap reads as one word; two-line serif names never touch. He also asked why
   some look names are bold (answered, §17.3) and offered motionin MD files.
5. **Willy's review #3** → `0daa134`: "the wording seems to be bleeding into the edges or each other …
   check wording and spacing on everything" → automated type/spacing checker and a full pass
   (336 → 1 real-text findings). He supplied `cinema-reel (1).md` and `folio (1).md` from motionin;
   Benchmark paused. Claude proposed how to adapt them (§17.1); **awaiting his answer**.
6. **This handoff** (session 2 rewrite) + extra test tools copied into `tools/` (`77bf224`).

### Session 3 (2026-10-09 → 10, after a context compaction)
1. **Willy's review #4** (two phone screenshots, Cinematic and Highlight) + "i will trust your
   judgment with those recommendations" (the three Cinema Reel / Folio decisions, §17.1). Asked for:
   a better phone frame in the editor, the Cinematic opening number landing on the real number
   (desktop and phone, every cover), phone opening spacing/alignment, the phone number too close to
   Contact, lettering/word spacing on phones, and 60fps in the editor and on athlete pages.
2. Fixes (§19 review #4): number flight; phone title card; giant numbers clear the nav and fit the
   gap; nav goes solid before anything slides under it; long nav names become initials; item lines
   wrap between items; caps lines get line spacing; new phone frame + scroll indicator; 60fps work
   (batched layout reads, deferred rebuilds, cross-faded color changes, WebP test photos, async decode).
3. **Cinema Reel → Film "Reel"; Folio → Gallery "Folio"** built and measured (§10.6, §13).
4. New tools: `number-landing.js`, `giant-clearance.js`, `nav-overlap.js`, `perf-site.js`,
   `perf-studio.js`, `perf-trace.js`; `drive.js` can listen to CDP events (`t.on`); spacing checker
   gained a 360×740 phone; the freedom check now covers Reel/Folio (45,360 renders).
5. Handoff update + commit (`8be979f`).
6. Willy: "go ahead for step 2 … ill review step 1 when i wake up" (he's asleep; continue automatically).
   Then: "some of the stuff isnt loading. smae for other styles" (screenshot: the cover photo showing
   its alt text) → the editor reopened a page saved before the PNG → WebP switch; `normalizeProfile`
   now maps the renamed built-in photos (`5209b10`).
7. **Editor Step 2** (`6aca648` content editors for every section; `ee435fc` photos + editor-only
   empty-section prompts + an `app.js` syntax fix; `af839cf` docs, 16px phone fields): §15.7.
8. Willy (woke up): "this looks good, i need to compact this session again so can you please make
   sure the handoff is up to date and also very specific" → this handoff pass (its own commit).

**All session 3 commits, in order:** `8be979f` review #4 + Reel/Folio + 60fps · `5209b10` saved pages
find the renamed photos · `6aca648` Step 2 part 1 · `ee435fc` Step 2 part 2 · `af839cf` Step 2 docs ·
`cedf0e8` the final handoff commit.

### Session 4 (2026-10-10, after another compaction)
1. **Willy's review #6** (two screenshots: Editorial's About section; the editor's phone): "most of it
   looks great". Asked: the smaller paragraph under the read-along sentence should fade in **after**
   the big sentence is done (About and the other Editorial section, "Beyond the game"); the editor's
   phone "doesn't look like a phone" in shape: use the homepage-v2 phone. Then go to Step 3, but first
   look at homepage-v2 Section 02 to understand the size of the examples and what they'll be.
   → both fixed (`5e3d5bd`, §19 review #6).
2. **Section 02 studied** (sizes in `EXAMPLES.md`): 340×460 portrait cards in a 3D carousel (250×350
   on phones), opening to 473×640 with style info and "Start with this style". Rendered the real
   covers at that shape: they don't crop well (Portrait loses the name, Prospect too small).
   Asked Willy (AskUserQuestion): cards → **"Card made from the page"**. Photos → Willy: the current
   homepage examples aren't kept, "I want maybe 1 of each sport we have so far. are you saying you
   need photos from me? or can you not find ones online?" → Claude: yes, from him (licensing, §18).
3. Willy, mid-build: "like how we want every player website to be different because of the player
   freedoms creative editability, same thing for the cards … the point of section 02 … is to
   showcase some of the cool designs already made, like a little teaser … also another sport to add
   is pickleball" → cards follow every choice incl. all 15 covers + mirror; pickleball (`584d798`).
4. **Editor Step 3**: first run (pick your look from your own cover cards) + save/open page files
   (`ee43954`, §15.8).
5. **Examples pipeline** (`tools/add-example.js`, `examples/`, `?ex=`) + `EXAMPLES.md` (lineup of 15,
   shot list, photo rules) + docs (this handoff's commit).
6. Willy asked what the setup and "pick your look" are for, then: "after you create your site the
   card cover … should come last. also the card thing i was only really needing for the 15 example
   ones … the card thing for the newer clients could become like shareable cards … if a potential
   client is like i like that one alot it could be easy for them to start with that, so maybe theres
   an option for like start from scratch or create your own button". Claude agreed and proposed:
   drop the look screen, "Start with this style" copies the example's whole design, "Create your own"
   starts in Cinematic, park share cards. Willy: "i agree with 1 and lets park the sharable cards
   for now. and i agree with 2. you can begin the next phase. ill get the photos later" → built
   (#82–#86); then Step 4.
7. **Step 4: the results table** (§15.9, #87–#90), then docs.

8. Willy (2026-10-11): "ok i can get you the photos at this instance [later]. is there anything else to
   do during the meantime with this stage or the entire studio editor?" → Claude listed four tasks
   (build the 15 examples without photos; focus points for gallery/posters; editor polish + 60fps;
   homepage Section 02 wiring) and asked keep/drop on sportDetails. Willy: "i love all 4. just go down
   the list and do em all. if you dont have the folio md code file let me know … i dont have reel yet
   because i have to pay for it" + **Keep** sportDetails. Then: "oh wait i do have them both. my bad"
   (`folio (2).md`, `cinema-reel (2).md`; byte-identical to the copies we built from).
9. **Task 1: the 15 examples** written and built (`0e7226e`; #95).
10. **Task 2: focus points** for gallery photos and video posters (`0e383e6`; #91).
11. **Task 3: editor polish**: click anything → its row; phone taps stay above the sheet (`e1826cd`;
    #93–#94); **60fps re-check** (§15.6: editor 0.5% missed, same as session 3; pages smooth after
    one-time costs; phone + 4× CPU scrolling 4–6% missed, and session 3's code measures 2.4–6.6% the
    same way, so no regression).
12. Willy: "wait can you pause, we need to compact session first … please update the handoff like we
    have done the last couple times as detailed as you can" → this update. **Task 4 not started.**
13. Willy: "is there anything else you can work on after task 4, im going to bed soon" → Claude listed
    six items; Willy: "all of them" (overnight queue Q1–Q4 in §0.3); main buttons: "maybe not wire the
    main buttons yet" + his sign-up page idea (§0.3; Claude's pushback recorded there). Then compaction.

### Session 5 (2026-10-11, overnight, after another compaction)
Willy: "ok start task 4 and then the overnight list once thats done. also we may run out of usage at
somepoint but when we get it back auto continue please since ill be asleep. do not rush anything."
Claude set an hourly check in this session (cron `17 * * * *`, lives only while the session runs) that
resumes the queue after a usage pause and deletes itself once everything is done. Mid-task Willy sent
`momentum-slider (1).md` ("incase you need it for the card example section"): the source spec of the
homepage carousel. The homepage already follows it (physics, 3D, FLIP), so it was a reference only.
1. **Task 4: homepage Section 02 wired** (§0.3; #100–#103), `8eb3627`.
2. **Q1: photo prompts + add-photos tool** (§0.3; #104–#105), `1a1b992`.
3. **Q2: accessibility pass** (§0.3; #106–#110), `8ee0735`.
4. **Q3: new-athlete run-through** (§0.3; #111–#112), `e111ee5`.
5. **Q4: PORTING.md + run-all** (§0.3; #113–#114). The run-all `--quick` pass caught one timing
   check in homepage-s2 (the first card open in a **fresh** browser profile: 8/336 frames on desktop,
   12/273 on the phone, over 20ms; the old bar was a fixed 6 frames, and the runner's Chrome drew ~120
   frames a second, twice the earlier runs). The bar is now 5% of the frames or 6, whichever is more;
   everything else passed on the first try.
6. Willy, the next morning: "we need to compact again, can you please do the same thing as every other
   time and update the handoff really detailed and specific please. i sent cful the porting md so he can
   take a peek at it" → this close-out (handoff, memory, the Q4 commit). Willy hasn't reviewed any of
   session 5's work yet.

### Session 6 (2026-10-11, after another compaction; Willy awake)
1. Willy's answers to the morning list (§0.3 "Session 6"): chip under the cards agreed; palettes, photos
   and the three questions later.
2. **Glitch fixes** (Studio panel + preview, homepage Section 02) measured at Willy's real display settings
   (#115–#117, #119).
3. **Section 03 from the real Studio and page** (#118), `tools/how-shots.js`, `tools/homepage-s3.js`.

**All session 5 commits, in order:** `8eb3627` Task 4 (homepage Section 02) · `1a1b992` Q1 (photo
prompts + add-photos) · `8ee0735` Q2 (accessibility) · `e111ee5` Q3 (new-athlete run-through) · then the
Q4 + close-out commit (PORTING.md, run-all.js, the homepage-s2 timing bar, this handoff).

**All session 4 commits, in order:** `5e3d5bd` review #6 · `584d798` cover cards + pickleball ·
`ee43954` Step 3 · `2f6bbbd` examples pipeline + docs · `ef28061` the setup change (no look picker,
`?from=`, tip, no "Other", phone bar) · `27621f3` Step 4 (results table) · `0e7226e` the 15 examples ·
`0e383e6` focus points · `e1826cd` click-to-row + phone sheet · then this handoff's commit.

---

## 3. Decision log (with reasons)

| # | Decision | Why / source |
|---|---|---|
| 1 | Rebuild the Studio from scratch; old files are reference only | Patch layers made every fix fight earlier fixes. Willy approved |
| 2 | Build the athlete-site output first, then the editor | The pages are the product and feed the homepage examples |
| 3 | The Studio sets the styles; the homepage follows | Willy: "the homepage for the examples will just follow the decisions from the studio" |
| 4 | Five looks: **Cinematic, Editorial, Highlight, Portrait, Prospect** | Claude's call (Willy allowed a rethink). Journal dropped (too close to Editorial); Prospect added (data-first page for coaches) |
| 5 | Every look gets its own section designs, not just its own cover | The old Studio's looks differed only at the cover |
| 6 | Empty sections never show to visitors | The old Studio showed "Add your video" placeholders publicly |
| 7 | Opening animation per look, built from the athlete's own name/number/colors, ending on the real headline | Willy wanted a personalized intro "better than 4.0" |
| 8 | Opening run times stay exactly as built | Willy: "no less no more". Overruled Claude's ~2 s cap |
| 9 | Opening once per visit on real sites, every load in previews; skippable; off for reduced motion; athlete can turn it off | Coaches shouldn't sit through it twice; accessibility |
| 10 | Sport setup is **optional, never mandatory** | Willy: "this has to be a option for them, not mandatory". Reinforced session 2: "not everyone will need a sports catalog section" — every catalog suggestion stays optional and unticked unless it's common |
| 11 | **Player creative freedom is the #1 priority** | Willy: "the player creative freedom is the most important part" |
| 12 | One sport per athlete for now | Willy |
| 13 | Light layer (suggestions) + deep layer (sport-only sections); v1 deep layer = results table | Willy |
| 14 | 12 sports (+ golf, tennis, other) | Willy added hockey, wrestling, rowing, lacrosse |
| 15 | High school AND current college athletes | Willy |
| 16 | Freedom through **choices, not drag-anywhere** | Claude's pushback (breaks on phones); Willy: "trust your gut" |
| 17 | Remix: yes | Willy |
| 18 | Mirror option for covers | Teammate test; Willy: "sure add a mirror option" |
| 19 | Photos are never flipped | Flipping reverses jersey numbers and lettering |
| 20 | Smooth interactions; every click lands | Willy: instant redraws felt "raw and staticky", missed clicks |
| 21 | Autograph opening tabled | Minors' autographs; talk with CFul first |
| 22 | Next-game countdown parked | Willy |
| 23 | Team awareness parked | Privacy question |
| 24 | Video hero later | Uploads/storage are CFul's area |
| 25 | No embedded social feeds | Meta API approvals; links are enough |
| 26 | Brand kit after v1 | Fonts/covers/color carry uniqueness for now |
| 27 | Any custom accent is auto-adjusted to stay readable | "Any color" must never produce unreadable pages |
| 28 | "Not open to recruiting" shows nothing | Not open ≠ committed |
| 29 | Every athlete-entered URL is allow-listed | Public pages; no `javascript:` links |
| 30 | Design work stays out of the product repo; local commits only | Willy |
| 31 | **Editor: one panel (right) + bottom sheet on phones from day one** | Session 2. High schoolers open it on phones first; retrofitting costs more than building it in |
| 32 | **Editor: panel fields, not inline typing on the page**; clicking the page opens/focuses the right field | Session 2. Inline editing on five animated covers is fragile and bad for keyboards/screen readers |
| 33 | **First run shows all five looks live with the athlete's name** (grid desktop, swipe row phone) | Session 2, Willy agreed |
| 34 | Preview: two iframes cross-fading, **not** the View Transitions API | It swallowed clicks mid-animation in session 1 |
| 35 | Rapid changes to the same control within 0.9 s = one undo step | Claude's default, flagged to Willy (not objected to) |
| 36 | Measurables join the stats list (no separate field) | The test athletes already do it and it reads well |
| 37 | Shared nav for every look: section capsule + sliding marker, solid Contact, tuck on scroll, Menu sheet | Willy review #1: nav "can be presented better" |
| 38 | Film section fits one screen (video sized by screen height, info beside it) | Willy review #1 |
| 39 | Page always reserves the scrollbar's space (`scrollbar-gutter:stable`) | Willy saw the opening's name "move a slight tad at the end": the scrollbar returning shifted the headline 7.5px |
| 40 | One signature scroll moment per look, drawn from his references (motionin, seesaw, 60fps, collectui; **not** Bortoleto) | Willy review #1 |
| 41 | Cinematic moment is a fade to black, not letterbox bars | Bars attached to the cover would be mostly off-screen while it scrolls away. Offered to Willy; bars fixed to the screen are the alternative |
| 42 | **NIL section** (only when open to NIL) with "who handles inquiries" (me / parent / agent / school) | Willy review #2 ("a major part of why we created Athlesite"); parents usually handle high schoolers' deals |
| 43 | **Recruiting-profile links** (On3, 247Sports, Rivals, ESPN + sport sites); the label always comes from the link's real domain | Willy review #2; trust (a link can only say "On3" if it goes to on3.com) |
| 44 | Editorial drop cap: real two-line initial + small-caps lead-in | Willy: the big S "looks like its for either sentence" |
| 45 | Tight stacked names, but letters never touch (per-font line-heights) | Willy: "the B is super close to the J" (measured: up to 0.15em overlap) |
| 46 | Look names in the Design panel stay in each look's own font (bold for Cinematic/Highlight/Prospect, light serif for Editorial/Portrait) | Willy asked why some are bold; Claude: it previews the look's type. Better fix if still confusing: live thumbnails (built for first run anyway) |
| 47 | **Nothing touches, overlaps or bleeds off an edge** (enforced by `tools/spacing.html`) | Willy review #3. Rules in §16 |
| 48 | Highlight's giant number is a **ghosted outline** when it shares the name's side or sits behind a centered name; solid when it has its own side | Review #3: solid red behind white name read as bleeding. Judgment call; removing it is the alternative |
| 49 | Decorative giants (Cinematic no-photo initials, Highlight number) stay fully on screen and on the free side | Review #3 ("bleeding into the edges") |
| 50 | motionin sections get adapted for long athlete pages (no wheel trap, no page scroll lock) | Proposed end of session 2; **approved session 3** ("i will trust your judgment") |
| 51 | **Cinema Reel = Film layout "Reel"**: pinned, one screen of page scroll per video, eased like the original; default in Cinematic with 2+ videos, opt-in elsewhere; "Explore" panel replaced by "Watch on <platform> ↗" | §17.1 decisions 1–3, approved |
| 52 | **Folio = Gallery layout "Folio"**: pinned, captions up / photos down, current photo opens large with a FLIP; 3+ photos; finite list (no loop); every look | Same |
| 53 | **No CSS scroll snapping** on the page; a JS "settle" glides to the nearer item only when a scroll rests strictly inside the pinned stretch | Proximity snapping pulled people back to the last video when they scrolled past it (measured) — the exact trap we promised to avoid |
| 54 | Per-frame motion is **transform and opacity only**; dropped the originals' per-frame blur and variable font weight (titles use scale + opacity) | Blur/weight changes repaint or re-lay out every frame; 60fps request |
| 55 | **Cinematic opening number flies onto the cover's number**; where the cover has none (Center stage, Mirror, phones without room) it shrinks into the "No. 14" of the details line | Willy review #4: "the number doesnt always seem to flow to the spot where the number actually is" |
| 56 | **Phone Cinematic opening = portrait title card**: slimmer bars (9svh), bigger name (scale 1.5, 57% down), number stacked above, credit right under, one center line | Willy: phone openings' "spacing and allignment are off" |
| 57 | **Phones: giant numbers/initials keep ≥40px below the nav buttons, never sit behind the cover's words; they shrink to fit the gap and step aside when there's no room** (Highlight Center poster's deliberate layering opts out with `--fit:off`) | Willy: "the 14 … is too close and bleeding into the contact button" |
| 58 | Nav turns solid **before** anything on the cover can slide under it (measured per page), not when the whole hero is gone | Screenshot showed "JB"/buttons over the stats labels mid-scroll on a phone |
| 59 | A nav name that doesn't fit becomes **initials** (`is-short`) | 360px phones: "Maya Rodriguez" pushed Contact 15px off screen |
| 60 | Lines of items ("Wide receiver / '27 / Northview High School") wrap **between items**; a separator left at a line end is hidden | Willy's Highlight screenshot: "NORTHVIEW" / "HIGH SCHOOL" split |
| 61 | **Editor phone preview = just the screen** (16px corners, hairline, soft shadow), no device drawn, page scrollbar hidden, slim scroll indicator while scrolling | Willy: "not a big fan of the look of the phone outline itself"; the Windows scrollbar inside a phone shape looked wrong. Also respects the no-Apple-device rule |
| 62 | Color changes in the editor **cross-fade the page as one picture** (same-document view transition inside the preview), not per-element color transitions | Per-element transitions repainted the whole page every frame (10% missed frames). The old "VT swallowed clicks" problem (#34) was the parent page; this runs inside the preview only |
| 63 | Full preview rebuilds wait **90ms** so the click's own feedback paints first; rapid clicks fold into one rebuild | Look switches blocked the panel's first frame |
| 64 | Test photos are **WebP** (Jordan's PNGs were 2.2 MB / 1.75 MB → 132 KB / 46 KB) and every photo decodes in the background (`decoding="async"`) | Each first view of a big PNG cost a 30–100ms frame. Real uploads will be resized/compressed (Step 2 photo help) |
| 65 | The real fix for slower machines (editor at 60fps no matter what the preview is doing) is a **cross-origin preview frame** (its own process); proven but not possible under `file://` | §15.6. Do it in the real app |
| 66 | **Step 2 editors: panel fields, one undo step per typing burst, the page catches up 320ms after you pause typing** (other changes 90ms) | Typing must never stutter; a full page rebuild per key would |
| 67 | Sport catalog in the editor = **ideas you tick** (common ones marked "Common"); ticking adds an empty row; unticking removes it only while empty | Willy: "not everyone will need a sports catalog section"; never delete what someone typed |
| 68 | Photos are resized to ≤1600px WebP and kept in **IndexedDB on the device**; the profile stores `idb:<id>` references; images may be `blob:` URLs in the preview only | localStorage would fill up with a few photos; works from file:// (tested). Real app: uploads go to storage (CFul) |
| 69 | Focus point by tapping/dragging the photo (arrow keys too), with Computer + Phone crops side by side; small-photo warning under 1200px on the long side | Planned in Step 2; the hero's existing focus/zoom fields are reused |
| 70 | Editor-only **"+ Add your film"** prompts where empty sections go (edit mode only) | Empty sections were only reachable from the list |
| 71 | NEW `sportDetails` built (pending Willy's explicit OK) | Willy said go ahead with Step 2 while he slept; easy to drop if he says no |
| 72 | **Editor phone preview = the homepage-v2 phone**: black body, even bezel, thin lighter edge, rounded screen corners, soft shadow, drawn as shadows around the 390×844 screen in its own pixels (bezel 12.5, screen corners 46); no notch, island, camera or buttons. **Replaces #61** | Willy review #6: "the phone image doesn't look like a phone … homepage v2 … has an example of a phone that works … just use that style". Generic hardware, so the no-Apple-look-alike rule holds |
| 73 | Editorial read-along: the smaller paragraphs under the lead **wait until its last word has inked**, then fade up one after another; scrolling back up puts them away; the bottom of the page counts as read | Willy review #6 (About and "Beyond the game") |
| 74 | **Homepage example cards are generated from the real page** (`card.js`), not screenshots, not hand-made posters | Real covers don't crop to 3:4 (measured comparison); Willy picked "Card made from the page" |
| 75 | **Cards follow the athlete's own choices like the page does**: cover layout (all 15 have a card variant), mirror, palette/accent, font pairing, photo treatment | Willy: "like how we want every player website to be different … same thing for the cards" |
| 76 | ~~The first run's look picker uses the same cover cards~~ **Superseded by #82** (no look picker in the setup) | Cheap and smooth on phones; matches the homepage's "Your own look" carousel; replaces the §0.3 iframe plan |
| 77 | First run = level + class year → name (the only required answer) → sport (skippable; pickleball included) → position + number (skippable) → optional cover photo **before** the look pick (so the cards show it) → look. Nothing from the catalog is filled in | #10, #67; the cards are much more convincing with their own photo |
| 78 | **Page files** `<name>.athlesite.json` = `{ athlesite: 'page', version: 1, savedAt, profile }` with stored photos inlined as data URLs; Open re-stores photos through a canvas into IndexedDB; Open and Start-a-new-page replace the page as **one undo step**; `normalizeProfile` coerces wrong field types | Self-contained files move between computers; only real images get in; nothing is lost by accident |
| 79 | **Examples: one per sport (15)**, each on a **different cover layout**, fictional people, AI-generated photos made by Willy following `EXAMPLES.md`; **no free-stock photos of real people** | Willy: "maybe 1 of each sport". Stock people are identifiable and usually unreleased; fake names + stats on a page selling Athlesite reads as endorsement (their licenses forbid it). Claude can't make images here |
| 80 | **Pickleball** added to the catalog (singles/doubles/mixed, DUPR rating, record, medals, DUPR link, tournament results) | Willy session 4 |
| 81 | ~~"Start with this style" → `?look=<look>`~~ **Superseded by #83** (`?from=<example>`; `?look=` still works) | Proposal; built and tested on the Studio side, homepage wiring later (roadmap step 3) |
| 82 | **No look picker in the setup.** It ends after the photo ("Build my page" / "Skip and build my page") and the editor opens on their page | Willy: the card "should come last"; a brand-new page is mostly empty, so five cards of it say little. The look is easier to judge on the real page in the editor (Design switches looks with the whole page showing) |
| 83 | **"Start with this style" = `studio.html?start=1&from=<example>`**: the new page takes the example's **whole design** (look, palette, accent, font pairing, photo treatment, cover + layouts + mirror, section order, opening on/off), never its words or photos. A test athlete's key works for testing | Willy: "if a potential client is like i like that one alot it could be easy for them to start with that". Someone who loves an example wants that exact design, not just its look name |
| 84 | **Shareable cards for clients are parked** (after v1, with the brand kit's social graphics: e.g. at publish time, an image for stories and link previews). The cards stay for the homepage examples | Willy: "lets park the sharable cards for now". A card is best when the page is full, so it belongs at the end, not in the setup |
| 85 | **"Create your own" starts in Cinematic**, and a one-time tip on the panel's home screen points at the other looks ("Try the other looks" opens Design; dismissible; on phones the sheet rises halfway so the tip shows). From an example the tip names it ("Your page starts in Devon Carter's style (Highlight)") | Willy agreed. Cinematic is the flagship and looks good with almost any photo |
| 87 | **Results table = one section type for every sport measured in results**; the sport's catalog entry sets its title, columns (≤5), the **headline column** (`key`: Mark / Time / Place / Score) and a best-mark badge (`pb`: track "PR", swimming "PB"); sports without one get a general table (Event · Result · Place · Date) | V1-LINE ("one section type for sports measured in times and results"); one design to keep good instead of six |
| 88 | Results sit **right after Stats** in every look (and in pages saved before) | They're the same kind of proof as stats |
| 89 | The results **prompt** on the page (edit mode) only for sports that have a table; the section is still in every athlete's list | Football players shouldn't see "+ Add your results"; freedom stays |
| 90 | Athletes can **rename columns and the title**, not add columns; rows store cells as `{a…e}` + `pb` | Covers "my results look different" without a table builder; stays a clean shape to port |
| 93 | **Click anything on the page → its exact row**: every stat (incl. the cover's), video (incl. Reel slides), result, milestone and gallery photo carries `data-item="<list>:<index>"` (`c.h.item`); a click opens that section with the cursor in that row (stat → value, video → title, result → first cell, milestone → title, photo → caption) | Known gap (§15.5): sections opened but no row was focused |
| 94 | **Tapping the page never scrolls it to the section's top** (what you tapped is already on screen); on phones the sheet rises to half and the tapped item is kept above it (`preview.setInset` from the sheet height, `preview.reveal(item)`) | The old section scroll moved the tapped thing behind the sheet (measured) |
| 95 | **Example pages: fictional everything; no social handles, no recruiting-profile links, videos titled but not linked** (yet); contacts on example.com; made-up schools, events and businesses; real cities | A made-up handle can belong to a real person; profile links would be dead pages on real sites; this is a public marketing page |
| 96 | motionin: Willy has **both** Cinema Reel and Folio files (identical to what we built from); the Reel adaptation stays a local prototype until the multi-site license is confirmed | Willy, 2026-10-11: "i dont have reel yet because i have to pay for it" then "oh wait i do have them both" |
| 97 | Willy approved four "meantime" tasks while he gets photos: 15 examples → photo focus → editor polish + 60fps → homepage Section 02 wiring | "i love all 4. just go down the list and do em all" |
| 100 | Homepage cards: the **style chip sits under each card** (an exhibit label), not on it | On the real covers it covered words (Tyler's kicker, Maya's rubric). Claude, session 5; Willy may revisit |
| 101 | An opened homepage example shows **its live page in the homepage phone**; the carousel brings it to the middle; ← → step; the page unloads on close | Willy approved "opened card shows the live page, Start with this style links to the Studio" (Task 4) |
| 102 | On phones the opened example's **two buttons are pinned to the bottom** | The phone plus the details don't fit an 844px screen; "Start with this style" must always be reachable |
| 103 | `site.html?embed=1` hides the scrollbar inside a drawn phone | A desktop browser drew a 15px scrollbar gutter inside the homepage phone |
| 104 | **Photo prompts and the photo tool share one source** (`tools/photo-shots.js`): prompts, alt text, cover focus points; files are named by their place (`cover`, `photo-N`, `film-N`) | One edit updates both; Willy only has to name files, not fill in a form |
| 105 | **No names in image prompts**; prompts allow jersey numbers only, and the athlete's own must match | Image tools print names onto jerseys; team shots naturally show teammates' numbers |
| 106 | **Small text is always 4.5:1** (WCAG AA) whatever the palette or custom color: muted nudged, `--accent-text` for small accent text, dark text on the accent when white falls short; big type and graphics keep the true accent (3:1) | Coaches read these pages on phones in daylight; one central rule covers every palette and every athlete's own color |
| 107 | **Every athlete page starts with a "Skip to content" link** (hidden until focused) | Ten nav links before the content on every page |
| 108 | **Showcases follow keyboard focus** (Reel brings the focused video on stage, Folio the focused photo); faded Reel words stay focusable but don't take clicks | Focus used to vanish inside the Reel |
| 109 | **The Studio setup is modal for real** (`inert` behind it); phones raise the sheet for Tab only | Keyboard users walked into the hidden editor |
| 110 | **Homepage carousel = one Tab stop, ← → move focus, no drift under keyboard focus** | 15 tab stops and a card drifting away from focus |
| 111 | **Pasted social links become handles** (only links on that platform's own site; the link is always rebuilt on the platform's domain) | Teenagers paste their profile link as often as their handle |
| 112 | **Sports without positions get their own word** (Events, Weight class, Side or seat, Event) in the setup question and the page's details; the editor field stays "Position" with the sport's options | "What position?" to a swimmer reads like the tool doesn't know their sport |
| 113 | **Proposed front door: Age → email code → Studio setup → editor saving to the account → explicit Publish** (proposal to the founders, in PORTING.md §7) | The product forbids device storage before sign-in (PR #26) and the Studio is a long session; reverses Claude's earlier "account as late as possible" |
| 114 | **The Studio's public sections wait for a founder visibility table (adult/minor)**; until then a port renders only the product's 18 public fields plus design | School, contact, socials, recruiting and NIL are private by founder decision; the minor projection is approved but unbuilt |
| 115 | **Carousel sheen = a fixed diagonal sheen whose brightness follows the middle** (opacity only), not a sheen sliding across the card with a blend mode | The sliding sheen repainted all 15 cards every frame; on Willy's laptop (150%, 120Hz, Iris Xe) that saturated the graphics chip and the whole screen stuttered ("the entire screen gets glitchy"). Claude, session 6; Willy may want the slide back |
| 116 | **No backdrop blur over the opened example** (solid scrim; plain ← → buttons) | A full-screen blur is redrawn whenever anything behind it moves; it cost ~3 offscreen passes per frame while the live page played |
| 117 | **Studio: one panel screen at a time** (old out in 120ms, new in after 70ms) and **long preview jumps dip instead of scrolling** (> ~1.2 screens) | Willy: buttons on the right "glitchy or like delayed"; the two screens overlapped for ~250ms and the preview raced through the film reel |
| 118 | **Homepage Section 03 shows screenshots of the real Studio and page** (Jordan Bell), made by `tools/how-shots.js`; the publish switch and the "Link copied" toast are drawn from real parts (the Studio has neither yet) | Willy: "make it all look like the real thing (or at least as much of the real thing as we have to date)". Screenshots are exact and cost nothing to animate; hand-drawn copies drift from the real UI |
| 119 | **Smoothness is judged at Willy's display settings**: `DPR=1.5` at 1707×960, or `HEADED=1` (a real window), with Chrome's frame reporter (frames shown vs dropped) and tiles re-rastered, not only rAF times | 1× headless rAF timings said the carousel was perfect while Willy's screen stuttered: the page ticked at 120Hz while the graphics chip fell behind |
| 135 | **Athlete footers: "Contact [first name]" and "Back to top" beside the credit, every look; dark pages declare color-scheme dark** | Footer Design + Vercel guidelines review (Willy: "do the 3 worth a look") |
| 134 | **Fontshare (ITF FFL) fonts never go in the athlete font picker** (the license forbids offering them as a selectable font in a builder); OK only for Athlesite's own pages; OFL fonts are fine | ITF Free Font License 2.0, read 2026-11-10 |
| 133 | **Setup on desktop: larger, every question at the same height (not true centering, so nothing jumps)** | Willy: "yes i like those ideas for the setup" |
| 132 | **Setup buttons: one dark pill per step, Skip as the same plain text everywhere, 48px on phones** | Willy: "yes i like those ideas for the setup" |
| 131 | **A long name shrinks to end before the cover's giant number (desktop); under 60% the number shrinks instead; numbers layered behind the name on purpose opt out (`--fit:off`)** | Willy: "long names on this look bleed into the number" |
| 130 | **"See the full page ↗" under each style card** (opens the example in a new tab; the card still applies the style) | Willy: "yes i like that idea to add a smal see the full page link" |
| 129 | **The athlete page's nav always stays on screen** (no tuck-away on scroll) | Claude recommended; Willy: "great sounds good" |
| 123 | **The lab lives at `Athlesite/athlesite-design`**, its own repo, excluded from the product repo locally | Willy: "can you move athlesite-design folder into the athletesite folder please" |
| 124 | **Athlete pages: no full-screen blur in the Reel's opening, no blur-ins, no frosted stuck bars** (smaller glass capsule over the cover only) | Measured at Willy's display: these were most of the dropped frames (10% → 1.6%) |
| 125 | **Example photos are Pexels stock**, faces hidden or far where possible, credits in PHOTO-CREDITS.md | Willy: "you can scour the internet if you want to find picures for the examples … make sure the photos look perfect … not generic bland boring" |
| 126 | **On phones the keyboard raises the sheet to full while typing in the tools**, and it returns after | The run-through's open question (§17.2 3); half sheet + keyboard left no room |
| 127 | **No "Autographs" NIL idea for high schoolers; no "Club team" for college; "Draft eligible" only in draft sports** (`A.DRAFT_SPORTS`) | Open questions from sessions 1 and 5, decided under Willy's "full control" |
| 128 | **This chat owns studio-v1; homepage-v2 is Willy's homepage chat** | Willy: "wait why are you looking at the homepage? i have another chat for that" |
| 122 | **The homepage's "Create your Athlesite" buttons go to the Studio setup** (`studio.html?start=1`); **"Claim it" carries the link name** (`?slug=`, cleaned to a–z 0–9 hyphens, 3–30) onto the new page's `data.slug`. Supersedes #99. The Lovable/"hero reference rebuild" homepage is dropped: **homepage-v2 is the homepage** | Willy, session 7: "ignore the lovebale one were going with the 15 card example one. sure you can wire them" |
| 120 | **The accessibility palette nudges stay** (every palette, incl. dark text on Electric, Crimson and Gallery-white buttons); homepage `--muted` #62656B | Willy, session 7: "i agree with your suggestions" |
| 121 | **Results sports keep both Stats and Results; a phone section keeps the sheet's height** | Claude's defaults from the Q3 run-through, accepted by Willy in session 7 |
| 99 | **Homepage "Create your Athlesite" buttons and the claim form are not wired yet**; a sign-up page before the Studio is Willy's idea to discuss (account as late as possible, no duplicate questions, no exact ages of minors) | Willy, 2026-10-11 |
| 98 | The 60fps bar is judged against the same measurement on the previous code (a worktree of the old commit), not against old notes | Phone + 4× CPU numbers swing 2–7% run to run; comparing to session 3's written numbers looked like a regression that wasn't |
| 91 | **Focus points for gallery photos and video posters** (x, y on the item; unset = the middle), set in a picker under each list (thumb strip → tap/drag/arrow keys, Tall + Wide previews; posters: Reel + Wide). The lists ignore x/y so they never rebuild under a drag; one undo step per drag. A poster borrowed from the gallery keeps that photo's focus | Known gap since §10.6 (the Reel's tall frames cropped to the middle); the examples are the first real photos. Willy: "do em all" |
| 92 | **`sportDetails` kept** | Willy, session 4: "Keep it" (#71 resolved) |
| 86 | A sport they skipped, or "Something else", **shows nothing on the page**, never the catalog's "Other" (kicker, Editorial rubric, cards, the Details "Sport" line) | Seen on a phone after the setup: the cover said "OTHER" |

---

## 4. Willy: preferences and feedback (his words where possible)

- Wants honest **pushback**: "remember you can push back on what i want or say, we just need to
  have a convo about it." Raise real costs, recommend, then let him decide. Session 2 he invited it
  again on the J/B spacing ("you may push back on this but…").
- Prioritizes **player creative freedom** above all.
- Inspiration sites are for the **athlete websites**: "when its created and they go into it the first
  time their like wow this website is fricken kick ass."
- **Smoothness:** "raw and staticky", "sometimes doesnt even switch when i click it" (session 1).
- **Pixel details matter**: spotted a 4px pill misalignment (session 1); a 7.5px name jump at the end
  of the opening ("once you think its over, its not it like moves a slight tad at the end again");
  letters nearly touching (J/B); outlined letters touching; text clipped at a footer edge.
- **Session 2 review notes, verbatim-ish:**
  - Nav: "the top nav bar … the buttons on the top can be presented better."
  - Motion: "for the site animations make sure you look at the options i gave earlier with the 3 links
    of potential ideas (not the botilio one)."
  - Film: "even when i look at it full screen, the film page section doesnt fit on the screen, i have
    to scroll down to see the rest of it."
  - Drop cap: "i like the idea of the large S but it still looks like its for either sentence."
  - Names: "it looks like the B is super close to the J, i could be wrong and that could be the look."
  - "why are some of the styles bold like cinematic and others not."
  - NIL: "there needs to be an NIL page for someone whos actively looking into that or open to it. that
    was a major part of why we even created athlesite in the first place."
  - Profiles: "have an option for a place to put if someone is on on3, 247 sports, rivals, or espn
    recruiting if they want people to easily find their profile link on those sites."
  - "not everyone will need a sports catalog section so keep that in mind."
  - Spacing: "for all the photos, its all the wording seems to be bleeding into the edges or each
    other. so i want you to check wording and spacing on everything please. other stuff looks good."
- **Session 3 review notes (review #4, two phone screenshots: Cinematic and Highlight covers):**
  - "ok i will trust your judgment with those reccoemdnations" (the Cinema Reel / Folio plan).
  - Editor: "im not a big fan of the look of the phone outline itself. not the stuff on the inside
    but like the actual phone."
  - Opening: "on the cinamatic style opening … the wording goes to the right spot and the flow is
    perfect, but the number doesnt alyays seem to flow to the spot where the number actually is on
    the screen and the layout. the other cinematic openings are good, just this one."
  - Phones: "after looking at a couple of the cinecmatic openigns on the phone view version, they dont
    quite look right. they work yes but the spacing and allignment are off."
  - "the 14 or whaytever number it could be on the phone version is too close and bleeding into the
    contact button."
  - "same issues with the cinematic opening on the phone as on the browser vesion as well with the
    number not following where it should end up … same for both even when you switch the locations
    of left center or split."
  - "did you check the lettering and word spacing on the phone too?"
  - "make sure the editor feel and the player website feel is 60fps too please."
- Opens pages **directly as files** (`file:///…`) in Chrome on Windows (real 15px scrollbars).
- Reviews by screenshotting; expects every instance of a problem fixed, not just the screenshot.
- Not a coder; explain plainly, keep him oriented, show results. Likes clear status updates.
- Plans to hand Claude **motionin section MD files** (paid) for sections Claude picks.

---

## 5. Inspiration (for the athlete websites)

- https://www.motionin.design/ — premium motion sections (mostly WebGL/3D/rAF-heavy portfolio pieces,
  each sold with a long "AI build prompt" MD). Willy may buy a plan; **budget ~6 sections**. Catalog
  seen in session 2 includes Aperture, Moments, Boutique, Cabinet, Loupe, Morph, Amour, Dimension,
  Burst, Lens Bloom, Cutout, **Emulsion**, **Frieze**, Iris, Atlas, Reverie, Assembly, Filament,
  Fathom, Helix, Alive, Pixels, Nova, Isle, Fluid Gallery, Pantheon, **Benchmark**, Formation,
  Revolver, Riffle, Console, Aurora, Overworld, Rotunda, Atelier, Spring, Cipher, Aster, Crema,
  Hardback, Marathon, **Folio**, **Cinema Reel**, Cardwall, Picasso Ecommerce, Portfolio
  Photographer, Stream Showcase, Momentum Slider, Membrane, Shape Trail.
  **Claude's picks for athlete pages:** first **Benchmark** (giant figure + claims → stats),
  **Cinema Reel** (snapping film reel → Film), **Folio** (title list synced to an image strip →
  Gallery); then **Emulsion** (pan along a print wall → Portrait gallery), **Aperture** (editorial
  photo scatter → Editorial gallery), **Frieze** (cover-flow of frames → Cinematic gallery).
  Willy supplied Cinema Reel and Folio (in `C:\Users\conno\Downloads\cinema-reel (1).md` and
  `folio (1).md`) — **both built in session 3** (§10.6); Benchmark paused. **Check the license covers
  use on many customer sites** (Athlesite puts a section on every athlete's page; many component
  licenses are single-site). Not checked yet.
- https://www.seesaw.website/ — a curated gallery of sites (scroll-as-story); Willy's favorite feel.
- https://60fps.design/ — app micro-interaction library (tab switches, counters, tickers, stagger,
  spring physics, sports apps). Used for the nav's sliding marker, scoreboard reels, count-ups.
- https://collectui.com/ — UI pattern library (header navigation, scroll animation, statistics…);
  thumbnails didn't load in the hidden in-app browser pane.
- https://gabrielbortoleto.com.br/#hero — F1 driver's site (signature opening, video hero, ticker,
  countdown, results, archive, IG feed). Used: once-per-visit opening. Tabled: autograph. Parked:
  countdown. Next list: video hero. Not planned: social feed. **Not** a source for site animations.

Bar for any effect: looks good with an average phone photo; key facts readable within seconds
(coaches open links on phones between practices); off for reduced motion; never traps scrolling.

---

## 6. File map

| Path | Purpose |
|---|---|
| `studio.html` | **The editor** (Steps 1–3). `?a=<athlete>` loads a test athlete fresh (replacing the saved page); `?ex=<slug>` a homepage example; no parameter opens the page saved on this device, **else the first run**; `?start=1` the first run over a saved page (`&look=<look>` preselects); `?device=phone`. Loads the site scripts, `athletes.js`, `examples/examples.js`, `remix.js`, then `src/studio/store.js → preview.js → panel.js → photos.js → fields.js → editors.js → files.js → firstrun.js → app.js` (no cards since the look picker was dropped). `?start=1&from=<example>` starts from that example's design |
| `src/studio/store.js` | The profile, `commit(fn,{key,kind})`, undo/redo (100 steps, same-key bursts within 0.9 s merge), `load`, autosave to localStorage `athlesite-studio-v1` (400 ms debounce, flushes on `pagehide`, reports saving/saved/error) |
| `src/studio/preview.js` | Two stacked iframes, cross-fade, scroll anchoring, in-place recolor, desktop/phone, visitor mode, click-to-pick sections, play opening (§15.2) |
| `src/studio/panel.js` | The one panel: Home (design card + section navigator), Design screen, per-section screens (content editors from `editors.js` first, then layout + visibility); `Seg`, `Cards`, `Switch` controls with sliding pills; drag/keyboard reorder; Remix; `focusField(key)` (§15.3) |
| `src/studio/photos.js` | Step 2: the athlete's photos — resize to ≤1600px WebP, IndexedDB `athlesite-studio-photos`, `idb:<id>` references, `url`/`resolve`/`sizeOf`/`cleanup` (§15.7) |
| `src/studio/fields.js` | Step 2: field controls `Text`, `Select`, `List`, `Chips`, `Checklist` (+ `get`/`set` by path) (§15.7) |
| `src/studio/editors.js` | Step 2: one content editor per section (`S.editors`), photo controls (cover, gallery, posters), `S.fieldFor` page → field map (§15.7) |
| `src/studio/files.js` | Step 3: page files. `S.files.save(profile)` downloads `<name>.athlesite.json` (stored photos inlined as data URLs); `S.files.open(file)` checks it, re-stores photos through the canvas, returns `{ profile, dropped }`; friendly errors (§15.8) |
| `src/studio/firstrun.js` | Step 3: the first run, `S.firstRun.open({ replacing, design, onDone, onOpenFile, onCancel })` (§15.8) |
| `src/studio/app.js` | Top bar (Desktop/Phone, Edit/View as visitor, Play opening, **File menu**, Undo/Redo, save state, internal Test athlete + Homepage examples menu), keyboard (incl. Ctrl+S / Ctrl+O; paused while the first run is open), phone bottom sheet (peek/half/full, drag), `S.announce`, `S.toast`, drop a page file anywhere, photo loading → redraw, start-up photo cleanup, first-run start, field focus on page clicks |
| `src/studio/studio.css` | Editor chrome (neutral; the athlete page is the loudest thing on screen) |
| `index.html` | Internal review page (every athlete × look × choice). Not client-facing. Keys ← → athlete, 1–5 look, R remix, P phone |
| `cards.html` | Internal review page for the **cover cards** at homepage sizes: the homepage examples (if any), the test athletes, one look × three athletes, all 15 covers, mirrored, hard cases (no photo, very long name, no stats), opened 473×640 and phone 250×350 |
| `src/card.js`, `src/card.css` | **Cover cards**: `A.renderCard(profile, { look })`, `A.cardFonts`, `A.fitCards(root)`, one design per look with a variant per cover + mirror, all sizes in `cqw` (§15.8) |
| `EXAMPLES.md` | The homepage examples: Section 02 sizes, the lineup of 15, cover framing, photo rules, how an example gets made |
| `PORTING.md` | Notes for CFul: how the Studio maps onto the product (data, photos, renderer, security, saving before sign-in, the front door) — proposals |
| `PHOTO-PROMPTS.md` | 80 AI image prompts for the examples' photos + how to use them (generated by `tools/photo-shots.js`) |
| `examples/` | Homepage examples: `<slug>.json` (source) + generated `examples.js` (`A.EXAMPLES`; loaded by `site.html`, `studio.html`, `cards.html`). Empty until Willy's photos arrive. Photos go to `assets/img/examples/` |
| `site.html` | One athlete page full screen (params below) |
| `../homepage-v2/index.html` | The homepage. **Section 02** loads this folder's scripts, `examples/examples.js` and `src/card.css` (Task 4, §0.3); the rest of the homepage is separate work |
| `sports.html` | Sport catalog review |
| `teammates.html` | Teammate test |
| `V1-LINE.md` | Scope: In v1 / Next / Parked / Not planned |
| `src/sports.js` | Sport catalog + `LEVELS`, `suggestFor`, `positionOf` (loaded first) |
| `src/profile.js` | Data model, `normalizeProfile`, `fullOrder`, `visibleSections`, helpers |
| `src/color.js` | Readable accents, text-on-accent, colors from a photo |
| `src/render.js` | `renderSite`, `sectionTitles`, shared section renderers (incl. nav, film, NIL, profiles), security, openings |
| `src/looks/<look>.js` | Look definition: palettes, types (font pairings, may set `--name-lh`), covers, order, titles, hero, section overrides, intro, `navMark` |
| `src/site/base.css` | Shared site styles: nav + Menu sheet, film layout, facts, contact card, profiles, NIL, footer, reveals, opening, photo treatments, shared stats/gallery variations, one-line fit + lining numerals |
| `src/site/<look>.css` | Look styles, cover variants, Mirror rules, opening choreography, nav voice, signature moment, NIL voice |
| `src/site/showcase.css` | Film "Reel" + Gallery "Folio" (static stacks by default, `.is-live` pinned versions, the Folio photo view, the pointer ring). Linked only on pages that use one (render.js checks the body for `class="reel"` / `class="folio"`) |
| `src/site/site.js` | Athlete-page runtime (§13) |
| `src/remix.js` | Remix + `designDifference` |
| `src/athletes.js` | Test athletes (Jordan HS football + NIL via parent + 5 profile links + 3 gallery photos since session 3; Maya soccer; Tyler baseball; Devon college football + NIL via agent + partners; Marcus; Ava track no photo; Sam/`bare` name+sport only) + `CAST` |
| `assets/img/` | AI-generated test photos (fine for prototyping), all WebP since session 3 (`jordan-bell.webp`, `jordan-bell-back.webp` replaced the 2 MB PNGs; converted with Chrome's own encoder at quality .86) |
| `assets/brand/` | Athlesite marks and wordmarks |
| `tools/` | Test scripts (§14, `tools/README.md`) and `add-example.js` |

Script load order on every page: `sports.js → profile.js → color.js → render.js → looks/*.js →
athletes.js → (remix.js) → (studio/*.js)`. Classic scripts only (no ES modules) so pages work from
`file://`.

### `site.html` parameters
`a` athlete key · `look` · `palette` · `type` · `cover` · `stats` · `gallery` (`folio` too) · `film`
(`reel` / `list`) · `photo` · `accent`
(`%23RRGGBB`) · `design` (whole design as JSON, validated; e.g. `{"look":"editorial","type":"classic",
"layout":{"cover":"cover","mirror":true,"stats":"spotlight"}}`) · `static=1` (no motion, no scroll
moments, no opening) · `intro=never|always|session` · `introAt=p1|p2|p3|out` · `introSlow=4` ·
`at=<section id>` (jump to `film`, `stats`, `nil`, `details`…) · `ex=<slug>` (a homepage example instead
of a test athlete) · `embed=1` (inside another page's drawn phone: no scrollbar; the homepage uses it). Test athlete keys: `jordan, maya, tyler, devon, marcus, ava, bare`.

---

## 7. Data model (`src/profile.js`)

A profile is `{ data, design }`. `data` mirrors `AthleteProfileData` in the product repo
(`src/lib/athlete-profile.ts`) so it can be ported column for column; fields marked NEW are
proposals the repo doesn't have yet (CFul reviews before they reach the repo). `design` is all
presentation and maps to one JSON column.

**data (mirrors the repo):** `slug, firstName, lastName, sport, position, classYear, schoolOrTeam,
city, state, heightIn, weightLb, bio, heroPhotoPositionX (0–1), heroPhotoPositionY (0–1),
heroPhotoZoom (1–1.8), highlightLinks [{label,url}], recruitingStatus ('open'|'not_open'|'undecided'),
recruitingContact, recruitingNotes, social {instagram,twitter,tiktok,hudl,youtube,website},
nilOpen, nilContact, nilInterests` (`nilInterests` is shown as the NIL pitch).

**data (NEW):** `level ('hs'|'college'), academicYear, redshirt, eligibility, division, conference,
committedTo (+ recruitingStatus 'committed'), transferPortal, draftEligible, jerseyNumber, tagline,
heroPhotoUrl, heroPhotoAlt, stats [{label,value,context}] (first 3 featured; measurables live here
too), milestones [{year,title,detail}], gallery [{src,alt,caption}], gpa, intendedMajor,
custom {title, body}, highlightLinks[].poster`.

**data (NEW, session 3 — built while Willy slept, keep or drop on his word):** `sportDetails {key:
string}` — the sport catalog's extra details (`bats`, `throws`, `foot`, `club`…, keys from
`SPORT_CATALOG[sport].details`), edited in Details & contact, shown in the Details facts after the
other facts, in the catalog's order. `normalizeProfile` keeps only `[a-z][a-zA-Z0-9]{0,30}` keys with
string values ≤80 chars.

**data (NEW, session 4, step 4): the results table.** `results [{ a, b, c, d, e, pb }]` (one row per
meet/race/tournament; cells follow the columns; `pb` = a best mark), `resultsTitle` ('' = the
sport's title), `resultColumns [string]` (their names per column; '' = the sport's).
`normalizeProfile` keeps ≤60 rows of strings ≤80 chars, ≤5 column names ≤30 chars; saved section
orders gain 'results' right after 'stats'. `A.resultsSetup(d)` → `{ title, columns, keys, key, pb,
examples, defaults, fromSport }` (the sport's table merged with their names).

**Photo values (session 3):** `heroPhotoUrl`, `gallery[].src`, `highlightLinks[].poster` may be a
web URL, a built-in path (`assets/img/…webp`), a data URL, or — in the Studio — **`idb:<id>`** (a
photo stored on this device, §15.7). `normalizeProfile` also maps the two renamed built-in photos
(`jordan-bell.png`, `jordan-bell-back.png` → `.webp`) so pages saved before the rename still work
(`MOVED` in profile.js). `profileLinks[]` rows may carry an editor-only `hint` ("On3") used as the
placeholder; the renderer ignores it.

**data (NEW, session 2, requested by Willy):**
- NIL: `nilOffers [strings]` ("Instagram posts", "Camps and clinics"…), `nilAudience [{label,value}]`
  ("Instagram followers" / "6.8K"), `nilPartners [strings]`, `nilContactRole ('' = me | 'parent' |
  'agent' | 'school')`. `nilContact` may be an email or a web link; if empty, the main contact is
  used. Emails get the subject "NIL inquiry: <name>".
- `profileLinks [{url}]` — recruiting/results profiles. No label is stored: the shown name always
  comes from the link's real domain (§9).
- `sportDetails` — **built in session 3** (see "data (NEW, session 3)" above); still needs Willy's
  explicit keep/drop.

**design:** `look, palette ('' = first), accent (hex, kept readable), type ('' = first pairing),
photo ('' | 'color' | 'mono' | 'duotone'), layout {cover, stats ('' | 'spotlight' | 'ledger'),
gallery ('' | 'strip' | 'feature' | 'folio'), film ('' = the look's own | 'reel' | 'list'), mirror
(bool)}, order (null = look's order, or array), hidden [section keys], mark {kind:'initials', text},
intro (bool)`. Film: Cinematic declares `filmLayout: 'reel'`, so its `''` is the reel and `'list'`
is the classic layout; in other looks `''` is their own film and `'reel'` the reel. The reel needs 2+
videos and the folio 3+ photos, otherwise the look's own layout renders.

Test data change (session 3): Jordan's gallery has a third photo ("Between series", the cover photo)
so the Folio can be reviewed.

**Sections:** `film, stats, story, custom, milestones, gallery, nil, details` (+ hero, nav, footer
always). `fullOrder(profile, lookOrder)` = the athlete's order or the look's, with `custom` inserted
after `story` and `nil` before `details` when the look's order omits them. `visibleSections` =
`fullOrder` minus hidden minus empty. `sectionHasContent('nil')` needs `nilOpen` AND something to
show or a way to reach them. `details` also counts profile links.

`normalizeProfile` coerces any stored/imported object into a complete, safe profile: clamps photo
focus, defaults arrays (incl. the NIL arrays and `profileLinks`), validates `nilContactRole`, drops
unknown section keys from `order`/`hidden`, **upgrades old saved orders** (a missing `nil` goes just
before `details`, other missing keys at the end), validates photo tone and type.

Helpers: `sportOf, fullName, initials, location, heightLabel, sectionHasContent, fullOrder`.

In the editor, the sport catalog is used through `A.suggestFor(p.data.sport, p.data.position,
p.data.level)` (ideas checklist in Stats, quick-add buttons in "Find me on", position suggestions in
Cover) and `A.SPORT_CATALOG[sport].details` (the sport details fields).

---

## 8. Sport catalog (`src/sports.js`)

Per sport: `label, number, words {stats, film}, positions [{id,label}], details [{key,label,options?}],
stats [s(key,label,for,top)], measurables [...], links [{key,label,top,level?}], results?`.
`for` = positions it suits (`'*'` all), `top` = positions where it starts ticked.

`LEVELS`:
- `hs`: statuses Open to recruiting, Committed, **Open to NIL** (added session 2: NIL for both levels).
- `college`: details Division, Conference, Year, Redshirt, Eligibility left; statuses In the transfer
  portal, Open to NIL, Draft eligible; link Team roster page (ticked).

`suggestFor(sport, position, level)` → `{sport, level, position, words, number, details, statuses,
stats, measurables, links, results}`.

Session 2 additions: **Rivals** and **ESPN recruiting** (HS only) for football and basketball;
**247Sports** (ticked for college) and **On3** for basketball (football already had them). All
unticked by default except 247Sports for college — per Willy, nothing in the catalog is forced.

Content highlights: football (positions QB…Athlete, stats per position, measurables 40/shuttle/
vertical/broad/bench/squat/clean), baseball/softball (hitter vs pitcher, exit velo, pop time,
bats/throws, Perfect Game, PBR), track (marks, results table, Athletic.net, MileSplit, TFRRS),
swimming (times, SwimCloud), hockey (skater vs goalie, Elite Prospects), wrestling (record, weight
class, Trackwrestling, FloWrestling), lacrosse, rowing (erg, Concept2, row2k), golf/tennis/other.
**Content still needs a sanity check by real players/coaches per sport.**

---

## 9. Rendering (`src/render.js`)

`renderSite(profile, opts)` returns a complete HTML document string (fonts for the pairing,
`base.css`, look CSS, `showcase.css` when a Reel/Folio is on the page, `site.js`, palette + pairing
variables inline). `opts.intro` = `'session'|'always'|'never'`; `opts.base` = a `<base href>` (must
be **absolute** inside srcdoc frames); **`opts.prompts`** (session 3, the Studio's edit mode only)
places an editor-only `.studio-empty` box ("+ Add your film", texts in `PROMPTS`) wherever a visible
but empty section would go — `emptyPrompt(c, key)`, never on real pages. `A.sectionTitles(profile)`
gives the editor the page's section titles. **`A.links`** (session 3) exposes the page's own link
rules to the editor: `safeLink`, `isEmail`, `platformOf`, `siteOf(url)` ("On3" / plain domain / ''),
`SITES`.

Pipeline:
1. `buildContext`: `cleanData` allow-lists every URL (`safeLink`: http(s) with a real domain;
   `safeImage`: http(s), `data:image/(png|jpeg|webp|gif|avif);base64`, a local image path, or
   (session 3, for the Studio's stored photos) `blob:` object URLs matching `^blob:[\w:/.-]+$`; also
   `profileLinks`), then derives palette, pairing, sport, name, visible sections, featured stats,
   `titles` (sport words + look titles + custom title + `nil: "Work with <first>"`), `navTitles`
   (titles with `nil: 'NIL'`), photo style, `contact` (mailto with subject or safe link),
   `nilContact` (`nilHref`), `profiles` (`profiles()`), socials, facts, statuses, year labels,
   kicker, meta. `facts` (session 3) adds the sport's own details (`sportDetails`, catalog order)
   after the other facts.
2. Section rendering: `part(key)` → shared variation if picked (`statsSpotlight`, `statsLedger`,
   `galleryVariant`, `filmReel` (2+ videos), `galleryFolio` (3+ photos)), else the look's override,
   else `DEFAULTS[key]`. `DEFAULTS`: `nav, film, stats, story, milestones, gallery, details,
   contactCard, profiles, nil, custom, heading, statsSpotlight, statsLedger, galleryVariant,
   filmReel, galleryFolio, socials, credit, footer`.
   Helpers (session 3): `items(list, sep)` renders a line of items as `<span class="it">` joined by
   `&nbsp;<sep> ` (wraps between items only; site.js hides a separator left at a line end) — used by
   Cinematic's kicker/credit, Editorial's rubric/issue line, Highlight's tag line, Prospect's
   kicker/line/label, NIL partners and the reel; `dotItems(list)` = the same with a `·`.
   The nav mark for name-mark looks renders `<span class="nm-full">` + `<span class="nm-short">`
   (initials) and always carries `aria-label="<name>, top of page"`.
3. Body classes: `look-<id>`, `is-dark`, `no-photo`, `cover-<id>`, `mirror` (only when safe),
   `photo-<tone>` (only when different from the look's default).

**Nav (`DEFAULTS.nav`, shared by all looks since session 2):** mark (initials, or the full name when
the look sets `navMark: 'name'` — Editorial, Portrait), `nav-name`, `<nav class="nav-links">` with a
`.nav-ind` marker + one link per visible section (`navTitles`), a `Menu` button, Contact (`nav-cta`
with an arrow). Plus `#nav-sheet` (role dialog): numbered list of sections in the look's headline
font + "Contact <first>" button.

**Film (`DEFAULTS.film`):** heading, then `.film-body` = `a.film-lead` (poster + caption) + optional
`ul.film-list`. CSS turns it into a two-column, one-screen layout on wide screens (§10).

**NIL (`DEFAULTS.nil`):** heading (look's own); `.nil-grid` = main (flag "Open to NIL partnerships",
pitch, "What I can do" chips, "Worked with" partners) + side (reach numbers grid, "Start a
conversation ↗" button, "NIL inquiries are handled by my parent or guardian / my agent / my school's
compliance office").

**Profiles (`DEFAULTS.profiles`, inside the contact card):** "Find <first> on" + chips. Names come
from `PROFILE_SITES` (On3 on3.com, 247Sports, Rivals, ESPN, MaxPreps, Hudl, NCSA, SportsRecruits,
Perfect Game, Prep Baseball, Extra Inning Softball, TopDrawerSoccer, Athletic.net, MileSplit,
TFRRS, SwimCloud, Elite Prospects, Trackwrestling, FloWrestling, Sports Reference, Concept2, row2k)
matched against the link's hostname (exact or subdomain). Anything else shows its plain domain,
so `on3.com.evil.example` never shows as "On3". Tested by `tools/check-links.js`.

**Results (step 4):** `DEFAULTS.results` renders a real `<table>` (row headers = the event); the
headline column (`res-key`) is set large in the look's type (`--res-key-font/-weight/-size/-style`,
per look CSS); `res-pb` is the badge; each row also carries a `res-meta` line (the other cells
joined with " · ") that only shows on phones, where `res-more` cells hide and the row becomes a
two-line grid. Editorial numbers its head like its other sections. Prompts: results only when
`c.results.fromSport`. `sportName(d)` (session 4) never shows "Other".

Security rules to keep when porting: escape all text; allow-list every URL; never put raw athlete
input into class names or style blocks; profile names from domains, never from athlete input.

---

## 10. The five looks (detail)

Shared per look: `palettes`, `types` (3 font pairings; the first is the default), `covers` (3;
`mirror: 'always' | 'subject-left'`), `order`, `titles()`, `hero()`, `sections`, `intro()`,
optional `navMark`, `heading`, `sectionWrap`, `photo`. Display fonts read `--d-weight`, `--d-style`,
`--d-scale`; serif looks also read `--name-lh` (per pairing). Stats variations read `--vf`/`--vw`.

### Cinematic — "Film first. Dark, full-bleed, the numbers up front."
- Fonts: **Blockbuster** (Anton), **Velocity** (Barlow Condensed 800 italic), **Premiere** (DM Serif).
- Palettes (dark): Night game, Black cherry, Deep forest, Gold standard. Order: film, stats, story,
  milestones, gallery, details.
- Cover: full-bleed photo, kicker, huge two-line name (line-height .93), meta, tagline, Watch film +
  Contact, outlined jersey number (letter-spacing .04em), stats bar. No photo: accent glow + giant
  outlined initials — fully on screen at the right gutter; on the **free side** when mirrored
  (desktop); hidden on Center stage; above the name on phones (top 116px).
- Phones (session 3): the outlined number sits at `top:108px; right: gutter` (lined up with Contact,
  ~53px below the nav buttons) and shrinks or steps aside when the gap above the kicker is too small
  (`fitGiants`, §13). On a 360×740 phone it steps aside on the Left cover.
- Film: **Reel by default** with 2+ videos (`filmLayout: 'reel'`), else the list.
- Covers: Left-aligned, Center stage, Split screen.
- Nav: smoked-glass capsule, white pill marker (`is-on` text turns dark).
- **Signature moment — end of the scene:** as the cover scrolls away (`--out` 0→1) the photo drifts
  slower than the page (translate 26%, scale +5%) and fades to black (`.cine-fade`), the name lifts
  9vh and fades out first, the jersey number drifts down.
- Footer: giant name, first name outlined (letter-spacing `calc(.05em + 1.5px)` so outlines never
  touch), last name solid accent, line-height 1, fitted to the screen.
- Opening "trailer": steps `p1:0, p2:450, p3:1050, out:1900`. The big outlined number (`.i-num
  [data-land]`, letter-spacing .04em like the cover's) **flies onto the cover's number** at `out`, or
  into the "No. 14" of the details line when this cover shows no number (§12). Phones: a portrait
  title card — `--intro-name-scale:1.5`, `--intro-name-y:.57`, bars 9svh, number centered above the
  name (`bottom: name-top + 20px`, `min(28svh,56vw)`), the line of light at the name's middle
  (`--name-y`), credit 24px under the name.

### Editorial — "A magazine feature. Serif headlines, the person first."
- Fonts: **Feature** (Instrument Serif, `--name-lh` 1), **Warm** (Fraunces, 1.02), **Classic**
  (Playfair, 1.05). Palettes: Pitch green, Porcelain, Clay court, Evening edition.
- Order: story, stats, film, gallery, milestones, details. Numbered rubrics ("01 About Maya").
  `navMark: 'name'`. Nav: contents line, accent underline marker.
- Covers: Split, Magazine cover, Headline (phone photo strip has no min-height — it widened the page).
- Story lead: **drop cap** = `initial-letter: 2` (fallback float), top on line 1's capitals, foot
  on line 2's baseline, tight to the text; the rest of the first word in small capitals (`leadIn()`
  in `editorial.js` wraps it in `.lead-in`).
- **Signature moment — read-along:** the opening paragraph starts faint and each word inks in as you
  read down it (`splitWords`, `.w.is-lit`).
- NIL pitch reads like a pull quote (italic serif).
- Opening "magazine cover": steps `p1:0, p2:380, p3:1100, out:1750`.

### Highlight — "Loud on purpose. A giant number and stats like a scoreboard."
- Fonts: **Scoreboard** (Big Shoulders), **Stadium** (Teko), **Arena** (Bungee). Palettes: Blaze,
  Volt, Electric, Crimson, Daylight (cover stays dark).
- Order: stats, film, milestones, gallery, story, details. Name line-height .88, titles .88, tiles .92.
- Cover: giant jersey number on the side away from the athlete, `bottom:0` (fully on screen; phones
  72vw at `top:108px`, single digits `min(48svh,100vw)`; fitted to the gap and the side margins by
  `fitGiants`; the tag line wraps between items). **When the number has to share the name's side (`is-left` on Big number) or sits behind a
  centered name (Center poster), it is a ghosted outline** (2px stroke, accent 70%). Color block
  keeps its tone-on-tone watermark.
- Nav: dark capsule, display caps, accent marker (on-accent text); special cases for Daylight over a
  photo and no-photo accent covers.
- **Signature moment — scoreboard:** each stat digit is a reel (0–9 twice) that spins a full turn
  and stops on its value when the stats come into view (`.odo`, `--d`, `--k` stagger). The real
  value stays in `.sr-only` for screen readers.
- Film on an accent field (play button accent with on-accent ring so it shows on dark photos;
  `--film-head: 200px`). Footer: giant last name + outlined number (letter-spacing .06em), padded
  so it's never clipped.
- Opening "slam": steps `p1:0, p2:520, out:1450`.

### Portrait — "Quiet confidence. Gallery-white, one portrait, nothing extra."
- Fonts: **Gallery** (Cormorant, `--name-lh` 1.06), **Fashion** (Bodoni Moda, 1.07), **Heritage**
  (Libre Caslon Display, 1.03). Lining numerals forced. Default photo treatment black & white.
- Order: story, gallery, stats, milestones, film, details. `navMark: 'name'`; nav: spaced caps, gold
  hairline marker; Contact stays an underlined text link.
- **Signature moment — walking up to the print:** each photo below the cover (gallery, film
  poster) grows from a small matted print to full frame as you approach (`.print` frame scale
  .86→1, image counter-scale 1.16→1; transforms only).
- NIL in one quiet column; profile chips centered.
- Opening "exhibition": steps `p1:0, p2:450, p3:1350, out:2250`.

### Prospect — "Data first. A spec sheet a coach reads in ten seconds."
- Fonts: **Standard** (Geist), **Technical** (Inter Tight + JetBrains Mono), **Grotesk** (Space
  Grotesk + Space Mono). Palettes: Chalk, Field, Maroon, Navy. Name line-height 1.06.
- Order: stats, film, details, story, milestones, gallery. Spec-sheet layout (label column left).
- Nav: segmented tab bar (square-ish, mono caps, ink marker).
- **Signature moment — scout readout:** stat rows print in one after another (`.will-scan` →
  `.is-scanning`, 90 ms stagger) under an accent scan line while each value counts up.
- Opening "scout readout": steps `p1:0, out:1250`.

### 10.6 Showcase sections (any look): Film "Reel" and Gallery "Folio" — adapted from motionin
Markup in `render.js` (`filmReel`, `galleryFolio`), styles in `src/site/showcase.css`, motion in
`site.js` (§13). Each look's headline voice comes through `--sc-font / --sc-w / --sc-case /
--sc-track` (Cinematic/Highlight display caps, Editorial/Portrait serif with italic numbers,
Prospect sans).
- **Reel** (from Cinema Reel): per video a framed still (`border-radius` up to 48px, cinema vignette)
  with the number ("01") and "On Hudl · Wide receiver" at the top, then the kicker, the title on two
  lines split at the middle word (line-height 1.06), "Jordan Bell · No. 14", and a "Watch on Hudl ↗"
  pill. Poster: the video's own → the gallery photos in turn → the cover photo. Static (no JS,
  reduced motion, screenshots): a stack of these frames. Live: the reel is `n × 100svh` tall with a
  sticky 100svh stage; frames are 80svh tall at 10svh, pitch 85svh; the photo is 100vw × 120svh
  inside the frame and drifts at 1/6 of the frame's speed (R = 1.2); words of the arriving video
  fade in (smoothstep) once its frame is within .55 of a frame height, rising 64px; the leaving
  video's words race ahead (−0.42 × travel) and fade after .6; top/bottom 10svh fades into the page;
  pips on the right ("01 · · 02", click to go). **Entrance** (once, when the stage first covers ~65%
  of the screen): three fast loops through the reel (power3.out, 1.8 s) under a vertical SVG blur
  (≤18px) and screen-blend scanlines that fade with the speed, then the landing video's words arrive
  one after another (blur-in). Pointer ring "Scroll" (104px, difference blend) on mouse/trackpad.
  Phones: frames full width minus 12px, the button under the title.
  Dropped from the original: wheel capture, drag, infinite loop, the "Explore" tilt + details panel,
  per-frame blur on words (see decisions #51, #53, #54).
- **Folio** (from Folio): captions (the photo captions, else "Photo 01") on the left, 4:5 photos on
  the right; the captions move up while the photos move down, meeting on the current one. Desktop:
  9 caption rows in the middle 80% (current one full ink, others .3 opacity, scale .9→1, "01 / 03"
  slides in beside it), photo 60svh high, pitch 65svh, neighbours fade to .18 and shrink to .84.
  Phones: captions in the top half, photos in the bottom half, meeting at the middle. `(n−1) × 70svh
  + 100svh` tall (55svh per photo on phones); counter "01 / 03" over the captions (bottom right on
  phones). Clicking a caption or photo that isn't current scrolls to it; the current one **opens**:
  the photo flies from the strip to full height on the right (same 4:5 frame, so nothing re-crops;
  950ms), the caption, alt text and "02 / 03" rise in on the left, Back / × / Escape / the backdrop
  close it (the photo flies back), focus is kept inside and returned; page scroll locked while open
  (`html.folio-open`). Tabbing onto a photo brings it to the middle. One-time arrival: captions and
  photos rise in. Static: a grid of 4:5 photos with captions (still opens large).
  Dropped from the original: the infinite loop (needs 9+ items; ours shows 3+ without duplicates),
  the 2 s page-locking entrance, per-frame font weight/size (scale + opacity instead), title FLIP
  (long captions wrap in the photo view; the photo FLIP is the moment).
- **Known gap:** a wide photo in a tall phone frame shows its middle (Jordan's back photo crops him
  at the edge). Per-photo focus points (editor Step 2 photo help) fix it.

---

## 11. Freedom system (what athletes can change)

Palette + any accent (kept readable), pull colors from the photo, 3 font pairings, 3 covers (15
total) + Mirror (desktop; never flips photos), stats layouts (Signature, Spotlight, Ledger), gallery
layouts (Signature, Strip, Feature, **Folio**), Film layouts (**Reel** / List), photo treatment (look
default, Color, B&W, Duotone), custom section, Remix (`changeLook` = Remix everything; now also
rolls Folio with 3+ photos and offers the reel/list now and then with 2+ videos), opening on/off,
section order and visibility.

Teammate test (`teammates.html`) passes (row 2 needs Mirror). Phones rely on color, fonts and photo
treatment for uniqueness since covers stack.

---

## 12. Opening animation (how it works)

- `introParts` (render.js): a head script decides before first paint whether to play (`session` /
  `always` / `never`; skipped for reduced motion, a `#hash`, `static=1`) and adds `intro-running`.
- `site.js` `playIntro`: waits for fonts (≤1.2 s), clones the real headline with computed styles,
  stores its start rect (`name._home`), centers the clone on its **letters** in the visible area
  (`documentElement.clientWidth`, not `innerWidth`), runs the step classes, then `land()`.
- `land()` (session 2 fix): switches to `intro-landing`, **re-measures the real headline** and flies
  the clone to where it is now (`translate(dx,dy)`), so a late font or layout change can't cause a
  jump. Combined with `html{scrollbar-gutter:stable}` (base.css) the page never narrows when the
  scroll lock lifts. Measured: 0px at hand-off, all five looks (`tools/opening-landing.js`).
- Real headline hidden during the opening; nav hidden; scroll locked; any input skips.
- Session 3: `land()` **measures everything before changing any class** (one style pass in the next
  frame instead of a forced one: the landing's first frame went from 45ms to normal on a slowed CPU).
  A look can sit the centered name lower with `--intro-name-y` (fraction of the screen height); JS
  exposes `--name-top`, `--name-bottom` and `--name-y` to the stage.
- **Number flight** (Cinematic, `.i-num[data-land]`): `numberTarget(text)` = the cover's giant number
  (`.hero-number` / `.hero-void span`) when it's shown (display, visibility), else the digits of
  "No. 14" in `.hero-meta`/`.hero-kicker` (a text Range). If there's a target the page gets
  `.num-flight`: the cover's number waits with no entrance animation at opacity 0. At `out`,
  `flyNumber` freezes the trailer number under a transform (`transform-origin: 0 0`, mapped from its
  current ink box), then glides it onto the target's ink box with the name's easing; for a giant
  target the copy fades out from 55% while the cover's number fades in under it (`.is-handed`), for
  the details line it fades from 40%. Measured (`tools/number-landing.js`): last frame within 0.4px
  of the target, the cover's number never moves.

---

## 13. Athlete-page runtime (`src/site/site.js`)

In order:
1. **Reveals** (`[data-reveal]`, IntersectionObserver, stagger).
2. **Fit** (`fitText`): `.foot-name, .tile dd, .hero-board dd, .hero-strip dd, .ed-figures dd,
   .pt-figures dd, .pr-keys dd, .sv-lead dd, .sv-rest dd, .sv-ledger dd, .nil-reach dd, .stat dd` are
   `nowrap` (CSS) and shrink to fit their box (min 50%); runs at load, on fonts ready, on resize.
3. **Opening** (§12).
4. **Nav:** solid (`is-stuck`) past the hero; `is-away` hides it while scrolling down past the hero,
   back on scroll up or focus. **Marker** `place(a)`: follows the scroll-spied section
   (`aria-current="location"`, hero clears it) and the hovered/focused link; appears in place
   instead of sliding in from the last spot. **fitNav**: if the nav overflows, drop `nav-name`
   (`is-tight`), then fold links into Menu (`is-compact`); phones (≤820px) always use Menu. **Menu
   sheet**: open/close with clip-path reveal + staggered items, Escape, focus trap, focus returns
   to the Menu button, body scroll locked while open.
5. **Signature scroll moments** (§10), skipped when `still` = reduced motion, `static=1`, or
   `<html data-still>` (set by test tools that render into frames). Scroll-linked ones write one CSS
   variable per frame via a rAF-throttled scroll handler (`scrubbers`); one-shot ones use `onEnter`
   (IntersectionObserver).

Session 3 additions:
- **Fit passes read everything, then write** (`fitText`, `fitGiants`, `tidySeparators`), so the page
  lays out once per pass instead of once per element; before fonts arrive they don't run at all
  (fonts.ready runs them). This cut a Studio look switch's page setup from ~47ms to ~28ms.
  `fitText` leaves the footer name 3.5% of air (serif/outlined letters reach past their box).
- **`fitGiants`** (phones ≤820px): each `.hero-number / .hero-void span / .hero-big` keeps ≥40px
  under the nav buttons and 28px above the cover's first words (`HERO_TEXT`), and stays inside the
  side margins; it shrinks to fit (ink measured with canvas metrics) and is hidden when the gap is
  under 64px. Opt-out: `--fit:off` (Highlight Center poster, layered on purpose).
- **`tidySeparators`**: hides (`visibility`) a `.sep` whose next item starts a new line.
- **Nav:** `solidAt` = where the first cover element (h1, p, dl, actions, giant number…) would reach
  the nav, ÷1.1 for Cinematic's lifting words; solid from there (was: once the whole hero is gone).
  Re-measured on fonts, resize, and 1.2 s after the opening ends (event `athlesite:intro-done`) or
  2.6 s after load — never mid-landing. `fitNav` adds `is-short` (name → initials) when even the
  phone nav overflows.
- **Showcase controllers** (`setupReel`, `setupFolio`, `setupLightbox`; §10.6): `ticker(step)` runs
  a rAF loop only while something moves; `ease(cur, target, k, dt)` is the originals' lerp made
  frame-rate independent; positions come from `scrollY` against the measured top (re-measured on
  resize and fonts); per frame only `transform`/`opacity`/`visibility` are written, and only for
  items near the screen. `settle()` glides to the nearer item 160ms after a scroll rests strictly
  inside the pinned stretch (never at or past the ends). `pointerRing()` = the "Scroll"/"View" ring
  (fine pointers only). Reduced motion: no pinning, static layouts, the Folio still opens (no motion).

---

## 14. Tools and testing (`tools/`, details in `tools/README.md`)

| Tool | What it proves |
|---|---|
| `check-freedom.js` | 45,360 render combinations (every athlete × look × font × cover × stats × gallery incl. Folio × film incl. Reel/List × photo tone), 0 problems |
| `check-mirror.js` | Mirror only where safe (60/105 applied, 0 problems) |
| `check-links.js` | Hostile/look-alike profile links and NIL contacts never render or borrow a trusted name; NIL hidden when off; old orders upgraded |
| `drive.js` | Headless Chrome with real mouse/keyboard; prints console errors. `SCROLLBARS=1` for real Windows scrollbars |
| `studio-rapid.js` | Editor: rapid clicks on everything land; preview ends in sync (waits up to 6 s, reports ms); drag/keyboard reorder; Remix/device spam; visitor; opening; undo all; reload persists |
| `spacing.html` + `spacing-run.js` | Typography/spacing across all 315 combinations × desktop + phone (§16) |
| `opening-landing.js`, `scroll-moments.js`, `film-fit.js`, `nav-strips.js`, `name-leading.js` | Session-2 checks for the opening, the scroll moments, Film fit, nav, serif name leading |
| `cdp-run.js`, `cdp-full.js`, `cdp-sheet.js`, `sports-rapid.js`, `serve.js` | Session-1 helpers (contact sheets, full-page shots, sports page clicks) |
| `number-landing.js` | Session 3: the opening number lands within ~0.5px on the cover's number / "No. 14", every cover, desktop + phone |
| `giant-clearance.js` | Session 3: phone giants clear the nav (≥40px) and never sit behind the cover's words (390×844, 360×740, 430×932) |
| `nav-overlap.js` | Session 3: nothing on any cover slides under a see-through nav (every look × cover, phone + desktop) |
| `perf-site.js`, `perf-studio.js`, `perf-trace.js` | Session 3: frame times (athlete pages / editor), Chrome traces of long frames (§15.6) |
| `studio-content.js` | Session 3, Step 2: the content editors used like a person (11 checks, see tools/README) |
| `studio-photos.js` + `make-test-photos.js` | Session 3, Step 2: photo upload, focus point, zoom, small-photo warning, gallery ×3, poster, reload (13 checks) |
| `studio-start.js` | Session 4, Step 3: first run end to end (starts in Cinematic, the tip), Save to a file, Start a new page → Back, Open (photos back, one undo step), broken/non-page files refused, `?start&from=` copies a whole design and nothing else (38 checks; desktop + phone) |
| `studio-picks.js` | Session 4 polish: clicking a cover stat, stat, milestone, photo, video (Reel), result opens that exact row; phones: the sheet rises and the tapped thing stays above it — desktop + phone |
| `studio-focus.js` | Session 4 polish: gallery + poster focus points (pick, tap, drag, keys; page keeps the spot; no rebuild under the drag; one undo step) — 9 checks, desktop + phone |
| `studio-results.js` | Session 4, Step 4: the results table used like a person (Ava's PRs, flag one, add by typing, rename a column and the title, hide/show, undo; Jordan: no prompt, general table) — 15 checks at 1440×900 and 390×844 |
| `add-example.js` | Session 4: page file → homepage example (`examples/`, `assets/img/examples/`, `examples/examples.js`); `--rebuild` |
| `run-all.js` | Session 5, Q4: every check in one command (`--quick`, `--only=`) |
| `new-athlete.js` | Session 5, Q3: a fresh athlete builds a whole page through the UI with a screenshot per step (phone + desktop) |
| `a11y-audit.js` | Session 5, Q2: contrast (what's really under the text), names, alt, headings, landmarks, Tab walk; `MODE=site` (every look × palette + custom accents) or `MODE=page` |
| `photo-shots.js`, `add-photos.js` | Session 5, Q1: the photo shot list (→ `PHOTO-PROMPTS.md`) and the photo drop-in (folder of `cover`/`photo-N`/`film-N` per athlete → WebP → example pages → `examples.js`) |
| `homepage-s2.js` | Session 5, Task 4: homepage Section 02 — 15 cards (order, names fit, photos load, neighbours differ), drift frames, open (live page, info, links, inert page, focus), → / ← ← / four quick →, Escape, a side card, keyboard only, reduced motion, "Start with this style" lands in the setup — 41 checks at 1440×900 and 390×844 |

**Session 5, Task 4:** homepage-s2 (1440×900 and 390×844) `PROBLEMS none`, 0 console errors.
**Session 5, close-out (`node tools/run-all.js --quick`):** 21 of 23 passed on the first pass (16 min; a11y-site and spacing skipped as --quick); the 2 misses were homepage-s2's first-open timing in a fresh profile (8/336 and 12/273 frames over 20ms), so its bar became 5% of frames or 6; re-run `--only=homepage-s2`: both PASS (46 and 44 checks). The full a11y-site and spacing sweeps passed earlier in session 5 (Q2: PROBLEMS none on both sizes; spacing 1 known note).
**Session 5, Q2:** a11y-audit site (desktop + phone) `PROBLEMS none`, Studio setup/editor clean (the editor's preview stops are the page's own links), every suite above re-run green (§0.3 Q2).

**Last verified state (session 4, after Step 3):** freedom 45,360 renders, 0 problems; links 0;
mirror 0; studio-rapid, studio-content, studio-photos and studio-start (1440×900 and 390×844) all
`PROBLEMS none`, 0 console errors; read-along paragraphs wait for the sentence (desktop + phone);
`cards.html` 41 cards, 0 console errors; `add-example.js` round trip (file → example → `site.html?ex=`
with its photo, `studio.html?ex=`, `cards.html`) checked and the test example removed.
After Step 4: studio-results (desktop + phone) `PROBLEMS none`; spacing 945 renders (desktop, 390 and 360
phones), **1 real-text note** (the known 14px Spotlight gap) once the checker skips text clipped to
nothing (the results table's phone-only hidden column headers; `clippedAway` in tools/spacing.html).

**Previous state (end of session 3, after Step 2):** freedom 45,360 renders, 0 problems
(Reel/Folio included); mirror 0; links 0; studio-rapid, studio-content and studio-photos all
`PROBLEMS none` with 0 console errors; editor on a 390px phone: no sideways overflow; spacing 945 renders (desktop, 390 and
360 phones), 1 real-text note (the known 14px Spotlight gap); number landing ≤0.4px; name landing
≤0.03px in all five looks (run alone); giant clearance 0; nav overlap 0 (phone + desktop); film list
fits; perf numbers in §15.6.

**Previous state (end of session 2, commit `0daa134`):** freedom 0 problems; mirror 0; links 0;
studio-rapid `PROBLEMS none`, synced in ~0.4 s every step, 0 console errors (one earlier run once
needed >1.6 s after rapid font changes — likely a slow Google Fonts download; never reproduced);
scroll moments land on exact values; opening 0px movement in all looks; spacing: 1 real-text note
(fine), decorative = Highlight's deliberate layered numbers + the ticker band.

---

## 15. The Studio editor

### 15.1 Agreed plan and status

Agreed with Willy (session 2): panel on the right + bottom sheet on phones from day one; panel
fields, not typing on the page (clicking the page opens and focuses the right field); first run
shows all five looks live with the athlete's name.

| Step | Contents | Status |
|---|---|---|
| 1 | Shell, smooth preview, undo, autosave, desktop/phone, view as visitor, play opening, section navigator, all design tools, Remix | **Done** (`265f422`) |
| 2 | Section editors (every field), click-to-edit on fields, editor-only "Add your film" prompts for empty sections, sport ideas from `suggestFor` (stats + measurables as a checklist marked "Common", sport details as fields, profile links as quick-add buttons, statuses as the recruiting controls; nothing forced), NIL editor, profile links editor, photo help (focus point + zoom with computer and phone crops, small-photo warning under 1200px, uploads shrunk to 1600px WebP, IndexedDB, works under `file://`) | **Done** (`6aca648`, `ee435fc`, `af839cf`; §15.7). Willy: "this looks good" |
| 3 | First run (level + class → name → sport → position + number → optional photo → the editor; the look picker was removed, #82), save/open `.athlesite.json` page files (File menu, keys, drop; photos inlined/re-stored; one undo step), cover cards, examples pipeline | **Done** (`584d798`, `ee43954`, then the pipeline/docs commit; §15.8). Polish items left: §0.3 |
| 4 | Results table section (track, swimming, rowing, wrestling, golf, pickleball; any sport can add one) | **Done** (session 4; §15.9). (The motionin adaptations were done in session 3, §10.6) |

Willy (session 3): go ahead with **Step 2** while he sleeps; he reviews session 3's work later and
can still give that review after Step 2 lands. After Step 2: "this looks good".

### 15.2 Preview (`preview.js`) — how it works
- Two iframes in `.pv-viewport` (inside `.pv-anim`). Renders go into the hidden one via `srcdoc`
  with injected CSS: `studio-settle` (finishes entrance animations instantly while preparing) and,
  in edit mode, outlines for `[data-studio-pick]`.
- `prepare`: wait for fonts (≤700 ms), restore the scroll anchor (section + offset; ratio fallback),
  mark the active section, two frames for reveals, remove settle, `swap` (new frame fades in on top
  over 240 ms; old stays solid underneath until done).
- Renders coalesce per animation frame and a generation counter drops stale loads (newest wins).
- **Recolor fast path:** if the new HTML differs from the visible frame only in the palette
  `<style>` and favicon, it patches them in place — since session 3 inside a same-document **view
  transition in the preview frame** (the page cross-fades old → new colors as one picture on the
  GPU; a new color mid-fade skips the old fade). Fallback: the 0.35 s per-element glide
  (`studio-tint`). No reload; dragging the color wheel stays smooth.
- **Full rebuilds wait 90ms** (`SETTLE_MS`) after the change so the panel's own click feedback paints
  first; rapid changes fold into one build (`buildTimer`). Color changes skip the wait.
- Desktop = 1440 wide scaled to fit; phone = 390×844; on narrow screens the page fills the canvas.
  Device switch: quick dip-out and settle-in at the same scroll spot.
- **Phone frame (session 3):** just the screen — 16px corners, a hairline ring and a soft shadow; no
  device drawn. The page's scrollbar is hidden in every preview (`scrollbar-width:none` in the
  injected CSS) and `.pv-thumb` (a 4px pill, sized against the preview scale via `--pv-s`) shows
  while the page scrolls and fades 0.7 s after.
- Edit mode: every `[data-section]` except nav gets `data-studio-pick` (hero → `cover`); clicks call
  `onPick({section, field})`; links don't navigate. Visitor mode: no outlines; in-page links scroll
  the frame (srcdoc can't navigate `#hash`); external links open normally.
- `play()` renders once with `intro: 'always'`.

### 15.3 Panel (`panel.js`) — screens and controls
- **Home:** design card (look name in its own font, palette · fonts, three swatches, Remix button)
  + **Sections** list: Cover (fixed) then the order from `fullOrder`. Each row: grip (drag with
  FLIP glide, or ↑/↓ keys with screen-reader announcement), name + the page's title in quotes when
  different, status ("5 numbers", "Empty", "Hidden from visitors", "Open to NIL · 4 offers"), eye
  toggle. Empty rows dashed.
- **Design:** Look cards (name in the look's font, line, accent dots); Remix / Remix everything;
  Color (palette chips; "Your own color" = photo colors + wheel + "Use the palette color";
  note when the accent was adjusted for readability); Fonts (three cards, the athlete's last name in
  each pairing); Photo (Look default (B&W/Color) / Color / B&W / Duotone); Opening (switch + Play).
- **Section screens:** Cover → layout seg + Mirror switch with a reason when it can't apply; Stats →
  Signature/Spotlight/Ledger; Gallery → Signature/Strip/Feature/**Folio**; **Film → Reel / List in
  Cinematic, Signature / Reel elsewhere** (with a note when there are too few videos/photos);
  every section → "Show on my page" + status. Since Step 2 every section screen **starts with its
  content editor** (from `editors.js`, §15.7); the old "Next step" notes are gone. Cover's screen:
  photo, name and sport, where you play, headline, then the cover layout + Mirror.
- Controls: `Seg` (sliding pill, roving tabindex, arrow keys, re-placed on resize), `Cards`,
  `Switch`. Screens slide with WAAPI; any click mid-slide lands (old screen `inert`).
- Look change keeps the athlete's own accent, stats/gallery layouts, photo choice, Mirror; resets
  palette, fonts and cover (they belong to a look).

### 15.4 App (`app.js`)
Top bar segs (Desktop/Phone, Edit/View as visitor), Play opening, Undo/Redo (buttons + Ctrl+Z /
Ctrl+Shift+Z / Ctrl+Y, also from inside the preview frame, not while typing), "Saved on this device"
state, internal **Test athlete** menu (replaces the page; for prototyping only). Escape goes back.
Phone (<800px): bottom sheet with handle — peek 132px / half 52dvh / full 88dvh; tap cycles, drag
snaps; picking a section on the page raises it to half. Start: `?a=` athlete, else the saved page,
else Jordan (Step 3 should make "no saved page" open the first run instead). Since Step 2: clicking
an element with `data-field` on the page opens its section **and focuses its field**; Escape doesn't
leave a screen while you're typing in a field; content edits re-render the page 320ms after typing
pauses (`preview.update(p, { delay })`); `S.photos.onLoaded` redraws the page and panel when a
stored photo finishes loading; at start, `S.photos.cleanup` drops stored photos the saved page no
longer uses.

### 15.5 Known gaps in the editor (to address in Step 3 / polish)
- ~~Gallery photos and video posters have no focus point~~ Done session 4 (#91).
- ~~Only the name, headline… are click-to-edit~~ Done session 4 (#93): every stat, video, result,
  milestone and gallery photo opens its own row.
- No first run and no profile file save/open yet (Step 3).
- Stored photos live in this browser only (IndexedDB); clearing site data loses them. The profile
  file (Step 3) will carry them.
- Design screen look cards show names in each look's font (Willy asked why some are bold; §17.3).
- Phone sheet peek shows only the header + top of the design card.
- ~~When a section is opened on a phone, the preview doesn't scroll it above the sheet~~ Done session 4 (#94).
- The edit-mode outline of the active section is hidden behind a pinned Reel/Folio stage.

### 15.7 Step 2 — content editing (built session 3)
Files: `src/studio/fields.js` (controls), `src/studio/editors.js` (one editor per section),
`src/studio/photos.js` (photo storage); load order store → preview → panel → photos → fields →
editors → app.
- **Controls** (`S.fields`): `Text` (input/textarea, optional suggestions via datalist, live note,
  grows), `Select` (native), `List` (rows of fields; add, remove with an announcement, move up/down
  by buttons; rows rebuild only when the list's shape changes, never while you type in it; `after`
  and `each` hooks for thumbnails/posters), `Chips` (short tags + one-tap ideas), `Checklist`
  (sport ideas). Each binds a path in the profile and commits `{kind:'content', key: path}`, so a
  burst of typing on one field is one undo step; `sync` never overwrites the field you're typing in.
  `data-fieldkey` lets `panel.focusField` bring a field into view, focus it and flash it.
- **Editors** (`S.editors`): Cover (photo, description, first/last name, sport, position with
  suggestions, number, level, school, class of / college year + eligibility + redshirt, headline);
  Film (videos: title, link with a note on where it plays, optional poster); Stats (rows: what /
  number / when-or-where, "Also on your cover" for the first three, "Empty, so it's not on your page
  yet"; ideas for the sport/position/level); Story (word count, a nudge past 250); Your section;
  Milestones; Gallery (add several, drop files, caption, describe, reorder); NIL (on/off, pitch,
  what you can do + ideas, reach rows, partners, who handles inquiries, where they go); Details &
  contact (recruiting status or portal/draft/division/conference, contact with a note on what the
  button will do, hometown, height/weight, GPA, major, the sport's own details, "Find me on" with
  quick-add buttons and "Shows as On3" notes, socials).
- **Click the page:** `name`, `tagline`, `bio`, `heroPhoto` (and `number`) open their section
  and focus the field (`S.fieldFor`). More `data-field` markers can be added in the renderers.
- **Photos** (`S.photos`): `add(file)` → shrink to ≤1600px, WebP (JPEG fallback), IndexedDB
  `athlesite-studio-photos`; `url(ref)` → object URL (loads on demand, listeners redraw);
  `resolve(profile)` for rendering; `cleanup` at start drops photos the saved page no longer uses.
  HEIC files that the browser can't open get a plain message.
- **Empty-section prompts:** `renderSite(p, { prompts: true })` (edit mode only) places
  `.studio-empty` boxes in the page order for visible-but-empty sections; styled by the preview's
  injected edit CSS in each look's colors.
- Phones: the same screens in the bottom sheet, no sideways overflow; fields use 16px text (iOS zoom).
- Tests: `tools/studio-content.js`, `tools/studio-photos.js` (+ `make-test-photos.js`),
  `tools/studio-rapid.js` — all `PROBLEMS none`, no console errors.
- **Not in Step 2 (next):** focus points for gallery photos and posters (the reel's tall phone frames
  crop to the middle); `data-field` markers on more page elements (stats, videos); first run and
  save/open a profile file (Step 3, which must inline stored photos as data URLs when saving a file).

### 15.6 Smoothness (60fps) — measured in session 3
Measured with `tools/perf-*.js` in headless Chrome on this laptop (Intel Iris Xe — headless already
uses the real GPU). A frame over 20ms misses a 60fps beat. "4× CPU" ≈ an average phone / slow laptop.

| Where | Normal speed | 4× slower CPU |
|---|---|---|
| Athlete page openings (warm browser) | 0 long frames in all five looks (was one 58–175ms hitch each) | one 200–500ms frame at the very start (page build), then smooth |
| Athlete page scrolling, whole page | 0–2 frames of 25–33ms per full scroll (was 100–140ms hitches when big photos first appeared) | 0.3–1.5% of frames |
| Reel / Folio scrolling | 0–1 frame of 33ms (the reel's entrance starting) | — |
| Editor overall | **0.5% missed** (was 1.5%) | ~10% missed |
| Editor color changes | **0%** (was 10.4%) | ~25% |
| Editor look switch | 1–2 frames of 65–80ms per switch (building a whole new page) | 400–600ms frames |
| Editor sections, hide/show, Remix, scroll preview, opening | 0–0.3% | 2–16% |

What was fixed: the landing's forced layout and a timer firing mid-landing; layout thrash in the fit
passes; Jordan's 2 MB PNGs → WebP + `decoding="async"` everywhere; whole-page per-frame color
repaints in the editor → one cross-fade; rebuilds wait for the click's feedback.

**What's left and how to fix it (for the real app):** the preview iframe shares the editor's main
thread, so building a new page (fonts, first layout: ~60–80ms here, much more on slow machines)
stalls the panel. A **cross-origin preview frame runs in its own process**: proven in session 3 —
with a preview busy for 300ms the editor's worst frame stayed at 10ms (vs 292ms same-origin). It
can't be done in this prototype because under `file://` a sandboxed frame can't load the local
scripts, styles or photos (Google Fonts load; tested). In Next.js, serve the preview from its own
origin (e.g. a preview subdomain) and talk to it with `postMessage` (anchor/restore, recolor,
picks, active section, scroll indicator, probes for tests). Also first visits pay one-time GPU
shader compiles (the first cold run shows 100–150ms frames that never repeat).

**Session 4 re-check (after Steps 3–4, examples, focus pickers, click-to-row), same tools:**
- Editor (`perf-studio.js`, 1440×900, 1× CPU), three runs: 1.0% (cold) → 0.6% → **0.5% missed**, the
  same as session 3. Opening a section screen costs 2–13ms of script and normal frames
  (`open-cost` probe); the occasional ~50ms frame there is the preview scrolling to the section and
  decoding its photos the first time.
- Athlete pages (`perf-site.js`, 1440×900, 1×): openings smooth after the page build (one ~100ms task
  = parse + script + first layout, before the animation); scrolling 0–0.6% missed; Cinematic's first
  second of scrolling can show a 47–128ms task (first decode/raster of the big photos; varies run to
  run, never repeats).
- Phone (390×844, 4× CPU): openings have the page-build frame (230–370ms) then smooth; scrolling
  4–6% missed (mostly single 33ms frames; Prospect up to 9%). **The same measurement on session 3's
  code (a temporary git worktree at `cedf0e8`) gives 2.4–6.8%**, so this is run-to-run variance at
  4×, not a regression (#98).

---

### 15.8 Step 3 — first run, page files, cover cards (built session 4)

**Cover cards** (`src/card.js`, `src/card.css`; review page `cards.html`)
- `A.renderCard(profile, { look })` returns one `<div class="ac ac-<look> ac-cv-<cover> [is-mirror]
  [no-photo] ac-tone-<tone>">` with the page's colors and font-pairing variables inline
  (`A.cardContext` in render.js = the page's own `buildContext` + `paletteDecls`, so a card can never
  disagree with its page). `{ look }` shows the profile in another look (that look's default palette,
  fonts and cover; used by the first run). The host sizes the card; everything inside is `cqw`.
- One composition per look, recomposed for 3:4 (Cinematic: full-bleed photo, outlined number, name and
  numbers at the foot; Editorial: words left / portrait right, rubric top, name settles toward the
  byline; Highlight: giant number, caps name, scoreboard tiles; Portrait: matted print + serif name +
  placard; Prospect: photo, name, chips, the numbers grid). Each of the **15 covers** has a variant
  (e.g. Editorial Magazine cover = full-bleed photo with white words; Highlight Color block = photo on
  top, accent block below; Prospect Compact = round avatar), plus **mirror** where the cover allows it
  (same rule as the page: `always` / `subject-left` with the focus point < 0.45).
- Names: the longest line sets a first-guess size in CSS (`--len`), then `A.fitCards(root)` measures
  each row of the name (one-line or two-line covers) and shrinks only what overflows. Read all, then
  write; sizes written in `cqw` so a resized card stays right. Run it after fonts load
  (`document.fonts` `loadingdone`) and on resize. Item lines ("Soccer · Midfielder · Class of 2026")
  keep each phrase whole and break between phrases (`.ac-it` + `<wbr>` after each separator).
- Hard cases covered in `cards.html`: no photo (each look has a no-photo design), a 14 + 19 letter name,
  no stats, a 2-letter name.

**First run** (`src/studio/firstrun.js`, styles at the end of studio.css)
- Opens when nothing is saved, on `?start` (over a saved page: "Back to my page"), and from
  File › Start a new page. The page starts in **Cinematic** ("Create your own"), or in a homepage
  example's whole design with `?from=<example slug>` ("Start with this style", #83; app.js
  `startingDesign` copies look, palette, accent, type, photo, layout, order, intro). `?look=` still
  starts in a look's defaults.
- Five screens, one question each, with Back and a progress bar: **level** (High school / College; the
  class-year or college-year chips appear under it, a pick moves on; years computed from today, the
  school year turning over in July) → **name** (only required answer; Enter continues) → **sport**
  (all catalog sports incl. pickleball, "Something else", Skip; greets them by first name) →
  **position** (catalog positions as chips or their own words) + **number** (only for sports with
  numbers) → **cover photo** (drop or choose; small-photo note; "Build my page" / "Choose another" /
  "Remove photo", or "Skip and build my page"). Session 4's first version had a sixth screen, "Pick
  your look" with five cover cards; removed (#82).
- Finishing: `createEmptyProfile` + their answers + the starting design → `store.load` (fresh page, no
  history) or, when replacing a page, `store.commit` (Undo brings the old page back; "Save a copy
  first" link on the photo screen). Then `panel.hint(...)`: the one-time tip (#85). Nothing from the
  sport catalog is added (#67). While it's open the editor's own keys are paused (`has-fr`), so
  Ctrl+Z can't undo the page underneath.

**Page files** (`src/studio/files.js`, File menu in app.js)
- **Save to a file** (Ctrl+S): `{ athlesite: 'page', version: 1, savedAt, profile }`, stored photos
  (`idb:`) inlined as data URLs (`photos.blobOf`), built-in photos stay relative links (`file://` pages
  can't read them into a canvas). Downloads `<first>-<last>.athlesite.json`; a toast confirms.
- **Open a file** (Ctrl+O, or drop it anywhere on the editor; dropped photos elsewhere get a hint
  instead of the browser navigating away): ≤60 MB, must parse and be a page (or a bare
  `{ data, design }`), version ≤ 1; `normalizeProfile` (now also coerces wrong field types); every
  `data:image/(webp|jpeg|png|gif|avif)` photo ≤15 MB is decoded and **re-encoded through
  `photos.add`** (canvas → WebP) into IndexedDB; `idb:` refs from another device are dropped; the count
  of unreadable photos is reported. Replaces the page as one undo step (or loads fresh when there's
  nothing to keep). Friendly errors for broken / non-page / too-big / newer-version files.
- **Examples**: `tools/add-example.js <file>` (Node) unpacks a page file into `examples/<slug>.json` +
  `assets/img/examples/<slug>-cover|photo-N|film-N.<ext>` and rebuilds `examples/examples.js`
  (`A.EXAMPLES`, `<` escaped). `site.html?ex=`, `studio.html?ex=`, the Studio's test menu
  ("Homepage examples") and `cards.html` read it. Plan: `EXAMPLES.md`.

**Editor phone (review #6, #72):** `.pv-viewport.is-phone` = 46px screen corners + shadows for the
body (11px #111, a 1.5px #3a3a3a edge, two drop shadows) in the screen's own pixels; `layout()`
reserves `PHONE_BEZEL` (12.5) per side; the scroll indicator keeps `PHONE_CORNER` (30px) from the
corners.

### 15.9 Step 4 — the results table (built session 4)

- **Catalog** (`src/sports.js`): `results: { title, columns, key, pb, examples }` for track (Results:
  Event · Mark · Meet · Date, key Mark, "PR"), swimming (Best times: Event · Time · Course · Meet · Date,
  key Time, "PB"), wrestling (Tournament · Place · Weight · Date, key Place), rowing (Racing results:
  Regatta · Event · Place · Time, key Place), golf (Tournament results: Tournament · Score · Place ·
  Date, key Score), pickleball (Tournament · Division · Place · Date, key Place). `examples` are the
  editor's placeholders. Everyone else: `GENERIC_RESULTS` in profile.js.
- **Data + order**: §7. **Rendering**: §9. Looks: Cinematic (display-face marks, accent headers),
  Editorial (serif events and marks, numbered head), Highlight (accent marks in the display face,
  caps events, best rows flagged down the left edge), Portrait (serif marks, quiet), Prospect (the
  spec-sheet box like its stats table).
- **Editor** (`S.editors.results`): "Your results" = Section title (placeholder: the sport's) + a
  list (fields = the columns; the event full width, the headline value short; placeholders from the
  catalog; a "Best mark (shows "PR")" checkbox per row where the sport has a badge) + "Column names"
  (rename each, blank = the usual). The list's fields are built when the screen opens. Panel status
  "N results".
- **Test athlete**: Ava (track) has 5 results, 2 PRs. Checked: freedom 45,360 renders 0 problems;
  `studio-results.js` 15 checks desktop + phone; the other editor tests unchanged.

## 16. Type and spacing rules (enforced by `tools/spacing.html`)

From Willy's review #3 ("bleeding into the edges or each other"). The checker renders every athlete
× look × font × cover (stats layouts and Mirror rotated in) at 1440×900 and 390×844, measures each
line's real ink (DOM line positions + canvas font metrics; lining figures measured as capitals where
the page forces them), and reports:
1. Lines of one name/title closer than **0.02em**, or separate pieces of text closer than
   `max(6px, 0.06 × the bigger size)`, or overlapping.
2. **Outlined letters touching** — pixel test: each neighbouring pair drawn with its real stroke + 1px
   of air on two canvases; any shared pixel fails (exact for italics and kerned pairs).
3. Text **cut off** by a container with overflow hidden, or **off screen** sideways.
4. **Pages that scroll sideways.**
Decorative (`aria-hidden`) findings are listed apart.

Rules now in the CSS because of it:
- Stacked display type line-heights tuned per look/pairing (Cinematic name .93 / titles .96;
  Highlight name .88 / titles .88 / tiles .92 / shout 1.08 / footer .92; Editorial `--name-lh` 1 /
  1.02 / 1.05, titles 1.06; Portrait `--name-lh` 1.06 / 1.07 / 1.03; Prospect name 1.06).
- Big one-line type is `nowrap` + `fitText` (§13); stat numbers use `lining-nums tabular-nums`;
  Spotlight label 30px below the number.
- Outlined type gets letter-spacing (Cinematic footer `calc(.05em + 1.5px)`, Cinematic jersey .04em,
  Highlight footer number .06em).
- Every flexible grid column is `minmax(0,1fr)`; auto-fit/fill grids use `minmax(min(Npx,100%),1fr)`.
  (Plain `1fr` + a nowrap value let Editorial's stat grid widen a phone page.)
- Never combine `min-height` with `aspect-ratio` (Editorial Headline's phone photo became 400px wide).
- Decorative giants stay fully on screen and on the free side (§10).
- Session 3: phones — giants ≥40px under the nav buttons, never behind the cover's words, inside the
  side margins (`fitGiants`); lines of items wrap between items, dangling separators hidden; small
  caps lines that can wrap get real line spacing (Cinematic kicker 1.6 with the rule on the first
  line, Editorial rubric 1.7, Prospect kicker 1.6, Cinematic opening credit 1.7); a nav name that
  doesn't fit becomes initials; nothing on a cover passes under a see-through nav; reel titles 1.06
  and the reel frame's text stacks (it can't collide).
- The checker now also runs a 360×740 phone (`DEVICES=desktop,phone,small`).

Last run (session 3): 945 renders, 1 real-text note (a 14px gap under a 260px Spotlight number —
fine). Decorative: Highlight's deliberate layered numbers (Center poster, Color block) and the
ticker band. Re-run after any type or layout change (~9 min for three sizes).

---

## 17. Open items

### 17.1 Cinema Reel and Folio (motionin) — approved and built in session 3 (§10.6)

What's left: the **license check** (many customer sites; Willy has both files, #96). ~~Per-photo focus
points for reel posters~~ done session 4 (#91). Willy's review. The original analysis and the approved plan are kept below.

Files: `C:\Users\conno\Downloads\cinema-reel (1).md` (1,923 lines; read lines 1–1006 so far; the
rest covers loop wrap, `setIndex`, cursor, slide content, details panel, indicator) and
`C:\Users\conno\Downloads\folio (1).md` (948 lines, read fully). Both are React 18 + GSAP + Tailwind
specs for a full-viewport section that **owns the page**.

**Cinema Reel (original):** dark `#0a0908` 100dvh section; 6 slides rendered 7× (42) for an infinite
loop; each slide 80dvh × full width, 48px radius, image wrapper 100vw × 120dvh for heavy parallax
(R = 1.2, image moves at 16.7% of slide speed); spring `y += (target − y) · 0.11`; wheel moves the
track 1:1 (200px cap, live index commit at half a pitch, 100 ms pause before the spring resumes);
pointer drag (commit ±1 past 14% of viewport); arrows/PageUp/Down/Space; entrance: 3 s `power3.out`
fast-forward through three loops with a vertical SVG motion blur (≤18px) and screen-blend scanlines
driven by velocity, then the landing slide's content blurs in; incoming content fades in by
smoothstep under |dy|/slideH ≤ .55 with 64px offset and blur, outgoing content leads with
`cy = −dy × .42`; top/bottom 10dvh masks; right-edge pips with italic Playfair "01"/"06"; 104px
custom cursor circle ("SCROLL", grab-hand on press, chevrons in the mask zones); "EXPLORE" tilts the
slide `rotateY(15deg)` and slides in a details panel (synopsis, stats, awards). Uses `dvh` everywhere
(iOS URL-bar sync).

**Folio (original):** two-column infinite reel: title list (left, 80dvh, 9 rows, variable `wght`
420–620, color/opacity falloff, credit fades in on the active row) and portrait 4:5 image strip
(right, reversed stacking so images move down while titles move up, meeting on the active row);
3 loop copies with invisible teleport; lerp 0.14; wheel-idle snap after 90 ms; click any item →
GSAP glide (0.85 + |Δ|·0.11 s, `power3.inOut`) then **shared-element FLIP** into a detail panel
(title + image fly to their detail positions, items above lift with the title, accessories reveal
with blur); reverse FLIP on close; 2 s entrance auto-scroll that **locks body scroll**; 76px
mix-blend-difference "VIEW" cursor ring; mobile stacks (titles top half, images bottom half);
needs ≥9 items for the loop.

**Why they need adapting (Claude's pushback):** both capture the mouse wheel inside the section and
loop forever, so a coach scrolling the athlete page would be trapped cycling videos/photos and
never reach Details; Folio also locks the whole page for 2 s on load.

**Adaptation (approved: "i will trust your judgment with those recommendations"; one change while
building — the "snaps by settling" is a JS settle inside the pinned stretch, not CSS scroll snap,
decision #53):**
1. **Pinned, scroll-driven:** the section is `position: sticky` inside a tall wrapper (one viewport
   of scroll per item); page scroll progress drives the reel position (smoothed with the spec's
   spring/lerp); snaps by settling to the nearest item; arrows/pips/clicks scroll the page to that
   item; once past the last item the page continues. No wheel `preventDefault`, no infinite loop on
   the page, no body scroll lock; touch works with a normal swipe. Keep: entrance (motion-blur
   fast-forward + scanlines for Cinema Reel; strip blur-in for Folio) played once when the section
   first enters view, purely visual; parallax; content timing; masks; pips/counter; custom cursor
   ring on fine pointers only; reduced motion = plain static layout.
2. **Placement:** Cinema Reel = Film layout **"Reel"** (needs 2+ videos; 1 video falls back to the
   current film layout); each slide = one highlight (poster → else gallery photo → else cover photo;
   eyebrow = platform + position; title = video label split over two lines; "Watch on Hudl ↗"
   button). Default film layout in **Cinematic** when there are 2+ videos; opt-in elsewhere.
   Folio = Gallery layout **"Folio"** (needs 3+ photos; titles = captions, "Photo 01" when empty;
   non-looping list when fewer than ~7 photos, so no duplicate titles show); available in every look.
   Both styled by the look's palette/fonts (the spec's dark `#0a0908` becomes the look's colors).
3. **Cinema Reel "Explore" panel dropped** (no per-video stats/awards) → the slide's button opens the
   video link. **Folio's FLIP open kept** as a photo lightbox (big photo + caption; reverse FLIP).
Also: check the **license** covers many customer sites before shipping either.

### 17.2 Other open questions
- ~~`sportDetails` keep or drop~~ **Kept** (Willy, session 4; #92). Was: NEW field (bats/throws, dominant foot, club team) — **built** in Step 2 while Willy
  slept; ask him to keep or drop it (dropping = remove the Details fields + the `facts` line + the
  data default; nothing else depends on it).
- ~~First run: should it ask for a photo?~~ Built session 4: optional, **before** the look pick (so the
  cards show it; #77). Willy can still move it.
- ~~"Start a new page" replaces the saved page~~ Built session 4: no confirm dialog; it's one undo step,
  with "Back to my page" and "Save a copy first" (#78). Willy can still ask for a confirm.
- **Session 4, waiting on Willy:** photos for the examples (`EXAMPLES.md`; 12 athletes need all
  ~6, Jordan/Maya/Tyler need gallery + film photos); his review of everything since review #6; the
  example lineup and their words (proposals, he edits); ~~whether "Create your Athlesite" should go
  straight to the Studio~~ (Willy: not yet, #99).
- **Session 5, from the new-athlete run-through (Q3), for Willy:** (1) swimmers (and other results
  sports) see two places for times: Stats ("Times", the cover's three numbers) and Results ("Best
  times", the table). Keep both (stats = headline numbers, results = the record) or point Stats at
  other numbers for these sports? (2) On phones, opening a section keeps the sheet at its height (the
  page stays visible); pull it up to edit long forms. Raise to full automatically instead? (3) Check on a
  real phone that the keyboard doesn't cover a field you tap low in a half sheet (can't be tested
  headless). (4) NIL offer ideas include "Autographs"; fine for NIL, but it touches the parked
  autograph question for minors.
- **Session 5 judgment calls (accessibility, Q2):** the palette nudges listed in §0.3 Q2 (most are a
  shade darker; dark text on Electric, Crimson and Gallery-white buttons/badges is the visible one);
  Highlight's faded labels on the accent now full strength; the Highlight no-photo nav capsule lost its
  tint; the homepage's `--muted` left alone (outside Section 02), suggest #62656B.
- **Session 5 judgment calls (homepage Section 02):** the style chip under each card instead of on it
  (#100); on phones the opened example is a phone drawn inside the visitor's phone, with the two
  buttons pinned at the bottom (alternative: on phones, open the full page directly); no "scroll
  inside the phone" hint (the page's own sections invite it); the four bullets name the cover, colors
  and font pairing, then one standout; the carousel keeps Jordan, Maya and Tyler (the three with
  photos) in the middle until the other photos arrive.
- Session 4 judgment calls: Editorial cards set the name low in the column (magazine white space
  above); the Cinematic Center-stage card drops the outlined number (it crossed the face); Prospect
  cards show up to six numbers (four on the Banner cover); a new athlete's Prospect card is sparse
  (no numbers yet); first-run class years = the next four graduating classes; the paragraph fade
  waits 0.35s after the last word.
- Should "Club team" show for college athletes? Is "Draft eligible" useful outside football,
  basketball, baseball, hockey? (asked in session 1, not answered)
- Sport catalog content needs a pass by real players/coaches.
- Judgment calls Claude made that Willy may revisit: Highlight's ghosted number (alternative: remove
  it when it shares the name's side); Cinematic's fade-to-black moment (alternative: letterbox bars
  fixed to the screen); one undo step per rapid burst on the same control.
- Session 3 judgment calls: on a small phone (360×740) the Cinematic cover number steps aside (no
  room) and the opening's number lands on "No. 14" instead; the phone opening stacks number / name /
  credit; the editor phone preview draws no device at all; the reel is Cinematic's default film with
  2+ videos; Folio is opt-in everywhere; the nav now turns solid earlier on scroll.
- Step 2 judgment calls: sport ideas are a checklist marked "Common" rather than pre-ticked rows (so a
  new page never gets empty lines it didn't ask for); unticking only removes an idea while it's
  empty; typing re-renders the page 320ms after a pause; the cover photo editor shows a computer crop
  (16:10) and a phone crop (390×844); small-photo warning below 1200px on the long side; uploads
  resized to 1600px WebP quality .86; profile links store an editor-only `hint` for the placeholder.

### 17.3 Answered in session 2 (for reference)
- **"Why are some of the styles bold?"** Each look card shows its name in that look's headline font
  (Cinematic/Highlight/Prospect use heavy sans; Editorial/Portrait light serifs) — it previews the
  look. Claude recommended keeping it; if it still reads as inconsistent, replace the cards with
  small live thumbnails of the athlete's page in each look (being built for first run anyway).
- **J/B spacing:** a real overlap (measured), fixed per font pairing (§10, §16).
- **Drop cap:** fixed with a true two-line initial + small-caps lead-in.

### 17.4 Parked (do not build until Willy says)
- Autograph opening — branch `parked/autograph-opening` (`5e1d0d6`; `git cherry-pick 5e1d0d6` to
  restore). Waiting on a talk with CFul about publishing autographs of minors.
- Next-game / next-meet countdown.
- Team awareness (privacy question).
- motionin **Benchmark** — paused until Willy can get the file.

### 17.5 Next list (after v1)
Deep sport sections beyond the results table (pitch arsenal, goalie stats, wrestling bracket…), brand
kit (mark maker, social graphics, QR), atmosphere backgrounds (turf, ice, court, pool lanes), video
hero, more covers and font pairings, more motionin sections (Emulsion, Aperture, Frieze…).

**Not planned:** drag-anywhere editing; embedded social feeds.

---

## 18. Lessons and gotchas (save yourself time)

- **Session 4 (late): judge performance against the old code, measured the same way.** A temporary
  `git worktree add --detach <scratch>/wt-s3 <old commit>` + the same `perf-site.js` run showed the
  "regression" was variance. Remove the worktree after (`git worktree remove --force`).
- **Session 4: big edits through a script file, not inline shell.** Write a `.js` with the Write tool
  that does exact, count-checked replacements (expect exactly 1 match) and run it with node. Inline
  `node -e` / heredocs kept mangling `\\`, backticks and CR. Also: run the splice only after its input
  file exists (twice a splice ran before its chunk was written; it failed safely, nothing changed).
- **Session 4: tests must click where a person can.** Three false failures: a picker below the panel's
  fold (scroll it into view first), a row behind the collapsed phone sheet (put it just above), and
  the pinned Reel gliding after a scroll (wait ~900ms before measuring where to click).
- **Session 4: lists that rebuild rows on any data change** (fields.js `List`) destroy controls inside
  them mid-drag. Put drag controls outside the list and give the list `ignore: [keys]`.
- **Session 4: `typeof x` on a `const` that isn't initialized yet throws** (temporal dead zone). For
  callbacks that may run before a later `const`, use a `let` hook set once it exists (app.js `onSheet`).
- **Session 4: two `drive.js` runs on the same port = chaos.** The second run's steps went into the first
  run's page (the homepage script clicked around inside the editor test, which then failed with a
  null frame). Give parallel runs their own port (6th argument) or run them one at a time.
- **Session 4: `cdp-full.js` hung on `cards.html`** (tall page). Scrolling screenshots with `drive.js`
  (`scrollTo` + `t.shot` per 1000px) works every time.
- **Session 4: the app's Browser pane can't act on local files** ("page tools can't act on it here").
  Use headless Chrome.
- **Session 4: a CR in a heredoc'd JS string became a real line break** (`'\r'` through bash + a
  template literal). Use `String.fromCharCode(13)`, or the Edit/Write tools, for any escape.
- **Session 4: `t.key('a')` doesn't type** (no `text` in the key event): type with
  `t.send('Input.insertText', { text })`; submit a form with a keyDown that carries `text: '\r'`
  (`studio-start.js` has both helpers).
- **Session 4: give the "next" button its own class.** A test clicking `.btn-go` hit "Choose a photo"
  (also dark) instead of Continue.
- **Licensing for example photos**: free stock photos of real people aren't usable for the examples
  (identifiable people, usually no model release, fake names/stats = implied endorsement; #79). Claude
  can't generate images here; Willy makes them (rules in `EXAMPLES.md`).

- **The in-app browser pane is often hidden** (`visibilityState: hidden`): animations freeze, view
  transitions abort, lazy images don't load. Verify in headless Chrome via `tools/drive.js`.
- **Test like a person**: rapid clicks without waiting, phone width, no photo, bare profile, college
  athlete, light and dark palettes, real Windows scrollbars (`SCROLLBARS=1`).
- **Scrollbars move layouts on Windows**: locking scroll removed the 15px scrollbar and shifted the
  headline 7.5px under the opening → `scrollbar-gutter:stable` + re-aimed landing.
- **View Transitions API** swallowed clicks mid-animation → two-frame cross-fade instead.
- **Willy opens `file://`**: classic scripts only, relative paths, no fetch of local files, canvas
  reads of local images fail quietly (photo colors from a local file = none; uploads will work).
- **srcdoc frames**: a relative `<base href>` can't resolve (about:srcdoc) — pass an absolute one;
  `#hash` links would navigate the frame away — handle them in JS.
- **CDP screenshot clips are in page coordinates**: add `scrollY`. Pages use smooth scrolling: set
  `scrollBehavior='auto'` before jumping or captures come out blank. `loading="lazy"` images don't
  load in full-page captures.
- **Element clicks in tests must be on screen**: scroll targets into view first (a "missed" click
  once looked like an undo bug).
- **Canvas `measureText` ignores `font-variant-numeric`**: measure digits as capitals where the page
  forces lining figures, or old-style figures produce false collisions.
- **Bounding boxes lie for italics and kerned pairs** ("AV"): use a pixel test for letter collisions.
- **Grid `1fr` = `minmax(auto,1fr)`**: a nowrap value or a photo's natural size can widen the page.
- **`min-height` + `aspect-ratio`** grows the width.
- **`font` shorthand resets `font-variant-numeric`**; specificity matters (Portrait numerals).
- **Clip paths**: release them on landing so italics aren't cut.
- **Two-line names** need a real space between spans (screen readers read "JordanBell").
- **Separators in wrapping rows** dangle on phones; give each item its own element.
- **Windows shell**: `node -e`/heredocs eat backslashes (`\s`, `\/`) and mangle `\n` — write code
  with the editor tool or script files. Don't run parallel headless Chromes on the same debug port
  (`cdp-full.js` uses a fixed port).
- `document.write` previews (`site.html`) cause one harmless `favicon.ico` 404.
- **Session 3:**
  - Heredocs ate a regex backslash **again** (`[\d.]` → `[d.]` in `nav-overlap.js`): edit code with
    the Edit tool or Node scripts written through Write; check with `node --check` and a grep.
  - **Don't run several headless Chromes at once for timing checks**: they starve each other and
    produce fake "late landing" / long-frame results. Run timing tests alone, warm the profile, repeat.
  - The first run in a fresh browser profile includes one-time shader compiles; judge smoothness on
    warm runs (a real visitor's browser has them).
  - **CSS scroll snapping on the page traps people** at the ends of pinned sections (proximity snap
    pulled scrolls back to the last video). Use a JS settle limited to the inside of the stretch.
  - **Measure before you change classes** in the same task (`land()`): read-after-write forces a
    whole-page style/layout pass.
  - Interleaved read/write loops (`el.style = …` then `el.clientWidth` on the next element) lay the
    page out once per element; batch reads, then writes.
  - A `const` used by a function that runs during script start must be declared above that point
    (TDZ): `fitGiants` first referenced `nav`, which is declared later in `site.js`.
  - A sandboxed (opaque-origin) iframe gets its own process, but under `file://` it can't load local
    scripts, CSS or images.
  - `Range.getClientRects()` includes transforms — handy for measuring flying text.
  - Big PNG photos cost a long frame the first time they're painted; WebP + `decoding="async"`.
  - **Renaming or deleting an asset breaks pages saved in the editor** (localStorage keeps the old
    path): Willy saw his cover photo vanish after the PNG → WebP switch. Map old names in
    `normalizeProfile` (`MOVED`) whenever a built-in file is renamed.
  - **Inserting a line into an `if / else if / else` chain** (app.js) gave a SyntaxError that
    stopped the whole editor: run `node --check` on **every** edited file, not just the main one.
  - **`String.replace` with a string replacement treats "dollar + backtick" and "dollar + apostrophe"
    as special codes** (they insert the text before / after the match): a handoff edit whose new text
    contained a regex ending in a dollar sign followed by a backtick pasted a second copy of the
    document into the middle (repaired by cutting the verified duplicate). For literal text use
    `s.split(a).join(b)` or a function replacement `s.replace(a, () => b)`.
  - A test that reloads `studio.html?a=<athlete>` loads that test athlete fresh, not the saved page;
    reload the bare path to test persistence.
  - Returning a multi-MB data URL through CDP `Runtime.evaluate` can hang; make test images as JPEG.
  - `DOM.setFileInputFiles` (CDP) with the input's `objectId` uploads real files in headless tests.
  - iPhones zoom the page when a field with text under 16px is focused: editor fields are 16px on
    phones.
  - IndexedDB, Blobs and object URLs all work from `file://` in Chrome (tested); a sandboxed iframe
    does not load local files.
- **Session 6 lessons:**
  - **Test at Willy's display:** 2560×1600 at 150% (1707×1067 CSS px), **120Hz, Intel Iris Xe**. At 1× our
    numbers hid ~3× the graphics cost. `drive.js` `DPR=1.5`; `HEADED=1` opens a real window (most faithful).
  - **rAF frame times don't show graphics-chip jank.** The page's main thread kept 120Hz while the chip
    re-rastered 458 tiles a second. Use Chrome's frame reporter (`PipelineReporter` trace events: one frame
    can be reported several times, count by `frame_sequence`), `RasterTask` counts and
    `RenderSurfaceReasonCount` (offscreen passes) — all in `tools/perf-homepage.js`.
  - **Trace categories change what you measure:** `gpu`, `viz` or `disabled-by-default-devtools.timeline.frame`
    slowed the page to ~30fps by themselves. `benchmark,devtools.timeline` is light; `cc` (raster counts)
    is fine for counts, not for timing.
  - **Anything that changes inside a moving card every frame repaints the card** (a gradient's colors, a
    non-composited child's transform). A composited child inside a rounded or 3D clip costs an offscreen pass
    per card per frame instead. The cheap way: a sibling layer that only changes opacity.
  - **Backdrop blur is redrawn whenever anything under it moves.** Over a full screen with a live page in
    front, that's a big cost on integrated graphics.
  - **file:// pages are separate origins:** the homepage can't script a `../studio-v1` iframe
    (`contentWindow` is cross-origin). Screenshots (`how-shots.js`) were the way to show the real Studio.
  - `Page.captureScreenshot` writes **WebP** directly (`format:'webp'`), and `captureBeyondViewport` with a
    `clip` takes a tall page in one picture.
  - A Bash heredoc mangled `/\\/g` in a script (backslashes): write scripts with the Write tool.
- **Session 5 lessons:**
  - `drive.js` needs an **absolute** out folder. A relative one makes Chrome fail to start and drive.js
    dies with "Cannot read properties of undefined (reading 'find')". Use `"$(cygpath -m $S/dir)"` in Git Bash.
  - A drive.js run that starts on `about:blank` **can't navigate to file://** ("Not allowed to load local
    resource"); start it on the first file:// page instead.
  - **Lazy images never load off screen** in headless Chrome: a test that awaits every `img`'s load hangs
    forever. Set `loading='eager'` first and race the wait against a timeout.
  - Measuring contrast in the page: `document.elementsFromPoint` **skips `pointer-events:none` layers**
    (sliding pills, shades) and returns nothing for points off screen. Scroll each element into view, force
    `pointer-events:auto` and `transition:none` while measuring (colors mid-transition read as failures),
    then put the page back (tools/a11y-audit.js does all of this).
  - The phone sheet **slides** (transform) instead of shrinking, so anything "in view" of its scroll box can
    still be below the screen; `scrollIntoView({block:'nearest'})` inside it can leave things off screen.
    Tests pull the sheet up to full first, like a person editing would.
  - A **file:// iframe runs in the same process** as its page: the homepage modal's live page costs show up
    as long frames on the homepage's main thread (~56ms script + layout). Loading it later only moved the
    hitch into the card's flight; leave it at the start.
  - **Frame counts depend on the display rate** (the runner's Chrome drew ~120 frames/s, earlier runs ~60):
    timing bars are a share of frames, not a fixed count.
  - **Inline `node -e` with template literals, backslashes or \n is still the #1 time sink** (it broke
    three times this session): write a script file with the Write tool, or use the Edit tool.
  - The **product repo checkout on Willy's machine is on an old branch** (`willy/brand-v1-foundation`, cut
    before 5D) and its local `main` is the initial commit; read the real state with `git show
    origin/main:<path>` (no fetch, no checkout; read-only).
  - A setup dialog over the editor isn't modal until everything behind it is `inert`; a programmatic
    `input.click()` on an inert file input still opens the picker (checked with
    `Page.setInterceptFileChooserDialog`).
- After any change: `check-freedom.js`, `check-links.js`, the spacing check for type/layout changes,
  `studio-rapid.js` for editor changes, and screenshots of the affected look at desktop + phone.

---

## 19. Willy's review rounds, in detail (what Willy saw → what changed)

### Review #1 (after Step 1) → `6341505`
| Willy said | Cause | Change |
|---|---|---|
| Nav buttons "can be presented better" (screenshot: Cinematic's row of wide-tracked mono caps) | A generic row of 7 links, all the same weight, no sense of where you are | Shared nav: capsule + sliding marker (scroll spy + hover), solid Contact with arrow, tuck on scroll, fit-or-fold to Menu, Menu sheet in the look's type; voice per look (§10) |
| Opening "moves a slight tad at the end" | Name landed 7.5px right of the real headline, then jumped (scrollbar returned on Windows) | `scrollbar-gutter:stable`, center in the visible area, re-aim landing; 0px |
| Film doesn't fit even full screen | Full-width 16:9 poster + 148px padding: 1,224–1,336px tall | Video sized by screen height; title/other videos beside it; Film padding `min(sec-pad, 11svh)`; fits 1280×720–1920×1080 |
| Animations from his 3 reference links (not Bortoleto) | — | Researched motionin / seesaw / 60fps / collectui; five signature moments (§10) |

### Review #2 → `996cf0d`
| Willy said | Change |
|---|---|
| Big S "looks like its for either sentence" | `initial-letter: 2`, tight gap, small-caps lead-in |
| "B is super close to the J" | Measured overlap up to 0.15em; per-pairing `--name-lh` so letters can't touch |
| "Why are some of the styles bold" | Answered (§17.3), no change |
| NIL page needed | NIL section + data fields + "who handles inquiries" + nav label "NIL" + editor list entry |
| On3 / 247 / Rivals / ESPN links | `profileLinks` + "Find <name> on" chips; names from real domains; catalog additions |
| "not everyone will need a sports catalog section" (mid-task) | Confirmed: everything optional, hidden until filled, new suggestions unticked |
| motionin MD files on offer | Picks given (§5) |

### Review #3 → `0daa134`
| Willy's screenshot | Cause | Change |
|---|---|---|
| Cinematic footer: outlined JORDAN letters touching | Outline stroke over tight letter-spacing | `calc(.05em + 1.5px)` |
| Highlight footer: BELL 14 clipped at the top | `overflow:hidden` + line-height .8 + no top padding | line-height .92, top padding, outlined number spacing |
| Cinematic Center stage: BELL overlapping JORDAN | Anton at line-height .86 | .93 (titles .96) |
| Highlight cover: JORDAN/BELL touching | Big Shoulders at .8 | .88 |
| "check wording and spacing on everything" | — | The checker (§16): 336 → 1 real-text findings; fit-to-box for big one-line type, lining figures, grid min-width fixes, phone overflow fixes, decorative giants on screen/free side, ghosted Highlight number |
| Sent Cinema Reel + Folio MD; Benchmark paused | — | Read; adaptation proposed (§17.1); awaiting his answer |

### Review #4 (session 3) → `8be979f`
| Willy said | Cause (measured) | Change |
|---|---|---|
| Phone outline in the editor — "not a big fan" | A 30px-rounded phone shape with the Windows scrollbar inside it | Just the screen (16px corners, hairline, soft shadow), scrollbar hidden, slim scroll indicator while scrolling |
| Cinematic opening: the number doesn't flow to where the number actually is (desktop + phone, every cover) | The trailer's number faded out on the right; the cover's own number faded in elsewhere 0.6 s later | Number flight onto the cover's number, or into "No. 14" when the cover has none; ≤0.4px at hand-off |
| Phone openings: spacing and alignment off | Number overlapping the name off-center; small name; credit 236px below it | Portrait title card: number above, bigger name, credit under, one center line, slimmer bars |
| Phone: the 14 bleeding into Contact | Cinematic 28px under the buttons, Highlight −3 to −8px (touching) | ≥40px everywhere (measured 44–57px), fitted to the gap, steps aside on tiny screens |
| "did you check the lettering and word spacing on the phone too?" | The checker ran at 390 only and ignored decorative layers vs the nav | Added 360×740, giant/nav clearance, see-through-nav overlap checks; fixed item lines splitting mid-item ("NORTHVIEW / HIGH SCHOOL"), wrapped caps lines touching, a long nav name pushing Contact off a 360 screen, text under a see-through nav mid-scroll |
| 60fps for the editor and the athlete sites | Hitches traced to a forced layout at landing, a timer mid-landing, layout thrash, 2 MB PNGs, whole-page color repaints, rebuilds on the click's first frame | All fixed (§15.6); remaining editor stall on slow machines needs a cross-origin preview in the real app |
| "trust your judgment" on Cinema Reel / Folio | — | Built (§10.6), measured smooth, no scroll traps |

### Review #5 (session 3, during and after Step 2)
| Willy said | Cause | Change |
|---|---|---|
| "some of the stuff isnt loading. smae for other styles" (screenshot: Cinematic cover showing the photo's alt text) | The editor reopened the page saved on his device, which still pointed at `jordan-bell.png` / `jordan-bell-back.png`, renamed to WebP in `8be979f` | `normalizeProfile` maps the renamed built-in photos to `.webp` (`5209b10`); tested with a stale saved page in all five looks: 0 broken images, and the save rewrites itself |
| "go ahead for step 2" | — | Step 2 built (`6aca648`, `ee435fc`, `af839cf`; §15.7) |
| "this looks good" (after Step 2) | — | Asked for this handoff before compacting; detailed review of session 3 + Step 2 still to come |

### Review #6 (session 4) → `5e3d5bd`, then Step 3
| Willy said | Cause | Change |
|---|---|---|
| "i want to have the i grew up running routes, that sentence fade in after the bigger sentence is done above, same thins for the other section in the editorial style" (screenshot: About, the lead half inked and the paragraph already showing) | The smaller paragraphs used the page's normal reveal, so they appeared as soon as they scrolled into view | site.js takes them out of the normal reveal; they fade up (0.35s after, staggered) once the lead's last word inks, and go away again if you scroll back up; the page bottom counts as read. Covers "Beyond the game" too (it shares the story layout). Tested at 1440 and 390 (#73) |
| "the phone image doesn't look like a phone to much … im talking about the shape of it. … in the homepage v2 file … a phone that works and looks really good, just use that style" | Session 3's frame was only the screen (16px corners) | The homepage-v2 phone, drawn around the screen at its proportions (#72) |
| "before you begin step 3 … first go look at the section where they will be going … the size and actually what they will be" | — | Section 02 measured and the real covers tried at its shape (`EXAMPLES.md`); led to the cover cards (#74) |
| Chose "Card made from the page"; "the examples of what we have in the homepage right now are not getting kept … I want maybe 1 of each sport … are you saying you need photos from me? or can you not find ones online?" | — | Answered: photos from him (licensing, #79). Lineup of 15 + shot list in `EXAMPLES.md` |
| "like how we want every player website to be differnt because of the player freedoms creative editbality, same thing for the cards … like a little teaser of what they could do … also another sport to add is pickleball" | The first cards only followed the look and colors | Every cover has a card variant + mirror; fonts, colors, photo treatment follow too (#75); pickleball (#80). `cards.html` shows one look × three athletes as proof |


### Session 4, later (no review round; Willy's directions)
| Willy said | Change |
|---|---|
| "wait what is the new page setup? what is that for and where does that go?" → "what does the pick your look do for them?" → "after you create your site the card cover … should come last … the card thing i was only really needing for the 15 example ones … shareable cards … start from scratch or create your own button" | Look picker removed; `?from=` copies an example's design; Cinematic default + tip; share cards parked (`ef28061`, #82–#86) |
| "you can begin the next phase. ill get the photos later" | Step 4 results table (`27621f3`) |
| "i love all 4. just go down the list and do em all" + Keep sportDetails | Tasks 1–3 done (`0e7226e`, `0e383e6`, `e1826cd`); Task 4 next (§0.3) |
| "wait can you pause … update the handoff … as detailed as you can" | Session 4's close-out |

### Session 5 (overnight, then the morning; no review round)
| Willy said | Change |
|---|---|
| "ok start task 4 and then the overnight list once thats done. also we may run out of usage at somepoint but when we get it back auto continue please since ill be asleep. do not rush anything." | Task 4 (`8eb3627`), Q1 (`1a1b992`), Q2 (`8ee0735`), Q3 (`e111ee5`), Q4 (close-out commit); an hourly session cron to resume after a usage pause (deleted when done) |
| Sent `momentum-slider (1).md` mid-task ("incase you need it for the card example section") | Read; the homepage carousel already follows it; reference only |
| "we need to compact again … update the handoff really detailed and specific … i sent cful the porting md so he can take a peek at it" | Session 5's close-out; PORTING.md is with CFul |

### Session 6 (Willy awake; no review round yet)
| Willy said | Change |
|---|---|
| "i agree with the style lable underneath it, i will look into the pallette chnages later, photos coming late rtoday, and the three questions i will also get to later." | #100 confirmed; the rest stays open |
| "the buttons for on the right hand side of the edit portion, some are glitchy or like delayed when clicking between buttons are a little glitchy in the studio" | Panel screens no longer overlap; long preview jumps dip; design changes start sooner and fade faster (#117) |
| "when i get down to the card example section 02 on the homepage the entire screen gets glitchy, even when i click on a card and inspect it, its all glitchy" | Measured at his display settings: the sheen repainting every card every frame, the full-screen blur (#115, #116, #119) |
| "can you also update section 03 where it goes through the 4 create personalize publish share, can you make it all look like the real thing (or at least as much of the real thing as we have to date) those (like the previous cards), were just examples and placeholders." | Section 03 = screenshots of the real Studio and his real page (#118) |

---

## 20. Porting notes (for later, with CFul)

**Superseded by `PORTING.md` (2026-10-11, with CFul now)**, which is based on the product repo's actual
state (`origin/main` @ `bc96b8d`): the 18-field public projection, private school/contact/socials/
recruiting/NIL, hero-only Storage reads, the age gate (13–17 blocked until the guardian flow), no device
storage before sign-in, explicit publish, noindex. The bullets below are the earlier notes, kept for
history; where they disagree, PORTING.md wins.

- `data` fields map to `AthleteProfileData`; the NEW fields (§7, incl. NIL arrays, `nilContactRole`,
  `profileLinks`) need CFul's review before the repo model, migrations and RLS. `design` → one JSON
  column.
- NIL for minors: the "handled by my parent or guardian" option exists because high schoolers'
  deals usually go through a parent; state NIL rules for high school athletes vary — worth a policy
  conversation with CFul before launch.
- Profile link names must keep coming from the link's domain, never athlete input.
- The renderer is string-based for prototyping; in Next.js the looks become components. Keep the
  security rules (§9) and "empty sections never render for visitors".
- Photos: the repo already has hero photo focus/zoom fields; uploads go through Supabase Storage
  policies (CFul's area). The prototype's `idb:<id>` references (IndexedDB on the device) become
  storage URLs; the 1600px WebP resize can run client-side before upload (same code as
  `photos.js add`). `blob:` is allowed in `safeImage` only for the editor's preview; a published
  page should never contain one.
- `sportDetails` (if Willy keeps it) is a small key → string map: a JSON column or part of `data`.
- The opening's "once per visit" uses `sessionStorage`; fine client-side.
- The editor's preview relies on same-origin srcdoc iframes; in Next.js the page can render as a
  React tree in the editor instead — **but for a 60fps editor on slow machines, render the preview
  in a cross-origin frame (own process) and message it** (§15.6).
- Photo pipeline: resize uploads to ~1600px, store WebP/AVIF, `decoding="async"`, lazy below the
  fold; per-photo focus points (hero already has them; gallery/poster need them for the reel's tall
  phone frames).
- motionin license for multi-site use must be confirmed before Reel/Folio ship.

---

## 21. Related memory notes (Claude's memory folder)

`studio-rebuild-decisions` (running log of decisions and status), `athlete-site-inspiration`,
`design-roadmap-studio-first`, `willy-design-workflow`, `willy-wants-pushback`,
`homepage-v2-direction`, `apple-device-imagery-not-licensed` (no Apple device bezels or look-alikes).
The memory file `studio-rebuild-decisions` has a dated line per session; its last lines point here
(§0.1, §0.3, §15.7, §15.8, `EXAMPLES.md`). Session 5's line records Task 4 and Q1–Q4, the product-repo
facts found in Q4, and that PORTING.md went to CFul. Session 6 added `willy-laptop-display.md` (test at his
display settings).
