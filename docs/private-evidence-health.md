# Private evidence-health view

The evidence-health view is a separate Node server under `scripts/`; it is not imported by
`index.html`, `src/` or Vite. It reads only the configured private input root and reports source
success/failure, mandatory checks, official-account gaps, stale evidence, contradictions, new review
items, vessel/source-family coverage, refresh progress, degraded reasons and last-known-good state.

## Access boundary

The server requires `RNFS_HEALTH_TOKEN` with at least 32 characters and binds only to loopback. It
uses server-side HTTP Basic authentication with username `analyst`, constant-time password
comparison, no-store responses, a restrictive Content Security Policy and no public API route.
A client-side route guard is not an acceptable substitute.

Run on the owner's trusted machine:

```bash
export RNFS_PRIVATE_DATA_ROOT=/absolute/path/to/external/private-inputs
read -s RNFS_HEALTH_TOKEN
export RNFS_HEALTH_TOKEN
npm run health:private
```

Open `http://127.0.0.1:4317` and authenticate as `analyst`. Do not place the token in the repository,
an `.env` file, shell history, screenshot, URL, browser bookmark or support log. Stop the process
when the review is complete.

The server refuses `0.0.0.0` and other non-loopback bindings. Remote deployment requires a separate
owner-approved identity-aware reverse proxy that terminates HTTPS and reaches the loopback server
on the same trusted host. The repository makes no identity-provider or production-deployment
choice.

## States and accessibility

The view distinguishes `empty`, loading, `partial`, `degraded`, `failed` and `healthy`, and retains a
separate last-known-good sweep during a degraded or failed refresh. Loading and failures are
announced through a polite live region. The page uses semantic headings, a skip link, keyboard-safe
native content, high-contrast colours and a reduced-motion rule.

Run `node scripts/test-private-health.mjs` to exercise authorised/unauthorised access, every health
state, coverage calculations, last-known-good behaviour, accessibility structure and absence from
the public Vite entry graph. The production exposure scan additionally rejects private health and
corroboration markers from built assets.
