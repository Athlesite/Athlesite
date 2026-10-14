-- Phase 2 live acceptance — PART G: the hook under every Data API role, and
-- the read-only-transaction hazard the volatility migration removes.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHY ROLE IMPERSONATION IS THE RIGHT TEST HERE
-- ══════════════════════════════════════════════════════════════════════════
--
-- PostgREST calls `db_pre_request` AFTER switching into the request's effective
-- role (`set local role`), so the function executes as `anon`,
-- `authenticated`, or `service_role` — never as `authenticator`. Two things
-- follow, and both are asserted below rather than assumed:
--
--   1. each of those roles needs EXECUTE on the dispatcher. FOUNDER DECISION
--      A1 grants it to exactly those three and revokes PUBLIC, so a role
--      missing from that enumeration does not get a degraded request — it gets
--      an error on EVERY Data API call it makes. That is the failure mode A1
--      accepted in exchange for least privilege, and it is the one this file
--      exists to catch before a deployment does.
--
--   2. the dispatcher is SECURITY DEFINER, so once past the EXECUTE check it
--      runs as the owner and can reach `private`. These roles therefore need
--      EXECUTE on the dispatcher and NOTHING else — no schema USAGE, no table
--      grant. Part A asserts the absence; this part asserts the presence.
--
-- `set local role` reproduces exactly that: the privilege checks that follow
-- are made against the impersonated role, which is what makes this a real
-- test of the grant rather than a restatement of the catalog.
--
-- Everything is captured, the role is reset, and only then recorded —
-- `phase2_acceptance.result` is not writable by these roles, deliberately, so
-- recording while impersonating would fail for an uninteresting reason.

-- A probe that catches EVERYTHING, not just PGRST refusals. The read-only test
-- below needs to observe a raw PostgreSQL error (25006), and the role tests
-- need to observe a privilege error (42501) — neither of which
-- phase2_acceptance.simulate reports, because it only catches 'PGRST'.
create or replace function phase2_acceptance.probe(
  p_path text,
  p_method text,
  p_headers json default null
)
returns text
language plpgsql
as $$
declare
  v_detail text;
begin
  perform pg_catalog.set_config('request.path', p_path, true);
  perform pg_catalog.set_config('request.method', p_method, true);
  perform pg_catalog.set_config('request.headers', coalesce(p_headers::text, '{}'), true);
  perform public.data_api_pre_request();
  return 'allowed';
exception
  when sqlstate 'PGRST' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return 'refused:' || coalesce(v_detail::json ->> 'status', '?');
  when others then
    return 'raised:' || sqlstate;
end;
$$;

-- SECURITY INVOKER, which is the default and must stay that way: if this were
-- SECURITY DEFINER, the dispatcher's EXECUTE check would be made against the
-- OWNER instead of the impersonated role, and G1/G2 would pass without proving
-- anything about the FOUNDER DECISION A1 grant.
revoke all on all functions in schema phase2_acceptance from public;
grant execute on function phase2_acceptance.probe(text, text, json) to anon, authenticated, service_role;
grant execute on function phase2_acceptance.client(text) to anon, authenticated, service_role;

select phase2_acceptance.record(
  'G0', 'the probe helper is SECURITY INVOKER (or impersonation proves nothing)', 'false',
  (
    select p.prosecdef::text
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'phase2_acceptance' and p.proname = 'probe'
  )
);

-- The impersonation helpers are reachable; the recorder tables are not. Both
-- halves matter: without the first, part G fails at 42501 before reaching the
-- dispatcher; without the second, the acceptance schema would be a way for a
-- request role to write to tables it has no business touching.
select phase2_acceptance.record(
  'G0', 'each Data API role can execute the probe helper', 'true,true,true',
  (
    select pg_catalog.string_agg(
             pg_catalog.has_function_privilege(
               r.role, 'phase2_acceptance.probe(text, text, json)', 'EXECUTE'
             )::text, ',' order by r.ord)
    from (values ('anon', 1), ('authenticated', 2), ('service_role', 3)) as r(role, ord)
  )
);

