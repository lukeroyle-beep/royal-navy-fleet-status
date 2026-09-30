# Gate B local execution broker — review and administrator package

**Not installed or activated. Gate B is not PASS.** Gate A PASS is accepted from
Luke's independently reviewed native scheduled run at 18:50:03 BST on 30 September
2026, after merged #114/#115. The fixture README records earlier historical states.
This package does not modify that fixture, its connection, schedules, fleet data,
collection/publication holds, or interrupted runs.

## Architecture and reuse decision

Inspected main `b488e35fba5c51d679357a5ccecbaf1c4b286bbc` includes #113's resumed
artifact validation and cross-process collector locking, #114 and #115. The dirty
primary checkout was preserved; implementation uses an isolated clone/branch.
Existing `sweep-preflight.mjs` reads production private inputs, invokes git/gh and
diskutil, and performs network baseline checks. It is deliberately **not imported**.
Existing acquisition `writer.lock`, index run locks, owner/fencing records,
content-addressed checkpoints, encrypted backup and recovery receipts are also
outside this boundary. No Gate B action can take over, clear or renew those locks.
Existing GitHub Actions and native production scheduling remain unchanged.

Reuse: strict typed arguments, bounded transport, ignored object-valued MCP `_meta`
and evidence binding concepts from Gate A; repository test orchestration. New:
compiled worker, dedicated identity, OS sandbox, native flock, protected HMAC keys,
root-owned executable/configuration, bounded durable synthetic receipts. Gate A's
user process, mutable Homebrew dependency, HTTP endpoint and unsigned receipts are
not reused as trusted components.

`client.mjs` is an **untrusted** stdio MCP adapter using a fixed Unix socket. Its
Node runtime is outside the broker TCB. launchd owns that socket and accepts one
connection per process via `inetdCompatibility.Wait=false`. The worker validates
AF_UNIX/SOCK_STREAM transport, runs as `_rnfsbroker`, closes surplus descriptors,
checks identity, protected paths and hashes, applies its compiled Seatbelt profile,
and only then parses one canonical JSON line. No shell, exec, spawn, configurable
program, caller environment, caller path, caller argv or network readiness exists.
The inetd mode is intentionally narrow: it avoids giving the worker a listener.
Apple discourages this compatibility mode for new general services; B3 must verify
this precise transport on the target OS. There is no TCP fallback.

Exactly three request fields, canonical sorted compact JSON, newline terminated:

```json
{"operation":"readiness_check","policyVersion":"rnfs-gate-b-v1","requestId":"e27e0395-8baf-4a5f-a778-b3da6e4d6ac8"}
```

Allowed operations:

- `readiness_check`: checks local installation/fixture integrity and ability to
  exclusively persist an authenticated receipt. It does not assert fleet,
  encrypted-volume, browser, GitHub, production or scheduled readiness.
- `backup_restore_verify`: additionally copies the fixed synthetic fixture to a
  new run's `backup.dat`, restores it to `restored.dat` and compares full bytes.
  This is an isolated copy/restore test, not an encrypted production-backup proof.

Unknown fields and operations, caller paths, duplicate/noncanonical JSON, malformed
UUIDs and extra command-line arguments fail closed. There is no receipt retrieval
operation: the authenticated receipt is returned in the operation response and
retained privately for administrator verification. Reusing an ID cannot overwrite it.

## Trust, storage, limits and enforcement

TCB: macOS kernel/Seatbelt, launchd, protected Apple dyld/system libraries and
Foundation/CommonCrypto, administrator-reviewed compiler/toolchain and source,
installed native worker, embedded sandbox profile, policy, fixture, key and account
configuration. Administrator/root and a compromised worker are trusted for signing;
this is not hardware attestation. Local administrators can intentionally replace
policy, implementation or keys. The threat boundary is the normal user, Codex and
MCP client without elevation. Clients may invoke the two safe fixture operations;
there is no per-client authentication or confidentiality claim for returned receipts.
The socket is root:wheel 0666 inside root:wheel 0755. Possession of socket access is
not authority to sign arbitrary claims: all payload fields are broker-generated.

