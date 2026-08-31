# Scheduler incident: 30 August 2026

## Classification

The 12:00 BST trigger did not fail. OpenClaw automation
`0ed0dde6-f1f1-46eb-a9e4-98200e1ee907` started at `2026-08-30T12:00:00.022+01:00`
and finished at `12:04:27+01:00` with an agent terminal state of `BLOCKED`.

The incident was an **execution-prerequisite failure combined with a failure-visibility failure**:

- the governed X canary completed 0/6 checks because the provider returned typed errors;
- only one Scrape Creators credit remained during the recovery inspection, insufficient for the 72
  required X account checks;
- `RNFS_PRIVATE_DATA_ROOT` was not configured for the scheduled process;
- the automation had `delivery.mode: none` and `failureAlert: false`; and
- OpenClaw recorded the agent turn itself as scheduler status `ok` even though its terminal report was
  `BLOCKED`, so a scheduler-status-only monitor could not detect the failed production outcome.

The legacy Buzz workflow `8c44ae64-0b49-48f3-b11e-c653d073e8e9` was not the active scheduler. Its
live definition says that it was retired on 18 August after the OpenClaw migration and is disabled.
The previous runbook incorrectly described that workflow as active.

## Evidence

- OpenClaw job schedule: `0 12 * * 0`, timezone `Europe/London`, exact/no stagger.
- 30 August run: 7/7 public indexes completed, 0/76 required recurring sources completed, 68/68
  current-vessel outcomes pending, and no 30 August snapshot or pull request produced.
- GitHub discovery run `33292890087` completed successfully; it is intentionally discovery-only and
  cannot execute private assessment or publication stages.
- The latest repository and live snapshot remained `2026-08-23 r4` during incident recovery.

## Corrective controls

- OpenClaw remains the single production scheduler and retains the IANA timezone
  `Europe/London`; no seasonally edited UTC cron is used.
- The production prompt must preflight the external private root, signed-in Chrome connection,
  six-account rendered-public-X canary, GitHub authentication, current roster and same-date release
  state before broad collection. The exhausted provider path is retired and must not be re-enabled.
- A blocked or failed production outcome must create or update one dated GitHub issue and preserve a
  bounded audit artifact. A same-date rerun must resume or exit cleanly rather than creating another
  snapshot, branch, pull request, or alert.
- `.github/workflows/weekly-production-watchdog.yml` independently checks the expected repository and
  live snapshot after the Sunday grace period. It reuses one dated issue, closes it after recovery,
  uploads a run-health artifact, and fails visibly. It never publishes data or starts a competing
  production sweep.
- Manual recovery uses the same OpenClaw automation:

  ```bash
  openclaw cron run 0ed0dde6-f1f1-46eb-a9e4-98200e1ee907 --wait --wait-timeout 6h
  ```

  The command should not be retried until the private-root and signed-in Chrome canary preflights pass.
