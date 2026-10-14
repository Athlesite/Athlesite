# RUNBOOK — Guardian-First Participation Phase 2 live acceptance

Everything that has to be true **on a real deployment** before the guardian bearer surface
is exposed, and the procedure for establishing each one.

**Phase 2 code is merged and deliberately undeployed.** `main` @ `4979862` contains
`/guardian/participation` and the bearer peek/redeem RPCs; `claude/phase2-production-readiness`
adds the pre-request rate limiter, the peek-volatility fix, and the arming migration.
Production Supabase holds 11 migrations, through
`20261012000001_phase1b_participation_enforcement`. Neither `20261013000001` nor any of the
three readiness migrations is live.

This runbook is the gate between "merged" and "exposed". Nothing in it has been run.

---

## 0. How to read this

Three kinds of item, and they are not interchangeable:

| Kind | Meaning |
| --- | --- |
| **AUTOMATED** | `node scripts/phase2-acceptance.mjs` settles it against a non-production database. Run it, read the report. |
| **LIVE-ONLY** | No repository artefact can establish it. It needs a deployed project, a real gateway, or a real browser. Someone has to do it and record the answer here. |
| **FOUNDER DECISION** | A value or a design choice that AI may propose and implement but not approve. `docs/ai/GUARDRAILS.md § Authority`. |

Two rules for anyone updating this file:

- Record the **observed value**, not "verified". A checkbox with no value is not evidence.
- If an item cannot be established, say so and leave it open. A gate marked closed on the
  strength of a plausible assumption is worse than one left visibly open.

---

## § A — The rate limiter, and arming the global hook

### A1 — The dispatcher's EXECUTE grant — **RESOLVED: enumerated, not PUBLIC**

**Decided.** `public.data_api_pre_request()` is granted EXECUTE to exactly:

```sql
revoke all on function public.data_api_pre_request() from public;
grant execute on function public.data_api_pre_request() to anon, authenticated, service_role;
```

PostgREST calls `db_pre_request` **after** it has switched into the request's effective role,
so the role that needs EXECUTE is the Data API role — not `authenticator`. Those three are
the Data API roles on this project today.

The earlier proposal granted PUBLIC, to remove an operational failure mode. That was
**rejected**: least privilege wins, a future custom Data API role *should* require a
deliberate reviewed grant, and avoiding project-wide future-role exposure is worth more than
skipping one configuration step.

**The accepted consequence, stated so an operator meets it before it bites.** A role
PostgREST switches into that lacks this grant does not get a degraded request — it gets an
error on **every** Data API call it makes. So:

> **Adding a Data API role means adding a grant on `public.data_api_pre_request()`, in the
> same migration.** See § A9.

`authenticator` is deliberately excluded, because the role switch has already happened by the
time the hook runs. **If a deployed project proves some other role needs EXECUTE — a role
erroring on every Data API request — STOP AND REPORT.** The fix is to name that role in a
reviewed forward migration. It is *not* to broaden the grant back to PUBLIC. The harness
asserts the effective grantee set exhaustively in both directions, so a surprise here is a
named failure rather than a mystery.

The function stays in `public` rather than `private`: `public` already has USAGE granted to
these roles, whereas `private` would need a second grant on a schema whose entire purpose is
that nothing outside it can reach in.

- [x] Decided: enumerated to `anon`, `authenticated`, `service_role`; PUBLIC revoked
- [ ] Observed effective grantee set after deployment — expected exactly those three: ______
- [ ] PUBLIC confirmed absent from the dispatcher ACL: ______
- [ ] No other role observed erroring on Data API requests after arming: ______

### A2 — The pilot thresholds — **RESOLVED: approved as proposed**

Implemented as SQL literals in `private.guardian_rate_limit_enforce`, mirrored in
`RATE_LIMIT_POLICY` in `scripts/guardian-rate-limit-contract.mjs`, which asserts the two
agree. Literals rather than a tunable table on purpose: the effective policy is then part of
the reviewed, byte-pinned artefact, and changing it is a corrective migration someone signs
off on rather than an `UPDATE` nobody sees.

They are derived from the legitimate flow, which is small and known: a guardian opens one
link, the page issues **one** peek on load, and the guardian presses approve or decline
**once**, which issues **one** redeem. Everything above that is a retry, a reload, a second
device, or abuse.

| | burst (1 min) | sustained (1 hr) | global (5 min) |
| --- | --- | --- | --- |
| **peek** — read-only, but privileged work on every call | 10 per /24 or /56 | 40 per /24 or /56 | 300 all sources |
| **redeem** — terminal, writes permanent evidence | 5 per /24 or /56 | 15 per /24 or /56 | 100 all sources |

- **Peek 10/min** is roughly ten times the legitimate peak and still stops a script within a
  second or two. **40/hour** bounds a slow grinder that stays under the burst.
