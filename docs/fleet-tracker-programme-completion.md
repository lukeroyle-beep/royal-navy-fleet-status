# Fleet tracker programme completion

## Completion decision

The implemented baseline entering closeout for issue
[#36](https://github.com/lukeroyle-beep/royal-navy-fleet-status/issues/36) was `main` commit
`999560c4a33e8dc319c8764f3f1536881206af97`. The completion ledger merged in
[PR #71](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/71) at exact merge commit
`d9566fc524b19e952c5800482fd7e2bda80d156b`. [PR #72](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/72),
implementation commit `82d9b4a682dab8a16b9a5f4b9c59b12782926db8`, adds the deployment safeguard
that requires this document in production and Pages artifacts. Completion becomes final only after
the document itself is present in the deployed artifact and its production HTTP check passes. The programme delivered the map-first public interface,
validated public state and history, honest geography, a fail-closed private boundary, governed free
OSINT collection, deterministic review routing, an internal-only evidence-health view, and a tested
release process.

Mobile Safari deliberately retains PR #60's bounded **Release to zoom** interaction. Issue #69 and
PR #70 tested continuous pinch again on the prescribed physical iPhone and iPad. Live scaling
returned, but so did progressive lag, freezing and unresponsive controls and markers. PR #70 was
therefore closed without merge. Production never left the stable PR #60 implementation and required
no rollback.

## Delivery ledger

Every merge commit below is exact. The linked pull request retains its review, GitHub
`validate-and-build` result and Cloudflare Workers build record.

| Child | Pull request and exact merge commit | Completed outcome | Validation and deployment record |
| --- | --- | --- | --- |
| [#34](https://github.com/lukeroyle-beep/royal-navy-fleet-status/issues/34) | [PR #35](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/35) — `d24e61e379fda6458b0308bed4b294dcca270d3b` | Map-first responsive interface | CI and Workers Builds passed; merged 25 August 2026. |
| [#37](https://github.com/lukeroyle-beep/royal-navy-fleet-status/issues/37) | [PR #45](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/45) — `5a9db9c402b8d94f56280bf17a438c38bee1e58d` | Validated persistent and shareable public view state | CI passed; the PR retains its successful Workers branch-deployment comment. |
| [#39](https://github.com/lukeroyle-beep/royal-navy-fleet-status/issues/39) | [PR #46](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/46) — `e8021136242b7bffc2456ae38ab0238cd48afd36` | Honest point, regional and list-only public geography | CI and Workers Builds passed. |
| [#40](https://github.com/lukeroyle-beep/royal-navy-fleet-status/issues/40) | [PR #49](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/49) — `1f385013d83e047c07ee9e954db88ee261d6ae76`; [PR #50](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/50) — `e6386b53e6214fd98d1401e8f16627b17a8ca015` | Discrete public snapshots, comparison, timelines and selection correction | Both CI and Workers Builds passed. |
| [#38](https://github.com/lukeroyle-beep/royal-navy-fleet-status/issues/38) | [PR #51](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/51) — `074bc38de8ac205741b87730281d8473f9546a61` | Fail-closed external private-input boundary and synthetic-only CI | CI, private-boundary test, builds, leakage scan and Workers Builds passed. |
| [#41](https://github.com/lukeroyle-beep/royal-navy-fleet-status/issues/41) | [PR #52](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/52) — `7072d694a4a448d9d91a858a01244fabc4198591` | Expanded free-source registry, reconciliation and sweep completeness | CI and Workers Builds passed. |
| [#43](https://github.com/lukeroyle-beep/royal-navy-fleet-status/issues/43) | [PR #53](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/53) — `e40c3a1c6e37ed1a542646520785036ed958ee1b` | Deterministic evidence processing and review routing | CI and Workers Builds passed. |
| [#42](https://github.com/lukeroyle-beep/royal-navy-fleet-status/issues/42) | [PR #54](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/54) — `eecc487b8ce1b4bc1a819553659a6845fdd1417c` | Loopback-only, server-authenticated private evidence-health view | CI, private-health tests, public-absence scan and Workers Builds passed. |
| [#44](https://github.com/lukeroyle-beep/royal-navy-fleet-status/issues/44) | [PR #55](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/55) — `a9f7b746863ea66428b6f2ff7ad78d4120d7b976` | Bounded, disabled-by-default AIS and satellite evaluation | CI, disabled/missing-credential/public-absence tests and Workers Builds passed. |
| [#48](https://github.com/lukeroyle-beep/royal-navy-fleet-status/issues/48) | PRs #56–#68; final merge [PR #68](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/68) — `999560c4a33e8dc319c8764f3f1536881206af97` | Release remediation, physical-device evidence and final release decision | Detailed remediation ledger and release evidence below. |
| [#69](https://github.com/lukeroyle-beep/royal-navy-fleet-status/issues/69) | [PR #70](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/70) — no merge commit | Continuous mobile pinch experiment rejected after physical failure; PR #60 retained | Automated, exposure, CI, Workers and emulated checks passed, but the mandatory physical gate failed on both devices. Closed as not planned on 27 August 2026. |

## Issue #48 release and remediation ledger

| Pull request | Exact merge commit | Result |
| --- | --- | --- |
| [#56](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/56) | `8786c8e2123093c8bf758eede629d08e9845d27a` | Corrected Pages data paths and recorded desktop checks. |
| [#57](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/57) | `18ed5da5a7124802545fdf11156d7e4731c5195d` | Added stale-mobile-deployment recovery. |
| [#58](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/58) | `bdb7b98e7740d4d999337705b4c9bc27402ed7d9` | Recorded the first physical iPhone evidence. |
| [#59](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/59) | `b658ad24da556d5a473f6f4d6f07dc7e704d639e` | Added the mobile-Safari zoom cap, integer snap, animation restrictions, unfiltered tiles, and resize/reset safeguards. |
| [#60](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/60) | `d208b7bb4b6d2ec353c771f21e05fb85741e6c7d` | Replaced unstable continuous pinch with bounded release-to-zoom. This is the final mobile behavior. |
| [#61](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/61) | `ee0b09551b50f994e99cc9e8532d63dde984e380` | Recorded successful physical iPhone map verification. |
| [#62](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/62) | `10e4c64560786bf679d3834f37088b3e0619754c` | Kept co-located markers selectable. |
| [#63](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/63) | `3ffe61fa3cc5729aa4036c7c35a3b2854646302a` | Restored compact iPad side panels. |
| [#64](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/64) | `7249e8231a0c37d81172eff78daa2ecd84798be9` | Applied compact side panels on iPhone. |
| [#65](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/65) | No merge commit | Closed unmerged and superseded by PR #66. |
| [#66](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/66) | `c252df39abc3b2c74167338afc22a54f414c586f` | Clarified vessel and shore record details and collapsed timelines. |
| [#67](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/67) | `bd5cd752701591c80e707cb390303c9664d64591` | Preserved clustered/co-located selection and contextual zoom. |
| [#68](https://github.com/lukeroyle-beep/royal-navy-fleet-status/pull/68) | `999560c4a33e8dc319c8764f3f1536881206af97` | Recorded final release evidence and closed issue #48. |

Every merged PR in this ledger passed `validate-and-build`; every listed PR except the intentionally
unmerged #65 retains a successful Workers build or deployment record. The final programme state was
tested again at PR #68. The [release test report](release-test-report.md) is the authoritative test
matrix for production/Pages builds, exposure scans, responsive behavior, keyboard/focus behavior,
URL restoration, malformed state, basemap failure/recovery, clustered and co-located selection, and
the physical devices.

## Physical-device and approval evidence

- The affected iPhone 12 Pro Max and the iPad Pro 13-inch (M4) both ran Safari/iOS/iPadOS 26.6.
- PR #60's release-to-zoom interaction passed repeated physical pinch, pan, Reset, zoom-button and
  panel checks without progressive lag, freezing or WebContent reload.
- The iPad passed portrait and landscape right-side-panel, clipping, horizontal-overflow and control
  checks. The iPhone passed its compact portrait and landscape checks.
- HMS Dragon and RFA Lyme Bay remained simultaneously selectable; the highlight followed the chosen
  vessel and the established map zoom was retained.
- PR #70's distinct commit preview restored continuous scaling, but both devices again developed lag,
  freezing and unresponsive controls/markers. The owner selected the stable PR #60 behavior and PR
  #70 was not merged.
- Human VoiceOver and screen-reader observations were explicitly removed as a release requirement.
  Semantic, keyboard, focus, touch-target, responsive and reduced-motion safeguards remained tested.

The repository owner approved the bounded issue contracts and authorised merge/deployment after the
required gates. No failed physical gate was overridden: PR #70 demonstrates that the physical-device
condition controlled the decision even after automated and Workers checks passed.

## Before and after

| Programme concern | Before | Completed state |
| --- | --- | --- |
| Public interface | Map and records lacked the final bounded responsive interaction contract. | Map-first interface with desktop drawers, compact touch-device side panels, accessible controls and resilient details. |
| Shared state | Browser state was not a strict public contract. | Versioned, bounded URL/local state accepts only supported public filters, layers, selection and view values. |
| Geography | Public precision and absence states could not express every evidence boundary. | Rounded points, bounded regions and list-only states are explicit; submarines and withheld records fail closed. |
| History | Current state had no discrete audited comparison contract. | Versioned public snapshots, append-only status history, release comparison and collapsed timelines. |
| Private inputs | The legacy non-sensitive provenance area had no formal future-private root. | Real inputs resolve only from an external, owner-controlled root; public CI is synthetic-only and fails closed. |
| OSINT operations | Source coverage and review routing were not sealed as one release gate. | Governed free-source registry, complete sweep ledger, deterministic review routing and immutable release seals. |
| Release evidence | Physical and failure-mode evidence was incomplete. | Exact PR/commit ledger, full build/leakage gates, physical-device matrix and documented remediation history. |

## Public/private boundary

The public application remains allow-list-only. `scripts/lib/public-projection.mjs` emits dataset
metadata plus only these vessel fields: `id`, `name`, `service`, `vesselClass`, `vesselType`,
`pennantNumber`, `commissionedDate`, `homePort`, `status`, `locationClassification`, `locationState`,
`locationPrecision`, `publicLocationLabel`, sanitised `lastReportedLocation`, rounded `position`, and
bounded `uncertaintyArea`. Public history, change-summary and shore-establishment files have their own
validated schemas. The browser URL parser separately accepts only documented public filters, layers,
record identifiers and bounded map values.

Raw evidence, assessment histories, source registries, source-health state, account handles, content
hashes, analyst notes, confidence reasoning, retrieval diagnostics, credentials, private sweep
ledgers, raw AIS, satellite imagery and provider diagnostics are excluded from the client build.
`scripts/check-client-exposure.mjs` scans both production outputs and all five copied public data
files. Real private inputs and credentials must remain outside every checkout under the fail-closed
[`RNFS_PRIVATE_DATA_ROOT` contract](private-input-boundary.md); public CI receives only the synthetic
fixture. This closeout changes no public JSON schema, URL-state schema, credential, permission or
privacy boundary.

## Configuration and operating documents

- [README](../README.md): public architecture, local use, builds and release entry points.
- [Private input boundary](private-input-boundary.md): external-root configuration, backup/recovery,
  sanitised release and credential response.
- [OSINT provenance](osint-provenance.md): evidence, assessment and public projection model.
- [Weekly fleet refresh](weekly-fleet-refresh.md): governed collection, finalisation and release gates.
- [Public geographic precision](public-geographic-precision.md): public location and submarine rules.
- [Release revisions](release-revisions.md): append-only same-day correction procedure.
- [Private release checklist](private-release-test.md) and [test report](release-test-report.md):
  release, responsive, accessibility and physical-device evidence.
- [Private evidence health](private-evidence-health.md): loopback/authentication operating boundary.
- [External corroboration evaluation](external-corroboration-evaluation.md): disabled AIS and
  Copernicus decision gates.
- [Weekly availability history](weekly-availability-history.md): append-only analytical history and
  owner-review requirements.
- [CI workflow](../.github/workflows/ci.yml) and [Workers configuration](../wrangler.jsonc): build,
  artifact and deployment configuration.

No concrete Tailscale machine or tailnet identifier is committed. Documentation and tests use only
placeholder or deliberately synthetic hostnames, and the safeguard test scans tracked text for a
concrete `.ts.net` identifier outside that fixture allow-list.

## Deferred work

The following remain explicitly outside the completed programme and require separately approved,
bounded work:

- paid, unlicensed or insufficiently licensed feeds and redistribution;
- unattended publication, automatic merge or direct-to-production fleet updates;
- satellite collection or identification automation beyond the disabled proof-of-concept evaluator;
- route, course, destination, patrol-area or position inference from sparse public observations;
- any live AIS, satellite or other provider integration requiring credentials, accounts, tokens,
  private registries, retention, billing, provider permissions or new privacy boundaries;
- migration or deletion of the retained legacy provenance area before encrypted storage, independent
  backup, restore testing, reconciliation, retention and rollback are separately approved; and
- public twelve-month availability claims until the documented coverage and product-decision gates
  are satisfied.

These deferrals are fail-closed. Their adapters, proposals or documentation do not authorise live
collection, credentials, provider enablement, unattended publication or public eligibility.
