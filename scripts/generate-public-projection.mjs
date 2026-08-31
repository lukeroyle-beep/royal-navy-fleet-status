import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPublicProjection,
  createPublicStatusHistoryCatalog,
} from "./lib/public-projection.mjs";
import { validateAssessmentLog } from "./lib/provenance.mjs";
import { resolvePrivateInputs } from "./lib/private-inputs.mjs";
import { parseStatusHistory, validateStatusHistoryCatalog } from "../src/utils/insights.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const privateInputs = resolvePrivateInputs();
const outputRoot = resolvePathArgument("--output-root=", path.join(repositoryRoot, "data/royal-navy"));
const statusHistoryPath = resolvePathArgument(
  "--status-history=",
  path.join(repositoryRoot, "data/royal-navy/status-history.jsonl"),
);
const preserveReviewedWithoutExternal = process.argv.includes(
  "--preserve-reviewed-without-external",
);

if (privateInputs.mode === "legacy" && preserveReviewedWithoutExternal) {
  console.log(
    "Preserved the reviewed public projection because external private inputs are not configured.",
  );
} else {
  const entities = privateInputs.readJson("vessels");
  const assessments = privateInputs.readJson("assessments");
  const evidence = privateInputs.readJson("evidence");
  const destination = path.join(outputRoot, "vessels.json");
  const historyCatalogDestination = path.join(outputRoot, "status-history-catalog.json");
  const currentVesselIds = entities.vessels.map((vessel) => vessel.vesselId);
  const knownVesselIds = [
    ...currentVesselIds,
    ...(entities.retiredVessels || []).map((vessel) => vessel.vesselId),
  ];
  validateAssessmentLog(assessments, evidence.evidence, knownVesselIds, currentVesselIds);
  const projection = createPublicProjection(entities, assessments);
  const history = parseStatusHistory(fs.readFileSync(statusHistoryPath, "utf8"));
  const historyCatalog = validateStatusHistoryCatalog(
    createPublicStatusHistoryCatalog(entities, history),
    history,
  );

  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(projection, null, 2)}\n`);
  fs.writeFileSync(historyCatalogDestination, `${JSON.stringify(historyCatalog, null, 2)}\n`);
  console.log(`Generated public projection for ${projection.vessels.length} vessels.`);
  console.log(`Generated public status history catalog for ${historyCatalog.vessels.length} vessels.`);
}

function resolvePathArgument(prefix, fallback) {
  const argument = process.argv.find((value) => value.startsWith(prefix));
  if (!argument) return fallback;
  const value = argument.slice(prefix.length);
  if (!value || !path.isAbsolute(value)) throw new Error(`${prefix.slice(0, -1)} requires an absolute path.`);
  return path.resolve(value);
}
