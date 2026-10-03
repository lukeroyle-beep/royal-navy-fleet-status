import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareSweepDirectories } from './lib/sweep-preparation.mjs';
import { stageArguments } from './lib/preflight-stage.mjs';
import { evaluateSweepUsage } from './lib/sweep-work-budget.mjs';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rnfs-prepare-fixture-'));
try {
  const config = prepareSweepDirectories(path.join(root, 'attempt'));
  assert.equal(fs.existsSync(config.collectionOutput), false);
  assert.equal(fs.existsSync(config.collectionOutput + '.checkpoints'), false);
  assert.ok(config.evidenceDirectories.every(p => fs.statSync(p).isDirectory()));
  assert.doesNotThrow(() => stageArguments('indexes', config));
  assert.throws(() => prepareSweepDirectories(path.join(root, 'attempt')), /ATTEMPT_ALREADY_EXISTS/);
  fs.mkdirSync(config.collectionOutput + '.checkpoints');
  fs.writeFileSync(path.join(config.collectionOutput + '.checkpoints', 'retained'), 'do not delete');
  assert.throws(() => stageArguments('indexes', config), /already exists/);
  assert.equal(fs.readFileSync(path.join(config.collectionOutput + '.checkpoints', 'retained'), 'utf8'), 'do not delete');
  const now = Date.parse('2026-10-03T12:00:00Z');
  const records = total => [{ type: 'session_meta', payload: { id: 'fixture' } },
    { timestamp: new Date(now).toISOString(), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: {
      input_tokens: total - 1000, cached_input_tokens: total - 2000, output_tokens: 1000, total_tokens: total,
    } } } }];
  assert.equal(evaluateSweepUsage(records(199999), 'fixture', { now }).allowed, true);
  const stop = evaluateSweepUsage(records(200000), 'fixture', { now });
  assert.equal(stop.allowed, false);assert.equal(stop.cachedInputTokens, 198000);
  assert.equal(stop.uncachedInputTokens, 1000);assert.equal(stop.hardConversationCeilingEnforced, false);
  assert.equal(evaluateSweepUsage(records(3262658), 'fixture', { now }).allowed, false);
  assert.throws(() => evaluateSweepUsage(records(10000), 'other', { now }), /PROVENANCE/);
  assert.throws(() => evaluateSweepUsage(records(10000), 'fixture', { now: now + 120001 }), /MEASUREMENT_UNAVAILABLE/);
  assert.throws(() => evaluateSweepUsage(records(10000), 'fixture', { now: now - 1 }), /MEASUREMENT_UNAVAILABLE/);
  assert.throws(() => evaluateSweepUsage([], 'fixture', { now }), /PROVENANCE/);
  assert.throws(() => evaluateSweepUsage([...records(220000), records(10000)[1]], 'fixture', { now }), /COUNTER_RESET/);
  const invalid=records(10000);invalid[1].payload.info.total_token_usage.cached_input_tokens=20000;
  assert.throws(() => evaluateSweepUsage(invalid, 'fixture', { now }), /MEASUREMENT_INVALID/);
  assert.throws(() => evaluateSweepUsage(records(10000), 'fixture', { now, limit: 500000 }), /BUDGET_INVALID/);
  console.log('Preparation collision prevention and native usage stop fixtures passed; no collection or scheduled proof.');
} finally { fs.rmSync(root, { recursive:true, force:true }); }
