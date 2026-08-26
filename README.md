# Royal Navy and RFA OSINT Fleet Map

A static browser application showing the last publicly reported locations of Royal Navy and Royal Fleet Auxiliary (RFA) vessels on an interactive two-dimensional map.

The application is a curated open-source intelligence (OSINT) snapshot. It is not a live tracking service. Markers may represent a named port or a broad operational area rather than an exact vessel position.

## What is included

- A 68-vessel current Royal Navy and RFA roster
- Search by vessel name or pennant number
- Filters for service, vessel type, operational status, neutral public location state and broad geographic scope
- A map-first interface with a collapsible fleet drawer, selected-record drawer and compact top bar
- A compact class ribbon with class-level active counts and public-status percentages inside Filters
- A release-to-release change summary that stays collapsed until requested
- Interactive OpenStreetMap basemap with optional clustering, bounded uncertainty areas and UK shore-establishment layers
- Progressive vessel details with status, supported public location and snapshot date; detailed provenance remains outside the client projection
- Clear confirmed, last-reported, unconfirmed, no-recent-information and withheld public location states, separated from port, city, region and list-only precision
- Automated dataset validation and production-build checks
- Responsive desktop drawers, compact iPad side panels and touch-oriented phone bottom sheets
- Versioned local preferences, five public view presets and validated shareable map links

## Map controls

- Pan by dragging and zoom with the on-map controls, mouse wheel or supported touch gestures.
- Use **Layers** to show or hide fleet vessels, bounded uncertainty areas and public UK shore establishments, or to switch marker clustering on and off. The uncertainty control appears only when the public dataset contains regional records.
- Select a plotted vessel from the map or fleet drawer to highlight it, keep regional context and open its public record. Use **Reset view** to restore the filtered overview.
- Use **Filters** for class, service, operational status, vessel type, public location state and broad geographic scope. Active constraints appear as a compact count on the button and **Clear all** appears only when needed.
- Use a public preset to switch the existing filters and layers to Fleet overview, Deployed vessels, United Kingdom ports, Maintenance and refit or Overseas presence. Presets do not create a second dataset.
- The browser address is kept in sync with the current public filters, layers, selected vessel and bounded map view. Copy that address to share the same state across desktop, iPad and phone layouts.
- Vessels without a current public fix can retain a neutral last-publicly-reported label. Port and city reports use deliberately rounded point markers; broader reports use regional areas instead of representative points.
- If basemap tiles are unavailable, vessel search and vessel details continue to work.

