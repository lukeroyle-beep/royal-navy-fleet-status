import fs from "node:fs";

import { createPublicProjection } from "./lib/public-projection.mjs";
import { validateAssessmentLog } from "./lib/provenance.mjs";

const entities = readJson("../data/internal/provenance/vessels.json");
const assessments = readJson("../data/internal/provenance/assessments.json");
const evidence = readJson("../data/internal/provenance/evidence.json");
const destination = new URL("../data/royal-navy/vessels.json", import.meta.url);
const currentVesselIds = entities.vessels.map((vessel) => vessel.vesselId);
const knownVesselIds = [
  ...currentVesselIds,
  ...(entities.retiredVessels || []).map((vessel) => vessel.vesselId),
];
validateAssessmentLog(assessments, evidence.evidence, knownVesselIds, currentVesselIds);
const projection = createPublicProjection(entities, assessments);

fs.writeFileSync(destination, `${JSON.stringify(projection, null, 2)}\n`);
console.log(`Generated public projection for ${projection.vessels.length} vessels.`);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}
