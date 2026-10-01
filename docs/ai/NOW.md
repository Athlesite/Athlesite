# NOW — Athlesite current state

Access-boundary checkpoint updated: 2026-09-30 · base `main` @ `0282c013623032e2297ba3fb0f6b3fddbc40a3d5`

Only the access-boundary status was refreshed for 5D.7/5D.8. The older branch table and
Phase B follow-ups below are historical and need a separate reconciliation; do not
treat them as a current inventory without checking the code.

**5D.7 IS MERGED AND LIVE.** The exact-slug RPC read path and the hero-only Storage
boundary are applied to the Athlete project and verified against it. `anon` has no direct
table access; an unrelated signed-in athlete cannot read another athlete's row. Statements
in this file about the *previous* column-grant model are historical unless explicitly
labelled as current.

**5D.8 IS MERGED AND APPLIED LIVE.** PR #20 merged; `main` is at `0282c01`. Its one forward
migration (`20260929000001`) is applied to the Athlete project and the remote migration history
is aligned to the repo version. `public.set_updated_at()` now carries a function-local
`search_path = ''`; SECURITY INVOKER behaviour and the trigger binding are unchanged. The
mutable-search-path advisor warning is **cleared**, leaving only the two expected
SECURITY DEFINER RPC warnings.

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
- **5D.7 — public profile and media access boundary. MERGED, APPLIED LIVE, and verified
  against the live Athlete project.** Merged as `c28a3cc`; all three migrations applied, and
  the remote migration history matches the Git versions. **This is the current live model.**
  *Live now:* public profile reads go through the exact-slug
  `get_published_profile_by_slug(text)` RPC returning only the 18-field public projection;
  `anon` has **no** direct table `SELECT` (401 / `42501`); the shared published-row policy is
  gone, so an unrelated signed-in athlete cannot read another athlete's row or private
  columns; the owner keeps full direct access to their own row plus an RLS-protected fallback
  for previewing their own *unpublished* profile; and non-owner Storage reads are limited to
  the currently referenced hero **in that profile owner's own folder** — superseded and
  orphaned objects are stored but not publicly readable, and `profile_photo_path` is not
  public.
  *Live acceptance: **PASS, 82/82, zero failures**.* Run once against the live project with a
  three-account fixture model (A published, B unpublished, C unrelated published attacker).
  Covered the 18-field projection, unpublished/nonexistent indistinguishability, anon table
  denial, pattern-shaped and array-shaped RPC arguments, all 17 private columns denied to an
  unrelated athlete, owner 35-field access, media allow/deny across
  current/superseded/profile-slot/foreign objects, **all four forgery attempts refused**, and
  unpublish cutting off both profile and hero. All harness mutations were restored and
  independently re-verified afterwards.
  *Fixture cleanup complete.* All 7 fixture Storage objects removed through the Storage API,
  all 3 fixture profile rows deleted, all 3 fixture auth users deleted from the dashboard by
  the founder. Verified afterwards: every fixture refresh token rejected, every old access
  token non-resolving, every fixture slug returning 0 rows from the public RPC, every fixture
  object unsignable.
  *Bearer-credential residuals — accepted for the pilot, measured not assumed.* These are
  **not** immediate-revocation guarantees:
  - The application **requests** 3600s signed URLs. Supabase **accepted longer TTL requests
    in live testing, including 604800s (7 days)** — so Storage does not enforce a one-hour
    maximum; the 1-hour window is a client-side choice.
  - An **already-issued signed URL keeps working after the profile is unpublished**, until
    that URL's own expiry, while a *new* anon signing attempt is correctly refused (400).
  - **Global sign-out revokes refresh/session state** (GoTrue 403, refresh exchange 400) but
    an **already-issued access JWT remains usable against PostgREST until it expires**,
    because that path verifies the signature rather than consulting session state.
  Treat all three as the same class: a credential already handed out outlives the policy
  change that would deny a new one. Revisit if the pilot needs true immediate revocation.