| Path | Owner / mode | Purpose |
|---|---|---|
| `/Library/RNFSBroker` | root:wheel 0755 | immutable installed bundle |
| `broker`, `verify`, `sandbox-probe` | root:wheel 0555 | native executables |
| `policy.json`, fixture, adapter, installed hash list | root:wheel 0444 | approved configuration and code |
| `/Library/LaunchDaemons/org.rnfs.gate-b.plist` | root:wheel 0444 | launch definition |
| `/private/var/db/rnfs-broker` | root:wheel 0755 | storage parent; cannot be renamed by worker |
| `operation.lock` | root:_rnfsbroker 0660 | permanent stable lock inode |
| `runs` | _rnfsbroker:_rnfsbroker 0700 | only writable subtree |
| each UUID run directory / files | worker 0700 / 0600 | bounded scratch and receipt |
| `/private/var/db/rnfs-broker-keys` | root:_rnfsbroker 0750 | protected key directory |
| `receipt.key` | root:_rnfsbroker 0440 | 32 random bytes; never sent to client |

Every storage ancestor is opened component-by-component with `openat`, directory
FDs and `O_NOFOLLOW`. Protected ancestors must be root-owned and not group/world
writable; ACLs are rejected. Files must be regular, single-link files. Output names
are fixed under a validated UUID and created exclusively. No restoration overwrites
an existing file. Requests do not select any input/output path. Root storage parents
and lock inode cannot be swapped by the caller or worker. The global `flock(LOCK_EX|
LOCK_NB)` covers capacity, run reservation, backup, restore and durable receipt.
The kernel releases it on exit/crash; the lock file is never deleted. A crashed run
ID remains consumed, possibly with partial files and no success receipt; retry with
a new ID, retain old evidence. This is not recovery of a production sweep lock.

Maximum 256 retained runs (including failed/crashed reservations), 64 KiB fixture,
8 KiB request, 1 MiB per-file RLIMIT, 32 descriptors, 5 CPU seconds, 15 seconds wall
alarm, no core dumps. Capacity exhaustion requires an administrator to stop the
service, archive/hash retained runs, and remove only acknowledged fixture runs.
Local callers can exhaust this small allowance or keep the service busy; guaranteed
availability against a hostile local user is not claimed. No automatic pruning.

The embedded deny-default Seatbelt profile grants reads only to this bundle/state/
keys and Apple `/System/Library` + `/usr/lib`, writes only to fixture runs and the
lock. No process execution or network permission is granted. Inherited Unix stdio
is the sole intended transport. TCP IPv4/IPv6 denial is actively probed before each
request. The separate administrator diagnostic also probes UDP, outbound Unix
sockets and outside filesystem paths. No network-dependent readiness is offered.

**Platform limitation:** `sandbox_init` and custom Seatbelt policy are deprecated
macOS interfaces, not a stable public sandbox deployment contract. The current
managed task refuses nested initialization (`Operation not permitted`); actual
network/filesystem confinement is therefore **INSTALLATION_DEPENDENT**, not locally
passed or simulated. If the exact installed profile, Foundation dependencies or
inherited socket fail on the target macOS, B3 is BLOCKED. Do not remove the sandbox,
add broad network/filesystem permissions, run as the user/root, or substitute an
application promise. An alternative OS-supported administrator-controlled isolation
mechanism would require a new design/review, not an installation workaround.

## Receipts and integrity

Response envelope contains exact payload bytes as `payloadBase64` plus
`hmacSha256` (base64 HMAC-SHA256). Payload binds operation, UUID, UTC Unix start/end
timestamps, outcome, request and immutable fixture hashes, backup/restore/result
hashes, binary/version, policy/configuration hash, key ID and UID/GID. Success is
persisted and fsynced before response. Rejects are explicit unsigned diagnostics;
a missing/invalid success receipt is never PASS. A killed process may leave no
receipt. Scheduler provenance must be independently correlated, never inferred.

