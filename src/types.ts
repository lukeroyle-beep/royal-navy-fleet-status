export type TrackType = "vessel" | "flight" | "satellite" | "osint";
export type IncidentCategory = "strike" | "alert" | "closure" | "sighting" | "statement" | "satellite" | "social";
export type ZoneType = "restricted_airspace" | "maritime_warning_area" | "conflict_zone";

export type TimedPoint = [isoTime: string, latitude: number, longitude: number];
export type PolygonPoint = [latitude: number, longitude: number];

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
  timestamp: string;
  lat: number;
  lon: number;
  title: string;
  description: string;
  category: IncidentCategory;
  confidence: "low" | "medium" | "high";
  sourceUrl: string;
}

export interface ScenarioZone {
  id: string;
  type: ZoneType;
  title: string;
  description: string;
  activeFrom: string;
  activeUntil: string;
  polygon: PolygonPoint[];
  sourceLabel: string;
  color?: string;
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
  zones: ScenarioZone[];
}