- **5D.8 — `set_updated_at()` search-path hardening. MERGED as `0282c01` and APPLIED LIVE.** Was on
  `claude/5d8-set-updated-at-search-path`. One forward migration
  (`20260929000001_harden_set_updated_at_search_path.sql`) containing a single statement:
  `alter function public.set_updated_at() set search_path = ''`. It replaces no function
  body, and changes no owner, grant, security mode, trigger binding or trigger body —
  `ALTER FUNCTION ... SET` writes only `pg_proc.proconfig`. The function stays SECURITY
  INVOKER. **This exists only to pin that search path**, bringing the one pre-5D.7 function
  in line with the convention the 5D.7 functions already follow.
  *Framing — hardening, not a demonstrated exploit.* The precise rule matters: PostgreSQL
  searches `pg_catalog` implicitly **before** the listed schemas *only when `pg_catalog` is not
  itself named in `search_path`*. A caller who lists it explicitly and later — say
  `search_path = other_schema, pg_catalog` — makes `other_schema` win for a matching function
  name. So an unpinned function's name resolution is, in principle, caller-controlled. Pinning
  `search_path = ''` removes that ordering from the caller's hands entirely, and `now()` still
  resolves safely from the implicit `pg_catalog`. No exploit has been demonstrated here: the
  function is SECURITY INVOKER and grants nothing extra, and the whole body is
  `new.updated_at = now(); return new;`.

## Known follow-ups

- **Failed saves can still leave orphaned media objects, but they are no longer public.**
  Uploads go to fresh versioned paths before the database write, so a save that fails
  afterwards leaves an unreferenced object in the athlete's own folder. The versioning is
  deliberate — it is the cost of never mutating a published profile's photo before the write
  that authorises it. **Historical note worth keeping:** under the folder-scoped Storage policy
  that was live before 5D.7, every object in a *published* athlete's folder was publicly
  readable, orphans and superseded photos included — so the original claim that a leftover was
  "invisible to everyone" was never true. **5D.7 closed that and is now applied:** non-owner
  reads are scoped to the exact referenced hero, so an orphan is readable only by its owner.
  What remains is storage cost, not exposure. Verified live during 5D.7 acceptance, where a
  deliberately orphaned object was refused to anon and signable only by its owner.
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
- **Enumeration and cross-athlete private-column reads: CLOSED and applied live.** Before
  5D.7, `anon` held a column-level `SELECT` on the 18 columns a published profile renders, so
  **an anonymous caller could enumerate every published profile without knowing a slug — the
  pilot cohort was one query.** Worse and less obvious: the shared published-row policy was
  declared `to anon, authenticated` while `authenticated` holds a *table-wide* grant, so **any
  signed-in athlete could read all 35 columns of every published profile**, contact and NIL
  included. `anon` was column-scoped; `authenticated` was not.
  **5D.7 closed both and is applied** (`DECISIONS.md § Public profile reads go through an
  exact-slug RPC`). Verified live in the 82/82 acceptance run: anon direct table reads return
  401 / `42501` including a `limit=1000` bulk attempt, and an unrelated signed-in athlete gets
  zero rows for all 17 private columns of another athlete's profile.
  **Standing obligation:** the public projection must match in both places it is defined —
  the RPC's `returns table` and `PUBLIC_PROFILE_COLUMNS`. `npm run check:columns` asserts that
  parity and, separately, pins **four** reviewed migrations byte-for-byte by SHA-256 — the three
  5D.7 access-boundary migrations plus the 5D.8 search-path hardening migration. It does not
  inspect SQL semantics at all, and a hash pass is not evidence of runtime containment.
- **Never hardcode an OTP length.** The live project issues 8-digit codes and the length
  is a dashboard setting. The OTP code field must not set `maxLength`.
- **Save preserves the chosen publication state — it does not always republish.** This
  entry previously said every successful save writes `is_published = true`. That is no
  longer how the product behaves: `PublishSection` supplies the Visibility value and the
  save writes *that* value alongside every other field, so editing an intentionally
  unpublished profile leaves it unpublished. Two consequences worth holding together:
  the switch is **local component state until Save succeeds**, so "flip the switch" does
  not unpublish anything; and an update does not silently republish. See
  `DECISIONS.md § Publishing`.
- **A stale draft can be republished in one click, without review.** `loadDraft()`
  restores both the draft *and* the step the athlete last reached, so returning to
  `/get-started` — or pressing browser Back after saving — can land straight on Preview
  with older data and an enabled Save button. Combined with a create that publishes by default,
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

