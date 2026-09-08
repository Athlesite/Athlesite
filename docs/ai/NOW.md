# NOW — Athlesite current state

Last updated: 2026-09-07 · `main` @ `1d2337e`

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
  UI in onboarding ✅, **(4) save/publish upsert — in flight**, (5) media upload and
  signed URLs.
- **Supabase Phase A.** Schema is applied and live; the read path uses it.

## Known follow-ups

- **Checkpoint 5 will need the photo bytes, and we currently throw them away.**
  `PhotoPreview` in `src/components/forms/FileField.tsx` is `{ fileName, objectUrl }` —
  `selectPhoto` in the onboarding wizard creates an object URL and discards the `File`.
  Uploading needs the bytes, recoverable via `fetch(objectUrl)` while the blob URL is
  alive, but carrying `file: File` on `PhotoPreview` is the cleaner fix. Deliberately not
  fixed before checkpoint 5.
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

**Supabase — created, migrated, and running.** Both Phase A migrations were applied by
pasting them into the SQL Editor and executing them successfully: migration 1 created
the athlete profile schema and its RLS, migration 2 created the private `athlete-media`
bucket and its Storage policies. Email authentication and new-user signup are enabled.

*Consequence:* because the migrations were applied by hand rather than through the CLI,
the repository and the live project are not linked. `supabase/config.toml` does not
exist — `supabase init` has not been run and committed — so migrations are not yet
reproducibly appliable by a second person or machine. The SQL files remain
authoritative; apply them in order.

**Domain — owned.** `athlesite.com` is registered through Porkbun. This unblocked Resend
domain verification and therefore custom email.

**Transactional email — live, on Resend via Supabase custom SMTP.** DKIM and the send
records are verified. Sender is `Athlesite <noreply@athlesite.com>`. Password-reset and
invitation delivery were both verified by hand. The *Confirm signup* and *Magic
link / OTP* templates use `{{ .Token }}` with **no** `{{ .ConfirmationURL }}` — a link in
the email would be a navigation path, and navigating away from onboarding destroys the
in-memory photo state.

Note that template customization was gated behind configuring custom SMTP: on the free
tier the default templates could not be edited, so numeric-OTP delivery was genuinely
blocked until Resend was in place — not merely unbranded.

**OTP codes are 8 digits, not 6.** This is a dashboard setting and can change without a
code deploy, so nothing may hardcode a length. Most Supabase examples show 6; do not
copy that in.

**Deployment — deliberately unresolved.** No provider has been chosen and this is not
yet a founder decision. Do not assume Vercel or any other host, and do not add
host-specific configuration until the founders decide.

## Not present in this repo

No CI, no PR template, no test framework, no `typecheck` npm script. All four exist in
`athlesite-ops` and are portable — each as its own change, not bundled with feature work.

Authentication is not wired up yet either; the Supabase client and session plumbing
landed in Phase B checkpoint 1, but nothing signs in or reads data through it so far.

## Next

1. Phase B checkpoints 2–5 — mappers and profile reads, email OTP, save/publish, media.
2. Register a domain, then finish Resend/SMTP and OTP email templates.

## Blocked on founder

- Pilot definition: how many athletes, by when, and what counts as success.
- Domain registration — which in turn unblocks Resend/SMTP and OTP templates.
- Deployment provider.
