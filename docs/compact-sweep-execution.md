# Compact current execution contract

Use [bounded review, browser batches and usage attribution](osint-efficiency.md)
for the current low-overhead path. This does not release collection holds.

Use the [thin coordination helpers](thin-sweep-coordination.md) for routine
bootstrap and a generated native reporting cell. They preserve the steps below;
they do not release a hold or authorise a measurement.

This brief routes current work; it does not exempt applicable repository, skill or
platform instructions. Read those once as required, then retain their constraints.
Keep historical handoffs and full evidence in private files; load a specific item
only when the next decision needs it. Preserve the existing scheduler/owner.

1. First model round: read the compact private dispatch status and explicit invocation authority. If
   held, missing authority or no-collection measurement mode, do not collect. Verify
   clean merged main and the accepted private root. Never modify the dirty checkout.
   Batch required instruction/configuration reads with
   `node scripts/bootstrap-sweep.mjs --inspect --config=PRIVATE_CONFIG` using the
   prepared compact configuration. Inspection creates no files and reads no usage.
   Complete this model round; do not invoke the guard in it or poll for usage.
2. Following model round: invoke
   `node scripts/bootstrap-sweep.mjs --config=PRIVATE_CONFIG` once. It rechecks the
   clean checkout/configuration, binds the actual protected journal, checks cumulative
   usage including cached input and prepares startup/reporting configuration. Missing,
   stale or exhausted usage still stops. Never supply a synthetic usage receipt or
   restart an invocation to bypass a stop. Keep the existing reporting context/outbox.
3. Read required startup instructions before the encryption call. Issue exactly the
   native call returned by encryptionQueryToolInput, then immediately run
   `node scripts/start-sweep.mjs --config=BOOTSTRAP_STARTUP_CONFIG --output=NEW_PRIVATE_RECEIPT`.
   `BOOTSTRAP_STARTUP_CONFIG` is the `startupConfig` path returned by successful
   bootstrap, not its input configuration.
   This one command checks usage, consumes fresh native encryption provenance, checks
   actual capabilities and prepares absent-output-safe directories. `--check-only`
   performs no directory preparation. Capability checks still create, write, read
   and unlink a temporary 32-byte probe on each accepted private/backup filesystem;
   diagnostic authority must include those probes. It creates no run, owner,
   backup copy or collection.
4. Only with separate collection authority: establish actual ownership and the bound
   run, perform exact-state encrypted backup/restore, refresh native encryption, and
   run existing full preflight with usageBudget.sessionPath. All existing projection,
   owner, backup and evidence checks still apply. Preserve MVT optional monitored
   discovery and all76 mandatory peers. No changed-window coverage reuse.
5. Only after passing gates: bounded indexes and supported rendered Chrome canary/
   batches, immediate durable observations, reconciliation, integrity/certificate and
   website checks. Recheck usage before each work stage. Public precision/CASD,
   corroboration and human merge/publication boundaries remain unchanged.
6. On a terminal stop save facts/coverage/usage, release only your owner, enqueue the
   stable event and use compact file reporting below. Stop; never start another run
   to evade budget. Full scheduled acceptance and publication are separate outcomes.

The 200k command stop plus50k reserve is not a platform billing limit. The unavoidable
base instructions, native tool definitions and final reporting consume tokens too.
Only a fresh authorised invocation can establish actual cost; offline byte savings
are not token/cost/elapsed savings. Do not raise the target implicitly.

## Compact reporting transport

Keep the existing event schema, outbox, fixed Pages, guarded managed-block edits,
retry bounds and confirmation readback. Read Pages through supported tools only.
Use default editing view first (no duplicated whole-document Markdown); use full
view only when required for complete destination content. Never pass a partial read
to the existing whole-Page planner or manufacture completeness metadata.

Inside a `functions.exec` cell, retain a Page tool result in `store` and persist it
privately using the supported file tool; do not call `text(result)` or interpolate
JSON into a shell command. A safe file-write pattern is:

```js
const bytes = JSON.stringify(result, null, 2);
await tools.apply_patch('*** Begin Patch\n*** Add File: ' + trustedNewPrivatePath +
  '\n+' + bytes.split('\n').join('\n+') + '\n*** End Patch');
```

