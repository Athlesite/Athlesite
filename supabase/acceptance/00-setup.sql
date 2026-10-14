-- Phase 2 live acceptance — fixtures and harness scaffolding.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THIS FILE CREATES SYNTHETIC MINOR PARTICIPATION ROWS. NOT FOR PRODUCTION.
-- ══════════════════════════════════════════════════════════════════════════
--
-- docs/ai/GUARDRAILS.md § Athlete data forbids real athlete data in fixtures,
-- and the Phase 2 checkpoint forbids manufacturing production minors. Both are
-- satisfied the same way: these rows are entirely fictional, their email
-- addresses are on `example.invalid` (RFC 6761 — guaranteed never resolvable,
-- so nothing can ever be delivered to them), and the harness refuses to run
-- unless the operator has named a non-production host. See
-- scripts/phase2-acceptance.mjs for the gate and
-- docs/ai/RUNBOOK-phase2-acceptance.md for the procedure.
--
-- Everything the harness creates lives in the `phase2_acceptance` schema or is
-- an `auth.users` row whose id is in a fixed, recorded set, so 99-teardown.sql
-- can remove all of it without touching anything else.

-- Preflight is read-only and precedes ALL mutation, including helper DDL.
begin;
do $$
begin
  if pg_catalog.current_setting('phase2_acceptance.run_id', true) is null then
    raise exception 'PHASE2 PREFLIGHT STOP — runner run ID is required';
  end if;
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'phase2_acceptance') then
    raise exception 'PHASE2 PREFLIGHT STOP — existing acceptance schema; preserve its ledger and clean up that run explicitly';
  end if;
  if exists (
    select 1 from auth.users u
    where u.id in (select ('aaaaaaaa-0000-4000-8000-00000000000' || s::text)::uuid
                   from pg_catalog.generate_series(1, 8) s)
  ) then
    raise exception 'PHASE2 PREFLIGHT STOP — fixture-ID collision; no mutation performed';
  end if;
  if exists (select 1 from auth.users) then
    raise exception 'PHASE2 PREFLIGHT STOP — auth.users must be empty on this isolated throwaway database';
  end if;
  if exists (
    select 1 from pg_catalog.pg_db_role_setting rs
    join pg_catalog.pg_roles r on r.oid = rs.setrole
    cross join lateral pg_catalog.unnest(rs.setconfig) s
    where r.rolname = 'authenticator' and rs.setdatabase <> 0
      and s like 'pgrst.db_pre_request=%'
  ) then
    raise exception 'PHASE2 PREFLIGHT STOP — database-specific hook override cannot be disarmed by this role-wide drill';
  end if;
end;
$$;
create schema phase2_acceptance;
create table phase2_acceptance.run (id uuid primary key);
insert into phase2_acceptance.run values (pg_catalog.current_setting('phase2_acceptance.run_id')::uuid);

-- One row per assertion. `expected` and `observed` are both recorded as text so
-- the report prints the actual divergence rather than a bare boolean — a
-- harness that only says "FAIL" sends the operator back to the SQL.
create table phase2_acceptance.result (
  id bigint generated always as identity primary key,
  part text not null,
  name text not null,
  expected text not null,
  observed text,
  recorded_at timestamptz not null default clock_timestamp()
);

create or replace function phase2_acceptance.record(
  p_part text,
  p_name text,
  p_expected text,
  p_observed text
)
returns void
language sql
as $$
  insert into phase2_acceptance.result (part, name, expected, observed)
  values (p_part, p_name, p_expected, p_observed);
$$;

-- ── Fixture identities ───────────────────────────────────────────────────
--
-- Recognisable UUIDs are reserved, but creation ownership comes from the run ledger.
create or replace function phase2_acceptance.owner(p_slot integer)
returns uuid
language sql
immutable
as $$
  select ('aaaaaaaa-0000-4000-8000-00000000000' || p_slot::text)::uuid;
$$;