select phase2_acceptance.record(
  'G0', 'no Data API role holds any privilege on the recorder/fixture tables', '0',
  (
    select pg_catalog.count(*)::text
    from (values ('anon'), ('authenticated'), ('service_role')) as r(role)
    cross join (values
      ('phase2_acceptance.result'), ('phase2_acceptance.signal'),
      ('phase2_acceptance.fixture'), ('phase2_acceptance.run')
    ) as t(name)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(privilege)
    where pg_catalog.has_table_privilege(r.role, t.name, p.privilege)
  )
);

-- No impersonated role may manufacture a minor participation row. The fixture
-- builders stay owner-only.
select phase2_acceptance.record(
  'G0', 'no Data API role can execute the fixture builders', '0',
  (
    select pg_catalog.count(*)::text
    from (values ('anon'), ('authenticated'), ('service_role')) as r(role)
    cross join (values
      ('phase2_acceptance.make_pending_minor(integer, interval)'),
      ('phase2_acceptance.token(integer)'),
      ('phase2_acceptance.token_hash(integer)'),
      ('phase2_acceptance.limiter_rows()')
    ) as f(signature)
    where pg_catalog.has_function_privilege(r.role, f.signature, 'EXECUTE')
  )
);

-- ══════════════════════════════════════════════════════════════════════════
-- G1. EVERY DATA API ROLE CAN RUN THE HOOK ON ORDINARY TRAFFIC
-- ══════════════════════════════════════════════════════════════════════════
--
-- Nine combinations: three roles against three representative non-guardian
-- requests. Any 42501 here means that role has lost its entire Data API.
do $$
declare
  v_roles text[] := array['anon', 'authenticated', 'service_role'];
  v_paths text[] := array['/athlete_profiles', '/rpc/get_published_profile_by_slug', '/'];
  v_role text;
  v_path text;
  v_outcome text;
  v_failures text := '';
begin
  delete from private.guardian_rate_limits;

  foreach v_role in array v_roles loop
    foreach v_path in array v_paths loop
      begin
        execute 'set local role ' || pg_catalog.quote_ident(v_role);
        v_outcome := phase2_acceptance.probe(v_path, 'GET');
      exception
        when others then
          v_outcome := 'setup-raised:' || sqlstate;
      end;
      execute 'reset role';
      if v_outcome <> 'allowed' then
        v_failures := v_failures || ' ' || v_role || v_path || '=' || v_outcome;
      end if;
    end loop;
  end loop;

  perform phase2_acceptance.record(
    'G1', 'anon/authenticated/service_role: the hook is a no-op on non-guardian requests',
    '(none)', coalesce(nullif(v_failures, ''), '(none)')
  );
  perform phase2_acceptance.record(
    'G1', 'no limiter row from any non-guardian request under any role', '0',
    phase2_acceptance.limiter_rows()::text
  );
  -- Named separately because this is the failure mode that made the first
  -- version of part G worthless: a 42501 means the call never reached
  -- `public.data_api_pre_request()` at all, so a FAIL here says nothing about
  -- the dispatcher and everything about the harness's own grants.
  perform phase2_acceptance.record(
    'G1', 'no case failed with insufficient_privilege (42501) before reaching the dispatcher',
    'false', (pg_catalog.strpos(v_failures, '42501') > 0)::text
  );
end;
$$;

-- Positive proof that the impersonation happened and that the privilege under
-- test is the real one. For each role, WHILE IMPERSONATING: who am I, and can
-- I execute the dispatcher? If `current_user` came back as the superuser, the
-- `set local role` silently did nothing and every other G assertion would be
-- meaningless.
do $$
declare
  v_roles text[] := array['anon', 'authenticated', 'service_role'];
  v_role text;
  v_observed text;
  v_rows text := '';
