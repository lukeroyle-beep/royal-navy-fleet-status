# Bounded sweep review and execution

These helpers implement lower-overhead preparation and review. They do not resume
collection, accept evidence, change required sources, or authorise publication.
Use the existing startup, owner, encrypted backup, source, certificate and release
gates. Keep one coordinator and one writer. No new scheduler or agent is needed.

## Review only what still needs a decision

`sweep:incremental -- --mode=process ... --compact` keeps full acquisition and
candidate data in private files and prints one bounded summary instead of one
line per source. It writes `review-plan.json` beside the unchanged native queue.
New extraction compares against the run's frozen baseline assessments, selected
unconflicted evidence and known public place labels. It never reads a newer
published state as the baseline or substitutes publication dates for event dates.
Existing acquisition transactions and decisions are not migrated or overwritten.

For an existing run, prepare a read-only plan using the exact acquisition and the
latest retained adjudication file:

```text
npm run sweep:review-plan -- --acquisition=/private/acquisition.json --adjudication=/private/adjudication.json --output=/private/new-review-plan.json
npm run sweep:review-plan -- --acquisition=/private/acquisition.json --adjudication=/private/adjudication.json --batch=0 --output=/private/new-review-batch-0.json
```

All paths are placeholders outside every checkout. Outputs are create-only with
owner-only permissions. Each plan binds both input hashes, lists every candidate
and its original hash, and groups outstanding review into at most 12 candidates
and 18,000 candidate-content characters per batch. Full evidence is loaded only
for the selected batch. Oversized candidates stop for a narrower review design;
they are never truncated or dropped. Refuse stale plans when input hashes change.

Priority and reasoning effort are separate. Explicit state/location claims,
conflicts, revisions, protected activity, unresolved known entities, unknown
reason codes and retrospective evidence retain deep review. Other unresolved
activity gets bounded verification at medium effort, not automatic irrelevance.
Escalate a potentially material or still-uncertain interpretation before accepting
it. Image-only/partly visible content still requires examination. Every candidate
still needs an individual reason, reviewer, date, outcome and exact candidate hash.
Only an exact existing decision can be retained; changed hashes, explicitly pending
candidates and unresolved detected conflicts require review. The plan cannot grant
coverage or publication and does not replace native certificate validation.

## Browser batch after collection prerequisites pass

The optional PR135 dedicated headed Chrome profile remains the sole profile used
by this worker. Manual sign-in, private profile handling and source-method limits
are unchanged. Use `observe-batch --authorised-collection /private/batch.json` with
`RNFS_SWEEP_USAGE_SESSION` pointing to the current protected native journal.
An absent, stale or exhausted usage record stops work. The JSON job has exactly
`registry`, `run`, `session`, `requests`, and `maxDurationMs`. The first three are
existing private input paths; each request uses the existing single-operation
contract in [dedicated-browser-worker.md](dedicated-browser-worker.md).

The batch allows one to six operations, at most 90 seconds from browser launch
through observations, one browser context and one page. Each operation retains
its original 30-second/two-scroll maximum and cumulative per-source limits. The
existing native work guard runs before launch and before every operation. Browser
cleanup remains required after the observation deadline. A blocked source, expired
budget, challenge, identity failure or deadline stops the batch; remaining requests
are explicitly pending. Nothing retries automatically. Same-ID recovery reuses
verified immutable observations; an interrupted reservation requires inspection.

Receipts carry a source checkpoint path. Review *all* operations retained for that
source before constructing the existing recorder's cumulative observation. Every
worker receipt remains `coverageComplete:false` and `sourceReviewRequired:true`.
Full source coverage is established only by the native reviewed source contract,
including the required window and exhaustion/limit evidence. A viewport or finished
batch is not a completed source, no-change result or fleet sweep. Failure reports
retain only a fixed phase and sanitized error class; raw browser messages, URLs,
credentials and profile details are not logged.

## Measure the complete cost once

Use `npm run sweep:usage-report -- --input=/private/spec.json --output=/private/new-usage.json`
after completion, from the parent coordinator, to include the worker's final
response. The spec contains `sessions: [{path, threadId, phases?: [{name,from,to}]}]`.
List the coordinator, worker and reporting sessions once each (maximum eight).
Paths must be the protected native session journals, bound to their actual IDs.
The parser uses only provider token-count metadata, never emits transcript content,
rejects missing/reset counters, and does not double-count repeated events or IDs.

Report first/peak input, context capacity, response count, cumulative total,
cached/uncached input and output separately. Optional non-overlapping phases use
response-completion timestamps; this is not precise attribution inside tool calls.
Unassigned responses remain visible. Journal coverage and omitted sessions limit
the result. These totals are neither a currency charge nor an account-allowance
percentage. The command guard remains a 200k work stop with 50k reserve, not a hard
conversation cap; this change does not raise it. Continue checking the account's
weekly meter and honour the user's 50% remaining checkpoint instruction.

Reuse the existing thin bootstrap and guarded reporting cell. Do not read source
implementations or full histories on each wake, poll a worker repeatedly for its
own final token count, or create another chat to reset aggregate accounting.

## Adoption and rollback

Offline tests and saved-evidence replay establish routing, preservation and recovery
behavior only. They do not prove browser login persistence, live fleet completion,
elapsed-time savings or weekly allowance savings. After review and human merge,
use one separately bounded, authorised acceptance with a fixed source set, window,
browser route and budget; keep routine scheduling paused until full acceptance.
On a deterministic failure, save the checkpoint and diagnose its typed phase rather
than chaining micro-tests. Revert this code to roll back; preserve private evidence,
decisions, profile, original receipts and the last good publication.
