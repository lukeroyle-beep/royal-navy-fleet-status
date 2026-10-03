# Bounded preparation and work usage

This correction follows the 3 October scheduled failure. It authorises no collection
or scheduled test. Preserve the original run, backup and publication. A new acceptance
attempt requires separate authority after reviewed merge and adoption.

## Fresh paths

Use `node scripts/check-sweep-work.mjs --session=PROTECTED_CURRENT_SESSION
--prepare=PRIVATE_NEW_ATTEMPT` before run preparation. Its parent must already exist.
The helper first checks usage, then creates only checkpoint/acquisition, packets and
browser directories, returning configuration paths. It does not create a run, owner,
backup or evidence. The caller establishes a real owner, creates the bound run and
performs existing exact-state backup/restore and preflight.

Do not pre-create `collectionOutput` or `collectionOutput + '.checkpoints'`, and do
not inventory that future output as an existing recovery directory. The collector
creates it after preflight. Later recovery must include files actually created.
An existing attempt/output fails closed, preserving all bytes; this helper never
removes collisions or takes over a historical run. Retain explicit run/window and
registry bindings. Call the existing stage argument validation before copying a
backup, so configuration errors are cheap.

## Usage gate and its limits

The guard reads only the current thread's protected native journal, selected by an
explicit real path beneath the native session root with matching thread metadata.
Native sessions must remain outside agent write scope. Records are bounded to 64 MiB;
unknown/missing, inconsistent, future or older-than-120-second usage stops work.
Use the provider cumulative `total_tokens`, including cached input. Do not subtract
cached input or reset the count for a new stage/compaction. The default 250,000 target
reserves 50,000 for saving and reporting, so work stops at 200,000. Smaller limits
are supported; larger limits are rejected. Never infer missing measurements as zero.

Run `sweep:guard -- --session=PROTECTED_CURRENT_SESSION` before reading more task
context, before backup preparation, before each browser acquisition batch and before
adjudication. Include `usageBudget: {sessionPath: PROTECTED_CURRENT_SESSION}` in
preflight configuration. Set `RNFS_SWEEP_USAGE_SESSION` to that same protected path
for browser prepare/compact queue commands. The guard is enforced by these commands
when configured. Legacy CLI calls remain compatible and do not gain an implicit gate.
Persist already observed evidence, release owned locks and finalise a bounded outcome
when stopped; record/finalise browser commands remain available for safe shutdown.
Do not start another batch or invocation to evade the cumulative limit.

This is **not a hard conversation/platform billing ceiling**. The model/tool call
which checks the guard has already incurred usage; the guard cannot cancel subsequent
model turns, enforce external browser calls or bound reporting overhead. The reserve
is advisory headroom, not a guarantee. Report any overshoot. No new privileged runner,
background killer or command bridge is introduced. Live enforcement remains unproven
until a separately authorised actual scheduled attempt.

## Compact coordinator contract

At a normal wake, read one compact current status/dispatch receipt, not the entire
append-only handoff and every historical result. Select the exact current protected
session, check usage, and resolve current code/holds before work. Read only the runbook
sections needed for the next permitted stage; never concatenate all skills, source
files and historical receipts into one output. Preserve every applicable instruction.
Use bounded command summaries, reuse already-read context, and retain raw evidence in
private files for targeted inspection. Do not print complete registries or transcripts.

On 3 October the failed attempt made 33 tool calls and returned approximately 298,506
tool-output characters. Its first recorded count above the work threshold was 212,894
at 10:58:54 UTC, after four calls. Final usage was 3,262,658, including 3,118,720 cached
input. These are historical measurements, not proof of savings from this change.
A small total-token allowance may prevent any acquisition in this execution context;
report that limitation honestly rather than quietly redefining the budget.

Keep the existing daily noon schedule and reporting ownership. Until this correction
is merged/adopted and another test is authorised, normal wakes retain the failed
acceptance hold: no run preparation, backup, acquisition or automatic acceptance retry.
Report only a meaningful changed blocker through the existing Command Centre path;
unchanged holds need no repeated broad investigation. Do not adopt unmerged code.
