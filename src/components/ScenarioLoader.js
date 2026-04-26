export class ScenarioLoader {
  constructor(url) {
    this.url = url;
  }

  async load() {
    const response = await fetch(this.url);
    if (!response.ok) {
      throw new Error(`Could not load scenario JSON from ${this.url}`);
    }
    return normalizeScenario(await response.json());
  }
}

function normalizeScenario(raw) {
  const aircraftTracks = (raw.aircraftTracks || []).map((track) => ({
    id: track.id,
    type: "flight",
    name: track.callsign,
    assetType: track.aircraftType,
    sourceLabel: track.sourceLabel,
    color: track.color || "#f3ba4d",
    points: track.points.map((point) => ({
      time: Date.parse(point.timestamp),
      lat: point.lat,
      lon: point.lon,
      altitudeFt: point.altitudeFt,
    })),
  }));

  const maritimeTracks = (raw.maritimeTracks || []).map((track) => ({
    id: track.vesselId,
    type: "vessel",
    name: track.vesselName,
    assetType: track.vesselType,
    sourceLabel: track.sourceLabel,
    color: track.color || "#2fd0b5",
    points: track.points.map((point) => ({
      time: Date.parse(point.timestamp),
      lat: point.lat,
      lon: point.lon,
      speedKnots: point.speedKnots,
      courseDeg: point.courseDeg,
    })),
  }));

  const auxiliaryTracks = (raw.tracks || []).map((track) => ({
    ...track,
    sourceLabel: track.sourceLabel || "Curated OSINT mock",
    points: track.points.map(([time, lat, lon]) => ({ time: Date.parse(time), lat, lon })),
  }));

  return {
    ...raw,
    start: Date.parse(raw.start),
    end: Date.parse(raw.end),
    chapters: raw.chapters.map((item) => ({ ...item, time: Date.parse(item.at) })),
    notes: raw.notes.map((item) => ({ ...item, time: Date.parse(item.at) })),
    tracks: [...maritimeTracks, ...aircraftTracks, ...auxiliaryTracks],
    incidents: (raw.incidents || []).map((incident) => ({
      ...incident,
      time: Date.parse(incident.timestamp),
    })),
    zones: (raw.zones || []).map((zone) => ({
      ...zone,
      activeStart: Date.parse(zone.activeFrom),
      activeEnd: Date.parse(zone.activeUntil),
    })),
  };
}