- **Redeem 5/min** covers a mis-click, a transport retry after a `network_error`
  (`guardian-repository.ts` maps an ambiguous transport failure to exactly that, and a
  cautious guardian may well press again), and a second device.
- **Global caps** are the only control a caller who can rotate the forwarding header cannot
  evade — see A4. They are sized as a **circuit breaker**, not a routine limiter: pilot scale
  is tens of guardians in total, so 300 peeks in five minutes is about two orders of
  magnitude above expected legitimate traffic.

**The global cap's trade-off, stated plainly before approval.** A caller who can rotate
addresses can trip it deliberately and thereby deny legitimate guardians for up to five
minutes. That is a real availability cost, accepted knowingly, because the token is 256 bits
— so denial is the *only* thing such a caller can achieve — and because the alternative is
no spoofing-resistant control at all. This is the one place the design chooses availability
loss over resource loss.

A rejected request is **not recorded**, so a caller who stops is released when the window
rolls off, and a caller who does not cannot amplify their own attack into unbounded writes.

**These are pilot values, not permanent product policy.** They are expected to be revisited
once there is real traffic to size them against.

Network bucketing is approved as implemented and must not drift: IPv4 **/24**, IPv6 **/56**,
**truncate before hashing**, **per-database random salt**, no raw IP stored anywhere.

- [x] Thresholds approved exactly as tabulated above
- [x] The global-cap denial window trade-off is accepted knowingly
- [ ] Revisit date once real traffic exists: ______

### A3 — The observed `request.path` — **LIVE-ONLY**

The dispatcher matches the **last two path segments** (`.../rpc/<name>`) rather than a whole
path, because the prefix PostgREST reports is not something this repository can prove: Kong
routes `/rest/v1/...` to PostgREST, and `request.path` may arrive as
`/rpc/peek_guardian_request`, `rpc/peek_guardian_request`, or
`/rest/v1/rpc/peek_guardian_request`. Part B3 of the harness proves all three resolve
identically, which is the right hedge.

It is still a gate, because **the failure mode is silent**: a prefix shape the dispatcher does
not recognise means the limiter never engages and nothing anywhere reports a problem.

Procedure, after arming on a non-production project: call each guardian RPC once over HTTP,
then read the observed value out of a limiter row's existence, or temporarily record
`current_setting('request.path', true)` from a scratch function. Do not infer it.

- [ ] Observed `request.path` for `peek_guardian_request`: ______
- [ ] Observed `request.path` for `redeem_guardian_request`: ______
- [ ] A limiter row is created by a real HTTP call to each (count before/after): ______

### A4 — Which forwarding header is trustworthy — **LIVE-ONLY, UNRESOLVED**

**This repository cannot answer this, and the migration does not claim to.**

`private.guardian_request_ip()` prefers `cf-connecting-ip`, then `x-real-ip`, then the
leftmost `x-forwarded-for` element. The preference order is defensible — Cloudflare
overwrites `cf-connecting-ip` at its own edge, and Supabase's log field reference shows it
present on Data API requests — but "present in edge logs" is not "unforgeable at PostgREST",
and Supabase's own documented limiter reads the leftmost `x-forwarded-for`, which in the
general case is whatever the client sent, because proxies append rather than replace.

**The accepted consequence:** if the header is client-settable, the per-network limits are
evadable by rotating it, and the global caps in A2 are the only control that still binds.
That is why the global caps exist. The limiter's worst case is "degraded to a global circuit
breaker", not "absent".

Procedure:

1. From outside, call a guardian RPC with **no** forwarding headers set. Record which headers
   arrive (a scratch function returning `current_setting('request.headers', true)` on a
   non-production project, removed immediately afterwards).
2. Repeat, this time **sending** `cf-connecting-ip: 192.0.2.1` and
   `x-forwarded-for: 192.0.2.2` from the client. Record whether either value survives to
   PostgREST.
3. Confirm the address-less path is **not** reached in normal traffic: after real calls,
   `select count(*) from private.guardian_rate_limits where bucket_key = private.guardian_rate_limit_bucket_key('::'::inet)`
   must be `0`. Any non-zero result means the header was not derivable and only the global
   cap was protecting the surface.

- [ ] Headers actually present on a Data API request: ______
- [ ] Client-supplied `cf-connecting-ip` survives to PostgREST? ______
- [ ] Client-supplied `x-forwarded-for` leftmost element survives? ______
- [ ] Address-less (sentinel) bucket count after real traffic — expected `0`: ______
- [ ] If spoofable: per-network limits are documented as best-effort, global caps re-approved

### A5 — Does PostgREST run the hook for `OPTIONS`? — **LIVE-ONLY**