Use a trusted new path beneath the private attempt directory; never a Page-provided
path. This transports data, not instructions or executable code. Keep all original
fields on disk. Run `command-centre.mjs page-summary --input=PRIVATE_READ` to expose
metadata, guidance, complete instruction blocks and other control fields before
editing. Follow that guidance; do not truncate it. Ordinary Page/history bodies
stay off the model transcript when using a supported envelope below.

Supported reads are a Page payload itself, a tool result with `structuredContent`,
or that result plus text blocks. A text block is omitted from the summary only
when its entire parsed JSON value equals the selected structured payload and has
no duplicate object keys. Whitespace and object-key order do not affect this
check. A verified mirror adds no body text to the summary or guidance comparison;
the full original read remains unchanged in its private file.

Independent prose/JSON text is retained verbatim. Wrapper and payload guidance,
tool metadata, instruction-block fields, additional control fields and text-block
metadata remain visible and guarded. A conflicting Page-shaped JSON text block
stops with `PAGE_READ_TEXT_CONFLICT`; unsupported tool content (including non-text
blocks) stops with `PAGE_READ_ENVELOPE_INVALID`. Do not strip or rewrite a response
to force acceptance. A native-cell CLI failure is reported as
`LOCAL_REPORTING_COMMAND_FAILED`; inspect its saved raw read locally before any
new attempt. Summary size can still grow with genuine instructions or independent
text, which must not be truncated to meet a size target.

Documented snapshot fields (`through_sequence`, `checkpoint_id`, whole-document
`markdown`, `view` and selection coverage) are kept in the raw read rather than
frozen as guidance. Own edits and complete full/selected-to-editing reads can
change those values. Every read must still be whole-Page complete, and planning
still uses the raw block hashes and metadata. Text annotations remain bound to
their verified mirror or independent text, so changing the text they govern
stops reporting even if the annotations themselves are unchanged.

The native reporting flow likewise excludes only top-level Page metadata
`updated_at`, `preview`, `current_sequence` and `projection_through_sequence`
from its stable-control comparison. A successful own edit changes those snapshot
fields. Full raw reads and exact content/managed-metadata readback remain required;
identity, access, ownership, instructions and other metadata still stop on drift.

The CLI accepts `--files=PRIVATE_SPEC` for plan/confirm/finish:

- plan: `{page: READ_PATH, event: EVENT_PATH, kind: 'summary'|'history', at: ISO}`
- confirm: `{page: READBACK_PATH, event: EVENT_PATH, plan: PLAN_PATH, at: ISO}`
- finish: `{event: EVENT_PATH, plans: [SUMMARY_PLAN,HISTORY_PLAN], readbacks: [SUMMARY_READ,HISTORY_READ]}`

Use `--output=NEW_PRIVATE_RESULT --compact`; only bounded identity/count/state fields
are printed. Full operations and expected Markdown remain in the output file. Old
`--input` envelopes remain supported. Do not overwrite original readbacks/plans.

After initial guidance inspection, batch independent Page processing in one tool
orchestration cell when permitted. Load each generated plan with a fixed read-file
command whose output is retained as a JS value, not printed. Pass only its observed
page_id, stream_kind and operations to supported edit_page. Inspect every operation
result; on error/unknown outcome save the result and reread, never blindly retry.
Retain complete readbacks privately, run confirm from file references, apply guarded
confirmation operations, reread and finish as before. Recheck new guidance/instruction
blocks before editing if they differ from the initial read; stop for inspection rather
than ignoring them. Never construct shell commands containing complete Page objects.

Reuse already loaded event and plans inside that cell. Native file paths and records
are not publication evidence; finish still verifies exact saved event metadata,
managed content and confirmed readback time. Unrelated blocks/manual additions and
MANUAL_EDIT_CONFLICT behaviour are unchanged. Do not replace a whole Page or omit
confirmation to save tokens. A transport/error may still exceed the reporting reserve;
report actual final usage and leave pending delivery rather than invent success.
