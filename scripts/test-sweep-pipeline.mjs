import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolvePrivateInputs } from './lib/private-inputs.mjs';
import { digest } from './lib/acquisition.mjs';
import { createSweepRun, PUBLIC_INDEX_TARGETS, validateSweepRunShape, finaliseSweepRun, validateReleaseSweepGate } from './lib/sweep.mjs';
import { collectPublicIndexes } from './lib/public-index-collector.mjs';
import { reconcileFleet } from './lib/sweep-analysis.mjs';
import { buildSweepCertificate } from './lib/sweep-certificate.mjs';
import { validateCertificateCandidate } from './lib/sweep-validation.mjs';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rnfs-pipeline-fixture-'));
try {
 const legacy=resolvePrivateInputs({environment:{}});
 const root=path.join(directory,'inputs');
 fs.cpSync(legacy.root,root,{recursive:true});
 const files=Object.fromEntries(['vessels','sources','evidence','assessments','sweepRuns','shoreEstablishments','shorePhotoSources'].map(k=>[k,path.relative(legacy.root,legacy.pathFor(k))]));
 fs.writeFileSync(path.join(root,'private-input-manifest.json'),JSON.stringify({schemaVersion:1,kind:'rnfs-private-inputs',files}));
 const fixture=resolvePrivateInputs({environment:{RNFS_PRIVATE_DATA_ROOT:root}});
 // Fabricate safe labels in the temporary fixture; never alter retained legacy evidence.
 const fixtureAssessments=fixture.readJson('assessments');
 for(const assessment of fixtureAssessments.assessments){
  if(assessment.assessedState.lastReportedLocation)assessment.assessedState.lastReportedLocation='Synthetic port';
  if(assessment.assessedState.publicLocation?.label)assessment.assessedState.publicLocation.label='Synthetic port';
  if(assessment.assessedState.position?.label)assessment.assessedState.position.label='Synthetic port';
 }
 fs.writeFileSync(fixture.pathFor('assessments'),JSON.stringify(fixtureAssessments));

 const run=createSweepRun({registry:fixture.readJson('sources'),entities:fixture.readJson('vessels'),assessmentLog:fixture.readJson('assessments'),evidenceItems:fixture.readJson('evidence').evidence,startedAt:new Date(Date.now()-10000).toISOString(),windowStart:'2026-08-01T00:00:00Z'});
 const runFile=path.join(root,'fixture-run.json'),state=path.join(directory,'state'),packets=path.join(directory,'packets');
 fs.writeFileSync(runFile,JSON.stringify(run));
 fs.mkdirSync(packets);
 const env={...process.env,RNFS_PRIVATE_DATA_ROOT:root};delete env.RNFS_PRIVATE_DATA_FIXTURE;
 for(const [label,mutate] of [
  ['missing target',artifact=>artifact.discoveryChecks.pop()],
  ['altered target',artifact=>{artifact.discoveryChecks[0].url='https://example.invalid/changed';}],
 ]){
  const artifact=structuredClone(run),resume=path.join(directory,`resume-${label.replaceAll(' ','-')}.json`),output=path.join(directory,`rejected-${label.replaceAll(' ','-')}.json`);
  mutate(artifact);fs.writeFileSync(resume,JSON.stringify(artifact));
  const result=spawnSync(process.execPath,['scripts/collect-public-indexes.mjs',`--resume=${resume}`,`--output=${output}`],{env,encoding:'utf8'});
  assert.notEqual(result.status,0,`Resume with ${label} must fail closed`);
  assert.match(result.stderr,/Resume discovery target set changed or is incomplete/);
  assert.equal(fs.existsSync(output),false,'Invalid resumed target sets must be rejected before collection or output');
 }
 const invoke=mode=>spawnSync(process.execPath,['scripts/accelerate-osint-sweep.mjs',`--mode=${mode}`,`--run=${runFile}`,`--state=${state}`,`--packets=${packets}`],{env,encoding:'utf8'});
 const plan=invoke('plan');assert.equal(plan.status,0,plan.stderr);
 const tasks=JSON.parse(fs.readFileSync(path.join(state,'plan.json'))).tasks;
 assert.ok(tasks.length>=run.sourceChecks.length);
 const processed=invoke('process');assert.equal(processed.status,1,processed.stderr);
 const acquisition=JSON.parse(fs.readFileSync(path.join(state,'acquisition.json')));
 assert.equal(acquisition.records.length,tasks.length);
 assert.ok(acquisition.records.every(r=>r.outcome==='DEFERRED_WITH_JUSTIFICATION'&&r.cursor===null));
 const candidate=JSON.parse(fs.readFileSync(path.join(state,'processed-sweep-run.json')));
 assert.ok(candidate.sourceChecks.every(r=>r.state==='blocked'&&r.blocker.type==='not-searched'));
 assert.equal(candidate.complete,false);
 assert.equal(invoke('status').status,0);
 // Complete fabricated observation packets exercise successful restart without real browsing.
 const registry=fixture.readJson('sources');
 const entities=fixture.readJson('vessels');
 const lockRun=createSweepRun({registry,entities,assessmentLog:fixture.readJson('assessments'),evidenceItems:fixture.readJson('evidence').evidence,startedAt:run.startedAt,windowStart:run.window.from,discoveryTargets:[PUBLIC_INDEX_TARGETS[0]]});
 const lockPath=path.join(directory,'public-index-run.lock');
 const lockRunFile=path.join(directory,'lock-run.json'),lockRegistryFile=path.join(directory,'lock-registry.json'),lockEntitiesFile=path.join(directory,'lock-entities.json');
 fs.writeFileSync(lockRunFile,JSON.stringify(lockRun));fs.writeFileSync(lockRegistryFile,JSON.stringify(registry));fs.writeFileSync(lockEntitiesFile,JSON.stringify(entities));
 let beginRequest,continueRequest;
 const requestStarted=new Promise(resolve=>{beginRequest=resolve;}),holdRequest=new Promise(resolve=>{continueRequest=resolve;});
 const targets=[PUBLIC_INDEX_TARGETS[0]];
 const firstCollection=collectPublicIndexes(lockRun,{registry,entities,targets,runLockPath:lockPath,fetchImpl:async url=>{beginRequest();await holdRequest;return {ok:true,status:200,url,headers:{get:key=>key==='content-type'?'text/html':null},text:async()=>'<html>no candidates in lock regression fixture</html>'};}});
 await requestStarted;
 const childCode=`import fs from 'node:fs';import {collectPublicIndexes} from ${JSON.stringify(new URL('./lib/public-index-collector.mjs',import.meta.url).href)};const run=JSON.parse(fs.readFileSync(process.env.RNFS_TEST_RUN_PATH,'utf8'));const registry=JSON.parse(fs.readFileSync(process.env.RNFS_TEST_REGISTRY_PATH,'utf8'));const entities=JSON.parse(fs.readFileSync(process.env.RNFS_TEST_ENTITIES_PATH,'utf8'));await collectPublicIndexes(run,{registry,entities,targets:${JSON.stringify(targets)},runLockPath:process.env.RNFS_TEST_LOCK_PATH,fetchImpl:async()=>{throw new Error('network must not start while another process owns this run');}});`;
 const lockChild=spawnSync(process.execPath,['--input-type=module','-e',childCode],{env:{...env,RNFS_TEST_RUN_PATH:lockRunFile,RNFS_TEST_REGISTRY_PATH:lockRegistryFile,RNFS_TEST_ENTITIES_PATH:lockEntitiesFile,RNFS_TEST_LOCK_PATH:lockPath},encoding:'utf8'});
 assert.notEqual(lockChild.status,0,'A separate process must not collect a run while its lock is held');
 assert.match(lockChild.stderr,/Public-index collection is already locked/);
 continueRequest();await firstCollection;
 assert.equal(fs.existsSync(lockPath),false,'The run lock must be released after collection exits');
 const partialTask=tasks.find(t=>registry.sources.find(s=>s.sourceId===t.sourceId)?.xCollection);
 const partialSource=registry.sources.find(s=>s.sourceId===partialTask.sourceId);
 const partialMethod={kind:'x-profile-latest',browser:'chrome',renderedPublicPage:true,readOnly:true,pageUrl:partialSource.canonicalUrl,window:{from:run.window.from,to:run.window.to},scrollCount:0,visibleResultCount:1,limitations:['Synthetic partial-window test']};
 const partialPacket={runId:run.runId,registryHash:run.sourceRegistryHash,sourceId:partialTask.sourceId,window:partialTask.window,outcome:'DEFERRED_WITH_JUSTIFICATION',reason:'Synthetic deep coverage incomplete',partialObservation:{schemaVersion:'1.0.0',sourceId:partialTask.sourceId,state:'checked',checkedAt:new Date().toISOString(),method:partialMethod,blocker:null,posts:[{postId:'1234567890',canonicalUrl:`${partialSource.canonicalUrl}/status/1234567890`,publishedAt:run.window.from,text:'Synthetic ambiguous fleet evidence',postType:'original',repostOfPostId:null,quotedPostId:null}]}};
 fs.writeFileSync(path.join(packets,`${digest(partialTask.sourceId)}.json`),JSON.stringify(partialPacket));
 assert.equal(invoke('process').status,1);
 const partialResult=JSON.parse(fs.readFileSync(path.join(state,'acquisition.json'))).records.find(r=>r.sourceId===partialTask.sourceId);
 assert.equal(partialResult.cursor,null);
 assert.equal(partialResult.outcome,'DEFERRED_WITH_JUSTIFICATION');
 assert.equal(partialResult.candidates.length,1,'Valid partial evidence must reach adjudication even while source coverage fails');
 assert.equal(JSON.parse(fs.readFileSync(path.join(state,'adjudication-queue.json'))).items.length,1);
 const bypassPacket={...partialPacket,partialObservation:undefined,method:{kind:'unapproved'},partialItems:[{id:'unapproved',url:partialSource.canonicalUrl,publishedAt:run.window.from,text:'Unapproved direct X input'}]};
 fs.writeFileSync(path.join(packets,`${digest(partialTask.sourceId)}.json`),JSON.stringify(bypassPacket));
 assert.equal(invoke('process').status,1);
 const bypassResult=JSON.parse(fs.readFileSync(path.join(state,'acquisition.json'))).records.find(r=>r.sourceId===partialTask.sourceId);
 assert.equal(bypassResult.cursor,null);
 assert.equal(bypassResult.candidates.length,0,'Direct X items must not bypass rendered observation contract');
 for(const task of tasks){
  const source=registry.sources.find(s=>s.sourceId===task.sourceId);
  const method=source.xCollection ? {kind:'x-profile-latest',browser:'chrome',renderedPublicPage:true,readOnly:true,pageUrl:source.canonicalUrl,window:{from:task.window.from,to:task.window.to},scrollCount:0,visibleResultCount:0,limitations:['Synthetic CLI test; no live browsing performed.']} : {kind:'synthetic-reviewed-source'};
  const packet={runId:run.runId,registryHash:run.sourceRegistryHash,sourceId:task.sourceId,window:task.window,method,examined:true,extractionComplete:true,items:[]};
  if(source.xCollection)packet.observation={schemaVersion:'1.0.0',sourceId:source.sourceId,state:'checked',checkedAt:new Date().toISOString(),method,blocker:null,posts:[]};
  fs.writeFileSync(path.join(packets,`${digest(task.sourceId)}.json`),JSON.stringify(packet));
 }
 const resumed=invoke('process');assert.equal(resumed.status,0,resumed.stderr);
 const success=JSON.parse(fs.readFileSync(path.join(state,'acquisition.json')));
 validateSweepRunShape(JSON.parse(fs.readFileSync(path.join(state,'processed-sweep-run.json'))));
 assert.ok(success.records.every(r=>r.outcome==='CHECKED_NO_RELEVANT_CHANGE'&&r.cursor));
 const count=fs.readdirSync(state).filter(n=>/^\d{9}\.json$/.test(n)).length;
 assert.equal(invoke('process').status,0);
 assert.equal(fs.readdirSync(state).filter(n=>/^\d{9}\.json$/.test(n)).length,count,'Successful rerun must not duplicate journal transactions');

 assert.equal(JSON.parse(fs.readFileSync(runFile)).sourceChecks[0].state,'pending','Input run must not be overwritten');
 const completeRun=JSON.parse(fs.readFileSync(path.join(state,'processed-sweep-run.json')));
 const at=new Date().toISOString();
 const assessments=fixture.readJson('assessments'), evidence=fixture.readJson('evidence');
 Object.assign(entities.metadata,{asOfDate:run.releaseTarget.asOfDate,releaseRevision:1,releasedAt:at});
 await collectPublicIndexes(completeRun,{registry,entities,checkedAt:at,fetchImpl:async url=>({ok:true,status:200,url,headers:{get:key=>key==='content-type'?'text/html':null},text:async()=>['/test-item/','/news/test-item/','/cps/test-item/','/services/navy/test-item/'].map(p=>`<a href="${new URL(p,url)}">Synthetic discovery</a>`).join('')})});
 for(const entry of completeRun.integrityChecks)Object.assign(entry,{state:'complete',checkedAt:at,outcome:'passed',notes:'Synthetic integrity review fixture.',blocker:null});
 for(const entry of completeRun.vesselOutcomes){
  const baseline=run.coverageInputs.baselineProjectionVessels.find(v=>v.id===entry.vesselId);
  Object.assign(entry,{state:'complete',reviewedAt:at,outcome:baseline.locationClassification==='unknown'?'unknown-retained':baseline.locationClassification==='withheld'?'withheld-policy':'unchanged',notes:'Synthetic unchanged-state review fixture.',blocker:null});
 }
 finaliseSweepRun(completeRun,{registry,entities,assessmentLog:assessments,evidenceItems:evidence.evidence,completedAt:at});
 assert.equal(completeRun.complete,true,JSON.stringify(completeRun.coverage.reasons));
 const validation=validateCertificateCandidate({entities,registry,evidenceLog:evidence,assessmentLog:assessments,run:completeRun});
 validation.tests={pass:true,artifactHash:digest('Current synthetic pipeline assertions passed'),command:'node scripts/test-sweep-pipeline.mjs (synthetic fixture)',completedAt:at};
 const reconciliation=reconcileFleet({entities,assessmentLog:assessments,evidenceItems:evidence.evidence,run:completeRun,at});
 completeRun.certificateInputs={acquisition:success,reconciliation,adjudication:{decisions:[],conflicts:[]},validation,registeredSources:registry.sources.length};
 completeRun.sweepCertificate=buildSweepCertificate({run:completeRun,...completeRun.certificateInputs,at});
 assert.equal(completeRun.sweepCertificate.status,'PASS',JSON.stringify(completeRun.sweepCertificate.unresolvedIntegrityIssues));
 const gate=()=>validateReleaseSweepGate({runs:[completeRun],datasetDate:entities.metadata.asOfDate,releasedAt:at,registry,entities,assessmentLog:assessments,evidenceItems:evidence.evidence});
 assert.equal(gate().pass,true);
 completeRun.sweepCertificate.successfullyExamined--;
 assert.equal(gate().pass,false,'Native release gate must reject certificate tampering');
 console.log(`Controlled full pipeline: ${tasks.length} fabricated source observations, ${reconciliation.reconciled}/${reconciliation.total} fleet records reconciled, native snapshot and certificate PASS; no live coverage claimed.`);

 console.log(`CLI pipeline regression passed: ${tasks.length} explicit source failures followed by successful synthetic recovery and idempotent rerun; no publication.`);
} finally {fs.rmSync(directory,{recursive:true,force:true});}
