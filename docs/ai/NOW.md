# NOW — Athlesite current state

Last updated: 2026-09-23 · `main` @ `e315e35`

A checkpoint, not a log. Overwrite this file; git holds the history.
If the stamp above is behind `git log -1`, treat this file as stale and say so.

## Branch state (product repo)

**`main` is Athlesite's canonical integrated trunk.** PR #2 brought the app foundation,
the approved homepage design, Supabase Phase A, and this context system together; PR #3
refreshed these docs. Merged branches have since been deleted.

| Branch | Commit | State |
| --- | --- | --- |
| `main` | `1d2337e` | **Canonical trunk. All product work lives here.** |
| `claude/phase-b-supabase` | in progress | Phase B — connecting the product to Supabase. |
| `willy/premium-athlete-design` | `e5cec40` | Merged into `main`. Retained — design refinement expected. |
| `founder/integration-v1` | `05a2b50` | Merged via PR #2. Retained briefly as a PR-head anchor. |

## In flight

- **Phase B — connecting onboarding/profile to Supabase.** (1) client and session
  plumbing ✅, (2) mappers + profile read path ✅, (3a) auth plumbing ✅, (3b) inline OTP
  UI in onboarding ✅, (4) save/publish upsert ✅, (5) media upload and signed URLs ✅.
  All five verified against the live project; test data has been removed.
- **Supabase Phase A.** Schema is applied and live; the read path uses it.

## Known follow-ups

- **Failed saves can leave orphaned media objects.** Uploads go to fresh versioned paths
  before the database write, so a save that fails afterwards leaves an unreferenced
  object in the athlete's own folder. Deliberate — it is the cost of never mutating a
  published profile's photo before the write that authorises it. Invisible to everyone;
  worth a cleanup pass eventually, not urgent.
- **Metadata stripping is client-side only, so it is a product guarantee rather than an
  enforced one.** Photos are re-encoded in the browser before upload, which removes every
  identifying field from the source — GPS/location, device make and model, capturing
  software, original orientation metadata, timestamps, and XMP/IPTC-style blocks (see
  `DECISIONS.md § Media & Storage`). Note this is not a claim that the output contains no
  metadata segments at all: Safari writes back a minimal structural EXIF/Photoshop shell,
  verified byte by byte to hold no identifying, location, or device data. But an athlete's
  session may write
  to their own Storage folder, so a determined user could bypass the app and upload an
  untouched file. Acceptable for the pilot — the threat model is a teenager who does not
  know their camera records coordinates, not one deliberately publishing them. Enforcing
  it would need an Edge Function or storage trigger.
- **iOS Safari orientation is validated on a real device — this is no longer an open
  risk.** A source of 1800×1200 stored pixels tagged `Orientation=6` came back **1200×1800**
  from real iPhone Safari, matching Chrome. GPS gone, XMP gone, no device/timestamp/
  location data, versioned path and Storage lifecycle intact (new UUID object, superseded
  object deleted, 2 objects, 0 orphans). Both engines honour
  `imageOrientation: "from-image"`, so no EXIF-parsing fallback is needed.
- **Re-encoding normalises colour-profile metadata; it does not preserve it.** What
  happens is browser-dependent: Chrome was observed attaching a 456-byte sRGB ICC profile
  to the output, so a profile can be replaced rather than dropped, and another engine may
  drop it entirely. Either way a wide-gamut photo ends up as sRGB and may shift slightly.
  Accepted for the pilot unless testing shows it is noticeable. Safari's *colour-profile*
  behaviour specifically is the untested part — what it writes, and whether the shift is
  visible. Safari itself is validated: orientation and metadata stripping both passed on a
  real device, per the item above.
- **Onboarding server-renders a blank `<main>` until hydration finishes.** The wizard is
  gated behind a `hydrated` flag so the server and first client render agree before
  `localStorage` is read, which means `/get-started` ships an essentially empty page —
  header and footer only — until JavaScript loads and runs. Anything that delays or
  prevents that (a slow phone connection, a failed chunk, a JS error) leaves an athlete
  staring at a blank screen with no message. Observed for real when `next dev` 403'd its
  own chunks over a LAN IP. **Replace with a useful static or welcome state before
  pilot** — the Welcome step's copy is static and could be server-rendered, with the
  hydration gate kept only for the draft-restored case.
- **The Welcome-step copy is stale and now untrue.** It still tells athletes their data
  is "stored only on this device and browser" with "no account or backend behind it".
  Both stopped being true at checkpoint 4: profiles are saved to Supabase under a real
  authenticated account and are publicly readable once published. **Must be corrected
  before any athlete sees it** — it currently misstates where their data goes.
- **There is no Edit Profile flow, and three problems trace back to that.** The wizard
  never loads an existing profile, so a returning athlete cannot see what media they
  already have, both photo fields read "Choose photo" rather than "Replace photo", and
  an empty slot has to mean "leave what is stored alone" — it cannot be distinguished
  from "remove this". The mapper supports `null` to clear; nothing can produce it. This
  is also the root of the stale-draft republish issue below. It needs a design decision
  about resume and edit behaviour, not a patch.
