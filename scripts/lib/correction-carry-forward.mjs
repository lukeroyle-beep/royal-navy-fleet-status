import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { validateCorrectionInputs } from './validate-correction-inputs.mjs';
import { validateSweepBaselineAgainstState } from './sweep.mjs';
import { createPublicProjection } from './public-projection.mjs';
import { digest } from './acquisition.mjs';

// Only native authentication can issue this in-process capability. JSON cannot
// supply a trusted flag, and changing either the run or assessment invalidates it.
const authenticated = new WeakMap();
export function authenticateCorrectionCarryForward({ root, privateInputs, run }) {
  const entities = privateInputs.readJson('vessels');
  const assessmentLog = privateInputs.readJson('assessments');
  const registry = privateInputs.readJson('sources');
  const evidenceItems = privateInputs.readJson('evidence').evidence;
  validateSweepBaselineAgainstState(run, { entities, assessmentLog, evidenceItems });
  const directory = privateInputs.pathFor('sweepRuns');
  const runs = fs.readdirSync(directory).filter(n => n.endsWith('.json')).map(n => JSON.parse(fs.readFileSync(path.join(directory,n),'utf8')));
  const gate = validateCorrectionInputs({ root, privateInputs, runs, candidate:{ entities, registry, assessmentLog, evidenceItems } });
  assert.equal(gate?.pass, true, 'Carry-forward requires an authenticated correction');
  const published = JSON.parse(execFileSync('git',['show','HEAD:data/royal-navy/vessels.json'],{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024}));
  assert.deepEqual(createPublicProjection(entities,assessmentLog,evidenceItems), published, 'Correction baseline is not the published release');
  const proof = Object.freeze({});
  authenticated.set(proof, { runId:run.runId, baselineStateHash:run.baselineStateHash,
    correctionId:gate.correctionId,
    assessments:new Map(assessmentLog.assessments.filter(a => assessmentLog.currentAssessmentIds[a.vesselId] === a.assessmentId).map(a => [a.assessmentId,digest(a)])) });
  return proof;
}
export function correctionCarryForward(proof, run, assessment) {
  const entry = proof && authenticated.get(proof);
  if (!entry || !assessment || entry.runId !== run.runId || entry.baselineStateHash !== run.baselineStateHash ||
      run.coverageInputs?.baselineAssessmentIds?.[assessment.vesselId] !== assessment.assessmentId ||
      entry.assessments.get(assessment.assessmentId) !== digest(assessment)) return null;
  return { kind:'authenticated-published-correction', correctionId:entry.correctionId, assessmentHash:digest(assessment), newObservation:false };
}
