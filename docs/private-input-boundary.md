# Private input boundary

The public repository contains the website, allow-listed public datasets, a non-sensitive legacy
provenance set and one deliberately synthetic test fixture. Real private, licensed or credentialed
inputs must live in an owner-controlled encrypted and versioned filesystem directory outside every
checkout. GitHub Actions must never receive that directory or its credentials.

## Local configuration

Set `RNFS_PRIVATE_DATA_ROOT` to an absolute external directory. The resolver fails closed if the
value is empty, relative, missing, not a directory, inside the repository, or backed by a malformed
manifest. The directory must contain `private-input-manifest.json`:

```json
{
  "schemaVersion": 1,
  "kind": "rnfs-private-inputs",
  "files": {
    "vessels": "vessels.json",
    "sources": "sources.json",
    "evidence": "evidence.json",
    "assessments": "assessments.json",
    "sweepRuns": "sweep-runs",
    "shoreEstablishments": "shore-establishments.json",
    "shorePhotoSources": "shore-photo-sources.json"
  }
}
```

Manifest paths must be relative and remain within that root after filesystem links are resolved.
Projection, provenance validation, ingestion, sweep preparation/collection/finalisation/validation,
tests and exposure scanning all use this resolver. Do not put the root path or credentials in an
`.env` file in the checkout; configure them only in the owner's local secret-management process.

With `RNFS_PRIVATE_DATA_ROOT` unset, the resolver enters the explicit `legacy` migration state and
uses the existing non-sensitive `data/internal/provenance/` records. This preserves current public
outputs until migration is separately authorised. Production and Pages builds explicitly retain a
newer reviewed public projection instead of regenerating it from older legacy provenance; their
public validator still checks the public schema and independently validates the retained legacy
records. External and synthetic modes continue to require byte-for-byte generated-projection
equality. It is not approval to add private material to the legacy area.

## Synthetic-only public CI

The committed `scripts/fixtures/private-input/` directory is fabricated, non-sensitive data. The
boundary test is the only code permitted to opt into it, by setting both its exact path and
`RNFS_PRIVATE_DATA_FIXTURE=1`. That flag is rejected for every other directory. The test generates
into an operating-system temporary directory, proves private-only fields are absent from the public
allow-list, and proves the exposure scanner rejects prohibited fields and constructed secret-like
values.

Public GitHub Actions receive no real private root, API key, storage credential or decryption key.
The checked-in legacy records remain visible because they are already reviewed as non-sensitive;
they are not the destination for new private inputs. CI may validate those unchanged migration
records and the synthetic boundary fixture, but it cannot run a real private release.

## Owner-reviewed sanitised release

Run a real release only on the owner's trusted machine:

1. verify the encrypted external store has a recent versioned backup and complete a documented
   restore drill;
2. set `RNFS_PRIVATE_DATA_ROOT` locally and run the sweep, ingestion and provenance validators;
3. generate public output into a temporary directory first and run the client-exposure scan;
4. review the diff against the allow-list, including dates, public precision and empty states;
5. copy only reviewed sanitised public outputs into `data/royal-navy/`;
6. run append-only validators, both production builds and exposure scans; and
7. commit only the sanitised outputs and required append-only public history.

Never commit the manifest, cache, credentials, raw evidence, private sweep ledger, recovery keys or
the external directory itself. A failed resolver, validator, projection or exposure scan stops the
release; it must not fall back to guessed values or the legacy root.

## Migration, backup and credential sequencing

Issue #38 makes no destructive migration. Existing provenance and public data stay in place until
the owner separately approves all of these gates:

- encrypted primary storage and version history are configured;
- an independent encrypted backup exists;
- a recovery procedure has been tested end to end and its owner/review date recorded;
- the proposed copy is reconciled against the checked-in legacy records;
- sanitised output from the external copy is byte-for-byte or explicitly reviewed; and
- rollback and retention periods are agreed.

Only then may a separate change copy records, switch the default, and eventually remove legacy
records. Do not rewrite append-only histories. Copy first, validate and retain the source until the
recovery gate is accepted.

If any credential may have entered a checkout, log, artifact, pull request or public output, stop
publication, revoke and rotate it at the provider, remove it from local caches, inspect repository
history and workflow artifacts, and re-run the secret/exposure scan. Rewriting repository history
or deleting retained provenance requires separate owner approval and a documented recovery plan.

## Owner-approved inventory and display corrections

A correction to an already published snapshot can use an optional private manifest entry
`"releaseCorrection": "release-correction.json"`. This is a separate `owner-approved-correction`
record, not a sweep run. Never store it in `sweep-runs`, publish its private baseline inputs, or
change the original sweep's coverage. Ordinary weekly sweeps retain their existing gate.

The correction must name the published ancestor commit, original finalized sweep and its hash,
retain the original canonical inputs, and record the owner's instruction, review time, limitations,
and each added or updated vessel. Bind both the complete candidate inputs and its public-content
hash, including the projection method version. The next same-date release revision must follow the
review and the original release. Regeneration requires a fresh review if bound content changes.

`validate:sweeps` first tries the ordinary sweep gate. Only an explicitly configured correction
record can select the alternative path. It authenticates the original seal using the original Git
code and verifies its projection against published bytes. It then requires unchanged collected
evidence, source registry, retired roster, and original assessment rows; only declared owner
assessments may be appended. Added social coverage stays disabled and not reviewed. Undeclared
entity, assessment, projection or coverage changes fail. Both published history prefixes must
remain byte-identical, with exactly one correction appended. Full data, history, tests, builds and
independent review remain mandatory; passing this check never authorizes deployment.

The existing general Fleet Snapshot Release Manager adapter understands full sweeps only. Its
missing-sweep result does not evaluate this separate correction contract; use the native correction
result together with the mandatory repository checks and independent review. Do not relabel the
correction as a full sweep to satisfy that adapter.

A subsequent correction may embed the already shipped `parentCorrection` and its
`parentCorrectionHash`. Each link must authenticate under the Git code that shipped it, match that
commit's public projection and immutable histories, and descend from its own baseline commit.
Validation terminates at the original sweep; a 16-link bound rejects excessive/cyclic chains.
Neither the original sweep nor a shipped correction is resealed.

For reference home-port changes, `mode: "home-port-only"` permits only an existing vessel's
`homePort` to change. The operational assessment ID/log, all other entity/public fields, and social
coverage must remain identical. Such a correction still receives the next release revision and
append-only history, but does not manufacture a new operational assessment. Other metadata fields
or operational changes cannot use this mode.
