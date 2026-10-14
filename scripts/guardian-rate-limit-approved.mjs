/**
 * GENERATED BASELINE — the complete approved executable shape of
 * supabase/migrations/20261014000001_guardian_rate_limit_infrastructure.sql.
 *
 * Read by scripts/guardian-rate-limit-contract.mjs. It lives in its own file
 * for one reason: these are long, mechanically-derived token strings, and
 * mixing them into the contract's reasoning would make neither readable.
 *
 * ── WHAT IT IS ──────────────────────────────────────────────────────────────
 *
 * APPROVED_STATEMENTS — every top-level statement, as its exact token
 *   sequence, with dollar-quoted body content collapsed to `<body>` and
 *   `comment on` string literals masked to `<str>`.
 *
 * APPROVED_BODIES — the exact token sequence INSIDE each function body.
 *
 * Together these cover the migration token-for-token, executable content
 * included. That completeness is the point. An earlier version of the contract
 * checked token SUBSEQUENCES, and an independent review broke it with three
 * mutations that each left every required subsequence intact:
 *
 *   1. `if v_observed >= v_global_limit and false then`
 *   2. `and false` appended to the global COUNT predicate
 *   3. all three limit variables reassigned to 999999 before enforcement
 *
 * None of those removes anything the old checker looked for, so none of them
 * was caught. A complete token comparison has no such gap: any added,
 * removed, reordered or substituted token fails, whatever it is and wherever
 * it appears.
 *
 * ── REGENERATING ────────────────────────────────────────────────────────────
 *
 * Mechanical, and that is the hazard: regenerating makes any mutation pass by
 * definition, because the mutation becomes the baseline. Regenerate ONLY as
 * part of deliberately re-reviewing the SQL, in the same commit as the SQL
 * change and the digest update in scripts/sql-contract.mjs, so a reviewer sees
 * all three together. If you are here because the contract failed, the
 * question is "has this migration been re-reviewed?", not "how do I make the
 * check pass".
 */
