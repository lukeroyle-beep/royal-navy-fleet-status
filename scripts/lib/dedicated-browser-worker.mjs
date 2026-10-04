import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { assertPrivateArtifact } from './private-artifacts.mjs';
import { assertSessionBinding } from './x-browser-collection.mjs';

export const POLICY = 'dedicated-headed-chrome-20261003';
export const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const fail = code => { throw Error(code); };

// A new owner-only location, never a copied Chrome profile. Reject symlinked
// ancestors and repository locations instead of silently resolving into them.
export function privateDirectory(directory) {
  const target = assertPrivateArtifact(directory);
  if (target !== path.resolve(directory)) fail('PRIVATE_PATH_ALIAS');
  for (let p = target; p !== path.dirname(p); p = path.dirname(p)) {
    const s = fs.lstatSync(p, {throwIfNoEntry:false});
    if (s?.isSymbolicLink()) fail('PRIVATE_PATH_ALIAS');
  }
  if (!fs.existsSync(target)) fs.mkdirSync(target, {mode:0o700});
  const s = fs.lstatSync(target);
  if (!s.isDirectory() || s.uid !== process.getuid() || (s.mode & 0o077)) fail('OWNER_ONLY_DIRECTORY_REQUIRED');
  return target;
}
export function acquireWriter(root) {
  const file = path.join(root, 'writer.lock');
  const fd = fs.openSync(file, 'wx', 0o600); // no stale-lock takeover
  fs.writeFileSync(fd, JSON.stringify({pid:process.pid, startedAt:new Date().toISOString()}));
  return () => { fs.closeSync(fd); fs.unlinkSync(file); };
}
function immutable(root, name, value) {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  const file = path.join(root, name);
  fs.writeFileSync(file, bytes, {flag:'wx', mode:0o600});
  return {file, sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
export function readPrivateJson(file) {
  if (assertPrivateArtifact(file) !== path.resolve(file)) fail('PRIVATE_PATH_ALIAS');
  const s = fs.lstatSync(file);
  if (!s.isFile() || s.isSymbolicLink() || s.uid !== process.getuid() || (s.mode & 0o077) || s.size > 8*1024*1024) fail('PRIVATE_INPUT_REQUIRED');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
export function bindOperation({registry, run, session, request}) {
  assertSessionBinding(session, {registry, run});
  if (!request || Object.keys(request).sort().join() !== ['operationId','policy','runId','sourceId','timeoutMs','maxScrolls','window'].sort().join() ||
      request.policy !== POLICY || !identifier(request.operationId) || request.runId !== run.runId ||
      JSON.stringify(request.window) !== JSON.stringify(run.window) ||
      !Number.isInteger(request.timeoutMs) || request.timeoutMs < 1000 || request.timeoutMs > 30000 ||
      !Number.isInteger(request.maxScrolls) || request.maxScrolls < 0 || request.maxScrolls > 2) fail('OPERATION_CONTRACT_INVALID');
  const account = session.accounts.find(a => a.sourceId === request.sourceId);
  if (!account || !/^[A-Za-z0-9_]{1,15}$/.test(account.handle)) fail('SOURCE_NOT_SELECTED');
  const from = Date.parse(run.window.from), to = Date.parse(run.window.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) fail('WINDOW_INVALID');
  return {request:structuredClone(request), handle:account.handle, url:`https://x.com/${account.handle}`,
    binding:hash({runId:run.runId, window:run.window, registry:session.accountRegistryHash, selection:session.selectionHash})};
}

// Executed in the renderer. Inspect only displayed UI, never storage, cookies,
// network payloads, hidden post trees or the user's account-menu contents.
export function visibleViewport({expectedHandle, verifiedIdentity}) {
  if (location.origin !== "https://x.com" || location.pathname.toLowerCase() !== `/${expectedHandle}`.toLowerCase() || location.search || location.hash) return {url:location.href, notices:"", articles:[]};
  const visible = el => {
    if (!el) return false;
    for(let p=el;p;p=p.parentElement) {
      const style=getComputedStyle(p);
      if(style.visibility!=='visible' || style.display==='none' || Number(style.opacity)===0 || style.contentVisibility==='hidden') return false;
    }
    const r=el.getBoundingClientRect();
    return r.width>0 && r.height>0 && r.bottom>0 && r.right>0 && r.top<innerHeight && r.left<innerWidth;
  };
  const fullyVisible = (rect, el) => {
    if(!visible(el) || rect.width<=0 || rect.height<=0 || rect.top<0 || rect.left<0 || rect.bottom>innerHeight || rect.right>innerWidth) return false;
    for(let p=el;p;p=p.parentElement) {
      const s=getComputedStyle(p), r=p.getBoundingClientRect();
      // Unknown shaped clips/masks are not evidence of visible text.
      if((s.clipPath && s.clipPath!=='none') || (s.maskImage && s.maskImage!=='none') || (s.clip && s.clip!=='auto')) return false;
      const left=r.left+p.clientLeft, top=r.top+p.clientTop;
      if(s.overflowX && s.overflowX!=='visible' && (rect.left<left || rect.right>left+p.clientWidth)) return false;
      if(s.overflowY && s.overflowY!=='visible' && (rect.top<top || rect.bottom>top+p.clientHeight)) return false;
    }
    return true;
  };
  const text = el => {
    if (!visible(el)) return '';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const parts=[];
    for(let n=walker.nextNode(); n; n=walker.nextNode()) {
      const range=document.createRange(); range.selectNodeContents(n);
      const rects=[...range.getClientRects()];
      // Omit the entire node if even one rendered line is clipped or below fold.
      // Never copy full textContent merely because its box intersects the view.
      if(rects.length && rects.every(r=>fullyVisible(r,n.parentElement))) parts.push(n.textContent);
    }
    return parts.join(' ').trim().slice(0,6000);
  };
  const main=document.querySelector('main');
  const notices=[...document.querySelectorAll('[role="alert"], [role="dialog"], main h1, main h2')].filter(visible).map(text).join(' ');
  const profile=document.querySelector('[data-testid="UserName"]');
  const login=!![...document.querySelectorAll('input[autocomplete="username"],input[type="password"],a[href="/login"]')].find(visible);
  const protectedProfile=[...document.querySelectorAll('[data-testid="icon-lock"],[aria-label*="Protected"],[aria-label*="protected"]')].some(visible);
  const authenticated=visible(document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]'));
  const identity=text(profile)||verifiedIdentity;
  const handles=identity.match(/@[A-Za-z0-9_]{1,15}\b/g)||[];
  if (protectedProfile || login || !authenticated || handles.at(-1)?.toLowerCase()!==`@${expectedHandle}`.toLowerCase()) return {url:location.href,authenticated,login,protectedProfile,notices,identity,articles:[]};
  const articles=[...(main?.querySelectorAll('article[data-testid="tweet"]') || [])].filter(visible).slice(0,20).map(article=>({
    text:text(article.querySelector('[data-testid="tweetText"]')),
    links:[...article.querySelectorAll('a[href]')].filter(el=>fullyVisible(el.getBoundingClientRect(),el)).map(a=>a.getAttribute('href')).filter(h=>/^\/[A-Za-z0-9_]+\/status\/\d+$/.test(h)).slice(0,8),
    times:[...article.querySelectorAll('time[datetime]')].filter(el=>fullyVisible(el.getBoundingClientRect(),el)).map(t=>t.getAttribute('datetime')).slice(0,4),
    context:text(article.querySelector('[data-testid="socialContext"]')),
  }));
  return {url:location.href, authenticated, login, protectedProfile, notices, identity:text(profile), articles};
}
export function classifyViewport(view, operation) {
  const {handle, request} = operation;
  let url; try {url=new URL(view.url);} catch {return {status:'identity-conflict'};}
  if (/challenge|captcha|verify (you|your)|unusual activity|authenticate your/i.test(view.notices)) return {status:'challenge'};
  if (/rate limit|too many requests/i.test(view.notices)) return {status:'rate-limited'};
  if (view.login || /\/(login|i\/flow|account\/access)(\/|$)/.test(url.pathname)) return {status:'authentication-required'};
  if (url.origin !== 'https://x.com' || url.pathname.toLowerCase() !== `/${handle}`.toLowerCase() || url.search || url.hash) return {status:'identity-conflict'};
  if (view.protectedProfile) return {status:'unavailable'};
  if (/doesn.t exist|account suspended|posts are protected/i.test(view.notices)) return {status:'unavailable'};
  if (!view.authenticated || !view.identity || !view.articles?.length) return {status:'loading'};
  const handles=view.identity.match(/@[A-Za-z0-9_]{1,15}\b/g)||[];
  if (handles.at(-1)?.toLowerCase()!==`@${handle}`.toLowerCase()) return {status:'identity-conflict'};
  const observations=[];
  for (const article of view.articles) {
    // Ambiguous quote/repost authors and dates stay raw for evidence judgement.
    const links=[...new Set(article.links)], times=[...new Set(article.times)];
    const own=links.filter(link=>link.toLowerCase().startsWith(`/${handle}/status/`.toLowerCase()));
    const publishedAt=times.length===1 && Number.isFinite(Date.parse(times[0])) ? times[0] : null;
    observations.push({text:article.text, links, times, context:article.context,
      candidateUrl:own.length===1 && links.length===1 ? `https://x.com${own[0]}` : null,
      publishedAt, inWindow:publishedAt ? Date.parse(publishedAt)>=Date.parse(request.window.from) && Date.parse(publishedAt)<Date.parse(request.window.to) : null,
      requiresEvidenceReview:true});
  }
  return {status:'partial', observations}; // a viewport never certifies coverage
}
export async function observeOperation(page, operation, {now=Date.now, sleep=ms=>new Promise(r=>setTimeout(r,ms)),deadline:batchDeadline=Infinity}={}) {
  const deadline=Math.min(now()+operation.request.timeoutMs,batchDeadline);
  const viewports=[]; let scrolls=0, status='timeout', identity='', phase='navigation', failure=null;
  const bounded=async work=>{
    let timer;
    try {return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('DEADLINE')),Math.max(1,deadline-now()));})]);}
    finally {clearTimeout(timer);}
  };
  try {
    await bounded(()=>page.goto(operation.url,{waitUntil:'domcontentloaded',timeout:Math.max(1,deadline-now())}));
    while(now()<deadline) {
      phase='rendered-read';
      const view=await bounded(()=>page.evaluate(visibleViewport,{expectedHandle:operation.handle,verifiedIdentity:identity}));
      if(now()>=deadline) {status='timeout';break;}
      phase='classification';
      const result=classifyViewport({...view,identity:view.identity||identity},operation);
      if(result.status==='loading') {await sleep(Math.min(250,Math.max(1,deadline-now())));continue;}
      status=result.status;
      if(status!=='partial') break; // don't persist login/challenge/private UI
      identity=view.identity||identity;
      viewports.push({capturedAt:new Date(now()).toISOString(),url:operation.url,identity,observations:result.observations});
      if(scrolls>=operation.request.maxScrolls) break;
      phase='scroll';
      await bounded(()=>page.mouse.wheel(0,600)); scrolls++;
      await sleep(Math.min(500,Math.max(1,deadline-now())));
      status='timeout';
    }
  } catch(error) {
    status=error.message==='DEADLINE'||error.name==='TimeoutError'||now()>=deadline?'timeout':'navigation-failed';
    failure=sanitizedBrowserFailure(error,phase);
  }
  return {status,scrolls,viewports,...(failure ? {failure} : {}),coverageComplete:false,publicationEligible:false,noChangeClaimAllowed:false};
}

