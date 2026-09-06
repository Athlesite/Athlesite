# NOW — Athlesite current state

Last updated: 2026-09-06 · base commit `12daa01`

A checkpoint, not a log. Overwrite this file; git holds the history.
If the stamp above is behind `git log -1`, treat this file as stale and say so.

## Branch state (product repo)

`main` = `996fc1d` and contains **no application code** — only a README stub and an
empty `docs/README.md` from PR #1. The app line was branched before that merge, so
`main` and the app have genuinely diverged (`main` is ahead 2 / behind 3 of `12daa01`).
Merging the app into `main` will conflict on `README.md` and `.gitignore`.

| Branch | Commit | State |
| --- | --- | --- |
| `feature/athlete-onboarding` | `12daa01` | Last shared app milestone. Base of everything below. |
| `feature/pilot-persistence` | `e9c096f` | Supabase Phase A schema + `.env.example`. Pushed. |
| `willy/premium-athlete-design` | `e5cec40` | **Approved homepage design direction.** Unmerged — preserve. |
| `claude/ai-context` | this branch | The `docs/ai/` system. |
| `feature/core-ui` · `foundation/initial-setup` | `7f3f72c` · `8a2e64a` | Superseded ancestors. |

Nothing has been merged to `main`. The two live lines — persistence and design — share
base `12daa01` and touch disjoint files.

`main` is intended to become Athlesite's canonical integrated trunk. Before it can be
the current application, **both** live lines must be deliberately integrated and
preserved. Neither may be dropped, flattened, or silently absorbed to make a merge
easier. The order and mechanics are not decided — see
`DECISIONS.md § Repository & Integration`.

## In flight

- **Supabase Phase A.** Schema is applied and live; no application code reads it yet.
- **Approved homepage design**, awaiting integration.
- **This AI context system.**

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
2. Integrate the approved homepage design.
3. Bring `main` up to being the real trunk, preserving both live lines.
4. Register a domain, then finish Resend/SMTP and OTP email templates.

## Blocked on founder

- Pilot definition: how many athletes, by when, and what counts as success.
- Domain registration — which in turn unblocks Resend/SMTP and OTP templates.
- Deployment provider.
