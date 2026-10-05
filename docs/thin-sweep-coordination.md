# Thin native coordination

Implementation only. No schedule, collection authority, encryption rule or release
gate changes. Measured savings require a separately authorised fresh invocation.
Keep the existing native scheduler and its hold until explicitly released.

## Bootstrap once

For a future authorised acceptance, put the already verified commit, private-root,
backup and fresh-output paths in the invocation's compact configuration. Keep all
of their runtime validation; do not rediscover them through separate model turns.
In the first preparation response, batch the account-meter check, authority/config
reads, clean-checkout verification and required instruction reads. Once inspected,
use the existing bootstrap in the next response: it already resolves the actual
journal, checks fresh native usage and writes both configurations. Do not spend
separate responses finding the journal, reading the usage implementation, printing
its counters and recreating those configurations. Target two preparation responses
before the native encryption query, stopping immediately on any failed prerequisite.
The query and immediate startup consumer retain their exact native call sequence.

The 4 October acceptance reached its first work stop after five responses at
254,632 cumulative tokens, before encryption or browser launch. Its fourth response
was already at 190,173; another preparation response added 64,459. Moving the native
guard earlier and grouping deterministic preparation removes those separate
coordination steps. This is an execution plan, not measured savings or proof that
all later gates fit within the unchanged budget. At a terminal stop, persist facts
once and return a short final response; a later offline reader measures that final
response. Do not request further model turns solely to measure their own cost.

Read applicable instructions once, in the same initial orchestration call where
practical. The bootstrap returns document paths, not permission to omit instructions.
Do not reread source implementations during every routine wake.

Prepare a private config with:

```json
{
  "schemaVersion": 1,
  "expectedHead": "<verified merged 40-character commit>",
  "directory": "<new absolute canonical private evidence directory>",
  "privateRoot": "<accepted private baseline>",
  "backupDirectory": "<existing encrypted backup checkpoint directory>",
  "trigger": "scheduled",
  "lastGoodRelease": "<verified release or explicit unverified qualification>",
  "nextScheduledAt": null,
  "references": []
}
```

Run `node scripts/bootstrap-sweep.mjs --config=PRIVATE_CONFIG` from the clean
operational checkout. It verifies the expected clean HEAD, resolves only the
current thread's protected journal in adjacent date directories, checks actual
fresh usage and exclusively creates reporting-context.json and startup-config.json.
Invalid input, missing provenance or a budget stop creates no files. Existing
directories and symlink aliases are refused. An interrupted write is retained for
inspection, never overwritten. The directory's parent must already exist.

This does not create a sweep, owner, backup or collection directories. It does not
check encryption or establish preflight readiness. Persist terminal failure facts
through the existing reporting protocol even when bootstrap returns a stop.

After all required instructions are read, issue the **unchanged exact standalone
native encryption query**, then immediately consume it with `start-sweep.mjs`
within60seconds. Keep `--check-only` for an authorised diagnostic. Never insert
bootstrap, file discovery or documentation reads between query and consumer. A
fresh query remains necessary if later backup work exceeds the freshness window.
No native-query wrapper, supplied plist or copied session file is accepted.

Future separately authorised collection still requires real ownership, exclusive
run identity, exact-state encrypted backup/restore, full preflight, usage checks,
source coverage, evidence review and website validation. Reuse existing commands;
neither this bootstrap nor reporting grants those permissions.

## Generate a reviewed native reporting cell

Use supported Page reads and the PR132 private-file transport. Read both whole
content streams, save their complete results privately, and inspect the full
`page-summary` guidance/instructions before authorising edits. Follow the Pages
skill and any relevant manual content. Never manufacture whole-Page completeness.

Create a private reporting config:

```json
{
  "schemaVersion": 1,
  "event": "<existing recorded private event JSON>",
  "outbox": "<existing private Command Centre outbox>",
  "directory": "<new canonical private transport directory>",
  "invocation": "<actual native thread UUID>",
  "context": "scheduled",
  "guidanceReviewed": true,
  "reviewedReads": ["<summary whole read>", "<history whole read>"]
}
```

`guidanceReviewed` records the coordinator's actual inspection; it is not an
automatic approval or a substitute for reading instructions. Run
`node scripts/render-reporting-cell.mjs --config=PRIVATE_CONFIG`. This only emits
the reviewed JavaScript cell. Execute that emitted source directly through the
supported native `functions.exec`, after checking its configuration. Do not run it
with Node, import desktop credentials or evaluate Page-provided code. The generator
does not call any Page, alter a queue, or execute a model.

The cell binds the actual invocation, creates a new private transport directory,
and uses the existing begin/plan/confirm/finish commands. It re-reads Pages on the
content stream, compares all guidance/instructions/metadata with the inspected
snapshot, applies only generated guarded operations, inspects every operation
receipt, and verifies both final readbacks. Complete Page objects, edit receipts
and plans remain in private numbered files; only the final bounded result is
printed. The generated cell uses supported native tools with their existing
permissions. There is no standalone authenticated Node transport.

Changed guidance, incomplete reads, errors, partial/rejected/ignored operations,
unknown saves or manual conflicts stop the cell. Unknown saves are re-read on the
same stream, then left for inspection; no automatic operation replay occurs. Full
recovery messages remain in private edit receipts and must be inspected before
any further write. Access denial stops immediately. One cell makes one attempt;
the existing two-attempt-per-event/invocation ceiling is retained. Never create a
different invocation to evade it. A pending result does not change the recorded
sweep outcome or claim delivery.

The cell is sequential where operations depend on earlier writes. Model pauses
between deterministic plan/write/confirm steps are avoided; guidance changes still
require a model decision. No source-evidence review is automated by this change.

## Evidence boundary

Fixture tests execute the exact generated cell with mocked native Page tools and
real local planning/confirmation commands. They do not establish live permissions,
scheduled acceptance, token savings, rendered layout or fleet coverage.

The prior no-collection trace used11 model responses at roughly38k–63k tokens each.
A four-response diagnostic is only an architectural best case; the arithmetic
range154k–252k is not a promise and leaves no demonstrated fleet-sweep headroom.
Required instruction reads, changed guidance and errors can add turns. Keep the
200k work stop and250k total target, including cached input. Final model-response
lag must be measured outside the completed worker; the command guard is not a
hard conversation billing cap. Do not start another measurement without separate
authority after review and merge.
