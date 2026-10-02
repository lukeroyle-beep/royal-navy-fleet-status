# RNFS operations migration — issue 110, first PR

Current native-route acceptance and bounded stage: [native refresh acceptance](native-refresh-acceptance.md). The 2 October candidate replaces broker-specific dependencies only for the separate native route; operational adoption and publication remain held.

## Delivery boundary

Luke approved the audit and bounded first PR on 30 September 2026. This increment adds
preflight, explicit reuse planning, discovery checkpoints and measurements. It does not
activate an automation, change the Sunday noon Europe/London schedule, retire a live
job, revise source policy, alter fleet intelligence or history, publish, or deploy.
Issue 110 remains open for the subsequent migration work.

Target: Luke → ChatGPT → Codex + GitHub → RNFS deterministic infrastructure →
independent acceptance → owner-controlled publication → public website. Institutional
Memory remains durable project knowledge. Private evidence and checkpoints stay outside
all checkouts and public artifacts. Dot is a conditional future orchestration capability,
not a present dependency or a claim about availability in the UK.

## Verified architecture and audit limits

The audit inspected main at `7c7827c`, issues [104](https://github.com/lukeroyle-beep/royal-navy-fleet-status/issues/104),
[108](https://github.com/lukeroyle-beep/royal-navy-fleet-status/issues/108),
[110](https://github.com/lukeroyle-beep/royal-navy-fleet-status/issues/110), merged
[109](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/109), local automation
configuration, private aggregate receipts and the separate uncommitted reliability candidate.
PR 109 changed watchdog guidance, not scheduler execution or timing.

The live Codex configuration inspected was a daily noon local automation: full Sunday
sweep, bounded weekday discovery with at most ten substantive vessel reviews and a
250,000-token target. Its configured model was Astra with low reasoning, with prompt
instructions for Extra High adjudication of difficult material. This is configuration,
not measured model invocation or consumption. A separate hourly health-summary heartbeat
reads broadly overlapping project state. Repository Actions schedule seven public indexes
on Sunday, a late Sunday publication watchdog, and Monday availability derivation.

A daily full-fleet sweep was not established. Five inspected weekday receipts (21, 22,
26, 28 and 29 September) recorded deferred preflight with zero collection/reviews/candidates.
They were consumed as status/recovery information; no evidence candidates existed in
those wakes. Historical weekday discovery yield, accepted-delta rate, total token use
and exact weekday/Sunday acquisition overlap remain unmeasured. Do not extrapolate that
sample into a claim that all historical daily work was useless.

The September 27 wake fired at 11:01:32 UTC. Its original session policy had network
access disabled, approval policy `never`, and writable roots excluding the repository
and private evidence store. This confirms an execution-policy mismatch and is consistent
with the recorded DNS failure; it does not prove an independent resolver outage.
The inherited private input root had 68 records; the reviewed publication had 69. A
later interactive success does not validate the next scheduled context.

The September 27 preserved acquisition journal has 989 hash-chain-verified transactions:
892 inherited plus 97 current-run transactions. No matching duplicate successful
transactions were found. Current outcomes are 89 successes (65 no-relevant-change,
24 new-evidence) and eight failures/deferred outcomes. These are not request counts,
model counts or accepted fleet changes. The saved status distinguishes 69 examined
records from zero final reconciliations, 271/272 decisions, six integrity reviews and
certificate FAIL. The run remains incomplete and recoverable, with its cutoff unchanged.

Registry accounting: 97 acquisition tasks, eight further restricted dynamic sources,
four static directories, six registered discovery indexes, 61 historical documents and
11 inactive records total 187 entries. Seven publisher discovery targets include one
without a registry source ID. Accounting is not fresh coverage of every entry.

The Buzz read-only CLI could not enumerate live workflows because authentication was
unavailable. No credentials were obtained. Saved responsibility records and documented
retirement do not prove the current relay has no enabled duplicates. Existing local
LaunchAgents alone do not establish an RNFS execution dependency.

## Operation decisions

| Operation | Decision/downstream consumer | Cost and overlap | Removal consequence / disposition |
|---|---|---|---|
| Sunday governed sweep | Candidate refresh and release readiness | Browser acquisition plus scoped analysis | Retain; authoritative refresh |
| Weekday AI review | Early material findings | Unconditional model wake; recent inspected wakes only deferred | Recommend retiring unconditional review; early X-only findings could be delayed |
| Hourly health summary | Owner awareness | Repeated model inspection overlaps receipts/watchdog | Recommend change-based reporting; preserve meaningful failure notification |
| Public publisher indexes | Candidate URLs | Cheap bounded HTTP; early Sunday artifact cannot certify noon coverage | Retain conditional retrieval/reuse; trial a detector only if useful |
| Signed-in rendered X | Public evidence unavailable from indexes | Browser and occasional reasoning; owner access needed | Retain governed collection; no API/provider fallback |
| Restricted/manual sources | Claim corroboration and policy obligations | Owner/manual effort; repeated unavailable history | Do not automate or silently waive; request policy decisions separately |
| Normalization/deduplication | Smaller review queue | Deterministic, no model | Retain |
| Fleet reconciliation | Complete per-vessel accounting | Deterministic comparisons plus material adjudication | Retain every native outcome; reuse unchanged supporting work |
| Six integrity reviews/certificate | Evidence acceptance | Deterministic checks plus unresolved-claim review | Retain fail-closed rules |
| Independent acceptance | Detect unsupported conclusions/regressions | Separate reviewer plus existing tests | Retain function, remove persona dependency |
| Publication watchdog | Missing repository/live snapshot alert | Deterministic HTTP/GitHub; date checks only | Retain; never interpret as certificate acceptance |
| Monday availability | Public historical availability candidate | Deterministic; repeated build/test work | Retain reviewed-release derivation; later measure duplicate validation |
| Backup/checkpoint recovery | Preserve accepted work | Hashing/storage; owner unlock | Retain; no automatic unlock or lock takeover |
| Full builds/CI/rendered verification | Safe code/release delivery | Test suite repeats across commands | Retain checks; deduplicate only in later exact-input validation work |

## Responsibilities, not personas

These associations are historical saved handoffs, not a live agent roster assertion.

| Responsibility | Current dependency | Replacement | Classification | Risk |
|---|---|---|---|---|
| Rook coordination | Buzz handoffs | ChatGPT briefing and GitHub issue state | CHATGPT_NOW | Lost unresolved decisions |
| Rook ledger writer | Named writer ownership | Single Codex coordinator, existing journal/lock | CODEX_NOW | Concurrent writers |
| Nova integration/adjudication | Agent review packets | Scoped exact-evidence Codex review | CODEX_NOW | Stale decision reuse |
| Bumble browser collection | Operator and private packets | Supported signed-in Chrome through Codex | CODEX_NOW | Auth/challenge/rendering blockers |
| Forge implementation | Buzz routing | Isolated Codex branch and GitHub PR | CODEX_NOW | Unrelated edits or unreviewed delivery |
| Sentinel acceptance | Named independent reviewer | Independent exact-head/candidate review | CODEX_NOW | Self-approval |
| Release/status communication | Buzz messages/Honey handoff | ChatGPT from accepted receipts | CHATGPT_NOW | Prepared confused with published |
| Legacy RNFS dispatch | Retired Buzz/OpenClaw jobs | Existing Codex Sunday wake | RETIRE | Hidden live duplicate not yet excluded |
| Persona routing and repeated polling | Agent activity | Remove; report state changes | RETIRE | Unique alert lost without inventory |
| Lock/audit storage | Legacy `.buzz` paths | Explicit private RNFS paths, verified migration | DETERMINISTIC | Deleting recovery evidence |
| Journal, source processing, gates | Repository Node code | Existing modules | DETERMINISTIC | Policy weakening |
| Backup readiness | Encrypted storage and receipts | Code probes; owner retains unlock | DETERMINISTIC | Stale restore proof |
| Unexported RNFS records/config | Possibly Buzz-only state | Preserve until inventory/export | TEMPORARY_BUZZ | Removing sole copy |
| Persistent monitoring/escalation | Mixed polling today | Dot after capability/availability acceptance | DOT_LATER | Assuming future capabilities |

No essential live Buzz execution dependency was demonstrated. Complete removal still
requires the inaccessible inventory and verification of state currently stored beneath
`.buzz`. Do not remove global Buzz/OpenClaw infrastructure used by unrelated projects.

## Reuse and recovery contract

Plan output now classifies every acquisition task as `reuse`, `collect`, `retry` or
`manual-blocked`. Planning and processing share one predicate. `reuse` names the exact
successful receipt and its original acquisition window. Owner/session identity does not
make evidence stale. Changed registry/cutoff fails closed; changed source identity,
parser/normalizer or a newly due deeper obligation prevents reuse. Failed/partial
receipts never advance cursors. `manual-blocked` describes work requiring a permitted
observation, not permission to omit it or a new collector.

Cross-week runs still examine uncovered time with existing seven-day overlap and periodic
deeper-audit rules. Source identity reuse is not permission to reuse an old position as
fresh. Explicit native reconciliation, candidate decisions, integrity checks and
certification remain required. A lease expiring cannot erase completed evidence, and
expired ownership never authorizes automatic takeover.

Derived plan, acquisition, processed-run and adjudication files now preserve prior bytes
under content hashes before pointer replacement. Corruption fails rather than overwriting
an archive. Public-index CLI `--resume` binds the same run, baseline, registry and window,
uses a new output name, and checkpoints after each source. Resume from that attempt's
`.checkpoints/run.json`; optional `.checkpoints/cache.json` enables conditional GET.
Missing cache causes fresh retrieval, never blind 304 acceptance. A parser version is
bound to discovery receipts; validators are sent only to their exact cached resource URL,
including after redirects. Revalidated article URLs remain in the native candidate list:
an unchanged index is not proof of unchanged article content.

Low-level collection commands remain available for fixture and controlled operator use.
The scheduled integration must use the preflight entry described in
[the preflight runbook](osint-preflight.md) before collection. This PR does not claim a
live scheduled cutover, repaired permissions, browser readiness or zero invocation cost
for a Codex-scheduled reasoning turn.

## Source-policy proposals — approval required

| Source | Proposed treatment | Required safeguard |
|---|---|---|
| Portsmouth historical shipping | Manual historical obligation; seek permitted archival replacement | Current/tomorrow pages cannot close missing history |
| VesselFinder | Claim-relevant rendered corroboration with separate identity/observation validity | No API/bulk fallback; cached identity is not a new position |
| Marine Vessel Traffic | Quarantine conflicting identity; consider retirement/replacement as blocker | Preserve conflicting records; accept no mismatched position |
| Five restricted AIS pages | Manual/on-demand when relevant | Licence/access restrictions unchanged |
| Three Facebook sources | Manual/on-demand corroboration | No scraping/browser automation |
| Required X profiles | Keep weekly required coverage initially | Cheap detector cannot establish X coverage |
| Optional X failures | Typed partial outcome, bounded retry | No successful-empty substitution |
| Static official directories | Change-triggered plus approved periodic review | Invalidate affected bindings on identity changes |
| Historical documents | Retain immutable evidence; revisit revisions/conflicts/applicability | Preserve observation/retrieval dates |
| Publisher indexes | Conditional HTTP and URL/content deduplication | Links still require claim-level review |

None of these recommendations changes an existing rule or grants a new September 27
exception. Historical gaps, manual obligations, unresolved assessments and failed
certification remain blockers. CASD/SSBN representative-display protections are unchanged;
no protected patrol inference or precision increase is authorized.

## Measurements and expected benefit

Per attempt, distinguish source checks attempted, successful, failed and reused;
adapter invocations versus actual HTTP requests; retries, bytes, elapsed work and unknown
browser/model usage. Reused historical duration is excluded from new execution timing.
Usage requires explicit `provider-reported` or `estimate` provenance. Missing measurements
stay unavailable; unmeasured retry usage prevents a purported complete total.
Public-index collection invokes no model and counts redirects/retries as actual HTTP
requests. A reused source is not labelled an arbitrary number of requests avoided.

Candidate counts, reasoning-required candidates and assessment proposals already exist
in native artifacts. Follow-on reporting should link candidate hashes to assessment
revisions and accepted publication deltas. Accepted certificate proposals are not proof
of publication. Report incomplete reasons and measure source time contributing no
release evidence across multiple releases, not from a single zero-change week.

Derived measures: reused / eligible checks; expensive calls / accepted fleet changes;
new candidates / measured requests; actionable observations / measured calls; repeated
unchanged checks; noncontributing source time. Missing/zero denominators yield unavailable,
not invented zero efficiency. Conversation-level tokens are unavailable here.

September 27's 89/97 successful sources (about 92%) are potentially untouched during
matching recovery; the journal already supplied this capability. The improvement is
visible pre-browse selection and discovery crash recovery, not a claim of newly saving
92% of total weekly time. Synthetic tests demonstrate two of three receipts reused with
only the failed source called after restart, and zero requests for matching index reuse.
No live under-60-minute result or token-saving percentage is claimed.

## Subsequent delivery and removal gates

1. Verify the approved network/write context in a real scheduled wake; keep Sunday timing.
2. Retire unconditional weekday AI review and hourly broad polling through a separately
   reviewed configuration cutover. The current jobs are unchanged by this PR.
3. Only if useful, adapt existing cheap public discovery for a bounded detector trial;
   no 69-vessel review, certification or publication reasoning, and no model on no-change.
4. Add exact-hash adjudication reuse and measure/reduce duplicate test execution without
   weakening acceptance.
5. Obtain/export the RNFS Buzz inventory; migrate private path references with hashes and
   restore tests, preserve historic incidents, and remove only proven redundant dependencies.
6. Let Dot consume the same state/controls later after a real capability acceptance test.

Do not activate the separate reliability candidate's remote control branch, dispatcher,
leases and extra progress watchdog just to obtain its checkpoint improvements. One
orchestration owner remains the target. Rollback reverts code/configuration while retaining
private immutable receipts; it never silently reactivates OpenClaw or rewrites history.

## First-PR verification

Controlled verification: native test suite, production build, Pages build and client
exposure checks passed. Browser regression: 47 passed, three existing external-Phase-2
candidate scenarios skipped because that optional fixture was not supplied. Dependency
audit reported no vulnerabilities. No live OSINT collection or scheduled-context repair
was performed. Tests unset the real private-input environment and use legacy/synthetic
fixtures; private production evidence and all fleet/history files remain unchanged.

The process-crash fixture terminates an index collector after its first durable receipt,
then starts another process: one index is reused, six are fetched, and prior checkpoint
bytes are unchanged. Cache/parser/redirect/tamper, source restart/failed-source reuse,
retry usage, private-path symlinks, ownership changes during preflight and prerequisite
failure tests are included in `npm run test:operations` and the normal test/build commands.
