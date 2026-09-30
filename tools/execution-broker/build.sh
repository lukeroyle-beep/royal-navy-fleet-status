#!/bin/sh
# Build only. No sudo, installation, signing keys or service registration.
set -eu
cd "$(dirname "$0")"
mkdir -p build
/usr/bin/xcrun clang -fobjc-arc -Wall -Wextra -Werror -Wno-deprecated-declarations -framework Foundation broker.m -o build/broker
/usr/bin/otool -L build/broker
/usr/bin/shasum -a 256 broker.m fixture.dat client.mjs build/broker
/usr/bin/xcrun clang -fobjc-arc -Wall -Wextra -Werror -Wno-deprecated-declarations -framework Foundation verify.m -o build/verify
/usr/bin/xcrun clang -fobjc-arc -Wall -Wextra -Werror -Wno-deprecated-declarations -framework Foundation sandbox-probe.m -o build/sandbox-probe
/usr/bin/xcrun clang -Wall -Wextra -Werror hold-lock.c -o build/hold-lock
