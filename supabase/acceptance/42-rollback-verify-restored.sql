-- Phase 2 live acceptance — PART I, step 6: verify the RESTORED state.
--
-- Run by scripts/phase2-acceptance.mjs after its `finally` has re-issued the
-- committed `ALTER ROLE ... SET pgrst.db_pre_request` + `NOTIFY`. See
-- 41-rollback-verify-disarmed.sql for the whole sequence and why it is driven
-- from outside SQL.
--
-- `:expected_hook` is passed in by the runner with `-v`, carrying the value it
-- captured in step 1. Comparing against the CAPTURED value rather than a
-- hard-coded string is what makes this correct in both phases: before arming
-- the captured value is `(unset)` and the correct restore is to leave it
-- unset, while after arming it names the dispatcher.

select phase2_acceptance.record(
  'I2', 'the pre-drill hook setting was restored exactly', :'expected_hook',
  phase2_acceptance.hook_setting()
);

-- Restoring must not have armed something different, or armed a project that
-- was deliberately unarmed. Stated as its own assertion because "restored"
-- and "restored to the right thing" are different claims.
select phase2_acceptance.record(
  'I2', 'the restored setting names the reviewed dispatcher, or nothing at all', 'true',
  (
    phase2_acceptance.hook_setting()
      in ('(unset)', 'pgrst.db_pre_request=public.data_api_pre_request')
  )::text
);

select 'part I step 6 complete' as status;
