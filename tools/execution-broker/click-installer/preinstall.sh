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
for p in /Library/RNFSBroker /private/var/db/rnfs-broker /private/var/db/rnfs-broker-keys /Library/LaunchDaemons/org.rnfs.gate-b.plist; do
 [ ! -e "$p" ] && [ ! -L "$p" ] || fail 'existing installation or stage; preserve and use reviewed recovery runbook'
done
if launchctl print system/org.rnfs.gate-b >/dev/null 2>&1; then fail 'service already registered'; fi
# Distinguish successful empty directory searches from directory-service failure.
users=$(dscl . -list /Users UniqueID) || fail 'user directory unavailable'
groups=$(dscl . -list /Groups PrimaryGroupID) || fail 'group directory unavailable'
printf '%s\n%s\n' "$users" "$groups" | awk '$1=="_rnfsbroker" || $2==499 {bad=1} END {exit bad}' || fail 'reserved identity collision'
# Recover only the known pre-payload failure shape, preserving every byte.
# Any payload, hidden file, link, unexpected mode/content or archive collision stops.
recover_stage=false
if [ -e /Library/RNFSBroker-stage ] || [ -L /Library/RNFSBroker-stage ]; then
 protected /Library/RNFSBroker-stage
 [ -d /Library/RNFSBroker-stage ] && [ "$(stat -f %Lp /Library/RNFSBroker-stage)" = 700 ] || fail 'existing installation or unrecognised stage'
 count=0
 for entry in /Library/RNFSBroker-stage/* /Library/RNFSBroker-stage/.[!.]* /Library/RNFSBroker-stage/..?*; do
  if [ -e "$entry" ] || [ -L "$entry" ]; then
   [ "$entry" = /Library/RNFSBroker-stage/INSTALL-RESULT.txt ] || fail 'existing installation or unrecognised stage contents'
   count=$((count + 1))
  fi
 done
 [ "$count" = 1 ] || fail 'existing installation or unrecognised stage contents'
 protected /Library/RNFSBroker-stage/INSTALL-RESULT.txt
 [ -f /Library/RNFSBroker-stage/INSTALL-RESULT.txt ] && [ "$(stat -f %l /Library/RNFSBroker-stage/INSTALL-RESULT.txt)" = 1 ] && [ "$(stat -f %Lp /Library/RNFSBroker-stage/INSTALL-RESULT.txt)" = 444 ] || fail 'unrecognised stage result metadata'
 [ "$(shasum -a 256 /Library/RNFSBroker-stage/INSTALL-RESULT.txt | awk '{print $1}')" = 'ef8fa491753dbbdadb285d50777338cf2d21db5f2d8220865bb9941d33fbe995' ] || fail 'unrecognised stage result bytes'
 [ ! -e /Library/RNFSBroker-stage-failed-r2 ] && [ ! -L /Library/RNFSBroker-stage-failed-r2 ] || fail 'recovery archive already exists'
 recover_stage=true
fi
cd "$(dirname "$0")/payload"
[ "$(shasum -a 256 SOURCE-SHA256SUMS | awk '{print $1}')" = '@MANIFEST_SHA256@' ] || fail 'payload manifest differs from reviewed pin'
shasum -a 256 -c SOURCE-SHA256SUMS >/dev/null || fail 'payload differs from reviewed pin'
if [ "$recover_stage" = true ]; then
 /bin/mv /Library/RNFSBroker-stage /Library/RNFSBroker-stage-failed-r2
fi
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
disabled_status=$(launchctl print-disabled system) || fail 'disabled-state query failed'
printf '%s\n' "$disabled_status" | awk '
 $1 == "\"org.rnfs.gate-b\"" {count++; if (NF == 3 && $2 == "=>" && $3 == "disabled") good++}
 END {exit !(count == 1 && good == 1)}' || fail 'could not establish persistent disabled state'
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
