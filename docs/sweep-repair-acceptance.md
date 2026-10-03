# Bounded sweep repair acceptance

The five-step repair approved on 2 October preserves the existing scheduler,
Command Centre delivery, source registry, journals and publication gates. This
first increment adds early capability checks and per-preflight-check timings.
It does not grant execution permissions or establish unattended success.

## 1. Cheap capability check before preparation

Run `node scripts/check-sweep-capabilities.mjs --config=/PRIVATE/capabilities.json
--output=/PRIVATE/unique-receipt.json` in the actual scheduled executor before
creating a new run, copying journals or preparing its backup. The JSON config is:

```json
{
  "schemaVersion": 1,
  "privateRoot": "/PRIVATE/accepted-inputs",
  "backupDirectory": "/Volumes/Encrypted Backup/sweep-checkpoints"
}
```

Both directories must already exist outside every checkout. An optional positive
`ownerPid` checks a previously established owner; omission explicitly reports
`ownerChecked: false`. A pass establishes only the listed capabilities, never
full preflight, exclusive ownership, backup restore, coverage or publication.
The existing exact-state preflight remains mandatory and rechecks encryption.
The check uses the existing Command Centre reporting hook when its normal context
and outbox environment variables are supplied. Preserve that reporting setup.

The sequence is configuration, mounted-volume encryption/device separation,
optional owner liveness, private write/readback and backup write/readback. Failed
checks prevent later probes. No model, browser, network, backup creation, run
creation, permission mutation or collection is dispatched. Receipts are exclusive,
private, measured and safe to report without raw command stderr.

The scheduled runner still needs permissions for these operations. A successful
interactive escalation is not scheduled acceptance. On 2 October the ordinary
sandbox encryption query failed; the same read-only query through supported
approval returned an encrypted, unlocked external APFS volume. No setting was
changed by this diagnostic.

## Execution boundary and narrower option

Codex scheduled tasks inherit sandbox restrictions. Official documentation permits
selective command rules; a rule for a direct command does not elevate a Node
parent that launches that command. Consequently, allowing only the direct
`/usr/sbin/diskutil info -plist` query will not fix this preflight automatically.
Do not run arbitrary Node, shell or the whole collection workflow outside the
sandbox simply to satisfy this gate.

The smallest prospective external permission is the exact read-only volume query.
Before adopting it, review an integration that obtains the query through the
supported scheduled command tool and binds fresh evidence to the mounted volume
UUID, device, mount path and current attempt. The current implementation does not
consume an external encryption assertion or cached receipt. Any future adapter
must preserve independent-device checks, verify mount identity at use, reject stale
or substituted results, and establish trusted invocation provenance. A plain JSON
claim or hash alone does not authenticate an OS query. Local FileVault status does
not establish encryption of an external backup volume.

No new administrator broker, background service, credentials, blanket permission
or mount/unlock operation is part of this repair. A scheduled proof must run without
interactive rescue under the intended normal permissions. Until it passes, stop
before acquisition and retain the last good publication.

Official references: [Scheduled tasks](https://learn.chatgpt.com/docs/automations?surface=app)
and [command rules](https://learn.chatgpt.com/docs/agent-configuration/rules).

## Subsequent steps and completion evidence

2. Apply the owner-approved prospective optional-monitored MVT policy as described
   in [sweep continuation](sweep-continuation.md), or resolve its identity before
   treating it as evidence. This policy is not a source success or a validated
   replacement. Historical one-run quarantines cannot carry forward.
3. Trial compact rendered-public Chrome batches with one writer and the existing
   canary/scroll bounds. Compare equivalent examined windows and coverage, not packet
   processing speed. Retain partial observations and count actual browser calls.
4. Explicitly continue a selected interrupted fixed-window run only after ownership
   and recovery validation. Existing same-run successes are reused; a new cutoff
   requires fresh examination and may reuse only validated cursors/content.
5. Consolidate stage duration, source/vessel/integrity coverage and provider total,
   cached input, uncached input and output usage. Cached input is part of total;
   unknown measurements are null, not zero. Run one actual scheduled full sweep
   only after previous gates pass. Full certificate/website and separate merge/
   publication authority remain required. No speedup is established by fixtures.
