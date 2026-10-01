# Validation — implementation pass

- `npm ci --ignore-scripts`: passed; audit reported zero vulnerabilities.
- Focused synthetic suite: passed. Covers missing sources, complete native certification, partial fleet coverage, stale/future observations, source conflicts/precedence, changed/unchanged identifiers, malformed input, secret sentinel exclusion, code-pass/runtime-unknown, bounded read-only files and closed contract/sample shape.
- `env -u RNFS_PRIVATE_DATA_ROOT npm run build`: passed, including all existing deterministic suites, native broker synthetic tests, data/history gates, Vite production build and client exposure scan (189 built files).
- Initial `npm run build` with the session's inherited private input override stopped at the existing sweep/content-binding gate against a September 6 baseline. Removing that override for the public-CI-style build resolved the environmental mismatch. No private source or gate was changed.
- `git diff --check`: passed.
- Real sample: production endpoint was fetched read-only; public release metadata agrees with current main. Existing historical certificate validated with the repository validator. Seven explicitly selected input files retained identical bytes, mtime and ctime after reading.
- No live rendered-browser, deployment, installed broker or native scheduler acceptance was performed. Those are separate operational gates. Local full Pages/browser CI is not repeated here because no browser/application code changed; PR CI remains authoritative for required checks.
- No service/authentication/hosting cost test was performed. Hosting recommendation is conditional and documented separately.

The synthetic schema check tests the constructs used by `schema.json`; it is a focused contract regression, not a general JSON Schema implementation. Existing project validators own native receipt semantics. Independent review and any single repair pass are recorded in the PR.
