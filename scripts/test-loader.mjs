import assert from "node:assert/strict";
import fs from "node:fs";

import { validateFleet } from "../src/components/ScenarioLoader.js";
import {
  formatEvidenceClassification,
  formatEvidenceDate,
} from "../src/components/EventDetailsPanel.js";
import { getActiveFleetSummary } from "../src/utils/fleet.js";

const path = new URL("../data/royal-navy/vessels.json", import.meta.url);
const dataset = JSON.parse(fs.readFileSync(path, "utf8"));
const page = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(page, /<h1 id="mapTitle">Royal Navy Fleet Status<\/h1>/);
assert.doesNotMatch(page, /<h1 id="mapTitle">Royal Navy Fleet status<\/h1>/);

assert.equal(validateFleet(dataset).vessels.length, 71);
assert.throws(() => validateFleet({ metadata: {}, vessels: [] }), /no vessel records/i);
assert.equal(formatEvidenceDate("2026-07-20"), "20 July 2026");
assert.equal(formatEvidenceDate(null), "Unknown");
assert.equal(formatEvidenceClassification("direct-report"), "Direct public report");
assert.equal(formatEvidenceClassification("insufficient"), "Insufficient for plotting");

const activeFleet = getActiveFleetSummary(dataset.vessels);
assert.equal(activeFleet.total, 51);
assert.equal(activeFleet.percentage.toFixed(1), "71.8");

const directEvidence = dataset.vessels.find((vessel) => vessel.locationClassification === "approximate");
assert.match(directEvidence.locationEvidenceDate, /^\d{4}-\d{2}-\d{2}$/);
assert.match(directEvidence.evidenceCheckedDate, /^\d{4}-\d{2}-\d{2}$/);

const victory = dataset.vessels.find((vessel) => vessel.id === "hms-victory");
assert.equal(victory.locationClassification, "mapped");
assert.deepEqual(victory.position, {
  lat: 50.801468,
  lon: -1.1095,
  label: "HMS Victory, Portsmouth Historic Dockyard",
});
assert.equal(victory.locationEvidenceDate, "2026-07-31");
assert.equal(victory.evidenceClassification, "direct-report");

const unknownWithCoordinates = structuredClone(dataset);
const unknown = unknownWithCoordinates.vessels.find((vessel) => vessel.locationClassification === "unknown");
unknown.position = { lat: 0, lon: 0, label: "Invalid inferred point" };
assert.throws(() => validateFleet(unknownWithCoordinates), /must not contain coordinates/i);

const insufficientMappedEvidence = structuredClone(dataset);
const mappedWithInsufficientEvidence = insufficientMappedEvidence.vessels.find(
  (vessel) => vessel.locationClassification === "approximate",
);
mappedWithInsufficientEvidence.evidenceClassification = "insufficient";
assert.throws(() => validateFleet(insufficientMappedEvidence), /without sufficient dated location evidence/i);

const missingCheckedDate = structuredClone(dataset);
delete missingCheckedDate.vessels[0].evidenceCheckedDate;
assert.throws(() => validateFleet(missingCheckedDate), /invalid evidenceCheckedDate/i);

const invalidEvidenceDate = structuredClone(dataset);
invalidEvidenceDate.vessels.find((vessel) => vessel.locationEvidenceDate).locationEvidenceDate = "2026-02-30";
assert.throws(() => validateFleet(invalidEvidenceDate), /invalid location evidence date/i);

const missingSourceLabel = structuredClone(dataset);
missingSourceLabel.vessels[0].source.label = "";
assert.throws(() => validateFleet(missingSourceLabel), /no valid supporting source/i);

const submarinePatrol = structuredClone(dataset);
const submarine = submarinePatrol.vessels.find((vessel) => vessel.vesselType === "SSBN");
submarine.locationClassification = "approximate";
submarine.lastReportedLocation = "Deterrent patrol";
submarine.position = { lat: 0, lon: 0, label: "Invalid patrol position" };
delete submarine.symbolicPosition;
submarine.locationEvidenceDate = "2026-07-23";
submarine.evidenceClassification = "direct-report";
assert.throws(() => validateFleet(submarinePatrol), /cannot expose a submarine patrol position/i);

const vanguard = dataset.vessels.find((vessel) => vessel.id === "hms-vanguard");
assert.equal(vanguard.lastReportedLocation, "HMNB Clyde (Faslane); returned 12 June 2026");
assert.equal(vanguard.locationEvidenceDate, "2026-06-12");
assert.equal(vanguard.symbolicPosition, undefined);

const vengeance = dataset.vessels.find((vessel) => vessel.id === "hms-vengeance");
assert.equal(vengeance.status, "Deployed");
assert.equal(vengeance.lastReportedLocation, "On patrol - classified");
assert.equal(vengeance.symbolicPosition.label, "On patrol - classified");

const vigilant = dataset.vessels.find((vessel) => vessel.id === "hms-vigilant");
assert.equal(vigilant.status, "Unknown");
assert.equal(vigilant.symbolicPosition, undefined);
assert.equal(vigilant.lastReportedLocation, "HMNB Clyde (Faslane); last directly reported 10 October 2025");
assert.equal(vigilant.locationEvidenceDate, "2025-10-10");
assert.equal(vigilant.position.label, "HMNB Clyde (Faslane)");

assert.equal(dataset.vessels.some((vessel) => vessel.id === "hms-valiant"), false);

console.log("Fleet loader tests passed.");
