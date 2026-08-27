# Private release test report

## Issue #69 continuous-pinch successor candidate

| Field | Value |
| --- | --- |
| Scope | Restore live, gesture-midpoint pinch scaling on mobile Safari while retaining the PR #59 rendering and map-state safeguards |
| Candidate | PR #70 from `codex/issue-36-smooth-pinch`; implementation commit `1f281ff58822a70e3f71d31c7547604c2d8c02a0` |
| Previous mitigation | PR #60 deliberately replaced continuous Leaflet transforms with bounded release-to-zoom after the original iPhone freeze |
| Successor implementation | Issue #69 removes that discrete interface and re-enables continuous Leaflet touch zoom without re-enabling animations or increasing the mobile-Safari zoom limit |
| Automated evidence | Local `npm test`, `npm run build` and `npm run build:pages` passed on 27 August 2026; production and Pages client-exposure scans passed across 117 built files; PR #70 CI and Workers Builds passed |
| Physical evidence required | iPhone 12 Pro Max and iPad Pro 13-inch (M4), each on Safari 26.6, using the approved ten-cycle stress and control matrix |

PR #60 remains the historically verified mitigation documented below. Issue #69 is a deliberate,
high-risk successor: automated or emulated results cannot satisfy its physical-device gate.

## Current candidate decision

- Decision: Blocked
- Decided by: Approved issue #69 release contract
- Date and time: 27 August 2026, Europe/London
- Outstanding actions: Complete the required physical-device checks.

## Issue #69 local candidate evidence

On 27 August 2026, the candidate passed `npm test`, `npm run build` and
`npm run build:pages`. Both production and Pages exposure scans passed across 117 built files, and
the Pages base-path checks passed. The compiled production module contains neither the obsolete
gesture implementation nor the **Release to zoom** interface.

Current-Chromium browser checks on the physical Mac mini covered desktop at 1280 × 720, an iPhone
12 Pro Max layout equivalent at 428 × 926, iPad portrait at 1024 × 1366 and iPad landscape at
1366 × 1024. All four panels remained reachable with no horizontal document overflow. Reset and
both zoom controls responded; keyboard map movement updated the URL view; a copied URL restored the
Deployed filter, shore layer, RFA Lyme Bay selection and zoom 2.5 without a visible error.

The selection matrix covered HMS Dauntless's regional area, list-only HMS Vengeance, CTCRM
Lympstone, an expanded shore cluster, and HMS Dragon/RFA Lyme Bay. The co-located pair both remained
visible, selection highlighting moved to the chosen vessel and zoom remained 4. A temporary,
uncommitted compiled-build tile substitution exposed the non-blocking basemap notice while HMS
Duncan search and details remained usable; a clean rebuild restored tiles and hid the notice.

These checks do not emulate or replace continuous two-finger Safari scaling. The approved physical
iPhone/iPad stress matrix remains release-blocking.

## Issue #69 branch-preview evidence

PR #70 head `77f831aea4008a1dcd73072ffc403e2dc025a922` passed the GitHub
`validate-and-build` job, including build, Pages, audit and artifact-upload steps, and passed Workers
Builds. The Cloudflare branch preview returned HTTP 200 with `no-store` HTML and `noindex`; its
compiled asset and all five public data files returned HTTP 200. The deployed bundle contains
neither **Release to zoom** nor `discreteTouchZoom`.

Browser checks against the branch preview passed at 1280 × 720, 428 × 926, 1024 × 1366 and
1366 × 1024. All four panels opened and closed, map controls remained present, and there was no
horizontal document overflow or visible application error. HMS Dragon and RFA Lyme Bay both
remained visible; highlighting followed selection and zoom remained 4. Physical iPad coarse-pointer
layout and continuous Safari pinch performance remain subject to the user-observed release gate.

## Previous deployed release candidate (PR #68)

| Field | Value |
| --- | --- |
| Commit SHA | Deployed `main` at `bd5cd752701591c80e707cb390303c9664d64591` |
| Tester | User observations on physical iPhone and iPad hardware; Codex-assisted checks in current Chrome on the physical Mac mini |
| Test date and time | 26 August 2026, through 20:22 Europe/London |
| Device | iPhone 12 Pro Max; iPad Pro 13-inch (M4); Mac mini (Apple M4) |
| Operating system | iOS/iPadOS 26.6 as reported by the user; macOS 26.5 (build 25F71) |
| Browser and version | iPhone and iPad Safari 26.6; Google Chrome 152.0.7977.64 |
| Orientation or viewport | iPhone portrait and landscape; iPad portrait and landscape; desktop 1280 × 720 and 640 × 360 CSS pixels (the 200%-zoom layout equivalent), supported by an earlier physical desktop Safari 200% zoom observation |
| Private preview hostname recorded outside the repository | Yes; a temporary `.ts.net` hostname was used but is intentionally not committed |

