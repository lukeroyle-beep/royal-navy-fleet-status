import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertPrivateArtifact } from './lib/private-artifacts.mjs';
import { bootstrapSweep } from './lib/sweep-bootstrap.mjs';
try {
  const file = process.argv.find(x=>x.startsWith('--config='))?.slice(9);
  const config = JSON.parse(fs.readFileSync(assertPrivateArtifact(file),'utf8'));
  const result = bootstrapSweep(config, {repository:fileURLToPath(new URL('..',import.meta.url))});
  console.log(JSON.stringify(result));
  if(result.outcome !== 'BOOTSTRAP_PREPARED') process.exitCode=2;
} catch(error) {
  console.log(JSON.stringify({outcome:'BOOTSTRAP_STOPPED',diagnostic:/^[A-Z_]+$/.test(error.message)?error.message:'BOOTSTRAP_INVALID',collectionStarted:false}));
  process.exitCode=2;
}
