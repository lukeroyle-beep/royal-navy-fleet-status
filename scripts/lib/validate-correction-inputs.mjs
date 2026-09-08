import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { correctionHash, validateReleaseCorrection } from './release-correction.mjs';

// Authenticate each prior correction under the code that shipped it, ending at the
// original sweep. Explicit hashes, ancestry and a depth bound prevent chain substitution.
export function validateCorrectionChain({ record, candidate, publishedAt = null, depth = 0, seen = new Set(), io }) {
  assert.ok(depth < 16, 'Correction chain exceeds maximum depth');
  const digest = correctionHash(record);
  assert.ok(!seen.has(digest), 'Correction chain cycle');
  seen.add(digest);
  io.assertAncestor(record.baselineCommit, publishedAt || 'HEAD');
  const published = io.readPublished(record.baselineCommit);
  let parentGate;
  if (record.parentCorrection) {
    assert.equal(correctionHash(record.parentCorrection), record.parentCorrectionHash, 'Parent correction was altered');
    assert.equal(record.parentCorrection.parentRunId, record.parentRunId, 'Correction chain changes root sweep');
    assert.equal(record.parentCorrection.parentRunHash, record.parentRunHash, 'Correction chain changes root seal');
    const parent = validateCorrectionChain({ record: record.parentCorrection, candidate: record.baselineInputs,
      publishedAt: record.baselineCommit, depth: depth + 1, seen, io });
    parentGate = { ...parent, runId:record.parentRunId, projection:published };
  } else {
    assert.equal(record.parentCorrectionHash, undefined, 'Missing parent correction');
    parentGate = io.authenticateSweep(record);
  }
  const args = { record, baseline:record.baselineInputs, candidate, parentGate, published,
    histories:io.readHistories(record.baselineCommit, publishedAt) };
  return publishedAt ? io.validatePublished(publishedAt, args) : validateReleaseCorrection(args);
}

export function validateCorrectionInputs({ root, privateInputs, candidate, runs }) {
  try { privateInputs.pathFor('releaseCorrection', { mustExist:false }); }
  catch (error) {
    if (error.message.includes('manifest has no releaseCorrection entry')) return null;
    throw error;
  }
  assert.notEqual(privateInputs.mode, 'legacy', 'Real corrections must remain private');
  const record = privateInputs.readJson('releaseCorrection'); // Includes realpath containment.
  const git = args => execFileSync('git', args, { cwd:root, encoding:'utf8', maxBuffer:20*1024*1024 });
  const at = (commit, name) => git(['show', `${commit}:data/royal-navy/${name}`]);
  function archived(commit, code, input) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-correction-base-'));
    try {
      const archive = execFileSync('git', ['archive', commit, 'scripts','src','package.json'], {cwd:root,maxBuffer:20*1024*1024});
      execFileSync('tar', ['-x','-C',directory], {input:archive});
      return JSON.parse(execFileSync(process.execPath, ['--input-type=module','-e',code], {
        cwd:directory,input:JSON.stringify(input),encoding:'utf8',maxBuffer:20*1024*1024,
      }));
    } finally { fs.rmSync(directory,{recursive:true,force:true}); }
  }
  return validateCorrectionChain({ record, candidate, io: {
    assertAncestor(commit, descendant) {
      assert.match(commit, /^[a-f0-9]{40}$/, 'Full baseline commit required');
      if (descendant !== 'HEAD') assert.match(descendant, /^[a-f0-9]{40}$/);
      git(['merge-base','--is-ancestor',commit,descendant]);
    },
    readPublished: commit => JSON.parse(at(commit,'vessels.json')),
    readHistories: (base, current) => Object.fromEntries(['status-history.jsonl','status-location-history.jsonl'].map(name=>[name,{
      baseline:at(base,name),current:current ? at(current,name) : fs.readFileSync(path.join(root,'data/royal-navy',name),'utf8'),
    }])),
    authenticateSweep(item) {
      const parent = runs.find(run=>run.runId===item.parentRunId);
      assert.ok(parent,'Parent sweep is missing');
      assert.equal(correctionHash(parent),item.parentRunHash,'Parent sweep was altered');
      return archived(item.baselineCommit, `
        import fs from 'node:fs';
        import {validateReleaseSweepGate} from './scripts/lib/sweep.mjs';
        import {createPublicProjection} from './scripts/lib/public-projection.mjs';
        const {baseline,parent}=JSON.parse(fs.readFileSync(0,'utf8')), m=baseline.entities.metadata;
        const gate=validateReleaseSweepGate({...baseline,runs:[parent],datasetDate:m.asOfDate,releaseRevision:m.releaseRevision,releasedAt:m.releasedAt});
        console.log(JSON.stringify({...gate,projection:createPublicProjection(baseline.entities,baseline.assessmentLog)}));
      `,{baseline:item.baselineInputs,parent});
    },
    validatePublished(commit, args) {
      return archived(commit, `
        import fs from 'node:fs';
        import {validateReleaseCorrection} from './scripts/lib/release-correction.mjs';
        import {createPublicProjection} from './scripts/lib/public-projection.mjs';
        import assert from 'node:assert/strict';
        const {args,published}=JSON.parse(fs.readFileSync(0,'utf8'));
        const result=validateReleaseCorrection(args);
        assert.deepEqual(createPublicProjection(args.candidate.entities,args.candidate.assessmentLog),published,'Correction inputs differ from published bytes');
        console.log(JSON.stringify(result));
      `,{args,published:JSON.parse(at(commit,'vessels.json'))});
    },
  }});
}
