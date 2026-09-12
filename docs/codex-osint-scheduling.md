# Codex OSINT scheduling

Luke authorized replacement of OpenClaw for today's and all future British Armed Forces Tracker
OSINT sweeps on 6 September 2026. This supersedes earlier scheduler and browser-adapter routing,
while retaining the evidence, review, privacy and idempotency requirements.

## Live schedule

- Codex automation: **Tracker OSINT sweeps**, ID `tracker-sunday-full-osint-sweep`.
- Daily at noon in the host's Europe/London timezone. Keep the Mac on and Codex running. Recheck
  the displayed schedule if the host timezone changes; retain UK daylight-saving behaviour.
- Sunday: full public-index, required recurring/manual-source, six-account X canary, full enabled
  registry, current-vessel, retired-record and integrity review.
- Monday to Saturday: incremental discovery and review of at most ten affected vessels, retaining
  the prior target budget of 250,000 cloud-model tokens. Do not append a weekly status snapshot.
- The former OpenClaw Sunday and daily OSINT jobs are disabled, not deleted. Their configuration
  and run history remain recovery evidence. Other OpenClaw workflows are outside this migration.
- The existing GitHub discovery collector and missed-publication watchdog remain independent;
  neither is a competing full sweep or publication mechanism.

## Execution and browser

Use Codex's supported Computer Use connection to Luke's existing signed-in Chrome and follow its
live documentation. Tab discovery through that connection succeeded during cutover; OpenClaw's
separate Chrome MCP connection failed. Do not require the retired adapter or enable another browser.
Tab discovery alone does not establish X sign-in, canary success or source coverage.

Use the local task orchestrator, X browser sweep and OSINT evidence sweep workflows. The retired
`chrome:control-chrome` entrypoint in older skill text is replaced for this task by the supported
Codex Computer Use Chrome adapter. Every public-X restriction remains: rendered public pages only,
private registry as sole source list, bounded deliberate scrolling, immediate durable observations,
typed blockers, no credentials/storage/network inspection and no API/provider fallback.

At each actual scheduled wake, verify the required skills and external private-data environment in
that process. Validate the manifest and boundary, encrypted backup and documented recovery posture.
The interactive Codex resolver passed external mode on cutover. The encrypted backup and temporary
restore were verified against all thirteen manifest files on 6 September; the first future
scheduled wake still requires live verification in its own execution context.

## Ownership and recovery

Inspect current origin/main, source registry, authoritative evidence interval, existing dated
artifacts, worktrees, branches, PRs and snapshots before mutation. Use an isolated clean worktree.
Acquire an atomic dated owner lock; never replace a fresh active owner or create a competing sweep.
Existing `.buzz/locks/` and `.buzz/audit-artifacts/` locations are retained as data storage; using
those files does not require Buzz or OpenClaw execution. Preserve historic attempt records and
append Codex recovery evidence. Changed registry/window inputs must fail closed.

The 6 September recovery reuses incident #92 and the dated run-health artifact. Its prior OpenClaw
attempt remains BLOCKED with zero collection coverage. Scheduler migration is not sweep completion
and does not close the incident. Continue the same dated recovery directly in Codex.

## Completion and authority

Record actual source, vessel and integrity coverage, candidates, conflicts and blockers. Distinguish
an eligible finalized sweep from candidate release readiness and from publication. Incomplete
coverage cannot support no-change. Data-only OSINT sweeps and snapshots do not require a GitHub
issue, branch or pull request for delivery, as Luke reaffirmed during this recovery. Retain the
existing failure incident for accurate blocker reporting. Code and workflow changes follow their
separate governance. Prepare reviewable data candidates only when the governing gates pass.
Future scheduled runs have no standing authorization to update main, publish or deploy.
On 8 September Luke explicitly authorized the reviewed 6 September recovery release and direct main update.
That dated approval does not authorize unattended publication of future sweeps.

Notify Luke on meaningful findings, completion, a new failure or an action only he can perform.
Do not repeatedly notify for an unchanged blocker. Never fabricate a missed weekly snapshot.

Rollback is a deliberate scheduler cutover: pause the Codex schedule before re-enabling any
predecessor, with explicit owner direction. Never leave both schedulers active.

## Acceleration candidate

See [incremental sweep execution](osint-sweep-acceleration.md) for bounded acquisition, durable cursors, deeper audits, adjudication, certificates and rollout validation. Live full-sweep performance remains to be demonstrated before activation.

## Adoption preflight for subsequent runs

After the acceleration change is merged, use the incremental plan, packet processing and certificate
commands in the runbook for every full Sunday sweep. Retain the existing daily schedule and weekday
scope. This changes orchestration, not publication authority. A weekday partial check cannot issue a
full-sweep PASS certificate.

Before collection, compare the resolved private projection with the current reviewed public release.
The 12 September integration found the default private environment still resolving the older
68-vessel baseline, while the published correction contains 69 vessels. Resolve and validate the
preserved owner-correction manifest matching that release; do not overwrite it with an older sweep
candidate or silently drop the added vessel. Confirm the correction chain with `validate:sweeps`
and the projection with the normal build before preparing the next run.

Carry forward a hash-verified copy of the previously validated acquisition journal into the new
private run workspace. An empty journal is a bootstrap/deeper retrieval, not an incremental run.
Recompute source plans against the current registry and retain explicit failures for sources with
no successful cursor. The September 8 source exception is bound to that run and must not be reused.

Start a fresh wall-clock measurement before registry loading and live acquisition, include browser
collection, adjudication, reconciliation and release checks, and record pauses separately. Packet
processing benchmarks do not demonstrate collection performance. Keep automatic publication blocked
until the fresh run satisfies its own mandatory coverage, 69-record reconciliation (or the actual
current roster), integrity and certificate gates. Record remaining live bottlenecks if it exceeds
60 minutes rather than reducing coverage.
