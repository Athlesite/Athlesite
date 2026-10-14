-- Phase 2 live acceptance — PART J, session A: the limits are HARD CAPS.
--
-- ══════════════════════════════════════════════════════════════════════════
-- RUN THIS CONCURRENTLY WITH 13-limiter-atomic-b.sql
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── THE DEFECT THIS TESTS FOR ───────────────────────────────────────────
--
-- Count, compare, insert is not atomic on its own. At 299 of a 300 global cap,
-- two concurrent requests both read 299, both decide they are under the limit,
-- and both insert — so the cap admits 301. The thresholds in
-- private.guardian_rate_limit_enforce are supposed to be CAPS, so the three
-- steps must be mutually exclusive against any other request counting the
-- same bucket. This was a real defect, found by independent review, and the
-- fix is `pg_advisory_xact_lock` in the enforcer.
--
-- Part B of the harness exercises the thresholds inside ONE transaction, where
-- a request sees its own uncommitted rows, so it proves the arithmetic but
-- cannot prove the mutual exclusion. Only two real sessions can.
--
-- ── WHY THIS CANNOT PASS ON LUCKY TIMING ────────────────────────────────
--
-- Every round sits the counters exactly one request below a cap, then forces
-- two attempts to overlap:
--
--   A holds the readiness GATE from its first statement, seeds the counters,
--   signals, opens a transaction, calls the dispatcher (which acquires the
--   ADVISORY lock and inserts), releases the gate, and only then waits until B
--   is blocked SPECIFICALLY ON A — `pg_blocking_pids(B)` must contain A's PID
--   and the ungranted lock must be of type `advisory`. That last part is the
--   whole point: it proves the serialization came from the advisory lock the
--   fix added, not from some incidental contention.
--
-- If the advisory lock were missing, B would NOT block — it would count 299
-- just as A did, insert, and succeed. The detector would time out, A would
-- record the diagnostic, and the round would FAIL. So a passing round is
-- positive evidence of serialization, and a non-atomic implementation cannot
-- produce one.

set statement_timeout = '70 seconds';
set lock_timeout = '45 seconds';
set application_name = 'phase2-acceptance-a';

-- Seeds a bucket to exactly one request below a cap, using the limiter's own
-- key derivation so the rows land in the bucket the dispatcher will count.
create or replace function phase2_acceptance.seed_limiter(
  p_endpoint text,
  p_ip text,
  p_rows integer,
  p_age interval default interval '5 seconds'
)
returns void
language sql
as $$
  insert into private.guardian_rate_limits (bucket_key, endpoint, request_at)
  select
    private.guardian_rate_limit_bucket_key(p_ip::inet),
    p_endpoint,
    clock_timestamp() - p_age
  from pg_catalog.generate_series(1, p_rows);
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 1 — the GLOBAL peek cap (300) at 299
-- ══════════════════════════════════════════════════════════════════════════
--
-- Seeded across many distinct networks so only the GLOBAL cap is near its
-- limit; the per-network burst (10/min) must not be what refuses B, or the
-- round would be testing the wrong lock.

select phase2_acceptance.gate_hold(3001);

delete from private.guardian_rate_limits;
do $$
declare
  v_i integer;
begin
  -- 299 rows spread over 299 different /24s: 1 per network, far under the
  -- per-network burst, exactly one under the global cap of 300.
  for v_i in 1..299 loop
    perform phase2_acceptance.seed_limiter(
      'peek', '10.' || (v_i / 250)::text || '.' || (v_i % 250)::text || '.1', 1
    );
  end loop;
end;
$$;

select phase2_acceptance.record(
  'J1', 'precondition: global peek counters seeded to 299 (cap 300)', '299',
  (select pg_catalog.count(*)::text from private.guardian_rate_limits where endpoint = 'peek')
);

select phase2_acceptance.signal_set('atomic1-fixture');

begin;
  set local statement_timeout = '70 seconds';
  set local lock_timeout = '45 seconds';
  set local application_name = 'phase2-acceptance-a';

  select phase2_acceptance.record(
    'J1', 'A: the 300th global peek request is allowed', 'allowed',
    phase2_acceptance.probe('/rpc/peek_guardian_request', 'POST', phase2_acceptance.client('192.0.2.77'))
  );

  select phase2_acceptance.gate_release(3001);

  select phase2_acceptance.record(
    'J1', 'A: B blocked on A''s ADVISORY lock (not incidental contention)', 'blocked',
    phase2_acceptance.wait_until_blocked_by('phase2-acceptance-b', 'advisory')
  );
commit;
select phase2_acceptance.signal_wait('atomic1-done');

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 2 — the per-NETWORK peek burst cap (10) at 9
-- ══════════════════════════════════════════════════════════════════════════
--
-- Same shape, one cap down. Both requests come from the same /24, so the
-- network lock is the one that has to serialize them.

select phase2_acceptance.gate_hold(3002);

delete from private.guardian_rate_limits;
select phase2_acceptance.seed_limiter('peek', '198.51.100.5', 9);

select phase2_acceptance.record(
  'J2', 'precondition: one /24 seeded to 9 peek requests (burst cap 10)', '9',
  (select pg_catalog.count(*)::text from private.guardian_rate_limits)
);

select phase2_acceptance.signal_set('atomic2-fixture');

begin;
  set local statement_timeout = '70 seconds';
  set local lock_timeout = '45 seconds';
  set local application_name = 'phase2-acceptance-a';

  select phase2_acceptance.record(
    'J2', 'A: the 10th peek request from the /24 is allowed', 'allowed',
    phase2_acceptance.probe('/rpc/peek_guardian_request', 'POST', phase2_acceptance.client('198.51.100.6'))
  );

  select phase2_acceptance.gate_release(3002);

  select phase2_acceptance.record(
    'J2', 'A: B blocked on an ADVISORY lock held by A', 'blocked',
    phase2_acceptance.wait_until_blocked_by('phase2-acceptance-b', 'advisory')
  );
commit;
select phase2_acceptance.signal_wait('atomic2-done');

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 3 — the per-NETWORK redeem burst cap (5) at 4
-- ══════════════════════════════════════════════════════════════════════════
--
-- Redeem has its own, lower thresholds, and its own lock keys. Repeating the
-- test for redeem is not ceremony: a key built from the endpoint is the thing
-- that keeps the two classes from sharing a cap, and this is what would fail
-- if that ever broke.

select phase2_acceptance.gate_hold(3003);

delete from private.guardian_rate_limits;
select phase2_acceptance.seed_limiter('redeem', '203.0.113.5', 4);

select phase2_acceptance.record(
  'J3', 'precondition: one /24 seeded to 4 redeem requests (burst cap 5)', '4',
  (select pg_catalog.count(*)::text from private.guardian_rate_limits)
);

select phase2_acceptance.signal_set('atomic3-fixture');

begin;
  set local statement_timeout = '70 seconds';
  set local lock_timeout = '45 seconds';
  set local application_name = 'phase2-acceptance-a';

  select phase2_acceptance.record(
    'J3', 'A: the 5th redeem request from the /24 is allowed', 'allowed',
    phase2_acceptance.probe('/rpc/redeem_guardian_request', 'POST', phase2_acceptance.client('203.0.113.6'))
  );

  select phase2_acceptance.gate_release(3003);

  select phase2_acceptance.record(
    'J3', 'A: B blocked on an ADVISORY lock held by A', 'blocked',
    phase2_acceptance.wait_until_blocked_by('phase2-acceptance-b', 'advisory')
  );
commit;
select phase2_acceptance.signal_wait('atomic3-done');

select 'session A complete' as status;
