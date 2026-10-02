import fs from "node:fs";
import { assertPrivateArtifact } from "./lib/private-artifacts.mjs";
import os from "node:os";
import path from "node:path";
import { checkpointJson, digest } from "./lib/acquisition.mjs";

import { collectPublicIndexes } from "./lib/public-index-collector.mjs";
import { resolvePrivateInputs } from "./lib/private-inputs.mjs";
import { createSweepRun, sweepWindowStartFromMetadata } from "./lib/sweep.mjs";
import { validateSourceRegistry } from "./lib/provenance.mjs";

const resumePath = readEqualsArgument("--resume=");
const resumed = resumePath ? JSON.parse(fs.readFileSync(resumePath, "utf8")) : null;
const startedAt = readEqualsArgument("--as-of=") || resumed?.window.to || new Date().toISOString();
const windowStartArgument = readEqualsArgument("--since=");
const releaseRevisionArgument = readEqualsArgument("--release-revision=");
const releaseRevision = releaseRevisionArgument === null ? resumed?.releaseTarget.releaseRevision || 1 : Number(releaseRevisionArgument);
const outputPath = readEqualsArgument("--output=");
const privateInputs = resolvePrivateInputs();
const privateArtifacts = privateInputs.mode === 'external' || Boolean(resumePath || readEqualsArgument('--cache='));
if (privateArtifacts) {
  // The cloud legacy discovery path contains public-only migration data. Real
  // private runs and their cache/continuation receipts may never enter a checkout.
  if (!outputPath) throw new Error('External discovery requires a private output path');
  assertPrivateArtifact(outputPath);
  if (resumePath) assertPrivateArtifact(resumePath);
  const cacheFile = readEqualsArgument('--cache=');
  if (cacheFile) assertPrivateArtifact(cacheFile);
}
const entities = privateInputs.readJson("vessels");
const registry = privateInputs.readJson("sources");
const assessments = privateInputs.readJson("assessments");
const windowStart =
  windowStartArgument === null
    ? resumed?.window.from || sweepWindowStartFromMetadata(entities.metadata)
    : windowStartArgument;

const vesselIds = entities.vessels.map((vessel) => vessel.vesselId);
const knownVesselIds = [
  ...vesselIds,
  ...(entities.retiredVessels || []).map((vessel) => vessel.vesselId),
];
validateSourceRegistry(registry, knownVesselIds, vesselIds);
const plannedRun = createSweepRun({
  registry,
  entities,
  assessmentLog: assessments,
  evidenceItems: privateInputs.readJson("evidence").evidence,
  startedAt,
  windowStart,
  releaseRevision,
});
if (resumed) {
  const targetBinding = checks => Array.isArray(checks)
    ? checks.map(({ targetId, sourceId, url, contentKind, required }) => ({ targetId, sourceId, url, contentKind, required }))
      .sort((left, right) => String(left.targetId).localeCompare(String(right.targetId)))
    : null;
  const resumedTargets = targetBinding(resumed.discoveryChecks);
  const plannedTargets = targetBinding(plannedRun.discoveryChecks);
  if (!resumedTargets || resumedTargets.length !== plannedTargets.length ||
      new Set(resumedTargets.map(check => check.targetId)).size !== resumedTargets.length ||
      digest(resumedTargets) !== digest(plannedTargets)) {
    throw new Error('Resume discovery target set changed or is incomplete');
  }
  if (resumed.complete || resumed.runId !== plannedRun.runId || resumed.sourceRegistryHash !== plannedRun.sourceRegistryHash || resumed.baselineStateHash !== plannedRun.baselineStateHash || digest(resumed.window) !== digest(plannedRun.window)) throw new Error('Resume binding changed or run sealed');
}
const run = resumed || plannedRun;
if (outputPath && fs.existsSync(path.resolve(outputPath))) throw new Error('Output already exists; choose a new attempt path to preserve prior artifact');
const checkpointDirectory = outputPath ? `${path.resolve(outputPath)}.checkpoints` : null;
if (checkpointDirectory && privateArtifacts) assertPrivateArtifact(checkpointDirectory);
const cachePath = readEqualsArgument('--cache=');
const cache = cachePath ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
const runLockDirectory = privateInputs.mode === 'external'
  ? privateInputs.pathFor('sweepRuns')
  : path.join(os.tmpdir(), 'rnfs-public-index-locks');
const runLockPath = path.join(runLockDirectory, `public-index-${digest(run.runId)}.lock`);
assertPrivateArtifact(runLockPath);
await collectPublicIndexes(run, { registry, entities, cache, checkedAt: new Date().toISOString(),
  runLockPath,
  attempts: Number(readEqualsArgument('--attempts=') ?? 3),
  timeoutMs: Number(readEqualsArgument('--timeout-ms=') ?? 20000),
  concurrency: Number(readEqualsArgument('--concurrency=') ?? 4),
  onCheckpoint: checkpointDirectory ? (current, retainedCache) => {
    checkpointJson(checkpointDirectory, 'run.json', current, { privateOnly: privateArtifacts });
    checkpointJson(checkpointDirectory, 'cache.json', retainedCache, { privateOnly: privateArtifacts });
  } : undefined,
});
const output = `${JSON.stringify(run, null, 2)}\n`;

if (outputPath) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, output, { flag: "wx", mode: 0o600 });
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

function readEqualsArgument(prefix) {
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}