// Classify errors without retaining raw messages, URLs, browser/profile details
// or credentials. Phase distinguishes launch, navigation and renderer failures.
export function sanitizedBrowserFailure(error, phase) {
  const allowed = ['configuration','usage','lock','launch','navigation','rendered-read','classification','scroll','persistence','cleanup'];
  const message=String(error?.message || ''), name=String(error?.name || '');
  const code=message==='DEADLINE'||name==='TimeoutError' ? 'DEADLINE' :
    /Target.*closed|browser.*closed|context.*closed/i.test(message) ? 'BROWSER_CLOSED' :
    /net::ERR_|NS_ERROR_/i.test(message) ? 'NETWORK_FAILURE' :
    /Execution context was destroyed/i.test(message) ? 'RENDER_CONTEXT_CHANGED' :
    ['EEXIST','EACCES','EPERM'].includes(error?.code) ? error.code : 'OPERATION_FAILED';
  return {phase:allowed.includes(phase)?phase:'configuration',code};
}

export function bindObservationBatch({registry,run,session,requests,maxDurationMs}) {
  if(!Array.isArray(requests)||!requests.length||requests.length>6||!Number.isInteger(maxDurationMs)||maxDurationMs<1000||maxDurationMs>90000) fail('BATCH_CONTRACT_INVALID');
  const operations=requests.map(request=>bindOperation({registry,run,session,request}));
  if(new Set(operations.map(o=>`${o.request.sourceId}:${o.request.operationId}`)).size!==operations.length) fail('BATCH_DUPLICATE_OPERATION');
  return {operations,maxDurationMs};
}

