# Decisions

Durable decisions and the reasoning behind them. **Organized by topic, not by date** —
this is a reference, not a changelog.

Bar for entry: a decision that is expensive to reverse, or that an agent would
otherwise unknowingly contradict. If it can be re-derived from the code in thirty
seconds, it does not belong here. Record the *why*, not the *what*.

Edit entries in place as they evolve. A superseded entry collapses to a one-line
pointer at its replacement; git history is the archive.

---

## Product & Positioning

### Wedge before network
**Active** · 2026-09-06
**Decision.** Build the athlete-first professional digital home — one shareable
identity link — for high-school recruits first. Treat coaches, recruiters, NIL,
business, and discovery as the longer-term vision, not current scope.
**Why.** A single-audience, single-artifact product can be finished, shared, and
judged. A two-sided network cannot be bootstrapped from zero on either side.
**Rules out.** Coach/recruiter accounts, search and discovery surfaces, messaging, and
marketplace mechanics — until the wedge is working.

### Recruiting and NIL are profile extensions, not products
**Active** · 2026-09-06
**Decision.** Recruiting status/contact and NIL openness/interests are fields on the
athlete's profile, rendered as sections of the identity page.
**Why.** Keeps the wedge coherent: one page the athlete owns, which happens to answer
recruiting and NIL questions. Avoids building two half-products.
**Rules out.** Separate recruiting or NIL flows, dashboards, or routes at this stage.

### The software is not the moat
**Active** · 2026-09-06
**Decision.** Treat athlete value, distribution, adoption, trust, data/network effects,
and brand as the durable advantages, and weight roadmap decisions accordingly.
**Why.** The profile page itself is replicable. What is not replicable is being the
link athletes actually send and the record they actually trust.
**Rules out.** Justifying work primarily on technical sophistication.

---

## Identity & Slugs

### The slug is the athlete's identity; it stays changeable during the pilot
**Active** · 2026-09-07 · supersedes the original "locks at publish" rule
**Decision.** `slug` is globally unique and is the public URL segment. **During the
pilot stage an athlete may change it, including after publishing.** Uniqueness is
enforced by the database, so two athletes can never hold the same slug. There is no
slug-history or redirect table.
**Why.** The long-term promise is one durable shareable link, and a changing link breaks
everywhere it has already been shared. But at pilot scale the likelier failure is an
athlete permanently stuck with a typo in their identity handle, with no edit path built.
Correctability matters more than permanence while the product is this young.
**Rules out.** Relying on a slug being permanent — nothing may cache or hard-code one as
a stable key. `owner_user_id`, not `slug`, is the durable identifier for a profile.
**Revisit when.** Real athletes are sharing links at volume. Locking then will need a
deliberate migration path — a history table, redirects, or both — plus founder sign-off,
since it changes live public URLs (`GUARDRAILS.md § Authority`).

### Slug format and reserved names are enforced in the domain layer
**Active** · 2026-09-06
**Decision.** `^[a-z][a-z0-9-]{2,29}$`, no consecutive hyphens, plus an explicit
reserved list — all in `src/lib/athlete-profile.ts`, not scattered across forms.
**Why.** Slugs are checked during onboarding, at save, and on read. One definition
prevents the three from drifting apart.
**Rules out.** Per-form validation rules.

### The canonical public athlete URL is `athlesite.com/{slug}`
**Active** · 2026-09-06
**Decision.** The long-term canonical public URL for an athlete is
`athlesite.com/{slug}` — the slug at the root, with no path prefix. The current
`/athletes/[slug]` route is an implementation-stage route and may later redirect to the
canonical root-level URL. Reserved root slugs must continue to protect application and
marketing routes.
**Why.** The product thesis is one clean, shareable athlete identity link. A path prefix
makes that link longer, less memorable, and less plainly the athlete's own. This is
already the shape `toAthleteProfileView` reports as `displayUrl`.
**Rules out.** Treating `/athletes/{slug}` as permanent, and shrinking or removing the
reserved-slug list — every root-level route name must stay reserved, or an athlete could
claim a slug that shadows an application or marketing route.
**Status of the work.** Routing is unchanged; this records the target, not a completed
migration. The domain is not yet owned — see `NOW.md`.

---

## Auth & Ownership

