-- Phase 2 live acceptance — PART D, session A: concurrent guardian decisions.
--
-- ══════════════════════════════════════════════════════════════════════════
-- RUN THIS CONCURRENTLY WITH 11-concurrency-b.sql
-- ══════════════════════════════════════════════════════════════════════════
--
-- scripts/phase2-acceptance.mjs launches both. Running this file alone stalls
-- at `wait_until_blocked_by` and records a FAIL, which is the correct outcome
-- rather than a silent pass.
--
-- ── WHAT IS BEING PROVEN, AND WHY IT NEEDS TWO SESSIONS ─────────────────
--
-- 20261013000001 claims that concurrent approve/decline "cannot both succeed"
-- as a DATABASE guarantee, because `for update of ap` makes the second attempt
-- block and then re-evaluate its WHERE clause against the committed row. That
-- is a claim about overlapping transactions on one row. A single session
-- cannot test it, a structural contract cannot test it, and jsdom certainly
-- cannot.
--
-- ── THE SYNCHRONISATION, AND WHY IT CANNOT DEGRADE SILENTLY ─────────────
--
-- Three separate failure modes were found in the first version of this file,
-- and all three are closed here. See the readiness-gate note in 00-setup.sql
-- for the full ordering argument.
--
--   1. A USED TO SIGNAL READY TOO EARLY — as soon as the fixture existed,
--      which is before A held the row lock. B could then win the race, making
--      A the loser and the assertions below false for a reason that has
--      nothing to do with the database. Now A holds a session-scoped advisory
--      GATE from its first statement, opens its transaction, acquires the row
--      lock by performing the redeem, and only THEN releases the gate. B
--      physically cannot attempt its redeem before A holds the row lock.
--
--   2. THE DETECTOR POLLED A STALE SNAPSHOT. `pg_stat_activity` is served from
--      a per-transaction stats snapshot, so inside A's open transaction every
--      iteration saw the same frozen view and a session that blocked later was
--      invisible. `wait_until_blocked_by` now calls
--      `pg_stat_clear_snapshot()` before each observation.
--
--   3. THE DETECTOR DID NOT PROVE A WAS B'S BLOCKER. `wait_event_type =
--      'Lock'` only means B waits for something. It now requires A's own PID
--      to appear in `pg_blocking_pids(B)` and the ungranted lock to be of the
--      expected type — `transactionid` here, which is what a row-lock wait
--      resolves to once the holder's transaction is identified.
--
-- A does not commit until the detector returns 'blocked'. If it times out, A
-- records the diagnostic and the round FAILS. "The race never happened" is
-- therefore a visible failure, never a green run.

set statement_timeout = '70 seconds';
set lock_timeout = '45 seconds';
set application_name = 'phase2-acceptance-a';

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 1 — approve vs approve
-- ══════════════════════════════════════════════════════════════════════════

select phase2_acceptance.gate_hold(1001);
select phase2_acceptance.make_pending_minor(1);
select phase2_acceptance.signal_set('round1-fixture');

begin;
  set local statement_timeout = '70 seconds';
  set local lock_timeout = '45 seconds';

  -- Acquires the row lock as a side effect, and holds it until commit.
  select phase2_acceptance.record(
    'D1', 'A: approve vs approve — A result', 'approved',
    public.redeem_guardian_request(phase2_acceptance.token(1), 'approve')
  );

  -- Only now may B attempt anything.
  select phase2_acceptance.gate_release(1001);

  select phase2_acceptance.record(
    'D1', 'A: B blocked on A''s row lock (pg_blocking_pids proves the relationship)', 'blocked',
    phase2_acceptance.wait_until_blocked_by('phase2-acceptance-b', 'transactionid')
  );
commit;
select phase2_acceptance.signal_wait('round1-done');

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 2 — decline vs decline
-- ══════════════════════════════════════════════════════════════════════════

select phase2_acceptance.gate_hold(1002);
select phase2_acceptance.make_pending_minor(2);
select phase2_acceptance.signal_set('round2-fixture');

begin;
  set local statement_timeout = '70 seconds';
  set local lock_timeout = '45 seconds';

  select phase2_acceptance.record(
    'D2', 'A: decline vs decline — A result', 'declined',
    public.redeem_guardian_request(phase2_acceptance.token(2), 'decline')
  );

  select phase2_acceptance.gate_release(1002);

  select phase2_acceptance.record(
    'D2', 'A: B blocked on A''s row lock', 'blocked',
    phase2_acceptance.wait_until_blocked_by('phase2-acceptance-b', 'transactionid')
  );
commit;
select phase2_acceptance.signal_wait('round2-done');

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 3 — approve vs decline
-- ══════════════════════════════════════════════════════════════════════════
--
-- The most important of the three: the two sessions disagree about the
-- OUTCOME, not merely about who gets there first. Exactly one decision must
-- stand, and the losing one must leave no trace — no status change, and above
-- all no second decision event, since that event is the durable evidence of
-- what the guardian actually chose.

select phase2_acceptance.gate_hold(1003);
select phase2_acceptance.make_pending_minor(3);
select phase2_acceptance.signal_set('round3-fixture');

begin;
  set local statement_timeout = '70 seconds';
  set local lock_timeout = '45 seconds';

  select phase2_acceptance.record(
    'D3', 'A: approve vs decline — A result (approve)', 'approved',
    public.redeem_guardian_request(phase2_acceptance.token(3), 'approve')
  );

  select phase2_acceptance.gate_release(1003);

  select phase2_acceptance.record(
    'D3', 'A: B blocked on A''s row lock', 'blocked',
    phase2_acceptance.wait_until_blocked_by('phase2-acceptance-b', 'transactionid')
  );
commit;
select phase2_acceptance.signal_wait('round3-done');

select 'session A complete' as status;
