import fs from 'node:fs';
import { enqueue, pending, beginAttempt, planPage, confirmPage, finishAttempt } from './lib/command-centre.mjs';
import { assertPrivateArtifact } from './lib/private-artifacts.mjs';
const [command,...args] = process.argv.slice(2);
const arg = name => args.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3);
const read = name => JSON.parse(fs.readFileSync(assertPrivateArtifact(arg(name)),'utf8'));
try {
  let result;
  if(command==='record') { const input=read('input'); result=enqueue(arg('outbox'),input.event,input.receipts); }
  else if(command==='pending') result=pending(arg('outbox'));
  else if(command==='begin') result=beginAttempt(arg('outbox'),arg('event'),arg('invocation'),arg('context'));
  else if(command==='plan') { const input=read('input'); result=planPage(input.page,input.event,input.kind,input.savedAt); }
  else if(command==='confirm') { const input=read('input'); result=confirmPage(input.page,input.event,input.plan,input.confirmedAt); }
  else if(command==='finish') result=finishAttempt(arg('outbox'),arg('attempt'),read('input'));
  else throw new Error('UNKNOWN_REPORTING_COMMAND');
  if(arg('output')) fs.writeFileSync(assertPrivateArtifact(arg('output')),JSON.stringify(result,null,2)+'\n',{mode:0o600});
  else console.log(JSON.stringify(result,null,2));
} catch(error) { console.error(JSON.stringify({reportingError:error.message,sweepResultUnchanged:true})); process.exitCode=1; }