Human VoiceOver and screen-reader testing is not a release requirement by owner decision on
26 August 2026. Keyboard, focus, responsive-layout and touch checks remain in scope.

## Results

| Test ID | Result: Pass, Fail or Blocked | Observed defect | Screenshot or notes |
| --- | --- | --- | --- |
| RT-1 | Pass | None | The prescribed loopback Vite preview plus Tailscale Serve returned HTTP/2 200 for the HTML and compiled JavaScript. It loaded without host, certificate, blank-page or loading errors in desktop Chrome and physical iPhone/iPad Safari. |
| RT-2 | Pass | None | Private desktop Chrome and the private physical iPhone/iPad checks displayed the fleet map and readable OpenStreetMap attribution without horizontal page overflow. |
| RT-3 | Pass | None | Pan, pinch/scroll, Reset and both zoom buttons remained responsive on the private desktop, iPhone and iPad candidate. The prior production iPhone stress check also completed five repeated discrete pinch-in and pinch-out gestures without a WebContent reload. |
| RT-4 | Pass | None | Private desktop selection of HMS Duncan displayed its detail card and selected marker without changing the established contextual zoom unexpectedly. |
| RT-5 | Pass | None | Private desktop selection expanded the HMS Dragon/RFA Lyme Bay co-location, kept both markers available, moved `is-selected` between them and retained zoom 2.5. The physical touch-device overlap scenario was also confirmed on the deployed site. |
| RT-6 | Pass | None | Private desktop searches for `P234` and `HMS Duncan` each produced one matching vessel with synchronised count, list and plotted result. |
| RT-7 | Pass | None | Service, status, vessel type, public-location status, geographic scope and class filters returned coherent counts; Clear all restored all 68 vessels. |
| RT-8 | Pass | None | List selection opened the matching details and revealed plotted records; keyboard dismissal restored focus to the originating surface control. |
| RT-9 | Pass | None | HMS Vigilant retained its existing point and accurately showed Unknown status; HMS Dauntless used only its labelled English Channel uncertainty region with no exact marker; withheld HMS Vengeance opened details without a marker or map movement and showed “Location not published”. |
| RT-10 | Pass | None | Reset view restored the fleet-wide bounded view at zoom 2.5. |
| RT-11 | Pass | None | Fleet overview, Deployed vessels, United Kingdom ports, Maintenance and refit, and Overseas presence each reported its active state, set coherent filters/layers and retained visible map content. |
| RT-12 | Pass | None | On the private candidate, the physical iPad reflowed in portrait and landscape with responsive right-side panels, no clipped content and no horizontal scrolling. |
| RT-13 | Pass | None | On the private candidate, physical iPhone and iPad Fleet, Layers, Filters, Compare, map, Reset and zoom targets responded without observed adjacent activation. |
| RT-14 | Pass | None | At the 640 × 360 CSS-pixel 200%-zoom equivalent, all four toolbar controls remained visible and keyboard-operable without horizontal page scrolling; Enter opened each surface, Escape closed it and restored focus. This supports the earlier physical desktop Safari 200% zoom observation. |
| RT-15 | Pass | None | After setting the Deployed filter plus fleet and shore layers, a navigation to the bare private address restored the supported choices, rewrote the versioned URL and produced no console error. |
| RT-16 | Pass | None | A fresh in-app browser context opened the copied address and restored HMS Dragon, Deployed, fleet and shore layers, and the exact bounded `lat`, `lon` and `zoom` values with no console error. |
| RT-17 | Pass | None | Invalid view, status, layer, vessel, snapshot, latitude, longitude, zoom and unknown parameters were discarded; the URL was rewritten to safe defaults, 68 vessels loaded and no console error occurred. |
| RT-18 | Pass | None | A temporary, uncommitted compiled-build substitution redirected only basemap tile requests to a failing path. The non-blocking notice appeared while search and HMS Duncan details remained usable. A clean rebuild restored tiles, hid the notice and retained readable attribution. |

## Physical iPhone evidence

The originally affected iPhone 12 Pro Max runs iOS/Safari 26.6. Earlier testing reproduced both a
stale cached document and a continuous Leaflet pinch path that became increasingly laggy, froze the
page and could silently reload Safari WebContent. The deployed cache rules and pre-module recovery
guard resolved the retained-document failure. The discrete mobile-Safari gesture deployed in PR #60
keeps the map stationary during a pinch, displays **Release to zoom** and applies bounded zoom on
release.

On production, the user then completed five repeated pinch-in and pinch-out gestures, panned the
map, selected **Reset view**, opened Fleet and used both zoom buttons. The page remained responsive
and a final diagnostic showed navigation type `navigate`, not a silent reload. Fleet, Layers,
Filters and Compare remained responsive; portrait and landscape panels had no clipped content or
horizontal page scrolling. Vessel and shore details, the collapsed timeline, co-located marker
selection and the right-side panel presentation were also confirmed.

