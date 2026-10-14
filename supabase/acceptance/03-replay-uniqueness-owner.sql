-- Phase 2 live acceptance — PART C: replay, token uniqueness, deleted owner.
--
-- Everything here is single-session and sequential. The genuinely concurrent
-- properties — two decisions racing, and a redeem waiting out an expiry behind
-- a lock — need two sessions and live in 10-/11- and 20-/21-.

-- ══════════════════════════════════════════════════════════════════════════
-- C1. REPLAY — the first valid decision wins and the token dies with it
-- ══════════════════════════════════════════════════════════════════════════
--
-- `redeem_guardian_request` sets `token_hash = null` as part of the same
-- UPDATE that sets the status, so after one decision the identical token can
-- never match any row again. That is what makes decline terminal as well as
-- approve, and it is why a replay cannot be distinguished from a token that
-- never existed.
do $$
declare
  v_owner uuid;
  v_token text := phase2_acceptance.token(1);
begin
  v_owner := phase2_acceptance.make_pending_minor(1);

  -- Peek first: read-only, and it must consume nothing.
  perform phase2_acceptance.record(
    'C1', 'peek returns exactly one row for a valid pending request', '1',
    (select pg_catalog.count(*)::text from public.peek_guardian_request(v_token))
  );
  perform phase2_acceptance.record(
    'C1', 'peek does not consume the token', 'true',
    (
      select (token_hash is not null and status = 'pending')::text
      from public.athlete_participation where owner_user_id = v_owner
    )
  );
  perform phase2_acceptance.record(
    'C1', 'peek writes no event', '0',
    (select pg_catalog.count(*)::text from public.participation_events where owner_user_id = v_owner)
  );
  -- The projection is minimal by founder decision: no owner_user_id, no
  -- token_hash, no request_generation, no guardian_email, no delivery metadata.
  perform phase2_acceptance.record(
    'C1', 'peek projection columns', 'requested_at,expires_at,guardian_copy_version,request_terms_version,request_privacy_version',
    (
      -- A `returns table (...)` function records its output columns as TABLE-mode
      -- arguments ('t'), not as a composite type, so the column list comes from
      -- proargnames/proargmodes rather than from pg_attribute. Those two arrays
      -- have to be zipped positionally.
      --
      -- `ROWS FROM (f(a), f(b))` is how to zip them. `pg_catalog.unnest(a, b)`
      -- is NOT valid: multi-argument unnest is special grammar that exists only
      -- as a bare `UNNEST(a, b)` in a FROM clause and cannot be
      -- schema-qualified, so the qualified two-argument form does not resolve
      -- to any function. ROWS FROM takes ordinary single-argument calls, which
      -- can be qualified, and `WITH ORDINALITY` applies to the whole construct.
      select pg_catalog.string_agg(a.name, ',' order by a.ord)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      cross join lateral rows from (
        pg_catalog.unnest(p.proargnames),
        pg_catalog.unnest(p.proargmodes)
      ) with ordinality as a(name, mode, ord)
      where n.nspname = 'public' and p.proname = 'peek_guardian_request' and a.mode = 't'
    )
  );

  perform phase2_acceptance.record(
    'C1', 'first approve succeeds', 'approved',
    public.redeem_guardian_request(v_token, 'approve')
  );
  perform phase2_acceptance.record(
    'C1', 'a second redeem with the same token is unavailable', 'unavailable',
    public.redeem_guardian_request(v_token, 'approve')
  );
  perform phase2_acceptance.record(
    'C1', 'declining an already-approved token is unavailable', 'unavailable',
    public.redeem_guardian_request(v_token, 'decline')
  );
  perform phase2_acceptance.record(
    'C1', 'peek after redemption returns zero rows', '0',
    (select pg_catalog.count(*)::text from public.peek_guardian_request(v_token))
  );

  perform phase2_acceptance.record(
    'C1', 'exactly one decision event, bound to generation 1', 'guardian_approved/1',
    (
      select coalesce(pg_catalog.string_agg(e.event_type || '/' || e.request_generation, ',' order by e.id), '(none)')
      from public.participation_events e
      where e.owner_user_id = v_owner
    )
  );

  -- The evidence must carry the versions the request PINNED, never whatever is
  -- current now. This is the only durable record of the exact wording the
  -- guardian actually saw, and copying the adult-bundle columns instead (which
  -- are NULL for every minor row) was a real finding on the Phase 2 review.
  perform phase2_acceptance.record(
    'C1', 'decision evidence copies the request-pinned versions',
    'acceptance-copy-v1/acceptance-terms-v1/acceptance-privacy-v1/',
    (
      select coalesce(e.guardian_copy_version, '(null)') || '/'
          || coalesce(e.terms_version, '(null)') || '/'
          || coalesce(e.privacy_version, '(null)') || '/'
          || coalesce(e.attestation_version, '')
      from public.participation_events e
      where e.owner_user_id = v_owner
      limit 1
    )
  );

  perform phase2_acceptance.record(
    'C1', 'the row is terminal: approved, token cleared, decided_at set', 'approved/cleared/set',
    (
      select status || '/'
          || case when token_hash is null then 'cleared' else 'present' end || '/'
          || case when decided_at is null then 'null' else 'set' end
      from public.athlete_participation where owner_user_id = v_owner
    )
  );
