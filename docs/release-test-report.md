# Private release test report

## Release candidate

| Field | Value |
| --- | --- |
| Commit SHA | Working tree on `codex/issue-48-ios-loading-recovery`, based on `8786c8e21230` |
| Tester | User observation on a physical iPhone; Codex-assisted observation on the local physical desktop; iPad and assistive-technology testers not assigned |
| Test date and time | 26 August 2026, Europe/London |
| Device | Physical iPhone 12 Pro Max and physical Mac mini (Apple M4); no physical iPad detected |
| Operating system | iOS 26.6 reported by the user; macOS 26.5 (build 25F71) |
| Browser and version | iPhone Safari on iOS 26.6; desktop Safari 26.5 |
| Orientation or viewport | iPhone orientation not recorded; desktop window at normal zoom and 200% browser zoom |
| Private preview hostname recorded outside the repository | No |

## Results

| Test ID | Result: Pass, Fail or Blocked | Observed defect | Screenshot or notes |
| --- | --- | --- | --- |
| RT-1 | Blocked | Prescribed private HTTPS preview and full device matrix unavailable | The Pages-base local preview loaded in physical desktop Safari; this does not test the private HTTPS path. |
| RT-2 | Blocked | Full device matrix unavailable | Desktop Safari showed the fleet map, plotted records and readable OpenStreetMap attribution. |
| RT-3 | Blocked | Touch-device checks unavailable | Not completed across the required matrix. |
| RT-4 | Blocked | Full device matrix unavailable | Desktop selection displayed HMS Duncan and its matching list record/details. |
| RT-5 | Blocked | Touch-device checks unavailable | Not completed across the required matrix. |
| RT-6 | Blocked | Full device matrix unavailable | Desktop Safari searches for `P234` and `HMS Duncan` each produced one matching vessel and synchronised the visible count/list/map. |
| RT-7 | Blocked | Full device matrix unavailable | Not completed across the required matrix. |
| RT-8 | Blocked | Full device matrix unavailable | Desktop list selection displayed HMS Duncan details; Escape closed the detail surface and restored focus to the originating vessel control. |
| RT-9 | Blocked | Full device matrix unavailable | Not completed across the required matrix. |
| RT-10 | Blocked | Full device matrix unavailable | Not completed across the required matrix. |
| RT-11 | Blocked | Full device matrix unavailable | Not completed across the required matrix. |
| RT-12 | Blocked | Physical iPad unavailable | Portrait/landscape rotation not performed. |
| RT-13 | Blocked | Physical touch devices unavailable | Touch-target checks not performed. |
| RT-14 | Blocked | Full device matrix and assistive-technology checks unavailable | Desktop Safari remained readable and keyboard focus moved at 200% browser zoom without an observed horizontal page scrollbar. |
| RT-15 | Blocked | Full device matrix unavailable | A desktop Safari reload restored the stateful URL and HMS Duncan detail; the full local-state scenario was not completed. |
| RT-16 | Blocked | Clean browser context and full device matrix unavailable | Desktop Share reported “Shareable view link copied”; reload retained the selected vessel and bounded map parameters. |
| RT-17 | Blocked | Full device matrix unavailable | Not completed across the required matrix. |
| RT-18 | Blocked | Network-failure exercise unavailable | Basemap requests were not deliberately blocked. |

## Defects requiring action

| Defect ID | Severity | Description | Evidence | Resolution |
| --- | --- | --- | --- | --- |
| PAGES-1 | Material, resolved in working tree | A Pages-base preview requested public JSON from the site root and received HTML, leaving the interface in its loading state. | Physical desktop Safari plus direct response checks reproduced the project-path/root-path mismatch. | Public asset requests now use Vite's configured base path; `scripts/test-pages-build.mjs` guards all five data assets. |
| IOS-CACHE-1 | Material, resolved in working tree; physical retest required | Production stayed on “Loading” and controls did not respond in iPhone Safari. | User observation on a physical iPhone 12 Pro Max running iOS 26.6. A clean iPhone 12 Pro Max WebKit 26.5 production run loaded 68 vessels and responded to the Fleet control; the prior deployed bundle URL now returns 404, matching a retained pre-deployment HTML document. | Worker header rules prevent HTML caching and retain fingerprinted assets in browser caches. A pre-module startup guard now exposes a cache-busting **Reload current version** action instead of silently remaining on “Loading”. |
| DEVICE-1 | Release-blocking | Required physical iPad/iPhone, prescribed private HTTPS and complete desktop scenarios were not performed. | The physical iPhone production observation identified IOS-CACHE-1 but did not exercise the prescribed private matrix; no physical iPad was available. The local desktop pass was intentionally limited to non-destructive supporting checks. | Complete RT-1 to RT-18 on the required private device matrix. |
| AT-1 | Release-blocking | VoiceOver and other assistive-technology observations require a human tester who can assess the spoken output and interaction quality. | Automated accessibility checks and the accessibility tree cannot substitute for the issue's requested physical assistive-technology evidence. | Run and record the screen-reader scenarios with a human tester. |

## Release decision

- Decision: Blocked
- Decided by: Not assigned
- Date and time: Not assigned
- Outstanding actions: Complete RT-1 to RT-18 through the prescribed private HTTPS preview on
  physical iPad, iPhone and desktop devices, and record human VoiceOver observations.

Automated build success is supporting evidence only. It is not evidence that physical iPad or
iPhone testing has passed. The local desktop observations above likewise do not turn a matrix-wide
Blocked result into a Pass.