The dispatcher returns early for `OPTIONS` without refusing, so **both** answers are safe. It
is listed because the consequence of getting it wrong in the other direction would be severe:
a browser CORS preflight for these RPCs is an `OPTIONS` request (supabase-js sends
`Content-Type` and `apikey`, which makes the request non-simple), and refusing it would break
the guardian page outright rather than rate-limit it.

- [ ] A real browser `OPTIONS` preflight to each guardian RPC succeeds after arming: ______
- [ ] It creates no limiter row: ______

### A6 — Peek volatility — **RESOLVED: VOLATILE now, by forward migration**

**This corrected a real defect in the first implementation, not a deferred nicety.**

PostgREST chooses a read-only or a read/write transaction from the called function's
**volatility**, not from the HTTP method:

| | transaction |
| --- | --- |
| `GET` / `HEAD`, any volatility | read-only (may be served from a read replica) |
| `POST` to a **STABLE** or **IMMUTABLE** function | **read-only** |
| `POST` to a **VOLATILE** function | read/write |

The middle row is the one the first implementation missed. The limiter INSERTs. With
`peek_guardian_request` left STABLE — as `20261013000001` declared it — a **legitimate POST
peek** would open a read-only transaction and the limiter's INSERT would raise

```
25006  cannot execute INSERT in a read-only transaction
```

So arming the hook with peek STABLE would not have left peek *unlimited*; it would have
**broken every peek in the product**. That is strictly worse than the unlimited-`GET` path
the method gate was written to close.

**Fix:** `supabase/migrations/20261014000002_peek_guardian_request_volatile.sql`, a single

```sql
alter function public.peek_guardian_request(text) volatile;
```

`alter function` rather than `create or replace function`: it rewrites exactly one `pg_proc`
attribute and cannot touch the body, owner, grants, `search_path`, signature or return shape.
`redeem_guardian_request` was already VOLATILE (no volatility clause, and VOLATILE is the
default) and is untouched.

**`20261013000001` is NOT edited.** It is reviewed, merged and byte-pinned, and
`GUARDRAILS § Migrations` forbids editing an applied migration. So **the pinned migration
keeps saying `stable` while the deployed catalog says `volatile`, and that divergence is
deliberate.** `scripts/guardian-sql-contract.mjs` still asserts the word `stable` in that
file's bytes — correctly, it checks that file — and its failure message now points here so
nobody "resolves" the apparent contradiction by editing an approved artefact. The deployed
side is asserted separately, against the catalog, by `01-acl.sql` A2.

**Two consequences:**

1. POST peek now runs read/write, so the limiter can record it. This is the reason for the
   change.
2. **PostgREST will no longer serve peek over `GET` or `HEAD`** — a volatile function is not
   GET-able, so it refuses at the routing layer before any transaction opens. The unlimited
   `GET` path is closed at its root. Nothing in the product regresses: supabase-js `.rpc()`
   issues POST unless explicitly asked for GET, and `guardian-repository.ts` never asks.

Peek **remains logically read-only**: VOLATILE is a declaration about what the planner may
assume, not a permission to write. Its body is unchanged and contains no INSERT/UPDATE/DELETE;
harness part C asserts behaviourally that a peek consumes no token and writes no event.

**The method gate is kept as defence in depth** and is no longer relied on alone — see
§ A6b.

- [x] Decided and implemented: peek is VOLATILE via `20261014000002`
- [ ] Deployed `provolatile` for peek is `v` (harness A2, or query the catalog): ______
- [ ] Deployed `provolatile` for redeem is `v`: ______
- [ ] A real `POST /rest/v1/rpc/peek_guardian_request` succeeds **and** creates a limiter
      row after arming: ______
- [ ] A real `GET /rest/v1/rpc/peek_guardian_request?p_token=...` is refused: ______
- [ ] `20261013000001` digest unchanged (`check:columns`): ______

### A6b — The method gate, after the VOLATILE change

The dispatcher still refuses non-`POST`, non-`OPTIONS` guardian traffic with 405, and still
returns early for `OPTIONS`. With peek VOLATILE this is **redundant in the happy path** —
PostgREST already refuses GET/HEAD — and it is kept anyway, deliberately:

- if `20261014000002` is ever reverted, or a future `create or replace` restates peek as
  STABLE, PostgREST starts serving `GET` again. The gate refuses it with 405 instead of
  silently admitting a call the limiter cannot record.
- a refusal needs no write, so the gate is effective in exactly the transaction mode where
  the limiter is not. Harness part H3 proves this inside a genuinely read-only transaction.
- it refuses a guardian path with **no** method metadata, which is the one place the
  dispatcher chooses refusal over admission.

What it is **not** is the primary control any more. The primary control is the volatility
declaration, because it acts before a transaction exists.

