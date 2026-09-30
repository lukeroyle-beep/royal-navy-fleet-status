import assert from 'node:assert/strict';
import { collectPublicIndexes } from './lib/public-index-collector.mjs';
import { createSweepRun, PUBLIC_INDEX_TARGETS, validateSweepRunShape } from './lib/sweep.mjs';
import { resolvePrivateInputs } from './lib/private-inputs.mjs';
const inputs = resolvePrivateInputs();
const registry = inputs.readJson('sources'), entities = inputs.readJson('vessels'), assessments = inputs.readJson('assessments'), evidence = inputs.readJson('evidence');
const target = PUBLIC_INDEX_TARGETS.find(t => t.allowedHost === 'www.navylookout.com') || PUBLIC_INDEX_TARGETS[0];
// Use an actual allowlisted path from the existing fixture suite.
const fixtureUrls = ['https://www.navylookout.com/royal-navy-news/', 'https://www.navalnews.com/naval-news/2026/09/royal-navy-news/', 'https://ukdefencejournal.org.uk/royal-navy-news/'];
let selected = fixtureUrls.find(u => new URL(u).hostname === target.allowedHost && new RegExp(target.pathPattern).test(new URL(u).pathname));
assert.ok(selected, `Add fixture URL for ${target.targetId}`);
const make = startedAt => createSweepRun({ registry, entities, assessmentLog: assessments, evidenceItems: evidence.evidence, startedAt, windowStart: '2026-08-01T00:00:00Z', discoveryTargets: [target] });
const body = `<a href="${selected}">fixture</a>`;
const response = (status = 200) => ({ status, ok: status === 200, url: target.url, headers: { get: key => ({ 'content-type': 'text/html', etag: 'fixture-etag', 'last-modified': 'Sun, 20 Sep 2026 10:00:00 GMT' }[key] || null) }, text: async () => body });
const cache = {}, run = make('2026-09-20T11:00:00Z');
let calls = 0, checkpoints = 0;
const options = { registry, entities, targets: [target], cache, minIntervalMs: 0, sleep: async () => {}, onCheckpoint: () => checkpoints++ };
await collectPublicIndexes(run, { ...options, fetchImpl: async () => { calls++; return response(); } });
await collectPublicIndexes(run, { ...options, fetchImpl: async () => { throw new Error('success repeated'); } });
assert.equal(calls, 1); assert.equal(checkpoints, 1); assert.equal(run.collectionTelemetry.reused, 1); assert.equal(run.collectionTelemetry.attempted, 0);
const next = make('2026-09-27T11:00:00Z');
await collectPublicIndexes(next, { ...options, fetchImpl: async (url, config) => { assert.equal(config.headers['If-None-Match'], 'fixture-etag'); calls++; return response(304); } });
assert.equal(next.discoveryChecks[0].contentHash, run.discoveryChecks[0].contentHash); assert.equal(next.discoveryChecks[0].originalRetrievedAt, cache[target.targetId].retrievedAt); assert.equal(next.collectionTelemetry.bytes, 0);
const failed = make('2026-09-27T11:00:00Z'); let errors = 0;
await collectPublicIndexes(failed, { ...options, fetchImpl: async () => { errors++; throw { cause: { code: 'EAI_AGAIN' } }; } });
assert.equal(errors, 3); assert.equal(failed.discoveryChecks[0].state, 'blocked'); assert.equal(failed.discoveryChecks[0].diagnostic, 'dns'); assert.equal(failed.collectionTelemetry.retries, 2);
const limited = make('2026-09-27T11:00:00Z'); let throttled = 0;
await collectPublicIndexes(limited, { ...options, fetchImpl: async () => { throttled++; return { status: 429, ok: false, headers: { get: () => '120' } }; } });
assert.equal(throttled, 1); assert.equal(limited.discoveryChecks[0].state, 'blocked');
await assert.rejects(collectPublicIndexes(make('2026-09-27T11:00:00Z'), { ...options, targets: [target, { ...target, targetId: 'duplicate' }] }), /Duplicate source URL/);
// Tampered resume receipts must be collected again, never blindly trusted.
run.discoveryChecks[0].candidates = [];
await collectPublicIndexes(run, { ...options, fetchImpl: async () => { calls++; return response(); } });
assert.equal(calls, 3);
console.log('Public-index resume, conditional cache, retry exhaustion, DNS, rate-limit and tamper tests passed (fixtures only).');

const concurrent = make('2026-09-27T11:00:00Z');
let unblock;
const pending = collectPublicIndexes(concurrent, { ...options, fetchImpl: async () => { await new Promise(r => { unblock = r; }); return response(); } });
await new Promise(r => setTimeout(r, 0));
await assert.rejects(collectPublicIndexes(structuredClone(concurrent), { ...options, fetchImpl: async () => { throw new Error('duplicate network request'); } }), /already active/);
unblock(); await pending;
console.log('Concurrent same-run discovery rejected before duplicate network request.');

// Parser fixes invalidate source-check reuse without discarding old receipts.
const parserRun = make('2026-09-27T11:00:00Z'); let parserRequests = 0;
await collectPublicIndexes(parserRun, { ...options, parserVersion: 'old', fetchImpl: async () => { parserRequests++; return response(); } });
await collectPublicIndexes(parserRun, { ...options, parserVersion: 'new', fetchImpl: async () => { parserRequests++; return response(); } });
assert.equal(parserRequests, 2);
assert.equal(parserRun.collectionTelemetry.httpRequests, 1);
assert.equal(parserRun.collectionTelemetry.reused, 0);

