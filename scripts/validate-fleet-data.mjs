import fs from "node:fs";

import { validateFleet } from "../src/components/ScenarioLoader.js";
import { createPublicProjection } from "./lib/public-projection.mjs";
import { resolvePrivateInputs } from "./lib/private-inputs.mjs";
import { readReleaseMetadata } from "../src/utils/release.js";
import {
  validateAssessmentLog,
  validateEvidenceLog,
  validateSourceRegistry,
} from "./lib/provenance.mjs";

const dataset = readJson("../data/royal-navy/vessels.json");
const privateInputs = resolvePrivateInputs();
const entities = privateInputs.readJson("vessels");
const registry = privateInputs.readJson("sources");
const evidence = privateInputs.readJson("evidence");
const assessments = privateInputs.readJson("assessments");
const allowReviewedWithoutExternal = process.argv.includes(
  "--allow-reviewed-public-without-external",
);

validateFleet(dataset);
const vesselIds = entities.vessels.map((vessel) => vessel.vesselId);
const knownVesselIds = [
  ...vesselIds,
  ...(entities.retiredVessels || []).map((vessel) => vessel.vesselId),
];
validateSourceRegistry(registry, knownVesselIds, vesselIds);
validateEvidenceLog(evidence, registry.sources.map((source) => source.sourceId), knownVesselIds);
validateAssessmentLog(assessments, evidence.evidence, knownVesselIds, vesselIds);

const expectedProjection = createPublicProjection(entities, assessments);
const projectionMatches = JSON.stringify(dataset) === JSON.stringify(expectedProjection);
const publicRelease = readReleaseMetadata(dataset.metadata);
const legacyRelease = readReleaseMetadata(entities.metadata);
const publicIsNewerThanLegacy =
  publicRelease.asOfDate > legacyRelease.asOfDate ||
  (publicRelease.asOfDate === legacyRelease.asOfDate &&
    publicRelease.releaseRevision > legacyRelease.releaseRevision);
const mayValidateReviewedProjectionIndependently =
  privateInputs.mode === "legacy" &&
  allowReviewedWithoutExternal &&
  publicIsNewerThanLegacy;
if (!projectionMatches && !mayValidateReviewedProjectionIndependently) {
  throw new Error("Public fleet data is not the current generated projection.");
}
if (/https?:\/\//.test(JSON.stringify(dataset.vessels))) {
  throw new Error("Public fleet records contain a source URL.");
}

console.log(
  `Validated ${dataset.vessels.length} public records, ${registry.sources.length} sources, ` +
    `${evidence.evidence.length} evidence items and ${assessments.assessments.length} assessments.`,
);
if (mayValidateReviewedProjectionIndependently) {
  console.log(
    `Preserved reviewed public release ${publicRelease.asOfDate} r${publicRelease.releaseRevision}; ` +
      `legacy provenance remains at ${legacyRelease.asOfDate} r${legacyRelease.releaseRevision}.`,
  );
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}
