<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Athlesite — agent front door

Athlesite gives an athlete one professional, shareable digital home: a single identity
link they own. This repository (`Athlesite/Athlesite`) is the athlete-facing product and
the **canonical home for shared Athlesite context**.

Founders: Conner Fulton (CFul) and Connor Williamson (Willy/CW).

## Read before you work

`docs/ai/` holds the durable context. Do not load all of it for every task.

| Read | When |
| --- | --- |
| [`docs/ai/NOW.md`](docs/ai/NOW.md) | Always, before any non-trivial change. Current state, in flight, blocked. |
| [`docs/ai/GUARDRAILS.md`](docs/ai/GUARDRAILS.md) | Always, before touching auth, athlete data, storage, publishing, migrations, or env. |
| [`docs/ai/CONTEXT.md`](docs/ai/CONTEXT.md) | The task touches the product, domain model, naming, or architecture. |
| [`docs/ai/DECISIONS.md`](docs/ai/DECISIONS.md) | You are about to change, contradict, or question an existing design. Search by heading; do not read it whole. |
| [`docs/ai/INTAKE.md`](docs/ai/INTAKE.md) | Strategy, prioritization, scope, or positioning work only. |

Two habits that keep this honest:

- If a doc names a file, table, column, or flag, **verify it still exists** before acting
  on it.
- If `NOW.md`'s stamped commit is behind `git log -1`, treat it as stale and say so
  rather than trusting it.

## Stack and commands

Next.js 16.3.2 (App Router, Turbopack) · React 19.2.8 · TypeScript · Tailwind CSS v4.

```bash
npm run dev       # local dev server
npm run lint      # ESLint — must pass before commit
npm run build     # production build — must pass before commit
npx tsc --noEmit  # typecheck (no npm script for this yet)
```

## Repo map

- `src/app/` — App Router routes: `/`, `/get-started`, `/athletes/[slug]`
- `src/components/` — `ui/` `layout/` `marketing/` `onboarding/` `forms/` `profile/`
- `src/lib/athlete-profile.ts` — **the canonical domain model; start here**
- `src/lib/onboarding-storage.ts` — current persistence (browser `localStorage`)
- `supabase/migrations/` — schema, RLS, and Storage policy (on `feature/pilot-persistence`)
- `docs/ai/` — durable project context

## Workflow

- Never commit application code directly to `main`.
- One task per branch: `claude/<name>`, `codex/<name>`, `founder/<name>`.
- Inspect the current branch and working tree before changing anything.
- Never overwrite, reset, or silently absorb existing founder work. If your task overlaps
  an in-flight branch, stop and ask.
- Run `npm run lint` and `npm run build` before committing, and report both results.
- Before proposing a merge: summarize every changed file, state the security and RLS
  impact, and list known risks and follow-up work.

## Non-negotiables

1. **No secrets, ever.** No keys, tokens, passwords, connection strings, project refs, or
   authenticated URLs in source, docs, tests, or commit messages. `.env.example`
   documents variable *names* only, with empty values.
2. **Security boundaries are deliberate.** Authentication, ownership, RLS, Storage
   policy, and the published/unpublished boundary. Propose changes; never make them
   unilaterally. See `docs/ai/GUARDRAILS.md`.
3. **Founders own product decisions.** AI proposes and implements within the boundaries
   above. Product direction and consequential architecture belong to the founders.

## Sibling repository

`Athlesite/athlesite-ops` is the founders' internal operations console (Vite + React +
Supabase). It keeps its own `AGENTS.md` for its own stack and operational docs. Shared
company and product context lives **here**, in `docs/ai/`.

`CLAUDE.md` is a pointer to this file. Keep it that way.
