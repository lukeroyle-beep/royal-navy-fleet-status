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
const published=createPublicProjection(baseline.entities,baseline.assessmentLog,baseline.evidenceItems);
const publicCandidate=createPublicProjection(candidate.entities,candidate.assessmentLog,candidate.evidenceItems);
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

// A home-port correction retains the exact operational assessment and chains the
// prior release, rather than editing its seal or claiming another vessel sweep.
const homeBaseline=structuredClone(candidate), homeCandidate=structuredClone(candidate);
homeCandidate.entities.metadata.releaseRevision=3;
homeCandidate.entities.metadata.releasedAt='2026-09-08T12:00:00Z';
homeCandidate.entities.vessels.find(v=>v.vesselId===added.vesselId).homePort='Marchwood Military Port, Southampton';
const homePublic=createPublicProjection(homeCandidate.entities,homeCandidate.assessmentLog,homeCandidate.evidenceItems);
const homeRecord={...structuredClone(record),baselineCommit:'b'.repeat(40),baselineInputs:homeBaseline,baselineRelease:homeBaseline.entities.metadata,release:homeCandidate.entities.metadata,reviewedAt:'2026-09-08T11:00:00Z',parentInputsHash:correctionHash(homeBaseline),candidateInputsHash:correctionHash(homeCandidate),releaseContentHash:computeReleaseContentHash(homeCandidate),changes:[{...record.changes[1],action:'update',mode:'home-port-only',beforeHash:correctionHash(publicCandidate.vessels.at(-1)),afterHash:correctionHash(homePublic.vessels.at(-1))}]};
const homeHistories=Object.fromEntries(Object.entries(args.histories).map(([name,h])=>[name,{baseline:h.current,current:h.current+JSON.stringify({snapshotDate:'2026-09-06',releaseRevision:3,releasedAt:homeCandidate.entities.metadata.releasedAt})+'\n'}]));
const homeArgs={record:homeRecord,baseline:homeBaseline,candidate:homeCandidate,published:publicCandidate,parentGate:{pass:true,runId:record.parentRunId,projection:publicCandidate},histories:homeHistories};
assert.equal(validateReleaseCorrection(homeArgs).pass,true);
for(const mutate of [
 a=>a.candidate.entities.vessels.at(-1).name='unreviewed name',
 a=>a.candidate.assessmentLog.assessments.at(-1).assessedState.status='Unknown',
 a=>a.candidate.assessmentLog.currentAssessmentIds[added.vesselId]=oldId,
 a=>a.candidate.assessmentLog.assessments.push({...addedAssessment,assessmentId:'UNNECESSARY_NEW_ASSESSMENT'}),
 a=>a.candidate.entities.vessels.at(-1).homePort='',
 a=>a.record.changes[0].mode='unknown',
]) {
 const a=structuredClone(homeArgs);mutate(a);
 a.record.candidateInputsHash=correctionHash(a.candidate);
 try {a.record.releaseContentHash=computeReleaseContentHash(a.candidate);} catch {} // A broken binding must fail too.
 assert.throws(()=>validateReleaseCorrection(a));
}
const {validateCorrectionChain}=await import('./lib/validate-correction-inputs.mjs');
const parentRecord={...structuredClone(record),baselineInputs:baseline,baselineCommit:'a'.repeat(40),parentRunHash:'seal'};
Object.assign(homeRecord,{parentRunHash:'seal',parentCorrection:parentRecord,parentCorrectionHash:correctionHash(parentRecord)});
const ancestry=[];
const io={
 assertAncestor:(base,descendant)=>{assert.ok((base==='b'.repeat(40)&&descendant==='HEAD')||(base==='a'.repeat(40)&&descendant==='b'.repeat(40)));ancestry.push([base,descendant]);},
 readPublished:commit=>commit==='a'.repeat(40)?published:publicCandidate,
 readHistories:base=>base==='a'.repeat(40)?args.histories:homeHistories,
 authenticateSweep:item=>{assert.equal(item.baselineRelease.releaseRevision,1);return args.parentGate;},
 validatePublished:(commit,a)=>{assert.equal(commit,'b'.repeat(40));return validateReleaseCorrection(a);},
};
assert.equal(validateCorrectionChain({record:homeRecord,candidate:homeCandidate,io}).pass,true);
assert.equal(ancestry.length,2);
for(const mutate of [
 r=>r.parentCorrection.reason='altered parent',
 r=>delete r.parentCorrection,
 r=>r.parentRunId='wrong root',
 r=>r.parentRunHash='wrong seal',
 r=>r.baselineCommit='c'.repeat(40),
]) {const r=structuredClone(homeRecord);mutate(r);assert.throws(()=>validateCorrectionChain({record:r,candidate:homeCandidate,io}));}
assert.throws(()=>validateCorrectionChain({record:homeRecord,candidate:homeCandidate,depth:16,io}));
assert.throws(()=>validateCorrectionChain({record:homeRecord,candidate:homeCandidate,seen:new Set([correctionHash(homeRecord)]),io}));
console.log('Home-port-only and chained corrections passed; operational edits, parent tampering, ancestry and recursion failures rejected.');

