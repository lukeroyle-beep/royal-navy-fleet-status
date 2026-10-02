import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { assertPrivateArtifact } from './private-artifacts.mjs';

export const DESTINATION = 'page_16c3cf55b8d48191b8750da033279fa5';
export const HISTORY = 'page_bb858131ca6c8191ab2650a42515bfa3';
export const OUTCOMES = ['PUBLISHED', 'NO_CHANGES', 'BLOCKED_COVERAGE', 'PREFLIGHT_FAILED', 'COLLECTION_FAILED', 'PUBLICATION_FAILED', 'IN_PROGRESS'];
export const digest = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,140}$/.test(value);
function requireThat(test, message) { if (!test) throw new Error(message); }
function safeText(value) {
  requireThat(typeof value === 'string' && value.length <= 1500 && !/[\r\n|<>]/.test(value), 'INVALID_PUBLIC_TEXT');
  requireThat(!/(?:\/Users\/|\/Volumes\/|\/private\/|file:\/\/|Bearer\s|sk-[A-Za-z0-9]|-----BEGIN|password\s*[:=]|token\s*[:=]|cookie\s*[:=])/i.test(value), 'RESTRICTED_PUBLIC_TEXT');
  return value.replace(/([\\`*\[\]])/g, '\\$1');
}
export function validateEvent(e) {
  const keys = ['schemaVersion','runId','eventId','revision','runStartedAt','recordedAt','evidenceAt','completedAt','trigger','outcome','coverage','publication','lastGoodRelease','blocker','nextAction','backup','nextScheduledAt','facts','references'];
  requireThat(e && Object.keys(e).every(k => keys.includes(k)) && e.schemaVersion === 1, 'INVALID_EVENT_SCHEMA');
  requireThat(identifier(e.runId) && identifier(e.eventId) && Number.isSafeInteger(e.revision) && e.revision > 0, 'INVALID_EVENT_ID');
  for (const k of ['runStartedAt','recordedAt','evidenceAt']) requireThat(iso(e[k]), `INVALID_${k}`);
  requireThat(e.completedAt === null || iso(e.completedAt), 'INVALID_COMPLETION');
  requireThat(e.nextScheduledAt === null || iso(e.nextScheduledAt), 'INVALID_SCHEDULE');
  requireThat(Date.parse(e.recordedAt) >= Date.parse(e.runStartedAt), 'INVALID_EVENT_ORDER');
  requireThat(['scheduled','manual','unknown'].includes(e.trigger) && OUTCOMES.includes(e.outcome), 'INVALID_OUTCOME');
  for (const k of ['publication','lastGoodRelease','blocker','nextAction','backup','facts']) safeText(e[k]);
  requireThat(e.coverage && Object.keys(e.coverage).sort().join() === 'discovery,integrity,sources,vessels', 'INVALID_COVERAGE');
  for (const pair of Object.values(e.coverage)) requireThat(Array.isArray(pair) && pair.length === 2 && pair.every(n => n === null || (Number.isSafeInteger(n) && n >= 0)) && (pair.includes(null) || pair[0] <= pair[1]), 'INVALID_COVERAGE_COUNT');
  if (['NO_CHANGES','PUBLISHED'].includes(e.outcome)) requireThat(Object.values(e.coverage).every(([a,b]) => a !== null && b > 0 && a === b), 'INCOMPLETE_COVERAGE_CANNOT_SUCCEED');
  requireThat(Array.isArray(e.references) && e.references.length <= 12, 'INVALID_REFERENCES');
  for (const r of e.references) {
    requireThat(Object.keys(r).sort().join() === 'label,url', 'INVALID_REFERENCE'); safeText(r.label);
    const u = new URL(r.url);
    requireThat(u.protocol === 'https:' && !u.username && !u.password && !u.search && ['github.com','chatgpt.com'].includes(u.hostname), 'UNSAFE_REFERENCE');
    requireThat(u.hostname !== 'github.com' || u.pathname.startsWith('/lukeroyle-beep/royal-navy-fleet-status/'), 'UNRELATED_REFERENCE');
  }
  return e;
}
// Immutable records avoid a process-owned lock or mutable global queue. A crash
// before link leaves only an ignored temp file; after link the entire record is
// visible. Each event/revision and attempt slot is acquired atomically.
function directory(root) {
  root = assertPrivateArtifact(root); fs.mkdirSync(root, {recursive:true,mode:0o700}); return root;
}
function atomic(file, value) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  const fd = fs.openSync(temp,'wx',0o600);
  try { fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd); } finally {fs.closeSync(fd);}
  try { fs.linkSync(temp,file); }
  catch(error) { if(error.code!=='EEXIST')throw error; requireThat(digest(JSON.parse(fs.readFileSync(file,'utf8')))===digest(value),'IMMUTABLE_RECORD_CONFLICT'); }
  finally { fs.unlinkSync(temp); }
  const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
  return value;
}
function records(root, prefix) {
  return fs.readdirSync(root).filter(n=>n.startsWith(prefix)&&n.endsWith('.json')).map(n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8')));
}
function events(root) {
  // Legacy candidate queues stay preserved and are read-only during migration.
  const old=path.join(root,'outbox.json');
  const entries=[...(fs.existsSync(old)?JSON.parse(fs.readFileSync(old,'utf8')).events:[]),...records(root,'revision-'),...records(root,'event-')];
  for(const x of entries) for(const y of entries) if(x.event.eventId===y.event.eventId) requireThat(digest(x.event)===digest(y.event),'EVENT_ID_COLLISION');
  return [...new Map(entries.map(x=>[x.event.eventId,x])).values()];
}
export function enqueue(root, event, receipts) {
  validateEvent(event);
  requireThat(Array.isArray(receipts)&&receipts.length>0,'RECORDED_EVIDENCE_REQUIRED');
  for(const r of receipts) requireThat(/^[a-f0-9]{64}$/.test(r.sha256)&&digest(fs.readFileSync(assertPrivateArtifact(r.path),'utf8'))===r.sha256,'RECEIPT_HASH_MISMATCH');
  root=directory(root);
  const prior=events(root);const same=prior.find(x=>x.event.eventId===event.eventId);
  if(same){requireThat(digest(same.event)===digest(event),'EVENT_ID_COLLISION');return same;}
  for(const x of prior.filter(x=>x.event.runId===event.runId)) {
    requireThat(x.event.revision!==event.revision,'REVISION_COLLISION');
    requireThat((x.event.revision<event.revision)===(Date.parse(x.event.recordedAt)<Date.parse(event.recordedAt)),'REVISION_TIME_CONFLICT');
  }
  // Reservation survives interruption and can be reused only by the same payload.
  const entry={event,receipts,status:'pending'};
  atomic(path.join(root,`revision-${digest([event.runId,event.revision])}.json`),entry);
  return atomic(path.join(root,`event-${digest(event.eventId)}.json`),entry);
}
export function pending(root) {
  root=directory(root);const all=events(root);const finishes=records(root,'finish-');
  return all.filter(x=>!finishes.some(f=>f.eventId===x.event.eventId&&f.state==='delivered')).filter(x=>!all.some(y=>y.event.runId===x.event.runId&&y.event.revision>x.event.revision)).map(x=>x.event);
}
export function beginAttempt(root,eventId,invocationId,context,now=new Date().toISOString()) {
  requireThat(identifier(invocationId)&&['scheduled','manual'].includes(context),'INVALID_INVOCATION');root=directory(root);
  const entry=events(root).find(x=>x.event.eventId===eventId);requireThat(entry,'EVENT_MISSING');
  for(let slot=1;slot<=2;slot++) {
    const file=path.join(root,`attempt-${digest([eventId,invocationId,slot])}.json`);
    if(fs.existsSync(file))continue;
    const attempt={id:crypto.randomUUID(),eventId,eventDigest:digest(entry.event),invocationId,context,startedAt:now,state:'pending',error:null};
    try{return atomic(file,attempt);}catch(error){if(error.message!=='IMMUTABLE_RECORD_CONFLICT')throw error;}
  }
  throw new Error('INVOCATION_RETRY_LIMIT');
}
export function london(value) {
  if (value === null) return 'Unverified';
  const date = new Date(value);
  const local = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/London',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date);
  const zone = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',timeZoneName:'short'}).formatToParts(date).find(x=>x.type==='timeZoneName').value;
  return `${local} ${zone}`;
}
export function render(event, savedAt) {
  validateEvent(event); requireThat(iso(savedAt), 'INVALID_SAVE_TIME');
  const count = pair => pair.map(n=>n === null ? 'unverified' : n).join('/');
  return [
    '| RNFS recorded outcome | Value |','|---|---|',
    `| Run | ${event.runId} |`, `| Event | ${event.eventId}; revision ${event.revision} |`,
    `| Outcome | ${event.outcome}; ${event.trigger} |`,
    `| Coverage completed/expected | Sources ${count(event.coverage.sources)}; discovery ${count(event.coverage.discovery)}; vessels ${count(event.coverage.vessels)}; integrity ${count(event.coverage.integrity)} |`,
    ...[['Publication','publication'],['Last good release','lastGoodRelease'],['Blocker','blocker'],['Next action','nextAction'],['Backup','backup'],['Evidence qualifications','facts']].map(([label,key])=>`| ${label} | ${safeText(event[key])} |`),
    `| Evidence date | ${london(event.evidenceAt)} |`, `| Run completion | ${london(event.completedAt)} |`,
    `| Outcome recorded | ${london(event.recordedAt)} |`, `| Next scheduled run | ${london(event.nextScheduledAt)}; daily 12:00 Europe/London |`,
    `| Space update attempt | ${london(savedAt)} |`,
    '| Confirmed Space update | Pending saved-field readback |',
    `| Evidence links | ${event.references.map(r=>`[${safeText(r.label)}](${r.url})`).join(' · ') || 'No accessible receipt link verified; private receipts retained'} |`
  ].join('\n');
}
function body(page) { return page.structuredContent || page; }
export function planPage(page, event, kind, savedAt) {
  const p = body(page); const expectedPage = kind === 'summary' ? DESTINATION : HISTORY;
  requireThat(p.content?.page_id === expectedPage && p.content.blocks && (!p.selection || p.selection.whole_page_complete), 'FULL_DESTINATION_READ_REQUIRED');
  const candidates = p.content.blocks.filter(b => b.metadata?.rnfsReporting?.kind === kind && (kind === 'summary' || b.metadata.rnfsReporting.runId === event.runId));
  requireThat(candidates.length <= 1, 'DUPLICATE_MANAGED_BLOCKS');
  const b = candidates[0]; const prior = b?.metadata.rnfsReporting;
  if (prior) {
    const newerRun = Date.parse(prior.runStartedAt) > Date.parse(event.runStartedAt);
    const newerEvent = prior.runId === event.runId && prior.revision > event.revision;
    if (newerRun || newerEvent) return {page_id:expectedPage, operations:[], superseded:true, kind, eventId:event.eventId};
    if (prior.eventId === event.eventId) {
      requireThat(prior.eventDigest === digest(event) && b.markdown.includes(prior.managedMarkdown), 'MANUAL_EDIT_CONFLICT');
      return {page_id:expectedPage,operations:[],expected:prior.managedMarkdown,confirmedAt:prior.confirmedAt,kind,eventId:event.eventId};
    }
    requireThat(typeof prior.managedMarkdown === 'string' && b.markdown.split(prior.managedMarkdown).length === 2, 'MANUAL_EDIT_CONFLICT');
  }
  const expected = render(event, savedAt);
  const metadata = {rnfsReporting:{kind,runId:event.runId,runStartedAt:event.runStartedAt,revision:event.revision,eventId:event.eventId,eventDigest:digest(event),managedMarkdown:expected}};
  const markdown = b ? b.markdown.replace(prior.managedMarkdown,expected) : expected;
  const block_units = [{kind:'markdown',markdown,metadata}];
  const op = b ? {op:'replace_block_markdown',block_id:b.id,expected_hash:b.hash,markdown,block_units} : {op:'insert_markdown',at:{kind:'between_blocks',preceding_block_id:kind==='summary'?null:(p.content.blocks.at(-1)?.id||null),following_block_id:kind==='summary'?(p.content.blocks[0]?.id||null):null},markdown,block_units};
  return {page_id:expectedPage,stream_kind:p.metadata?.stream_kind||'content',operations:[op],expected,kind,eventId:event.eventId};
}
export function verifyPage(page, event, plan) {
  const p = body(page); requireThat(p.content?.page_id === plan.page_id, 'WRONG_READBACK_PAGE');
  const blocks = p.content.blocks.filter(b=>b.metadata?.rnfsReporting?.kind === plan.kind && (plan.kind==='summary'||b.metadata.rnfsReporting.runId===event.runId));
  requireThat(blocks.length === 1, 'READBACK_BLOCK_MISSING_OR_DUPLICATE');
  const b = blocks[0], m = b.metadata.rnfsReporting;
  if (plan.superseded) requireThat((Date.parse(m.runStartedAt)>Date.parse(event.runStartedAt)) || (m.runId===event.runId && m.revision>event.revision), 'SUPERSESSION_NOT_VERIFIED');
  else requireThat(m.eventId===event.eventId && m.eventDigest===digest(event) && b.markdown.includes(plan.expected), 'READBACK_MISMATCH');
  return {pageId:p.content.page_id,blockId:b.id,hash:b.hash,eventId:m.eventId,superseded:!!plan.superseded};
}
export function confirmPage(page,event,plan,confirmedAt=new Date().toISOString()) {
  verifyPage(page,event,plan);
  if(plan.superseded)return plan;
  const p=body(page), b=p.content.blocks.find(b=>b.metadata?.rnfsReporting?.eventId===event.eventId&&b.metadata.rnfsReporting.kind===plan.kind);
  const prior=b.metadata.rnfsReporting;
  if(prior.confirmedAt)return {...plan,expected:prior.managedMarkdown,confirmedAt:prior.confirmedAt,operations:[]};
  requireThat(iso(confirmedAt),'INVALID_CONFIRMATION_TIME');
  const expected=prior.managedMarkdown.replace('| Confirmed Space update | Pending saved-field readback |',`| Confirmed Space update | ${london(confirmedAt)} |`);
  const markdown=b.markdown.replace(prior.managedMarkdown,expected);
  return {...plan,expected,confirmedAt,operations:[{op:'replace_block_markdown',block_id:b.id,expected_hash:b.hash,markdown,block_units:[{kind:'markdown',markdown,metadata:{rnfsReporting:{...prior,managedMarkdown:expected,confirmedAt}}}]}]};
}
export function finishAttempt(root,attemptId,{event,plans,readbacks,error,confirmedAt=new Date().toISOString()}) {
  root=directory(root);const attempt=records(root,'attempt-').find(x=>x.id===attemptId);
  requireThat(attempt&&!fs.existsSync(path.join(root,`finish-${attemptId}.json`)),'ATTEMPT_NOT_PENDING');
  let result;
  if(error) result={...attempt,state:'failed',error:String(error).slice(0,300)};
  else {
    const queued=events(root).find(x=>x.event.eventId===attempt.eventId)?.event;
    requireThat(queued&&digest(event)===digest(queued)&&digest(event)===attempt.eventDigest,'QUEUED_EVENT_MISMATCH');
    requireThat(plans?.length===2&&readbacks?.length===2&&plans[0].page_id===DESTINATION&&plans[0].kind==='summary'&&plans[1].page_id===HISTORY&&plans[1].kind==='history','BOTH_DESTINATIONS_REQUIRED');
    const proofs=plans.map((p,i)=>verifyPage(readbacks[i],event,p));
    for(let i=0;i<2;i++)if(!plans[i].superseded) {
      const b=body(readbacks[i]).content.blocks.find(b=>b.id===proofs[i].blockId);
      requireThat(iso(b.metadata.rnfsReporting.confirmedAt)&&plans[i].confirmedAt===b.metadata.rnfsReporting.confirmedAt,'CONFIRMED_TIME_REQUIRED');
    }
    result={...attempt,state:'delivered',confirmedAt,readback:proofs};
  }
  return atomic(path.join(root,`finish-${attemptId}.json`),result);
}
