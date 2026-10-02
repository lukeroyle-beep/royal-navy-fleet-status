# RNFS operational status v1

This is a replaceable, non-authoritative, read-only projection. It is not an operational receipt, acceptance gate, evidence store or permission to act. No MCP server, scheduler, hosted service or transfer agent is included.

## Run

```sh
npm run status:operational -- --source repository-fleet data/royal-navy/vessels.json
node scripts/operational-status.mjs --text --source repository-fleet data/royal-navy/vessels.json
node scripts/operational-status.mjs --at 2026-10-01T12:00:00Z --source preflight fixture.json
npm run test:operational-status
```

Repeat `--source KIND FILE` for explicit existing inputs. With no files, all fields are unknown. `--at` is an evaluation clock for reproducible offline tests, never an evidence observation time. Output goes to stdout only; shell redirection is the caller's responsibility. Keep raw inputs outside the repository and public build. Do not redirect onto an input file. The caller must supply authorised files and accurately identify their origin: the CLI does not authenticate a caller-supplied file as production or GitHub.

Each source is limited to 8 MiB, each request to 32 files, fleets to 1,000 records and engineering snapshots to 50 items. No directory traversal/discovery, network calls, subprocesses, probes, locks, archive operations or operational writes occur. The reader opens regular files read-only, rejects final-component symlinks, and checks size/mtime/ctime around the read. Parent directories must already be trusted; it does not claim descriptor-relative protection of the complete path. Filesystem access-time bookkeeping is OS-dependent. Tests verify source bytes, mtime, ctime, mode, inode and directory contents are unchanged.

## Contract and semantics

`schema.json` defines the versioned output envelope. The implementation's `FIELDS` and closed adapters define each field's value contract. Every field has a status, verification time, selected observation, retained observations and explicit missing inputs. Every observation has an opaque source reference, sanitised projection digest, source observation time, verification time, freshness threshold/result, source priority, evidence outcome, assurance and allowlisted value. Unknown fields have no fabricated observation time.

- `passed`: the selected evidence supports the narrowly named field/scope, not production readiness.
- `partial`: incomplete evidence or code/check-only progress.
- `blocked`: an evidenced prerequisite or hold.
- `unknown`: no supported input, invalid/future-dated evidence or explicitly unrun stage.
- `stale`: the selected evidence exceeds its documented age budget; its original outcome remains visible.
- `conflicting`: differing values/outcomes retained for a field. The selected value does not erase disagreement. This includes differing dated assessments and scopes; it is a conservative review signal, not a claim of simultaneous mutually exclusive facts.

Source priority is explicit: production fleet 30 > repository fleet 20; recovery operator status 40 > preflight 30; other receipt sources 30. Within a priority, newer observation wins; canonical lexical ordering breaks exact-time ties deterministically. These priorities never make a derived Space/conversation statement authoritative. Neither Space nor Institutional Memory prose is automatically parsed into a runtime pass. When reconciling a source outside these adapters, retain the discrepancy in the review documentation and add a reviewed adapter only if needed.

