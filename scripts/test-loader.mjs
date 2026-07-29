import assert from "node:assert/strict";
import fs from "node:fs";

import { validateFleet } from "../src/components/ScenarioLoader.js";

const path = new URL("../data/royal-navy/vessels.json", import.meta.url);
const dataset = JSON.parse(fs.readFileSync(path, "utf8"));
const page = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(page, /<h1 id="mapTitle">Royal Navy Fleet Status<\/h1>/);
assert.doesNotMatch(page, /<h1 id="mapTitle">Royal Navy Fleet status<\/h1>/);

assert.equal(validateFleet(dataset).vessels.length, 71);
assert.throws(() => validateFleet({ metadata: {}, vessels: [] }), /no vessel records/i);

const directEvidence = dataset.vessels.find((vessel) => vessel.locationClassification === "approximate");
assert.match(directEvidence.locationEvidenceDate, /^\d{4}-\d{2}-\d{2}$/);
assert.match(directEvidence.evidenceCheckedDate, /^\d{4}-\d{2}-\d{2}$/);

const safelyDowngraded = dataset.vessels.find((vessel) => vessel.id === "hms-victory");
assert.equal(safelyDowngraded.locationClassification, "unknown");
assert.equal(safelyDowngraded.position, null);
assert.equal(safelyDowngraded.locationEvidenceDate, null);
assert.equal(safelyDowngraded.evidenceClassification, "insufficient");

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
submarine.position = { lat: 0, lon: 0, label: "Invalid patrol position" };
submarine.locationEvidenceDate = "2026-07-23";
submarine.evidenceClassification = "direct-report";
assert.throws(() => validateFleet(submarinePatrol), /cannot expose a submarine patrol position/i);

console.log("Fleet loader tests passed.");
