#!/bin/sh
# HUMAN ADMINISTRATOR ONLY from sealed root-owned staging. Never callable over MCP.
# archive | update | rotate-key | restore YYYYmmddTHHMMSSZ
set -eu
[ "$(/usr/bin/id -u)" = 0 ] || exit 1
cd /Library/RNFSBroker-stage
[ "$#" -ge 1 ]
case "$1" in archive|update|rotate-key) [ "$#" = 1 ];; restore) [ "$#" = 2 ]; printf '%s\n' "$2" | /usr/bin/grep -Eq '^[0-9]{8}T[0-9]{6}Z$';; *) exit 1;; esac
/usr/bin/shasum -a 256 -c SOURCE-SHA256SUMS
# Archive keys only on the FileVault-protected system volume.
[ "$(/usr/bin/fdesetup status)" = 'FileVault is On.' ]
# Administrator must bootout and await worker exit before this script.
if /bin/launchctl print system/org.rnfs.gate-b >/dev/null 2>&1; then exit 1; fi
if /usr/bin/pgrep -u _rnfsbroker >/dev/null; then exit 1; fi
if [ "$1" != restore ]; then /usr/bin/shasum -a 256 -c /Library/RNFSBroker/INSTALLED-SHA256SUMS; fi
stamp=$(/bin/date -u +%Y%m%dT%H%M%SZ)
archive=/private/var/db/rnfs-broker-archive/$stamp
[ ! -e "$archive" ]
umask 077
/usr/bin/install -d -o root -g wheel -m 0700 /private/var/db/rnfs-broker-archive "$archive"
if [ -d /Library/RNFSBroker ]; then /usr/bin/ditto /Library/RNFSBroker "$archive/bundle"; fi
if [ -d /private/var/db/rnfs-broker-keys ]; then /usr/bin/ditto /private/var/db/rnfs-broker-keys "$archive/keys"; fi
if [ -f /Library/LaunchDaemons/org.rnfs.gate-b.plist ]; then /bin/cp /Library/LaunchDaemons/org.rnfs.gate-b.plist "$archive/service.plist"; fi
# Preserve receipts separately; they are never restored over current runs.
/usr/bin/ditto /private/var/db/rnfs-broker/runs "$archive/runs"
if [ "$1" != restore ]; then
 (cd "$archive" && /usr/bin/shasum -a 256 bundle/broker bundle/verify bundle/sandbox-probe bundle/client.mjs bundle/fixture.dat bundle/policy.json keys/receipt.key service.plist > ARCHIVE-SHA256SUMS)
else
 printf 'Forensic copy of possibly partial installation; not an approved restore source.\n' > "$archive/PARTIAL-INSTALLATION"
fi
case "$1" in
 archive)
  printf 'Verified archive retained at %s; service remains stopped.\n' "$archive"
  exit 0
  ;;
 update)
  /usr/bin/env -i PATH=/usr/bin:/bin /bin/sh ./build.sh
  for executable in build/broker build/verify build/sandbox-probe build/hold-lock; do
   /bin/sh ./check-dependencies.sh "$executable"
  done
  /usr/bin/install -o root -g wheel -m 0555 build/broker build/verify build/sandbox-probe /Library/RNFSBroker/
  /usr/bin/install -o root -g wheel -m 0444 fixture.dat client.mjs /Library/RNFSBroker/
  /usr/bin/install -o root -g wheel -m 0444 org.rnfs.gate-b.plist /Library/LaunchDaemons/org.rnfs.gate-b.plist
  ;;
 rotate-key)
  [ ! -e /private/var/db/rnfs-broker-keys/receipt.next ]
  /usr/bin/openssl rand -out /private/var/db/rnfs-broker-keys/receipt.next 32
  /usr/sbin/chown root:_rnfsbroker /private/var/db/rnfs-broker-keys/receipt.next
  /bin/chmod 0440 /private/var/db/rnfs-broker-keys/receipt.next
  /bin/mv /private/var/db/rnfs-broker-keys/receipt.next /private/var/db/rnfs-broker-keys/receipt.key
  ;;
 restore)
  prior=/private/var/db/rnfs-broker-archive/$2
  [ -d "$prior" ]
  (cd "$prior" && /usr/bin/shasum -a 256 -c ARCHIVE-SHA256SUMS)
  /usr/bin/install -o root -g wheel -m 0555 "$prior/bundle/broker" "$prior/bundle/verify" "$prior/bundle/sandbox-probe" /Library/RNFSBroker/
  /usr/bin/install -o root -g wheel -m 0444 "$prior/bundle/fixture.dat" "$prior/bundle/client.mjs" /Library/RNFSBroker/
  /usr/bin/install -o root -g _rnfsbroker -m 0440 "$prior/keys/receipt.key" /private/var/db/rnfs-broker-keys/receipt.key
  /usr/bin/install -o root -g wheel -m 0444 "$prior/service.plist" /Library/LaunchDaemons/org.rnfs.gate-b.plist
  # This v1 script restores only v1-compatible packages. Other schemas require reviewed migration.
  ;;
esac
broker_hash=$(/usr/bin/shasum -a 256 /Library/RNFSBroker/broker | /usr/bin/awk '{print $1}')
fixture_hash=$(/usr/bin/shasum -a 256 /Library/RNFSBroker/fixture.dat | /usr/bin/awk '{print $1}')
key_id=$(/usr/bin/shasum -a 256 /private/var/db/rnfs-broker-keys/receipt.key | /usr/bin/awk '{print $1}')
printf '{"policyVersion":"rnfs-gate-b-v1","brokerSha256":"%s","fixtureSha256":"%s","keyId":"%s"}\n' "$broker_hash" "$fixture_hash" "$key_id" > /Library/RNFSBroker/policy.json
/bin/chmod 0444 /Library/RNFSBroker/policy.json
/usr/bin/shasum -a 256 /Library/RNFSBroker/broker /Library/RNFSBroker/verify /Library/RNFSBroker/sandbox-probe /Library/RNFSBroker/client.mjs /Library/RNFSBroker/fixture.dat /Library/RNFSBroker/policy.json /Library/LaunchDaemons/org.rnfs.gate-b.plist > /Library/RNFSBroker/INSTALLED-SHA256SUMS
/bin/chmod 0444 /Library/RNFSBroker/INSTALLED-SHA256SUMS
printf 'Stopped; preserved prior version in %s. Verify and bootstrap separately, then repeat B3.\n' "$archive"
