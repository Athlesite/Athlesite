-- Guardian-First Participation, Phase 1a — RPCs.
--
-- Every function here is SECURITY DEFINER, owned by `postgres` (matching the existing
-- 5D.7 functions' security model — see 20260928000001's own comment for the full
-- reasoning on why SECURITY DEFINER's owner choice IS the security model), with
-- `search_path = ''` pinned and every relation schema-qualified. `revoke all ... from
-- public` is explicit on every one, because PostgreSQL grants EXECUTE on a new
-- function to PUBLIC by default — omitting the revoke would mean `anon` could call a
-- function intended for `authenticated` only.
--
-- NOTHING in this migration references participation_allows_retention() or
-- participation_allows_publication() from any RLS or Storage policy. They are
-- defined so Phase 1b's policy migration needs no further grant changes, and granted
-- to `authenticated` because RLS policy expressions evaluate with the CALLING role's
-- privileges, not the policy author's — but no policy exists yet that calls them.
--
-- NO FUNCTION HERE CAN PRODUCE bracket='minor'. initialize_adult_participation's
-- single INSERT branch hardcodes bracket='adult'; nothing else writes
-- athlete_participation at all in Phase 1a.

-- ============================================================================
-- initialize_adult_participation — the narrow adult self-attestation RPC.
-- ============================================================================
--
-- Permitted effect, exactly one: from complete absence of a participation row,
-- create bracket='adult', status='approved' with the supplied bundle, and append
-- exactly one adult_attested evidence event, atomically (both statements are one
-- function invocation, hence one transaction — PL/pgSQL cannot partially commit).
--
-- There is no ON CONFLICT DO UPDATE anywhere in this body. Reclassifying an existing
-- minor/pending/declined/revoked row is not merely unexposed by this function — it is
-- not expressible by it.
create or replace function public.initialize_adult_participation(
  p_attestation_version text,
  p_terms_version text,
  p_privacy_version text
)
returns text  -- 'initialized' | 'already_initialized' | 'already_initialized_acceptance_outdated' | 'refused'
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_inserted_uid uuid;
  v_bracket text;
  v_status text;
  v_attestation_version text;
  v_terms_version text;
  v_privacy_version text;
begin
  -- No authenticated identity: refuse outright. Owner is derived ONLY from
  -- auth.uid() — there is no uuid parameter on this function, so there is no
  -- argument by which a caller could name a different owner.
  if v_uid is null then
    return 'refused';
  end if;

  -- The Auth user must still exist. This matters for the same reason the
  -- stale-JWT-after-deletion finding mattered for the access-token TTL decision: an
  -- already-issued token can remain API-valid after the user row is gone.
  if not exists (select 1 from auth.users u where u.id = v_uid) then
    return 'refused';
  end if;

  -- Reject null or empty-after-trim versions. A blank string is not a version.
  if p_attestation_version is null or btrim(p_attestation_version) = ''
     or p_terms_version is null or btrim(p_terms_version) = ''
     or p_privacy_version is null or btrim(p_privacy_version) = '' then
    return 'refused';
  end if;

  -- The ONLY write this function can perform: insert from absence. ON CONFLICT DO
  -- NOTHING makes the owner_user_id primary key the concurrency guard — see the
  -- branch below for what happens to the loser of a race.
  insert into public.athlete_participation (
    owner_user_id, bracket, status,
    attestation_version, terms_version, privacy_version,
    request_generation, created_at, updated_at
  ) values (
    v_uid, 'adult', 'approved',
    p_attestation_version, p_terms_version, p_privacy_version,
    0, now(), now()
  )
  on conflict (owner_user_id) do nothing
  returning owner_user_id into v_inserted_uid;

  if v_inserted_uid is not null then
    -- This branch runs only for the row that was actually just inserted, so exactly
    -- one adult_attested event is ever appended per successful initialization —
    -- never on the no-op paths below.
    insert into public.participation_events (
      owner_user_id, event_type, actor, actor_basis,
      attestation_version, terms_version, privacy_version
    ) values (
      v_uid, 'adult_attested', 'athlete', 'athlete_session',
      p_attestation_version, p_terms_version, p_privacy_version
    );
    return 'initialized';
  end if;

  -- A row already existed — either a genuine pre-existing row, or this call lost a
  -- concurrent race against another initialization attempt for the same owner. The
  -- INSERT above already waited for that winner to commit (or roll back) before
  -- reaching this point, so the SELECT below sees a settled, consistent row.
  select bracket, status, attestation_version, terms_version, privacy_version
  into v_bracket, v_status, v_attestation_version, v_terms_version, v_privacy_version
  from public.athlete_participation
  where owner_user_id = v_uid;

  if v_bracket = 'adult' and v_status = 'approved' then
    if v_attestation_version = p_attestation_version
       and v_terms_version = p_terms_version
       and v_privacy_version = p_privacy_version then
      -- Identical bundle: a true no-op. No write, no duplicate evidence.
      return 'already_initialized';
    else
      -- Approved participation is PRESERVED. A newer document version does not
      -- revoke eligibility, and this function does not append the new bundle's
      -- evidence either — accepting a genuinely new bundle is
      -- record_acceptance_bundle's job, a separate explicit operation, not
      -- something this initializer infers on the caller's behalf.
      return 'already_initialized_acceptance_outdated';
    end if;
  end if;

  -- minor/* (pending, approved, declined) or revoked: never touched, never
  -- overwritten, never reclassified. Refused is the only possible outcome.
  return 'refused';
end;
$$;

revoke all on function public.initialize_adult_participation(text, text, text) from public;
grant execute on function public.initialize_adult_participation(text, text, text) to authenticated;

comment on function public.initialize_adult_participation(text, text, text) is
  'Adult self-attestation, narrow and non-upsert. Owner from auth.uid() only. Creates '
  'bracket=''adult''/status=''approved'' solely from complete absence of a row; every '
  'other existing state (including an existing adult row with a different bundle) is '
  'refused, never rewritten. See the Guardian-First Participation architecture.';

-- ============================================================================
-- record_acceptance_bundle — explicit re-acceptance, separate from initialization.
-- ============================================================================
--
-- Phase 1a does not yet surface a re-acceptance UI (nothing today produces a version
-- bump to react to), but the contract ships now so it is testable and so Phase 1b
-- needs no further migration to this function.
create or replace function public.record_acceptance_bundle(
  p_attestation_version text,
  p_terms_version text,
  p_privacy_version text
)
returns text  -- 'recorded' | 'already_recorded' | 'refused'
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_bracket text;
  v_status text;
  v_attestation_version text;
  v_terms_version text;
  v_privacy_version text;
begin
  if v_uid is null then
    return 'refused';
  end if;

  if not exists (select 1 from auth.users u where u.id = v_uid) then
    return 'refused';
  end if;

  if p_attestation_version is null or btrim(p_attestation_version) = ''
     or p_terms_version is null or btrim(p_terms_version) = ''
     or p_privacy_version is null or btrim(p_privacy_version) = '' then
    return 'refused';
  end if;

  -- Row-lock for the duration of this function, so two concurrent re-acceptance
  -- calls for the same owner serialize rather than racing on the UPDATE below.
  select bracket, status, attestation_version, terms_version, privacy_version
  into v_bracket, v_status, v_attestation_version, v_terms_version, v_privacy_version
  from public.athlete_participation
  where owner_user_id = v_uid
  for update;

  if not found then
    return 'refused';
  end if;

  -- Only an existing adult/approved row may re-accept. Every other state —
  -- minor/pending, minor/approved, minor/declined, revoked — is refused outright.
  -- There is no branch below that writes bracket or status, so "cannot reactivate a
  -- declined/revoked/minor state" holds by construction, not by this check alone.
  if v_bracket <> 'adult' or v_status <> 'approved' then
    return 'refused';
  end if;

  -- THE FIX for the finding Codex caught: comparing only against the row's CURRENT
  -- bundle made this non-idempotent across history. Scenario: initialize with
  -- bundle A, record_acceptance_bundle to B (current is now B), then submit A
  -- again. Comparing against "current" (B) would see A as new, attempt to INSERT
  -- a second 'acceptance_recorded'/'adult_attested' evidence row for A — which
  -- already exists from the original initialization — and the complete-bundle
  -- unique index (shared across both event types, see 20261008000002) would raise
  -- a unique_violation. A resubmission of any bundle this owner has EVER accepted,
  -- not just their current one, must be a clean no-op.
  --
  -- So the check is against the evidence log, not the current-state row: has this
  -- owner EVER recorded this exact bundle, under either event type.
  if exists (
    select 1 from public.participation_events e
    where e.owner_user_id = v_uid
      and e.event_type in ('adult_attested', 'acceptance_recorded')
      and e.attestation_version = p_attestation_version
      and e.terms_version = p_terms_version
      and e.privacy_version = p_privacy_version
  ) then
    -- Historically accepted already. No state change, no duplicate evidence — and
    -- deliberately NOT rewound: if B is current and A is resubmitted, the current
    -- accepted bundle stays B. "Already recorded" means exactly that; it is not a
    -- request to revert to an older acceptance.
    return 'already_recorded';
  end if;

  -- A genuinely new bundle (never accepted by this owner before, under either
  -- event type) becomes the current one and gets exactly one new event.
  update public.athlete_participation
  set attestation_version = p_attestation_version,
      terms_version = p_terms_version,
      privacy_version = p_privacy_version,
      updated_at = now()
  where owner_user_id = v_uid;

  insert into public.participation_events (
    owner_user_id, event_type, actor, actor_basis,
    attestation_version, terms_version, privacy_version
  ) values (
    v_uid, 'acceptance_recorded', 'athlete', 'athlete_session',
    p_attestation_version, p_terms_version, p_privacy_version
  );

  return 'recorded';
end;
$$;

revoke all on function public.record_acceptance_bundle(text, text, text) from public;
grant execute on function public.record_acceptance_bundle(text, text, text) to authenticated;

comment on function public.record_acceptance_bundle(text, text, text) is
  'Explicit re-acceptance of a (possibly new) attestation/Terms/Privacy bundle. Only '
  'valid against an existing bracket=''adult''/status=''approved'' row — every other '
  'state is refused. Never writes bracket or status, so it cannot reactivate a '
  'declined, revoked, or minor participation record. Idempotent against the owner''s '
  'full evidence HISTORY, not just the current row: resubmitting any bundle this '
  'owner has ever accepted returns already_recorded with no write, even if a '
  'different bundle is current.';

-- ============================================================================
-- participation_status — the one owner-scoped read surface.
-- ============================================================================
--
-- Runs as the table owner (bypassing RLS, which holds no policies anyway) so no
-- direct SELECT grant on athlete_participation is needed for any role.
create or replace function public.participation_status()
returns text  -- 'absent' | 'adult_approved' | 'minor_pending' | 'minor_approved' | 'minor_declined' | 'revoked' | 'expired'
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_bracket text;
  v_status text;
  v_expires_at timestamptz;
begin
  if v_uid is null then
    return 'absent';
  end if;

  select bracket, status, expires_at
  into v_bracket, v_status, v_expires_at
  from public.athlete_participation
  where owner_user_id = v_uid;

  if not found then
    return 'absent';
  end if;

  if v_bracket = 'adult' and v_status = 'approved' then
    return 'adult_approved';
  end if;

  if v_bracket = 'minor' and v_status = 'pending' then
    if v_expires_at is not null and v_expires_at < now() then
      return 'expired';
    end if;
    return 'minor_pending';
  end if;

  if v_bracket = 'minor' and v_status = 'approved' then
    return 'minor_approved';
  end if;

  if v_bracket = 'minor' and v_status = 'declined' then
    return 'minor_declined';
  end if;

  if v_status = 'revoked' then
    return 'revoked';
  end if;

  -- Unreachable given the table's own CHECK constraints, but a function must
  -- return something for every path rather than relying on those constraints never
  -- changing underneath it.
  return 'absent';
end;
$$;

revoke all on function public.participation_status() from public;
grant execute on function public.participation_status() to authenticated;

comment on function public.participation_status() is
  'Owner-scoped participation status for UI routing only. Exposes the status enum '
  'and nothing else — no guardian email, no token hash, no raw row. The sole read '
  'surface onto athlete_participation; no table grant exists alongside it.';

-- ============================================================================
-- participation_allows_retention / participation_allows_publication — predicates.
-- ============================================================================
--
-- Argument-free by design: a uuid parameter would let any caller probe another
-- athlete's approval state merely by holding EXECUTE. Reading auth.uid() internally
-- closes that regardless of who calls it.
--
-- NOT referenced by any RLS or Storage policy in this migration set. They exist so
-- Phase 1b's policy migration can reference them directly with no further grant
-- change — EXECUTE is already correct for that future use.
create or replace function public.participation_allows_retention()
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status text;
begin
  if v_uid is null then
    return false;
  end if;

  if not exists (select 1 from auth.users u where u.id = v_uid) then
    return false;
  end if;

  select status into v_status
  from public.athlete_participation
  where owner_user_id = v_uid;

  if not found then
    return false;
  end if;

  return v_status = 'approved';
end;
$$;

revoke all on function public.participation_allows_retention() from public;
grant execute on function public.participation_allows_retention() to authenticated;

comment on function public.participation_allows_retention() is
  'True only when the CALLING auth.uid() has an approved participation row AND still '
  'exists in auth.users. False on no identity, no row, a non-approved status, or a '
  'deleted Auth user holding a stale unexpired token. Argument-free so it cannot be '
  'used to probe another athlete''s state. Defined for Phase 1b; referenced by no '
  'policy yet in Phase 1a.';

create or replace function public.participation_allows_publication()
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_bracket text;
  v_status text;
begin
  if v_uid is null then
    return false;
  end if;

  if not exists (select 1 from auth.users u where u.id = v_uid) then
    return false;
  end if;

  select bracket, status into v_bracket, v_status
  from public.athlete_participation
  where owner_user_id = v_uid;

  if not found then
    return false;
  end if;

  return v_bracket = 'adult' and v_status = 'approved';
end;
$$;

revoke all on function public.participation_allows_publication() from public;
grant execute on function public.participation_allows_publication() to authenticated;

comment on function public.participation_allows_publication() is
  'True only when the CALLING auth.uid() is bracket=''adult'' AND status=''approved'' '
  '(and still exists in auth.users). An approved minor returns false: guardian '
  'participation approval permits retention, never publication, until the separate '
  'exact-public-revision guardian approval exists. Referenced by no policy yet in '
  'Phase 1a.';

-- ============================================================================
-- unpublish_own_profile — the one ungated write, always available.
-- ============================================================================
--
-- This is the control that stays reachable in every participation state, including
-- minor/pending, minor/declined, and revoked. It is SECURITY DEFINER specifically so
-- it continues to bypass RLS once Phase 1b's restrictive policies land — reducing
-- public exposure must never require passing the same gate that blocks everything
-- else (docs/ai/GUARDRAILS.md § Public / private boundary: is_published is the only
-- visibility switch, and it must stay reachable).
create or replace function public.unpublish_own_profile()
returns boolean  -- true if a profile row existed and was set unpublished; false if none exists
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return false;
  end if;

  if not exists (select 1 from auth.users u where u.id = v_uid) then
    return false;
  end if;

  -- Sets is_published and nothing else. There is no second column in this
  -- statement, and no parameter through which a caller could ask for one.
  update public.athlete_profiles
  set is_published = false
  where owner_user_id = v_uid;

  return found;
end;
$$;

revoke all on function public.unpublish_own_profile() from public;
grant execute on function public.unpublish_own_profile() to authenticated;

comment on function public.unpublish_own_profile() is
  'Sets is_published=false on the calling auth.uid()''s own profile row and nothing '
  'else. Requires no participation state and performs no other write — reducing '
  'public exposure must always remain available, including to a minor/pending, '
  'minor/declined, or revoked owner. SECURITY DEFINER so it continues to work once '
  'Phase 1b''s restrictive policies are in place.';
