import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireSources, openAcquisitionJournal } from './lib/acquisition.mjs';
import { evaluateSweepUsage, evaluateSweepHeadroom, admitSweepBatch } from './lib/sweep-work-budget.mjs';
import { sweepStop, persistSweepStop } from './lib/sweep-stop.mjs';
import { assertSweepResume } from './lib/sweep-rounds.mjs';
import { aggregateSessionUsage, MAX_SWEEP_SESSIONS } from './lib/sweep-usage-report.mjs';

const now = Date.parse('2026-10-04T12:00:00Z');
const at = '2026-10-04T11:59:00Z';
const thread = 'fixture';
const count = total => ({ type: 'event_msg', timestamp: at, payload: { type: 'token_count', info: { total_token_usage: {
  input_tokens: total - 1000, cached_input_tokens: total - 2000, output_tokens: 1000, total_tokens: total } } } });
const measured = total => evaluateSweepUsage([{ type: 'session_meta', payload: { id: thread } }, count(total)], thread, { now });

assert.equal(measured(200000).allowed, false);
assert.equal(measured(199999).allowed, true);
assert.throws(() => evaluateSweepUsage([{ type: 'session_meta', payload: { id: thread } }, count(1000)], thread, { now, limit: 250001 }), /BUDGET_INVALID/);

