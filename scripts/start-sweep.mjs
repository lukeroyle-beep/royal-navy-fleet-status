import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertPrivateArtifact } from './lib/private-artifacts.mjs';
import { readSweepUsage } from './lib/sweep-work-budget.mjs';
import { productionProbes } from './lib/sweep-preflight.mjs';
import { startSweep } from './lib/sweep-startup.mjs';
const arg = name => process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
try {
  const output=assertPrivateArtifact(arg('output'));
  if(fs.existsSync(output))throw new Error('EXISTING_STARTUP_RECEIPT');
  const config=JSON.parse(fs.readFileSync(assertPrivateArtifact(arg('config')),'utf8'));
  const usage=readSweepUsage({sessionPath:config.sessionPath});
  const result=await startSweep({config,usage,checkOnly:process.argv.includes('--check-only'),probes:productionProbes({
    repository:fileURLToPath(new URL('..',import.meta.url)),deadline:Date.now()+30000,
    encryptionQuery:{mode:'native-session',sessionPath:config.sessionPath},
  })});
  const fd=fs.openSync(output,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(result,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  console.log(JSON.stringify({outcome:result.outcome,totalTokens:usage.totalTokens,checks:result.capability?.checks.map(c=>({check:c.check,status:c.status}))||[],collectionStarted:false}));
  if(!['DIRECTORIES_PREPARED','CAPABILITY_CHECK_PASSED'].includes(result.outcome))process.exitCode=2;
} catch(error) { console.log(JSON.stringify({outcome:'STARTUP_STOPPED',diagnostic:error.diagnostic||'STARTUP_INVALID',collectionStarted:false}));process.exitCode=2; }
