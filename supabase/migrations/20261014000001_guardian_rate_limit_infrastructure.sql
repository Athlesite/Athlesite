-- Guardian-First Participation, Phase 2 production readiness — PostgREST
-- pre-request rate limiting for the two guardian bearer RPCs.
--
-- This migration is INERT on its own. It creates the limiter infrastructure and
-- the pre-request function, but it does NOT register that function with
-- PostgREST. Arming is a separate, separately-revertible migration
-- (20261014000003_arm_guardian_rate_limit_pre_request.sql). The split is
-- deliberate: `alter role authenticator set pgrst.db_pre_request = ...` changes
-- the behaviour of EVERY Data API request in the project, and a change with
-- that blast radius should be its own one-statement diff that can be reverted
-- without dropping anything.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHY A DATABASE-LEVEL LIMITER AND NOT A NEXT MIDDLEWARE ONE
-- ══════════════════════════════════════════════════════════════════════════
--
-- 20261013000001 grants `anon` EXECUTE on peek_guardian_request and
-- redeem_guardian_request. `anon` is the publishable key's role, the
-- publishable key ships in browser code by definition, and PostgREST serves
-- /rest/v1/rpc/... directly. A guardian token holder — or anyone at all,
-- token or not — can therefore POST to those two RPCs without the Next
-- application being in the request path even once. A rate limiter in
-- src/proxy.ts would protect a route nobody has to use.
--
-- PostgREST's `db-pre-request` hook runs inside the same transaction as the
-- request it precedes, after the role switch, for Data API requests
-- specifically. That is the only layer this project controls which sits in
-- front of a direct PostgREST RPC call.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS LIMITER IS, AND WHAT IT IS NOT
-- ══════════════════════════════════════════════════════════════════════════
--
-- It is a RESOURCE AND ABUSE control. It is not an authorization boundary and
-- must never be described as one. Authorization for this surface is possession
-- of a 256-bit token, enforced inside the two RPCs themselves; brute-forcing
-- that token is infeasible at any request rate a limiter would allow or
-- disallow. What the limiter actually buys:
--
--   * bounded privileged database work from an unauthenticated caller — both
--     RPCs are SECURITY DEFINER and peek performs an index scan plus a join to
--     auth.users on every call, token valid or not;
--   * bounded cost, and a bounded worst case for every other tenant of the
--     same database;
--   * a tripwire — the limiter firing at pilot scale means something is
--     wrong, and the acceptance runbook says to look.
--
-- It is NOT a defence against a distributed caller, and the per-network half
-- is explicitly best-effort: see the IP MODEL section.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT IS STORED, AND WHAT IS DELIBERATELY NOT
-- ══════════════════════════════════════════════════════════════════════════
--
-- Three columns: a salted hash of a truncated client network, an endpoint
-- class ('peek' | 'redeem'), and a timestamp. That is the complete set.
--
-- NOT stored, anywhere in this migration, by construction and by contract
-- (scripts/guardian-rate-limit-contract.mjs asserts the absence of each):
--
--   * the raw guardian bearer token
--   * any hash or prefix of the token — including `token_hash`, which this
--     file never reads and never writes
--   * the request body, or any RPC argument
--   * guardian_email, athlete email, owner_user_id, or any other identifier
--     that could tie a limiter row to a person or a profile
--   * raw IP addresses (see below)
--   * User-Agent, Referer, or any other request header value
--
-- A limiter row answers exactly one question — "how many guardian calls has
-- this network made recently" — and cannot answer any other.
--
-- ══════════════════════════════════════════════════════════════════════════
-- IP MODEL — truncate, then salted-hash, and an honest threat statement
-- ══════════════════════════════════════════════════════════════════════════
--
-- Supabase's own documented pre-request rate limiter stores `inet` raw. This
-- one does not, for two reasons specific to this product.
--
-- (1) PRIVACY. The people on the guardian surface are parents of minors. An IP
--     address is personal data, it is a rough location, and a table of
--     (guardian IP, timestamp) rows is a log of which households looked at a
--     minor's participation request and when. docs/ai/GUARDRAILS.md § Athlete
--     data says to err toward collecting less. Abuse control needs to know
--     "same source again", which does not require knowing the source.
--
--     So the stored key is sha256(secret_salt || truncated_network):
--       - IPv4 is truncated to /24, IPv6 to /56, BEFORE hashing;
--       - the salt is 32 bytes generated in this database at migration time
--         and stored in private.guardian_rate_limit_salt. It is NOT a
--         committed secret (GUARDRAILS § Secrets): nothing about it exists in
--         this repository, and two databases running this migration get
--         different salts.
--
--     What that buys, precisely: routine access to the limiter table — a
--     founder in the dashboard, a query during an incident, an exported row,
--     an over-broad future grant — reveals no IP addresses and no networks.
--     What it does NOT buy: protection from an actor who can read BOTH private
--     tables, because they have the salt and IPv4 space is small enough to
--     enumerate against a known salt. This is data minimisation at rest, not
--     anonymisation, and it is stated that way deliberately rather than
--     claimed as more.
--
--     An operator who needs to investigate a specific suspected network can
--     still do it, because the derivation is deterministic: hash the candidate
--     network with the stored salt and look the key up. Nothing is lost
--     operationally.
--
-- (2) TRUNCATION IS BETTER RATE LIMITING HERE, NOT JUST BETTER PRIVACY.
--     Limiting per exact address is trivially evaded by any caller with a /64
--     of IPv6 — which is what an ordinary residential or cloud allocation is.
--     A /56 IPv6 and /24 IPv4 bucket costs an attacker real addresses to
--     evade. The price is collateral aggregation: a carrier NAT or a school
--     network can put many unrelated guardians in one /24. The thresholds
--     below are sized with that in mind — the legitimate flow is one peek and
--     one redeem per token, so even a heavily shared /24 stays far under them.
--
-- THE SPOOFING QUESTION, STATED RATHER THAN ASSUMED. Whether the forwarding
-- header this function reads can be set by the client is a property of
-- Supabase's edge, not of this SQL, and it is NOT something this repository
-- can prove. Supabase's documentation reads the leftmost `x-forwarded-for`
-- element, which in the general case is whatever the client sent, because
-- proxies append rather than replace. `cf-connecting-ip` is preferred here
-- because Cloudflare overwrites it at its own edge, and Supabase's log field
-- reference shows it present on Data API requests — but "present in edge logs"
-- is not "unforgeable at PostgREST", and this file does not claim it is.
--
-- The consequence is accepted rather than hidden: IF the header is
-- client-settable, the per-network limits are evadable by rotating it, and the
-- GLOBAL PER-ENDPOINT CAP below is the only spoofing-resistant control. That
-- cap exists precisely so that the limiter's worst case is "degraded to a
-- global circuit breaker", not "absent". Proving which header is trustworthy
-- is a LIVE ACCEPTANCE ITEM — docs/ai/RUNBOOK-phase2-acceptance.md § A4 — and
-- it must be closed before these thresholds are trusted as per-network.

