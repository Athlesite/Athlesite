# Decisions Claude made in session 7 (for Willy to review)

Willy, 2026-11-10: "im giving you full control on finishing it … when you finish just jot down all the
decisions you made so i can review them." Each line says what changed and how to undo it if you disagree.

## Housekeeping
1. **The lab moved** to `C:\Users\conno\projects\Athlesite\athlesite-design` (finished the half-done move from
   Oct 26). It stays its own repo, never pushed; the product repo ignores it on this machine only
   (`.git/info/exclude`), nothing committed in CFul's repo. Run the product's lint on `src/` only.
2. This chat now touches **studio-v1 only**; homepage-v2 is your homepage chat's.

## Smoother athlete pages on laptops (`5cfe00f`)
3. **Film Reel opening:** no full-screen motion blur during the fast-forward (scanlines stay). It was the
   biggest cost on your Iris Xe. *Undo: bring back the blur in site.js `startEntrance`.*
4. **Reel words** slide in without the blur-in; **the Reel's "Watch" button** is a plain dark pill instead of
   frosted glass.
5. **Stuck nav bars** are nearly opaque instead of frosted (all looks). The **glass capsule** over Cinematic and
   Highlight covers keeps its blur, smaller (18px → 10px), and drops it once the bar is stuck.
6. **Cinematic's end-of-scene** (cover drifting and fading as you scroll away) moves on its own layers.
   Result on a quiet machine, Jordan's page in all five looks: **10% → 1.6% dropped frames**.

## Example photos (`34f3da2`)
7. **Stock photos from Pexels for the 12 examples** (free commercial license, no credit needed; list in
   `PHOTO-CREDITS.md`), picked for drama: silhouettes, low light, action. Faces hidden, turned away or far
   off where possible, so real people aren't presented as made-up athletes. *Before a public launch: you and
   CFul decide stock vs commissioned vs AI (PHOTO-PROMPTS.md).*
8. **Sofia (volleyball) is indoor**, not beach (she's a college outside hitter). **Mateo's cover is a real
   freestyle throw** (Portrait shows it black and white). **Jordan's "team line" photo** (team wordmarks and
   helmet logos) is now the helmet shot from the homepage images.
9. Alt text and captions describe the real photos (captions like "Morning skate", "Dawn practice").
10. **Hannah's cover framed lower** so the crew isn't cut at the heads; **Grace's** framed higher.

## Editor
11. **Phone keyboard:** typing in the tools on a phone raises the sheet to full and keeps the field just
    above the keyboard; the sheet goes back when the keyboard closes. (Tested with a simulated keyboard,
    `tools/studio-keys.js`; still worth a minute on a real iPhone and Android.)
12. **"Autographs" isn't suggested to high schoolers** as an NIL idea (autographs of minors are parked with the
    founders). They can still type it.
13. **"Club team" doesn't show for college athletes** (editor and page).
14. **"Draft eligible" only for sports with a pro draft:** football, basketball, baseball, hockey, soccer,
    lacrosse, softball, volleyball. *Easy to change: `A.DRAFT_SPORTS` in src/sports.js.*

## Skill passes (Willy: "run skills that would make sense for the studio lab")
15. **break-ui** (`52dbc4c`): a dev-only test page, `break.html` (Demo / Worst case / Short / One / Empty, any
    look, cover and width), with realistic worst-case athletes at the editor's own limits. Fixed: long names
    ran off phones on centered covers and in footers (they now shrink to their column); long social handles
    pushed the page sideways at 320px (they wrap); Prospect's card lines spilled (end in "…"); the setup took a
    60-letter position, the editor 40 (now 40 both). Re-swept: nothing broke.
16. **Emil (design engineering)** (`7d291be`): every pressable thing answers a press (a subtle shrink); hover
    effects only with a real mouse (on phones a tapped row stayed "hovered"); exits use a quick ease-out
    instead of a slow start; arrow keys move a selection instantly (keyboard actions don't animate).
    *Left as is:* the Folio photo's close keeps motionin's own curve.
17. **mobile-native** (`1865872`): no gray flash on tap; buttons fire without the double-tap delay and
    long-press doesn't select their labels; the editor can't pull-to-refresh or bounce behind the tools; the
    phone's browser bar takes each athlete page's own background (dark looks get a dark bar). *Needs a real
    phone:* the tap feel, the bar color, the keyboard.
18. **impeccable audit** (`33c9c0a`): touch targets under 44px (Undo, Redo, eye toggles, grips, row buttons,
    the sheet handle) now reach 44px on touch screens without looking bigger; text selection and the text
    caret in the Studio's blue, and on athlete pages in the athlete's accent.
    *Not changed, your call:* the detector flags **Geist** ("overused font") and the **cream background** as
    generic. Both are Athlesite brand choices shared with the homepage, so they stay unless you want a
    distinct typeface for the product.

21. **Motion review of the athlete pages** (`4737c97`): the nav's section pill slides in .35s (was .55s); section reveals .75s (was .9s); the Reel's dots grow by scale. *Kept on purpose:* openings once per visit, Highlight's shake and overshoot (the look's character), the slow tracking-in of opening credits (once per visit).