### One profile per authenticated user
**Active** · 2026-09-06
**Decision.** `athlete_profiles.owner_user_id` is `unique` and references
`auth.users(id)` with `on delete cascade`. It is also the upsert boundary for save.
**Why.** Makes save idempotent without a separate lookup, and makes ownership a
schema-level fact rather than an application convention.
**Rules out.** Multiple profiles per account, or team/agency-managed profiles, without
a schema change.

### Authentication is required at save, not at wizard entry
**Active** · 2026-09-07
**Decision.** An athlete completes the whole onboarding wizard and sees their profile
preview without an account. Authentication is required only when they save/publish to
Athlesite. The pre-auth draft stays in browser `localStorage`.
**Why.** The wedge is proving the profile is worth having; a sign-in wall before anyone
has seen their own page costs more than it protects. It also derisks email: OTP delivery
is the least reliable part of the flow right now (`NOW.md`), so no one is stranded on a
sign-in screen before they have seen any value.
**Rules out.** Gating `/get-started` behind auth. Also means the wizard must handle a
mid-flow sign-in without losing draft state.

### Inline numeric email OTP, no callback route
**Active** · 2026-09-07
**Decision.** `signInWithOtp({ email })` → the athlete enters the emailed numeric code on
the same onboarding screen → `verifyOtp({ email, token, type: "email" })` →
authenticated session established → save/publish continues.
**Why.** Hero and profile photo `File`/`blob` state lives in React memory during
onboarding. Navigating away during authentication could destroy that state and cause the
athlete to lose the photos they just selected.
**Rules out.** `/auth/callback`, magic-link navigation, or any other auth flow that
leaves or reloads onboarding mid-flow. Generic Supabase examples use a callback route —
this project deliberately does not. If a concrete technical blocker makes inline OTP
impossible, stop and obtain founder approval before changing this decision.
**Verified.** 2026-09-07, against the live project: send → 8-digit code by email →
`verifyOtp({ type: "email" })` → `getUser()` confirmed the athlete. Throughout, the URL
and the component's mount timestamp were unchanged, proving no navigation and no
remount — so in-memory photo state survives authentication.
**Token length is not fixed.** The live project issues **8** digits, and the length is a
dashboard setting that can change without a deploy. Never validate or assume a length,
in this module or in any UI built on it — most Supabase examples show 6.

### `auth.uid()` is the sole ownership authority
**Active** · 2026-09-06
**Decision.** Every ownership check — table RLS and Storage policy alike — resolves
through `(select auth.uid())`. Never `user_metadata`, never a client-supplied id.
**Why.** `user_metadata` is user-editable and therefore forgeable. Client-supplied
ownership is not ownership.
**Rules out.** Trusting any identity claim that did not come from the session.

### No service-role key in this project
**Active** · 2026-09-06
**Decision.** The application runs entirely through authenticated user clients plus
RLS. No service-role key is configured, and `.env.example` records that deliberately.
**Why.** A service-role key bypasses RLS entirely. Not having one means the policies
are the real access control, and there is no privileged path to accidentally expose.
**Rules out.** Server-side privileged data access without an explicit, reviewed
decision to introduce a separate non-browser runtime for it.

