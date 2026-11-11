# 03 · Where the backend plugs in

Every place in the Studio lab where a stand-in does a job the product's backend will do. Each row names
the lab code (in `studio-v1/`), what it does today, and what replaces it.

**Status:** a map for planning, not an implementation plan. Rows that cross auth, schema, Storage or
visibility need the founder decisions listed in `01-COMPARISON.md` §5 first.

## The flow, end to end

```
Homepage ──"Create your Athlesite"──▶  Age gate  ─▶  Email code  ─▶ Studio setup ─▶ Studio editor
   │  "Claim it" (link name)          product+lab    product+lab     5 questions     private draft
   │  "Start with this style"                       + adult terms     (lab)          (autosave)
   ▼                                                                                     │
Example pages (15)                                                          Publish  ◀───┘
                                                                         link name, visitor
                                                                         preview, publish (lab)
                                                                              │
                                                                              ▼
                                                                    Athlete page /<slug>
                                                                    (public projection only)
```

Every screen now exists in the lab. The age gate and email code also exist in the product
(`src/components/onboarding/steps/AgeGateStep.tsx`, `src/components/auth/InlineOtpForm.tsx`). The lab's
versions (`src/studio/firstrun.js`, the account steps) restyle them for the Studio and keep the product's
wording. In the port, keep the product's logic and tests and take the Studio's layout. Publish is
`src/studio/publish.js`.

## Hook by hook

| # | What | Lab stand-in today | Replaced by | Notes |
| --- | --- | --- | --- | --- |
| 1 | **Start** | A new athlete (`studio.html?start=1`, or nothing saved) gets the account screens first: date of birth → email → code + adult terms (`firstrun.js` `accountSteps`, `?account=0` skips them for tests). Simulated: any code works | Product age gate (`age-eligibility.ts`, DOB never stored) → email OTP (`useInlineOtp`) → adult attestation (`initializeAdultParticipation`), *then* the Studio setup | The lab moves the terms checkbox from the save step to the code step, per CFul's order. Founders approve the order |
| 2 | **Questions** | `src/studio/firstrun.js`: level + class, name, sport, position + number, photo | Same screens, asked **once**. Drop any duplicate in the wizard | Product `AthleteInfoStep` covers name/sport/position/class today |
| 3 | **Draft autosave** | `src/studio/store.js`: `scheduleSave` → `writeNow` → `localStorage` (key `athlesite-studio-v1`), save states `saving / saved / error` | Account-backed private draft save, the same three states, unsaved changes kept in memory when a save fails | No device storage of profile data (PR #26). Add a revision guard against two-tab overwrites (CFul §7) |
| 4 | **Draft load** | `store.js` `readSaved()` on startup | Load the signed-in owner's draft | Owner only |
| 5 | **Photos** | `src/studio/photos.js`: IndexedDB, `idb:` references, `S.photos.url(ref)` gives object URLs | Product upload pipeline: `src/lib/image-processing.ts` (re-encode, strip metadata) and `media-storage.ts` (owned, versioned, non-overwriting paths) | Hero only at first. Gallery and video posters wait for a Storage review. Never store signed URLs or blobs in profile data |
| 6 | **Link name (slug)** | Chosen in Publish (`publish.js`): the product's `SLUG_PATTERN` and reserved list, copied. "Taken" is simulated (the example pages' names). "Claim it" arrives as a suggestion (`app.js` `cleanSlug`, now the same rule) | Chosen and checked near first Publish, under the product's slug and reserved-name rules | "Claim it" becomes a suggestion only. Minors: no real-name default |
| 7 | **Start from a style** | Homepage "Start with this style" → `?from=<example>`; Design → "Styles from real pages" (`src/studio/panel.js`) | Same (design only: never copies the example's words or photos) | Pure presentation. Stays client-side |
| 8 | **Editor preview** | `src/studio/preview.js` renders the full record into iframe `srcdoc` | Owner-only preview of the private draft | Must never be reachable by anyone but the owner |
| 9 | **View as visitor** | The editor's "View as visitor" now shows only public fields (`preview.js` applies `src/public-view.js`), as does `site.html?view=public` | Server-applied public projection, the same one the public route uses | Never send the full record to the browser and filter there. `public-view.js` is a picture of the rule, not the mechanism |
| 10 | **Publish** | `publish.js`: Publish in the top bar → link name → what visitors see / what stays private → Publish → live link, Copy, Unpublish. State in memory only | Explicit publish action (the product's `is_published`, `PublishSection.tsx`). For minors, guardian approval of the exact public revision first | **Open:** after publishing, do edits go live as they autosave, or wait for "Publish changes"? The lab doesn't promise either |
| 11 | **Public page** | `src/render.js` `renderSite(profile)` + `src/looks/*.js` + `src/site/*.css` + `src/site/site.js` | `/[slug]` route: projection first, then render (TS port of the templates *or* React components, CFul's comparison) | Escape athlete text and check links (lab: `esc`, `safeLink`). Keep noindex/nofollow on real profiles |
| 12 | **Contact** | Nav "Contact", About card "Get in touch", footer "Contact [name]" all use `recruitingContact` | **Undecided**: private today, so published pages have no contact | Matrix note A. Likely the first field to decide |
| 13 | **Fonts** | `render.js` loads the look fonts from Google Fonts | Self-hosted fonts | Look fonts are SIL OFL. Fontshare's ITF fonts are not allowed in the picker |
| 14 | **Page file save/open** | `src/studio/files.js` | Not ported (first release) | Prototype only |
| 15 | **Test material** | Test-athlete menu (`?dev=1`), `break.html`, `cards.html`, `index.html` looks review, `tools/` | Not ported | Port the *tests* that still apply (rendering, accessibility, worst-case data); they don't prove authorization |

## Design values the backend will need to store (proposal)

The `design` object in `src/profile.js` (`look`, `palette`, `accent`, `type`, `photo`, `layout`,
`order`, `hidden`, `mark`, `intro`). Today the checking is split across two places:

- **When the profile loads** (`normalizeProfile` in `src/profile.js`): `order` and `hidden` are
  limited to known sections, `photo` to a fixed list, and `intro` and `layout.mirror` are forced to
  true or false.
- **When the page is drawn** (`src/render.js`):
  - An unknown `look`, `palette` or `type` falls back to the look's default.
  - `accent` must be a `#rrggbb` color, and it's adjusted until it's readable.
- **Not checked yet:** the other `layout` keys and `mark` are copied through as they are.

The port should check every design value in one place, in the TypeScript domain layer, against an
allow-list. That's the bounded, versioned config CFul asked for. No design value holds HTML, CSS or a
URL.
