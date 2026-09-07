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

- **Phase B — connecting onboarding/profile to Supabase.** Five checkpoints: (1) client
  and session plumbing, (2) mappers + profile read path, (3) email OTP, (4) save/publish
  upsert, (5) media upload and signed URLs.
- **Supabase Phase A.** Schema is applied and live; no application code reads it yet.

## Real external setup state

**Supabase — created, migrated, and running.** Both Phase A migrations were applied by
pasting them into the SQL Editor and executing them successfully: migration 1 created
the athlete profile schema and its RLS, migration 2 created the private `athlete-media`
bucket and its Storage policies. Email authentication and new-user signup are enabled.

*Not finished:* Resend / custom SMTP and OTP email template customization. Setup stopped
partway through Resend domain verification because Athlesite does not yet own a domain,
so transactional email is on Supabase defaults.

*What that means for Phase B:* the default sender is adequate for founder testing but
**not for pilot athletes** — it is rate-limited, unbranded, and lands in spam. The whole
auth flow can still be built and tested now; only deliverability is blocked. When Resend
lands it is Supabase dashboard configuration, not an application-code change.

*Consequence:* because the migrations were applied by hand rather than through the CLI,
the repository and the live project are not linked. `supabase/config.toml` does not
exist — `supabase init` has not been run and committed — so migrations are not yet
reproducibly appliable by a second person or machine. The SQL files remain
authoritative; apply them in order.

**Domain — not owned.** Athlesite does not currently own `athlesite.com` or any other
production domain; registering it is being checked, likely through Porkbun. This is what
blocks Resend verification and therefore custom email. Note that
`toAthleteProfileView` already emits `athlesite.com/{slug}` as the display URL — that is
the intended canonical form (see `DECISIONS.md § Identity & Slugs`), not a claim that
the domain is held.

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