-- ────────────────────────────────────────────────────────────────────────
-- The private schema. Not exposed through the Data API.
-- ────────────────────────────────────────────────────────────────────────
--
-- Supabase exposes `public` and `graphql_public`; `private` is reachable only
-- from inside the database. The explicit revoke is belt-and-braces:
-- PostgreSQL does not grant USAGE on a newly created schema to PUBLIC, but
-- this migration uses `if not exists`, so the schema may predate this file.
create schema if not exists private;
revoke all on schema private from public;

comment on schema private is
  'Internal, non-API schema. Nothing here is exposed through PostgREST, and no '
  'role is granted USAGE on it — the only access is from SECURITY DEFINER '
  'functions owned by the schema owner.';

-- ────────────────────────────────────────────────────────────────────────
-- The salt. One row, generated here, never in the repository.
-- ────────────────────────────────────────────────────────────────────────
--
-- `id boolean primary key default true` with a `check (id)` constraint is the
-- single-row idiom: the primary key admits only `true` and `false`, the check
-- rejects `false`, so the table can hold exactly one row and a second INSERT
-- conflicts rather than silently rotating the salt (which would reset every
-- live rate-limit window).
--
-- Entropy source: two `gen_random_uuid()` values (v4, 122 random bits each)
-- concatenated and hashed to 32 bytes — 244 bits of input entropy. Both
-- `gen_random_uuid()` and `sha256()` are built in to PostgreSQL (13+ and 11+
-- respectively), so this needs no `pgcrypto`, matching 20261013000001's own
-- no-extension choice.
create table if not exists private.guardian_rate_limit_salt (
  id boolean primary key default true,
  salt bytea not null,
  created_at timestamptz not null default now(),
  constraint guardian_rate_limit_salt_single_row check (id),
  constraint guardian_rate_limit_salt_length check (pg_catalog.length(salt) = 32)
);

alter table private.guardian_rate_limit_salt enable row level security;

insert into private.guardian_rate_limit_salt (id, salt)
values (
  true,
  pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.gen_random_uuid()::text || pg_catalog.gen_random_uuid()::text,
    'UTF8'
  ))
)
on conflict (id) do nothing;

comment on table private.guardian_rate_limit_salt is
  'Single-row, per-database salt for guardian rate-limit bucket keys. Generated in '
  'the database, never committed, and never rotated by a re-run (on conflict do '
  'nothing) because rotating it would reset every live rate-limit window.';

-- ────────────────────────────────────────────────────────────────────────
-- The limiter rows. Three columns, append-only, short-lived.
-- ────────────────────────────────────────────────────────────────────────
--
-- No primary key and no surrogate id: this is an append-only counting log, and
-- every read is a windowed COUNT over one of the two indexes below. A key
-- would buy nothing and cost a write on the hot path.
--
-- RLS is enabled with NO policies. The table has no grants to any role and
-- sits in a non-exposed schema, so RLS is not the access control here — it is
-- the third independent layer behind those two, and it means a future
-- accidental `grant select` would still read zero rows. The SECURITY DEFINER
-- functions below are owned by the table owner, which is exempt from RLS, so
-- enabling it does not affect them.
create table if not exists private.guardian_rate_limits (
  bucket_key bytea not null,
  endpoint text not null,
  request_at timestamptz not null,
  constraint guardian_rate_limits_endpoint_check check (endpoint in ('peek', 'redeem')),
  constraint guardian_rate_limits_bucket_key_length check (pg_catalog.length(bucket_key) = 32)
);

alter table private.guardian_rate_limits enable row level security;

-- Serves the per-bucket burst and sustained COUNTs.
create index if not exists guardian_rate_limits_bucket_endpoint_at_idx
  on private.guardian_rate_limits (bucket_key, endpoint, request_at desc);

-- Serves the global per-endpoint cap COUNT and the global prune.
create index if not exists guardian_rate_limits_endpoint_at_idx
  on private.guardian_rate_limits (endpoint, request_at desc);

comment on table private.guardian_rate_limits is
  'Append-only abuse-control counters for the two guardian bearer RPCs. Columns are '
  'exactly: a salted hash of a truncated client network, the endpoint class, and a '
  'timestamp. Contains no token, no token hash, no request body, no RPC argument, no '
  'email, no owner_user_id, and no raw IP address.';

-- ────────────────────────────────────────────────────────────────────────
-- private.guardian_rate_limit_bucket_key — truncate, then salted hash.
-- ────────────────────────────────────────────────────────────────────────
--
-- The ENDPOINT IS DELIBERATELY NOT PART OF THE KEY. Keeping it in its own
-- column means the same network's peek and redeem traffic share a key and can
-- be counted separately (which the thresholds need), counted together (which a
-- future combined cap could need), or pruned together — none of which is
-- possible if the endpoint is folded into the hash.
--
-- Truncation happens BEFORE hashing, so the full address never reaches the
-- digest input and cannot be recovered from the stored key even with the salt:
-- only the /24 or /56 can.
create or replace function private.guardian_rate_limit_bucket_key(p_ip inet)
returns bytea
language sql
security definer
stable
set search_path = ''
as $$
  select pg_catalog.sha256(
    s.salt
    || pg_catalog.convert_to(
         pg_catalog.host(
           pg_catalog.network(
             pg_catalog.set_masklen(
               p_ip,
               case when pg_catalog.family(p_ip) = 4 then 24 else 56 end
             )
           )
         ),
         'UTF8'
       )
  )
  from private.guardian_rate_limit_salt s
  where s.id;
$$;

revoke all on function private.guardian_rate_limit_bucket_key(inet) from public;

comment on function private.guardian_rate_limit_bucket_key(inet) is
  'sha256(per-database salt || truncated network). IPv4 truncated to /24, IPv6 to '
  '/56, before hashing. Deterministic, so an operator holding the salt can look up a '
  'suspected network; not reversible without it.';

