# Sentinel Replay MVP

OSINT globe viewer and incident tracker. This is a static browser prototype for replaying curated geopolitical/security events on a 3D globe timeline.

## What is included

- Interactive Three.js globe with orbit controls
- Timeline scrubber, play/pause, and replay speed controls
- Moving maritime, flight, satellite, and OSINT-style tracks
- Incident markers synchronized to time
- Side panel with chapter narrative and OSINT replay notes
- Local JSON scenario loading from `data/scenarios/red-sea-disruption.json`
- TypeScript data contracts in `src/types.ts`

The included event is a fictionalized but realistic Red Sea maritime disruption replay. The data is mocked and curated for UX validation, not attribution, live monitoring, or operational use.

## Stack direction

The checked-in prototype runs as static browser code with CDN-loaded Three.js so it works in this workspace without installing packages. `package.json` captures the intended Vite + React + TypeScript + Tailwind direction for the next iteration.

## Run locally

Serve the folder with any static file server so the browser can load local JSON files.

```powershell
python -m http.server 5173
```

Then visit `http://localhost:5173`.