// Validators belong to the exact resource URL, not every same-host redirect.
const redirectedCache = {};
const oldUrl = new URL('/old-index', target.url).href;
const newUrl = new URL('/new-index', target.url).href;
const redirect = url => ({ status: 302, ok: false, headers: { get: name => name === 'location' ? url : null } });
await collectPublicIndexes(make('2026-09-20T11:00:00Z'), { ...options, cache: redirectedCache,
  fetchImpl: async url => url === target.url ? redirect(oldUrl) : { ...response(), url: oldUrl } });
const redirected = make('2026-09-27T11:00:00Z');
await collectPublicIndexes(redirected, { ...options, cache: redirectedCache, fetchImpl: async (url, config) => {
  assert.equal(config.headers['If-None-Match'], undefined);
  return url === target.url ? redirect(newUrl) : { ...response(304), url: newUrl };
} });
assert.equal(redirected.discoveryChecks[0].state, 'blocked');
assert.equal(redirected.collectionTelemetry.httpRequests, 2);
// Unsolicited 304 and corrupt bodies fail closed. Cached article URLs remain in
// the normal candidate list after a valid revalidation (never a new finding).
assert.ok(next.discoveryChecks[0].candidates.length > 0);
assert.equal(next.discoveryChecks[0].conditionalBodyReused, true);
validateSweepRunShape(next);
const invalid304 = structuredClone(next); invalid304.discoveryChecks[0].originalRetrievedAt = '2999-01-01T00:00:00Z';
assert.throws(() => validateSweepRunShape(invalid304), /inconsistent automatic discovery result/);
const invalidCandidate = structuredClone(next); invalidCandidate.discoveryChecks[0].candidates[0].contentHash = '0'.repeat(64);
assert.throws(() => validateSweepRunShape(invalidCandidate), /invalid discovery candidate/);
const corruptCache = structuredClone(cache); corruptCache[target.targetId].body = 'tampered';
const corruptRun = make('2026-09-27T11:00:00Z');
await collectPublicIndexes(corruptRun, { ...options, cache: corruptCache, fetchImpl: async (_url, config) => {
  assert.equal(config.headers['If-None-Match'], undefined); return response(304);
} });
assert.equal(corruptRun.discoveryChecks[0].state, 'blocked');
console.log('Parser invalidation, redirect-scoped validators, actual HTTP request counts and cached candidate retention passed.');

// Kill an actual collector process after its first durable source receipt. A
// fresh process consumes that checkpoint without fetching the completed source.
const fs = await import('node:fs');
const os = await import('node:os');
const path = await import('node:path');
const { spawn } = await import('node:child_process');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rnfs-index-crash-'));
try {
  const preload = path.join(directory, 'fixture-network.mjs');
  const requests = path.join(directory, 'requests.jsonl');
  const firstUrl = PUBLIC_INDEX_TARGETS[0].url;
  fs.writeFileSync(preload, `import fs from 'node:fs';
    globalThis.fetch = async url => {
      fs.appendFileSync(${JSON.stringify(requests)}, JSON.stringify(url) + '\\n');
      if (process.env.RNFS_TEST_INTERRUPT === '1' && url !== ${JSON.stringify(firstUrl)}) return await new Promise(() => setInterval(() => {},1000));
      return {ok:true,status:200,url,headers:{get:key=>key==='content-type'?'text/html':null},text:async()=>['/test-item/','/news/test-item/','/cps/test-item/','/services/navy/test-item/'].map(p=>'<a href="'+new URL(p,url)+'">Fixture</a>').join('')};
    };`);
  const env = { ...process.env }; delete env.RNFS_PRIVATE_DATA_ROOT; delete env.RNFS_PRIVATE_DATA_FIXTURE;
  const output = path.join(directory, 'interrupted.json');
  const checkpoint = `${output}.checkpoints/run.json`;
  const child = spawn(process.execPath, [`--import=${preload}`, 'scripts/collect-public-indexes.mjs', '--as-of=2026-09-27T11:00:00Z', '--since=2026-08-01T00:00:00Z', `--output=${output}`], { env: { ...env, RNFS_TEST_INTERRUPT: '1' }, stdio: ['ignore','pipe','pipe'] });
  const exited = new Promise(resolve => child.on('exit', resolve));
  try {
    const deadline = Date.now()+5000;
    while (!fs.existsSync(checkpoint) && Date.now()<deadline && child.exitCode === null) await new Promise(r=>setTimeout(r,20));
    assert.ok(fs.existsSync(checkpoint), 'First source must be durably checkpointed');
  } finally { child.kill('SIGKILL'); await exited; }
  const before = fs.readFileSync(checkpoint);
  fs.writeFileSync(requests, '');
  const resumedOutput = path.join(directory, 'resumed.json');
  const resumedChild = spawn(process.execPath, [`--import=${preload}`, 'scripts/collect-public-indexes.mjs', `--resume=${checkpoint}`, `--output=${resumedOutput}`], {env, stdio:['ignore','pipe','pipe']});
  let error='';resumedChild.stderr.on('data', bytes=>error+=bytes);
  const exitCode = await new Promise(resolve=>resumedChild.on('exit',resolve));
  assert.equal(exitCode,0,error);
  const urls=fs.readFileSync(requests,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.ok(!urls.includes(firstUrl)); assert.equal(urls.length,PUBLIC_INDEX_TARGETS.length-1);
  assert.ok(fs.readFileSync(checkpoint).equals(before),'Prior attempt bytes must remain unchanged');
  assert.equal(JSON.parse(fs.readFileSync(resumedOutput)).collectionTelemetry.reused,1);
  console.log('Fresh-process crash recovery: 1 durable index reused, 6 fetched; prior checkpoint unchanged.');
} finally { fs.rmSync(directory,{recursive:true,force:true}); }
