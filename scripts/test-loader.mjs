import assert from "node:assert/strict";
import fs from "node:fs";

import { validateFleet } from "../src/components/ScenarioLoader.js";

const path = new URL("../data/royal-navy/vessels.json", import.meta.url);
const dataset = JSON.parse(fs.readFileSync(path, "utf8"));

assert.equal(validateFleet(dataset).vessels.length, 71);
assert.throws(() => validateFleet({ metadata: {}, vessels: [] }), /no vessel records/i);

const unknownWithCoordinates = structuredClone(dataset);
const unknown = unknownWithCoordinates.vessels.find((vessel) => vessel.locationClassification === "unknown");
unknown.position = { lat: 0, lon: 0, label: "Invalid inferred point" };
assert.throws(() => validateFleet(unknownWithCoordinates), /must not contain coordinates/i);

const submarinePatrol = structuredClone(dataset);
const submarine = submarinePatrol.vessels.find((vessel) => vessel.vesselType === "SSBN");
submarine.locationClassification = "approximate";
submarine.position = { lat: 0, lon: 0, label: "Invalid patrol position" };
assert.throws(() => validateFleet(submarinePatrol), /cannot expose a submarine patrol position/i);

console.log("Fleet loader tests passed.");
