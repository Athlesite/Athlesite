# NOW — Athlesite current state

Access-boundary checkpoint updated: 2026-09-28 · base `main` @ `d64bf1e37f4cc964d698645cbd3bae80909ff63e`

Only the access-boundary status was refreshed for 5D.7. The older branch table and
Phase B follow-ups below are historical and need a separate reconciliation; do not
treat them as a current inventory without checking the code.

**Read this before assuming anything about access control.** 5D.7 changes the
public/private read boundary, and it exists **only on a task branch**. The live Athlete
project still enforces the *previous* model. Where this file describes access, it says
which of the two it means.

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
- **5D.7 — public profile and media access boundary. Implemented on a branch, five
  independent review rounds recorded, NOT applied anywhere.** On `claude/5d7-access-boundary-hardening`; nothing committed, no
  migration run on any project. **Everything below is what the branch *intends*. None of it
  is live.**
  *Intended changes:* public profile reads move to an exact-slug
  `get_published_profile_by_slug(text)` RPC returning only the 18-field public projection;
  `anon` loses direct table `SELECT` entirely; the shared published-row policy is dropped so
  an unrelated signed-in athlete can no longer read another athlete's row or private columns;
  the owner keeps full direct access to their own row plus an RLS-protected fallback for
  previewing their own *unpublished* profile; and non-owner Storage reads narrow to the
  currently referenced hero **in that profile owner's own folder** — so superseded and
  orphaned objects would remain stored but stop being publicly readable, and
  `profile_photo_path` would stay non-public.
  *Still live, and still exposed until migrations are applied:* bulk enumeration by `anon`,
  all-35-column reads of any published profile by any signed-in athlete, and the
  **folder-scoped Storage policy** under which every object in a published athlete's folder —
  superseded photos and orphans included — is publicly readable.
  Three migrations, numbered so filename order *is* the safe apply order (RPC → Storage →
  revoke); applying the revoke before the Storage policy would break every published hero.
  *Five rounds of independent Codex review have run, each returning NEEDS CHANGES and each
  narrower than the last; rounds 4 and 5 found only harness-validation and documentation
  issues, with the migration SQL, hash contract, `.gitattributes`, migration ordering and
  core access boundary all passing.* Round 1 found a real
  defect: the media helper asked only whether *some* published row referenced a path, which is
  forgeable — an athlete could point their own published `hero_photo_path` at a victim's object
  and keep it publicly readable after the victim unpublished or replaced it. Fixed by binding
  the object's folder segment to that row's own `owner_user_id`, plus a hero-slot check.
  Rounds 2 and 3 both rejected the *static guard*, not the SQL: a structural checker still
  accepted appended executable statements, and a hand-written canonicaliser still lost to
  PostgreSQL's lexical rules (nested block comments, dollar-quote tags, unterminated
  comments). **Round 3 confirms the SQL source itself is sound.**
  The guard is now **SHA-256 hash pinning over the raw bytes** of the three reviewed
  migrations, recorded in `scripts/sql-contract.mjs`, with nothing normalised and the lexer
  deleted. `.gitattributes` pins `*.sql` to `eol=lf` — without it the same commit would hash
  differently on Windows and Linux CI, which would have broken on first push. Any byte change
  fails until the digest is deliberately updated and re-reviewed; a comment typo failing is
  intended. **It is change detection, not runtime privilege isolation and not proof the SQL is
  safe:** `postgres` owns both functions and bypasses RLS at runtime.
  Local checks all pass: lint, typecheck, **309 tests** (234 pre-existing + 6 read-path
  decisions + 29 hash contract + 16 signed-URL resolver + 24 response classifiers), build, `check:columns`, `check:slugs`, and `check:redirects`
  against a deliberately env-less build proven not to contain the project ref. Live
  verification is written (`scripts/verify-access-boundary.mjs`, ~70 assertions,
  endpoint-specific denial shapes, forgery writes verified before their denial assertions,
  allowlisted diagnostic codes) and **gated behind `ATHLESITE_LIVE_ACCEPTANCE=1`; it has not
  been run and no fixtures exist.**
  **Next gate: staging and commit, then founder approval to apply the
  migrations**, then the live run, then manual fixture deletion.

## Known follow-ups

