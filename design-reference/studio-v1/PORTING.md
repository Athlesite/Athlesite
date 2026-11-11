# Porting the Studio into the product — notes for CFul (and Willy)

Written 2026-10-11 by Claude, overnight, from a **read-only** look at the product repo
(`Athlesite/Athlesite`, `origin/main` at `bc96b8d`, PR #30, as last fetched on Willy's machine;
nothing there was changed, fetched or committed). Everything below that touches auth, data,
storage, publishing or migrations is a **proposal**: those are founder decisions
(`docs/ai/GUARDRAILS.md § Authority`), several also wait on counsel (`NOW.md § Blocked on legal
review`). The Studio itself is a design prototype in `athlesite-design/studio-v1` (local only,
never pushed).

> **Note on the local product checkout.** Willy's working copy is on `willy/brand-v1-foundation`
> (cut before most of 5D/Phase 1a), and its local `main` is the initial commit. Anyone porting
> should start from a fresh `origin/main`, not from that branch.

---

## 1. The one-paragraph summary

The Studio is a working, tested editor (plain HTML/CSS/JS, no build step) that turns a profile
`{ data, design }` into a finished athlete page in one of five looks, with every design choice the
athlete makes. Its **data model started from `AthleteProfileData` and only grew** (§3), and its
renderer already escapes everything and allow-lists every link. The hard part of porting is not
the code: it is that **the Studio's pages show things the product deliberately keeps private
today** (school, contact, socials, recruiting status, NIL, GPA…) and **it saves to the device
before an account exists**, which PR #26 removed from onboarding for good reasons. Both need
founder decisions before any code moves (§2, §6). Everything else (media slots, a `design`
column, the renderer) is ordinary work behind those decisions.

## 2. Read this first: where the Studio and the product's privacy boundary disagree

The product's public read path (`get_published_profile_by_slug`, 5D.7, live) returns exactly
**18 fields**: `owner_user_id, slug, first_name, last_name, sport, position, class_year, city,
state, height_in, weight_lb, bio, hero_photo_position_x/_y, hero_photo_zoom, hero_photo_path,
highlight_links, is_published`. `PublicAthleteProfileFields` makes the rest a compile error on
public surfaces, on purpose (school + city + class year locates a minor; private contact fields
must never be fabricated or leaked).

The founders also approved (2026-10-06) a **reduced minor projection**, not built yet: first
name + last initial by default, an athlete-chosen handle (no real-name slug), **no city**,
optional state and class year, **height/weight private by default**, hero photo optional and
guardian-reviewed, bio guidance, links restricted to approved HTTPS/video destinations — plus
guardian approval of the exact public revision before publish.

What a Studio page shows, against that:

| Studio shows publicly | Product today | Minor policy (approved, unbuilt) |
|---|---|---|
| Full name, sport, position, class year, bio, hero photo, highlight links | Public (18 fields) | Name → first + last initial; class year optional |
| City / state ("Hometown") | Public | **No city**; state optional |
| Height / weight | Public | **Private by default** |
| School or team | **Private** (excluded on purpose) | Private |
| Recruiting status, "Open to recruiting" chips, committed-to | **Private** (deferred at 5D.3; now gated on the guardian model) | Private |
| Contact button (mailto recruiting contact), NIL contact | **Private** | Private |
| Socials (Instagram, X, TikTok, Hudl, YouTube, website) | **Private** | Links restricted |
| NIL section (pitch, offers, reach numbers, partners, who handles inquiries) | **Private** (`nil_*` columns) / new | Private / undecided |
| Recruiting profile links (On3, 247Sports, MaxPreps, SwimCloud…) | New | Restricted links |
| GPA, intended major, club team, bats/throws (sportDetails) | New | Undecided |
| Stats, results table, milestones, own section ("Beyond the game") | New | Undecided (free text: bio-style guidance) |
| Gallery photos, video thumbnails | New (Storage: **hero only** for non-owners) | Guardian-reviewed |
| Jersey number, headline ("tagline"), level / college year / eligibility / division | New | Undecided |

