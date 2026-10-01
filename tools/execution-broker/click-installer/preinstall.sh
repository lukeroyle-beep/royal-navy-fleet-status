#!/bin/sh
# Executed only by macOS Installer from its extracted package scripts.
set -eu
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH
umask 077
fail() { printf '%s\n' "RNFS INSTALL REFUSED: $1" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail 'administrator authentication required'
[ "${3:-}" = / ] || fail 'only the running system volume is supported'
# No caller environment reaches the existing lifecycle script.
# Reject links, ACLs and mutable ancestors; never repair system permissions.
protected() {
 p=$1
 while :; do
  [ ! -L "$p" ] && [ -e "$p" ] || fail 'missing or symlink prerequisite'
  [ "$(stat -f %u "$p")" = 0 ] || fail 'non-root prerequisite'
  mode=$(stat -f %Lp "$p")
  [ "$((0$mode & 0022))" = 0 ] || fail 'writable prerequisite'
  [ "$(ls -lde "$p" | wc -l | tr -d ' ')" = 1 ] || fail 'ACL prerequisite'
  [ "$p" = / ] && break
  p=$(dirname "$p")
 done
}
for p in /Library /Library/LaunchDaemons /private/var/db /usr/bin/xcrun; do protected "$p"; done
[ "$(uname -s)" = Darwin ] || fail 'macOS required'
csrutil status | grep -q 'System Integrity Protection status: enabled.' || fail 'SIP not enabled'
root_status=$(csrutil authenticated-root status 2>&1) || fail 'authenticated-root status unavailable; inspect csrutil status outside sandbox'
printf '%s\n' "$root_status" | grep -Eq '^Authenticated Root status: enabled\.?$' || fail 'authenticated-root status did not confirm enabled'
protected "$(xcode-select -p)"
protected "$(/usr/bin/env -i PATH=/usr/bin:/bin /usr/bin/xcrun --find clang)"
sdk=$(/usr/bin/env -i PATH=/usr/bin:/bin /usr/bin/xcrun --show-sdk-path)
protected "$(dirname "$sdk")"
# Apple SDK selector is normally a root-owned symlink. Validate both its
# protected parent and canonical target; do not weaken other path checks.
[ "$(stat -f %u "$sdk")" = 0 ] || fail 'SDK selector owner'
protected "$(cd "$sdk" && pwd -P)"
for p in /Library/RNFSBroker-stage /Library/RNFSBroker /private/var/db/rnfs-broker /private/var/db/rnfs-broker-keys /Library/LaunchDaemons/org.rnfs.gate-b.plist; do
 [ ! -e "$p" ] && [ ! -L "$p" ] || fail 'existing installation or stage; preserve and use reviewed recovery runbook'
done
if launchctl print system/org.rnfs.gate-b >/dev/null 2>&1; then fail 'service already registered'; fi
# Distinguish successful empty directory searches from directory-service failure.
users=$(dscl . -list /Users UniqueID) || fail 'user directory unavailable'
groups=$(dscl . -list /Groups PrimaryGroupID) || fail 'group directory unavailable'
printf '%s\n%s\n' "$users" "$groups" | awk '$1=="_rnfsbroker" || $2==499 {bad=1} END {exit bad}' || fail 'reserved identity collision'
cd "$(dirname "$0")/payload"
[ "$(shasum -a 256 SOURCE-SHA256SUMS | awk '{print $1}')" = '@MANIFEST_SHA256@' ] || fail 'payload manifest differs from reviewed pin'
shasum -a 256 -c SOURCE-SHA256SUMS >/dev/null || fail 'payload differs from reviewed pin'
# A fresh root-only directory is reserved atomically. No overlay or deletion.
mkdir -m 0700 /Library/RNFSBroker-stage || fail 'stage reservation failed'
# From this point, every ordinary failure retains evidence and remains inactive.
result=FAILED_REQUIRES_REVIEW
finish() {
 code=$?
 trap - EXIT
 printf '%s\n' "$result" > /Library/RNFSBroker-stage/INSTALL-RESULT.txt
 chmod 0444 /Library/RNFSBroker-stage/INSTALL-RESULT.txt
 exit "$code"
}
trap finish EXIT
# Persist across reboot: a copied LaunchDaemon plist must not activate before B3.
launchctl disable system/org.rnfs.gate-b
launchctl print-disabled system | grep -Eq '"org\.rnfs\.gate-b"[[:space:]]*=>[[:space:]]*true' || fail 'could not establish persistent disabled state'
# Copy only explicitly pinned regular files; no workspace path is consulted.
while read -r digest name; do
 [ -f "$name" ] && [ ! -L "$name" ] || fail 'invalid packaged file'
 /usr/bin/install -o root -g wheel -m 0400 "$name" "/Library/RNFSBroker-stage/$name"
done < SOURCE-SHA256SUMS
/usr/bin/install -o root -g wheel -m 0400 SOURCE-SHA256SUMS /Library/RNFSBroker-stage/SOURCE-SHA256SUMS
cd /Library/RNFSBroker-stage
shasum -a 256 -c SOURCE-SHA256SUMS >/dev/null
/usr/bin/env -i PATH=/usr/bin:/bin /bin/sh ./install.sh > INSTALL-LOG.txt 2>&1
shasum -a 256 -c /Library/RNFSBroker/INSTALLED-SHA256SUMS > INSTALLED-VERIFICATION.txt 2>&1
# install.sh never bootstraps; neither does this wrapper. B3/B4 still required.
result=INSTALLED_NOT_ACTIVATED_B3_B4_PENDING
printf '%s\n' "$result"