The key ID is SHA-256 of the high-entropy key, not the key. HMAC verification is
administrator-only with installed native `verify`; supplying a verification secret
to the user would permit forgery and is forbidden. The caller can alter/delete its
copy, not authenticate an altered success. Root and the worker can sign; compromise
of either is outside this design's authenticity boundary. Retained worker-owned
receipts are tamper-evident, not root-immutable or append-only against the worker.

At each invocation the worker checks protected binary/config/fixture/key paths,
compares the binary and fixture to root-approved hashes, verifies exact policy and
key ID. Root-owned hash manifests bind all installed files including launchd and
the administrator verifier. Their trust anchor is administrator review and protected
ownership, not self-reported hashes. Installer rejects non-system dylib paths and
LC_RPATH. Apple protected system dependencies are the OS trust base; third-party
Node/Homebrew libraries never load into the worker. B3 must verify SIP/authenticated
root and dependency ownership; OS updates require revalidation. Startup code and
OS library loading necessarily precede self-checks, protected by administrator
ownership and launchd environment. No caller-controlled environment is propagated.

## Tests and gate accounting

`npm run test:broker` runs native macOS fixture tests. TESTING is a **separate**
compile-time binary with paths fixed to a disposable directory and identity/owner/
sandbox checks explicitly excluded. Receipts say `TEST_ONLY_UNCONFINED`. Production
build has no runtime test/bypass option; installer invokes only fixed production
compiler arguments. Linux CI reports native tests unavailable, never security PASS.

Covered: valid operations; unknown operation; extra args; malformed/duplicate JSON;
shell injection; executable substitution; traversal/absolute escape; symlink input,
output and root; hardlink; ACL; unexpected input/output; production/private path
attempt; replay; two independent clients (exactly one success); independent process
lock and SIGKILL recovery; capacity; altered/forged HMAC; modified config/fixture/
approved executable hash; MCP metadata compatibility. The network diagnostic was
attempted but blocked at nested sandbox initialization, with no enforcement claim.

Pre-installation cannot establish dedicated account isolation, root protection,
actual system dependency trust, key inaccessibility, installed Seatbelt filesystem/
network enforcement, launchd accepted-socket behavior, reboot persistence, native
scheduler access or signed scheduled provenance. B3 tests below cover the first
set; B4 requires a fresh separately authorised native scheduled run.

- B1: repository implementation and tests; see `REVIEW.md` for final review status.
- B2: reviewed installation/update/verification/rollback package; see `REVIEW.md`.
- B3: NOT RUN; separate administrator installation approval required.
- B4: NOT RUN; separate native scheduled-validation approval required.

## Administrator installation (do not execute as part of repository task)

No unrestricted administrator access for Codex is needed. A human administrator
reviews these commands and executes them in a separate terminal after approval.
No sudoers rule, passwordless elevation or client privilege is installed.

1. Inspect macOS version, architecture, SIP/authenticated root, local account ID
   499 availability, root ownership/ACLs of `/Library`, `/Library/LaunchDaemons`,
   `/private`, `/private/var`, `/private/var/db`, `/private/var/run`, and developer
   tools. Stop on mutable ancestors, disabled system protections, existing target
   paths, non-Apple dependencies or account collisions. Do not chmod system parents
   merely to make this work. Verify no broker is loaded. Existing Gate A stays intact.

   ```sh
   /usr/bin/sw_vers
   /usr/bin/uname -m
   /usr/bin/csrutil status
   /usr/bin/csrutil authenticated-root status
   /bin/ls -led /Library /Library/LaunchDaemons /private /private/var /private/var/db /private/var/run
   /usr/bin/dscl . -search /Users UniqueID 499
   /usr/bin/dscl . -search /Groups PrimaryGroupID 499
   /bin/launchctl print system/org.rnfs.gate-b
   /usr/bin/xcrun --find clang
   ```

   The launchctl check should report no service. No output from ID searches is
   required. If 499 is taken, STOP and obtain a reviewed package amendment; do not
   reuse that identity. Check compiler/SDK and xcode-select paths are root-owned.