-- ── Fixture ownership ────────────────────────────────────────────────────
--
-- Fixed UUIDs alone are NOT sufficient, which was a real finding. "This id is
-- recognisable" is not the same claim as "this harness created this row", and
-- teardown acts on identities — so without a record of what it created, a
-- teardown would delete whatever happens to sit at those ids.
--
-- So two separate mechanisms:
--
--   read-only preflight — refuses reserved IDs, nonempty auth.users and an
--     existing acceptance schema before any mutation.
--
--   `fixture` — the record of what this run actually created. Teardown deletes
--     only identities listed here, so an id that existed beforehand could not
--     be removed even if the preflight were somehow bypassed.
create table phase2_acceptance.fixture (
  owner_user_id uuid primary key,
  slot integer not null,
  run_id uuid not null default pg_catalog.current_setting('phase2_acceptance.run_id')::uuid,
  user_created_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp()
);

create or replace function phase2_acceptance.token(p_slot integer)
returns text
language sql
immutable
as $$
  select case p_slot
    when 1 then 'DNTCXsTLxEdqmFCdbdAOfCMAlEr6qKoXYKnrYBOlGEY'
    when 2 then 'hTp_lukdjgEzlsmRVrpFcP4UR_ZB0vW1fm-5h_MH4xA'
    when 3 then '_eHD_5SbMObBZ9aBVusmp-NaXx2mrh7-qyc8taDpsaU'
    when 4 then 'X3BQeD5MKngtnxG79rvCeRmUwN5P-GWkg0TVWndEko4'
    when 5 then 'XL4pq9A15OY-leaaa9ML1c7sFdFEfPVVJNag61lmMeg'
    when 6 then 'rTJvpM-9eRdX4z05ANQJKY8N5X8ipqTLOhq2rOLZVJA'
    when 7 then '_GPrK19DwwxNvN-HwVYj-WbRaEgKlTAhGCPkwBN4F8k'
    when 8 then 'U2koLcvuWvfrCm8foscBmaFHS1U0DyBwrY2Hqk0P_B4'
  end;
$$;

-- The hash exactly as both guardian RPCs compute it: sha256 over the UTF-8
-- bytes of the 43-character STRING, not over 32 decoded bytes. Deriving it the
-- same way here rather than hard-coding digests is what makes these fixtures
-- evidence about the deployed contract instead of a restatement of it.
create or replace function phase2_acceptance.token_hash(p_slot integer)
returns bytea
language sql
immutable
as $$
  select sha256(convert_to(phase2_acceptance.token(p_slot), 'UTF8'));
$$;

-- ── Fixture construction ─────────────────────────────────────────────────
--
-- A minor/pending row must satisfy athlete_participation_minor_pending_shape
-- in full (20261008000001): guardian_email, token_hash, request_generation >=
-- 1, requested_at, expires_at, all three request-pinned version columns, and
-- NULL for every adult-bundle column. Writing it directly rather than through
-- an RPC is deliberate and is the only way available: no code path in the
-- product can create a minor row yet, which is precisely the Phase 1a boundary
-- Phase 2 was built against.
-- All synthetic auth identities, including uniqueness-only fixtures, go
-- through this creator. Successful creation and its ledger entry are atomic.
create or replace function phase2_acceptance.ensure_fixture_user(p_slot integer)
returns uuid
language plpgsql
as $$
declare
  v_owner uuid := phase2_acceptance.owner(p_slot);
begin
  -- `auth.users` is the FK target for both participation tables, and both
  -- guardian RPCs inner-join it, so a fixture without a user row would make
  -- every assertion pass for the wrong reason.
  -- Refresh only identities registered by THIS run. A plain INSERT fails on
  -- any collision; there is no adoption through ON CONFLICT DO NOTHING.
  if exists (
    select 1 from phase2_acceptance.fixture f join auth.users u on u.id = f.owner_user_id
    where f.owner_user_id = v_owner
      and f.run_id = pg_catalog.current_setting('phase2_acceptance.run_id')::uuid
      and u.created_at = f.user_created_at
  ) then
    null;
  else
    with inserted as (
      insert into auth.users (id, email, created_at)
      values (v_owner, 'phase2-acceptance-' || p_slot::text || '@example.invalid', pg_catalog.clock_timestamp())
      returning id, created_at
    )
    insert into phase2_acceptance.fixture (owner_user_id, slot, user_created_at)
    select id, p_slot, created_at from inserted;
  end if;

  return v_owner;
end;
$$;

