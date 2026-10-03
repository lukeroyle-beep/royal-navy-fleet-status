import fs from 'node:fs';
import path from 'node:path';
import { assertPrivateArtifact } from './private-artifacts.mjs';
import { stageArguments } from './preflight-stage.mjs';

// Fresh attempts only. Existing runs require explicit recovery, never overwrite.
export function prepareSweepDirectories(directory) {
  const root = assertPrivateArtifact(directory);
  if (fs.existsSync(root)) throw new Error('ATTEMPT_ALREADY_EXISTS');
  const config = {
    schemaVersion: 1,
    run: path.join(root, 'checkpoint', 'sweep-run.json'),
    stateDirectory: path.join(root, 'checkpoint', 'acquisition'),
    ownerLock: path.join(root, 'checkpoint', 'owner.lock'),
    backupReceipt: path.join(root, 'backup-readiness.json'),
    collectionOutput: path.join(root, 'discovery.json'),
    evidenceDirectories: [path.join(root, 'packets'), path.join(root, 'browser')],
  };
  stageArguments('indexes', config); // Validate the absent output before any mutation.
  fs.mkdirSync(root, { mode: 0o700 });
  fs.mkdirSync(path.join(root, 'checkpoint'), { mode: 0o700 });
  for (const dir of [config.stateDirectory, ...config.evidenceDirectories]) fs.mkdirSync(dir, { mode: 0o700 });
  // The collector owns creation of discovery.json and discovery.json.checkpoints.
  return config;
}
