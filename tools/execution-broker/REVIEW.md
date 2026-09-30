# Gate B review and delivery evidence — 30 September 2026

This record is repository evidence, not installed or scheduled enforcement proof.

## Independent review

A separate reviewer inspected the native broker, untrusted adapter, verifier,
sandbox diagnostic, locking, tests, administrator scripts and runbook. The reviewer
independently executed all **37 native adversarial tests**, verified the source
manifest and shell syntax, and reviewed privilege boundary, command-injection
resistance, path/symlink handling, concurrency, network isolation, HMAC authenticity,
key handling, administrator ownership, dependency integrity and rollback safety.

Resolved findings: Darwin ACL return semantics; key directory/group protection;
retained-run cap; exact UUID length; actual connect/send rather than socket creation
for network checks; precise maintenance and tamper procedures; failure-safe otool
inspection; outside-canary read/write baseline and safe administrator creation;
exact returned-versus-retained receipt bytes; stopped-service restoration checks.

Final reviewed source manifest SHA-256:
`44544b1be9f421fd9cef1a2f40285d031948549dabed7b72f0145c4109f457b0`.
The manifest covers the 16 security-relevant source/package files. This narrative
record is excluded to avoid circular hashes. No secret or compiled binary is stored.

## Validation

- Native fixed-argument production build: PASS; linked dependencies are Apple OS
  libraries/frameworks only. A deliberately added caller-writable LC_RPATH and a
  missing executable are rejected by the dependency inspector.
- Native adversarial suite: **37 PASS**, using disposable keys and the explicitly
  labelled TESTING build. Native HMAC verifier also tested with authentic, altered
  and forged receipts.
- `npm run build`: PASS, including existing deterministic tests and exposure scan.
- `npm run build:pages`: PASS, including existing tests and Pages URL checks.
- `npm ci --ignore-scripts`: PASS; audit reported zero vulnerabilities.
- Plist lint, shell syntax, source hashes: PASS.
- Local browser suite: BLOCKED at Chromium launch by managed task Mach-port
  registration denial (`bootstrap_check_in`, permission denied 1100). No browser
  result is represented as passing. PR CI provides a separate browser check.
- OS sandbox diagnostic attempted: BLOCKED (`sandbox_init`: Operation not permitted)
  by this managed task's nested-sandbox restriction. No network or filesystem
  enforcement PASS is inferred. Final diagnostic additionally requires a fresh
  administrator-owned canary accessible before confinement; run during B3 only.
- No administrator installation, launchd registration, broker activation, account
  creation, production data change, live collection, publication, recovery or
  scheduler modification occurred. The original dirty checkout is unchanged.

## Gates

| Gate | Status | Meaning |
|---|---|---|
| B1 | COMPLETE, independently reviewed | Fixture-only implementation and local adversarial tests |
| B2 | COMPLETE, independently reviewed | Precise administrator install/update/verify/rollback package |
| B3 | NOT RUN / separate approval | Actual installed identity/ownership/dependency/key/filesystem/network/transport enforcement |
| B4 | NOT RUN / separate approval | Fresh native scheduled run and independently correlated authenticated receipts |

**Gate B is not PASS. Permanent scheduled execution readiness is not established.**

Remaining assumptions/blockers: deprecated Seatbelt APIs must work on the exact
installed macOS without policy relaxation; launchd accepted-socket I/O must work
under deny-network policy; dedicated UID/GID 499 must be unused; administrator
must establish root ownership, protected Apple dependencies, key isolation and
FileVault-protected maintenance archives. Reboot behavior and native scheduler
access remain unverified. HMAC authenticates the trusted worker, not an honest
kernel/root or uncompromised worker. Any local caller may consume bounded fixture
capacity; availability against local denial of service is not guaranteed.
