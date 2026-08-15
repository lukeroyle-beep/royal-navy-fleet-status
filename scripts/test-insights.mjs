import assert from "node:assert/strict";
import fs from "node:fs";

import { insightsMatchDataset } from "../src/components/FleetInsightsLoader.js";

import {
  formatSignedDelta,
  getClassSnapshotSummary,
  getEvidenceFreshness,
  getVesselAvailability,
  getVesselChange,
  parseStatusHistory,
  shortClassName,
  validatePublicationChanges,
} from "../src/utils/insights.js";

const fleet = JSON.parse(
  fs.readFileSync(new URL("../data/royal-navy/vessels.json", import.meta.url), "utf8"),
);
const history = parseStatusHistory(
  fs.readFileSync(new URL("../data/royal-navy/status-history.jsonl", import.meta.url), "utf8"),
);
const changes = validatePublicationChanges(
  JSON.parse(
    fs.readFileSync(new URL("../data/royal-navy/publication-changes.json", import.meta.url), "utf8"),
  ),
);

assert.equal(
  insightsMatchDataset({ changes, history }, fleet.metadata.asOfDate),
  true,
);
assert.equal(
  insightsMatchDataset({ changes, history }, "2026-08-10"),
  false,
);
assert.equal(
  insightsMatchDataset(
    { changes, history: history.slice(0, -1) },
    fleet.metadata.asOfDate,
  ),
  false,
);

assert.ok(history.length >= 2);
assert.ok(history[0].snapshotDate < history.at(-1).snapshotDate);
assert.equal(history.at(-1).snapshotDate, fleet.metadata.asOfDate);
assert.equal(Object.keys(history.at(-1).statuses).length, fleet.vessels.length);

assert.ok(changes.previousAsOfDate < changes.currentAsOfDate);
assert.equal(changes.currentAsOfDate, fleet.metadata.asOfDate);
assert.equal(
  changes.currentMappedCount,
  fleet.vessels.filter((vessel) => vessel.position || vessel.symbolicPosition).length,
);
for (const category of ["status", "location", "mapping", "marker", "evidence"]) {
  assert.equal(
    changes.counts[category],
    changes.changes.filter((change) => change.categories.includes(category)).length,
  );
}

const sampleVessels = [
  { id: "active", vesselClass: "Test class", status: "Available" },
  { id: "deployed", vesselClass: "Test class", status: "Deployed" },
  { id: "refit", vesselClass: "Test class", status: "In re-fit" },
  { id: "unknown", vesselClass: "Test class", status: "Unknown" },
  { id: "museum", vesselClass: "Test class", status: "Museum ship" },
];
const sampleHistory = [
  {
    schemaVersion: 1,
    snapshotDate: "2026-08-02",
    statuses: {
      active: "In re-fit",
      deployed: "Deployed",
      refit: "In re-fit",
      unknown: "Unknown",
      museum: "Museum ship",
    },
  },
  {
    schemaVersion: 1,
    snapshotDate: "2026-08-09",
    statuses: Object.fromEntries(sampleVessels.map((vessel) => [vessel.id, vessel.status])),
  },
];
const type45 = getClassSnapshotSummary(
  sampleVessels,
  "Test class",
  sampleHistory,
  "2026-08-09",
);
assert.equal(type45.vesselCount, 5);
assert.equal(type45.eligibleCount, 4);
assert.equal(type45.active, 2);
assert.equal(type45.activePercentage, 50);
assert.equal(type45.activeDelta, 1);
assert.equal(type45.percentageDelta, 25);
assert.equal(type45.unknown, 1);
assert.equal(type45.rolling.observationCount, 2);
assert.equal(type45.rolling.mature, false);

assert.deepEqual(getVesselAvailability(sampleHistory, sampleVessels[0], "2026-08-09"), {
  availabilityLabel: "History building · 2/52 observations",
  coverageLabel: "Known status · 2/2 observations",
  mature: false,
});
assert.equal(getEvidenceFreshness("2026-08-07", "2026-08-09"), "2 days old");
assert.equal(getEvidenceFreshness("2026-08-08", "2026-08-09"), "1 day old");
assert.equal(getEvidenceFreshness("2026-08-09", "2026-08-09"), "Updated on dataset date");
assert.equal(
  getEvidenceFreshness("2026-08-10", "2026-08-09"),
  "Evidence date is after dataset date",
);
assert.equal(getEvidenceFreshness(null, "2026-08-09"), "No dated public location");

const sampleChanges = {
  changes: [
    {
      vesselId: "active",
      categories: ["status"],
      items: [{ kind: "status", label: "Status", before: "In re-fit", after: "Available" }],
    },
  ],
};
assert.deepEqual(getVesselChange(sampleChanges, "active"), sampleChanges.changes[0]);
assert.equal(getVesselChange(sampleChanges, "missing"), null);

assert.deepEqual(getVesselAvailability(sampleHistory, sampleVessels.at(-1), "2026-08-09"), {
  availabilityLabel: "Not applicable",
  coverageLabel: "Excluded from fleet availability",
  mature: false,
});

assert.equal(formatSignedDelta(2), "↑2");
assert.equal(formatSignedDelta(-2.5, "pp"), "↓2.5pp");
assert.equal(formatSignedDelta(0), "");
assert.equal(shortClassName("Type 45 / Daring class"), "Type 45");
assert.equal(shortClassName("River class"), "River");

const syntheticVessel = { id: "test-vessel", status: "Available" };
const matureHistory = Array.from({ length: 52 }, (_, index) => {
  const date = new Date("2026-08-09T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - (51 - index) * 7);
  return {
    schemaVersion: 1,
    snapshotDate: date.toISOString().slice(0, 10),
    statuses: { "test-vessel": index < 26 ? "Available" : "In re-fit" },
  };
});
assert.deepEqual(getVesselAvailability(matureHistory, syntheticVessel, "2026-08-09"), {
  availabilityLabel: "50%",
  coverageLabel: "Status coverage · 100%",
  mature: true,
});
const crowdedHistory = Array.from({ length: 52 }, (_, index) => ({
  schemaVersion: 1,
  snapshotDate: new Date(Date.UTC(2026, 5, 19 + index)).toISOString().slice(0, 10),
  statuses: { "test-vessel": "Available" },
}));
assert.equal(
  getVesselAvailability(crowdedHistory, syntheticVessel, "2026-08-09").mature,
  false,
);

assert.throws(() => parseStatusHistory("not json"), /not valid JSON/);
assert.throws(
  () =>
    parseStatusHistory(
      '{"schemaVersion":1,"snapshotDate":"2026-02-30","statuses":{"x":"Available"}}',
    ),
  /invalid/,
);
assert.throws(
  () =>
    parseStatusHistory(
      '{"schemaVersion":1,"snapshotDate":"2026-08-09","statuses":{"x":"Available"}}\n' +
        '{"schemaVersion":1,"snapshotDate":"2026-08-02","statuses":{"x":"Available"}}',
    ),
  /ordered by unique date/,
);
assert.throws(
  () =>
    parseStatusHistory(
      '{"schemaVersion":1,"snapshotDate":"2026-08-09","statuses":{"x":"Ready-ish"}}',
    ),
  /invalid status/,
);
assert.throws(() => validatePublicationChanges({ schemaVersion: 1 }), /invalid/);

console.log("Fleet insights tests passed.");
