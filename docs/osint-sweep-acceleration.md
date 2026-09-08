# Incremental OSINT sweep execution

## Scope and rollout

The implementation extends the existing Node sweep rather than changing the web application,
registry authority, map, deployment or historical ledgers. It is not evidence of a successful new
weekly sweep. The 25–45 minute target and under-60-minute objective require a timed live complete
run; the measurements below do not establish them. No automated publication is authorised.

The operator remains Codex, using its supported Computer Use connection to the existing signed-in
Chrome for public X. Acquisition and deterministic preprocessing do not require Astra Extra High.
Priority 1 adjudication uses `gpt-6-astra` with `xhigh`; Priority 2 requires verification; Priority 3
includes exact previously reviewed corroboration and narrowly recognised irrelevant text. Unknown dates, unmatched entities, revisions,
state/location transitions, protected activity and conflicts escalate. Keyword matches never
become accepted fleet facts. No model API key or autonomous model caller is introduced.

The deterministic irrelevant rule currently recognises only standalone seasonal greetings with
no tracked entity. It requires explicit `contentComplete: true` and `hasUnexaminedMedia: false`
on the acquisition item. Excerpts, unknown media coverage, quoted content, links, revisions and
additional claims remain escalated. Existing browser excerpt adapters deliberately do not assert
these flags. Each downgrade preserves its rule ID and superseded review reasons in `triageAudit`;
the item stays in the ledger, does not corroborate fleet state, cannot refresh stale support, and
still needs a certificate-bound disposition. Conflicts override the downgrade. This narrow rule
is not evidence of a reduction in the current live historical queue.

## Retained architecture and inspection findings

- The daily noon Europe/London Codex heartbeat selects the full Sunday sweep or bounded weekday
  discovery. The independent Sunday GitHub job collects seven public indexes; the watchdog checks
  missed publication. Neither substitutes for a full sweep.
- `sources.json` under the external private-input resolver is canonical. `sources` describes
  authority and provenance; `operations` supplies retrieval metadata. Historical evidence pages
  are not automatically recurring sources. At inspection: 187 registered records, 77 mandatory
  recurring sources, 91 enabled X profiles, including 71 mandatory X profiles.
- `sweep.mjs` already binds source coverage, the roster, prior assessments, exact half-open window,
  per-vessel outcomes, six integrity reviews and the final release-content hash. These gates remain.
- The original HTTP collector awaited each index in a loop. Browser observations were recorded
  individually into a resumable session. There was no cross-sweep durable content cursor.
- Existing candidate extraction, date separation, origin clustering, conflict detection, assessment
  revisions and public precision checks remain authoritative. The new queue is an internal aid.
- Cloudflare Workers and the Pages build remain unchanged. Private artifacts never enter CI or
  public vessel cards. Existing historical snapshots are untouched.

## Registry and acquisition tasks

`buildOperationalSourceRegistry` adds an `acquisition` object to its deterministic operational
projection. Existing stored operations remain readable; defaults do not mutate the private registry.
Fields are adapter, rate-limit group, authentication requirement, cursor kind, parser version and
bounded retry policy. Identity, coverage, authority, requiredness, cadence and prior health fields
remain on existing records. Runtime health/cursors come from transactions joined by source ID.

Review and persist operational metadata through the existing Source Registry Auditor's guarded
write path when promoting configuration. Do not maintain a second source inventory. New sources
must first be registered with the existing canonical ID/authority/terms/coverage workflow, then
assigned a permitted adapter and policy. Defaults are routing proposals, not permission to scrape.
Missing adapters end as `DEFERRED_WITH_JUSTIFICATION`, never successful empty retrieval.

Prepare an incremental acquisition plan outside every checkout:

```sh
npm run sweep:incremental -- --mode=plan --run=/private/run.json --state=/private/acquisition
```

Paths above are placeholders: use the encrypted external private store. A full plan includes all
mandatory recurring sources and every enabled optional X account. HTTP discovery still runs through
`sweep:collect` and its native ledger; seven index checks remain separate mandatory coverage gates.
The plan binds the run ID, registry hash, per-source acquisition window and durable prior cursor.

## Concurrency and source adapter boundary

The public-index collector now uses four workers and one request per publisher host at a time.
It retains HTTPS host allowlists, bounded response size, content-type validation, redirects and a
20-second request timeout. No X HTTP adapter or new website crawler is introduced.

