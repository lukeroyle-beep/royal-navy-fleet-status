import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireSources, openAcquisitionJournal, planAcquisitionSource, checkpointJson, digest } from './lib/acquisition.mjs';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rnfs-reuse-test-'));
let journal;
try {
  journal = openAcquisitionJournal(root);
  const sources = ['complete-a', 'complete-b', 'failed'].map(sourceId => ({ sourceId, collectionMode: 'fixture', acquisition: { adapter: 'fixture', parserVersion: '1', retry: { attempts: 1, baseMs: 0, maxMs: 0 } } }));
  const config = { sources, runId: 'fixture', registryHash: 'registry', cutoff: '2026-09-27T11:00:00Z', journal, extract: items => items };
  let calls = 0;
  const adapter = async ({source}) => { calls++; return source.sourceId === 'failed'
    ? { outcome: 'SOURCE_UNAVAILABLE', reason: 'fixture failure' }
    : { examined: true, extractionComplete: true, method: { fixture: true }, items: [] }; };
  const first = await acquireSources({ ...config, adapters: { fixture: adapter } });
  assert.equal(calls, 3); assert.equal(first.telemetry.reused, 0);
  journal.close(); journal = openAcquisitionJournal(root); config.journal = journal;
  const tasks = sources.map(source => planAcquisitionSource({ ...config, source }));
  assert.deepEqual(tasks.map(t=>t.action), ['reuse', 'reuse', 'retry']);
  const second = await acquireSources({ ...config, adapters: { fixture: async args => { assert.equal(args.source.sourceId, 'failed'); return adapter(args); } } });
  assert.equal(calls, 4); assert.equal(second.telemetry.reused, 2); assert.equal(second.telemetry.attempted, 1);
  assert.equal(second.telemetry.adapterCalls, 1); assert.equal(second.telemetry.httpRequests, null); assert.equal(second.telemetry.modelUsage, 'unavailable');
  assert.equal(second.timings.adapters.fixture.sources, 1);
  assert.equal(planAcquisitionSource({ ...config, source: { ...sources[0], acquisition: { ...sources[0].acquisition, parserVersion: '2' } } }).action, 'retry');
  assert.equal(planAcquisitionSource({ ...config, source: { ...sources[0], canonicalUrl: 'https://example.invalid/changed' } }).action, 'retry');
  assert.equal(planAcquisitionSource({ ...config, source: { sourceId: 'manual', collectionMode: 'manual' } }).action, 'manual-blocked');
  assert.throws(()=>planAcquisitionSource({ ...config, source:sources[0], cutoff:'2026-10-04T11:00:00Z' }),/Resume inputs changed/);
  const next = await acquireSources({ ...config, runId:'next-week', cutoff:'2026-10-04T11:00:00Z', adapters:{fixture:adapter} });
  assert.equal(next.telemetry.reused,0); assert.equal(calls,7);
  // Retry usage is counted across attempts; missing provenance never becomes measured.
  for (const kind of ['provider-reported', 'estimate', 'unavailable', undefined]) {
    let attempts = 0;
    const result = await acquireSources({ ...config, sources:[{...sources[0],acquisition:{...sources[0].acquisition,retry:{attempts:2,baseMs:0,maxMs:0}}}], runId:`usage-${kind}`, cutoff:'2026-10-04T11:00:00Z',
      adapters:{fixture:async()=>{attempts++;return {examined:true,extractionComplete:true,method:{fixture:true},items:[],...(attempts===1?{outcome:'SOURCE_UNAVAILABLE',reason:'retry'}:{}),usage:{kind,modelCalls:2,inputTokens:10,outputTokens:1}};}} });
    if (['provider-reported','estimate'].includes(kind)) { assert.equal(result.telemetry.modelCalls,4);assert.equal(result.telemetry.inputTokens,20); }
    else { assert.equal(result.telemetry.modelUsage,'unavailable');assert.equal(result.telemetry.modelCalls,undefined); }
  }
  const linkRoot = path.join(root, 'redirected'); fs.symlinkSync(path.resolve('.'), linkRoot);
  assert.throws(() => checkpointJson(linkRoot, 'private.json', { evidence: 'fixture' }), /outside every checkout/);
  const nested = path.join(root, 'nested'); fs.mkdirSync(nested); fs.symlinkSync(path.resolve('.'), path.join(nested, 'checkpoints'));
  assert.throws(() => checkpointJson(nested, 'private.json', { evidence: 'fixture' }), /outside every checkout/);
  const name='plan.json';fs.writeFileSync(path.join(root,name),' {"original": true} \n');
  checkpointJson(root,name,{next:true});
  assert.ok(fs.readdirSync(path.join(root,'checkpoints')).length===2);
  const archive=checkpointJson(root,name,{next:true}); fs.writeFileSync(archive,'tampered');
  assert.throws(()=>checkpointJson(root,name,{next:true}),/corruption/);
  console.log('Reuse: 3 initial source calls -> 1 recovery call, 2 receipts reused; parser/identity/cutoff invalidation, retry usage and immutable checkpoints passed (fixtures).');
} finally { journal?.close(); fs.rmSync(root,{recursive:true,force:true}); }
