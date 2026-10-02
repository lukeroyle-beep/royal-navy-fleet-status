import fs from 'node:fs';
import crypto from 'node:crypto';
import { assertPrivateArtifact } from './private-artifacts.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Fixed stages only. No shell, publisher, broker, scheduler or privilege changes.
export function stageArguments(stage, config) {
  if (!['plan', 'indexes'].includes(stage)) throw new Error('Unsupported stage');
  assertPrivateArtifact(config.run);
  if (stage === 'plan') {
    assertPrivateArtifact(config.stateDirectory);
    return ['scripts/accelerate-osint-sweep.mjs', '--mode=plan', `--run=${config.run}`, `--state=${config.stateDirectory}`];
  }
  assertPrivateArtifact(config.collectionOutput);
  if (fs.existsSync(config.collectionOutput) || fs.existsSync(`${config.collectionOutput}.checkpoints`)) throw new Error('Collection output already exists');
  if (config.collectionCache) assertPrivateArtifact(config.collectionCache);
  return ['scripts/collect-public-indexes.mjs', `--resume=${config.run}`, `--output=${config.collectionOutput}`,
    '--attempts=2', '--timeout-ms=15000', '--concurrency=2',
    ...(config.collectionCache ? [`--cache=${config.collectionCache}`] : [])];
}

// This reports a stage, never whole-sweep success or actual scheduler provenance.
// The caller persists preflight before invoking this function. Test injection is
// confined to the library; the CLI supplies execFileSync with fixed Node scripts.
export function executePreflightStage({ stage, config, receipt, execute, now = () => Date.now() }) {
  const started = now();
  const result = {
    schemaVersion: 1, kind: 'rnfs-preflight-stage', stage,
    runId: receipt.runId || null, mainSha: receipt.main || null,
    preflightOutcome: receipt.outcome,
    preflightSha256: sha(Buffer.from(JSON.stringify(receipt))),
    startedAt: new Date(started).toISOString(),
    stageAttempted: false, collectionStarted: false,
    publicationEligible: false, noChangeClaimAllowed: false,
    schedulerAcceptance: 'NOT_ESTABLISHED',
    outcome: 'DEFERRED_WITH_JUSTIFICATION',
  };
  if (receipt.outcome !== 'READY_FOR_COLLECTION') {
    return { ...result, diagnostic: receipt.diagnostic || 'PREFLIGHT_FAILED', elapsedMs: now() - started };
  }
  const args = stageArguments(stage, config);
  const original = fs.readFileSync(config.run);
  const run = JSON.parse(original);
  if (run.runId !== receipt.runId) throw new Error('Preflight run changed');
  result.runSha256 = sha(original);
  result.window = run.window;
  result.stageAttempted = true;
  let childFailed = false;
  try { execute(args); } catch { childFailed = true; }
  if (stage === 'plan') {
    result.outcome = childFailed ? 'STAGE_FAILED' : 'PLAN_PREPARED';
  } else {
    result.bounds = { attemptsPerSource: 2, timeoutMs: 15000, concurrency: 2, perDomain: 1, maxBodyBytes: 2_000_000 };
    const output = fs.existsSync(config.collectionOutput) ? config.collectionOutput : `${config.collectionOutput}.checkpoints/run.json`;
    if (fs.existsSync(output)) {
      const bytes = fs.readFileSync(output), collected = JSON.parse(bytes);
      if (collected.runId !== run.runId || JSON.stringify(collected.window) !== JSON.stringify(run.window) ||
          collected.sourceRegistryHash !== run.sourceRegistryHash || collected.baselineStateHash !== run.baselineStateHash) {
        throw new Error('Collection result binding mismatch');
      }
      result.collectionStarted = true;
      result.resultSha256 = sha(bytes);
      result.coverage = Object.fromEntries([
        'requiredDiscoveryChecks', 'completedDiscoveryChecks', 'requiredSourceChecks',
        'completedSourceChecks', 'requiredVesselOutcomes', 'completedVesselOutcomes',
        'requiredIntegrityChecks', 'completedIntegrityChecks', 'blockerCount',
      ].filter(key => Number.isInteger(collected.coverage?.[key])).map(key => [key, collected.coverage[key]]));
      result.usage = collected.collectionTelemetry || null;
      result.outcome = !childFailed && collected.discoveryChecks.every(c => !c.required || c.state === 'complete')
        ? 'DISCOVERY_COMPLETE_REVIEW_REQUIRED' : 'INCOMPLETE_DISCOVERY';
    } else {
      result.outcome = 'STAGE_FAILED';
      // A killed process without a checkpoint may have made requests. Do not say zero.
      result.collectionStarted = null;
    }
  }
  result.elapsedMs = now() - started;
  return result;
}
