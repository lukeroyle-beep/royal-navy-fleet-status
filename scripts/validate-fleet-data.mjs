import fs from "node:fs";

import { validateFleet } from "../src/components/ScenarioLoader.js";
import { createPublicProjection } from "./lib/public-projection.mjs";
import {
  validateAssessmentLog,
  validateEvidenceLog,
  validateSourceRegistry,
} from "./lib/provenance.mjs";

const dataset = readJson("../data/royal-navy/vessels.json");
const entities = readJson("../data/internal/provenance/vessels.json");
const registry = readJson("../data/internal/provenance/sources.json");
const evidence = readJson("../data/internal/provenance/evidence.json");
const assessments = readJson("../data/internal/provenance/assessments.json");

validateFleet(dataset);
const vesselIds = entities.vessels.map((vessel) => vessel.vesselId);
validateSourceRegistry(registry, vesselIds);
validateEvidenceLog(evidence, registry.sources.map((source) => source.sourceId), vesselIds);
validateAssessmentLog(assessments, evidence.evidence, vesselIds);

const expectedProjection = createPublicProjection(entities, assessments);
if (JSON.stringify(dataset) !== JSON.stringify(expectedProjection)) {
  throw new Error("Public fleet data is not the current generated projection.");
}
if (/https?:\/\//.test(JSON.stringify(dataset.vessels))) {
  throw new Error("Public fleet records contain a source URL.");
}

console.log(
  `Validated ${dataset.vessels.length} public records, ${registry.sources.length} sources, ` +
    `${evidence.evidence.length} evidence items and ${assessments.assessments.length} assessments.`,
);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}
