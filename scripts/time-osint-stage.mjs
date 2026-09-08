import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { atomicJson } from './lib/acquisition.mjs';
const value = name => process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const stages = new Set(['registry-loading','acquisition-startup','browser-acquisition','evidence-extraction','preprocessing','adjudication','fleet-reconciliation','integrity-audit','snapshot-generation','validation','deployment']);
const stage=value('stage'), directory=value('directory'), runId=value('run-id');
const separator=process.argv.indexOf('--');
const command=process.argv.slice(separator+1);
if(!stages.has(stage)||!directory||!path.isAbsolute(directory)||!runId||separator<0||!command.length)throw new Error('Use --stage=NAME --directory=PRIVATE_DIR --run-id=ID -- COMMAND ARGUMENTS');
fs.mkdirSync(directory,{recursive:true,mode:0o700});
let parent=fs.realpathSync(directory);
while(parent!==path.dirname(parent)){
 if(fs.existsSync(path.join(parent,'.git')))throw new Error('Stage timing must remain outside every checkout');
 parent=path.dirname(parent);
}
const eventId=crypto.randomUUID();
const startedAt=new Date().toISOString(), began=performance.now();
atomicJson(path.join(directory,`${eventId}-start.json`),{eventId,runId,stage,event:'started',startedAt});
const child=spawn(command[0],command.slice(1),{stdio:'inherit'});
const result=await new Promise(resolve=>{child.once('error',error=>resolve({code:null,error:error.message}));child.once('exit',(code,signal)=>resolve({code,signal}));});
atomicJson(path.join(directory,`${eventId}-end.json`),{eventId,runId,stage,event:'finished',startedAt,completedAt:new Date().toISOString(),durationMs:performance.now()-began,...result});
process.exitCode=result.code===0?0:1;
