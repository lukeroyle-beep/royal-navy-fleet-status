# Same-day release corrections

The fleet release identity is the pair `metadata.asOfDate` and `metadata.releaseRevision`.
Datasets created before release revisioning omit `releaseRevision` and `releasedAt`; readers treat
those releases as revision 1 (`r1`). Revision-aware releases provide both fields:

```json
{
  "asOfDate": "2026-08-23",
  "releaseRevision": 2,
  "releasedAt": "2026-08-23T20:15:00+01:00"
}
```

`releaseRevision` is a positive integer. `releasedAt` is an ISO 8601 instant with a timezone. A
new dataset date starts at r1. A correction on the same date increments the previous revision by
exactly one and uses a later `releasedAt` instant.

Collect and finalise a sweep for the exact correction revision before stamping the release:

```bash
npm run sweep:collect -- --release-revision=2 --output=osint-sweep-run.json
npm run sweep:finalise -- osint-sweep-run.json
```

The release gate does not allow a same-day correction to reuse the earlier revision's sweep. The
sweep completion must also be no later than the correction's `releasedAt` instant.

After updating the canonical and generated fleet metadata, append a same-day status correction
with an explicit audit reason:

```bash
npm run snapshot:status -- --correction --reason "Late official report incorporated"
npm run generate:changes -- --base-ref origin/main
```

The append command writes a schema-v2 JSON Lines record with the release identity and correction
reason. It never edits the shipped r1 line, so the file remains physically append-only. The client
validates every physical line, then keeps only the highest revision for each date before calculating
availability. A correction therefore replaces that day’s logical observation and does not count as
an extra weekly observation.

Publication change files use schema v2 when the current fleet has revision-aware metadata. Equal
`previousAsOfDate` and `currentAsOfDate` values are valid only when
`currentReleaseRevision` is higher. The status history, publication changes and fleet metadata must
all identify the same date, revision and release instant before insights are shown.
