import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { POLICY, privateDirectory, acquireWriter, readPrivateJson, bindOperation, captureAndPersist } from './lib/dedicated-browser-worker.mjs';

// No daemon, web server, CDP endpoint, arbitrary script, URL or shell interface.
// Authentication belongs to Chrome. This process never reads profile files.
const root=path.join(os.homedir(),'Library/Application Support/Royal Navy Fleet Status/dedicated-browser-worker');
const args=process.argv.slice(2);
if(args[0]==='--help') {
  console.log('setup: open a new dedicated headed Chrome profile for manual sign-in.\nobserve --authorised-collection /absolute/private/job.json: bounded review-only capture.\nSee docs/dedicated-browser-worker.md. Neither command is scheduled automatically.');
  process.exit(0);
}
let release, context;
try {
  if(!((args.length===1 && args[0]==='setup') || (args.length===3 && args[0]==='observe' && args[1]==='--authorised-collection'))) throw Error('USAGE_INVALID');
  if(process.platform!=='darwin' || process.getuid()===0) throw Error('UNPRIVILEGED_MAC_REQUIRED');
  process.umask(0o077);
  privateDirectory(root);release=acquireWriter(root);
  const marker=path.join(root,'profile-policy.json'), profile=path.join(root,'chrome-profile');
  let operation;
  if(args[0]==='setup') {
    if(!fs.existsSync(marker)) {
      if(fs.existsSync(profile)) throw Error('EXISTING_PROFILE_NOT_ADOPTED');
      fs.writeFileSync(marker,JSON.stringify({policy:POLICY,profile:'chrome-profile'}),{flag:'wx',mode:0o600});
    }
  }
  const policy=readPrivateJson(marker);
  if(policy.policy!==POLICY || policy.profile!=='chrome-profile') throw Error('PROFILE_POLICY_INVALID');
  privateDirectory(profile);
  if(args[0]==='observe') {
    const job=readPrivateJson(args[2]);
    if(Object.keys(job).sort().join()!==['registry','run','session','request'].sort().join()) throw Error('JOB_CONTRACT_INVALID');
    operation=bindOperation({registry:readPrivateJson(job.registry),run:readPrivateJson(job.run),session:readPrivateJson(job.session),request:job.request});
  }
  const {chromium}=await import('playwright-core');
  context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:false,chromiumSandbox:true,
    viewport:{width:1280,height:900},acceptDownloads:false,timeout:30000});
  context.setDefaultTimeout(5000);
  const page=await context.newPage();
  for(const other of context.pages()) if(other!==page) await other.close();
  context.on('page',other=>{if(other!==page)other.close().catch(()=>{});});
  if(args[0]==='setup') {
    await page.goto('https://x.com/i/flow/login',{waitUntil:'domcontentloaded',timeout:30000});
    console.log('Sign into this dedicated Chrome window yourself, then close the window. No observations are captured. Setup does not verify collection readiness.');
    await new Promise(resolve=>context.once('close',resolve));
    context=null;
    console.log(JSON.stringify({status:'setup-window-closed',loginVerified:false,collectionStarted:false}));
  } else {
    console.log(JSON.stringify(await captureAndPersist(root,page,operation)));
  }
} catch(error) {
  // Never echo browser error text, URLs, profile contents or credentials.
  console.error(JSON.stringify({status:'stopped',code:/^[A-Z_]+$/.test(error.message)?error.message:'WORKER_STOPPED',coverageComplete:false,publicationEligible:false}));
  process.exitCode=1;
} finally {
  if(context) await context.close().catch(()=>{});
  if(release) release();
}