The same iPhone then opened the prescribed private HTTPS candidate without a host or certificate
error. In portrait, Fleet, Layers, Filters, Compare, pan, discrete pinch, **Reset view** and both zoom
buttons remained responsive.

## Physical iPad evidence

The physical iPad is an iPad Pro 13-inch (M4) running iOS/iPadOS 26.6. On production, the user
confirmed that the application loaded completely and that Fleet, Layers and Filters opened normally
in portrait and landscape. The layout retained right-side panels without clipping or horizontal
scrolling. Blue sea, readable OpenStreetMap attribution, pinch, pan, **Reset view** and both zoom
buttons were confirmed. The user also verified the co-located marker correction and the revised
detail-card presentation.

The same iPad then opened the prescribed private HTTPS candidate without a host or certificate
error. Fleet, Layers, Filters, Compare, pan, pinch, **Reset view** and both zoom buttons remained
responsive in portrait and landscape, with no exception reported by the tester.

## Private desktop evidence

The prescribed private path used `npm run preview:private -- <device>.<tailnet>.ts.net` with Vite
bound to `127.0.0.1`, fronted temporarily by Tailscale Serve. Direct HTTPS checks returned 200 for
both the document and compiled module. Current Chrome on the physical Mac mini loaded the same
candidate at 1280 × 720, completed the point, overlapping, regional, shore and list-only selection
matrix, exercised every filter and preset, restored persistent and copied URL state, discarded
malformed state and recorded no console errors.

At the 640 × 360 CSS-pixel layout equivalent to viewing a 1280 × 720 desktop at 200%, Fleet, Layers,
Filters and Compare remained visible and keyboard-operable. Enter opened each surface, Escape closed
it, focus returned to the originating control and the document never developed a horizontal page
scrollbar. This supplements the earlier human-observed physical desktop Safari check at actual 200%
browser zoom.

For RT-18, only ignored build output was modified: the compiled tile URL was replaced by a guaranteed
failing same-origin path, then a fresh browser context loaded that unique module. The basemap notice
appeared, while fleet search and HMS Duncan details remained available. `npm run build` immediately
restored the ordinary artifact; a fresh load fetched tiles, hid the notice and displayed attribution.

## Defects requiring action

| Defect ID | Severity | Description | Evidence | Resolution |
| --- | --- | --- | --- | --- |
| PAGES-1 | Material, resolved and deployed | A Pages-base preview requested public JSON from the site root and received HTML, leaving the interface in its loading state. | Physical desktop Safari plus direct response checks reproduced the project-path/root-path mismatch. | Public asset requests use Vite's configured base path; `scripts/test-pages-build.mjs` guards all five data assets. |
| IOS-CACHE-1 | Material, resolved, deployed and physically verified | Production stayed on “Loading” and controls did not respond in iPhone Safari. | The originally affected physical iPhone completed a clean production reload with no console errors, and Fleet responded before and after detaching Web Inspector. | Worker header rules prevent HTML caching while retaining fingerprinted assets; a startup guard exposes **Reload current version** if needed. |
| IOS-MAP-1 | Material, resolved, deployed and physically verified | Continuous pinch zoom became laggy, froze the page and could trigger a silent Safari WebContent reload. | After PR #60, repeated pinch, pan, Reset, Fleet and both zoom controls remained responsive and navigation type stayed `navigate`. | Mobile Safari uses discrete release-to-zoom with bounded zoom and no continuous Leaflet touch transform. |
| OVERLAP-1 | Material, resolved and deployed | Selecting one of two co-located vessels could hide or leave the wrong marker highlighted, and selection could zoom out unexpectedly. | HMS Dragon/RFA Lyme Bay were retested after PRs #66 and #67; both remain visible, highlight follows selection and the established zoom is retained. | Co-located selection has a stable spiderfied anchor/sibling layout and preserves contextual zoom. |
| DEVICE-1 | Release-blocking, resolved | Prescribed private HTTPS observations were initially incomplete on the physical iPhone and iPad. | The Tailscale-connected iPhone passed portrait loading, panel and map controls. The iPad passed the same checks in portrait and landscape, with no host, certificate, clipping, scrolling or responsiveness defect reported. | Completed and recorded on 26 August 2026. |

## Previous deployed release decision

- Decision: Pass
- Decided by: Repository owner, based on the recorded user and Codex-assisted observations
- Date and time: 26 August 2026, 20:22 Europe/London
- Outstanding actions: None. Human VoiceOver or screen-reader testing is not required.

The required private physical-device, desktop, keyboard/focus, state, malformed-input and basemap
failure/recovery observations are complete with no unresolved material defect.
