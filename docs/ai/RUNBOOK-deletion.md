# RUNBOOK — athlete account deletion and takedown

Operational procedure for permanently deleting one athlete's data during the pilot.

**This is founder-assisted.** There is no self-service Delete Account, and no automated
Auth-user deletion. Read the whole runbook before starting; several steps are irreversible.

---

## 1. Purpose and scope

Covers: an athlete-requested account deletion, and a founder-initiated takedown.

The completion bar — all four, or the operation is not finished:

- no public profile data
- no private athlete profile row
- no athlete-owned Storage objects
- no remaining Auth user

and **no other athlete is affected**.

Out of scope: legal/privacy policy text, retention schedules, bulk deletion, orphan sweeping.

## 2. The pilot model, and why

Athletes already have **self-service Unpublish**. That is the urgent lever: it stops fresh
public access and is reversible.

Precisely how it works matters when you are telling an anxious athlete what to do: the
Visibility switch in `PublishSection` is **local component state only**. Flipping it changes
nothing on the server — the value is written when they press **Save**, in the same single
`.update()` as every other field. So the instruction is "turn Published off **and press
Save**", not "flip the switch". Until Save completes, the profile is still public.

**Permanent deletion is founder-assisted.** Deleting an Auth user requires an admin
credential, and this project deliberately holds none — no `service_role` key, no admin API
surface, no server action (`DECISIONS.md § No service-role key in this project`). Introducing
one to automate deletion would create an endpoint whose whole purpose is destroying accounts;
at pilot scale, with rare requests, that trade is not worth it. So the tool performs only what
an authenticated **owner** may already do, and the Auth step is done by hand.

## 3. Prerequisites

- Founder access to the **Athlete** Supabase dashboard. **Never the Ops project.**
- A local checkout with `.env.local` pointing at the Athlete project.
- The athlete reachable in real time, to receive a sign-in code and to agree the quiet window.
- An explicit deletion request (or a recorded takedown decision).

## 4. Identity binding — the rule that prevents collateral damage

The operation targets **environment fingerprint + verified Auth UID**. That pair is bound once
and never re-derived.

**Slug is informational only.** Slugs are mutable and reusable: an athlete can change theirs
mid-operation, and a freed slug can later belong to someone else. Re-resolving by slug on a
retry could point the operation at an innocent athlete. The profile row id is supporting
evidence — used to *detect* that the row changed, never to decide who the target is.

Hard refusals: auth validation failure · UID mismatch · environment mismatch · unexpected
profile row id · conflicting identity evidence · any object path outside the exact owner
namespace · traversal-like or ambiguous paths · corrupt inventory · inability to distinguish a
permission failure from a true absence · detected concurrent activity.

Ownership of a path is decided by **exact first-segment equality**, never `startsWith` — which
would wrongly accept `<uid>2/...`, a different athlete's folder.

## 5. Cooperative quiet window — a limitation, not a guarantee

**Unpublishing does not install a write barrier.** Under current policies it does not prevent:

- another browser tab saving
- another session uploading
- a stale edit form writing

So before starting, get the athlete's explicit agreement to **close Athlesite and not edit
until told otherwise**. The tool asks you to confirm this.

The tool re-scans before each destructive transition and rolls the checkpoint backward if new
media or profile activity appears — it *detects* interference, it cannot *prevent* it. **Do not
describe this workflow as race-safe.** Achieving that would require a real write barrier, which
is out of scope for the pilot.

## 6. Deletion order — Auth is strictly last

1. Authenticate / re-confirm the intended athlete
2. Bind environment + verified Auth UID
3. Persist the bound operation before touching anything
4. Confirm the cooperative quiet window
5. Type the exact confirmation phrase
6. **Unpublish**
7. Verify fresh anonymous access no longer exposes the profile
8. Enumerate the athlete's **entire** `{uid}/` namespace, recursively
9. Persist the full inventory — before any delete
10. Delete all discovered owner media through the Storage API
11. Re-enumerate and reconcile until **verified empty**
12. Re-check identity, unpublished state, empty Storage
13. Delete the athlete profile row
14. Verify profile absence
15. Re-scan the whole owner namespace **while owner authorization still exists**
16. **Stop.** Manual Auth handoff
17. Founder deletes the exact Auth UID in the dashboard
18. Final verification — public surface, with no athlete session

### Why both confirmations come before the unpublish

Unpublishing is a mutation of the athlete's live profile. Putting it before the quiet-window
agreement and the typed phrase would mean the tool changes something the operator has not yet
confirmed they intend — so there is no "one allowed early mutation" in this procedure. Every
mutation, unpublish included, happens inside the confirmed window.

A resumed run asks both questions again. A confirmation is about what is *about* to happen, not
a token earned in an earlier session.

### Why the public exposure check is three-valued

Step 7 can answer **absent**, **exposed**, or **unknown**. Only a reachable, parsed `200` with
zero rows means absent. A transport failure, a non-200, an unparseable body, or an operation
with no known slug all mean *unknown* — and unknown never satisfies a completion condition,
because a 404 from a wrong path reads exactly like a clean result.

### Why Auth must be last

`athlete_profiles.owner_user_id` is `references auth.users(id) on delete cascade`, but
**nothing cascades to Storage**. Delete the Auth user first and the profile row disappears
while the media survives. The **reliable** route to removing it is then gone: Storage owner
authorization is keyed on `auth.uid()`, and the sign-in path that mints a token carrying that claim
no longer exists, so no new owner credential can be obtained.

