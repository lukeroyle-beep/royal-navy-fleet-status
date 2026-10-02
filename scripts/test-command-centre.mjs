import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { recordPreflightReporting } from './lib/command-centre-hook.mjs';
import { DESTINATION,HISTORY,enqueue,pending,beginAttempt,finishAttempt,planPage,confirmPage,verifyPage,validateEvent,digest,london } from './lib/command-centre.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rnfs-reporting-test-'));
const receipt=path.join(root,'receipt.json'); fs.writeFileSync(receipt,'{"outcome":"blocked"}');
const refs=[{path:receipt,sha256:digest(fs.readFileSync(receipt,'utf8'))}];
const event={schemaVersion:1,runId:'RUN_1',eventId:'RUN_1_E1',revision:1,runStartedAt:'2026-10-02T09:00:00Z',recordedAt:'2026-10-02T09:23:00Z',evidenceAt:'2026-10-02T09:21:00Z',completedAt:'2026-10-02T09:23:00Z',trigger:'scheduled',outcome:'BLOCKED_COVERAGE',coverage:{sources:[5,77],discovery:[7,7],vessels:[0,69],integrity:[0,6]},publication:'Not published',lastGoodRelease:'20 September r1 partial',blocker:'Identity mismatch',nextAction:'Resolve mandatory coverage',backup:'Verified 2165 files',nextScheduledAt:'2026-10-02T11:00:00Z',facts:'Discovery is not full coverage',references:[]};
const page=id=>({content:{page_id:id,blocks:[{id:'manual',hash:'a',markdown:'Preserve my note',metadata:{}}]},metadata:{stream_kind:'content'}});
function apply(p,plan) {
 const result=structuredClone(p);
 for(const op of plan.operations){ const b={id:op.block_id||'managed',hash:'b',markdown:op.markdown,metadata:op.block_units[0].metadata};if(op.block_id) result.content.blocks[result.content.blocks.findIndex(x=>x.id===op.block_id)]=b;else result.content.blocks.push(b); }
 return result;
}
try {
 enqueue(root,event,refs);enqueue(root,event,refs);assert.equal(pending(root).length,1);
 assert.throws(()=>enqueue(root,{...event,blocker:'changed'},refs),/COLLISION/);
 assert.throws(()=>enqueue(root,{...event,eventId:'bad'},[{...refs[0],sha256:'0'.repeat(64)}]),/HASH/);
 assert.throws(()=>validateEvent({...event,outcome:'NO_CHANGES'}),/COVERAGE/);
 assert.throws(()=>validateEvent({...event,facts:'/Users/private/data'}),/RESTRICTED/);
 const successful={...event,outcome:'PUBLISHED',coverage:{sources:[77,77],discovery:[7,7],vessels:[69,69],integrity:[6,6]}};validateEvent(successful);
 for(const outcome of ['PREFLIGHT_FAILED','COLLECTION_FAILED','PUBLICATION_FAILED'])validateEvent({...event,outcome,coverage:{sources:[null,null],discovery:[0,7],vessels:[0,69],integrity:[0,6]}});
 assert.match(london('2026-10-24T11:00:00Z'),/12:00:00 BST/);assert.match(london('2026-10-26T12:00:00Z'),/12:00:00 GMT/);
 const ctx={runId:'EARLY_RUN',runStartedAt:event.runStartedAt,trigger:'manual',lastGoodRelease:event.lastGoodRelease,nextScheduledAt:event.nextScheduledAt,references:[]};
 const ctxPath=path.join(root,'context.json');fs.writeFileSync(ctxPath,JSON.stringify(ctx));
 const preflight={runId:'EARLY_RUN',checkedAt:'2026-10-02T09:02:00Z',elapsedMs:100,outcome:'DEFERRED_WITH_JUSTIFICATION',diagnostic:'GITHUB_AUTH_FAILED'};
 const preflightPath=path.join(root,'preflight.json');fs.writeFileSync(preflightPath,JSON.stringify(preflight));
 recordPreflightReporting({receipt:preflight,receiptPath:preflightPath,contextPath:ctxPath,outbox:path.join(root,'hook')});
 recordPreflightReporting({receipt:preflight,receiptPath:preflightPath,contextPath:ctxPath,outbox:path.join(root,'hook')});
 assert.equal(pending(path.join(root,'hook'))[0].outcome,'PREFLIGHT_FAILED');assert.equal(pending(path.join(root,'hook')).length,1);
 assert.throws(()=>recordPreflightReporting({receipt:{...preflight,runId:'WRONG'},receiptPath:preflightPath,contextPath:ctxPath,outbox:path.join(root,'hook')}),/RUN_MISMATCH/);
 const earlyRoot=path.join(root,'early');
 try {execFileSync(process.execPath,['scripts/preflight-osint-sweep.mjs','--config='+path.join(root,'absent.json'),'--output='+path.join(root,'unused.json')],{cwd:new URL('..',import.meta.url),env:{...process.env,RNFS_COMMAND_CENTRE_CONTEXT:ctxPath,RNFS_COMMAND_CENTRE_OUTBOX:earlyRoot},stdio:'pipe'});assert.fail('early exit must fail');} catch(error){assert.equal(error.status,1);}
 assert.equal(pending(earlyRoot)[0].outcome,'PREFLIGHT_FAILED');
 const pages=[page(DESTINATION),page(HISTORY)];const plans=pages.map((p,i)=>planPage(p,event,i?'history':'summary','2026-10-02T09:30:00Z'));
 const saved=pages.map((p,i)=>apply(p,plans[i]));assert.equal(saved[0].content.blocks[0].markdown,'Preserve my note');
 const a=beginAttempt(root,event.eventId,'WAKE_1','scheduled');finishAttempt(root,a.id,{error:'SPACE_ACCESS_DENIED'});assert.equal(pending(root).length,1);
 const b=beginAttempt(root,event.eventId,'WAKE_1','scheduled');
 assert.throws(()=>finishAttempt(root,b.id,{event,plans,readbacks:[saved[0],pages[1]]}),/READBACK/);
 finishAttempt(root,b.id,{error:'HISTORY_WRITE_FAILED'});assert.throws(()=>beginAttempt(root,event.eventId,'WAKE_1','scheduled'),/RETRY_LIMIT/);
 const c=beginAttempt(root,event.eventId,'WAKE_2','scheduled');
 assert.throws(()=>finishAttempt(root,c.id,{event:{...event,blocker:'mutated'},plans,readbacks:saved}),/QUEUED_EVENT/);
 assert.throws(()=>finishAttempt(root,c.id,{event,plans:[{...plans[0],page_id:'other'},plans[1]],readbacks:saved}),/DESTINATIONS/);
 assert.throws(()=>finishAttempt(root,c.id,{event,plans,readbacks:saved}),/CONFIRMED_TIME/);
 const confirmedPlans=plans.map((p,i)=>confirmPage(saved[i],event,p,'2026-10-02T09:30:02Z'));
 const confirmedPages=saved.map((p,i)=>apply(p,confirmedPlans[i]));
 finishAttempt(root,c.id,{event,plans:confirmedPlans,readbacks:confirmedPages});assert.equal(pending(root).length,0);
 assert.equal(planPage(saved[0],event,'summary','2026-10-02T09:31:00Z').operations.length,0);
 const recovery={...event,eventId:'RUN_1_E2',revision:2,recordedAt:'2026-10-02T09:32:00Z',backup:'Later verified backup'};enqueue(root,recovery,refs);
 const repairPlan=planPage(saved[1],recovery,'history','2026-10-02T09:33:00Z');assert.equal(repairPlan.operations[0].block_id,'managed');
 const repaired=apply(saved[1],repairPlan);assert.equal(repaired.content.blocks.length,2);
 const stale=planPage(repaired,event,'history','2026-10-02T09:34:00Z');assert.equal(stale.superseded,true);verifyPage(repaired,event,stale);
 const changed=structuredClone(saved[0]);changed.content.blocks[1].markdown=changed.content.blocks[1].markdown.replace('Identity mismatch','Manual decision');assert.throws(()=>planPage(changed,recovery,'summary','2026-10-02T09:35:00Z'),/MANUAL_EDIT/);
 const extra=structuredClone(saved[0]);extra.content.blocks[1].markdown+='\n\nManual annotation';assert.match(planPage(extra,recovery,'summary','2026-10-02T09:35:00Z').operations[0].markdown,/Manual annotation/);
 // Abandoned temporary files and interrupted attempts do not block replay.
 fs.writeFileSync(path.join(root,'event-interrupted.json.tmp'),'partial');
 fs.writeFileSync(path.join(root,'writer.lock'),'legacy abandoned lock');
 assert.equal(pending(root).length,1);
 const abandoned=beginAttempt(root,recovery.eventId,'CRASH_WAKE','scheduled');
 assert.equal(pending(root).length,1);
 const resumed=beginAttempt(root,recovery.eventId,'NEXT_WAKE','scheduled');assert.notEqual(resumed.id,abandoned.id);
 console.log('Command Centre fixtures passed: outcomes, idempotency, evidence, retries, partial delivery, readback, recovery, manual edits, DST.');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