**The three 5D.7 migrations and the 5D.8 hardening migration ARE applied**, and the remote
migration history matches the Git versions exactly (`20260825000001`, `20260825000002`,
`20260911000001`, `20260928000001`, `20260928000002`, `20260928000003`, `20260929000001`). The live access model is therefore the 5D.7 one — no
anon table grant, owner-only direct reads, exact-slug RPC, referenced-hero-only Storage —
**not** the column-grant model described in the paragraph above, which is historical.
There is **no production athlete data**: 0 profiles, 0 auth users, 0 Storage objects, after
the 5D.7 acceptance fixtures were fully cleaned up. **5D.8's migration
(`20260929000001`) IS applied**, with the remote history aligned to the repo version;
`public.set_updated_at()` has a function-local `search_path = ''`, its SECURITY INVOKER
behaviour and trigger binding unchanged, and the mutable-search-path advisor warning is cleared
— only the two expected SECURITY DEFINER RPC warnings remain. `supabase/config.toml` now exists
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

- **PRE-5D.7, HISTORICAL — a published athlete's *whole folder* was enumerable and fetchable
  by anyone holding the publishable key.** The old Storage read policy granted `anon` SELECT
  on every object whose owner had a published profile, so the folder could be listed and any
  object in it fetched. **5D.7 replaced that and is applied:** a non-owner now reaches only
  the *currently referenced* `hero_photo_path` in that profile owner's own `hero` folder.
  Current behaviour, verified live: listing a published athlete's hero folder as anon returns
  **exactly the one referenced object**, their profile folder returns **nothing**, and an
  unpublished athlete's folder returns **nothing**. "Private bucket" still means no public
  URL rather than no anon access — but that access is now one object, not a folder.
- **The verified media-replacement lifecycle left no orphaned objects.** After replacing
  both photos the folder held exactly two objects. Cleanup remains **best-effort** by
  design (see the failed-save follow-up above). Re-confirmed during 5D.7 acceptance: a clean
  replace deleted the superseded object, so the orphan used as a fixture had to be created
  deliberately. Under the current policy an orphan would in any case be readable only by its
  owner.
- **Requesting an OTP creates the auth user immediately.** `shouldCreateUser: true` means
  a mistyped address leaves a permanent unverified, never-signed-in user. One appeared
  during testing from a single abandoned request. Expect strays during the pilot.