### Anonymous reads are column-scoped, not only row-scoped
**Active** · 2026-09-11 · founder decision
**Decision.** `anon` holds a column-level `SELECT` on exactly the 18 columns a published
public profile renders, not a table-wide grant (migration
`20260911000001_restrict_anon_profile_columns.sql`). `authenticated` keeps the full table
grant under the unchanged owner policies.
**Why.** RLS restricts *rows*; it cannot restrict *columns*. Every field of a published
profile was therefore readable by anyone holding the publishable key — contact, recruiting,
NIL, all six socials, and `school_or_team` — none of which any page renders. Measured, not
assumed: all 35 columns returned HTTP 200 to an anonymous caller before this change.
`GUARDRAILS.md § Athlete data` says contact fields exist "so an athlete can be reached
deliberately, not so they can be scraped in bulk", and these are minors.
**The 18.** `owner_user_id`, `slug`, `first_name`, `last_name`, `sport`, `position`,
`class_year`, `city`, `state`, `height_in`, `weight_lb`, `bio`, `hero_photo_position_x`,
`hero_photo_position_y`, `hero_photo_zoom`, `hero_photo_path`, `highlight_links`,
`is_published`.
**Why `owner_user_id` and `is_published` are in it.** Both are load-bearing, not
convenience. The Storage read policy joins this table on both, and a policy subquery is
subject to the caller's own column privileges — revoke either and anonymous visitors stop
being able to sign a published athlete's hero photo. `owner_user_id` is also already
public in every signed media URL (`{uid}/hero/{uuid}.ext`), so hiding the column would
conceal nothing while breaking photos.
**`school_or_team` is deliberately out.** It is rendered nowhere today, and name + school +
city + class year is a precise real-world locator for a minor. Revisit if and when
something renders it.
**Two lists, one truth.** The grant and `PUBLIC_PROFILE_COLUMNS` in
`profile-repository.ts` must name the same columns. Selecting an ungranted column fails the
*whole* query with 42501, so the symptom is a 500 on every public profile page, not a
missing field. `npm run check:columns` asserts parity; run it after touching either list.
**A new column is invisible to `anon` until granted.** That is the right default — it fails
closed — but it is a standing obligation: adding a column that should be public means
updating the grant *and* the select list together.
**Not solved: enumeration.** An anonymous caller can still list every published profile's
public columns without knowing a slug. Deliberately out of scope; recorded in `NOW.md`.
Fixing it would need an RPC-by-slug or rate limiting, decided separately.
**Rules out.** Reading athlete data anonymously through the table beyond these 18 columns,
and using `getProfileBySlug` for anything needing the full row. An Edit Profile flow must
use its own authenticated full-row query and type.
**Verified.** End to end against the live project with a disposable published profile
before merge: 18 columns readable, the other 17 refused with 42501 — including via
`select=*` and via filter predicates, so a hidden column cannot be used as an oracle — the
published hero still signed and delivered its bytes, and once unpublished the row returned
zero rows and the hero could no longer be signed.

---

## Data Model

### The domain model is separate from its storage envelope
**Active** · 2026-09-06
**Decision.** `AthleteProfileData` holds only athlete data. Storage metadata (`id`,
`createdAt`, `updatedAt`) lives on the `StoredAthleteProfile` envelope, and
presentation strings live on `AthleteProfileView`.
**Why.** Lets persistence move from `localStorage` to Postgres, and presentation
change, without touching the domain type both depend on.
**Rules out.** Adding ids, timestamps, or formatted display strings to
`AthleteProfileData`.

### Stored data is normalized field by field, never by object spread
**Active** · 2026-09-06
**Decision.** `normalizeAthleteProfileData` reconciles each field individually against
defaults, including nested `social` and `highlightLinks`.
**Why.** A record saved before a new field existed keeps all of its other valid data
instead of being clobbered by an all-or-nothing merge. This is what lets the model gain
required fields without invalidating saved drafts and profiles.
**Rules out.** `{ ...defaults, ...stored }` shortcuts in any load path.

### JSONB for highlights, flat columns for socials
**Active** · 2026-09-06
**Decision.** `highlight_links` is JSONB — ordered, variable-length, athlete-defined.
The six social links are flat columns.
**Why.** Highlights are an ordered list of unknown length, where a child table is
overhead at pilot scale. Socials are a fixed, known six-field shape, where columns give
type safety and cheap querying.
**Rules out.** Neither is permanent. If highlights ever need querying or per-item
permissions, promote them to a child table.

### Columns map 1:1 onto the domain model
**Active** · 2026-09-06
**Decision.** `athlete_profiles` column names correspond directly to
`AthleteProfileData` fields (snake_case ↔ camelCase).
**Why.** Makes the Phase B mapper mechanical and reviewable, and makes drift between
schema and domain model visible immediately.
**Rules out.** Adding columns with no domain-model counterpart without saying why.

---

## Media & Storage

### The media bucket is private; visibility is a policy, not a bucket setting
**Active** · 2026-09-06
**Decision.** `athlete-media` is created with `public = false`. Read access comes from
an RLS policy on `storage.objects` that joins back to `athlete_profiles.is_published`.
**Why.** One visibility rule, enforced in one place, for both the profile row and its
images. A public bucket would expose media even for unpublished profiles.
**Rules out.** Flipping the bucket public, or serving media through any path that does
not evaluate that policy.

### Storage paths are stored; URLs are generated at render time
**Active** · 2026-09-06
**Decision.** `hero_photo_path` and `profile_photo_path` hold object paths. Signed URLs
are created at render time.
**Why.** Signed URLs expire, so persisting one stores a value that will be wrong later
— and a public URL would bypass the visibility policy above.
**Rules out.** Writing a resolved URL into the database.

