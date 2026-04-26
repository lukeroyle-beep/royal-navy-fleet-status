# Sentinel Replay MVP

OSINT globe viewer and incident tracker. This is a static browser prototype for replaying curated geopolitical/security events on a 3D globe timeline.

## What is included

- Interactive Three.js globe with orbit controls
- Timeline scrubber, play/pause, and replay speed controls
- Moving maritime, aircraft, satellite, and OSINT-style tracks
- Incident markers synchronized to time
- Side panel with chapter narrative and OSINT replay notes
- Clickable tracks, incident markers, and active zones with source details
- Layer toggles for Aircraft, Maritime, Incidents, and Zones
- Source-confidence indicator for incident / OSINT markers
- Local JSON scenario loading from `data/scenarios/red-sea-demo.json`
- TypeScript data contracts in `src/types.ts`

The included event is a fictionalized but realistic Red Sea maritime disruption replay. The data is mocked and curated for UX validation, not attribution, live monitoring, or operational use.

## Data layers

Primary local JSON layers are:

- `aircraftTracks`: `id`, `callsign`, `aircraftType`, `sourceLabel`, and timestamped `lat` / `lon` / `altitudeFt` points.
- `maritimeTracks`: `vesselId`, `vesselName`, `vesselType`, `sourceLabel`, and timestamped `lat` / `lon` / `speedKnots` / `courseDeg` points.
- `incidents`: `timestamp`, `lat`, `lon`, `title`, `description`, `category`, `confidence`, and `sourceUrl` placeholder.
- `zones`: `restricted_airspace`, `maritime_warning_area`, and `conflict_zone` polygons with timestamped `activeFrom` / `activeUntil` windows.

The demo also keeps auxiliary curated `tracks` for satellite passes and OSINT report movement so the replay can show richer context without fetching live data.

## Architecture

The first version is intentionally simple and split into reusable modules:

- `src/app.js`: application coordinator and replay state loop.
- `src/components/ScenarioLoader.js`: loads local JSON and normalizes feed-specific records into replay-ready objects.
- `src/components/GlobeView.js`: Three.js globe, tracks, incidents, zones, timeline visibility, and picking.
- `src/components/TimelineControls.js`: play/pause, speed, and scrubber behavior.
- `src/components/LayerTogglePanel.js`: Aircraft, Maritime, Incidents, and Zones layer toggles.
- `src/components/EventDetailsPanel.js`: selected object details and source-confidence display.
- `src/types.ts`: strongly typed scenario, track, incident, and zone data contracts.
- `src/utils/geo.js`: globe texture and lat/lon conversion helpers.

This keeps the current MVP static and working while preserving clear component boundaries for a later React/Vite conversion.

## Stack direction

The checked-in prototype runs as static browser code with CDN-loaded Three.js so it works in this workspace without installing packages. `package.json` captures the intended Vite + React + TypeScript + Tailwind direction for the next iteration.

## Run locally

Serve the folder with any static file server so the browser can load local JSON files.

```powershell
python -m http.server 5173
```

Then visit `http://localhost:5173`.
