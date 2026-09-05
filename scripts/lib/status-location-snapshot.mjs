import { PUBLIC_LOCATION_FIELDS, parseLocationHistory, sameLocationRelease } from "../../src/utils/location-history.js";
import { readReleaseMetadata } from "../../src/utils/release.js";

export function buildStatusLocationSnapshot(fleet) {
  const release = readReleaseMetadata(fleet.metadata);
  return {
    schemaVersion: 1,
    snapshotDate: release.asOfDate,
    releaseRevision: release.releaseRevision,
    releasedAt: release.releasedAt,
    locations: Object.fromEntries(fleet.vessels.map((vessel) => [vessel.id,
      Object.fromEntries(PUBLIC_LOCATION_FIELDS.map((key) => [key, structuredClone(vessel[key])])),
    ])),
  };
}

// Reuse a prepared identical location line after an interrupted two-ledger append.
// A mismatched line is never overwritten or treated as a successful retry.
export function appendLocationSnapshot(text, record, history, catalog) {
  const existing = parseLocationHistory(text, history, catalog);
  const prior = existing.find((item) => sameLocationRelease(item, record));
  if (prior && JSON.stringify(prior) !== JSON.stringify(record)) {
    throw new Error("An immutable location snapshot already exists with different content.");
  }
  const result = prior ? text : `${text.trimEnd() ? `${text.trimEnd()}\n` : ""}${JSON.stringify(record)}\n`;
  parseLocationHistory(result, history, catalog);
  return result;
}