- [ ] Both layers confirmed independently after arming (PostgREST 405 on GET; gate 405 when
      reached): ______

### A7 — Registering the global prune — **LIVE-ONLY**

`private.prune_guardian_rate_limits(interval)` exists; **nothing schedules it.** The
migration does not enable `pg_cron`, because whether the extension is available on this
project has not been verified and enabling an extension is a founder decision.

The opportunistic per-key prune inside the enforcer covers buckets that keep returning. It
does **not** cover keys that stop appearing — an attacker who moves on, a guardian who
finished — so without a schedule the table grows slowly and monotonically. At pilot volumes
that is survivable for a long time; it is not a steady state.

The function refuses a retention shorter than the longest active window (1 hour), because
pruning inside a window would silently *reset* live limits, which looks like nothing at all.

```sql
-- after confirming pg_cron is available, on a non-production project first
select cron.schedule(
  'prune-guardian-rate-limits',
  '*/15 * * * *',
  $$select private.prune_guardian_rate_limits(interval '2 hours')$$
);
```

- [ ] `pg_cron` available on this project? ______
- [ ] Schedule registered, and one run observed deleting only expired rows: ______
- [ ] If not scheduled: row-count growth monitoring agreed, and a review date set: ______

### A8 — Migration order, arming, verifying, and rolling back

#### The order, and why

| # | Migration | Effect if the deploy stops here |
| --- | --- | --- |
| 1 | `20261013000001_guardian_bearer_peek_redeem` | guardian RPCs exist; **not reachable** (no issuer, no token delivery) |
| 2 | `20261014000001_guardian_rate_limit_infrastructure` | limiter built; **inert** — nothing calls the dispatcher |
| 3 | `20261014000002_peek_guardian_request_volatile` | peek POST runs read/write, PostgREST stops serving peek over `GET` |
| 4 | `20261014000003_arm_guardian_rate_limit_pre_request` | **the global change** — every Data API request now calls the hook |

**The one hard constraint is that arming is strictly last**, and specifically *after* the
volatility change. Arming at step 2 — before 3 — would make every legitimate POST peek fail
with `25006`, because the limiter's INSERT cannot run in the read-only transaction PostgREST
opens for a POST to a STABLE function. That is why the arming migration was renumbered from
`...0002` to `...0003` when the volatility migration was added, and why
`scripts/sql-contract.test.mjs` asserts the filename order: filenames determine apply order,
so the ordering is enforced rather than merely intended.

**The order of 2 and 3 relative to each other is immaterial**, and that is stated plainly
rather than dressed up as a safety property. Neither depends on the other at apply time: the
limiter infrastructure does not reference peek, and the volatility change does not reference
the limiter. Both are safe to leave in place indefinitely without the other. Infrastructure
is first only because it was written and pinned first, and renumbering a reviewed artefact for
no safety gain would be churn.

Every intermediate state is safe and leaves the product working:

- after 2, nothing has changed for any caller;
- after 3, peek POST is read/write and peek GET is refused by PostgREST. No limiter runs.
  The product only ever issues POST, so nothing regresses;
- only 4 changes behaviour project-wide, and it is one statement that reverts with one
  statement.

#### The procedure

1. Apply `20261014000001`. Confirm the Data API is unchanged.
2. Apply `20261014000002`. Confirm a `POST` to peek still works and a `GET` to peek is now
   refused by PostgREST (405). Still no limiter.
3. Run `node scripts/phase2-acceptance.mjs` against a non-production project. Part A6 should
   show `pgrst.db_pre_request` as `(unset)` — the correct reading of an unarmed deployment,
   and confirmation that steps 1–2 really were inert. Part A2 should already show
   `provolatile = v` for both RPCs.
4. Apply `20261014000003`. **This is the global change.**
5. Immediately smoke-test traffic the limiter must not touch, **as each Data API role**: a
   published profile read (`anon`), an authenticated profile write and a media upload
   (`authenticated`), and any `service_role` path in use. Any failure here is a rollback, not
   a debugging session. See § A9.
6. Re-run the harness. Part A6 should now show the registered function.
7. Close A1, A3, A4, A5 and A6 with real HTTP calls.

**Rollback — the kill switch.** As a forward corrective migration, never an edit to an applied
one (`GUARDRAILS § Migrations`):

```sql
alter role authenticator reset pgrst.db_pre_request;
notify pgrst, 'reload config';
```

That restores the exact pre-readiness Data API behaviour. It drops nothing, so counters, salt
and functions survive and a second attempt needs only `20261014000003` again. It needs no
application deploy, because no application code depends on the hook. `reset`, not
`set ... = ''` — an empty string is a value PostgREST would try to interpret.

