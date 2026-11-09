import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertPrivateArtifact } from './lib/private-artifacts.mjs';
import { bootstrapSweep } from './lib/sweep-bootstrap.mjs';
import { sweepStop, saveSweepStop } from './lib/sweep-stop.mjs';
const stopOutput = process.argv.find(x => x.startsWith('--stop-output='))?.slice(14);
let config;
const budgetStop = code => code === 'WORK_BUDGET_STOP' || code === 'WORK_HEADROOM_STOP';
const finish = result => {
  const diagnostic = result.diagnostic || result.outcome;
  const withResume = result.kind === 'rnfs-terminal-stop' ? result : sweepStop({
    diagnostic, usage: result.usage, headroom: result.headroom,
    resume: budgetStop(diagnostic) ? config?.resume : undefined,
  });
  const terminalReceipt = saveSweepStop(stopOutput, withResume);
  console.log(JSON.stringify({ ...withResume, ...(stopOutput ? { terminalReceipt } : {}) }));
  process.exitCode = 2;
};
try {
  const file = process.argv.find(x => x.startsWith('--config='))?.slice(9);
  config = JSON.parse(fs.readFileSync(assertPrivateArtifact(file), 'utf8'));
  const result = bootstrapSweep(config, { repository: fileURLToPath(new URL('..', import.meta.url)) });
  if (result.outcome !== 'BOOTSTRAP_PREPARED') finish(result);
  else console.log(JSON.stringify(result));
} catch (error) {
  const code = error.diagnostic || error.message;
  let stop;
  try { stop = sweepStop({ error, resume: budgetStop(code) ? config?.resume : undefined }); }
  catch { stop = sweepStop({ error }); }
  finish({ ...stop, outcome: 'BOOTSTRAP_STOPPED' });
}