2. Review the exact PR commit and `SOURCE-SHA256SUMS` against that commit, not just
   a hash list supplied by an untrusted working tree. Run local tests. Replace
   `/ABSOLUTE/REVIEWED/CHECKOUT` once below with that clean immutable checkout.
   Ensure staging does not already exist; preserve any old stage for review.

   ```sh
   sudo /usr/bin/install -d -o root -g wheel -m 0700 /Library/RNFSBroker-stage
   sudo /usr/bin/ditto /ABSOLUTE/REVIEWED/CHECKOUT/tools/execution-broker /Library/RNFSBroker-stage
   sudo /usr/sbin/chown -R root:wheel /Library/RNFSBroker-stage
   sudo /bin/chmod -RN /Library/RNFSBroker-stage
   sudo /bin/chmod -R go-w /Library/RNFSBroker-stage
   sudo /usr/bin/find /Library/RNFSBroker-stage -type l -print
   sudo /bin/sh -c 'cd /Library/RNFSBroker-stage && /usr/bin/shasum -a 256 -c SOURCE-SHA256SUMS'
   ```

   The symlink search must be empty. Inspect that only reviewed files exist;
   discard any prebuilt `build` directory and rebuild using the sealed script.
   The administrator must retain the reviewed commit and source manifest digest
   outside the normal user's writable tree as approval evidence.
3. Execute the sealed installer with a cleared environment:

   ```sh
   sudo /usr/bin/env -i PATH=/usr/bin:/bin /bin/sh /Library/RNFSBroker-stage/install.sh
   ```

   This creates the disabled-login `_rnfsbroker` user/group, fixed paths, root-owned
   binaries/configuration, fresh protected key, immutable fixture, launch definition
   and installed hashes. It does **not** bootstrap the daemon. On partial failure,
   stop and use the rollback checklist; do not rerun over partial state.
4. Independently inspect hashes, accounts, modes/ACLs and dependencies:

   ```sh
   sudo /usr/bin/shasum -a 256 -c /Library/RNFSBroker/INSTALLED-SHA256SUMS
   /usr/bin/otool -L /Library/RNFSBroker/broker
   /usr/bin/otool -l /Library/RNFSBroker/broker
   /usr/bin/id _rnfsbroker
   sudo /bin/ls -leR /Library/RNFSBroker /private/var/db/rnfs-broker /private/var/db/rnfs-broker-keys
   /usr/bin/plutil -lint /Library/LaunchDaemons/org.rnfs.gate-b.plist
   ```

   No unexpected supplementary groups, ACL entries, symlinks or writable dependencies
   are allowed. Key bytes must not be printed. From the normal user, attempt reading
   the key and modifying policy/binary; require permission denial (use open-only
   probes rather than truncation). Do not copy the key to a user test runtime.
5. After all static checks, activate explicitly under the separate installation
   approval, and perform B3 below:

   ```sh
   sudo /bin/launchctl bootstrap system /Library/LaunchDaemons/org.rnfs.gate-b.plist
   /bin/launchctl print system/org.rnfs.gate-b
   /bin/ls -le /private/var/db/rnfs-broker/service.sock
   ```

   The socket parent is the persistent root-owned state directory. Verify
   launchd registration and socket recreation after reboot before an availability
   claim; no client may create or repair the socket.

## B3 verification procedure