`boundedMap` supports 1–16 global workers and independent group caps. The acquisition coordinator
uses bounded attempts and exponential delay, honours Retry-After without shortening it, and stops
retrying authentication/parser/configuration failures. If a Retry-After exceeds the allowed wait,
the source remains rate-limited for later recovery. Adapters must honour their AbortSignal and
implement bounded request timeouts; the coordinator cannot forcibly cancel an arbitrary callback.

For rendered Chrome, execute the existing six-account canary first. After successful canary review,
Codex may keep two independently addressed tabs in flight, inspect fresh rendered state, and persist
observations immediately. Never run concurrent writes to one native session file. One coordinator
owns all state commits. Two-tab navigation/render capability was checked on 8 September 2026 for the
Royal Navy and DefenceHQ pages; this is not full canary or coverage validation. Verify capability
at each scheduled wake and reduce to one tab if unavailable. Do not bypass access controls or use
hidden DOM state, cookies, network responses, APIs or providers.

Browser navigation is still performed by the supported Codex tool, not by a Node/browser service.
`plan.json` is the work list; an observation packet is the adapter handoff. The repository does not
launch unattended X browsing. The `process` command parallelises packet validation and extraction;
its runtime is not the browser acquisition runtime.

## Cursors, retrospective audit and recovery

An exclusive `writer.lock` prevents concurrent journal owners. Numbered hash-chained JSON
transactions commit complete source extraction and its cursor together using fsync and atomic
rename. A failed attempt records a null cursor; replay finds the last successful transaction.
Successful same-run repeats are no-ops. A changed registry/window binding refuses same-run recovery.
Interrupted unfinished sources are reattempted; missing source dispositions keep certification failed.

A cursor retains stable item/post IDs, item content hashes in the ledger, latest content timestamp,
examined-through timestamp, parser version, last deeper-audit date and optional HTTP validator.
Content IDs plus hashes detect edited content without relying solely on publication timestamps.
Normal windows overlap the previous successful examination by seven days. First retrieval, parser
version change or a 30-day deeper-audit interval selects at least 90 historical days. These values
are configurable in `retrievalWindow`. The release's evidence cutoff remains unchanged. Older or
revised evidence is routed for review, never silently substituted into current public state.

A parser must disposition every new item before cursor commit. Malformed browser posts now yield a
native `failed` / `schema-failed` source result rather than silently counting as a successful check.
Do not advance any cursor from a partially decoded source. Duplicate unchanged content is not sent
back through extraction, but the successful source examination is still recorded each run.

An interrupted process can leave a lock. Check that its owner is dead and that no scheduled owner
exists, preserve the lock as incident evidence, then move it aside deliberately before replay. Never
steal a live lock. Malformed JSON, a sequence gap or hash-chain mismatch is ledger corruption and
requires restoring a verified backup, not truncating history. Make a versioned encrypted backup
before first rollout. Existing source/evidence/snapshot files are never overwritten by migration.

## Observation packets and preprocessing

Store packets outside every checkout, named `SHA256(JSON-stringified-source-ID).json`; use exported
`digest(sourceId)` to avoid filename ambiguity. Each packet binds `runId`, `registryHash`, `sourceId`,
and the exact task `window` including deep/parser-version flags. Failure packets contain a supported
outcome and a reason. Successful non-X packets contain `examined: true`, `extractionComplete: true`,
method metadata and items with stable `id`, `url`, `publishedAt`, bounded `text`, optional explicit
`eventTime`, `retrievedAt` and `originId`. A successful empty list is an explicit examined result.
These are completed observations, not declarations that an unvisited source was checked.

A failed/deferred packet may retain valid partial evidence without claiming coverage. For X, attach
`partialObservation` using the native checked-observation contract and its actual narrower window,
contained within the planned acquisition interval. Direct `partialItems` are forbidden for X. For
other approved adapters, `partialItems` plus method metadata retain already extracted items. Every
partial item is validated, deduplicated and escalated with `incomplete-source-coverage`; the source
remains failed/deferred and its cursor stays null. Malformed partial extraction fails closed.

For X, also provide the native `observation` from the existing browser contract and a rendered
Chrome `method`. The processor runs the existing normalizer against the source and acquisition
window. Raw posts, author identities, stable IDs, exact timestamps, method and typed blockers must
validate. Capture enough bounded supporting text for dates and uncertainty; summaries cannot create
facts absent from the rendered post. Image-only evidence remains an analyst review obligation.

