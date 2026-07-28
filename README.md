# Royal Navy and RFA OSINT Fleet Map

A static browser application showing the last publicly reported locations of Royal Navy and Royal Fleet Auxiliary (RFA) vessels on an interactive two-dimensional map.

The application is a curated open-source intelligence (OSINT) snapshot. It is not a live tracking service. Markers may represent a named port or a broad operational area rather than an exact vessel position.

## What is included

- A 71-vessel Royal Navy and RFA roster derived from the supplied status workbook
- Search by vessel name or pennant number
- Filters for service, vessel type, operational status and location classification
- Interactive OpenStreetMap basemap with clustered markers for explicitly recorded coordinates
- Vessel details with status, recorded location, evidence date, checked date, evidence classification and supporting source
- Clear `mapped`, `approximate`, `unknown` and `withheld` location classifications
- Automated dataset validation and production-build checks
- Responsive desktop and mobile layouts

## Map controls

- Pan by dragging and zoom with the on-map controls, mouse wheel or supported touch gestures.
- Nearby markers cluster automatically. Select a cluster to zoom in; markers sharing one coordinate expand individually at maximum zoom.
- Select a plotted vessel from the list to centre its marker, or use **Show all plotted vessels** to restore the filtered overview.
- Unknown and withheld vessels remain available through search and the vessel list without being plotted.
- If basemap tiles are unavailable, vessel search, evidence details and supporting links continue to work.

The basemap is provided by [OpenStreetMap](https://www.openstreetmap.org/copyright) and its attribution remains visible on the map. The browser requests only the tiles needed for the current viewport; the application does not prefetch or bulk-download tiles.

## Location safeguards

- Coordinates exist only as explicit fields in the curated dataset.
- The browser performs no geocoding, course extrapolation or positional inference.
- Approximate markers are labelled as representative ports or operational areas.
- Unknown and withheld vessels remain in the roster but are not plotted.
- Submarines are plotted only at publicly reported ports, shipyards or maintenance locations.
- Undisclosed submarine patrol positions are never inferred or displayed.

The dataset date is not proof that every source observation occurred on that date. Each marker should be read as the last public location recorded by this project, subject to the precision and evidence labels shown in the interface.

## Evidence model

Every vessel record separates two dates:

- `locationEvidenceDate` is the publication or observation date that supports the displayed location. It is `null` when no defensible date is available.
- `evidenceCheckedDate` is the date a maintainer last checked the cited source.

Mapped and approximate records require a named-vessel source that directly supports the displayed location, a valid location evidence date, and either `direct-report` or `direct-tracker` evidence. Generic fleet, class, capability, and home-port pages are not sufficient current-location evidence on their own.

Records that do not meet that threshold use `unknown`, contain no coordinates, and explain the downgrade. Withheld submarine positions use `withheld`, contain no coordinates, and never infer patrol areas. The interface displays an unknown evidence date as “Unknown”; maintainers must not substitute the check date or dataset date.

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

## Validate and build

```bash
npm run validate:data
npm run build
```

The validation rejects duplicate vessel identifiers, invalid location or evidence classifications, missing source labels or HTTPS links, missing or invalid evidence dates, insufficient mapped evidence, invalid coordinates, unmapped records without reasons and submarine patrol records containing coordinates.

## Data maintenance

Fleet data is stored in `data/royal-navy/vessels.json`. Any update should:

1. retain all roster records;
2. include a public supporting source;
3. record the source observation or publication date separately from the date the source was checked;
4. classify both location precision and evidence quality;
5. use only a source that directly identifies the vessel and supports the displayed location for mapped or approximate records;
6. downgrade unsupported locations to `unknown`, remove coordinates and explain why;
7. omit coordinates where a submarine position is withheld; and
8. pass `npm run validate:data` and `npm test`.

Automated collection, third-party tracking feeds, scheduled refreshes and public deployment are outside the current version.
