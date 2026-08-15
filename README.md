# Royal Navy and RFA OSINT Fleet Map

A static browser application showing the last publicly reported locations of Royal Navy and Royal Fleet Auxiliary (RFA) vessels on an interactive two-dimensional map.

The application is a curated open-source intelligence (OSINT) snapshot. It is not a live tracking service. Markers may represent a named port or a broad operational area rather than an exact vessel position.

## What is included

- A 71-vessel Royal Navy and RFA roster derived from the supplied status workbook
- Search by vessel name or pennant number
- Filters for service, vessel type, operational status and location classification
- Interactive OpenStreetMap basemap with clustered markers for explicitly recorded coordinates
- Clean vessel cards with status and recorded location; detailed provenance stays outside the client projection
- Clear `mapped`, `approximate`, `unknown` and `withheld` location classifications
- Automated dataset validation and production-build checks
- Responsive desktop and mobile layouts

## Map controls

- Pan by dragging and zoom with the on-map controls, mouse wheel or supported touch gestures.
- Nearby markers cluster automatically. Select a cluster to zoom in; markers sharing one coordinate expand individually at maximum zoom.
- Select a plotted vessel from the list to centre its marker, or use **Show all plotted vessels** to restore the filtered overview.
- Unknown and withheld vessels remain available through search and the vessel list without being plotted.
- If basemap tiles are unavailable, vessel search and vessel details continue to work.

The basemap is provided by [OpenStreetMap](https://www.openstreetmap.org/copyright) and its attribution remains visible on the map. The browser requests only the tiles needed for the current viewport; the application does not prefetch or bulk-download tiles.

## Location safeguards

- Coordinates exist only as explicit fields in the curated dataset.
- The browser performs no geocoding, course extrapolation or positional inference.
- Approximate markers are labelled as representative ports or operational areas.
- Unknown and withheld vessels remain in the roster but are not plotted.
- Submarines are plotted only at publicly reported ports, shipyards or maintenance locations.
- Undisclosed submarine patrol positions are never inferred or displayed.

The dataset date is not proof that every source observation occurred on that date. Each marker should be read as the last public location recorded by this project, subject to the precision labels and disclaimer shown in the interface.

## Evidence and assessment model

The repository now separates canonical vessel identities, a central source registry, append-only evidence and versioned assessments under `data/internal/provenance/`. These files are non-client operational records, not confidential storage: the repository may be public, so they contain no credentials, private API data or secrets.

`data/royal-navy/vessels.json` is generated from the current assessments. It contains only fields needed by the public card, list and map. Source URLs, account handles, evidence timestamps, content hashes, origin clusters, conflicts, analyst notes and assessment reasoning are not copied into the browser bundle.

Evidence records distinguish retrieval, publication and bounded observation times. Publication time is never silently reused as observation time. Corroboration counts distinct upstream `originId` values rather than links or reposts. Confidence is categorical (`high`, `moderate`, `low`, `unknown`) and incorporates directness, source tier, time, freshness, independence and unresolved conflict.

The migrated legacy records retain their public “last reported” state, but their old combined date field was not promoted into a fabricated observation time. Their internal assessments therefore remain historical/unknown-confidence until explicit or bounded observations are entered and reviewed.

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
npm run build
```

Validation rejects malformed registry/evidence/assessment records, unknown cross-record references, duplicate identifiers, invalid temporal ranges, missing assessment history, stale public projections, provenance leakage, invalid coordinates, unmapped records without reasons and submarine patrol records containing coordinates. The production build also scans the generated client files for internal provenance tokens and source/account URLs.

## Data maintenance

Do not edit `data/royal-navy/vessels.json` as the system of record. The maintenance flow is:

1. resolve a source reference to a canonical vessel identifier (ID, pennant or another strong identifier);
2. add or update the central source registry only after officiality, terms and collection mode are reviewed;
3. generate the current lawful/manual source queue with `npm run sweep:sources`;
4. validate a manual evidence record with `node scripts/ingest-evidence.mjs <file> --dry-run`;
5. append it without `--dry-run` after review;
6. create a new assessment revision referencing selected, excluded and conflicting evidence rather than overwriting old evidence;
7. run `npm run generate:public`, `npm run validate:data`, the full test suite and the production build.

X accounts are registry inputs only until an individual canonical post is collected. X collection is manual unless an authorised API, credentials and current terms review are available; browser scraping is not implemented. Commercial AIS providers are disabled pending a suitable API licence, and missing AIS has no negative meaning. MarineVesselTraffic is retained as a mandatory discovery source only and cannot establish a location without dated independent evidence.

See [`docs/osint-provenance.md`](docs/osint-provenance.md) for the architecture, source catalogue policy, confidence rules, collection flow and known limitations.
