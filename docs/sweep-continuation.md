# Governed sweep continuation

## Optional monitored Marine Vessel Traffic

The owner approved retaining `MARINEVESSELTRAFFIC_NATO_DISCOVERY` as optional
monitored discovery on 2 October 2026, accepting the risk of missing unique
aggregator leads when retrieval fails. This is not a successful source check or
validated replacement. Its operation may be explicitly set `mandatory: false`;
the generator preserves that choice only for this source and requires it to remain
enabled, manual, tier-D aggregator discovery. Legacy registries remain mandatory.

Apply the two approved private changes after this code is reviewed and merged:
set that operation's mandatory flag false, and retain notes explaining the identity
quarantine, independent dated evidence requirement and explicit retrieval failures.
Validate the complete candidate registry and required-source set; compare the live
file's SHA-256 to the staged original, retain a recoverable original, then atomically
replace and read back. Do not commit private inputs to Git. No other mandatory
source changes, including VesselFinder. Record failed identities as failures; never
promote conflicting panel identities or use the aggregator as primary evidence.

New runs bind the changed registry hash. Do not rewrite historical bindings,
recertify old runs or carry historical exception receipts. Reinstatement needs a
fresh identity-consistent check and an explicit policy decision. Reconciliation,
corroboration, integrity, certificate, backup and release gates remain unchanged.

## Compact browser work queue

Use `sweep:x` with `--compact` for prepare, record and status. After a successful
required canary, `--batch-size=2` shows at most two pending profiles for separately
addressed Chrome tabs; the default is one. This is a work queue, not permission to
bypass the canary or collection gates. A single coordinator records each observation
immediately through the existing record command. Never share mutable tab handles
between concurrent operations or defer durable recording until an entire batch ends.

Use only supported signed-in Chrome rendered public content. Inspect the relevant
rendered posts and dates; avoid repeatedly emitting whole session/account lists or
unchanged page snapshots. Keep existing per-profile scroll bounds, window cutoffs,
origin relationships and partial observations. Compact output retains counts,
required unfinished count and typed blockers. Terminal failures remain visible;
empty pending work is not complete coverage or a no-change claim. Full session
and observation files remain unchanged and available for targeted inspection.

## Fixed-window recovery and measurement

Explicitly select the run and exact window, verify its registry/baseline bindings,
exclusive ownership and fresh exact-state backup before acquisition. Reopen durable
sessions and reuse successful same-run receipts. A changed cutoff is a new window,
not permission to reuse checked coverage. Failures need explicit adjudication/retry;
compact queue output never silently retries or declares them successful.

The existing `test:operations` fixtures kill a collector child after its first
checkpoint, then reopen and reuse that index while fetching the remaining six;
prior checkpoint bytes are unchanged. Source-reuse fixtures reuse two successful
receipts and retry only the failed source. Browser tests persist/reopen session
progress and reject a changed window. These tests prove recovery mechanics, not
live browser coverage or unattended acceptance.

Record each actual stage's elapsed time, examined source/window, source/vessel/
integrity coverage, browser calls and provider total/cached-input/uncached-input/
output tokens. Unknown values stay null. Compare equal coverage and windows;
smaller console output is not a measured token or speed improvement. Use the
existing stage timing and acquisition telemetry rather than another runtime.

Full actual scheduled validation remains required after merge/adoption and all
preconditions. Capability checks alone do not establish owner liveness, recovery,
collection or publication. Preserve noon cadence and Command Centre reporting.
