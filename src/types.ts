export type TrackType = "vessel" | "flight" | "satellite" | "osint";

export type TimedPoint = [isoTime: string, latitude: number, longitude: number];

export interface AircraftPoint {
  timestamp: string;
  lat: number;
  lon: number;
  altitudeFt: number;
}

export interface MaritimePoint {
  timestamp: string;
  lat: number;
  lon: number;
  speedKnots: number;
  courseDeg: number;
}

export interface ScenarioMetadata {
  id: string;
  title: string;
  subtitle: string;
  disclaimer: string;
  region: string;
  center: {
    lat: number;
    lon: number;
  };
}

export interface ScenarioChapter {
  at: string;
  title: string;
  summary: string;
}

export interface ScenarioNote {
  at: string;
  sourceType: string;
  text: string;
}

export interface ScenarioTrack {
  id: string;
  type: TrackType;
  name: string;
  color: string;
  altitude?: number;
  points: TimedPoint[];
}

export interface AircraftTrack {
  id: string;
  callsign: string;
  aircraftType: string;
  sourceLabel: string;
  color?: string;
  points: AircraftPoint[];
}

export interface MaritimeTrack {
  vesselId: string;
  vesselName: string;
  vesselType: string;
  sourceLabel: string;
  color?: string;
  points: MaritimePoint[];
}

export interface ScenarioIncident {
  at: string;
  type: string;
  label: string;
  lat: number;
  lon: number;
}

export interface ReplayScenario {
  metadata: ScenarioMetadata;
  start: string;
  end: string;
  chapters: ScenarioChapter[];
  notes: ScenarioNote[];
  aircraftTracks: AircraftTrack[];
  maritimeTracks: MaritimeTrack[];
  tracks: ScenarioTrack[];
  incidents: ScenarioIncident[];
}