const observed = 64459;
const cumulative = 190173;
const usage = evaluateSweepUsage([
  { type: 'session_meta', payload: { id: thread } },
  count(cumulative - observed),
  count(cumulative),
], thread, { now });
assert.equal(usage.lastResponseTokens, observed);
assert.equal(usage.totalTokens, cumulative);
assert.equal(evaluateSweepHeadroom(usage, { nextResponseTokens: 9000, closeoutTokens: 50000 }).allowed, true);
const admission = admitSweepBatch(usage, { nextResponseTokens: 9000, closeoutTokens: 50000 });
assert.equal(admission.allowed, false);
assert.equal(admission.appliedNextResponseTokens, observed);
assert.equal(admission.requestedNextResponseTokens, 9000);
assert.equal(admission.fitsObservedResponse, false);
assert.equal(admission.publicationEligible, false);
assert.equal(admission.plannedWorkTotal, cumulative + observed);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rnfs-round-'));
const acquisitionDirectory = path.join(root, 'acquisition');
const registryHash = 'ab'.repeat(32);
const cutoff = '2026-10-04T12:00:00.000Z';
const later = '2026-10-11T12:00:00.000Z';
const runId = 'SWEEP_FIXTURE';
const threadId = '00000000-0000-4000-8000-000000000001';
const source = { sourceId: 'fixture-source', collectionMode: 'fixture', acquisition: { adapter: 'fixture', parserVersion: '1', retry: { attempts: 1, baseMs: 0, maxMs: 0 } } };
let journal;
try {
  journal = openAcquisitionJournal(acquisitionDirectory);
  await acquireSources({
    sources: [source], runId, registryHash, cutoff, journal, extract: items => items,
    adapters: { fixture: async () => ({ examined: true, extractionComplete: true, method: { fixture: true }, items: [] }) },
  });
  journal.close();
  journal = null;
  const readOnly = openAcquisitionJournal(acquisitionDirectory, { readOnly: true });
  const resume = {
    runId, cutoff, registryHash, acquisitionDirectory,
    browserSessionPath: path.join(root, 'session.json'),
    nextReviewBatchIndex: 0, threadId,
  };
  const run = { runId, sourceRegistryHash: registryHash, window: { from: '2026-09-27T12:00:00.000Z', to: cutoff } };
  const before = fs.readdirSync(acquisitionDirectory).sort();
  assert.equal(fs.existsSync(path.join(acquisitionDirectory, 'writer.lock')), false);
  const resumed = assertSweepResume({
    resume, run, source, journal: readOnly,
    indexCheckpoint: { runId, sourceRegistryHash: registryHash, window: run.window },
    browserSession: { runId, window: run.window, publicationEligible: false },
    reviewPlan: { publicationEligible: false, batches: [{ items: [{ evidenceId: 'fixture-evidence' }] }] },
  });
  assert.equal(resumed.publicationEligible, false);
  assert.equal(resumed.resume.publicationEligible, false);
  assert.equal(resumed.review.publicationEligible, false);
  assert.equal(resumed.acquisition.action, 'reuse');
  assert.equal(resumed.review.batch, 0);
  assert.deepEqual(fs.readdirSync(acquisitionDirectory).sort(), before);
  assert.equal(fs.existsSync(path.join(acquisitionDirectory, 'writer.lock')), false);
  assert.throws(() => assertSweepResume({ resume: { ...resume, cutoff: later }, run, journal: readOnly, source }), /RESUME_CUTOFF_MISMATCH/);
  assert.throws(() => assertSweepResume({
    resume, run: { ...run, window: { ...run.window, to: later } }, source, journal: readOnly,
  }), /RESUME_CUTOFF_MISMATCH/);
  assert.throws(() => planChanged(readOnly), /Resume inputs changed/);
  assert.throws(() => assertSweepResume({
    resume, run, indexCheckpoint: { runId, sourceRegistryHash: registryHash, window: { to: later } },
  }), /RESUME_INDEX_MISMATCH/);
  assert.throws(() => assertSweepResume({
    resume, run, browserSession: { runId, window: { to: later } },
  }), /RESUME_BROWSER_MISMATCH/);
  assert.throws(() => assertSweepResume({
    resume, run, reviewPlan: { publicationEligible: true, batches: [{ items: [] }] },
  }), /RESUME_PUBLICATION_REFUSED/);
  assert.throws(() => sweepStop({ diagnostic: 'WORK_BUDGET_STOP', usage, resume: { ...resume, publicationEligible: true } }), /RESUME_PUBLICATION_REFUSED/);

  const receipt = sweepStop({ diagnostic: 'WORK_BUDGET_STOP', usage, resume });
  assert.equal(receipt.publicationEligible, false);
  assert.equal(receipt.resume.publicationEligible, false);
  assert.equal(receipt.resume.runId, runId);
  assert.equal(receipt.resume.cutoff, cutoff);
  assert.equal(receipt.resume.threadId, threadId);
  assert.equal(receipt.resume.nextReviewBatchIndex, 0);
  const listed = fs.readdirSync(acquisitionDirectory).sort();
  const saved = persistSweepStop(path.join(root, 'stop.json'), receipt);
  assert.equal(saved.reused, false);
  assert.deepEqual(fs.readdirSync(acquisitionDirectory).sort(), listed);
  assert.equal(fs.existsSync(path.join(root, 'sweep-run.json')), false);
  assert.equal(fs.existsSync(path.join(acquisitionDirectory, 'writer.lock')), false);
  assert.equal(JSON.parse(fs.readFileSync(saved.path, 'utf8')).publicationEligible, false);
  readOnly.close();

  function planChanged(openJournal) {
    return assertSweepResume({
      resume: { ...resume, cutoff: later },
      run: { ...run, window: { ...run.window, to: later } },
      source, journal: openJournal,
    });
  }
} finally {
  journal?.close();
  fs.rmSync(root, { recursive: true, force: true });
}

const session = index => ({ threadId: `thread-${index}`, input_tokens: 10, cached_input_tokens: 4, output_tokens: 1, total_tokens: 11, responses: 1 });
const nine = Array.from({ length: 9 }, (_, index) => session(index));
const rounds = nine.map(item => ({ threadId: item.threadId }));
const summed = aggregateSessionUsage(nine, { rounds });
assert.equal(summed.total_tokens, 99);
assert.equal(summed.cached_input_tokens, 36);
assert.equal(summed.uncached_input_tokens, 54);
assert.equal(summed.roundsChecked, 9);
assert.throws(() => aggregateSessionUsage(nine.slice(0, 8), { rounds }), /USAGE_ROUND_OMITTED/);
assert.equal(aggregateSessionUsage(Array.from({ length: MAX_SWEEP_SESSIONS }, (_, index) => session(index))).sessions.length, MAX_SWEEP_SESSIONS);
assert.throws(() => aggregateSessionUsage(Array.from({ length: MAX_SWEEP_SESSIONS + 1 }, (_, index) => session(index))), /USAGE_DUPLICATE_OR_INVALID_SESSIONS/);

console.log('Sweep round fixtures passed: exact 200000 stop, observed-response floor, cutoff refusal, nine-session sum, partial rounds stay unpublished.');
