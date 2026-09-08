import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { correctionHash, validateReleaseCorrection } from './release-correction.mjs';

// Original Git code authenticates the original seal, including its projection version.
// Nothing in the correction file is executable; the commit must already be an ancestor.
export function validateCorrectionInputs({ root, privateInputs, candidate, runs }) {
  let recordPath;
  try { recordPath = privateInputs.pathFor('releaseCorrection', { mustExist: false }); }
  catch (error) {
    if (error.message.includes('manifest has no releaseCorrection entry')) return null;
    throw error;
  }
  assert.notEqual(privateInputs.mode, 'legacy', 'Real corrections must remain private');
  recordPath = privateInputs.pathFor('releaseCorrection'); // Recheck containment after symlink resolution.
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  assert.match(record.baselineCommit, /^[a-f0-9]{40}$/, 'Full baseline commit required');
  execFileSync('git', ['merge-base', '--is-ancestor', record.baselineCommit, 'HEAD'], { cwd: root });
  const parent = runs.find(run => run.runId === record.parentRunId);
  assert.ok(parent, 'Parent sweep is missing');
  assert.equal(correctionHash(parent), record.parentRunHash, 'Parent sweep was altered');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-correction-base-'));
  try {
    const archive = execFileSync('git', ['archive', record.baselineCommit, 'scripts', 'src', 'package.json'], { cwd: root, maxBuffer: 20 * 1024 * 1024 });
    execFileSync('tar', ['-x', '-C', directory], { input: archive });
    const code = `
      import fs from 'node:fs';
      import { validateReleaseSweepGate } from './scripts/lib/sweep.mjs';
      import { createPublicProjection } from './scripts/lib/public-projection.mjs';
      const { baseline, parent } = JSON.parse(fs.readFileSync(0, 'utf8'));
      const metadata = baseline.entities.metadata;
      const gate = validateReleaseSweepGate({ ...baseline, runs:[parent], datasetDate:metadata.asOfDate,
        releaseRevision:metadata.releaseRevision, releasedAt:metadata.releasedAt });
      console.log(JSON.stringify({...gate, projection:createPublicProjection(baseline.entities, baseline.assessmentLog)}));
    `;
    const parentGate = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      cwd: directory, input: JSON.stringify({ baseline: record.baselineInputs, parent }), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
    }));
    const atBase = name => execFileSync('git', ['show', `${record.baselineCommit}:data/royal-navy/${name}`], { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const histories = Object.fromEntries(['status-history.jsonl', 'status-location-history.jsonl'].map(name => [name, {
      baseline: atBase(name), current: fs.readFileSync(path.join(root, 'data/royal-navy', name), 'utf8'),
    }]));
    return validateReleaseCorrection({ record, baseline: record.baselineInputs, candidate, parentGate,
      published: JSON.parse(atBase('vessels.json')), histories });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
