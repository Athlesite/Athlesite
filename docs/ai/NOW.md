# NOW — Athlesite current state

Last updated: 2026-09-07 · `main` @ `da61f8f`

A checkpoint, not a log. Overwrite this file; git holds the history.
If the stamp above is behind `git log -1`, treat this file as stale and say so.

## Branch state (product repo)

**`main` is Athlesite's canonical integrated trunk.** PR #2 merged
`founder/integration-v1` into `main` as merge commit `da61f8f`, bringing the app
foundation, the approved homepage design, Supabase Phase A, and this context system
together for the first time. All original commits and authorship are preserved.

| Branch | Commit | State |
| --- | --- | --- |
| `main` | `da61f8f` | **Canonical trunk. All product work lives here.** |
| `willy/premium-athlete-design` | `e5cec40` | Merged into `main`. Retained — design refinement expected. |
| `founder/integration-v1` | `05a2b50` | Merged via PR #2. Safe to delete. |
| `claude/ai-context` · `feature/pilot-persistence` | `53402af` · `e9c096f` | Merged. Safe to delete. |
| `feature/athlete-onboarding` · `feature/core-ui` · `foundation/initial-setup` | `12daa01` · `7f3f72c` · `8a2e64a` | Superseded ancestors. Safe to delete. |

## In flight

- **Supabase Phase A.** Schema is applied and live; no application code reads it yet.

## Real external setup state

**Supabase — created, migrated, and running.** Both Phase A migrations were applied by
pasting them into the SQL Editor and executing them successfully: migration 1 created
the athlete profile schema and its RLS, migration 2 created the private `athlete-media`
bucket and its Storage policies. Email authentication and new-user signup are enabled.

*Not finished:* Resend / custom SMTP and OTP email template customization. Setup stopped
partway through Resend domain verification because Athlesite does not yet own a domain,
so transactional email is on Supabase defaults.

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

No CI, no PR template, no test framework, no `typecheck` npm script, no authentication,
no Supabase client. The first four exist in `athlesite-ops` and are portable — each as
its own change, not bundled with feature work.

## Next

1. Phase B — Supabase client, domain↔row mappers, authentication.
2. Register a domain, then finish Resend/SMTP and OTP email templates.

## Blocked on founder

- Pilot definition: how many athletes, by when, and what counts as success.
- Domain registration — which in turn unblocks Resend/SMTP and OTP templates.
- Deployment provider.