end;
$$;

-- Decline is terminal in exactly the same way. Running it as its own fixture
-- rather than inferring it from the approve case, because "decline also clears
-- the token" is a separate statement about the SQL.
do $$
declare
  v_owner uuid;
  v_token text := phase2_acceptance.token(2);
begin
  v_owner := phase2_acceptance.make_pending_minor(2);

  perform phase2_acceptance.record(
    'C1', 'first decline succeeds', 'declined',
    public.redeem_guardian_request(v_token, 'decline')
  );
  perform phase2_acceptance.record(
    'C1', 'approving an already-declined token is unavailable', 'unavailable',
    public.redeem_guardian_request(v_token, 'approve')
  );
  perform phase2_acceptance.record(
    'C1', 'exactly one decline event', 'guardian_declined/1',
    (
      select coalesce(pg_catalog.string_agg(e.event_type || '/' || e.request_generation, ','), '(none)')
      from public.participation_events e where e.owner_user_id = v_owner
    )
  );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- C2. INPUT REFUSALS ARE INDISTINGUISHABLE FROM "WRONG TOKEN"
-- ══════════════════════════════════════════════════════════════════════════
--
-- An unauthenticated surface must not let a caller tell "malformed" from "well
-- formed but unknown" from "already decided". Every case below is the same
-- generic outcome, through the same code path.
do $$
declare
  v_cases text[] := array[
    '',
    'short',
    pg_catalog.repeat('A', 42),
    pg_catalog.repeat('A', 44),
    -- 43 characters, but the 43rd is outside the 16-symbol subset a canonical
    -- encoder can produce for 32 bytes. Shape-matching alone would accept it.
    pg_catalog.repeat('A', 42) || 'B',
    -- 43 characters with a character outside the base64url alphabet.
    pg_catalog.repeat('A', 42) || '+',
    pg_catalog.repeat('A', 42) || '=',
    -- Well-formed and canonical, but no row has this hash.
    phase2_acceptance.token(8)
  ];
  v_token text;
  v_divergent text := '';
begin
  foreach v_token in array v_cases loop
    if public.redeem_guardian_request(v_token, 'approve') <> 'unavailable' then
      v_divergent := v_divergent || ' [' || pg_catalog.left(v_token, 12) || ']';
    end if;
    if (select pg_catalog.count(*) from public.peek_guardian_request(v_token)) <> 0 then
      v_divergent := v_divergent || ' peek[' || pg_catalog.left(v_token, 12) || ']';
    end if;
  end loop;

  perform phase2_acceptance.record(
    'C2', 'every malformed, non-canonical or unknown token is generically unavailable', '(none)',
    coalesce(nullif(v_divergent, ''), '(none)')
  );

  perform phase2_acceptance.record(
    'C2', 'a null token is unavailable', 'unavailable',
    coalesce(public.redeem_guardian_request(null::text, 'approve'), '(null returned)')
  );