// A display correction can append exactly the reviewed historical support row
// and its linked current retention decision, while collected evidence stays equal.
const displayBaseline=structuredClone(baseline);
displayBaseline.entities.vessels=[structuredClone(baseline.entities.vessels[0])];
const displayId=displayBaseline.entities.vessels[0].vesselId;
displayBaseline.registry.officialSocialCoverage=displayBaseline.registry.officialSocialCoverage.filter(v=>v.vesselId===displayId);
const originalAssessment=structuredClone(baseline.assessmentLog.assessments.find(a=>a.assessmentId===baseline.assessmentLog.currentAssessmentIds[displayId]));
Object.assign(originalAssessment,{assessmentId:'DISPLAY_BASE',previousAssessmentId:null,assessedAt:'2026-09-08T05:00:00Z',selectedEvidenceIds:[],excludedEvidenceIds:[],conflictingEvidenceIds:[]});
Object.assign(originalAssessment.assessedState,{locationClassification:'unknown',locationState:'unconfirmed',publicLocation:{precision:'none',label:'Location unconfirmed',geometry:null},lastReportedLocation:'Location unconfirmed',position:null});
displayBaseline.assessmentLog.assessments=[originalAssessment];displayBaseline.assessmentLog.currentAssessmentIds={[displayId]:'DISPLAY_BASE'};
const proof={evidenceId:'SYNTHETIC_DISPLAY_PROOF',vesselId:displayId,sourceId:displayBaseline.registry.sources[0].sourceId,claim:{location:{name:'Example region'}},publishedAt:'2026-08-20T12:00:00Z',directness:'direct',observation:{from:'2026-08-20T10:00:00Z',to:'2026-08-20T10:00:00Z',basis:'explicit'},supersededBy:null};
displayBaseline.evidenceItems=[proof];
const displayCandidate=structuredClone(displayBaseline);displayCandidate.entities.metadata.releaseRevision=2;displayCandidate.entities.metadata.releasedAt='2026-09-08T10:00:00Z';
const support=structuredClone(originalAssessment);Object.assign(support,{assessmentId:'DISPLAY_SUPPORT',previousAssessmentId:'DISPLAY_BASE',assessedAt:'2026-09-08T09:00:00Z',assessor:'owner-directed-correction',conflictState:'none',selectedEvidenceIds:[proof.evidenceId]});support.freshness.state='historical';
Object.assign(support.assessedState,{locationClassification:'approximate',locationState:'last_reported',lastReportedLocation:'Example region',publicLocation:{precision:'region',label:'Example region',geometry:{type:'circle',centre:{lat:50.3,lon:-4.1},radiusKm:20},representation:'representative-marker'}});
const retained=structuredClone(originalAssessment);Object.assign(retained,{assessmentId:'DISPLAY_CURRENT',previousAssessmentId:'DISPLAY_SUPPORT',assessedAt:'2026-09-08T09:01:00Z',assessor:'owner-directed-correction',conflictState:'none',selectedEvidenceIds:[proof.evidenceId],retainedLocation:{assessmentId:'DISPLAY_SUPPORT',evidenceIds:[proof.evidenceId],observedAt:proof.observation.to,reason:'current-location-unknown',reviewedBy:'test reviewer',reviewedAt:'2026-09-08T09:01:00Z'}});retained.freshness.state='historical';
displayCandidate.assessmentLog.assessments.push(support,retained);displayCandidate.assessmentLog.currentAssessmentIds[displayId]=retained.assessmentId;
const displayPublished=createPublicProjection(displayBaseline.entities,displayBaseline.assessmentLog,displayBaseline.evidenceItems);
const displayRecord={...structuredClone(record),baselineRelease:displayBaseline.entities.metadata,release:displayCandidate.entities.metadata,parentInputsHash:correctionHash(displayBaseline),changes:[{...record.changes[0],vesselId:displayId,mode:'display-only',assessmentId:retained.assessmentId,supportingAssessmentIds:[support.assessmentId],beforeHash:correctionHash(displayPublished.vessels[0])}]};
const displayArgs={...args,record:displayRecord,baseline:displayBaseline,candidate:displayCandidate,published:displayPublished,parentGate:{...args.parentGate,projection:displayPublished}};
function bindDisplay(a){a.record.candidateInputsHash=correctionHash(a.candidate);a.record.releaseContentHash=computeReleaseContentHash(a.candidate);a.record.changes[0].afterHash=correctionHash(createPublicProjection(a.candidate.entities,a.candidate.assessmentLog,a.candidate.evidenceItems).vessels[0]);}
bindDisplay(displayArgs);assert.equal(validateReleaseCorrection(displayArgs).pass,true);
for(const mutate of [
 a=>a.candidate.entities.vessels[0].homePort='Unrelated',
 a=>a.candidate.assessmentLog.assessments.at(-1).assessedState.status='Unknown',
 a=>a.candidate.assessmentLog.assessments.at(-1).assessedState.mapRepresentation='representative-patrol',
 a=>a.candidate.assessmentLog.assessments.at(-1).assessedState.unrelatedField=true,
 a=>a.candidate.assessmentLog.assessments.at(-2).vesselId='another-vessel',
 a=>a.candidate.assessmentLog.assessments.at(-2).previousAssessmentId='DISPLAY_CURRENT',
 a=>a.candidate.assessmentLog.assessments.at(-2).assessedAt='2026-09-08T09:02:00Z',
 a=>a.candidate.assessmentLog.assessments.at(-1).previousAssessmentId='DISPLAY_BASE',
 a=>a.record.changes[0].supportingAssessmentIds=['DISPLAY_BASE'],
 a=>a.record.changes[0].supportingAssessmentIds=['DISPLAY_SUPPORT','DISPLAY_SUPPORT'],
 a=>a.record.changes[0].supportingAssessmentIds=[],
 a=>a.candidate.assessmentLog.assessments.push({...support,assessmentId:'UNDECLARED_SUPPORT'}),
 a=>a.candidate.evidenceItems[0].supersededBy='withdrawal',
 a=>a.candidate.evidenceItems.push({evidenceId:'withdrawal',correctionOf:proof.evidenceId}),
 a=>a.candidate.assessmentLog.assessments.at(-2).selectedEvidenceIds=[],
]) {const a=structuredClone(displayArgs);mutate(a);assert.throws(()=>{bindDisplay(a);validateReleaseCorrection(a);});}
// No new operational assessment is needed solely to project already-reviewed dates.
const metadataCandidate=structuredClone(displayBaseline);metadataCandidate.entities.metadata=structuredClone(displayCandidate.entities.metadata);
const noContextPublished=createPublicProjection(displayBaseline.entities,displayBaseline.assessmentLog);
const metadataArgs={...structuredClone(displayArgs),candidate:metadataCandidate,published:noContextPublished,parentGate:{...args.parentGate,projection:noContextPublished}};
Object.assign(metadataArgs.record.changes[0],{assessmentId:'DISPLAY_BASE',supportingAssessmentIds:[],beforeHash:correctionHash(noContextPublished.vessels[0])});bindDisplay(metadataArgs);
assert.equal(validateReleaseCorrection(metadataArgs).pass,true);
console.log('Display-only corrections preserve evidence/status/identity; declared retention chains and metadata-only changes validated.');
