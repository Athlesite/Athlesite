-- Phase 2 live acceptance — PART H: the read-only-transaction hazard, shown
-- rather than argued.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DEMONSTRATES, AND WHY IT IS WORTH A WHOLE FILE
-- ══════════════════════════════════════════════════════════════════════════
--
-- FOUNDER DECISION A6 rests on a claim about PostgREST: it picks a read-only
-- or a read/write transaction from the called function's VOLATILITY, not from
-- the HTTP method. GET and HEAD always run read-only; a POST to a STABLE or
-- IMMUTABLE function ALSO runs read-only; only a POST to a VOLATILE function
-- runs read/write.
--
-- The consequence is the part that is easy to state and easy to doubt: with
-- `peek_guardian_request` left STABLE, a LEGITIMATE POST peek would open a
-- read-only transaction, the pre-request limiter's INSERT would raise 25006,
-- and the request would FAIL. Not "go unlimited" — fail. That is a product
-- outage on the guardian surface, and it is a worse outcome than the
-- unlimited-GET path the limiter was partly written to close.
--
-- This file makes that concrete. It opens genuinely read-only transactions and
-- drives the dispatcher through them, so the 25006 is OBSERVED rather than
-- predicted. Two readings follow from a pass:
--
--   * the hazard is real, so 20261014000002 is a prerequisite and not a
--     nicety — and `01-acl.sql` A2 asserting `provolatile = 'v'` is the check
--     that keeps it from being skipped;
--   * the hazard is confined to guardian paths. An unrelated request in the
--     same read-only transaction is untouched, because the dispatcher returns
--     before any I/O — so arming the hook cannot break read-only or
--     read-replica traffic anywhere else in the project.
--
-- WHAT IT STILL CANNOT PROVE: that PostgREST actually opens a read/write
-- transaction for a POST to a VOLATILE function on a deployed project. That is
-- PostgREST's behaviour, not PostgreSQL's, and it is a live-only item
-- (RUNBOOK § A6). The catalog assertion plus this demonstration together are
-- the strongest statement this repository can make.
--
-- Transaction control has to be at the top level — `set transaction read only`
-- must be the first statement of a transaction — so the outcomes are captured
-- into psql variables with \gset and recorded afterwards, once the session is
-- writable again.

-- ── Unrelated traffic inside a read-only transaction: unaffected ─────────

begin;
set transaction read only;
select phase2_acceptance.probe('/athlete_profiles', 'GET') as ro_table \gset
rollback;

begin;
set transaction read only;
select phase2_acceptance.probe('/rpc/get_published_profile_by_slug', 'GET') as ro_rpc \gset
rollback;

begin;
set transaction read only;
select phase2_acceptance.probe('/', 'GET') as ro_root \gset
rollback;

-- ── A guardian POST inside a read-only transaction: the limiter cannot
--    record, so the request fails outright. This is exactly what peek would
--    do on every call if it were still STABLE. ──────────────────────────────

begin;
set transaction read only;
select phase2_acceptance.probe(
  '/rpc/peek_guardian_request', 'POST', phase2_acceptance.client('198.51.100.44')
) as ro_peek \gset
rollback;

begin;
set transaction read only;
select phase2_acceptance.probe(
  '/rpc/redeem_guardian_request', 'POST', phase2_acceptance.client('198.51.100.44')
) as ro_redeem \gset
rollback;

-- ── A refusal needs no write, so the method gate still works read-only ───
--
-- This is the property that makes the gate worth keeping as defence in depth:
-- it is effective in precisely the transaction mode where the limiter is not.

begin;
set transaction read only;
select phase2_acceptance.probe(
  '/rpc/peek_guardian_request', 'GET', phase2_acceptance.client('198.51.100.44')
) as ro_get_peek \gset
rollback;

-- ── Record ───────────────────────────────────────────────────────────────

select phase2_acceptance.record(
  'H1', 'a read-only transaction leaves unrelated table traffic untouched', 'allowed', :'ro_table'
);
select phase2_acceptance.record(
  'H1', 'a read-only transaction leaves unrelated RPC traffic untouched', 'allowed', :'ro_rpc'
);
select phase2_acceptance.record(
  'H1', 'a read-only transaction leaves the OpenAPI root untouched', 'allowed', :'ro_root'
);

select phase2_acceptance.record(
  'H2', 'a guardian POST in a read-only transaction fails 25006 — the hazard A6 removes',
  'raised:25006', :'ro_peek'
);
select phase2_acceptance.record(
  'H2', 'the same holds for redeem, confirming it is the transaction mode and not the endpoint',
  'raised:25006', :'ro_redeem'
);

select phase2_acceptance.record(
  'H3', 'the method gate still refuses GET in a read-only transaction (no write needed)',
  'refused:405', :'ro_get_peek'
);

-- Nothing can have been written by any of the above: every transaction was
-- read-only and every one was rolled back.
select phase2_acceptance.record(
  'H3', 'no limiter row survived the read-only probes', '0',
  phase2_acceptance.limiter_rows()::text
);

select 'part H complete' as status;
