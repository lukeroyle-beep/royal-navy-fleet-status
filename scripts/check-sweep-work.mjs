import fs from 'node:fs';
import { readSweepUsage, evaluateSweepHeadroom } from './lib/sweep-work-budget.mjs';
import { prepareSweepDirectories } from './lib/sweep-preparation.mjs';
import { assertPrivateArtifact } from './lib/private-artifacts.mjs';
import { sweepStop, saveSweepStop } from './lib/sweep-stop.mjs';
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const stop = receipt => {
  const terminalReceipt=saveSweepStop(arg('stop-output'),receipt);
  console.log(JSON.stringify({...receipt,...(arg('stop-output') ? {terminalReceipt} : {})}));
  process.exitCode=2;
};
try {
  const usage = readSweepUsage({ sessionPath: arg('session') });
  if (!usage.allowed) stop(sweepStop({diagnostic:'WORK_BUDGET_STOP',usage}));
  else {
    const plan = arg('headroom');
    const headroom = plan === undefined ? undefined : evaluateSweepHeadroom(usage,JSON.parse(fs.readFileSync(assertPrivateArtifact(plan),'utf8')));
    if (headroom && !headroom.allowed) stop(sweepStop({diagnostic:headroom.outcome,usage,headroom}));
    else {
      const directory = arg('prepare');
      const config = directory ? prepareSweepDirectories(directory) : null;
      console.log(JSON.stringify({ usage, ...(headroom ? {headroom} : {}), ...(config ? { config } : {}), collectionStarted: false, publicationEligible: false }));
    }
  }
} catch (error) {
  stop(sweepStop({error}));
}
