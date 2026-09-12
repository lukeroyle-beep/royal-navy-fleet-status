// Read-only replay of a full historical browser observation set. No network,
// private artifact writes, cursor migration, evidence acceptance or publication.
import fs from 'node:fs';
import path from 'node:path';
import { resolvePrivateInputs } from './lib/private-inputs.mjs';
import { validateXBrowserSession } from './lib/x-browser-collection.mjs';
import { acquireSources, SUCCESS } from './lib/acquisition.mjs';
import { preprocessEvidence, adjudicationQueue } from './lib/sweep-analysis.mjs';
const name=process.argv.find(a=>a.startsWith('--session='))?.slice(10);
if (!name) throw new Error('Provide --session=<path relative to private root>');
const input=resolvePrivateInputs();
if(input.mode!=='external')throw new Error('Historical replay requires external private inputs');
const file=fs.realpathSync(path.resolve(input.root,name));
const relative=path.relative(input.root,file);
if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Session must remain within private root');
const session=JSON.parse(fs.readFileSync(file,'utf8'));
validateXBrowserSession(session);
const registry=input.readJson('sources'), entities=input.readJson('vessels');
const sources=session.accounts.map(a=>({...registry.sources.find(s=>s.sourceId===a.sourceId),sourceId:a.sourceId,mandatory:a.required,collectionMode:'replay',acquisition:{adapter:'replay',group:'replay',retry:{attempts:1,baseMs:0,maxMs:0}}}));
async function replay(concurrency){
 const transactions=[];
 const journal={transactions,latest(id){return transactions.findLast(t=>t.sourceId===id&&SUCCESS.has(t.outcome));},commit(t){transactions.push(t);return t;}};
 const before=performance.now();
 const result=await acquireSources({sources,runId:'historical-replay',registryHash:session.accountRegistryHash,cutoff:session.window.to,journal,concurrency,adapters:{replay:async({source})=>{
  const account=session.accounts.find(a=>a.sourceId===source.sourceId);
  if(account.state!=='checked')return {outcome:account.state==='rate-limited'?'RATE_LIMITED':'SOURCE_UNAVAILABLE',reason:'Retained historical browser failure'};
  return {examined:true,extractionComplete:true,method:'historical-rendered-observation-replay',items:session.posts.filter(p=>p.sourceClaim.sourceId===source.sourceId).map(p=>({id:p.postId,url:p.canonicalUrl,text:p.sourceClaim.excerpt,publishedAt:p.sourceClaim.publishedAt,retrievedAt:p.sourceClaim.retrievedAt,originId:p.originId,eventTime:p.interpretation.eventTime}))};
 }},extract:(items,source)=>preprocessEvidence(items,source,{vessels:entities.vessels,cutoff:session.window.to,windowStart:session.window.from})});
 const queue=adjudicationQueue(result.records.flatMap(r=>r.candidates));
 return {concurrency:result.timings.peakConcurrency,runtimeMs:performance.now()-before,sourceCount:result.records.length,success:result.records.filter(r=>SUCCESS.has(r.outcome)).length,failed:result.records.filter(r=>!SUCCESS.has(r.outcome)).length,items:result.records.reduce((n,r)=>n+r.items.length,0),adjudication:queue.items.length,priority1:queue.items.filter(i=>i.priority===1).length,conflicts:queue.conflicts.length};
}
console.log(JSON.stringify({kind:'historical-content-replay-not-live-acquisition',publicationEligible:false,historicalBrowserSessionElapsedMs:Date.parse(session.updatedAt)-Date.parse(session.createdAt),serial:await replay(1),concurrent:await replay(4),limitations:['Historical session timestamps include operator delays and exclude prior canary work.','Replay does not measure browser retrieval, Astra reasoning, release validation or deployment.','Original failures remain failures; the historical session is not converted into fresh source coverage.']},null,2));
