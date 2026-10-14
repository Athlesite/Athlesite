-- Phase 2 live acceptance — PART E, session A: lock-wait expiry and the
-- deleted-owner race.
--
-- ══════════════════════════════════════════════════════════════════════════
-- RUN THIS CONCURRENTLY WITH 21-lockwait-b.sql
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── ROUND 1: THE `now()` vs `clock_timestamp()` DISCRIMINATOR ───────────
--
-- 20261013000001 uses `clock_timestamp()` — not `now()` — for the post-lock
-- expiry re-check, because `now()` is frozen at transaction START and does not
-- advance while a statement sits waiting for `FOR UPDATE`. A redeem that
-- waited behind another transaction could therefore authorise a decision on a
-- request that has, in real time, already expired.
--
-- This round is the only test in the suite that can tell those two
-- implementations apart, and every step exists to make it impossible to pass
-- for the wrong reason:
--
--   1. the fixture expires a few seconds from now
--   2. A holds the readiness GATE, then takes a plain `FOR UPDATE` row lock —
--      A does NOT redeem anything — and only then releases the gate, so B
--      cannot possibly reach the row first
--   3. B BEGINs (fixing its `now()` BEFORE expiry — B asserts this itself)
--      and calls redeem, which blocks on A's lock
--   4. A waits until B is blocked SPECIFICALLY ON A (`pg_blocking_pids`
--      contains A's PID, lock type `transactionid`), with
--      `pg_stat_clear_snapshot()` before each observation
--   5. A then waits past the expiry in real time, asserting it has passed
--   6. A commits, releasing the lock
--   7. B resumes and evaluates expiry
--
-- With `clock_timestamp()` B sees real time, now past expiry, and returns
-- 'unavailable'. With `now()` B would see its own transaction start, before
-- expiry, and would APPROVE AN EXPIRED GUARDIAN REQUEST.
--
-- "B arrived late" cannot produce a pass: step 4 refuses to proceed until B is
-- demonstrably blocked on A, and B separately records that its transaction
-- began before expiry. If either is false the round FAILS with a diagnostic.
--
-- ── ROUND 2: THE DELETED-OWNER RACE ─────────────────────────────────────
--
-- Both RPCs `inner join auth.users`, but `for update of ap` locks only the
-- participation row — not the user row. So an owner can be deleted between the
-- join and the UPDATE. Here A deletes the user (whose cascade takes a lock on
-- the participation row) while B's redeem waits, which is the real ordering of
-- that race. B must come out with the generic 'unavailable' and leave no
-- orphan approval evidence behind.

set statement_timeout = '70 seconds';
set lock_timeout = '45 seconds';
set application_name = 'phase2-acceptance-a';

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 1 — redeem waits out an expiry behind a row lock
-- ══════════════════════════════════════════════════════════════════════════

-- Short enough that the run is quick, long enough that B reliably begins its
-- transaction before it passes. Nothing ASSUMES that: A waits for B to be
-- observably blocked, and B records whether its own transaction started in
-- time.
select phase2_acceptance.gate_hold(2001);
select phase2_acceptance.make_pending_minor(5, interval '8 seconds');
select phase2_acceptance.signal_set('lockwait-fixture');

begin;
  set local statement_timeout = '70 seconds';
  set local lock_timeout = '45 seconds';

  -- A plain row lock, deliberately NOT a redeem. A stands in for any other
  -- transaction that happens to hold this row — a concurrent guardian, a
  -- maintenance statement — and the point is only that B has to wait.
  select 1
  from public.athlete_participation
  where owner_user_id = phase2_acceptance.owner(5)
  for update;

  -- The row lock is held. Only now may B attempt its redeem.
  select phase2_acceptance.gate_release(2001);

  select phase2_acceptance.record(
    'E1', 'A: B blocked specifically on A''s row lock', 'blocked',
    phase2_acceptance.wait_until_blocked_by('phase2-acceptance-b', 'transactionid')
  );

  -- Hold the lock until real time is past the fixture's expiry, with a margin.
  -- B's transaction timestamp is already fixed before this point, which is the
  -- whole discriminator.
  select phase2_acceptance.wait_until(
    (select expires_at + interval '1 second'
     from public.athlete_participation
     where owner_user_id = phase2_acceptance.owner(5))
  );

  select phase2_acceptance.record(
    'E1', 'A: real time is past expiry at the moment the lock is released', 'true',
    (
      select (clock_timestamp() > expires_at)::text
      from public.athlete_participation
      where owner_user_id = phase2_acceptance.owner(5)
    )
  );
commit;
select phase2_acceptance.signal_wait('expiry1-done');

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 2 — the owner is deleted while a redeem waits
-- ══════════════════════════════════════════════════════════════════════════

select phase2_acceptance.gate_hold(2002);
select phase2_acceptance.make_pending_minor(6);
select phase2_acceptance.signal_set('ownerrace-fixture');

begin;
  set local statement_timeout = '70 seconds';
  set local lock_timeout = '45 seconds';

  -- The cascade from auth.users deletes the participation row, which takes a
  -- lock on exactly the tuple B's `for update of ap` wants.
  delete from auth.users where id = phase2_acceptance.owner(6);

  select phase2_acceptance.gate_release(2002);

  select phase2_acceptance.record(
    'E2', 'A: B blocked specifically behind A''s cascading delete', 'blocked',
    phase2_acceptance.wait_until_blocked_by('phase2-acceptance-b', 'transactionid')
  );
commit;
select phase2_acceptance.signal_wait('expiry2-done');

select 'session A complete' as status;
