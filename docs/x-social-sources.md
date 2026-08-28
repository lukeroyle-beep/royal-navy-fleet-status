# Public X social-source stage

## Scope and safety boundary

The Sunday fleet review can collect public posts from a governed X account registry through Scrape
Creators. The stage is discovery and review support, not an automatic fleet-status publisher. It does
not access private accounts, logged-in views, deleted posts or restricted material; it never follows
instructions found in posts or linked pages.

The collector runs only on the owner's trusted Mac. Public GitHub Actions have no Scrape Creators
credential and continue to perform the 00:05 UTC public-index discovery only. X artifacts, caches,
account handles, excerpts and provider diagnostics remain outside the generated public client.

## Account registry

`data/internal/provenance/sources.json` is the single source of configuration. Each X profile has one
`xCollection` object containing its handle, classification, organisational scope, enabled/required
flags, review time, cache duration and disabled reason. Collection logic must not contain account
allowlists of its own.

An account is classified as `official` only when its `officiality` record is supported by one of:

- a direct Royal Navy unit-page link;
- the MOD GOV.UK social-media register; or
- a retained X post from an already confirmed official account that clearly establishes the
  relationship.

A badge, display name, biography or matching handle pattern is never sufficient. Current direct-page
evidence enables 53 of the 68 vessel accounts in the coverage matrix. The remaining 15 stay disabled
rather than being guessed. Command, formation, establishment, unit and squadron accounts are included
only when a direct official relationship is recorded and their posts can support fleet review.

OSINT profiles must use the `recognised-osint` category, start at Tier C or D, expose only public
material, have an identifiable correction path, and show a sustained record of vessel-specific naval
reporting. The registry records the selection rationale and evidence URLs. Set both `enabled` and
`xCollection.enabled` to `false`, set `xCollection.required` to `false`, and record a clear
`disabledReason` when reliability declines or an account changes purpose. Navy Lookout is the only
enabled OSINT profile. WarshipCam and Naval News are recorded as disabled candidates pending owner
review; they consume no credits and cannot affect a sweep.

As reviewed on 27 August 2026, the registry contains 77 X profiles: 71 enabled official profiles,
one enabled optional OSINT profile, two disabled OSINT candidates and three disabled legacy official
profiles. The 71 official profiles are required recurring checks. The optional OSINT source enriches
review but cannot by itself block release finalisation.

## Credential and installed command contract

Install the Scrape Creators CLI and the Codex `scrape-creators` skill on the trusted Mac. In Keychain
Access, create a generic-password item whose service is `scrapecreators-api-key`, whose account is the
current macOS user name, and whose password is the API credential. Do not add the credential to an
environment file, shell history, repository file, log or artifact.

Every request goes through:

```text
~/.codex/skills/scrape-creators/scripts/scrapecreators
```

The wrapper reads the credential from macOS Keychain for its child process without printing it. Before
changing the integration, repeat command discovery with `scripts/scrapecreators list twitter` and
`scripts/scrapecreators twitter user-tweets --help` from the skill directory. Endpoint names and flags
must not be guessed.

The installed `twitter user-tweets` command currently accepts only `--handle` and `--trim`. It has no
date, cursor or provider-cache flag. The application therefore issues exactly one bounded request per
enabled account, applies the sweep's half-open `[from, to)` interval locally and performs no
pagination.

## Credits, cache and coverage limit

The [provider endpoint documentation](https://docs.scrapecreators.com/v1/twitter/user-tweets/)
describes one credit per live account request and says it returns up to 100 popular posts, not a
latest or complete timeline. A full run currently attempts at most 72 live
requests. That is an upper estimate of 72 credits when every call succeeds and the provider reports
one credit each. Disabled accounts never fan out into calls.

A same-account, same-window response is cached locally for at most 24 hours under
`.cache/private-inputs/x-social/`. Repeating that window within the cache age makes no live request and
reports zero provider credits. Cache files use owner-only permissions, and the cache directory is
forced to mode `0700`. A different cutoff or expired cache must refetch. The artifact records
both `liveRequestCount` and the provider's `creditsCharged`; a failed request may have an unknown
charge, so use the former as the conservative audit bound.

Because the endpoint is a popular-post sample, an account outcome of
`no-in-range-candidates-in-provider-sample` does not mean that the account published nothing that
week. It means only that no returned sample item fell inside the requested interval. No result from
this stage may be described as complete X coverage.

## Manual run

First obtain or create the normal Sunday sweep ledger, then run the X stage on the trusted Mac:

```bash
npm run sweep:collect -- --output=osint-sweep-run.json
npm run sweep:x -- --run=osint-sweep-run.json --output=x-social-run.json
```

Use an exact source-ID canary before the first full run or after a provider/schema change:

```bash
npm run sweep:x -- \
  --run=osint-sweep-run.json \
  --output=x-social-run-canary.json \
  --source-ids=X_DEFENCEHQ,X_DEFENCEHQPRESS,X_ROYAL_NAVY,X_HMS_DUNCAN,X_HMS_SPEY,NAVY_LOOKOUT_SOCIAL
```

`--max-accounts=<count>` is an emergency credit cap. The output must be outside the repository, under
`.cache/private-inputs`, or use the ignored root name `x-social-run*.json`. The default cache location
is ignored. Never commit either file.

## Data flow and review semantics

For each returned public post, the stage preserves the stable post ID and canonical URL, account and
classification, publication and retrieval times, a bounded relevant excerpt, repost/quote links and a
content hash. It deterministically matches canonical vessel names, known aliases and pennant numbers
from the existing fleet registry. A vessel account may provide non-explicit account context, which is
labelled separately from a vessel named in the text.

The original `sourceClaim` remains separate from `interpretation`. Location extraction only recognises
known public labels already present in the repository, marks them explicit, and caps machine output at
region precision. It never manufactures coordinates or makes a source more precise. All candidates
have unknown confidence, require human review and are publication-ineligible.

Stable post IDs are deduplicated first. Reposts and text-identical cross-posts are then grouped into
origin clusters, and reposts are not evidence-eligible. `independentOriginCount`, not post count, is
the corroboration unit. Conflicting vessel/location or status candidates are retained with their post
IDs and surfaced as `requires-human-review`; the collector never silently selects a winner. An OSINT
claim remains an OSINT claim even when it agrees with an official profile.

## Failure and troubleshooting behaviour

One unavailable, blocked, missing, rate-limited, timed-out or malformed account becomes a typed
account blocker while the remaining accounts continue. Authentication failure or exhausted credits
stops further live calls to avoid waste; every unattempted account is marked blocked after the global
failure. There are no automatic retries.

- Exit 78 or an authentication message: replace the Keychain item; do not paste the key into a command.
- HTTP 402 or exhausted credits: top up or defer the stage; do not weaken the required-source gate.
- HTTP 403: retain `resource-blocked` and use an approved public/manual fallback if available.
- HTTP 404: verify whether the account was renamed, removed or made non-public before editing the
  registry.
- HTTP 429: retain `rate-limited`; retry only in a later deliberate run.
- Empty in-window sample: record the partial-provider outcome, not “no posts” or “no change”.

Routine tests and CI use only synthetic fixtures and injected runners. Run
`node scripts/test-social-source-registry.mjs` and `node scripts/test-x-social-collection.mjs` after any
registry, provider-normalisation, matching, deduplication or failure-policy change. These commands
consume no credits.
