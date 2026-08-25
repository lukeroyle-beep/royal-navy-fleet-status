import assert from "node:assert/strict";
import fs from "node:fs";

import {
  availabilityClasses,
  calculateAvailabilityForRange,
  calculateTwelveMonthAvailability,
  parseAvailabilityHistory,
  parsePhysicalAvailabilityHistory,
} from "../src/utils/availability-history.js";
import {
  buildWeeklyAvailabilityObservation,
  latestSunday,
} from "./lib/availability-observation.mjs";

const storedText = fs.readFileSync(
  new URL("../data/royal-navy/availability-history.jsonl", import.meta.url),
  "utf8",
);
const workflow = fs.readFileSync(
  new URL("../.github/workflows/weekly-availability-history.yml", import.meta.url),
  "utf8",
);
const design = fs.readFileSync(
  new URL("../docs/weekly-availability-history.md", import.meta.url),
  "utf8",
);
const publicDataCopy = fs.readFileSync(
  new URL("./copy-fleet-data.mjs", import.meta.url),
  "utf8",
);
const publicApp = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const storedHistory = parseAvailabilityHistory(storedText);
assert.equal(storedHistory.length, 1);
assert.equal(storedHistory[0].weekEnding, "2026-08-23");
assert.equal(Object.keys(storedHistory[0].observations).length, 68);
assert.equal(
  calculateTwelveMonthAvailability(storedHistory, { asOfDate: "2026-08-23" }).state,
  "insufficient_history",
);
assert.equal(
  calculateTwelveMonthAvailability(storedHistory, { asOfDate: "2026-08-23" })
    .availabilityPercentage,
  null,
);
assert.match(workflow, /cron: "30 6 \* \* 1"/);
assert.match(workflow, /persist-credentials: false/);
assert.match(workflow, /permissions:\s+contents: read/s);
assert.match(workflow, /contents: write/);
assert.match(workflow, /pull-requests: write/);
assert.match(workflow, /actions\/upload-artifact@v4/);
assert.match(workflow, /actions\/download-artifact@v4/);
assert.match(workflow, /gh pr create/);
assert.match(workflow, /changed_files.*availability-history\.jsonl/s);
assert.doesNotMatch(workflow, /git push[^\n]*\bmain\b/);
assert.match(design, /fails and writes nothing/);
assert.match(design, /no historic availability percentage is displayed yet/);
assert.doesNotMatch(publicDataCopy, /availability-history\.jsonl/);
assert.doesNotMatch(publicApp, /availability-history|calculateTwelveMonthAvailability/);
assert.deepEqual(availabilityClasses(storedHistory).slice(0, 3), [
  "Archer class",
  "Astute class",
  "Bay class",
]);

const syntheticHistory = Array.from({ length: 52 }, (_, index) => {
  const weekEnding = new Date("2025-08-31T00:00:00Z");
  weekEnding.setUTCDate(weekEnding.getUTCDate() + index * 7);
  const snapshotDate = weekEnding.toISOString().slice(0, 10);
  const releasedAt = `${snapshotDate}T12:00:00Z`;
  const recordedAtDate = new Date(releasedAt);
  recordedAtDate.setUTCDate(recordedAtDate.getUTCDate() + 1);
  return {
    schemaVersion: 1,
    weekEnding: snapshotDate,
    revision: 1,
    recordedAt: recordedAtDate.toISOString(),
    observationMethod: "reviewed-public-status-v1",
    sourceRelease: { snapshotDate, releaseRevision: 1, releasedAt },
    observations: {
      a: { vesselClass: "Alpha class", status: index < 26 ? "Available" : "In re-fit" },
      b: { vesselClass: "Alpha class", status: "Unknown" },
      c: { vesselClass: "Beta class", status: "Deployed" },
      museum: { vesselClass: "Heritage", status: "Museum ship" },
    },
  };
});
const syntheticText = syntheticHistory.map(JSON.stringify).join("\n");
const parsedSynthetic = parseAvailabilityHistory(syntheticText);
const fleetYear = calculateTwelveMonthAvailability(parsedSynthetic, { asOfDate: "2026-08-23" });
assert.equal(fleetYear.state, "ready");
assert.equal(fleetYear.observationCount, 52);
assert.equal(fleetYear.spanDays, 357);
assert.equal(fleetYear.eligibleVesselWeeks, 156);
assert.equal(fleetYear.knownVesselWeeks, 104);
assert.equal(fleetYear.activeVesselWeeks, 78);
assert.equal(fleetYear.unknownVesselWeeks, 52);
assert.equal(fleetYear.availabilityPercentage, 75);
assert.equal(fleetYear.coveragePercentage.toFixed(1), "66.7");