- **PNG and WebP have never been uploaded through the product's own path.** Every
  Checkpoint 5 upload through onboarding was a JPEG. PNGs were uploaded directly via the
  Storage API during policy testing, so the bucket accepts them, but the app's
  `EXTENSION_BY_TYPE` mapping for `png`/`webp` and the tightened `accept` filter remain
  unexercised end to end. **Now higher stakes than before:** format preservation through
  re-encoding is *best-effort* — a browser that cannot encode the requested type
  substitutes another, and the substitute is accepted when it is still one the bucket
  allows. Which formats actually round-trip therefore needs a real product-path run
  rather than an assumption.
- **Search indexing is decided and implemented: athlete profiles are `noindex`.**
  Staged indexing is now an active founder decision (`DECISIONS.md § Search indexing`).
  `/` and `/athletes/jordan-bell` stay indexable; `/get-started` is `noindex, follow`;
  **every real athlete profile is `noindex, nofollow`, published or not**, and no profile
  may go into a sitemap. Shared links still unfurl — preview crawlers ignore meta robots —
  so nothing an athlete uses is affected. Two things to carry forward: **`noindex` is a
  search control, not an access control** (it does not touch the anonymous API surface —
  see the column-exposure item below), and **the canonical/root-slug question is still
  open and blocks ever allowing profiles to index**, because indexing the wrong URL shape
  is harder to undo than not indexing at all.
- **Anonymous reads are now column-scoped; enumeration is the remaining gap.** `anon` holds
  a column-level `SELECT` on exactly the 18 columns a published profile renders, not a
  table-wide grant (`DECISIONS.md § Anonymous reads are column-scoped`). Contact,
  recruiting, NIL, all six socials and `school_or_team` are refused with 42501 — verified
  live, including via `select=*` and filter predicates. **What is still open:** an
  anonymous caller can enumerate every published profile's *public* columns without
  knowing a slug, so the pilot cohort is one query. Accepted and deliberately out of
  scope — fixing it needs an RPC-by-slug or rate limiting. **Standing obligation:** the
  grant and `PUBLIC_PROFILE_COLUMNS` must name the same columns, and a newly added column
  is invisible to `anon` until explicitly granted. `npm run check:columns` asserts it.
- **Never hardcode an OTP length.** The live project issues 8-digit codes and the length
  is a dashboard setting. The OTP code field must not set `maxLength`.
- **Save always republishes.** Every successful save writes `is_published = true`, which
  matches today's product — the only save action is "Save & View My Profile" and there
  is no way to unpublish. **This must be revisited when draft/unpublish controls
  arrive**: editing an intentionally unpublished profile must not silently republish it.
  See `DECISIONS.md § Publishing`.
- **A stale draft can be republished in one click, without review.** `loadDraft()`
  restores both the draft *and* the step the athlete last reached, so returning to
  `/get-started` — or pressing browser Back after saving — can land straight on Preview
  with older data and an enabled Save button. Combined with auto-publish on every save,
  that means a half-finished profile from a previous session can go live without the
  athlete passing back through any earlier step. Observed during checkpoint 4
  verification, where a resumed draft saved under an unintended slug. **Product
  follow-up, deliberately not fixed in Phase B** — it needs a design decision about
  resume behavior, not a patch.
- **Slug collision cannot be pre-checked.** RLS hides unpublished rows from other users,
  so an availability lookup reports a taken-but-unpublished slug as free. The unique
  constraint is the only truthful answer, so collisions surface as a caught `23505`.
  A consequence worth knowing: the "username taken" message does reveal that an
  unpublished slug exists — accepted, as it is inherent to any unique public namespace.
- **The session proxy fails open, deliberately.** `updateSession` catches any error from
  the Supabase client and serves the request anyway. It runs on every page, so an
  unhandled fault there would 500 the whole site including the marketing pages. Failing
  open is safe only because the proxy makes no authorization decision — the cost is an
  unrotated token for that request, and RLS still governs every read and write. Do not
  add authorization logic to the proxy without revisiting this.
- **Concurrent saves are last-write-wins.** The upsert carries no `updated_at` guard, so
  two tabs saving at once silently overwrite each other with no conflict detection. Fine
  at pilot scale; matters once profiles are edited from phone and laptop.
- **Changing a slug breaks the old URL, with no redirect.** Observed in checkpoint 4
  verification: the previous slug 404s immediately. This is the recorded pilot rule
  working, not a defect — but it is the concrete cost, and a redirect or history table
  is what would remove it.
- **`hero_photo_zoom` validation is coupled to the DB check constraint.** The domain
  layer clamps to 1–1.8 and the column enforces the same range. They agree today; if
  either moves alone, saves start failing on a check violation. Change both together.

## Real external setup state

**Supabase — the athlete product now runs on its own project.** Athlete and Ops are
separated (`DECISIONS.md § Athlete and Ops are separate Supabase projects`):

| Project | Role |
| --- | --- |
| **Athlete Supabase project** | the only project this repo links to |
| **Ops Supabase project** | retained, Ops-only, **never targeted from here** |

