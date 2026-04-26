export type TrackType = "vessel" | "flight" | "satellite" | "osint";

export type TimedPoint = [isoTime: string, latitude: number, longitude: number];

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
  tracks: ScenarioTrack[];
  incidents: ScenarioIncident[];
}
