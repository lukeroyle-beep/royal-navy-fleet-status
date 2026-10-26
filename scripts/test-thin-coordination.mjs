import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { execFileSync, spawnSync } from 'node:child_process';
import { bootstrapSweep, inspectSweepBootstrap, locateSweepSession } from './lib/sweep-bootstrap.mjs';
import { evaluateSweepUsage } from './lib/sweep-work-budget.mjs';
import { renderNativeReportingCell } from './lib/native-reporting-cell.mjs';
import { enqueue, digest, DESTINATION, HISTORY } from './lib/command-centre.mjs';

const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'rnfs-thin-fixture-')));
const thread='00000000-0000-4000-8000-000000000001', now=Date.parse('2026-10-03T12:00:00Z');
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
try {
  const repo=path.join(root,'repo');fs.mkdirSync(repo);
  const git=args=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git(['init']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--allow-empty','-m','fixture']);
  const sessions=path.join(root,'sessions'), day=path.join(sessions,'2026/10/03');fs.mkdirSync(day,{recursive:true});
  const session=path.join(day,`rollout-${thread}.jsonl`);
  const records=[{type:'session_meta',payload:{id:thread}},{type:'event_msg',timestamp:new Date(now).toISOString(),payload:{type:'token_count',info:{total_token_usage:{input_tokens:100,cached_input_tokens:50,output_tokens:2,total_tokens:102}}}}];
  fs.writeFileSync(session,records.map(x=>JSON.stringify(x)).join('\n')+'\n');
  const config={schemaVersion:1,expectedHead:git(['rev-parse','HEAD']),directory:path.join(root,'boot'),privateRoot:root,backupDirectory:root,trigger:'scheduled',lastGoodRelease:'Fixture',nextScheduledAt:null,references:[]};
  const dependencies={repository:repo,environment:{CODEX_THREAD_ID:thread},now,locate:id=>locateSweepSession(id,sessions,now),usage:()=>evaluateSweepUsage(records,thread,{now})};
  const snapshot=()=>fs.readdirSync(root,{recursive:true}).sort().map(name=>{
    const file=path.join(root,name),stat=fs.lstatSync(file);
    return [name,stat.mode,stat.isFile()?fs.readFileSync(file):null];
  });
  const beforeInspect=snapshot();
  const inspected=inspectSweepBootstrap(config,{...dependencies,
    locate:()=>assert.fail('Inspection must not locate/read the native journal'),
    usage:()=>assert.fail('Inspection must not invoke the usage guard')});
  assert.equal(inspected.outcome,'BOOTSTRAP_INSPECTED');
  assert.equal(inspected.usageChecked,false);assert.equal(inspected.filesCreated,false);
  assert.equal(inspected.collectionStarted,false);assert.equal(inspected.preflightPassed,false);
  assert.ok(JSON.stringify(inspected).length<700);
  assert.deepEqual(snapshot(),beforeInspect);
  assert.throws(()=>inspectSweepBootstrap({...config,expectedHead:'0'.repeat(40)},dependencies),/CLEAN_EXPECTED/);
  assert.throws(()=>inspectSweepBootstrap({...config,references:[null]},dependencies));
  assert.deepEqual(snapshot(),beforeInspect);
  // A completed first model round supplies usage; inspection does not invent it.
  const delayedRecords=[records[0]], delayedConfig={...config,directory:path.join(root,'delayed-boot')};
  const delayedDependencies={...dependencies,now:now+691,
    usage:()=>evaluateSweepUsage(delayedRecords,thread,{now:now+691})};
  assert.equal(inspectSweepBootstrap(delayedConfig,delayedDependencies).outcome,'BOOTSTRAP_INSPECTED');
  assert.throws(()=>bootstrapSweep(delayedConfig,delayedDependencies),/USAGE_MEASUREMENT_UNAVAILABLE/);
  assert.equal(fs.existsSync(delayedConfig.directory),false);
  delayedRecords.push({...records[1],timestamp:new Date(now+690).toISOString()});
  assert.equal(bootstrapSweep(delayedConfig,delayedDependencies).outcome,'BOOTSTRAP_PREPARED');
  const expiredDependencies={...dependencies,usage:()=>evaluateSweepUsage(delayedRecords,thread,{now:now+120691})};
  assert.throws(()=>bootstrapSweep(config,expiredDependencies),/USAGE_MEASUREMENT_UNAVAILABLE/);
  const thresholdRecords=[records[0],{...records[1],payload:{type:'token_count',info:{total_token_usage:{input_tokens:199998,cached_input_tokens:199000,output_tokens:2,total_tokens:200000}}}}];
  assert.equal(bootstrapSweep(config,{...dependencies,usage:()=>evaluateSweepUsage(thresholdRecords,thread,{now})}).outcome,'WORK_BUDGET_STOP');
  assert.equal(fs.existsSync(config.directory),false);
  // Run the real CLI in a clean isolated checkout; no native journal is needed.
  const cliRepo=path.join(root,'cli-repo');fs.mkdirSync(path.join(cliRepo,'scripts','lib'),{recursive:true});
  for(const file of ['bootstrap-sweep.mjs','lib/private-artifacts.mjs','lib/sweep-bootstrap.mjs',
    'lib/sweep-work-budget.mjs','lib/command-centre.mjs','lib/sweep-stop.mjs'])
    fs.copyFileSync(path.join('scripts',file),path.join(cliRepo,'scripts',file));
  const cliGit=args=>execFileSync('git',args,{cwd:cliRepo,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  cliGit(['init']);cliGit(['add','scripts']);
  cliGit(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture']);
  const cliConfig=path.join(root,'inspect-config.json'), stopFile=path.join(root,'forbidden-stop.json');
  write(cliConfig,{...config,expectedHead:cliGit(['rev-parse','HEAD'])});
  const invoke=extra=>spawnSync(process.execPath,[path.join(cliRepo,'scripts/bootstrap-sweep.mjs'),
    '--inspect','--config='+cliConfig,...extra],{encoding:'utf8',env:{...process.env,CODEX_THREAD_ID:thread}});
  const cliBefore=snapshot(),cliSuccess=invoke([]);
  assert.equal(cliSuccess.status,0,cliSuccess.stderr);assert.equal(JSON.parse(cliSuccess.stdout).outcome,'BOOTSTRAP_INSPECTED');
  assert.deepEqual(snapshot(),cliBefore);
  const cliConflict=invoke(['--stop-output='+stopFile]);
  assert.equal(cliConflict.status,2);assert.equal(JSON.parse(cliConflict.stdout).outcome,'BOOTSTRAP_INSPECTION_STOPPED');
  assert.equal(JSON.parse(cliConflict.stdout).diagnostic,'INSPECTION_CANNOT_SAVE_STOP');
  assert.equal(fs.existsSync(stopFile),false);assert.deepEqual(snapshot(),cliBefore);
  fs.writeFileSync(cliConfig,'malformed');const malformedBefore=snapshot(),cliInvalid=invoke([]);
  assert.equal(cliInvalid.status,2);assert.equal(JSON.parse(cliInvalid.stdout).filesCreated,false);
  assert.deepEqual(snapshot(),malformedBefore);
  assert.throws(()=>bootstrapSweep({...config,expectedHead:'0'.repeat(40)},dependencies),/CLEAN_EXPECTED/);
  assert.equal(fs.existsSync(config.directory),false);
  assert.throws(()=>bootstrapSweep({...config,schemaVersion:2},dependencies),/CONFIG/);
  assert.equal(bootstrapSweep(config,{...dependencies,usage:()=>({allowed:false})}).outcome,'WORK_BUDGET_STOP');
  assert.equal(fs.existsSync(config.directory),false);
  assert.throws(()=>bootstrapSweep(config,{...dependencies,usage:()=>evaluateSweepUsage(records,thread,{now:now+120001})}),/MEASUREMENT/);
  assert.throws(()=>bootstrapSweep(config,{...dependencies,environment:{CODEX_THREAD_ID:'invalid'}}),/INVOCATION/);
  const link=path.join(root,'link');fs.symlinkSync(root,link);
  assert.throws(()=>bootstrapSweep({...config,directory:path.join(link,'boot')},dependencies),/NEW_PRIVATE/);
  fs.writeFileSync(path.join(repo,'dirty'),'untracked');assert.throws(()=>bootstrapSweep(config,dependencies),/CLEAN_EXPECTED/);fs.unlinkSync(path.join(repo,'dirty'));
  for(const invalid of [{references:[null]},{references:[{label:'Bad',url:'https://example.invalid'}]},{lastGoodRelease:'Bad|text'},{lastGoodRelease:'Bearer secret'}]){
    assert.throws(()=>bootstrapSweep({...config,...invalid},dependencies));assert.equal(fs.existsSync(config.directory),false);
  }
  const headroom={nextResponseTokens:10000,closeoutTokens:80000};
  assert.equal(bootstrapSweep({...config,headroom:{}},dependencies).outcome,'WORK_HEADROOM_UNKNOWN');
  assert.equal(fs.existsSync(config.directory),false);
  assert.equal(bootstrapSweep({...config,headroom:{...headroom,nextResponseTokens:200000}},dependencies).outcome,'WORK_HEADROOM_STOP');
  assert.equal(fs.existsSync(config.directory),false);
  const boot=bootstrapSweep({...config,headroom},dependencies);assert.equal(boot.outcome,'BOOTSTRAP_PREPARED');
  assert.deepEqual(JSON.parse(fs.readFileSync(boot.startupConfig)).headroom,headroom);
  assert.equal(boot.sessionPath,session);assert.deepEqual(fs.readdirSync(config.directory).sort(),['reporting-context.json','startup-config.json']);
  assert.equal(fs.existsSync(path.join(config.directory,'attempt')),false);
  assert.throws(()=>bootstrapSweep(config,dependencies),/NEW_PRIVATE/);
  const other=path.join(sessions,'2026/10/02');fs.mkdirSync(other);fs.writeFileSync(path.join(other,`other-${thread}.jsonl`),'');
  assert.throws(()=>locateSweepSession(thread,sessions,now),/NOT_UNIQUE/);

  const event={schemaVersion:1,runId:'RUN',eventId:'EVENT',revision:1,runStartedAt:'2026-10-03T10:00:00Z',recordedAt:'2026-10-03T10:01:00Z',evidenceAt:'2026-10-03T10:01:00Z',completedAt:'2026-10-03T10:01:00Z',trigger:'scheduled',outcome:'PREFLIGHT_FAILED',coverage:{sources:[0,76],discovery:[0,7],vessels:[0,69],integrity:[0,6]},publication:'Unchanged',lastGoodRelease:'Fixture',blocker:'Fixture stop',nextAction:'Review',backup:'Not reached',nextScheduledAt:null,facts:'No collection',references:[]};
  async function scenario(mode, mirrored=false) {
    const dir=path.join(root,(mirrored?'mirrored-':'')+mode);fs.mkdirSync(dir);
    const outbox=path.join(dir,'outbox'), eventFile=path.join(dir,'event.json');write(eventFile,event);
    enqueue(outbox,event,[{path:eventFile,sha256:digest(fs.readFileSync(eventFile,'utf8'))}]);
    if(mode==='mismatch')write(eventFile,{...event,facts:'Different valid payload with same identifier'});
    const pages=[DESTINATION,HISTORY].map(page_id=>({structuredContent:{content:{page_id,blocks:[{id:'instructions',kind:'agent_instructions',hash:'i',markdown:'Preserve manual text.'},{id:'manual',kind:'markdown',hash:'m',markdown:'Manual content'}]},metadata:{stream_kind:'content'},guidance:'Respect expected hashes.'}}));
    pages.forEach(p=>Object.assign(p.structuredContent.metadata,{preview:'Initial preview',current_sequence:0,projection_through_sequence:0}));
    if(mode==='text')pages.forEach(p=>{p.content=[{type:'text',text:'Independent guidance'}];});
    if(mode==='shadowed-guidance')pages.forEach(p=>{p.guidance='Wrapper guidance';});
    if(mode==='sequence')pages.forEach(p=>{p.structuredContent.content.through_sequence=0;});
    if(mode==='checkpoint')pages.forEach(p=>{p.structuredContent.content.checkpoint_id='initial';});
    if(mode==='selected-read' || mode==='incomplete-read')pages.forEach(p=>{p.structuredContent.selection={whole_page_complete:true,page_block_count:2,returned_block_count:2};});
    if(mode==='full-read')pages.forEach(p=>{p.structuredContent.view='full';p.structuredContent.content.markdown=p.structuredContent.content.blocks.map(b=>b.markdown).join('\n\n');});
    if(mode==='view')pages.forEach(p=>{p.structuredContent.view='editing';});
    const present=p=>{
      const result=structuredClone(p);
      if(mode==='text-association')result.content=[{type:'text',text:JSON.stringify(p.structuredContent),annotations:{audience:['assistant']}},{type:'text',text:'Independent guidance',annotations:{audience:['user']}}];
      if(mirrored)result.content=[{type:'text',text:JSON.stringify(p.structuredContent)},...(result.content||[])];
      return result;
    };
    const reads=pages.map((p,i)=>{const file=path.join(dir,`reviewed${i}.json`);write(file,present(p));return file;});
    const cellConfig={schemaVersion:1,event:eventFile,outbox,directory:path.join(dir,"transport ' quoted"),invocation:thread,context:'scheduled',guidanceReviewed:true,reviewedReads:reads};
    assert.throws(()=>renderNativeReportingCell({...cellConfig,guidanceReviewed:false},process.cwd()),/REVIEWED/);
    const code=renderNativeReportingCell(cellConfig,process.cwd());
    const outputs=[],counts=[0,0];let edits=0;
    const tools={
      exec_command:async({cmd,workdir})=>{
        try{return {exit_code:0,output:execFileSync('/bin/sh',['-c',cmd],{cwd:workdir,env:{...process.env,CODEX_THREAD_ID:thread},encoding:'utf8',maxBuffer:2e6,stdio:['ignore','pipe','pipe']})};}
        catch(e){return {exit_code:1,output:e.stdout?.toString()||''};}
      },
      apply_patch:async patch=>{
        const lines=patch.split('\n'), file=lines[1].slice('*** Add File: '.length);
        assert.ok(file.startsWith(cellConfig.directory+'/'));
        fs.writeFileSync(file,lines.slice(2,-1).map(x=>x.slice(1)).join('\n'),{flag:'wx'});return {};
      },
      mcp__codex_apps__chatgpt_space_read_page:async({page_id,stream_kind})=>{
        if(mode==='event-mutation')write(eventFile,{...event,facts:'Changed after binding'});
        assert.equal(stream_kind,'content');const i=[DESTINATION,HISTORY].indexOf(page_id);counts[i]++;
        if(mode==='denial')throw Error('denied');
        if(mode==='timestamp')pages[i].structuredContent.metadata.updated_at=new Date(counts[i]*1000).toISOString();
        if(mode==='sequence' && counts[i]===2)pages[i].structuredContent.content.through_sequence++;
        if(mode==='checkpoint' && counts[i]===2)pages[i].structuredContent.content.checkpoint_id='saved';
        if(mode==='selected-read')delete pages[i].structuredContent.selection;
        if(mode==='incomplete-read')pages[i].structuredContent.selection.whole_page_complete=false;
        if(mode==='view')delete pages[i].structuredContent.view;
        if(mode==='full-read'){pages[i].structuredContent.view='editing';delete pages[i].structuredContent.content.markdown;}
        if(mode==='control' && counts[i]===2)pages[i].structuredContent.metadata.stream_kind='other';
        if(mode==='metadata-policy' && counts[i]===2)pages[i].structuredContent.metadata.policy='Changed control';
        if(mode==='access' && counts[i]===2)pages[i].structuredContent.metadata.access={can_write:false};
        if(mode==='owner' && counts[i]===2)pages[i].structuredContent.metadata.owner_workspace_id='changed-owner';
        if(mode==='identity' && counts[i]===2)pages[i].structuredContent.content.page_id='other';
        if(mode==='instruction' && counts[i]===2)pages[i].structuredContent.content.blocks[0].markdown='Changed policy';
        if(mode==='instruction-metadata' && counts[i]===2)pages[i].structuredContent.content.blocks[0].metadata={policy:'Changed instruction metadata'};
        if(mode==='guidance' && counts[i]===2)pages[i].structuredContent.guidance='Changed instructions';
        if(mode==='shadowed-guidance' && counts[i]===2)pages[i].structuredContent.guidance='Changed hidden payload guidance';
        if(mode==='text' && counts[i]===2)pages[i].content[0].text='Changed independent guidance';
        if(mode==='payload-control' && counts[i]===2)pages[i].structuredContent.policy='New control field';
        if(mode==='content-control' && counts[i]===2)pages[i].structuredContent.content.policy='New control field';
        if(mode==='wrapper-control' && counts[i]===2)pages[i].policy='New control field';
        if((mode==='manual' && counts[i]===2) || (mode==='final' && counts[i]===3))pages[i].structuredContent.content.blocks.at(-1).markdown='Manual replacement of managed table';
        const result=present(pages[i]);
        if(mode==='conflicting-text' && counts[i]===2)result.content=[{type:'text',text:JSON.stringify({...pages[i].structuredContent,guidance:'Contradictory mirror'})}];
        if(mode==='unsupported' && counts[i]===2)result.content=[{type:'image',data:'fixture'}];
        if(mode==='text-association' && counts[i]===2){const pair=result.content.slice(-2);[pair[0].text,pair[1].text]=[pair[1].text,pair[0].text];}
        return result;
      },
      mcp__codex_apps__chatgpt_space_edit_page:async({page_id,operations})=>{
        edits++;const blocks=pages[[DESTINATION,HISTORY].indexOf(page_id)].structuredContent.content.blocks;
        if(mode==='ignored')return {structuredContent:{operation_results:operations.map((_,operation_index)=>({operation_index,status:'applied',ignored_reason:'block_deleted'}))}};
        if(mode==='partial')return {structuredContent:{commit_status:'unknown',operation_results:operations.map((_,operation_index)=>({operation_index,status:'applied'}))}};
        if(mode==='rejected')return {structuredContent:{error:{commit_status:'not_committed',details:{operation_results:operations.map((_,operation_index)=>({operation_index,status:'rejected'}))}}}};
        for(const op of operations){
          const block={id:'managed',kind:'markdown',hash:digest(op.markdown),markdown:op.markdown,metadata:op.block_units[0].metadata};
          if(op.op==='insert_markdown')blocks.push(block);
          else {const i=blocks.findIndex(b=>b.id===op.block_id);assert.equal(blocks[i].hash,op.expected_hash);blocks[i]=block;}
        }
        // Native Page reads change snapshot metadata after our own writes.
        // Exercise this drift alongside every content and control guard.
        const metadata=pages[[DESTINATION,HISTORY].indexOf(page_id)].structuredContent.metadata;
        metadata.preview=blocks.map(b=>b.markdown).join('\n\n').slice(0,250);
        metadata.current_sequence++;
        metadata.projection_through_sequence=metadata.current_sequence;
        if(mode==='unknown')throw Error('transport lost');
        return {structuredContent:{operation_results:operations.map((_,operation_index)=>({operation_index,status:'applied'}))}};
      },
    };
    await vm.runInNewContext(`(async()=>{${code}})()`,{tools,text:x=>outputs.push(x)});
    assert.equal(outputs.length,1);assert.ok(JSON.stringify(outputs).length<600);
    assert.equal(pages[0].structuredContent.content.blocks[1].markdown,'Manual content');
    if(['success','timestamp','event-mutation','sequence','checkpoint','selected-read','full-read','view'].includes(mode)){
      assert.equal(outputs[0].state,'delivered');assert.equal(edits,4);assert.deepEqual(counts,[3,3]);
      // Repeat a stable event with newly inspected guidance: no writes, same guards.
      write(eventFile,event);pages.forEach((p,i)=>write(reads[i],present(p)));cellConfig.directory=path.join(dir,'replay');
      const replay=renderNativeReportingCell(cellConfig,process.cwd());
      await vm.runInNewContext(`(async()=>{${replay}})()`,{tools,text:x=>outputs.push(x)});
      assert.equal(outputs[1].state,'delivered');assert.equal(edits,4);
      cellConfig.directory=path.join(dir,'third');
      await vm.runInNewContext(`(async()=>{${renderNativeReportingCell(cellConfig,process.cwd())}})()`,{tools,text:x=>outputs.push(x)});
      assert.equal(outputs[2].state,'pending');assert.equal(edits,4);
    }else{
      assert.equal(outputs[0].state,'pending');
      if(mode==='final'){assert.equal(edits,4);assert.deepEqual(counts,[3,3]);}
      else {assert.ok(edits<=1);assert.equal(counts[1],0);}
      if(mode==='unknown' || mode==='rejected')assert.equal(counts[0],2); // reread, never replay
      if(['guidance','control','metadata-policy','access','owner','identity','instruction','instruction-metadata','text','payload-control','content-control','wrapper-control','shadowed-guidance','text-association','incomplete-read'].includes(mode))assert.equal(outputs[0].error,'PAGE_GUIDANCE_CHANGED');
      if(mode==='incomplete-read')assert.equal(edits,0);
      // The native adapter retains the raw read and wraps a failed local CLI.
      // Parser-specific diagnostics are asserted in the compact-summary tests.
      if(['conflicting-text','unsupported'].includes(mode))assert.equal(outputs[0].error,'LOCAL_REPORTING_COMMAND_FAILED');
      if(mode==='mismatch'){assert.equal(edits,0);assert.deepEqual(counts,[0,0]);assert.equal(outputs[0].error,'QUEUED_EVENT_MISMATCH');}
    }
  }
  for(const mirrored of [false,true])for(const mode of ['success','timestamp','control','metadata-policy','access','owner','identity','instruction','instruction-metadata','guidance','manual','final','unknown','rejected','ignored','partial','denial','mismatch','event-mutation','text','payload-control','content-control','wrapper-control','shadowed-guidance','conflicting-text','unsupported','sequence','checkpoint','selected-read','full-read','view','text-association','incomplete-read'])await scenario(mode,mirrored);
  console.log('Thin coordination fixtures passed: native cell execution, guarded writes/replay, guidance/manual conflicts, unknown saves, denial/retry bounds, bootstrap provenance and no-mutation stops. No live tools used.');
} finally {fs.rmSync(root,{recursive:true,force:true});}
