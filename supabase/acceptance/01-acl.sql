-- Phase 2 live acceptance — PART A: deployed effective ACLs.
--
-- The repository can prove what the migrations SAY. Only a deployed database
-- can prove what the catalog actually HOLDS, which is a different question
-- whenever a migration has been applied more than once, applied out of order,
-- or preceded by an unreviewed draft. `create or replace function` does not
-- reset an existing function's ACL — that is exactly why 20261013000001
-- revokes explicitly from `public, authenticated` rather than relying on
-- omission — so "the migration grants only anon" and "only anon can execute"
-- are not the same statement until this file is run.
--
-- Everything here is a catalog read. Nothing is created, written, or dropped.

-- ── A1. The two guardian RPCs: anon yes, authenticated no, PUBLIC no ─────

select phase2_acceptance.record(
  'A1', 'anon can execute peek_guardian_request', 'true',
  pg_catalog.has_function_privilege('anon', 'public.peek_guardian_request(text)', 'EXECUTE')::text
);

select phase2_acceptance.record(
  'A1', 'anon can execute redeem_guardian_request', 'true',
  pg_catalog.has_function_privilege('anon', 'public.redeem_guardian_request(text, text)', 'EXECUTE')::text
);

select phase2_acceptance.record(
  'A1', 'authenticated CANNOT execute peek_guardian_request', 'false',
  pg_catalog.has_function_privilege('authenticated', 'public.peek_guardian_request(text)', 'EXECUTE')::text
);

select phase2_acceptance.record(
  'A1', 'authenticated CANNOT execute redeem_guardian_request', 'false',
  pg_catalog.has_function_privilege('authenticated', 'public.redeem_guardian_request(text, text)', 'EXECUTE')::text
);

-- PUBLIC cannot be asked about with has_function_privilege, because PUBLIC is
-- not a role name. It appears in an ACL as an entry with an EMPTY grantee,
-- which `aclexplode` reports as grantee OID 0. This is the check that would
-- catch the default grant PostgreSQL applies to every newly created function
-- having survived — the single most likely way these two functions end up
-- executable by every role in the project.
select phase2_acceptance.record(
  'A1', 'no PUBLIC EXECUTE grant on either guardian RPC', '0',
  (
    select pg_catalog.count(*)::text
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join pg_catalog.aclexplode(p.proacl) acl
    where n.nspname = 'public'
      and p.proname in ('peek_guardian_request', 'redeem_guardian_request')
      and acl.grantee = 0
  )
);

-- An exhaustive grantee listing, not just the three named roles: any OTHER
-- role holding EXECUTE is an unreviewed caller, and naming roles one at a time
-- can only ever find the ones someone thought to ask about.
select phase2_acceptance.record(
  'A1', 'exact EXECUTE grantee set on the guardian RPCs', 'anon',
  (
    select coalesce(pg_catalog.string_agg(distinct g, ',' order by g), '(none)')
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join pg_catalog.aclexplode(p.proacl) acl
    cross join lateral (
      select case when acl.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end
    ) as grantee_name(g)
    where n.nspname = 'public'
      and p.proname in ('peek_guardian_request', 'redeem_guardian_request')
      and acl.privilege_type = 'EXECUTE'
      and g <> pg_catalog.pg_get_userbyid(p.proowner)
  )
);

-- ── A2. Function owner and execution context ─────────────────────────────
--
-- Both RPCs are SECURITY DEFINER, so the OWNER is the privilege they run
-- with. An owner other than the expected one silently changes what the
-- functions can reach — and `postgres` owning them is the documented,
-- accepted consequence recorded in docs/ai/DECISIONS.md (Option A).
select phase2_acceptance.record(
  'A2', 'guardian RPC owners', 'postgres,postgres',
  (
    select pg_catalog.string_agg(pg_catalog.pg_get_userbyid(p.proowner), ',' order by p.proname)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('peek_guardian_request', 'redeem_guardian_request')
  )
);

select phase2_acceptance.record(
  'A2', 'both guardian RPCs are SECURITY DEFINER', '2',
  (
    select pg_catalog.count(*)::text
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('peek_guardian_request', 'redeem_guardian_request')
      and p.prosecdef
  )
);