```sh
npm run sweep:incremental -- --mode=process --run=/private/run.json --state=/private/acquisition --packets=/private/packets
npm run sweep:incremental -- --mode=status --run=/private/run.json --state=/private/acquisition
```

The processor writes `acquisition.json`, `adjudication-queue.json` and a native `processed-sweep-run.json` with source outcomes. Continue vessel and integrity review from that unsealed processed run; the input run is preserved. Candidate IDs, source authority,
publication/event/retrieval dates, quoted spans, candidate status/location, origins, priority and
reason codes remain private. Every novel item is retained or escalated; no uncertain material is
classified as irrelevant automatically. Exact reviewed corroboration can use Priority 3 when the
caller supplies matching retained reviewed evidence. The CLI currently conservatively queues new
items for review. No automatic fleet-state acceptance occurs.

## Adjudication, fleet reconciliation and certificate

Adjudication decisions require evidence ID, candidate hash, reviewer, review time, outcome and reason.
Use `accepted`, `rejected`, `corroboration` or `irrelevant`. State-change decisions also carry
`proposedChange`. Conflicts retain their candidate IDs and require a resolution, reason and supporting
evidence IDs. Detected conflicts cannot be omitted from certification. Acceptance still requires
normal evidence ingestion and a new native assessment revision with selected evidence.

After native finalisation, `sweep:certificate` checks real schemas, the evidence ledger, current
assessment references and regenerated candidate snapshot, and runs the repository regression suite.
It derives reconciliation for every current fleet vessel, including previous/current assessment,
retained support, review completion, temporal checks, conflicts and stale-support warnings. Native
assessment/projection validation remains responsible for location plausibility, protected activity,
representative CASD markers and precision. No coordinates are inferred by preprocessing.

Stale defaults are Alongside 14 days, Deployed 30 days, native `In re-fit` and Maintenance 180 days,
Museum ship 365 days, otherwise 60 days. An explicitly unknown/conflated observation date cannot
be refreshed by an import's publication date; it remains an unknown-age warning.
Staleness flags a deeper-check priority; it never changes fleet status. A successful deeper check records `lastStaleAuditAt` so an unresolved old record does not force the same historical audit every week; monthly audits and parser changes still apply. Failed checks do not mark that obligation satisfied. Shore-establishment and retired
record reviews remain the existing separate workflow; the new reconciliation certificate currently
covers the native current-vessel roster only.

```sh
npm run sweep:finalise -- /private/run.json
npm run sweep:certificate -- --run=/private/run.json --acquisition=/private/acquisition/acquisition.json --adjudication=/private/decisions.json
```

A certificate is mandatory for releases dated 9 September 2026 onward. Existing sealed history is
grandfathered. The native release gate recomputes the certificate from its bound inputs; missing,
failed, tampered or mismatched certificates block release. Missing mandatory sources, unresolved
conflicts, missing decisions, incomplete vessel reconciliation or invalid validation evidence fail.
No new exception policy is enabled: a mandatory unavailable source remains a blocker. A certificate
is not owner publication permission, a build, deployment, or rendered production verification.

## Observability and responsibility integration

- Source Registry Auditor owns registry completeness, source/cursor health, adapter configuration
  and duplicate/obsolete-source proposals. A failed/degraded pre-sweep gate still blocks no-change.
- Evidence Sweep owns plans, bounded acquisition, packet preprocessing, adjudication and complete
  source/vessel review. It must preserve source-family order where authority review requires it;
  network acquisition may overlap without promoting lower-authority evidence first.
- Release Manager consumes the native finalised run and certificate, then existing validations,
  builds, append-only snapshot preparation and owner-reviewed release handoff. Its installed skill
  remains dry-run and does not itself deploy.
- Acceptance and Completion Auditor checks the exact final code/run, actual versus replay evidence,
  full coverage, tests, reconciliation and any later published-state read-back.

No duplicate skills are installed. The existing skills consume this repository runbook and native
artifacts. The live automation has not been rewritten or activated against this candidate branch.