create or replace function phase2_acceptance.make_pending_minor(
  p_slot integer,
  p_expires_in interval default interval '30 minutes'
)
returns uuid
language plpgsql
as $$
declare
  v_owner uuid := phase2_acceptance.owner(p_slot);
begin
  perform phase2_acceptance.ensure_fixture_user(p_slot);

  delete from public.participation_events where owner_user_id = v_owner;
  delete from public.athlete_participation where owner_user_id = v_owner;

  insert into public.athlete_participation (
    owner_user_id, bracket, status,
    guardian_email, token_hash, request_generation,
    requested_at, expires_at, decided_at,
    guardian_copy_version, request_terms_version, request_privacy_version
  ) values (
    v_owner, 'minor', 'pending',
    'guardian-' || p_slot::text || '@example.invalid',
    phase2_acceptance.token_hash(p_slot),
    1,
    clock_timestamp(), clock_timestamp() + p_expires_in, null,
    'acceptance-copy-v1', 'acceptance-terms-v1', 'acceptance-privacy-v1'
  );

  return v_owner;
end;
$$;

-- ── Cross-session coordination ───────────────────────────────────────────
--
-- The concurrency and lock-wait parts need one session to proceed only once
-- another is GENUINELY BLOCKED on a row lock. A fixed `pg_sleep` would be a
-- timing assumption that makes the test flaky in one direction and vacuous in
-- the other: too short and the second session has not reached the lock, in
-- which case the test proves nothing while still passing.
--
-- So the waiting session polls `pg_stat_activity` for the other session's
-- `application_name` sitting in `wait_event_type = 'Lock'`. That is a direct
-- observation of the state the test depends on. It returns false on timeout
-- rather than raising, so the caller records a FAIL with a readable name
-- instead of aborting the script mid-transaction.
-- ══════════════════════════════════════════════════════════════════════════
-- THE BLOCKED-BY DETECTOR
-- ══════════════════════════════════════════════════════════════════════════
--
-- The first version of this was wrong in three ways, each of which let a
-- concurrency test pass without the race having happened:
--
--   1. IT POLLED A STALE SNAPSHOT. `pg_stat_activity` is populated from a
--      per-transaction cache of the stats snapshot. Inside one long-running
--      transaction — which is exactly what session A is — every iteration of
--      the loop saw the SAME snapshot, so a session that became blocked after
--      A's transaction began was invisible forever and the detector simply
--      timed out. `pg_stat_clear_snapshot()` before each observation is what
--      makes the loop actually observe anything; without it this is a sleep
--      with extra steps.
--
--   2. IT ASKED THE WRONG QUESTION. `wait_event_type = 'Lock'` means "B is
--      waiting for SOME lock" — not "B is waiting for the lock A holds". B
--      could be blocked on something unrelated, and A would commit believing
--      it had won a race it was never in. `pg_blocking_pids()` answers the
--      real question: it returns the PIDs actually blocking that backend, so
--      requiring A's own PID in that list proves the blocking RELATIONSHIP.
--
--   3. IT DID NOT CHECK WHAT KIND OF LOCK. A row-lock test and an
--      advisory-lock test are different claims, and a test that accepts either
--      cannot tell you which mechanism it exercised. `p_locktype` pins it
--      against `pg_locks` for the waiting backend's ungranted lock.
--
-- Returns a DIAGNOSTIC STRING rather than a boolean, so the report says what
-- was actually observed — 'blocked' on success, or 'timeout:<what it saw>'
-- when it fails. "false" would leave an operator guessing.
create or replace function phase2_acceptance.wait_until_blocked_by(
  p_application_name text,
  p_locktype text,
  p_timeout interval default interval '30 seconds'
)
returns text
language plpgsql
as $$
declare
  v_deadline timestamptz := clock_timestamp() + p_timeout;
  v_me integer := pg_catalog.pg_backend_pid();
  v_pid integer;
  v_wait_event_type text;
  v_blockers integer[];
  v_locktype text;
  v_last text := 'no backend with that application_name';
