# 01 · Studio lab vs the product on `main`

A fresh, read-only comparison, as CFul asked ("Run a fresh, read-only comparison of the Studio against the
latest authorized product branch"). It replaces PORTING.md's October 11 snapshot as the current picture.

| | Compared at |
| --- | --- |
| Product | `main` @ `ef04553` (2026-10-14, PR #37 merged). Every CFul branch on GitHub is merged into it. |
| Studio lab | `athlesite-design` @ `36dfe0e` (2026-11-10), local design repo, copied into `studio/` here |
| Method | Reading code and migrations only. No database, no deployed site, nothing run against Supabase. |

**Not covered:** CFul's later S3c work (commit `5eb191e`, migrations to 23 on TEMP) isn't on GitHub, so
it isn't compared here. Reconcile it before integration starts.

## 1. What the product already has (verified in code)

- **Routes:**
  - `/` is the homepage.
  - `/get-started` is onboarding, a step-by-step wizard: Welcome, Age gate, email code, Athlete info,
    Media, Recruiting, Brand links, Preview.
  - `/edit-profile` is where athletes edit.
  - `/[slug]` is the public page. `/jordan-bell` is the example page.
  - `/guardian/participation` is for guardians.
- **Age gate:**
  - It asks for the date of birth and never saves it (`age-gate-session.ts`).
  - Under-13s are blocked. 13–17 are blocked for now, while guardian approval is built.
  - Its copy is carefully worded (`age-gate-copy.ts`: no retry nudge, no legal words). **The Studio's new
    screens must reuse this copy, not rewrite it.**
- **Email code (OTP)** before anything is saved, with tests (`age-gate-otp.interaction.test.tsx`).
- **No saving on the device before sign-in.** `onboarding-storage.ts` only clears old drafts (PR #26).
- **Data:**
  - `athlete_profiles` table, with field names in `src/lib/athlete-profile.ts`.
  - Participation and guardian tables.
  - 15 migrations. NOW.md reports the first 11 live; the 4 Phase 2 migrations are merged but not
    deployed.
- **Public read:**
  - `get_published_profile_by_slug` returns exactly **18 columns**: owner id, slug, first and last
    name, sport, position, class year, city, state, height, weight, bio, hero x/y/zoom, hero photo
    path, highlight links, and is_published.
  - Anonymous visitors have no direct table access.
- **Photos:**
  - A server-side image pipeline (`image-processing.ts`).
  - Hero-only Storage reads, limited to the photo the profile references (5D.7).
- **Publishing:**
  - Publishing is an explicit action (`claude/explicit-publish`, merged).
  - Guardian participation and bearer flows exist, with rate limiting (Phase 2).
- **Hosting:** not chosen yet. NOW.md says not to assume Vercel or any host. Nothing is deployed.

## 2. What the Studio lab is

- **Code:** plain HTML, CSS and JavaScript, no build step, opened straight from disk.
- **Pages:**
  - `studio.html` is the editor: a live preview with a tool panel, or a bottom sheet on phones.
  - `site.html` is an athlete page.
  - `cards.html` holds the cover cards.
- **Renderer:** `src/render.js` builds the whole page as one HTML string. Five looks live in
  `src/looks/*.js` with `src/site/*.css`; `src/site/site.js` adds behavior (nav, fitting, motion).
- **Data:** `src/profile.js`. It's a superset of the product's model; see `02-VISIBILITY-MATRIX.md`.
- **Before the setup:** age check, email, then code + adult terms. These use the product's wording and
  are simulated: no email is sent and any code works.
- **Setup:** 5 questions (level and class, name, sport, position and number, cover photo), then the
  editor.
- **Publish:** link name, what visitors see, then live (`src/studio/publish.js`).
- **Storage:** autosaves to `localStorage` (`src/studio/store.js`) and keeps photos in IndexedDB
  (`src/studio/photos.js`). It can also save and open a page file (`src/studio/files.js`).
- **Examples:** 15 fictional athletes (`examples/*.json`, one per sport), with Pexels photos credited in
  `PHOTO-CREDITS.md`.
- **Tests:** 33 suites driven in headless Chrome (`tools/run-all.js`). They cover rendering,
  accessibility, spacing, worst-case data, phone layout and the setup flow. They check how things look
  and behave, **not** authorization.

## 3. Where they differ, and what has to change in the port

| Area | Studio lab today | Product rule (`main` / CFul) | Port must |
| --- | --- | --- | --- |
| Saving before sign-in | localStorage + IndexedDB autosave | Memory-only before sign-in (PR #26) | Remove device saving; sign in first, then save to the account |
| Order of screens | Age gate → email code + adult terms → setup → editor → Publish (the account screens are simulated) | Age gate → email code → setup → private draft → Publish (CFul's recommendation) | Use the product's age gate and email code, then the Studio setup; founders approve the order |
| Questions asked | Setup asks level, name, sport, position, number | Wizard asks athlete info, media, recruiting, links | Ask each thing once, in one place (CFul: "no duplicate questions") |
| Public fields | Pages show everything filled in | 18-column public contract | Public render uses only approved fields; the rest stays private (see the matrix) |
| Minors | Full names, every section | Blocked 13–17 today; later: first name + last initial, reduced fields, guardian approves the exact public version | Design the minor version now (reference shows it); ship adult-only first |
| Photos | Gallery, video posters, hero; stored in the browser | Hero only, via the server pipeline and private Storage paths | Hero first; gallery and posters wait for a reviewed Storage policy |
| Rendering | String renderer (`render.js`) in an iframe `srcdoc` | React/Next app | CFul: compare a TS port of the templates against React components, choose after security tests |
| Preview | Edit mode: the full record (owner). View as visitor: public fields only | Owner preview stays private; the public view goes through the public read path | "View as visitor" must use the same public projection |
| Link name (slug) | Chosen in Publish, by the product's rule and reserved list; "Claim it" is a suggestion | Chosen near first publish; minors never get a real-name default | Move the slug step next to Publish; keep "Claim it" as a suggestion only |
| Design choices | `design` object (look, palette, fonts, layout, order, hidden…) | No field yet | Proposed: versioned design JSONB, allow-listed values, private by default until reviewed |
| Hero crop default | `heroPhotoPositionY` 0.3 | 0 | Decide explicitly so existing crops don't shift |
| Recruiting status values | Includes values like "committed" | Fixed value set | Keep the product's values until a migration changes them |
| Fonts | Google Fonts CDN at runtime | Self-host fonts, no new third parties | Self-host the look fonts (all SIL OFL); Fontshare's ITF fonts can't be in the picker |
| Page file export/import | Yes | Omit from the first port (CFul) | Keep in the prototype only |
| Test athletes, review pages | Dev-only (`?dev`), `break.html`, `cards.html` | Not in production flows | Keep out of the port |
| Cover cards | Built (`card.js`) | Parked after v1 | Keep parked |
| Reel/Folio motion | Adapted from motionin | Licence needed before shipping | Willy supplies the licence terms |

## 4. What carries over cleanly

- **The five looks:** the visual design, the type and palette system, the accessible palette nudges,
  and the long-name and giant-number fitting.
- **Setup and editor behaviour:**
  - the setup's one-question screens and the editor's sections;
  - undo, so a style can always be taken back;
  - phone sheet behaviour and keyboard handling.
- **Quality checks that already pass in the lab:**
  - accessibility (WCAG AA contrast, 44px touch targets, reduced motion, focus order);
  - escaping and `safeLink` link validation;
  - layouts tested against worst-case data (`break.html`).
- **The 15 examples:** fixtures for tests and for the homepage. They're labelled as examples.

## 5. Next decisions (CFul's list, unchanged)

1. Early account creation before autosave (vs device saving).
2. Adult-only first integration, extra fields private by default.
3. v1 exposes only today's public fields, or waits for a new reviewed matrix (CFul favours current
   fields first).
4. Gallery, recruiting and NIL as phase two (CFul favours deferral).
5. Link name (handle) UX, and whether minors can export their page file.
