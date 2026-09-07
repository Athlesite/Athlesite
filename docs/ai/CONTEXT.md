# Athlesite — Product & Domain Context

Durable description of what Athlesite is and how the product is shaped. No status,
no roadmap, no dates — those live in `NOW.md`. Rationale lives in `DECISIONS.md`.

## What Athlesite is

**Current wedge:** an athlete-first professional digital home — one shareable
identity link the athlete owns and controls. Initially focused on **high-school
recruits**.

**Longer-term vision:** a broader athlete network — coaches, recruiters, NIL and
business opportunities, and discovery across them.

These are sequential, not competing. Recruiting and NIL already appear on the profile
as *extensions of the identity page*, not as separate products. Build the wedge; do
not build the network yet.

## Who it is for

- **Athlete (the owner).** Creates and controls exactly one profile. The only party
  who may write their data.
- **Viewer (the audience).** A coach, recruiter, brand, or anyone the athlete sends
  the link to. Unauthenticated. Sees a profile only once it is published.

There is no coach or recruiter *account* in the product today.

## Domain vocabulary

| Term | Meaning |
| --- | --- |
| **Profile** | The athlete's page. Exactly one per authenticated user. |
| **Slug** | The public URL segment, and the athlete's identity handle. Globally unique. Canonical long-term form is `athlesite.com/{slug}` at the root. |
| **Published** | `is_published` — the single switch controlling public visibility of both the profile row and its media. |
| **Highlight** | An ordered, labeled external link (Hudl, YouTube, film). |
| **Media** | Athlete-uploaded images: one profile photo, one hero/action photo. |
| **Draft** | In-progress onboarding data, not yet saved as a profile. |

## Shape of the system

**Domain model** — `src/lib/athlete-profile.ts` is canonical. Start there.

- `AthleteProfileData` — normalized, presentation-independent and storage-independent.
  No ids, no timestamps, no pre-formatted display strings.
- `AthleteProfileView` — the flat presentational shape the profile components consume,
  derived via `toAthleteProfileView`.
- `normalizeAthleteProfileData` reconciles an arbitrary stored value field by field.

Identity rules also live in that file: `slugify`, `isValidSlugFormat`
(`^[a-z][a-z0-9-]{2,29}$`, no `--`), and `isReservedSlug`.

**Persistence** — two layers, mid-transition:

- *Today:* `src/lib/onboarding-storage.ts` writes to browser `localStorage`.
  `StoredAthleteProfile` is the envelope carrying `id` / `createdAt` / `updatedAt`
  around the domain model.
- *Phase A (schema exists):* `supabase/migrations/` — the `athlete_profiles` table and
  the private `athlete-media` Storage bucket, both under RLS.
- *Phase B (not built):* Supabase client, domain↔row mappers, authentication.

**Routes** — `/` marketing · `/get-started` onboarding wizard ·
`/athletes/[slug]` profile · `/athletes/jordan-bell` static example.

`/athletes/[slug]` is an implementation-stage route. The canonical public URL is
`athlesite.com/{slug}` at the root — see `DECISIONS.md § Identity & Slugs`. The reserved
slug list exists to keep athletes from claiming names that would shadow application and
marketing routes at the root.

## Design direction

Premium athletic technology: dark interface, editorial, professional, modern but not
cyber/futuristic. Tokens are defined in `src/app/globals.css` and exposed through
Tailwind v4 `@theme`. Components read tokens, never raw hex.

Profile pages scope an `.athlete-theme` token layer, so an athlete's page can carry its
own accent without touching component code, while Athlesite chrome keeps the site
tokens. This is the seam through which athlete-owned visual identity will arrive.

The approved homepage direction lives on `willy/premium-athlete-design` — see
`DECISIONS.md § Design`.

## Vendor position

Supabase is infrastructure, not Athlesite's product architecture. The domain model is
plain TypeScript and imports no vendor types. Keep it that way: the mapper between
domain objects and database rows is the seam, and it is the only place vendor shapes
belong.