1. As administrator, create a non-sensitive outside-boundary canary. Run the sealed
   diagnostic as the actual worker, with a cleared environment:

   ```sh
   sudo /bin/mkdir -m 0755 /private/var/db/rnfs-gate-b-canary
   sudo /usr/bin/install -o root -g wheel -m 0666 /dev/null /private/var/db/rnfs-gate-b-canary/outside.dat
   sudo -u _rnfsbroker /usr/bin/env -i /Library/RNFSBroker/sandbox-probe
   ```

   The mkdir must succeed exclusively: STOP if the path already exists; never
   reuse or chmod an unknown path/symlink. The diagnostic first requires successful
   read-open and write-open of this synthetic canary without truncation before
   applying the sandbox, then requires both opens to be denied.
   Require exit 0 and denial of TCP IPv4/IPv6, UDP, outbound Unix socket, canary,
   production and private paths. Exit 77 is BLOCKED, not skip/PASS. Repeat with an
   independently controlled outside Unix listener and loopback TCP listeners;
   verify no accepts/packets. Do not grant networking to make diagnostic I/O work.
2. In a private user evidence directory, run the reviewed test client:

   ```sh
   /opt/homebrew/bin/node /ABSOLUTE/REVIEWED/CHECKOUT/tools/execution-broker/postinstall.mjs
   ```

   It records fresh requests/responses, both allowed operations, raw service
   rejection cases and duplicate-client exclusion. Require actual successful
   receipt payloads with UID/GID 499, current binary/config/key hashes, and
   `installed-sandbox-required`. Compare restored fixture bytes as administrator.
   For **each** successful UUID from the evidence (substitute UUID):

   ```sh
   sudo /Library/RNFSBroker/verify UUID
   sudo /usr/bin/shasum -a 256 /private/var/db/rnfs-broker/runs/UUID/backup.dat /private/var/db/rnfs-broker/runs/UUID/restored.dat
   ```

   The hash command applies to restore runs only. Inspect original payload and
   outcome; verifier authentication alone does not prove semantic success.
3. Stop the service before tamper/crash tests. Preserve original files and hashes
   in a root-only evidence directory. As administrator, temporarily alter one
   installed broker hash in policy, then fixture bytes, key mode/group, then an
   ACL, then a symlink to a synthetic canary; test each separately and require no
   authenticated success. Restore exact approved bytes/modes after each test.
   Never point restoration at production. For receipt alteration/forgery, alter a
   **copied synthetic run** receipt under a fresh UUID and require verifier failure;
   preserve original signed receipts. Invalid binaries must fail hashes or loader,
   never bypass startup verification. Recheck all installed hashes afterwards.
4. Hold `operation.lock` from a separate administrator/worker process using `flock`,
   call the service and require BUSY; kill only that test holder, then require a
   fresh success. Verify same stable inode and preserved earlier receipts. The
   repository tests implement this with Python solely as an external test holder;
   it is not a runtime dependency. No production lock is touched.
5. Merge only `connection.toml.example` into the intended trusted client config;
   inspect the actual local Node path. Restart that MCP connection and call both
   tools with fresh IDs. Authenticate their retained receipts independently.
   Adapter success alone is not authentication. Record launchd job/account ownership,
   OS version, manifest, raw calls, verifier results and diagnostic output.
6. Independent review must reconcile all evidence before B3 PASS. B4 is still NOT
   RUN. A separately authorised fresh native one-shot scheduled test must exercise
   the installed connection and correlate scheduler trigger, raw outputs, request
   IDs and authenticated receipts. No schedule is supplied/created by this package.

## Update, key rotation and rollback

Updates are offline, administrator-controlled replacements; never hot-update. Stop
only this daemon (`launchctl bootout` below), wait for all its worker processes to
exit (15-second bounded lifetime), preserve root-only receipts/key/config/binaries,
then stage and inspect the next approved commit. Build with the same fixed commands,
verify only Apple dependencies, install root-owned binaries and fixture, regenerate
policy binary/fixture hashes, update installed hashes, inspect ownership and repeat
B3. No root-owned path may temporarily become caller-writable. Re-run B4 after a
separately approved schedule; historical receipts do not certify a new binary.

