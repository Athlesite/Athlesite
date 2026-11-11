# Decisions Claude made in session 8 (for Willy to review)

Session 8 (2026-11-10), after CFul's porting responses (v1 and 2.0). Willy: "honestly, lets start a new
branch on the athelesite repo to keep this professional and clean … yes the new setup screens (age
check, email code, publish) be designed as part of it", then "i greenlight everything that you think you
have to complete this part".

## The branch and the design reference
1. **Branch `claude/studio-design-reference`, made from `main` @ `ef04553`.** `main` turned out current:
   every branch CFul has pushed is merged into it (through Oct 14). Your old `willy/brand-v1-foundation`
   is untouched and fully on GitHub. Nothing is pushed until you say so.
2. **`design-reference/` replaces the single September image** (kept in `archive/`). Its start page is
   `index.html`. It holds:
   - the flow in order, and the 15 example pages three ways;
   - three docs for CFul: the comparison, the field visibility matrix, and the backend hooks;
   - a snapshot of the Studio and the homepage;
   - `brand/`.
3. **Brand: only the current masters** (logo SVG, mark, wordmark, lockups, logo sheet, guidelines PDF,
   14MB). The other ~234MB of the Logo Sheet folder stays on your laptop, untouched: old mockups, zips,
   and a duplicate PDF.
4. **The reference is a snapshot; the lab stays the working copy.** It's refreshed from the lab when the
   design changes. The homepage snapshot is its last *committed* version, so your homepage chat's work in
   progress isn't taken.
5. **Lint and build pass.** `eslint.config.mjs` now skips `design-reference/` (plain browser scripts) and
   your local `athlesite-design/` folder. Your installed packages were refreshed to `main`'s exact list
   (`npm ci`), because the old branch's install was missing a test tool `main` needs.

## What a published page can show
6. **"Published today" and "Minor" views** (`site.html?view=public|minor`, `src/public-view.js`). They
   show a page with only the product's 18 public fields; the minor view also uses first name + last
   initial and drops city, height and weight. Most pages lose Stats, Milestones, Gallery, NIL, their own
   section and the Contact button.
7. **"View as visitor" in the editor now shows the same thing**, as CFul asked ("View as visitor" must use
   the public projection). Athletes see honestly what a coach would see today.
8. **Biggest finding for you two: published pages have no contact at all under today's rules.** The
   recruiting contact is private, so every look's Contact button disappears. Matrix note A suggests
   deciding this first (for example a relay form or a masked email).

## The new screens (age check, email code, Publish)
9. **Account first, before any profile question**, in CFul's order: date of birth → email → code + adult
   terms → the setup. A new athlete (`studio.html?start=1`, or nothing saved) gets them;
   `?account=0` skips them for tests.
10. **The product's own words, restyled for the Studio:**
    - the date-of-birth question and the "we don't save it" line;
    - the bad-date message;
    - both blocked messages (under 13; 13–17) with "Back to Athlesite" and no retry;
    - "Enter the code we emailed you" / "Sent to j…l@… It may take a minute — check spam too";
    - "Paste or type your code", "Use a different email", "Resend in 30s";
    - the 18+ terms line.

    Two small changes: the email screen's heading is "What's your email?" (the product's sits on its
    save step), and the terms checkbox moves from the save step to the code step, per CFul's order.
11. **The date of birth is forgotten at once.** The form clears as soon as it's answered, and a blocked
    athlete sees no date and no way to try again.
12. **Prototype honesty:** a small "Prototype: no email is sent, and any code works" line. Nothing about
    the account is saved anywhere.
13. **Publish lives in the editor's top bar** (a dark pill, then "● Published"). It opens one dialog,
    with a bottom sheet on phones:
    - your link, with live checking;
    - "What visitors will see" (only what's public) and "Private for now, only you can see: …";
    - "See it as a visitor";
    - Publish → "Your page is live", Copy link, Unpublish.
14. **Link names follow the product exactly:**
    - a letter first, then a–z, 0–9 and hyphens, 3–30 long, no "--";
    - the product's reserved list (so `jordan-bell` is refused: it's the product's example route);
    - in the prototype, the example pages' names count as taken, with an alternative offered;
    - the homepage "Claim it" name is now only a suggestion, cleaned by the same rule.
15. **No adult-only wording is needed in Publish**, because minors can't get past the age check yet.
    When they can, the guardian approves the exact public version before publishing.
16. **Removed a promise:** the live dialog doesn't say edits appear immediately. Whether edits to a
    published page go live as they save, or wait for "Publish changes", is now an open question in the
    hooks doc.
17. **Phone bar:** "View as visitor" reads "Visitor" and "Play opening" leaves the bar on phones, to make
    room for Publish. The opening still plays on load.

## Tests
18. **New `tools/studio-account.js`** (21 checks, desktop and phone): the age paths, email and code,
    terms, visitor view, and every Publish case. The four setup tests now pass the account screens first
    (`tools/account-steps.js`).

## CFul's answers to the four questions (2026-11-10), and what changed
19. **Contact: hidden at launch.** No personal contact details on public pages. Later, a built-in
    "Contact Athlete" feature routes inquiries to the athlete or an approved guardian without revealing
    their details. Nothing to change in the lab: the "Published today" and visitor views already hide
    Contact.
20. **Order agreed:** account → guided setup → Studio → Publish, no question asked twice, and a private
    draft that autosaves once there's an account. That's what's built.
21. **"Publish changes", built.** After publishing, edits stay private until the athlete presses it. The
    button turns back into a dark "Publish changes" pill; on phones it reads "Publish" with an amber dot.
    - The dialog explains the changes are private until published, and offers "See the changes as a
      visitor", Publish changes, Not yet and Unpublish.
    - Only what visitors would see counts as a change (the public fields and the design). Adding stats
      or a gallery photo doesn't ask to be published, because those never go public today.
22. **Launch shows only today's public fields; the Studio keeps the rest, privately.** The editor now
    tags the six sections a published page can't show yet as **Private**: Stats, Results, Your section,
    Milestones, Gallery and NIL. Athletes aren't surprised when a visitor doesn't see them.
