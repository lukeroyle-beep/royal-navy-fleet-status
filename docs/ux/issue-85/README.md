# Issue 85: Operational Map UX review and design record

Status: approved direction implemented on the Issue 85 branch; independent pull-request review, merge and deployment remain outside this issue run.

This document records the audit, alternatives, approved direction, implementation specification and verification for the British Armed Forces Tracker redesign. It is intentionally explicit so that interaction rules do not exist only in CSS or in a design conversation.

## 1. Current-state UX audit

The pre-change application already had a sound technical and product foundation:

- a static Vite and ES-module client with no framework runtime;
- Leaflet plus markercluster for the two-dimensional map;
- a public vessel projection, shore-establishment dataset, local imagery and explicit public-location semantics;
- validated release-to-release changes and status history;
- saved and URL-shareable filters, layers, selection and map view;
- public-data safeguards that avoid geocoding, course extrapolation and position inference;
- keyboard-labelled controls, responsive CSS, data validation and browser regression tests.

Those capabilities are retained. The redesign addresses presentation and interaction without replacing the stack or changing intelligence data.

### Architecture and data observations

- `index.html` owned the application landmarks and all filter, layer, detail and error surfaces.
- `src/app.js` coordinated loading, filters, snapshots, changes, selection, URL state and rendering.
- `FleetMap` owned Leaflet layers, markercluster, selection and map fitting.
- `EventDetailsPanel` owned vessel and shore details and `VesselPhotoService` resolved all vessel photographs locally.
- Public vessel records already exposed the information needed for a stronger primary hierarchy: name, service, pennant, class, type, photograph, status, public location, precision, commission date and home port.
- Public changes and historical snapshots supported a truthful “what changed?” surface. They did not support fabricated live movement or arbitrary per-asset freshness.
- Existing responsive behaviour largely repositioned the desktop surfaces; it did not fully define distinct tablet and mobile interaction modes.

### Interaction observations

- Vessel selection worked from the map and list and could be restored from the URL.
- Shore selection was available through the layer controls and map but was separate from the main search path.
- Filters were capable but distributed across a large panel and repeated summary areas.
- Clusters protected map legibility, but their contents did not provide a consistent textual selection path.
- A selected record opened a detail surface, but the marker, list and browser-history semantics were not equally explicit at every selection origin.
- Vessel and shore photographs were present and valuable, but the surrounding hierarchy did not consistently make them the immediate visual identifier.
- The map remained functional when tiles failed, and list-only records were preserved, which were both important foundations to keep.

## 2. Concrete usability and visual defects

1. Repeated fleet totals and availability summaries competed with the map and with one another.
2. The useful desktop viewport was divided into too many persistent blocks, so the map read as one component in a dashboard instead of the primary working surface.
3. Search did not provide one obvious route across both vessel and shore-establishment records.
4. Active filters were easier to count than to identify or remove individually.
5. Selected state varied by entry point and did not always remain obvious after a panel opened.
6. Map centring did not consistently account for the portion of the map covered by a drawer or bottom sheet.
7. Cluster expansion lacked a durable textual child list, which made co-located records hard to select accessibly.
8. Marker status depended too heavily on colour and generic circular forms.
9. Vessel class, type, pennant, commission date and home port were not all immediately scannable in the primary card hierarchy.
10. Shore photographs and vessel photographs needed a consistent loading and failure treatment.
11. Mobile and iPad layouts inherited too much desktop chrome instead of adopting deliberate drawer or sheet behaviour.
12. Loading, partial-data, stale-dataset and no-results messages did not form one coherent state language.
13. Snapshot publication freshness risked being read as asset-level observation freshness without more careful wording.
14. List-only records were valid but could be misunderstood as missing because mapped and total records were repeatedly compared.

## 3. Existing functionality that must be preserved

- all 68 current vessel records and every vessel class;
- every shore-establishment record and category;
- all existing vessel and shore-establishment photographs, using local assets;
- the photograph attribution mechanism and graceful missing-image behaviour;
- explicit public location, operational status, precision and withheld-location semantics;
- list-only records and deliberately rounded public map positions;
- vessel and shore markers, clustering and layer toggles;
- search, filters, presets and one-action clearing;
- snapshots, validated publication changes and status timeline;
- versioned saved state and validated shareable URL state;
- browser back and forward restoration;
- data loading, validation, provenance boundaries and public/private separation;
- mobile-Safari pinch behaviour, OpenStreetMap attribution and tile-failure fallback;
- the deployment pipeline and automated OSINT workflow.

