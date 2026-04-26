# Sentinel Replay MVP

A static browser prototype for replaying curated geopolitical/security events on a 3D globe timeline.

## What is included

- Interactive Three.js globe with orbit controls
- Timeline scrubber, play/pause, and replay speed controls
- Moving maritime, flight, and satellite tracks
- Incident markers synchronized to time
- Side panel with chapter narrative and OSINT replay notes

The included event is a representative Nord Stream September 2022 replay. The data is curated prototype data for UX validation, not an attribution or evidentiary claim.

## Run locally

Open `index.html` directly in a browser, or serve the folder with any static file server.

```powershell
python -m http.server 5173
```

Then visit `http://localhost:5173`.