- **`service_role` lacks `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on
  `athlete_profiles`**, so ordinary PostgREST CRUD is unavailable to it. It retains
  `TRUNCATE`, `REFERENCES`, and `TRIGGER` privileges.
  **Corrected at 5D.9 — the cascade is NOT the account-deletion path.** Earlier wording here
  said "deletion goes through `owner_user_id … on delete cascade`". That cascade is real
  (`auth.users` → `athlete_profiles`) but relying on it would be actively unsafe: **nothing
  cascades to Storage.** Deleting the Auth user first removes the profile row while the media
  survives, and the reliable route to removing it is gone: Storage owner authorization is keyed on
  `auth.uid()` and no new owner credential can be minted. A token issued *before* the deletion may
  still carry that claim until it expires, so this is **not** a claim that the files instantly
  become admin-only — only that nothing dependable remains to clean them with.
  The correct order is **media → profile row → Auth user, strictly in that sequence**, all of it
  owner-authorised except the final manual Auth step. An authenticated owner can already delete
  their own row and their own objects (both policies exist and were exercised live during 5D.7
  cleanup), so no elevated credential is needed for the first two. See
  `docs/ai/RUNBOOK-deletion.md`.

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

1. **5D.7 — access boundary. COMPLETE.** Reviewed (five rounds), merged as `c28a3cc`, all
   three migrations applied, live acceptance PASS 82/82, fixtures cleaned up. Nothing
   outstanding.
2. **5D.8 — `set_updated_at()` search-path hardening. COMPLETE.** PR #20 merged as `0282c01`;
   the migration is **applied live** and the remote history is aligned to `20260929000001`.
   `public.set_updated_at()` has a function-local `search_path = ''`, SECURITY INVOKER behaviour
   and trigger binding unchanged, mutable-search-path advisor warning cleared, only the two
   expected SECURITY DEFINER RPC warnings remaining. Nothing outstanding.
3. **5D.9 — account and data lifecycle readiness. On a branch; design + tooling only.** On
   `claude/5d9-account-lifecycle`, based on `0282c01`. Adds `docs/ai/RUNBOOK-deletion.md`, an
   owner-scoped founder-only local tool, and pure safety helpers. **No live deletion has been
   performed, no fixtures created, no policy, migration or Storage rule changed, and no
   service-role or admin capability introduced.** Locked pilot decision: **Option A —
   founder-assisted permanent deletion**, with Auth-user deletion performed manually and
   strictly last.

   *Two repair passes applied, after two independent reviews returned NEEDS CHANGES.* The
   sequencing lives in `scripts/lifecycle/orchestrator.mjs` behind injected ports, so orderings and
   refusals are testable without a project; the CLI is a thin adapter. What to know before reading
   the code:

   - **Post-Auth verification needs no athlete session.** `--mode verify-public` exists because the
     original design asked a deleted user for an OTP, which cannot succeed. Owner-scoped absence is
     proven *before* Auth deletion and recorded. Afterwards the tool cannot obtain a fresh owner
     session — and it does **not** claim a previously issued token is therefore harmless; whether
     one still reads or writes is measured, not assumed.
   - **Completion needs recorded outcomes, not an acknowledgement.** `verified-complete` requires
     the recorded Auth deletion, the stale-token READ **and** WRITE outcomes, and — if either
     capability remained — the expiry windows passed, the probe object removed, the public check
     re-run, and a founder attestation of the admin-side cross-check.
   - **Public absence is three-valued** (absent / exposed / **unknown**), gated everywhere, and a
     fresh contradiction outranks a stored `verified-complete`.
   - **Fresh auth at every destructive boundary.** Startup auth is never reused; each boundary
     re-validates the session against the bound uid.
   - **Resuming never inherits a proof.** A published row, replacement row, unresolved inventory
     entry, or missing confirmation stops the run; an object that regressed from verified-absent is
     a regression, not a retry, and rolls the checkpoint back.
   - **The lock's dead-holder recovery is itself atomic** — gated on a per-instance recovery token,
     because plain unlink-and-recreate lets two live workers through. Everything ambiguous (corrupt
     record, missing pid, no instance id, another host) fails closed to manual cleanup.
   - **The inventory is a strict versioned schema** (format 2) validating path ownership on every
     load and checkpoint/evidence consistency.
   - **Enumeration ceilings are global** to the traversal, not per page loop.

   - **Every destructive entry point re-checks the public surface**, and the completion check is
     issued *after* the stale-token probes rather than reused from the top of the run.
   - **Residual obligations are monotonic**: a later "no" cannot discharge a capability or a probe
     cleanup an earlier run recorded.
   - **Enumeration budgets are true hard maximums**, checked before each request.

   - **A probe object is identified by generation, not by its key**, so a probe recreated at a key
     that was already cleaned up is a new obligation rather than an inherited resolution.
     Enumeration counts request *attempts*, so a failing backend cannot exceed `maxPages`.
   - **The authoritative inventory is loaded inside the lock.** Only the lock key is derived before
     acquisition, and a pre-lock snapshot is never merged over newer on-disk state — otherwise a run
     that waited for the lock could write back a copy that predates the previous holder's work.

   Tests: **352 passing** across 9 files — `orchestrator 108`, `checkpoints 70`, `store 58`,
   `enumerate 36`, `binding 27`, `resumption 15`, `terminal 14`, `cli 13`, `reauth 11` — including
   seven two-process lock cases (one repeating the dead-holder recovery race ten times) and five
   serialised-run cases proving newer obligations, probe generations and checkpoints survive a waiting
   second run. Next: independent review, then the §17 live acceptance matrix against disposable
   fixtures.
4. **5D.5 — deployment.** Vercel Pro and deployment are **deliberately deferred** until
   closer to real pilot athletes, to avoid recurring cost during pre-pilot work. Vercel
   remains the selected host. When resumed: project setup, Production-only environment
   values, apex and `www` domains, and the Supabase Site URL change, each separately
   authorized, with on-host redirects validated before launch.
5. Remaining 5D items from the pilot-readiness audit: privacy/terms pages and the
   guardian-consent process, draft-clearing on shared devices, and minimum error visibility.

## Blocked on founder

- Pilot definition: how many athletes, by when, and what counts as success.
- Whether `recruiting_status` should ever become publicly readable (deferred at 5D.3, so
  public profiles currently state no recruiting or NIL posture at all).
