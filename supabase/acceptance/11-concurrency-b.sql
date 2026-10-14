-- Phase 2 live acceptance — PART D, session B: concurrent guardian decisions.
--
-- Run concurrently with 10-concurrency-a.sql, which carries the full design of
-- the handshake and what each round proves.
--
-- B's order in every round is: wait for the committed fixture signal, then
-- wait on the session-scoped GATE (which A holds until it has the row lock),
-- then attempt the conflicting redeem. The gate is what guarantees B's attempt
-- lands strictly after A holds the lock — without it B could win the race and
-- these assertions would be false for reasons that have nothing to do with the
-- database.
--
-- Timeouts allow genuine blocking but bound failed coordination.

set statement_timeout = '70 seconds';
set lock_timeout = '45 seconds';
set application_name = 'phase2-acceptance-b';

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 1 — approve vs approve
-- ══════════════════════════════════════════════════════════════════════════

select phase2_acceptance.record(
  'D1', 'B: round 1 fixture signal arrived', 'true',
  phase2_acceptance.signal_wait('round1-fixture')::text
);

-- Blocks until A has the row lock.
select phase2_acceptance.gate_pass(1001);

begin;
  set local statement_timeout = '70 seconds';
  set local lock_timeout = '45 seconds';

  -- Blocks on A's row lock, then re-evaluates its own WHERE clause against the
  -- committed row and finds it no longer 'pending'.
  select phase2_acceptance.record(
    'D1', 'B: approve vs approve — B result (the loser)', 'unavailable',
    public.redeem_guardian_request(phase2_acceptance.token(1), 'approve')
  );
commit;
select phase2_acceptance.signal_set('round1-done');

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 2 — decline vs decline
-- ══════════════════════════════════════════════════════════════════════════

select phase2_acceptance.record(
  'D2', 'B: round 2 fixture signal arrived', 'true',
  phase2_acceptance.signal_wait('round2-fixture')::text
);

select phase2_acceptance.gate_pass(1002);

begin;
  set local statement_timeout = '70 seconds';
  set local lock_timeout = '45 seconds';

  select phase2_acceptance.record(
    'D2', 'B: decline vs decline — B result (the loser)', 'unavailable',
    public.redeem_guardian_request(phase2_acceptance.token(2), 'decline')
  );
commit;
select phase2_acceptance.signal_set('round2-done');

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 3 — approve vs decline
-- ══════════════════════════════════════════════════════════════════════════

select phase2_acceptance.record(
  'D3', 'B: round 3 fixture signal arrived', 'true',
  phase2_acceptance.signal_wait('round3-fixture')::text
);

select phase2_acceptance.gate_pass(1003);

begin;
  set local statement_timeout = '70 seconds';
  set local lock_timeout = '45 seconds';

  select phase2_acceptance.record(
    'D3', 'B: approve vs decline — B result (decline, the loser)', 'unavailable',
    public.redeem_guardian_request(phase2_acceptance.token(3), 'decline')
  );
commit;
select phase2_acceptance.signal_set('round3-done');

select 'session B complete' as status;
