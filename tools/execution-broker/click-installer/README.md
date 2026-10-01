# Click-to-run Gate B installer

Build on macOS with `python3 tools/execution-broker/click-installer/build.py NEW_DIRECTORY`.
This produces `RNFS-Gate-B.pkg` and `PACKAGE-EVIDENCE.json`. It is **unsigned**;
no Developer ID signature or notarisation is claimed. It uses macOS Installer's
native administrator authentication. Never supply credentials to Codex.

The package embeds the exact source manifest/files from reviewed merge
`a862053236c1d9ac723eec9cc336e4359ae436f1` (#116), regardless of workspace edits.
The wrapper and builder must separately pass review at the final installer commit.
Before delivery, compare the expanded package's preinstall and every source byte
with the reviewed wrapper plus baseline source; retain package SHA-256 outside the
package. The embedded manifest alone does not authenticate the privileged wrapper.
Native Installer is the privileged transport/trust boundary; no mutable workspace
script or download is executed as administrator. This is a local reviewed-package
handoff, not a signed distribution channel or protection against package replacement
by a compromised account. Reverify the delivered digest immediately before opening.

## Opening

Open the delivered `.pkg`, continue through macOS Installer and authenticate in
its native prompt. No terminal commands are needed to install. A refusal or macOS
security block is a stop: retain the message; do not disable security protections.
Installer success means **installed and disabled**, not B3/B4 PASS. Return to the
task for the remaining validation. The installer does not edit MCP configuration.

## Preconditions and recovery

The wrapper requires the running system volume, root-owned protected system and
compiler/SDK ancestors, SIP/authenticated root enabled, unused identity 499 and no
existing broker paths/service. Apple’s root-owned SDK symlink is resolved and its
canonical target checked. It never repairs system permissions. Existing installs,
partial stages, symlinks and identity collisions cause refusal before staging.
Repeated installation is deliberately refusal, not an update or idempotent success.
Use the existing reviewed maintenance procedure for updates or recovery.

It reserves `/Library/RNFSBroker-stage` with mode 0700, then disables exactly
`system/org.rnfs.gate-b` persistently before executing the existing installer.
Root-owned source bytes are reverified after copying. All ordinary later failures
retain `INSTALL-RESULT.txt` and (when execution started) `INSTALL-LOG.txt` in that
stage. No cleanup deletes keys, receipts or accounts; a partial install stays
inactive, including across reboot. A power loss may leave no result file; treat any
existing stage as incomplete until administrator inspection. No rollback success
is claimed. The existing README's partial-install recovery applies, preserving the
new disabled override until static verification and deliberate B3 activation.

Before B3, an administrator must verify the installed manifest, identity, ownership
and prerequisite evidence, then explicitly enable `system/org.rnfs.gate-b` before
its existing bootstrap procedure. Do not enable after a failed/partial install.
Complete the existing B3 adversarial/receipt/recovery contract and narrow MCP setup,
then B4 native schedule/receipt correlation. Neither gate is implemented by this
installer. No production data, locks, schedules or holds are touched.

## Verification and limits

`test.py` checks manifest validation/tampering, native package round-trip byte
identity and actual non-root refusal. `lifecycle-test.py` runs the production
wrapper with disposable paths and mocked OS identity/permission/directory/launchd
calls: existing-stage refusal, identity collision, manifest/source tamper refusal,
and late failure retaining evidence and disabled state. These are ordering/failure
fixtures, **not installed enforcement evidence**. Native root execution, real
launchd disabled state, authentication UI, repeat installation on the host, power
loss recovery and B3/B4 remain installation-dependent. Package extraction/build and
all 37 existing broker fixture tests are independent pre-authentication checks.

## Narrow recovery added after the second native attempt

Native `launchctl print-disabled system` on this host reports the word `disabled`,
not boolean `true`. The installer now requires exactly one matching job line with
that value; enabled/unknown/duplicate results and query failures refuse installation.
The production parser was also tested against the actual read-only host output.

A prior stage may be archived intact to `/Library/RNFSBroker-stage-failed-r2` only
when it is root-owned, mode 0700, ACL-free, contains exactly one regular, single-link,
root-owned mode 0444 `INSTALL-RESULT.txt`, and that file's bytes are exactly the
known `FAILED_REQUIRES_REVIEW` receipt plus newline. Existing installed paths,
identities or a registered service still refuse; so does an existing archive. All
checks and the new package's payload verification occur before the atomic rename.
Hidden files, payload files, symlinks, hardlinks or different result bytes refuse.
Nothing is deleted. This is recovery of the observed pre-payload failure only,
not recovery of arbitrary partial installs. Native stage access is administrator-only.

The expanded fixture suite includes successful simulated installation, recovery
with original bytes retained, archive collision, unexpected hidden content, altered
receipt, symlink/hardlink and disabled-state negative cases. OS permissions are
mocked; these results still do not establish B3 or real privileged recovery.
