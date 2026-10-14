-- Phase 2 live acceptance — PART B: the pre-request limiter's behaviour.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHY THIS CAN BE TESTED WITHOUT POSTGREST
-- ══════════════════════════════════════════════════════════════════════════
--
-- `public.data_api_pre_request()` takes no argument. Every input it reads is a
-- transaction-scoped GUC that PostgREST sets — `request.path`,
-- `request.method`, `request.headers` — and `set_config(..., is_local => true)`
-- sets exactly those GUCs for exactly one transaction. So the function's whole
-- decision surface is reproducible in a plain psql session, which makes the
-- scoping, the method gate, the thresholds, and the privacy properties
-- testable here rather than only against a live gateway.
--
-- WHAT THIS CANNOT PROVE, and must not be read as proving:
--
--   * the literal value PostgREST puts in `request.path` on a deployed
--     Supabase project (RUNBOOK § A3). This file tests every plausible prefix
--     shape, which is the right hedge, but the observed value still has to be
--     captured once against the real gateway.
--   * which forwarding headers actually arrive, or whether a client can set
--     them (RUNBOOK § A4). Here the headers are whatever this file passes.
--   * that PostgREST invokes the hook at all, or invokes it for OPTIONS.
--
-- Those three are the live-only items. Everything else below is settled here.