## 4. Design principles

1. **Map first.** The map is the default working surface; other surfaces appear only to answer a task.
2. **Truth before theatre.** The product uses restrained operational language and avoids radar, neon, cinematic or simulated-intelligence styling.
3. **Selected means selected.** One record, marker and accessible semantic state is current at a time.
4. **Photographs identify.** A selected vessel or establishment keeps a large, useful photograph near its name and type.
5. **Operational facts first.** Status, public location, class/type, pennant, commission date, home port, precision and snapshot stay in the primary vessel card.
6. **Progressive disclosure for secondary context only.** Publication-change narrative and discrete history may expand; core vessel facts may not.
7. **Filters explain themselves.** Active constraints are visible, individually removable, clearable in one action and reflected in the URL.
8. **Category plus status.** Marker shape/icon communicates asset category while fill/border communicates status; colour is not the only channel.
9. **Responsive by context.** Desktop uses rails and side drawers, portrait tablet uses sheets, landscape iPad uses a side drawer, and mobile uses a compact bottom sheet.
10. **Failure remains useful.** Search, tables and record details continue to work when tiles or secondary datasets fail.

The direction was informed by the [Royal Navy Design System](https://github.com/Royal-Navy/design-system), [UK Government map guidance](https://brand.design-system.service.gov.uk/data/maps/), [dashboard guidance](https://brand.design-system.service.gov.uk/data/dashboards/) and [layout guidance](https://design-system.service.gov.uk/styles/layout/). [God’s Eye View](https://github.com/bilawalsidhu/gods-eye-view) informed map-first state, contextual selection and shareable controls only; its visual styling was not copied.

## 5. Three visual concepts

The reproducible desktop, iPad/tablet and mobile mock-ups for all three directions are in [concepts.html](concepts.html), with a captured review board in [concepts.png](concepts.png). They use an existing local vessel photograph and representative public fields. They are design-review material, not a production route.

### Concept A — Operational Map

**Interaction and hierarchy.** A minimal header holds unified search and the two global controls. A compact rail opens assets or validated changes. The map remains exposed while the right-hand selected-object drawer shows name, class/type, a prominent image and primary operational facts. Portrait tablet and mobile use a bottom sheet; landscape tablet keeps a side drawer.

**Advantages.** Clearest map dominance; selected state has a stable home; minimal repeated chrome; low cognitive load; fits the existing Leaflet/surface-controller architecture.

**Disadvantages.** Fleet-wide analysis requires opening the asset or filter surface; very wide desktop displays leave some unused map space by design.

**Complexity.** Medium. It reuses the current stack but requires coordinated shell, selection, history and responsive changes.

**Accessibility.** Strongest path to a linear focus order and one textual list/table alternative. Bottom-sheet focus and restoration require explicit handling.

**Existing-function impact.** Low structural risk. Existing filters, snapshots, layers, changes and images move into clearer surfaces rather than being removed.

### Concept B — Intelligence Workspace

**Interaction and hierarchy.** A persistent asset explorer and a lower fleet-context strip surround the map. Search, filters and comparison remain visible for analysts moving repeatedly between records.

**Advantages.** Highest information density; fast multi-record comparison; changes and fleet context remain continuously visible.

**Disadvantages.** The map loses useful width; repeated metrics can return; on mobile the asset list displaces the map; the overall tone risks becoming busier than the intended calm operational product.

**Complexity.** Medium to high. Resizable or persistent panels and denser state coordination add testing and maintenance cost.

**Accessibility.** More simultaneous landmarks and controls increase focus travel and screen-reader verbosity. A table mode helps but does not remove the density.

**Existing-function impact.** Functionality is preserved, but more of it is persistently visible and competes for space.

### Concept C — Responsive Field View

**Interaction and hierarchy.** Touch-first floating controls and a persistent contextual bottom sheet dominate every viewport, including desktop. The sheet is optimised for thumb reach and immediate asset identification.

**Advantages.** Strongest mobile and portrait-tablet ergonomics; a consistent gesture and spatial model across devices; prominent imagery and primary facts.

**Disadvantages.** A permanent desktop bottom sheet covers map latitude, feels less natural for keyboard/mouse work and would require careful drag/resize semantics.

**Complexity.** High. A robust draggable sheet, snap points, keyboard equivalence and cross-browser gesture testing add implementation risk without improving the existing desktop architecture.

**Accessibility.** Large targets are helpful, but drag must never be the only operation and snap states need announced, keyboard-operable alternatives.

**Existing-function impact.** Filters and lists would need a more extensive mobile-first navigation restructuring.

## 6. Comparison matrix

| Criterion | A · Operational Map | B · Intelligence Workspace | C · Responsive Field View |
|---|---|---|---|
| Map clarity | Excellent | Good | Excellent until sheet opens |
| Imagery | Prominent contextual image | Prominent only after selection | Prominent in persistent sheet |
| Information hierarchy | Strong, task-based | Dense, analysis-based | Strong, selection-based |
| Desktop | Best fit | Useful for intensive comparison | Weaker fit |
| iPad landscape | Side drawer preserves map | Dense split view | Strong touch model |
| iPad portrait | Bottom sheet | Explorer competes with map | Best touch model |
| Mobile | Compact map plus sheet | List-heavy | Excellent |
| Keyboard/screen reader | Straightforward | Long focus path | Sheet state adds complexity |
| Existing architecture | Strong fit | Moderate fit | Weakest fit |
| Implementation risk | Medium | Medium–high | High |
| Maintainability | High | Medium | Medium–low |

## 7. Recommended design

Concept A, Operational Map, is the approved direction. It best meets the primary objective without discarding working filters, imagery, snapshots, changes or URL state. It is compatible with the current Vite, ES-module, Leaflet and markercluster architecture and avoids a framework or map-library rewrite.

Two elements are combined from the other directions:

- from Concept B, a compact real-data fleet summary and complete list/table exploration path;
- from Concept C, touch-sized controls, portrait/mobile bottom sheets and prominent imagery.

The final direction incorporates the approval amendments:

- the product name is always **British Armed Forces Tracker** and is never abbreviated to “BFA Tracker”;
- one thin banner shows Deployed, Available, In re-fit, Unknown and Classified;
- Classified counts the public `withheld` location state, overlaps the operational-status measures where applicable and is not a new status;
- vessel class, type, pennant, commission date and home port remain immediately visible in the vessel card.

## 8. Final implementation specification

### Shell and layout

- Header height is 58 px on desktop and remains compact at other breakpoints.
- Unified search is persistent in the header.
- Assets and Changes live in a 56 px left rail on desktop.
- The map fills the command workspace and remains visible behind contextual surfaces.
- The fleet/asset drawer is closed by default.
- Exactly one right-side surface—details, layers, filters or changes—opens at a time on desktop.
- Fine-pointer desktop may keep the left asset drawer and one right-side surface open together.
- Compact/coarse contexts keep one surface open at a time.

### Fleet summary and filters

- The thin summary banner derives its values from the loaded vessel data.
- Deployed, Available, In re-fit and Unknown buttons toggle the corresponding status filter.
- Classified toggles `locationState=withheld` and remains independent of operational status.
- Applying a summary filter changes the map in place; it does not automatically obscure the result with the asset drawer.
- Every active search/filter constraint is shown as a removable chip; Clear all resets query, class, service, status, type, public-location state, presence and changed-only state.
- Secondary class/service/status/type/location/presence filters remain in the Filters surface.

### Search and text alternatives

- Header search matches vessel name/pennant and shore name/type/role/location.
- Matching shore records appear in the unified asset results even when no vessels match.
- Vessel results can switch between semantic list and table presentations.
- List-only vessels remain in both presentations and are never assigned invented map positions.
- A no-vessel result distinguishes between a true empty query and remaining shore matches.

### Selection and map behaviour

- Marker, cluster child, search result, list row, table row and validated change item all use the same selection functions.
- Vessel and shore selection are mutually exclusive.
- The selected marker receives a strong outline and elevated size; unrelated markers are visually de-emphasised.
- Every rendered record control exposes `aria-current` consistently.
- Map focus preserves useful zoom and pads the selected marker away from any open asset drawer, side drawer or bottom sheet.
- Cluster selection exposes a textual child list before record selection.
- Selection pushes a browser-history entry; continuing map/filter changes replace the current entry; `popstate` restores validated public state.

### Vessel detail hierarchy

Always visible, in order:

1. service and pennant context;
2. vessel name;
3. class and type line;
4. prominent local photograph;
5. status and public location;
6. class, type, pennant, commission date and home port;
7. public precision and snapshot date.

Only secondary operational context and the discrete public timeline may be expandable. The card does not claim that the snapshot date is the vessel’s observation date.

### Shore detail hierarchy

- establishment type, name and location;
- prominent local photograph with focal point and attribution;
- type, location and role as primary facts;
- description as secondary establishment context.

### Images

- Existing local image paths remain authoritative.
- Images use `loading="lazy"` and `decoding="async"`.
- The image box is visible while an image resolves and has stable dimensions to reduce layout shift.
- Load failure replaces the image with a deliberate “Photograph unavailable” block without collapsing the card.
- Shore attribution remains a keyboard-accessible external link.

### Marker semantics

- Warship, auxiliary, submarine, patrol vessel and shore establishment use distinct CSS shape/icon treatments.
- Operational status adds a separate status class used for fill/border treatment.
- Location precision and public-location state classes are preserved.
- Selection adds an outline and size change, not colour alone.
- Clusters use restrained count discs and disclose every child in a textual list.

### Responsive modes

- **Desktop (>1100 px or fine-pointer landscape):** full map, left rail, optional 320 px asset drawer and up to 410 px right detail drawer.
- **Tablet portrait (701–1100 px):** compact two-row header; surfaces become bottom sheets; selected detail uses a two-column photo/metadata layout where space permits.
- **Coarse-pointer tablet landscape (701–1400 px):** one surface at a time; selected details use a side drawer and do not dim or disable the remaining map.
- **Mobile (≤700 px):** compact two-row app bar; five equal summary targets; selected details use a bottom sheet; status and location share the first metadata row so all mandatory core details remain visible in the initial sheet view.

### Visual tokens

- Structural navy: `#07141d`, `#0d202c`, `#17313f`.
- Main surfaces: `#f7f9f8`, `#ffffff`, `#edf1f1`.
- Text and borders: `#132630`, `#526974`, `#c7d1d4`, `#9dafb6`.
- Selection: `#176fb1` with `#d9ebf7` soft background.
- Status: deployed `#147a62`, available `#2672a3`, refit/ageing `#a86713`, unknown `#68777d`, classified `#4d5660`.
- Warning/error red `#b83b36` is reserved for genuine failures.
- Focus uses the UK Government yellow `#ffbf47` at 3 px.
- Typography remains system-first: Inter when available, then Segoe UI/Arial.
- Shadows are restrained and reserved for floating operational surfaces.

### Loading, empty and failure states

- Initial data loading covers the workspace with a labelled status and reduced-motion-safe spinner.
- Missing core data uses a persistent actionable error panel.
- Missing changes/history/shore data produces a non-blocking partial-data notice; core fleet use continues.
- Dataset staleness is calculated only from release metadata after 14 days and explicitly does not imply an asset-level update or live position.
- No matching vessels keeps search/filter recovery actions and reports remaining shore matches when applicable.
- Tile failure preserves the asset list, table, search and details.
- Malformed core data fails intentionally instead of rendering an unreliable partial fleet.

### Accessibility

- Native buttons, inputs, selects, fieldsets, details, lists and tables remain the interaction foundation.
- All global controls have labels, controlled-surface relationships and expanded/pressed/current state.
- The selected heading receives programmatic focus on compact selection paths.
- Escape closes the most recently opened surface and restores the meaningful originating control or surface.
- Interactive targets are at least 44 px in their default form; compact visual chips are secondary removal affordances paired with Clear all.
- Focus is a visible 3 px yellow outline.
- Markers do not use colour alone; list/table alternatives expose all current records.
- `prefers-reduced-motion: reduce` disables non-essential animation and transitions.
- Browser zoom remains supported; layout is based on dynamic viewport units and scrollable sheets, not a fixed-scale canvas.

### Performance

- No new production dependency or framework is introduced.
- Filtering remains in-memory over the current small public datasets.
- Markercluster remains responsible for map aggregation.
- Local images remain lazy-loaded and decoded asynchronously.
- Map tile behaviour and public data request count are unchanged in kind.
- Build output and gzip size are compared with the pre-change baseline before review.

## 9. Safe implementation increments

1. Establish clean worktree and pre-change test/screenshot baseline.
2. Replace shell and design tokens without changing data or deployment.
3. Add unified search, active chips and the thin data-derived fleet banner.
4. Consolidate selection, URL history, marker and cluster semantics.
5. Rebuild vessel and shore detail hierarchy while retaining every local image.
6. Add distinct tablet portrait, tablet landscape and mobile surface rules.
7. Add loading, empty, partial, stale, image and tile-failure treatments.
8. Expand deterministic unit and Playwright regression coverage.
9. Record before/after evidence, accessibility and performance findings.
10. Open a review-only pull request; do not merge or deploy.

## 10. Test and regression evidence

Final branch evidence recorded on 1 September 2026:

| Check | Result |
|---|---|
| `npm test` | Passed. Includes public/private boundaries, provenance, source/sweep workflow, insights/history, data loader, map/filter/interface/state, WebMCP, 68 local vessel images, 40 shore records and release safeguards. |
| `npm run test:browser` | Passed, 16/16 tests in Chromium. |
| `npm run build` | Passed. Validated 68 vessels, 187 sources, 183 evidence items, 177 assessments, 104 location decisions, 10 status snapshots, one availability record, one publication change and 40 shore establishments; production exposure scan passed across 118 files. |
| `git diff --check` | Passed. |
| Intelligence-data diff | None. Build regeneration produced no tracked data change. |

The browser suite covers:

- every vessel photo and every shore record/photo mapping;
- every vessel class and shore category marker identity;
- real summary filters, mixed filter behaviour and one-action clear;
- marker, cluster, list, table, changes and URL selection;
- browser reload/back/forward and validated shared state;
- desktop, mobile, iPad portrait and iPad landscape layouts;
- loading, no results, image failure, tile failure, malformed core data, partial secondary data and stale release metadata;
- keyboard focus restoration, selected semantics and reduced motion.

No expected vessel or shore marker may silently disappear. The regression suite compares expected and rendered identity sets, while list-only records remain available through the list/table route.

### Performance result

| Production asset | Pre-change | Issue 85 | Change |
|---|---:|---:|---:|
| HTML gzip | 4.19 kB | 4.73 kB | +0.54 kB |
| CSS gzip | 11.84 kB | 12.70 kB | +0.86 kB |
| JavaScript gzip | 78.58 kB | 81.22 kB | +2.64 kB |
| Total gzip | 94.61 kB | 98.65 kB | +4.04 kB / 4.3% |

The increase is bounded and proportionate to the unified search/results, complete details, responsive surface rules and regression states. No production dependency was added, markercluster remains in place, and the 68-vessel/40-shore dataset is still filtered in memory. Initial rendering and all 16 browser scenarios completed within the existing test timeout; the full browser suite completed in 18.2 seconds locally.

## 11. Before/after visual evidence

| State | Before | Approved implementation |
|---|---|---|
| Desktop default | [before/desktop-default.png](before/desktop-default.png) | [after/desktop-default.png](after/desktop-default.png) |
| Selected vessel | [before/desktop-vessel.png](before/desktop-vessel.png) | [after/desktop-vessel.png](after/desktop-vessel.png) |
| Selected shore establishment | [before/desktop-shore.png](before/desktop-shore.png) | [after/desktop-shore.png](after/desktop-shore.png) |
| iPad portrait | [before/ipad-portrait.png](before/ipad-portrait.png) | [after/ipad-portrait.png](after/ipad-portrait.png) |
| iPad landscape | [before/ipad-landscape.png](before/ipad-landscape.png) | [after/ipad-landscape.png](after/ipad-landscape.png) |
| Mobile selected vessel | [before/mobile-vessel.png](before/mobile-vessel.png) | [after/mobile-vessel.png](after/mobile-vessel.png) |
| Filtered fleet | — | [after/desktop-filtered.png](after/desktop-filtered.png) |
| Cluster contents | — | [after/desktop-cluster.png](after/desktop-cluster.png) |
| Mobile no results | — | [after/mobile-no-results.png](after/mobile-no-results.png) |

The selected-vessel evidence is the acceptance reference for the mandatory immediately visible fields, including commission date and home port.

## 12. Remaining risks and follow-up

- Physical-device iPad and mobile-Safari verification remains a release-stage check even though coarse-pointer portrait/landscape browser emulation is covered.
- Leaflet markers are not a complete screen-reader representation of the dataset; the list/table alternative is therefore a permanent requirement, not optional duplication.
- “Classified” is user-facing shorthand for a deliberately withheld public location. Documentation and accessible state must continue to prevent it being interpreted as an operational status or evidence classification.
- The current public data supports validated release changes, not continuous movement history or per-record update timestamps. Richer change analysis would require separately reviewed public data-model work.
- This branch does not merge, deploy or alter the live site. Those actions require the repository’s independent review and release workflow.