-- An EMPTY search_path, specifically — `proconfig` holding `search_path=public`
-- would also be "a pinned search_path" while leaving every unqualified
-- reference hijackable by a same-named object in `public`.
--
-- ── WHY THE EXPECTED STRING IS `search_path=""` ──────────────────────────
--
-- `SET search_path = ''` does NOT serialize into `proconfig` as
-- `search_path=`. `search_path` is a GUC_LIST_QUOTE setting, so PostgreSQL
-- round-trips its value through the list quoter, and an empty list element is
-- emitted as a quoted empty string: the stored entry is `search_path=""`.
-- `SHOW search_path` displays `""` for the same reason.
--
-- The first version of this file expected `search_path=` and would therefore
-- have reported a FAIL against a perfectly hardened function — an acceptance
-- bug that would have sent someone looking for a migration problem that did
-- not exist.
--
-- Matched as EXACT EQUALITY against the stored quoted-empty representation, and deliberately NOT as `like 'search_path=%'` or a `strpos` test:
-- those would also accept `search_path=public`, `search_path="$user", public`
-- and every other non-empty value, which is the one thing this assertion
-- exists to rule out.
select phase2_acceptance.record(
  'A2', 'guardian RPCs pin an EMPTY search_path', 'empty,empty',
  (
    select pg_catalog.string_agg(c.verdict, ',' order by c.verdict)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join lateral (
      select case
        when s.setting = 'search_path=""' then 'empty'
        when s.setting is null then '(unset)'
        else s.setting
      end
      from (
        select (
          select cfg
          from pg_catalog.unnest(p.proconfig) as cfg
          where cfg like 'search_path=%'
          limit 1
        ) as setting
      ) s
    ) as c(verdict)
    where n.nspname = 'public'
      and p.proname in ('peek_guardian_request', 'redeem_guardian_request')
  )
);

