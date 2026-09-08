import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolvePrivateInputs } from './lib/private-inputs.mjs';
import { correctionHash, validateReleaseCorrection } from './lib/release-correction.mjs';
import { computeReleaseContentHash } from './lib/sweep.mjs';
import { createPublicProjection, PUBLIC_PROJECTION_METHOD_VERSION } from './lib/public-projection.mjs';

// Legacy non-sensitive fixture only: real evidence never enters this regression fixture.
const source = resolvePrivateInputs({ environment: {} });
const baseline = { entities: source.readJson('vessels'), registry: source.readJson('sources'),
  assessmentLog: source.readJson('assessments'), evidenceItems: source.readJson('evidence').evidence };
baseline.entities.metadata = { ...baseline.entities.metadata, asOfDate:'2026-09-06', releaseRevision:1, releasedAt:'2026-09-08T05:00:00Z' };
const candidate = structuredClone(baseline);
candidate.entities.metadata.releaseRevision = 2;
candidate.entities.metadata.releasedAt = '2026-09-08T10:00:00Z';
const entity = candidate.entities.vessels[0], id = entity.vesselId;
const oldId = candidate.assessmentLog.currentAssessmentIds[id];
const assessment = structuredClone(candidate.assessmentLog.assessments.find(a=>a.assessmentId===oldId));
Object.assign(assessment, { assessmentId:'SYNTHETIC_OWNER_UPDATE', previousAssessmentId:oldId, assessedAt:'2026-09-08T09:00:00Z', assessor:'owner-directed-correction', conflictState:'none' });
assessment.freshness.state='historical';
entity.name += ' corrected';
candidate.assessmentLog.assessments.push(assessment);
candidate.assessmentLog.currentAssessmentIds[id]=assessment.assessmentId;
const added=structuredClone(entity);added.vesselId='synthetic-added';added.name='Synthetic added vessel';candidate.entities.vessels.push(added);
const addedAssessment=structuredClone(assessment);Object.assign(addedAssessment,{assessmentId:'SYNTHETIC_OWNER_ADD',vesselId:added.vesselId,previousAssessmentId:null});
candidate.assessmentLog.assessments.push(addedAssessment);candidate.assessmentLog.currentAssessmentIds[added.vesselId]=addedAssessment.assessmentId;
candidate.registry.officialSocialCoverage.push({vesselId:added.vesselId,searchResult:'not-reviewed',enabled:false,searchedAt:null});
const published=createPublicProjection(baseline.entities,baseline.assessmentLog);
const publicCandidate=createPublicProjection(candidate.entities,candidate.assessmentLog);
const record={schemaVersion:1,kind:'owner-approved-correction',correctionId:'SYNTHETIC_CORRECTION',authority:{actor:'Luke',reference:'Synthetic test only',instruction:'Synthetic correction'},reviewedBy:'test reviewer',reason:'Synthetic additive correction',newCollectionPerformed:false,parentRunId:'SYNTHETIC_PARENT',parentInputsHash:correctionHash(baseline),baselineRelease:baseline.entities.metadata,release:candidate.entities.metadata,reviewedAt:'2026-09-08T09:30:00Z',projectionMethodVersion:PUBLIC_PROJECTION_METHOD_VERSION,candidateInputsHash:correctionHash(candidate),releaseContentHash:computeReleaseContentHash(candidate),changes:[id,added.vesselId].map(vesselId=>({vesselId,action:vesselId===id?'update':'add',basis:'owner-instruction',rationale:'Synthetic instruction',limitations:'No new collection',beforeHash:vesselId===id?correctionHash(published.vessels.find(v=>v.id===id)):null,afterHash:correctionHash(publicCandidate.vessels.find(v=>v.id===vesselId)),assessmentId:candidate.assessmentLog.currentAssessmentIds[vesselId]}))};
const args={record,baseline,candidate,parentGate:{pass:true,runId:record.parentRunId,projection:published},published,histories:Object.fromEntries(['status-history.jsonl','status-location-history.jsonl'].map(name=>[name,{baseline:'{"original":true}\n',current:'{"original":true}\n'+JSON.stringify({snapshotDate:'2026-09-06',releaseRevision:2,releasedAt:candidate.entities.metadata.releasedAt})+'\n'}]))};
assert.deepEqual(validateReleaseCorrection(args),{required:true,pass:true,kind:'owner-approved-correction',correctionId:'SYNTHETIC_CORRECTION',parentRunId:'SYNTHETIC_PARENT',baselineVessels:baseline.entities.vessels.length,candidateVessels:baseline.entities.vessels.length+1,reviewedCorrections:2,newCollectionPerformed:false,reasons:[]});
let rejected=0;
function reject(change, rebind=false) {
 const value=structuredClone(args);change(value);
 if(rebind){value.record.candidateInputsHash=correctionHash(value.candidate);value.record.releaseContentHash=computeReleaseContentHash(value.candidate);}
 assert.throws(()=>validateReleaseCorrection(value));rejected++;
}
reject(a=>a.record.authority=null);
reject(a=>a.record.newCollectionPerformed=true);
reject(a=>a.parentGate.pass=false);
reject(a=>a.parentGate.runId='OTHER');
reject(a=>a.record.projectionMethodVersion='other');
reject(a=>a.record.releaseContentHash='invalid');
reject(a=>a.record.reviewedAt='2099-01-01T00:00:00Z');
reject(a=>a.record.changes.pop());
reject(a=>a.record.changes.push({...a.record.changes[0]}));
reject(a=>a.candidate.entities.vessels[1].name+=' unrelated',true);
reject(a=>a.candidate.assessmentLog.assessments[0].rationale='rewritten',true);
reject(a=>a.candidate.registry.sources[0].name='rewritten',true);
reject(a=>a.candidate.evidenceItems[0].notes='rewritten',true);
reject(a=>a.candidate.registry.officialSocialCoverage.at(-1).searchResult='reviewed',true);
reject(a=>a.candidate.registry.officialSocialCoverage.at(-1).enabled=true,true);
reject(a=>a.candidate.assessmentLog.assessments.at(-1).freshness.state='current',true);
reject(a=>a.candidate.assessmentLog.assessments.at(-1).conflictState='unresolved',true);
reject(a=>a.candidate.entities.retiredVessels.pop(),true);
reject(a=>a.histories['status-history.jsonl'].current='rewritten\n');
reject(a=>a.histories['status-location-history.jsonl'].current+=JSON.stringify({extra:true})+'\n');
reject(a=>a.record.changes[0].afterHash='stale');
reject(a=>a.published.vessels[0].name='wrong published base');
console.log(`Release correction tests passed: additive inventory accepted; ${rejected} tampering/coverage/history cases rejected.`);
