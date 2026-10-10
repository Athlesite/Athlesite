-- Guardian-First Participation, Phase 1a — current-state table.
--
-- One row per owner, describing whether that owner's Auth identity is currently
-- entitled to retain profile data and/or publish it. This table is written ONLY by
-- the SECURITY DEFINER functions in 20261008000003 — see that migration for the full
-- hardening story. Nothing here grants any direct table access to `authenticated` or
-- `anon`: owner-scoped reads go through public.participation_status(), not a raw
-- SELECT grant, so there is exactly one read surface to review rather than two.
--
-- PHASE 1a CREATES ONLY bracket='adult', status='approved' ROWS. No code path in this
-- migration set, or anywhere in the app as of this checkpoint, can produce a
-- bracket='minor' row — that arrives in a later phase alongside the guardian-request
-- RPCs. The CHECK constraints below describe the FULL future contract (adult and
-- minor, every status) on purpose, so a later phase cannot violate it either; they are
-- simply unexercised until bracket='minor' becomes reachable.
--
-- See docs/ai/DECISIONS.md § Minor participation is guardian-first, and the Guardian-
-- First Participation architecture proposal (Codex-reviewed, final PASS) for the full
-- design. This migration implements exactly the "current-state" half of that design;
-- 20261008000002 implements the append-only evidence half.

create table public.athlete_participation (
  -- One participation record per Auth identity. Cascading on delete means a full
  -- account deletion removes this row for free, the same way it already removes
  -- athlete_profiles — see docs/ai/DECISIONS.md § Athlete account deletion.
  owner_user_id uuid primary key references auth.users (id) on delete cascade,

  bracket text not null check (bracket in ('adult', 'minor')),
  status text not null check (status in ('pending', 'approved', 'declined', 'revoked')),

  -- Guardian-request fields. NULL for an adult row; populated once a minor request
  -- exists (Phase 3). token_hash is sha256 of a 256-bit random token — the plaintext
  -- is never stored, by a trusted-issuer RPC that does not exist yet in Phase 1a.
  guardian_email text,
  token_hash bytea,
  request_generation integer not null default 0,
  requested_at timestamptz,
  expires_at timestamptz,
  decided_at timestamptz,

  -- Adult self-attestation bundle: the exact versions this owner accepted.
  -- Non-null exactly when bracket = 'adult' (enforced below).
  attestation_version text,
  terms_version text,
  privacy_version text,

  -- Guardian-request version pinning (Phase 3): the versions presented to the
  -- guardian AT THE TIME OF ISSUANCE, so an approval can be bound to what was
  -- actually shown rather than whatever is "current" when someone reads it back.
  guardian_copy_version text,
  request_terms_version text,
  request_privacy_version text,

  -- Delivery metadata, written only by the narrow delivery-recording RPC (Phase 3).
  last_issued_at timestamptz,
  last_delivery_outcome text check (last_delivery_outcome in ('sent', 'failed')),
  last_delivery_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- ══════════════════════════════════════════════════════════════════════════
  -- STATE-CONSISTENCY CHECKS — the complete per-state shape, not merely the
  -- fields Phase 1a's own writers happen to populate.
  --
  -- FIX for the finding Codex caught: the previous version only constrained a
  -- handful of fields (guardian_email/token_hash/requested_at/expires_at for
  -- adult; status for adult; the bundle for adult; guardian_email for
  -- minor/pending). Everything else — request_generation, decided_at, the three
  -- guardian/request version-pinning columns, and the three delivery-metadata
  -- columns — was unconstrained for every state, so an incoherent row (e.g. an
  -- adult row carrying delivery metadata, or a minor/pending row with no
  -- request_generation) was representable even though no Phase 1a writer would
  -- produce one. These four constraints below are each a COMPLETE shape for one
  -- state, covering every column on the table, so incoherence is structurally
  -- impossible regardless of which future writer (Phase 3's issuance/rotation/
  -- redemption RPCs) touches this table next.
  --
  -- `status = 'revoked'` is reachable only for bracket = 'minor': the adult
  -- constraint below pins every adult row to status = 'approved', which leaves
  -- revoked nowhere to apply but a minor row. Its coherent shape mirrors
  -- minor/approved-or-declined, since revocation is only meaningful after an
  -- approval existed to revoke.
  -- ══════════════════════════════════════════════════════════════════════════

  constraint athlete_participation_adult_approved_shape check (
    bracket <> 'adult'
    or (
      status = 'approved'
      and guardian_email is null
      and token_hash is null
      and request_generation = 0
      and requested_at is null
      and expires_at is null
      and decided_at is null
      and guardian_copy_version is null
      and request_terms_version is null
      and request_privacy_version is null
      and last_issued_at is null
      and last_delivery_outcome is null
      and last_delivery_at is null
      and attestation_version is not null
      and terms_version is not null
      and privacy_version is not null
    )
  ),

  constraint athlete_participation_minor_pending_shape check (
    bracket <> 'minor' or status <> 'pending'
    or (
      guardian_email is not null
      and token_hash is not null
      and request_generation >= 1
      and requested_at is not null
      and expires_at is not null
      and decided_at is null
      and guardian_copy_version is not null
      and request_terms_version is not null
      and request_privacy_version is not null
      and attestation_version is null
      and terms_version is null
      and privacy_version is null
    )
  ),

  constraint athlete_participation_minor_decided_shape check (
    bracket <> 'minor' or status not in ('approved', 'declined')
    or (
      guardian_email is not null
      and token_hash is null
      and request_generation >= 1
      and requested_at is not null
      and expires_at is not null
      and decided_at is not null
      and guardian_copy_version is not null
      and request_terms_version is not null
      and request_privacy_version is not null
      and attestation_version is null
      and terms_version is null
      and privacy_version is null
    )
  ),

  -- Only reachable for bracket = 'minor' (see the adult constraint above), and
  -- only meaningful after an approval existed to revoke — same shape as
  -- minor/approved-or-declined: the guardian-request trail stays intact, the
  -- token is already consumed, and a decision timestamp is already set from the
  -- original approval this state revokes.
  constraint athlete_participation_revoked_shape check (
    status <> 'revoked'
    or (
      bracket = 'minor'
      and guardian_email is not null
      and token_hash is null
      and request_generation >= 1
      and requested_at is not null
      and expires_at is not null
      and decided_at is not null
      and guardian_copy_version is not null
      and request_terms_version is not null
      and request_privacy_version is not null
      and attestation_version is null
      and terms_version is null
      and privacy_version is null
    )
  )
);

