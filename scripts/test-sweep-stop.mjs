import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluateSweepUsage, evaluateSweepHeadroom, requireSweepWorkBudget } from './lib/sweep-work-budget.mjs';
import { sweepStop, persistSweepStop, saveSweepStop } from './lib/sweep-stop.mjs';
import { recordEarlyFailure, recordPreflightReporting } from './lib/command-centre-hook.mjs';
import { pending } from './lib/command-centre.mjs';
import { startSweep } from './lib/sweep-startup.mjs';

const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'rnfs-stop-fixture-')));
const at='2026-10-12T09:00:00Z', now=Date.parse(at);
const records=total=>[{type:'session_meta',payload:{id:'fixture'}},
  {type:'event_msg',timestamp:at,payload:{type:'token_count',info:{total_token_usage:{
    input_tokens:total-100,cached_input_tokens:total-200,output_tokens:100,total_tokens:total}}}}];
const measured=(total,options={})=>evaluateSweepUsage(records(total),'fixture',{now,...options});
const allowances={nextResponseTokens:10000,closeoutTokens:80000};
try {
  // The unchanged native gate admits the historical prefix; planning refuses the next response.
  const historical=measured(190173);
  assert.equal(historical.allowed,true);
  // Terminal admission must never copy the native guard's affirmative answer.
  for (const plan of [allowances,{}, {...allowances,nextResponseTokens:0}]) {
    let terminal;
    try {
      const headroom=evaluateSweepHeadroom(historical,plan);
      terminal=sweepStop({diagnostic:headroom.outcome,usage:historical,headroom,at});
    } catch (error) { terminal=sweepStop({error,at}); }
    const output=JSON.parse(JSON.stringify(terminal));
    assert.equal(output.allowed,false);assert.equal(output.usage.allowed,true);
    assert.ok(['WORK_HEADROOM_STOP','WORK_HEADROOM_UNKNOWN','WORK_HEADROOM_PLAN_INVALID'].includes(output.diagnostic));
    assert.equal(output.totalTokens,undefined);
  }
  assert.equal(evaluateSweepHeadroom(historical,{nextResponseTokens:64459,closeoutTokens:76952}).allowed,false);
  assert.equal(evaluateSweepHeadroom(measured(200000),{nextResponseTokens:1,closeoutTokens:50000}).allowed,false);
  assert.equal(evaluateSweepHeadroom(measured(100000),allowances).allowed,true);
  assert.equal(evaluateSweepHeadroom(measured(100000),{nextResponseTokens:99999,closeoutTokens:50000}).allowed,true);
  assert.equal(evaluateSweepHeadroom(measured(100000),{nextResponseTokens:100000,closeoutTokens:50000}).allowed,false);
  // A cheap next response does not establish that the remaining workflow fits.
  const workflow={nextResponseTokens:40000,closeoutTokens:50000,remainingWorkResponses:4};
  const infeasible=evaluateSweepHeadroom(measured(40000),workflow);
  assert.equal(infeasible.allowed,false);assert.equal(infeasible.plannedWorkTotal,200000);
  assert.equal(infeasible.plannedTotal,250000);assert.equal(infeasible.remainingWorkResponses,4);
  assert.equal(infeasible.planningScope,'remaining-work-responses');
  assert.equal(evaluateSweepHeadroom(measured(40000),{...workflow,nextResponseTokens:39999}).allowed,true);
  assert.equal(evaluateSweepHeadroom(measured(40000),{...workflow,closeoutTokens:100000,remainingWorkResponses:3}).allowed,false);
  assert.deepEqual(evaluateSweepHeadroom(measured(40000),allowances),
    evaluateSweepHeadroom(measured(40000),{...allowances,remainingWorkResponses:1}));
  for(const remainingWorkResponses of [null,0,-1,1.5,65,Infinity,'4'])
    assert.throws(()=>evaluateSweepHeadroom(measured(40000),{...workflow,remainingWorkResponses}),/PLAN_INVALID/);
  assert.equal(evaluateSweepHeadroom(measured(40000),{remainingWorkResponses:4}).outcome,'WORK_HEADROOM_UNKNOWN');
  // More planned rounds can refuse earlier but can never make admission easier.
  for(const total of [40000,150000,199999,200000]) for(const count of [1,2,4,64]) {
    const one=evaluateSweepHeadroom(measured(total),allowances);
    const many=evaluateSweepHeadroom(measured(total),{...allowances,remainingWorkResponses:count});
    assert.ok(!many.allowed || one.allowed);
  }
  // Total target is an independent boundary, even when the work threshold would allow it.
  assert.equal(evaluateSweepHeadroom(measured(100000),{nextResponseTokens:60000,closeoutTokens:90000}).allowed,true);
  assert.equal(evaluateSweepHeadroom(measured(100000),{nextResponseTokens:60000,closeoutTokens:90001}).allowed,false);
  assert.equal(evaluateSweepHeadroom(measured(80000,{limit:150000}),allowances).allowed,false);
  for (const plan of [{},{nextResponseTokens:1000},{closeoutTokens:50000}]) {
    const result=evaluateSweepHeadroom(measured(100000),plan);
    assert.equal(result.outcome,'WORK_HEADROOM_UNKNOWN');assert.equal(result.allowed,false);
  }
  for (const plan of [null,[],{...allowances,limit:500000},{...allowances,nextResponseTokens:0},
    {...allowances,nextResponseTokens:1.1},{...allowances,nextResponseTokens:Infinity},
    {...allowances,closeoutTokens:49999}]) assert.throws(()=>evaluateSweepHeadroom(measured(100000),plan),/PLAN_INVALID/);
  assert.throws(()=>evaluateSweepHeadroom({...historical,allowed:false},allowances),/MEASUREMENT_INVALID/);
  assert.throws(()=>evaluateSweepHeadroom({...historical,limit:500000},allowances),/MEASUREMENT_INVALID/);
  assert.throws(()=>requireSweepWorkBudget({sessionPath:'/fixture',headroom:allowances},{CODEX_THREAD_ID:'invalid'}),/PROVENANCE/);
  assert.throws(()=>evaluateSweepUsage(records(100000),'fixture',{now:now+120001}),/MEASUREMENT_UNAVAILABLE/);
  assert.throws(()=>evaluateSweepUsage(records(100000),'fixture',{now:now-1}),/MEASUREMENT_UNAVAILABLE/);
  assert.throws(()=>evaluateSweepUsage([], 'fixture',{now}),/PROVENANCE/);
  assert.throws(()=>evaluateSweepUsage([...records(100000),records(90000)[1]],'fixture',{now}),/COUNTER_RESET/);

  let probes=0;
  const config={schemaVersion:1,privateRoot:root,backupDirectory:root,sessionPath:'/fixture',
    attemptDirectory:path.join(root,'attempt'),headroom:allowances};
  const dependencies={encrypted:()=>{probes++;return true;},write:()=>{probes++;}};
  const wholeWorkflowStop=await startSweep({config:{...config,headroom:workflow},usage:measured(40000),probes:dependencies});
  assert.equal(wholeWorkflowStop.outcome,'WORK_HEADROOM_STOP');assert.equal(probes,0);
  assert.equal(fs.existsSync(config.attemptDirectory),false);
  const stopped=await startSweep({config,usage:historical,probes:dependencies});
  assert.equal(stopped.outcome,'WORK_HEADROOM_STOP');assert.equal(probes,0);
  assert.equal(fs.existsSync(config.attemptDirectory),false);
  const prepared=await startSweep({config,usage:measured(100000),probes:dependencies});
  assert.equal(prepared.outcome,'DIRECTORIES_PREPARED');
  assert.deepEqual(prepared.preparation.usageBudget.headroom,allowances);
  assert.equal(fs.existsSync(prepared.preparation.collectionOutput),false);
  assert.equal(fs.existsSync(prepared.preparation.collectionOutput+'.checkpoints'),false);

  const error=Object.assign(new Error('WORK_BUDGET_STOP'),{diagnostic:'WORK_BUDGET_STOP',usage:measured(200000)});
  const receipt=sweepStop({error,at});
  assert.equal(receipt.diagnostic,'WORK_BUDGET_STOP');assert.equal(receipt.phase,'preparation');
  assert.equal(receipt.collectionStarted,false);assert.equal(receipt.noChangeClaimAllowed,false);
  const file=path.join(root,'terminal.json');
  assert.equal(persistSweepStop(file,receipt).reused,false);
  assert.equal(fs.statSync(file).mode & 0o777,0o600);
  assert.equal(persistSweepStop(file,receipt).reused,true);
  const exposed=path.join(root,'exposed.json');fs.writeFileSync(exposed,fs.readFileSync(file));fs.chmodSync(exposed,0o644);
  assert.throws(()=>persistSweepStop(exposed,receipt),/CONFLICT/);assert.equal(fs.statSync(exposed).mode & 0o777,0o644);
  const bytes=fs.readFileSync(file);
  assert.throws(()=>persistSweepStop(file,{...receipt,diagnostic:'USAGE_COUNTER_RESET'}),/CONFLICT/);
  assert.deepEqual(fs.readFileSync(file),bytes);
  assert.equal(saveSweepStop(path.join(root,'absent','stop.json'),receipt).saved,false);
  assert.equal(fs.existsSync(path.join(root,'absent')),false);
  const alias=path.join(root,'alias.json');fs.symlinkSync(file,alias);
  assert.throws(()=>persistSweepStop(alias,receipt),/PATH_INVALID/);
  assert.throws(()=>persistSweepStop(path.resolve('stop.json'),receipt),/outside every checkout/);
  const interrupted=path.join(root,'interrupted.json');fs.writeFileSync(interrupted,'{');
  assert.equal(saveSweepStop(interrupted,receipt).saved,false);assert.equal(fs.readFileSync(interrupted,'utf8'),'{');
  const sanitized=sweepStop({error:new Error('Bearer private_secret /Users/private/path'),at});
  assert.equal(sanitized.diagnostic,'PREFLIGHT_OR_REQUESTED_STAGE_FAILED');
  assert.ok(!JSON.stringify(sanitized).includes('private_secret'));

  const contextPath=path.join(root,'context.json'),outbox=path.join(root,'outbox');
  fs.writeFileSync(contextPath,JSON.stringify({runId:'STOP_FIXTURE',runStartedAt:at,trigger:'manual',
    lastGoodRelease:'Unverified fixture',nextScheduledAt:null,references:[]}));
  recordEarlyFailure({error,at,contextPath,outbox,receiptPath:file});
  recordEarlyFailure({error,at,contextPath,outbox,receiptPath:file});
  assert.equal(pending(outbox).length,1);
  const event=pending(outbox)[0];
  assert.equal(event.outcome,'PREFLIGHT_FAILED');assert.match(event.blocker,/Preparation stopped/);
  assert.ok(!event.facts.includes('private_secret'));assert.equal(event.completedAt,at);
  const unknown=sweepStop({phase:'indexes',collectionStarted:null,at});
  const unknownFile=path.join(root,'unknown.json');persistSweepStop(unknownFile,unknown);
  recordPreflightReporting({receipt:unknown,receiptPath:unknownFile,contextPath,outbox:path.join(root,'unknown-outbox')});
  const unknownEvent=pending(path.join(root,'unknown-outbox'))[0];
  assert.equal(unknownEvent.outcome,'COLLECTION_FAILED');assert.match(unknownEvent.facts,/unknown/);
  assert.equal(JSON.parse(fs.readFileSync(unknownFile)).collectionStarted,null);
  const invalidOutbox=path.join(root,'not-directory');fs.writeFileSync(invalidOutbox,'retained');
  assert.throws(()=>recordEarlyFailure({error,at,contextPath,outbox:invalidOutbox,receiptPath:file}));
  assert.deepEqual(fs.readFileSync(file),bytes);

  // Actual CLI refusal before any probe: no native journal is forged or copied.
  const badConfig=path.join(root,'config.json');
  fs.writeFileSync(badConfig,JSON.stringify({usageBudget:{sessionPath:'/fixture'},sessionPath:'/fixture'}));
  const env={...process.env,CODEX_THREAD_ID:'invalid',RNFS_COMMAND_CENTRE_CONTEXT:'',
    RNFS_COMMAND_CENTRE_OUTBOX:'',RNFS_PRIVATE_DATA_ROOT:''};
  for (const [name,args] of [
    ['check-sweep-work',['--session=/fixture','--prepare='+path.join(root,'never-created')]],
    ['start-sweep',['--config='+badConfig,'--output='+path.join(root,'never-started.json')]],
    ['preflight-osint-sweep',['--config='+badConfig,'--output='+path.join(root,'never-preflight.json'),'--then=indexes']],
    ['bootstrap-sweep',['--config='+badConfig]],
  ]) {
    const output=path.join(root,name+'-stop.json');
    const child=spawnSync(process.execPath,['scripts/'+name+'.mjs',...args,'--stop-output='+output],{env,encoding:'utf8'});
    assert.ok(child.status>0,child.stderr);assert.equal(child.error,undefined);
    const saved=JSON.parse(fs.readFileSync(output));
    assert.equal(saved.allowed,false);
    if(name==='check-sweep-work')assert.equal(JSON.parse(child.stdout).allowed,false);
    assert.equal(saved.collectionStarted,false);assert.equal(saved.publicationEligible,false);
    assert.equal(saved.phase,'preparation');
    if(name!=='bootstrap-sweep')assert.equal(saved.diagnostic,'USAGE_PROVENANCE_UNAVAILABLE');
    const original=fs.readFileSync(output);
    const collision=spawnSync(process.execPath,['scripts/'+name+'.mjs',...args,'--stop-output='+output],{env,encoding:'utf8'});
    assert.ok(collision.status>0);assert.deepEqual(fs.readFileSync(output),original);
  }
  for(const file of ['never-created','never-started.json','never-preflight.json'])assert.equal(fs.existsSync(path.join(root,file)),false);
  // A deferred preflight never dispatched a stage, even if saving its result fails.
  const deferredConfig=path.join(root,'deferred-config.json');
  const deferredOutput=path.join(root,'deferred-preflight.json');
  const deferredStop=path.join(root,'deferred-stop.json');
  const deferredOutbox=path.join(root,'deferred-outbox');
  fs.writeFileSync(deferredConfig,JSON.stringify({schemaVersion:999,run:path.join(root,'unused-run.json'),
    collectionOutput:path.join(root,'unused-collection.json')}));
  const deferred=spawnSync(process.execPath,['scripts/preflight-osint-sweep.mjs','--config='+deferredConfig,
    '--output='+deferredOutput,'--then=indexes','--result='+path.join(root,'absent','stage.json'),
    '--stop-output='+deferredStop],{encoding:'utf8',env:{...env,
      RNFS_COMMAND_CENTRE_CONTEXT:contextPath,RNFS_COMMAND_CENTRE_OUTBOX:deferredOutbox}});
  assert.equal(deferred.status,1,deferred.stderr);
  assert.equal(JSON.parse(fs.readFileSync(deferredOutput)).outcome,'DEFERRED_WITH_JUSTIFICATION');
  const savedDeferred=JSON.parse(fs.readFileSync(deferredStop));
  assert.equal(savedDeferred.phase,'preflight');assert.equal(savedDeferred.collectionStarted,false);
  assert.equal(pending(deferredOutbox)[0].outcome,'PREFLIGHT_FAILED');
  assert.equal(fs.existsSync(path.join(root,'unused-collection.json')),false);
  console.log('Budget/stop fixtures passed: conservative admission, mandatory native guard, no-probe refusal, immutable receipts, diagnostic retention, unknown collection, reporting failure and real CLI error paths. No live tools used.');
} finally {fs.rmSync(root,{recursive:true,force:true});}
