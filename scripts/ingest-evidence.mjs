import fs from "node:fs";

import { resolvePrivateInputs } from "./lib/private-inputs.mjs";
import { validateEvidenceLog, validateSourceRegistry } from "./lib/provenance.mjs";

const inputPath = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
if (!inputPath) {
  throw new Error("Usage: node scripts/ingest-evidence.mjs <evidence.json> [--dry-run]");
}

const privateInputs = resolvePrivateInputs();
const entities = privateInputs.readJson("vessels");
const registry = privateInputs.readJson("sources");
const evidencePath = privateInputs.pathFor("evidence");
const existing = readJson(evidencePath);
const incoming = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const items = Array.isArray(incoming) ? incoming : [incoming];
const vesselIds = entities.vessels.map((vessel) => vessel.vesselId);
const knownVesselIds = [
  ...vesselIds,
  ...(entities.retiredVessels || []).map((vessel) => vessel.vesselId),
];

validateSourceRegistry(registry, knownVesselIds, vesselIds);
validateEvidenceLog(
  { ...existing, evidence: [...existing.evidence, ...items] },
  registry.sources.map((source) => source.sourceId),
  knownVesselIds,
);

if (!dryRun) {
  fs.writeFileSync(evidencePath, `${JSON.stringify({ ...existing, evidence: [...existing.evidence, ...items] }, null, 2)}\n`);
}
console.log(`${dryRun ? "Validated" : "Appended"} ${items.length} evidence item(s); assessment remains a separate analyst action.`);

function readJson(url) {
  return JSON.parse(fs.readFileSync(url, "utf8"));
}
