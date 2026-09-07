# NOW — Athlesite current state

Last updated: 2026-09-06 · integration branch `founder/integration-v1`

A checkpoint, not a log. Overwrite this file; git holds the history.
If the stamp above is behind `git log -1`, treat this file as stale and say so.

## Branch state (product repo)

**`founder/integration-v1` is where the whole product now lives.** It was built from
`12daa01` by four `--no-ff` merges — AI context, Phase A persistence, the approved
design, then `main` — with **zero conflicts** in any of them. It is a strict superset
of every commit currently in this repository, and all original commits and authorship
are preserved.

| Branch | Commit | State |
| --- | --- | --- |
| `founder/integration-v1` | integration | **All product work, integrated.** The PR candidate for `main`. |
| `main` | `996fc1d` | Still contains **no application code** — a README stub plus an empty `docs/README.md` from PR #1. |
| `willy/premium-athlete-design` | `e5cec40` | Approved homepage design. **Integrated**; kept as the authored source. |
| `feature/pilot-persistence` | `e9c096f` | Phase A schema + `.env.example`. **Integrated.** |
| `claude/ai-context` | `53402af` | The `docs/ai/` system. **Integrated.** |
| `feature/athlete-onboarding` | `12daa01` | The common base all three branched from. |
| `feature/core-ui` · `foundation/initial-setup` | `7f3f72c` · `8a2e64a` | Superseded ancestors. |

**Merging into `main` is conflict-free.** `main` never modified `.gitignore` or
`README.md` — its only change from the root commit is adding an empty `docs/README.md`,
which the integration branch already contains. (An earlier version of this file claimed
those two files would conflict. That was wrong: it compared the two branch tips instead
of each side against their shared base `f79fcc4`.)

`main` is still intended to become Athlesite's canonical integrated trunk. Both live
lines have now been integrated and preserved, so the remaining step is a reviewed PR —
see `DECISIONS.md § Repository & Integration`.

## In flight

- **Supabase Phase A.** Schema is applied and live; no application code reads it yet.
- **PR from `founder/integration-v1` into `main`** — not yet opened.

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

1. Visually review the integrated site, then open the PR from
   `founder/integration-v1` into `main`.
2. Phase B — Supabase client, domain↔row mappers, authentication.
3. Register a domain, then finish Resend/SMTP and OTP email templates.

## Blocked on founder

- Pilot definition: how many athletes, by when, and what counts as success.
- Domain registration — which in turn unblocks Resend/SMTP and OTP templates.
- Deployment provider.
