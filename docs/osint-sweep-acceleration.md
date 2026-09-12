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
Only the owner-approved initial public AIS and official-directory baseline exceptions described below are enabled; other mandatory unavailable sources remain blockers. A certificate
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
the corrected parser has completed its bootstrap. The final regression suite has 39 acceleration
checks plus the controlled 100-source/68-vessel CLI pipeline and existing project checks.

The later checkpoint completed 76 of 97 deep acquisition tasks, including 70 of 77 mandatory
sources. Seventeen tasks remained deferred and four unavailable. The ledger retained 482 candidates,
including 100 partial-source items; only 10 earlier decisions still matched both claim and content
hash, leaving 472 pending. The most recent packet-processing pass took 1.20 seconds at peak four,
excluding all browsing and analytical work. All 68 fleet records were inspected, but none was
falsely marked reconciled. The FAIL certificate was rejected again. The live run remained incomplete
more than two hours after starting; this includes cold bootstrap and implementation repairs.
A verified encrypted checkpoint contains 735 files and 7,401,762 bytes. These later counts supersede
the initial checkpoint above; neither is a complete weekly runtime measurement.

The under-60-minute whole-sweep objective remains unproven. Live evidence identifies the remaining
costs: rendered acquisition, historical baseline completion, dynamic website traversal and analytical
reconciliation. A fast processor or short-window source check cannot satisfy those obligations.

## Rollback

Revert the acceleration code commit to restore the former workflow. Retain all private transaction
files, source registry, evidence and historical snapshots. Do not downgrade, delete or reseal a
historical run. Pause any later activated accelerated scheduler before restoring its predecessor;
never run two sweep owners. No deployment-platform or public-data migration is required.

## Approved current-only AIS bootstrap policy (8 September 2026)

The owner approved `public-ais-initial-baseline-2026-09-08` for
`MARINEVESSELTRAFFIC_NATO_DISCOVERY` and `VESSELFINDER_PUBLIC_WEEKLY` only.
An initial packet may carry `historicalException` with `policyId`,
`approvalReference: "owner-approval-2026-09-08"`, an explicit reason,
`historicalDisposition: "SOURCE_UNAVAILABLE"`, and the exact `windowFrom`/`windowTo`.
Its `currentReview` must include `complete: true`, `asOf` matching the cutoff,
`completedAt`, `reviewer`, the SHA-256 `artifactHash` of the full current review,
and nonempty private `evidenceRefs`. Ordinary `examined`, `extractionComplete`,
method and item validation still apply. A missing or incomplete current review fails.

The resulting outcome is `CHECKED_CURRENT_BASELINE_WITH_HISTORICAL_EXCEPTION`.
The certificate lists this separately from successfully examined full windows and
retains the historical exception. Earlier failed transactions remain immutable.
The cursor starts at the current examination and carries the historical gap forever;
future incremental/monthly comparisons cannot claim to cover the unavailable period
before that baseline. Subsequent failures cannot use this bootstrap exception.
No live packet has been granted an exception merely because the policy was approved.
All other coverage, adjudication, reconciliation and publication gates remain required.

## Last-known location when current whereabouts are uncertain

The owner's display policy is to retain the last supported public location rather
than remove a vessel's marker merely because current whereabouts are unknown or
ambiguous. During adjudication, an unknown-location assessment should carry a reviewed
`retainedLocation` object referencing `assessmentId`, retained `evidenceIds`, the
original `observedAt`, `reason` (`current-location-unknown` or
`current-location-ambiguous`), `reviewedBy` and `reviewedAt`. Supporting IDs must still
be selected by the new assessment and the prior assessment. They must have dated,
direct, unsuperseded evidence. The ordinary assessment validator checks this record.

The public projection uses the prior reviewed geometry and precision, marks it
`last_reported`, and labels its original date and the uncertainty of the current
location. It preserves the new operational status. It does not expose internal
references, change evidence dates or refresh freshness. Reconciliation blocks an
unknown-location transition that drops an available supported baseline location
without this retention review. No arbitrary old point, home port or current position
is copied into a historical snapshot. Withdrawn/excluded or superseded evidence
cannot support retention. Withheld locations and protected submarines cannot use this
automatic fallback; existing representative/CASD rules remain unchanged. With no valid
retained public location, the vessel remains in the list without an invented marker.

## Additional gate validation

