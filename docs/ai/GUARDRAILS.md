# Guardrails

Boundaries that must not move casually. These are deliberate. Each states the rule, the
boundary it protects, and what to do instead.

If a task requires crossing one of these, **stop and propose it** — do not cross it and
explain afterward.

---

## Secrets

**Never commit a secret value.** No keys, tokens, JWTs, passwords, connection strings,
Supabase project refs, or authenticated dashboard URLs — in source, docs, tests,
fixtures, screenshots, logs, or commit messages.

- `docs/ai/` documents the *existence and location* of configuration, never its value.
- Variable names are documented in exactly one place: `.env.example`, with empty values.
- Real values live in the Supabase dashboard and the deployment platform's environment
  settings. Docs say *where*, never *what*.
- `.env*` is gitignored with a single `!.env.example` exception. Do not widen it.
- Every `NEXT_PUBLIC_*` value is public by definition — it ships in browser code. Never
  put a privileged credential behind that prefix.

*If a secret is ever committed:* treat it as compromised, rotate it, and say so. Removing
the commit is not sufficient.

## Row Level Security

**RLS is mandatory on every table exposed through the Data API.** No exceptions.

- Grants and policies ship together, in the same migration that introduces the table or
  operation. Grants decide whether a role may *attempt* an operation; RLS decides which
  rows it may touch.
- Write one policy per operation. `TO authenticated` is authentication, not
  authorization.
- `UPDATE` policies need both `USING` and `WITH CHECK`.
- Authorize from `(select auth.uid())`. Never from `user_metadata`, which the user can
  edit.
- Treat views and `SECURITY DEFINER` functions as privileged surfaces.

## Ownership

**An athlete may read, write, and delete only their own data.** `owner_user_id` is the
boundary, and it is enforced in the database — not in the UI, and not in a route
handler.

Client-side checks are user experience. They are never the enforcement layer.

## Storage

- Buckets stay **private** unless public access is an explicit, reviewed product
  requirement.
- `storage.objects` policies are scoped to the bucket *and* the path. The first path
  segment must equal the caller's `auth.uid()`.
- Media visibility joins back to `athlete_profiles.is_published` — media and profile
  share one visibility rule.
- Serve media through signed URLs generated at render time. Never persist a resolved
  URL.
- Keep the bucket-level size and MIME limits in place as a second layer behind client
  validation.

## Public / private boundary

`is_published` is the **only** mechanism controlling public visibility, and it governs
both the profile row and its media.

Adding a second visibility concept — unlisted links, per-section privacy, preview
tokens, drafts visible to a third party — means redesigning both policies together, with
founder sign-off. It is not an incremental change.

## Migrations

- Every schema, grant, policy, function, trigger, and Storage change goes in a reviewed
  migration. Nothing is configured only by hand in the dashboard.
- **Never edit a migration that has been applied.** Add a corrective migration.
- Keep migrations focused and forward-safe. Document destructive or irreversible steps.
- Verify both authorized success *and* unauthorized denial before trusting a policy.

## Athlete data

- Collect only what the profile actually needs. These are largely **minors** —
  high-school recruits — so err toward collecting less.
- Never put real athlete data in fixtures, tests, screenshots, issues, or logs. The
  example profile (`jordan-bell`) is fictional; keep it that way.
- Contact fields exist so an athlete can be reached deliberately, not so they can be
  scraped in bulk.

## Workflow

- Never commit application code directly to `main`.
- One task per branch: `claude/<name>`, `codex/<name>`, `founder/<name>`.
- Inspect the branch and working tree before changing anything.
- **Never overwrite, reset, discard, or silently absorb existing founder work.** If your
  task overlaps an in-flight branch, stop and ask. `willy/premium-athlete-design` is
  approved, unmerged work — treat it as protected.
- Run `npm run lint` and `npm run build` before committing, and report both results.
- Stage explicitly by path. Never `git add -A` in a repo with unrelated local state.

## Authority: AI proposes, founders decide

AI agents may **implement within these boundaries**. The following require explicit
founder approval before implementation:

- Schema, RLS policy, grant, or Storage policy changes
- The authentication or ownership model
- Publishing and visibility semantics
- Slug and identity rules, including anything that changes a live public URL or shrinks
  the reserved root-slug list
- Vendor selection or the introduction of a new external service
- Product scope and direction, and anything that widens the wedge
- Design direction, and any change touching the approved homepage direction
- Merging to `main`

Founders are Conner Fulton (CFul) and Connor Williamson (Willy/CW).

When a task is ambiguous at one of these boundaries, do the parts that are unambiguous,
then ask. Do not assume, and do not silently narrow the task to avoid asking.
