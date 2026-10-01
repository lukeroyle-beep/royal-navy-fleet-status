# Hosting recommendation — no deployment authorised

**Smallest first option: a private Site-hosted MCP service serving only the sanitised replacement report**, subject to verifying owner-only access, available account capability and actual pricing before implementation. It avoids operating a Mac-facing server and can use Sites' managed authentication and private plugin. This recommendation is conditional: the capability documentation was inspected, but no Site was provisioned, connected, priced or tested.

An **isolated Cloudflare Worker alongside existing hosting** is the fallback if Sites access, cost or transfer requirements do not fit. The repository already uses Cloudflare Workers for static assets (`wrangler.jsonc`). Use a separate Worker and secrets/access boundary; do not add operational tools to the public fleet site or reuse its public asset paths. Neither choice needs a database, always-on VM, model-powered cron or broad GitHub crawler.

| Concern | Private Site MCP | Separate Worker on existing hosting |
|---|---|---|
| Authentication | Sites manages OAuth/identity at its boundary. Enforce the intended owner on every data-bearing tool; return 401/403 for unauthorised requests. Do not trust caller-forged identity headers outside that boundary. | Implement and verify MCP-compatible OAuth resource-server protection, issuer/audience/scope validation and per-user authorisation. Browser login or a Cloudflare Access page alone is not proof of ChatGPT MCP compatibility. |
| Connection | Use the Site-provisioned private plugin; acceptance requires an actual authorised read and unauthorised rejection. | Separate MCP connection and compatible authorisation-server discovery; integration work is greater. |
| Mac receipts | Owner-authorised export/push of this sanitised report only. No inbound Mac access. | Same one-way export/push; never a filesystem mount or exposed local broker. |
| Freshness | Recompute from original source times at read time; upload/hosting timestamps cannot refresh old evidence. | Same. Expired or unavailable transfer produces stale/unknown fields. |
| Maintenance | Managed hosting/auth lowers deployment work; still maintain adapters, access checks, retention, schema and dependency updates. | Existing hosting familiarity; own transport/auth, secrets, limits, dependency updates and monitoring. |
| Cost evidence | Unmeasured: no account quote, metering or entitlement verified. Do not claim free/included. | Published Workers Free limit is 100,000 requests/day shared with Pages Functions; account eligibility, current usage, CPU, storage and auth costs are unmeasured. No zero-cost claim. |

The installed Sites MCP capability documentation describes a stateless HTTP `/mcp` endpoint, managed OAuth and Site-scoped trusted identity headers. These are documented capabilities, not a verified deployment. The report library currently uses Node crypto and native validators, so a hosted consumer should receive the sanitised envelope and recompute freshness/content identity with a small reviewed implementation, or bundle a compatible runtime. Do not move raw native sweep/certificate inputs into hosting merely to reuse Node validation.

For Workers pricing and limits see [Cloudflare pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [limits](https://developers.cloudflare.com/workers/platform/limits/), consulted 1 October 2026. For the authentication design see the [MCP authorisation specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/authorization/index.mdx). These references describe requirements/rates; they do not establish RNFS account configuration or end-to-end compatibility.

## Sanitised transfer boundary

A separately authorised future transfer should run the local bounded reader against explicitly configured existing receipts, validate the output schema and allowlist, and send only the derived report. Use TLS and a narrowly scoped upload credential stored in the Mac's approved secret mechanism, separate from read-only MCP client credentials. The MCP service itself exposes **no upload or execution tool**. Use an existing approved artifact delivery path if available, otherwise propose a narrowly scoped authenticated ingress separately. Do not alter an RNFS schedule as part of this report task.

Verify report origin/integrity at ingestion with a dedicated signature or authenticated transport. `contentId` and `sourceDigest` are change detectors, not signatures. Reject invalid versions, excessive size, unexpected fields and replay/rollback to older source observations; retain conflicting source outcomes rather than silently replacing them. Replace a small derived cache atomically; no private evidence archive or authoritative history is needed. If the Mac is offline, serve the last sanitised report with stale fields and original timestamps, or explicit unknown when no report exists.

Hosted code cannot read the Mac, inherit its signed-in Chrome session, use its broker, or inherit ChatGPT/Space connector grants. Any future connection to GitHub requires its own narrowly scoped identity and explicit source list. Institutional Memory remains durable knowledge; the Space remains the management view. Neither is written by these two read-only tools.

## Measured versus unmeasured

This implementation uses deterministic local code, no model invocation and no network inside the report generator. The sample used one separate public production fetch and bounded GitHub inspection. No hosted request latency, CPU, monthly cost, transfer reliability or authentication behaviour was measured. Before selecting hosting, obtain the actual account quote/limits and test one owner read, one unauthorised read, one sanitised transfer and one expired report. The service decision and deployment require a separate task.
