import { checkSweepCapabilities } from './sweep-capabilities.mjs';
import { prepareSweepDirectories } from './sweep-preparation.mjs';
import { evaluateSweepHeadroom } from './sweep-work-budget.mjs';

// No run, owner, backup or collection. The CLI supplies actual native probes.
export async function startSweep({ config, usage, probes, checkOnly = false }) {
  if (!usage.allowed) return {outcome:'WORK_BUDGET_STOP',usage,collectionStarted:false};
  const headroom = config.headroom === undefined ? undefined : evaluateSweepHeadroom(usage, config.headroom);
  if (headroom && !headroom.allowed) return {outcome:headroom.outcome,usage,headroom,collectionStarted:false};
  const capability = await checkSweepCapabilities({config,probes});
  if (capability.diagnostic || checkOnly) return {outcome:capability.outcome,usage,capability,...(headroom ? {headroom} : {}),collectionStarted:false};
  const preparation = prepareSweepDirectories(config.attemptDirectory);
  preparation.usageBudget = {sessionPath:config.sessionPath,...(config.headroom === undefined ? {} : {headroom:config.headroom})};
  preparation.encryptionQuery = {mode:'native-session',sessionPath:config.sessionPath};
  return {outcome:'DIRECTORIES_PREPARED',usage,capability,preparation,...(headroom ? {headroom} : {}),collectionStarted:false};
}
