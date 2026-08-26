# Private release test report

## Release candidate

| Field | Value |
| --- | --- |
| Commit SHA | Deployed `main` at `d208b7bb4b6d2ec353c771f21e05fb85741e6c7d` |
| Tester | User interaction on a physical iPhone with Codex-assisted Safari Web Inspector diagnostics; Codex-assisted observation on the local physical desktop; iPad and assistive-technology testers not assigned |
| Test date and time | 26 August 2026, through 13:39 Europe/London |
| Device | Physical iPhone 12 Pro Max and physical Mac mini (Apple M4); the user reported a separate iPad loads the site, but its model and test matrix were not recorded |
| Operating system | iOS 26.6 reported by the user; macOS 26.5 (build 25F71) |
| Browser and version | iPhone Safari 26.6; desktop Safari 26.5 |
| Orientation or viewport | iPhone portrait, 428 × 727 CSS-pixel viewport at 3× device scale, plus physical landscape checks; desktop window at normal zoom and 200% browser zoom |
| Private preview hostname recorded outside the repository | No |

## Results

| Test ID | Result: Pass, Fail or Blocked | Observed defect | Screenshot or notes |
| --- | --- | --- | --- |
| RT-1 | Blocked | Prescribed private HTTPS preview and full device matrix unavailable | The deployed production site completed a clean reload in physical iPhone Safari and displayed the 23 August 2026 snapshot; this does not test the prescribed private HTTPS path. |
| RT-2 | Blocked | Full device matrix unavailable | Desktop Safari showed the fleet map, plotted records and readable OpenStreetMap attribution. |
| RT-3 | Blocked | Physical iPhone check passed; the full required device matrix remains incomplete | On the production release, five repeated discrete pinch-in and pinch-out gestures, pan, **Reset view**, Fleet, and both zoom buttons remained responsive. A final inspection showed navigation type `navigate`, rather than a silent WebContent reload. |
| RT-4 | Blocked | Full device matrix unavailable | Desktop selection displayed HMS Duncan and its matching list record/details. |
| RT-5 | Blocked | Touch-device checks unavailable | Not completed across the required matrix. |
| RT-6 | Blocked | Full device matrix unavailable | Desktop Safari searches for `P234` and `HMS Duncan` each produced one matching vessel and synchronised the visible count/list/map. |
| RT-7 | Blocked | Full device matrix unavailable | Not completed across the required matrix. |
| RT-8 | Blocked | Full device matrix unavailable | Desktop list selection displayed HMS Duncan details; Escape closed the detail surface and restored focus to the originating vessel control. |
| RT-9 | Blocked | Full device matrix unavailable | Not completed across the required matrix. |
| RT-10 | Blocked | Full device matrix unavailable | Not completed across the required matrix. |
| RT-11 | Blocked | Full device matrix unavailable | Not completed across the required matrix. |
| RT-12 | Blocked | Physical iPad matrix not performed | The user reported that the site loads on an iPad, but the model, OS, orientations and required interactions were not recorded. |
| RT-13 | Blocked | Full touch-target matrix incomplete | Fleet, **Reset view**, and both zoom buttons responded on the physical iPhone without accidental adjacent activation. Every map and filter target was not exercised. |
| RT-14 | Blocked | Full device matrix and assistive-technology checks unavailable | Desktop Safari remained readable and keyboard focus moved at 200% browser zoom without an observed horizontal page scrollbar. |
| RT-15 | Blocked | Full state scenario and device matrix incomplete | A physical iPhone Safari reload completed without console errors and restored the supported snapshot/layer/map URL state; the prescribed filter-and-layer scenario was not completed. |
| RT-16 | Blocked | Clean browser context and full device matrix unavailable | Desktop Share reported “Shareable view link copied”; reload retained the selected vessel and bounded map parameters. |
| RT-17 | Blocked | Full device matrix unavailable | Not completed across the required matrix. |
| RT-18 | Blocked | Network-failure exercise unavailable | Basemap requests were not deliberately blocked. |

## Physical iPhone diagnostic evidence