begin
  foreach v_role in array v_roles loop
    begin
      execute 'set local role ' || pg_catalog.quote_ident(v_role);
      -- `current_user` is an SQL keyword, not a schema-qualifiable function.
      -- The two-argument has_function_privilege implicitly asks about
      -- current_user, which is the impersonated role here.
      select current_user::text || '/'
          || pg_catalog.has_function_privilege('public.data_api_pre_request()', 'EXECUTE')::text
        into v_observed;
    exception
      when others then
        v_observed := 'raised:' || sqlstate;
    end;
    execute 'reset role';
    v_rows := v_rows || case when v_rows = '' then '' else ',' end || v_observed;
  end loop;

  perform phase2_acceptance.record(
    'G0', 'impersonation is real, and each role itself holds dispatcher EXECUTE',
    'anon/true,authenticated/true,service_role/true', v_rows
  );
end;
$$;

-- Ordinary non-guardian API behaviour itself, not merely the hook: as `anon`,
-- the real published-profile RPC must still answer. This is the end-to-end
-- version of "arming did not break the product".
do $$
declare
  v_outcome text;
begin
  begin
    execute 'set local role anon';
    perform pg_catalog.set_config('request.path', '/rpc/get_published_profile_by_slug', true);
    perform pg_catalog.set_config('request.method', 'POST', true);
    perform public.data_api_pre_request();
    perform pg_catalog.count(*)
    from public.get_published_profile_by_slug('phase2-acceptance-no-such-slug');
    v_outcome := 'ok';
  exception
    when others then
      v_outcome := 'raised:' || sqlstate;
  end;
  execute 'reset role';

  perform phase2_acceptance.record(
    'G1', 'anon can still call the published-profile RPC through the hook', 'ok', v_outcome
  );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- G2. EVERY DATA API ROLE REACHES THE LIMITER ON A GUARDIAN POST
-- ══════════════════════════════════════════════════════════════════════════
--
-- The SECURITY DEFINER half: once past the EXECUTE check, the dispatcher runs
-- as the owner, so a role with no `private` access at all still records a
-- counter. Six combinations — three roles x both guardian RPCs — and six rows.
--
-- In practice only `anon` ever calls these RPCs (20261013000001 grants EXECUTE
-- on them to `anon` alone). This asserts the LIMITER is reachable under each
-- role anyway, because the hook runs before PostgREST's own privilege check on
-- the target function, so all three roles do reach it.
do $$
declare
  v_roles text[] := array['anon', 'authenticated', 'service_role'];
  v_endpoints text[] := array['/rpc/peek_guardian_request', '/rpc/redeem_guardian_request'];
  v_role text;
  v_path text;
  v_outcome text;
  v_failures text := '';
begin
  delete from private.guardian_rate_limits;

  foreach v_role in array v_roles loop
    foreach v_path in array v_endpoints loop
      begin
        execute 'set local role ' || pg_catalog.quote_ident(v_role);
        v_outcome := phase2_acceptance.probe(
          v_path, 'POST', pg_catalog.json_build_object('cf-connecting-ip', '198.51.100.' || (10 + pg_catalog.length(v_role)))
        );
      exception
        when others then
          v_outcome := 'setup-raised:' || sqlstate;
      end;
      execute 'reset role';
      if v_outcome <> 'allowed' then
        v_failures := v_failures || ' ' || v_role || v_path || '=' || v_outcome;
      end if;
    end loop;
  end loop;

  perform phase2_acceptance.record(
    'G2', 'POST peek and POST redeem are allowed and counted under every Data API role',
    '(none)', coalesce(nullif(v_failures, ''), '(none)')
  );
  perform phase2_acceptance.record(
    'G2', 'six guardian POSTs recorded six limiter rows', '6',
    phase2_acceptance.limiter_rows()::text
  );
  perform phase2_acceptance.record(
    'G2', 'recorded endpoint classes', 'peek:3,redeem:3',
    (
      select 'peek:' || pg_catalog.count(*) filter (where endpoint = 'peek')
           || ',redeem:' || pg_catalog.count(*) filter (where endpoint = 'redeem')
      from private.guardian_rate_limits
    )
  );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- G3. THE METHOD GATE, NAMED EXPLICITLY (required even with VOLATILE)
