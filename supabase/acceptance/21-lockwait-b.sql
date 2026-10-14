-- Phase 2 live acceptance — PART E, session B: lock-wait expiry and the
-- deleted-owner race.
--
-- Run concurrently with 20-lockwait-a.sql, which carries the full design.

set statement_timeout = '70 seconds';
set lock_timeout = '45 seconds';
set application_name = 'phase2-acceptance-b';

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 1 — redeem waits out an expiry behind a row lock
-- ══════════════════════════════════════════════════════════════════════════

select phase2_acceptance.record(
  'E1', 'B: lock-wait fixture signal arrived', 'true',
  phase2_acceptance.signal_wait('lockwait-fixture')::text
);

-- Blocks until A holds the row lock. Without this gate B could take the row
-- first and the whole round would prove nothing.
select phase2_acceptance.gate_pass(2001);

begin;
  set local statement_timeout = '70 seconds';
  set local lock_timeout = '45 seconds';

  -- A plain SELECT, so MVCC serves it without blocking. Its purpose is to pin
  -- down the PRECONDITION the whole round depends on: this transaction's
  -- `now()` must be strictly BEFORE the fixture's expiry. If that is not true
  -- — because A was slow, or the fixture window was too short — then B would
  -- return 'unavailable' for the ordinary reason rather than the interesting
  -- one, and the round would pass while proving nothing. Recording it makes
  -- that impossible to miss.
  select phase2_acceptance.record(
    'E1', 'B: precondition — B''s transaction began BEFORE expiry', 'true',
    (
      select (transaction_timestamp() < expires_at)::text
      from public.athlete_participation
      where owner_user_id = phase2_acceptance.owner(5)
    )
  );

  -- Blocks on A's row lock. When it resumes, real time is past expiry while
  -- this transaction's `now()` is still before it. `clock_timestamp()` sees
  -- the former and refuses; `now()` would see the latter and approve.
  select phase2_acceptance.record(
    'E1', 'B: a redeem that waits out the expiry is refused', 'unavailable',
    public.redeem_guardian_request(phase2_acceptance.token(5), 'approve')
  );

  -- B ACTUALLY WAITED. Without this the round could pass with B having arrived
  -- after A committed — no overlap, no lock wait, and `now()` would have been
  -- past expiry too, so the discriminator would not have been exercised at
  -- all. A's `wait_until_blocked_by` proves the wait from the other side; this
  -- proves it from B's, by measuring how long B's own transaction has been
  -- open. The fixture window is 8s and A holds the lock past it, so a real
  -- wait is seconds; 2s is a floor well clear of scheduling noise.
  select phase2_acceptance.record(
    'E1', 'B: the redeem genuinely blocked for seconds, not microseconds', 'true',
    (clock_timestamp() - transaction_timestamp() > interval '2 seconds')::text
  );

  -- The duration itself goes in the assertion NAME, so the report shows it
  -- while the row still compares equal. `date_part` rather than `extract`,
  -- because `extract(epoch from x)` is grammar and cannot be qualified.
  select phase2_acceptance.record(
    'E1',
    'B: observed wait of ' || pg_catalog.round(
      pg_catalog.date_part('epoch', clock_timestamp() - transaction_timestamp())::numeric, 1
    )::text || 's (informational)',
    'recorded', 'recorded'
  );

  select phase2_acceptance.record(
    'E1', 'B: real time was past expiry when the decision was evaluated', 'true',
    (
      select (clock_timestamp() > expires_at)::text
      from public.athlete_participation
      where owner_user_id = phase2_acceptance.owner(5)
    )
  );

  -- The transaction-start clock was NOT past expiry — this is the assertion
  -- that documents the discriminator rather than merely relying on it.
  select phase2_acceptance.record(
    'E1', 'B: transaction-start time was NOT past expiry (so now() would have approved)', 'false',
    (
      select (transaction_timestamp() > expires_at)::text
      from public.athlete_participation
      where owner_user_id = phase2_acceptance.owner(5)
    )
  );
commit;
select phase2_acceptance.signal_set('expiry1-done');

-- Nothing committed: no status change, no cleared token, and above all no
-- evidence row. A refused decision that still wrote evidence would be the
-- worst outcome of the three, because the evidence is the durable record.
select phase2_acceptance.record(
  'E1', 'B: the expired request is untouched and no evidence was written', 'pending/present/null/0',
  (
    select p.status || '/'
        || case when p.token_hash is null then 'cleared' else 'present' end || '/'
        || case when p.decided_at is null then 'null' else 'set' end || '/'
        || (select pg_catalog.count(*) from public.participation_events e
            where e.owner_user_id = phase2_acceptance.owner(5))
    from public.athlete_participation p
    where p.owner_user_id = phase2_acceptance.owner(5)
  )
);

-- ══════════════════════════════════════════════════════════════════════════
-- ROUND 2 — the owner is deleted while a redeem waits
-- ══════════════════════════════════════════════════════════════════════════

select phase2_acceptance.record(
  'E2', 'B: owner-race fixture signal arrived', 'true',
  phase2_acceptance.signal_wait('ownerrace-fixture')::text
);

-- Blocks until A's cascading delete holds the participation row.
select phase2_acceptance.gate_pass(2002);

begin;
  set local statement_timeout = '70 seconds';
  set local lock_timeout = '45 seconds';

  select phase2_acceptance.record(
    'E2', 'B: a redeem whose owner is deleted mid-wait is refused', 'unavailable',
    public.redeem_guardian_request(phase2_acceptance.token(6), 'approve')
  );
commit;
select phase2_acceptance.signal_set('expiry2-done');

select phase2_acceptance.record(
  'E2', 'B: no participation row and no orphan evidence for the deleted owner', '0/0',
  (
    select (select pg_catalog.count(*) from public.athlete_participation p
            where p.owner_user_id = phase2_acceptance.owner(6))::text
        || '/'
        || (select pg_catalog.count(*) from public.participation_events e
            where e.owner_user_id = phase2_acceptance.owner(6))::text
  )
);

select 'session B complete' as status;