**Full teardown**, if the approach is abandoned: disarm **first**, verify the Data API is
healthy, and only then drop anything. Dropping `public.data_api_pre_request` while it is
still registered leaves `authenticator` pointing at a function that does not exist, which is a
project-wide Data API outage.

- [ ] Infrastructure applied (step 1), Data API unchanged: ______
- [ ] Volatility applied (step 2); POST peek works, GET peek refused: ______
- [ ] Harness run pre-arming: A6 `(unset)`, A2 `provolatile = v` for both: ______
- [ ] Armed (step 4): ______
- [ ] Unrelated-traffic smoke test passed for all three roles: ______
- [ ] Harness run post-arming, all PASS: ______
- [ ] Kill switch rehearsed and the prior state restored (harness part I): ______

---

## § A9 — The hook runs after impersonation: per-role safety

The single most important property of arming, and the one with the widest blast radius.
`pgrst.db_pre_request` is set on `authenticator`, but PostgREST calls the function **after**
`set local role`, so the function executes as the request's effective role.

| Role | Must retain | Must not get |
| --- | --- | --- |
| `anon` | all ordinary non-guardian Data API access — published profile reads, the public read RPC, the OpenAPI root | any limiter work on a non-guardian path |
| `authenticated` | profile reads and writes, media upload, every participation RPC | any limiter work on a non-guardian path |
| `service_role` | everything it uses today | any limiter work on a non-guardian path |

Three things have to hold simultaneously, and the harness asserts each separately:

1. **each role can execute the dispatcher** (part G1) — otherwise it loses its *entire* Data
   API, which is the accepted cost of the A1 enumeration;