comment on table public.athlete_participation is
  'One row per Auth identity: whether this owner may currently retain profile data '
  '(status = approved) and, for an adult, publish it. Phase 1a creates only '
  'bracket=''adult'' rows via initialize_adult_participation(); written exclusively by '
  'SECURITY DEFINER functions in 20261008000003 — no direct table grant exists.';

-- Keep updated_at current on every write, matching athlete_profiles' own convention.
-- public.set_updated_at() is SECURITY INVOKER and already pins search_path='' (see
-- 20260929000001), so reusing it here adds no new trust surface.
create trigger set_athlete_participation_updated_at
  before update on public.athlete_participation
  for each row
  execute function public.set_updated_at();

alter table public.athlete_participation enable row level security;

-- No policies are added. RLS with zero policies default-denies every row to every
-- role — belt-and-braces, since the revoke below already means no role reaches this
-- table through the Data API at all. "RLS is mandatory on every table exposed through
-- the Data API, no exceptions" (docs/ai/GUARDRAILS.md) is honoured literally even
-- though this table is not, in fact, exposed: there is no grant for PostgREST to act
-- on, so there is nothing to enumerate, filter, or write.
--
-- Deliberately NOT granted here, matching the approved architecture precisely:
--   - no SELECT to authenticated or anon (participation_status() is the only read
--     surface, and it runs as a SECURITY DEFINER function — see 20261008000003)
--   - no INSERT/UPDATE/DELETE to authenticated or anon at all (every durable
--     transition is a narrow RPC; a generic table write would make the atomicity
--     and idempotency guarantees those RPCs provide unenforceable)
revoke all on table public.athlete_participation from anon, authenticated;