Freshness budgets: public release projection 14 days (matching the project's publication-age budget), sweep/certification/recovery 7 days, operational/engineering receipts 24 hours. These are report policy, not new collection schedules. The public metadata `releasedAt` measures release age, not the age of vessel observations. Re-reading old data updates verification time only. Historical certification remains a successful dated event even when its freshness is stale. Source acquisition/provenance authenticity is distinct from parsing: `receipt-assertion` does not mean an HMAC or scheduler record was independently verified.

`contentId` is SHA-256 over recursively key-sorted JSON excluding only `generatedAt`, `verifiedAt` and `contentId`. Array order is canonicalised for sources and observations. It includes freshness *state*, so crossing a threshold changes the identifier; the passage of time within that state does not. `sourceDigest` hashes only the adapter's sanitised observations, never raw private evidence. Extra ignored private fields cannot alter the report or identifier. It identifies the projection, not the original file or an authenticity signature.

## Supported sources and gaps

The URNs deliberately avoid personal filesystem paths. Resolve them locally to the existing authorised stores; no new mapping ledger is created. Each sample input's digest disambiguates its sanitised projection. Public anchors below make the sample reviewable without exposing private paths.

| Kind / URN suffix | Existing source and interpretation |
|---|---|
| repository-fleet / repository-public-fleet | `data/royal-navy/vessels.json`; `readReleaseMetadata`, `assertCompleteMapRepresentation`, plotting and representative predicates reused. No vessel rows/coordinates emitted. |
| production-fleet / production-public-fleet | Same public schema, supplied from the [production endpoint](https://british-armed-forces-tracker.open-defence-data.workers.dev/data/royal-navy/vessels.json). Reports publication identity, never rendered success. |
| sweep-run / existing-sweep-run | Explicit existing native sweep JSON; current lifecycle/cutoff and certificate state. `validateSweepCertificate` checks bound inputs; raw candidates never leave memory. |
| certified-history / existing-certified-history | Explicit historical sweep JSON; only a validated native certificate contributes a last-successful-certification observation. “Last” means latest among supplied sources, not an exhaustive history search. |
| operator-status / existing-recovery-status | Existing `operator-status.json`; incomplete/recoverable aggregate coverage, failed certificate dry-run, retained same-run requirement. No claim of current live lock ownership. [Recovery anchor](https://github.com/lukeroyle-beep/royal-navy-fleet-status/issues/108#issuecomment-5869315586). |
| preflight / existing-preflight-receipt | Native `schemaVersion: 1` preflight receipt, fixed check names only. Permission, backup and ownership results remain scoped to that old check-only invocation. `runSweepPreflight` is **not called** because its probes write/archive. Scheduler correlation and durable policy are not inferred. |
| scheduled-prerequisite / existing-scheduled-prerequisites | Existing blocked scheduled prerequisite receipts; fixed diagnostic enum and explicit hold. New outcome shapes are unknown until reviewed. |
| broker-static / existing-broker-static-installation | Existing B3 static identity discrepancy receipt. Shows blocked B3/unrun B4 and the decision needed before activation. It cannot report B3/B4 success. |
| engineering / github-engineering-snapshot | Explicit `{observedAt, commit, items:[{number,state,kind}]}` from a bounded GitHub read; enums only, no issue titles/bodies. Merged #116 establishes code progress only. This transient adapter input is not a new ledger. |
| deployment / existing-deployment-verification | Reserved source identity; no supported receipt adapter yet. Always unknown, even if input says `pass:true`. |
| rendered / existing-rendered-verification | Reserved source identity; no supported receipt adapter yet. Always unknown. |

Exact last collection completion stays unknown: native sweep `completedAt` seals a sweep, and certificate time is not the collection completion time. A future adapter needs an existing collection-stage receipt with an unambiguous event timestamp. No new timestamp is invented. Likewise full B3/B4 acceptance needs existing verified installation/scheduler/HMAC correlation evidence, not generic booleans; a reviewed adapter is required when those native acceptance receipts exist. Current live owner/PID liveness is unknown because this interface performs no process probes. Backup evidence is historical preflight assertion, not a newly tested restore.

The report therefore answers production health through separate fields; it deliberately offers no overall green readiness flag. Read holds, recovery, certificate, broker B3/B4 and scheduler together. `passed` on representation counts, engineering source retrieval or a historical backup does not make production healthy.

## Real sample, 1 October 2026

[sample.txt](sample.txt) is the concise rendering; [sample.json](sample.json) retains all provenance and conflicting observations. Captured from main `5728f7d28c06265754035bf8e40336bd870b3692`, the production public endpoint, explicitly named existing Mac receipts, a validated historical sweep certificate, and bounded GitHub reads. Seven input files were verified byte/mtime/ctime unchanged after reading. The sample is historical and replaceable; it is not live telemetry.

- Production and repository: 20 September r1, 69 representations (42 point, 26 regional, one protected), partial evidence coverage.
- Latest validated certificate supplied: 13 September 14:35:56.013 UTC for the 12 September snapshot; stale for current readiness. Exact collection completion unknown.
- Publication metadata: 20 September 17:56:21.436 UTC. Deployment and rendered verification receipts were not supplied; those remain unknown despite matching current public release identity.
- Recovery: 27 September run incomplete, 74/77 mandatory checks, zero final reconciliations, certificate dry-run failed.
- 30 September preflight reported readiness within its check-only scope; 1 October scheduled prerequisite failed connectivity. Both survive in the report.
- B3 static identity prerequisite blocked; B4 not run. Luke's next decision is a reviewed account-authority resolution, not another installation or an instruction to activate the service.

The [Command Centre](https://chatgpt.com/space/page_16c3cf55b8d48191b8750da033279fa5) was read successfully. Its conditional installer/authentication action predates the local confirmed-installation/static-identity-block result. The canonical Institutional Memory project note was retrieved read-only (reviewed 28 September); its older scheduled-context and migration conclusions are historical. Neither source was edited. The broker goal/thread was idle at inspection and its saved checkpoint agreed with the static blocker. No broker work was resumed.

## Future read-only MCP contract

No server or transport is implemented here. A later service should expose only:

- `get_operational_status({})` → this envelope, with current freshness recomputed from original observation times. Never accept arbitrary paths, URLs, commands or credentials as tool arguments.
- `get_changes_since({content_id})` → `{contentId, unchanged, resetRequired, changedFields, report?}`. Validate a 64-hex ID. Matching current ID returns `unchanged:true` with no model call. With an explicitly retained previous **derived report**, `changesSince` identifies changed field names. If the ID/schema is unknown or evicted, return a full report with `resetRequired:true`; never fabricate a diff. No durable history/ledger is required, and input-health-only changes may change contentId with no changed field names.

The pure `changesSince(current, previous)` helper is not an MCP endpoint. Current reports and their digests must originate from this trusted generator, not arbitrary client JSON. Use bounded responses, private access, no mutation tools, and a small replacement cache. Original receipts remain authoritative in their existing stores.

Rollback: discard generated output or close/revert this code PR. No operational rollback is needed because nothing was activated or changed.

## Native route assessment, 2 October 2026

The broker fields above remain historical broker diagnostics. They are not acceptance
fields for the separate [native refresh route](../native-refresh-acceptance.md).
NATIVE-SCHEDULED-1 remains unproven; do not turn a B3/B4 supersession decision into a
passed status or infer that collection/publication holds have been released.