- **Failed saves can leave orphaned media objects, and today those orphans are PUBLIC.**
  Uploads go to fresh versioned paths before the database write, so a save that fails
  afterwards leaves an unreferenced object in the athlete's own folder. The versioning is
  deliberate — it is the cost of never mutating a published profile's photo before the write
  that authorises it. **What was wrong was calling the leftover "invisible to everyone":**
  under the folder-scoped Storage policy that is currently live, every object in a *published*
  athlete's folder is publicly readable, orphans and superseded photos included. So an athlete
  who replaced a photo still has the old one fetchable by anyone holding the path.
  5D.7 would close this by scoping reads to the exact referenced object, but **that migration
  is on a branch and not applied** — so until it is, treat this as a live exposure rather than
  harmless housekeeping, and note that a storage cleanup pass is *not* what fixes it.
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
- **Enumeration and cross-athlete private-column reads: fixed on the 5D.7 branch, still
  open live.** On the **live** project as it stands today, `anon` holds a column-level
  `SELECT` on exactly the 18 columns a published profile renders, and **an anonymous caller
  can enumerate every published profile's public columns without knowing a slug — the pilot
  cohort is one query.** Worse and less obvious: the shared published-row policy is declared
  `to anon, authenticated` while `authenticated` holds a *table-wide* grant, so **any
  signed-in athlete can read all 35 columns of every published profile**, contact and NIL
  included. `anon` was column-scoped; `authenticated` was not.
  **Both are closed by 5D.7** (`DECISIONS.md § Public profile reads go through an exact-slug
  RPC`), which is implemented on a branch and **not applied** — so treat both as live gaps
  until migrations are approved and run. Nothing may be published to real athletes before
  then. **Standing obligation, which changes shape at 5D.7:** the public projection must
  match in both places it is defined. Today that is the `anon` grant and
  `PUBLIC_PROFILE_COLUMNS`; once 5D.7 is applied it becomes the RPC's `returns table` and
  `PUBLIC_PROFILE_COLUMNS`. `npm run check:columns` asserts that parity and, separately,
  pins the three 5D.7 migrations byte-for-byte by SHA-256 — it does not inspect SQL
  semantics at all.
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

The **first three** migrations are applied to the Athlete project and verified
`local == remote`: the `athlete_profiles` table + slug index + `set_updated_at()` trigger,
five table RLS policies, the column-scoped `anon` grant of exactly 18 columns, and the
**private** `athlete-media` bucket with its four Storage policies.

**The three 5D.7 migrations are NOT applied anywhere.** They exist only on
`claude/5d7-access-boundary-hardening`. So the live access model is still the one described
above — column-scoped `anon` grant, shared published-row policy, folder-scoped Storage
reads — and it stays that way until migrations are explicitly approved and pushed. There is
**no production athlete data**: 0 profiles, 0 auth users, 0 Storage objects, which is why
this is the cheapest possible moment to change the access model. `supabase/config.toml` now exists
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
deployment is ready. The selected future production origin is
`https://athlesite.com`; the live Supabase setting has not been changed.

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

**Deployment — Vercel Pro selected; repository preparation (5D.5B).** The canonical
production origin is `https://athlesite.com`; `www.athlesite.com` will redirect to
the apex. Marketing/app subdomains are deferred. No Vercel project, DNS change,
live Supabase configuration change, or additional Supabase project is part of this
checkpoint. Production environment values are not committed. Preview deployments
must have no production Athlete Supabase configuration; only marketing and the
fictional example work without it. Auth and real-profile routes fail at request time.
See `DECISIONS.md § The athlete app deploys to Vercel Pro` for environment scoping,
the required `supabase config diff` review before future config pushes, and
organization-wide Supabase billing implications for Athlete and Ops.

## Not present in this repo

No live deployment setup yet. Repository preparation pins Node 24 to match CI,
adds a validated metadata origin with a localhost default, and provides branded
`error.tsx` / `not-found.tsx` fallbacks. The error boundary covers children of the
root layout, not errors in the root layout itself. There is still no centralized
error reporting or alerting for founders; the boundary logs only a digest in the
browser. Error visibility remains follow-up work.

*(Previously listed here and now built: CI, a PR template, a test runner wired into CI,
a `typecheck` script, and the whole authentication path — all present.)*

## Next

1. **5D.7 — access boundary.** Independent Codex review of
   `claude/5d7-access-boundary-hardening`. Then, as separate approvals: apply the three
   migrations in filename order (RPC → Storage → revoke), create live fixtures, run the
   gated acceptance harness, delete the fixtures. Nothing goes to a real athlete until this
   lands — the live project still allows bulk enumeration and cross-athlete private-column
   reads.
2. **5D.5 — deployment.** Vercel Pro and deployment are **deliberately deferred** until
   closer to real pilot athletes, to avoid recurring cost during pre-pilot work. Vercel
   remains the selected host. When resumed: project setup, Production-only environment
   values, apex and `www` domains, and the Supabase Site URL change, each separately
   authorized, with on-host redirects validated before launch.
3. Remaining 5D items from the pilot-readiness audit: privacy/terms pages and the
   guardian-consent process, draft-clearing on shared devices, and minimum error visibility.

## Blocked on founder

- Pilot definition: how many athletes, by when, and what counts as success.
- Whether `recruiting_status` should ever become publicly readable (deferred at 5D.3, so
  public profiles currently state no recruiting or NIL posture at all).
