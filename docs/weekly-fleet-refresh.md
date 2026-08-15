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

## Refresh sequence

Start the worktree from the current `main` branch and retain that starting ref. After the evidence
review is complete, update `data/royal-navy/vessels.json`, its `metadata.asOfDate`, and the append-only
location decision log. Then generate the two insight datasets in this order:

```bash
npm run generate:changes -- --base-ref origin/main
npm run snapshot:status
```

`publication-changes.json` is regenerated for each release. It compares the proposed fleet dataset
with the supplied base ref and records status, location, map-precision, marker-only and evidence
changes. The base ref must identify the version currently in production, not another commit from the
feature branch.

`status-history.jsonl` is append-only. The snapshot command takes the date and all 71 statuses from
the current fleet dataset. It rejects duplicate and out-of-order dates. Do not rewrite a snapshot
that has already shipped; use a new dataset date for a later review or correction.

## Required checks

Run the append-only comparisons against the same base ref, then the complete builds:

```bash
npm run validate:data
npm run validate:decisions -- --base-ref origin/main
npm run validate:history -- --base-ref origin/main
npm run validate:changes
npm test
npm run build
npm run build:pages
```

The build commands also run the data, decision, history, change-summary and test checks. Pull-request
CI repeats the append-only history check against the PR base branch.

## Availability history

The tracker derives availability from the weekly status snapshots, not from a location evidence
date. `Available` and `Deployed` are counted as active observations. `Unknown` observations reduce
coverage and are not guessed as either active or inactive; museum and decommissioned records are
excluded. Until at least 52 weekly observations span approximately one year, the interface reports
that history is building rather than presenting the result as a 12-month availability figure.
