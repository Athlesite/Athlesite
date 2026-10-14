-- Guardian-First Participation, Phase 2 production readiness — make
-- peek_guardian_request VOLATILE.
--
-- FOUNDER DECISION A6. One statement, one function, one attribute.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHY THIS IS A CORRECTNESS PREREQUISITE, NOT A HARDENING NICETY
-- ══════════════════════════════════════════════════════════════════════════
--
-- PostgREST chooses a read-only or a read/write transaction from the called
-- function's VOLATILITY — not from the HTTP method:
--
--   * GET and HEAD always run read-only (they may be served from a read
--     replica);
--   * a POST to a STABLE or IMMUTABLE function ALSO runs read-only;
--   * only a POST to a VOLATILE function runs read/write.
--
-- 20261013000001 declared `peek_guardian_request` STABLE, which was right for
-- what that migration knew: the function performs no write, and `stable` was
-- part of how it proved that.
--
-- The pre-request rate limiter (20261014000001) changes what that declaration
-- implies. The limiter INSERTs a counter row, inside the same transaction as
-- the request it precedes. With peek STABLE, a LEGITIMATE `POST
-- /rest/v1/rpc/peek_guardian_request` opens a READ-ONLY transaction, so the
-- limiter's INSERT raises
--
--     25006  cannot execute INSERT in a read-only transaction
--
-- and the request fails. Not "is not rate limited" — FAILS. Arming the hook
-- with peek still STABLE would break every guardian peek in the product,
-- which is a worse outcome than the unlimited-GET path the limiter was partly
-- written to close.
--
-- Hence this migration, and hence its position: it MUST be applied before
-- 20261014000003 arms the hook. See docs/ai/RUNBOOK-phase2-acceptance.md
-- § MIGRATION ORDER.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHY A FORWARD MIGRATION AND NOT AN EDIT
-- ══════════════════════════════════════════════════════════════════════════
--
-- 20261013000001 is reviewed, merged, and byte-pinned in
-- scripts/sql-contract.mjs. docs/ai/GUARDRAILS.md § Migrations: never edit a
-- migration that has been applied — add a corrective one. It has not been
-- applied to production yet, but it HAS been reviewed and pinned, and editing
-- it would silently rewrite an approved security artefact and invalidate the
-- independent structural contract built against its exact text.
--
-- So that file keeps saying `stable`, and the deployed catalog says
-- `volatile`. **That divergence is deliberate and is the point of this
-- file.** scripts/guardian-sql-contract.mjs still asserts the WORD `stable`
-- in 20261013000001 — correctly, because it checks that file's bytes — and
-- its message now points here so nobody "fixes" the apparent contradiction by
-- editing the pinned migration. The deployed volatility is asserted
-- separately, against the catalog, by supabase/acceptance/01-acl.sql.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT CHANGES, AND WHAT PROVABLY DOES NOT
-- ══════════════════════════════════════════════════════════════════════════
--
-- `alter function ... volatile` is the smallest statement that does this. It
-- rewrites exactly one `pg_proc` attribute (`provolatile`). It is NOT
-- `create or replace function`, which would restate the whole body and
-- introduce the risk of drift from the reviewed text, and would be a second
-- definition of a function this migration has no business redefining.
--
-- Unchanged, because this statement form cannot touch them:
--
--   * the function body — still the same read-only `return query select`,
--     with no INSERT, UPDATE or DELETE anywhere in it. **Peek remains
--     logically read-only.** VOLATILE is a declaration about what the planner
--     may assume, not a permission to write and not an instruction to.
--   * the owner (`postgres`), and therefore the SECURITY DEFINER privileges
--     it runs with;
--   * the ACL — `anon` holds EXECUTE, `authenticated` and PUBLIC do not;
--   * `set search_path = ''`;
--   * the argument list and the return table, so the projection a guardian
--     sees is byte-identical;
--   * SECURITY DEFINER itself, and the strict canonical token validation.
--
-- `redeem_guardian_request` is untouched here. It was already VOLATILE (its
-- 20261013000001 declaration names no volatility, and VOLATILE is
-- PostgreSQL's default), which is correct — it writes.
--
-- ══════════════════════════════════════════════════════════════════════════
-- CONSEQUENCES, STATED PLAINLY
-- ══════════════════════════════════════════════════════════════════════════
--
-- 1. POST peek now runs in a read/write transaction, so the pre-request
--    limiter can record it. This is the reason for the change.
--
-- 2. **PostgREST will no longer serve peek over GET or HEAD.** A volatile
--    function is not GET-able; PostgREST refuses with 405 at the routing
--    layer, before any transaction opens. The unlimited-GET path onto a
--    privileged function is therefore closed at its root, not merely refused
--    by the limiter's own method gate — which is kept as defence in depth
--    precisely so that reverting this file degrades to a refusal rather than
--    to an unlimitable call.
--
--    Nothing in the product regresses: supabase-js `.rpc()` issues POST
--    unless explicitly asked for GET, and
--    src/lib/guardian/guardian-repository.ts never asks.
--
-- 3. The planner will no longer fold or cache peek calls within a statement.
--    Irrelevant here: it is called once per request, with one argument, by
--    one caller.
--
-- 4. Peek is now indistinguishable from redeem by volatility alone. The
--    read-only-ness of peek is proven where it always actually was — by its
--    body, by 20261013000001's structural contract, and by the acceptance
--    assertions that a peek writes nothing and consumes no token.
--
-- ROLLBACK: `alter function public.peek_guardian_request(text) stable;` as a
-- forward corrective migration. Do this ONLY with the hook disarmed
-- (RUNBOOK § A8), because reverting it while armed reintroduces the 25006
-- failure on every POST peek.

alter function public.peek_guardian_request(text) volatile;

comment on function public.peek_guardian_request(text) is
  'Bearer-authorized, read-only peek at a minor/pending guardian request. Never '
  'consumes the token, never approves/declines, never writes anything. Returns zero '
  'rows for every non-authorizing case (malformed, no match, wrong state, expired, '
  'deleted owner) through the identical path, by design — no token-existence oracle. '
  'Projection excludes owner_user_id, token_hash, request_generation, guardian_email, '
  'and all delivery metadata. Declared VOLATILE by 20261014000002 so that a POST runs '
  'in a read/write transaction and the PostgREST pre-request rate limiter can record '
  'it; the body is unchanged and performs no write. See Guardian-First Participation '
  'Phase 2.';