Project refs are deliberately not recorded in this repository — it is public, and
`GUARDRAILS.md § Secrets` excludes Supabase project refs from tracked files. The live
ref lives only in gitignored `supabase/.temp/` and in the Supabase dashboard.

All three migrations are applied to the Athlete project and verified `local == remote`:
the `athlete_profiles` table + slug index + `set_updated_at()` trigger, five table RLS
policies, the column-scoped `anon` grant of exactly 18 columns, and the **private**
`athlete-media` bucket with its four Storage policies. `supabase/config.toml` now exists
and is linked to the Athlete project, closing the old "not reproducibly appliable"
gap — the remote ref lives in gitignored `supabase/.temp/`, never in the committed file.

**Transactional email — live, on Resend via Supabase custom SMTP.** `smtp.resend.com:465`,
user `resend`, sender `Athlesite <noreply@athlesite.com>`. The *Confirm signup* and
*Magic link / OTP* templates use `{{ .Token }}` with **no** `{{ .ConfirmationURL }}` — a
link in the email would be a navigation path, and navigating away from onboarding
destroys the in-memory photo state. Template customization is gated behind custom SMTP,
so SMTP must be configured before templates can be edited at all.

**Auth settings on the Athlete project.** OTP length **8**, OTP expiry **3600s**, email
rate limit **30/hour** (raised from the 2/hour default, which only becomes raisable once
custom SMTP is on). Never hardcode an OTP length — it is a dashboard value.

**Domain — owned.** `athlesite.com` is registered through Porkbun. This unblocked Resend
domain verification and therefore custom email.

**Site URL is deliberately still `http://localhost:3000`.** It stays that way until a
deployment host exists; nothing should invent a production URL before then.

**Verified end to end against the live Athlete project (2026-09-23).** A full lifecycle
was driven in a real browser: onboard → 8-digit OTP → hero + profile upload → save and
publish → canonical root URL → sign out → sign back in → text edit → slug change → media
replaced → two successive saves → unpublish → republish. Anonymous checks confirmed the
18 public columns readable, all 17 private columns refused with `42501`, `select=*`
refused, and anon insert/update/delete blocked. All test data was deleted afterwards;
the project is back to 0 profiles, 0 auth users, 0 Storage objects.

Four things that verification established, worth carrying forward:

- **A published athlete's *current* media is enumerable and fetchable by anyone holding
  the publishable key.** The Storage read policy grants `anon` SELECT on objects whose
  owner has a published profile, so the folder can be listed and objects fetched without
  a signed URL. This is the existing policy design, not a regression — "private bucket"
  means no public URL, not no anon access. Media on a published profile is public by
  intent; treat it that way.
- **The verified media-replacement lifecycle left no orphaned objects.** After replacing
  both photos the folder held exactly two objects. Cleanup remains **best-effort** by
  design (see the failed-save follow-up above), and the current contents of a published
  athlete's folder stay listable under the existing Storage policy — so this observation
  narrows the point above without eliminating it.
- **Requesting an OTP creates the auth user immediately.** `shouldCreateUser: true` means
  a mistyped address leaves a permanent unverified, never-signed-in user. One appeared
  during testing from a single abandoned request. Expect strays during the pilot.
- **`service_role` lacks `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on
  `athlete_profiles`**, so ordinary PostgREST CRUD is unavailable to it. It retains
  `TRUNCATE`, `REFERENCES`, and `TRIGGER` privileges. Operator tooling therefore cannot
  read or write athlete rows through PostgREST; deletion goes through
  `owner_user_id … on delete cascade`.

**Still untested: WebP uploads.** PNG has now gone through the product's own upload path
end to end; WebP has not.

**`next dev` is broken on at least one founder machine** — Windows Application Control
blocks Tailwind's native `.node` binary inside Turbopack's PostCSS worker. `npm run build`
and `npm start` are unaffected, and the lifecycle above was verified against a production
build. Machine-local, unrelated to Supabase.

**Deployment — deliberately unresolved.** No provider has been chosen and this is not
yet a founder decision. Do not assume Vercel or any other host, and do not add
host-specific configuration until the founders decide.

## Not present in this repo

No deployment configuration of any kind — no host chosen, so nothing host-specific
exists (`DECISIONS.md § Deployment provider is deliberately undecided`).

No `error.tsx` / `not-found.tsx` boundary. Save failures are shown to athletes in the
UI, but there is no centralized server-side error reporting for founders — so a pilot
athlete's problem is invisible unless they report it.

*(Previously listed here and now built: CI, a PR template, a test runner wired into CI,
a `typecheck` script, and the whole authentication path — all present.)*

## Next

1. **5D.5 — deployment.** Choosing a host is now the critical path; it also resolves the
   Site URL, which is deliberately still localhost.
2. Remaining 5D items from the pilot-readiness audit: privacy/terms pages and the
   guardian-consent process, draft-clearing on shared devices, error boundaries and
   minimum error visibility.

## Blocked on founder

- Pilot definition: how many athletes, by when, and what counts as success.
- Deployment provider.
- Whether `recruiting_status` should ever become publicly readable (deferred at 5D.3, so
  public profiles currently state no recruiting or NIL posture at all).
