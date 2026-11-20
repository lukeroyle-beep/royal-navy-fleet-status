import fs from 'node:fs';
import { readSweepUsage, evaluateSweepHeadroom, admitSweepBatch } from './lib/sweep-work-budget.mjs';
import { prepareSweepDirectories } from './lib/sweep-preparation.mjs';
import { assertPrivateArtifact } from './lib/private-artifacts.mjs';
import { sweepStop, saveSweepStop } from './lib/sweep-stop.mjs';
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const budgetStop = code => code === 'WORK_BUDGET_STOP' || code === 'WORK_HEADROOM_STOP';
const resumeInput = arg('resume') ? JSON.parse(fs.readFileSync(assertPrivateArtifact(arg('resume')), 'utf8')) : undefined;
const stop = receipt => {
  const terminalReceipt = saveSweepStop(arg('stop-output'), receipt);
  console.log(JSON.stringify({ ...receipt, ...(arg('stop-output') ? { terminalReceipt } : {}) }));
  process.exitCode = 2;
};
try {
  const usage = readSweepUsage({ sessionPath: arg('session') });
  if (!usage.allowed) stop(sweepStop({ diagnostic: 'WORK_BUDGET_STOP', usage, resume: resumeInput }));
  else {
    const planPath = arg('headroom');
    const plan = planPath === undefined ? undefined : JSON.parse(fs.readFileSync(assertPrivateArtifact(planPath), 'utf8'));
    const headroom = process.argv.includes('--batch') ? admitSweepBatch(usage, plan) :
      (plan === undefined ? undefined : evaluateSweepHeadroom(usage, plan));
    if (headroom && !headroom.allowed) stop(sweepStop({ diagnostic: headroom.outcome, usage, headroom, resume: resumeInput }));
    else {
      const directory = arg('prepare');
      const config = directory ? prepareSweepDirectories(directory) : null;
      console.log(JSON.stringify({ usage, ...(headroom ? { headroom } : {}), ...(config ? { config } : {}), collectionStarted: false, publicationEligible: false }));
    }
  }
} catch (error) {
  const code = error.diagnostic || error.message;
  stop(sweepStop({ error, resume: budgetStop(code) ? resumeInput : undefined }));
}
