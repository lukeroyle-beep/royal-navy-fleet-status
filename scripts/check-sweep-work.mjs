import { readSweepUsage } from './lib/sweep-work-budget.mjs';
import { prepareSweepDirectories } from './lib/sweep-preparation.mjs';
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
try {
  const usage = readSweepUsage({ sessionPath: arg('session') });
  if (!usage.allowed) { console.log(JSON.stringify(usage)); process.exitCode = 2; }
  else {
    const directory = arg('prepare');
    const config = directory ? prepareSweepDirectories(directory) : null;
    console.log(JSON.stringify({ usage, ...(config ? { config } : {}), collectionStarted: false, publicationEligible: false }));
  }
} catch (error) {
  console.log(JSON.stringify({ outcome: 'WORK_STOPPED', diagnostic: error.diagnostic || 'PREPARATION_OR_USAGE_UNAVAILABLE', collectionStarted: false }));
  process.exitCode = 2;
}