-- ── Simulation helper ────────────────────────────────────────────────────
--
-- Returns 'allowed', or 'refused:<status>' read out of the PGRST exception's
-- own DETAIL payload — which is the same JSON PostgREST would turn into the
-- HTTP response, so a refusal's STATUS is asserted rather than just its
-- existence. A 405 and a 429 are different outcomes and the tests below
-- depend on telling them apart.
create or replace function phase2_acceptance.simulate(
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
end;
$$;

create or replace function phase2_acceptance.limiter_rows()
returns bigint
language sql
as $$ select pg_catalog.count(*) from private.guardian_rate_limits; $$;

-- A stable fake client, so a test's own repeated calls land in one bucket.
create or replace function phase2_acceptance.client(p_ip text)
returns json
language sql
immutable
as $$ select pg_catalog.json_build_object('cf-connecting-ip', p_ip); $$;

-- Revoke PostgreSQL's default PUBLIC grant on everything defined so far, then
-- grant back only what part G calls while impersonating a Data API role. See
-- the test-only-privileges note in 00-setup.sql. `limiter_rows` and `simulate`
-- are deliberately NOT granted — they read `private` and must stay owner-only.
revoke all on all functions in schema phase2_acceptance from public;
grant execute on function phase2_acceptance.client(text) to anon, authenticated, service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- B1. UNRELATED DATA API TRAFFIC IS UNCHANGED AND COSTS NOTHING
-- ══════════════════════════════════════════════════════════════════════════
--
-- This is the assertion that matters most, because arming the hook changes the
-- behaviour of EVERY Data API request in the project. A limiter that protected
-- the guardian RPCs but slowed, broke, or recorded anything about a profile
-- read would be a worse outcome than no limiter.
do $$
declare
  v_paths text[] := array[
    '/athlete_profiles',
    '/athlete_participation',
    '/participation_events',
    '/rpc/get_published_profile_by_slug',
    '/rpc/initialize_adult_participation',
    '/rpc/participation_status',
    '/rpc/unpublish_own_profile',
    '/rpc/data_api_pre_request',
    '/'
  ];
  v_methods text[] := array['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'];
  v_path text;
  v_method text;
  v_outcome text;
  v_refusals integer := 0;
begin
  delete from private.guardian_rate_limits;

  foreach v_path in array v_paths loop
    foreach v_method in array v_methods loop
      v_outcome := phase2_acceptance.simulate(v_path, v_method, phase2_acceptance.client('203.0.113.9'));
      if v_outcome <> 'allowed' then
        v_refusals := v_refusals + 1;
      end if;
    end loop;
  end loop;

  perform phase2_acceptance.record(
    'B1', 'no unrelated Data API request is ever refused (9 paths x 7 methods)', '0', v_refusals::text
  );
  perform phase2_acceptance.record(
    'B1', 'no unrelated Data API request records a limiter row', '0',
    phase2_acceptance.limiter_rows()::text
  );
end;
$$;

-- Calling the dispatcher with NO request metadata at all — which is what
-- happens if it is ever invoked outside PostgREST — must be a no-op, not an
-- error and not a recorded request. GUCs are unset in a fresh transaction, so
-- this block deliberately sets nothing.
do $$
begin
  delete from private.guardian_rate_limits;
  perform public.data_api_pre_request();
  perform phase2_acceptance.record('B1', 'unset request metadata is a silent no-op', 'allowed', 'allowed');
  perform phase2_acceptance.record(
    'B1', 'unset request metadata records nothing', '0', phase2_acceptance.limiter_rows()::text
  );
exception
  when others then
    perform phase2_acceptance.record(
      'B1', 'unset request metadata is a silent no-op', 'allowed', 'raised ' || sqlstate
    );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- B2. MALFORMED AND NEAR-MISS PATHS CANNOT TRIGGER BROAD BLOCKING
-- ══════════════════════════════════════════════════════════════════════════
--
-- Two distinct risks, both covered here. A malformed path must not become a
-- blanket refusal (which would be a self-inflicted outage), and a path that
-- merely LOOKS like a guardian RPC must not be treated as one.
--
-- `/rpc/peekXguardianXrequest` is the specific case that would pass if the
-- scope test ever used LIKE: `_` is a single-character wildcard there, so
-- `'%/rpc/peek_guardian_request'` matches it. The dispatcher uses string
-- equality on split segments precisely so this fails.
do $$
declare
  v_paths text[] := array[
    '',
    '/',
    '//',
    '///',
    'rpc',
    '/rpc',
    '/rpc/',
    '/rpc//',
    '/peek_guardian_request',
    'peek_guardian_request',
    '/rpc/peek_guardian_request/extra',
    '/rpc/peekXguardianXrequest',
    '/rpc/peek_guardian_requestX',
    '/rpc/Xpeek_guardian_request',
    '/rpc/PEEK_GUARDIAN_REQUEST',
    '/notrpc/peek_guardian_request',
    '/rpc/redeem_guardian_requestX',
    pg_catalog.repeat('/', 500),
    pg_catalog.repeat('/rpc', 200)
  ];
  v_path text;
  v_outcome text;
  v_refusals integer := 0;
  v_names text := '';
begin
  delete from private.guardian_rate_limits;

  foreach v_path in array v_paths loop
    v_outcome := phase2_acceptance.simulate(v_path, 'POST', phase2_acceptance.client('203.0.113.10'));
    if v_outcome <> 'allowed' then
      v_refusals := v_refusals + 1;
      v_names := v_names || ' [' || pg_catalog.left(v_path, 40) || ']';
    end if;
  end loop;

  perform phase2_acceptance.record(
    'B2', 'no malformed or near-miss path is refused', '0', v_refusals::text || v_names
  );
  perform phase2_acceptance.record(
    'B2', 'no malformed or near-miss path is rate-limited', '0', phase2_acceptance.limiter_rows()::text
  );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- B3. THE GUARDIAN PATHS ARE IN SCOPE, UNDER EVERY PLAUSIBLE PREFIX
-- ══════════════════════════════════════════════════════════════════════════
--
-- The failure mode this guards against is the quiet one: a gateway prefix the
-- dispatcher does not recognise means the limiter never engages and nothing
-- anywhere reports a problem. Suffix matching is the hedge; this proves the
-- hedge works for each shape `request.path` could plausibly take.
do $$
declare
  v_paths text[] := array[
    'rpc/peek_guardian_request',
    '/rpc/peek_guardian_request',
    '/rest/v1/rpc/peek_guardian_request',
    'rpc/redeem_guardian_request',
    '/rpc/redeem_guardian_request',
    '/rest/v1/rpc/redeem_guardian_request'
  ];
  v_path text;
  v_counted integer := 0;
begin
  delete from private.guardian_rate_limits;

  foreach v_path in array v_paths loop
    if phase2_acceptance.simulate(v_path, 'POST', phase2_acceptance.client('203.0.113.11')) = 'allowed' then
      v_counted := v_counted + 1;
    end if;
  end loop;

  perform phase2_acceptance.record('B3', 'all 6 guardian path shapes are allowed once', '6', v_counted::text);
  perform phase2_acceptance.record(
    'B3', 'all 6 guardian requests are recorded', '6', phase2_acceptance.limiter_rows()::text
  );
  perform phase2_acceptance.record(
    'B3', 'endpoint classes recorded', 'peek:3,redeem:3',
    (
      select 'peek:' || pg_catalog.count(*) filter (where endpoint = 'peek')
           || ',redeem:' || pg_catalog.count(*) filter (where endpoint = 'redeem')
      from private.guardian_rate_limits
    )
  );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- B3e. Encoded paths: assert each outcome AND its individual counter delta.
-- Trailing slash is a dispatcher no-op today; this does not prove HTTP routing.
do $$
declare
  v_case record;
  v_before bigint;
  v_outcome text;
begin
  delete from private.guardian_rate_limits;
  for v_case in select * from (values
    ('/rpc/%70eek_guardian_request', 'allowed', 1),
    ('/%72pc/peek_guardian_request', 'allowed', 1),
    ('/rpc/peek%5Fguardian_request', 'allowed', 1),
    ('/rpc/peek%5fguardian_request', 'allowed', 1),
    ('/rpc/%2570eek_guardian_request', 'allowed', 0),
    ('/rpc/peek_guardian_request%', 'refused:400', 0),
    ('/rp%c/peek_guardian_request', 'refused:400', 0),
    ('/athlete%profiles', 'allowed', 0),
    ('/rpc/get%5Fpublished_profile_by_slug', 'allowed', 0),
    ('/rest/v1/rpc/peek_guardian_request/', 'allowed', 0)
  ) as cases(path, outcome, delta) loop
    v_before := phase2_acceptance.limiter_rows();
    v_outcome := phase2_acceptance.simulate(
      v_case.path, 'POST', phase2_acceptance.client('203.0.113.11')
    );
    perform phase2_acceptance.record('B3e', v_case.path || ' outcome', v_case.outcome, v_outcome);
    perform phase2_acceptance.record(
      'B3e', v_case.path || ' limiter row delta', v_case.delta::text,
      (phase2_acceptance.limiter_rows() - v_before)::text
    );
  end loop;
  perform phase2_acceptance.record(
    'B3e', 'encoded guardian calls record only peek endpoint rows', '4',
    (select pg_catalog.count(*)::text from private.guardian_rate_limits where endpoint = 'peek')
  );
end;
$$;

-- B3v6. /56 equivalence and separation, including the actual dispatcher writes.
-- Digest expectations are calculated independently from the canonical network.
-- Neither salt nor bucket digests are emitted: only booleans and counts.
do $$
declare
  v_a inet := '2001:db8:1234:5601::1'::inet;
  v_b inet := '2001:db8:1234:56ff::2'::inet;
  v_c inet := '2001:db8:1234:5701::1'::inet;
  v_expected bytea;
  v_outcome text;
  v_ip inet;
begin
  delete from private.guardian_rate_limits;
  select pg_catalog.sha256(s.salt || pg_catalog.convert_to('2001:db8:1234:5600::', 'UTF8'))
    into v_expected from private.guardian_rate_limit_salt s where s.id;
  perform phase2_acceptance.record(
    'B3v6', 'IPv6 truncation precedes hashing of canonical /56 network', 'true',
    (private.guardian_rate_limit_bucket_key(v_a) = v_expected)::text
  );
  perform phase2_acceptance.record(
    'B3v6', 'same /56 addresses share bucket', 'true',
    (private.guardian_rate_limit_bucket_key(v_a) = private.guardian_rate_limit_bucket_key(v_b))::text
  );
  perform phase2_acceptance.record(
    'B3v6', 'different /56 addresses have different buckets', 'true',
    (private.guardian_rate_limit_bucket_key(v_a) <> private.guardian_rate_limit_bucket_key(v_c))::text
  );
  foreach v_ip in array array[v_a, v_b, v_c] loop
    v_outcome := phase2_acceptance.simulate(
      '/rpc/peek_guardian_request', 'POST', phase2_acceptance.client(pg_catalog.host(v_ip))
    );
    perform phase2_acceptance.record('B3v6', pg_catalog.host(v_ip) || ' POST outcome', 'allowed', v_outcome);
  end loop;
  perform phase2_acceptance.record('B3v6', 'IPv6 calls record three rows', '3', phase2_acceptance.limiter_rows()::text);
  perform phase2_acceptance.record(
    'B3v6', 'same /56 records two rows in expected bucket', '2',
    (select pg_catalog.count(*)::text from private.guardian_rate_limits where bucket_key = v_expected)
  );
  perform phase2_acceptance.record(
    'B3v6', 'different /56 records one row in separate bucket', '1',
    (select pg_catalog.count(*)::text from private.guardian_rate_limits
     where bucket_key = private.guardian_rate_limit_bucket_key(v_c))
  );
end;
$$;

-- B3mapped is an observation, never a PASS/FAIL assertion. Hosted address
-- representation is the pre-arm Gate B decision (RUNBOOK S4), not this known
-- source-level collision. Print only the state, never salt or bucket digests.
select 'OBSERVATION: ipv4_mapped_ipv6_collapses_to_sentinel=' || coalesce(
  (private.guardian_rate_limit_bucket_key('::ffff:203.0.113.9'::inet)
    = private.guardian_rate_limit_bucket_key('::'::inet))::text,
  'unknown'
) as mapped_ipv6_observation;

-- B4. THE METHOD GATE — closing the GET route onto the STABLE peek RPC
-- ══════════════════════════════════════════════════════════════════════════
--
-- `peek_guardian_request` is declared `stable`, so PostgREST will serve it
-- over GET as well as POST. A GET runs in a read-only transaction where the
-- limiter cannot record anything, so a GET that was merely ignored would be an
-- unlimited path onto a privileged function. It is refused instead, with 405 —
-- a refusal needs no write and so works in a read-only transaction too.
--
-- OPTIONS is the deliberate exception: a browser CORS preflight for these RPCs
-- is an OPTIONS request, no function executes on it, and refusing it would
-- break the guardian page outright rather than rate-limit it.
do $$
declare
  v_methods text[] := array['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'TRACE', 'get', 'post'];
  v_method text;
  v_outcome text;
  v_unrefused text := '';
begin
  delete from private.guardian_rate_limits;

  foreach v_method in array v_methods loop
    v_outcome := phase2_acceptance.simulate(
      '/rpc/peek_guardian_request', v_method, phase2_acceptance.client('203.0.113.12')
    );
    if v_outcome <> 'refused:405' then
      v_unrefused := v_unrefused || ' ' || v_method || '=' || v_outcome;
    end if;
  end loop;

  perform phase2_acceptance.record(
    'B4', 'every non-POST, non-OPTIONS method on a guardian path is refused 405', '(none)',
    coalesce(nullif(v_unrefused, ''), '(none)')
  );
  perform phase2_acceptance.record(
    'B4', 'refused methods record no limiter row', '0', phase2_acceptance.limiter_rows()::text
  );

  perform phase2_acceptance.record(
    'B4', 'OPTIONS on a guardian path is allowed through (CORS preflight)', 'allowed',
    phase2_acceptance.simulate('/rpc/peek_guardian_request', 'OPTIONS', phase2_acceptance.client('203.0.113.12'))
  );
  perform phase2_acceptance.record(
    'B4', 'OPTIONS records no limiter row', '0', phase2_acceptance.limiter_rows()::text
  );
end;
$$;

-- A guardian path with NO method metadata is refused, not admitted. This is
-- the one place the dispatcher chooses refusal over admission, and it only
-- ever applies to the two guardian paths.
do $$
declare
  v_detail text;
  v_outcome text := 'allowed';
begin
  delete from private.guardian_rate_limits;
  perform pg_catalog.set_config('request.path', '/rpc/redeem_guardian_request', true);
  begin
    perform public.data_api_pre_request();
  exception
    when sqlstate 'PGRST' then
      get stacked diagnostics v_detail = pg_exception_detail;
      v_outcome := 'refused:' || coalesce(v_detail::json ->> 'status', '?');
  end;
  perform phase2_acceptance.record(
    'B4', 'a guardian path with no method metadata is refused', 'refused:405', v_outcome
  );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- B5. THE THRESHOLDS ACTUALLY BIND, AND BIND PER ENDPOINT CLASS
-- ══════════════════════════════════════════════════════════════════════════
--
-- Peek burst is 10/minute and redeem burst is 5/minute. Within a single
-- transaction each call sees the rows the previous calls inserted, so the
-- sequence below is a faithful burst.
--
-- The second half is the important one: exhausting peek must NOT affect
-- redeem. They are separate columns in the same table precisely so the
-- thresholds can differ, and a bucket key that folded the endpoint in (or a
-- count that dropped the endpoint predicate) would couple them.
do $$
declare
  v_i integer;
  v_outcome text;
  v_first_refusal integer := 0;
begin
  delete from private.guardian_rate_limits;

  for v_i in 1..15 loop
    v_outcome := phase2_acceptance.simulate(
      '/rpc/peek_guardian_request', 'POST', phase2_acceptance.client('198.51.100.7')
    );
    if v_outcome <> 'allowed' and v_first_refusal = 0 then
      v_first_refusal := v_i;
      perform phase2_acceptance.record('B5', 'peek burst refusal status', 'refused:429', v_outcome);
    end if;
  end loop;

  perform phase2_acceptance.record('B5', 'peek burst refuses on call 11 (limit 10)', '11', v_first_refusal::text);
  perform phase2_acceptance.record(
    'B5', 'exactly 10 peek calls were recorded (refusals leave no row)', '10',
    (select pg_catalog.count(*)::text from private.guardian_rate_limits where endpoint = 'peek')
  );

  -- Same client, other endpoint class: unaffected.
  v_first_refusal := 0;
  for v_i in 1..8 loop
    v_outcome := phase2_acceptance.simulate(
      '/rpc/redeem_guardian_request', 'POST', phase2_acceptance.client('198.51.100.7')
    );
    if v_outcome <> 'allowed' and v_first_refusal = 0 then
      v_first_refusal := v_i;
    end if;
  end loop;

  perform phase2_acceptance.record(
    'B5', 'redeem burst refuses on call 6 (limit 5), independent of peek', '6', v_first_refusal::text
  );
end;
$$;

-- A different /24 is a different bucket. This is what makes the limit
-- per-network rather than global, and it is also the test that would fail if
-- the truncation masklen were ever widened to the point of grouping unrelated
-- networks together.
do $$
declare
  v_i integer;
  v_outcome text := 'allowed';
begin
  delete from private.guardian_rate_limits;

  for v_i in 1..10 loop
    perform phase2_acceptance.simulate(
      '/rpc/peek_guardian_request', 'POST', phase2_acceptance.client('198.51.100.7')
    );
  end loop;

  v_outcome := phase2_acceptance.simulate(
    '/rpc/peek_guardian_request', 'POST', phase2_acceptance.client('203.0.113.7')
  );
  perform phase2_acceptance.record(
    'B5', 'an exhausted bucket does not block a different /24', 'allowed', v_outcome
  );

  -- …but the SAME /24 is the same bucket, which is the point of truncation.
  v_outcome := phase2_acceptance.simulate(
    '/rpc/peek_guardian_request', 'POST', phase2_acceptance.client('198.51.100.250')
  );
  perform phase2_acceptance.record(
    'B5', 'a different host in the SAME /24 shares the bucket', 'refused:429', v_outcome
  );
end;
$$;

-- With no derivable client address, the per-network buckets are skipped and
-- only the global cap binds. That is strictly no more permissive than the
-- spoofing case it shares a root cause with, and it must not be a hard block:
-- a header surprise has to degrade the limiter, not take the guardian surface
-- down. Observing this path against a real gateway is an acceptance FAILURE
-- (RUNBOOK § A4); observing it here is the designed behaviour.
do $$
declare
  v_i integer;
  v_refusals integer := 0;
begin
  delete from private.guardian_rate_limits;

  for v_i in 1..20 loop
    if phase2_acceptance.simulate(
      '/rpc/peek_guardian_request', 'POST', pg_catalog.json_build_object('x-forwarded-for', 'not-an-ip')
    ) <> 'allowed' then
      v_refusals := v_refusals + 1;
    end if;
  end loop;

  perform phase2_acceptance.record(
    'B5', 'an undecodable client address degrades to the global cap, not a hard block', '0',
    v_refusals::text
  );
  perform phase2_acceptance.record(
    'B5', 'address-less requests still count toward the global cap', '20',
    phase2_acceptance.limiter_rows()::text
  );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- B6. NOTHING IDENTIFYING IS STORED
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_ip text := '192.0.2.123';
  v_columns text;
begin
  delete from private.guardian_rate_limits;
  perform phase2_acceptance.simulate(
    '/rpc/redeem_guardian_request', 'POST',
    pg_catalog.json_build_object(
      'cf-connecting-ip', v_ip,
      'x-forwarded-for', v_ip,
      'user-agent', 'acceptance-probe',
      'referer', 'https://example.invalid/guardian/participation',
      'authorization', 'Bearer should-never-be-stored'
    )
  );

  select pg_catalog.string_agg(a.attname, ',' order by a.attnum)
    into v_columns
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'private' and c.relname = 'guardian_rate_limits' and a.attnum > 0 and not a.attisdropped;

  perform phase2_acceptance.record(
    'B6', 'limiter table columns', 'bucket_key,endpoint,request_at', v_columns
  );

  -- The whole row, rendered as text, must not contain the address in any form.
  -- This is the check that would fail if the bucket key were ever stored raw,
  -- truncated-but-unhashed, or hashed without the salt being applied first.
  perform phase2_acceptance.record(
    'B6', 'no row contains the client address in any representation', '0',
    (
      select pg_catalog.count(*)::text
      from private.guardian_rate_limits r
      where pg_catalog.strpos(r::text, v_ip) > 0
         or pg_catalog.strpos(r::text, '192.0.2') > 0
         or pg_catalog.strpos(r::text, 'acceptance-probe') > 0
         or pg_catalog.strpos(r::text, 'should-never-be-stored') > 0
         or pg_catalog.strpos(r::text, 'example.invalid') > 0
    )
  );

  perform phase2_acceptance.record(
    'B6', 'bucket_key is a 32-byte digest', '32',
    (select pg_catalog.length(bucket_key)::text from private.guardian_rate_limits limit 1)
  );

  -- Deterministic, so an operator holding the salt can still look up a
  -- suspected network. If this ever stopped holding, the privacy model would
  -- have become unusable for incident response.
  perform phase2_acceptance.record(
    'B6', 'the bucket key for the /24 is reproducible from the salt', 'true',
    (
      select (r.bucket_key = private.guardian_rate_limit_bucket_key('192.0.2.0'::inet))::text
      from private.guardian_rate_limits r
      limit 1
    )
  );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- B7. CLEANUP CANNOT DELETE ANYTHING IT SHOULD NOT
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_participation_before bigint;
  v_participation_after bigint;
  v_outcome text := '(no error)';
  v_deleted bigint;
begin
  delete from private.guardian_rate_limits;

  -- A retention shorter than the longest active window would silently RESET
  -- live rate limits, which looks like nothing at all. It must refuse.
  begin
    perform private.prune_guardian_rate_limits(interval '30 minutes');
  exception
    when others then
      v_outcome := 'refused';
  end;
  perform phase2_acceptance.record('B7', 'prune refuses a retention below the longest window', 'refused', v_outcome);

  v_outcome := '(no error)';
  begin
    perform private.prune_guardian_rate_limits(null::interval);
  exception
    when others then
      v_outcome := 'refused';
  end;
  perform phase2_acceptance.record('B7', 'prune refuses a NULL retention', 'refused', v_outcome);

  -- A mixed-age table: only the rows outside the retention horizon may go.
  insert into private.guardian_rate_limits (bucket_key, endpoint, request_at)
  values
    (pg_catalog.sha256('old'::bytea), 'peek', clock_timestamp() - interval '5 hours'),
    (pg_catalog.sha256('old'::bytea), 'redeem', clock_timestamp() - interval '3 hours'),
    (pg_catalog.sha256('new'::bytea), 'peek', clock_timestamp() - interval '10 minutes'),
    (pg_catalog.sha256('new'::bytea), 'redeem', clock_timestamp());

  select pg_catalog.count(*) into v_participation_before from public.athlete_participation;

  v_deleted := private.prune_guardian_rate_limits(interval '2 hours');

  select pg_catalog.count(*) into v_participation_after from public.athlete_participation;

  perform phase2_acceptance.record('B7', 'prune deleted exactly the two expired rows', '2', v_deleted::text);
  perform phase2_acceptance.record(
    'B7', 'prune left the two in-window rows', '2', phase2_acceptance.limiter_rows()::text
  );
  perform phase2_acceptance.record(
    'B7', 'prune touched no participation row',
    v_participation_before::text, v_participation_after::text
  );
end;
$$;

-- The opportunistic prune inside the enforcer is scoped to the calling
-- bucket. One guardian's request must never be able to clear another bucket's
-- live counters — dropping either of its two predicates would allow that.
do $$
declare
  v_other bytea;
begin
  delete from private.guardian_rate_limits;

  v_other := private.guardian_rate_limit_bucket_key('203.0.113.1'::inet);
  insert into private.guardian_rate_limits (bucket_key, endpoint, request_at)
  values (v_other, 'peek', clock_timestamp() - interval '6 hours');

  -- A request from a DIFFERENT bucket, whose opportunistic prune runs.
  perform phase2_acceptance.simulate(
    '/rpc/peek_guardian_request', 'POST', phase2_acceptance.client('198.51.100.1')
  );

  perform phase2_acceptance.record(
    'B7', 'the opportunistic prune leaves another bucket''s rows alone', '1',
    (select pg_catalog.count(*)::text from private.guardian_rate_limits where bucket_key = v_other)
  );
end;
$$;

delete from private.guardian_rate_limits;

select 'part B complete' as status;

-- Advisory locks cannot refresh a frozen transaction snapshot. Those isolation
-- levels must be refused before counting, even on an otherwise valid POST.
begin isolation level repeatable read;
select phase2_acceptance.record(
  'B9', 'REPEATABLE READ is safely refused', 'refused:429',
  phase2_acceptance.simulate('/rpc/peek_guardian_request', 'POST', phase2_acceptance.client('192.0.2.1'))
);
commit;
begin isolation level serializable;
select phase2_acceptance.record(
  'B9', 'SERIALIZABLE is safely refused', 'refused:429',
  phase2_acceptance.simulate('/rpc/redeem_guardian_request', 'POST', phase2_acceptance.client('192.0.2.1'))
);
commit;
