# Scoped native encryption query

Candidate integration; not full scheduled-preflight acceptance. This follows the
first early-capability increment and keeps the application preflight sandboxed.

The supported command rule permits only the direct read-only OS query for the
specific backup mount. It does not permit arbitrary Node, shell, disk changes,
other volumes or an administrator broker. Install through supported approval and
prove the rule in a fresh ordinary scheduled task; an interactive approval or
rule-check result alone is insufficient.

## Query and consume

Before the capability check, or immediately before final preflight, issue one
`functions.exec` call containing exactly the text returned by
`encryptionQueryToolInput(mount)` from `scripts/lib/native-encryption-query.mjs`.
For an example mount `/Volumes/Encrypted Backup`, this is:

```js
text(await tools.exec_command({"cmd":"/usr/sbin/diskutil info -plist '/Volumes/Encrypted Backup'","max_output_tokens":4000}));
```

Use the actual allowlisted mount, with no extra calls, wrappers, output redirection
or escalation. Then immediately execute the normal sandboxed capability/preflight
command with `encryptionQuery: {"mode":"native-session"}` in its private config.
Do not read more documents between the query and consumption. The accepted query
must have started within 60 seconds, a freshness limit for this OS observation,
not a validity exception for backup state. The exact-state backup/restore binding
is unchanged. If backup preparation or other work outlasts this interval, query
again just before preflight; never copy an old successful encryption assertion.

Fresh scheduled tasks locate their current journal in adjacent date directories.
An older continued thread must provide `encryptionQuery.sessionPath`, pointing to
its actual original protected journal. This is a path selector only: current
thread identity and fresh query evidence still must validate. Never create or
copy a journal to satisfy this input.

## Evidence trust boundary

The consumer reads the protected native Codex session journal, not a caller-written
receipt or supplied plist. It requires the current environment's thread ID, native
session metadata, the exact single-tool request, its matching native result, exit
zero and current timestamps. Unrecognised tool-output formats, missing results,
substituted calls and stale results fail closed. Only this thread's journal is
read, with a 64 MiB bound. No source content or raw transcript enters the receipt.

Native session storage must remain outside the executor's writable roots. This
is a local trusted-host audit boundary, not cryptographic remote attestation.
Do not adopt this route in an execution profile that lets the agent rewrite native
session records. Platform journal-format changes require revalidation; no fallback
to asserted JSON success or broad privilege is permitted.

The OS output must report the expected mount, one consistent device identifier
and device node, VolumeUUID, FileVault and Encryption true, and Locked false.
At consumption the live mount device must equal that device node's rdev and differ
from the private-source filesystem. This rechecks live mounted-device identity;
the UUID is taken from the fresh OS query, not independently queried a second time.
The receipt retains hashes and native call identity for independent scheduled
correlation. It does not claim backup restore, exclusive ownership, coverage or
publication. Local Mac FileVault status is never a substitute for this volume query.

Keep Command Centre hooks and finalisation unchanged. A native query alone is not
a completed preflight or an accepted full refresh. Permission to query encryption
also does not resolve another denied operation, such as owner-liveness checking.