-- ────────────────────────────────────────────────────────────────────────
-- private.guardian_request_ip — the one place a header is read.
-- ────────────────────────────────────────────────────────────────────────
--
-- Returns NULL rather than raising for every malformed-metadata case, because
-- the caller's response to "no usable client address" is a deliberate policy
-- decision (see guardian_rate_limit_enforce: global cap only, never a hard
-- block), not something this function should make by throwing.
--
-- HEADER PREFERENCE, most trustworthy first:
--   1. cf-connecting-ip — Cloudflare sets this at its own edge, overwriting
--      any client-supplied value. Preferred for exactly that reason.
--   2. x-real-ip — conventionally set by the nearest reverse proxy.
--   3. the leftmost x-forwarded-for element — what Supabase's own
--      documentation uses, and the weakest of the three, because proxies
--      append to this header rather than replace it, so in the general case
--      the leftmost element is whatever the client sent.
--
-- Each step is a fallback, not a merge: the first non-blank candidate wins and
-- the rest are never consulted. Which of the three is actually present on a
-- deployed Supabase Data API request is a live acceptance item (RUNBOOK § A4).
--
-- Both casts are wrapped in narrowly-scoped handlers for
-- `invalid_text_representation` (SQLSTATE 22P02) — the error either cast can
-- raise — rather than `when others`, so a genuine internal failure is not
-- swallowed and mistaken for a missing header.
create or replace function private.guardian_request_ip()
returns inet
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_headers json;
  v_candidate text;
begin
  begin
    v_headers := pg_catalog.current_setting('request.headers', true)::json;
  exception
    when invalid_text_representation then
      return null;
  end;

  if v_headers is null then
    return null;
  end if;

  v_candidate := pg_catalog.btrim(coalesce(v_headers ->> 'cf-connecting-ip', ''));

  if v_candidate = '' then
    v_candidate := pg_catalog.btrim(coalesce(v_headers ->> 'x-real-ip', ''));
  end if;

  if v_candidate = '' then
    v_candidate := pg_catalog.btrim(
      pg_catalog.split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)
    );
  end if;

  if v_candidate = '' then
    return null;
  end if;

  begin
    return v_candidate::inet;
  exception
    when invalid_text_representation then
      return null;
  end;
end;
$$;

revoke all on function private.guardian_request_ip() from public;

comment on function private.guardian_request_ip() is
  'Best-effort client address from PostgREST request.headers, preferring '
  'cf-connecting-ip, then x-real-ip, then the leftmost x-forwarded-for element. '
  'Returns NULL for absent or malformed metadata — never raises. Trustworthiness of '
  'these headers behind Supabase is a live acceptance item, not an assumption.';