export const APPROVED_STATEMENTS = [
  "create schema if not exists private",
  "revoke all on schema private from public",
  "comment on schema private is <str> <str> <str>",
  "create table if not exists private . guardian_rate_limit_salt ( id boolean primary key default true , salt bytea not null , created_at timestamptz not null default now ( ) , constraint guardian_rate_limit_salt_single_row check ( id ) , constraint guardian_rate_limit_salt_length check ( pg_catalog . length ( salt ) = 32 ) )",
  "alter table private . guardian_rate_limit_salt enable row level security",
  "insert into private . guardian_rate_limit_salt ( id , salt ) values ( true , pg_catalog . sha256 ( pg_catalog . convert_to ( pg_catalog . gen_random_uuid ( ) :: text || pg_catalog . gen_random_uuid ( ) :: text , 'UTF8' ) ) ) on conflict ( id ) do nothing",
  "comment on table private . guardian_rate_limit_salt is <str> <str> <str>",
  "create table if not exists private . guardian_rate_limits ( bucket_key bytea not null , endpoint text not null , request_at timestamptz not null , constraint guardian_rate_limits_endpoint_check check ( endpoint in ( 'peek' , 'redeem' ) ) , constraint guardian_rate_limits_bucket_key_length check ( pg_catalog . length ( bucket_key ) = 32 ) )",
  "alter table private . guardian_rate_limits enable row level security",
  "create index if not exists guardian_rate_limits_bucket_endpoint_at_idx on private . guardian_rate_limits ( bucket_key , endpoint , request_at desc )",
  "create index if not exists guardian_rate_limits_endpoint_at_idx on private . guardian_rate_limits ( endpoint , request_at desc )",
  "comment on table private . guardian_rate_limits is <str> <str> <str> <str>",
  "create or replace function private . guardian_rate_limit_bucket_key ( p_ip inet ) returns bytea language sql security definer stable set search_path = '' as $$ <body> $$",
  "revoke all on function private . guardian_rate_limit_bucket_key ( inet ) from public",
  "comment on function private . guardian_rate_limit_bucket_key ( inet ) is <str> <str> <str>",
  "create or replace function private . guardian_request_ip ( ) returns inet language plpgsql security definer stable set search_path = '' as $$ <body> $$",
  "revoke all on function private . guardian_request_ip ( ) from public",
  "comment on function private . guardian_request_ip ( ) is <str> <str> <str> <str>",
  "create or replace function private . guardian_rate_limit_enforce ( p_endpoint text ) returns void language plpgsql security definer set search_path = '' as $$ <body> $$",
  "revoke all on function private . guardian_rate_limit_enforce ( text ) from public",
  "comment on function private . guardian_rate_limit_enforce ( text ) is <str> <str> <str> <str> <str> <str> <str> <str>",
  "create or replace function private . prune_guardian_rate_limits ( p_retention interval default interval '2 hours' ) returns bigint language plpgsql security definer set search_path = '' as $$ <body> $$",
  "revoke all on function private . prune_guardian_rate_limits ( interval ) from public",
  "comment on function private . prune_guardian_rate_limits ( interval ) is <str> <str> <str> <str>",
  "create or replace function private . guardian_path_segment_malformed ( p_segment text ) returns boolean language plpgsql immutable set search_path = '' as $$ <body> $$",
  "revoke all on function private . guardian_path_segment_malformed ( text ) from public",
  "comment on function private . guardian_path_segment_malformed ( text ) is <str> <str> <str>",
  "create or replace function private . guardian_decode_path_segment ( p_segment text ) returns text language plpgsql immutable set search_path = '' as $$ <body> $$",
  "revoke all on function private . guardian_decode_path_segment ( text ) from public",
  "comment on function private . guardian_decode_path_segment ( text ) is <str> <str> <str> <str> <str>",
  "create or replace function public . data_api_pre_request ( ) returns void language plpgsql security definer set search_path = '' as $$ <body> $$",
  "revoke all on function public . data_api_pre_request ( ) from public",
  "grant execute on function public . data_api_pre_request ( ) to anon , authenticated , service_role",
  "comment on function public . data_api_pre_request ( ) is <str> <str> <str> <str> <str> <str> <str> <str> <str> <str> <str> <str>",
];