-- ══════════════════════════════════════════════════════════════════════════
--
-- GET/HEAD remain read-only for all volatility classes. Logically read-only
-- peek can succeed before arming, so VOLATILE does not close that route.
-- The dispatcher must refuse these calls once armed, because a read-only
-- transaction cannot record a limiter write. These SQL probes call the gate
-- directly in both phases; hosted 405 is an armed-hook expectation.
do $$
declare
  v_cases text[][] := array[
    array['/rpc/peek_guardian_request', 'GET'],
    array['/rpc/peek_guardian_request', 'HEAD'],
    array['/rpc/redeem_guardian_request', 'GET'],
    array['/rpc/redeem_guardian_request', 'HEAD']
  ];
  v_i integer;
  v_outcome text;
  v_failures text := '';
begin
  delete from private.guardian_rate_limits;

  for v_i in 1..pg_catalog.array_length(v_cases, 1) loop
    v_outcome := phase2_acceptance.probe(
      v_cases[v_i][1], v_cases[v_i][2], phase2_acceptance.client('198.51.100.33')
    );
    if v_outcome <> 'refused:405' then
      v_failures := v_failures || ' ' || v_cases[v_i][2] || v_cases[v_i][1] || '=' || v_outcome;
    end if;
  end loop;

  perform phase2_acceptance.record(
    'G3', 'GET and HEAD on both guardian RPCs are refused 405 by the gate', '(none)',
    coalesce(nullif(v_failures, ''), '(none)')
  );
  perform phase2_acceptance.record(
    'G3', 'no refused method records a limiter row (no unlimited path)', '0',
    phase2_acceptance.limiter_rows()::text
  );

  -- POST is the one method that proceeds. Stated as its own assertion so the
  -- gate cannot pass by refusing everything.
  perform phase2_acceptance.record(
    'G3', 'POST peek proceeds to limiter enforcement', 'allowed',
    phase2_acceptance.probe('/rpc/peek_guardian_request', 'POST', phase2_acceptance.client('198.51.100.34'))
  );
  perform phase2_acceptance.record(
    'G3', 'POST redeem proceeds to limiter enforcement', 'allowed',
    phase2_acceptance.probe('/rpc/redeem_guardian_request', 'POST', phase2_acceptance.client('198.51.100.34'))
  );
  perform phase2_acceptance.record(
    'G3', 'both POSTs were recorded', '2', phase2_acceptance.limiter_rows()::text
  );
end;
$$;

-- Unrelated GET and POST Data API traffic still returns before any limiter
-- I/O. Part B1 covers this broadly; repeated here as a named assertion
-- alongside the method gate, since the two are easy to conflate.
do $$
declare
  v_outcome text;
  v_failures text := '';
  v_pairs text[][] := array[
    array['/athlete_profiles', 'GET'],
    array['/athlete_profiles', 'POST'],
    array['/rpc/get_published_profile_by_slug', 'GET'],
    array['/rpc/get_published_profile_by_slug', 'POST'],
    array['/rpc/participation_status', 'POST'],
    array['/rpc/unpublish_own_profile', 'POST']
  ];
  v_i integer;
begin
  delete from private.guardian_rate_limits;

  for v_i in 1..pg_catalog.array_length(v_pairs, 1) loop
    v_outcome := phase2_acceptance.probe(v_pairs[v_i][1], v_pairs[v_i][2]);
    if v_outcome <> 'allowed' then
      v_failures := v_failures || ' ' || v_pairs[v_i][2] || v_pairs[v_i][1] || '=' || v_outcome;
    end if;
  end loop;

  perform phase2_acceptance.record(
    'G3', 'unrelated GET/POST Data API routes are untouched', '(none)',
    coalesce(nullif(v_failures, ''), '(none)')
  );
  perform phase2_acceptance.record(
    'G3', 'unrelated GET/POST routes perform no limiter I/O', '0',
    phase2_acceptance.limiter_rows()::text
  );
end;
$$;

delete from private.guardian_rate_limits;

select 'part G complete' as status;