// A single page and exclusive writer serve a bounded, sequential batch. Each
// operation checkpoints before the next starts. Any blocked result stops the
// batch; untouched operations remain pending, never implicitly complete.
export async function observeBatch(root,page,batch,{now=Date.now,sleep,deadline=now()+batch.maxDurationMs,beforeOperation}={}) {
  if(typeof beforeOperation!=='function'||!Array.isArray(batch.operations)||!batch.operations.length||batch.operations.length>6||
     !Number.isFinite(deadline)||deadline>now()+90000) fail('BATCH_CONTROL_REQUIRED');
  const receipts=[];
  let stop=null;
  for(const operation of batch.operations) {
    if(now()>=deadline) {stop='BATCH_DEADLINE';break;}
    try { await beforeOperation(); } // existing fresh native work guard, never a fabricated usage estimate
    catch(error) {
      stop=['WORK_BUDGET_STOP','USAGE_MEASUREMENT_UNAVAILABLE','USAGE_PROVENANCE_UNAVAILABLE','USAGE_COUNTER_RESET','USAGE_MEASUREMENT_INVALID'].includes(error.message)?error.message:'BATCH_GUARD_FAILED';
      break;
    }
    if(now()>=deadline) {stop='BATCH_DEADLINE';break;}
    const receipt=await captureAndPersist(root,page,operation,{now,...(sleep ? {sleep} : {}),deadline});
    receipts.push(receipt);
    if(receipt.status!=='partial') {stop=receipt.status;break;}
  }
  return {status:stop?'batch-stopped':'batch-partial',stop,receipts,
    pending:batch.operations.slice(receipts.length).map(o=>({sourceId:o.request.sourceId,operationId:o.request.operationId})),
    sourceReviewRequired:true,coverageComplete:false,noChangeClaimAllowed:false,publicationEligible:false};
}
export async function captureAndPersist(root, page, operation, dependencies) {
  const evidence=privateDirectory(path.join(root,'evidence'));
  const key=`${operation.binding}-${operation.request.sourceId}`;
  if (!identifier(operation.request.sourceId)) fail('SOURCE_ID_INVALID');
  const checkpoint=path.join(evidence,`${key}.json`);
  let prior={binding:operation.binding, sourceId:operation.request.sourceId, scrolls:0, operations:[]};
  if(fs.existsSync(checkpoint)) prior=readPrivateJson(checkpoint);
  if(prior.binding!==operation.binding || prior.sourceId!==operation.request.sourceId || !Array.isArray(prior.operations) || !Number.isInteger(prior.scrolls) || prior.scrolls<0 || prior.scrolls>12 || prior.operations.length>12) fail('CHECKPOINT_BINDING_INVALID');
  const ids=new Set();
  for(const entry of prior.operations) {
    if(!identifier(entry.operationId) || ids.has(entry.operationId) || entry.file!==path.join(evidence,`${key}-${entry.operationId}.json`) || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail('CHECKPOINT_BINDING_INVALID');
    ids.add(entry.operationId);
    const raw=readPrivateJson(entry.file);
    if(raw.binding!==operation.binding || raw.request?.sourceId!==operation.request.sourceId || raw.request?.operationId!==entry.operationId || hash(raw.request)!==entry.requestHash || crypto.createHash('sha256').update(fs.readFileSync(entry.file)).digest('hex')!==entry.sha256) fail('EVIDENCE_HASH_MISMATCH');
  }
  const existing=prior.operations.find(o=>o.operationId===operation.request.operationId);
  if(existing) {
    if(existing.requestHash!==hash(operation.request)) fail('OPERATION_ID_CONFLICT');
    const raw=fs.readFileSync(existing.file);
    if(crypto.createHash('sha256').update(raw).digest('hex')!==existing.sha256) fail('EVIDENCE_HASH_MISMATCH');
    return {...existing,reused:true};
  }
  if(prior.scrolls+operation.request.maxScrolls>12 || prior.operations.length>=12) fail('SOURCE_LIMIT_REACHED');
  const name=`${key}-${operation.request.operationId}.json`;
  if(fs.existsSync(path.join(evidence,name))) fail('ORPHAN_EVIDENCE_REQUIRES_REVIEW');
  // Reserve before navigation. A crash cannot silently repeat the same collection.
  const reservation=path.join(evidence,`${name}.pending`);
  fs.writeFileSync(reservation,JSON.stringify({requestHash:hash(operation.request)}),{flag:'wx',mode:0o600});
  const result=await observeOperation(page,operation,dependencies);
  const artifact={schemaVersion:1,policy:POLICY,binding:operation.binding,request:operation.request,...result};
  const ref=immutable(evidence,name,artifact);
  const receipt={operationId:operation.request.operationId,requestHash:hash(operation.request),...ref,status:result.status,
    sourceId:operation.request.sourceId,checkpoint,sourceReviewRequired:true,...(result.failure?{failure:result.failure}:{}),
    viewportCount:result.viewports.length,scrolls:result.scrolls,coverageComplete:false,publicationEligible:false,noChangeClaimAllowed:false};
  const next={...prior,scrolls:prior.scrolls+result.scrolls,operations:[...prior.operations,receipt]};
  const temp=path.join(evidence,`${key}.tmp`);
  fs.writeFileSync(temp,JSON.stringify(next,null,2)+'\n',{flag:'wx',mode:0o600}); fs.renameSync(temp,checkpoint);
  fs.unlinkSync(reservation);
  return receipt;
}
