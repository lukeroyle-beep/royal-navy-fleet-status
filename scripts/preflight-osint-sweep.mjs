import fs from 'node:fs';
import { requireSweepWorkBudget } from './lib/sweep-work-budget.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assertPrivateArtifact } from './lib/private-artifacts.mjs';
import { productionProbes, runSweepPreflight } from './lib/sweep-preflight.mjs';
import { reportWithoutChangingSweep, recordEarlyFailure } from './lib/command-centre-hook.mjs';
import { stageArguments, executePreflightStage } from './lib/preflight-stage.mjs';

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const repository = fileURLToPath(new URL('..', import.meta.url));
try {
  const config = JSON.parse(fs.readFileSync(assertPrivateArtifact(arg('config')), 'utf8'));
  if (config.usageBudget) requireSweepWorkBudget(config.usageBudget);
  const output = assertPrivateArtifact(arg('output'));
  if (fs.existsSync(output)) throw new Error('Existing preflight receipt');
  const stage = arg('then');
  if (stage && !['plan', 'indexes'].includes(stage)) throw new Error('Unsupported stage');
  const resultPath = stage ? assertPrivateArtifact(arg('result') || `${output}.stage.json`) : null;
  if (fs.existsSync(output) || (resultPath && fs.existsSync(resultPath))) throw new Error('Existing attempt receipt');
  if (stage) stageArguments(stage, config);
  const persist = receipt => {
    // Exclusive creation preserves every attempt; no overwrite or reusable pass token.
    const fd = fs.openSync(output, 'wx', 0o600);
    try { fs.writeFileSync(fd, `${JSON.stringify(receipt, null, 2)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  };
  const receipt = await runSweepPreflight({ config, repository,
    probes: productionProbes({ repository, deadline: Date.now() + 30000, encryptionQuery: config.encryptionQuery }) });
  persist(receipt);
  let result = null;
  if (stage) {
    result = executePreflightStage({ stage, config, receipt, execute: args => {
      execFileSync(process.execPath, args, { cwd: repository, env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000, maxBuffer: 2_000_000 });
    } });
    const fd = fs.openSync(resultPath, 'wx', 0o600);
    try { fs.writeFileSync(fd, `${JSON.stringify(result, null, 2)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  reportWithoutChangingSweep({ receipt: result || receipt, receiptPath: resultPath || output });
  console.log(JSON.stringify(result || receipt));
  if (receipt.outcome !== 'READY_FOR_COLLECTION' ||
      (result && !['PLAN_PREPARED', 'DISCOVERY_COMPLETE_REVIEW_REQUIRED'].includes(result.outcome))) process.exitCode = 1;
} catch (error) {
  try { recordEarlyFailure({}); } catch (error) { console.error(JSON.stringify({reportingError:error.message,sweepResultUnchanged:true})); }
  console.error(JSON.stringify({ outcome: 'FAILED', diagnostic: error.diagnostic || 'PREFLIGHT_OR_REQUESTED_STAGE_FAILED', publicationEligible: false }));
  process.exitCode = 1;
}
