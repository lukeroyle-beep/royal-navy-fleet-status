import { checkSweepCapabilities } from './sweep-capabilities.mjs';
import { prepareSweepDirectories } from './sweep-preparation.mjs';

// No run, owner, backup or collection. The CLI supplies actual native probes.
export async function startSweep({ config, usage, probes, checkOnly = false }) {
  if (!usage.allowed) return {outcome:'WORK_BUDGET_STOP',usage,collectionStarted:false};
  const capability = await checkSweepCapabilities({config,probes});
  if (capability.diagnostic || checkOnly) return {outcome:capability.outcome,usage,capability,collectionStarted:false};
  const preparation = prepareSweepDirectories(config.attemptDirectory);
  preparation.usageBudget = {sessionPath:config.sessionPath};
  preparation.encryptionQuery = {mode:'native-session',sessionPath:config.sessionPath};
  return {outcome:'DIRECTORIES_PREPARED',usage,capability,preparation,collectionStarted:false};
}
