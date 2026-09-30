#!/bin/sh
# ADMINISTRATOR ONLY. Run from reviewed root-owned staging, never from a checkout.
# Installs but deliberately DOES NOT bootstrap/activate the service.
set -eu
[ "$(/usr/bin/id -u)" = 0 ] || exit 1
[ "$#" = 0 ] || exit 1
cd /Library/RNFSBroker-stage
/usr/bin/shasum -a 256 -c SOURCE-SHA256SUMS
[ ! -e /Library/RNFSBroker ]
[ ! -e /private/var/db/rnfs-broker ]
[ ! -e /private/var/db/rnfs-broker-keys ]
[ ! -e /Library/LaunchDaemons/org.rnfs.gate-b.plist ]
# Fixed reserved IDs; collision means STOP. Never repurpose an existing account.
! /usr/bin/dscl . -read /Users/_rnfsbroker >/dev/null 2>&1
! /usr/bin/dscl . -read /Groups/_rnfsbroker >/dev/null 2>&1
[ -z "$(/usr/bin/dscl . -search /Users UniqueID 499)" ]
[ -z "$(/usr/bin/dscl . -search /Groups PrimaryGroupID 499)" ]
/usr/bin/env -i PATH=/usr/bin:/bin /bin/sh ./build.sh
# Dependencies must be Apple OS paths only. Administrator also inspects otool output.
for executable in build/broker build/verify build/sandbox-probe build/hold-lock; do
 /bin/sh ./check-dependencies.sh "$executable"
done
/usr/bin/dscl . -create /Groups/_rnfsbroker
/usr/bin/dscl . -create /Groups/_rnfsbroker PrimaryGroupID 499
/usr/bin/dscl . -create /Users/_rnfsbroker
/usr/bin/dscl . -create /Users/_rnfsbroker UniqueID 499
/usr/bin/dscl . -create /Users/_rnfsbroker PrimaryGroupID 499
/usr/bin/dscl . -create /Users/_rnfsbroker UserShell /usr/bin/false
/usr/bin/dscl . -create /Users/_rnfsbroker NFSHomeDirectory /var/empty
/usr/bin/dscl . -create /Users/_rnfsbroker IsHidden 1
/usr/bin/dscl . -create /Users/_rnfsbroker Password '*'
/usr/bin/install -d -o root -g wheel -m 0755 /Library/RNFSBroker /private/var/db/rnfs-broker
/usr/bin/install -d -o _rnfsbroker -g _rnfsbroker -m 0700 /private/var/db/rnfs-broker/runs
/usr/bin/install -d -o root -g _rnfsbroker -m 0750 /private/var/db/rnfs-broker-keys
/usr/bin/install -o root -g wheel -m 0555 build/broker build/verify build/sandbox-probe /Library/RNFSBroker/
/usr/bin/install -o root -g wheel -m 0444 fixture.dat client.mjs /Library/RNFSBroker/
/usr/bin/install -o root -g _rnfsbroker -m 0660 /dev/null /private/var/db/rnfs-broker/operation.lock
umask 077
/usr/bin/openssl rand -out /private/var/db/rnfs-broker-keys/receipt.key 32
/usr/sbin/chown root:_rnfsbroker /private/var/db/rnfs-broker-keys/receipt.key
/bin/chmod 0440 /private/var/db/rnfs-broker-keys/receipt.key
broker_hash=$(/usr/bin/shasum -a 256 /Library/RNFSBroker/broker | /usr/bin/awk '{print $1}')
fixture_hash=$(/usr/bin/shasum -a 256 /Library/RNFSBroker/fixture.dat | /usr/bin/awk '{print $1}')
key_id=$(/usr/bin/shasum -a 256 /private/var/db/rnfs-broker-keys/receipt.key | /usr/bin/awk '{print $1}')
/usr/bin/printf '{"policyVersion":"rnfs-gate-b-v1","brokerSha256":"%s","fixtureSha256":"%s","keyId":"%s"}\n' "$broker_hash" "$fixture_hash" "$key_id" > /Library/RNFSBroker/policy.json
/bin/chmod 0444 /Library/RNFSBroker/policy.json
/usr/bin/install -o root -g wheel -m 0444 org.rnfs.gate-b.plist /Library/LaunchDaemons/org.rnfs.gate-b.plist
/usr/bin/shasum -a 256 /Library/RNFSBroker/broker /Library/RNFSBroker/verify /Library/RNFSBroker/sandbox-probe /Library/RNFSBroker/client.mjs /Library/RNFSBroker/fixture.dat /Library/RNFSBroker/policy.json /Library/LaunchDaemons/org.rnfs.gate-b.plist > /Library/RNFSBroker/INSTALLED-SHA256SUMS
/bin/chmod 0444 /Library/RNFSBroker/INSTALLED-SHA256SUMS
/usr/bin/plutil -lint /Library/LaunchDaemons/org.rnfs.gate-b.plist
printf '%s\n' 'INSTALLED, NOT ACTIVATED. Complete administrator verification runbook before bootstrap.'
