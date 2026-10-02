# Native refresh route and replacement acceptance

Status: implementation candidate, 2 October 2026. **Operational adoption incomplete.**
The owner's bounded goal authorises one controlled collection and, only after the
release conditions below pass, one publication. It does not authorise permanent
unattended publication, automatic code merge, source-policy exceptions or resuming
an interrupted historical run.

## Architecture

Reuse the existing native **Tracker OSINT sweeps** automation
(`tracker-sunday-full-osint-sweep`), the repository preflight, acquisition journal,
public-index collector, rendered-public Chrome workflow and publication validators.
ChatGPT coordinates and reports from receipts. No Buzz agent, workflow, credential,
message, administrator broker or new command service is required for this route.
The installed broker and its files remain intact and disabled as last observed.

The agreed cadence remains daily **12:00 Europe/London**, Sunday full review and
Monday–Saturday at most ten substantive vessel reviews. Preserve the weekday
250,000-token target as a ceiling target, not a measured saving or hard enforcement.
No model is called by the deterministic preflight/collector. Browser and model
usage must remain unavailable unless actually measured. This milestone additionally
has a 60-minute active-work ceiling, one independent review and at most two repairs.

The existing native scheduler is preferred. An unprivileged macOS LaunchAgent is
only a fallback after permitted installation and proof of a single scheduling owner.
It would invoke the same fixed entrypoint under the user's existing permissions,
without `sudo`, a shell-command bridge, credentials in a plist, or security-setting
changes. Pause the former owner before activating a replacement; retain its records.
If platform permissions deny scheduler control or installation, stop with a handoff.
Do not move the action to another interface to evade that denial.

## B3/B4 disposition

B3 and B4 remain historical broker-specific acceptance tests: **B3 blocked, B4 not
run**. They are superseded *as prerequisites for this separate native route*, because
this route neither installs nor invokes the broker. They are not passed, and broker
activation remains prohibited by this route. Replacement acceptance is named
**NATIVE-SCHEDULED-1**, never B4. It has not passed.

This removes a dependency on the broker architecture, not the protections it was
intended to provide. No existing collection or publication hold is released merely
by this document, a configuration edit, a build or a manual success.

## Required replacement conditions

| Gate | Evidence required before release |
| --- | --- |
| Execution | Actual allowed network/write operations in the chosen scheduled context; no privilege expansion or managed-policy override. |
| Owner | Exactly one active production scheduling owner, retired RNFS dispatch disabled, exclusive current-run ownership, no conflicting writer. Unverifiable inventory is not a pass. Preserve unrelated schedules. |
| Identity | Current main and production payload agree with the explicit external private projection and actual roster. The inherited older default root must not select the baseline. |
| Recovery | Encrypted independent backup of the exact inputs and checkpoint state; archive and restored files hash-verified, adequate capacity, current matching preflight binding. Historical backup labels are insufficient. |
| Window/reuse | New, explicit fixed window and run identity. Verify journal chain before reuse; use the native plan for source-specific overlap/deeper obligations. Reuse only exact valid receipts/cache; failures cannot advance cursors. |
| Coverage | Required registry, official/entity/manual/X and integrity outcomes satisfied under existing rules. Seven discovery indexes alone cannot certify a sweep. Missing coverage blocks no-change and publication. |
| Evidence | Dated vessel-specific support, independent-origin corroboration where required, material conflicts resolved and provenance retained privately. No invented positions or unsupported precision; protected submarine symbols remain representative. |
| Website/release | Existing certificate and release-manager gates, append-only decisions/history, public projection, change summary, data/tests/build/client-exposure checks, exact candidate independent review and recoverable publication. Retain last good deployment on failure. |
| Scheduled proof | Independently correlate actual native schedule/run/thread records, timestamps, exact code/config/receipt hashes and process results. Manual execution, “Run now”, a supplied environment ID or a successful agent exit alone is insufficient. |

Only release the holds explicitly needed for the authorised run after their
replacement conditions pass. Keep publication held until all release gates pass;
keep future publication held after the one authorised opportunity is consumed.
Code/workflow changes use a branch and pull request; Luke retains merge authority.

## Existing entrypoint, bounded stage

Use an explicit `RNFS_PRIVATE_DATA_ROOT` and the existing private preflight config
schema in [osint-preflight.md](osint-preflight.md). The config must identify the
current run, live owner, checkpoint state and **fresh matching** backup receipt.
For discovery add `collectionOutput` and optionally `collectionCache`, both absolute
private paths. The cache is a native collector cache, not a success declaration.

```sh
node scripts/preflight-osint-sweep.mjs --config=/private/path/config.json \
  --output=/private/path/preflight.json --then=indexes \
  --result=/private/path/stage.json
```

No command above prepares a backup, creates ownership, releases a hold or chooses a
historical run implicitly. Those prerequisites must already be established under the
run contract. `--then=plan` invokes the existing acquisition planner without collection.
With no `--then`, behaviour remains check-only.

The indexes stage allows two attempts per source, 15 seconds per request, two
concurrent requests, one per domain and the collector's existing 2 MB response limit.
Redirects count as HTTP requests, so attempts are not a total-request count. The child
has a five-minute deadline. Required failed sources remain explicit. Interrupted
checkpoints/cache are retained; recovery uses a new output name and the same verified
run/window, never a blind repeat. Successful same-window receipts are reused by the
existing collector. A changed cutoff requires a new validated plan, not copied success.

Preflight is persisted before stage dispatch. A separate private stage receipt binds
the run/window, preflight digest and resulting artifact digest, records known request
usage and distinguishes planning, incomplete discovery and discovery awaiting review.
If a child fails before a checkpoint, collection-start state is unknown, not false.
A successful indexes stage still sets `publicationEligible` and `noChangeClaimAllowed`
false. `schedulerAcceptance` stays `NOT_ESTABLISHED`: external native correlation is
required. Standard output contains aggregate results, not private source payloads.

## 2 October verification and remaining work

Current main was verified at `b74ab7b911024ea3257cb5092aa95658b3c44cf6` through a harmless
GitHub ref read. The dirty primary checkout and interrupted September runs were
preserved. The 30 September scheduled-readiness report has a separately recorded
review, but that trial used temporary command rules; it is not permanent executor
acceptance and did not collect or publish.

The native automation tool was rejected by the platform approval policy, including
read access. No alternate control interface or new schedule was attempted. The native
configuration on disk still records daily noon, active but check-only. The user
LaunchAgent directory is outside this session's writable scope; no installation was
attempted. Current global Buzz dispatch inventory is not independently established;
repository retirement records do not prove there are no duplicates.

The independent backup volume had 13,430,784 bytes available, below the existing
24,000,000-byte minimum (50,000,000 recommended), and macOS Disk Management could not
provide the encryption probe. Neither is repaired by a configuration edit. Collection,
review and publication remain held. Private live receipts and the current operator
handoff contain the exact attempt result; no source evidence is committed here.

For continuation: provide the existing encrypted backup volume with at least 50 MB
free while preserving retained backups, then use an execution context that permits
native scheduler control and the normal encryption query. Apply the reviewed branch
through the existing merge rule. Schedule one bounded invocation on the existing
owner; correlate its actual run, restore noon cadence after any temporary trial time,
and remove temporary tasks. Do not repeat successful acquisition merely to prove the
scheduler. This is a remaining operator action, not a claim of scheduled acceptance.
