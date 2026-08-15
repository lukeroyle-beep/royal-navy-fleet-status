import assert from "node:assert/strict";
import fs from "node:fs";

import { validateFleet } from "../src/components/ScenarioLoader.js";

const path = new URL("../data/royal-navy/vessels.json", import.meta.url);
const dataset = JSON.parse(fs.readFileSync(path, "utf8"));
const page = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const detailsPanel = fs.readFileSync(new URL("../src/components/EventDetailsPanel.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

assert.match(page, /<h1 id="mapTitle">Royal Navy Fleet Status<\/h1>/);
assert.doesNotMatch(page, /<h1 id="mapTitle">Royal Navy Fleet status<\/h1>/);

assert.equal(validateFleet(dataset).vessels.length, 71);
assert.throws(() => validateFleet({ metadata: {}, vessels: [] }), /no vessel records/i);

const victory = dataset.vessels.find((vessel) => vessel.id === "hms-victory");
assert.equal(victory.locationClassification, "mapped");
assert.deepEqual(victory.position, {
  lat: 50.801468,
  lon: -1.1095,
  label: "HMS Victory, Portsmouth Historic Dockyard",
});
assert.equal(Object.hasOwn(victory, "source"), false);
assert.equal(Object.hasOwn(victory, "evidenceCheckedDate"), false);
assert.equal(Object.hasOwn(victory, "locationEvidenceDate"), false);
assert.equal(Object.hasOwn(victory, "evidenceClassification"), false);
assert.doesNotMatch(detailsPanel, /Supporting Source|vessel\.source|source-link/i);
assert.doesNotMatch(styles, /\.source-link/);

const unknownWithCoordinates = structuredClone(dataset);
const unknown = unknownWithCoordinates.vessels.find((vessel) => vessel.locationClassification === "unknown");
unknown.position = { lat: 0, lon: 0, label: "Invalid inferred point" };
assert.throws(() => validateFleet(unknownWithCoordinates), /must not contain coordinates/i);

const accidentallyExposedSource = structuredClone(dataset);
accidentallyExposedSource.vessels[0].source = { label: "Must stay internal", url: "https://example.invalid" };
assert.throws(() => validateFleet(accidentallyExposedSource), /exposes internal provenance field source/i);

const noSourceProjection = structuredClone(dataset);
assert.equal(validateFleet(noSourceProjection).vessels.length, 71, "Missing public source fields must not break vessel cards.");

const submarinePatrol = structuredClone(dataset);
const submarine = submarinePatrol.vessels.find((vessel) => vessel.vesselType === "SSBN");
submarine.locationClassification = "approximate";
submarine.position = { lat: 0, lon: 0, label: "Invalid patrol position" };
assert.throws(() => validateFleet(submarinePatrol), /cannot expose a submarine patrol position/i);

console.log("Fleet loader tests passed.");
