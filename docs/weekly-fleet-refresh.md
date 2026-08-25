# Weekly fleet refresh

Buzz workflow `8c44ae64-0b49-48f3-b11e-c653d073e8e9` starts the fleet review every Sunday at 00:00 UTC using cron expression `0 0 * * 7`.

The scheduled message instructs Codex to:

1. review all 71 Royal Navy and Royal Fleet Auxiliary records;
2. keep or revise only dated, public, vessel-specific locations at supported precision;
3. retain the last public location irrespective of age while labelling historical evidence;
4. append every promotion or revision to `data/royal-navy/location-decisions.jsonl`;
5. generate the release-to-release change summary;
6. append one fleet-status snapshot for the new dataset date;
7. run the full validation, test and production-build suite;
8. open a pull request linked to the originating Buzz channel for owner review; and
9. report plotted, unknown and withheld counts plus any evidence blockers.

The workflow is deliberately owner-reviewed. It prepares evidence-backed repository changes but does not merge or deploy them automatically.

A separate GitHub Actions workflow starts at 00:05 UTC each Sunday with `contents: read`
permission. The five-minute offset lets the 00:00 UTC Buzz run start cleanly; wait for the discovery
job and download its artifact before completing the review.
It collects only the allowlisted public publisher indexes and uploads `osint-sweep-run.json` as a
workflow artifact. It does not request X account pages, manual sources or APIs, and it cannot commit,
ingest evidence, update the fleet dataset or publish the site. A blocked required index makes the
collection job fail after the ledger has been written; the `always()` artifact step still preserves
that failure record for review.

## Refresh sequence

Start the worktree from the current `main` branch and retain that starting ref. Download the scheduled
discovery artifact, or run the same read-only collection locally:

```bash
npm run sweep:collect -- --output=osint-sweep-run.json
```

The collector targets release revision 1 by default. For a same-day correction, supply the revision
that will be published, for example `--release-revision=2`. A sweep for r1 cannot authorise r2, and
the finalised sweep timestamp must precede the new release instant.

When `--since` is omitted, the collector uses 00:00 UTC on the checked-in
`metadata.asOfDate` as the required lower bound. Supply `--since=<ISO timestamp>` only when the
production starting point is different; a missing, empty, reversed or shortened sweep interval is
invalid. The run captures the prior release identity, and CI authenticates it against the pull
request base before allowing that lower bound to authorise publication.

The automatic pass contains seven allowlisted targets. Royal Navy News remains a mandatory manual
source because its public news index and advertised sitemaps returned Cloudflare HTTP 403; the
collector must not bypass that control. The Westward Shipping News RSS feed is the replacement
automatic discovery target and remains Tier C, discovery-only material.

Review every discovery and all 33 required recurring manual sources. Add newly governed source
records and normalised evidence, then create and validate any new assessment revisions. Stage the
target `metadata.asOfDate` and `metadata.releaseRevision` in the canonical vessel file before
finalisation, but do not stamp the final release instant yet. Record one allowed outcome for all 71
vessels after its current assessment exists. A new assessment's `assessedAt` must fall within the
sweep and be no later than that vessel's `reviewedAt`; the outcome evidence set must equal the new
assessment's selected evidence set. A source that cannot be checked must have an explicit typed
blocker and remain `blocked`; do not convert a failure into “no change”.

Every selected evidence item must already have been retrieved by the assessment and vessel-review
timestamps. Evidence dated after assessment, review or finalisation cannot be retrospectively bound
to the run.

After the candidate assessment state and complete coverage ledger exist, finalise the run and retain
it under the configured external private root's `sweep-runs/` directory. The checked-in
`data/internal/provenance/sweep-runs/` location is only the unchanged non-sensitive migration state:

```bash
npm run sweep:finalise -- osint-sweep-run.json
```

The finalisation command fails if any required public index, recurring manual source or vessel
outcome is pending or blocked, if a derived outcome or assessment binding is inconsistent, or if a
review timestamp falls outside the run. It seals the exact candidate public projection, current
assessments, referenced evidence, supporting source records and projection-method version. The seal
excludes the volatile release timestamp; the release gate binds that timestamp separately.

Real private releases run only on the owner's trusted machine with `RNFS_PRIVATE_DATA_ROOT` set.
Public GitHub Actions use no real private inputs or credentials and exercise the committed synthetic
fixture only. Follow [`private-input-boundary.md`](private-input-boundary.md) for backup/recovery,
credential rotation, temporary generation and sanitised-release review.

After finalisation, stamp `metadata.releasedAt` later than or equal to the sweep completion, generate
the public projection and then generate the two insight datasets in this order:

```bash
npm run generate:public
npm run generate:changes -- --base-ref origin/main
npm run snapshot:status
```

The separate weekly availability candidate workflow enriches the reviewed status release with the
public vessel class that applied during that observation week. It opens an owner-reviewed pull request
containing only the append-only availability ledger; it does not copy stale statuses when a reviewed
weekly release is missing. See [`weekly-availability-history.md`](weekly-availability-history.md).

`publication-changes.json` is regenerated for each release. It compares the proposed fleet dataset
with the supplied base ref and records status, location, map-precision, marker-only and evidence
changes. The base ref must identify the version currently in production, not another commit from the
feature branch.

`status-history.jsonl` is append-only. The snapshot command takes the release identity and all 71
statuses from the current fleet dataset. A normal new dataset date starts at release revision 1.
For a same-day correction, increment `metadata.releaseRevision`, provide a later
`metadata.releasedAt`, and append with `--correction --reason`; never rewrite the shipped line.
See [`release-revisions.md`](release-revisions.md) for the exact contract.

## Required checks

Run the append-only comparisons against the same base ref, then the complete builds:

```bash
npm run validate:sweeps -- --base-ref origin/main
npm run validate:data
npm run validate:decisions -- --base-ref origin/main
npm run validate:history -- --base-ref origin/main
npm run validate:availability -- --base-ref origin/main
npm run validate:changes
npm test
npm run build
npm run build:pages
```

The build commands also run the sweep-coverage, data, decision, history, change-summary and test
checks. CI verifies on both pull requests and direct pushes that previously committed decision,
history and sweep-run ledger records were not changed or removed. A newly added sweep baseline must
match the canonical projection and assessment state in the pull request's base commit. Each stored
run is subsequently checked against its own immutable registry, target and roster snapshot, so a
future source-registry change cannot invalidate history. The gate re-derives every outcome,
assessment and evidence binding and evaluates only the latest eligible run completed by the release
instant; a later post-release rerun cannot mask it. From 24 August 2026, no complete matching sweep
means the canonical dataset date cannot advance, even when an analyst believes there were zero
vessel changes.

## Availability history

The tracker derives availability from the weekly status snapshots, not from a location evidence
date. `Available` and `Deployed` are counted as active observations. `Unknown` observations reduce
coverage and are not guessed as either active or inactive; museum and decommissioned records are
excluded. Until at least 52 weekly observations span approximately one year, the interface reports
that history is building rather than presenting the result as a 12-month availability figure.