`status` reports source progress, outcome counts, candidate count and slow sources. The existing
private health model exposes the certificate and acquisition timing. Timing distinguishes acquisition
wall time, summed adapter source/extraction work, per-source time, peak concurrency and finalisation.
`sweep:time -- --stage=NAME --directory=PRIVATE_TIMING_DIR --run-id=ID -- COMMAND` writes separate immutable start/end events, duration and exit state for each supported phase. An unmatched start identifies interruption. This wrapper measures registry loading, acquisition startup, browser acquisition, extraction, preprocessing, adjudication, reconciliation, integrity audit, validation, snapshot generation and deployment when those commands actually run. A complete live operator record must additionally time canary, actual browser capture, adjudication,
reconciliation, integrity review, builds, snapshot generation and authorised deployment. These stages
must be marked unmeasured when not run; packet processing cannot stand in for their timings.

## Validation and measured limitations

`npm run test:acceleration` exercises 77 synthetic source checks with bounded concurrency four,
atomic recovery, lock exclusion, cursor failure, duplicates, historical edits, retry/rate limits,
parser failure, missing adapters, version/deep windows, corruption, interruption, preprocessing,
conflicts, stale records, certificates and release blockers. Existing browser and sweep regressions
remain part of `npm test` and both builds.

`node scripts/benchmark-osint-replay.mjs --session=RELATIVE_PRIVATE_SESSION_PATH` replays an existing
full browser session in memory, preserving failures and printing aggregate counts only. The measured
6 September session contains 95 account dispositions, 90 checked, five unavailable and 67 posts.
Its recorded elapsed span is 5,205,805 ms (86m 46s), including operator delays and excluding prior
canary work. Serial replay took approximately 16 ms; four-worker replay approximately 5 ms. All 67
items conservatively required Priority 1 review and four conflict groups were detected. These are
historical-content replay measurements, not a claim that browser acquisition or Astra took 5 ms.

The dominant remaining performance risk is rendered browser capture plus analytical review. At two
browser workers, 91 profiles must average below about 59 seconds per profile to leave 15 minutes
inside a 60-minute run for all other work, excluding canary/retry overhead. This is a budget, not a
measured throughput claim. A live complete timed run is still required before operational activation.

### Live validation on 8 September 2026

After an encrypted external backup and hash-verified restore, a separate private dry run examined
all 91 X profiles using the six-account canary and two rendered Chrome tabs. All 71 mandatory X
profiles were checked: 87 profiles checked overall, three optional profiles unavailable, one optional
profile with an identity mismatch, and no rate limiting. The browser stage, including canary and a
quote-identifier repair, spanned 38m 59s. The seven HTTP indexes completed in 1.06 seconds at peak four.

This was a roughly 57-hour evidence interval, **not a normal seven-day sweep**. It captured 23 X
posts. The first-run 90-day audit completed for 45 of 97 acquisition tasks (39 of 77 mandatory);
48 remained explicitly deferred and four unavailable. Fourteen historical/bootstrap items were
extracted. Packet processing took 1.61 seconds; it does not include browsing. All 97 tasks received
typed outcomes, incomplete sources received no cursor, and the incomplete run's FAIL certificate
was rejected by the release gate. No new snapshot was published or scheduler activated.

Rendered website fallbacks exposed news and harbour data absent from text extraction. Root-directory
retrieval does not prove all child unit pages or historical entries were examined. These gaps remain
release blockers. Partial-source discoveries are retained in the native browser/website artifacts
and automatically accompany adjudication even when their deeper acquisition transaction fails.
Reprocessing the captured observations with the repaired handoff placed all 39 retained items into
the standard queue in 1.71 seconds, including 25 partial-source items. Coverage remained failed.

The live review also found two preprocessing issues now covered by regression tests: an account's
own vessel must remain a candidate when another vessel is named, and class-level wording must not
identify a single hull. Default parser version 2 triggers re-extraction on the next run; version-1
live transactions remain immutable audit evidence. Do not reuse the initial journal as proof that
the corrected parser has completed its bootstrap. The final regression suite has 36 acceleration
checks plus the controlled 100-source/68-vessel CLI pipeline and existing project checks.

The under-60-minute whole-sweep objective remains unproven. Live evidence identifies the remaining
costs: rendered acquisition, historical baseline completion, dynamic website traversal and analytical
reconciliation. A fast processor or short-window source check cannot satisfy those obligations.

## Rollback

Revert the acceleration code commit to restore the former workflow. Retain all private transaction
files, source registry, evidence and historical snapshots. Do not downgrade, delete or reseal a
historical run. Pause any later activated accelerated scheduler before restoring its predecessor;
never run two sweep owners. No deployment-platform or public-data migration is required.
