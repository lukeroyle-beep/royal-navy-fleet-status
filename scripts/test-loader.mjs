import assert from "node:assert/strict";
import fs from "node:fs";

import { validateFleet } from "../src/components/ScenarioLoader.js";
import { formatLocationClassification } from "../src/components/EventDetailsPanel.js";
import { getActiveFleetSummary, getFleetStatusSummary } from "../src/utils/fleet.js";

const path = new URL("../data/royal-navy/vessels.json", import.meta.url);
const dataset = JSON.parse(fs.readFileSync(path, "utf8"));
const page = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const detailsPanel = fs.readFileSync(new URL("../src/components/EventDetailsPanel.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

assert.match(page, /<h1 id="mapTitle">Royal Navy Fleet Status<\/h1>/);
assert.doesNotMatch(page, /<h1 id="mapTitle">Royal Navy Fleet status<\/h1>/);
assert.equal(validateFleet(dataset).vessels.length, 71);
assert.equal(
  dataset.vessels.filter(
    (vessel) => ["mapped", "approximate", "withheld"].includes(vessel.locationClassification),
  ).length,
  71,
);
assert.equal(dataset.vessels.filter((vessel) => vessel.locationClassification === "unknown").length, 0);
assert.throws(() => validateFleet({ metadata: {}, vessels: [] }), /no vessel records/i);
assert.equal(formatLocationClassification("approximate"), "Approximate port or area");
assert.equal(formatLocationClassification("withheld"), "Withheld · symbolic marker");

const activeFleet = getActiveFleetSummary(dataset.vessels);
assert.equal(activeFleet.total, 51);
assert.equal(activeFleet.percentage.toFixed(1), "71.8");
assert.deepEqual(getFleetStatusSummary(dataset.vessels), {
  total: 71,
  deployed: 16,
  inRefit: 12,
  unknown: 7,
});

const victory = dataset.vessels.find((vessel) => vessel.id === "hms-victory");
assert.equal(victory.locationClassification, "mapped");
assert.deepEqual(victory.position, {
  lat: 50.801468,
  lon: -1.1095,
  label: "HMS Victory, Portsmouth Historic Dockyard",
});
for (const field of ["source", "evidenceCheckedDate", "locationEvidenceDate", "evidenceClassification"]) {
  assert.equal(Object.hasOwn(victory, field), false, `Public record must not expose ${field}.`);
}
assert.doesNotMatch(detailsPanel, /Supporting source|vessel\.source|Location evidence date|Evidence freshness/i);
assert.doesNotMatch(styles, /\.source-link/);

const unknownWithCoordinates = structuredClone(dataset);
const unknown = unknownWithCoordinates.vessels.find((vessel) => vessel.locationClassification === "approximate");
unknown.locationClassification = "unknown";
unknown.unmappedReason = "Synthetic unknown record for validation.";
unknown.position = { lat: 0, lon: 0, label: "Invalid inferred point" };
assert.throws(() => validateFleet(unknownWithCoordinates), /must not contain coordinates/i);

const accidentallyExposedSource = structuredClone(dataset);
accidentallyExposedSource.vessels[0].source = { label: "Must stay internal", url: "https://example.invalid" };
assert.throws(() => validateFleet(accidentallyExposedSource), /exposes internal provenance field source/i);

const invalidDatasetDate = structuredClone(dataset);
invalidDatasetDate.metadata.asOfDate = "2026-02-30";
assert.throws(() => validateFleet(invalidDatasetDate), /invalid dataset date/i);

const invalidOperationalStatus = structuredClone(dataset);
invalidOperationalStatus.vessels[0].status = "Ready-ish";
assert.throws(() => validateFleet(invalidOperationalStatus), /invalid operational status/i);

const submarinePatrol = structuredClone(dataset);
const submarine = submarinePatrol.vessels.find((vessel) => vessel.vesselType === "SSBN");
submarine.locationClassification = "approximate";
submarine.lastReportedLocation = "Deterrent patrol";
submarine.position = { lat: 0, lon: 0, label: "Invalid patrol position" };
delete submarine.symbolicPosition;
assert.throws(() => validateFleet(submarinePatrol), /cannot expose a submarine patrol position/i);

const vanguard = dataset.vessels.find((vessel) => vessel.id === "hms-vanguard");
assert.equal(vanguard.lastReportedLocation, "HMNB Clyde (Faslane); returned 12 June 2026");
assert.equal(vanguard.symbolicPosition, undefined);

const vengeance = dataset.vessels.find((vessel) => vessel.id === "hms-vengeance");
assert.equal(vengeance.status, "Deployed");
assert.equal(vengeance.lastReportedLocation, "On patrol - classified");
assert.equal(vengeance.symbolicPosition.label, "On patrol - classified");

const vigilant = dataset.vessels.find((vessel) => vessel.id === "hms-vigilant");
assert.equal(vigilant.status, "Unknown");
assert.equal(vigilant.symbolicPosition, undefined);
assert.equal(vigilant.lastReportedLocation, "HMNB Clyde (Faslane); last directly reported 10 October 2025");
assert.equal(vigilant.position.label, "HMNB Clyde (Faslane)");

assert.equal(dataset.vessels.some((vessel) => vessel.id === "hms-valiant"), false);

console.log("Fleet loader tests passed.");