The deployed site was inspected on a physical iPhone 12 Pro Max after the user initially reported
that the page remained on its loading state and did not respond to taps. Safari Web Inspector showed
all of the following on the deployed `18ed5da` release:

- the document reached `complete`, displayed the 23 August 2026 snapshot and showed 68 vessels;
- the console contained no page-load error;
- the Fleet control was the top hit-tested element at its centre, with `pointer-events: auto` and no
  overlay intercepting it;
- one physical tap emitted `pointerdown`, `touchstart`, `pointerup`, `touchend`, `mousedown`,
  `mouseup` and `click`, all targeted at the Fleet control;
- that tap opened and visibly painted the Fleet drawer;
- a subsequent clean reload again completed without a console error; and
- after Web Inspector was detached, the user closed and reopened the drawer normally.

The later map-interaction investigation reproduced a separate failure in the same physical iPhone:
continuous Leaflet pinch transforms became increasingly laggy and could freeze before Safari
silently reloaded its WebContent process. The reduced-animation mobile profile deployed in PR #59
removed avoidable compositor work, but a detached repeat still ended with navigation type `reload`
and a new JavaScript context.

PR #60 therefore replaced continuous mobile-Safari touch zoom with a bounded discrete gesture. The
map remains stationary while the fingers move, displays **Release to zoom**, and applies the zoom
around the gesture point when the fingers are released. On the deployed `d208b7b` release, the user
observed the expected behaviour and then completed five repeated pinch-in and pinch-out gestures,
panned the map, selected **Reset view**, opened Fleet, and used both zoom buttons. Every control
remained responsive. A final Web Inspector connection showed the expected production bundle,
navigation type `navigate`, and no `leaflet-touch-zoom` class, confirming that Safari had not
silently reloaded during the test.

This physically verifies the deployed cache-recovery and mobile-Safari map-interaction fixes on the
originally affected iPhone. It does not replace the remaining iPad, complete touch-target, private
HTTPS or human assistive-technology checks.

## Defects requiring action

| Defect ID | Severity | Description | Evidence | Resolution |
| --- | --- | --- | --- | --- |
| PAGES-1 | Material, resolved and deployed | A Pages-base preview requested public JSON from the site root and received HTML, leaving the interface in its loading state. | Physical desktop Safari plus direct response checks reproduced the project-path/root-path mismatch. | Public asset requests use Vite's configured base path; `scripts/test-pages-build.mjs` guards all five data assets. |
| IOS-CACHE-1 | Material, resolved, deployed and physically verified | Production stayed on “Loading” and controls did not respond in iPhone Safari. | The originally affected physical iPhone 12 Pro Max on iOS 26.6 completed a clean production reload with no console errors, and the Fleet drawer responded normally before and after detaching Web Inspector. | Worker header rules prevent HTML caching and retain fingerprinted assets in browser caches. A pre-module startup guard exposes a cache-busting **Reload current version** action instead of silently remaining on “Loading”. |
| IOS-MAP-1 | Material, resolved, deployed and physically verified | Continuous pinch zoom became laggy, froze the page and could trigger a silent Safari WebContent reload on the physical iPhone. | The original failure and post-PR #59 reload were observed through Safari Web Inspector. After PR #60, five repeated pinch-in and pinch-out gestures plus pan, **Reset view**, Fleet and both zoom buttons remained responsive, and final navigation type stayed `navigate`. | Mobile Safari uses discrete release-to-zoom gestures with bounded zoom and no continuous Leaflet touch transform; synthetic post-pinch clicks are suppressed. |
| DEVICE-1 | Release-blocking | Required physical iPad, prescribed private HTTPS and complete iPhone/desktop scenarios were not performed. | Physical iPhone production loading, portrait and landscape panel layout, hit-testing and map controls are now verified. The iPad was only reported to load; its model, orientations and interaction results were not recorded. Remaining selections, filters, sharing and other matrix scenarios are incomplete. The local desktop pass was intentionally limited to non-destructive supporting checks. | Complete the remaining RT-1 to RT-18 checks on the required private device matrix. |
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
