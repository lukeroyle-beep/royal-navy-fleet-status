# Deterministic OSINT preflight

Current native-route acceptance and bounded stage: [native refresh acceptance](native-refresh-acceptance.md). The 2 October candidate replaces broker-specific dependencies only for the separate native route; operational adoption and publication remain held.

This is the first issue-110 implementation, not activation of a new scheduler. Run on the
trusted Mac in the actual execution context. No AI model, source request, browser or
remote mutation is used by the probes. The existing Sunday schedule is unchanged.

## Invocation

After establishing the existing run owner through the current operational procedure:

```sh
npm run sweep:preflight -- --config=/PRIVATE/preflight-config.json --output=/PRIVATE/preflight-attempt-UNIQUE.json --then=plan
```

`/PRIVATE` is a placeholder, not a default directory. Every private path must remain
outside every checkout. `--then=indexes` runs the public-index collector only after a
passing preflight, resuming the configured native run and writing a new private output.
Omit `--then` for checks only. These are the only allowed stages; there is no arbitrary
shell command, automatic Chrome stage or publication hook. The result is persisted before
the requested stage starts. Output paths are exclusive; choose a new name per attempt.

A failed preflight returns nonzero and `DEFERRED_WITH_JUSTIFICATION`, the first unavailable
prerequisite and completed check names. Unreached checks are not passed. Raw command
stderr, private paths, evidence and credentials are never printed. A failure to persist
the receipt also prevents the next stage. Stage failure remains failure even if readiness
passed; a readiness receipt is never evidence of collection completion.

The public-index collector takes an exclusive same-run lock in the selected private
`sweep-runs` directory before making requests and releases it on normal exit. A process
crash leaves the lock in place and blocks another collector for that run. Never steal or
automatically clear it: verify the recorded host and PID no longer identify a live
collector, then remove the stale lock as an explicit recovery step. A lock restored from
backup is historical state, not proof of current ownership.

## Private configuration

```json
{
  "schemaVersion": 1,
  "run": "/PRIVATE/run.json",
  "stateDirectory": "/PRIVATE/acquisition",
  "evidenceDirectories": ["/PRIVATE/packets", "/PRIVATE/browser-session"],
  "ownerLock": "/PRIVATE/existing-owner.json",
  "ownerId": "current-coordinator",
  "backupReceipt": "/PRIVATE/backup-readiness.json",
  "collectionOutput": "/PRIVATE/new-discovery-attempt.json"
}
```

Include every additional evidence/checkpoint directory required to recover this run.
The acquisition directory is always included. It must already exist, including for a
first run. Do not put backup readiness/proof files inside the inventoried directories
(the proof cannot hash itself). Optional `executionPolicy.networkAccess: false` records
an explicit known denial and short-circuits immediately. Omission is not permission:
actual probes still must pass. Do not set policy fields to disguise an executor denial.

The selected `RNFS_PRIVATE_DATA_ROOT` must be the authenticated accepted baseline, not an
unpublished candidate. Existing manifests/resolver rules still apply. The preflight
compares the regenerated full public projection with freshly authenticated GitHub main
and live production, checks the native run's baseline, registry and roster binding, and
derives the roster count rather than hardcoding 69. A mismatch requires reconciliation;
it does not authorize changing fleet data.

The owner record is read, never created/replaced/released by preflight. It must expose
`runId`, `ownerId` (or `owner`), `active: true`, and a positive live local `pid`. If present,
`hostname` must match, `expiresAt` must be valid and unexpired, and the fencing `token`
must remain unchanged. Identity/expiry/PID are checked again after the other probes.
Adapt an old receipt only from verified existing ownership; never create a second owner
or convert a stale record to active. The operator remains responsible for loss of
ownership after collection begins; this PR introduces no lease service or takeover.

## Checks and limits

Checks fail fast: configuration/policy, native run, owner, private manifest/boundary,
repository write, private-root/sweep-run/state writes, GitHub repository identity/auth,
current main, live public baseline, exact projection and registry binding, recovery
inventory, encrypted backup proof, then owner recheck. Write probes use exclusive random
files, fsync, read-back and cleanup; they do not touch canonical evidence or Git refs.
GitHub uses read-only `gh api` and requires repository write permission for subsequent
incident/delivery work. It never tests authorization by publishing anything.

Each external probe has an eight-second maximum within a thirty-second external-probe
budget. Local validation and hashing depend on the size of the preserved run. The
preflight does not build the application, rescan websites or repeat a restore. Hashes
cover the actual run bytes, selected private inputs and all files beneath the specified
recovery directories (excluding the process-only `writer.lock`). Symlinks in the recovery
inventory fail closed. Full journal-chain validation still occurs when the journal opens.