### Media paths are versioned per upload, never overwritten
**Active** · 2026-09-09 · supersedes the original overwrite-in-place convention
**Decision.** Every upload goes to a fresh path, `{owner_user_id}/{slot}/{uuid}.{ext}`,
with `upsert: false`. Storage policies still enforce that the first path segment equals
the caller's `auth.uid()`. After a save succeeds, the superseded object is deleted
best-effort.
**Why.** The original convention overwrote a fixed path per slot, which meant an upload
mutated the object a published profile already pointed at — *before* the database write
that was supposed to authorise the change. A save that then failed (a taken username,
say) left the athlete's live photo silently replaced despite the failure. Versioned
paths move the only visible change to the database upsert, which is the real commit
point: uploads touch nothing anyone can see.
**Consequences.** A failed save can leave an unreferenced object behind. That is
accepted: it lives in the athlete's own folder, is invisible to everyone, and costs
storage rather than correctness. Cleanup can be a later maintenance pass.
**Rules out.** `upsert: true` on athlete media, and any fixed per-slot path. Also rules
out treating the extension as meaningful — `contentType` set at upload time is
authoritative; the extension exists so the bucket can be read by a human during the
pilot.
**Note.** The Phase A migration's comment still describes the old `{uid}/<slot>.<ext>`
convention. That comment is not enforced by any policy, and applied migrations are not
edited (`GUARDRAILS.md § Migrations`), so this entry is the current source of truth.

### Athlete photos are re-encoded in the browser to strip identifying metadata
**Active** · 2026-09-09
**Decision.** Every photo is decoded and re-encoded before upload. Done in the browser
with `createImageBitmap` and a canvas — no image library. Format preservation is
**best-effort** (see below), transparency survives, the long edge is capped at 2400px
without ever upscaling, and JPEG/WebP encode at quality 0.92.
**What is guaranteed.** No identifying metadata from the source file reaches Storage:
GPS and location, device make and model, capturing software, original orientation
metadata, timestamps, and XMP/IPTC-style source blocks. Re-encoding achieves this by
construction — pixels are the only thing carried across — so there is no format edge
case where a field survives.
**What is not claimed.** Not that every browser emits a file with literally zero
metadata segments. The *encoder* may write its own. Chrome produces none on PNG and
WebP and attaches an sRGB ICC profile to JPEG; Safari emits a 76-byte EXIF APP1 holding
a single structural `ExifOffset` pointer to an empty sub-IFD, plus a 56-byte Photoshop
`8BIM` document-ID placeholder. Both were inspected byte by byte and contain **no
identifying, location, device, or timestamp data** — they are empty shells the encoder
creates, not source data that survived. The guarantee is about what is *removed*, not
about the absence of segments.
**Why.** Camera and phone images routinely embed GPS coordinates. Athlete profiles are
public and largely belong to minors, so a photo must not carry where it was taken.
**Why in the browser.** The original bytes never leave the athlete's device. Stripping
server-side would mean transmitting and storing the coordinates first, which is the
opposite of the goal.
**Orientation is baked in first.** `imageOrientation: "from-image"` is passed
explicitly. Browsers rotate photos at render time using the EXIF Orientation tag, so
removing EXIF without first applying it would leave portrait phone photos displaying
sideways. **Verified on both engines**, which is the check that mattered most: an
`Orientation=6` source stored as 1800×1200 pixels comes out 1200×1800 in Chrome and in
real iOS Safari, with GPS, device, and timestamp fields gone in both.
**The size cap is not only about payload.** Canvas has hard pixel-area limits — Safari's
is the tightest — and an ordinary 48-megapixel phone photo would otherwise fail to
decode at all. 2400px keeps every input inside them.
**Format preservation is best-effort, not guaranteed.** The same MIME type is always
requested, but a browser that cannot encode it silently substitutes another — most often
PNG in place of WebP. A substitute is accepted only when it is itself one of
`image/jpeg`, `image/png`, or `image/webp`, and the *actual* output type then drives both
the path extension and the stored `contentType`, so those always describe the real bytes.
The substituted file is revalidated for size like any other. Anything outside those three
types is a failure.
**Rules out.** Uploading the original as a fallback when processing fails, or when a
format cannot be preserved. That would defeat the purpose exactly when it matters, so a
failure abandons the upload with a readable error instead.
**Limits, accepted.** This is a product guarantee, not an enforced invariant: an
athlete's session may write to their own Storage folder, so a determined user could
bypass the app entirely. The threat model is accidental self-disclosure, not deliberate
self-exposure. Real enforcement would need an Edge Function or storage trigger.
Re-encoding also normalises colour-profile metadata rather than simply preserving it:
the browser decides. Chrome was observed emitting a 456-byte sRGB ICC profile on the
output, so a profile may be replaced rather than dropped, and other engines may drop it
outright. Either way the practical implication is the same — a wide-gamut photo is
converted to sRGB and may shift slightly. An accepted pilot trade-off unless testing
shows it matters. And one generation of JPEG loss is unavoidable when metadata is
removed this way.

