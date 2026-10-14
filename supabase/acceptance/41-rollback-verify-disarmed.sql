-- Phase 2 live acceptance — PART I, step 3: verify the DISARMED state.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHY THE DRILL IS DRIVEN BY THE RUNNER AND NOT BY ONE SQL FILE
-- ══════════════════════════════════════════════════════════════════════════
--
-- The first version of this drill did the reset and the restore inside a
-- SINGLE plpgsql block, which made it worthless: nothing ever committed in the
-- disarmed state, so PostgREST never observed it, and the "rollback" being
-- tested was a state no client could ever have seen. It also used an exception
-- handler around the restore, which is worse than it looks — a handler that
-- swallows a failed restore lets the surrounding work commit with the hook
-- still disarmed, which is precisely the outcome the drill is supposed to
-- protect against.
--
-- So the drill is now a sequence of SEPARATELY COMMITTED operations, sequenced
-- by scripts/phase2-acceptance.mjs:
--
--   1. capture the existing hook setting            (psql -c, read)
--   2. ALTER ROLE ... RESET + NOTIFY                (psql -c, COMMITTED)
--   3. verify the catalog is disarmed               ← THIS FILE
--   4. optional HTTP/Data API smoke check           (runner, opt-in)
--   5. ALTER ROLE ... SET + NOTIFY, restoring       (psql -c, COMMITTED)
--   6. verify the catalog is restored               (42-…)
--
-- Step 5 runs from the runner's `finally`, so it is attempted even if step 3
-- or 4 throws. There is no SQL exception handler anywhere in the drill: a
-- failure to restore surfaces as a loud runner error with the hook still off,
-- which is the honest outcome, rather than being hidden by a handler.
--
-- This file asserts the disarmed state only. It writes nothing but result rows.

select phase2_acceptance.record(
  'I1', 'the committed kill switch cleared pgrst.db_pre_request', '(unset)',
  phase2_acceptance.hook_setting()
);

-- The substance of "rollback drops nothing": after a kill switch, a second
-- arming attempt needs only the arming migration again, because every function
-- and both tables are still present. Seven functions now — the four original
-- `private` helpers, the two percent-decode helpers, and the dispatcher.
select phase2_acceptance.record(
  'I1', 'the kill switch dropped no limiter infrastructure', '7/2',
  (
    select (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where (n.nspname = 'private' and p.proname in (
               'guardian_rate_limit_bucket_key', 'guardian_request_ip',
               'guardian_rate_limit_enforce', 'prune_guardian_rate_limits',
               'guardian_path_segment_malformed', 'guardian_decode_path_segment'))
         or (n.nspname = 'public' and p.proname = 'data_api_pre_request')
    )::text
    || '/'
    || (
      select pg_catalog.count(*)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'private'
        and c.relname in ('guardian_rate_limits', 'guardian_rate_limit_salt')
    )::text
  )
);

-- The salt in particular must survive. Rotating it would silently reset every
-- live rate-limit window — a rollback that quietly removed all protection
-- while appearing to succeed.
select phase2_acceptance.record(
  'I1', 'the rate-limit salt survived the disarm (windows not reset)', '1',
  (select pg_catalog.count(*)::text from private.guardian_rate_limit_salt)
);

-- The dispatcher is still callable directly and still inert off the guardian
-- path, so disarming changed registration and nothing else.
select phase2_acceptance.record(
  'I1', 'the dispatcher still functions when unregistered', 'allowed',
  phase2_acceptance.probe('/athlete_profiles', 'GET')
);

select 'part I step 3 complete' as status;
