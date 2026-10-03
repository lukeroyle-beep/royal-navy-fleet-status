import fs from 'node:fs';
import path from 'node:path';
import { assertPrivateArtifact } from './private-artifacts.mjs';
import { readReportingFile, summarizePageRead } from './reporting-files.mjs';
import { validateEvent, DESTINATION, HISTORY } from './command-centre.mjs';
import { nativeReportingFlow } from './native-reporting-flow.mjs';

// This function's source runs only in the supported native functions runtime.
// All shell arguments are quoted; Page JSON is written with the file tool, never
// interpolated into shell commands. Full results stay inside JS/private files.
async function nativeAdapter(config, tools, flow) {
  const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
  const run = async cmd => {
    const result = await tools.exec_command({cmd,workdir:config.repository,max_output_tokens:20000});
    if (result.exit_code !== 0) throw Error('LOCAL_REPORTING_COMMAND_FAILED');
    return result.output;
  };
  if ((await run('printenv CODEX_THREAD_ID')).trim() !== config.invocation) throw Error('INVOCATION_MISMATCH');
  await run('mkdir -m 700 ' + quote(config.directory)); // exclusive attempt transport
  let index=0;
  const next = () => config.directory + '/record-' + (++index) + '.json';
  const load = async file => JSON.parse(await run('cat ' + quote(file)));
  const save = async value => {
    const file=next(), bytes=JSON.stringify(value,null,2);
    const result=await tools.apply_patch('*** Begin Patch\n*** Add File: '+file+'\n+'+bytes.split('\n').join('\n+')+'\n*** End Patch');
    if (result?.isError) throw Error('PRIVATE_SAVE_FAILED');
    return file;
  };
  const cli = async (command,flags=[]) => {
    const output=next();
    await run(['node','scripts/command-centre.mjs',command,...flags,'--output='+output,'--compact'].map(quote).join(' '));
    return {file:output,value:await load(output)};
  };
  const fileCommand = async (command,spec) => cli(command,['--files='+await save(spec)]);
  const event=await load(config.event);
  const planFiles=new Map();
  const io={
    reviewed:async()=>config.reviewedSummaries,
    begin:async()=> (await cli('begin',['--outbox='+config.outbox,'--event='+event.eventId,'--invocation='+config.invocation,'--context='+config.context])).value,
    read:async i=> {
      const result=await tools.mcp__codex_apps__chatgpt_space_read_page({page_id:config.pages[i],stream_kind:'content'});
      return save(result);
    },
    summary:async file=>JSON.parse(await run(['node','scripts/command-centre.mjs','page-summary','--input='+file].map(quote).join(' '))),
    plan:async(i,page)=> {
      const result=await fileCommand('plan',{page,event:config.event,kind:i?'history':'summary',at:new Date().toISOString()});
      planFiles.set(result.value,result.file);return result.value;
    },
    edit:async plan=> {
      const result=await tools.mcp__codex_apps__chatgpt_space_edit_page({page_id:plan.page_id,stream_kind:plan.stream_kind||'content',operations:plan.operations});
      await save(result);return result;
    },
    confirm:async(i,page,plan)=> {
      const result=await fileCommand('confirm',{page,event:config.event,plan:planFiles.get(plan),at:new Date().toISOString()});
      planFiles.set(result.value,result.file);return result.value;
    },
    finish:async(attempt,plans,readbacks)=> {
      const spec=await save({event:config.event,plans:plans.map(p=>planFiles.get(p)),readbacks});
      const result=await cli('finish',['--outbox='+config.outbox,'--attempt='+attempt.id,'--files='+spec]);
      return {state:result.value.state,eventId:result.value.eventId,confirmedAt:result.value.confirmedAt,receipt:result.file};
    },
    fail:async(attempt,error)=>cli('finish',['--outbox='+config.outbox,'--attempt='+attempt.id,'--input='+await save({error})]),
  };
  return flow(io);
}

export function renderNativeReportingCell(config, repository) {
  if(config?.schemaVersion!==1 || !/^[a-f0-9-]{36}$/i.test(config.invocation||'') ||
      !['manual','scheduled'].includes(config.context) || config.guidanceReviewed !== true ||
      !Array.isArray(config.reviewedReads) || config.reviewedReads.length!==2) throw Error('REVIEWED_REPORTING_CONFIG_REQUIRED');
  const event=assertPrivateArtifact(config.event), outbox=assertPrivateArtifact(config.outbox), directory=assertPrivateArtifact(config.directory);
  validateEvent(readReportingFile(event));
  if(path.resolve(config.directory)!==directory || fs.existsSync(directory) || !fs.statSync(path.dirname(directory)).isDirectory() || !fs.statSync(outbox).isDirectory()) throw Error('NEW_TRANSPORT_DIRECTORY_REQUIRED');
  const pages=[DESTINATION,HISTORY];
  const reviewedSummaries=[];
  const reviewedReads=config.reviewedReads.map((file,i)=>{
    const resolved=assertPrivateArtifact(file), summary=summarizePageRead(readReportingFile(resolved));
    if(summary.pageId!==pages[i] || !summary.wholePageComplete || (summary.metadata?.stream_kind||'content')!=='content') throw Error('COMPLETE_CONTENT_PAGES_REQUIRED');
    reviewedSummaries.push(summary);
    return resolved;
  });
  const value={repository,directory,event,outbox,invocation:config.invocation,context:config.context,reviewedReads,reviewedSummaries,pages};
  return `// Reviewed native reporting cell; execute only after inspecting Page guidance.\ntext(await (${nativeAdapter.toString()})(${JSON.stringify(value)}, tools, ${nativeReportingFlow.toString()}));\n`;
}