**Proposal (founders + counsel decide):** a per-field visibility table with an **adult default**
and a **minor default**, owned by the product, that both the public read path and the Studio's
renderer obey. The Studio can render any subset already (every section hides when empty), so a
"public projection" is just the profile with the private fields removed before `renderSite` —
the editor can show the athlete exactly what's public ("View as visitor" would use the same
projection). Until that table exists, the safest port renders **only the 18 fields** plus
non-personal design choices; the rest of the Studio's sections stay private-by-default or wait.

Two consequences for Willy to know about now:

- **13–17 athletes are blocked at the age gate today** (PR #28) until the guardian flow exists.
  So the first real users the Studio could serve are **18+** (college athletes). The high-school
  features matter once guardian approval ships.
- The homepage's 15 examples are **fictional**, so showing everything there is fine. Real pages
  for minors would look sparser than the examples until the visibility table is decided. Worth
  deciding whether the homepage examples should model the adult projection (so the teaser doesn't
  promise sections a minor can't publish).

## 3. Data model mapping (Studio → product)

The Studio's `data` mirrors `AthleteProfileData` field for field and adds more. Its own
`normalizeProfile` (src/profile.js) already does what `DECISIONS.md § Stored data is normalized
field by field` asks: every field reconciled individually, types coerced, lists filtered, focus
points clamped, legacy orders upgraded. Porting it to TypeScript next to
`normalizeAthleteProfileData` is mechanical.

**Same field, same meaning (no change):** `slug, firstName, lastName, sport, position, classYear,
schoolOrTeam, city, state, heightIn, weightLb, bio, heroPhotoPositionX/Y, heroPhotoZoom (1–1.8,
same clamp as the DB check), recruitingContact, recruitingNotes, social.*, nilOpen, nilContact,
nilInterests`. Two small differences: the Studio's default `heroPhotoPositionY` is 0.3 (the
product's is 0); `highlightLinks` items gain `poster`, `x`, `y`.

**Value-set difference:** `recruitingStatus` adds `'committed'` (+ `committedTo`). The product's
CHECK allows `open | not_open | undecided`; either extend it (migration) or store committed
separately.

**New in the Studio** (proposed storage in brackets; all need a migration and, if public, a
projection change):

| Field | Shape | Proposed storage |
|---|---|---|
| `level` | `'hs' \| 'college'` | column `level text` (CHECK) |
| `academicYear, eligibility, division, conference, redshirt, transferPortal, draftEligible` | college details | columns, or one `college jsonb` |
| `committedTo` | text | column |
| `jerseyNumber` | text ≤3 | column |
| `tagline` | text ≤ 80 | column |
| `heroPhotoAlt` | text ≤ 140 | column (accessibility; public if the photo is) |
| `heroPhotoUrl` | Studio-only (`idb:` / data URL / path) | **not stored**: maps to `hero_photo_path` |
| `stats` | `[{ label, value, context }]` (first 3 featured on the cover) | `stats jsonb` |
| `milestones` | `[{ year, title, detail }]` | `milestones jsonb` |
| `gallery` | `[{ src, alt, caption, x, y }]` | `gallery jsonb` with Storage paths (§4) |
| `results`, `resultsTitle`, `resultColumns` | rows `{ a…e, pb }`, ≤ 60 | `results jsonb` |
| `gpa, intendedMajor` | text | columns (private by default?) |
| `custom` | `{ title, body }` | `custom_section jsonb` |
| `sportDetails` | `{ key: value }` from the sport catalog | `sport_details jsonb` |
| `nilOffers, nilPartners` | string arrays | `jsonb` |
| `nilAudience` | `[{ label, value }]` | `jsonb` |
| `nilContactRole` | `'' \| parent \| agent \| school` | column |
| `profileLinks` | `[{ url }]` (site name derived from the URL, allow-listed) | `jsonb` |

**`design`** (look, palette, accent, font pairing, photo treatment, layouts, section order and
hidden sections, opening on/off) is **not personal data** and is needed to render the public
page. Proposal: one `design jsonb not null default '{}'` column, validated by the ported
`normalizeProfile` on every read (unknown values fall back to the look's defaults, so a bad value
can never break a page), and added to the public projection. `DECISIONS.md § Columns map 1:1`
asks to say why when a column has no domain counterpart: the design is the page's presentation
choices, owned by the athlete, versioned with the content.

Highlights stay JSONB as decided; the new lists follow the same reasoning (ordered, athlete-
defined, not queried).

## 4. Photos

| Studio today | Product today | To port |
|---|---|---|
| Photos stored on the device in IndexedDB (`athlesite-studio-photos`), referenced as `idb:<id>` | Versioned Storage paths `{uid}/{slot}/{uuid}.{ext}`, `upsert:false`, signed URLs at render time | Upload on add; store the path; resolve signed URLs at render |
| Re-encoded in the browser (canvas) to WebP, ≤1600px, quality .86 | Re-encoded in the browser, ≤2400px, JPEG/PNG/WebP at .92, orientation baked in | Use the product's `image-processing.ts` (it's the stricter, verified one); WebP has not been through the product path end to end yet (`NOW.md`) |
| Slots: cover, gallery N, video thumbnail N | Slots: `hero`, `profile`; non-owner reads **only the referenced hero** (5D.7) | New slots + a Storage policy change for gallery/thumbnail reads (founder-approved, 5D.7-reviewed); `is_publicly_referenced_media` would need to know about them |
| Focus point + zoom on the cover; focus point on gallery photos and thumbnails | Hero focus + zoom | Item-level `x/y` in the jsonb |

Metadata stripping is already the Studio's behaviour too (canvas re-encode), so nothing is lost.

## 5. Rendering, preview and security rules to keep

- `renderSite(profile, opts)` (src/render.js + src/looks/*.js) returns a **complete HTML
  string**; `src/site/site.js` is the page runtime (nav, openings, scroll moments, Reel/Folio).
  Every athlete string is escaped; links go through `safeLink` (https + mailto only, no
  `javascript:`), images through `safeImage`; profile links get their display name from the URL's
  own domain (so a look-alike can't borrow "On3"); social handles are rebuilt on the platform's own
  domain (a pasted link is cut to the handle; it can never point elsewhere). `tools/check-links.js`
  and `check-freedom.js` (45,360 renders) are the tests to port.
- **Options for the product page:** (a) port `renderSite` to a TS module and render server-side
  in the `[slug]` route (fastest; the looks are string templates), or (b) port each look to React
  components (cleaner in Next, much more work). Either way, the **public projection is applied
  before rendering** (§2).
- **Fonts:** the looks load Google Fonts CSS from `fonts.googleapis.com` at view time. The product
  uses `next/font` (self-hosted). Self-hosting the Studio's ~10 families avoids sending every
  visitor's IP to Google, which matters for minors' pages.
- **Editor preview:** the Studio previews in **same-origin `srcdoc` iframes** (it reads their
  scroll position and injects edit-mode CSS). In Next, keep the preview same-origin (a route that
  renders the draft for the owner only, or srcdoc). It must never be publicly reachable for an
  unpublished draft (owner-only, like the existing unpublished-owner preview).
- **No third-party scripts** in pages; `site.js` is first-party. Reduced motion, keyboard and
  WCAG AA contrast were audited (`tools/a11y-audit.js`): keep `--accent-text` and the
  readable-colour rules when porting the CSS.
- Real profiles stay `noindex, nofollow` (`DECISIONS.md § Search indexing`): the page `<head>`
  from `renderSite` needs that tag added in the product.

## 6. Saving before an account (the other big one)

The Studio **autosaves to `localStorage` (`athlesite-studio-v1`) and keeps photos in IndexedDB**
from the first keystroke, before any account. PR #26 removed exactly that from onboarding
("pre-auth onboarding state is memory-only", because a shared school device could resume another
athlete's draft). The Studio can't port with that behaviour. Options:

1. **Account first, then the Studio** (recommended, and it's Willy's instinct, §7): age gate →
   email code → the Studio, saving to the account as a **private, unpublished draft** as you go.
   Nothing is ever kept on the device. Changes the active decision "Authentication is required at
   save, not at wizard entry" for the Studio (founders).
2. **Memory-only until sign-in**: the Studio keeps everything in memory and asks for the account
   to save. Matches today's rule, but the Studio is a long editing session (every section, photos,
   a look; the wizard is five short steps): a reload or a closed tab loses everything, photos
   included.
3. Device storage with an expiry / shared-device warning — rejected by PR #26's reasoning.

The Studio's **File › Save to a file / Open a file** (`.athlesite.json`, photos inside) is the
athlete's own deliberate download; founders may still want it off for minors (a file of a
minor's data on a shared computer is the same risk in another form). It was built for design
review and making the examples.

## 7. Willy's sign-up idea, CFul's onboarding, and the Studio setup

Willy (2026-10-11): "when you create your athlesite it brings up a page … name, info, email,
school, year, age, etc and then once you submit … it brings you into the studio."

**What exists on `main`:** `/get-started` = Welcome → **Age** (DOB entered transiently, never
stored; under-13 and 13–17 blocked before the code is sent, so before any account) → Athlete
Info (name, sport, position, class year, school, city/state, height/weight, bio, username) →
Media → Recruiting → Brand & Links (+ NIL) → Preview (adult attestation + Terms/Privacy versions,
inline 8-digit email code, save as **unpublished**) → explicit Publish later.

**Proposal: the Studio era's front door**

1. "Create your Athlesite" (or "Start with this style" from a homepage example, carrying the
   example through) → **Age** (CFul's `AgeGateStep` as is).
2. **Email + code** (CFul's inline OTP) → the account exists; adult attestation + Terms/Privacy
   recorded here (the participation Phase 1a RPC) instead of at Preview.
3. **The Studio setup** (already built): level + class year, name, sport, position + number,
   optional cover photo. Then the editor, saving to the account as a private draft.
4. **Publish** is explicit, as today (later: guardian approval of the exact revision for 13–17).

This keeps Willy's shape (sign up, then the Studio) and fixes what the overnight notes worried
about:

- **No duplicate questions.** The sign-up page asks only age and email; the Studio setup asks
  the rest once (`AthleteInfoStep`'s fields are the Studio's Cover/Details editors).
- **"Age" is never a stored field.** The DOB is transient and only resolves a bracket, exactly as
  CFul built it. School and class year come from the Studio setup, not the sign-up page.
- **Account early is now the safer order**, not later. Claude's earlier advice was "ask for the
  account as late as possible, the Studio autosaves on the device meanwhile"; with PR #26's rule
  (nothing on the device before sign-in) and a long editing session, an early account is the only
  place work can be kept safely. Willy was right on the order.
- **Username/handle:** the Studio has no slug step yet; the product's slug rules (format, reserved
  names, no real-name default for minors) apply. Proposed: ask at Publish ("Your link:
  athlesite.com/…"), with the minor rule from the approved policy.

## 8. Things that are Studio-only or still open

- **Internal tools** don't port: the "Test athlete" menu, `index.html`/`cards.html`/`teammates.html`
  review pages, the example pipeline (`tools/add-example.js`, `add-photos.js`).
- **Cover cards** (`card.js`) are for the homepage examples; shareable cards for athletes were
  parked by Willy until after v1.
- **motionin licence:** the Reel (film) and Folio (gallery) sections are adapted from purchased
  motionin specs; whether the licence covers use on many customer pages is unconfirmed (Willy).
- **Opening animations** play once per visit on real pages (sessionStorage flag, no personal
  data); fine under PR #26 (not profile data), worth a sentence in the privacy notes.
- **"Autographs"** appears as an NIL offer idea; it touches the parked autograph question for
  minors (Willy/CFul).
- **Concurrent edits** (Studio autosave + another device) will be last-write-wins like today's
  saves (`NOW.md`); an `updated_at` guard would help once the Studio autosaves to the account.

## 9. A sensible order of work (once the decisions above are made)

1. **Decisions:** the visibility table (adult/minor), the front door order (§7), the storage shape
   (§3), new media slots (§4).
2. **Domain:** port `normalizeProfile` + the sport catalog to TS beside `athlete-profile.ts`; tests
   (port `check-freedom`/`check-links` cases).
3. **Renderer:** `renderSite` as a TS module + the projection; the `[slug]` route renders it
   (noindex, self-hosted fonts).
4. **Editor:** the Studio as a client app inside the product (its JS is framework-free; the store
   becomes "save draft to Supabase" instead of localStorage; photos go through the product's
   upload path).
5. **Media:** gallery/thumbnail slots + their Storage policy (reviewed like 5D.7).
6. **Minors:** the reduced projection and guardian approval (the existing Phase 1b plan).

Nothing here needs a new vendor or a service-role key. Every step that changes schema, RLS,
Storage or publishing is a reviewed migration with founder sign-off, per the guardrails.
