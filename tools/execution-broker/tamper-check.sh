#!/bin/sh
# HUMAN ADMIN ONLY after successful baseline B3 calls. Stops/starts only Gate B.
set -eu
[ "$(/usr/bin/id -u)" = 0 ]
[ "$#" = 0 ]
cd /Library/RNFSBroker-stage
/usr/bin/shasum -a 256 -c SOURCE-SHA256SUMS
/usr/bin/shasum -a 256 -c /Library/RNFSBroker/INSTALLED-SHA256SUMS
safe=$(/usr/bin/mktemp -d /private/var/db/rnfs-broker-tamper.XXXXXX)
/bin/chmod 0700 "$safe"
/bin/cp /Library/RNFSBroker/policy.json "$safe/policy.json"
/bin/cp /Library/RNFSBroker/fixture.dat "$safe/fixture.dat"
stop() {
 /bin/launchctl bootout system/org.rnfs.gate-b
 /bin/sleep 16
 if /usr/bin/pgrep -u _rnfsbroker >/dev/null; then exit 1; fi
}
restore() {
 /bin/launchctl bootout system/org.rnfs.gate-b >/dev/null 2>&1 || true
 /bin/sleep 16
 if /bin/launchctl print system/org.rnfs.gate-b >/dev/null 2>&1 || /usr/bin/pgrep -u _rnfsbroker >/dev/null; then
  printf 'Manual recovery required: service/worker still present; retained originals in %s\n' "$safe"
  return 1
 fi
 # Restore only known package files; no production restore.
 /bin/rm -f /Library/RNFSBroker/fixture.dat
 /usr/bin/install -o root -g wheel -m 0444 "$safe/fixture.dat" /Library/RNFSBroker/fixture.dat
 /usr/bin/install -o root -g wheel -m 0444 "$safe/policy.json" /Library/RNFSBroker/policy.json
 /bin/chmod -N /Library/RNFSBroker/fixture.dat
 /usr/sbin/chown root:_rnfsbroker /private/var/db/rnfs-broker-keys/receipt.key
 /bin/chmod 0440 /private/var/db/rnfs-broker-keys/receipt.key
 /usr/bin/shasum -a 256 -c /Library/RNFSBroker/INSTALLED-SHA256SUMS
}
trap restore EXIT HUP INT TERM
reject() {
 /bin/launchctl bootstrap system /Library/LaunchDaemons/org.rnfs.gate-b.plist
 request_id=$(/usr/bin/uuidgen | /usr/bin/tr '[:upper:]' '[:lower:]')
 result=$(printf '{"operation":"readiness_check","policyVersion":"rnfs-gate-b-v1","requestId":"%s"}\n' "$request_id" | /usr/bin/nc -w 20 -U /private/var/db/rnfs-broker/service.sock)
 printf '%s\n' "$result"
 printf '%s\n' "$result" | /usr/bin/grep -q '"outcome":"REJECTED"'
 stop
}
stop
# Wrong approved binary digest must fail closed.
/usr/bin/sed 's/"brokerSha256":"[a-f0-9]*"/"brokerSha256":"invalid"/' "$safe/policy.json" > /Library/RNFSBroker/policy.json
reject
/usr/bin/install -o root -g wheel -m 0444 "$safe/policy.json" /Library/RNFSBroker/policy.json
printf 'tamper\n' >> /Library/RNFSBroker/fixture.dat
reject
/usr/bin/install -o root -g wheel -m 0444 "$safe/fixture.dat" /Library/RNFSBroker/fixture.dat
/bin/chmod +a 'everyone allow write' /Library/RNFSBroker/fixture.dat
reject
/bin/chmod -N /Library/RNFSBroker/fixture.dat
/bin/chmod 0444 /private/var/db/rnfs-broker-keys/receipt.key
reject
/bin/chmod 0440 /private/var/db/rnfs-broker-keys/receipt.key
/usr/sbin/chown root:wheel /private/var/db/rnfs-broker-keys/receipt.key
reject
/usr/sbin/chown root:_rnfsbroker /private/var/db/rnfs-broker-keys/receipt.key
/bin/rm /Library/RNFSBroker/fixture.dat
/bin/ln -s /private/var/db/rnfs-gate-b-canary/outside.dat /Library/RNFSBroker/fixture.dat
reject
restore
trap - EXIT HUP INT TERM
printf 'Tamper checks passed; approved files restored; service STOPPED. Evidence backup: %s\n' "$safe"
