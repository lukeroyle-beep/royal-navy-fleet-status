# Command Centre reporting

This is an outcome-reporting extension to **Tracker OSINT sweeps**, not a collector,
release gate, publisher, separate scheduler or credential service. The existing
Codex task uses supported authenticated Pages tools. Node only prepares and verifies
private records and guarded Page operations. No unattended Space capability is
assumed from collection authentication or interactive Page access.

Targets (never create replacements):
- Command Centre: `page_16c3cf55b8d48191b8750da033279fa5`
- Existing History: `page_bb858131ca6c8191ab2650a42515bfa3`

Use the [compact execution and file transport](compact-sweep-execution.md) to keep full Page
objects in private files. This changes transport, not edit or readback semantics.

## Every invocation, including manual execution

Use the durable private `command-centre-outbox` directory under the existing
operational handoff. Before any preflight or other prerequisite, allocate the run
identity and save a private reporting context containing `runId`, `runStartedAt`,
`trigger` (`scheduled` or `manual`), `lastGoodRelease`, `nextScheduledAt` (ISO instant
from verified existing scheduler state, or null), and `references` (verified
accessible GitHub receipts/releases or Pages links). These fields are the context,
not source payloads. Use the same run identity for all recovery and publication
events; a new scheduler invocation does not by itself establish a new sweep.
Set `RNFS_COMMAND_CENTRE_OUTBOX` and `RNFS_COMMAND_CENTRE_CONTEXT` explicitly when
invoking native preflight. The preflight entrypoint enqueues its persisted outcome,
including rejected config/early exits. Missing reporting configuration is not proof
of reporting enablement. Preserve an enqueue error sidecar and replay the receipt
on the next invocation before doing further collection.

At invocation start, replay pending updates before normal workflow. At every later
recorded terminal outcome, recovery or publication result, enqueue a sanitised event
before returning to the user, even when a prerequisite or gate caused an early stop.
This finalisation is mandatory for the Codex coordinator: browser/manual collection
and publication occur outside the preflight Node process. Do not infer a terminal
sweep outcome from a successful discovery stage; that stage reports IN_PROGRESS.
Abrupt coordinator termination cannot promise an immediate Page write: the next
invocation reconciles recorded receipts and unfinished reporting attempts.

The event schema is validated by `scripts/lib/command-centre.mjs`. Use all fields:
`schemaVersion:1`, stable `runId`, stable `eventId`, increasing integer `revision`,
`runStartedAt`, `recordedAt`, `evidenceAt`, nullable `completedAt`, `trigger`,
`outcome`, coverage pairs for `sources`, `discovery`, `vessels`, `integrity`,
`publication`, `lastGoodRelease`, `blocker`, `nextAction`, `backup`, nullable
`nextScheduledAt`, `facts`, and accessible `references: [{label,url}]`.
Allowed outcomes: PUBLISHED, NO_CHANGES, BLOCKED_COVERAGE, PREFLIGHT_FAILED,
COLLECTION_FAILED, PUBLICATION_FAILED and nonterminal IN_PROGRESS. Use null counts
for unknowns. PUBLISHED and NO_CHANGES require recorded full coverage. Do not
reinterpret required sources with policy exceptions without an explicit evidence
qualification. Evidence and completion clocks are separate; all rendered times use
Europe/London with BST/GMT. The delivery receipt records confirmed readback time.

Use the recorded event timestamp in epoch milliseconds as the revision, and a stable
receipt-derived suffix for eventId. Do not invent a newer timestamp to replay an old
event. Never copy raw errors, source payloads, coordinates, credentials or private
paths into public fields. All text is bounded and screened; this is a defence in
depth check, not a substitute for reviewing the sanitised event. Private receipt paths
and SHA-256 bindings live only in the private queue. Verify claims against those
receipts. A valid hash establishes binding, not semantic truth.

```sh
node scripts/command-centre.mjs record --outbox=/private/outbox --input=/private/event-envelope.json
node scripts/command-centre.mjs pending --outbox=/private/outbox
```

The envelope is `{event,receipts:[{path,sha256}]}`. Enqueue is idempotent; identifier
collisions, inconsistent revisions and receipt hash mismatches fail closed. Immutable records and atomic fsynced publication protect the queue without a
process-owned writer lock. A terminated writer leaves either a complete pending
record or an ignored temporary file. Revision reservations retain the complete
event so interruption between reservation and event indexing cannot lose it. Preserve all
recorded outcomes, including superseded revisions, and delivery attempt errors.

## Authenticated delivery adapter in the existing Codex task

1. `begin --outbox=... --event=... --invocation=<actual-native-thread-id> --context=scheduled`
   (manual for interactive runs). Retain returned attempt ID. Maximum two attempts
   per event per invocation. Do not generate new invocation IDs to evade this bound.
2. Read both existing Pages with `chatgpt_space.read_page`, retaining complete
   structuredContent and guidance. No browser session extraction, hidden endpoints,
   cookie transfer, broker or secondary authentication path is permitted.
3. Save tool read results privately. For each Page call `plan --input=...` with
   `{page,event,kind:'summary'|'history',savedAt:<current-ISO-time>}`. It outputs guarded
   operations. Pass only page_id, stream_kind and operations to the supported
   `chatgpt_space.edit_page`. Inspect every operation result. Do not reconstruct
   block IDs, hashes or selectors. Zero operations means reconcile by readback.
4. Read both saved Pages again with the supported tool, saving their full results.
   Call `confirm --input=...` with `{page,event,plan,confirmedAt:<time-of-readback>}`
   for each matching readback. Apply its guarded operations and reread once more.
   This publishes the confirmed content-readback time, distinct from the attempted
   write time. If interrupted during confirmation, replay reconciles the same event.
   Call `finish --outbox=... --attempt=... --input=...` with
   `{event,plans:[confirmedSummaryPlan,confirmedHistoryPlan],readbacks:[finalSummaryRead,finalHistoryRead]}`.
   Only matching content AND stable event metadata mark delivery complete. The
   resulting `confirmedAt` is the readback confirmation clock; the Page separately
   displays the write-attempt time. Preserve tool receipts alongside this record.
5. On any failure call finish with `{error:'<sanitised exact capability/error code>'}`.
   Leave the outcome pending, without modifying sweep success/failure. On unknown
   edit outcome, reread rather than blindly resubmit. Partial two-Page writes are
   safe to replay: already matching events are not reinserted. A stale incoming
   event never replaces a newer run summary or same-run history revision.
6. Stop at two attempts in this invocation. On access denial or missing supported
   tools, stop immediately, retain pending payload and exact capability failure.
   Replay on the existing workflow's next invocation. Never collect to retry delivery.

Metadata marks only reporting-owned content. Unrelated blocks and manual additions
are preserved. Editing inside a managed table causes MANUAL_EDIT_CONFLICT instead
of silently discarding the edit. Reconcile under explicit review; do not clear its
metadata or replace the Page. Later events for an existing run replace that run's
managed history block, preserving surrounding history. A newer run can replace the
summary while an older run's later recovery still updates its own history.

## Scheduled proof and adoption

Fixture tests prove logic only. Production acceptance additionally requires a real
scheduler-originated attempt with actual native automation/thread correlation,
supported authenticated writes to both Pages, matching readbacks, and a delivered
queue receipt. A supplied context string or interactive success does not prove this.
Use a reporting-only replay of an already recorded outcome, never an extra sweep.
Keep the original daily noon schedule and collection/publication gates. Workflow
code uses a reviewed PR; Luke retains merge authority. Report implementation,
interactive delivery, scheduled delivery and merged/adopted state separately.
