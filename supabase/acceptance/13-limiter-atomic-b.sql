-- Phase 2 live acceptance — PART J, session B: the limits are HARD CAPS.
--
-- Run concurrently with 12-limiter-atomic-a.sql, which carries the design.
--
-- In each round the counters sit exactly one request below a cap, A takes the
-- last allowed slot inside an open transaction, and B then attempts
-- simultaneously. B must be REFUSED with 429. If enforcement were not atomic,
-- B would read the same pre-A count, pass the same comparison, insert, and
-- succeed — so `refused:429` here is the assertion that the cap is hard.
--
-- Statement and lock timeouts bound failed coordination while allowing real blocking.
-- `application_name` is set inside each transaction as well as on the session,
-- because A's detector finds B by that name and needs it to be the value B is
-- actually blocked under.

set statement_timeout = '70 seconds';
set lock_timeout = '45 seconds';
set application_name = 'phase2-acceptance-b';

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 1 — the GLOBAL peek cap
-- ══════════════════════════════════════════════════════════════════════════

select phase2_acceptance.record(
  'J1', 'B: round 1 seeding signal arrived', 'true',
  phase2_acceptance.signal_wait('atomic1-fixture')::text
);

-- Blocks until A holds the advisory lock, so B's attempt is guaranteed to
-- overlap rather than merely follow.
select phase2_acceptance.gate_pass(3001);

begin;
  set local statement_timeout = '70 seconds';
  set local lock_timeout = '45 seconds';
  set local application_name = 'phase2-acceptance-b';

  -- Blocks on A's advisory lock, then re-counts and finds the cap reached.
  select phase2_acceptance.record(
    'J1', 'B: the simultaneous 301st global peek request is refused', 'refused:429',
    phase2_acceptance.probe('/rpc/peek_guardian_request', 'POST', phase2_acceptance.client('192.0.2.78'))
  );

commit;

-- Exactly one of the two simultaneous attempts was admitted, and the global
-- cap was not exceeded. This is the outcome the blocker asked for.
select phase2_acceptance.record(
  'J1', 'exactly one success: global peek counters are at the cap, not over it', '300',
  (select pg_catalog.count(*)::text from private.guardian_rate_limits where endpoint = 'peek')
);

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 2 — the per-NETWORK peek burst cap
-- ══════════════════════════════════════════════════════════════════════════

select phase2_acceptance.signal_set('atomic1-done');

select phase2_acceptance.record(
  'J2', 'B: round 2 seeding signal arrived', 'true',
  phase2_acceptance.signal_wait('atomic2-fixture')::text
);

select phase2_acceptance.gate_pass(3002);

begin;
  set local statement_timeout = '70 seconds';
  set local lock_timeout = '45 seconds';
  set local application_name = 'phase2-acceptance-b';

  select phase2_acceptance.record(
    'J2', 'B: the simultaneous 11th peek request from the /24 is refused', 'refused:429',
    phase2_acceptance.probe('/rpc/peek_guardian_request', 'POST', phase2_acceptance.client('198.51.100.7'))
  );
commit;

select phase2_acceptance.record(
  'J2', 'exactly one success: the /24 is at its burst cap, not over it', '10',
  (select pg_catalog.count(*)::text from private.guardian_rate_limits)
);

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 3 — the per-NETWORK redeem burst cap
-- ══════════════════════════════════════════════════════════════════════════

select phase2_acceptance.signal_set('atomic2-done');

select phase2_acceptance.record(
  'J3', 'B: round 3 seeding signal arrived', 'true',
  phase2_acceptance.signal_wait('atomic3-fixture')::text
);

select phase2_acceptance.gate_pass(3003);

begin;
  set local statement_timeout = '70 seconds';
  set local lock_timeout = '45 seconds';
  set local application_name = 'phase2-acceptance-b';

  select phase2_acceptance.record(
    'J3', 'B: the simultaneous 6th redeem request from the /24 is refused', 'refused:429',
    phase2_acceptance.probe('/rpc/redeem_guardian_request', 'POST', phase2_acceptance.client('203.0.113.7'))
  );
commit;

select phase2_acceptance.record(
  'J3', 'exactly one success: the /24 is at its redeem burst cap, not over it', '5',
  (select pg_catalog.count(*)::text from private.guardian_rate_limits)
);

select phase2_acceptance.signal_set('atomic3-done');

select 'session B complete' as status;
