import { validateFleet } from "../components/ScenarioLoader.js";
import { compareReleaseIdentity, releaseRevision } from "./release.js";
import { hasPrivateFilesystemPath } from "./public-location-text.js";

export const PUBLIC_LOCATION_FIELDS = Object.freeze([
  "locationClassification", "locationState", "locationPrecision", "publicLocationLabel",
  "lastReportedLocation", "position", "uncertaintyArea",
]);

// Location history is sparse, but each entry belongs to an exact status release.
// A correction must never inherit the locations of an earlier revision implicitly.
export function parseLocationHistory(text, history, catalog) {
  if (typeof text !== "string") throw new Error("Location history must be JSON Lines text.");
  if (!text.trim()) return [];
  const identities = new Map(catalog.vessels.map((vessel) => [vessel.id, vessel]));
  const records = text.trim().split("\n").map((line) => JSON.parse(line));
  for (const [index, record] of records.entries()) {
    exactKeys(record, ["schemaVersion", "snapshotDate", "releaseRevision", "releasedAt", "locations"]);
    if (record.schemaVersion !== 1 || !Number.isInteger(record.releaseRevision) || record.releaseRevision < 1) {
      throw new Error("Invalid location snapshot schema or revision.");
    }
    const snapshot = history.find((item) => sameLocationRelease(record, item));
    if (!snapshot || record.releasedAt !== (snapshot.releasedAt ?? null)) {
      throw new Error("Location snapshot must match an exact status release identity.");
    }
    if (index && compareReleaseIdentity(records[index - 1], record) >= 0) {
      throw new Error("Location snapshots must be ordered by date and revision without duplicates.");
    }
    if (!record.locations || typeof record.locations !== "object" || Array.isArray(record.locations)) {
      throw new Error("Location snapshot requires a vessel location map.");
    }
    const vessels = Object.entries(record.locations).map(([id, location]) => {
      if (!Object.hasOwn(snapshot.statuses, id) || !identities.has(id)) {
        throw new Error(`Historical location ${id} is outside its snapshot roster.`);
      }
      exactKeys(location, PUBLIC_LOCATION_FIELDS);
      for (const key of ["publicLocationLabel", "lastReportedLocation"]) {
        if (typeof location[key] !== "string" || /https?:\/\/|www\.|[\p{Cc}\p{Cf}]/u.test(location[key]) || hasPrivateFilesystemPath(location[key])) {
          throw new Error("Historical location labels must be public text without URLs.");
        }
      }
      if (location.position !== null) exactKeys(location.position, ["lat", "lon", "label"]);
      if (location.uncertaintyArea !== null) {
        exactKeys(location.uncertaintyArea, ["representation", "centre", "radiusKm", "label"]);
        exactKeys(location.uncertaintyArea.centre, ["lat", "lon"]);
        if (!Number.isInteger(location.uncertaintyArea.radiusKm)) throw new Error("Invalid regional radius.");
      }
      return { ...identities.get(id), status: snapshot.statuses[id], ...location };
    });
    if (vessels.length) validateFleet({ metadata: { asOfDate: snapshot.snapshotDate }, vessels });
  }
  return records;
}

export function sameLocationRelease(left, right) {
  return left.snapshotDate === right.snapshotDate && releaseRevision(left) === releaseRevision(right);
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error("Historical location contains missing or unexpected public fields.");
  }
}