Conflict resolutions must use `resolved`, `resolved-temporal-progression`,
`resolved-source-precedence` or `dismissed-not-material`, with a reason and supporting
evidence references. A nonempty `unresolved` or arbitrary label is never a resolution.
Every fleet reconciliation record must independently pass with no issues; passing
aggregate counts cannot override a failing vessel. Retained observation dates use the
existing evidence schema's `explicit` or reviewed `inferred` basis; unknown or legacy
conflated dates remain ineligible for automatic retention.

Additional live adjudication identified an entity substring error: the bare alias `Express`
matched `expressly`. The shared normaliser now requires Unicode identifier boundaries for names,
aliases and pennants. Its version is stored independently of the acquisition adapter parser;
an upgrade forces deeper re-extraction and prevents same-run reuse of old normalisation output.
Historical exception floors and the previous successful cursor remain retained. Existing journal
transactions and reviewed candidate hashes are never rewritten by this change.

The individual review checkpoint now has 482 resolved decisions and no pending candidate
reviews. Source coverage and fleet reconciliation remain separate unfinished gates. This is a review checkpoint, not a
PASS certificate: mandatory deeper source coverage and fleet reconciliation remain incomplete.
The 53-check acceleration regression suite includes identifier boundaries, exact registered
account handles, and same-run normaliser-upgrade recovery, including failed upgrade handling. These counts do not demonstrate the live under-60-minute objective.


The normaliser version 4 replay used a copy of all 330 prior journal transactions. It retained
482 candidates: 126 decisions matched byte-for-byte and 356 were explicitly rebound after
checking that claims, dates and provenance were unchanged. Five entity bindings were corrected;
the other differences were historical re-extraction flags. The migration journal verified all
448 hash-linked transactions. Journal idempotency now includes parser and normaliser versions,
so an earlier success cannot mask a failed upgrade or replace a newly extracted result.
Registered enabled official account handles are matched exactly, preserving multi-vessel
ambiguity without treating longer lookalike handles as the registered source.

The measured retained-packet replay took 2.143 seconds at peak concurrency four; this excludes
browser collection and analytical review. All 53 acceleration checks and the complete production
build passed. Mandatory deep coverage remains 70/77, and fleet reconciliation remains incomplete.
The original candidate review batches span approximately 40 minutes. Neither replay speed nor
that review interval demonstrates a complete live routine sweep below 60 minutes.

The subsequent recovery check also binds same-run reuse to the source identity and adapter
parser version before returning a prior result. Correcting a source URL or upgrading its parser
therefore performs fresh acquisition/extraction; an unchanged rerun remains idempotent. The
56-check acceleration suite and complete production build pass, including these regressions.

The rendered official-news archive review reached five entries preceding the 90-day boundary
and examined all 66 in-window article bodies, conservatively including the day-only boundary
article. Per-article content fingerprints, concise claims, temporal qualifications and review
dispositions were saved privately. Integrating this source increased mandatory deep coverage
to 71/77 and the active candidate set to 546, all dispositioned. Previous evidence transactions
remain intact. These are analytical dispositions, not 546 accepted fleet-state updates.

Current directory review covered 63 linked unit/programme pages and 13 class pages. Missing
historical revisions remain an explicit coverage gap; the approved two-source AIS exception
does not implicitly cover these directories. Portsmouth's rendered navigation exposes current
and next-day planned movements, not a historical movement archive or confirmation of execution.
Neither these limitations nor unfinished fleet reconciliation is converted into release success.

The certificate now counts detected conflicts even before an adjudicator has supplied a
resolution, so a blocked conflict cannot appear as zero in the operator totals. Matching reviewed
conflicts are counted once. The 57-check acceleration suite and full build pass. Twelve live
conflict groups were separately reviewed with dated temporal-progression explanations; this
does not itself approve any current fleet-state change or complete fleet reconciliation.

## Approved official-directory initial baselines

The owner subsequently approved initial baselines for `RN_OFFICIAL_SHIPS` and
`ROYAL_NAVY_UNIT_PAGES` only, under `official-directories-initial-baseline-2026-09-08`.
This separate policy requires the completed current review and its private artifact hash.
It records historical revisions as unavailable, rather than claiming the 90-day history was
examined. The actual observation timestamp is retained; undated pages do not establish a
past operational state at the sweep cutoff. Page fingerprints support future revision checks.
Existing page-quality findings and per-page dispositions remain in the private audit trail.

