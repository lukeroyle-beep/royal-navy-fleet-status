# Template only — no task created or triggered

Run this as one separately authorised native scheduled validation on the local
Mac, using only the installed rnfs_connectivity_fixture MCP tools. Do not invoke
shell/HTTP substitutes, write configuration, install anything, inspect fleet or
backup data, resume a sweep, change existing schedules, collect or publish.

Before saving the one-shot task, the operator must replace PROBE_UUID,
UNKNOWN_UUID and EXTRA_UUID with three fresh lowercase v4 UUIDs. Preserve this
prompt and the native task ID/due time outside the service receipt.

Call connectivity_probe with exactly:
{"requestId":"PROBE_UUID","operation":"connectivity_probe","policyVersion":"rnfs-connectivity-fixture-v1"}

Then try these two negative requests through the same MCP tool:
{"requestId":"UNKNOWN_UUID","operation":"unknown_operation","policyVersion":"rnfs-connectivity-fixture-v1"}
{"requestId":"EXTRA_UUID","operation":"connectivity_probe","policyVersion":"rnfs-connectivity-fixture-v1","unexpected":true}

Retrieve each receipt with get_receipt and only its requestId. Report the full raw
receipt, receipt digest and actual tool result. If a schema/client blocks a
negative request before it reaches the service, say so; do not claim a service
rejection and do not use another connection to simulate one. If tools are absent,
stop BLOCKED. Do not create a replacement schedule or run a script.

Report native run/thread identifiers only if supplied by the runtime. A statement
that this was scheduled is not evidence. The reviewing operator must correlate
native scheduler trigger provenance and tool-call output with service receipt
bytes, all request IDs and instance ID. Preserve UTC timestamps and show display
times in Europe/London (BST/GMT). Do not declare Gate A PASS without independent
native scheduler evidence. This task never authorises Gate B or installation.