begin
  loop
    -- Without this, every iteration re-reads the snapshot this transaction
    -- already cached. This single call is the difference between polling and
    -- pretending to poll.
    perform pg_catalog.pg_stat_clear_snapshot();

    select a.pid, a.wait_event_type
      into v_pid, v_wait_event_type
    from pg_catalog.pg_stat_activity a
    where a.application_name = p_application_name
      and a.pid <> v_me
    limit 1;

    if v_pid is not null then
      v_blockers := pg_catalog.pg_blocking_pids(v_pid);

      select l.locktype
        into v_locktype
      from pg_catalog.pg_locks l
      where l.pid = v_pid
        and not l.granted
      limit 1;

      if v_wait_event_type = 'Lock'
         and v_me = any(v_blockers)
         and v_locktype = p_locktype then
        return 'blocked';
      end if;

      v_last := 'wait_event_type=' || coalesce(v_wait_event_type, 'null')
             || ' locktype=' || coalesce(v_locktype, 'null')
             || ' blockers=' || coalesce(v_blockers::text, '{}')
             || ' expected_blocker=' || v_me::text
             || ' expected_locktype=' || p_locktype;
    end if;

    if clock_timestamp() > v_deadline then
      return 'timeout:' || v_last;
    end if;
    perform pg_catalog.pg_sleep(0.05);
  end loop;
end;
$$;

-- Committed signals, not advisory locks, for "session A has finished setting up
-- round N". An advisory gate would have to be CLOSED by A before B could reach
-- it, which makes the test depend on which session's first statement runs
-- first — and the runner launches both at once. A committed row is
-- order-independent: B waits until it exists, however long that takes, and the
-- outcome is the same whichever session starts first.
drop table if exists phase2_acceptance.signal;

create table phase2_acceptance.signal (
  name text primary key,
  at timestamptz not null default clock_timestamp()
);

create or replace function phase2_acceptance.signal_set(p_name text)
returns void
language sql
as $$
  insert into phase2_acceptance.signal (name) values (p_name) on conflict (name) do nothing;
$$;

-- Polls in READ COMMITTED, so each iteration sees anything the other session
-- has committed since the last one. Returns false on timeout instead of
-- raising, so a stall is recorded as a named FAIL rather than aborting a
-- script in the middle of an open transaction.
create or replace function phase2_acceptance.signal_wait(
  p_name text,
  p_timeout interval default interval '60 seconds'
)
returns boolean
language plpgsql
as $$
declare
  v_deadline timestamptz := clock_timestamp() + p_timeout;
begin
  loop
    if exists (select 1 from phase2_acceptance.signal s where s.name = p_name) then
      return true;
    end if;
    if clock_timestamp() > v_deadline then
      raise exception 'coordination signal timed out: %', p_name;
    end if;
    perform pg_catalog.pg_sleep(0.05);
  end loop;
end;
$$;

-- Waits until wall-clock time is past `p_until`. Used by the lock-wait test to
-- hold a row lock across an expiry boundary.
create or replace function phase2_acceptance.wait_until(p_until timestamptz)
returns void
language plpgsql
as $$
begin
  while clock_timestamp() <= p_until loop
    perform pg_catalog.pg_sleep(0.05);
  end loop;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- THE READINESS GATE — A HOLDS THE TARGET LOCK *BEFORE* PUBLISHING READY