State the next step carefully rather than overreaching. A token issued *before* the deletion still
carries the `auth.uid()` claim and may remain API-valid until it expires, so it is **not**
established that the objects instantly become admin-only — only that nothing dependable remains.
Relying on a surviving token would mean relying on a credential that expires at an unknown moment
mid-cleanup, which is why the ordering exists at all.

**Never delete the Auth user before step 15 reports a clean scan.** That scan is the last point at
which this tool can obtain an owner-authorised listing: the sign-in path that produces the
credential is gone once the Auth user is, so the tool cannot get a *fresh* owner session again.
Step 15's result is therefore the record of media absence that completion rests on, and the tool
refuses to print the Auth handoff if it could not be written to disk.

State the residual question precisely rather than overclaiming: an access token **already issued**
before the deletion may remain API-valid until it expires, and the Storage owner policy is keyed on
`auth.uid()` — a claim such a token still carries. So "the Auth user is deleted" does **not** by
itself establish that no credential can reach the athlete's objects. Whether one still can is
exactly what §17 cases 36–37 measure, and until they are recorded the operation is not complete.

## 7. Recursive owner-root enumeration

Completeness is the whole `{uid}/` namespace — **not** `{uid}/hero` and `{uid}/profile`. Those
are current app conventions, not a definition of what the athlete owns.

- include root-level files (`{uid}/file.png`)
- recurse into every returned folder
- paginate every folder to exhaustion, with deterministic ordering
- **enumerate fully before deleting anything** — offset pagination over a shrinking collection
  skips entries
- do not filter by extension, UUID shape, slot name, or depth
- a malformed, non-array, or thrown response is **UNKNOWN**, never "empty"

"Empty" is the signal that authorises the next destructive step, so an unreadable folder must
stop the operation.

## 8. Inventory rules

One JSON file per operation, in a founder-only local application-data directory **outside the
repo** (`%LOCALAPPDATA%\Athlesite\deletion-work\<operation-id>.json`, or the XDG equivalent).
Not a temp directory — those get cleaned, which would destroy resumability at the worst moment.

Contents: format version · operation id · non-secret environment fingerprint · target UID ·
profile row id or explicit null · bucket · checkpoint · evidence timestamps · discovered keys ·
per-key state · enumeration-complete marker · manual Auth acknowledgement · residual-credential
acknowledgement · final verification acknowledgement.

That list is a **strict allowlist** in code, not a description. Any other field — however
innocuous — makes the inventory invalid, because a denylist of credential names always loses to
the next spelling. Values are additionally scanned at every depth for JWT, secret-key, and
signed-URL shapes regardless of the field they sit in.

The directory is **canonicalised and then checked**: symlinks and junctions are resolved first, and a
path that resolves inside the repository checkout, or whose segments match a well-known cloud-sync
folder name (OneDrive, Dropbox, Google Drive, iCloud), is **refused** — not silently relocated.
`--work-dir` can move the inventory; it cannot move the lock (see §9).

The checkout check is structural and reliable. **The cloud-sync check is a heuristic on folder names
only, not comprehensive detection.** It cannot see a renamed sync root, a sync client configured over
an arbitrary directory, or a network share replicated elsewhere. Treat it as a guard against the
common mistake, never as assurance that the inventory is unsynced.

### Persistence semantics, stated exactly

Each write is **atomic within the local filesystem**: temp file → `fsync` → rename. After the
rename the file is read back, re-validated, and compared field-by-field against what was
intended; only then is the caller told persistence succeeded. Every save result is checked, and
a failure to persist **stops the operation** — including the save that records `profile-absent`,
without which the Auth handoff is not printed.

This is **atomic local persistence with verified read-back, not guaranteed crash-durable
storage.** `fsync` is attempted, but no power-loss guarantee is claimed; Windows in particular
offers no portable one. Do not describe the inventory as crash-proof.

**Never stored:** OTPs · passwords · access JWTs · refresh tokens · API keys · signed URLs · raw
profile bodies · media bytes. Credentials stay in memory; re-authenticate on resume. Delete the
inventory only after `verified-complete`.

### Terminal handling of the emailed code

The code is read with **terminal echo off**, before any readline interface is created, so there is a
single consumer of stdin and raw mode is always restored — including on a refusal or an error. On a
non-TTY stdin (a pipe) there is nothing to hide, and the tool says so rather than implying the input
was masked.

Say the limit accurately: this keeps the code off the visible screen and out of scrollback. It cannot
prevent a terminal emulator, multiplexer, session recorder, or keylogger from capturing keystrokes.
**"The tool never writes credentials anywhere" is a property of the tool, not of the terminal** — so
do not describe credentials as impossible to persist. The athlete's email address *is* echoed, on
purpose: the operator needs to see it to catch a typo before a code is sent to the wrong address.

## 9. Retry and resumption

| Situation | Behaviour |
|---|---|
| Interrupted / partial media deletion | Re-authenticate the same bound UID → fresh recursive scan → reconcile → delete the remainder |
| Lost delete response | Not evidence either way. Reconcile from a fresh authorized scan |
| Object already absent | Counts as absent **only** after an authorized complete scan proves it |
| Ambiguous profile-delete response | Re-read by bound UID and reconcile the current fact |
| Resume after profile deletion | Never recreate the profile. Owner Storage cleanup is still allowed while the Auth user exists |
| Resume after Auth deletion | **Verification only.** No ordinary owner cleanup is possible |
| Double execution | Reconcile from the original operation id + bound UID. Never resolve by slug |
| New media appears | Invalidate downstream checkpoints, stop, investigate concurrent activity |
| New profile activity appears | Same — roll back and investigate |
| Slug changed after binding | Refused as concurrent activity. The final public check can only look up the bind-time slug, so continuing would verify the wrong name. Re-bind a new operation |
| Slug freed and reused by someone else | The public check reports **exposed** and refuses. The other athlete's row is never touched — identity is the bound UID, never the slug |
| Object previously proven absent reappears | **Regression, not a retry.** `media-absent` and everything downstream is invalidated and the run stops. It is deliberately *not* re-deleted: whatever put it back can do so again after the final scan |
| Replacement row appears for the bound UID | Refused on the row id. The new row is not the target and is never deleted |
| A published row is found at `media-absent` | Refused and rolled back. A republished profile is never deleted around |
| Auth validation fails mid-operation | Refused at that boundary. Startup auth is never reused as evidence for a later destructive step |