2. **the dispatcher is a no-op for every non-guardian path, under every role** (part G1, and
   part B1's 9 paths × 7 methods) — no table read, no call into `private`, no row;
3. **the limiter still engages for exactly the two guardian RPCs, under every role** (part
   G2) — six combinations, six rows. The dispatcher is SECURITY DEFINER, so a role with no
   `private` access at all still records a counter.

Part A of the harness asserts the other half: these roles hold EXECUTE on
`public.data_api_pre_request()` and on **nothing else** here — no schema USAGE on `private`,
no grant on either limiter table.

- [ ] `anon`: published profile read works after arming: ______
- [ ] `authenticated`: profile write and media upload work after arming: ______
- [ ] `service_role`: paths in use work after arming: ______
- [ ] No limiter rows accumulate from ordinary traffic (count over a quiet period): ______
- [ ] A guardian POST under `anon` does create a limiter row: ______
- [ ] **If any role errors on every Data API call: disarm immediately (§ A8 rollback), then
      report.** Do not widen the grant to PUBLIC. ______

---

## § B — The automated harness

```bash
ATHLESITE_PHASE2_ACCEPTANCE=1 \
PHASE2_ACCEPTANCE_DATABASE_URL='postgresql://...' \
PHASE2_ACCEPTANCE_NONPROD_CONFIRM=<the host from that URL> \
PHASE2_ACCEPTANCE_ISOLATED=1 \
node scripts/phase2-acceptance.mjs
```

**It creates eight synthetic minor participation rows and eight `auth.users` rows.** They are
fictional, on `example.invalid` (RFC 6761 — never resolvable, so nothing can be delivered to
them), at fixed recognisable ids. Preflight rejects any fixture-ID collision, any existing
acceptance schema, and any nonempty `auth.users` before ALL mutations. The setup DDL
is transactional. Only plain successful user INSERTs enter the run ledger; refresh
and teardown require this run ID and the registered user creation timestamp. `GUARDRAILS §
Athlete data` and the Phase 2 checkpoint both forbid manufacturing production minors, which is
why the gate makes the operator **retype the target host**: a flag can be set once and
forgotten, restating the host means someone looked.

**Require an isolated throwaway, non-production database with no concurrent traffic.**
The harness clears shared limiter state and briefly unregisters the hook. A shared
development branch is unsafe. Set `PHASE2_ACCEPTANCE_ISOLATED=1` explicitly.

The harness needs `psql` on PATH. This project has no PostgreSQL client dependency and no
`service_role` key, and adding either to run an acceptance harness would introduce a
credential or a vendor dependency whose only purpose is testing.

| Part | File | Proves |
| --- | --- | --- |
| A | `01-acl.sql` | deployed effective ACLs: `anon` can execute both RPCs, `authenticated` and PUBLIC cannot, the **exhaustive** grantee set, owner, `SECURITY DEFINER`, empty `search_path`, no table or **column** grants, RLS on, the partial unique index, the limiter's own boundary, **both RPCs' volatility (A6)**, **the dispatcher's exact grantee set with PUBLIC absent (A1)**, the registered hook |
| B | `02-limiter-scope.sql` | 9 unrelated paths × 7 methods never refused and never recorded; 19 malformed and near-miss paths inert; all 6 guardian path shapes in scope; the method gate; thresholds bind per endpoint class and per /24; nothing identifying stored; prune safety |
| C | `03-replay-uniqueness-owner.sql` | replay, terminal decline, generic refusal for every malformed/non-canonical/unknown token, the decision allowlist, expiry, the partial unique index both ways, deleted owner |
| G | `04-hook-roles.sql` | the hook under **`anon`, `authenticated`, `service_role`** by real `set local role` impersonation: a no-op on 9 non-guardian combinations, the limiter reached on all 6 guardian POST combinations, `anon` can still call the published-profile RPC through the hook, and the method gate named explicitly (GET/HEAD refused 405 on both RPCs; POST proceeds) |
| H | `05-readonly-hazard.sql` | that a guardian POST **really does** fail `25006` inside a read-only transaction — the defect A6 removes — while unrelated traffic in the same mode is untouched, and that the method gate still refuses GET with no write |
| D | `10-`/`11-concurrency-*.sql` | approve vs approve, decline vs decline, **approve vs decline** — two real sessions |
| J | `12-`/`13-limiter-atomic-*.sql` | global and network hard caps with a real advisory-lock waiter, exactly one admitted request, and no rejected-request insert |
| E | `20-`/`21-lockwait-*.sql` | a redeem that waits out an expiry behind a row lock, and the deleted-owner race |
| F | `30-concurrency-verify.sql` | exactly one terminal decision and exactly one decision event per raced request, and that the surviving event agrees with the surviving row |
| I | runner + `41-rollback-verify-disarmed.sql` / `42-rollback-verify-restored.sql` | separately committed disarm, reload, verification, optional HTTP smoke, and exact restoration in `finally`; preserves infrastructure and salt |

**Two sessions, and why it cannot pass vacuously.** A holds a session advisory gate
before committing a fixture-ready signal. B waits on that gate. A acquires the actual
target row/advisory lock before releasing the gate (the actual readiness signal).
A polls with `pg_stat_clear_snapshot()` and requires its PID in
`pg_blocking_pids(B)`, a Lock wait, and the intended lock type. B signals completion
only after checking its result and counts; A waits before clearing the next round.
Signal waits raise on timeout, and lock/statement waits are bounded. No arbitrary
minimum elapsed duration substitutes for the proven blocker relationship.

**Part E is the only test that can distinguish `clock_timestamp()` from `now()`** in the
post-lock expiry re-check. It is built to: B's transaction begins *before* expiry (asserted),
blocks on A's lock, and evaluates only after A has held the lock past expiry (asserted). With
`clock_timestamp()` B refuses; with `now()` — frozen at transaction start — B would have
*approved an expired guardian request*. B also asserts that its own transaction-start clock was
**not** past expiry, so the discriminator is recorded rather than assumed.

### Caveat — the SQL has not been executed

`psql` is blocked by an Application Control policy on the authoring machine, and no local
Postgres or Docker is available, so **none of the acceptance SQL has ever run**. It is
reviewed, and it tokenizes under the strict lexer, but its first execution will also be its
first syntax check. Expect to fix something on the first run, and do that run against a
throwaway database.

- [ ] First run completed; syntax corrections (if any) committed: ______
- [ ] Report verdict `PHASE2-ACCEPTANCE: ALL PASS`: ______

The limiter requires fresh READ COMMITTED statement snapshots after advisory-lock
waits. It explicitly refuses REPEATABLE READ/SERIALIZABLE guardian POSTs before
counting, and acceptance asserts those refusals. Actual PostgreSQL serialization
and gateway decoding remain runtime gates.

### Pre-arm checks

Apply only the infrastructure and volatility migrations to the isolated database.
Run `node scripts/phase2-acceptance.mjs --phase=pre-arm`; the registered hook must
be unset. The SQL uses simulated request GUCs; this phase cannot prove HTTP routing.

### Armed acceptance

After pre-arm acceptance and gate review, apply the separate final arming migration
on that isolated database. Run `node scripts/phase2-acceptance.mjs --phase=armed`.
The registered hook must name the dispatcher. Teardown between runs is required;
never reuse or adopt an existing fixture ledger. `--keep-fixtures` prints the run ID
and a cleanup command that sets it on the teardown connection.

### Rollback drill

The armed runner captures the current role setting, commits RESET, commits NOTIFY,
verifies the disarmed catalog, and optionally checks HTTP. Restoration is attempted
in an outer `finally`, in separate committed SET and NOTIFY operations, and the
captured setting is checked exactly afterward. A failed reset also reaches restoration.
A failed restoration is a fatal result with the recovery statements printed.

Set `PHASE2_ACCEPTANCE_REST_URL` and `PHASE2_ACCEPTANCE_ANON_KEY` for HTTP smoke.
A configured smoke must return 200 with no new limiter row; errors fail acceptance.
It uses a bounded timeout. An unobserved asynchronous PostgREST reload fails this
probe and requires investigation; catalog checks alone never prove a reload.
Without HTTP configuration the runner explicitly skips that proof. There is no
claim that PostgREST observed the disarmed state, nor runtime PostgreSQL acceptance
until these files have actually been executed.

---

## § C — Bearer token privacy in platform logs — **LIVE-ONLY**

### The shape of the problem

The raw guardian token **necessarily travels in the RPC POST body**. That is the architecture:
it is an RPC argument (`p_token`), not a header and not a URL parameter, which is the right
choice — a body is not written to access logs or `Referer` by default the way a query string
is.

Application code does not log it. `guardian-repository.ts` logs nothing at all, by its own
stated contract, and both `catch` blocks discard the thrown value rather than printing it.
`guardian-fragment.ts` keeps the token out of browser storage, and the page holds it only in
component state.

**What is unestablished is everything below the application.** Supabase, Cloudflare, Kong,
PostgREST and PostgreSQL each have their own logging, and a token in a request body can be
captured by any of them. **Do not treat the platform as safe without evidence.** The
questions below are not rhetorical; each needs an answer recorded.

### Checklist

For each, call `redeem_guardian_request` once on a **non-production** project with a
recognisable sentinel token, then search the surface for that sentinel string.

- [ ] **API edge / gateway logs** — does the Data API log request bodies? Search Supabase's
      Edge Logs for the sentinel. Expected: absent. Observed: ______
- [ ] **PostgREST logs** — does PostgREST log RPC arguments at the configured log level?
      Observed: ______
- [ ] **PostgreSQL `log_statement` / `log_min_duration_statement`** — a logged statement
      includes bound parameter values on error, and `log_min_duration_statement` can log slow
      statements with parameters. Check the project's settings and whether the sentinel
      appears in Postgres logs. Observed: ______
- [ ] **`auto_explain`** — if enabled with `auto_explain.log_parameter_max_length` non-zero,
      it logs parameters. Is it enabled? Observed: ______
- [ ] **`pg_stat_statements`** — normalises constants, but RPC arguments arrive as *bound
      parameters*, so check whether the sentinel appears in `pg_stat_statements.query`.
      Observed: ______
- [ ] **Error payloads** — force a database error inside the RPC and confirm the response body
      and the logged error contain no token. The functions are written to return generic
      values rather than raise, which limits this, but an unexpected error (a constraint, a
      disk issue) raises PostgreSQL's own message. Observed: ______
- [ ] **Traces / observability integrations** — any APM, log drain, or trace exporter attached
      to the project that captures request bodies. Enumerate them. Observed: ______
- [ ] **The rate limiter itself** — `select * from private.guardian_rate_limits` must contain
      no token, no hash, no body, no email. Harness part B6 asserts this; confirm once on the
      deployed project. Observed: ______
- [ ] **Browser devtools / HAR** — a HAR exported by a guardian for support would contain the
      token in the request body. Note it as an operational hazard; do not ask guardians for
      HARs. Acknowledged: ______

### If the platform does log bodies

Options, in order of preference, **none of which should be adopted without founder sign-off**
because each changes the token architecture:

1. Reduce the logging level or disable body capture on the implicated surface.
2. Shorten the token TTL so a logged token is useful for less time.
3. Move to a two-step exchange: the browser trades the bearer for a short-lived
   server-minted handle, and only the handle reaches the RPC body. This is a real redesign and
   belongs in a later phase, not here.

Do **not** redesign the bearer architecture to pre-empt a logging problem that has not been
demonstrated. The Phase 2 checkpoint says so explicitly, and the token's 30-minute window
plus single-use redemption already bound the exposure.

---

## § D — Browser, fragment and CSP acceptance — **LIVE-ONLY**

### Why jsdom does not count

`guardian-participation.interaction.test.tsx` and `guardian-fragment.test.ts` exercise the
fragment logic, and they are worth having. They prove **nothing** about the items below.
jsdom has no navigation, no session history, no back-forward cache, no CSP enforcement, no
`Referer` generation, and no real hydration. Every box here needs a real browser.

**Minimum matrix:** Chrome (current stable) and Edge (current stable), desktop **and** Android
Chrome. Safari/iOS is strongly recommended — guardians are parents opening a link on a phone,
and iOS Safari's bfcache behaviour differs — but Chrome/Edge is the stated minimum.

### Fragment lifecycle

- [ ] Opening `/guardian/participation#token=<valid>` renders the approval screen
- [ ] The fragment is **removed from the address bar immediately after hydration**, and the
      token is gone from `location.hash`
- [ ] `history.length` does not grow on fragment removal (replace, not push): ______
- [ ] **Refresh** after fragment removal: the page does not silently re-approve, and shows a
      coherent state rather than a crash or a blank screen. Observed state: ______
- [ ] **Back**, then **Forward**: the token is not restored into the URL, and no RPC fires
      with a stale token
- [ ] **bfcache restore** — navigate away to another origin, then Back. The restored page must
      not hold a live token in a mutable state that a click could redeem. Observed: ______
- [ ] **Malformed fragment** (`#token=short`, `#token=` with 43 non-canonical chars, `#tok=x`,
      no fragment at all): the generic unavailable state, never a crash, never a diagnosis of
      *which* way it was wrong
- [ ] Two tabs with the same token: the second gets `unavailable` after the first redeems
- [ ] **No token in `document.referrer`** when following any outbound link from the page
- [ ] **No token in any network request URL** — check every entry in the Network panel
- [ ] **No token in analytics or error reporting** — and no guardian page context either.
      Enumerate what is attached to this route: ______
- [ ] **No token in `localStorage`, `sessionStorage`, IndexedDB or cookies** after the full
      flow

### Chrome/Edge sanity

- [ ] No hydration error or mismatch warning in the console
- [ ] The guardian route renders **without** the normal Header/Footer (it is a deliberately
      isolated surface)
- [ ] The approve and decline buttons each fire exactly one `redeem` call, and are disabled
      while in flight
- [ ] A rate-limited response (force it by exceeding the burst) produces the transient-failure
      state, not a false "declined". **Note:** a 429 arrives as an RPC error, which
      `guardian-repository.ts` maps to `network_error` — deliberately ambiguous rather than a
      false definite negative. Confirm the copy a guardian sees is sensible. Observed: ______

### CSP

`src/proxy.ts` sets a per-request nonce for this route only, with
`script-src 'self' 'nonce-<value>' 'strict-dynamic'`. Nonces require per-request server
rendering, so this route must never become statically optimised.

- [ ] The response carries a `Content-Security-Policy` header with a **fresh nonce on every
      request** (reload twice, compare): ______
- [ ] **Zero CSP violations** in the console across the whole flow, including after a
      redeem
- [ ] `'unsafe-inline'` and `'unsafe-eval'` are absent from the production `script-src`:
      ______
- [ ] **Deployed proxy/CDN behaviour** — confirm Vercel's edge does not strip, merge,
      duplicate or reorder the CSP header, and that no platform header overrides it. Compare
      the header as sent by the origin with the header as received by the browser. Observed:
      ______
- [ ] No second `Content-Security-Policy` header is present (two headers are intersected, and
      a platform-added one could break the route): ______
- [ ] The route is server-rendered per request in production (not prerendered): ______

---

## § E — Gate ledger

| Gate | Kind | Status |
| --- | --- | --- |
| A1 dispatcher EXECUTE grant | founder | **RESOLVED** — enumerated to `anon`/`authenticated`/`service_role`, PUBLIC revoked; deployed grantee set still to verify |
| A2 pilot thresholds | founder | **APPROVED** as proposed (pilot values, revisit with real traffic) |
| A3 observed `request.path` | live-only | **open** |
| A4 forwarding-header trust | live-only | **open — unresolved by design** |
| A5 hook on `OPTIONS` | live-only | **open (safe either way)** |
| A6 peek volatility | founder | **RESOLVED** — VOLATILE via `20261014000002`; deployed `provolatile` still to verify |
| A6b method gate as defence in depth | automated | implemented and asserted |
| A7 global prune schedule | live-only | **open** |
| A8 migration order, arming, rollback | procedure | order decided and enforced by filename; **deployment not started** |
| A9 per-role hook safety | automated + live | asserted in the harness; live smoke test open |
| B ACL / volatility / roles / concurrency / lock-wait / replay / uniqueness / rollback drill | automated | **harness written, never executed** |
| C platform logging of bearer bodies | live-only | **open — no evidence either way** |
| D browser, fragment, bfcache, CSP | live-only | **open** |

**Phase 2 must not be exposed to real guardians while A3, A4, C or D are open.** A5 and A7
are judgement calls with documented fallbacks. A1, A2 and A6 are decided, but each still has
a deployed-state verification line that must be filled in before exposure — a decision is not
the same as a confirmed deployment.

---

## § F — What Phase 2 readiness deliberately does not include

Later checkpoints, named here so the boundary stays visible: the guardian issuer, the Edge
Function, Resend, token generation, token delivery, the minor request UI, exact-revision
publication approval, and the revocation lifecycle.

Nothing in this runbook creates a minor participation row through a product code path, because
no such path exists. That is the Phase 1a boundary the whole design rests on
(`src/lib/participation-phase1a-boundaries.test.ts`).
