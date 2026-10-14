# Phase 2 live acceptance SQL

Driven by `scripts/phase2-acceptance.mjs`. **The procedure, the gates these files do not
close, and the founder decisions all live in
[`docs/ai/RUNBOOK-phase2-acceptance.md`](../../docs/ai/RUNBOOK-phase2-acceptance.md).** Read
that first.

> **These files create synthetic minor participation rows and `auth.users` rows.**
> An isolated throwaway non-production database with no other traffic is required.
> Set `PHASE2_ACCEPTANCE_ISOLATED=1`; setup refuses nonempty `auth.users`.
> Never production. The runner's gate makes you retype the target host for this reason.

| File | Part | Sessions |
| --- | --- | --- |
| `00-setup.sql` | schema, result recorder, fixtures, cross-session coordination | 1 |
| `01-acl.sql` | A — deployed effective ACLs, ownership, execution context, the registered hook | 1 |
| `02-limiter-scope.sql` | B — pre-request limiter scope, method gate, thresholds, privacy, prune safety | 1 |
| `03-replay-uniqueness-owner.sql` | C — replay, generic refusals, expiry, token uniqueness, deleted owner | 1 |
| `04-hook-roles.sql` | G — the hook under `anon`/`authenticated`/`service_role`; the method gate named explicitly | 1 |
| `05-readonly-hazard.sql` | H — a guardian POST in a read-only transaction really does fail 25006 (the hazard A6 removes) | 1 |
| `10-concurrency-a.sql` + `11-concurrency-b.sql` | D — concurrent approve/approve, decline/decline, approve/decline | **2, concurrent** |
| `12-limiter-atomic-a.sql` + `13-limiter-atomic-b.sql` | J — global/network hard caps with actual blocking and exact final counts | **2, concurrent** |
| `20-lockwait-a.sql` + `21-lockwait-b.sql` | E — redeem waiting out an expiry behind a row lock; deleted-owner race | **2, concurrent** |
| `30-concurrency-verify.sql` | F — the state the races left behind | 1 |
| runner + `41-rollback-verify-disarmed.sql` / `42-rollback-verify-restored.sql` | I — committed disarm and reload, optional HTTP smoke, committed restoration in `finally` | 1 |
| `90-report.sql` | PASS/FAIL table and the verdict line the runner reads | 1 |
| `99-teardown.sql` | removes the schema and the eight fixture users, by this run's creation ledger and creation timestamps | 1 |

Running a `-a` or `-b` file on its own will stall and record a FAIL rather than pass — the
pairs synchronise through the database and each side asserts that the other arrived.

Every assertion is recorded as a row in `phase2_acceptance.result` with its **expected** and
**observed** values as text, so the report prints the actual divergence. A NULL `observed` is
a FAIL, not a skip: it means the evidence query returned nothing, usually because the object
under test is not on this database, and "the migration was never applied" must never read as
a pass.

**The SQL here has never been executed** — `psql` was unavailable on the authoring machine.
See the runbook's § B caveat.
