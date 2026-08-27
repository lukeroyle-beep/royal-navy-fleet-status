# Private release test report

## Subsequent continuous-pinch experiment

Issue #69 and PR #70 deliberately retested continuous Leaflet pinch on the prescribed iPhone 12 Pro
Max and iPad Pro 13-inch (M4), both using Safari/iOS/iPadOS 26.6. Local tests, both builds, exposure
scans, GitHub CI, Workers Builds and branch-preview browser checks passed. On the distinct physical
commit preview, live scaling returned, but both devices again developed lag, freezing and
unresponsive controls and markers. No map-view jump was observed.

The owner selected PR #60's physically verified **Release to zoom** behavior for both iPhone and
iPad. PR #70 was closed without merge on 27 August 2026, production was unchanged, and no rollback
was required. Mobile zoom, fade, marker and cluster animations remain disabled under PR #59's safety
profile. This rejected experiment does not change the stable release decision recorded below.

## Release candidate

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

## Release decision

- Decision: Pass
- Decided by: Repository owner, based on the recorded user and Codex-assisted observations
- Date and time: 26 August 2026, 20:22 Europe/London
- Outstanding actions: None. Human VoiceOver or screen-reader testing is not required.

The required private physical-device, desktop, keyboard/focus, state, malformed-input and basemap
failure/recovery observations are complete with no unresolved material defect.