Key rotation: while stopped, archive the old 32-byte key and its SHA-256 key ID in
root-only encrypted administrator storage, alongside its exact policy and manifests.
Generate a new key with the installer's `openssl rand` command into a new root-owned
file, set root:_rnfsbroker 0440, replace only while stopped, update `keyId` and the
installed policy hash, then reverify. Never overwrite the only old key: old receipts
require it. Roll back code/key/policy as one approved versioned set. HMAC verification
of archived versions must use an administrator-isolated copy of their matching
key/policy/receipt set, never expose keys to clients. No secrets are committed.

Complete rollback (human administrator; no production state touched):

```sh
sudo /bin/launchctl bootout system/org.rnfs.gate-b
/bin/launchctl print system/org.rnfs.gate-b
/usr/bin/pgrep -u _rnfsbroker
```

Require no remaining service/process; preserve any error for diagnosis. Remove only
`rnfs_gate_b` from client MCP configuration and restart that connection. Archive
`/Library/RNFSBroker`, its launch plist, `/private/var/db/rnfs-broker` and the protected
key directory into root-only encrypted storage, retaining source/installed hashes.
Do not place a key archive in the checkout or ordinary user evidence folder.
Create and verify the exact root-only archive with the sealed maintenance script:

```sh
sudo /usr/bin/env -i PATH=/usr/bin:/bin /bin/sh /Library/RNFSBroker-stage/maintenance.sh archive
```

It requires FileVault On, a stopped service, no worker processes and matching
installed hashes, then prints the dated archive path and exits without changing
code, policy or keys. Inspect that archive and its `ARCHIVE-SHA256SUMS`. If the
installation is damaged and cannot be archived normally, stop removal and recover
with the prior matching archive; never discard the sole key/evidence copy.
After archive verification, use the explicit paths below (never a glob):

```sh
sudo /bin/rm /Library/LaunchDaemons/org.rnfs.gate-b.plist
sudo /bin/rm -rf /Library/RNFSBroker /Library/RNFSBroker-stage /private/var/db/rnfs-broker /private/var/db/rnfs-broker-keys
sudo /usr/bin/dscl . -delete /Users/_rnfsbroker
sudo /usr/bin/dscl . -delete /Groups/_rnfsbroker
```

Only delete the account/group if this package created them and no other service was
subsequently assigned to them. Verify no job/socket/account/client stanza remains.
For partial installation, inspect which exact steps completed first; never delete a
pre-existing collided identity. Preserve Gate A, existing schedules, sweep locks,
checkpoint evidence, fleet data and all holds. No rollback automatically reactivates
any predecessor. Reinstallation uses a newly approved clean stage and fresh B3/B4.

## Platform references