Resume is **checkpoint-aware**: a run entered at `media-absent` does not re-delete media, and a
run entered at `profile-absent` re-prints the Auth handoff rather than re-deleting the row. What
it never does is *inherit* a proof — before deleting media, and again before deleting the row,
the tool re-reads the owner row, re-validates the binding, and re-runs a complete enumeration.

### The founder-process lock

A per-environment/per-UID lock stops two founder-tool processes colliding.

**Scope, narrowly.** One OS user, one host, a file under that user's local application-data root.
Not distributed, not cross-user, not cross-machine. **It does not block athlete browsers** —
nothing here is a write barrier.

- Acquisition is **exclusive by construction**: the record is written to a private temp file and
  then hard-linked into place, so the path either does not exist or exists with a complete record.
  There is no check-then-write window.
- The lock lives in its own fixed directory, **not** under `--work-dir`. Otherwise two operators
  passing different work directories would never see each other's lock.
- **The same operation id does not bypass a live lock.** The one exception is the identical OS
  process re-observing its own hold, where no second worker exists.
- **Age is never evidence.** There is no "older than an hour, safe to steal" rule.

### The inventory is read after the lock, not before

Holding the lock is only half of serialisation; the other half is reading the state afterwards. If a
run loaded the inventory, then waited for the lock, it would resume with a snapshot that predates
whatever the previous holder committed — and writing that back erases it. So only the lock *key* is
worked out beforehand, and the inventory the phases act on is loaded once the lock is held.

A pre-lock read happens in exactly one case: `--mode verify-public` has no session, so the bound uid
can only come from disk. That read is used for the uid and nothing else; it never becomes the state
the run mutates. Nothing is ever merged from before the wait, because a stale copy can only subtract
from newer evidence — a recorded stale-token capability, a newer probe generation, an unresolved
cleanup, or a further checkpoint.

### Reclaiming a dead holder, and why it needs its own gate

Recovering a lock whose holder is dead is not as simple as removing it. If two runs both read the
same dead record, the first removes it and claims the lock — and the second, still acting on its
earlier read, removes **the first one's live lock** and claims it too. Both then proceed. Nothing in
that sequence re-checks that the file being removed is still the dead one.

So a takeover has to win a **recovery token** first:

1. every record carries a random `instanceId`, unique to that one acquisition
2. a would-be recoverer exclusively creates `<lock>.takeover.<instanceId>` — only one process can,
   so only one is ever entitled to remove that instance
3. it then re-reads the lock and proceeds only if it is still that exact instance and still dead
4. removal is followed by a fresh exclusive claim, which a third party may legitimately have won
   meanwhile — in which case this run refuses

A reclaim is reported, never silent. A recoverer that dies mid-way leaves the token behind, which
**blocks automatic recovery of that instance** until a human clears it. That is the intended
trade: lost availability, never a second live worker.

### What fails closed

All of these refuse rather than reclaim:

| Observation | Why it is not "dead" |
|---|---|
| Holder on another host | This process cannot inspect that host's processes |
| Unreadable or corrupt record | Could equally be a competitor mid-write |
| Empty file | Same |
| **Missing or malformed pid** | Nothing to check liveness against |
| **No instance id** | A takeover could not prove it is removing the same lock it inspected |
| Leftover `.takeover` file for the current instance | An earlier recovery did not finish |

A corrupt **same-host** lock is not auto-reclaimed either. Same host is not a licence to remove a
record we cannot read.

**To clear a lock by hand:** confirm no founder process is running, then delete the named lock file
(and any `.takeover.*` file beside it). That manual step is deliberate — it is the point at which a
human asserts no worker is live.

**PID reuse** is an accepted limitation, and it fails in the safe direction: if the operating system
has handed the recorded pid to an unrelated process, the lock reads as *live* and the run refuses.
The cost is a manual cleanup, not two workers.

## 10. Running the tool

```
# Dry run first — always.
ATHLESITE_ACCOUNT_DELETION=1 node scripts/delete-athlete-account.mjs --slug <slug>

# Execute, after reviewing the plan.
ATHLESITE_ACCOUNT_DELETION=1 node scripts/delete-athlete-account.mjs --slug <slug> --mode execute

# Resume, or verify WHILE the athlete's account still exists (needs a sign-in code).
ATHLESITE_ACCOUNT_DELETION=1 node scripts/delete-athlete-account.mjs --operation <id> --mode verify-owner

# Verify AFTER the Auth user is deleted. No sign-in code; there is no account to sign into.
ATHLESITE_ACCOUNT_DELETION=1 node scripts/delete-athlete-account.mjs --operation <id> --mode verify-public
```

| Mode | Session needed | Mutates | Use |
|---|---|---|---|
| `plan` (default) | athlete sign-in code | no | review the target and object list |
| `execute` | athlete sign-in code | **yes** | perform the owner-authorised deletion |
| `verify-owner` | athlete sign-in code | no | check state while the account still exists |
| `verify-public` | **none** | records checkpoints only | the only mode usable after Auth deletion |

