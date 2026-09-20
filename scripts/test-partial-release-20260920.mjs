import assert from 'node:assert/strict';
import {digest} from './lib/acquisition.mjs';
import {PARTIAL_RELEASE_POLICY as p,validatePartialRelease} from './lib/partial-release-20260920.mjs';
const fixture=()=>{
 const baselineRows=Array.from({length:69},(_,i)=>({vesselId:`vessel-${i}`,location:'retained',observationDate:'2026-09-01'}));
 const candidateRows=structuredClone(baselineRows);candidateRows[0].location='verified';candidateRows[0].observationDate='2026-09-18';
 const run={runId:p.runId,window:{to:p.cutoff}};
 const acquisition={records:p.sourceIds.map(sourceId=>({sourceId,outcome:'RETRIEVAL_FAILURE'}))};
 const manifest={policyId:p.policyId,approvalReference:p.approvalReference,retainedSnapshotDate:p.retainedSnapshotDate,coverage:'partial',noChangeClaimAllowed:false,newObservationForRetained:false,runHash:digest(run),baselineHash:digest(baselineRows),candidateHash:digest(candidateRows),acquisitionHash:digest(acquisition),retainedVesselIds:baselineRows.slice(1).map(x=>x.vesselId),quarantinedSources:acquisition.records.map(r=>({sourceId:r.sourceId,outcome:r.outcome,recordHash:digest(r)}))};
 const acceptedRows=[{vesselId:'vessel-0',pass:true,issues:[],candidateRowHash:digest(candidateRows[0]),evidenceIds:['verified-evidence']}];
 manifest.acceptedRowsHash=digest(acceptedRows);
 const approvalBinding={policyId:p.policyId,approvalReference:p.approvalReference,runHash:manifest.runHash,baselineHash:manifest.baselineHash,candidateHash:manifest.candidateHash,acquisitionHash:manifest.acquisitionHash,acceptedRowsHash:manifest.acceptedRowsHash,manifestHash:digest(manifest)};
 return{manifest,run,baselineRows,candidateRows,acquisition,approvalBinding,acceptedRows};
};
const rebind=x=>{x.manifest.candidateHash=digest(x.candidateRows);x.approvalBinding.candidateHash=x.manifest.candidateHash;x.approvalBinding.manifestHash=digest(x.manifest);};
const ok=validatePartialRelease(fixture());assert.equal(ok.retained,68);assert.equal(ok.updated,1);assert.equal(ok.publicationAllowed,false);
for(const mutate of [
 x=>{x.run.runId='another-run';},
 x=>{x.candidateRows[1].observationDate='2026-09-20';rebind(x);},
 x=>{x.candidateRows.pop();rebind(x);},
 x=>{x.acceptedRows[0].pass=false;},
 x=>{x.manifest.coverage='complete';},
 x=>{x.acquisition.records[0].outcome='CHECKED_NEW_EVIDENCE';},
 x=>{x.manifest.quarantinedSources.pop();x.approvalBinding.manifestHash=digest(x.manifest);},
 x=>{x.manifest.retainedVesselIds[0]='vessel-0';x.approvalBinding.manifestHash=digest(x.manifest);},
 x=>{x.approvalBinding.manifestHash='0'.repeat(64);},
]){const x=fixture();mutate(x);assert.throws(()=>validatePartialRelease(x),/Partial release rejected/);}
console.log('Partial-release policy: valid partition and 9 adversarial cases passed; partition validation alone does not grant publication authority.');
