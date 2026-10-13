-- Guardian-First Participation, Phase 2 — bearer peek + redeem.
--
-- Phase 1a/1b recorded participation state and the retention/publication
-- predicates, but no RPC existed that could ever be reached by a holder of a
-- guardian token — Phase 1a's own boundary test forbade exactly that
-- (src/lib/participation-phase1a-boundaries.test.ts). This migration is that
-- surface, and nothing else: no issuance, no rotation, no delivery, no new
-- role, no guardian_issuer, no Edge Function. A minor's `athlete_participation`
-- row still cannot be CREATED by any code path that exists today — these two
-- functions only ever READ or TRANSITION an already-existing minor/pending row.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE TOKEN CONTRACT — binding for Phase 3 issuance too
-- ══════════════════════════════════════════════════════════════════════════
--
-- A guardian token is a 256-bit (32-byte) random value, transmitted to the
-- browser encoded as CANONICAL, UNPADDED BASE64URL (`[A-Za-z0-9_-]`), which
-- is exactly 43 characters for 32 bytes. This is the value carried in the URL
-- fragment (`/guardian/participation#token=...`) and the exact value both
-- functions below require, byte-for-byte, as their `p_token` argument.
--
-- CANONICAL, not merely shape-matching: 32 bytes = 256 bits = 42 full 6-bit
-- base64 groups (252 bits) plus a 44th group holding only the 4 remaining
-- bits, zero-padded on the low end before encoding. A correct encoder's LAST
-- CHARACTER therefore always comes from a 16-symbol subset of the 64-symbol
-- alphabet — exactly the symbols whose index is a multiple of 4 — never the
-- full alphabet. `GUARDIAN_TOKEN_PATTERN` (mirrored client-side in
-- guardian-token.ts, where its derivation is proven against 2000 random
-- 32-byte samples) enforces that subset on the 43rd character. Accepting the
-- other 48 characters there would accept strings that LOOK like a 32-byte
-- base64url token but are not one any canonical encoder would ever produce —
-- a real contract gap, even though it created no exploitable bypass (the
-- hash is over the literal string, not decoded bytes; see below).
--
-- `token_hash` is `sha256` over the UTF-8 bytes of that 43-character
-- CANONICAL STRING AS TRANSMITTED — not over 32 decoded bytes. This is a
-- deliberate simplicity choice: it needs no base64url-to-standard-base64
-- conversion inside Postgres, it is exactly what a future issuer computes
-- from the same string it generates and sends, and it is exactly what these
-- two functions recompute from what the browser sends back. Precisely
-- BECAUSE the contract hashes the string and not decoded bytes, canonical
-- validation matters doubly here: two different 43-character strings that
-- would decode to the identical 32 bytes under a lenient decoder are, under
-- this contract, two UNRELATED hash inputs — so "canonical-only" is not an
-- optional nicety, it is what keeps "the token" and "its encoding" the same
-- thing. Phase 3's issuance RPC MUST compute `token_hash` the same way
-- (`sha256(convert_to(token, 'UTF8'))` over its own canonical encoding) or
-- every token it issues will fail to redeem.
--
-- Built-in `sha256(bytea) returns bytea` (PostgreSQL 11+) is used directly —
-- no `pgcrypto` extension dependency, nothing to enable project-side.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHY NO SCHEMA CHANGE BEYOND ONE INDEX
-- ══════════════════════════════════════════════════════════════════════════
--
-- Every column either function reads or writes already exists
-- (20261008000001): guardian_email, token_hash, request_generation,
-- requested_at, expires_at, decided_at, guardian_copy_version,
-- request_terms_version, request_privacy_version, status. Phase 2 adds
-- exactly one structural change — a partial unique index on token_hash — and
-- two functions. No new table, no new column, no new grant beyond the two
-- EXECUTE grants below.
--
-- The partial unique index makes "at most one current request" (the peek
-- contract's own requirement) a database-enforced fact rather than an
-- assumption a future issuer could violate by accident: two live minor/
-- pending rows could otherwise share a token_hash (astronomically unlikely
-- with a real 256-bit source of randomness, but "identify AT MOST ONE current
-- request" should not rest on that alone). It is scoped to `where token_hash
-- is not null`, so it imposes no constraint on adult rows or decided minor
-- rows, which always carry a null token_hash.
create unique index athlete_participation_token_hash_unique
  on public.athlete_participation (token_hash)
  where token_hash is not null;

-- ══════════════════════════════════════════════════════════════════════════
-- EXPIRY SEMANTICS — one boundary (>=/<), two time sources, both documented
-- ══════════════════════════════════════════════════════════════════════════
--
-- `participation_status()` (20261008000003) already treats a row as expired
-- when `expires_at < now()`. Both functions below use the EXACT NEGATION of
-- that boundary for "still valid" — `expires_at >= <current time>` — so
-- there is exactly one instant, to the microsecond, and it is unambiguously
-- "not yet expired" everywhere this column is read. The COMPARISON OPERATOR
-- is identical in `peek_guardian_request` and `redeem_guardian_request`; the
-- TIME SOURCE differs deliberately — `peek_guardian_request` uses `now()`
-- (no lock, no wait, nothing to go stale), `redeem_guardian_request` uses
-- `clock_timestamp()` (see that function's own comment for why `now()` is
-- wrong there). No surface in this migration uses a different OPERATOR.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT NEITHER FUNCTION DOES
-- ══════════════════════════════════════════════════════════════════════════
--
-- Neither reads nor writes athlete_profiles or storage.objects. Neither can
-- produce a bracket='minor' row — both require one to already exist.
-- peek_guardian_request performs NO WRITE of any kind: it is `stable`, not
-- `volatile`, and its body contains no INSERT/UPDATE/DELETE. Guardian
-- identity/authority in both functions comes ENTIRELY from possession of the
-- token (`actor_basis = 'guardian_token_possession'`); auth.uid() is never
-- read, which is exactly right for an anonymous caller — this app's guardian
-- browser transport (src/lib/guardian/guardian-supabase-client.ts) never
-- authenticates and always calls as `anon`.

-- ────────────────────────────────────────────────────────────────────────
-- peek_guardian_request — read-only, consumes nothing.
-- ────────────────────────────────────────────────────────────────────────
--
-- Returns the minimal guardian-visible projection for exactly one currently
-- valid minor/pending request, or zero rows for every other case: malformed
-- token, no match, wrong generation/state, deleted owner, or expired. There is
-- deliberately no way to tell these apart from the return shape alone — see
-- the "no token-existence oracle" note below — so the caller (and its UI)
-- must treat "zero rows" as one generic "unavailable" outcome, never as a
-- specific diagnosis.
--
-- The projection excludes owner_user_id, token_hash, request_generation,
-- guardian_email, and every delivery-metadata column, matching the founder's
-- minimal-disclosure decision: no athlete profile data, no masked email, no
-- internal identifiers. Only what the guardian-facing page needs to render
-- the approval screen and pin the exact wording shown.
create or replace function public.peek_guardian_request(p_token text)
returns table (
  requested_at timestamptz,
  expires_at timestamptz,
  guardian_copy_version text,
  request_terms_version text,
  request_privacy_version text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_hash bytea;
begin
  -- Strict, CANONICAL format validation BEFORE any lookup — see the token
  -- contract note above for why the 43rd character is restricted to a
  -- 16-symbol subset rather than the full base64url alphabet. A malformed
  -- or noncanonical token never reaches the index scan below, and — just as
  -- importantly — is refused through the exact same empty-result path as
  -- "no match", so a caller cannot distinguish "badly formed" from "well
  -- formed but wrong" by timing or by response shape alone.
  if p_token is null or length(p_token) <> 43
     or p_token !~ '^[A-Za-z0-9_-]{42}[048AEIMQUYcgkosw]$' then
    return;
  end if;

  v_hash := pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8'));

  return query
  select
    ap.requested_at,
    ap.expires_at,
    ap.guardian_copy_version,
    ap.request_terms_version,
    ap.request_privacy_version
  from public.athlete_participation ap
  inner join auth.users u on u.id = ap.owner_user_id
  where ap.token_hash = v_hash
    and ap.bracket = 'minor'
    and ap.status = 'pending'
    and ap.request_generation >= 1
    and ap.expires_at is not null
    and ap.expires_at >= now()
  limit 1;
end;
$$;

-- Explicit revoke from BOTH `public` (PostgreSQL's own default grant on a
-- newly created function) AND `authenticated` — not relying on revoking
-- `public` alone to exclude `authenticated` by omission. `CREATE OR REPLACE
-- FUNCTION` does not reset an existing function's ACL, so if this migration
-- is ever re-applied over a database where some earlier, unreviewed draft
-- had granted `authenticated` directly, an implicit revoke would silently
-- leave that grant in place; an explicit one removes it unconditionally.
-- `anon` only: the dedicated guardian transport never authenticates, so
-- every real caller of this function is `anon`. `authenticated` is
-- deliberately EXCLUDED — there is no scenario in which a signed-in
-- athlete's own session should be able to call this, and granting it would
-- be an unused, unreviewed surface.
revoke all on function public.peek_guardian_request(text) from public, authenticated;
grant execute on function public.peek_guardian_request(text) to anon;

comment on function public.peek_guardian_request(text) is
  'Bearer-authorized, read-only peek at a minor/pending guardian request. Never '
  'consumes the token, never approves/declines, never writes anything. Returns zero '
  'rows for every non-authorizing case (malformed, no match, wrong state, expired, '
  'deleted owner) through the identical path, by design — no token-existence oracle. '
  'Projection excludes owner_user_id, token_hash, request_generation, guardian_email, '
  'and all delivery metadata. See Guardian-First Participation Phase 2.';

-- ────────────────────────────────────────────────────────────────────────
-- redeem_guardian_request — the one write, atomic and replay-safe.
-- ────────────────────────────────────────────────────────────────────────
--
-- Returns exactly one of 'approved' | 'declined' | 'unavailable'. Every
-- failure mode — malformed token, bad decision value, no match, wrong state,
-- expired, deleted owner, or a lost concurrency race — returns 'unavailable',
-- the same generic outcome peek_guardian_request uses. This is deliberate:
-- an unauthenticated, anonymous surface must never let a caller distinguish
-- "this token never existed" from "this token already decided" from "this
-- token expired one second ago".
create or replace function public.redeem_guardian_request(p_token text, p_decision text)
returns text  -- 'approved' | 'declined' | 'unavailable'
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash bytea;
  v_owner uuid;
  v_generation integer;
  v_guardian_copy_version text;
  v_request_terms_version text;
  v_request_privacy_version text;
  v_expires_at timestamptz;
  v_new_status text;
  v_event_type text;
  v_updated uuid;
begin
  -- Fixed allowlist, checked first and cheaply, before any token handling.
  if p_decision is null or p_decision not in ('approve', 'decline') then
    return 'unavailable';
  end if;

  if p_token is null or length(p_token) <> 43
     or p_token !~ '^[A-Za-z0-9_-]{42}[048AEIMQUYcgkosw]$' then
    return 'unavailable';
  end if;

  v_hash := pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8'));

  -- Lock the one matching row for the rest of this transaction. A concurrent
  -- redeem attempt for the SAME token blocks here until this transaction
  -- commits or rolls back, then re-evaluates this query's WHERE clause
  -- against the now-committed row — so the loser of a race sees the row
  -- either gone (token_hash cleared) or no longer 'pending', and falls
  -- through to the NOT FOUND branch below. This is what makes "concurrent
  -- approve/decline cannot both succeed" a database guarantee rather than a
  -- UI courtesy.
  select
    ap.owner_user_id, ap.request_generation, ap.guardian_copy_version,
    ap.request_terms_version, ap.request_privacy_version, ap.expires_at
  into
    v_owner, v_generation, v_guardian_copy_version,
    v_request_terms_version, v_request_privacy_version, v_expires_at
  from public.athlete_participation ap
  inner join auth.users u on u.id = ap.owner_user_id
  where ap.token_hash = v_hash
    and ap.bracket = 'minor'
    and ap.status = 'pending'
  for update of ap;

  if not found then
    return 'unavailable';
  end if;

  -- Expiry is re-checked at the authorization point using the ACTUAL CURRENT
  -- WALL-CLOCK TIME, taken AFTER the row lock above is acquired — never the
  -- client's clock, and never a value frozen before the lock. This is
  -- `clock_timestamp()`, deliberately NOT `now()`: inside a function body,
  -- `now()` (an alias for `transaction_timestamp()`) is fixed at the START of
  -- the enclosing transaction and does not advance even while this statement
  -- was blocked waiting for `FOR UPDATE` to acquire the lock above. A redeem
  -- that had to wait behind a concurrent transaction on the same row could
  -- therefore evaluate expiry against a timestamp that is now stale by
  -- however long that wait was — potentially authorizing a decision on a
  -- request that has, by real wall-clock time, already expired.
  -- `clock_timestamp()` reads the actual current time at the moment it is
  -- evaluated, after the wait is over, closing that gap. Same boundary as
  -- peek: expired means `expires_at < <current time>`; valid means
  -- `expires_at >= <current time>` — peek has no lock to wait behind, so
  -- `now()` there carries no staleness risk, but the comparison OPERATOR
  -- (`>=` / `<`) is identical in both functions; only the time SOURCE differs
  -- for the reason above.
  if v_expires_at is null or v_expires_at < clock_timestamp() then
    return 'unavailable';
  end if;

  v_new_status := case p_decision when 'approve' then 'approved' else 'declined' end;
  v_event_type := case p_decision when 'approve' then 'guardian_approved' else 'guardian_declined' end;

  -- The WHERE clause here repeats token_hash/status even though the row is
  -- already locked and already verified above — belt-and-braces against this
  -- function ever being refactored to drop the lock, not because the lock is
  -- expected to fail. `token_hash = null` is the terminal clearing: once this
  -- commits, the identical p_token can never match any row again, so decline
  -- is terminal and a sequential replay of an already-decided token always
  -- returns 'unavailable'.
  update public.athlete_participation
  set status = v_new_status,
      token_hash = null,
      decided_at = now(),
      updated_at = now()
  where owner_user_id = v_owner
    and token_hash = v_hash
    and status = 'pending'
  returning owner_user_id into v_updated;

  if v_updated is null then
    return 'unavailable';
  end if;

  -- Exactly one decision event, bound to the generation the request was
  -- actually under, with the EXACT versions this row had pinned at request
  -- time copied into evidence — never re-read as "whatever is current now".
  --
  -- `terms_version`/`privacy_version` on this shared evidence table are
  -- reused across event types for "which Terms/Privacy version this event is
  -- evidence against"; for a guardian decision that is the REQUEST-pinned
  -- `request_terms_version`/`request_privacy_version` read (and row-locked)
  -- above, copied verbatim — never the adult bundle's own
  -- `terms_version`/`privacy_version` columns on athlete_participation,
  -- which do not even apply to a minor row (both are NULL for every
  -- minor-bracket state; see the table's own
  -- `athlete_participation_minor_decided_shape` constraint). This is NOT
  -- optional bookkeeping: it is the only durable record of which exact
  -- wording this guardian actually saw and approved/declined.
  -- `attestation_version` legitimately stays NULL — there is no guardian-
  -- facing equivalent of the adult attestation statement, and no column on
  -- athlete_participation ("request_attestation_version") exists to pin one.
  --
  -- participation_events_decision_unique (20261008000002) independently
  -- forbids a second row for the same (owner_user_id, request_generation)
  -- with event_type in ('guardian_approved','guardian_declined'), so even a
  -- hypothetical double-execution of this function body could not produce two
  -- decision events for one generation — the INSERT itself would fail and the
  -- whole function would roll back, including the UPDATE above.
  insert into public.participation_events (
    owner_user_id, event_type, actor, actor_basis,
    request_generation, guardian_copy_version,
    terms_version, privacy_version, attestation_version
  ) values (
    v_owner, v_event_type, 'guardian_token', 'guardian_token_possession',
    v_generation, v_guardian_copy_version,
    v_request_terms_version, v_request_privacy_version, null
  );

  return v_new_status;
end;
$$;

-- Same explicit-exclusion reasoning as peek_guardian_request above.
revoke all on function public.redeem_guardian_request(text, text) from public, authenticated;
grant execute on function public.redeem_guardian_request(text, text) to anon;

comment on function public.redeem_guardian_request(text, text) is
  'Bearer-authorized, atomic guardian decision (approve|decline). Row-locks the one '
  'matching minor/pending request, re-validates expiry against database time under '
  'that lock, transitions status, clears token_hash (terminal — a consumed or '
  'declined token never matches again), and appends exactly one generation-bound '
  'guardian_approved/guardian_declined event with the request''s PINNED wording '
  'versions. Never touches athlete_profiles or storage.objects, and never changes '
  'publication. Every failure mode — malformed input, no match, wrong state, '
  'expired, deleted owner, lost race — returns the identical ''unavailable'', by '
  'design. See Guardian-First Participation Phase 2.';

-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ══════════════════════════════════════════════════════════════════════════
--
-- No guardian_issuer role. No issuance, rotation, or delivery-recording RPC.
-- No Edge Function, no Resend, no email of any kind. No new column, no new
-- table. No change to initialize_adult_participation, record_acceptance_bundle,
-- participation_status, participation_allows_retention,
-- participation_allows_publication, or unpublish_own_profile. No change to any
-- Phase 1b policy, and no new policy at all — storage.objects and
-- athlete_profiles are untouched by this file. No service_role reference, no
-- RLS disable. No direct SELECT/INSERT/UPDATE/DELETE grant on
-- athlete_participation or participation_events to anon or authenticated —
-- the only access either guardian function has to those tables is as the
-- SECURITY DEFINER function owner, exactly like every other participation
-- function in this project. No rate-limiting table: see the Phase 2 report
-- for the documented, deliberately out-of-scope boundary on anonymous abuse
-- protection for this surface — that gate must be resolved (at the Supabase/
-- API boundary or another layer that protects direct RPC traffic, never a
-- Next-only limiter a direct RPC call would bypass) before this surface is
-- deployed, not before it is committed.
