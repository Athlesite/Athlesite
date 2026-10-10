-- Guardian-First Participation, Phase 1a — append-only evidence table.
--
-- Answers "how was this eligibility decision reached, and how was a correction
-- handled" (docs/ai/DECISIONS.md § Minor participation is guardian-first) as a single
-- chronologically-ordered, fully-typed log. One row per event, never updated, never
-- deleted. Phase 1a writes exactly two event types (adult_attested,
-- acceptance_recorded); the rest are declared now so the CHECK constraints and
-- uniqueness indexes describe the FULL evidence contract a later phase must honour,
-- without this table needing a shape change when that phase lands.
--
-- Every column is typed and closed-valued. No free-text column and no jsonb exist on
-- this table, on purpose: nothing personal can be stashed in an untyped field, and
-- every value here is something a SQL CHECK can actually validate.

create table public.participation_events (
  id bigint generated always as identity primary key,

  -- Same cascade as athlete_participation: a full account deletion removes this
  -- owner's evidence too. See docs/ai/DECISIONS.md § Athlete account deletion for why
  -- that is the accepted pilot posture rather than a durable archive.
  owner_user_id uuid not null references auth.users (id) on delete cascade,

  event_type text not null check (event_type in (
    'adult_attested',
    'acceptance_recorded',
    'request_issued',
    'request_rotated',
    'delivery_recorded',
    'guardian_approved',
    'guardian_declined',
    'bracket_changed',
    'founder_reset'
  )),

  actor text not null check (actor in ('athlete', 'issuer', 'guardian_token', 'founder')),

  -- The AUTHORITY the actor relied on, recorded separately from who acted. This is
  -- what lets "a guardian approved this" be distinguished from "an athlete self-
  -- attested this" even when both ultimately set status='approved'.
  actor_basis text not null check (actor_basis in (
    'athlete_session',
    'issuer_role',
    'guardian_token_possession',
    'founder_operation'
  )),

  -- Server-set only. Every writer uses `now()`; nothing here is ever a caller-
  -- supplied timestamp.
  occurred_at timestamptz not null default now(),

  -- Present for every guardian-request-lifecycle event; NULL for adult self-service
  -- events and founder operations, which have no request generation to pin to.
  request_generation integer,

  -- The exact bundle this event is evidence FOR. Required on adult_attested and
  -- acceptance_recorded; for a guardian decision (Phase 3), these are copied from the
  -- request's PINNED versions at redemption time, never re-read as "current".
  attestation_version text,
  terms_version text,
  privacy_version text,

  -- The guardian-facing approval copy version the guardian actually saw (Phase 3).
  guardian_copy_version text,

  delivery_outcome text check (delivery_outcome in ('sent', 'failed')),

  -- A closed basis code for founder-operated events, never free text. FIX for the
  -- finding Codex caught: this was previously an unrestricted `text` column, which
  -- meant "closed-valued" was a comment, not a database guarantee — anything could
  -- be written here. The CHECK below makes the column itself refuse any value
  -- outside the two founder-operation codes the architecture actually calls for.
  -- Adding a third later is a one-line CHECK edit in a new migration, not a design
  -- problem: a short closed enum that occasionally grows is exactly what a CHECK
  -- allowlist is for.
  basis_code text check (basis_code is null or basis_code in (
    'founder_reset',
    'founder_asserted_adult'
  )),

  -- The adult-acceptance bundle is mandatory on exactly the two event types that
  -- claim to record one. This is the first half of closing the NULL-uniqueness trap
  -- below: a row that is supposed to carry a bundle cannot have a null column in it.
  constraint participation_events_bundle_required check (
    event_type not in ('adult_attested', 'acceptance_recorded')
    or (
      attestation_version is not null
      and terms_version is not null
      and privacy_version is not null
    )
  ),

  -- Every guardian-request-lifecycle event is pinned to a generation.
  constraint participation_events_generation_required check (
    event_type not in (
      'request_issued', 'request_rotated', 'delivery_recorded',
      'guardian_approved', 'guardian_declined'
    )
    or request_generation is not null
  ),

  constraint participation_events_delivery_outcome_required check (
    event_type <> 'delivery_recorded' or delivery_outcome is not null
  ),

  constraint participation_events_basis_code_required check (
    event_type not in ('bracket_changed', 'founder_reset') or basis_code is not null
  ),

  -- The complement of the constraint above: basis_code must be NULL for every
  -- event_type that is not a founder operation. Required and NULL-elsewhere
  -- together pin basis_code's presence to EXACTLY {bracket_changed, founder_reset}
  -- — not "at least these two", not "these two plus whatever else someone adds".
  constraint participation_events_basis_code_only_for_founder_events check (
    event_type in ('bracket_changed', 'founder_reset') or basis_code is null
  )
);

comment on table public.participation_events is
  'Append-only evidence log for every participation decision: who acted, on what '
  'authority, when, and against which document/wording versions. Phase 1a writes '
  'only adult_attested and acceptance_recorded; the remaining event types are '
  'declared now so later phases need no shape change. No UPDATE or DELETE grant '
  'exists for any role — append-only is enforced by the absence of privilege, not by '
  'convention.';

-- THE COMPLETE-BUNDLE UNIQUENESS CONSTRAINT.
--
-- Deliberately a composite over the three version columns, not a synthetic
-- "acceptance_bundle_version" identifier: this way the event row itself states what
-- was accepted, answerable by reading one row, with no registry table to keep in
-- sync. Both adult_attested and acceptance_recorded share ONE index on purpose, so
-- the same exact bundle cannot be recorded once as the initial attestation and again
-- as a "new" re-acceptance.
--
-- `nulls not distinct` closes the NULL-uniqueness trap explicitly: PostgreSQL unique
-- indexes are NULLS DISTINCT by default, which would let multiple rows with a null in
-- any of the three columns all coexist — defeating the whole point of this index. The
-- CHECK constraint above already guarantees these three columns are never null for
-- these two event types, so this clause is belt-and-braces on the one constraint the
-- entire adult-acceptance contract rests on, not a scenario expected to occur.
create unique index participation_events_bundle_unique
  on public.participation_events (owner_user_id, attestation_version, terms_version, privacy_version)
  nulls not distinct
  where event_type in ('adult_attested', 'acceptance_recorded');

-- Generation-bound uniqueness for the guardian-request lifecycle (Phase 3). Declared
-- now, alongside the bundle index above, so the full evidence contract ships in one
-- reviewed migration rather than being bolted on piecemeal later.
create unique index participation_events_issuance_unique
  on public.participation_events (owner_user_id, request_generation)
  where event_type in ('request_issued', 'request_rotated');

create unique index participation_events_delivery_unique
  on public.participation_events (owner_user_id, request_generation)
  where event_type = 'delivery_recorded';

create unique index participation_events_decision_unique
  on public.participation_events (owner_user_id, request_generation)
  where event_type in ('guardian_approved', 'guardian_declined');

alter table public.participation_events enable row level security;

-- No policies, matching athlete_participation's own reasoning: zero grants already
-- mean PostgREST cannot reach this table, and RLS with no policies default-denies
-- regardless. Append-only is a privilege fact, not a trust-the-caller convention —
-- there is no UPDATE or DELETE grant to any role, including the owner.
revoke all on table public.participation_events from anon, authenticated;
