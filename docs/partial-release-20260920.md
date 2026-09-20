# September 20 owner-approved partial release

Luke authorized publication at partial coverage, retaining previous locations where a replacement is not verified, then requested review of all fourteen proposals. Later authenticated corrections, including Fort Victoria, remain intact. This policy applies only to `SWEEP_20260920T110200208Z_R1_1add15ac` and its fixed September 20 cutoff.

## Release result and limitations

Fourteen proposals were reviewed. Eight support a new bounded report. Six retain the previous state, including Dagger because its registered source is discovery-only. Eight public records add the dated latest report while retaining the previous dated map representation; 61 records are unchanged. No new coordinates, status promotions or submarine activity inference are introduced. All 69 reviewed map representations remain available.

The underlying sweep remains incomplete: 23 native reconciliations complete, 46 pending, 74 of 77 required source tasks successful, 347 candidate dispositions and 40 AIS holds. The three required-source failures and unresolved conflict are preserved, not reported as successful checks. The public metadata and visible interface disclose partial coverage. No complete no-change claim is permitted.

## Exact exception boundary

`scripts/lib/validate-partial-release-inputs.mjs` validates a separately frozen private exception record against its explicitly approved digest. It authenticates the baseline against the published Git commit, preserves evidence and assessment history, validates source/evidence/assessment schemas, recomputes candidate content, checks source eligibility and cutoff, preserves statuses, requires all 69 map representations and verifies the exact 8/61 partition.

`scripts/lib/partial-release-20260920.mjs` validates the partition and its independent binding receipt. Its successful result alone does not grant publication authority. The native sweep validator invokes the stricter exact-record adapter only when the external private manifest explicitly contains `partialRelease`. Ordinary full-sweep validation and earlier run exceptions remain unchanged. The original partial run is not inserted into the completed-run ledger or falsely sealed as complete.

The approved record hash is fixed in code; another run or candidate requires a new reviewed policy change. The record and private inputs must never be committed or copied into client assets.

## Display and date behavior

Retained marker dates stay unchanged. A separately reviewed latest-report label is shown even when its exact current position is unconfirmed. Explicitly tagged Europe/London observation intervals are converted to that local calendar day; multi-day and unknown observations remain unknown. This avoids misclassifying a single British Summer Time day as two UTC dates. No observation range is shortened to manufacture a date.

## Validation

The exact private candidate passed native release gating and ten adversarial tamper cases. Partition tests cover a valid candidate and nine rejected alterations. Public evidence/assessment/projection validation, complete-map checks and append-only history checks passed. Regression tests preserve geometry while allowing dated retention captions. Root and Pages build results and deployment read-back are recorded separately in the local release receipt; this document is not deployment evidence.

The owner transferred native-ledger ownership from stopped Rook to Codex. Public-X browser collection ownership was not taken over. The owner later changed the usage stopping threshold from 10% to 5% remaining.
