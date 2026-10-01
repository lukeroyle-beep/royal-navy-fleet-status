import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildOperationalStatus as build, changesSince, renderOperationalStatus, FIELDS } from './lib/operational-status.mjs';
import { readSource } from './operational-status.mjs';
import { buildSweepCertificate } from './lib/sweep-certificate.mjs';
const now = '2026-10-01T12:00:00.000Z';
const id = 'SWEEP_20260927T110000Z_R1_1add15ac';
const fleet = JSON.parse(fs.readFileSync(new URL('../data/royal-navy/vessels.json', import.meta.url)));
const src = (kind, data) => ({ kind, data });
let tests = 0;
function test(name, f) { f(); tests++; console.log(`PASS ${name}`); }
const go = (s, at = now) => build(s, { now: at });
const preflight = { schemaVersion: 1, checkedAt: now, collectionStarted: false, publicationEligible: false, outcome: 'READY_FOR_COLLECTION', checks: ['REPOSITORY_WRITE', 'PRIVATE_WRITE', 'BACKUP', 'OWNERSHIP', 'OWNERSHIP_RECHECK'].map(check => ({ check, status: 'pass' })) };
const broker = { capturedAt: now, B3: 'INCOMPLETE_STATIC_IDENTITY_DISCREPANCY', B4: 'NOT_RUN' };
test('missing sources remain explicit unknown with no invented success dates', () => {
  const r = go([]); assert.equal(Object.keys(r.fields).length, Object.keys(FIELDS).length);
  for (const f of Object.values(r.fields)) { assert.equal(f.status, 'unknown'); assert.ok(f.missingInputs.length); assert.equal(f.verifiedAt, now); }
});
test('complete representations and partial evidence are independent', () => {
  const r = go([src('repository-fleet', fleet)]);
  assert.equal(r.fields.fleet.selected.value.representedCount, 69);
  assert.equal(r.fields.fleet.selected.value.pointCount, 42);
  assert.equal(r.fields.coverage.status, 'partial');
  for (const k of ['publication', 'deployment', 'rendered', 'lastCollection', 'lastCertification']) assert.equal(r.fields[k].status, 'unknown');
});
test('complete native certificate and collection timestamp; tampering fails closed', () => {
  const run = { runId: id, coverageDate: '2026-09-27', startedAt: '2026-09-27T11:00:00Z', completedAt: now, window: { to: '2026-09-27T11:00:00Z' }, releaseTarget: { asOfDate: '2026-09-27' }, sourceChecks: [], vesselOutcomes: [], complete: true, releaseContentHash: 'a'.repeat(64), sourceRegistryHash: 'b'.repeat(64) };
  const validation = Object.fromEntries(['tests','snapshot','ledger','schema'].map(k => [k,{ pass:true,artifactHash:'c'.repeat(64),command:'fixture',completedAt:now }]));
  run.certificateInputs = { acquisition:{records:[],timings:[]}, reconciliation:{records:[],pass:true,total:0,reconciled:0,staleWarnings:0}, adjudication:{decisions:[]}, validation, registeredSources:0 };
  run.sweepCertificate = buildSweepCertificate({run,...run.certificateInputs,at:now});
  assert.equal(go([src('sweep-run',run)]).fields.lastCertification.status,'passed');
  assert.equal(go([src('sweep-run',run)]).fields.lastCollection.status,'unknown');
  run.sweepCertificate.certificateHash = 'd'.repeat(64);
  const r=go([src('sweep-run',run)]);assert.equal(r.fields.certificate.status,'blocked');assert.equal(r.fields.lastCertification.status,'unknown');
});
test('stale and future evidence never becomes fresh through generation', () => {
  const s=[src('preflight',preflight)];
  assert.equal(go(s,'2026-10-03T12:00:00Z').fields.backup.status,'stale');
  assert.equal(go(s,'2026-09-30T12:00:00Z').fields.backup.status,'unknown');
  assert.equal(go(s).fields.backup.selected.observedAt,now);
});
test('conflicts preserved with production precedence independent of source order', () => {
  const other=structuredClone(fleet);other.metadata.releaseRevision=2;
  const sources=[src('repository-fleet',fleet),src('production-fleet',other)];
  const r=go(sources);assert.equal(r.fields.fleet.status,'conflicting');assert.equal(r.fields.fleet.observations.length,2);assert.equal(r.fields.fleet.selected.value.releaseRevision,2);
  assert.equal(r.contentId,go(sources.reverse()).contentId);
});
test('stable clock-independent identity, changes and freshness transitions', () => {
  const a=go([src('preflight',preflight)]),b=go([src('preflight',preflight)],'2026-10-01T12:00:01Z');
  assert.equal(a.contentId,b.contentId);assert.deepEqual(changesSince(b,a).changedFields,[]);
  const c=go([src('preflight',preflight)],'2026-10-03T12:00:00Z');assert.notEqual(a.contentId,c.contentId);assert.ok(changesSince(c,a).changedFields.includes('backup'));assert.equal(changesSince(a).resetRequired,true);
});
test('code and fixture pass cannot establish runtime or production readiness', () => {
  const r=go([src('engineering',{observedAt:now,commit:'a'.repeat(40),items:[{number:116,kind:'pull-request',state:'MERGED'}]}),src('preflight',preflight),src('broker-static',broker),src('deployment',{pass:true}),src('rendered',{pass:true})]);
  assert.equal(r.fields.brokerB1.status,'partial');assert.equal(r.fields.brokerB3.status,'blocked');assert.equal(r.fields.brokerB4.status,'unknown');assert.equal(r.fields.scheduler.selected.value.productionReady,false);assert.equal(r.fields.deployment.status,'unknown');assert.equal(r.fields.rendered.status,'unknown');
});
test('sensitive extras and malformed inputs never escape through JSON/text/errors', () => {
  const sensitive='/Users/PRIVATE/secret token sk-proj-PRIVATESECRET unpublished-vessel';
  const contaminated=structuredClone(fleet);contaminated.metadata.secret=sensitive;contaminated.vessels[0].rawLog=sensitive;
  const clean=go([src('repository-fleet',fleet)]),r=go([src('repository-fleet',contaminated)]);
  assert.equal(clean.contentId,r.contentId);assert.ok(!JSON.stringify(r).includes(sensitive));assert.ok(!renderOperationalStatus(r).includes('unpublished-vessel'));
  for (const d of [null,{},[],{metadata:{asOfDate:sensitive}}, {...preflight,checkedAt:sensitive}]) {
    const r=go([src('preflight',d)]);assert.equal(r.inputs[0].status,'invalid-input');assert.ok(!JSON.stringify(r).includes(sensitive));
  }
  assert.throws(()=>go([src(sensitive,{})]),/invalid-source-kind/);
  assert.throws(()=>go(Array(33).fill(src('preflight',preflight))),/invalid-input/);
});
test('read-only bounded regular-file CLI, offline fixtures and unchanged input metadata', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rnfs-status-test-'));
  try {
    const p=path.join(dir,'receipt.json');fs.writeFileSync(p,JSON.stringify(preflight));
    const before=fs.statSync(p),bytes=fs.readFileSync(p);
    const source=readSource('preflight',p);assert.equal(go([source]).fields.backup.status,'passed');
    const result=JSON.parse(execFileSync(process.execPath,['scripts/operational-status.mjs','--at',now,'--source','preflight',p],{encoding:'utf8'}));assert.equal(result.fields.backup.status,'passed');
    const after=fs.statSync(p);assert.deepEqual(fs.readFileSync(p),bytes);for(const k of ['mtimeMs','ctimeMs','size','ino','mode'])assert.equal(after[k],before[k]);assert.deepEqual(fs.readdirSync(dir),['receipt.json']);
    assert.equal(readSource('preflight',path.join(dir,'absent')).error,'missing');
    fs.symlinkSync(p,path.join(dir,'link'));assert.equal(readSource('preflight',path.join(dir,'link')).error,'unreadable');
    fs.writeFileSync(p,'{INVALID PRIVATE');assert.equal(readSource('preflight',p).error,'invalid-input');
    fs.truncateSync(p,8*1024*1024+1);assert.equal(readSource('preflight',p).error,'oversized');
    assert.equal(readSource('preflight',dir).error,'not-regular-file');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
console.log(`${tests} operational status scenarios passed.`);
// Contract regression: schema remains closed at every object boundary and lists
// exactly the implemented fields. Source validators remain adapter-owned.
test('published contract and sanitised sample agree with implemented envelope', () => {
  const schema=JSON.parse(fs.readFileSync(new URL('../docs/operational-status/schema.json',import.meta.url)));
  const sample=JSON.parse(fs.readFileSync(new URL('../docs/operational-status/sample.json',import.meta.url)));
  assert.deepEqual(Object.keys(schema.properties.fields.properties),Object.keys(FIELDS));
  function validate(v,s) {
    if(s.$ref)return validate(v,schema.$defs[s.$ref.split('/').at(-1)]);
    if(s.anyOf){assert.ok(s.anyOf.some(branch=>{try{validate(v,branch);return true;}catch{return false;}}));return;}
    if(s.enum)assert.ok(s.enum.includes(v));if(Object.hasOwn(s,'const'))assert.deepEqual(v,s.const);
    if(s.type==='null')assert.equal(v,null);
    if(s.type==='boolean')assert.equal(typeof v,'boolean');
    if(s.type==='string'){assert.equal(typeof v,'string');if(s.pattern)assert.match(v,new RegExp(s.pattern));if(s.format)assert.ok(Number.isFinite(Date.parse(v)));}
    if(s.type==='integer'){assert.ok(Number.isSafeInteger(v));assert.ok(v>=s.minimum&&v<=s.maximum);}
    if(s.type==='array'){assert.ok(Array.isArray(v));if(s.maxItems)assert.ok(v.length<=s.maxItems);v.forEach(x=>validate(x,s.items));}
    if(s.type==='object'){assert.ok(v&&typeof v==='object'&&!Array.isArray(v));assert.equal(s.additionalProperties,false);for(const k of s.required)assert.ok(Object.hasOwn(v,k));for(const [k,x]of Object.entries(v)){assert.ok(Object.hasOwn(s.properties,k));validate(x,s.properties[k]);}}
  }
  validate(sample,schema);validate(go([]),schema);
  const bad=structuredClone(sample);bad.fields.fleet.selected.value.privatePath='forbidden';assert.throws(()=>validate(bad,schema));
});
