# Scheduled connection proof — Gate A only

Status: **Gate A BLOCKED; Gate B NOT STARTED**. This is a connectivity fixture,
not an execution broker, readiness verifier or production service. Installation
and runtime activation have not occurred. Local tests cannot establish scheduled
connectivity or permanent readiness.

## Architecture and evidence (30 September 2026)

Current GitHub main was fetched into an isolated clean clone at
`36af4ad95eb5e0408f5623e736e6b45f70d063e7`. PR #113 is merged at that commit.
Its collector acquires an exclusive filesystem lock before requests, uses a
run-ID lock in the external sweep-run store, and retains crash locks for explicit
operator recovery. Resumed discovery targets are checked against a freshly
planned target set. Both `scripts/test-sweep-pipeline.mjs` and
`scripts/test-public-index-resume.mjs` passed against that main, with inherited
private-input selection removed, using fabricated evidence only.

Repository GitHub Actions also schedule public-index discovery on Ubuntu-hosted
runners. Their loopback is the runner, not this Mac; those workflows are not the
connection under test and remain unchanged.

The existing application is a Vite/JavaScript site with separate scripts for
preflight, collection, checkpoints and release gates. No operational code is
imported by this fixture. Existing owner locks, acquisition journal locks,
checkpoints and interrupted runs are neither opened nor changed by it. A future
broker must reuse those locks, never create a competing ownership scheme or
clear a crash lock automatically.

Observed installed versions: ChatGPT desktop **26.928.21956**, build **12404**;
Codex CLI **0.146.0**; Node **v24.19.0** at `/opt/homebrew/bin/node`.
The existing tracker automation records `execution_environment = "local"`,
primary-repository cwd and daily noon schedule. Current configuration contains
no RNFS MCP fixture server; no such tool is callable in this task. The protected
project config requests workspace-write and network access with existing extra
roots. The global config records full access, but the effective current task is
managed workspace-write, network enabled, approval never, and read-only runtime
configuration/Git metadata. Global settings are not proof of effective scheduled
permissions. No config was changed and no expanded shell permission was used.
The prior permanent-permissions assessment and historical scheduled success were
read as context only; the completed encrypted restore was not repeated.

### Documented versus observed versus unverified