The basemap is provided by [OpenStreetMap](https://www.openstreetmap.org/copyright) and its attribution remains visible on the map. The browser requests only the tiles needed for the current viewport; the application does not prefetch or bulk-download tiles.

## Saved and shared views

Supported public filters and layer choices are saved in browser local storage under a versioned
schema. Invalid JSON, unknown schema versions and values no longer present in the current dataset
fall back to documented defaults without preventing the tracker from loading.

A URL carrying `view=2` is authoritative for that visit, so a shared view does not inherit the
recipient's saved preferences. The URL allow-list covers only public filter values, supported layer
names (including bounded uncertainty areas), a current public vessel identifier, latitude,
longitude and zoom. Coordinates and zoom are strictly parsed and bounded to Leaflet's supported
map range; empty or malformed numeric values are rejected. Unknown, overlong or obsolete values
are discarded when the address is rewritten. Version 1 saved views and links retain compatible
public filters and layers, while the superseded location-classification filter is safely cleared
rather than reinterpreted as the newer public location-state field. Source records, evidence
assessments, analyst metadata and collection status are not accepted by the state parser or written
to local storage or the URL.

The United Kingdom ports preset shows only the three naval bases and two dockyards already present
in the public shore dataset. The geographic-scope filter classifies rounded port/city points and
the published centre of broad regional areas with a documented broad box from 49°N to 61.5°N and
12.5°W to 4°E. It performs no geocoding and excludes list-only records from both geographic-scope
results.

## Location safeguards

- Coordinates exist only as explicit fields in the curated dataset.
- The browser performs no geocoding, course extrapolation or positional inference.
- Port and city coordinates are rounded to public display precision and never claim an exact berth.
- Region and exercise-area reports use a bounded, dashed regional representation that is explicitly labelled as not being a live position.
- A plotted historical location is never presented as a live fix. Its marker uses only the precision supported by the reviewed evidence.
- Unknown, unconfirmed and no-recent-information vessels remain searchable and listable without invented coordinates.
- Submarines are plotted only at publicly reported ports, shipyards or maintenance locations.
- Undisclosed submarine patrol positions are never inferred, represented symbolically or displayed.

The dataset date is not proof that every source observation occurred on that date. Each marker should be read as the last public location recorded by this project, subject to its displayed public location state, precision and the project's internal evidence review.

## Evidence and assessment model

Canonical vessel identities, the central source registry, append-only evidence and versioned
assessments currently remain under `data/internal/provenance/` as a reviewed, non-sensitive legacy
migration state. New real private inputs live only in an owner-controlled external encrypted and
versioned directory selected by `RNFS_PRIVATE_DATA_ROOT`; the resolver rejects repository-contained
real roots and malformed manifests. Public CI receives no real private input or credential and tests
the boundary with fabricated data only.

`data/royal-navy/vessels.json` is generated from the current assessment index and contains only the
fields required by the public map, filters, release insights and vessel card. Every current trusted
assessment contains an exact-key `publicLocation` publication decision. The projection copies only
its explicitly reviewed rounded point, bounded circle or list-only result; it does not infer precision
or radius from place or movement text. Source URLs, evidence
timestamps, account handles, content hashes, origin clusters, analyst notes, confidence reasoning
and assessment history are not copied into the public vessel projection.

The standing dated, vessel-specific evidence rules remain enforced by the append-only location
decision log and the internal provenance validators. Publication, retrieval and bounded observation
times are distinct; publication time is never silently promoted into observation time. Independent
corroboration counts origin clusters, not links or reposts.

See [`docs/osint-provenance.md`](docs/osint-provenance.md) for the full model, collection boundary,
confidence/freshness rules and known limitations.
See [`docs/private-input-boundary.md`](docs/private-input-boundary.md) for local configuration,
synthetic-only CI, backup/recovery gates, credential rotation and sanitised release steps.
See [`docs/public-geographic-precision.md`](docs/public-geographic-precision.md) for the public state,
geometry and submarine publication safeguards.

## Run locally

Install dependencies:

```bash
npm install
```

Start the browser application:

```bash
npm run dev
```

Open the address printed by Vite in a browser.

To inspect the production build:

```bash
npm run build
npm run preview
```

## Private release testing

The production build can be tested on another device without publishing the repository or
application. Build the application, then supply the specific Tailscale hostname that will proxy the
local preview:

```powershell
npm run build
npm run preview:private -- <device>.<tailnet>.ts.net
```

The private-preview command accepts only a hostname ending in `.ts.net`, adds only that hostname to
Vite's allowlist and keeps the server bound to `127.0.0.1`. It does not store the hostname in the
repository. Do not include `https://`, a port or a path.

In a second terminal:

```powershell
tailscale serve 4173
```

Connect the iPad or other test device to the same Tailscale network and open the HTTPS address
printed by Tailscale. Keep both terminal windows open during testing and press `Ctrl+C` in both when
finished. Use the full checklist in
[`docs/private-release-test.md`](docs/private-release-test.md) and record physical-device evidence in
[`docs/release-test-report.md`](docs/release-test-report.md).

## GitHub Pages preparation

Create a Pages-compatible project build with:

```bash
npm run build:pages
```

This uses `/royal-navy-fleet-status/` as the project path and validates the built JavaScript, CSS
(Cascading Style Sheets) and fleet-data output. Continuous Integration (CI) also stores this output
as a private workflow artifact for seven days. Repository read access is required to download it
from the relevant Actions run.

No Pages deployment workflow is configured. GitHub Free supports Pages for public repositories,
while privately published Pages sites require an eligible organisation using GitHub Enterprise
Cloud. Enabling Pages, changing repository visibility or adding deployment permissions requires a
separate human-approved change.

## Validate and build

```bash
npm run generate:public
npm run validate:data
npm run validate:decisions
npm run validate:history
npm run validate:changes
npm test
npm run build
```

The checks validate the source/evidence/assessment graph, prove the public projection is current,
enforce the dated decision/history/publication contracts, reject invalid coordinates and unsafe
submarine positions, and scan built assets for internal provenance or source exposure.

Private operational tooling is documented separately: the server-authorised evidence-health view in
[`docs/private-evidence-health.md`](docs/private-evidence-health.md), and the disabled AIS/Copernicus
evaluation in
[`docs/external-corroboration-evaluation.md`](docs/external-corroboration-evaluation.md).

## Data maintenance

Do not edit `data/royal-navy/vessels.json` as the system of record. Resolve the vessel and source
against the configured private registries, validate and append reviewed evidence, create a new assessment
revision, then run `npm run generate:public`. Use `npm run sweep:sources` to materialise the enabled
review queue. Use `npm run sweep:collect -- --output=<run.json>` for one read-only pass over the
allowlisted public publisher indexes. The collector records links and hashes only: it never requests
X timelines, manual sources or commercial APIs, and it never ingests evidence or publishes a fleet
change. A blocked required index makes the collection command fail after writing its auditable
ledger. Royal Navy News is reviewed manually because its publisher edge blocks the collector;
Westward Shipping News RSS is its Tier C, discovery-only automatic replacement.

From 24 August 2026, advancing the canonical `metadata.asOfDate` requires a finalised sweep run in
`data/internal/provenance/sweep-runs/`. The run must contain an explicit outcome for all 68 current vessels,
every required recurring manual source and every required public index. A typed collection or review
blocker is retained in the ledger but leaves the run incomplete, so the release gate fails closed.
Historical one-off evidence URLs do not become recurring sweep targets merely because their source
records remain enabled. Finalisation derives vessel outcomes from the captured baseline and staged
candidate assessments, seals the exact public/provenance closure and cannot be repeated. Pull-request
CI authenticates a new baseline against the base commit and re-derives the stored outcome,
assessment and evidence bindings.

After generating the public projection, regenerate the publication summary, append the status
snapshot and run every validation/test/build gate. Point and regional publication decisions still require
dated, vessel-specific evidence; generic home-port or class pages remain insufficient.

Location review decisions are recorded append-only in
`data/royal-navy/location-decisions.jsonl`. Each JSON Lines record preserves the vessel,
source, evidence/check dates, classification decision, freshness policy and rationale even when a
review correctly leaves a vessel unknown. Validate the log with `npm run validate:decisions`.
Pull-request CI compares the file with the base commit and rejects deleted, reordered or modified
existing records; corrections must be appended as new superseding decisions.

`data/royal-navy/publication-changes.json` describes the differences between the current proposed
release and its production base. Regenerate it with
`npm run generate:changes -- --base-ref <production-ref>`. Weekly fleet statuses are stored
append-only in `data/royal-navy/status-history.jsonl`; append the current dataset date with
`npm run snapshot:status` and validate it with
`npm run validate:history -- --base-ref <production-ref>`. The interface does not present a rolling
12-month availability figure until at least 52 weekly observations span approximately one year, and
unknown observations reduce coverage instead of being guessed.

Future fleet/class analytics use the separate, class-aware
`data/royal-navy/availability-history.jsonl` ledger. Its proposed scheduled collector accepts only a
reviewed public status release, opens a human-reviewed pull request containing that ledger alone and
fails rather than treating stale status as a new weekly observation. Historic percentages remain
unpublished. See [`docs/weekly-availability-history.md`](docs/weekly-availability-history.md).

If late evidence requires a same-day correction, follow
[`docs/release-revisions.md`](docs/release-revisions.md): increment the release revision, record a
later release instant and append a reasoned correction instead of rewriting history.

The owner-reviewed weekly refresh procedure is documented in
[`docs/weekly-fleet-refresh.md`](docs/weekly-fleet-refresh.md). X scraping, unlicensed commercial
tracking collection and unattended publication remain outside the current version.