-- ── A2b. VOLATILITY — the limiter's hard prerequisite ───────────────────
--
-- BOTH guardian RPCs must be VOLATILE ('v') in the deployed catalog, and this
-- is a correctness assertion rather than a hardening one.
--
-- PostgREST chooses a read-only or a read/write transaction from the called
-- function's volatility, NOT from the HTTP method: GET and HEAD always run
-- read-only, a POST to a STABLE or IMMUTABLE function ALSO runs read-only, and
-- only a POST to a VOLATILE function runs read/write. The pre-request limiter
-- INSERTs, so if peek is STABLE here then every legitimate POST peek raises
-- 25006 once the hook is armed — the peek surface breaks outright rather than
-- going unlimited.
--
-- 20261013000001 declared peek STABLE and is byte-pinned; 20261014000002
-- changes it with one `alter function`. So this assertion deliberately
-- CONTRADICTS the text of the pinned migration, and that is the intended
-- state. If this reports 's', the forward migration has not been applied — do
-- not arm, and do not "fix" it by editing 20261013000001.
--
-- Redeem was already VOLATILE (its declaration names no volatility, and
-- VOLATILE is PostgreSQL's default), which is correct because it writes.
select phase2_acceptance.record(
  'A2', 'peek_guardian_request volatility (VOLATILE, via 20261014000002)', 'v',
  (
    select p.provolatile::text
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'peek_guardian_request'
  )
);

select phase2_acceptance.record(
  'A2', 'redeem_guardian_request volatility (VOLATILE, unchanged)', 'v',
  (
    select p.provolatile::text
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'redeem_guardian_request'
  )
);

-- Peek is VOLATILE but must still be logically read-only. The catalog cannot
-- answer that; what it can confirm is that peek's declared return shape is
-- unchanged by the volatility alteration, and part C asserts behaviourally
-- that a peek consumes no token and writes no event.
select phase2_acceptance.record(
  'A2', 'peek still returns its 5-column projection after the volatility change', '5',
  (
    select pg_catalog.count(*)::text
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    -- Counting TABLE-mode arguments needs only ONE array, so no zip is
    -- involved. `pg_catalog.unnest(a, b)` would be invalid syntax anyway:
    -- multi-argument unnest is special grammar that exists only as a bare
    -- `UNNEST(a, b)` in FROM and cannot be schema-qualified.
    cross join lateral pg_catalog.unnest(p.proargmodes) as a(mode)
    where n.nspname = 'public' and p.proname = 'peek_guardian_request' and a.mode = 't'
  )
);

-- The volatility change must not have altered the owner or the ACL it was
-- reviewed with. `alter function ... volatile` cannot touch either, so a
-- divergence here means something other than that statement ran.
select phase2_acceptance.record(
  'A2', 'peek owner and anon-only EXECUTE survive the volatility change', 'postgres/true/false',
  (
    select pg_catalog.pg_get_userbyid(p.proowner) || '/'
        || pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')::text || '/'
        || pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'peek_guardian_request'
  )
);

-- ── A3. No direct table grants anywhere on the participation tables ──────
--
-- The whole authorization model for this surface is "no role but the SECURITY
-- DEFINER owner touches these tables". A single direct grant would route
-- around every predicate in both RPCs, so this asks about every privilege
-- type for both request roles rather than spot-checking SELECT.
select phase2_acceptance.record(
  'A3', 'anon/authenticated hold no privilege on the participation tables', '0',
  (
    select pg_catalog.count(*)::text
    from (values ('anon'), ('authenticated')) as r(role)
    cross join (values
      ('public.athlete_participation'), ('public.participation_events')
    ) as t(name)
    cross join (values
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) as p(privilege)
    where pg_catalog.has_table_privilege(r.role, t.name, p.privilege)
  )
);

-- Column-level grants are a separate ACL from table-level ones and would not
-- show up above. 5D.7 already removed a column-grant model from
-- athlete_profiles, so this is a regression this project has specifically
-- earned the right to be paranoid about.
select phase2_acceptance.record(
  'A3', 'no column-level grants to anon/authenticated on participation tables', '0',
  (
    select pg_catalog.count(*)::text
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join pg_catalog.aclexplode(a.attacl) acl
    where n.nspname = 'public'
      and c.relname in ('athlete_participation', 'participation_events')
      and (
        acl.grantee = 0
        or pg_catalog.pg_get_userbyid(acl.grantee) in ('anon', 'authenticated')
      )
  )
);

select phase2_acceptance.record(
  'A3', 'RLS enabled on both participation tables', '2',
  (
    select pg_catalog.count(*)::text
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('athlete_participation', 'participation_events')
      and c.relrowsecurity
  )
);

-- ── A4. The partial unique index on token_hash ───────────────────────────

select phase2_acceptance.record(
  'A4', 'athlete_participation_token_hash_unique exists, unique, and partial', 'true',
  (
    select (i.indisunique and i.indpred is not null)::text
    from pg_catalog.pg_class c
    join pg_catalog.pg_index i on i.indexrelid = c.oid
    where c.relname = 'athlete_participation_token_hash_unique'
  )
);

-- ── A5. The rate limiter's own deployed boundary ─────────────────────────
--
-- These assertions are about 20261014000001 and will all report "(absent)"
-- style failures until it is applied. That is the intended reading: this file
-- is also the evidence that the limiter was deployed as reviewed.

select phase2_acceptance.record(
  'A5', 'anon has NO USAGE on schema private', 'false',
  pg_catalog.has_schema_privilege('anon', 'private', 'USAGE')::text
);

select phase2_acceptance.record(
  'A5', 'authenticated has NO USAGE on schema private', 'false',
  pg_catalog.has_schema_privilege('authenticated', 'private', 'USAGE')::text
);

select phase2_acceptance.record(
  'A5', 'anon/authenticated hold no privilege on the limiter tables', '0',
  (
    select pg_catalog.count(*)::text
    from (values ('anon'), ('authenticated')) as r(role)
    cross join (values
      ('private.guardian_rate_limits'), ('private.guardian_rate_limit_salt')
    ) as t(name)
    cross join (values
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) as p(privilege)
    where pg_catalog.has_table_privilege(r.role, t.name, p.privilege)
  )
);

select phase2_acceptance.record(
  'A5', 'RLS enabled on both limiter tables', '2',
  (
    select pg_catalog.count(*)::text
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relname in ('guardian_rate_limits', 'guardian_rate_limit_salt')
      and c.relrowsecurity
  )
);

select phase2_acceptance.record(
  'A5', 'no RLS policy on either limiter table', '0',
  (
    select pg_catalog.count(*)::text
    from pg_catalog.pg_policy pol
    join pg_catalog.pg_class c on c.oid = pol.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
  )
);

-- All four `private` functions, plus the dispatcher, SECURITY DEFINER with an
-- empty search_path. The dispatcher runs on every Data API request, so an
-- unpinned search_path there is not a theoretical concern.
select phase2_acceptance.record(
  'A5', 'limiter functions: SECURITY DEFINER + empty search_path', '5',
  (
    select pg_catalog.count(*)::text
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where (
        (n.nspname = 'private' and p.proname in (
          'guardian_rate_limit_bucket_key', 'guardian_request_ip',
          'guardian_rate_limit_enforce', 'prune_guardian_rate_limits'
        ))
        or (n.nspname = 'public' and p.proname = 'data_api_pre_request')
      )
      and p.prosecdef
      -- Require the exact stored quoted-empty search_path.
      and p.proconfig @> array['search_path=""']
  )
);

-- ── A5b. THE DISPATCHER'S EFFECTIVE GRANTEE SET (FOUNDER DECISION A1) ───
--
-- PostgREST calls db_pre_request AFTER switching into the request's effective
-- role, so the roles that need EXECUTE are the Data API roles. A1 settled that
-- this is enumerated — anon, authenticated, service_role — and NOT PUBLIC:
-- least privilege, so that a future custom Data API role requires a
-- deliberate reviewed grant rather than being admitted implicitly.
--
-- Asserted EXHAUSTIVELY and in both directions, because both failure modes are
-- real and opposite. A missing role loses its ENTIRE Data API, not just the
-- limiter. An extra role is the implicit-exposure A1 rejected.
select phase2_acceptance.record(
  'A5', 'exact EXECUTE grantee set on the dispatcher', 'anon,authenticated,service_role',
  (
    select coalesce(pg_catalog.string_agg(distinct g, ',' order by g), '(none)')
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join pg_catalog.aclexplode(p.proacl) acl
    cross join lateral (
      select case when acl.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end
    ) as grantee_name(g)
    where n.nspname = 'public'
      and p.proname = 'data_api_pre_request'
      and acl.privilege_type = 'EXECUTE'
      and g <> pg_catalog.pg_get_userbyid(p.proowner)
  )
);

-- PUBLIC specifically. `has_function_privilege` cannot be asked about PUBLIC
-- (it is not a role name); in an ACL it is the entry with an empty grantee,
-- which aclexplode reports as OID 0. This is the check that catches
-- PostgreSQL's own default grant on a new function having survived — the most
-- likely way the rejected A1 design reappears without anyone writing it down.
select phase2_acceptance.record(
  'A5', 'PUBLIC has NO EXECUTE on the dispatcher (A1 rejected granting PUBLIC)', 'false',
  (
    select exists (
      select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      cross join pg_catalog.aclexplode(p.proacl) acl
      where n.nspname = 'public'
        and p.proname = 'data_api_pre_request'
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )::text
  )
);

-- Each approved role individually, so a failure names which one is missing
-- rather than only reporting that the set differs.
select phase2_acceptance.record(
  'A5', 'each approved Data API role can execute the dispatcher', 'true,true,true',
  (
    select pg_catalog.string_agg(
             pg_catalog.has_function_privilege(r.role, 'public.data_api_pre_request()', 'EXECUTE')::text,
             ',' order by r.ord
           )
    from (values ('anon', 1), ('authenticated', 2), ('service_role', 3)) as r(role, ord)
  )
);

-- `authenticator` is deliberately NOT granted: PostgREST has already switched
-- roles by the time the hook runs, so it is not the executing role. Recorded
-- as an observation rather than a pass/fail on its own — if a deployed project
-- ever shows authenticator erroring on Data API requests, that is a
-- STOP-AND-REPORT finding (RUNBOOK § A1), to be fixed by naming the role in a
-- reviewed migration, never by widening to PUBLIC.
select phase2_acceptance.record(
  'A5', 'authenticator is not a dispatcher grantee (expected: not needed)', 'false',
  pg_catalog.has_function_privilege('authenticator', 'public.data_api_pre_request()', 'EXECUTE')::text
);

-- Nothing in `private` may be executable by a request role. The dispatcher is
-- the only entry point; the policy itself must be reachable only as the owner.
select phase2_acceptance.record(
  'A5', 'no anon/authenticated/PUBLIC EXECUTE on any private function', '0',
  (
    select pg_catalog.count(*)::text
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join pg_catalog.aclexplode(p.proacl) acl
    where n.nspname = 'private'
      and acl.privilege_type = 'EXECUTE'
      and (
        acl.grantee = 0
        or pg_catalog.pg_get_userbyid(acl.grantee) in ('anon', 'authenticated', 'service_role')
      )
  )
);

-- ── A6. The registered pre-request hook — PHASE-DEPENDENT ────────────────
--
-- The one piece of configuration that is not a migration artefact in the
-- ordinary sense: a role setting. What the RIGHT answer is depends on which
-- phase the run is in, which is why `:expect_armed` is passed in by the runner
-- rather than hard-coded.
--
-- The first version of this file asserted "armed" unconditionally while the
-- runbook told the operator to run the harness BEFORE arming — a contradiction
-- that guaranteed a confusing FAIL on the first, correct, pre-arm run. Both
-- readings are now legitimate and distinct:
--
--   pre-arm  (`--phase=pre-arm`, expect_armed=0): `(unset)` is the PASS. It is
--            the positive evidence that 20261014000001 and 20261014000002 are
--            genuinely inert — applying them changed no Data API behaviour.
--   armed    (`--phase=armed`,  expect_armed=1): the dispatcher must be named.
--
-- Everything else in this harness runs identically in both phases, because it
-- calls `public.data_api_pre_request()` directly and does not depend on
-- PostgREST having been told about it.
select phase2_acceptance.record(
  'A6',
  case when :'expect_armed' = '1'
    then 'authenticator pgrst.db_pre_request (armed phase)'
    else 'authenticator pgrst.db_pre_request (pre-arm phase: must be inert)'
  end,
  case when :'expect_armed' = '1'
    then 'pgrst.db_pre_request=public.data_api_pre_request'
    else '(unset)'
  end,
  phase2_acceptance.hook_setting()
);

select 'part A complete' as status;