Default mode is read-only. Execute requires confirming the quiet window and typing an exact
confirmation phrase. The three session modes re-authenticate the athlete with a **sign-in-only**
code that cannot create an account — important on a retry, since a signup-enabled request would
silently recreate a just-deleted user.

`verify-public` requires `--operation <id>`: with no session there is nothing else it could bind
to, so it will not guess a target.

### The service-role guard is a guard, not a proof

The tool refuses to start if the configured key contains `sb_secret_` or `service_role`. That
catches the obvious mistake for the key formats this project uses. It is **not** an exhaustive
role detector: a legacy JWT-format key carries its role inside the encoded payload, which the
tool does not decode or inspect. Never treat the guard as evidence that a key is owner-scoped.
The operational rule is the real control — only the publishable key belongs in `.env.local`.

## 11. Manual Auth deletion (step 17)

Only after step 15 reports a clean scan.

1. Open the Supabase dashboard for the **Athlete** project. Never Ops.
2. Authentication → Users.
3. Delete **exactly** the UID the tool printed. Compare it character by character.
4. Confirm no other user was affected.
5. Re-run the tool with `--operation <id> --mode verify-public`.

## 12. Final verification (step 18) — without the athlete's OTP

**The athlete cannot help here, and must not be asked to.** Their Auth user is gone, so a
sign-in code for it cannot be issued. Any procedure that requires one at this stage is
unrunnable by construction. `verify-public` therefore takes no session.

What the final run checks, and what each fact rests on:

| Fact | How it is established at step 18 |
|---|---|
| No public profile data | Fresh **anonymous** RPC call for the slug returns zero rows. Must be *absent*, not *unknown* |
| No athlete-owned Storage objects | The complete owner-authorised scan recorded at `profile-absent` (step 15). **Not reliably re-verifiable through this tool** — it can no longer obtain a fresh owner session. An already-issued token may or may not still work; §17 cases 36–37 measure that, and the admin cross-check below is the independent check |
| No private profile row | Likewise recorded at `profile-absent`, by an authorised read |
| No remaining Auth user | Confirmed by the founder in the dashboard, and recorded by typing the **full** bound UID back into the tool |
| Residual credentials understood | Explicit acknowledgement, recorded in the inventory |

The tool refuses to reach `verified-complete` unless the recorded `profile-absent` evidence is
actually present in the inventory. It will not substitute public absence for owner-scoped proof,
and it will not claim to have re-verified something it cannot read.

**Admin-side cross-check (optional, recommended for the first few deletions).** Because the
owner-scoped facts cannot be re-read, a founder may confirm them independently in the dashboard:
Storage → `athlete-media` → confirm no `{uid}/` prefix exists, and Table Editor →
`athlete_profiles` → confirm no row with that `owner_user_id`. Do this *before* deleting the Auth
user if you want a second pair of eyes on the same facts the tool proved, or after, using admin
credentials, if you want an independent check. This is a human cross-check, not something the
tool performs — it holds no admin credential.

Then mark the operation `verified-complete` and discard the inventory.

## 13. What does NOT count as evidence of absence

Do not conclude deletion is complete because:

- a delete request returned success — an acknowledgement is not a verified state
- a signing attempt failed — that can mean unpublished, unauthorised, or missing
- a list returned empty **without proven authorization** — an unauthorised reader sees nothing
- `getUser()` failed — that is a session fact, not a data fact
- a refresh-token exchange was rejected — same
- the profile page 404s — `notFound()` also covers unpublished and not-yours

Absence is proven only by an **authorized, complete** read that does not contain the thing.

## 14. Caveats to state honestly

**Signed URLs and caches.** A signed URL issued before deletion is bearer access for its own
lifetime. Once the underlying object is deleted the URL is expected to fail, but CDN or browser
caching may serve a copy for some period — measured behaviour, not a guarantee. **Never promise
deletion of copies already downloaded to someone's device.**

**Stale access tokens.** Deleting an Auth user revokes session and refresh state, but an
already-issued access JWT can remain signature-valid until it expires. Measured in 5D.7: GoTrue
returned 403 and refresh exchange 400, while the same token still authenticated against PostgREST.

Be careful about the next inference. "The row and objects are already gone, so such a token can read
nothing" is the *expected* outcome, not an established one — and it says nothing about whether the
token can still **write**. The Storage owner policy is keyed on `auth.uid()`, a claim a residual JWT
still carries. So do **not** describe deletion as instantly revoking every credential, and do not
assume the deleted Auth user makes an outstanding token inert. §17 cases 36–37 measure reads *and*
writes with a pre-deletion token after Auth deletion, and §16 states the completion order and the
condition that applies when any capability remains.

**Unpublish vs permanent deletion.**

| | Unpublish | Permanent deletion |
|---|---|---|
| Reversible | Yes | **No** |
| Public profile access | Stops for fresh requests | Gone; row deleted |
| Fresh hero signing | Stops | Object no longer exists |
| Previously issued signed URLs | May work until expiry | Expected to fail once the object is gone, subject to cache behaviour |
| Athlete's data | Retained | Removed |
| Who performs it | Athlete, self-service (switch **plus Save**) | Founder-assisted |

**Known-device cleanup.** The session lives in cookies, which is not reachable by server-side
deletion — ask the athlete to sign out on every device they used, and note this in the deletion
confirmation.

