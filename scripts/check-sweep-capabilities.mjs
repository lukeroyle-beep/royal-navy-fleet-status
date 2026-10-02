import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertPrivateArtifact } from './lib/private-artifacts.mjs';
import { productionProbes } from './lib/sweep-preflight.mjs';
import { checkSweepCapabilities } from './lib/sweep-capabilities.mjs';
import { reportWithoutChangingSweep, recordEarlyFailure } from './lib/command-centre-hook.mjs';

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
try {
  const output = assertPrivateArtifact(arg('output'));
  if (fs.existsSync(output)) throw new Error('Existing capability receipt');
  const config = JSON.parse(fs.readFileSync(assertPrivateArtifact(arg('config')), 'utf8'));
  const receipt = await checkSweepCapabilities({ config, probes: productionProbes({
    repository: fileURLToPath(new URL('..', import.meta.url)), deadline: Date.now() + 30000,
  }) });
  const fd = fs.openSync(output, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(receipt, null, 2) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  reportWithoutChangingSweep({ receipt, receiptPath: output });
  console.log(JSON.stringify(receipt));
  process.exitCode = receipt.diagnostic ? 1 : 0;
} catch {
  try { recordEarlyFailure({}); } catch { /* retain original failure */ }
  console.error(JSON.stringify({ outcome: 'FAILED', diagnostic: 'CAPABILITY_CHECK_FAILED', publicationEligible: false }));
  process.exitCode = 1;
}
