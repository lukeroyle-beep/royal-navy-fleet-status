import assert from "node:assert/strict";
import fs from "node:fs";

import { insightsMatchDataset } from "../src/components/FleetInsightsLoader.js";
import {
  formatDatasetReleaseLabel,
  formatPublicationFreshness,
  formatPublicationChangeLabels,
} from "../src/utils/release.js";
import { publicationReleaseFields } from "./lib/publication-release.mjs";
import { buildStatusSnapshot } from "./lib/status-snapshot.mjs";

import {
  HISTORICAL_LOCATION_EMPTY_LABEL,
  compareCurrentWithPreviousSnapshot,
  createPublicSnapshotDataset,
  formatSignedDelta,
  getClassSnapshotSummary,
  getEvidenceFreshness,
  getVesselAvailability,
  getVesselChange,
  getVesselPublicTimeline,
  listPublicSnapshotDates,
  parsePhysicalStatusHistory,
  parseStatusHistory,
  resolvePublicSnapshotDate,
  shortClassName,
  validatePublicationChanges,
  validateStatusHistoryCatalog,
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
const historyCatalog = validateStatusHistoryCatalog(
  JSON.parse(
    fs.readFileSync(
      new URL("../data/royal-navy/status-history-catalog.json", import.meta.url),
      "utf8",
    ),
  ),
  history,
);

assert.equal(
  insightsMatchDataset({ changes, history }, fleet.metadata),
  true,
);
assert.equal(
  insightsMatchDataset({ changes, history }, "2026-08-10"),
  false,
);
assert.equal(
  insightsMatchDataset(
    { changes, history: history.slice(0, -1) },
    fleet.metadata,
  ),
  false,
);

assert.ok(history.length >= 2);
assert.ok(history[0].snapshotDate < history.at(-1).snapshotDate);
assert.equal(history.at(-1).snapshotDate, fleet.metadata.asOfDate);
assert.equal(Object.keys(history.at(-1).statuses).length, fleet.vessels.length);
assert.deepEqual(listPublicSnapshotDates(history), [
  "2026-07-31",
  "2026-08-09",
  "2026-08-12",
  "2026-08-23",
  "2026-08-31",
]);
assert.equal(resolvePublicSnapshotDate(history, "2026-08-12"), "2026-08-12");
assert.equal(
  resolvePublicSnapshotDate(history, "obsolete-snapshot", fleet.metadata.asOfDate),
  fleet.metadata.asOfDate,
);

const historicalDataset = createPublicSnapshotDataset({
  currentFleet: fleet,
  history,
  catalog: historyCatalog,
  snapshotDate: "2026-08-12",
});
assert.equal(historicalDataset.metadata.asOfDate, "2026-08-12");
assert.equal(historicalDataset.vessels.length, Object.keys(history[2].statuses).length);
const historicalDuncan = historicalDataset.vessels.find((vessel) => vessel.id === "hms-duncan");
assert.equal(historicalDuncan.status, "Available");
assert.equal(historicalDuncan.publicLocationLabel, HISTORICAL_LOCATION_EMPTY_LABEL);
assert.equal(historicalDuncan.lastReportedLocation, HISTORICAL_LOCATION_EMPTY_LABEL);
assert.equal(historicalDuncan.locationState, "no_recent_information");
assert.equal(historicalDuncan.locationPrecision, "none");
assert.equal(historicalDuncan.position, null);
assert.equal(historicalDuncan.uncertaintyArea, null);
assert.equal(
  historicalDataset.vessels.some((vessel) => vessel.id === "hms-richmond"),
  true,
  "The historical roster must retain records present at that effective date.",
);
assert.deepEqual(
  createPublicSnapshotDataset({
    currentFleet: fleet,
    history,
    catalog: historyCatalog,
    snapshotDate: "invalid",
  }),
  fleet,
  "An invalid snapshot must fail safely to the current public dataset.",
);

const snapshotComparison = compareCurrentWithPreviousSnapshot(
  history,
  historyCatalog,
  fleet.metadata.asOfDate,
);
assert.equal(snapshotComparison.previousSnapshotDate, "2026-08-23");
assert.equal(snapshotComparison.currentSnapshotDate, "2026-08-31");
assert.equal(snapshotComparison.changes.length, 0);
assert.deepEqual(snapshotComparison.changedCurrentVesselIds, []);
assert.deepEqual(getVesselPublicTimeline(history, "hms-duncan"), [
  { effectiveDate: "2026-07-31", status: "Available" },
  { effectiveDate: "2026-08-09", status: "Available" },
  { effectiveDate: "2026-08-12", status: "Available" },
  { effectiveDate: "2026-08-23", status: "Deployed" },
  { effectiveDate: "2026-08-31", status: "Deployed" },
]);
assert.deepEqual(
  getVesselPublicTimeline(history, "hms-duncan", { upToDate: "2026-08-12" }).at(-1),
  { effectiveDate: "2026-08-12", status: "Available" },
);
assert.deepEqual(getVesselPublicTimeline(history, "not-a-public-vessel"), []);
assert.throws(
  () =>
    validateStatusHistoryCatalog(
      {
        ...historyCatalog,
        vessels: historyCatalog.vessels.map((vessel, index) =>
          index === 0 ? { ...vessel, sourceUrl: "https://invalid.test" } : vessel,
        ),
      },
      history,
    ),
  /unexpected fields/,
);

assert.equal(changes.previousAsOfDate, "2026-08-23");
assert.equal(changes.currentAsOfDate, fleet.metadata.asOfDate);
assert.equal(changes.previousReleaseRevision ?? 1, 4);
assert.equal(changes.currentReleaseRevision ?? 1, 1);
assert.equal(changes.changes.length, 13);
assert.equal(changes.counts.status, 0);
assert.equal(changes.counts.location, 13);
assert.equal(changes.counts.mapping, 5);
assert.equal(changes.changes.some((change) => change.vesselId === "hms-duncan"), true);
assert.equal(changes.changes.some((change) => change.vesselId === "rfa-tideforce"), true);
assert.equal(changes.changes.some((change) => change.vesselId === "hms-hurworth"), false);
assert.equal(
  formatDatasetReleaseLabel(fleet.metadata),
  "31 August 2026",
);
assert.equal(formatPublicationFreshness(fleet.metadata), "Published 31 Aug 2026");
assert.deepEqual(formatPublicationChangeLabels(changes), {
  count: "23 Aug · 13 vessels",
  summary:
    "13 vessels changed between 23 August 2026 and 31 August 2026.",
});
assert.equal(formatDatasetReleaseLabel({ asOfDate: "2026-08-23" }), "23 August 2026");
assert.equal(
  formatDatasetReleaseLabel({
    asOfDate: "2026-08-30",
    releaseRevision: 1,
    releasedAt: "2026-08-30T08:00:00Z",
  }),
  "30 August 2026",
);
assert.deepEqual(
  formatPublicationChangeLabels({
    previousAsOfDate: "2026-08-12",
    currentAsOfDate: "2026-08-23",
    changes: [{}, {}],
  }),
  {
    count: "12 Aug · 2 vessels",
    summary: "2 vessels changed between 12 August 2026 and 23 August 2026.",
  },
);
assert.equal(
  changes.currentMappedCount,
  fleet.vessels.filter((vessel) => vessel.position || vessel.uncertaintyArea).length,
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

const correctedHistoryText = [
  {
    schemaVersion: 1,
    snapshotDate: "2026-08-16",
    statuses: { x: "Available" },
  },
  {
    schemaVersion: 1,
    snapshotDate: "2026-08-23",
    statuses: { x: "Available" },
  },
  {
    schemaVersion: 2,
    snapshotDate: "2026-08-23",
    releaseRevision: 2,
    releasedAt: "2026-08-23T20:15:00+01:00",
    correctionReason: "Late official arrival report incorporated.",
    statuses: { x: "Deployed" },
  },
].map(JSON.stringify).join("\n");
const physicalCorrectedHistory = parsePhysicalStatusHistory(correctedHistoryText);
const correctedHistory = parseStatusHistory(correctedHistoryText);
assert.equal(physicalCorrectedHistory.length, 3);
assert.equal(correctedHistory.length, 2);
assert.equal(correctedHistory.at(-1).releaseRevision, 2);
assert.equal(correctedHistory.at(-1).statuses.x, "Deployed");
assert.equal(
  getClassSnapshotSummary(
    [{ id: "x", vesselClass: "Test class", status: "Deployed" }],
    "Test class",
    correctedHistory,
    "2026-08-23",
  ).rolling.observationCount,
  2,
);

const correctedChanges = validatePublicationChanges({
  schemaVersion: 2,
  previousAsOfDate: "2026-08-23",
  currentAsOfDate: "2026-08-23",
  previousReleaseRevision: 1,
  currentReleaseRevision: 2,
  previousReleasedAt: null,
  currentReleasedAt: "2026-08-23T20:15:00+01:00",
  counts: {},
  changes: [],
});
const correctedMetadata = {
  asOfDate: "2026-08-23",
  releaseRevision: 2,
  releasedAt: "2026-08-23T20:15:00+01:00",
};
assert.deepEqual(
  publicationReleaseFields({ asOfDate: "2026-08-23" }, correctedMetadata),
  {
    schemaVersion: 2,
    previousAsOfDate: "2026-08-23",
    currentAsOfDate: "2026-08-23",
    previousReleaseRevision: 1,
    currentReleaseRevision: 2,
    previousReleasedAt: null,
    currentReleasedAt: "2026-08-23T20:15:00+01:00",
  },
);
assert.throws(
  () => publicationReleaseFields(correctedMetadata, correctedMetadata),
  /must follow the base release identity/,
);
assert.throws(
  () =>
    publicationReleaseFields(
      correctedMetadata,
      {
        asOfDate: "2026-08-30",
        releaseRevision: 2,
        releasedAt: "2026-08-30T08:00:00Z",
      },
    ),
  /new dataset date.*releaseRevision 1/i,
);
assert.equal(
  insightsMatchDataset({ changes: correctedChanges, history: correctedHistory }, correctedMetadata),
  true,
);
assert.equal(
  insightsMatchDataset(
    { changes: correctedChanges, history: correctedHistory },
    { ...correctedMetadata, releaseRevision: 1 },
  ),
  false,
);

const correctionFleet = {
  metadata: correctedMetadata,
  vessels: [{ id: "x", name: "Test vessel", status: "Deployed" }],
};
assert.throws(
  () => buildStatusSnapshot({ fleet: correctionFleet, snapshots: physicalCorrectedHistory.slice(0, -1) }),
  /--correction.*--reason/,
);
assert.throws(
  () =>
    buildStatusSnapshot({
      fleet: correctionFleet,
      snapshots: physicalCorrectedHistory.slice(0, -1),
      correction: true,
    }),
  /--reason/,
);
assert.deepEqual(
  buildStatusSnapshot({
    fleet: correctionFleet,
    snapshots: physicalCorrectedHistory.slice(0, -1),
    correction: true,
    reason: "  Late official arrival report incorporated.  ",
  }),
  {
    schemaVersion: 2,
    snapshotDate: "2026-08-23",
    releaseRevision: 2,
    releasedAt: "2026-08-23T20:15:00+01:00",
    correctionReason: "Late official arrival report incorporated.",
    statuses: { x: "Deployed" },
  },
);
assert.throws(
  () =>
    buildStatusSnapshot({
      fleet: { ...correctionFleet, metadata: { ...correctedMetadata, releaseRevision: 3 } },
      snapshots: physicalCorrectedHistory.slice(0, -1),
      correction: true,
      reason: "Skipped revision",
    }),
  /increment.*exactly one/,
);
assert.equal(
  buildStatusSnapshot({
    fleet: {
      metadata: {
        asOfDate: "2026-08-30",
        releaseRevision: 1,
        releasedAt: "2026-08-30T08:00:00Z",
      },
      vessels: correctionFleet.vessels,
    },
    snapshots: physicalCorrectedHistory,
  }).schemaVersion,
  2,
);
assert.throws(
  () =>
    buildStatusSnapshot({
      fleet: {
        metadata: {
          asOfDate: "2026-08-30",
          releaseRevision: 1,
          releasedAt: "2026-08-30T08:00:00Z",
        },
        vessels: correctionFleet.vessels,
      },
      snapshots: physicalCorrectedHistory,
      correction: true,
      reason: "Not a same-day correction",
    }),
  /only valid for the latest snapshot date/,
);
assert.throws(
  () =>
    buildStatusSnapshot({
      fleet: {
        metadata: { asOfDate: "2026-08-30" },
        vessels: correctionFleet.vessels,
      },
      snapshots: physicalCorrectedHistory,
    }),
  /cannot return to the legacy format/,
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
      '{"schemaVersion":2,"snapshotDate":"2026-08-23","releaseRevision":1,' +
        '"releasedAt":"2026-08-23T08:00:00Z","statuses":{"x":"Available"}}\n' +
        '{"schemaVersion":1,"snapshotDate":"2026-08-30","statuses":{"x":"Available"}}',
    ),
  /cannot return to the legacy schema/,
);
assert.throws(
  () =>
    parseStatusHistory(
      '{"schemaVersion":1,"snapshotDate":"2026-08-09","statuses":{"x":"Available"}}\n' +
        '{"schemaVersion":1,"snapshotDate":"2026-08-02","statuses":{"x":"Available"}}',
    ),
  /ordered by date and release revision/,
);
assert.throws(
  () =>
    parseStatusHistory(
      '{"schemaVersion":1,"snapshotDate":"2026-08-09","statuses":{"x":"Ready-ish"}}',
    ),
  /invalid status/,
);
assert.throws(
  () =>
    parseStatusHistory(
      '{"schemaVersion":1,"snapshotDate":"2026-08-23","statuses":{"x":"Available"}}\n' +
        '{"schemaVersion":2,"snapshotDate":"2026-08-23","releaseRevision":2,' +
        '"releasedAt":"2026-08-23T20:15:00Z","statuses":{"x":"Deployed"}}',
    ),
  /v2 correction with a reason/,
);
assert.throws(
  () =>
    parseStatusHistory(
      '{"schemaVersion":1,"snapshotDate":"2026-08-23","statuses":{"x":"Available"}}\n' +
        '{"schemaVersion":2,"snapshotDate":"2026-08-23","releaseRevision":3,' +
        '"releasedAt":"2026-08-23T20:15:00Z","correctionReason":"Skipped revision",' +
        '"statuses":{"x":"Deployed"}}',
    ),
  /advance by exactly one/,
);
assert.throws(
  () =>
    parseStatusHistory(
      '{"schemaVersion":1,"snapshotDate":"2026-08-23","statuses":{"x":"Available"},' +
        '"sourceUrl":"https://invalid.test"}',
    ),
  /invalid/,
);
assert.throws(
  () =>
    parseStatusHistory(
      '{"schemaVersion":2,"snapshotDate":"2026-08-23","releaseRevision":1,' +
        '"releasedAt":"2026-08-23","statuses":{"x":"Available"}}',
    ),
  /invalid/,
);
assert.throws(() => validatePublicationChanges({ schemaVersion: 1 }), /invalid/);
assert.throws(
  () =>
    validatePublicationChanges({
      ...correctedChanges,
      currentReleaseRevision: 1,
    }),
  /release identities are invalid/,
);
assert.throws(
  () =>
    validatePublicationChanges({
      ...correctedChanges,
      previousReleaseRevision: 2,
      currentReleaseRevision: 3,
      previousReleasedAt: null,
    }),
  /release identities are invalid/,
);

console.log("Fleet insights tests passed.");