-- ────────────────────────────────────────────────────────────────────────
-- private.guardian_rate_limit_enforce — the policy, and the only writer.
-- ────────────────────────────────────────────────────────────────────────
--
-- ══ PILOT THRESHOLDS — FOUNDER APPROVAL REQUIRED BEFORE DEPLOYMENT ══
--
-- These values are SQL literals in this reviewed migration rather than rows in
-- a tunable table, on purpose: the effective policy is then part of the
-- reviewed, byte-pinned artefact, and changing it is a corrective migration a
-- founder signs off on, not an UPDATE nobody sees. Changing them is cheap;
-- changing them silently is impossible.
--
-- They are derived from the legitimate flow, which is small and known: a
-- guardian opens one link, the page issues ONE peek on load, and the guardian
-- presses approve or decline ONCE, which issues ONE redeem. Everything above
-- that is retries, a reload, a second guardian device, or abuse.
--
--   PEEK — read-only, but every call is privileged work: an index scan on
--   athlete_participation plus a join to auth.users, executed as the function
--   owner, for a caller holding no credential at all.
--     burst      10 per /24-or-/56 per 1 minute
--     sustained  40 per /24-or-/56 per 1 hour
--   10/minute is ~10x the legitimate peak (one load, a refresh, a second
--   device) and still low enough that a scripted caller is stopped within a
--   second or two. 40/hour bounds a slow grinder that stays under the burst.
--
--   REDEEM — terminal and higher sensitivity: it writes, it clears the token,
--   and it appends permanent evidence. A guardian needs exactly one successful
--   call, ever, per token.
--     burst       5 per /24-or-/56 per 1 minute
--     sustained  15 per /24-or-/56 per 1 hour
--   5/minute covers a mis-click, a transport retry after a `network_error`
--   (guardian-repository.ts maps an ambiguous transport failure to exactly
--   that, and a cautious guardian may well press again), and a second device.
--
--   GLOBAL CAPS — all buckets combined, per endpoint, per 5 minutes:
--     peek    300
--     redeem  100
--   This is the only control a caller who can rotate the forwarding header
--   cannot evade, which is why it exists. It is sized as a CIRCUIT BREAKER,
--   not a routine limiter: pilot scale is tens of guardians total, so 300
--   peeks in five minutes is roughly two orders of magnitude above expected
--   legitimate traffic. It is tripped only by something that is already an
--   incident.
--
--   THE GLOBAL CAP'S OWN TRADE-OFF, STATED PLAINLY: a caller who can rotate
--   addresses can trip it deliberately and thereby deny legitimate guardians
--   for up to five minutes. That is a real availability cost, accepted
--   knowingly, because (a) the token is 256 bits so denial is the ONLY thing
--   such a caller can achieve, and (b) the alternative — no spoofing-resistant
--   control at all — exposes the database instead. Founders should read this
--   paragraph before approving the values, because it is the one place where
--   this design chooses availability loss over resource loss.
--
-- ══ WHY THE LIMITS ARE HARD CAPS: TRANSACTION-SCOPED ADVISORY LOCKS ══
--
-- Count, compare, insert is not atomic on its own. Two concurrent requests
-- both read N-1, both decide they are under the limit, and both insert — so a
-- "limit" of 10 admits 11, 12, or as many requests as arrive inside the gap.
-- The approved thresholds are supposed to be CAPS, so the three steps have to
-- be mutually exclusive against any other request counting the same bucket.
-- This was a real defect in the first version, found by independent review.
--
-- The fix is `pg_advisory_xact_lock`, chosen over locked counter rows because
-- it is the design that is easiest to prove: there is no window state to
-- reset, no row to create on first use, no lost-update case to reason about,
-- and the existing sliding-window COUNT stays exactly as reviewed. The only
-- thing added is mutual exclusion.
--
-- KEY CONSTRUCTION. Two namespaces, each a fixed `classid`, with an `objid`
-- derived from what is being serialized:
--
--   global   (20261014, hashtext(endpoint))
--   network  (20261015, hashtext(endpoint || ':' || hex(bucket_key)))
--
-- The classids are arbitrary but FIXED — they are this checkpoint's date, and
-- their only requirements are stability and that nothing else in this database
-- uses the same pairs. Separate classids mean a global key and a network key
-- can never denote the same lock even if their hashes coincide.
--
-- COLLISION BEHAVIOUR. `hashtext` returns int4, so two different endpoint/
-- bucket combinations can in principle hash alike. The consequence is that two
-- unrelated buckets serialize against each other: slower, never wrong. A
-- collision cannot raise a limit or merge two buckets' counts, because the
-- COUNT predicates still filter on the real `bucket_key` and `endpoint`
-- values — the lock controls concurrency, not which rows are counted.
--
-- LOCK ORDER IS FIXED: global first, then network. Always, on every path,
-- including the no-client-address path (which takes only the global lock).
-- Two transactions therefore can never hold these two locks in opposite
-- order, so this pair cannot deadlock.
--
-- NOR CAN IT DEADLOCK AGAINST THE ROW LOCKS redeem TAKES LATER. Because the
-- global lock is held for the whole transaction, at most ONE transaction per
-- endpoint class is ever past this function at a time. Two redeems therefore
-- can never both hold participation row locks, and a peek takes no row lock at
-- all. Nothing outside the guardian RPCs acquires these advisory locks, so no
-- athlete-side transaction can hold a participation row while waiting on one.
-- There is no cycle to form.
--
-- THE COST, STATED HONESTLY. One transaction per endpoint class at a time,
-- for the duration of that whole transaction — not merely for the limiter.
-- Peek is an index scan plus a join to auth.users; redeem is one small write
-- plus one insert. Both are sub-millisecond, so the ceiling is in the
-- thousands per second per class, against a pilot expectation of tens of
-- guardians in total. Peek and redeem do NOT serialize against each other
-- (different keys), and neither serializes against any other Data API
-- traffic, which never reaches this function. If guardian volume ever
-- approaches that ceiling, the counter-row design becomes the better trade;
-- at pilot scale it would be complexity bought for nothing.
--
-- ══ REJECTED REQUESTS ARE NOT RECORDED ══
--
-- The COUNT and the raise happen BEFORE the INSERT, so a rejected request
-- leaves no row. This is deliberate and has two consequences, both wanted:
-- a caller who stops is no longer limited once the window rolls off (rather
-- than being locked out indefinitely by their own rejected attempts), and a
-- caller who does not stop cannot amplify their own attack into unbounded
-- writes — each rejected call costs one indexed COUNT and no I/O.
--
-- ══ FAIL-CLOSED ORDERING ══
--
-- The only paths out of this function are: a `raise` (request refused), or
-- reaching the INSERT (request allowed and counted). There is no early
-- `return`. An unrecognised endpoint class — unreachable from the dispatcher,
-- which resolves the class from a two-element allowlist — raises rather than
-- falling through to an unlimited path.
create or replace function private.guardian_rate_limit_enforce(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_burst_window interval := '1 minute';
  v_sustained_window interval := '1 hour';
  v_global_window interval := '5 minutes';
  v_burst_limit integer;
  v_sustained_limit integer;
  v_global_limit integer;
  v_ip inet;
  v_key bytea;
  v_observed integer;
begin
  if p_endpoint = 'peek' then
    v_burst_limit := 10;
    v_sustained_limit := 40;
    v_global_limit := 300;
  elsif p_endpoint = 'redeem' then
    v_burst_limit := 5;
    v_sustained_limit := 15;
    v_global_limit := 100;
  else
    -- Unreachable from public.data_api_pre_request, which only ever passes a
    -- value it resolved from its own two-element allowlist. Refusing rather
    -- than returning means a future second caller cannot accidentally obtain
    -- an unlimited path by passing an unknown class.
    raise sqlstate 'PGRST' using
      message = pg_catalog.json_build_object(
        'message', 'Request refused.'
      )::text,
      detail = pg_catalog.json_build_object(
        'status', 429,
        'status_text', 'Too Many Requests'
      )::text;
  end if;

  v_ip := private.guardian_request_ip();

  -- Counts after an advisory wait need a fresh statement snapshot. Refuse
  -- stronger isolation rather than count through a frozen transaction snapshot.
  if pg_catalog.current_setting('transaction_isolation') is distinct from 'read committed' then
    raise sqlstate 'PGRST' using
      message = '{"message":"Request refused."}',
      detail = '{"status":429,"status_text":"Too Many Requests"}';
  end if;

  -- LOCK 1 of 2 — the global lock, always acquired first. From here to commit
  -- this transaction is the only one counting this endpoint class, which is
  -- what turns the COUNT below from an observation into a decision.
  perform pg_catalog.pg_advisory_xact_lock(20261014, pg_catalog.hashtext(p_endpoint));

  -- Sample after waiting: queued requests must not insert backdated counters.
  v_now := pg_catalog.clock_timestamp();

  -- The GLOBAL cap is evaluated for every guardian request, with or without a
  -- usable client address, and is therefore the control that survives both a
  -- spoofed header and absent request metadata.
  select pg_catalog.count(*)
    into v_observed
  from private.guardian_rate_limits r
  where r.endpoint = p_endpoint
    and r.request_at > v_now - v_global_window;

  if v_observed >= v_global_limit then
    raise sqlstate 'PGRST' using
      message = pg_catalog.json_build_object(
        'message', 'Too many requests. Please try again shortly.'
      )::text,
      detail = pg_catalog.json_build_object(
        'status', 429,
        'status_text', 'Too Many Requests'
      )::text;
  end if;

  if v_ip is null then
    -- No usable client address. The per-network buckets are MEANINGLESS here,
    -- so they are skipped rather than evaluated against a shared placeholder
    -- key: a shared bucket would let anyone who can make the header
    -- unparseable fill it and deny every other address-less caller. The
    -- global cap above already applied. The row is still recorded, under a
    -- salted constant key, so it counts toward that global cap.
    --
    -- This path is strictly no more permissive than the spoofing case it
    -- shares a root cause with: a caller who can make the header absent can
    -- equally make it arbitrary, and either way only the global cap binds.
    -- Observing this path in production at all is an acceptance failure
    -- (RUNBOOK § A4), not a steady state.
    v_key := private.guardian_rate_limit_bucket_key('::'::inet);
  else
    v_key := private.guardian_rate_limit_bucket_key(v_ip);

    -- LOCK 2 of 2 — the network lock, always acquired AFTER the global one.
    -- Same fixed order on every path, which is what makes the pair
    -- deadlock-free.
    perform pg_catalog.pg_advisory_xact_lock(
      20261015,
      pg_catalog.hashtext(p_endpoint || ':' || pg_catalog.encode(v_key, 'hex'))
    );

    select pg_catalog.count(*)
      into v_observed
    from private.guardian_rate_limits r
    where r.bucket_key = v_key
      and r.endpoint = p_endpoint
      and r.request_at > v_now - v_burst_window;

    if v_observed >= v_burst_limit then
      raise sqlstate 'PGRST' using
        message = pg_catalog.json_build_object(
          'message', 'Too many requests. Please try again shortly.'
        )::text,
        detail = pg_catalog.json_build_object(
          'status', 429,
          'status_text', 'Too Many Requests'
        )::text;
    end if;

    select pg_catalog.count(*)
      into v_observed
    from private.guardian_rate_limits r
    where r.bucket_key = v_key
      and r.endpoint = p_endpoint
      and r.request_at > v_now - v_sustained_window;

    if v_observed >= v_sustained_limit then
      raise sqlstate 'PGRST' using
        message = pg_catalog.json_build_object(
          'message', 'Too many requests. Please try again shortly.'
        )::text,
        detail = pg_catalog.json_build_object(
          'status', 429,
          'status_text', 'Too Many Requests'
        )::text;
    end if;
  end if;

  insert into private.guardian_rate_limits (bucket_key, endpoint, request_at)
  values (v_key, p_endpoint, v_now);

  -- Opportunistic prune, scoped to THIS bucket key and to rows older than the
  -- longest window plus a margin. It can only ever delete this caller's own
  -- expired counters: both predicates are required, so no row inside any
  -- active window and no row belonging to another bucket is reachable from
  -- here. Keys that never return are not covered — that is what
  -- private.prune_guardian_rate_limits is for.
  delete from private.guardian_rate_limits r
  where r.bucket_key = v_key
    and r.request_at < v_now - interval '2 hours';
end;
$$;

revoke all on function private.guardian_rate_limit_enforce(text) from public;

comment on function private.guardian_rate_limit_enforce(text) is
  'Guardian RPC rate-limit policy and the only writer of private.guardian_rate_limits. '
  'Serializes on transaction-scoped advisory locks — global per endpoint class first, '
  'then per endpoint class and network bucket — so count/compare/insert is atomic and '
  'the approved thresholds are hard caps under concurrency rather than best-effort '
  'observations. Evaluates a global per-endpoint circuit breaker for every call, plus '
  'per-network burst and sustained limits when a client address is derivable. Raises '
  'SQLSTATE PGRST with HTTP 429 to refuse; rejected requests are not recorded. No '
  'early return: every path either refuses or counts.';

-- ────────────────────────────────────────────────────────────────────────
-- private.prune_guardian_rate_limits — global cleanup.
-- ────────────────────────────────────────────────────────────────────────
--
-- Covers what the opportunistic per-key prune cannot: bucket keys that stop
-- appearing (an attacker who moves on, a guardian who finished). Intended for
-- pg_cron, which Supabase's own documentation recommends for exactly this —
-- but pg_cron is NOT enabled by this migration, because whether the extension
-- is available on this project has not been verified and enabling an extension
-- is a founder decision. Registering the schedule is an explicit deployment
-- step (RUNBOOK § A7), and until it is done the per-key prune plus the small
-- row size keep growth bounded in normal operation.
--
-- The retention floor is a guard against the dangerous misconfiguration:
-- pruning inside an active window would silently RESET live rate limits, which
-- looks like nothing at all and quietly removes the protection. Refusing is
-- loud. `interval '1 hour'` is the longest window above; the default of 2
-- hours is that plus a margin, matching the opportunistic prune.
create or replace function private.prune_guardian_rate_limits(
  p_retention interval default interval '2 hours'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  if p_retention is null or p_retention < interval '1 hour' then
    raise exception
      'prune_guardian_rate_limits: retention must be at least the longest rate-limit window (1 hour)';
  end if;

  delete from private.guardian_rate_limits r
  where r.request_at < pg_catalog.clock_timestamp() - p_retention;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.prune_guardian_rate_limits(interval) from public;

comment on function private.prune_guardian_rate_limits(interval) is
  'Deletes guardian rate-limit counters older than p_retention (default 2 hours). '
  'Refuses a retention shorter than the longest active window, because pruning inside '
  'a window would silently reset live limits. Touches no table other than '
  'private.guardian_rate_limits.';

-- ────────────────────────────────────────────────────────────────────────
-- Percent-encoding: why the dispatcher cannot compare raw path segments.
-- ────────────────────────────────────────────────────────────────────────
--
-- ══ THE BYPASS, AND WHERE IT COMES FROM ══
--
-- PostgREST routes on the DECODED path and exposes the RAW one. Both halves
-- are in its source, and this is not an inference:
--
--   src/library/PostgREST/ApiRequest.hs
--     resource <- getResource conf $ pathInfo req     -- routing: DECODED
--     vPath = rawPathInfo req                         -- the value exposed: RAW
--   src/library/PostgREST/Query/PreQuery.hs
--     pathSql = setConfigWithConstantName ("request.path", vPath)
--
-- In WAI, `rawPathInfo` is the untouched percent-encoded byte string, while
-- `pathInfo` is percent-decoded and split into segments. So
--
--     POST /rpc/%70eek_guardian_request
--
-- routes to `peek_guardian_request` — `%70` is `p` — while `request.path`
-- reads `/rpc/%70eek_guardian_request`. A matcher that compares RAW segments
-- to `peek_guardian_request` sees no match, returns, and the guardian RPC runs
-- with no limiter at all. The same trick works on any character of either
-- segment: `/%72pc/peek_guardian_request` (`%72` = `r`) and
-- `/rpc/peek%5Fguardian_request` (`%5F` = `_`) are the same bypass.
--
-- This was a real hole in the first version of this migration, found by
-- independent review. It is fixed by deciding the scope on the DECODED
-- segments, which is what PostgREST routes on.
--
-- ══ WHY AN IN-DATABASE DECODER CAN BE TRUSTED HERE ══
--
-- Equivalence is claimed only for the one question the dispatcher asks: "does
-- this decoded segment equal one of three fixed ASCII strings?" — `rpc`,
-- `peek_guardian_request`, `redeem_guardian_request`. For that question the
-- decoder below is exactly equivalent to WAI's, and the reasoning is bounded:
--
--   * `decodePathSegments` splits on `/` and applies `urlDecode False` to each
--     segment. `False` means `+` is NOT turned into a space — a path rule, not
--     a query-string one — so `+` is a literal here and the decoder below
--     leaves it alone.
--   * `urlDecode` replaces `%XX` with that byte when both characters are hex,
--     accepting `0-9`, `A-F` AND `a-f`. The decoder below uses the same
--     case-insensitive class, so `%5f` and `%5F` behave identically.
--   * A single pass, never repeated. `%2570eek…` therefore decodes to the
--     literal `%70eek…`, which is not a function name, in BOTH
--     implementations — so there is no double-decoding gap to exploit. The
--     decoder below likewise decodes once and never re-scans its own output.
--   * Any decoded byte >= 0x80 means the segment contains a non-ASCII
--     character (or U+FFFD, since WAI decodes UTF-8 leniently). Either way it
--     cannot equal an ASCII target name, so the decoder reports "no match"
--     rather than trying to reproduce UTF-8 handling it does not need. A
--     decoded NUL (`%00`) is treated the same way, and PostgreSQL could not
--     hold it in a `text` value regardless.
--
-- ══ WHERE IT STOPS PRETENDING: MALFORMED ESCAPES ══
--
-- `urlDecode`'s behaviour on an invalid escape is to emit the literal `%` and
-- advance one byte, so `%ZZ` stays `%ZZ` and a trailing `%` stays `%`. That is
-- verifiable in its source too — but the value in `request.path` is what the
-- GATEWAY forwarded, and Kong and Cloudflare sit in front of PostgREST. What
-- either does to a malformed escape before PostgREST ever sees it is NOT
-- something this repository can establish.
--
-- So malformed escapes are not decoded on a guess. If either routing-relevant
-- segment contains a `%` that is not a valid `%XX` escape, the request is
-- REFUSED (400) rather than resolved. That is fail-closed, and it costs
-- nothing real: PostgREST would answer 404 for such a path anyway, and no
-- legitimate client sends one — supabase-js builds `/rpc/<name>` literally.
--
-- The refusal is also scoped so it cannot become broad blocking. The segment
-- BEFORE the last is checked first, and if it cleanly decodes to anything
-- other than `rpc` the dispatcher returns immediately — so `/athlete%profiles`
-- (malformed, but not an RPC path) is not refused, it is simply ignored, and
-- `/rpc/get%5Fpublished_profile_by_slug` decodes, turns out not to be a
-- guardian RPC, and is ignored too.
--
-- Deployed gateway behaviour remains a LIVE ACCEPTANCE ITEM —
-- docs/ai/RUNBOOK-phase2-acceptance.md § A3 — because none of the above tells
-- us what Kong actually forwards.

create or replace function private.guardian_path_segment_malformed(p_segment text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_index integer := 1;
  v_length integer := pg_catalog.length(p_segment);
begin
  while v_index <= v_length loop
    if pg_catalog.substr(p_segment, v_index, 1) = '%' then
      -- A `%` needs two hex characters after it. Fewer (a trailing `%`, or
      -- `%A` at the end) or non-hex means this repository cannot say what the
      -- gateway forwarded, and the caller refuses rather than guessing.
      if v_index + 2 > v_length
         or pg_catalog.substr(p_segment, v_index + 1, 2) !~ '^[0-9A-Fa-f]{2}$' then
        return true;
      end if;
      v_index := v_index + 3;
    else
      v_index := v_index + 1;
    end if;
  end loop;
  return false;
end;
$$;

revoke all on function private.guardian_path_segment_malformed(text) from public;

comment on function private.guardian_path_segment_malformed(text) is
  'True when the segment contains a `%` that is not a valid two-hex-digit escape. Such '
  'a segment is refused rather than decoded, because what the gateway forwards for a '
  'malformed escape is not established by this repository.';

create or replace function private.guardian_decode_path_segment(p_segment text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_index integer := 1;
  v_length integer := pg_catalog.length(p_segment);
  v_decoded text := '';
  v_byte integer;
begin
  while v_index <= v_length loop
    if pg_catalog.substr(p_segment, v_index, 1) = '%' then
      -- Callers reject malformed segments first; this is the defensive repeat,
      -- so this function is safe to call on anything.
      if v_index + 2 > v_length
         or pg_catalog.substr(p_segment, v_index + 1, 2) !~ '^[0-9A-Fa-f]{2}$' then
        return null;
      end if;

      v_byte := ('x' || pg_catalog.substr(p_segment, v_index + 1, 2))::bit(8)::integer;

      -- A decoded NUL or any byte outside 7-bit ASCII cannot be part of
      -- `rpc`, `peek_guardian_request` or `redeem_guardian_request`, so there
      -- is no need to reproduce WAI's UTF-8 handling: NULL here means "this
      -- segment is definitely not one of the target names", which is exactly
      -- what the caller does with it.
      if v_byte = 0 or v_byte >= 128 then
        return null;
      end if;

      v_decoded := v_decoded || pg_catalog.chr(v_byte);
      v_index := v_index + 3;
    else
      -- Single pass: a `%` produced BY decoding is never re-examined, which is
      -- what makes `%2570eek…` resolve to the literal `%70eek…` here exactly
      -- as it does in PostgREST.
      v_decoded := v_decoded || pg_catalog.substr(p_segment, v_index, 1);
      v_index := v_index + 1;
    end if;
  end loop;
  return v_decoded;
end;
$$;

revoke all on function private.guardian_decode_path_segment(text) from public;

comment on function private.guardian_decode_path_segment(text) is
  'Single-pass percent-decode of one path segment, equivalent to WAI''s '
  '`urlDecode False` for the question "does this equal a fixed ASCII string": '
  'case-insensitive hex, no `+` handling, no re-scanning of decoded output. Returns '
  'NULL when the segment decodes to a NUL or any non-ASCII byte, i.e. when it cannot '
  'be one of the three target names.';

-- ────────────────────────────────────────────────────────────────────────
-- public.data_api_pre_request — the global hook, and the path scope.
-- ────────────────────────────────────────────────────────────────────────
--
-- ══ WHY THIS FUNCTION IS NAMED FOR THE HOOK, NOT FOR THE GUARDIAN ══
--
-- `pgrst.db_pre_request` is a SINGLE function slot per role. A guardian-named
-- function in that slot invites the next requirement to either replace it or
-- quietly bolt unrelated logic into a guardian file. This is the dispatcher;
-- guardian policy lives in `private.guardian_rate_limit_enforce`, and a future
-- second concern becomes another `private.` call added here, under review.
--
-- ══ WHY IT IS IN `public`, AND WHY ITS GRANT IS ENUMERATED ══
--
-- PostgREST calls `db_pre_request` AFTER it has switched into the request's
-- effective role, so the role that needs EXECUTE is the Data API role, not
-- `authenticator`. Today that is exactly three roles: `anon` (the publishable
-- key's role, and PostgREST's `db-anon-role` on Supabase), `authenticated`,
-- and `service_role`. Those three are granted EXECUTE explicitly, and PUBLIC
-- is revoked.
--
-- FOUNDER DECISION A1 settled this against the alternative of granting PUBLIC.
-- PUBLIC would have removed one operational failure mode — a role added later
-- cannot make a Data API call until someone grants it EXECUTE — at the cost of
-- implicitly admitting every future role to this function. Least privilege
-- wins: a new custom Data API role SHOULD require a deliberate, reviewed
-- grant, and trading project-wide future-role exposure for the convenience of
-- skipping a configuration step is the wrong trade. The consequence is
-- accepted knowingly and is written down where an operator will meet it:
-- RUNBOOK § A1 and § A9 both say that adding a Data API role means adding a
-- grant in the same migration.
--
-- IF A DEPLOYED PROJECT PROVES SOME OTHER ROLE NEEDS EXECUTE — a role this
-- file does not know about, reaching the Data API and erroring on every
-- request — the answer is to STOP AND REPORT, and then add that role by name
-- in a reviewed forward migration. It is NOT to broaden this to PUBLIC. The
-- acceptance harness asserts the effective grantee set exactly, so a surprise
-- here is a named failure rather than a mystery (RUNBOOK § A1).
--
-- `public` rather than `private` for the schema, because `public` already has
-- USAGE granted to these roles; putting the dispatcher in `private` would mean
-- granting schema USAGE as well, which is a second grant on a schema whose
-- whole purpose is that nothing outside it can reach in.
--
-- Being callable at all is safe because the function is inert off the guardian
-- path and carries no caller-supplied input whatsoever. Its only inputs are
-- PostgREST's own transaction-scoped GUCs, which a caller cannot set. Invoked
-- directly as `/rpc/data_api_pre_request`, its own path fails the endpoint
-- allowlist below and it returns having done nothing — it cannot be used to
-- write a limiter row, to read one, or to reach anything in `private`. It
-- touches no athlete data, no profile, and no storage object.
--
-- ══ THE PATH SCOPE, EXACTLY ══
--
-- The hook fires for all Data API traffic, so the scope test must be both
-- precise and cheap. It is: split the path on '/', PERCENT-DECODE the last two
-- segments, require the decoded LAST segment to equal one of exactly two
-- function names by string equality, and require the decoded segment BEFORE it
-- to equal 'rpc'.
--
-- DECODED, not raw — see the percent-encoding section above this function for
-- why that is not optional: PostgREST routes on the decoded path but exposes
-- the raw one, so a raw comparison is bypassed outright by
-- `/rpc/%70eek_guardian_request`. Decoding is skipped entirely when the path
-- contains no `%`, which is every real request, so the fast path is unchanged.
--
-- Suffix matching rather than a whole-path comparison, because the exact
-- prefix PostgREST reports is not something this repository can prove: Kong
-- routes /rest/v1/... to PostgREST, and whether `request.path` arrives as
-- `/rpc/peek_guardian_request`, `rpc/peek_guardian_request`, or
-- `/rest/v1/rpc/peek_guardian_request` depends on gateway configuration. All
-- three resolve identically here. The exact observed value is pinned by live
-- acceptance (RUNBOOK § A3) — and that step matters, because the failure mode
-- of a prefix surprise would be a limiter that never engages.
--
-- `string_to_array` plus two equality tests, NOT `like`: every one of these
-- function names contains underscores, and `_` is a single-character wildcard
-- in `like`. `path like '%/rpc/peek_guardian_request'` would also match
-- `/rpc/peekXguardianXrequest`. There is no dynamic SQL anywhere in this
-- migration, and the only regular expressions are the two-hex-digit class in
-- the decoder helpers — never a pattern match against a path or a name.
--
-- ══ METHOD HANDLING, AND THE VOLATILITY PREREQUISITE ══
--
-- The limiter INSERTs, so it can only work inside a READ/WRITE transaction.
-- PostgREST decides read-only versus read/write from the called function's
-- VOLATILITY, not from the HTTP method:
--
--   * GET and HEAD always run read-only (they may be served from a read
--     replica);
--   * a POST to a STABLE or IMMUTABLE function ALSO runs read-only;
--   * only a POST to a VOLATILE function runs read/write.
--
-- That middle line is the one that matters, and it is a prerequisite rather
-- than a nicety. `peek_guardian_request` was declared STABLE by
-- 20261013000001, so with that declaration in force even a LEGITIMATE POST
-- peek would execute in a read-only transaction and the INSERT below would
-- raise `25006` — breaking every peek instead of limiting it.
--
-- 20261014000002 fixes that with one `alter function ... volatile`, and it
-- MUST be applied before the hook is armed. See RUNBOOK § A6 for the founder
-- decision and § MIGRATION ORDER for why arming is strictly last. Both
-- guardian RPCs are VOLATILE in the deployed catalog; peek's body is still
-- read-only, which is a property of the SQL, not of the volatility marker.
--
-- Given that, PostgREST itself refuses GET and HEAD on both guardian RPCs —
-- a volatile function is not GET-able — so the unlimited-GET route is closed
-- at the routing layer, before any transaction opens.
--
-- The method gate below is kept anyway, as DEFENCE IN DEPTH, and is
-- deliberately not relied upon alone:
--
--   * if the volatility migration is ever reverted, or a future
--     `create or replace` restates peek as STABLE, PostgREST would start
--     serving GET again — and this gate refuses it with 405 rather than
--     silently admitting an unlimitable call;
--   * a refusal needs no write, so it still works in a read-only
--     transaction, which is exactly the case it has to survive;
--   * it refuses a guardian path with NO method metadata, which is the one
--     place this file chooses refusal over admission.
--
-- The application only ever issues POST: supabase-js `.rpc()` posts unless
-- explicitly asked for GET, and src/lib/guardian/guardian-repository.ts never
-- asks.
--
-- OPTIONS returns early WITHOUT refusing. A browser CORS preflight for these
-- RPCs is an OPTIONS request — supabase-js sends `Content-Type` and `apikey`,
-- which makes the request non-simple — and refusing it would break the
-- guardian page outright rather than rate-limit it. Whether PostgREST even
-- runs this hook for OPTIONS is not documented clearly enough to rely on
-- either way, so the early return makes both possibilities safe. No function
-- executes on an OPTIONS request, so there is nothing to limit.
--
-- A NULL method on a guardian path is refused, not allowed: that is metadata
-- this function needs and does not have, and the guardian path is the one
-- place where this file chooses refusal over admission.
create or replace function public.data_api_pre_request()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_segments text[];
  v_count integer;
  v_resource text;
  v_container text;
  v_endpoint text;
  v_method text;
begin
  -- ── Scope resolution. Everything above the guardian branch below is pure
  -- in-memory work on two GUCs: no table is read, no function in `private` is
  -- called, nothing is written. A non-guardian Data API request — every
  -- profile read, every media write, every unrelated RPC, the OpenAPI root —
  -- leaves through one of the `return`s below having performed zero I/O.
  v_path := pg_catalog.current_setting('request.path', true);

  if v_path is null then
    return;
  end if;

  -- `request.path` carries the path only; the query string is a separate
  -- value (`rawQueryString`), so `?p_token=…` can never affect this decision.
  v_segments := pg_catalog.string_to_array(v_path, '/');
  v_count := pg_catalog.array_length(v_segments, 1);

  if v_count is null or v_count < 2 then
    return;
  end if;

  -- ── Percent-decoding, only when there is something to decode.
  --
  -- With no `%` anywhere in the path, raw and decoded are identical by
  -- definition, so the overwhelmingly common case — every real request —
  -- takes the same two string comparisons it always did, plus one `strpos`.
  -- The decoder is reached only by a path that actually contains a `%`.
  if pg_catalog.strpos(v_path, '%') = 0 then
    v_container := v_segments[v_count - 1];
    v_resource := v_segments[v_count];
  else
    -- The segment BEFORE the last decides whether this is an RPC call at all,
    -- so it is resolved FIRST. That ordering is what keeps a malformed escape
    -- elsewhere in the path from being refused: `/athlete%profiles` has an
    -- empty container segment, cleanly decoded, which is not `rpc`, so the
    -- dispatcher returns below without ever inspecting the malformed one.
    if private.guardian_path_segment_malformed(v_segments[v_count - 1]) then
      raise sqlstate 'PGRST' using
        message = pg_catalog.json_build_object(
          'message', 'Malformed percent-encoding in the request path.'
        )::text,
        detail = pg_catalog.json_build_object(
          'status', 400,
          'status_text', 'Bad Request'
        )::text;
    end if;

    v_container := private.guardian_decode_path_segment(v_segments[v_count - 1]);

    -- Only once the container segment is known to be `rpc` is the target
    -- segment's encoding this function's business. A malformed escape there
    -- means the targeted function cannot be determined, and an undetermined
    -- target under `rpc` could be a guardian RPC — so it is refused.
    if v_container = 'rpc'
       and private.guardian_path_segment_malformed(v_segments[v_count]) then
      raise sqlstate 'PGRST' using
        message = pg_catalog.json_build_object(
          'message', 'Malformed percent-encoding in the request path.'
        )::text,
        detail = pg_catalog.json_build_object(
          'status', 400,
          'status_text', 'Bad Request'
        )::text;
    end if;

    v_resource := private.guardian_decode_path_segment(v_segments[v_count]);
  end if;

  if v_container is distinct from 'rpc' then
    return;
  end if;

  v_endpoint := case v_resource
    when 'peek_guardian_request' then 'peek'
    when 'redeem_guardian_request' then 'redeem'
    else null
  end;

  if v_endpoint is null then
    return;
  end if;

  -- ── From here the request IS one of the two guardian RPCs.
  v_method := pg_catalog.current_setting('request.method', true);

  if v_method = 'OPTIONS' then
    return;
  end if;

  if v_method is distinct from 'POST' then
    raise sqlstate 'PGRST' using
      message = pg_catalog.json_build_object(
        'message', 'This endpoint accepts POST only.'
      )::text,
      detail = pg_catalog.json_build_object(
        'status', 405,
        'status_text', 'Method Not Allowed'
      )::text;
  end if;

  perform private.guardian_rate_limit_enforce(v_endpoint);
end;
$$;

-- FOUNDER DECISION A1: enumerated, not PUBLIC. See the "WHY ITS GRANT IS
-- ENUMERATED" note above.
--
-- `revoke` first, and not as a formality: PostgreSQL's own default for a newly
-- created function is EXECUTE to PUBLIC, and `create or replace function` does
-- not reset an existing ACL. Revoking explicitly is what makes the result
-- deterministic whether this function is brand new or is replacing an earlier
-- draft that had been granted more widely.
--
-- These three are the roles PostgREST switches into on this project today. A
-- fourth Data API role needs its own reviewed grant in its own migration —
-- never a widening back to PUBLIC.
revoke all on function public.data_api_pre_request() from public;
grant execute on function public.data_api_pre_request() to anon, authenticated, service_role;

comment on function public.data_api_pre_request() is
  'PostgREST db-pre-request dispatcher. Percent-decodes the two routing-relevant path '
  'segments — PostgREST routes on the decoded path but exposes the raw one, so a raw '
  'comparison is bypassable — and resolves them against a two-element allowlist '
  '(rpc/peek_guardian_request, rpc/redeem_guardian_request), refusing 400 when a '
  'malformed escape leaves the targeted function undetermined. Returns '
  'immediately, with zero I/O and no decoding, for every other Data API request. On a guardian '
  'path it allows OPTIONS, refuses any method other than POST as defence in depth '
  '(PostgREST already refuses GET/HEAD on a volatile function — see 20261014000002), '
  'and otherwise delegates to '
  'private.guardian_rate_limit_enforce. Takes no caller-supplied argument; its only '
  'inputs are PostgREST transaction-scoped GUCs. Registered by '
  '20261014000003_arm_guardian_rate_limit_pre_request.sql, not by this migration.';

-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ══════════════════════════════════════════════════════════════════════════
--
-- It does not register the pre-request function — that is 20261014000003, so
-- that arming and disarming are a one-statement diff.
--
-- It does not change either guardian RPC's volatility. Peek must become
-- VOLATILE before the hook is armed, or a legitimate POST peek runs read-only
-- and the limiter's INSERT raises 25006 — but that is a change to a function
-- 20261013000001 owns, so it belongs in its own forward migration
-- (20261014000002), not buried in this one.
--
-- It grants nothing on schema `private` to `anon`, `authenticated`,
-- `service_role`, `authenticator`, or PUBLIC, and nothing at all on either
-- private table to any role. No role but the owner can read a limiter row.
-- `anon`, `authenticated` and `service_role` hold EXECUTE on exactly one
-- object here — `public.data_api_pre_request()` — and on nothing else.
--
-- It does not touch athlete_profiles, athlete_participation,
-- participation_events, storage.objects, or any policy, grant, or function
-- belonging to Phase 1a, Phase 1b, or Phase 2. It does not read or write
-- token_hash. It does not alter the body, owner, grants, search_path or
-- semantics of either guardian RPC — the byte-pinned 20261013000001 is
-- unmodified.
--
-- It creates no extension, no role, and no scheduled job. It adds no
-- service_role surface and no admin API.
--
-- It is not an authorization boundary. See WHAT THIS LIMITER IS above.