end;
$$;

-- The decision allowlist, tested against a request that is otherwise VALID.
-- Reusing an already-consumed token here would be a vacuous pass: it would
-- return 'unavailable' because the token was dead, not because the decision
-- value was refused. The fixture is asserted still pending afterwards, which
-- is the part that actually distinguishes the two.
do $$
declare
  v_owner uuid;
  v_token text := phase2_acceptance.token(4);
  v_divergent text := '';
  v_decision text;
  v_decisions text[] := array['APPROVE', 'Approve', 'approved', 'accept', 'revoke', '', 'approve '];
begin
  v_owner := phase2_acceptance.make_pending_minor(4);

  foreach v_decision in array v_decisions loop
    if public.redeem_guardian_request(v_token, v_decision) <> 'unavailable' then
      v_divergent := v_divergent || ' [' || v_decision || ']';
    end if;
  end loop;

  if coalesce(public.redeem_guardian_request(v_token, null::text), '(null returned)') <> 'unavailable' then
    v_divergent := v_divergent || ' [null]';
  end if;

  perform phase2_acceptance.record(
    'C2', 'every decision value outside {approve,decline} is refused', '(none)',
    coalesce(nullif(v_divergent, ''), '(none)')
  );
  perform phase2_acceptance.record(
    'C2', 'a refused decision value mutates nothing', 'pending/present/0',
    (
      select p.status || '/'
          || case when p.token_hash is null then 'cleared' else 'present' end || '/'
          || (select pg_catalog.count(*) from public.participation_events e where e.owner_user_id = v_owner)
      from public.athlete_participation p where p.owner_user_id = v_owner
    )
  );
  perform phase2_acceptance.record(
    'C2', 'the fixture is still redeemable with a valid decision', 'approved',
    public.redeem_guardian_request(v_token, 'approve')
  );
end;
$$;

-- An expired-but-pending request is refused with the same generic outcome, and
-- nothing is mutated.
do $$
declare
  v_owner uuid;
  v_token text := phase2_acceptance.token(3);
begin
  v_owner := phase2_acceptance.make_pending_minor(3, interval '-1 minute');

  perform phase2_acceptance.record(
    'C2', 'an expired request peeks as zero rows', '0',
    (select pg_catalog.count(*)::text from public.peek_guardian_request(v_token))
  );
  perform phase2_acceptance.record(
    'C2', 'an expired request cannot be redeemed', 'unavailable',
    public.redeem_guardian_request(v_token, 'approve')
  );
  perform phase2_acceptance.record(
    'C2', 'an expired request is left untouched', 'pending/present/0',
    (
      select p.status || '/'
          || case when p.token_hash is null then 'cleared' else 'present' end || '/'
          || (select pg_catalog.count(*) from public.participation_events e where e.owner_user_id = v_owner)
      from public.athlete_participation p where p.owner_user_id = v_owner
    )
  );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- C3. TOKEN UNIQUENESS — the partial index, both halves
-- ══════════════════════════════════════════════════════════════════════════
--
-- The index makes "at most one current request per token" a database fact
-- rather than a property a future issuer could accidentally violate. Being
-- PARTIAL (`where token_hash is not null`) is equally load-bearing: adult rows
-- and decided minor rows all carry a NULL token_hash, and a non-partial unique
-- index would collapse every one of them into a single allowed row.
do $$
declare
  v_state text := '(no error)';