### Bucket-level MIME and size limits as a second layer
**Active** · 2026-09-06
**Decision.** 5 MB and `image/jpeg|png|webp` are enforced on the bucket, in addition to
client-side validation.
**Why.** Client validation is a user-experience control. It is not enforcement.
**Rules out.** Relying on the form alone.

---

## Publishing

### `is_published` is the only public-visibility switch
**Active** · 2026-09-06
**Decision.** Anonymous read of a profile row and of its media both derive from
`is_published`. Owners can always read their own, published or not.
**Why.** A single boolean, checked in both policies, means "who can see this" has
exactly one answer and one place to audit.
**Rules out.** Any second visibility mechanism — unlisted links, per-section privacy,
preview tokens — without redesigning both policies together.

### Auto-publish on every successful save
**Active** · 2026-09-07 · widened from "first save" once the real write landed
**Decision.** Every successful save sets `is_published = true`, not just the first.
**Why.** At pilot scale the athlete's goal is a shareable link, and a separate publish
step is one more place to get stuck and end up with nothing to share. The only save
action today is "Save & View My Profile", and nothing can unpublish a profile, so an
upsert that always publishes matches the product exactly.
**Rules out.** Assuming a saved profile is private.
**Revisit when.** Draft/unpublish controls arrive. At that point this becomes a bug:
editing an intentionally unpublished profile would silently republish it, exposing an
athlete who had chosen to hide. The write path must then stop forcing the column and
respect the stored value.

### Search indexing is staged: marketing is indexable, athlete profiles are not
**Active** · 2026-09-09 · founder decision
**Decision.** Indexing is granted per route rather than inherited by default.
`/` and the fictional `/athletes/jordan-bell` stay indexable. `/get-started` is
`noindex, follow`. **Every real athlete profile is `noindex, nofollow` — published and
unpublished alike** — and no athlete profile may be added to a sitemap. The directive on
profiles is unconditional on purpose: a conditional one is a data-dependent path that can
index a real athlete by accident.
**Why.** Reversibility is asymmetric, and that asymmetry decides it. `noindex → index` is
a one-line change with nothing to undo. `index → noindex` cannot be undone: removal from
Google takes weeks, snippets and caches persist, and Bing, archive.org, AI crawlers and
people-search aggregators copy content and honour no retroactive removal. The subjects are
high-school athletes — largely minors — and the indexable snippet is their real name, class
year, and city (`GUARDRAILS.md § Athlete data`). When one direction is free and the other
is permanent, take the free one until there is a reason not to.
**What is not lost.** Nothing an athlete actually uses. Recruiting traffic at pilot scale
comes from the athlete sending their link, and link-preview crawlers — iMessage, Slack,
WhatsApp, `facebookexternalhit`, Twitterbot — ignore meta robots, so shared links still
unfurl with a title and description. At a handful of profiles there is no meaningful SEO
to forgo, and thin near-duplicate pages on a cold domain can cost more than they earn.
**Not an access-control mechanism.** `noindex` is a request to well-behaved search
crawlers and nothing more. It does not restrict access, does not bind scrapers, and does
not narrow the anonymous API surface. RLS remains the only enforcement layer. Do not cite
this decision as evidence that anything is protected — see the anonymous column-exposure
follow-up in `NOW.md`.
**Mechanism: meta robots, never `robots.txt` `Disallow`.** The two defeat each other.
`Disallow` blocks *crawling*, so the crawler never fetches the page and never sees the
`noindex` tag, while the URL can still surface bare from an external link. If a
`robots.txt` is ever added it must be allow-all.
**Still open, and blocking.** The canonical URL shape is undecided: `DECISIONS.md § The
canonical public athlete URL is athlesite.com/{slug}` records the intent, the app serves
`/athletes/{slug}`, and no `metadataBase` or canonical tag is emitted. **Settle that before
any profile is ever allowed to index** — indexing the wrong URL shape is more expensive to
undo than not indexing at all. This checkpoint deliberately changes no canonical behaviour.
**Rules out.** Indexing by omission. A route that should be indexable says so by carrying
no directive, and that is now a recorded choice rather than an oversight.
**Revisit when.** The pilot ends, or an athlete asks to be findable. The flip should
become a deliberate per-athlete opt-in, consent-shaped for minors, not a global switch —
and only after the canonical decision lands.