-- ══════════════════════════════════════════════════════════════════════════
--
-- The committed-signal handshake alone had a real ordering bug: A signalled
-- "ready" as soon as the FIXTURE existed, which is before A had acquired the
-- row lock B is supposed to block on. B could therefore take the lock first,
-- making B the winner and A the loser — the opposite of what the assertions
-- claim — or the two could simply not overlap at all.
--
-- The fix needs a gate A can hold across the moment it opens a transaction and
-- acquires the lock, and release while that transaction is still open. A
-- committed row cannot do that (A's transaction has not committed), so the
-- gate is a SESSION-scoped advisory lock, which is not transactional: A can
-- release it from inside its open transaction and B sees that immediately.
--
-- The full order, which has no race left in it:
--
--   A1  pg_advisory_lock(GATE)                -- A's very first statement
--   A2  build the fixture; signal_set(round)  -- committed
--   B1  signal_wait(round)                    -- the fixture now exists
--   B2  pg_advisory_lock(GATE)                -- BLOCKS: A still holds it
--   A3  begin; <acquire the target lock>      -- A now holds what B will want
--   A4  pg_advisory_unlock(GATE)              -- only now is B released
--   B3  pg_advisory_unlock(GATE); begin; <same operation>  -- blocks on A
--   A5  wait_until_blocked_by('…-b', <locktype>)           -- proves the race
--   A6  commit
--
-- B cannot reach B2 before A1, because the signal B waits on at B1 is only
-- created at A2, which is after A1. So A always holds the gate first, and B
-- always attempts the conflicting operation strictly after A holds the target
-- lock. A then refuses to commit until it has observed B blocked ON ITSELF.
create or replace function phase2_acceptance.gate_hold(p_gate bigint)
returns void
language sql
as $$ select pg_catalog.pg_advisory_lock(p_gate); $$;

create or replace function phase2_acceptance.gate_release(p_gate bigint)
returns boolean
language sql
as $$ select pg_catalog.pg_advisory_unlock(p_gate); $$;

-- Blocks until the gate is free, then immediately releases it again, so the
-- gate is not left held by B.
create or replace function phase2_acceptance.gate_pass(p_gate bigint)
returns boolean
language sql
as $$
  select pg_catalog.pg_advisory_unlock(p_gate)
  from pg_catalog.pg_advisory_lock(p_gate) as g;
$$;

-- ── The registered-hook reader, used by part A and the rollback drill ────
create or replace function phase2_acceptance.hook_setting()
returns text
language sql
as $$
  select coalesce(
    (
      select s
      from pg_catalog.pg_db_role_setting rs
      join pg_catalog.pg_roles r on r.oid = rs.setrole
      cross join pg_catalog.unnest(rs.setconfig) s
      where r.rolname = 'authenticator'
        and rs.setdatabase = 0
        and s like 'pgrst.db_pre_request=%'
      limit 1
    ),
    '(unset)'
  );
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- TEST-ONLY PRIVILEGES FOR THE ROLE-IMPERSONATION PART
-- ══════════════════════════════════════════════════════════════════════════
--
-- Part G proves that `anon`, `authenticated` and `service_role` can each
-- execute the dispatcher, by actually becoming each role and calling it. For
-- that to test anything, the impersonated role has to reach
-- `public.data_api_pre_request()` — and the first version of part G could not:
-- the helper it calls lives in `phase2_acceptance`, which those roles had no
-- USAGE on, so every case failed with 42501 BEFORE the dispatcher was
-- involved. The test reported a failure that said nothing about the dispatcher
-- at all.
--
-- Fixed by granting the narrowest possible set, here, in the acceptance
-- fixture schema only:
--
--   * USAGE on `phase2_acceptance` — without it no helper is reachable;
--   * EXECUTE on `probe` and `client` — the two helpers part G calls while
--     impersonating.
--
-- Deliberately NOT granted, and asserted as such by part A:
--
--   * nothing on `result`, `signal`, `fixture` or `run`. The recorder
--     tables stay owner-only, which is why part G resets the role before
--     recording anything.
--   * nothing on the fixture builders (`make_pending_minor`, `token`,
--     `token_hash`, `owner`) — no impersonated role may manufacture a minor.
--   * nothing on `limiter_rows` or `hook_setting`, which read `private` and
--     the catalog.
--   * nothing whatsoever in `public`, `private`, `auth` or any product schema.
--     The dispatcher's own EXECUTE grant comes from the reviewed migration
--     (FOUNDER DECISION A1), not from here, which is exactly what part G is
--     testing.
--
-- `probe` must stay SECURITY INVOKER. If it were SECURITY DEFINER the
-- dispatcher's privilege check would be made against the OWNER rather than the
-- impersonated role, and part G would pass without proving anything about the
-- A1 grant.
-- USAGE on the schema is necessary but not sufficient on its own, and on its
-- own it would be WRONG: PostgreSQL grants EXECUTE to PUBLIC by default on
-- every newly created function, so schema USAGE alone would hand `anon` the
-- fixture builders — including `make_pending_minor`, which manufactures a
-- minor participation row. The revoke below closes that, and each file that
-- defines further helpers repeats it before granting what part G needs.
grant usage on schema phase2_acceptance to anon, authenticated, service_role;
revoke all on all functions in schema phase2_acceptance from public;

commit;
select 'setup complete' as status;
