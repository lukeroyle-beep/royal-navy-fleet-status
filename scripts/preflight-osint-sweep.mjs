import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assertPrivateArtifact } from './lib/private-artifacts.mjs';
import { productionProbes, collectAfterPreflight } from './lib/sweep-preflight.mjs';

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const repository = fileURLToPath(new URL('..', import.meta.url));
try {
  const config = JSON.parse(fs.readFileSync(assertPrivateArtifact(arg('config')), 'utf8'));
  const output = assertPrivateArtifact(arg('output'));
  if (fs.existsSync(output)) throw new Error('Existing preflight receipt');
  const stage = arg('then');
  if (stage && !['plan', 'indexes'].includes(stage)) throw new Error('Unsupported stage');
  if (stage === 'indexes') assertPrivateArtifact(config.collectionOutput);
  const persist = receipt => {
    // Exclusive creation preserves every attempt; no overwrite or reusable pass token.
    const fd = fs.openSync(output, 'wx', 0o600);
    try { fs.writeFileSync(fd, `${JSON.stringify(receipt, null, 2)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  };
  let persisted = false;
  const { receipt } = await collectAfterPreflight({ config, repository,
    probes: productionProbes({ repository, deadline: Date.now() + 30000 }) }, async receipt => {
    persist(receipt); persisted = true;
    if (!stage) return;
    const args = stage === 'plan'
      ? ['scripts/accelerate-osint-sweep.mjs', '--mode=plan', `--run=${config.run}`, `--state=${config.stateDirectory}`]
      : ['scripts/collect-public-indexes.mjs', `--resume=${config.run}`, `--output=${config.collectionOutput}`];
    // Same executor permissions/environment; no scheduler, arbitrary shell or publication hook.
    execFileSync(process.execPath, args, { cwd: repository, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 2_000_000 });
  });
  if (!persisted) persist(receipt);
  console.log(JSON.stringify(receipt));
  if (receipt.outcome !== 'READY_FOR_COLLECTION') process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ outcome: 'FAILED', diagnostic: 'PREFLIGHT_OR_REQUESTED_STAGE_FAILED', publicationEligible: false }));
  process.exitCode = 1;
}