## Live product vs test material (Willy: "all the test stuff shouldn't be showing up when it goes live … there needs to be stock ones like the ones … on the momentum wheel")
19. **The "Test athlete" dropdown only exists in dev mode** (`studio.html?dev=1`). Test athletes and the review
    pages (`index.html` looks review, `cards.html`, `break.html`, `sports.html`, `teammates.html`) are internal
    and don't ship; the live product is the Studio (`studio.html`) and the athlete pages.
20. **"Styles from real pages" at the top of Design:** the 15 homepage examples' cards (the wheel's order).
    Tapping one puts that page's whole design on yours (look, colors, fonts, cover, layouts, photo style,
    section order) and keeps your words and photos; one undo brings yours back. Same rule as the homepage's
    "Start with this style". (`tools/studio-styles.js`)

## After your first look (Willy: nav, "See the full page", long names into the number)
22. **The athlete page's nav stays on screen** while reading. It used to tuck away on the way down; Contact is
    what a coach needs at any point of the page. It still turns solid once the cover's content reaches it.
23. **"See the full page ↗" under each style card** opens that example's real page in a new tab, so a style
    can be seen as it really is before it's put on yours. Tapping the card itself still applies the style.
    (Tapping a style changes the design only, not the athlete; that's on purpose, your words and photos stay.)
24. **A long name never runs into the cover's giant number** (desktop, wider than 820px). The name shrinks to
    end 28px before the number; if that would take it under 60% of its size, the number shrinks instead (the
    name matters more). Covers that layer the number *behind* the name on purpose (Highlight's color block)
    are left alone. Checked with "Connor Williamson #13" on Highlight at 1440 and 1024.

## Setup polish (Willy: "yes i like those ideas for the setup"), guided by the Apple Design skill
25. **The same three button levels on every setup step:** one dark pill for the next thing to do
    ("Continue", "Build my page", or "Choose a photo" until there is one), a quieter pill beside it, and
    **Skip as plain underlined text, the same everywhere** (the class-year Skip used to be a dashed chip, the
    others small links). Buttons and answer chips are **48px tall on phones**.
26. **Desktop setup is larger** (question up to 58px, 680px column, bigger cards, chips and buttons) and
    **every question sits at the same height on screen**, a little above the middle. Not true vertical
    centering on purpose: centered content would move the question each time the answers change (the class
    years appearing, a photo being added). Step 1 holds Back's place invisibly so it lines up too.

## Resource library checks (Willy: "make sure they are safe before using")
27. **Vercel Web Design Guidelines** (MIT, read as a checklist, nothing installed). Most rules were already
    met by the earlier passes. Fixed: dark athlete pages now tell the browser they're dark (`color-scheme`),
    so scrollbars and built-in controls aren't light on a black page; the setup's position and number fields
    no longer invite password-manager / autofill popups. *Not adopted, on purpose:* Title Case labels
    (Athlesite writes in sentence case), "…" at the end of every placeholder (ours are example answers like
    "842" or "Senior night", where a "…" would read oddly), and "Continue" → a more specific label (you
    approved the "Continue" pill; in a one-question-per-screen setup it's clear).
28. **Fontshare: safe for Athlesite's own pages, NOT for the athlete font picker.** Its own fonts (Satoshi,
    General Sans, Clash Display…) are under ITF's Free Font License 2.0 (read 2026-11-10): free for
    commercial use and self-hosting on *our own* sites, but it forbids offering them "as a selectable font
    for third-party users" in a site builder or template editor. That's exactly the Studio's font picker, so
    none of them can go there. They could be used for Athlesite's own brand/UI (homepage, Studio chrome) if
    you and CFul ever want something other than Geist. Fontshare's *open-source* fonts (SIL OFL) don't have
    that limit. No Fontshare font is in use anywhere today.
29. **Footer Design → athlete page footers:** footer.design is a link gallery (no code, templates or account).
    Our footers already follow its most common pattern (the name in giant type), so they stay. Added the two
    things good footers there have and ours lacked: **"Contact [first name] ↗"** (a coach who reads to the end
    shouldn't scroll back up) and **"Back to top ↑"**, beside "Built with Athlesite", in every look. On
    phones the footer links get 44px touch targets. *Not adopted:* sticky/reveal, parallax and marquee
    footers (they hide or move the contact details and cost frames on phones).

## Unchanged and still yours
- CFul's answers to PORTING.md (you're getting them), then your polish skills.
- The motionin licence for the Reel and Folio on many customer sites.
