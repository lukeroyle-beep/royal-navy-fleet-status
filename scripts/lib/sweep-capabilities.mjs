import fs from 'node:fs';
import { assertPrivateArtifact } from './private-artifacts.mjs';

// An early capability probe is not preflight, backup evidence or collection authority.
// Use the actual executor's probes; never ingest a separately supplied encryption pass.
export async function checkSweepCapabilities({ config, probes, now = () => Date.now() }) {
  const started = now(), checks = [];
  let step = 'CONFIGURATION';
  const check = async (name, operation) => {
    step = name; const began = now();
    try {
      await operation();
      checks.push({ check: name, status: 'pass', elapsedMs: Math.max(0, now() - began) });
    } catch (error) {
      const diagnostic = /^[A-Z][A-Z0-9_]+$/.test(error.diagnostic || '') ? error.diagnostic : `${name}_UNAVAILABLE`;
      checks.push({ check: name, status: 'fail', diagnostic, elapsedMs: Math.max(0, now() - began) });
      throw Object.assign(new Error(diagnostic), { diagnostic });
    }
  };
  const fail = diagnostic => { throw Object.assign(new Error(diagnostic), { diagnostic }); };
  let diagnostic = null;
  try {
    await check('CONFIGURATION', () => {
      if (config?.schemaVersion !== 1) fail('CAPABILITY_CONFIG_INVALID');
      for (const key of ['privateRoot', 'backupDirectory']) {
        assertPrivateArtifact(config[key]);
        if (!fs.statSync(config[key]).isDirectory()) fail('CAPABILITY_CONFIG_INVALID');
      }
      if (config.ownerPid != null && (!Number.isSafeInteger(config.ownerPid) || config.ownerPid <= 0)) fail('CAPABILITY_CONFIG_INVALID');
    });
    await check('BACKUP_ENCRYPTION', async () => {
      if (!await probes.encrypted(config.backupDirectory, config.privateRoot)) fail('BACKUP_ENCRYPTION_UNAVAILABLE');
    });
    if (config.ownerPid != null) await check('OWNER_LIVENESS', () => {
      if (!probes.ownerAlive(config.ownerPid)) fail('OWNER_NOT_CONFIRMED');
    });
    await check('PRIVATE_WRITE', () => probes.write(config.privateRoot));
    await check('BACKUP_WRITE', () => probes.write(config.backupDirectory));
  } catch (error) { diagnostic = error.diagnostic; }
  return {
    schemaVersion: 1, kind: 'rnfs-early-capability-check', runId: null,
    startedAt: new Date(started).toISOString(), finishedAt: new Date(now()).toISOString(),
    elapsedMs: Math.max(0, now() - started), checks,
    outcome: diagnostic ? 'DEFERRED_WITH_JUSTIFICATION' : 'CAPABILITY_CHECK_PASSED', diagnostic,
    ownerChecked: checks.some(c => c.check === 'OWNER_LIVENESS' && c.status === 'pass'),
    preflightPassed: false, backupRestoreVerified: false, collectionStarted: false,
    publicationEligible: false, noChangeClaimAllowed: false, modelCalls: 0,
  };
}
