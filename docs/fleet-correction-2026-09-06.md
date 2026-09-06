# Vengeance and Fort Victoria correction

Implementation branch: `codex/vengeance-fort-victoria`, based on `ca5b99b9d0a0a66f1e96d49b6fcda1bd6eb4473f`.

This is a locally implemented and validated candidate, not a published release. The existing dirty checkout and active external private-input root were preserved. The external candidate contains the canonical inventory, assessments and source-coverage row needed to regenerate the public dataset; the committed legacy migration inputs remain unchanged.

## Result

- HMS Vengeance remains one deployed Vanguard-class SSBN record. Both public location labels are `On patrol`. Its actual `position` and `uncertaintyArea` remain null, with location withheld and precision `none`.
- `mapRepresentation: representative-patrol` is a strictly validated display opt-in. The map resolves it to the same fixed symbolic North Atlantic anchor retained in the legacy internal assessment. The projection requires an explicit current decision and rejects a different anchor. Neither a historical symbolic coordinate alone nor an arbitrary submarine record enables it.
- The anchor is not an observed position, patrol area, route, likely operating position or geographical-presence datum. The marker remains selectable and uses the normal filtering, clustering and URL-state paths. Its tooltip says `On patrol`; the card and accessible marker label distinguish it from an actual position.
- RFA Fort Victoria is added as `Fort class`, type `RFA auxiliary - replenishment ship`, pennant A387, commission year 1994. Her canonical status is the established `In re-fit` enum, formatted as `In Re-fit` in the current card, list, table and filter labels.
- Her public location is `Seaforth Docks, Liverpool`, using the port-level anchor 53.46, -3.02. The location description retains `long-term lay-up`; no berth is asserted.
- Total inventory: **68 → 69**; Royal Navy: **60 unchanged**; Royal Fleet Auxiliary: **8 → 9**; Fort class: **0 → 1**; refit: **14 → 15**.
- Visible markers: **41 → 43**, comprising **42 ordinary port/city markers plus one representative marker**. All original marker IDs and coordinates are preserved. Regional records remain 26. The publication artifact's existing broader geometry count includes regional geometry: **67 → 69**; that is not a count of visible point markers.
- Historical status/location lines and weekly availability records are unchanged. A new 6 September candidate status/location entry and identity-catalog record were appended. Earlier snapshots do not acquire Fort Victoria or the new representative marker.
- The `Precision` row found in the current vessel-card component was removed as requested. Evidence dates, evidence classification and supporting sources remain absent from cards. All 68 existing photographs and their card-sized assets are unchanged.

## Assumptions and source handling

The owner's explicit instruction supplies the patrol status, Fort Victoria's refit status and lay-up location. These have not been relabelled as newly collected OSINT observations. New internal assessments explain that distinction and do not manufacture observation dates or a completed sweep.

Fort Victoria's class, role, pennant and service year were checked against the [official Royal Navy vessel page](https://www.royalnavy.mod.uk/organisation/units-and-squadrons/support-ships/rfa-fort-victoria). Dock-level geography was checked against public Seaforth Dock location references, including [the Wikimedia location record](https://commons.wikimedia.org/wiki/Category:Seaforth_Container_Terminal,_Port_of_Liverpool). These identify the dock, not the vessel's berth. No supporting-source URL is added to the public fleet records or cards.

No reliable home-port value was supplied, so the existing `Not recorded` presentation is used. There is no dedicated Fort Victoria image in the repository. The existing Wikimedia/Wikipedia lookup and accessible `Photograph unavailable` fallback remain available; regression tests force image lookup failure to verify the fallback.

The private candidate adds an explicitly unreviewed/disabled social-coverage row for Fort Victoria. The official vessel page links an account, but its collection readiness has not been tested or enabled in this task. No Sunday scheduler, collector or release gate was changed.

## Validation and delivery

Validation results are recorded in the completion evidence accompanying this worktree. The production and Pages builds use the existing public CI path with the external private-root variable unset. The canonical candidate is separately checked with the normal data/projection validator.

The live publication gate remains intentionally unsatisfied: `no sweep run covers 2026-09-06 r1`. The passing public CI build is not evidence of completed sweep coverage and does not authorise publication. Before activation, reconcile this candidate with the latest authoritative fleet release and complete the normal release process. Do not replace newer Sunday work with this candidate.

Rollback requires only discarding this isolated branch/candidate; no live state was changed.

Two existing browser assertions were made timing-safe during production verification: the delayed-photo test waits for the selected photograph's own loading state to finish before measuring its figure, and the iPad check waits for the drawer's entrance animation to settle before measuring its edge. Application photo/layout behaviour was not changed.

## Changed repository files

- `README.md`
- `data/royal-navy/publication-changes.json`
- `data/royal-navy/status-history-catalog.json`
- `data/royal-navy/status-history.jsonl`
- `data/royal-navy/status-location-history.jsonl`
- `data/royal-navy/vessels.json`
- `docs/fleet-correction-2026-09-06.md`
- `index.html`
- `package.json`
- `scripts/check-client-exposure.mjs`
- `scripts/fixtures/fleet-correction-baseline.json`
- `scripts/generate-publication-changes.mjs`
- `scripts/lib/client-exposure.mjs`
- `scripts/lib/public-projection.mjs`
- `scripts/lib/status-location-snapshot.mjs`
- `scripts/test-fleet-corrections.mjs`
- `scripts/test-fleet-filter.mjs`
- `scripts/test-insights.mjs`
- `scripts/test-interface.mjs`
- `scripts/test-loader.mjs`
- `scripts/test-location-history.mjs`
- `scripts/test-map.mjs`
- `scripts/test-photos.mjs`
- `scripts/test-shore-establishments.mjs`
- `scripts/validate-publication-changes.mjs`
- `src/app.js`
- `src/components/EventDetailsPanel.js`
- `src/components/FleetMap.js`
- `src/components/ScenarioLoader.js`
- `src/utils/fleet.js`
- `src/utils/fleetFilter.js`
- `src/utils/location-history.js`
- `src/utils/map.js`
- `src/utils/representativePatrol.js`
- `tests/browser/concept-a.spec.js`
- `tests/browser/fleet-regression.spec.js`

## Final test results

- Full unit/integration suite: PASS (run within both production build pipelines).
- Configured browser suite: 43/43 PASS.
- Production-compatible browser suite: 42/42 PASS after making the two existing timing assumptions explicit. The development-module motion test runs on the configured Vite surface and is excluded only from the bundled-production invocation.
- Production build and Pages build: PASS, including data/history validation, Pages base-path checks and the client-exposure scan across 187 built files.
- Canonical candidate: normal data/projection validation PASS for 69 vessels; active inputs remain unchanged at 68 vessels.
- Historical-prefix and existing-marker regression: PASS; all 41 previous marker identities and coordinates preserved, no past status/location lines rewritten, and availability history unchanged.
- Publication readiness: NOT READY; native sweep gate correctly rejects the candidate because no sweep covers 6 September r1. This is a release follow-up, not a disabled check or an invented successful sweep.

All verification is local. No PR, merge, deployment, canonical-input activation or memory write-back was performed. A dedicated Fort Victoria photograph and reviewed direct social-source coverage remain follow-up items; the approved image fallback already works.
