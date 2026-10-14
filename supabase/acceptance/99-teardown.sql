-- Phase 2 live acceptance — teardown.
--
-- Removes everything the harness created, and NOTHING else. Two categories:
--
--   1. the `phase2_acceptance` schema, which holds the result table, the
--      signals, the fixture register, and every helper. Dropping the schema
--      removes all of it.
--
--   2. the `auth.users` rows THIS RUN CREATED — read from
--      `phase2_acceptance.fixture`, not from the reserved-id pattern. Both
--      participation tables cascade from auth.users, so deleting the users
--      removes their participation rows and their events without this file
--      naming either table, which keeps teardown from being a second place
--      that could delete the wrong thing.
--
-- ── WHY IT DELETES FROM A REGISTER AND NOT FROM A LIST OF IDS ───────────
--
-- The first version iterated the eight reserved ids. That was a real flaw: a
-- recognisable id is not the same claim as "this harness created this row", so
-- if any of those identities had existed beforehand, teardown would have
-- deleted someone else's user. 00-setup.sql now refuses to start when a
-- reserved id already exists, AND records every identity it creates. This file
-- deletes only what is in that register — so even if the preflight were
-- somehow bypassed, a pre-existing identity could not be removed here.
--
-- There is still no pattern match, no `like`, and no "delete where the email
-- looks like a test address". A teardown that deletes by resemblance is
-- exactly the kind of thing that eventually deletes a real row.
--
-- Limiter rows are NOT deleted here. 02-limiter-scope.sql clears them as it
-- goes and empties the table at the end, and this file deliberately does not
-- issue a bare `delete from private.guardian_rate_limits`.

begin;
do $$
declare
  v_deleted integer := 0;
  v_count integer;
  v_fixture record;
begin
  if not exists (select 1 from phase2_acceptance.run
                 where id = pg_catalog.current_setting('phase2_acceptance.run_id')::uuid) then
    raise exception 'cleanup run ID does not own this acceptance schema';
  end if;
  for v_fixture in
    select owner_user_id, slot, user_created_at from phase2_acceptance.fixture
    where run_id = pg_catalog.current_setting('phase2_acceptance.run_id')::uuid order by slot
  loop
    if exists (select 1 from auth.users where id = v_fixture.owner_user_id
               and created_at is distinct from v_fixture.user_created_at) then
      raise exception 'fixture identity was replaced; refusing cleanup';
    end if;
    delete from auth.users where id = v_fixture.owner_user_id
      and created_at = v_fixture.user_created_at;
    get diagnostics v_count = row_count;
    v_deleted := v_deleted + v_count;
  end loop;

  raise notice
    'phase2 teardown: removed % of % registered fixture auth user(s)',
    v_deleted, (select count(*) from phase2_acceptance.fixture);
end;
$$;

drop schema phase2_acceptance cascade;
commit;

select 'teardown complete' as status;
