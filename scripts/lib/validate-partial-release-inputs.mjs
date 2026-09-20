import assert from 'node:assert/strict';
import {validateFleet} from '../../src/components/ScenarioLoader.js';
import {assertCompleteMapRepresentation} from '../../src/utils/map.js';
import { execFileSync } from 'node:child_process';
import { digest } from './acquisition.mjs';
import { createPublicProjection } from './public-projection.mjs';
import { validateEvidenceLog, validateAssessmentLog, validateSourceRegistry, assessEvidenceSet } from './provenance.mjs';
import { computeReleaseContentHash } from './sweep.mjs';
import { validatePartialRelease } from './partial-release-20260920.mjs';

// Populated only after review of the exact September 20 candidate and receipt.
export const APPROVED_PARTIAL_RECORD_HASH = '81ea5b8d81a6e6d772cb5319cec73c9c77df2c3897758ec5ed405c3c0081101b';
const same=(a,b,message)=>assert.equal(digest(a),digest(b),message);
export function validatePartialReleaseRecord({record,candidate,publishedBaseline}) {
  assert.equal(digest(record),APPROVED_PARTIAL_RECORD_HASH,'Unapproved or altered partial release record');
  assert.equal(record.schemaVersion,1);
  const baseline=record.baselineInputs, entities=candidate.entities, m=entities.metadata;
  assert.equal(m.asOfDate,'2026-09-20');assert.equal(m.releaseRevision,1);
  assert.ok(Number.isFinite(Date.parse(m.releasedAt)) && Date.parse(m.releasedAt)>Date.parse(baseline.entities.metadata.releasedAt));
  same(m.sweepCoverage,{classification:'partial',runId:record.run.runId,reviewedVessels:23,pendingVessels:46,sourceChecksSuccessful:74,sourceChecksRequired:77,retainedVesselRecords:61,updatedReportRecords:8,noChangeClaimAllowed:false},'Partial coverage disclosure differs');
  const {metadata:oldMetadata,...oldEntities}=baseline.entities,{metadata,...newEntities}=entities;
  same(newEntities,oldEntities,'Partial release changed entity inventory');
  const stripRelease=({asOfDate,releaseRevision,releasedAt,sweepCoverage,...rest})=>rest;
  same(stripRelease(metadata),stripRelease(oldMetadata),'Unrelated metadata changed');
  same(candidate.registry,baseline.registry,'Source policy changed');
  same(candidate.evidenceItems.slice(0,baseline.evidenceItems.length),baseline.evidenceItems,'Evidence history changed');
  same(candidate.assessmentLog.assessments.slice(0,baseline.assessmentLog.assessments.length),baseline.assessmentLog.assessments,'Assessment history changed');
  assert.equal(candidate.evidenceItems.length,baseline.evidenceItems.length+8);
  assert.equal(candidate.assessmentLog.assessments.length,baseline.assessmentLog.assessments.length+8);
  const current=entities.vessels.map(v=>v.vesselId),known=[...current,...(entities.retiredVessels||[]).map(v=>v.vesselId)];
  validateSourceRegistry(candidate.registry,known,current);
  validateEvidenceLog({schemaVersion:'1.0.0',evidence:candidate.evidenceItems},candidate.registry.sources.map(s=>s.sourceId),known);
  validateAssessmentLog(candidate.assessmentLog,candidate.evidenceItems,known,current);
  const baselinePublic=createPublicProjection(baseline.entities,baseline.assessmentLog,baseline.evidenceItems);
  same(baselinePublic,publishedBaseline,'Baseline does not match authenticated published projection');
  const projection=createPublicProjection(entities,candidate.assessmentLog,candidate.evidenceItems);
  validateFleet(projection);assertCompleteMapRepresentation(projection.vessels);
  const rows=data=>data.vessels.map(v=>({...v,vesselId:v.id}));
  const result=validatePartialRelease({...record,baselineRows:rows(baselinePublic),candidateRows:rows(projection)});
  assert.equal(result.updated,8);assert.equal(result.retained,61);
  const raw=new Map(record.acquisition.records.flatMap(r=>r.candidates||[]).map(c=>[c.evidenceId,c]));
  for(const e of candidate.evidenceItems.slice(baseline.evidenceItems.length)) {
    const c=raw.get(e.reviewProvenance?.candidateId);
    assert.ok(c && digest(c)===e.reviewProvenance.candidateHash,'Unbound normalized evidence');
    assert.equal(e.sourceId,c.sourceId);assert.equal(e.contentHash,c.contentHash);
    assert.ok(Date.parse(e.publishedAt)<Date.parse(record.run.window.to),'Post-cutoff publication');
    assert.ok(Date.parse(e.observation.to)<Date.parse(record.run.window.to),'Post-cutoff observation');
    const quality=assessEvidenceSet({vesselId:e.vesselId,evidence:[e],sources:candidate.registry.sources,assessedAt:record.run.window.to});
    assert.deepEqual(quality.selectedEvidenceIds,[e.evidenceId],'Ineligible update');
    const next=candidate.assessmentLog.assessments.find(a=>a.assessmentId===candidate.assessmentLog.currentAssessmentIds[e.vesselId]);
    const old=baseline.assessmentLog.assessments.find(a=>a.assessmentId===baseline.assessmentLog.currentAssessmentIds[e.vesselId]);
    assert.equal(next.assessedState.status,old.assessedState.status,'Location review changed status');
    assert.equal(next.confidenceLevel,quality.confidenceLevel,'Unsupported confidence');
    assert.equal(next.previousAssessmentId,old.assessmentId,'Broken assessment chain');
    assert.ok(Date.parse(next.assessedAt)<=Date.parse(m.releasedAt),'Assessment after release');
  }
  same(computeReleaseContentHash(candidate),record.releaseContentHash,'Candidate content changed');
  return {required:true,pass:true,kind:'owner-approved-partial-release',runId:record.run.runId,coverage:'partial',reviewedVessels:23,pendingVessels:46,updatedReports:8,retainedRecords:61,reasons:[]};
}
export function validatePartialReleaseInputs({root,privateInputs,candidate}) {
  try {privateInputs.pathFor('partialRelease',{mustExist:false});}
  catch(error){if(error.message.includes('manifest has no partialRelease entry'))return null;throw error;}
  assert.equal(privateInputs.mode,'external','Partial release requires external private inputs');
  const record=privateInputs.readJson('partialRelease');
  assert.match(record.baselineCommit,/^[a-f0-9]{40}$/);
  execFileSync('git',['merge-base','--is-ancestor',record.baselineCommit,'HEAD'],{cwd:root,stdio:'pipe'});
  const publishedBaseline=JSON.parse(execFileSync('git',['show',`${record.baselineCommit}:data/royal-navy/vessels.json`],{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024}));
  return validatePartialReleaseRecord({record,candidate,publishedBaseline});
}
