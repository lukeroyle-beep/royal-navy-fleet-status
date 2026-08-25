# Weekly availability history

## Purpose and public boundary

`data/royal-navy/availability-history.jsonl` is an append-only analytics ledger for future fleet and
vessel-class availability calculations. Each logical week stores only:

- the Sunday week-ending date and ledger revision;
- the recording instant and the exact reviewed public release identity;
- vessel IDs, public vessel classes and public operational-status labels.

The schema rejects every other field. Names, locations, coordinates, uncertainty areas, sources,
evidence, analyst notes and internal assessment identifiers cannot enter this ledger. The file is not
copied into the current website build and no historic availability percentage is displayed yet.

## What qualifies as a weekly observation

The collector does not scrape locations, infer readiness or repeat an old status under a new date. It
selects the latest `status-history.jsonl` release whose dataset date falls in the Monday-to-Sunday
observation week. That status release must exactly match the current validated public fleet release,
including release date, revision, release instant, roster and every status. If no such reviewed release
exists, the required scheduled collection fails and writes nothing. The failure is the honest record of
a coverage gap; stale data is never converted into a fresh observation.

Run locally with:

```bash
npm run snapshot:availability -- --week-ending YYYY-MM-DD --require-observation
npm run validate:availability -- --base-ref origin/main
```

The week-ending date must be a Sunday. Omitting it selects the most recent UTC Sunday.

## Corrections and auditability

The first merged record for a week uses ledger revision 1. If a later reviewed public release corrects
an already merged week, the collector appends revision 2 (and later revisions as needed) with a reason.
It never rewrites or deletes a merged line. Readers collapse same-week revisions to the latest logical
observation, while validators retain and authenticate the physical audit trail. A correction must point
to a later public release and use a later recording instant.

An unmerged candidate is different: there must be only one open candidate for the week. A retry with
the same reviewed source is a no-op. A newer corrected source safely replaces the existing candidate
branch, including legacy run-numbered automation branches, so the open pull request remains the one
canonical review surface. A stale or conflicting run fails before pushing. Workflow concurrency and an
exact remote-head lease prevent an older run from racing over a corrected candidate.

## Future calculations

`src/utils/availability-history.js` calculates whole-fleet or named-class availability for an explicit
date range using the class recorded in each weekly observation, so later roster or class changes do not
rewrite history. `Available` and `Deployed` are active. `In re-fit` is known inactive. `Unknown` is never
guessed: it reduces coverage and is excluded from the availability denominator. Museum and
decommissioned records are excluded.

The twelve-month helper returns `insufficient_history` and no availability percentage until at least 52
logical weekly observations span 350 days. It separately reports known-status coverage. Public display
requires a future product decision and is intentionally not wired into the current interface.

## Proposed scheduled write mechanism

`.github/workflows/weekly-availability-history.yml` is proposed for review and must not be merged or
enabled without separate explicit owner authorization. It runs at 06:30 UTC on Monday and when a
reviewed public fleet/status release lands on `main`. A read-only job performs collection, the path allow-list, ledger validation,
tests, both production builds and the dependency audit, then passes only the one-day ledger artifact to
a separate write-scoped job. That second job checks the path again, refuses a duplicate open candidate,
creates a new automation branch and opens a pull request containing only `availability-history.jsonl`.
It never commits directly to `main`, never auto-merges and does not modify the public dataset.

Only the second job receives `contents: write` and `pull-requests: write`; the collector/validator has
`contents: read`. Both checkouts use `persist-credentials: false`, and the write token is exposed only
after the candidate has passed the path allow-list, validation and build gates. Repository settings must permit GitHub
Actions to create pull requests. Pull requests created with the repository token may not trigger all
downstream workflows automatically, so the candidate runs the complete local gate before opening and
still requires owner review. Every third-party action in this workflow is pinned to an immutable commit.

The candidate uses a stable per-week branch. If branch creation succeeds but GitHub refuses pull-request
creation, the workflow removes a newly created branch or restores a pre-existing orphan to its prior
commit using an exact lease. A previously orphaned, unchanged branch is deliberately left untouched and
can be recovered by rerunning after the repository permission is enabled. The required owner setting is
**Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull
requests**. The workflow does not and cannot enable that setting itself.
