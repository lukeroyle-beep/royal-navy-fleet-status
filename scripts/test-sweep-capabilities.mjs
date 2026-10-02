import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkSweepCapabilities } from './lib/sweep-capabilities.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rnfs-capabilities-'));
try {
  const config = { schemaVersion: 1, privateRoot: root, backupDirectory: root, ownerPid: 123 };
  let writes = 0, owners = 0, clock = 0;
  const probes = { encrypted: () => true, ownerAlive: () => { owners++; return true; }, write: () => writes++ };
  const call = changed => checkSweepCapabilities({ config, probes, now: () => clock++, ...changed });
  let r = await call({probes:{...probes,encrypted:()=>{throw new Error('EPERM private secret');}}});
  assert.equal(r.diagnostic,'BACKUP_ENCRYPTION_UNAVAILABLE');
  assert.equal(writes,0); assert.equal(owners,0);
  assert.equal(r.checks.length,2); assert.ok(!JSON.stringify(r).includes('private secret'));
  r = await call({probes:{...probes,ownerAlive:()=>{throw Object.assign(new Error('private'),{diagnostic:'OWNER_LIVENESS_PERMISSION_UNAVAILABLE'});}}});
  assert.equal(r.diagnostic,'OWNER_LIVENESS_PERMISSION_UNAVAILABLE'); assert.equal(writes,0);
  r = await call({});
  assert.equal(r.outcome,'CAPABILITY_CHECK_PASSED'); assert.equal(r.ownerChecked,true);
  assert.equal(r.preflightPassed,false); assert.equal(r.backupRestoreVerified,false);
  assert.equal(r.collectionStarted,false); assert.equal(r.publicationEligible,false);
  assert.ok(r.checks.every(c=>c.elapsedMs>=0)); assert.equal(writes,2);
  r = await call({config:{...config,ownerPid:undefined}});
  assert.equal(r.ownerChecked,false); assert.equal(r.checks.some(c=>c.check==='OWNER_LIVENESS'),false);
  const before=writes;
  r=await call({config:{...config,ownerPid:-1}});
  assert.equal(r.diagnostic,'CAPABILITY_CONFIG_INVALID');assert.equal(writes,before);
  r=await call({probes:{...probes,encrypted:()=>false}});
  assert.equal(r.diagnostic,'BACKUP_ENCRYPTION_UNAVAILABLE');assert.equal(writes,before);
  console.log('Early capability fixtures: fail before preparation/write, typed denial, measured checks, no readiness or collection claim.');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