begin
  perform phase2_acceptance.make_pending_minor(4);

  -- A second live row sharing the same token_hash must be rejected.
  perform phase2_acceptance.ensure_fixture_user(5);

  begin
    insert into public.athlete_participation (
      owner_user_id, bracket, status, guardian_email, token_hash, request_generation,
      requested_at, expires_at, guardian_copy_version, request_terms_version, request_privacy_version
    ) values (
      phase2_acceptance.owner(5), 'minor', 'pending',
      'guardian-5@example.invalid',
      phase2_acceptance.token_hash(4),
      1, clock_timestamp(), clock_timestamp() + interval '30 minutes',
      'acceptance-copy-v1', 'acceptance-terms-v1', 'acceptance-privacy-v1'
    );
  exception
    when unique_violation then
      v_state := 'unique_violation';
    when others then
      v_state := 'other:' || sqlstate;
  end;

  perform phase2_acceptance.record(
    'C3', 'a duplicate live token_hash is rejected', 'unique_violation', v_state
  );
end;
$$;

-- Several decided rows with a NULL token_hash must coexist. If this fails, the
-- index is not partial and the whole table is limited to one decided minor.
do $$
declare
  v_state text := 'ok';
  v_slot integer;
begin
  for v_slot in 6..7 loop
    perform phase2_acceptance.ensure_fixture_user(v_slot);

    delete from public.participation_events where owner_user_id = phase2_acceptance.owner(v_slot);
    delete from public.athlete_participation where owner_user_id = phase2_acceptance.owner(v_slot);
  end loop;

  begin
    for v_slot in 6..7 loop
      insert into public.athlete_participation (
        owner_user_id, bracket, status, guardian_email, token_hash, request_generation,
        requested_at, expires_at, decided_at,
        guardian_copy_version, request_terms_version, request_privacy_version
      ) values (
        phase2_acceptance.owner(v_slot), 'minor', 'declined',
        'guardian-' || v_slot || '@example.invalid',
        null,
        1, clock_timestamp(), clock_timestamp() + interval '30 minutes', clock_timestamp(),
        'acceptance-copy-v1', 'acceptance-terms-v1', 'acceptance-privacy-v1'
      );
    end loop;
  exception
    when others then
      v_state := 'rejected:' || sqlstate;
  end;

  perform phase2_acceptance.record(
    'C3', 'multiple decided rows with NULL token_hash coexist (index is partial)', 'ok', v_state
  );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- C4. DELETED OWNER — no decision, and no orphan evidence
-- ══════════════════════════════════════════════════════════════════════════
--
-- Both RPCs inner-join `auth.users`, and both participation tables cascade on
-- user delete. So a deleted owner has no row to find at all, which is the
-- safest possible answer: the generic unavailable, and nothing left behind.
--
-- The CONCURRENT variant of this — a delete committing while a redeem waits on
-- the row lock — is in 20-/21-, because it needs a second session.
do $$
declare
  v_owner uuid;
  v_token text := phase2_acceptance.token(8);
begin
  v_owner := phase2_acceptance.make_pending_minor(8);

  -- Prove the fixture was redeemable BEFORE the delete, so a pass here cannot
  -- come from the fixture never having been valid.
  perform phase2_acceptance.record(
    'C4', 'precondition: the request is peekable before the owner is deleted', '1',
    (select pg_catalog.count(*)::text from public.peek_guardian_request(v_token))
  );

  delete from auth.users where id = v_owner;

  perform phase2_acceptance.record(
    'C4', 'the participation row cascaded away with the owner', '0',
    (select pg_catalog.count(*)::text from public.athlete_participation where owner_user_id = v_owner)
  );
  perform phase2_acceptance.record(
    'C4', 'peek on a deleted owner returns zero rows', '0',
    (select pg_catalog.count(*)::text from public.peek_guardian_request(v_token))
  );
  perform phase2_acceptance.record(
    'C4', 'redeem on a deleted owner is unavailable', 'unavailable',
    public.redeem_guardian_request(v_token, 'approve')
  );
  perform phase2_acceptance.record(
    'C4', 'no orphan approval evidence remains', '0',
    (select pg_catalog.count(*)::text from public.participation_events where owner_user_id = v_owner)
  );
end;
$$;

select 'part C complete' as status;
