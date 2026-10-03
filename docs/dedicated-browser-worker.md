# Dedicated local browser worker

## Authority and delivery boundary

On 3 October 2026 Luke approved a dedicated Chrome profile, manual initial sign-in,
and implementation of this worker. This is a narrow source-method alternative to
the existing-session desktop-only rule in the personal X sweep skill. It does not
permit APIs, hidden content, copied profiles/cookies, headless or remote browsers,
antibot circumvention, fleet collection now, a new schedule, or publication.
The existing noon Europe/London schedule stays hold-only. Installed components
remain intact. B3/B4 are neither passed nor changed by this implementation.

This package is an unprivileged, headed local Chrome worker. Playwright manages
its own local browser transport; there is no listening service, exposed CDP port,
arbitrary URL/evaluate/shell API or administrator broker. Routine navigation,
readiness checks, bounded visible extraction and persistence need no model calls.
Evidence interpretation and source completion still require the coordinator.
No numerical token saving, persistent-login reliability or unattended acceptance
is established by offline tests.

## One-time setup after reviewed merge

1. In the reviewed clean checkout, install locked project dependencies with
   `npm ci`. Chrome must already be installed. No browser download is required.
2. Run `npm run sweep:browser-worker -- setup` under Luke's ordinary Mac account.
   Honour managed permission prompts; do not change restrictions or add a service.
3. Sign into X yourself in the new Chrome window, then close that window. Never
   send the worker a password, export cookies or copy another Chrome profile.

The worker creates only its own owner-only directory beneath
`~/Library/Application Support/Royal Navy Fleet Status/dedicated-browser-worker`.
Its `chrome-profile` contains sensitive browser-managed login state and must never
enter Git, evidence exports or routine evidence backup bundles. The application
never reads that state. This is a code boundary, not an OS sandbox claiming that a
process with the same user cannot technically access it. Setup records only that
the window was closed, not that login was successful. Expired sessions and security
challenges require Luke again; ordinary authorised observations should not.

Setup is deliberately separate from collection. No browser was started while
implementing this PR. Do not run either command from CI or a schedule at merge.

## Narrow operation contract

A coordinator prepares an owner-only private JSON job containing absolute paths
`registry`, `run`, `session` (the existing browser session JSON, not its directory)
and a `request` object with exactly:

```json
{
  "policy": "dedicated-headed-chrome-20261003",
  "operationId": "unique-operation-id",
  "runId": "the-existing-sweep-run-id",
  "sourceId": "a-source-selected-in-that-session",
  "window": {"from": "2026-10-01T00:00:00Z", "to": "2026-10-03T12:00:00Z"},
  "timeoutMs": 30000,
  "maxScrolls": 0
}
```

The window must exactly match the existing prepared run; these example dates are
not a run authorisation. The existing registry/session validator binds current
registry, selection and window. Canonical HTTPS X profile URLs are constructed
from the selected registry handle; caller URLs and scripts are rejected.

Only after separately authorised collection and all existing fresh owner,
encryption, backup/restore, preparation and canary prerequisites pass, invoke:

```text
npm run sweep:browser-worker -- observe --authorised-collection /absolute/private/job.json
```

The explicit flag records operator intent; it is not a replacement for preflight
or proof of permission. This helper does not independently consume native backup
receipts or release collection holds. The coordinator must enforce those gates
before calling it, just as for the existing browser recorder. No integration into
the scheduled collection path is included in this milestone.

Each operation has a 1–30 second observation deadline after browser launch
(launch separately capped at 30 seconds), at most two requested scrolls and three
viewports. Default to zero scrolls. Across the same run/window/registry/source,
checkpoints enforce at most 12 operations and 12 scrolls. A new ID is deliberate
additional collection, not an automatic retry. No historical session is resumed
implicitly. No unrestricted page clicks or writes exist in the observation path.

Readiness requires rendered public profile identity, a signed-in UI indicator
and visible post cards. Loading alone never succeeds. Login, challenge, protected
profile, unavailable account, rate limit, identity mismatch, navigation failure and
timeout return explicit non-complete outcomes. DOM selectors may drift; a false
negative must stop safely, not trigger hidden-network or API fallback. Text and
links are extracted only from visible public profile/post elements, not account
menus, hidden post trees, cookies/storage or network responses. There are no page
screenshots that could include account-menu information. Ambiguous dates,
reposts/quotes and identity remain evidence-review concerns.

## Evidence and recovery

One exclusive writer lock covers both profile and cumulative evidence updates.
A second process or interrupted lock stops; it never guesses that a PID is stale.
For recovery, first verify that no worker or dedicated Chrome remains active,
inspect pending files and retained evidence, and reconcile the exact operation.
Only then may an operator remove that worker's stale lock. Never delete profile
locks or automatically retry an interrupted collection.

An operation reserves its ID before navigation. It writes an immutable owner-only
raw observation with SHA-256, then atomically updates a cumulative reference
checkpoint. Old observations are never overwritten or dropped. Same-ID replay
checks the request and evidence hashes and returns the existing compact receipt;
a changed request or orphan/pending evidence requires review. Full observations
remain private; the model receives only status, counts, hash and file reference
until it explicitly needs evidence. Each record binds source, window, registry
selection and operation. Checkpoint reuse is not a fresh observation.

Every viewport receipt has `coverageComplete:false`, `noChangeClaimAllowed:false`
and `publicationEligible:false`. A successful capture is `partial`, never
`checked-no-findings`. Out-of-window and ambiguous observations remain labelled;
no vessel positions are inferred. To pass reviewed evidence to the existing
`collect-x-browser.mjs` recorder, the coordinator must consider **all** retained
account observations, resolve identity/author/date/repost ambiguity, and construct
its complete cumulative observation. That recorder replaces an account's posts;
feeding only the last viewport would lose evidence and is prohibited. No automatic
raw-to-accepted conversion is provided.

The 76 mandatory peer sources, optional monitored MVT, six-account canary,
protected-location/CASD rules, conflict reconciliation, certificates and website
release validation remain unchanged. Browser receipts do not certify any of them.
Native encryption still requires its exact desktop query and protected native
journal consumer. Authenticated Pages still uses the desktop adapter and exact
readbacks; this worker does not solve those separate capability seams.

## Reporting correction and acceptance

The accompanying reporting fix ignores only the top-level page metadata
`updated_at` field in the guidance comparison. Identity, stream kind, every other
metadata field, actual guidance, tool instructions and agent instructions remain
compared. Existing managed-content/manual-edit/hash guards and both final Page
readbacks remain required. Tests are offline fixtures, not a live Pages replay.

After human merge and manual login, obtain separate authority for **one** scheduled
end-to-end acceptance, not a chain of micro-tests. It must demonstrate fresh
recoverable backup, exclusive ownership, honest source coverage, private evidence,
reviewed deltas or supported no-change, required website validation, reporting
readbacks and aggregate usage within the existing budget, including coordination.
Until then the hold and last good publication remain. Rollback: stop invoking this
optional command and revert its PR; preserve private evidence/profile for reviewed
recovery. No existing scheduler, service or source registry was replaced.

Supported browser mechanics: [Playwright persistent contexts](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)
and [Chrome's default-profile debugging restrictions](https://developer.chrome.com/blog/remote-debugging-port).
