import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertPrivateArtifact } from './lib/private-artifacts.mjs';
import { bootstrapSweep } from './lib/sweep-bootstrap.mjs';
import { sweepStop, saveSweepStop } from './lib/sweep-stop.mjs';
const stopOutput = process.argv.find(x=>x.startsWith('--stop-output='))?.slice(14);
const finish = result => {
  const terminalReceipt = saveSweepStop(stopOutput, result.kind==='rnfs-terminal-stop' ? result :
    sweepStop({diagnostic:result.diagnostic || result.outcome,usage:result.usage,headroom:result.headroom}));
  console.log(JSON.stringify({...result, ...(stopOutput ? {terminalReceipt} : {})}));
  process.exitCode=2;
};
try {
  const file = process.argv.find(x=>x.startsWith('--config='))?.slice(9);
  const config = JSON.parse(fs.readFileSync(assertPrivateArtifact(file),'utf8'));
  const result = bootstrapSweep(config, {repository:fileURLToPath(new URL('..',import.meta.url))});
  if(result.outcome !== 'BOOTSTRAP_PREPARED') finish(result);
  else console.log(JSON.stringify(result));
} catch(error) {
  const stop=sweepStop({error});
  finish({...stop,outcome:'BOOTSTRAP_STOPPED'});
}