- [Apple launchd job guidance](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
- [Apple launchd plist source manual](https://github.com/apple-oss-distributions/launchd/blob/main/man/launchd.plist.5)
- [Apple ACL retrieval implementation](https://github.com/apple-oss-distributions/Libc/blob/main/posix1e/acl_file.c)

The actual installed macOS man pages/SDK and B3 evidence govern compatibility;
these references are not proof of enforcement on the target machine.

### Exact maintenance and adversarial commands

Use these commands in place of improvising the descriptive steps above. Run only
from a human administrator terminal after the separate installation approval.

For update, seal the new reviewed source into `/Library/RNFSBroker-stage` using the
installation staging procedure (move the old stage to a root-only dated archive
first; do not overlay old/new sources). Then:

```sh
sudo /bin/launchctl bootout system/org.rnfs.gate-b
/bin/sleep 16
/usr/bin/pgrep -u _rnfsbroker
sudo /usr/bin/env -i PATH=/usr/bin:/bin /bin/sh /Library/RNFSBroker-stage/maintenance.sh update
sudo /usr/bin/shasum -a 256 -c /Library/RNFSBroker/INSTALLED-SHA256SUMS
sudo /bin/launchctl bootstrap system /Library/LaunchDaemons/org.rnfs.gate-b.plist
```

The process check must be empty. `maintenance.sh` independently enforces stopped
state and FileVault On, archives the prior bundle/key/policy/receipts under the
root-only `/private/var/db/rnfs-broker-archive/TIMESTAMP`, builds/inspects approved
binaries, installs fixed files and regenerates policy/installed hashes. It never
starts the service. Repeat B3 before reconnecting/scheduling. A partially failed
update remains stopped; preserve both prior archive and failure evidence.

For key rotation, use the same stop/process checks, then replace `update` with
`rotate-key`. That command archives the old version, generates a fresh 32-byte key,
sets ownership/mode and updates matching key ID/policy/manifest. Verify and bootstrap
with the two subsequent commands. Old receipts retain their old key ID.

For version rollback, use the same stop/process checks, then:

```sh
sudo /usr/bin/env -i PATH=/usr/bin:/bin /bin/sh /Library/RNFSBroker-stage/maintenance.sh restore YYYYmmddTHHMMSSZ
sudo /usr/bin/shasum -a 256 -c /Library/RNFSBroker/INSTALLED-SHA256SUMS
sudo /bin/launchctl bootstrap system /Library/LaunchDaemons/org.rnfs.gate-b.plist
```

Replace the timestamp with the exact archived version printed previously. This
restores matching v1 code/key/configuration and preserves all current runs; it
never restores archived runs over current state. Different policy schemas require
a new reviewed migration package. Repeat B3, leave B4 unverified until authorised.
Complete removal still follows the rollback section above, retaining archives.
After verification, remove only the package-created canary file and empty directory:
`sudo /bin/rm /private/var/db/rnfs-gate-b-canary/outside.dat` followed by
`sudo /bin/rmdir /private/var/db/rnfs-gate-b-canary`.

B3 native lock test, in administrator terminal A:

```sh
sudo /Library/RNFSBroker-stage/build/hold-lock
```

Record the printed PID. While it holds the lock, terminal B sends a fresh raw
request (run as the normal user; no MCP argument pre-validation):

```sh
request_id=$(/usr/bin/uuidgen | /usr/bin/tr '[:upper:]' '[:lower:]')
/usr/bin/printf '{"operation":"readiness_check","policyVersion":"rnfs-gate-b-v1","requestId":"%s"}\n' "$request_id" | /usr/bin/nc -w 20 -U /private/var/db/rnfs-broker/service.sock
```

Require `BUSY`. As administrator `sudo /bin/kill -KILL PID` targeting only the printed
test PID; resend with a fresh ID and require an authenticated success. `hold-lock`
is compiled in root-owned staging, never exposed via MCP or installed as an operation.

For exact stop/tamper/restart/restore tests after successful baseline calls:

```sh
sudo /usr/bin/env -i PATH=/usr/bin:/bin /bin/sh /Library/RNFSBroker-stage/tamper-check.sh
sudo /usr/bin/shasum -a 256 -c /Library/RNFSBroker/INSTALLED-SHA256SUMS
sudo /bin/launchctl bootstrap system /Library/LaunchDaemons/org.rnfs.gate-b.plist
```

The script exercises altered approved binary hash, fixture, ACL, key mode/group
and fixture symlink using raw socket requests. It leaves the service stopped and
restores approved files even on ordinary failure; inspect before bootstrap. Power
loss requires restoring the printed/preserved root-only tamper directory manually
before any activation. A script failure is not PASS.

The administrator-created outside canary is **0666** for the diagnostic write-open test; this proves
Seatbelt denial instead of a discretionary permissions denial. It never writes
bytes even if access is unexpectedly allowed; unexpected open success is failure.

Compare returned receipt bytes with retained authenticated bytes for each UUID:
the test client writes the exact wire envelope to a user-owned `UUID.json`
without the transport newline. Let the administrator run (replace UUID and absolute user evidence path):

```sh
sudo /usr/bin/cmp /private/var/db/rnfs-broker/runs/UUID/receipt.json /ABSOLUTE/EVIDENCE/UUID.json
sudo /Library/RNFSBroker/verify UUID
```

Require both exit 0. This prevents a malicious or broken untrusted adapter from
substituting an envelope while pointing at a genuine retained UUID. Match binary,
configuration, key ID, operation and timestamps independently as well.