- **Documented:** [local scheduled tasks](https://learn.chatgpt.com/docs/automations)
  run through the desktop app against local projects/worktrees; machine and app
  must remain running. Tasks use unattended sandbox settings. Web tasks do not
  directly access local folders.
- **Documented:** [host MCP connections](https://learn.chatgpt.com/docs/extend/mcp)
  support STDIO and Streamable HTTP; the desktop app and CLI share host config.
  Project MCP config requires a trusted project. Settings → MCP servers supports
  adding a URL and restarting the connection.
- **Observed:** installed CLI exposes MCP management; the primary tracker task is
  configured local. The fixture passes local HTTP requests and negative tests.
- **Unverified:** this installed scheduler loading this new MCP connection,
  reaching loopback, completing tool calls and retrieving receipts. Neither
  documentation nor an interactive test proves these facts. A cloud scheduler's
  `127.0.0.1` is not assumed to be this Mac.

## Decisive blocker and smallest next step

The local MCP connection is absent, and adding it changes protected runtime
configuration. The user prohibited that change during this task. A runtime
operator must approve and add the single proposed connection, then a separately
authorised fresh scheduled validation must run. No broker engineering proceeds
before that result is PASS.

The supported automation tool exposes local standalone jobs and recurrence
rules, but its current schema does not document a dedicated one-shot trigger.
Native acceptance of a count-limited rule has **not** been tested. No new schedule
was created while the connection prerequisite is blocked, and no existing
schedule was altered. After connection approval, create exactly one separate
check-only run using the native app's supported one-shot facility, if exposed;
otherwise first verify native support for a count-limited schedule and read back
its terminal/end condition. If the installed product rejects or cannot represent
one shot, stop BLOCKED. Do not substitute a recurring job that relies on an agent
to disable itself, Run now/manual chat, launchd/cron, an API orchestrator or a
shell tool bypass.

## Fixture contract and limitations

`server.mjs` exposes stateless Streamable HTTP JSON-RPC at
`http://127.0.0.1:43187/mcp`. It supports MCP initialization, ping, tool listing,
`connectivity_probe` and `get_receipt`. Requests have an 8 KiB ceiling and receipts
have a 256-entry process lifetime ceiling. It binds only IPv4 loopback, checks
Host, rejects browser Origin headers, and does not enable CORS. No authentication
credential is required; **any local process can call it**. It must never gain
operational powers in this form.

The probe accepts exactly:

```json
{"requestId":"e27e0395-8baf-4a5f-a778-b3da6e4d6ac8","operation":"connectivity_probe","policyVersion":"rnfs-connectivity-fixture-v1"}
```

UUIDs must be lowercase version 4. `get_receipt` accepts only `requestId`.
Valid-ID rejection receipts bind the complete request digest, policy, operation,
source/runtime digests, process instance, UID/GID/PID, native UTC start/end times,
result and output hash. Unknown tool names, malformed IDs/envelopes and transport
errors return errors without a stored receipt. Unknown operation and extra-field
requests with valid IDs produce retrievable rejection receipts.

Receipt hashes detect accidental edits only; they are **not signatures**. The
service emits receipts to stdout and keeps them in memory. A local user who owns
its process/log can alter or forge evidence. Stdout is not a durable authenticated
journal. Preserve raw responses, log bytes and independently captured native
scheduler records together, then have an operator copy/hash them into an
operator-controlled evidence directory. Do not treat an agent's `scheduled=true`
claim, a supplied task ID or a historical receipt as scheduler provenance.

Replay protection and concurrent exclusion here are process-local only. Restart
loses receipts and replay state. That is an explicit Gate A fixture limit, not
crash-safe broker ownership. Collection, publication, backup/restore, credential
access, shell execution and arbitrary file operations do not exist. It reads only
its own source and Node executable to calculate digests. OS filesystem confinement,
worker identity isolation, approved dependency closure, anti-replacement integrity
and outbound-deny enforcement have **not** been installed or tested. Loopback
binding limits inbound address exposure; it is not an outbound firewall.

## Reviewable operator connection procedure (not executed)

Prerequisites: approve this exact fixture revision; have privileges to create a
root-owned fixture code directory and change the local Codex host/project MCP
configuration. No named administrator is assumed. The process can run under the
ordinary logged-in account for this harmless test; that does not satisfy Gate B's
dedicated worker requirement. No launch daemon or privileged service is needed.

1. Review the PR and `bundle-manifest.json`; verify the source/test/config hashes.
   From its clean checkout, run `node tools/connectivity-probe/test.mjs`.
2. An administrator installs just the reviewed server (substitute the absolute
   clean reviewed checkout for `REVIEWED_CHECKOUT`; never use a mutable checkout
   as the installed script). These commands are instructions, not an installer
   that this task executes:

   ```sh
   sudo /usr/bin/install -d -o root -g wheel -m 0755 '/Library/Application Support/RNFS Connectivity Fixture'
   sudo /usr/bin/install -o root -g wheel -m 0444 'REVIEWED_CHECKOUT/tools/connectivity-probe/server.mjs' '/Library/Application Support/RNFS Connectivity Fixture/server.mjs'
   /usr/bin/shasum -a 256 '/Library/Application Support/RNFS Connectivity Fixture/server.mjs'
   /usr/bin/shasum -a 256 /opt/homebrew/bin/node
   ```

   Compare with the manifest and record the actual Node hash/version. Do not
   overwrite an existing installation without reviewing its receipt and digest.
   The Homebrew runtime remains mutable and is not a Gate B approved closure.
3. In a dedicated operator terminal create an empty private fixture log directory
   and start the foreground service with a cleared environment. Use a fresh
   directory for each trial; keep this terminal open through receipt retrieval:

   ```sh
   umask 077
   PROBE_LOG_DIR=$(/usr/bin/mktemp -d /private/tmp/rnfs-connectivity.XXXXXX)
   /usr/bin/env -i /opt/homebrew/bin/node '/Library/Application Support/RNFS Connectivity Fixture/server.mjs' > "$PROBE_LOG_DIR/receipts.jsonl" 2> "$PROBE_LOG_DIR/service.log"
   ```

   No shell is executed by the service; these are operator launch commands. No
   environment values, credentials, user paths or shell arguments come from MCP
   callers. Port collision is a startup failure, not permission to kill another
   process. Do not make the server public or enable a tunnel.
4. Merge **only** `connection.toml.example`'s stanza into the intended trusted
   project's `.codex/config.toml`, or use Settings → MCP servers → Add server,
   Streamable HTTP, name `rnfs_connectivity_fixture`, URL above. Restart that
   connection. Record whether the setting is project or host scoped. Do not
   replace configuration, relax sandboxing, add command rules or edit production
   automation. Verify `/mcp` lists exactly the two tools. Interactive success is
   a prerequisite only.
5. After separate authorisation, create a new native one-shot validation task,
   following the one-shot availability gate above. Use `scheduled-prompt.md`,
   generate three new UUIDs, and record native task ID, due time, actual run/thread
   ID and trigger classification. The task must execute locally on this Mac.
   Leave production automation untouched. Record effective scheduled policy from
   the run itself, rather than copying the interactive policy.
6. Retrieve raw receipts through `get_receipt` in the scheduled run. Independently
   inspect native Scheduled run provenance and tool-call records. Correlate the
   three request IDs, receipt digests and service instance with the log, task/run
   IDs, due/trigger times and raw tool responses. If the client rejects malformed
   calls before sending them, those calls **do not** prove service rejection;
   report the limitation and keep Gate A incomplete, without adding a bypass.
7. Retain ISO UTC timestamps unchanged and render their display with
   `Intl.DateTimeFormat('en-GB', {timeZone:'Europe/London', dateStyle:'full',
   timeStyle:'long'})`. September 30 is BST (UTC+1); use GMT in winter, never a
   hard-coded year-round offset. PASS requires all four Gate A criteria: actual
   scheduled arrival, both service rejections, scheduled receipt retrieval and
   independently correlated native provenance.

## Update, rollback, availability and cost

Updates: stop the fixture, review a new revision and its hashes, install the
reviewed file, record new source/runtime digests, then repeat fresh scheduled
validation. Root-owned source only is not approved-bundle integrity for a broker.
Do not hot-replace a live fixture or promote any operational capabilities.

Rollback: disable/remove **only** `rnfs_connectivity_fixture` in the chosen MCP
configuration, restart its connection, stop the dedicated foreground process with
Ctrl-C, and verify the loopback port is closed. Disable/remove only the new
validation task if one was created. Preserve raw receipts, scheduler evidence and
hashes before deleting the fixture directory. No dedicated credential exists to
revoke. Do not remove other MCP servers, production tasks, locks or checkpoints.

The probe needs no encrypted fleet volume. A future readiness/restore broker
that needs an operator-unlocked encrypted volume cannot recover those operations
unattended after reboot while that volume is locked/absent. It must fail closed
until the operator unlocks/mounts it. Desktop local scheduling also needs the app
running. No encryption weakening, stored unlock secret or unattended unlocking
is proposed.

Ongoing cost: no new subscription, hosting, paid dependency or API billing. The
fixture uses Node built-ins; one scheduled agent run consumes the user's existing
Codex allowance. Operator maintenance is limited to connection/runtime updates,
receipt retention and retesting after changes. There is no permanent readiness
claim. Gate B manifests, privileged worker, network enforcement and adversarial
broker validation remain **not started**, deliberately gated on Gate A.