Onboarding itself no longer keeps a draft in `localStorage` — **pre-auth onboarding state is
memory-only**, and new onboarding activity writes nothing to the browser. Entering onboarding
purges the known historical keys (`athlesite:onboarding:draft`, `athlesite:onboarding:step`, and
the legacy per-slug `athlesite:athlete:*` profile keys), leaving unrelated browser storage
untouched. One residue: a browser that signed up before this fix and has **not since returned to
`/get-started`** may still be holding those old keys until it does, or until a future
sign-out-triggered cleanup path lands. **Clearing all site data is therefore not the normal
instruction for removing an onboarding draft any more** — if a device is a known special case
still carrying the old keys, visiting `/get-started` once (even without completing onboarding)
clears them; site-data clearing remains available as a manual fallback, not the default
guidance.

## 15. Takedown (founder-initiated)

Same procedure, with two differences: the request comes from the founder rather than the athlete,
and the athlete may not be available.

### If the athlete is unreachable, this tool cannot help you

Be clear about the constraint: **every mutating step of this tool requires the athlete's
sign-in code.** It acts strictly as the owner, so with no code it cannot unpublish, cannot
enumerate `{uid}/`, and cannot delete anything. "Unpublish first and immediately" is therefore
*not* something the tool can do for an unreachable athlete — it is a manual dashboard action.

**Manual takedown of public exposure, without the athlete:**

1. Open the Supabase dashboard for the **Athlete** project. Never Ops.
2. Table Editor → `athlete_profiles`. Filter by `slug` to locate the row, then **record its
   `owner_user_id`** — that UID, not the slug, is the target of everything that follows.
3. Set `is_published` to `false` on that one row. Change nothing else. Save.
4. Confirm exactly one row changed, and that its `owner_user_id` is the one you recorded.
5. Verify anonymously that the public RPC returns zero rows for the slug:
   `POST /rest/v1/rpc/get_published_profile_by_slug` with only the publishable key. A non-200 or
   an unreachable endpoint is **unknown**, not absent — retry until you get a clean `200` with
   zero rows.

Public exposure is now stopped. The athlete's data still exists, and that is the correct
intermediate state: it is reversible, and deletion should not proceed on an unconfirmed identity.

6. When the athlete becomes reachable, run the normal procedure from step 1 with their code.
7. If they will never be reachable and permanent deletion is still required, that is a
   **founder decision outside this runbook**: the remaining steps need either the athlete's
   authorization or an admin credential this project deliberately does not hold. Do not
   improvise one. Record the decision, and treat introducing an admin path as its own reviewed
   change.

Never skip identity binding. An urgent takedown is exactly when a slug-based mistake would be
most damaging — which is why step 2 records the UID before anything is changed.

---

## 16. Completion order after manual Auth deletion

This order is enforced by the tool, not merely recommended. Nothing here can be skipped by
answering a question a particular way.

