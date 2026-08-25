import fs from "node:fs";

import { resolvePrivateInputs } from "./lib/private-inputs.mjs";
import { finaliseSweepRun } from "./lib/sweep.mjs";

const inputPath = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
if (!inputPath) {
  throw new Error(
    "Usage: node scripts/finalise-osint-sweep.mjs <sweep-run.json> [--at=<ISO timestamp>]",
  );
}

const completedAtArgument = process.argv.find((argument) => argument.startsWith("--at="));
const completedAt = completedAtArgument
  ? completedAtArgument.slice("--at=".length)
  : new Date().toISOString();
const privateInputs = resolvePrivateInputs();
const entities = privateInputs.readJson("vessels");
const registry = privateInputs.readJson("sources");
const evidence = privateInputs.readJson("evidence");
const assessments = privateInputs.readJson("assessments");
const run = readJson(inputPath);

finaliseSweepRun(run, {
  registry,
  entities,
  assessmentLog: assessments,
  evidenceItems: evidence.evidence,
  completedAt,
});
fs.writeFileSync(inputPath, `${JSON.stringify(run, null, 2)}\n`);
if (!run.complete) {
  throw new Error(`Sweep remains incomplete: ${run.coverage.reasons.join("; ")}`);
}
console.log(`Finalised complete sweep ${run.runId}.`);

function readJson(pathOrUrl) {
  return JSON.parse(fs.readFileSync(pathOrUrl, "utf8"));
}