The exception is valid only without an earlier successful cursor and only for these two
sources. It cannot excuse incomplete current retrieval, later failures, harbour-history gaps
or incomplete social timelines. The older AIS policy and approval remain separately bound.

## Current AIS review and remaining live-validation hold

The approved AIS bootstrap also accepts an explicitly recorded observation time after the
sweep cutoff. It does not backdate that observation: the review timestamp remains separate,
post-cutoff events are ineligible for the earlier snapshot, and the historical-gap cursor stays
conservative. A regression rejects incomplete reviews and inconsistent observation/completion
pairs. All 59 acceleration checks and the full production build pass.

The public VesselFinder review examined 51 fleet-related detail records, rejected two further
foreign namesakes, and completed pagination for missing-name aliases. Its initial current
baseline retains unavailable history and identity/date limitations. Duplicate identities,
rounded report ages, unavailable positions and uncorroborated port reports remain private
review findings; AIS alone does not authorize a fleet change.

MarineVesselTraffic's carrier canary failed an identity-consistency check between its parent
page and embedded AIS panel. This is a `PARSING_FAILURE`, with no cursor advance; historical
bootstrap approval cannot excuse a failed current identity check. At this checkpoint, 71 of
77 mandatory sources have full examination, three have explicitly approved current-only
baselines, and three remain blocked (the failed AIS canary, unavailable harbour history and
incomplete DefenceHQ historical timeline). The private candidate ledger contains 723 reviewed
candidates. Fleet reconciliation and live end-to-end timing remain incomplete. This checkpoint
is not release permission and does not establish a routine under-60-minute sweep.

Attempt reporting separately records `sourceAttempted` for partial rendered checks. An adapter
invocation with no source observation is not itself a source check. Explicit attempted-but-
incomplete observations count towards attempts while retaining their failure disposition and
unadvanced cursor. The certificate still blocks release. The 60-check acceleration suite and
full production build pass, including attempted versus unattempted deferral reporting.

## Approved Portsmouth baseline and bounded DefenceHQ continuation

The owner explicitly approved `portsmouth-current-baseline-2026-09-08` for
`PORTSMOUTH_HARBOUR_AUTHORITY`, using `owner-harbour-approval-2026-09-08`. It requires a
completed current review at its actual observation/completion timestamp, an unavailable
historical archive and no prior successful cursor. It does not backdate planned movements,
confirm execution, excuse another source's failure or waive later source checks. Existing
AIS and directory timestamp rules remain unchanged. The full production build and 61
acceleration checks pass, including policy isolation and timestamp regressions.

The same approval permits 30 total deliberate scrolls for this one-off `X_DEFENCEHQ`
historical review. Ten were already performed, so twenty remain. It does not change the
normal skill limit or other accounts. Chrome subsequently lost its control connection:
the profile opens but both DOM and accessibility reads fail, including in a fresh tab.
No additional scrolls were performed. Retained observations remain available and the source
cursor does not advance. Reconnect browser control before resuming the remaining budget.

Current mandatory dispositions are 71 fully examined, four approved current baselines and
two failed/incomplete sources. MarineVesselTraffic's identity failure and DefenceHQ's unfinished
history still block publication, together with incomplete native fleet reconciliation.

## DefenceHQ resumed review checkpoint

Chrome control recovered and the owner-approved 30-scroll total was used: ten earlier plus
twenty resumed scrolls. The retained timeline reached 30 June, leaving 10–29 June unchecked.
Thirty-seven newly retained posts bring DefenceHQ's partial observation to 86 posts. The
source remains deferred with no cursor advance. The newly verified 6 July carrier report is
historical evidence, not a current position; its incident date is not separately stated.

The native browser validator now recognizes the explicit 30-scroll approval only for
`X_DEFENCEHQ` and the exact bootstrap window ending `2026-09-08T09:11:15.938Z`.
It requires `defencehq-bootstrap-scrolls-2026-09-08` and its recorded owner approval; the
normal twelve-scroll limit is unchanged. Other sources, windows and higher limits fail.
The full production build and 62 acceleration checks pass. Processing retains all 760
candidate decisions, including 49 existing DefenceHQ decisions revalidated against changes
limited to retrieval time. Earlier failed normalization transactions remain in the journal.

The review tab is retained for continuation without restarting the timeline. Additional
scrolling requires an extension of the owner's exhausted budget; it must not be reset by
opening another tab. No source coverage, fleet reconciliation or live runtime completion
is claimed by this checkpoint.

## DefenceHQ boundary completion, 8 September