const alphaYear = calculateTwelveMonthAvailability(parsedSynthetic, {
  asOfDate: "2026-08-23",
  vesselClass: "Alpha class",
});
assert.equal(alphaYear.state, "ready");
assert.equal(alphaYear.availabilityPercentage, 50);
assert.equal(alphaYear.coveragePercentage, 50);
assert.equal(
  calculateTwelveMonthAvailability(parsedSynthetic.slice(1), { asOfDate: "2026-08-23" }).state,
  "insufficient_history",
);
assert.equal(
  calculateTwelveMonthAvailability(parsedSynthetic.slice(1), { asOfDate: "2026-08-23" })
    .availabilityPercentage,
  null,
);
assert.equal(
  calculateAvailabilityForRange(parsedSynthetic, {
    from: "2026-08-02",
    to: "2026-08-23",
    vesselClass: "Beta class",
  }).availabilityPercentage,
  100,
);

const correctedRecords = [
  syntheticHistory[0],
  {
    ...syntheticHistory[0],
    revision: 2,
    recordedAt: "2025-09-02T12:00:00Z",
    correctionReason: "Late reviewed public status correction.",
    sourceRelease: {
      snapshotDate: "2025-08-31",
      releaseRevision: 2,
      releasedAt: "2025-09-01T15:00:00Z",
    },
    observations: {
      ...syntheticHistory[0].observations,
      a: { vesselClass: "Alpha class", status: "Deployed" },
    },
  },
];
assert.equal(parsePhysicalAvailabilityHistory(correctedRecords.map(JSON.stringify).join("\n")).length, 2);
assert.equal(parseAvailabilityHistory(correctedRecords.map(JSON.stringify).join("\n")).length, 1);
assert.equal(
  parseAvailabilityHistory(correctedRecords.map(JSON.stringify).join("\n"))[0].observations.a.status,
  "Deployed",
);

const unsafeRecord = structuredClone(syntheticHistory[0]);
unsafeRecord.observations.a.position = { lat: 50, lon: -1 };
assert.throws(
  () => parseAvailabilityHistory(JSON.stringify(unsafeRecord)),
  /line 1 is invalid/,
);
assert.throws(
  () => parseAvailabilityHistory(JSON.stringify({ ...syntheticHistory[0], evidence: [] })),
  /line 1 is invalid/,
);

const sampleFleet = {
  metadata: {
    asOfDate: "2026-08-23",
    releaseRevision: 2,
    releasedAt: "2026-08-23T18:00:00Z",
  },
  vessels: [
    { id: "a", name: "A", vesselClass: "Alpha class", status: "Available" },
    { id: "b", name: "B", vesselClass: "Beta class", status: "Unknown" },
  ],
};
const sampleStatus = {
  schemaVersion: 2,
  snapshotDate: "2026-08-23",
  releaseRevision: 2,
  releasedAt: "2026-08-23T18:00:00Z",
  correctionReason: "Reviewed correction.",
  statuses: { a: "Available", b: "Unknown" },
};
const built = buildWeeklyAvailabilityObservation({
  fleet: sampleFleet,
  statusSnapshots: [sampleStatus],
  availabilityRecords: [],
  weekEnding: "2026-08-23",
  recordedAt: "2026-08-24T06:30:00Z",
});
assert.equal(built.revision, 1);
assert.deepEqual(built.observations.a, { vesselClass: "Alpha class", status: "Available" });
assert.equal(
  buildWeeklyAvailabilityObservation({
    fleet: sampleFleet,
    statusSnapshots: [sampleStatus],
    availabilityRecords: [built],
    weekEnding: "2026-08-23",
    recordedAt: "2026-08-24T07:30:00Z",
  }),
  null,
);
assert.equal(
  buildWeeklyAvailabilityObservation({
    fleet: sampleFleet,
    statusSnapshots: [sampleStatus],
    availabilityRecords: [],
    weekEnding: "2026-08-30",
    recordedAt: "2026-08-31T06:30:00Z",
  }),
  null,
);
assert.equal(latestSunday(new Date("2026-08-25T12:00:00Z")), "2026-08-23");

console.log("Weekly availability history, correction, safety and derivation tests passed.");
