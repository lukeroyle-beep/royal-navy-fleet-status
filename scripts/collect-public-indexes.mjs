import fs from "node:fs";
import path from "node:path";

import { collectPublicIndexes } from "./lib/public-index-collector.mjs";
import { createSweepRun, sweepWindowStartFromMetadata } from "./lib/sweep.mjs";
import { validateSourceRegistry } from "./lib/provenance.mjs";

const startedAt = readEqualsArgument("--as-of=") || new Date().toISOString();
const windowStartArgument = readEqualsArgument("--since=");
const releaseRevisionArgument = readEqualsArgument("--release-revision=");
const releaseRevision = releaseRevisionArgument === null ? 1 : Number(releaseRevisionArgument);
const outputPath = readEqualsArgument("--output=");
const entities = readJson("../data/internal/provenance/vessels.json");
const registry = readJson("../data/internal/provenance/sources.json");
const assessments = readJson("../data/internal/provenance/assessments.json");
const windowStart =
  windowStartArgument === null
    ? sweepWindowStartFromMetadata(entities.metadata)
    : windowStartArgument;

validateSourceRegistry(registry, entities.vessels.map((vessel) => vessel.vesselId));
const run = createSweepRun({
  registry,
  entities,
  assessmentLog: assessments,
  startedAt,
  windowStart,
  releaseRevision,
});
await collectPublicIndexes(run, { registry, entities, checkedAt: new Date().toISOString() });
const output = `${JSON.stringify(run, null, 2)}\n`;

if (outputPath) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, output);
  console.log(
    `Wrote read-only discovery run ${run.runId}: ${run.coverage.completedDiscoveryChecks}/` +
      `${run.coverage.requiredDiscoveryChecks} public indexes; release remains incomplete pending ` +
      `${run.coverage.requiredSourceChecks} recurring source checks and ${run.coverage.requiredVesselOutcomes} vessel outcomes.`,
  );
} else {
  process.stdout.write(output);
}
if (run.discoveryChecks.some((check) => check.required && check.state !== "complete")) {
  process.exitCode = 1;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

function readEqualsArgument(prefix) {
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}