---

## Vendors & Infrastructure

### Supabase is infrastructure, not product architecture
**Active** · 2026-09-06
**Decision.** The domain model imports no vendor types. Vendor shapes stay confined to
the mapper and client layers.
**Why.** Keeps the product model independent of a vendor relationship that may change,
and keeps the interesting logic testable without a database.
**Rules out.** Vendor types in `src/lib/athlete-profile.ts` or in components.

### The product repo is canonical for shared Athlesite context
**Active** · 2026-09-06
**Decision.** Shared vision, product context, decisions, brand principles, and
company-wide AI guidance live in this repository's `docs/ai/`. Each repository keeps its
own `AGENTS.md` for stack-specific technical instructions.
**Why.** Two competing "brains" drift and then contradict each other. One canonical home
with thin per-repo technical layers does not.
**Rules out.** Duplicating shared context into `athlesite-ops`; it should link here.

### Deployment provider is deliberately undecided
**Active** · 2026-09-06
**Decision.** No deployment host has been chosen. Leave it open.
**Why.** It is not yet a founder decision, and committing host-specific configuration
now would quietly make it one.
**Rules out.** Assuming Vercel or any other host, and adding host-specific config,
adapters, or deploy scripts before the founders decide.

---

## Repository & Integration

### `main` is the canonical trunk
**Active** · 2026-09-06
**Decision.** `main` is Athlesite's canonical integrated trunk. It took that role with
PR #2 (`da61f8f`), which brought the whole product onto it for the first time.
**Why.** One integrated trunk is what makes branch state, CI, and "what is Athlesite
right now" answerable at all. Every line of work sitting on its own unmerged branch
cannot support that.
**How it was done.** `founder/integration-v1` was built from the common base `12daa01`
by four `--no-ff` merges, in order: `claude/ai-context`, `feature/pilot-persistence`,
`willy/premium-athlete-design`, then `origin/main`. All four were conflict-free. Merging
in `main` last makes the branch a strict superset of the repository, so the PR carries
no surprises. Every original commit and author is preserved.
**Rules out.** Squash, rebase, or cherry-pick when integrating founder work — all three
rewrite authorship. Force-pushing or resetting `main`. Any integration that discards a
line of work.
**Done.** PR #2 merged `founder/integration-v1` into `main` on 2026-09-07 with a true
merge commit (`da61f8f`), preserving every commit and author. Merging to `main` remains
a founder decision (see `GUARDRAILS.md § Authority`).

---

## Design

### The approved homepage direction is a constraint
**Active** · 2026-09-06
**Decision.** The selected homepage direction — authored by Connor Williamson on
`willy/premium-athlete-design` (`e5cec40`) and including
`design-reference/homepage-approved.png` — is now **integrated into `main`** (PR #2),
preserved byte-for-byte. Homepage and marketing work builds on that direction rather
than re-deriving one.
**Why.** It is a founder design decision that has already been made and approved.
Re-litigating it in code wastes the decision.
**The direction, now current.** Palette: accent `#5968c4`, electric `#4a63e8`, highlight
`#d3ac68`, with `--surface-raised` and `--border-strong` added. Display faces: Anton for
headlines and name-plates, Oswald for stats and eyebrows, both via `next/font/google`
(no added dependencies). `.athlete-theme` carries a full token set rather than three
accents.
**Status.** These values are the current approved direction and should be built on
as-is — but the direction is not permanently finalized. Further visual refinement is
expected, and is a founder design decision rather than a re-litigation of this entry.
**Rules out.** Independent homepage restyling, and changing these tokens or the
marketing components without a founder design decision.

### Athlete visual identity is scoped, not global
**Active** · 2026-09-06
**Decision.** Profile pages read `.athlete-theme` tokens; Athlesite chrome reads the
site tokens.
**Why.** Athletes should be able to own how their page looks without restyling Athlesite
itself, and without per-component conditionals.
**Rules out.** Athlete-controlled values leaking into global tokens or chrome.
