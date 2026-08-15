import fs from "node:fs";

import { validateEvidenceLog, validateSourceRegistry } from "./lib/provenance.mjs";

const inputPath = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
if (!inputPath) {
  throw new Error("Usage: node scripts/ingest-evidence.mjs <evidence.json> [--dry-run]");
}

const entities = readJson(new URL("../data/internal/provenance/vessels.json", import.meta.url));
const registry = readJson(new URL("../data/internal/provenance/sources.json", import.meta.url));
const evidenceUrl = new URL("../data/internal/provenance/evidence.json", import.meta.url);
const existing = readJson(evidenceUrl);
const incoming = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const items = Array.isArray(incoming) ? incoming : [incoming];
const vesselIds = entities.vessels.map((vessel) => vessel.vesselId);

validateSourceRegistry(registry, vesselIds);
validateEvidenceLog(
  { ...existing, evidence: [...existing.evidence, ...items] },
  registry.sources.map((source) => source.sourceId),
  vesselIds,
);

if (!dryRun) {
  fs.writeFileSync(evidenceUrl, `${JSON.stringify({ ...existing, evidence: [...existing.evidence, ...items] }, null, 2)}\n`);
}
console.log(`${dryRun ? "Validated" : "Appended"} ${items.length} evidence item(s); assessment remains a separate analyst action.`);

function readJson(url) {
  return JSON.parse(fs.readFileSync(url, "utf8"));
}