The owner approved up to thirty additional scrolls after the prior thirty were exhausted,
with an immediate stop at the June10 boundary. The native validator now recognises that
second approval only for `X_DEFENCEHQ` and the exact original June10–September8 bootstrap
window. The original thirty-scroll approval remains valid; it cannot authorise sixty.
Other sources and windows retain the default twelve-scroll cap. Regression assertions
cover both approval references, mismatched accounts/windows and excess budgets.

The boundary was reached after seven additional scrolls (37 total). Twenty-five new
in-window post excerpts were retained, bringing this source to111 posts. The first older
post, June9, is boundary metadata rather than in-window evidence. Truncated potentially
relevant claims were opened in post detail. The bounded rendered method completed; it does
not guarantee that X exposes every public post. The native acquisition adapter accepted
all111 records and advanced the source cursor only after normalization succeeded.

The current live checkpoint has785 candidate reviews,158 accepted historical items and
no pending item decisions. Two tanker-operation posts were reconciled against the retained
RN article and official MOD statements as same-origin historical corroboration. Historical
acceptance is not a current fleet assessment. Prior86 DefenceHQ decisions were rebound only
after verifying unchanged substantive candidate fields against the hash-chained journal;
the retrieval timestamp and acquisition review flags were separately accounted for.

Mandatory outcomes:72 fully examined, four explicitly approved current-only baselines,
and one MarineVesselTraffic identity/parser failure. All77 were attempted. The full build
and62 acceleration checks pass. Native68-vessel reconciliation and snapshot sealing remain
incomplete, so the diagnostic certificate remains FAIL. No public snapshot, deployment,
scheduler activation or live routine under60-minute success is claimed.

## Approved one-run identity quarantine

The owner approved the MarineVesselTraffic proposal on September8. Certificate policy
`mvt-identity-quarantine-2026-09-08` applies only to the exact bootstrap run, registry,
source, historical window and failed record hash. It requires an attempted PARSING_FAILURE,
null cursor, no candidates, a hashed review artifact and explicit approval reference.
The certificate separately counts this exception while preserving its parsing-failure count;
it does not count the source as successfully examined. Other source failures, reconciliation,
validation and sealing gates remain unchanged. Tests cover scope isolation, forbidden
cursor/evidence changes, visible failure counts and continued release blocking.

The private run carries the approval, with pre-approval copies retained. Native evidence
promotion, fleet outcomes and snapshot sealing remain unfinished; approval does not itself
complete native source-coverage review or authorise publication. A future acquisition retry
changes the record hash and therefore requires revalidation; never silently rebind an approval.
The next sweep receives no exception. Full build and64 acceleration checks pass.

## Native coverage validation checkpoint

The native coverage evaluator now recognises the same approved one-run quarantine only
when its exact acquisition record is supplied in `run.certificateInputs.acquisition`.
It retains the blocked source state and76 completed checks, reporting one exception
separately. Missing bindings, another run or duplicate exceptions fail closed. Discovery,
fleet and integrity checks are unaffected. Historical coverage objects gain no new fields
unless their run contains exceptions, preserving stored historical totals.

Fresh live checks pass for registry, evidence and assessment schemas, sweep shape, baseline
binding, public projection,589 journal transactions,785 candidate-review bindings and the
approved exception. All7 discovery checks pass. Native68-vessel outcomes and6 integrity
reviews remain pending;45 records have stale/unknown support warnings. These are remaining
analytical work, not a schema corruption or evidence of complete no-change. Diagnostic
certificates now report schema and ledger results independently from missing snapshot sealing.

The full build,64 acceleration checks and controlled CLI pipeline pass after this fix.
The live certificate remains FAIL. This checkpoint does not activate the scheduler or publish.

## Separately approved 12 September source quarantine

The fresh validation run `SWEEP_20260912T151038841Z_R1_1add15ac` reproduced the
Marine Vessel Traffic identity mismatch between a carrier record and its embedded AIS panel.
Luke explicitly approved quarantining that source for this run after the fresh check. The
validator therefore has a second independently bound policy entry; the September 8 approval
remains confined to its original run. Neither entry permits future-run reuse.

The acquisition remains `PARSING_FAILURE`, with no accepted candidates and a null cursor.
The approval record and failed acquisition hash remain private. Every other mandatory source,
fleet reconciliation, conflict and release gate still applies. This exception does not establish
complete collection, a passing certificate, publication authority or a live runtime result.
