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

### The slug is the athlete's identity, and it locks at publish
**Active** · 2026-09-06
**Decision.** `slug` is globally unique and is the public URL segment. It is editable
before publishing and locked afterward, enforced at the application layer. There is no
slug-history or redirect table.
**Why.** The entire product promise is one shareable link. A link that changes breaks
every place the athlete has already shared it. Locking at the application layer keeps
pilot-scale complexity down.
**Rules out.** Renaming a published slug without a deliberate, designed migration path
— history table, redirects, or both.

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

### One current file per media slot, addressed by owner folder
**Active** · 2026-09-06
**Decision.** The path convention is `{owner_user_id}/<slot>.<ext>`, and a new upload
overwrites the same path. Storage policies enforce that the first path segment equals
the caller's `auth.uid()`.
**Why.** The folder *is* the ownership check — simple, and impossible to get wrong per
file. One file per slot means there are no orphans to clean up.
**Rules out.** Media histories, multiple photos per slot, or paths not prefixed by the
owner id — any of which breaks the policy.

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

### Auto-publish on first successful save
**Active** · 2026-09-06
**Decision.** The first save that creates the row also sets `is_published = true`.
**Why.** At pilot scale the athlete's goal is a shareable link, and a separate publish
step is one more place to get stuck and end up with nothing to share.
**Rules out.** Assuming a saved profile is private. Revisit before onboarding athletes
who need a private draft period.

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

### `main` is the intended canonical trunk
**Active** · 2026-09-06
**Decision.** `main` will become Athlesite's canonical integrated trunk. It does not
hold that role today — it currently contains no application code.
**Why.** One integrated trunk is what makes branch state, CI, and "what is Athlesite
right now" answerable at all. The present arrangement, where every line of work sits on
an unmerged branch, cannot support that.
**Before that happens.** Both live lines must be deliberately integrated and
**preserved**: `feature/pilot-persistence` (Phase A schema) and
`willy/premium-athlete-design` (approved homepage direction). Neither may be dropped,
flattened, or silently absorbed to make a merge easier.
**Rules out.** Force-pushing or resetting `main`, and any integration that discards
either line. The order and mechanics are not decided — do not assume one.

---

## Design

### The approved homepage direction is a constraint
**Active** · 2026-09-06
**Decision.** `willy/premium-athlete-design` (`e5cec40`) carries the selected homepage
direction, including `design-reference/homepage-approved.png`. Preserve it. Homepage and
marketing work builds on that direction rather than re-deriving one.
**Why.** It is a founder design decision that has already been made and approved.
Re-litigating it in code wastes the decision and creates conflicts.
**Rules out.** Independent homepage restyling, and any change to the marketing
components or `globals.css` tokens that would collide with that branch, until it is
integrated. Note that it revises the palette (accent `#5968c4`, electric `#4a63e8`,
highlight `#d3ac68`) and adds display typefaces — do not treat the current token values
on this line as final.

### Athlete visual identity is scoped, not global
**Active** · 2026-09-06
**Decision.** Profile pages read `.athlete-theme` tokens; Athlesite chrome reads the
site tokens.
**Why.** Athletes should be able to own how their page looks without restyling Athlesite
itself, and without per-component conditionals.
**Rules out.** Athlete-controlled values leaking into global tokens or chrome.
