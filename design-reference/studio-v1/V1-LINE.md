# Athlesite Studio: the v1 line (draft for Willy)

v1 = the first version a real athlete could use to build a page they're proud of, and that we can
use to make the 8–10 homepage examples. Everything else goes on the Next list. Draft: 2026-10-09.

Test for every v1 item: does a real athlete miss it on day one, or does it stop five teammates'
pages from looking the same? If neither, it waits.

## In v1

### The athlete's site
- [x] Five looks: Cinematic, Editorial, Highlight, Portrait, Prospect (built)
- [x] One opening per look, on by default, athlete can turn off (built)
- [x] Sections: cover, film, stats, story, milestones, gallery, details and contact (built)
- [x] Empty sections never show to visitors (built)
- [x] **Layout variations**: 2–3 versions of the cover, stats and gallery in each look
- [x] **Type**: 3 font pairings per look
- [x] **Color**: the presets, plus any accent color, plus "pull colors from my photo"
- [x] **Photo treatment**: color, black & white, duotone in their color
- [x] **Their own section**: one free section with their own title and words ("Beyond the game")
- [x] **NIL section** (added by Willy 2026-10-09): only for athletes open to NIL; pitch, what they
      offer, reach, past partners, one "Start a conversation" button, and who handles inquiries
      (me / parent or guardian / agent / school compliance)
- [x] **Recruiting profiles** (added by Willy 2026-10-09): optional "Find me on" links (On3,
      247Sports, Rivals, ESPN, MaxPreps and sport sites); nothing shows unless they add one
- [x] **Results table** (built session 4; any athlete can add one; best marks get "PR"/"PB"): one section type for sports measured in times and results (track,
      swimming, rowing, wrestling record, golf). This is the deep-layer piece that matters most,
      since the generic stats layout fails those sports.
- [x] **One signature scroll moment per look**, so the page feels alive below the cover (the
      inspiration-site bar). Built 2026-10-09: Cinematic end-of-scene, Editorial read-along,
      Highlight scoreboard reels, Portrait walk-up-to-the-print, Prospect readout. Willy: "other
      stuff looks good" (review #3)
- [x] **Remix**: one tap rolls a fresh combination that still looks good
- [x] **Type and spacing**: nothing touches, overlaps or bleeds off an edge, on any look/font/cover,
      desktop and phone (Willy review #3; enforced by `tools/spacing.html`); phones re-checked at
      390 and 360 wide, giant numbers clear the nav (review #4)
- [x] **motionin sections** (Willy supplied the files): **Cinema Reel** as Film layout "Reel"
      (Cinematic's default with 2+ videos) and **Folio** as Gallery layout "Folio" (3+ photos), pinned
      and scroll-driven (no wheel trap, no page scroll lock). Built session 3 (HANDOFF §10.6).
      **License for many customer sites still to check.** Benchmark paused (file not available yet)
- [x] **60fps** (Willy review #4): athlete pages and editor measured and fixed (HANDOFF §15.6); the
      editor's remaining stall on slow machines needs a cross-origin preview in the real app

### Sport setup (optional, never mandatory)
- [x] Light layer for 12 sports plus a generic setup: football, basketball, baseball, softball,
      soccer, volleyball, track, swimming, hockey, wrestling, lacrosse, rowing (plus golf, tennis, and
      **pickleball**, added by Willy in session 4)
- [x] Per sport and position: suggested stats, measurables, profile-link fields, wording (high school and college)
- [x] Shown as a checklist of ideas (common ones marked "Common"); athletes tick, untick, edit or add their
      own; nothing is added unless they choose it (editor step 2)

### The Studio (editor)
- [x] First run: level + class, name, sport, position + number, optional cover photo, then straight into
      the editor (everything after the name can be skipped). Starts in Cinematic, or in a homepage
      example's whole design ("Start with this style"); a tip points at the other looks (session 4)
- [x] The page plus one tool panel; click anything on the page to edit it (panel, bottom sheet on
      phones, every section's content editable, clicking the name/headline/story/photo jumps to its field;
      editor-only "+ Add your film" prompts where empty sections go)
- [x] One section navigator: reorder, hide, add
- [x] Desktop and phone preview; play the opening; view as visitor
- [x] Undo, autosave on the device
- [x] Photo help: set the focus point and zoom (computer + phone crops side by side), warn on small
      photos, uploads resized to 1600px WebP and kept on the device (gallery and video posters too)
- [x] Save and load a profile file (`.athlesite.json`, photos inside; File menu, Ctrl+S / Ctrl+O, drop
      a file on the editor). `tools/add-example.js` turns one into a homepage example (session 4)
- [x] Polish (session 4): focus points for gallery photos and video posters; click any stat, video,
      result, milestone or photo on the page to edit that row; phone taps stay above the sheet
- [x] **Cover cards** (session 4): a portrait card per page for the homepage carousel and the first run,
      following each athlete's own choices (cover, mirror, colors, fonts, photo treatment); `cards.html`

### Quality bars (non-negotiable)
- Phone-first; key facts readable within seconds of landing
- Accessible: keyboard, screen readers, reduced motion
- Safe: athlete-entered links and media allow-listed (built)
- Passes the teammate test: five same-team, same-sport athletes making different choices end up
  with clearly different pages

## Next (after v1)
- Deep sport sections beyond the results table: pitch arsenal, goalie stats, wrestling bracket, etc.
- Brand kit: logo and mark maker, social graphics (incl. **shareable cover cards** for clients, parked
  by Willy in session 4), QR code
- Atmosphere backgrounds and textures (turf, ice, court, pool lanes)
- Video hero (needs uploads, storage and compression; CFul owns the storage rules)
- More layout variations and font pairings

## Parked (decide later; do not build until Willy says so)
- Autograph opening: on branch `parked/autograph-opening` until Willy and CFul talk
- Next game or meet with a countdown and schedule
- Team awareness: nudges when teammates use the same combination (privacy question)
- motionin Benchmark (giant figure + claims for stats): until Willy can get the file

## Not planned
- Drag-anywhere editing (freedom comes through choices, not pixels)
- Embedded social feeds (Meta API approvals; links are enough)
