import fs from 'node:fs';
import { readReportingFile, reportingInputFromFiles, summarizePageRead, summarizeReportingResult } from './lib/reporting-files.mjs';
import { enqueue, pending, beginAttempt, planPage, confirmPage, finishAttempt } from './lib/command-centre.mjs';
import { assertPrivateArtifact } from './lib/private-artifacts.mjs';
const [command,...args] = process.argv.slice(2);
const arg = name => args.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3);
const read = name => readReportingFile(arg(name));
const input = () => arg('files') ? reportingInputFromFiles(command, read('files')) : read('input');
try {
  if(args.includes('--compact') && !arg('output') && command !== 'page-summary') throw new Error('COMPACT_REQUIRES_FULL_PRIVATE_OUTPUT');
  let result;
  if(command==='page-summary') result=summarizePageRead(read('input'));
  else if(command==='record') { const value=read('input'); result=enqueue(arg('outbox'),value.event,value.receipts); }
  else if(command==='pending') result=pending(arg('outbox'));
  else if(command==='begin') result=beginAttempt(arg('outbox'),arg('event'),arg('invocation'),arg('context'));
  else if(command==='plan') { const value=input(); result=planPage(value.page,value.event,value.kind,value.savedAt); }
  else if(command==='confirm') { const value=input(); result=confirmPage(value.page,value.event,value.plan,value.confirmedAt); }
  else if(command==='finish') result=finishAttempt(arg('outbox'),arg('attempt'),input());
  else throw new Error('UNKNOWN_REPORTING_COMMAND');
  if(arg('output')) fs.writeFileSync(assertPrivateArtifact(arg('output')),JSON.stringify(result,null,2)+'\n',{mode:0o600});
  if(args.includes('--compact') && command !== 'page-summary') console.log(JSON.stringify(summarizeReportingResult(command,result)));
  else if(!arg('output')) console.log(JSON.stringify(result,null,2));
} catch(error) { console.error(JSON.stringify({reportingError:error.message,sweepResultUnchanged:true})); process.exitCode=1; }
