import assert from "node:assert/strict";
import fs from "node:fs";

import {
  filterFleetVessels,
  formatPlotEligibilitySummary,
  summarizePlotEligibility,
} from "../src/utils/fleetFilter.js";
import { createPublicSnapshotDataset, parseStatusHistory } from "../src/utils/insights.js";
import { hasPlottablePosition } from "../src/utils/map.js";

const fleet = JSON.parse(
  fs.readFileSync(new URL("../data/royal-navy/vessels.json", import.meta.url), "utf8"),
);
const history = parseStatusHistory(
  fs.readFileSync(new URL("../data/royal-navy/status-history.jsonl", import.meta.url), "utf8"),
);
const historyCatalog = JSON.parse(
  fs.readFileSync(
    new URL("../data/royal-navy/status-history-catalog.json", import.meta.url),
    "utf8",
  ),
);

const currentSummary = summarizePlotEligibility(fleet.vessels);
assert.deepEqual(currentSummary, {
  total: 68,
  pointMapped: 41,
  regional: 26,
  listOnly: 1,
});
assert.equal(
  formatPlotEligibilitySummary(fleet.vessels),
  "41 point-mapped · 27 regional or list-only",
);

const classes = [...new Set(fleet.vessels.map((vessel) => vessel.vesselClass))];
for (const vesselClass of classes) {
  assertFilterMatches(
    fleet.vessels,
    { vesselClass },
    (vessel) => vessel.vesselClass === vesselClass,
    `current class ${vesselClass}`,
  );
}

const zeroMarkerClasses = classes.filter((vesselClass) => {
  const filtered = filterFleetVessels(fleet.vessels, { vesselClass });
  return summarizePlotEligibility(filtered).pointMapped === 0;
});
for (const zeroMarkerClass of zeroMarkerClasses) {
  const filtered = filterFleetVessels(fleet.vessels, { vesselClass: zeroMarkerClass });
  assert.ok(filtered.length > 0, `${zeroMarkerClass} must retain list records.`);
  assert.equal(
    summarizePlotEligibility(filtered).pointMapped,
    0,
    `${zeroMarkerClass} must not fabricate a point marker.`,
  );
}

for (const [filterKey, vesselKey] of [
  ["service", "service"],
  ["status", "status"],
  ["type", "vesselType"],
  ["locationState", "locationState"],
]) {
  for (const value of new Set(fleet.vessels.map((vessel) => vessel[vesselKey]))) {
    assertFilterMatches(
      fleet.vessels,
      { [filterKey]: value },
      (vessel) => vessel[vesselKey] === value,
      `${filterKey} ${value}`,
    );
  }
}

assertFilterMatches(
  fleet.vessels,
  { query: "  dUnCaN  " },
  (vessel) => vessel.name.toLocaleLowerCase("en-GB").includes("duncan"),
  "case-insensitive name search",
);
const pennantFixture = fleet.vessels.find((vessel) => vessel.pennantNumber);
assertFilterMatches(
  fleet.vessels,
  { query: pennantFixture.pennantNumber.toLocaleLowerCase("en-GB") },
  (vessel) => vessel.pennantNumber === pennantFixture.pennantNumber,
  "pennant search",
);

for (const presence of ["uk", "overseas"]) {
  const filtered = filterFleetVessels(fleet.vessels, { presence });
  assert.ok(filtered.length > 0, `${presence} presence filter must return records.`);
  assert.equal(
    filtered.every((vessel) => hasPlottablePosition(vessel) || vessel.locationPrecision === "region"),
    true,
    `${presence} presence must only include records with publishable geographic presence.`,
  );
  assertSummaryMatchesRecords(filtered, `presence ${presence}`);
}

const changedVesselIds = ["hms-duncan", "hms-sutherland"];
assert.deepEqual(
  filterFleetVessels(fleet.vessels, { changedVesselIds }).map((vessel) => vessel.id),
  changedVesselIds,
);
assert.deepEqual(
  filterFleetVessels(fleet.vessels, {
    changedVesselIds,
    status: "Deployed",
  }).map((vessel) => vessel.id),
  ["hms-duncan"],
);
assert.deepEqual(
  filterFleetVessels(fleet.vessels, { service: "Royal Navy", status: "Museum ship" }),
  fleet.vessels.filter(
    (vessel) => vessel.service === "Royal Navy" && vessel.status === "Museum ship",
  ),
);
assert.deepEqual(filterFleetVessels(fleet.vessels, { query: "no such vessel" }), []);

for (const snapshot of history.filter(
  ({ snapshotDate }) => snapshotDate !== fleet.metadata.asOfDate,
)) {
  const historicalFleet = createPublicSnapshotDataset({
    currentFleet: fleet,
    history,
    catalog: historyCatalog,
    snapshotDate: snapshot.snapshotDate,
  });
  assert.equal(
    summarizePlotEligibility(historicalFleet.vessels).pointMapped,
    0,
    `${snapshot.snapshotDate} must remain a status-only historical snapshot.`,
  );
  for (const vesselClass of new Set(historicalFleet.vessels.map((vessel) => vessel.vesselClass))) {
    assertFilterMatches(
      historicalFleet.vessels,
      { vesselClass },
      (vessel) => vessel.vesselClass === vesselClass,
      `historical class ${vesselClass} on ${snapshot.snapshotDate}`,
    );
  }
}

console.log("Fleet filter and plot-eligibility regression tests passed.");

function assertFilterMatches(vessels, filters, predicate, label) {
  const filtered = filterFleetVessels(vessels, filters);
  const expected = vessels.filter(predicate);
  assert.deepEqual(
    filtered.map((vessel) => vessel.id),
    expected.map((vessel) => vessel.id),
    `${label} returned the wrong records.`,
  );
  assertSummaryMatchesRecords(filtered, label);
}

function assertSummaryMatchesRecords(vessels, label) {
  const summary = summarizePlotEligibility(vessels);
  assert.equal(summary.total, vessels.length, `${label} total summary is inconsistent.`);
  assert.equal(
    summary.pointMapped,
    vessels.filter(hasPlottablePosition).length,
    `${label} point-marker summary is inconsistent.`,
  );
  assert.equal(
    summary.pointMapped + summary.regional + summary.listOnly,
    vessels.length,
    `${label} plot categories must cover every filtered record.`,
  );
}
