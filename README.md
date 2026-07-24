# Royal Navy and RFA OSINT Fleet Map

A static browser application showing the last publicly reported locations of Royal Navy and Royal Fleet Auxiliary (RFA) vessels on an interactive 3D globe.

The application is a curated open-source intelligence (OSINT) snapshot. It is not a live tracking service. Markers may represent a named port or a broad operational area rather than an exact vessel position.

## What is included

- A 71-vessel Royal Navy and RFA roster derived from the supplied status workbook
- Search by vessel name or pennant number
- Filters for service, vessel type, operational status and location classification
- Interactive Three.js globe markers for explicitly recorded coordinates
- Vessel details with status, recorded location, data date and supporting source
- Clear `mapped`, `approximate`, `unknown` and `withheld` location classifications
- Automated dataset validation and production-build checks
- Responsive desktop and mobile layouts

## Location safeguards

- Coordinates exist only as explicit fields in the curated dataset.
- The browser performs no geocoding, course extrapolation or positional inference.
- Approximate markers are labelled as representative ports or operational areas.
- Unknown and withheld vessels remain in the roster but are not plotted.
- Submarines are plotted only at publicly reported ports, shipyards or maintenance locations.
- Undisclosed submarine patrol positions are never inferred or displayed.

The dataset date is not proof that every source observation occurred on that date. Each marker should be read as the last public location recorded by this project, subject to the precision label shown in the interface.

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

The validation rejects duplicate vessel identifiers, invalid classifications, missing evidence links, invalid coordinates, unmapped records without reasons and submarine patrol records containing coordinates.

## Data maintenance

Fleet data is stored in `data/royal-navy/vessels.json`. Any update should:

1. retain all roster records;
2. include a public supporting source;
3. update the record date;
4. classify the location precision;
5. omit coordinates where the location is unknown or withheld; and
6. pass `npm run validate:data`.

Automated collection, third-party tracking feeds, scheduled refreshes and public deployment are outside the current version.