1. **Record the exact UID deleted.** Type it in full; a prefix or a near-miss is refused.
2. **Test a pre-deletion access token against Storage READ** (list the athlete's prefix) and
   against the profile row.
3. **Test the same token against Storage WRITE** (upload one object under the athlete's prefix)
   and against a profile-row insert.
4. **Record both outcomes.** "Not tested" is a legitimate answer and it leaves the operation
   **open** — the tool will not complete without both.
5. **If any capability remained**, the operation stays OPEN until all of:
   - every outstanding deletion-session access-token expiry window has passed
   - any object the write probe created has been removed, and its absence confirmed
   - the admin/manual Storage and `athlete_profiles` cross-check has been completed
   - the public verification has been re-run
5b. **A fresh public verification request is issued after all of the above** — not the one read at
   the start of the run. `publicRecheckAt` is stamped only from that request; it is never derived
   from a clock reading or carried over from an earlier check. If that request returns EXPOSED or
   UNKNOWN, completion is refused.
6. **Only then** may the operation reach `verified-complete`.

**Obligations survive restarts.** Residual state is monotonic: a capability once observed stays
observed, and an unresolved expiry, probe cleanup, or cross-check stays unresolved until positively
confirmed. A later run answering "no" to the READ/WRITE questions does **not** discharge what an
earlier run recorded — it only means that run did not reproduce it, perhaps because the token it
used had since expired. The tool announces what it inherited at the start of each run.

**One probe token is not evidence about every session.** Several access tokens may have been issued
during the operation — the deletion run itself, an earlier `verify-owner` run, an athlete browser
session. Testing one token tells you about that token. The question the tool asks is therefore about
**all** outstanding windows, and the honest bound on the whole residual question is the longest
access-token lifetime configured for the project. Keeping that TTL short is what limits the window;
it is a project setting, not something this tool controls.

**What is NOT claimed.** That deleting the Auth user makes an already-issued token harmless. The
Storage owner policy is keyed on `auth.uid()`, and a residual JWT still carries that claim. Whether
access actually remains is what steps 2–3 measure.

---

## 17. Live acceptance matrix

> **Executed 2026-10-05 — PASS.** Durable result: `DECISIONS.md` → "5D.9 live acceptance: PASS".

Run once against the live Athlete project, on **disposable fixtures only**, before this workflow is
used on a real athlete. Nothing here may be run against a real account.

**Fixtures.** Four accounts, created for this purpose and deleted afterwards:

| Fixture | Purpose | Set-up state |
|---|---|---|
| **T1** | the account actually deleted | published profile · 2 hero objects (one superseded) · 1 profile photo · 1 object at the namespace root (`{uid}/stray.png`, uploaded by hand) · 1 nested folder (`{uid}/hero/old/x.png`) · 1 **unexpected top-level folder** (`{uid}/scratch/note.png`) · enough objects in one folder to force **multi-page listing** (see case 3) |
| **T2** | the **control athlete** | published profile · 2 objects. **Must be byte-identical, and still publicly loadable, at every checkpoint of every case below.** |
| **T3** | the concurrency probe | published profile · 1 object. Used for mid-operation writes and republishes |
| **T4** | the slug-reuse probe | no profile initially; used to claim T1's freed slug in case 15 |

T1's odd shapes are the point: a root-level object, a nested folder, and a folder outside the
`hero`/`profile` convention all fail if enumeration assumes the app's current layout.

**Before starting, record:** each fixture's UID and slug; every object key under each UID; each
profile row's `id`, `slug`, `is_published`; the configured access-token TTL; **two** signed hero URLs
for T1 — one fetched at least once (**warmed**, so any CDN copy exists) and one **never fetched** —
with their expiries; and one T1 access JWT with its `exp`. Credentials stay in a terminal session
only, never written to a file.

### Cases

Each case states what must be observed. "PASS" requires the stated observation, not merely the
absence of an error. **After every case, re-check T2.**

| # | Case | Action | Required observation |
|---|---|---|---|
| 1 | Gate | run with no `ATHLESITE_ACCOUNT_DELETION` | exit 2, nothing contacted |
| 2 | Plan is read-only | `--mode plan` on T1 | lists every T1 object; T1 still published; no prompts; no mutations |
| 3 | **Forced multipage listing** | ensure one T1 folder holds more objects than the page size, then re-run `--mode plan` | every object is listed and `pages` > 1. A single-page result here means pagination was never exercised — add objects until it is |
| 4 | **Unexpected top-level folder** | inspect case 2/3 output | `{uid}/scratch/note.png` is present. A tool assuming `hero`/`profile` fails here |
| 5 | Root-level and nested objects | inspect the same output | `{uid}/stray.png` and `{uid}/hero/old/x.png` both present |
| 6 | Wrong athlete refused | `--mode execute`, sign in as **T2**, `--operation` = T1's | `UID_MISMATCH`, refused before the lock; T1 and T2 untouched |
| 7 | Quiet window declined | `--mode execute` on T1, answer `no` | `QUIET_WINDOW_NOT_CONFIRMED`; T1 **still published** |
| 8 | Phrase mistyped | `--mode execute` on T1, type a wrong phrase | `CONFIRMATION_MISMATCH`; T1 still published; 0 objects deleted |
| 9 | Confirmations precede mutation | after cases 7–8 | T1's `is_published` is still `true` in the dashboard |
| 10 | Two live processes | start `--mode execute` on T1; start a second while the first waits at a prompt | second exits `LOCK_HELD`, naming the first operation |
| 11 | **Concurrent dead-lock recovery** | kill the first process (no release); confirm the lock file remains; then start **two** runs at the same moment | exactly **one** acquires and reports a reclaim; the other exits `LOCK_HELD`. Afterwards one lock file exists, holding the winner's operation id |
| 12 | Corrupt lock fails closed | hand-edit the lock file to remove its `pid`, then run again | `LOCK_HELD`; message names the manual remedy. Repeat with invalid JSON and with an empty file |
| 13 | **Corrupt inventory rejected** | hand-edit a persisted inventory: add an unknown field; then separately set `requestedSlugAtBindTime` to an object; then set `formatVersion` to 1 | each is refused as `INVENTORY_CORRUPT`; no mutation attempted |
| 14 | **Foreign inventory rejected** | hand-edit a persisted T1 inventory to add a `keyStates` entry under **T2's** UID, at checkpoint `media-absent` | refused at load; **zero** Storage DELETE calls; T2's objects untouched |
| 15 | Work dir refusal | `--work-dir <the repo>` | refused, naming the repository checkout |
| 16 | Unpublish + public absence | continue a clean `--mode execute` on T1 past the phrase | tool reports public state **absent**; anonymous RPC for T1's slug returns 0 rows |
| 17 | **Public UNKNOWN blocks the destructive flow** | run a clean `--mode execute` on T1 with `ATHLESITE_DELETION_FORCE_PUBLIC_UNREACHABLE=1`. Do **not** block the host at the firewall (that also breaks authentication) and do **not** change `NEXT_PUBLIC_SUPABASE_URL` (that changes the environment fingerprint, so the run is refused for a different reason and proves nothing) | **what this exercises is the public-verification RESULT GATE, not the HTTP path.** The switch injects a synthetic unreachable result in place of the request, so no public HTTP call is made for that check — the tool logs `DIAGNOSTIC: public verification forced to UNREACHABLE`. Required: `PUBLIC_STATE_UNKNOWN`, 0 objects deleted, 0 row deletes. Auth succeeded and the fingerprint is unchanged, so the refusal is attributable to the injected result alone. Then **re-run without the switch** — that run makes the real request, and the same operation proceeds |
| 18 | Inventory persisted pre-delete | check the work dir before the delete batch | file exists at `inventory-ready` listing every key; contains no JWT, no `sb_secret_`, no signed URL |
| 19 | Media deletion | let the run continue | every T1 object deleted; re-scan returns 0; absence reported as **proven by a fresh scan** |
| 20 | **Partial delete** | interrupt the run mid-batch (kill it between batches) | inventory shows some keys `pending-verification`; nothing claimed absent |
| 21 | **Safe resume after a partial delete** | re-run `--operation <id> --mode execute` | re-authenticates, re-scans, deletes only the remainder, and proves absence. Both confirmations are asked **again** |
| 22 | **Lost delete response** | during a batch, drop the response (kill connectivity for a moment, then restore) | the acknowledgement is treated as neither success nor failure; the fresh scan decides |
| 23 | **Already-absent object** | delete one T1 object by hand in the dashboard, then run the media phase | it is proven absent by the scan, not by a delete call; no error |
| 24 | **Republish detection** | at `inventory-ready`, republish T1 from a browser (switch + **Save**), then resume | `CONCURRENT_ACTIVITY`; checkpoint rolled back to `bound`; nothing deleted |
| 25 | **Reappearing verified-absent object** | after media absence is proven, re-upload one of the deleted keys as T1, then resume | `CONCURRENT_ACTIVITY` naming a previously-proven-absent object; it is **not** silently re-deleted; `media-absent` and everything downstream is invalidated |
| 26 | **Replacement-row detection** | at `media-absent`, delete T1's row by hand and let T1 save a new profile (new row id), then resume | refused on the row id; the new row is **not** deleted |
| 27 | **Changed slug** | at `inventory-ready`, change T1's slug from a browser, then resume | `CONCURRENT_ACTIVITY` naming the slug change; re-bind a new operation |
| 28 | Row deletion | complete a clean run on T1 | T1's row absent by authorised read; final owner scan complete and empty |
| 29 | **Ambiguous profile deletion** | interrupt immediately after issuing the row DELETE, before the verifying read | on resume the state is reconciled from a fresh authorised read by bound UID, never from the lost response |
| 30 | **Interrupted execution / resume from each checkpoint** | for each of `bound`, `inventory-ready`, `media-absent`, `profile-absent`, `auth-deletion-recorded`, `verified-complete`: park an operation there and resume | each resumes correctly, re-proves before acting, and does not repeat completed destructive work. `verified-complete` asks nothing and changes nothing |
| 31 | Pre-handoff re-proof | resume at `profile-absent` with T1 clean | the handoff prints **only after** a fresh session check, a fresh empty scan, and an ABSENT public check |
| 32 | Handoff suppressed on regression | resume at `profile-absent` after re-uploading one object as T1 | no handoff; `CONCURRENT_ACTIVITY`; rolled back |
| 33 | Handoff content | clean resume at `profile-absent` | prints T1's **full** UID and a `--mode verify-public` resume command; does **not** delete the Auth user |
| 34 | Manual Auth deletion | delete T1's Auth user in the dashboard | exactly one user removed |
| 35 | Post-Auth OTP is impossible | `--mode verify-owner` on T1 | OTP request refused; message points to `verify-public`. **This is correct behaviour, not a failure** |
| 36 | **Stale JWT — READ** | with T1's pre-deletion JWT: `GET` the profile row, and `list` `{uid}/` | record status and body for both. Must return no T1 data |
| 37 | **Stale JWT — WRITE** | with the same JWT: `POST` an object to `{uid}/probe.png`, and `POST` an `athlete_profiles` row | record status for both |
| 38 | Completion cannot precede 36–37 | `--mode verify-public --operation <id>`, answering the stale-token questions with anything other than yes/no | refused; operation stays open; `residualTokenTest` not recorded |
| 39 | Post-Auth verification | `--mode verify-public --operation <id>` with the real outcomes from 36–37 | completes with no session **only if** the residual conditions are satisfied; public state **absent**; reaches `verified-complete` |
| 40 | Public UNKNOWN blocks completion | at `auth-deletion-recorded`, repeat case 17's transport failure | `PUBLIC_STATE_UNKNOWN`; does **not** reach `verified-complete` |
| 41 | EXPOSED after completion contradicts the record | on a completed operation, republish a profile at T1's slug (use **T4** to claim it) | `STILL_PUBLIC`; the stored `verified-complete` does **not** override fresh evidence |
| 42 | **Reused slug** | leave T4 holding T1's old slug, then re-run `verify-public` on T1's operation | the public check reports **exposed** and refuses. Confirm the tool never treats T4's row as T1's, and never deletes it |
| 43 | **Warmed signed URL** | fetch the warmed T1 signed URL from case set-up | record the status. A cached 200 is a **CDN/browser caching** finding, not incomplete deletion — note the cache age |
| 44 | **Previously unused signed URL** | fetch the never-fetched T1 signed URL | record the status. Expected to fail now the object is gone; a 200 here would mean the object still exists and the operation is not complete |
| 44a | **UNKNOWN on resume at `inventory-ready`** | park an operation at `inventory-ready`, then run `--mode execute --operation <id>` with `ATHLESITE_DELETION_FORCE_PUBLIC_UNREACHABLE=1` | `PUBLIC_STATE_UNKNOWN`; **zero** media deletes and **zero** row deletes. Auth still succeeds and the environment fingerprint is unchanged, so the refusal is attributable to the public check alone |
| 44b | **EXPOSED result gate on resume at `inventory-ready`** | park at `inventory-ready`, then resume with `ATHLESITE_DELETION_FORCE_PUBLIC_EXPOSED=1`. **Do not republish to produce this** — a republished row is caught by the row/publication check before the public check is reached at all, so the run refuses with `CONCURRENT_ACTIVITY` and the gate under test is never evaluated | **exercises the EXPOSED refusal of the result gate.** The switch injects a synthetic one-row result instead of issuing the request, logged as `DIAGNOSTIC: public verification forced to EXPOSED`; no public HTTP call is made for that check. Required: refusal is `STILL_PUBLIC` (**not** `CONCURRENT_ACTIVITY`, which would mean the gate was never reached); zero media deletes, zero row deletes; the row is untouched and still unpublished afterwards |
| 44c | **UNKNOWN on resume at `media-absent`** | park at `media-absent`, resume with the same diagnostic switch | `PUBLIC_STATE_UNKNOWN`; **no profile row delete** |
| 44d | **EXPOSED result gate on resume at `media-absent`** | park at `media-absent` with an empty namespace, then resume with `ATHLESITE_DELETION_FORCE_PUBLIC_EXPOSED=1`. Again **not** by republishing, for the same reason as 44b | **exercises the EXPOSED refusal of the result gate**, from the pre-row-delete check. The result is injected, not fetched. Required: `STILL_PUBLIC`; **no profile row delete**; the row is still present and still unpublished afterwards |
| 44e | **Public exposure appears during residual testing** | at `auth-deletion-recorded`, begin `verify-public`; between the WRITE question and the admin attestation, publish a profile at the slug (use **T4**) | completion refuses on the **final** public request, not the first; `verified-complete` is not reached and `publicRecheckAt` is not stamped |
| 44f | **Unresolved residual capability survives restart** | record WRITE capability with a probe object and answer "not yet" to expiry; exit; re-run `verify-public` twice more answering no/no | each run refuses to complete and reports the inherited capability and probe. The recorded `writeCapable` stays `true` |
| 44g | **Expiry not yet passed → refuse** | with capability recorded, answer "no" to the expiry question | operation stays OPEN, outstanding reason names the expiry window |
| 44h | **Probe not removed → refuse** | with a probe object recorded, answer "no" to its removal | operation stays OPEN, outstanding reason names the probe object |
| 44i | **Foreign residual probe path** | answer the probe-key question with a path under **T2's** uid | `FOREIGN_PATH`; nothing recorded; T2 untouched |
| 44j | **OTP terminal behaviour (partly manual)** | manually, at the hidden code prompt: (a) type a code — confirm nothing is echoed and nothing appears in scrollback; (b) press **Ctrl-C** at that prompt. Stream **EOF and stream error at the hidden prompt are NOT manually reproducible here**: redirecting stdin at startup (`node ... < /dev/null`) reaches EOF at the *email* prompt, never at the code prompt, so that procedure tests the wrong reader. Those two paths are covered by automated tests instead — see `scripts/lifecycle/terminal.test.mjs` ("stream END settles the promise…", "stream ERROR settles the promise…", and the non-TTY end case) | (a) succeeds with no echo; (b) exits without hanging and leaves the terminal usable — type a command afterwards to confirm echo is back. For EOF/error, confirm the automated terminal suite passes rather than attempting a manual reproduction |
| 44k | **Enumeration output is inspectable** | re-run case 3 with `--full-keys` | every discovered key is printed in full, untruncated, so completeness can actually be judged |
| 44l | **Dead-lock recovery evidence** | perform case 11 and read the winner's output | it prints `lock reclaimed from a dead holder: <operation id>`, naming the reclaimed operation |
| 45 | No policy drift | diff `supabase/migrations/` and re-run `npm run check:columns` | unchanged; 4 pinned digests verify; no migration applied |
| 46 | **Control athlete unchanged** | final check of T2 | row `id`, `slug`, `is_published` and both object keys identical to the values recorded at set-up; T2's public profile still loads |
| 47 | Cleanup | delete T2, T3 and T4 the same way | each verified complete; no fixture data remains |

### Tooling the matrix depends on

Three affordances exist specifically so these cases can be run:

- **`--full-keys`** prints every discovered object key in full. The default plan output abbreviates
  to 20 shortened paths, which is fine for a sanity check and useless for judging enumeration
  completeness. Keys only — never signed URLs, never tokens.
- **`ATHLESITE_DELETION_FORCE_PUBLIC_UNREACHABLE=1`** and
  **`ATHLESITE_DELETION_FORCE_PUBLIC_EXPOSED=1`** **inject a synthetic public-verification result**
  — UNREACHABLE (→ UNKNOWN) and one published row (→ EXPOSED).

  Be precise about the mechanism, because it bounds what these cases can prove. The switch is checked
  **before** the real `api()` call and returns in its place, so for that check **no HTTP request is
  issued at all**. Each injection is logged (`DIAGNOSTIC: public verification forced to …`). What the
  cases therefore exercise is the **result gate** — that an UNKNOWN or EXPOSED verdict refuses, and
  which refusal code it produces. They do **not** exercise the HTTP path, the RPC, or anything about
  how a real result is parsed; the unswitched runs elsewhere in this matrix cover that, and
  **production behaviour always issues the real request** — no code path reaches the injection unless
  the environment variable is set.

  Every alternative fails to isolate the gate. Blocking the host at the firewall also breaks
  authentication. Changing `NEXT_PUBLIC_SUPABASE_URL` changes the **environment fingerprint**, so the
  run is refused for an unrelated reason. And republishing a profile to make it genuinely exposed is
  caught by the row/publication check before the public check is reached, so the run refuses with
  `CONCURRENT_ACTIVITY` and the gate is never evaluated. With these switches, authentication succeeds
  and the bound environment is unchanged, so a refusal is attributable to the injected result alone.

  Both can only cause a refusal: neither UNKNOWN nor EXPOSED is treated anywhere as permission to
  proceed, so they cannot authorise destructive progress. A CLI test asserts each is read in exactly
  one place, does nothing but shape the public result, and cannot reach a mutation.
- **Lock reclaim reporting.** A run that recovers a dead holder prints which operation it reclaimed
  from, so case 11 has something to observe rather than an inference.

### Recording the results

For every case record the observation, not the expectation. Cases 36–37 in particular must record
**actual statuses and bodies** — they decide whether the operation may complete at all, under §16
step 5. File the results in `DECISIONS.md` alongside the 5D.7 acceptance record.
