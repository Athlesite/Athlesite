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

**Factually stale repo comment, recorded 2026-10-06.** This entry is correct and the code
agrees with it — `EditProfileForm` handles `slugChangedThisSave`, so **slugs are editable
after publication today**, and **no slug history exists**. But
`supabase/migrations/20260825000001_create_athlete_profiles.sql` still comments that the slug
is "Editable pre-publish, locked afterward at the application layer". **No such lock exists**;
that comment predates this decision and contradicts both it and the code. The comment is
corrected in code at the next checkpoint that touches slugs — **not** in this
documentation-only checkpoint. Consequences run both ways: a mis-chosen minor handle *is*
fixable, and a minor can also change their public URL freely with nothing recording the prior
one.

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

**Corrected 2026-10-07 (PR #26, merge commit `f036ba60453fcdfa0506aa2a3b84a48e47f74309`).** Auth
still occurs at save, not at wizard entry — that part of this decision is unchanged. But "the
pre-auth draft stays in browser `localStorage`" above is no longer true: **pre-auth onboarding
state is now memory-only**. A refresh or closed tab loses unsaved progress rather than resuming
it from storage. On onboarding entry, a one-time purge removes the old
`athlesite:onboarding:draft` / `:step` keys and every legacy `athlesite:athlete:*` key (the
pre-Supabase per-slug profile store). "Without losing draft state" in Rules out still holds for
a mid-flow sign-in specifically, because the wizard stays mounted through the inline OTP
exchange — that is in-memory React state surviving, not `localStorage`.

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
**Superseded** · 2026-09-11 → 2026-09-28 · replaced by "Public profile reads go through
an exact-slug RPC; nothing else reads the table", immediately below.
It established the 18-column public projection, and the point that RLS restricts *rows*
while only grants restrict *columns*. Checkpoint 5D.7 **revoked** that `anon` grant
outright — migration `20260928000003` is applied, so **this mechanism no longer exists on
the live Athlete project**. What the entry defined, the 18-column projection, survives
unchanged as the RPC's return type. Git holds the full original entry.

### Public profile reads go through an exact-slug RPC; nothing else reads the table
**Active** · 2026-09-28 · founder decision · supersedes "Anonymous reads are
column-scoped, not only row-scoped" (2026-09-11)

**Decision.**

> **Tense.** Every bullet below describes the **current live model**. All three migrations
> are applied to the Athlete project and were verified against it (82/82 live acceptance).
> The superseded entry above is history, not a description of anything still in force.

- **Public profile access is unchanged where it matters:** an athlete's profile stays
  readable at their exact URL, `/{slug}`. Nothing about sharing a link changed.
- **Published means the exact link works. It does not mean enumerable, searchable, or
  discoverable.** That distinction is now a database boundary rather than an intent.
- `anon` **holds no** `SELECT` on `public.athlete_profiles` — neither a table grant nor a row
  policy. Migration `20260928000003` revoked the grant and dropped the policy; anonymous
  direct table reads now return 401 with `42501`, verified live, including a `limit=1000`
  bulk attempt.
- **An unrelated authenticated user cannot read another athlete's row at all**,
  private columns included. This was the larger of the two holes: the superseded policy was
  declared `to anon, authenticated` while `authenticated` held a table-wide grant, so any
  signed-in athlete could read **all 35 columns** of every published profile —
  `recruiting_contact`, `nil_contact`, `school_or_team`, and all six socials included.
  `anon` was column-scoped; `authenticated` was not. Signing in must never grant access to
  another athlete's private fields.
- All public reads go through `public.get_published_profile_by_slug(text)`: exactly one
  scalar slug, compared with equality, `is_published = true` hard-coded in the body,
  `limit 1`.
- The RPC returns exactly the approved **18-field** projection as explicit scalar columns —
  deliberately **not** `setof public.athlete_profiles`, which would expose all 35 as the
  contract and widen silently every time a column is added.
- **The owner keeps direct table access to their own full row** (all 35 columns) under the
  unchanged owner policies. `/edit-profile` is unaffected.
- **An owner previewing their own unpublished profile** uses an RLS-protected fallback read
  of the same 18 columns. The RPC refuses unpublished rows to *everyone*, owner included,
  so the fallback is what keeps preview working — and it selects only the public projection
  so no private column can reach the rendered payload.
- **Non-owner Storage reads require all four of:** the profile is published, the object name
  equals its `hero_photo_path` exactly, the object's folder segment equals *that profile's
  own* `owner_user_id`, and the slot segment is `hero`. The owner binding is not a sanity
  check — `hero_photo_path` is owner-writable *and* publicly readable, so without it any
  athlete could copy a victim's hero path off their public profile, point their own published
  row at it, and keep the victim's object readable after the victim unpublished or replaced
  it. Enforced in the database, not by validating what an athlete may write to that column.
  (Caught by Codex review before the migration was ever applied.)
- **`profile_photo_path` remains non-public.** It is in no public projection and no public
  page renders it. Exposing profile media is a separate coordinated product + policy change
  that must move the projection and the Storage helper together.
- **Superseded and unreferenced media may remain stored** and simply stop being publicly
  readable. Nothing is deleted for being old; cleanup stays best-effort and owner-driven,
  and the ambiguous-write reconciliation path is untouched.
- **Discovery remains a separate future visibility concept requiring founder approval.** It
  is not implied by publishing, and this design gives it no mechanism.

**Why a function, and not a narrower grant or a view.** A view is still queried with
arbitrary filters and cannot demand an argument, and *any* column grant leaves a filterless
bulk read expressible — which is exactly how the pilot cohort became one query. Only a
function can require a slug before it returns anything.

**Why `postgres` owns the RPC (Option A).** `SECURITY DEFINER` runs with the owner's
privileges, so the owner choice *is* the security model. A dedicated least-privilege owner
role was designed, evaluated, and **rejected for now** on operational grounds:
- PostgreSQL 16+ auto-grants a `CREATEROLE` creator only `ADMIN TRUE, **SET FALSE**`, so
  `ALTER FUNCTION … OWNER TO` needs a further non-obvious grant before it will succeed.
  Verified against the PostgreSQL 16/17 documentation.
- **The decisive reason:** there is no Docker on the founders' machines, so there is no
  local stack and no shadow database. None of the above can be rehearsed — the first
  execution would be against the only real database, which is also the pilot's production.

An earlier draft of this entry also claimed a migration-created role would be absent from a
`roles.sql`-based restore and therefore fail on recovery. **That claim is withdrawn**: it was
reasoning from documentation about one restore path, not something we verified, and Supabase
offers more than one. The rehearsal problem above is the reason that actually holds, and it
is sufficient on its own.

**The consequence of Option A, accepted explicitly and not mitigated away.** Because
`postgres` owns `athlete_profiles`, the function bypasses RLS at runtime and can read every
column. The hard-coded `is_published = true` and the explicit return list are the *only*
runtime enforcement. **There is no runtime privilege isolation on this path, and nothing in
CI creates any.**

`npm run check:columns` is a **static review gate** — explicitly *not* a substitute for a
least-privilege owner, and it must never be described as one. It constrains what SQL can
reach review and `db push`; it does nothing once the function is running.

**These three migrations are pinned byte-for-byte by SHA-256. Any change requires an
explicit contract update and renewed security review.**

`supabase/migrations/20260928000001_add_published_profile_rpc.sql`,
`…0002_scope_media_reads_to_referenced_hero.sql`, and
`…0003_restrict_profile_table_reads.sql` each have a digest recorded in
`scripts/sql-contract.mjs`. Nothing is normalised — not comments, whitespace, case, quoted
identifiers, string literals, or line endings. `.gitattributes` pins `*.sql` to `eol=lf`
because a raw-byte digest is only meaningful if every checkout produces the same bytes, and
this repo is developed on Windows with `core.autocrlf=true` while CI runs on Linux.

**How it got here, after three rejected attempts.** The first guard asserted keyword presence;
Codex bypassed it with a private column aliased as a public one, `row_to_json(p)::text`, and
attributes moved into a comment. The second decomposed the SQL structurally; Codex bypassed
that by appending executable statements the decomposition never inspected — `grant all … to
public`, `alter function … security invoker`, a second `create or replace function`. The third
canonicalised the SQL with a hand-written lexer; Codex bypassed that too, because PostgreSQL's
lexical rules (nested block comments, dollar-quote tags, unterminated comments, escape-string
syntax) are richer than any checker short of a real parser. Each fix was an escalation toward
writing a PostgreSQL parser, which is the wrong destination. A hash has nothing to
out-reason.

**Deliberately brittle.** A comment typo or a reflowed line fails the contract. That is the
intended behaviour: updating the digest is a small, obvious diff that forces a second look at
a security boundary. The question a failure asks is "has this migration been re-reviewed?",
not "how do I make the check pass".

Coverage: `scripts/sql-contract.test.mjs` holds **40 tests — 6 baseline, 13 bypass
regressions, 10 for the 5D.8 search-path migration, 4 asserting the brittleness is intentional
(comment, whitespace, trailing newline, and CRLF conversion all fail), 5
application-projection-parity, and 2 for the digest primitive.** The bypass cases include the
nested-comment wrapper and unterminated block comment that defeated the lexer. One baseline
test pins the three 5D.7 digests and byte lengths independently, so adding a migration to the
contract cannot quietly disturb them.

**What the hash does NOT prove.** That the SQL is safe, or correct. It proves only that the
bytes are the reviewed bytes. Correctness rests on human review and the live acceptance
harness. The projection-parity check alongside it is an *application-consistency* check — it
catches the app's select list drifting from the intended 18 fields, and says nothing about SQL
safety either. **Treat a hash failure as a request for renewed security review** — and never
read a pass as evidence of runtime containment.

**Revisit when** a reproducible local Supabase roles workflow exists — Docker plus
`supabase/roles.sql` pushed with `--include-roles`. A dedicated least-privilege owner is the
better model and becomes safe to adopt once it can be rehearsed.

**Rules out.** Reading athlete data anonymously through the table at all; making a column
public by granting it rather than by adding it to the RPC projection; pattern matching
(`LIKE`, prefix, regex, arrays) anywhere in either function body; and introducing a second
visibility concept — unlisted, discoverable, preview tokens — without redesigning the RPC
and the Storage policy together with founder sign-off.

**Known residuals, recorded rather than discovered later.**
- **The media helper binds owner and slot but does not validate the full
  `{owner}/{slot}/{uuid}` format.** It checks path segments 1 and 2 only, so a malformed
  path with extra segments could still match if segments 1 and 2 are correct. Acceptable: a
  malformed path that satisfies the owner binding is necessarily *inside the caller's own
  folder*, so it cannot widen cross-owner access, which is the property that matters.
- **Bearer credentials outlive the policy change that would deny a new one. MEASURED LIVE,
  not assumed — and accepted for the pilot.** These are explicitly **not**
  immediate-revocation guarantees:
  - The application *requests* a **3600s** TTL (`SIGNED_URL_TTL_SECONDS` in
    `profile-repository.ts`). Supabase **granted every longer TTL requested in live testing,
    including 604800s (7 days)**, returning the requested lifetime essentially verbatim. So
    Storage does **not** enforce a one-hour maximum; the one-hour window is a client-side
    choice and must never be described as an enforced ceiling.
  - An **already-issued signed URL kept working after the profile was unpublished** (HTTP 200),
    until that URL's own expiry, while a *new* anonymous signing attempt was correctly refused
    (400). Tightening the policy does not revoke access already handed out.
  - **Global sign-out revokes refresh/session state but not issued access JWTs.**
    `supabase.auth.signOut()` is global-scope: after it, GoTrue returned 403 and the refresh
    exchange 400, yet the already-issued access token **still authenticated against PostgREST**
    until expiry, because that path verifies the signature rather than consulting session
    state.
  Treat all three as one class. If the pilot ever needs true immediate revocation, that is a
  separate design problem — shorter TTLs, a revocation check, or both — not something the
  current policies provide.
- **Storage listing is narrowed, not eliminated.** A non-owner `LIST` still succeeds and
  still reveals the currently public hero object. There is nothing further to enumerate, but
  this is a narrowing of enumeration rather than its removal, and should not be described as
  "listing is denied".
- **An authenticated user can read objects under their own uid folder with no profile row.**
  Deliberate, consistent with the existing insert/update/delete policies, and confined to
  their own folder — see the migration comment in `20260928000002` for why it is required.

**Status: MERGED AND APPLIED LIVE.** Merged as `c28a3cc`; all three migrations applied to the
Athlete project, with the remote migration history matching the Git versions. **This entry now
describes the live model, not an intent.** The superseded column-grant entry above is history.

**Five rounds of independent Codex review ran**, each returning NEEDS CHANGES and each
narrower: round one found the cross-owner media forgery (a real defect in the SQL); rounds two
and three rejected the static guard, not the SQL — a structural checker still accepted appended
executable statements, and a hand-written canonicaliser still lost to PostgreSQL's lexical
rules — which is how the guard ended up as byte-for-byte hash pinning; rounds four and five
found only harness-validation and documentation issues. **The SQL source was confirmed sound
from round three onward.**

**Live acceptance: PASS, 82 of 82, zero failures**, run once against the live project
(`scripts/verify-access-boundary.mjs`, three-account fixture model — A published, B
unpublished, C unrelated published attacker). It exercised the 18-field projection,
unpublished/nonexistent indistinguishability, anon table denial including a bulk attempt,
pattern- and array-shaped RPC arguments, all 17 private columns denied to an unrelated athlete,
owner 35-field access, media allow/deny across current/superseded/profile-slot/foreign objects,
**all four forgery attempts refused** (three cross-owner, one same-owner profile-slot), and
unpublish cutting off both profile and hero. Every harness mutation was restored and
independently re-verified. **Fixture cleanup is complete** — 7 Storage objects, 3 profile rows,
3 auth users — leaving 0 profiles, 0 auth users, 0 Storage objects.

**Two findings the live run produced that the design had not predicted, both now fixed or
recorded.** The Storage API returns `signedURL` **relative to the Storage API base**
(`/storage/v1`), not to the project origin; resolving it against the origin 404s, and a 404 is
indistinguishable from a correct access denial, so that bug would have manufactured false
passes in an access-boundary harness. And `anon` table denial surfaces as **HTTP 401 with
`code=42501`**, not 403 — the assertion accepts either, and branches on the SQLSTATE rather
than the status.

**Constrained 2026-10-06 (privacy/consent policy record).** The approved minor public
projection is strictly **smaller** than the 18-field projection described here. Implementing
it will require an **age-aware** public read — either a conditional projection inside this
function or a separate RPC — which touches this access boundary directly and **must receive
its own review**. Nothing here has changed yet: the projection is currently age-neutral.

### Every function in `public` pins an empty `search_path`
**Active** · 2026-09-29 · Checkpoint 5D.8

**Decision.** Every function this project defines in `public` sets `search_path = ''`
explicitly. `get_published_profile_by_slug` and `is_publicly_referenced_media` did so from the
moment they were written (5D.7). `set_updated_at()` predates that convention and is brought in
line by `20260929000001_harden_set_updated_at_search_path.sql`, whose entire content is:

```sql
alter function public.set_updated_at()
  set search_path = '';
```

**Why, honestly scoped.** This is consistency and defence in depth, **not** a fix for a
demonstrated exploit, and it should not be written up as one.

The precise PostgreSQL rule is narrower than "pg_catalog always wins", and the difference is
the whole point of pinning:

- When `pg_catalog` is **not** explicitly listed in `search_path`, PostgreSQL searches it
  **implicitly, before** the listed schemas.
- When a caller lists it explicitly and **later** — for example
  `search_path = other_schema, pg_catalog` — that earlier schema is searched first and **can
  win** for a matching function name.

So an unpinned function's name resolution is in principle **caller-controlled ordering**.
Setting `search_path = ''` removes that from the caller's hands: resolution no longer depends on
whatever the calling session configured, and `now()` still resolves safely from the implicit
`pg_catalog`.

What is *not* being claimed: any exploit here. `set_updated_at()` is SECURITY INVOKER, so it
confers no privilege of its own; its body is `new.updated_at = now(); return new;`, where
`new.updated_at` is a PL/pgSQL record field resolved by the language rather than by schema
lookup. The value of pinning is that the guarantee stops depending on that reasoning staying
true if the body is ever edited, and it clears Supabase's `function_search_path_mutable` lint.

**Why `ALTER`, not `CREATE OR REPLACE`.** `ALTER FUNCTION … SET` writes only
`pg_proc.proconfig`. It cannot touch `prosrc`, `proowner`, `proacl`, or `prosecdef`, so "the
body, owner, grants, security mode, trigger binding and trigger body are all unchanged" holds
by construction rather than by careful authoring. `20260825000001` declared the function and is
applied, so it is not edited (`GUARDRAILS.md § Migrations`).

**Pinned by the hash contract.** `scripts/sql-contract.mjs` covers the three 5D.7
access-boundary migrations **and this 5D.8 hardening migration** — four in total.
`npm run check:columns` fails if the raw bytes of any pinned migration change, and stays
failing until the new bytes are deliberately reviewed and re-pinned. That is change detection
only: it proves the bytes are the reviewed bytes, never that the SQL is semantically safe.

**Status.** Merged as `0282c01` (PR #20) and **applied to the Athlete project**, with the remote
migration history aligned to the repo version `20260929000001`. Verified live:
`public.set_updated_at()` carries a function-local `search_path = ''`, SECURITY INVOKER behaviour
is unchanged, and the trigger binding is unchanged. The `function_search_path_mutable` advisor
warning is cleared; the only remaining advisor warnings are the two expected SECURITY DEFINER RPC
ones.

**Rules out.** Adding a function to `public` without pinning its `search_path`; and using
`CREATE OR REPLACE FUNCTION` where an `ALTER` suffices, since the former silently permits body,
security-mode, and volatility changes to ride along.

---

### Minor participation is guardian-first, and under-13 athletes are excluded
**Active** · 2026-10-06 · founder decision · Checkpoint "privacy/consent policy record"

**Decision.** Three brackets, enforced before Athlesite retains anything:

- **Under 13 — prohibited from the pilot.** Blocked **before** the OTP send, before account
  creation, and before any personal profile data is retained. **A blocked attempt persists
  nothing** — no account, no row, no draft.
- **13–17 — guardian-first for the invited pilot.** Guardian **participation approval** is
  required *before Athlesite retains the athlete's personal profile data*. A **second, separate**
  guardian approval of the **exact proposed public revision** is required before publication.
  Two approvals, two different questions.
- **18+ — self-consent** via Terms and Privacy acceptance.

**Age data is minimal.** An exact date of birth may be entered **transiently** to determine
eligibility and is **never persisted**. Athlesite stores minimal eligibility state plus **enough
attestation history to explain how an eligibility decision was reached and how a correction was
handled**. **A DOB-equivalent is not stored merely to automate the transition at 18** — an 18th
birthday date is reversible to the birth date, which would defeat the minimisation for a
convenience the pilot does not need.

**Adulthood is never inferred from `class_year`.** It is self-reported, unverified, routinely
wrong, and a graduating senior may still be 17. A former minor claiming adulthood requires a
**fresh adult attestation**; eligibility never flips on a stored date calculation.

**Guardian-first-at-retention is a conservative pilot product choice, not a claim that every
jurisdiction legally requires guardian consent before account creation.** Athlesite is an
invited pilot handling minors' names, photographs and locations; taking the stricter posture
while counsel reviews costs completion rate, not safety. The cost is real and accepted: a 13–17
athlete cannot begin building until a guardian responds.

**Status.** Policy only. **No age gate, guardian flow, or eligibility persistence exists yet.**

**Pending legal review.** Whether guardian-first-at-retention is required or merely prudent in
the pilot jurisdictions; the appropriate self-consent age; COPPA exposure were under-13 ever
permitted. See `NOW.md` § Blocked on legal review.

**Rules out.** Retaining profile data from a 13–17 athlete before guardian participation
approval · persisting an exact DOB or a DOB-equivalent · inferring adulthood from class year ·
treating one approval as covering both participation and publication.

### Guardian approval binds to the reviewed public revision
**Active** · 2026-10-06 · founder decision

**Decision.** **No guardian account** is required for the initial pilot; approval is a future
secure email-based flow. Approval **binds to the specific public revision the guardian
reviewed**.

- A **public-content edit unpublishes** the profile and requires **renewed** guardian approval.
- **Private-only edits do not invalidate** an existing approval.

**Terminology is binding.** Call it **guardian approval**. **Never "verified parental
consent"**, and **never claim that possession of an email address proves guardianship.** Both
would overstate what the mechanism establishes, in a context where overstating it is the
specific risk.

**Why revision-bound.** An open-ended approval would let a reviewed profile become an
unreviewed one by edit. Distinguishing public from private edits keeps that meaningful without
making the profile unusable — an athlete can keep private notes and contacts current without
asking again.

**Status.** Policy only. **No guardian approval mechanism exists yet.**

**Pending legal review.** Adequacy of email-based approval for 13–17 and what it may be called;
what evidence of guardian authority to retain; how to handle custody disputes and conflicting
guardian instructions. See `NOW.md` § Blocked on legal review.

**Rules out.** Guardian accounts in the initial pilot · open-ended approval surviving a public
edit · describing email approval as verified parental consent · treating email possession as
proof of guardianship.

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
**Active** · 2026-09-06 · read rule narrowed 2026-09-28 (Checkpoint 5D.7)
**Decision.** `athlete-media` is created with `public = false`. Read access comes from an
RLS policy on `storage.objects` which derives from `athlete_profiles.is_published`.
**Why.** One visibility rule, enforced in one place, for both the profile row and its
images. A public bucket would expose media even for unpublished profiles.
**The read rule BEFORE 5D.7 — historical, no longer in force.** The policy matched the
owner's *folder*, so every object an athlete had ever uploaded — superseded photos and
orphans from failed saves included — was readable by anyone once that profile was published.
That was a real exposure, and it is the reason 5D.7 exists. It is not current behaviour.

**The read rule LIVE today (5D.7, applied).** A non-owner may read only the
**exact object a published profile currently references** — its `hero_photo_path`, in that
profile owner's own `hero` folder — through the
`public.is_publicly_referenced_media(text)` helper. The owner still reads their whole folder,
which replacement and reconciliation depend on, and `profile_photo_path` is deliberately not
covered because no public page renders it. Migration `20260928000002` is applied, and this
was verified live: a deliberately orphaned object and a profile-slot object were both refused
to anon while remaining signable by their owner.
**Rules out.** Flipping the bucket public; serving media through any path that does not
evaluate that policy; and re-widening the read rule to a folder prefix.

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
**Consequences.** A failed save can leave an unreferenced object behind. That was accepted on
the grounds that it costs storage rather than correctness, and that it is invisible to
everyone but its owner.
**That invisibility was NOT true before 5D.7 — historical.** Under the folder-scoped Storage
policy in force until then, an orphan in a *published* athlete's folder **was publicly
readable**, so this clause described an intended property the policy did not actually provide.
**5D.7 fixed that and is applied:** the read rule is now scoped to the exact referenced object,
so an orphan is readable only by its owner and the original claim finally holds. What remains
is storage cost, not exposure. Recorded because the reasoning for accepting
orphans at all depended on a property that was never in force.
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

### Athlete account deletion is founder-assisted, owner-scoped, and Auth-last
**Active** · 2026-09-30 · Checkpoint 5D.9 · founder decision

**Decision.** Permanent deletion of an athlete account during the pilot is **founder-assisted**.
A local, gated founder tool performs only the steps an authenticated **owner** is already
authorised to perform, in a fixed order, and then stops:

    unpublish  ->  enumerate  ->  delete media  ->  delete profile row  ->  STOP

The **Auth user is deleted manually by the founder in the Supabase dashboard, strictly last**.
Nothing automates it.

**Deliberately not introduced:** `service_role`, admin API credentials in the app, a server
admin route or action, a self-service Delete Account UI, a `deletion_requests` table, a
`deleted_at` / soft-delete model, an orphan sweeper, or any RLS / Storage-policy / migration
change. 5D.9 required **none** of them.

**Why founder-assisted.** Permanent deletion needs Auth-user deletion, which needs an admin
credential this project deliberately does not hold (§ No service-role key in this project).
Automating it would mean standing up an endpoint whose purpose is destroying accounts — a
high-value target whose authz must be perfect. At pilot scale, with rare requests, that trade is
not worth it. The urgent capability already exists and is self-service: **an athlete can
unpublish themselves**, which stops fresh public access and fresh hero signing. Only permanent
erasure is founder-assisted. Note the mechanics precisely, because the operational instruction
depends on them: the Visibility switch in `PublishSection` is local component state, and the
value reaches the server only when the athlete presses **Save**. "Flip the switch" is not
sufficient guidance; "turn Published off **and Save**" is.

**Why Auth is strictly last.** `athlete_profiles.owner_user_id` is
`references auth.users(id) on delete cascade`, but **nothing cascades to Storage**. Deleting the
Auth user first removes the profile row while the media survives, and the **reliable** route to
removing it is then gone: Storage owner authorization is keyed on `auth.uid()`, and the sign-in path
that mints a token carrying that claim no longer exists.

What is not claimed: that the objects become admin-only the instant the Auth user is deleted. A
token issued beforehand still carries the claim and may remain API-valid until it expires. The point
of the ordering is that no *dependable* owner credential remains — planning cleanup around a
credential that expires at an unknown moment is not a plan. This supersedes the older note that
described the cascade as the account-deletion path.

**Identity is bound, never looked up.** The target is **environment fingerprint + verified Auth
UID**, decided once and never re-derived. Slug is informational only: slugs are mutable and
reusable, so re-resolving by slug on a retry could retarget the operation at an innocent
athlete. The profile row id is supporting evidence — used to detect that the row changed, never
to decide who the target is. Path ownership is decided by **exact first-segment equality**,
never `startsWith`, which would wrongly accept `<uid>2/...`.

**Enumeration covers the whole owner namespace.** Completeness is all of `{uid}/`, discovered
recursively — **not** `{uid}/hero` plus `{uid}/profile`, which are current app conventions
rather than a definition of what the athlete owns. Root-level files, unexpected folders, and
arbitrary nesting all count. No filtering by extension, UUID shape, slot name, or depth. Every
folder is paginated to exhaustion with deterministic ordering, and enumeration completes
**before** any deletion, because offset pagination over a shrinking collection skips entries.
Verified feasible under the existing owner SELECT policy — `(storage.foldername(name))[1] =
auth.uid()::text` matches at any depth — so **no policy change was needed**.

**Verified absence, never acknowledgement.** A delete response moves a key to
`pending-verification`, never to absent. An object counts as absent only after an **authorized,
complete** enumeration no longer lists it. Explicitly *not* evidence of absence: a successful
delete call, a failed signing attempt, an empty list from an unauthorised reader, a failed
`getUser()`, or a rejected refresh token. A malformed or unreadable listing is **UNKNOWN**, not
empty — "empty" is what authorises the next destructive step. The app's media-replacement
cleanup helper reasons about delete acknowledgements and is therefore **deliberately not
reused** here; it is left unchanged.

**Six checkpoints,** each recording evidence and a timestamp: `bound` → `inventory-ready` →
`media-absent` → `profile-absent` → `auth-deletion-recorded` → `verified-complete`. Checkpoints
cannot be skipped and a stored checkpoint never excuses skipping fresh preconditions on resume.
If facts regress — media reappears, profile activity appears — downstream state is invalidated,
previously-proven absences revert to `unknown`, and the operation stops rather than silently
advancing.

**Cooperative quiet window — a limitation, stated honestly.** Unpublishing installs **no write
barrier**. Another tab, a stale edit form, or a second session can still save or upload
mid-operation. The tool re-scans before each destructive transition and rolls the checkpoint
backward when it detects interference, but it cannot prevent it. The quiet window is an
operational agreement with the athlete. **This workflow is not race-safe and must not be
described as such.** A per-environment/per-UID lock coordinates founder tooling only; it does
not block athlete browsers.

**Residual credentials.** Deleting an Auth user revokes session and refresh state but an
already-issued access JWT can remain signature-valid until expiry (measured in 5D.7: GoTrue 403,
refresh 400, yet the same token still authenticated against PostgREST). Because the row and
media are already gone it can read nothing of the athlete's — but deletion must **not** be
described as instantly revoking every credential. Live acceptance **has now measured** reads
*and writes* with a pre-deletion token after Auth deletion (§17 cases 36–37): **a stale write to
Storage succeeds**, on six independent fixtures. See "5D.9 live acceptance: PASS" below. The
completion condition for exactly that case is enforced as designed: the operation stays open
until the token's `exp` has passed, a clean public verification is re-run, an admin-side
cross-check confirms no `{uid}/` prefix and no row, and anything the probe created is removed.

**Inventory.** One versioned JSON file per operation in a founder-only local application-data
directory **outside the repo** — not a temp directory, which can be cleaned and would destroy
resumability mid-deletion. The directory is canonicalised and then **refused** if it resolves
inside the repository checkout or a cloud-sync root — symlinks and junctions are resolved first.
Each write is temp file → `fsync` → rename, then read back, re-validated, and compared
field-by-field before any caller is told it persisted; a failed save **stops** the operation. This
is *atomic local persistence with verified read-back*, **not** guaranteed crash-durable storage,
and must not be described as crash-proof. It **never** stores OTPs, passwords, access or refresh tokens, API
keys, signed URLs, raw profile bodies, or media bytes; validation refuses an inventory carrying
any of those. Credentials stay in memory and re-authentication happens on resume, using a
**sign-in-only** OTP flow — the app's helper sends `shouldCreateUser: true`, which on a retry
after Auth deletion would silently recreate the account it just removed.

**Rules out.** Deleting the Auth user before media and profile are verifiably gone · treating a
delete acknowledgement as completion · resolving a deletion target by slug · defining owned
media by the three-segment path convention · reusing the replacement-cleanup helper for account
deletion · claiming race-safety under current policies.

**Status. COMPLETE.** Merged as `4e70f6f` (PR #21). The controlled live acceptance run against
disposable fixtures (runbook §16–§17) **has been executed: PASS** — see "5D.9 live acceptance:
PASS" below. **No schema, RLS, or Storage policy was changed**, and no `service_role` or admin
capability was introduced; 5D.9 required none.

### The deletion workflow's sequencing lives behind injected ports
**Active** · 2026-09-30 · Checkpoint 5D.9 repair pass

**Decision.** All ordering and refusal logic for account deletion lives in
`scripts/lifecycle/orchestrator.mjs`, which performs **no I/O of its own** — every external
effect is an injected port — and **returns** a refusal instead of exiting.
`scripts/delete-athlete-account.mjs` is a thin adapter: load config, authenticate when the mode
needs it, build real ports, map the result to an exit code.

**Why.** The rules that matter here are orderings, and an ordering is only observable by driving
the sequence and recording what was called. "Enumerate completely before deleting", "never print
the Auth handoff if the pre-handoff save failed", "an unreadable public surface is UNKNOWN" cannot
be asserted against a live project without risking real data. With ports, they are ordinary unit
assertions: 41 sequence tests, no network.

Five substantive behaviour changes came out of the same pass.

**1. Post-Auth verification requires no athlete session.** The earlier design's verification path
asked the athlete for an OTP — after their Auth user had been deleted, which cannot succeed. That
made the final step unrunnable. `--mode verify-public` takes no session. The consequence is stated
rather than papered over: once the Auth user is gone this tool **can no longer obtain a fresh owner
session**, because the sign-in path that produces one is exactly what was deleted. So owner-scoped
absence is proven *before* Auth deletion and recorded, and the final run verifies the public surface
plus the founder's typed confirmation of the deleted UID plus an attested admin-side cross-check. The
tool refuses `verified-complete` unless the recorded `profile-absent` evidence is present.

What is deliberately **not** claimed: that deleting the Auth user makes the athlete's objects
unreachable. An access token issued beforehand may stay API-valid until it expires and still carries
the `auth.uid()` claim the Storage owner policy is keyed on. Whether that access actually remains is
measured by live acceptance, not assumed in either direction, and a residual capability keeps the
operation OPEN — see the residual-token completion rule below.

**2. Public absence is three-valued.** absent / exposed / **unknown**. Only a reachable, parsed
`200` with zero rows is absence; a transport failure, a non-200, an unparseable body, or a missing
slug is unknown, and unknown never completes an operation. A 404 from a wrong path is
indistinguishable from a clean result, which is exactly how a false pass gets manufactured.

**3. Both confirmations precede the first mutation.** Quiet window and typed phrase now come before
the unpublish, so there is no "one allowed early mutation" to document. A resumed destructive run
asks again — a stored checkpoint is not a standing confirmation.

**4. The founder lock is exclusive by construction, and so is dead-holder recovery.** The record is
staged to a private temp file and **hard-linked** into place, so the lock path never exists
half-written (a competitor reads that content to judge liveness). Locks live in a fixed directory
that `--work-dir` cannot move, since otherwise two operators with different work dirs would never
see each other. Scope is narrow and worth stating: **one OS user, one host, that user's local
application-data root** — not distributed, not cross-user, not cross-machine.

Recovery needed its own fix, because "read the holder, see a dead pid, unlink, re-create" admits two
live workers: A and B both read the same dead record, A unlinks it and claims the lock, then B —
still acting on its earlier read — unlinks **A's live lock** and claims it too. Nothing in that
sequence re-checks that the file being removed is still the dead one.

A takeover is therefore gated on winning a **per-dead-instance recovery token**. Every record
carries a random `instanceId`; a would-be recoverer must exclusively create
`<lock>.takeover.<instanceId>`, so only one process is ever entitled to remove that instance; the
winner then re-reads the lock and proceeds only if it is still that exact instance and still dead;
and the removal is followed by a fresh exclusive claim that a third party may legitimately have won
in between. B cannot reach the removal step at all. A recoverer that dies mid-way leaves the token,
which blocks automatic recovery of that instance and forces **manual cleanup** — deliberately, since
that degrades availability rather than safety.

Everything ambiguous fails closed: a cross-host lock, an unreadable or empty record, a **missing or
malformed pid**, a record with **no instance id**. None of those is "dead"; a corrupt same-host lock
is never auto-reclaimed. Age is never evidence, and a matching operation id does **not** bypass a
live holder. PID reuse is an accepted limitation in the safe direction: if the pid has been handed to
an unrelated process the lock reads as live and the run refuses, costing availability rather than
admitting a second worker.

**5. Inventory paths are re-validated as untrusted input.** An inventory is a file on disk: it can
be edited, corrupted, or carried over. Every load re-checks each key for exact owner ownership and
the expected bucket, and each delete batch is gated again against the fresh enumeration. A foreign
path is a hard refusal for the whole operation, never a skipped entry — RLS is the last line of
defence, not the tool's only one.

**6. Fresh auth at every destructive boundary.** `authValidated: true` is no longer passed through
from startup. Each destructive boundary re-validates the session and checks the live uid against the
bound one. What that proves is narrow and is stated as such: the credential is **currently
accepted**, not that the Auth user exists — a token issued before a deletion can still be accepted.
So pre-Auth destructive phases require it, and post-Auth phases never call it.

**7. Completion requires recorded outcomes, not an acknowledgement.** `verified-complete` previously
turned on "confirm you have read the residual-credential caveat", which establishes nothing about the
system. It now requires: the manual Auth deletion recorded against the bound uid; the stale-token
**READ and WRITE** outcomes both recorded; and, if either capability remained, that all outstanding
token-expiry windows have passed, any probe object was removed, the public check was re-run, and a
founder has attested to the admin-side Storage/profile cross-check. `finalProfileAbsent: true` and
`finalMediaScanClean: true` are no longer accepted as caller-asserted booleans at all.

The ordering is enforced, not merely documented: the Auth deletion is recorded before the stale-token
questions are asked, and a missing outcome leaves the operation **open** rather than completing it.
One probe token is explicitly not treated as evidence about every session that may have been
outstanding — the question asked is about all of them.

**8. Resource ceilings are global to the enumeration.** `maxEntries` previously broke only the
current pagination loop while queued folders kept expanding. The budget — entries, folders and pages
— is now checked at both loop levels, and hitting any of it stops dequeuing entirely and returns
`complete: false`.

**9. The inventory is a strict versioned schema (format 2).** Every field and nested shape is
allowlisted exactly, so unknown fields, arbitrary nested evidence objects, object-valued slugs, raw
profile bodies, response dumps and byte arrays have nowhere to live rather than being recognised and
rejected one at a time. Validation also enforces **path ownership on every load** — previously a
foreign key could sit unchallenged in an inventory already past the media phase — and
checkpoint/evidence consistency, so a checkpoint cannot claim more than its recorded evidence
supports. A version-1 file is refused rather than migrated.

**Also corrected.** The `sb_secret_` / `service_role` start-up guard is documented as a guard against
an obvious mistake, **not** an exhaustive role detector: a legacy JWT-format key carries its role
inside the encoded payload, which the tool does not decode. The cloud-sync work-dir check is
described as a **heuristic on folder names**, which cannot detect a renamed sync root or a sync
client pointed at an arbitrary directory. `fsync` is claimed on the **file only** — the directory
entry is not flushed, since that is not portable. And the takedown procedure now says plainly that an
unreachable athlete cannot be handled by this tool at all — every mutating step needs their sign-in
code — and gives the manual dashboard procedure for stopping public exposure instead.

**OTP entry.** The emailed code is read with terminal echo **off**, before any readline interface
exists, so there is one consumer of stdin and raw mode is always restored. On a non-TTY stdin there
is nothing to hide and the tool says so instead of implying otherwise. The honest limit: this keeps
the code out of the visible screen and scrollback; it cannot stop a terminal emulator, multiplexer,
session recorder or keylogger from capturing keystrokes. "The tool never writes credentials" is a
property of the tool, not of the terminal — so the claim is stated that way rather than as
"impossible to persist".

**10. Every destructive entry point re-checks the public surface.** A resumed run at
`inventory-ready` or `media-absent` previously inherited the public check performed when the
operation first reached that checkpoint. Both phases now issue a fresh check immediately before
mutating, and UNKNOWN stops as firmly as EXPOSED.

**11. The completion public check is issued AFTER the stale-token testing.** Completing on the
reading taken at the top of the run would be completing on evidence that predates the actions it is
meant to account for. `publicRecheckAt` is stamped only from that later request, never derived from a
clock reading or carried over, and an EXPOSED or UNKNOWN result there refuses completion.

**12. Residual obligations are monotonic.** Capability once observed stays observed; unresolved
expiry, probe cleanup, and cross-check stay unresolved until positively confirmed. A later run
answering "no" means only that it did not reproduce the capability — perhaps its token had since
expired — and must not discharge what an earlier run recorded. Each obligation has exactly one
resolution transition, and the tool announces what a run inherited. The probe object key is validated
against the same exact-ownership rule as every other media key.

**13. A probe object is identified by generation, not by its key.** Removal evidence belongs to an
object, not to a path. A probe written at a key, removed, and then written at that **same** key is a
second object, and the first removal says nothing about it — but matching on the key alone let the
recreated probe inherit the earlier `probeRemovedAt`, so an operation could complete while the
founder was answering, in that very run, that the new probe had NOT been cleaned up. Each reported
existence now mints a `probeGeneration`, and cleanup is satisfied only when
`probeRemovedGeneration === probeGeneration`. The schema additionally refuses an inventory whose
removal evidence names a generation that is not the current one.

**14. A request ATTEMPT consumes the enumeration budget.** `pages` was incremented after `list()`
resolved, so a thrown request cost nothing and `maxPages` could be exceeded without limit by a
backend that fails. The counter now increments before the call and is never rolled back: a hard
maximum has to bound attempts, not outcomes.

**15. The authoritative inventory is loaded INSIDE the lock.** Serialising execution achieves
nothing if the state the serialised section operates on was read before the wait. Two runs could load
one snapshot; the first takes the lock, records a new residual obligation and releases; the second
then acquires the lock still holding its pre-lock copy, writes that stale state back, and erases the
obligation — reaching `verified-complete` over work that was still owed. The lock did its job and the
data defeated it.

Only the lock **key** is now derived before acquisition. For a resumed run with a session the key uses
the signed-in uid, so a caller inspecting someone else's operation locks only their own identity and
the refusal happens after the reload. `verify-public` has no session and must discover the bound uid
from disk, so it performs one read whose *single* use is that uid; the object is discarded and never
becomes lifecycle state. A new operation is bound inside the lock, so it has no pre-lock read at all.

There is deliberately **no merge** of a pre-lock snapshot with the post-lock load. A snapshot taken
before a wait has no standing afterwards, and merging it could only downgrade newer on-disk evidence:
a recorded READ/WRITE capability, a newer probe generation, an unresolved cleanup, an expiry or
cross-check obligation, or a further checkpoint.

**Rules out.** Testing deletion sequencing only against a live project · asking a deleted user to
authenticate · recording an unreadable public surface as absence · treating a stored checkpoint as a
confirmation or as a proof · check-then-write, age-based, or unlink-first lock recovery · treating a
corrupt or pid-less lock as dead · identifying a probe object by its key alone · counting only
successful requests against a hard request budget · operating on an inventory read before the lock was
acquired, or merging one over newer on-disk state · trusting an inventory's own key list · deleting a row that is
published or whose id is not the bound one · re-deleting an object that regressed from verified-absent
instead of stopping · completing an operation on an acknowledgement rather than a recorded outcome ·
completing on public evidence gathered before the stale-token probes · letting a later weaker
observation discharge an earlier obligation · claiming the Auth user's deletion makes an
already-issued token harmless.

### 5D.9 live acceptance: PASS
**Active** · 2026-10-05 · Checkpoint 5D.9 closeout

**Result.** The §17 matrix was run once against the live **Athlete** project on disposable
fixtures. **Every case has a valid PASS.** 63 ledger rows. Final fixture state: Auth **0**, no
fixture profile rows, no fixture Storage namespaces, no lifecycle locks. The tracked repo was
clean at `4e70f6f` throughout — acceptance changed no code, docs, migrations, RLS, Storage
configuration or Auth settings. **Deployment remains deferred** (5D.5), and the **old
Ops/shared Supabase project was never touched** at any point.

**Fixtures.** Seven, not the four §17 anticipated: T1, T2 (byte-level control), T3, T1R, T4,
T5, T6. T1R, T5 and T6 were added mid-run — T1R to redo a contaminated sequence, T5 and T6 to
obtain residual-token and signed-URL evidence that could not legitimately be borrowed from
another operation.

**Canonical specimen.** **T5** is the reference end-to-end operation: it reached
`verified-complete` through the merged lifecycle with every gate satisfied by real evidence and
no hand-edited inventory.

**Historical contaminated evidence is preserved, and must not be conflated with the clean
evidence.** An early run on T1 overshot its approved bound and deleted a profile row that was
meant to survive. Those rows stay recorded as failures — case 23 `PARTIAL - OVERSHOT`, case 22
`NOT TESTED`, cases 28/29/31/32/33 `NOT CREDITED` — and all five were re-obtained cleanly on
T1R and recorded separately as PASS. The failed rows were **not** rewritten.

**T1R remains OPEN, deliberately.** Its own pre-deletion token window elapsed unmeasured, so
its residual-token evidence is `INVALID / TOKEN ALREADY EXPIRED`. Its Auth user is gone, so no
owner token can ever exist for it again. The operation therefore cannot honestly reach
`verified-complete`, and is left at `profile-absent` with `residualTokenTest: null`. **This is a
correct outcome, not an outstanding task** — it is what the §16 ordering requirement looks like
when it is not met. Do not "fix" it.

**T6 remains OPEN, also correctly.** Its final public check found its freed slug published by
T4 (case 42), so the tool refused completion. The refusal is the evidence.

**Finding: a pre-deletion access token can still WRITE to Storage after the Auth user is
deleted.** Measured on **six independent fixtures** (T5, T6, T1, T2, T3, T4), every measurement
inside a valid token window with before/after timestamps proving `now < exp`:

- `GET /auth/v1/user` → **403 `user_not_found`**. GoTrue rejects the token outright.
- `POST` an object under `{deleted-uid}/` → **200, object created**. Storage accepts it.
- `POST athlete_profiles` → **409 `23503`** foreign-key violation. **Inconclusive**, not a
  denial: the `auth.users` row is gone, so the insert can fail on the FK rather than on RLS.
  Storage WRITE is the primary residual-write test.
- READ probes returned **200 with zero rows** — accepted requests with nothing to return,
  because the data was already gone. That is `OK_BUT_EMPTY`; it is **not** proof that read
  access was revoked.

**Mechanism.** The Storage owner policy is keyed on the `auth.uid()` claim in the JWT and its
signature; it does not consult `auth.users`. Deletion does not revoke an already-issued token,
so "deleted" is not write-sealed for up to the full access-token lifetime — **measured at
3600 s** on this project.

**What this is not.** Not a 5D.9 failure: the lifecycle handled it correctly, refusing
`verified-complete` until the expiry window elapsed, the probe object's removal was proven, the
admin cross-check was attested, and a fresh public-absence check passed. Nor is it a claim that
deleted data can be read — the row and objects are gone. What remains is the ability to create
*new* objects under a dead uid's prefix: a storage-hygiene problem plus a window in which
"deleted" is not yet final. The access-token TTL decision is tracked as a follow-up.

**Final cleanup.** All four remaining fixtures (T1, T2, T3, T4) were torn down through the
**full merged lifecycle**, not by dashboard shortcut: execute to the Auth handoff, residual
token minted through the ≥3000 s timing gate, founder-performed Auth deletion, residual probes
inside a valid window, probe cleanup proven by fresh enumeration, one shared expiry wait,
founder admin cross-check, then a final `verify-public` reaching `verified-complete` with
`publicRecheckAt` stamped from a real request. T2 went last because it had been the byte-level
control throughout; its baseline passed case 46 immediately beforehand. Two residue items the
early T1 overshoot had left behind — one object and a case-26 replacement row — were found by a
read-only guard and removed by the lifecycle during this cleanup.

**Evidence.** The detailed 63-row ledger and per-case records are archived outside the repo and
outside Git, at `Documents\Athlesite-Acceptance-Archive\5D.9-2026-10-05\` (160 files). This
entry is the durable tracked summary.

### `is_published` is the only public-visibility switch
**Active** · 2026-09-06
**Decision.** Anonymous read of a profile row and of its media both derive from
`is_published`. Owners can always read their own, published or not.
**Why.** A single boolean, checked in both policies, means "who can see this" has
exactly one answer and one place to audit.
**Rules out.** Any second visibility mechanism — unlisted links, per-section privacy,
preview tokens — without redesigning both policies together.

**Constrained 2026-10-06 (privacy/consent policy record).** `is_published` remains the
technical visibility switch and the single column both policies check — that is unchanged.
It is **not** the complete future publication-*eligibility* gate: the approved minor policy
adds guardian approval as a second condition on whether publication is permitted at all.
**That eligibility system does not exist yet** — no code consults it, and nothing enforces it
at the database boundary. Read this entry as describing the switch, not the whole gate.

### Auto-publish on CREATE; updates preserve the chosen publication state
**Superseded 2026-10-06 by policy AND by merged implementation** · see "Publication is an
explicit act, for everyone" · previously superseded 2026-09-30, originally "Auto-publish on
every successful save", 2026-09-07

> **This entry is history, not current behaviour.** Creation-time auto-publish was removed
> globally in PR #24 (merge commit `4dad1a74ce88ca463c1bc60b3cf2006d9dcd758a`), so the
> `is_published: true` on create described below no longer exists in the code. The
> *update* half described below is still accurate: an ordinary save preserves whatever
> visibility the athlete chose. Git holds the full original reasoning.

**Decision as it stands now.** A first-time create publishes: `buildCreateRow` sets
`is_published: true`, because at that moment the athlete's goal is a shareable link and a separate
publish step is one more place to get stuck with nothing to share. An **update** does not force the
column — `buildUpdateRow` writes whatever `is_published` it is given, and `EditProfileForm` seeds
that from the stored record and from the Visibility switch.

**What changed, and why the old wording is dangerous.** The original entry said "every successful
save sets `is_published = true`" and predicted it would become a bug once unpublish controls
arrived. Those controls arrived (`PublishSection`), and the write path changed with them. Left
uncorrected, the old wording would tell a reader that editing an intentionally unpublished profile
republishes it — the opposite of what the code does, and exactly the kind of stale claim that gets
relied on during a deletion or a takedown.

**How the control actually behaves.** The Visibility switch is **local component state**. Flipping
it changes nothing on the server; the value is written when the athlete presses **Save**, in the
same single `.update()` as every other field. So the correct instruction to an athlete is "turn
Published off **and press Save**", and until that Save succeeds the profile is still public.

**Rules out.** Assuming a saved profile is private · assuming an update republishes · telling an
athlete that flipping the switch alone takes their profile down.

### Publication is an explicit act, for everyone
**Active** · 2026-10-06 · founder decision · **supersedes "Auto-publish on CREATE; updates
preserve the chosen publication state"**

**Decision.** Creation-time auto-publish is removed **globally, for every athlete regardless of
age**. A profile becomes public only when the athlete explicitly publishes it. An ordinary save
**preserves** current visibility, in both directions.

**Implemented, not merely decided.** `toAthleteProfileRow` now creates profiles **unpublished**
(`is_published: false`) and deliberately takes **no** publication parameter — a parameter is
something a caller can pass `true` to, which is exactly how auto-publish would return. Publish
and Unpublish continue to use the existing Visibility toggle plus **Save**. Merged in **PR #24**,
merge commit **`4dad1a74ce88ca463c1bc60b3cf2006d9dcd758a`**.

**What is implemented versus what is deferred — do not blur these.**

- **Implemented now:** explicit publication at the **application layer**, for all ages.
- **Still deferred:** **database/security-boundary publication eligibility enforcement.** An
  owner's own session can still write `is_published` directly under RLS. The application-layer
  gate is an interim measure and must be described as one.
- **Not implemented at all:** guardian eligibility. Nothing in the code consults a guardian
  approval, because no such approval exists yet. A minor's publication is currently gated by
  nothing beyond the athlete's own explicit action.

**Why global rather than minor-only.** Two publication paths would make the riskier path the
less-tested one, and an age-bracket bug would default to publishing. One explicit path is
simpler to audit and strictly safer. It also means `is_published` no longer changes as a side
effect of saving, which is what made consent-before-publication impossible.

**Rules out.** Setting `is_published = true` in the row-creating upsert · a minor-only publish
gate · describing the application-layer gate as the final enforcement boundary · implying
guardian eligibility is enforced today.

### The minor public projection is reduced, athlete-named, and guardian-reviewed
**Active** · 2026-10-06 · founder decision

**Decision.** For the initial pilot, a minor's public profile differs from an adult's:

- **Display name defaults to first name + last initial.** Full name only by **deliberate athlete
  and guardian choice**.
- **No auto-derived real-name slug for minors.** The minor chooses a **handle**;
  `slugify("First Last")` is not offered to them as a default.
- **`city` omitted** from the minor public projection.
- **`state` optional.**
- **`class_year` optional**, and **explicitly previewed** before approval.
- **`height_in` / `weight_lb` private by default**, public only by deliberate choice.
- **Hero photo optional**, and **included in the guardian review** when present.
- **`bio` requires prohibited-content guidance and review** — no addresses, phone numbers,
  personal email, or schedule/location detail.
- **External links restricted to approved HTTPS/video destinations** for the initial pilot.

**Why.** The adult projection's 18 fields are already minimised, but full name + city + state +
class year + sport + photograph locates a specific child even with school withheld. Reducing the
*set* is more durable than warning about the *contents*.

**Architectural consequence, and it is not yet decided.** A smaller minor projection touches the
**5D.7 public-read boundary** (§ Public profile reads go through an exact-slug RPC). It will
require either a conditional, age-aware projection inside the existing RPC or a second function
— **a reviewed architecture decision of its own**, not an implementation detail of this policy.

**Status.** Policy only. **The public projection is currently age-neutral and unchanged.**

**Rules out.** One projection for all ages · publishing a minor's city · auto-deriving a minor's
slug from their legal name · unreviewed free-text bio or arbitrary outbound links · changing the
5D.7 boundary without its own review.

### Guardian revocation atomically removes publication eligibility; retention is windowed
**Active** · 2026-10-06 · founder decision

**Decision.** Guardian revocation **atomically** removes publication eligibility **and**
unpublishes. The athlete **cannot republish without fresh approval**. Revocation does **not**
itself delete the account — **deletion remains a separate act**.

**Revoked minor data is not retained indefinitely by default.** A defined
recovery-then-deletion window applies; **the exact duration is pending legal review.** "Keep it
until someone asks" is not an acceptable default for a minor's data.

**Why unpublish rather than delete.** Revocation must **atomically remove publication
eligibility and unpublish**. Unpublishing is already self-service and needs no admin
credential, whereas permanent deletion is founder-assisted by design (§ Athlete account
deletion is founder-assisted, owner-scoped, and Auth-last) and therefore human-paced.
**Revocation is not deletion**, and the two must not be conflated.

**What revocation does not guarantee, stated honestly.** **Already-issued signed media URLs
may remain usable until they expire.** Unpublishing removes the row from the public read path
and stops fresh signing, but it does not invalidate a URL already handed out. **Immediate
media revocation requires a separately reviewed implementation** and does not exist today.
Nothing here may be described as byte-level media revocation on withdrawal.

**Status.** Policy only. **No revocation mechanism exists yet.**

**Pending legal review.** The retention-window duration; what approval or legal evidence, if
any, must survive a full athlete account deletion. See `NOW.md` § Blocked on legal review.

**Rules out.** Revocation that leaves a profile public · republication without fresh approval ·
revocation silently deleting an account · indefinite retention of revoked minor records.

### Material policy changes gate expanded data use before it takes effect
**Active** · 2026-10-06 · founder decision

**Decision.** Terms and Privacy changes are **classified** as material or not.

- **Expanded data use or disclosure must not activate before the required new approval.**
- Where prior authorization may **safely and lawfully remain valid**, a defined notice and
  re-consent period applies, and the profile **unpublishes at the deadline** if the required
  approval is missing.
- Where prior behaviour **cannot** safely or lawfully continue, the profile **unpublishes
  immediately**.

**Approval and acceptance records must be versioned** — every acceptance and every guardian
approval records the document version it was given against. An unversioned record cannot answer
the only question that matters later: approved to *what*.

**Status.** Policy only. **No acceptance or approval persistence exists yet.**

**Pending legal review.** **Counsel determines which changes legally trigger renewed approval.**
The classification is a legal judgement, not a product one. See `NOW.md` § Blocked on legal
review.

**Rules out.** Applying expanded data use to existing minors on notice alone · a blanket
"continued use constitutes acceptance" for minors · unversioned acceptance or approval records.

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

**Constrained 2026-10-06 (privacy/consent policy record).** The "consent-shaped for minors"
note above is now a **hard dependency on the guardian-approval model**, not an aspiration: a
future indexing flip depends on the minor policy as well as on the canonical-URL decision.
Both must land first.

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

### Athlete and Ops are separate Supabase projects
**Active** · 2026-09-23 · founder decision
**Decision.** The athlete product and the internal Ops console run on **two separate
Supabase projects**, each with its own database, Storage, and `auth.users`.

- **Athlete Supabase project** (this repo): the only project this repository is ever
  linked to.
- **Ops Supabase project** (retained): keeps the Ops tables and the two founder Ops
  identities. **Nothing in this repo may target it.**

Neither project ref is recorded here. This repository is public, and
`GUARDRAILS.md § Secrets` excludes Supabase project refs from tracked files — docs say
*where* configuration lives, never *what* it is. The Athlete ref lives only in gitignored
`supabase/.temp/` and in the Supabase dashboard.

**Why.** Both products previously shared one project, which meant athletes and founders
would land in the same `auth.users` table — `signInWithOtp({ shouldCreateUser: true })`
creates an account for any email that requests a code, so a pilot athlete's identity
would have been adjacent to Ops identities in one namespace. Separation also gives the
athlete product its own blast radius, its own rate limits, and its own email
configuration. The audit that preceded this (Checkpoint 5D.4A) found the athlete app
touches exactly one table (`athlete_profiles`), one bucket (`athlete-media`), and zero
Ops objects, so nothing had to be split.

**Timing.** Done with 0 athlete profiles and 0 athlete auth users in existence, so no
data migration was required — the cheapest possible moment.

**What moved.** All three migrations were applied to the new project and verified
(`local == remote` for each): the `athlete_profiles` table, its index, the
`set_updated_at()` function and trigger, five table RLS policies, the column-scoped
`anon` grant of exactly 18 columns, the private `athlete-media` bucket, and its four
Storage policies.

**Rules out.** Pointing this repo at the Ops Supabase project; a shared `auth.users`
between athletes and founders; and any assumption that an Ops table is reachable from
the athlete app.

**Note.** `service_role` lacks `SELECT`, `INSERT`, `UPDATE`, and `DELETE` privileges on
`athlete_profiles`, so ordinary PostgREST CRUD is unavailable. It retains `TRUNCATE`,
`REFERENCES`, and `TRIGGER` privileges. The migrations grant table privileges only to
`anon` and `authenticated`.

**Superseded at 5D.9.** This note previously concluded that "account deletion therefore works
through the schema's own `owner_user_id … on delete cascade`". **Do not follow that.** The
cascade exists, but using it as the deletion path is unsafe: nothing cascades to Storage, so
deleting the Auth user first strands the athlete's media beyond any owner's reach. See
§ Athlete account deletion is founder-assisted, owner-scoped, and Auth-last.

### Athlete Auth is configured through the Management API, not `config push`
**Active** · 2026-09-23
**Decision.** Auth settings on the Athlete project are changed with surgical
`PATCH /v1/projects/{ref}/config/auth` calls. `supabase config push` is not used for
auth configuration.
**Why.** `UpdateAuthConfigBody` has no required fields, so a PATCH touches exactly the
fields it names. `config push`, by contrast, sends every property `supabase/config.toml`
*declares* — including values present only because `supabase init` wrote them — and the
CLI's own help warns that a non-interactive push defaults to proceeding. A push with the
stock template would have silently reverted the 8-digit OTP to 6 and pointed `site_url`
at localhost.
**Live configuration set this way.** Custom SMTP via Resend (`smtp.resend.com:465`, user
`resend`, sender `Athlesite <noreply@athlesite.com>`); *Confirm signup* and *Magic link*
templates containing `{{ .Token }}` and **no** `{{ .ConfirmationURL }}`; OTP length 8;
OTP expiry 3600s; `rate_limit_email_sent` raised from 2/hour to **30/hour**; and
**`jwt_exp` 1800s** as of 2026-10-05 (see "Athlete access-token TTL is 1800 s for the pilot").
**Rules out.** Running `config push` without first reviewing `config diff`, and
declaring a partial `[auth.email.smtp]` block in `config.toml` (the API masks
`smtp_pass`, so it can never round-trip).

### Athlete access-token TTL is 1800 s for the pilot
**Active** · 2026-10-05 · founder decision · Checkpoint "access-token TTL"

**Decision.** The Athlete project's access-token (JWT) expiry is **1800 seconds**, reduced from
**3600 s**, changed by the founder in the Supabase dashboard on **2026-10-05**. Refresh-token
rotation stays **enabled** with a **10 s** reuse interval; session **timebox** and **inactivity
timeout** remain **unset**.

**Why.** 5D.9 live acceptance measured, on **six independent fixtures**, that an already-issued
athlete JWT can still **write** to Supabase Storage after its Auth user is deleted, for as long
as the token remains unexpired — the owner policy compares a path segment to the `auth.uid()`
*claim* and never consults `auth.users`. Halving the TTL **halves the worst-case residual
window from 60 to 30 minutes**, and equally halves how long the deletion runbook must wait
before an operation may be declared `verified-complete`.

**Access-token lifetime is not session lifetime.** Athletes remain signed in through
refresh-token rotation; a shorter access token increases **refresh frequency**, it does not log
anyone out. `@supabase/auth-js` refreshes on a 30 s tick when under ~90 s remain — and because
that tick granularity means a refresh can begin with just under ~120 s left, the margin is
fixed rather than proportional, which is what bounds how far the TTL can sensibly be reduced.

**What this is and is not.** A **pilot mitigation that shortens a window**, *not* an
immediate-revocation guarantee. Supabase access tokens are stateless: there is no per-token
revocation, so nothing makes an outstanding token invalid before its `exp`.

**Why 1800 and not 900.** 900 s is not inherently unsafe; 1800 s was chosen as the more
conservative first reduction while mobile and background-tab refresh behaviour is less tested.
Shorter TTLs reduce tolerance for missed refresh opportunities — suspended tabs, flaky networks
— and `updateSession` in `src/proxy.ts` helps only on matched server requests: it is not
continuous refresh, and it does not cover direct browser-to-Storage calls.

**Deferred, deliberately.** The stronger fix is to make the Storage owner policies require that
the user still exists (equivalent to `exists (select 1 from auth.users where id = auth.uid())`),
which would seal writes the instant the Auth row is deleted and remove the expiry wait entirely.
That needs a `SECURITY DEFINER` helper — `authenticated` holds no `SELECT` on `auth.users` — and
a migration touching the Storage boundary 5D.7 hardened and 5D.9 validated. **It belongs to a
separate security checkpoint**, not to this setting change.

**Transition.** Tokens issued before the change keep their original 3600 s lifetime until they
expire naturally; the new value applies only to tokens minted afterwards. The Athlete project
held **0 Auth users** when the setting changed, so no athlete token predated it and the
transition concern is **materially reduced to the point of being theoretical here** — but the
behaviour must not be described as instantly converting already-issued tokens.

**Verified live, 2026-10-05, after the change.** A fresh disposable Athlete fixture signed in
through the normal owner flow: the newly issued access token measured **`exp - iat = 1800`**.
The refresh grant returned **200** with a new access token for the **same `sub`**, so session
identity and continuity were preserved. An authenticated **profile save** (201, confirmed by an
authorised read-back) and an authenticated **Storage upload** (200, confirmed by a fresh
enumeration) both succeeded **using the post-refresh token**. The temporary row and object were
then removed and their absence proven by fresh reads, the temporary Auth user was deleted, and
the Athlete project returned to **Auth 0**. No auth was weakened or bypassed to pass the test;
no `service_role` or admin API was involved.

*Caveat, stated precisely.* The refresh was issued within seconds of the mint, so the refreshed
token carried the **same `iat`/`exp` second** as the original. That demonstrates the refresh
grant and the session-continuity path work; it does **not** by itself demonstrate that a later
refresh extends the window by a fresh 1800 s measured from the later refresh moment. Proving
that needs a refresh taken minutes after issue.

**Historical note.** 5D.9 acceptance was executed and recorded against the **3600 s**
configuration. Those measurements stand as made; they are not restated as though they occurred
at 1800 s. One consequence: archived acceptance tooling gates on `MIN_REMAINING = 3000`, which
a freshly minted 1800 s token can never satisfy, so that tooling cannot be reused unchanged.

**Rules out.** Describing TTL reduction as revocation · changing Auth config with
`supabase config push` · assuming the OTP expiry or `SIGNED_URL_TTL_SECONDS` changed with it.

**Revisit when.** Deletion becomes self-service or frequent · a deletion carries a legal or
guardian deadline where 30 minutes is insufficient · Storage policies are being changed for
another reason, at which point fold the user-existence check in · public launch, where "deleted
means deleted" becomes a published claim · Supabase ships per-session or per-token revocation ·
or monitoring shows refresh failures after this change, in which case revert first.

### The athlete app deploys to Vercel Pro, serving the apex `athlesite.com`
**Active** · 2026-09-24 · founder decision · supersedes "Deployment provider is
deliberately undecided" (2026-09-06)

**Decision.**
- **Host: Vercel Pro.** Pro rather than Hobby because Hobby's terms exclude commercial
  use, and Athlesite is a commercial product.
- **Canonical production origin: `https://athlesite.com`** — the apex, served by the
  Next app itself.
- **`www.athlesite.com` redirects to the apex.**
- **The marketing/app subdomain split is deferred.** The Next app continues to own the
  apex.

**Why Vercel specifically, for this codebase.** The canonicalisation behaviour settled in
5D.3 — the three-rule redirect table, `skipTrailingSlashRedirect`, and one-hop
`/athletes/:slug/` → `/:slug` — is verified by `npm run check:redirects` driving a real
`next start` server. CI verifies local Next.js routing; verify Vercel routing and domain
redirects on the deployed host before launch. A third-party adapter reimplements routing and would require
re-verifying every hop. `proxy.ts` is also Next 16's new middleware convention, where
first-party support removes adapter-lag risk outright. For two founders with no ops
capacity, that is worth more than a cheaper tier.

**Why the apex, and why the split is deferred.** Athlete profiles live at
`/{slug}`, and `PUBLIC_HOST` in `src/lib/athlete-profile.ts` tells every athlete their
link is `athlesite.com/{slug}`. Whatever serves the apex must therefore be the app.
Putting the app on `app.athlesite.com` would re-open the exact defect 5D.3 closed —
showing athletes a URL that does not resolve — and lengthening the link contradicts the
product thesis of one clean, ownable identity link. A split cannot work while profiles
sit at the apex, because both deployments would need it.

**Rules out.** Serving athlete profiles from a subdomain; treating `www` as canonical;
and adding host-specific configuration where `next.config.ts` already covers the
behaviour (no `vercel.json` is expected — portability is worth more than convenience).

**Deployment preparation (5D.5B).** This checkpoint prepares the repository only.
No Vercel project or DNS changes are made. The `www` → apex redirect is a future
hosting/domain setup step, not something `metadataBase` implements. Verify the
redirect and existing path canonicalization on the actual host before launch.
The Supabase Site URL remains localhost until the deployment is ready; do not
change it or any live configuration during repository preparation. Before any
future Supabase configuration push, run and review `supabase config diff` against
the intended Athlete project, preserving dashboard-managed SMTP settings.

**Environment and preview isolation.** Production environment values are never
committed. `.env.example` lists names with empty values; configure real values in
the hosting platform's **Production** scope only. The site origin there will be
`https://athlesite.com`. Preview deployments must not read or write production
Athlete Supabase: leave their Supabase variables absent, including branch-specific
overrides, and never import a production `.env.local` into previews. No additional
Supabase project is created for this checkpoint. The homepage and `/jordan-bell`
fixture work without Supabase; `/get-started`, `/edit-profile`, and real profile
routes fail at request time without it. This is an accepted preview limitation,
not a reason to connect previews to production or bypass authentication.

**Indexing.** Real athlete profile metadata remains `noindex, nofollow` for the
pilot. Missing and invisible profiles share the same generic `notFound()` path;
Next supplies `noindex` for 404s. The homepage and fictional example stay indexable.
No `robots.ts` or sitemap is added: blocking crawling would prevent crawlers from
seeing the existing per-page `noindex` directives.

**Supabase billing.** Plans are organization-based: upgrading the shared organization
to Pro affects both Athlete and Ops projects, with compute charged per project.
This records billing scope, not an instruction to upgrade or a claim that an upgrade
has occurred. See [Supabase billing documentation](https://supabase.com/docs/guides/platform/billing-on-supabase).

**Revisit when.** Marketing moves to a CMS, or the app outgrows a single deployment.
Even then the app keeps the apex.

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