export const APPROVED_BODIES = {
  "private.guardian_rate_limit_bucket_key":
    "select pg_catalog . sha256 ( s . salt || pg_catalog . convert_to ( pg_catalog . host ( pg_catalog . network ( pg_catalog . set_masklen ( p_ip , case when pg_catalog . family ( p_ip ) = 4 then 24 else 56 end ) ) ) , 'UTF8' ) ) from private . guardian_rate_limit_salt s where s . id ;",
  "private.guardian_request_ip":
    "declare v_headers json ; v_candidate text ; begin begin v_headers := pg_catalog . current_setting ( 'request.headers' , true ) :: json ; exception when invalid_text_representation then return null ; end ; if v_headers is null then return null ; end if ; v_candidate := pg_catalog . btrim ( coalesce ( v_headers - > > 'cf-connecting-ip' , '' ) ) ; if v_candidate = '' then v_candidate := pg_catalog . btrim ( coalesce ( v_headers - > > 'x-real-ip' , '' ) ) ; end if ; if v_candidate = '' then v_candidate := pg_catalog . btrim ( pg_catalog . split_part ( coalesce ( v_headers - > > 'x-forwarded-for' , '' ) , ',' , 1 ) ) ; end if ; if v_candidate = '' then return null ; end if ; begin return v_candidate :: inet ; exception when invalid_text_representation then return null ; end ; end ;",
  "private.guardian_rate_limit_enforce":
    "declare v_now timestamptz ; v_burst_window interval := '1 minute' ; v_sustained_window interval := '1 hour' ; v_global_window interval := '5 minutes' ; v_burst_limit integer ; v_sustained_limit integer ; v_global_limit integer ; v_ip inet ; v_key bytea ; v_observed integer ; begin if p_endpoint = 'peek' then v_burst_limit := 10 ; v_sustained_limit := 40 ; v_global_limit := 300 ; elsif p_endpoint = 'redeem' then v_burst_limit := 5 ; v_sustained_limit := 15 ; v_global_limit := 100 ; else raise sqlstate 'PGRST' using message = pg_catalog . json_build_object ( 'message' , 'Request refused.' ) :: text , detail = pg_catalog . json_build_object ( 'status' , 429 , 'status_text' , 'Too Many Requests' ) :: text ; end if ; v_ip := private . guardian_request_ip ( ) ; if pg_catalog . current_setting ( 'transaction_isolation' ) is distinct from 'read committed' then raise sqlstate 'PGRST' using message = '{\"message\":\"Request refused.\"}' , detail = '{\"status\":429,\"status_text\":\"Too Many Requests\"}' ; end if ; perform pg_catalog . pg_advisory_xact_lock ( 20261014 , pg_catalog . hashtext ( p_endpoint ) ) ; v_now := pg_catalog . clock_timestamp ( ) ; select pg_catalog . count ( * ) into v_observed from private . guardian_rate_limits r where r . endpoint = p_endpoint and r . request_at > v_now - v_global_window ; if v_observed >= v_global_limit then raise sqlstate 'PGRST' using message = pg_catalog . json_build_object ( 'message' , 'Too many requests. Please try again shortly.' ) :: text , detail = pg_catalog . json_build_object ( 'status' , 429 , 'status_text' , 'Too Many Requests' ) :: text ; end if ; if v_ip is null then v_key := private . guardian_rate_limit_bucket_key ( '::' :: inet ) ; else v_key := private . guardian_rate_limit_bucket_key ( v_ip ) ; perform pg_catalog . pg_advisory_xact_lock ( 20261015 , pg_catalog . hashtext ( p_endpoint || ':' || pg_catalog . encode ( v_key , 'hex' ) ) ) ; select pg_catalog . count ( * ) into v_observed from private . guardian_rate_limits r where r . bucket_key = v_key and r . endpoint = p_endpoint and r . request_at > v_now - v_burst_window ; if v_observed >= v_burst_limit then raise sqlstate 'PGRST' using message = pg_catalog . json_build_object ( 'message' , 'Too many requests. Please try again shortly.' ) :: text , detail = pg_catalog . json_build_object ( 'status' , 429 , 'status_text' , 'Too Many Requests' ) :: text ; end if ; select pg_catalog . count ( * ) into v_observed from private . guardian_rate_limits r where r . bucket_key = v_key and r . endpoint = p_endpoint and r . request_at > v_now - v_sustained_window ; if v_observed >= v_sustained_limit then raise sqlstate 'PGRST' using message = pg_catalog . json_build_object ( 'message' , 'Too many requests. Please try again shortly.' ) :: text , detail = pg_catalog . json_build_object ( 'status' , 429 , 'status_text' , 'Too Many Requests' ) :: text ; end if ; end if ; insert into private . guardian_rate_limits ( bucket_key , endpoint , request_at ) values ( v_key , p_endpoint , v_now ) ; delete from private . guardian_rate_limits r where r . bucket_key = v_key and r . request_at < v_now - interval '2 hours' ; end ;",
  "private.prune_guardian_rate_limits":
    "declare v_deleted bigint ; begin if p_retention is null or p_retention < interval '1 hour' then raise exception 'prune_guardian_rate_limits: retention must be at least the longest rate-limit window (1 hour)' ; end if ; delete from private . guardian_rate_limits r where r . request_at < pg_catalog . clock_timestamp ( ) - p_retention ; get diagnostics v_deleted = row_count ; return v_deleted ; end ;",
  "private.guardian_path_segment_malformed":
    "declare v_index integer := 1 ; v_length integer := pg_catalog . length ( p_segment ) ; begin while v_index <= v_length loop if pg_catalog . substr ( p_segment , v_index , 1 ) = '%' then if v_index + 2 > v_length or pg_catalog . substr ( p_segment , v_index + 1 , 2 ) !~ '^[0-9A-Fa-f]{2}$' then return true ; end if ; v_index := v_index + 3 ; else v_index := v_index + 1 ; end if ; end loop ; return false ; end ;",
  "private.guardian_decode_path_segment":
    "declare v_index integer := 1 ; v_length integer := pg_catalog . length ( p_segment ) ; v_decoded text := '' ; v_byte integer ; begin while v_index <= v_length loop if pg_catalog . substr ( p_segment , v_index , 1 ) = '%' then if v_index + 2 > v_length or pg_catalog . substr ( p_segment , v_index + 1 , 2 ) !~ '^[0-9A-Fa-f]{2}$' then return null ; end if ; v_byte := ( 'x' || pg_catalog . substr ( p_segment , v_index + 1 , 2 ) ) :: bit ( 8 ) :: integer ; if v_byte = 0 or v_byte >= 128 then return null ; end if ; v_decoded := v_decoded || pg_catalog . chr ( v_byte ) ; v_index := v_index + 3 ; else v_decoded := v_decoded || pg_catalog . substr ( p_segment , v_index , 1 ) ; v_index := v_index + 1 ; end if ; end loop ; return v_decoded ; end ;",
  "public.data_api_pre_request":
    "declare v_path text ; v_segments text [ ] ; v_count integer ; v_resource text ; v_container text ; v_endpoint text ; v_method text ; begin v_path := pg_catalog . current_setting ( 'request.path' , true ) ; if v_path is null then return ; end if ; v_segments := pg_catalog . string_to_array ( v_path , '/' ) ; v_count := pg_catalog . array_length ( v_segments , 1 ) ; if v_count is null or v_count < 2 then return ; end if ; if pg_catalog . strpos ( v_path , '%' ) = 0 then v_container := v_segments [ v_count - 1 ] ; v_resource := v_segments [ v_count ] ; else if private . guardian_path_segment_malformed ( v_segments [ v_count - 1 ] ) then raise sqlstate 'PGRST' using message = pg_catalog . json_build_object ( 'message' , 'Malformed percent-encoding in the request path.' ) :: text , detail = pg_catalog . json_build_object ( 'status' , 400 , 'status_text' , 'Bad Request' ) :: text ; end if ; v_container := private . guardian_decode_path_segment ( v_segments [ v_count - 1 ] ) ; if v_container = 'rpc' and private . guardian_path_segment_malformed ( v_segments [ v_count ] ) then raise sqlstate 'PGRST' using message = pg_catalog . json_build_object ( 'message' , 'Malformed percent-encoding in the request path.' ) :: text , detail = pg_catalog . json_build_object ( 'status' , 400 , 'status_text' , 'Bad Request' ) :: text ; end if ; v_resource := private . guardian_decode_path_segment ( v_segments [ v_count ] ) ; end if ; if v_container is distinct from 'rpc' then return ; end if ; v_endpoint := case v_resource when 'peek_guardian_request' then 'peek' when 'redeem_guardian_request' then 'redeem' else null end ; if v_endpoint is null then return ; end if ; v_method := pg_catalog . current_setting ( 'request.method' , true ) ; if v_method = 'OPTIONS' then return ; end if ; if v_method is distinct from 'POST' then raise sqlstate 'PGRST' using message = pg_catalog . json_build_object ( 'message' , 'This endpoint accepts POST only.' ) :: text , detail = pg_catalog . json_build_object ( 'status' , 405 , 'status_text' , 'Method Not Allowed' ) :: text ; end if ; perform private . guardian_rate_limit_enforce ( v_endpoint ) ; end ;",
};
