import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {POLICY,privateDirectory,acquireWriter,bindOperation,bindObservationBatch,observeBatch,sanitizedBrowserFailure,visibleViewport,classifyViewport,observeOperation,captureAndPersist} from './lib/dedicated-browser-worker.mjs';
import {createXBrowserSession} from './lib/x-browser-collection.mjs';
import {createSweepRun} from './lib/sweep.mjs';
import {resolvePrivateInputs} from './lib/private-inputs.mjs';
const input=resolvePrivateInputs();
const registry=input.readJson('sources');
const entities=input.readJson('vessels');
Object.assign(entities.metadata,{asOfDate:'2026-10-01',releaseRevision:1,releasedAt:'2026-10-01T00:00:00Z'});
const run=createSweepRun({registry,entities,assessmentLog:input.readJson('assessments'),evidenceItems:input.readJson('evidence').evidence,startedAt:'2026-10-03T12:00:00Z',windowStart:'2026-10-01T00:00:00Z'});
const selected=registry.sources.find(s=>s.xCollection?.enabled);
const session=createXBrowserSession({registry,run,sourceIds:[selected.sourceId],scope:'canary'});
const request={policy:POLICY,operationId:'one',runId:run.runId,window:run.window,sourceId:selected.sourceId,timeoutMs:1000,maxScrolls:0};
const bind=r=>bindOperation({registry,run,session,request:r});
const op=bind(request);
const article={text:'Fixture public observation',links:[`/${op.handle}/status/123456789`],times:['2026-10-02T12:00:00Z'],context:''};
const ready={url:op.url,authenticated:true,login:false,notices:'',identity:`Fixture @${op.handle}`,articles:[article]};
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'rnfs-worker-fixture-')));fs.chmodSync(root,0o700);
function fake(views) {
  let time=0,reads=0,scrolls=0,navigations=0;
  return {page:{goto:async()=>{navigations++;},evaluate:async()=>{reads++;return structuredClone(views[Math.min(reads-1,views.length-1)]);},mouse:{wheel:async()=>{scrolls++;}}},
    dependencies:{now:()=>time,sleep:async ms=>{time+=ms;}},counts:()=>({reads,scrolls,navigations})};
}
try {
  for(const change of [{sourceId:'NOT_SELECTED'},{url:'https://evil.invalid'},{maxScrolls:3},{timeoutMs:31000},{operationId:'../escape'},{window:{...run.window,to:'2026-10-04T00:00:00Z'}},{policy:'other'}]) assert.throws(()=>bind({...request,...change}));
  assert.throws(()=>bindOperation({registry:{...registry,sources:[]},run,session,request}));
  assert.equal(classifyViewport(ready,op).status,'partial');
  assert.equal(classifyViewport(ready,op).observations[0].inWindow,true);
  for(const [change,expected] of [[{login:true},'authentication-required'],[{notices:'Verify your identity'},'challenge'],[{notices:'Rate limit exceeded'},'rate-limited'],[{notices:'Account suspended'},'unavailable'],[{protectedProfile:true},'unavailable'],[{identity:'@WrongAccount'},'identity-conflict'],[{url:'https://x.com/messages'},'identity-conflict'],[{url:op.url+'?bad=1'},'identity-conflict'],[{authenticated:false},'loading']]) assert.equal(classifyViewport({...ready,...change},op).status,expected);
  for(const [at,inWindow] of [[run.window.from,true],[run.window.to,false],['invalid',null]]) {
    const value=classifyViewport({...ready,articles:[{...article,times:[at]}]},op).observations[0];assert.equal(value.inWindow,inWindow);
  }
  const ambiguity=classifyViewport({...ready,articles:[{...article,links:[...article.links,'/other/status/42'],times:[...article.times,'2026-10-02T13:00:00Z']}]},op).observations[0];
  assert.equal(ambiguity.candidateUrl,null);assert.equal(ambiguity.publishedAt,null);
  // Exercise the actual renderer function without starting a browser. Each
  // text node carries rendered line rectangles, including clipping ancestors.
  const rect=(top,bottom,left=0,right=300)=>({top,bottom,left,right,width:right-left,height:bottom-top});
  const style={visibility:'visible',display:'block',opacity:'1',overflowX:'visible',overflowY:'visible',clipPath:'none',maskImage:'none',clip:'auto'};
  const element=(box,ownStyle={},parentElement=null)=>({getBoundingClientRect:()=>box,style:{...style,...ownStyle},parentElement,clientLeft:0,clientTop:0,clientWidth:box.width,clientHeight:box.height,nodes:[]});
  const node=(parentElement,textContent,rectangles)=>{const n={parentElement,textContent,rectangles};parentElement.nodes.push(n);return n;};
  const header=element(rect(0,30));node(header,`Fixture @${op.handle}`,[rect(0,30)]);
  const account=element(rect(40,60));
  const post=element(rect(100,400));
  node(post,'VISIBLE',[rect(100,120)]);
  node(post,'BELOW_FOLD_SECRET',[rect(880,920)]);
  const clip=element(rect(200,230),{overflowY:'hidden'});
  const clipped=element(rect(200,260),{},clip);node(clipped,'CLIPPED_SECRET',[rect(200,260)]);post.nodes.push(...clipped.nodes);
  const hiddenAncestor=element(rect(300,350),{opacity:'0'});
  const hidden=element(rect(300,320),{},hiddenAncestor);node(hidden,'HIDDEN_SECRET',[rect(300,320)]);post.nodes.push(...hidden.nodes);
  const shaped=element(rect(400,440),{clipPath:'circle(10%)'});node(shaped,'MASKED_SECRET',[rect(400,420)]);post.nodes.push(...shaped.nodes);
  const articleElement=element(rect(100,920));articleElement.querySelector=selector=>selector.includes('tweetText')?post:null;articleElement.querySelectorAll=()=>[];
  const main={querySelectorAll:()=>[articleElement]};
  const document={
    querySelector:selector=>selector==='main'?main:selector.includes('UserName')?header:selector.includes('AccountSwitcher')?account:null,
    querySelectorAll:()=>[],
    createTreeWalker:el=>{let i=0;return {nextNode:()=>el.nodes[i++]||null};},
    createRange:()=>{let selected;return {selectNodeContents:n=>{selected=n;},getClientRects:()=>selected.rectangles};},
  };
  const rendered=vm.runInNewContext(`(${visibleViewport.toString()})({expectedHandle:handle,verifiedIdentity:''})`,{document,NodeFilter:{SHOW_TEXT:4},getComputedStyle:el=>el.style,innerWidth:1280,innerHeight:900,location:new URL(op.url),handle:op.handle});
  assert.equal(rendered.articles[0].text,'VISIBLE');
  assert.ok(!JSON.stringify(rendered).includes('SECRET'));
  const loading=fake([{...ready,articles:[]},ready]);
  const result=await observeOperation(loading.page,op,loading.dependencies);
  assert.equal(result.status,'partial');assert.equal(result.viewports.length,1);assert.equal(result.coverageComplete,false);assert.equal(loading.counts().reads,2);
  const timeout=fake([{...ready,articles:[]}]);assert.equal((await observeOperation(timeout.page,op,timeout.dependencies)).status,'timeout');assert.equal(timeout.counts().reads,4);
  const scroll=fake([ready,{...ready,identity:''},{...ready,identity:''}]);
  const scrolled=await observeOperation(scroll.page,bind({...request,maxScrolls:2,timeoutMs:3000}),scroll.dependencies);
  assert.equal(scrolled.scrolls,2);assert.equal(scrolled.viewports.length,3);assert.equal(scrolled.status,'partial');
  const blocked=fake([ready,{...ready,login:true}]);
  const partial=await observeOperation(blocked.page,bind({...request,maxScrolls:1,timeoutMs:3000}),blocked.dependencies);
  assert.equal(partial.status,'authentication-required');assert.equal(partial.viewports.length,1);
  const hanging=fake([ready]);hanging.page.evaluate=()=>new Promise(()=>{});
  assert.equal((await observeOperation(hanging.page,{...op,request:{...request,timeoutMs:20}})).status,'timeout');
  const release=acquireWriter(root);assert.throws(()=>acquireWriter(root),/EEXIST/);release();
  const again=acquireWriter(root);again();
  const batchInput={registry,run,session,requests:[{...request,operationId:'batch-one'},{...request,operationId:'batch-two'}],maxDurationMs:3000};
  const batch=bindObservationBatch(batchInput);
  assert.throws(()=>bindObservationBatch({...batchInput,maxDurationMs:90001}),/BATCH_CONTRACT/);
  assert.throws(()=>bindObservationBatch({...batchInput,requests:Array(7).fill(request)}),/BATCH_CONTRACT/);
  assert.throws(()=>bindObservationBatch({...batchInput,requests:[request,request]}),/DUPLICATE/);
  const batchRoot=privateDirectory(path.join(root,'batch')), shared=fake([ready]);let guards=0;
  const batched=await observeBatch(batchRoot,shared.page,batch,{...shared.dependencies,beforeOperation:()=>{guards++;}});
  assert.equal(batched.receipts.length,2);assert.equal(batched.pending.length,0);assert.equal(shared.counts().navigations,2);assert.equal(guards,2);
  assert.equal(batched.coverageComplete,false);assert.equal(batched.sourceReviewRequired,true);
  const replayed=await observeBatch(batchRoot,shared.page,batch,{...shared.dependencies,beforeOperation:()=>{}});
  assert.ok(replayed.receipts.every(r=>r.reused));assert.equal(shared.counts().navigations,2);
  const stopRoot=privateDirectory(path.join(root,'stopped-batch')), challenge=fake([{...ready,notices:'Verify your identity'}]);
  const stopped=await observeBatch(stopRoot,challenge.page,batch,{...challenge.dependencies,beforeOperation:()=>{}});
  assert.equal(stopped.stop,'challenge');assert.equal(stopped.receipts.length,1);assert.equal(stopped.pending.length,1);assert.equal(challenge.counts().navigations,1);
  const guardRoot=privateDirectory(path.join(root,'guard-batch')), guarded=fake([ready]);let guardCalls=0;
  const guardStop=await observeBatch(guardRoot,guarded.page,batch,{...guarded.dependencies,beforeOperation:()=>{if(++guardCalls===2)throw Error('WORK_BUDGET_STOP');}});
  assert.equal(guardStop.stop,'WORK_BUDGET_STOP');assert.equal(guardStop.receipts.length,1);assert.equal(guarded.counts().navigations,1);
  const interruptedRoot=privateDirectory(path.join(root,'interrupted-batch')), interrupted=fake([ready]);let attempts=0;
  const persistenceStop=await observeBatch(interruptedRoot,interrupted.page,batch,{...interrupted.dependencies,beforeOperation:()=>{
    if(++attempts===2){const o=batch.operations[1];fs.writeFileSync(path.join(interruptedRoot,'evidence',`${o.binding}-${o.request.sourceId}-${o.request.operationId}.json.pending`),'{}',{flag:'wx',mode:0o600});}
  }});
  assert.equal(persistenceStop.stop,'BATCH_PERSISTENCE_FAILED');assert.equal(persistenceStop.receipts.length,1);assert.equal(persistenceStop.pending.length,1);
  assert.deepEqual(persistenceStop.failure,{phase:'persistence',code:'EEXIST'});assert.equal(persistenceStop.pending[0].state,'review-required');
  assert.ok(fs.existsSync(persistenceStop.receipts[0].file));assert.equal(interrupted.counts().navigations,1);
  const interruptedReplay=await observeBatch(interruptedRoot,interrupted.page,batch,{...interrupted.dependencies,beforeOperation:()=>{}});
  assert.equal(interruptedReplay.receipts[0].reused,true);assert.equal(interruptedReplay.pending[0].state,'review-required');assert.equal(interrupted.counts().navigations,1);
  const deadlineRoot=privateDirectory(path.join(root,'deadline-batch')), noTime=fake([ready]);
  assert.equal((await observeBatch(deadlineRoot,noTime.page,batch,{...noTime.dependencies,deadline:0,beforeOperation:()=>{}})).stop,'BATCH_DEADLINE');
  assert.equal(noTime.counts().navigations,0);
  const failed=fake([ready]);failed.page.evaluate=async()=>{throw Error('Execution context was destroyed secret=https://private.invalid/token');};
  const failedResult=await observeOperation(failed.page,op,failed.dependencies);
  assert.deepEqual(failedResult.failure,{phase:'rendered-read',code:'RENDER_CONTEXT_CHANGED'});
  assert.ok(!JSON.stringify(failedResult).includes('secret'));
  assert.deepEqual(sanitizedBrowserFailure(Error('net::ERR_CONNECTION_RESET https://private.invalid/token'),'navigation'),{phase:'navigation',code:'NETWORK_FAILURE'});
  const browser=fake([ready]);
  const first=await captureAndPersist(root,browser.page,op,browser.dependencies);
  assert.equal(first.status,'partial');assert.equal(fs.statSync(first.file).mode&0o777,0o600);
  const reuse=await captureAndPersist(root,browser.page,op,browser.dependencies);assert.equal(reuse.reused,true);assert.equal(browser.counts().navigations,1);
  assert.throws(()=>privateDirectory(path.join(root,'missing','child')));
  const next=await captureAndPersist(root,browser.page,bind({...request,operationId:'two'}),browser.dependencies);
  const checkpoints=fs.readdirSync(path.join(root,'evidence')).filter(n=>!n.includes('-one.')&&!n.includes('-two.'));
  const cumulative=JSON.parse(fs.readFileSync(path.join(root,'evidence',checkpoints[0])));
  assert.equal(cumulative.operations.length,2);assert.equal(cumulative.operations[0].sha256,first.sha256);assert.equal(cumulative.operations[1].sha256,next.sha256);
  await assert.rejects(()=>captureAndPersist(root,browser.page,bind({...request,maxScrolls:1}),browser.dependencies),/OPERATION_ID_CONFLICT/);
  fs.writeFileSync(first.file,JSON.stringify({...JSON.parse(fs.readFileSync(first.file)),status:'tampered'}));await assert.rejects(()=>captureAndPersist(root,browser.page,op,browser.dependencies),/EVIDENCE_HASH_MISMATCH/);
  const alias=path.join(root,'alias');fs.symlinkSync(path.join(root,'evidence'),alias);assert.throws(()=>privateDirectory(alias),/ALIAS/);
  const loose=path.join(root,'loose');fs.mkdirSync(loose,{mode:0o755});assert.throws(()=>privateDirectory(loose),/OWNER_ONLY/);
  console.log('Dedicated worker offline fixtures passed: registry/window binding, readiness, wall deadline, login/challenge, identity, ambiguous dates, exact cutoff, scrolling, exclusive writer, cumulative immutable evidence, reuse/hash conflict and private paths. No browser launched.');
} finally {fs.rmSync(root,{recursive:true,force:true});}
