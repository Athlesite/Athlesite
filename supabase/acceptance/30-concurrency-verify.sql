-- Phase 2 live acceptance — PART F: the state both racing sessions left behind.
--
-- Runs after 10/11 and 20/21 have both exited. The per-session files record
-- what each CALL returned; this file records what the DATABASE now holds,
-- which is the part that actually matters. A pair of sessions could in
-- principle each return a plausible value and still leave an incoherent row or
-- two decision events.

-- ── Exactly one terminal decision per raced request ─────────────────────
--
-- Rounds 1 and 3 raced an approve that won; round 2 raced a decline. In every
-- case the row must be terminal — a decided status, a cleared token, a set
-- decided_at — and must not have been touched twice.
do $$
declare
  v_slot integer;
  v_expected text[] := array['approved', 'declined', 'approved'];
begin
  for v_slot in 1..3 loop
    perform phase2_acceptance.record(
      'F1', 'round ' || v_slot || ': exactly one terminal decision, token cleared',
      v_expected[v_slot] || '/cleared/set',
      (
        select p.status || '/'
            || case when p.token_hash is null then 'cleared' else 'present' end || '/'
            || case when p.decided_at is null then 'null' else 'set' end
        from public.athlete_participation p
        where p.owner_user_id = phase2_acceptance.owner(v_slot)
      )
    );
  end loop;
end;
$$;

-- ── Exactly one decision event per raced request ────────────────────────
--
-- participation_events_decision_unique (20261008000002) independently forbids
-- a second guardian_approved/guardian_declined row for the same
-- (owner_user_id, request_generation), so this is belt-and-braces over a
-- constraint — but it is the single most important outcome in the whole suite.
-- Two decision events for one generation would mean the durable evidence of
-- what a guardian chose is ambiguous.
do $$
declare
  v_slot integer;
  v_expected text[] := array['guardian_approved', 'guardian_declined', 'guardian_approved'];
begin
  for v_slot in 1..3 loop
    perform phase2_acceptance.record(
      'F2', 'round ' || v_slot || ': exactly one decision event',
      '1/' || v_expected[v_slot],
      (
        select pg_catalog.count(*)::text || '/'
            || coalesce(pg_catalog.string_agg(distinct e.event_type, '+'), '(none)')
        from public.participation_events e
        where e.owner_user_id = phase2_acceptance.owner(v_slot)
          and e.event_type in ('guardian_approved', 'guardian_declined')
      )
    );
  end loop;
end;
$$;

-- Round 3 is the one that could have produced CONTRADICTORY evidence: the two
-- sessions asked for opposite outcomes. Asserted separately and explicitly,
-- because "one event" and "one event that agrees with the row" are different
-- statements.
select phase2_acceptance.record(
  'F2', 'round 3: the surviving event agrees with the surviving row status', 'approved/guardian_approved',
  (
    select p.status || '/' || coalesce(e.event_type, '(none)')
    from public.athlete_participation p
    left join public.participation_events e
      on e.owner_user_id = p.owner_user_id
     and e.event_type in ('guardian_approved', 'guardian_declined')
    where p.owner_user_id = phase2_acceptance.owner(3)
  )
);

-- ── The decision event is generation-bound and version-pinned ───────────
select phase2_acceptance.record(
  'F3', 'raced decisions are bound to the request generation and pinned wording', '1/1/1',
  (
    select pg_catalog.count(*) filter (where e.request_generation = 1)::text || '/'
        || pg_catalog.count(*) filter (where e.guardian_copy_version = 'acceptance-copy-v1')::text || '/'
        || pg_catalog.count(*) filter (
             where e.terms_version = 'acceptance-terms-v1'
               and e.privacy_version = 'acceptance-privacy-v1'
           )::text
    from public.participation_events e
    where e.owner_user_id = phase2_acceptance.owner(3)
      and e.event_type in ('guardian_approved', 'guardian_declined')
  )
);

-- ── Nothing outside the participation tables moved ──────────────────────
--
-- Neither guardian RPC may read or write athlete_profiles or storage.objects.
-- The fixtures never created a profile, so any row here would mean a guardian
-- decision created one — which is the Phase 1a boundary the whole design
-- rests on.
select phase2_acceptance.record(
  'F4', 'no profile row exists for any acceptance fixture owner', '0',
  (
    select pg_catalog.count(*)::text
    from public.athlete_profiles p
    where p.owner_user_id in (
      select phase2_acceptance.owner(s) from pg_catalog.generate_series(1, 8) s
    )
  )
);

select 'part F complete' as status;