After pass, the existing rendered-Chrome readiness and six-account canary requirements
remain. Interactive preflight does not prove a future scheduled context. A Codex wake
itself uses model capacity; these deterministic probes do not claim zero conversation cost.

## Backup evidence contract

Preflight consumes a proof from an independently performed encrypted backup/restore
verification. It does not generate successful backup claims, grant a validity exception,
mount/unlock volumes or overwrite existing recovery receipts.

`backupReceipt` is a private JSON object with:

- `schemaVersion: 1`, `kind: "rnfs-backup-readiness"`;
- `bindingHash`: `preflightBinding()` from `scripts/lib/sweep-preflight.mjs`, binding the
  native run identity/window/registry/baseline, SHA-256 of actual run bytes, private-input
  hash and `checkpointInventoryHash(config)`;
- `verifiedAt`: actual verification timestamp, not future-dated;
- `manifestPath`, `manifestSha256`: backup inventory on the encrypted backup volume;
- `restoreProofPath`, `restoreProofSha256`: separately retained restore-verification proof.

Private-input hash is `digest()` of the mapping from each of `vessels`, `sources`,
`assessments`, `evidence`, `shoreEstablishments`, `shorePhotoSources` to the SHA-256 of its
manifest-resolved file bytes. The same helper's `digest()` canonicalization is used.
The manifest has `kind: "rnfs-backup-manifest"`, matching `bindingHash`, positive
`fileCount`, and explicit `completePrivateInputs: true`, `completeCheckpointState: true`.
The restore proof has matching `bindingHash` and `manifestSha256`, `pass: true`, and
`filesVerified` equal to the manifest count. These attestations must be backed by the
actual complete backup and restore comparison, not merely populated to make preflight pass.

The preflight rehashes both files, verifies exact-state bindings and matching counts,
checks the mounted backup volume reports FileVault encryption through `diskutil`, requires
a filesystem device distinct from the source store, and probes backup-directory writes.
The encryption probe resolves the manifest directory to its filesystem root before
calling `diskutil`: macOS rejects nested backup folders as disk identifiers. Device
separation is still checked against the actual manifest directory and source store.
It does not independently repeat the restore or verify each backed-up payload at every
wake. The retained proof is trusted operational evidence, not a cryptographic signature.
No elapsed-time validity period is introduced: changed run/input/checkpoint bytes require
new matching backup evidence. Unrecognised historic receipt formats remain unvalidated;
retain them and perform an explicit evidence-backed adoption outside this code change.

## Failure response

Repair the named prerequisite in the scheduled context. An unavailable encrypted disk,
sign-in or challenge remains Luke-only. Never repeat all successful sources merely
because preflight or ownership failed. Resume the same preserved run/cutoff after
verification; no pass allows publication, advances the cutoff or closes an incident.

## Operational cutover verification

Adopt the guard in stages: verify the accepted private projection, perform an actual
encrypted backup/restore comparison, run a check-only preflight interactively, then
repeat verification in the existing automation's actual execution context. Preserve the
automation configuration for rollback. Do not change global permissions or treat an
interactive pass as scheduled validation. Keep collection held until that validation
is reviewed; an unmerged local fix is not a deployed scheduler prerequisite.

With the volume-root fix, the 30 September interactive check passed all twelve stages
in 1,968 ms, after a real encrypted archive/restore comparison of 6,298 files and
read-only validation of the 989-transaction journal. This is an actual interactive
measurement, not scheduled acceptance or a collection benchmark. The backup occupied
about 18.7 MB compressed for 132.9 MB of input/checkpoint files. The volume then had
about 14.8 MB free, insufficient for another equivalent independent backup plus
headroom. Retain prior verified backups; resolve capacity before the scheduled trial.

The 30 September adoption check confirmed that the preserved 20 September partial-release
inputs match GitHub main and the September 27 run baseline. The default inherited root
still contains 68 records and is unsuitable. Select the accepted inputs explicitly for
the process; do not overwrite them or substitute the unpublished recovery candidate.
Resolve subsequent state from native receipts and issues 104/108, not an embedded
September 12 automation checkpoint.

An exact-state backup which includes process ownership records changes when ownership
is released. Retain its receipt as a dated verification, not a reusable pass token.
Future owners need a proof matching their actual state. A restored PID or writer mutex
is historical data, never authority to resume or permission to steal a live lock.
